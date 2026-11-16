/* =========================================================================
   CivicTrack — Community Meeting Decision Tracker
   Plain JavaScript. No frameworks, no build tools, no server.
   Everything is saved in the browser using localStorage.

   WHAT IS IN THIS FILE
   -----------------------------------------------------------------------
   1.  Small helper functions (dates, text, ids)
   2.  Saving and loading data + the demo data
   3.  Helper functions about our data (look-ups, status, progress)
   4.  Small UI pieces (toast messages, pop-up box)
   5.  The router — decides which page to show
   6.  The pages: Dashboard, Meetings, Meeting Detail, Decisions,
                  Action Items, Reminders, Archive
   7.  The forms that appear inside the pop-up box
   8.  Functions that change data (add, edit, delete)
   9.  Sign in / Sign up / Sign out
   10. Theme (light + dark) and the mobile menu
   11. Button clicks are connected here
   12. Start-up

   NOTE: There are no "admin" users. Every member who signs in can do
   everything — schedule meetings, record decisions and assign actions.
   ========================================================================= */

(function () {
  'use strict';

  /* =======================================================================
     1. SMALL HELPER FUNCTIONS
     ======================================================================= */

  // Names of the "boxes" we use inside the browser's storage.
  // The "v2" at the end is a version number. If we ever change the shape of
  // our data, we bump this number so old saved data is ignored instead of
  // breaking the app.
  var LS_DB      = 'civictrack.db.v2';
  var LS_SESSION = 'civictrack.session.v2';
  var LS_THEME   = 'civictrack.theme.v1';

  // Short-cuts so we can write $('#id') instead of document.querySelector('#id')
  var $  = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // Makes a unique id like "m_k3f9a2b" so two records never clash.
  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
  }

  // Turns dangerous characters into safe ones before we put text on screen.
  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // Today's date written as "2026-11-16"
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // Today + n days. Use a negative number for the past.
  function dayOffset(n) {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function parseDate(s) {
    if (!s) return null;
    var p = String(s).split('-');
    if (p.length !== 3) return null;
    return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0, 0);
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS   = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function fmtDate(s) {                       // 16 Nov 2026
    var d = parseDate(s);
    if (!d) return '—';
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtDateLong(s) {                   // Monday, 16 Nov 2026
    var d = parseDate(s);
    if (!d) return '—';
    return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtTime(t) {                       // 18:30  ->  6:30 PM
    if (!t) return '';
    var p = t.split(':');
    var h = +p[0], m = p[1];
    var ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + m + ' ' + ap;
  }

  // How many days from today? Negative means the date has already passed.
  function daysFromToday(s) {
    var d = parseDate(s);
    if (!d) return null;
    var t = parseDate(todayStr());
    return Math.round((d - t) / 86400000);
  }

  // "in 3 days", "today", "5 days ago"
  function relLabel(s) {
    var n = daysFromToday(s);
    if (n === null) return '—';
    if (n === 0)  return 'today';
    if (n === 1)  return 'tomorrow';
    if (n === -1) return 'yesterday';
    if (n > 0)    return 'in ' + n + ' days';
    return Math.abs(n) + ' days ago';
  }

  // "Asha Nair" -> "AN"  (used for the round profile circles)
  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    var a = parts[0] ? parts[0][0] : '?';
    var b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (a + b).toUpperCase();
  }

  function pluralise(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function sortBy(arr, keyFn, desc) {
    return arr.slice().sort(function (a, b) {
      var x = keyFn(a), y = keyFn(b);
      if (x < y) return desc ? 1 : -1;
      if (x > y) return desc ? -1 : 1;
      return 0;
    });
  }

  /* =======================================================================
     2. SAVING, LOADING AND THE DEMO DATA
     ======================================================================= */

  var DB = null;       // all our data lives in this one object
  var session = null;  // { userId } — who is signed in right now

  var state = {        // what the screen is showing at this moment
    view: 'dashboard',
    params: {},
    detailTab: 'agenda',
    filters: {}
  };

  function save() {
    try {
      localStorage.setItem(LS_DB, JSON.stringify(DB));
    } catch (e) {
      toast('Could not save — the browser storage may be full.', 'bad');
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(LS_DB);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.users && parsed.meetings) return parsed;
      }
    } catch (e) { /* if anything goes wrong we just start fresh */ }
    return null;
  }

  /* ----- The demo data the app starts with, so it never looks empty ----- */

  function buildSeed() {
    var users = [
      { id: 'u1', name: 'Asha Nair',          email: 'asha@greenpark.org',   password: 'asha123',   title: 'Secretary',        block: 'Block A', phone: '98450 11223' },
      { id: 'u2', name: 'Ravi Kulkarni',      email: 'ravi@greenpark.org',   password: 'ravi123',   title: 'Treasurer',        block: 'Block B', phone: '98450 44556' },
      { id: 'u3', name: 'Meera Pillai',       email: 'meera@greenpark.org',  password: 'meera123',  title: 'Block A Rep',      block: 'Block A', phone: '98450 77889' },
      { id: 'u4', name: 'Daniel Fernandes',   email: 'daniel@greenpark.org', password: 'daniel123', title: 'Maintenance Lead', block: 'Block C', phone: '98450 22114' },
      { id: 'u5', name: 'Sana Qureshi',       email: 'sana@greenpark.org',   password: 'sana123',   title: 'Block C Rep',      block: 'Block C', phone: '98450 66332' },
      { id: 'u6', name: 'Victor D’Souza', email: 'victor@greenpark.org', password: 'victor123', title: 'President',       block: 'Block B', phone: '98450 99001' }
    ];

    var everyone = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'];

    function attendance(map) {
      var out = {};
      everyone.forEach(function (id) { out[id] = map[id] || 'invited'; });
      return out;
    }

    var meetings = [
      {
        id: 'm3',
        title: 'Annual Budget Planning Session',
        type: 'Special Session',
        date: dayOffset(-45), time: '10:00',
        location: 'Clubhouse Hall, Green Park Residency',
        status: 'completed', archived: true,
        createdBy: 'u6',
        participants: everyone.slice(),
        attendance: attendance({ u1: 'present', u2: 'present', u3: 'present', u4: 'present', u5: 'excused', u6: 'present' }),
        agenda: [
          { id: 'a301', title: 'Review of FY2025-26 expenditure', presenterId: 'u2', notes: 'Line-by-line comparison against last year’s sanctioned budget.' },
          { id: 'a302', title: 'Proposed budget for FY2026-27',   presenterId: 'u2', notes: 'Draft circulated to all members one week in advance.' },
          { id: 'a303', title: 'Corpus reserve fund proposal',    presenterId: 'u6', notes: 'Buffer for unplanned structural repairs.' }
        ],
        minutes:
          'The President opened the session at 10:05 AM with 5 of 6 committee members present.\n\n' +
          'The Treasurer presented the FY2025-26 expenditure statement. Total spend was ₹52.3L against a sanctioned ₹54L, leaving a surplus of ₹1.7L. The largest overrun was in water tanker procurement (+₹2.1L) and the biggest under-spend was in landscaping (-₹0.9L).\n\n' +
          'The draft FY2026-27 budget of ₹58L was discussed clause by clause. Members raised concerns about the 11% increase but accepted the justification of rising power tariffs and the planned lift modernisation.\n\n' +
          'A proposal to carve out a ₹5L corpus reserve fund was introduced by the President and supported unanimously.\n\n' +
          'The session closed at 12:40 PM. The Secretary was directed to circulate the approved budget within seven working days.'
      },
      {
        id: 'm1',
        title: 'Monthly General Body Meeting — October',
        type: 'General Body',
        date: dayOffset(-28), time: '18:30',
        location: 'Clubhouse Hall, Green Park Residency',
        status: 'completed', archived: false,
        createdBy: 'u1',
        participants: everyone.slice(),
        attendance: attendance({ u1: 'present', u2: 'present', u3: 'present', u4: 'present', u5: 'present', u6: 'absent' }),
        agenda: [
          { id: 'a101', title: 'Lift modernisation quotations',       presenterId: 'u4', notes: 'Three vendor quotations received; technical comparison attached.' },
          { id: 'a102', title: 'CCTV coverage gaps in Block B',        presenterId: 'u5', notes: 'Two blind spots identified near the rear entrance.' },
          { id: 'a103', title: 'Revision of monthly maintenance fee',  presenterId: 'u2', notes: 'Proposal to raise the fee from ₹2,900 to ₹3,200.' },
          { id: 'a104', title: 'Any other business',                   presenterId: 'u1', notes: 'Open floor for resident grievances.' }
        ],
        minutes:
          'The Secretary chaired the meeting in the President’s absence. Quorum was confirmed at 6:35 PM.\n\n' +
          'Three quotations for lift modernisation were tabled. The committee compared warranty terms and after-sales response times before settling on the mid-priced vendor at ₹2.4L.\n\n' +
          'The Block C representative presented photographs of two CCTV blind spots near the Block B rear entrance. Installation of two additional cameras was agreed without objection.\n\n' +
          'The maintenance fee revision drew extended discussion. Several members asked for a written impact note before committing, so the item was deferred to the November meeting.\n\n' +
          'Under any other business, three residents raised complaints about visitor parking. The Secretary noted these for the next agenda. The meeting closed at 8:15 PM.'
      },
      {
        id: 'm2',
        title: 'Emergency Water Supply Review',
        type: 'Emergency',
        date: dayOffset(-14), time: '19:00',
        location: 'Block A Community Room',
        status: 'completed', archived: false,
        createdBy: 'u1',
        participants: ['u1', 'u2', 'u4', 'u6'],
        attendance: attendance({ u1: 'present', u2: 'present', u4: 'present', u6: 'present' }),
        agenda: [
          { id: 'a201', title: 'Borewell failure — status report', presenterId: 'u4', notes: 'Pump motor burnt out on the night of the 9th.' },
          { id: 'a202', title: 'Interim tanker arrangement',           presenterId: 'u2', notes: 'Two private vendors approached for emergency supply.' }
        ],
        minutes:
          'An emergency sitting was convened following the failure of the main borewell pump.\n\n' +
          'The Maintenance Lead reported that the submersible motor had burnt out and could not be repaired economically. A replacement with a three-year warranty was quoted at ₹68,000 including installation.\n\n' +
          'Immediate engagement of the existing contractor was approved so that supply could be restored within 72 hours.\n\n' +
          'A separate proposal to sign a six-month contract with a private tanker vendor was rejected: the committee held that the rate quoted was 40% above the prevailing municipal rate and that the borewell repair would make it unnecessary.\n\n' +
          'The sitting closed at 8:05 PM.'
      },
      {
        id: 'm6',
        title: 'Festival Committee Kickoff',
        type: 'Committee',
        date: dayOffset(-2), time: '18:00',
        location: 'Clubhouse Hall, Green Park Residency',
        status: 'cancelled', archived: false,
        createdBy: 'u1',
        participants: ['u1', 'u3', 'u5'],
        attendance: attendance({}),
        agenda: [
          { id: 'a601', title: 'Volunteer roles and sub-committees', presenterId: 'u3', notes: '' }
        ],
        minutes: ''
      },
      {
        id: 'm4',
        title: 'Monthly General Body Meeting — November',
        type: 'General Body',
        date: dayOffset(3), time: '18:30',
        location: 'Clubhouse Hall, Green Park Residency',
        status: 'scheduled', archived: false,
        createdBy: 'u1',
        participants: everyone.slice(),
        attendance: attendance({}),
        agenda: [
          { id: 'a401', title: 'Maintenance fee revision (carried forward)', presenterId: 'u2', notes: 'Impact note to be circulated before the meeting.' },
          { id: 'a402', title: 'Lift modernisation — progress update',   presenterId: 'u4', notes: 'Vendor timeline and site readiness.' },
          { id: 'a403', title: 'Visitor parking policy',                      presenterId: 'u1', notes: 'Draft policy for discussion, based on October grievances.' }
        ],
        minutes: ''
      },
      {
        id: 'm5',
        title: 'Security & Gate Access Committee',
        type: 'Committee',
        date: dayOffset(10), time: '17:00',
        location: 'Security Office, Main Gate',
        status: 'scheduled', archived: false,
        createdBy: 'u6',
        participants: ['u1', 'u4', 'u5', 'u6'],
        attendance: attendance({}),
        agenda: [
          { id: 'a501', title: 'CCTV installation sign-off',    presenterId: 'u5', notes: '' },
          { id: 'a502', title: 'Visitor pass digitisation',     presenterId: 'u6', notes: 'Evaluate a QR-based gate pass system.' }
        ],
        minutes: ''
      }
    ];

    var decisions = [
      { id: 'd1', meetingId: 'm1', agendaId: 'a101', title: 'Award lift modernisation contract to Shakti Elevators for ₹2.4L',
        detail: 'Mid-priced quotation selected for its 3-year comprehensive warranty and 24-hour service response commitment.',
        outcome: 'approved', votesFor: 5, votesAgainst: 0, votesAbstain: 0, createdAt: dayOffset(-28) },

      { id: 'd2', meetingId: 'm1', agendaId: 'a102', title: 'Install two additional CCTV cameras at the Block B rear entrance',
        detail: 'Covers the two blind spots found in the security walkthrough. Budget capped at ₹45,000.',
        outcome: 'approved', votesFor: 5, votesAgainst: 0, votesAbstain: 0, createdAt: dayOffset(-28) },

      { id: 'd3', meetingId: 'm1', agendaId: 'a103', title: 'Revise monthly maintenance fee from ₹2,900 to ₹3,200',
        detail: 'Deferred to the November general body meeting, pending a written financial impact note.',
        outcome: 'deferred', votesFor: 2, votesAgainst: 2, votesAbstain: 1, createdAt: dayOffset(-28) },

      { id: 'd4', meetingId: 'm2', agendaId: 'a201', title: 'Replace the borewell submersible motor through the existing contractor',
        detail: 'Emergency sanction of ₹68,000 including installation and a 3-year warranty. Supply to be restored within 72 hours.',
        outcome: 'approved', votesFor: 4, votesAgainst: 0, votesAbstain: 0, createdAt: dayOffset(-14) },

      { id: 'd5', meetingId: 'm2', agendaId: 'a202', title: 'Six-month contract with a private water tanker vendor',
        detail: 'Rejected. The quoted rate was about 40% above the municipal rate and the borewell repair removes the need.',
        outcome: 'rejected', votesFor: 1, votesAgainst: 3, votesAbstain: 0, createdAt: dayOffset(-14) },

      { id: 'd6', meetingId: 'm3', agendaId: 'a302', title: 'Adopt the FY2026-27 association budget of ₹58L',
        detail: 'Approved on the condition that any single expense above ₹1L comes back to the general body for approval.',
        outcome: 'approved', votesFor: 5, votesAgainst: 0, votesAbstain: 0, createdAt: dayOffset(-45) },

      { id: 'd7', meetingId: 'm3', agendaId: 'a303', title: 'Create a ₹5L corpus reserve fund for structural repairs',
        detail: 'To be funded from the FY2025-26 surplus plus a quarterly transfer of ₹80,000.',
        outcome: 'approved', votesFor: 5, votesAgainst: 0, votesAbstain: 0, createdAt: dayOffset(-45) }
    ];

    var actions = [
      { id: 't1', decisionId: 'd1', meetingId: 'm1', title: 'Issue purchase order to Shakti Elevators',
        detail: 'Include the agreed warranty clause and a penalty for delay beyond 30 days.',
        assigneeId: 'u2', deadline: dayOffset(5), status: 'in-progress', completedAt: null, createdAt: dayOffset(-28) },

      { id: 't2', decisionId: 'd1', meetingId: 'm1', title: 'Arrange lift shaft access and put up a resident notice',
        detail: 'Notices in both lobbies at least 5 days before the work starts.',
        assigneeId: 'u4', deadline: dayOffset(-3), status: 'pending', completedAt: null, createdAt: dayOffset(-28) },

      { id: 't3', decisionId: 'd2', meetingId: 'm1', title: 'Collect three quotations for the CCTV cameras',
        detail: 'Must include night vision and 30-day cloud storage.',
        assigneeId: 'u5', deadline: dayOffset(12), status: 'pending', completedAt: null, createdAt: dayOffset(-28) },

      { id: 't4', decisionId: 'd3', meetingId: 'm1', title: 'Prepare the maintenance fee impact note',
        detail: 'Three-year projection with and without the revision, circulated to all members.',
        assigneeId: 'u3', deadline: dayOffset(-8), status: 'completed', completedAt: dayOffset(-9), createdAt: dayOffset(-28) },

      { id: 't5', decisionId: 'd4', meetingId: 'm2', title: 'Supervise the motor replacement and confirm supply is restored',
        detail: 'Sign off only after a full 24-hour supply cycle without interruption.',
        assigneeId: 'u4', deadline: dayOffset(1), status: 'in-progress', completedAt: null, createdAt: dayOffset(-14) },

      { id: 't6', decisionId: 'd6', meetingId: 'm3', title: 'Circulate the approved FY2026-27 budget to all residents',
        detail: 'Email plus a printed copy on each block noticeboard.',
        assigneeId: 'u1', deadline: dayOffset(-38), status: 'completed', completedAt: dayOffset(-40), createdAt: dayOffset(-45) },

      { id: 't7', decisionId: 'd7', meetingId: 'm3', title: 'Open a separate fixed deposit account for the corpus fund',
        detail: 'Two-signatory account in the names of the Treasurer and the President.',
        assigneeId: 'u2', deadline: dayOffset(25), status: 'pending', completedAt: null, createdAt: dayOffset(-45) }
    ];

    return {
      org: 'Green Park Residents’ Association',
      users: users,
      meetings: meetings,
      decisions: decisions,
      actions: actions,
      dismissed: [],
      createdAt: new Date().toISOString()
    };
  }

  function resetDemoData() {
    DB = buildSeed();
    save();
  }

  /* =======================================================================
     3. HELPER FUNCTIONS ABOUT OUR DATA
     ======================================================================= */

  function me() {
    if (!session) return null;
    return DB.users.filter(function (u) { return u.id === session.userId; })[0] || null;
  }

  function userById(id)     { return DB.users.filter(function (u) { return u.id === id; })[0] || null; }
  function meetingById(id)  { return DB.meetings.filter(function (m) { return m.id === id; })[0] || null; }
  function decisionById(id) { return DB.decisions.filter(function (d) { return d.id === id; })[0] || null; }
  function actionById(id)   { return DB.actions.filter(function (a) { return a.id === id; })[0] || null; }

  function userName(id) {
    var u = userById(id);
    return u ? u.name : 'Unassigned';
  }

  function decisionsOfMeeting(id) { return DB.decisions.filter(function (d) { return d.meetingId === id; }); }
  function actionsOfDecision(id)  { return DB.actions.filter(function (a) { return a.decisionId === id; }); }
  function actionsOfMeeting(id)   { return DB.actions.filter(function (a) { return a.meetingId === id; }); }

  /* An action is "overdue" when its deadline has passed and it is not done.
     We never store "overdue" — we work it out every time, so it is always
     correct no matter how long the app sits unopened. */
  function effStatus(action) {
    if (action.status === 'completed') return 'completed';
    var n = daysFromToday(action.deadline);
    if (n !== null && n < 0) return 'overdue';
    return action.status; // 'pending' or 'in-progress'
  }

  var STATUS_META = {
    'pending':     { label: 'Pending',     pill: 'pill-mute' },
    'in-progress': { label: 'In progress', pill: 'pill-info' },
    'completed':   { label: 'Completed',   pill: 'pill-ok' },
    'overdue':     { label: 'Overdue',     pill: 'pill-bad' }
  };
  var OUTCOME_META = {
    'approved': { label: 'Approved', pill: 'pill-ok' },
    'rejected': { label: 'Rejected', pill: 'pill-bad' },
    'deferred': { label: 'Deferred', pill: 'pill-warn' }
  };
  var MTG_META = {
    'scheduled': { label: 'Scheduled', pill: 'pill-brand' },
    'completed': { label: 'Completed', pill: 'pill-ok' },
    'cancelled': { label: 'Cancelled', pill: 'pill-bad' }
  };
  var ATT_META = {
    'present': { label: 'Present', pill: 'pill-ok' },
    'absent':  { label: 'Absent',  pill: 'pill-bad' },
    'excused': { label: 'Excused', pill: 'pill-warn' },
    'invited': { label: 'Awaiting', pill: 'pill-mute' }
  };

  function statusPill(s)  { var m = STATUS_META[s]  || STATUS_META.pending;   return '<span class="pill ' + m.pill + '">' + m.label + '</span>'; }
  function outcomePill(o) { var m = OUTCOME_META[o] || OUTCOME_META.deferred; return '<span class="pill ' + m.pill + '">' + m.label + '</span>'; }
  function meetingPill(m) {
    if (m.archived) return '<span class="pill pill-mute">Archived</span>';
    var x = MTG_META[m.status] || MTG_META.scheduled;
    return '<span class="pill ' + x.pill + '">' + x.label + '</span>';
  }

  // How much of a decision has actually been carried out?
  function decisionProgress(decisionId) {
    var list = actionsOfDecision(decisionId);
    if (!list.length) return { total: 0, done: 0, pct: 0 };
    var done = list.filter(function (a) { return a.status === 'completed'; }).length;
    return { total: list.length, done: done, pct: Math.round((done / list.length) * 100) };
  }

  function attendanceCount(m) {
    var present = 0, total = (m.participants || []).length;
    (m.participants || []).forEach(function (id) {
      if (m.attendance && m.attendance[id] === 'present') present++;
    });
    return { present: present, total: total };
  }

  /* ------------------------------ reminders ---------------------------- */
  /* Reminders are not stored anywhere. We build the list fresh every time
     from five simple rules, so it can never go out of date.              */

  function buildReminders() {
    var out = [];
    var user = me();

    // Rule 1 — a meeting coming up in the next 7 days
    DB.meetings.forEach(function (m) {
      if (m.archived || m.status !== 'scheduled') return;
      var n = daysFromToday(m.date);
      if (n === null || n < 0 || n > 7) return;
      out.push({
        key: 'mtg-' + m.id, tone: n <= 1 ? 'warn' : 'info', icon: '📅',
        title: m.title,
        text: fmtDateLong(m.date) + ' at ' + fmtTime(m.time) + ' · ' + m.location,
        when: relLabel(m.date), sort: n,
        go: { view: 'meeting', id: m.id }
      });
    });

    // Rules 2 and 3 — actions that are late, or due very soon
    DB.actions.forEach(function (a) {
      var st = effStatus(a);
      if (st === 'completed') return;
      var n = daysFromToday(a.deadline);
      if (n === null) return;
      var mine = user && a.assigneeId === user.id;

      if (st === 'overdue') {
        out.push({
          key: 'act-over-' + a.id, tone: 'bad', icon: '⚠',
          title: (mine ? 'Your action is overdue: ' : 'Overdue: ') + a.title,
          text: 'Assigned to ' + userName(a.assigneeId) + ' · the deadline was ' + fmtDate(a.deadline),
          when: relLabel(a.deadline), sort: n - 1000,
          go: { view: 'actions' }
        });
      } else if (n <= 3) {
        out.push({
          key: 'act-soon-' + a.id, tone: 'warn', icon: '⏰',
          title: (mine ? 'Your action is due soon: ' : 'Due soon: ') + a.title,
          text: 'Assigned to ' + userName(a.assigneeId) + ' · due ' + fmtDate(a.deadline),
          when: relLabel(a.deadline), sort: n,
          go: { view: 'actions' }
        });
      }
    });

    // Rule 4 — a meeting was held but nobody wrote the minutes
    DB.meetings.forEach(function (m) {
      if (m.status !== 'completed' || m.archived) return;
      if (m.minutes && m.minutes.trim()) return;
      out.push({
        key: 'min-' + m.id, tone: 'warn', icon: '✎',
        title: 'Minutes not recorded',
        text: '"' + m.title + '" was held on ' + fmtDate(m.date) + ' but has no minutes yet.',
        when: relLabel(m.date), sort: 50,
        go: { view: 'meeting', id: m.id }
      });
    });

    // Rule 5 — a decision was approved but nobody was given the job
    DB.decisions.forEach(function (d) {
      if (d.outcome !== 'approved') return;
      if (actionsOfDecision(d.id).length) return;
      out.push({
        key: 'dec-' + d.id, tone: 'info', icon: '⚖',
        title: 'Approved decision has nobody assigned',
        text: d.title,
        when: relLabel(d.createdAt), sort: 80,
        go: { view: 'decisions' }
      });
    });

    var dismissed = DB.dismissed || [];
    out = out.filter(function (r) { return dismissed.indexOf(r.key) === -1; });
    return sortBy(out, function (r) { return r.sort; });
  }

  /* =======================================================================
     4. SMALL UI PIECES
     ======================================================================= */

  // The little message that slides in at the bottom-right of the screen.
  function toast(message, tone) {
    var box = $('#toasts');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (tone || '');
    el.textContent = message;
    box.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateX(16px)';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, 3200);
  }

  var modalSubmit = null;   // what to run when the blue button is clicked
  var modalDelete = null;   // what to run when a red Delete button is clicked

  function openModal(opts) {
    modalSubmit = opts.onSubmit || null;
    modalDelete = opts.onDelete || null;
    $('#modalTitle').textContent = opts.title || '';
    $('#modalBody').innerHTML = opts.body || '';
    $('#modalFoot').innerHTML = opts.footer || '';
    $('#modalBackdrop').firstElementChild.className = 'modal' + (opts.wide ? ' wide' : '');
    $('#modalBackdrop').hidden = false;
    if (opts.afterOpen) opts.afterOpen();
    var first = $('#modalBody input, #modalBody select, #modalBody textarea');
    if (first) setTimeout(function () { first.focus(); }, 40);
  }

  function closeModal() {
    $('#modalBackdrop').hidden = true;
    $('#modalBody').innerHTML = '';
    $('#modalFoot').innerHTML = '';
    modalSubmit = null;
    modalDelete = null;
  }

  function confirmModal(title, message, confirmLabel, onYes, danger) {
    openModal({
      title: title,
      body: '<p class="muted">' + message + '</p>',
      footer:
        '<button class="btn btn-ghost" data-modal="cancel">Cancel</button>' +
        '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-modal="submit">' + esc(confirmLabel) + '</button>',
      onSubmit: function () { onYes(); closeModal(); }
    });
  }

  /* ---- Small builders so every form looks the same ---- */

  function fieldText(label, name, value, opts) {
    opts = opts || {};
    return '<label class="field"><span>' + esc(label) + '</span>' +
      '<input type="' + (opts.type || 'text') + '" name="' + name + '" value="' + esc(value || '') + '"' +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
      (opts.required === false ? '' : ' required') +
      (opts.min !== undefined ? ' min="' + opts.min + '"' : '') +
      ' /></label>';
  }

  function fieldArea(label, name, value, opts) {
    opts = opts || {};
    return '<label class="field"><span>' + esc(label) + '</span>' +
      '<textarea name="' + name + '"' + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
      (opts.rows ? ' rows="' + opts.rows + '"' : '') + '>' + esc(value || '') + '</textarea></label>';
  }

  function fieldSelect(label, name, value, options) {
    var html = '<label class="field"><span>' + esc(label) + '</span><select name="' + name + '">';
    options.forEach(function (o) {
      html += '<option value="' + esc(o.value) + '"' + (String(o.value) === String(value) ? ' selected' : '') + '>' + esc(o.label) + '</option>';
    });
    return html + '</select></label>';
  }

  function userOptions() {
    return DB.users.map(function (u) { return { value: u.id, label: u.name + ' (' + u.title + ')' }; });
  }

  // Reads every input inside the pop-up and gives back a plain object.
  function readForm() {
    var data = {};
    $$('#modalBody [name]').forEach(function (el) {
      if (el.type === 'checkbox') {
        if (!data[el.name]) data[el.name] = [];
        if (el.checked) data[el.name].push(el.value);
      } else {
        data[el.name] = el.value.trim();
      }
    });
    return data;
  }

  function emptyState(icon, title, text) {
    return '<div class="empty"><div class="ico">' + icon + '</div><strong>' + esc(title) + '</strong><p>' + esc(text) + '</p></div>';
  }

  /* =======================================================================
     5. THE ROUTER — which page do we show?
     ======================================================================= */

  var VIEW_INFO = {
    dashboard: { title: 'Dashboard',    sub: 'A quick look at everything that is happening' },
    meetings:  { title: 'Meetings',     sub: 'Schedule meetings, set the agenda and record what happened' },
    meeting:   { title: 'Meeting',      sub: 'Agenda, attendance, minutes and decisions' },
    decisions: { title: 'Decisions',    sub: 'Every decision taken, and how far it has been carried out' },
    actions:   { title: 'Action Items', sub: 'Who has to do what, and by when' },
    reminders: { title: 'Reminders',    sub: 'What needs attention right now' },
    archive:   { title: 'Archive',      sub: 'Old meetings, kept safely for the record' }
  };

  function go(view, params) {
    state.view = view;
    state.params = params || {};
    if (view === 'meeting') state.detailTab = 'agenda';
    state.filters = {};
    closeSidebar();
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    if (!session) return;
    var user = me();
    if (!user) { doLogout(); return; }

    // --- update the sidebar and top bar ---
    $('#sideName').textContent   = user.name;
    $('#sideRole').textContent   = user.title + (user.block && user.block !== '—' ? ' · ' + user.block : '');
    $('#sideAvatar').textContent = initials(user.name);

    var info = VIEW_INFO[state.view] || VIEW_INFO.dashboard;
    $('#viewTitle').textContent    = info.title;
    $('#viewSubtitle').textContent = info.sub;

    $$('#nav .nav-item').forEach(function (b) {
      var v = b.getAttribute('data-view');
      var active = v === state.view || (state.view === 'meeting' && v === 'meetings');
      b.classList.toggle('active', active);
    });

    // --- the little red number badges ---
    var openMine = DB.actions.filter(function (a) {
      return a.assigneeId === user.id && a.status !== 'completed';
    }).length;
    var ab = $('#navActionBadge');
    ab.hidden = openMine === 0; ab.textContent = openMine;

    var rem = buildReminders();
    var rb = $('#navReminderBadge');
    rb.hidden = rem.length === 0; rb.textContent = rem.length;
    $('#bellDot').hidden = rem.length === 0;

    // --- draw the page itself ---
    var html = '';
    switch (state.view) {
      case 'dashboard': html = viewDashboard(); break;
      case 'meetings':  html = viewMeetings();  break;
      case 'meeting':   html = viewMeetingDetail(state.params.id); break;
      case 'decisions': html = viewDecisions(); break;
      case 'actions':   html = viewActions();   break;
      case 'reminders': html = viewReminders(rem); break;
      case 'archive':   html = viewArchive();   break;
      default:          html = viewDashboard();
    }
    $('#content').innerHTML = html;
    restoreFilterValues();
  }

  // Keeps whatever was typed in a search box visible after the page redraws.
  function restoreFilterValues() {
    Object.keys(state.filters).forEach(function (k) {
      var el = $('#' + k);
      if (el && el.value !== state.filters[k]) el.value = state.filters[k];
    });
  }

  function f(key, dflt) {
    return state.filters[key] !== undefined ? state.filters[key] : (dflt || '');
  }

  /* =======================================================================
     6. THE PAGES
     ======================================================================= */

  /* ------------------------------ DASHBOARD ---------------------------- */

  function viewDashboard() {
    var user = me();

    var upcoming = DB.meetings.filter(function (m) {
      return !m.archived && m.status === 'scheduled' && daysFromToday(m.date) >= 0;
    });
    upcoming = sortBy(upcoming, function (m) { return m.date; });

    var overdue       = DB.actions.filter(function (a) { return effStatus(a) === 'overdue'; });
    var myActions     = DB.actions.filter(function (a) { return a.assigneeId === user.id && a.status !== 'completed'; });
    var totalActions  = DB.actions.length;
    var doneActions   = DB.actions.filter(function (a) { return a.status === 'completed'; }).length;
    var completionPct = totalActions ? Math.round((doneActions / totalActions) * 100) : 0;

    var html = '';

    /* four summary boxes at the top */
    html +=
      '<div class="stats">' +
        tile('Upcoming meetings', upcoming.length,
             upcoming.length ? 'Next: ' + fmtDate(upcoming[0].date) + ' (' + relLabel(upcoming[0].date) + ')' : 'Nothing scheduled', '') +
        tile('Open decisions', DB.decisions.filter(function (d) { return d.outcome === 'approved' && decisionProgress(d.id).pct < 100; }).length,
             'Approved but not finished yet', 'info') +
        tile('My open actions', myActions.length,
             myActions.length ? 'Jobs given to you' : 'You are all clear', myActions.length ? 'warn' : 'ok') +
        tile('Overdue', overdue.length,
             overdue.length ? 'Past the deadline' : 'Nothing is late', overdue.length ? 'bad' : 'ok') +
      '</div>';

    html += '<div class="grid-2">';

    /* ---------- left column ---------- */
    html += '<div class="stack">';

    html +=
      '<div class="card">' +
        '<div class="card-head"><h3>Upcoming meetings</h3>' +
          '<button class="btn btn-ghost btn-sm" data-act="nav" data-view="meetings">View all</button></div>' +
        '<div class="card-body flush">';
    if (!upcoming.length) {
      html += emptyState('📅', 'No meetings scheduled', 'Once you schedule a meeting it will show up here with its agenda.');
    } else {
      upcoming.slice(0, 4).forEach(function (m) {
        var att = attendanceCount(m);
        html +=
          '<div class="list-item" data-act="open-meeting" data-id="' + m.id + '" style="cursor:pointer">' +
            '<div class="li-num">' + parseDate(m.date).getDate() + '</div>' +
            '<div class="li-body">' +
              '<strong>' + esc(m.title) + '</strong>' +
              '<p>' + fmtDateLong(m.date) + ' · ' + fmtTime(m.time) + ' · ' + esc(m.location) + '</p>' +
              '<p class="tiny dim">' + pluralise(m.agenda.length, 'agenda item') + ' · ' + att.total + ' invited</p>' +
            '</div>' +
            '<div class="li-side"><span class="pill pill-brand">' + relLabel(m.date) + '</span></div>' +
          '</div>';
      });
    }
    html += '</div></div>';

    var tracked = DB.decisions.filter(function (d) { return d.outcome === 'approved'; });
    tracked = sortBy(tracked, function (d) { return decisionProgress(d.id).pct; });
    html +=
      '<div class="card">' +
        '<div class="card-head"><h3>Decision follow-through</h3>' +
          '<button class="btn btn-ghost btn-sm" data-act="nav" data-view="decisions">View all</button></div>' +
        '<div class="card-body stack">';
    if (!tracked.length) {
      html += emptyState('⚖', 'No approved decisions yet', 'Decisions recorded in a meeting show their progress here.');
    } else {
      tracked.slice(0, 5).forEach(function (d) {
        var p = decisionProgress(d.id);
        var cls = p.pct === 100 ? 'ok' : (p.pct === 0 ? 'bad' : 'warn');
        html +=
          '<div>' +
            '<div class="row-between" style="margin-bottom:6px">' +
              '<span class="small" style="font-weight:600">' + esc(d.title) + '</span>' +
              '<span class="tiny dim nowrap">' + p.done + '/' + p.total + ' actions</span>' +
            '</div>' +
            '<div class="bar"><i class="' + cls + '" style="width:' + (p.total ? p.pct : 0) + '%"></i></div>' +
          '</div>';
      });
    }
    html += '</div></div>';
    html += '</div>';

    /* ---------- right column ---------- */
    html += '<div class="stack">';

    html +=
      '<div class="card">' +
        '<div class="card-head"><h3>My action items</h3>' +
          '<button class="btn btn-ghost btn-sm" data-act="nav" data-view="actions">All actions</button></div>' +
        '<div class="card-body flush">';
    if (!myActions.length) {
      html += emptyState('✓', 'Nothing assigned to you', 'Jobs given to you in a meeting will appear here.');
    } else {
      sortBy(myActions, function (a) { return a.deadline; }).slice(0, 5).forEach(function (a) {
        html +=
          '<div class="list-item">' +
            '<div class="li-body">' +
              '<strong>' + esc(a.title) + '</strong>' +
              '<p class="tiny">Due ' + fmtDate(a.deadline) + ' · ' + relLabel(a.deadline) + '</p>' +
            '</div>' +
            '<div class="li-side">' + statusPill(effStatus(a)) + '</div>' +
          '</div>';
      });
    }
    html += '</div></div>';

    html +=
      '<div class="card"><div class="card-body">' +
        '<div class="section-title">Overall completion</div>' +
        '<div class="row-between" style="margin-bottom:8px">' +
          '<span style="font-size:26px;font-weight:720;letter-spacing:-1px">' + completionPct + '%</span>' +
          '<span class="tiny dim">' + doneActions + ' of ' + totalActions + ' actions finished</span>' +
        '</div>' +
        '<div class="bar"><i class="' + (completionPct > 66 ? 'ok' : completionPct > 33 ? 'warn' : 'bad') + '" style="width:' + completionPct + '%"></i></div>' +
        '<p class="tiny dim" style="margin-top:10px">Across ' + pluralise(DB.decisions.length, 'decision') +
        ' taken in ' + pluralise(DB.meetings.filter(function (m) { return m.status === 'completed'; }).length, 'completed meeting') + '.</p>' +
      '</div></div>';

    var rem = buildReminders().slice(0, 4);
    html +=
      '<div class="card">' +
        '<div class="card-head"><h3>Reminders</h3>' +
          '<button class="btn btn-ghost btn-sm" data-act="nav" data-view="reminders">See all</button></div>' +
        '<div class="card-body flush">';
    if (!rem.length) {
      html += emptyState('🔔', 'All caught up', 'Deadlines, upcoming meetings and missing minutes are flagged here.');
    } else {
      rem.forEach(function (r) { html += reminderRow(r, false); });
    }
    html += '</div></div>';

    html += '</div></div>';
    return html;
  }

  function tile(label, value, sub, cls) {
    return '<div class="stat ' + (cls || '') + '">' +
      '<div class="stat-label">' + esc(label) + '</div>' +
      '<div class="stat-value">' + value + '</div>' +
      '<div class="stat-sub">' + esc(sub) + '</div></div>';
  }

  /* ------------------------------ MEETINGS ----------------------------- */

  function viewMeetings() {
    var q      = f('fMtgSearch').toLowerCase();
    var status = f('fMtgStatus', 'all');
    var type   = f('fMtgType', 'all');

    var list = DB.meetings.filter(function (m) { return !m.archived; });
    if (status !== 'all') list = list.filter(function (m) { return m.status === status; });
    if (type !== 'all')   list = list.filter(function (m) { return m.type === type; });
    if (q) {
      list = list.filter(function (m) {
        return (m.title + ' ' + m.location + ' ' + m.type).toLowerCase().indexOf(q) !== -1;
      });
    }
    list = sortBy(list, function (m) { return m.date; }, true);

    var types = {};
    DB.meetings.forEach(function (m) { types[m.type] = true; });

    var html =
      '<div class="toolbar">' +
        '<input class="search" id="fMtgSearch" data-filter="fMtgSearch" type="text" placeholder="Search meetings by title, type or place…" />' +
        '<select id="fMtgStatus" data-filter="fMtgStatus">' +
          opt('all', 'All statuses', status) + opt('scheduled', 'Scheduled', status) +
          opt('completed', 'Completed', status) + opt('cancelled', 'Cancelled', status) +
        '</select>' +
        '<select id="fMtgType" data-filter="fMtgType">' + opt('all', 'All types', type) +
          Object.keys(types).map(function (t) { return opt(t, t, type); }).join('') +
        '</select>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn-primary" data-act="new-meeting">＋ Schedule meeting</button>' +
      '</div>';

    if (!list.length) {
      return html + '<div class="card"><div class="card-body">' +
        emptyState('▤', 'No meetings found', 'Try a different filter, or schedule a new meeting to get started.') +
        '</div></div>';
    }

    html += '<div class="grid-cards">';
    list.forEach(function (m) {
      var att  = attendanceCount(m);
      var decs = decisionsOfMeeting(m.id).length;
      var acts = actionsOfMeeting(m.id);
      var open = acts.filter(function (a) { return a.status !== 'completed'; }).length;

      html +=
        '<div class="mtg-card ' + m.status + '" data-act="open-meeting" data-id="' + m.id + '">' +
          '<div class="row-between" style="align-items:flex-start">' +
            '<h4>' + esc(m.title) + '</h4>' + meetingPill(m) +
          '</div>' +
          '<span class="pill pill-mute">' + esc(m.type) + '</span>' +
          '<div class="mtg-meta">' +
            '<span>📅 ' + fmtDateLong(m.date) + '</span>' +
            '<span>🕒 ' + fmtTime(m.time) + ' · ' + relLabel(m.date) + '</span>' +
            '<span>📍 ' + esc(m.location) + '</span>' +
          '</div>' +
          '<div class="mtg-foot">' +
            '<span>▤ ' + pluralise(m.agenda.length, 'agenda item') + '</span>' +
            '<span>👥 ' + (m.status === 'completed' ? att.present + '/' + att.total + ' present' : att.total + ' invited') + '</span>' +
            '<span>⚖ ' + pluralise(decs, 'decision') + '</span>' +
            (open ? '<span style="color:var(--warn)">● ' + open + ' open</span>' : '') +
          '</div>' +
        '</div>';
    });
    return html + '</div>';
  }

  function opt(value, label, current) {
    return '<option value="' + esc(value) + '"' + (value === current ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  /* --------------------------- MEETING DETAIL -------------------------- */

  function viewMeetingDetail(id) {
    var m = meetingById(id);
    if (!m) {
      return '<div class="card"><div class="card-body">' +
        emptyState('？', 'Meeting not found', 'It may have been deleted.') +
        '<div class="center"><button class="btn btn-outline" data-act="nav" data-view="meetings">Back to meetings</button></div></div></div>';
    }

    var locked = m.archived;              // archived meetings are read-only
    var att    = attendanceCount(m);
    var decs   = decisionsOfMeeting(m.id);
    var acts   = actionsOfMeeting(m.id);
    var done   = acts.filter(function (a) { return a.status === 'completed'; }).length;

    var html = '<div class="row" style="margin-bottom:14px">' +
      '<button class="btn btn-ghost btn-sm" data-act="nav" data-view="' + (m.archived ? 'archive' : 'meetings') + '">← Back</button></div>';

    html +=
      '<div class="detail-head">' +
        '<div class="row-between" style="align-items:flex-start">' +
          '<div><h3>' + esc(m.title) + '</h3>' +
            '<div class="row" style="margin-top:8px">' + meetingPill(m) +
            '<span class="pill pill-mute">' + esc(m.type) + '</span>' +
            '<span class="tiny dim">Created by ' + esc(userName(m.createdBy)) + '</span></div>' +
          '</div>' +
          '<div class="row">' +
            (!locked ? '<button class="btn btn-outline btn-sm" data-act="edit-meeting" data-id="' + m.id + '">Edit</button>' : '') +
            (!locked && m.status === 'scheduled' ? '<button class="btn btn-ok btn-sm" data-act="complete-meeting" data-id="' + m.id + '">Mark held</button>' : '') +
            (!locked && m.status === 'scheduled' ? '<button class="btn btn-danger btn-sm" data-act="cancel-meeting" data-id="' + m.id + '">Cancel</button>' : '') +
            (!locked && m.status === 'completed' ? '<button class="btn btn-soft btn-sm" data-act="archive-meeting" data-id="' + m.id + '">Archive</button>' : '') +
            (locked ? '<button class="btn btn-soft btn-sm" data-act="unarchive-meeting" data-id="' + m.id + '">Restore</button>' : '') +
            '<button class="btn btn-danger btn-sm" data-act="delete-meeting" data-id="' + m.id + '">Delete</button>' +
          '</div>' +
        '</div>' +
        '<div class="detail-grid">' +
          kv('Date', fmtDateLong(m.date)) +
          kv('Time', fmtTime(m.time) + ' · ' + relLabel(m.date)) +
          kv('Place', m.location) +
          kv('Attendance', m.status === 'completed' ? att.present + ' of ' + att.total + ' present' : att.total + ' invited') +
          kv('Decisions', String(decs.length)) +
          kv('Actions finished', done + ' of ' + acts.length) +
        '</div>' +
      '</div>';

    var tabs = [
      ['agenda', 'Agenda (' + m.agenda.length + ')'],
      ['attendance', 'Attendance'],
      ['minutes', 'Minutes'],
      ['decisions', 'Decisions & Actions (' + decs.length + ')']
    ];
    html += '<div class="tabs">';
    tabs.forEach(function (t) {
      html += '<button class="tab' + (state.detailTab === t[0] ? ' active' : '') + '" data-act="tab" data-tab="' + t[0] + '">' + esc(t[1]) + '</button>';
    });
    html += '</div>';

    if (state.detailTab === 'agenda')     html += tabAgenda(m, locked);
    if (state.detailTab === 'attendance') html += tabAttendance(m, locked);
    if (state.detailTab === 'minutes')    html += tabMinutes(m, locked);
    if (state.detailTab === 'decisions')  html += tabDecisions(m, locked, decs);

    return html;
  }

  function kv(k, v) {
    return '<div class="kv"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>';
  }

  function tabAgenda(m, locked) {
    var html = '<div class="card"><div class="card-head"><h3>Agenda</h3>' +
      (!locked ? '<button class="btn btn-soft btn-sm" data-act="add-agenda" data-id="' + m.id + '">＋ Add item</button>' : '') +
      '</div><div class="card-body flush">';

    if (!m.agenda.length) {
      html += emptyState('▤', 'No agenda items yet', 'Add the points to be discussed so everyone can prepare before the meeting.');
    } else {
      m.agenda.forEach(function (item, i) {
        html +=
          '<div class="list-item">' +
            '<div class="li-num">' + (i + 1) + '</div>' +
            '<div class="li-body">' +
              '<strong>' + esc(item.title) + '</strong>' +
              (item.notes ? '<p>' + esc(item.notes) + '</p>' : '') +
              '<p class="tiny dim">Presented by ' + esc(userName(item.presenterId)) + '</p>' +
            '</div>' +
            (!locked ?
              '<div class="li-side">' +
                '<button class="btn btn-ghost btn-xs" data-act="edit-agenda" data-id="' + m.id + '" data-sub="' + item.id + '">Edit</button>' +
                '<button class="btn btn-danger btn-xs" data-act="del-agenda" data-id="' + m.id + '" data-sub="' + item.id + '">✕</button>' +
              '</div>' : '') +
          '</div>';
      });
    }
    return html + '</div></div>';
  }

  function tabAttendance(m, locked) {
    var html = '<div class="card"><div class="card-head"><h3>Attendance register</h3>' +
      (!locked ? '<button class="btn btn-soft btn-sm" data-act="all-present" data-id="' + m.id + '">Mark all present</button>' : '') +
      '</div><div class="card-body">';

    if (!m.participants.length) {
      return html + emptyState('👥', 'Nobody invited yet', 'Use the Edit button above to invite members.') + '</div></div>';
    }

    html += '<div class="att-grid">';
    m.participants.forEach(function (pid) {
      var u = userById(pid);
      if (!u) return;
      var st = (m.attendance && m.attendance[pid]) || 'invited';
      html +=
        '<div class="att-chip">' +
          '<div class="avatar xs">' + esc(initials(u.name)) + '</div>' +
          '<div class="n">' + esc(u.name) + '</div>' +
          (!locked
            ? '<select data-act="set-att" data-id="' + m.id + '" data-sub="' + pid + '">' +
                opt('invited', 'Awaiting', st) + opt('present', 'Present', st) +
                opt('absent', 'Absent', st) + opt('excused', 'Excused', st) +
              '</select>'
            : '<span class="pill ' + ATT_META[st].pill + '">' + ATT_META[st].label + '</span>') +
        '</div>';
    });
    html += '</div>';

    var c = attendanceCount(m);
    html += '<p class="tiny dim" style="margin-top:14px">' + c.present + ' of ' + c.total + ' marked present.</p>';
    return html + '</div></div>';
  }

  function tabMinutes(m, locked) {
    var html = '<div class="card"><div class="card-head"><h3>Minutes of the meeting</h3>' +
      (!locked ? '<button class="btn btn-soft btn-sm" data-act="edit-minutes" data-id="' + m.id + '">' +
        (m.minutes ? 'Edit minutes' : '＋ Write minutes') + '</button>' : '') +
      '</div><div class="card-body">';

    if (!m.minutes || !m.minutes.trim()) {
      html += emptyState('✎', 'No minutes written yet',
        m.status === 'scheduled'
          ? 'You can write the minutes once the meeting has been held.'
          : 'This meeting was held but nothing has been written down yet.');
    } else {
      html += '<div class="minutes">' + esc(m.minutes) + '</div>';
    }
    return html + '</div></div>';
  }

  function tabDecisions(m, locked, decs) {
    var html = '<div class="card"><div class="card-head"><h3>Decisions taken</h3>' +
      (!locked ? '<button class="btn btn-soft btn-sm" data-act="new-decision" data-id="' + m.id + '">＋ Record decision</button>' : '') +
      '</div><div class="card-body flush">';

    if (!decs.length) {
      return html + emptyState('⚖', 'No decisions recorded',
        'Record what the group decided so it can be followed up until it is actually done.') + '</div></div>';
    }

    decs.forEach(function (d) {
      var p     = decisionProgress(d.id);
      var acts  = actionsOfDecision(d.id);
      var agitm = m.agenda.filter(function (a) { return a.id === d.agendaId; })[0];

      html +=
        '<div style="padding:16px;border-bottom:1px solid var(--border)">' +
          '<div class="row-between" style="align-items:flex-start">' +
            '<div style="flex:1;min-width:0">' +
              '<div class="row" style="margin-bottom:6px">' + outcomePill(d.outcome) +
                (agitm ? '<span class="tiny dim">Agenda: ' + esc(agitm.title) + '</span>' : '') + '</div>' +
              '<strong style="font-size:14.5px">' + esc(d.title) + '</strong>' +
              (d.detail ? '<p class="small muted" style="margin-top:5px">' + esc(d.detail) + '</p>' : '') +
              '<p class="tiny dim" style="margin-top:6px">Vote: ' + d.votesFor + ' for · ' + d.votesAgainst + ' against · ' + d.votesAbstain + ' did not vote</p>' +
            '</div>' +
            (!locked ?
              '<div class="li-side">' +
                '<button class="btn btn-ghost btn-xs" data-act="edit-decision" data-id="' + d.id + '">Edit</button>' +
                '<button class="btn btn-danger btn-xs" data-act="del-decision" data-id="' + d.id + '">✕</button>' +
              '</div>' : '') +
          '</div>' +

          '<div style="margin-top:12px">' +
            '<div class="row-between" style="margin-bottom:6px">' +
              '<span class="section-title" style="margin:0">Assigned actions</span>' +
              '<span class="tiny dim">' + p.done + '/' + p.total + ' done</span>' +
            '</div>' +
            (p.total ? '<div class="bar" style="margin-bottom:10px"><i class="' +
              (p.pct === 100 ? 'ok' : p.pct === 0 ? 'bad' : 'warn') + '" style="width:' + p.pct + '%"></i></div>' : '') +
            actionMiniList(acts, locked) +
            (!locked ? '<button class="btn btn-ghost btn-xs" style="margin-top:9px" data-act="new-action" data-id="' + d.id + '">＋ Assign action</button>' : '') +
          '</div>' +
        '</div>';
    });

    return html + '</div></div>';
  }

  function actionMiniList(acts, locked) {
    if (!acts.length) return '<p class="tiny dim">Nobody has been given a job for this decision yet.</p>';
    var html = '<div class="stack" style="gap:8px">';
    acts.forEach(function (a) {
      html +=
        '<div class="att-chip" style="align-items:flex-start">' +
          '<div class="avatar xs">' + esc(initials(userName(a.assigneeId))) + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="small" style="font-weight:600">' + esc(a.title) + '</div>' +
            '<div class="tiny dim">' + esc(userName(a.assigneeId)) + ' · due ' + fmtDate(a.deadline) + ' (' + relLabel(a.deadline) + ')</div>' +
          '</div>' +
          statusPill(effStatus(a)) +
          (!locked ? '<button class="btn btn-ghost btn-xs" data-act="edit-action" data-id="' + a.id + '">⋯</button>' : '') +
        '</div>';
    });
    return html + '</div>';
  }

  /* ------------------------------ DECISIONS ---------------------------- */

  function viewDecisions() {
    var q       = f('fDecSearch').toLowerCase();
    var outcome = f('fDecOutcome', 'all');
    var prog    = f('fDecProgress', 'all');

    var list = DB.decisions.slice();
    if (outcome !== 'all') list = list.filter(function (d) { return d.outcome === outcome; });
    if (prog !== 'all') {
      list = list.filter(function (d) {
        var p = decisionProgress(d.id);
        if (prog === 'done')    return p.total > 0 && p.pct === 100;
        if (prog === 'ongoing') return p.total > 0 && p.pct < 100;
        if (prog === 'none')    return p.total === 0;
        return true;
      });
    }
    if (q) list = list.filter(function (d) { return (d.title + ' ' + d.detail).toLowerCase().indexOf(q) !== -1; });
    list = sortBy(list, function (d) { return d.createdAt; }, true);

    var html =
      '<div class="toolbar">' +
        '<input class="search" id="fDecSearch" data-filter="fDecSearch" type="text" placeholder="Search decisions…" />' +
        '<select id="fDecOutcome" data-filter="fDecOutcome">' +
          opt('all', 'All outcomes', outcome) + opt('approved', 'Approved', outcome) +
          opt('rejected', 'Rejected', outcome) + opt('deferred', 'Deferred', outcome) +
        '</select>' +
        '<select id="fDecProgress" data-filter="fDecProgress">' +
          opt('all', 'Any progress', prog) + opt('done', 'Fully done', prog) +
          opt('ongoing', 'Still going on', prog) + opt('none', 'Nobody assigned', prog) +
        '</select>' +
        '<span class="spacer"></span>' +
        '<span class="tiny dim">' + pluralise(list.length, 'decision') + '</span>' +
      '</div>';

    if (!list.length) {
      return html + '<div class="card"><div class="card-body">' +
        emptyState('⚖', 'No decisions match', 'Clear the filters, or record a decision from inside a meeting.') + '</div></div>';
    }

    html += '<div class="card"><div class="card-body flush"><div class="table-wrap"><table class="tbl"><thead><tr>' +
      '<th>Decision</th><th>Meeting</th><th>Outcome</th><th>Vote</th><th>Progress</th><th></th>' +
      '</tr></thead><tbody>';

    list.forEach(function (d) {
      var m = meetingById(d.meetingId);
      var p = decisionProgress(d.id);
      html +=
        '<tr>' +
          '<td style="max-width:360px"><strong>' + esc(d.title) + '</strong>' +
            (d.detail ? '<div class="tiny dim" style="margin-top:3px">' + esc(d.detail) + '</div>' : '') + '</td>' +
          '<td>' + (m
            ? '<a href="#" data-act="open-meeting" data-id="' + m.id + '" style="color:var(--brand);text-decoration:none;font-weight:600">' + esc(m.title) + '</a>' +
              '<div class="tiny dim">' + fmtDate(m.date) + '</div>'
            : '<span class="dim">—</span>') + '</td>' +
          '<td>' + outcomePill(d.outcome) + '</td>' +
          '<td class="tiny nowrap">' + d.votesFor + ' / ' + d.votesAgainst + ' / ' + d.votesAbstain + '</td>' +
          '<td style="min-width:130px">' +
            (p.total
              ? '<div class="bar"><i class="' + (p.pct === 100 ? 'ok' : p.pct === 0 ? 'bad' : 'warn') + '" style="width:' + p.pct + '%"></i></div>' +
                '<div class="tiny dim" style="margin-top:4px">' + p.done + ' of ' + p.total + ' actions</div>'
              : '<span class="pill pill-mute">Nobody assigned</span>') +
          '</td>' +
          '<td class="td-actions">' +
            '<button class="btn btn-ghost btn-xs" data-act="open-meeting" data-id="' + d.meetingId + '">Open</button>' +
            '<button class="btn btn-soft btn-xs" data-act="new-action" data-id="' + d.id + '">＋ Action</button>' +
          '</td>' +
        '</tr>';
    });

    return html + '</tbody></table></div></div></div>';
  }

  /* ----------------------------- ACTION ITEMS -------------------------- */

  function viewActions() {
    var user     = me();
    var q        = f('fActSearch').toLowerCase();
    var status   = f('fActStatus', 'all');
    var assignee = f('fActWho', 'all');

    var list = DB.actions.slice();
    if (assignee !== 'all') list = list.filter(function (a) { return a.assigneeId === assignee; });
    if (status !== 'all')   list = list.filter(function (a) { return effStatus(a) === status; });
    if (q) list = list.filter(function (a) { return (a.title + ' ' + a.detail).toLowerCase().indexOf(q) !== -1; });

    // Most urgent first: overdue, then in progress, then pending, then done.
    list = sortBy(list, function (a) {
      var rank = { overdue: 0, 'in-progress': 1, pending: 2, completed: 3 }[effStatus(a)];
      return rank + '|' + a.deadline;
    });

    var counts = { overdue: 0, 'in-progress': 0, pending: 0, completed: 0 };
    DB.actions.forEach(function (a) { counts[effStatus(a)]++; });

    var html =
      '<div class="stats">' +
        tile('Overdue', counts.overdue, 'Past the deadline', counts.overdue ? 'bad' : 'ok') +
        tile('In progress', counts['in-progress'], 'Being worked on', 'info') +
        tile('Pending', counts.pending, 'Not started yet', 'warn') +
        tile('Completed', counts.completed, 'Finished and closed', 'ok') +
      '</div>';

    html +=
      '<div class="toolbar">' +
        '<input class="search" id="fActSearch" data-filter="fActSearch" type="text" placeholder="Search action items…" />' +
        '<select id="fActStatus" data-filter="fActStatus">' +
          opt('all', 'All statuses', status) + opt('overdue', 'Overdue', status) +
          opt('pending', 'Pending', status) + opt('in-progress', 'In progress', status) +
          opt('completed', 'Completed', status) +
        '</select>' +
        '<select id="fActWho" data-filter="fActWho">' + opt('all', 'Everyone', assignee) +
          DB.users.map(function (u) {
            return opt(u.id, u.id === user.id ? 'Assigned to me' : u.name, assignee);
          }).join('') +
        '</select>' +
        '<span class="spacer"></span>' +
        '<span class="tiny dim">' + pluralise(list.length, 'item') + '</span>' +
      '</div>';

    if (!list.length) {
      return html + '<div class="card"><div class="card-body">' +
        emptyState('✓', 'No action items match', 'Actions are created under a decision, inside a meeting.') + '</div></div>';
    }

    html += '<div class="card"><div class="card-body flush"><div class="table-wrap"><table class="tbl"><thead><tr>' +
      '<th>Action</th><th>Who</th><th>From decision</th><th>Deadline</th><th>Status</th><th></th>' +
      '</tr></thead><tbody>';

    list.forEach(function (a) {
      var st   = effStatus(a);
      var d    = decisionById(a.decisionId);
      var mine = a.assigneeId === user.id;
      var late = st === 'overdue';

      html +=
        '<tr>' +
          '<td style="max-width:300px"><strong>' + esc(a.title) + '</strong>' +
            (a.detail ? '<div class="tiny dim" style="margin-top:3px">' + esc(a.detail) + '</div>' : '') + '</td>' +
          '<td><div class="row" style="gap:8px;flex-wrap:nowrap">' +
            '<div class="avatar xs">' + esc(initials(userName(a.assigneeId))) + '</div>' +
            '<span class="small nowrap">' + esc(userName(a.assigneeId)) + (mine ? ' <span class="pill pill-brand">You</span>' : '') + '</span>' +
          '</div></td>' +
          '<td style="max-width:230px"><span class="small">' + (d ? esc(d.title) : '<span class="dim">—</span>') + '</span></td>' +
          '<td class="nowrap"><span class="small"' + (late ? ' style="color:var(--bad);font-weight:650"' : '') + '>' + fmtDate(a.deadline) + '</span>' +
            '<div class="tiny dim">' + (a.status === 'completed' && a.completedAt ? 'done ' + fmtDate(a.completedAt) : relLabel(a.deadline)) + '</div></td>' +
          '<td><select data-act="set-action-status" data-id="' + a.id + '">' +
              opt('pending', 'Pending', a.status) + opt('in-progress', 'In progress', a.status) +
              opt('completed', 'Completed', a.status) +
            '</select>' + (late ? '<div class="tiny" style="color:var(--bad);margin-top:3px">Overdue</div>' : '') + '</td>' +
          '<td class="td-actions">' +
            '<button class="btn btn-ghost btn-xs" data-act="edit-action" data-id="' + a.id + '">Edit</button>' +
            '<button class="btn btn-danger btn-xs" data-act="del-action" data-id="' + a.id + '">✕</button>' +
          '</td>' +
        '</tr>';
    });

    return html + '</tbody></table></div></div></div>';
  }

  /* ------------------------------ REMINDERS ---------------------------- */

  function viewReminders(rem) {
    var html = '<div class="card"><div class="card-head"><h3>Active reminders</h3>' +
      (rem.length ? '<button class="btn btn-ghost btn-sm" data-act="dismiss-all">Dismiss all</button>' : '') +
      '</div><div class="card-body flush">';

    if (!rem.length) {
      html += emptyState('🔔', 'Nothing needs your attention',
        'Reminders appear on their own for upcoming meetings, late or nearly-due deadlines, missing minutes, and decisions with nobody assigned.');
    } else {
      rem.forEach(function (r) { html += reminderRow(r, true); });
    }
    html += '</div></div>';

    var dismissed = DB.dismissed || [];
    if (dismissed.length) {
      html += '<div class="card" style="margin-top:16px"><div class="card-body row-between">' +
        '<span class="small muted">' + pluralise(dismissed.length, 'reminder') + ' dismissed. They will not come back unless you restore them.</span>' +
        '<button class="btn btn-outline btn-sm" data-act="restore-reminders">Restore all</button>' +
        '</div></div>';
    }

    html += '<div class="card" style="margin-top:16px"><div class="card-body">' +
      '<div class="section-title">How reminders are created</div>' +
      '<ul class="small muted" style="margin:0;padding-left:18px;line-height:1.9">' +
        '<li>A meeting is coming up within the next 7 days</li>' +
        '<li>An action item has passed its deadline and is still not done</li>' +
        '<li>An action item is due within the next 3 days</li>' +
        '<li>A meeting was held but the minutes were never written</li>' +
        '<li>A decision was approved but nobody was given the job</li>' +
      '</ul></div></div>';

    return html;
  }

  function reminderRow(r, withDismiss) {
    return '<div class="rem-item">' +
      '<div class="rem-ico ' + r.tone + '">' + r.icon + '</div>' +
      '<div class="rem-body">' +
        '<strong>' + esc(r.title) + '</strong>' +
        '<p>' + esc(r.text) + '</p>' +
        '<div class="rem-time">' + esc(r.when) + '</div>' +
      '</div>' +
      '<div class="li-side">' +
        (r.go ? '<button class="btn btn-ghost btn-xs" data-act="rem-go" data-key="' + esc(r.key) + '">Open</button>' : '') +
        (withDismiss ? '<button class="btn btn-ghost btn-xs" data-act="dismiss-reminder" data-key="' + esc(r.key) + '">✕</button>' : '') +
      '</div>' +
    '</div>';
  }

  /* ------------------------------- ARCHIVE ----------------------------- */

  function viewArchive() {
    var q    = f('fArcSearch').toLowerCase();
    var year = f('fArcYear', 'all');

    var list = DB.meetings.filter(function (m) { return m.archived; });
    if (year !== 'all') list = list.filter(function (m) { return m.date.slice(0, 4) === year; });
    if (q) {
      list = list.filter(function (m) {
        return (m.title + ' ' + m.location + ' ' + m.minutes).toLowerCase().indexOf(q) !== -1;
      });
    }
    list = sortBy(list, function (m) { return m.date; }, true);

    var years = {};
    DB.meetings.filter(function (m) { return m.archived; }).forEach(function (m) { years[m.date.slice(0, 4)] = true; });

    var html =
      '<div class="toolbar">' +
        '<input class="search" id="fArcSearch" data-filter="fArcSearch" type="text" placeholder="Search old meetings and their minutes…" />' +
        '<select id="fArcYear" data-filter="fArcYear">' + opt('all', 'All years', year) +
          Object.keys(years).sort().reverse().map(function (y) { return opt(y, y, year); }).join('') +
        '</select>' +
        '<span class="spacer"></span>' +
        '<span class="tiny dim">' + pluralise(list.length, 'archived meeting') + '</span>' +
      '</div>';

    if (!list.length) {
      return html + '<div class="card"><div class="card-body">' +
        emptyState('🗄', 'The archive is empty',
          'Completed meetings can be archived from the meeting page. Archived meetings cannot be edited, but you can still read and search them.') +
        '</div></div>';
    }

    html += '<div class="grid-cards">';
    list.forEach(function (m) {
      var decs = decisionsOfMeeting(m.id);
      var acts = actionsOfMeeting(m.id);
      var done = acts.filter(function (a) { return a.status === 'completed'; }).length;
      var att  = attendanceCount(m);
      html +=
        '<div class="mtg-card archived" data-act="open-meeting" data-id="' + m.id + '">' +
          '<div class="row-between" style="align-items:flex-start">' +
            '<h4>' + esc(m.title) + '</h4><span class="pill pill-mute">Archived</span></div>' +
          '<div class="mtg-meta">' +
            '<span>📅 ' + fmtDateLong(m.date) + '</span>' +
            '<span>👥 ' + att.present + '/' + att.total + ' present</span>' +
            '<span>📍 ' + esc(m.location) + '</span>' +
          '</div>' +
          '<div class="mtg-foot">' +
            '<span>⚖ ' + pluralise(decs.length, 'decision') + '</span>' +
            '<span>✓ ' + done + '/' + acts.length + ' actions done</span>' +
            '<span>' + (m.minutes ? '✎ minutes saved' : '<span style="color:var(--warn)">no minutes</span>') + '</span>' +
          '</div>' +
        '</div>';
    });
    return html + '</div>';
  }

  /* =======================================================================
     7. THE FORMS
     ======================================================================= */

  function meetingForm(existing) {
    var m = existing || {
      title: '', type: 'General Body', date: dayOffset(7), time: '18:30',
      location: 'Clubhouse Hall, Green Park Residency',
      participants: DB.users.map(function (u) { return u.id; })
    };

    var checks = DB.users.map(function (u) {
      var on = m.participants.indexOf(u.id) !== -1;
      return '<label class="att-chip" style="cursor:pointer">' +
        '<input type="checkbox" name="participants" value="' + u.id + '"' + (on ? ' checked' : '') + ' style="width:auto;padding:0" />' +
        '<div class="n">' + esc(u.name) + '</div>' +
        '<span class="tiny dim">' + esc(u.title) + '</span></label>';
    }).join('');

    var body =
      fieldText('Meeting title', 'title', m.title, { placeholder: 'e.g. Monthly General Body Meeting — December' }) +
      '<div class="form-row">' +
        fieldSelect('Type', 'type', m.type, [
          { value: 'General Body', label: 'General Body' },
          { value: 'Committee', label: 'Committee' },
          { value: 'Emergency', label: 'Emergency' },
          { value: 'Special Session', label: 'Special Session' },
          { value: 'Annual General Meeting', label: 'Annual General Meeting' }
        ]) +
        fieldText('Place', 'location', m.location, { placeholder: 'Where will it be held?' }) +
      '</div>' +
      '<div class="form-row">' +
        fieldText('Date', 'date', m.date, { type: 'date' }) +
        fieldText('Start time', 'time', m.time, { type: 'time' }) +
      '</div>' +
      '<div><div class="section-title">Invite members</div><div class="att-grid">' + checks + '</div></div>' +
      '<p class="form-note">You mark who actually came later, on the meeting page.</p>';

    openModal({
      title: existing ? 'Edit meeting' : 'Schedule a meeting',
      wide: true,
      body: body,
      footer: '<button class="btn btn-ghost" data-modal="cancel">Cancel</button>' +
              '<button class="btn btn-primary" data-modal="submit">' + (existing ? 'Save changes' : 'Schedule meeting') + '</button>',
      onSubmit: function () {
        var d = readForm();
        if (!d.title || !d.date || !d.time || !d.location) { toast('Title, place, date and time are all needed.', 'bad'); return; }
        var participants = d.participants || [];
        if (!participants.length) { toast('Invite at least one member.', 'bad'); return; }

        if (existing) {
          existing.title = d.title; existing.type = d.type; existing.date = d.date;
          existing.time = d.time; existing.location = d.location;
          existing.participants = participants;
          participants.forEach(function (id) {
            if (!existing.attendance[id]) existing.attendance[id] = 'invited';
          });
          toast('Meeting updated.', 'ok');
        } else {
          var att = {};
          participants.forEach(function (id) { att[id] = 'invited'; });
          DB.meetings.push({
            id: uid('m'), title: d.title, type: d.type, date: d.date, time: d.time,
            location: d.location, status: 'scheduled', archived: false,
            createdBy: session.userId, participants: participants,
            attendance: att, agenda: [], minutes: ''
          });
          toast('Meeting scheduled for ' + fmtDate(d.date) + '.', 'ok');
        }
        save(); closeModal(); render();
      }
    });
  }

  function agendaForm(meeting, item) {
    openModal({
      title: item ? 'Edit agenda item' : 'Add agenda item',
      body:
        fieldText('Agenda item', 'title', item ? item.title : '', { placeholder: 'e.g. Review of water tanker expenses' }) +
        fieldSelect('Presented by', 'presenterId', item ? item.presenterId : session.userId, userOptions()) +
        fieldArea('Notes / background', 'notes', item ? item.notes : '', { rows: 3, placeholder: 'Optional — any background to share before the meeting' }),
      footer: '<button class="btn btn-ghost" data-modal="cancel">Cancel</button>' +
              '<button class="btn btn-primary" data-modal="submit">' + (item ? 'Save' : 'Add item') + '</button>',
      onSubmit: function () {
        var d = readForm();
        if (!d.title) { toast('An agenda item needs a title.', 'bad'); return; }
        if (item) {
          item.title = d.title; item.presenterId = d.presenterId; item.notes = d.notes;
          toast('Agenda item updated.', 'ok');
        } else {
          meeting.agenda.push({ id: uid('a'), title: d.title, presenterId: d.presenterId, notes: d.notes });
          toast('Agenda item added.', 'ok');
        }
        save(); closeModal(); render();
      }
    });
  }

  function minutesForm(meeting) {
    openModal({
      title: 'Minutes — ' + meeting.title,
      wide: true,
      body: fieldArea('Minutes of the meeting', 'minutes', meeting.minutes, {
        rows: 14,
        placeholder: 'Write what was discussed, who said what, and what was finally decided…'
      }) + '<p class="form-note">Your line breaks are kept. Decisions are saved separately so they can be tracked until they are done.</p>',
      footer: '<button class="btn btn-ghost" data-modal="cancel">Cancel</button>' +
              '<button class="btn btn-primary" data-modal="submit">Save minutes</button>',
      onSubmit: function () {
        var d = readForm();
        meeting.minutes = d.minutes;
        if (meeting.status === 'scheduled' && d.minutes.trim()) meeting.status = 'completed';
        save(); closeModal(); render();
        toast('Minutes saved.', 'ok');
      }
    });
  }

  function decisionForm(meeting, existing) {
    var agendaOpts = [{ value: '', label: '— Not linked to an agenda item —' }].concat(
      meeting.agenda.map(function (a) { return { value: a.id, label: a.title }; })
    );

    openModal({
      title: existing ? 'Edit decision' : 'Record a decision',
      wide: true,
      body:
        fieldText('Decision', 'title', existing ? existing.title : '', { placeholder: 'What was decided?' }) +
        fieldArea('Detail / reason', 'detail', existing ? existing.detail : '', { rows: 3, placeholder: 'Why it was decided, any conditions, budget limits…' }) +
        '<div class="form-row">' +
          fieldSelect('Outcome', 'outcome', existing ? existing.outcome : 'approved', [
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'deferred', label: 'Deferred (decide later)' }
          ]) +
          fieldSelect('Agenda item', 'agendaId', existing ? existing.agendaId : '', agendaOpts) +
        '</div>' +
        '<div class="form-row" style="grid-template-columns:1fr 1fr 1fr">' +
          fieldText('Votes for', 'votesFor', existing ? existing.votesFor : 0, { type: 'number', min: 0 }) +
          fieldText('Against', 'votesAgainst', existing ? existing.votesAgainst : 0, { type: 'number', min: 0 }) +
          fieldText('Did not vote', 'votesAbstain', existing ? existing.votesAbstain : 0, { type: 'number', min: 0 }) +
        '</div>',
      footer: '<button class="btn btn-ghost" data-modal="cancel">Cancel</button>' +
              '<button class="btn btn-primary" data-modal="submit">' + (existing ? 'Save changes' : 'Record decision') + '</button>',
      onSubmit: function () {
        var d = readForm();
        if (!d.title) { toast('Write down the decision before saving.', 'bad'); return; }
        var payload = {
          title: d.title, detail: d.detail, outcome: d.outcome, agendaId: d.agendaId || null,
          votesFor: +d.votesFor || 0, votesAgainst: +d.votesAgainst || 0, votesAbstain: +d.votesAbstain || 0
        };
        if (existing) {
          Object.keys(payload).forEach(function (k) { existing[k] = payload[k]; });
          toast('Decision updated.', 'ok');
        } else {
          payload.id = uid('d');
          payload.meetingId = meeting.id;
          payload.createdAt = meeting.date;
          DB.decisions.push(payload);
          toast('Decision recorded. Now assign an action so it actually gets done.', 'ok');
        }
        save(); closeModal(); render();
      }
    });
  }

  function actionForm(decision, existing) {
    openModal({
      title: existing ? 'Edit action item' : 'Assign an action',
      body:
        fieldText('Action', 'title', existing ? existing.title : '', { placeholder: 'What has to be done?' }) +
        fieldArea('Detail', 'detail', existing ? existing.detail : '', { rows: 3, placeholder: 'Anything specific, any limits or conditions' }) +
        '<div class="form-row">' +
          fieldSelect('Given to', 'assigneeId', existing ? existing.assigneeId : session.userId, userOptions()) +
          fieldText('Deadline', 'deadline', existing ? existing.deadline : dayOffset(14), { type: 'date' }) +
        '</div>' +
        fieldSelect('Status', 'status', existing ? existing.status : 'pending', [
          { value: 'pending', label: 'Pending' },
          { value: 'in-progress', label: 'In progress' },
          { value: 'completed', label: 'Completed' }
        ]) +
        (decision ? '<p class="form-note">This comes from the decision: <strong>' + esc(decision.title) + '</strong></p>' : ''),
      footer: '<button class="btn btn-ghost" data-modal="cancel">Cancel</button>' +
              (existing ? '<button class="btn btn-danger" data-modal="delete">Delete</button>' : '') +
              '<button class="btn btn-primary" data-modal="submit">' + (existing ? 'Save changes' : 'Assign action') + '</button>',
      onDelete: existing ? function () { deleteAction(existing.id); } : null,
      onSubmit: function () {
        var d = readForm();
        if (!d.title)    { toast('Write down the action before saving.', 'bad'); return; }
        if (!d.deadline) { toast('Set a deadline so it can be tracked.', 'bad'); return; }

        if (existing) {
          existing.title = d.title; existing.detail = d.detail; existing.deadline = d.deadline;
          existing.assigneeId = d.assigneeId;
          existing.status = d.status;
          existing.completedAt = d.status === 'completed' ? todayStr() : null;
          toast('Action updated.', 'ok');
        } else {
          DB.actions.push({
            id: uid('t'), decisionId: decision.id, meetingId: decision.meetingId,
            title: d.title, detail: d.detail, assigneeId: d.assigneeId,
            deadline: d.deadline, status: d.status,
            completedAt: d.status === 'completed' ? todayStr() : null,
            createdAt: todayStr()
          });
          toast('Action given to ' + userName(d.assigneeId) + '.', 'ok');
        }
        save(); closeModal(); render();
      }
    });
  }

  /* ---- My account: edit your own details, plus backup buttons ---- */

  function profileForm() {
    var u = me();
    openModal({
      title: 'My account',
      wide: true,
      body:
        '<div class="row" style="gap:12px">' +
          '<div class="avatar lg">' + esc(initials(u.name)) + '</div>' +
          '<div><strong>' + esc(u.name) + '</strong><div class="tiny dim">' + esc(u.email) + '</div></div>' +
        '</div>' +
        '<div class="form-row">' +
          fieldText('Full name', 'name', u.name) +
          fieldText('Position', 'title', u.title, { placeholder: 'e.g. Block D Rep', required: false }) +
        '</div>' +
        '<div class="form-row">' +
          fieldText('Email', 'email', u.email, { type: 'email' }) +
          fieldText('Phone', 'phone', u.phone, { required: false }) +
        '</div>' +
        '<div class="form-row">' +
          fieldText('Flat / Block', 'block', u.block, { required: false }) +
          fieldText('Password', 'password', u.password) +
        '</div>' +
        '<hr style="border:none;border-top:1px solid var(--border)" />' +
        '<div class="section-title">Backup and reset</div>' +
        '<p class="small muted">Everything is saved only inside this browser. Export a copy before you clear your browser data, ' +
        'or import a file to move everything to another computer.</p>' +
        '<div class="row">' +
          '<button type="button" class="btn btn-outline btn-sm" id="btnExport">⬇ Export a backup</button>' +
          '<button type="button" class="btn btn-outline btn-sm" id="btnImport">⬆ Import a backup</button>' +
          '<button type="button" class="btn btn-danger btn-sm" id="btnReset">↺ Reset to demo data</button>' +
        '</div>' +
        '<p class="tiny dim">' + DB.users.length + ' members · ' + DB.meetings.length + ' meetings · ' +
          DB.decisions.length + ' decisions · ' + DB.actions.length + ' actions</p>',

      footer: '<button class="btn btn-ghost" data-modal="cancel">Close</button>' +
              '<button class="btn btn-primary" data-modal="submit">Save changes</button>',

      afterOpen: function () {
        var box = $('#modalBody');
        var ex = box.querySelector('#btnExport');
        var im = box.querySelector('#btnImport');
        var rs = box.querySelector('#btnReset');
        if (ex) ex.addEventListener('click', exportData);
        if (im) im.addEventListener('click', importData);
        if (rs) rs.addEventListener('click', function () {
          confirmModal('Reset to demo data',
            'Everything you have entered will be erased and replaced with the original demo data. This cannot be undone.',
            'Reset everything', function () {
              resetDemoData();
              doLogout();
              toast('Demo data restored. Please sign in again.', 'warn');
            }, true);
        });
      },

      onSubmit: function () {
        var d = readForm();
        if (!d.name || !d.email || !d.password) { toast('Name, email and password are needed.', 'bad'); return; }
        var clash = DB.users.filter(function (x) {
          return x.email.toLowerCase() === d.email.toLowerCase() && x.id !== u.id;
        });
        if (clash.length) { toast('Somebody else already uses that email.', 'bad'); return; }
        u.name = d.name; u.email = d.email; u.password = d.password;
        u.title = d.title || 'Member'; u.phone = d.phone || '—'; u.block = d.block || '—';
        save(); closeModal(); render();
        toast('Your details were saved.', 'ok');
      }
    });
  }

  /* =======================================================================
     8. FUNCTIONS THAT CHANGE DATA
     ======================================================================= */

  function setActionStatus(action, status, silent) {
    action.status = status;
    action.completedAt = status === 'completed' ? todayStr() : null;
    if (!silent) {
      save(); render();
      toast('Marked as ' + STATUS_META[status].label.toLowerCase() + '.', status === 'completed' ? 'ok' : '');
    }
  }

  function deleteAction(id) {
    DB.actions = DB.actions.filter(function (a) { return a.id !== id; });
    save(); closeModal(); render();
    toast('Action deleted.', 'warn');
  }

  // Deleting a meeting also deletes its decisions and their actions,
  // so we never leave records pointing at something that is gone.
  function deleteMeeting(id) {
    DB.meetings  = DB.meetings.filter(function (m) { return m.id !== id; });
    DB.decisions = DB.decisions.filter(function (d) { return d.meetingId !== id; });
    DB.actions   = DB.actions.filter(function (a) { return a.meetingId !== id; });
    save();
    go('meetings');
    toast('The meeting and everything inside it was deleted.', 'warn');
  }

  function exportData() {
    var blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url;
    a.download = 'civictrack-backup-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Backup downloaded.', 'ok');
  }

  function importData() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(String(reader.result));
          if (!parsed || !parsed.users || !parsed.meetings) throw new Error('bad file');
          DB = parsed;
          if (!DB.dismissed) DB.dismissed = [];
          save();
          if (!userById(session.userId)) { doLogout(); toast('Data imported. Please sign in again.', 'ok'); return; }
          closeModal(); render();
          toast('Data imported successfully.', 'ok');
        } catch (e) {
          toast('That file is not a valid CivicTrack backup.', 'bad');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  /* =======================================================================
     9. SIGN IN / SIGN UP / SIGN OUT
     ======================================================================= */

  function showAuthError(id, message) {
    var el = $(id);
    el.textContent = message;
    el.hidden = false;
  }

  function doLogin(email, password) {
    var user = DB.users.filter(function (u) {
      return u.email.toLowerCase() === String(email).toLowerCase().trim() && u.password === password;
    })[0];

    if (!user) {
      showAuthError('#loginError', 'No account matches that email and password. Please check and try again.');
      return;
    }
    session = { userId: user.id };
    try { localStorage.setItem(LS_SESSION, JSON.stringify(session)); } catch (e) {}
    $('#loginError').hidden = true;
    $('#signinForm').reset();
    showApp();
    toast('Welcome back, ' + user.name.split(' ')[0] + '.', 'ok');
  }

  function doSignup(d) {
    if (!d.name)                       { showAuthError('#signupError', 'Please enter your full name.'); return; }
    if (!d.email)                      { showAuthError('#signupError', 'Please enter an email address.'); return; }
    if (d.password.length < 6)         { showAuthError('#signupError', 'Your password must be at least 6 characters long.'); return; }
    if (d.password !== d.confirm)      { showAuthError('#signupError', 'The two passwords do not match.'); return; }

    var taken = DB.users.filter(function (u) { return u.email.toLowerCase() === d.email.toLowerCase(); });
    if (taken.length) { showAuthError('#signupError', 'An account with that email already exists. Try signing in instead.'); return; }

    var user = {
      id: uid('u'),
      name: d.name,
      email: d.email,
      password: d.password,
      title: d.title || 'Member',
      block: d.block || '—',
      phone: '—'
    };
    DB.users.push(user);

    // A new member is automatically invited to every meeting that has not
    // happened yet, so their dashboard is useful from the very first minute.
    DB.meetings.forEach(function (m) {
      if (m.archived || m.status !== 'scheduled') return;
      if (m.participants.indexOf(user.id) === -1) {
        m.participants.push(user.id);
        m.attendance[user.id] = 'invited';
      }
    });

    save();
    session = { userId: user.id };
    try { localStorage.setItem(LS_SESSION, JSON.stringify(session)); } catch (e) {}
    $('#signupError').hidden = true;
    $('#signupForm').reset();
    showApp();
    toast('Account created. Welcome, ' + user.name.split(' ')[0] + '!', 'ok');
  }

  function doLogout() {
    session = null;
    try { localStorage.removeItem(LS_SESSION); } catch (e) {}
    closeModal();
    $('#app').hidden = true;
    $('#loginScreen').hidden = false;
    switchAuth('signin');
  }

  function showApp() {
    $('#loginScreen').hidden = true;
    $('#app').hidden = false;
    go('dashboard');
  }

  // Switches the welcome screen between the two forms.
  function switchAuth(which) {
    $('#signinForm').hidden = which !== 'signin';
    $('#signupForm').hidden = which !== 'signup';
    $('#loginError').hidden = true;
    $('#signupError').hidden = true;
    $$('.auth-tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-auth') === which);
    });
  }

  /* =======================================================================
     10. THEME AND THE MOBILE MENU
     ======================================================================= */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    $('#themeBtn').textContent = theme === 'dark' ? '☀' : '🌙';
    try { localStorage.setItem(LS_THEME, theme); } catch (e) {}
  }

  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  }

  function openSidebar()  { $('#sidebar').classList.add('open');    $('#sidebarBackdrop').classList.add('show'); }
  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarBackdrop').classList.remove('show'); }

  /* =======================================================================
     11. CONNECTING THE BUTTONS
     ======================================================================= */

  function wire() {

    /* ---------- welcome screen ---------- */
    $('#signinForm').addEventListener('submit', function (e) {
      e.preventDefault();
      doLogin($('#loginEmail').value, $('#loginPassword').value);
    });

    $('#signupForm').addEventListener('submit', function (e) {
      e.preventDefault();
      doSignup({
        name:     $('#suName').value.trim(),
        email:    $('#suEmail').value.trim(),
        title:    $('#suTitle').value.trim(),
        block:    $('#suBlock').value.trim(),
        password: $('#suPassword').value,
        confirm:  $('#suConfirm').value
      });
    });

    // The two tabs, and the "Create an account" / "Sign in instead" links.
    $('#loginScreen').addEventListener('click', function (e) {
      var el = e.target.closest('[data-auth]');
      if (!el) return;
      e.preventDefault();
      switchAuth(el.getAttribute('data-auth'));
    });

    /* ---------- the app frame ---------- */
    $('#logoutBtn').addEventListener('click', doLogout);
    $('#profileBtn').addEventListener('click', profileForm);
    $('#themeBtn').addEventListener('click', toggleTheme);
    $('#bellBtn').addEventListener('click', function () { go('reminders'); });
    $('#menuBtn').addEventListener('click', openSidebar);
    $('#sidebarClose').addEventListener('click', closeSidebar);
    $('#sidebarBackdrop').addEventListener('click', closeSidebar);

    $('#nav').addEventListener('click', function (e) {
      var btn = e.target.closest('.nav-item');
      if (btn) go(btn.getAttribute('data-view'));
    });

    /* ---------- the pop-up box ---------- */
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalBackdrop').addEventListener('click', function (e) {
      if (e.target === $('#modalBackdrop')) closeModal();
    });
    $('#modalFoot').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-modal]');
      if (!btn) return;
      var kind = btn.getAttribute('data-modal');
      if (kind === 'cancel') closeModal();
      if (kind === 'submit' && modalSubmit) modalSubmit();
      if (kind === 'delete' && modalDelete) modalDelete();
    });
    $('#modalBody').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && modalSubmit) {
        e.preventDefault();
        modalSubmit();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('#modalBackdrop').hidden) closeModal();
        else closeSidebar();
      }
    });

    /* ---------- clicks inside the page ---------- */
    $('#content').addEventListener('click', onContentClick);

    /* ---------- typing in a search box ---------- */
    // Redrawing replaces the box, so we put the cursor back where it was.
    $('#content').addEventListener('input', function (e) {
      if (e.target.tagName !== 'INPUT') return;
      var key = e.target.getAttribute('data-filter');
      if (!key) return;
      state.filters[key] = e.target.value;
      var id = e.target.id;
      var pos = e.target.selectionStart;
      render();
      var again = document.getElementById(id);
      if (again) {
        again.focus();
        try { again.setSelectionRange(pos, pos); } catch (err) { /* ignore */ }
      }
    });

    /* ---------- changing a dropdown inside the page ---------- */
    $('#content').addEventListener('change', function (e) {
      var el = e.target;

      var key = el.getAttribute('data-filter');
      if (key) { state.filters[key] = el.value; render(); return; }

      var act = el.getAttribute('data-act');
      if (act === 'set-att') {
        var m = meetingById(el.getAttribute('data-id'));
        if (m) { m.attendance[el.getAttribute('data-sub')] = el.value; save(); render(); }
        return;
      }
      if (act === 'set-action-status') {
        var a = actionById(el.getAttribute('data-id'));
        if (a) setActionStatus(a, el.value);
      }
    });
  }

  /* One function handles every button inside the page area. Each button
     carries a data-act="…" label and we simply look at that label.      */
  function onContentClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.tagName === 'SELECT') return;

    var act = el.getAttribute('data-act');
    var id  = el.getAttribute('data-id');
    var sub = el.getAttribute('data-sub');
    e.preventDefault();

    switch (act) {

      case 'nav':
        go(el.getAttribute('data-view'));
        break;

      case 'open-meeting':
        go('meeting', { id: id });
        break;

      case 'tab':
        state.detailTab = el.getAttribute('data-tab');
        render();
        break;

      /* ---------- meetings ---------- */
      case 'new-meeting':
        meetingForm(null);
        break;

      case 'edit-meeting':
        meetingForm(meetingById(id));
        break;

      case 'complete-meeting': {
        var mc = meetingById(id);
        confirmModal('Mark the meeting as held',
          'This marks "<strong>' + esc(mc.title) + '</strong>" as completed, so you can write the minutes and record decisions.',
          'Mark as held', function () {
            mc.status = 'completed'; save(); render();
            toast('Meeting marked as held.', 'ok');
          });
        break;
      }

      case 'cancel-meeting': {
        var mx = meetingById(id);
        confirmModal('Cancel this meeting',
          'Everyone will see "<strong>' + esc(mx.title) + '</strong>" as cancelled. The agenda is kept.',
          'Cancel meeting', function () {
            mx.status = 'cancelled'; save(); render();
            toast('Meeting cancelled.', 'warn');
          }, true);
        break;
      }

      case 'archive-meeting': {
        var ma = meetingById(id);
        confirmModal('Move to the archive',
          'Archived meetings can still be read and searched, but they cannot be edited any more.',
          'Archive it', function () {
            ma.archived = true; save(); go('archive');
            toast('Meeting archived.', 'ok');
          });
        break;
      }

      case 'unarchive-meeting': {
        var mu = meetingById(id);
        mu.archived = false; save(); render();
        toast('Meeting restored from the archive.', 'ok');
        break;
      }

      case 'delete-meeting': {
        var md = meetingById(id);
        var nD = decisionsOfMeeting(id).length, nA = actionsOfMeeting(id).length;
        confirmModal('Delete this meeting',
          'This permanently deletes "<strong>' + esc(md.title) + '</strong>" along with ' +
          pluralise(nD, 'decision') + ' and ' + pluralise(nA, 'action item') + '. This cannot be undone.',
          'Delete permanently', function () { deleteMeeting(id); }, true);
        break;
      }

      /* ---------- agenda ---------- */
      case 'add-agenda':
        agendaForm(meetingById(id), null);
        break;

      case 'edit-agenda': {
        var mg = meetingById(id);
        agendaForm(mg, mg.agenda.filter(function (a) { return a.id === sub; })[0]);
        break;
      }

      case 'del-agenda': {
        var mdg = meetingById(id);
        confirmModal('Remove agenda item', 'This item will be removed from the agenda.', 'Remove', function () {
          mdg.agenda = mdg.agenda.filter(function (a) { return a.id !== sub; });
          save(); render();
          toast('Agenda item removed.', 'warn');
        }, true);
        break;
      }

      /* ---------- attendance ---------- */
      case 'all-present': {
        var mp = meetingById(id);
        mp.participants.forEach(function (u) { mp.attendance[u] = 'present'; });
        save(); render();
        toast('Everyone invited was marked present.', 'ok');
        break;
      }

      /* ---------- minutes ---------- */
      case 'edit-minutes':
        minutesForm(meetingById(id));
        break;

      /* ---------- decisions ---------- */
      case 'new-decision':
        decisionForm(meetingById(id), null);
        break;

      case 'edit-decision': {
        var de = decisionById(id);
        decisionForm(meetingById(de.meetingId), de);
        break;
      }

      case 'del-decision': {
        var dd = decisionById(id);
        var nAct = actionsOfDecision(id).length;
        confirmModal('Delete this decision',
          'This deletes "<strong>' + esc(dd.title) + '</strong>"' +
          (nAct ? ' and the ' + pluralise(nAct, 'action item') + ' under it' : '') + '.',
          'Delete', function () {
            DB.decisions = DB.decisions.filter(function (x) { return x.id !== id; });
            DB.actions   = DB.actions.filter(function (x) { return x.decisionId !== id; });
            save(); render();
            toast('Decision deleted.', 'warn');
          }, true);
        break;
      }

      /* ---------- action items ---------- */
      case 'new-action':
        actionForm(decisionById(id), null);
        break;

      case 'edit-action': {
        var ae = actionById(id);
        actionForm(decisionById(ae.decisionId), ae);
        break;
      }

      case 'del-action': {
        var ad = actionById(id);
        confirmModal('Delete action item', 'This removes "<strong>' + esc(ad.title) + '</strong>" from the tracker.',
          'Delete', function () { deleteAction(id); }, true);
        break;
      }

      /* ---------- reminders ---------- */
      case 'dismiss-reminder':
        DB.dismissed.push(el.getAttribute('data-key'));
        save(); render();
        break;

      case 'dismiss-all':
        buildReminders().forEach(function (r) { DB.dismissed.push(r.key); });
        save(); render();
        toast('All reminders dismissed.', 'warn');
        break;

      case 'restore-reminders':
        DB.dismissed = [];
        save(); render();
        toast('Dismissed reminders are back.', 'ok');
        break;

      case 'rem-go': {
        var key = el.getAttribute('data-key');
        var r = buildReminders().filter(function (x) { return x.key === key; })[0];
        if (r && r.go) go(r.go.view, r.go.id ? { id: r.go.id } : {});
        break;
      }
    }
  }

  /* =======================================================================
     12. START-UP — this runs first when the page opens
     ======================================================================= */

  function boot() {
    DB = load();                       // try to read saved data
    if (!DB) { DB = buildSeed(); save(); }   // first visit → demo data
    if (!DB.dismissed) DB.dismissed = [];

    var theme = 'light';
    try { theme = localStorage.getItem(LS_THEME) || 'light'; } catch (e) {}
    applyTheme(theme);

    wire();                            // connect all the buttons

    // Were we already signed in last time? Then skip the welcome screen.
    try {
      var raw = localStorage.getItem(LS_SESSION);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.userId && userById(s.userId)) { session = s; showApp(); return; }
      }
    } catch (e) {}

    switchAuth('signin');
    $('#loginScreen').hidden = false;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
