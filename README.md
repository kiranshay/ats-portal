# PSM Generator

A single-page web app for **Affordable Tutoring Solutions** that generates Personal Study Material (PSM) worksheet assignments for SAT tutoring students, tracks practice exam scores, and visualizes domain coverage per student.

Live: https://psm-generator.web.app

## What it does

Tutors pick a student, filter the worksheet catalog by subject / domain / subdomain / difficulty, and the app produces a formatted assignment block (ready to paste into the student's PSM) along with persistent tracking of everything that's been assigned and scored.

### Tabs

- **Generator** — build an assignment from the worksheet catalog. Supports Even/Odd question splitting, per-worksheet time limits (Time Drill mode), and printable OneNote mode. Optional blocks: WellEd Domain Assignments, Vocab (flashcards + quizzes), and Practice Exams (BlueBook / WellEd).
- **Students** — enrollment, per-student profiles, full assignment history, pre-assign panel for scheduling work ahead of a session, and per-student score entry.
- **Heat Map** — visual matrix of domain/subdomain coverage per student, so you can see at a glance where a student has and hasn't been worked.
- **Score Tracking** — WellEd and BlueBook practice exam scores with trend summaries. WellEd score reports can be imported directly from PDF; ZipGrade SAT diagnostic PDFs can be parsed to auto-fill tag-level scores.

## Architecture

No bundler, no npm. The app is built from three source files composed into a single static `index.html`:

```
shell_head (inline HTML)  +  embed.js  +  app.jsx  +  shell_tail
        │                       │             │
        │                       │             └── React app (UMD React 18 + in-browser Babel)
        │                       └── WS_RAW worksheet catalog (JS array literal)
        └── CDN scripts: React 18, Babel standalone, pdf.js, jsPDF, Firebase 10 compat
```

`build_index.py` is the build step — it concatenates the pieces and writes `index.html`. The resulting HTML is committed so Firebase Hosting can serve `.` directly.

### Data persistence

**Firestore is the source of truth.** `window.db` is initialized in the HTML shell and the app reads/writes the single doc configured by `FS_DOC`. `localStorage` is used as an offline cache and as the migration source the first time a new Firestore doc is seeded. See `app.jsx` around the `fsRef` / `pullFromCloud` / `pushToCloud` helpers.

The **⬇ Export** / **⬆ Import** buttons in the header produce/consume a JSON backup of the full app state, independent of Firestore.

## Working on it

### Edit → rebuild → preview

```bash
# 1. Edit app.jsx (and/or embed.js for worksheet catalog changes)
# 2. Rebuild index.html
python build_index.py

# 3. Serve locally
python -m http.server 5173
# open http://localhost:5173
```

Opening `index.html` directly via `file://` also works for most features, but Firestore will fall back to localStorage-only mode.

### Deploy

```bash
firebase deploy --only hosting
```

Firebase project is `psm-generator` (see `.firebaserc`). `firebase.json` serves the repo root and excludes the source files (`app.jsx`, `embed.js`, `build_index.py`, `*.md`, etc.) from the upload — only `index.html` and static assets ship.

## Files

| File | Purpose |
|---|---|
| `app.jsx` | React application source (edit this) |
| `embed.js` | `WS_RAW` — the worksheet catalog as a JS array literal |
| `build_index.py` | Composes `index.html` from shell + `embed.js` + `app.jsx` |
| `index.html` | Built artifact served by Firebase Hosting (committed) |
| `worksheets_catalog.json` | JSON view of the worksheet catalog |
| `firebase.json`, `.firebaserc` | Firebase Hosting config |

## Support

Aidan Meyers · ameyers@affordabletutoringsolutions.org · (321) 341-9820

Kiran Shay   · kshay@affordabletutoringsolutions.org  
