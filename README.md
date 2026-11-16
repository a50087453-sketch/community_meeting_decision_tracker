# CivicTrack — Community Meeting & Decision Tracker

A web app that records community meetings and tracks every decision through to completion.

Resident associations lose track of decisions, responsibilities and deadlines once a meeting
ends. Good minutes get written, everyone nods, and then nothing happens. CivicTrack fixes that
by forcing every decision to carry a **name** and a **date**, and by chasing it until the work
is actually done.

Built with **HTML, CSS and JavaScript only** — no frameworks, no build step, no server,
no database software.

---

## Running it

1. Download or clone this repository.
2. Open `index.html` in any browser (Chrome, Edge or Firefox).

That is all. It works fully offline. All data is stored in the browser's `localStorage`.

On first open you will not have an account — click **Create account** and make one.
The app ships with sample meetings, decisions and action items so it is never empty.

---

## Features

| Area | What it does |
|---|---|
| **Accounts** | Sign up and sign in. New members are automatically invited to every upcoming meeting. |
| **Meeting scheduling** | Title, type, venue, date, time and an invite list. |
| **Agenda** | Numbered discussion points, each with a presenter and background notes. |
| **Attendance** | Present / Absent / Excused / Awaiting, per invited member. |
| **Minutes** | Free-text record of the meeting. Writing minutes marks a scheduled meeting as held. |
| **Decisions** | Recorded against a meeting and optionally an agenda item, with outcome and vote tally. |
| **Assigned actions** | A real job, given to a real person, with a real deadline. |
| **Deadlines & status** | Pending / In progress / Completed, plus an automatically derived Overdue state. |
| **Reminders** | Generated live from five rules — never stored, so they can never go stale. |
| **Archive** | Completed meetings become read-only but stay fully searchable, including their minutes. |
| **Backup** | Export and import the whole register as a JSON file. |

### How it all connects

```
Meeting -> Agenda -> (meeting is held) -> Attendance + Minutes
                                              |
                                              v
                                          Decision  (Approved / Rejected / Deferred)
                                              |
                                              v
                                           Action   (person + deadline)
                                              |
                                              v
                                 Pending -> In progress -> Completed
```

Reminders watch the whole chain and flag anything late, missing or unassigned.

---

## Project structure

| File | Role |
|---|---|
| `index.html` | Structure — the welcome screen, the app shell and the pop-up box. |
| `style.css` | Appearance — design tokens, light and dark themes, responsive layout. |
| `app.js` | Behaviour — data, saving, routing, every page and every form. |

---

## Design notes

- **Separation of concerns.** Structure, appearance and behaviour live in three separate
  files, so one can change without breaking the others.
- **Derived state.** `Overdue` and the entire reminder list are never stored. They are
  recalculated from the deadline and today's date on every render, so the app cannot show
  out-of-date information even after months unopened.
- **Referential integrity.** Deleting a meeting also deletes its decisions and their actions,
  so no record is ever left pointing at something that no longer exists.
- **Relative sample data.** The demo dates are calculated from today, so there is always a
  meeting coming up and a job already overdue.
- **Responsive.** The sidebar collapses behind a menu button and tables become stacked cards
  on narrow screens.

## Known limitations

This is a learning project, and it is honest about what it is not:

- Passwords are stored as plain text in the browser. A real system would authenticate against
  a server and store hashed passwords.
- Data lives in one browser on one machine. Two people do not share a register — use
  **Export / Import** to move it.
- There is no password recovery.
