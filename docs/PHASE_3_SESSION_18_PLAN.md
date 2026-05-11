# Phase 3 — Session 18 Plan

**Date:** 2026-05-11
**Parent:** [PHASE_3_SESSION_17.md](PHASE_3_SESSION_17.md)
**Risk profile:** HIGH — portal is live with real client families. No data loss, no broken submissions, legacy submissions stay viewable.

---

## Goal

Ship Aidan's full student-portal UX rework + tutor-side QoL + data integrity fixes. Scope is too large for one session, so split into **18A / 18B / 18C** with explicit ship gates between them.

## Overarching guardrails (apply to all three sub-sessions)

1. **Legacy submissions stay intact.** Existing whole-PSM submission docs remain in Firestore and viewable read-only. No migration of historical data.
2. **No `questionKeys/{id}` deletions or rewrites.** Session 16 already settled this collection.
3. **No `functions/grade.js`, `wise.js`, or `onSubmissionSubmit` callable contract changes** unless explicitly required by a workstream below — and only additive.
4. **Every Firestore schema addition is opt-in / nullable** — read code must default-handle missing fields so live data keeps rendering.
5. **`python3 build_index.py` before every hosting deploy.** Session 15 shipped a blank page from skipping this.
6. **All four sample WellEd report PDFs** (`Full Exam.pdf`, `Reading Only.pdf`, `Math only.pdf`, `Math Only 2.pdf`) sit in `tests/fixtures/welled_reports/` as parser regression fixtures.

---

## Session 18A — Data model + per-worksheet submit + grading correctness

**Why first:** The new submission model + even/odd + answer-type + flagging all touch the same code paths. Doing them together once is safer than three back-to-back patches.

### What ships

**A1. Per-worksheet submit (new submission model)**
- New Firestore subcollection: `students/{sid}/assignments/{aid}/worksheetSubmissions/{wsId}` with fields `{status: draft|submitted|graded, answers, perQuestion, score, submittedAt, gradedAt}`
- `SubmissionEditor` renders one worksheet at a time with its own submit button + state
- `onSubmissionSubmit` trigger fires on `worksheetSubmissions/{wsId}` writes (new path), grades only that worksheet
- Legacy whole-PSM `submissions/{sid}` collection still readable; new code reads from both and reconciles
- Done pill / score banner becomes per-worksheet
- PSM-level completion = derived (`all worksheets submitted && all graded`)

**A2. Continuous PSM editing (unsubmitted items only)**
- Tutor can add/remove worksheets from an active PSM **only if that worksheet has no `worksheetSubmissions` doc** (or its doc is still `draft`)
- Edit happens in portal only — does NOT re-post or update the Wise discussion (per Aidan answer #2)
- Audit log: `students/{sid}/assignments/{aid}/edits/{ts}` records what changed and by whom

**A3. Even/Odd as a render-time gate (not a separate worksheet)**
- Schema: `assignment.worksheets[i].subset ∈ {"all","even","odd"}` — defaults to `"all"` for legacy assignments
- Renderer reads the FULL question list, then disables/hides answer slots for non-matching question numbers
- Question count display: "12 of 24 (odds)" rather than "12 questions"
- Each subset assignment of the same worksheet is its own time-point in Score Tracking (a student can do odds week 1, evens week 2 — two separate scores)
- `buildPsmDescription` (Wise discussion text) shows "Q 1, 3, 5, ... (odd)" so student sees it on Wise too

**A4. Answer field types (per-question render mode)**
- Schema: each question in `questionKeys/{id}` already has answer type; surface to UI as one of `mc | fr | grid`
- `WorksheetBlock` renders:
  - MC → bubble grid (A/B/C/D)
  - FR → text input (numeric or short text)
  - Mixed worksheet → each question chooses its own renderer based on its key's type
- No schema migration required if `questionKeys` already carry the type. (Verify: spot-check a few before coding.)

**A5. Star / question-mark per-question flags**
- Schema: `worksheetSubmissions.perQuestion[i].flag ∈ {null,"star","question"}`
- UI: small star/? toggles next to each question
- Grading semantics:
  - `star` → no effect, purely informational, visible to tutor on review
  - `question` → counts as blank, scores 0 (per Aidan answer #4)
- Tutor review: flagged questions get a left-rail icon + filter "show only flagged"

**A6. Catalog gap audit + key extraction**
Run before any 18A deploy so the new per-worksheet flow isn't broken for these:
- 8 missing SAT Old Writing PTs → port entries from `embed.js` to `worksheets_catalog.json`, then run `scripts/extract_answer_keys.mjs --commit` on their KEY PDFs
- 4 Poetry Practices, Literary Worksheets, IC/DC, CompAlgebra Easy, Probability Hard, G&T N.A. → audit whether they have KEY PDFs at all; if so, extract; if not, flag for content team
- "Circles Comprehensive" → verify `questionKeys/{24cec8d1, 9e44284b, 9acd101f, a0cacec1, f1c1e971}` exist in Firestore; if not, extract; if they do, debug why it's marked inactive in the UI

### Migration steps (in order, behind feature flag `PER_WORKSHEET_SUBMIT_ENABLED`)

1. Ship schema additions + read-path defaults (no behavior change)
2. Backfill: for every `assignment.worksheets[i]` without `subset`, set `subset="all"`
3. Wire new `worksheetSubmissions` write path behind flag
4. Verify legacy submissions still render for at least 3 real students (Michael, ...)
5. Flip flag for one test student (Consultation Student from 18C, or a no-real-data tutor account)
6. Flip flag globally
7. Add 30-day legacy read shim

### Tests
- `tests/portal.test.mjs` adds:
  - per-worksheet draft → submit → graded transition
  - even/odd masking renders correct answer slots
  - star flag preserved through grade
  - question flag counts as 0 + emits indicator
  - PSM edit: removing unsubmitted worksheet succeeds; removing submitted worksheet rejected
- `functions/grade.test.js` adds:
  - even/odd subset grading: scores only the subset, not the whole worksheet
  - `flag="question"` produces 0 score, `flag="star"` preserves score
- Smoke test: assign + submit + grade for Consultation Student on each renderer type (MC, FR, Mixed)

### Pause points
- Before any production Firestore writes (catalog backfill, subset backfill, extraction commit)
- Before flipping `PER_WORKSHEET_SUBMIT_ENABLED` for any real student
- Before any hosting deploy → confirm `build_index.py` ran

---

## Session 18B — Tutor UX + new student data entry

**Why second:** Builds on 18A's per-worksheet model. Adds tutor and student surfaces but no new grading logic.

### What ships

**B1. Tutor viewing page scroll fix**
- Center panel (worksheet preview area) currently truncates worksheets at the bottom
- Switch to per-panel scrolling (header sticky, body overflow-y) so each worksheet renders at native size and is fully scrollable

**B2. Student dashboard (landing view)**
- New `/portal` landing for students (not deep-linked)
- Card per PSM: assigned date, due/expected date, per-worksheet status pills, overall score-so-far
- Sort: most recent first, in-progress before completed
- Deep links still work and open the editor directly

**B3. Instruction parity (portal ↔ Wise)**
- Pull the same `buildPsmDescription` output into the portal as the PSM header
- Single source of truth in `functions/index.js` exported helper; portal calls it via a callable (`getPsmDescription`) at render time

**B4. External-item completion + WellEd Domain practice score entry**
- "External items" tab/section on each PSM card lists assigned WellEd Domain practices, BlueBook practice exams, WellEd practice tests
- Each row has a "Mark complete" button
- **WellEd Domain practice rows ONLY:** marking complete opens a score-entry modal (Reading=/27, Math=/22 — universal per Aidan answer #5). Score writes a new time-point to Score Tracking under the assigned domain (e.g. "Geometry & Trig - Hard"), no subskill breakdown
- BlueBook + WellEd practice exam rows: just a "mark complete" toggle. Their score comes via the report-parser path in 18C

**B5. Practice exam section selection: R&W vs Math + Full**
- When tutor assigns a practice exam (BlueBook or WellEd), they must pick exactly one of: `full` | `rw` | `math`
- Existing assignments default to `full`
- The Wise discussion line shows the picked section: "BlueBook Practice Test 3 — Reading & Writing section"
- Each section can be assigned independently — student dashboard shows them as separate rows

**B6. Login as Student (impersonation)**
- Tutor/admin-only button on student profile: "View as student"
- Loads student portal in read-only mode using the tutor's auth claims with an `impersonatingStudentId` cookie/session marker
- Banner across the top: "Viewing as {Name} — read-only"
- Firestore security rules: read-allowed for tutor role with impersonation marker; no writes allowed
- Consultation Student (from 18C) is always available as a target — works for tutors who don't yet have a real student

### Tests
- Dashboard renders for student with 3+ PSMs in different states (draft / submitted / graded / mixed)
- External item mark-complete writes the right Firestore field
- WellEd domain score entry writes correct Score Tracking time-point with right `/27` or `/22` denominator + domain mapping
- Practice exam section selection round-trips through Wise discussion + portal display
- Impersonation: tutor can view, cannot write; non-tutor cannot impersonate

### Pause points
- Before adding `getPsmDescription` callable to portal hot path — review caching/perf
- Before shipping impersonation — review Firestore rules with Kiran (auth-rule change is high-risk)

---

## Session 18C — Onboarding, demo data, parser

**Why last:** Independent of 18A/18B, but uses Score Tracking schema additions from 18B.

### What ships

**C1. Auto-allowlist SAT students from Wise**
- Modify `reconcileStudentsWithWise` callable:
  - Match Wise class title with substring `"SAT"` (case-insensitive per Aidan answer #9)
  - Only such classes' students are imported
  - **For each new SAT-class student:** add their Wise email to `allowlist/{email}` Firestore doc with `{role:"student", source:"wise-reconcile", classId, addedAt}` — gives them magic-link auth access
  - **For students who leave their SAT class OR whose class no longer has "SAT" in title:** soft-delete to `trash/students/{id}` (preserves data), revoke allowlist entry (blocks future auth)
- One-time migration: scan existing `students` collection, move non-SAT entries to `trash/students/{id}`. **Show Kiran the trash diff before committing.**
- Toast on tutor side: "Auto-added 3 students from Wise SAT classes ✓" per Aidan answer #10

**C2. Consultation Student demo profile**
- Hardcoded synthetic student `students/__consultation__` (special ID, excluded from Wise reconcile, real-student aggregates)
- Available to ALL tutors/admins (per Aidan answer #11)
- Synthetic data:
  - ≥ 3 time points per subskill (each domain has ~3-5 subskills, so ~50+ data points)
  - 4–5 time points per domain (aggregate)
  - 3 practice exams — at least one labeled DIAGNOSTIC, others spaced over time
  - A mix of submitted, graded, in-progress worksheets
  - WellEd Domain practice score entries (per 18B B4)
- Seed via `scripts/seed_consultation_student.mjs` — idempotent, safe to re-run
- Bonus: doubles as the impersonation target for "Login as Student"

**C3. WellEd score report parser (port from psm-generator + extend)**
- Port `parseWelledReport` from psm-generator's `app.jsx` into the portal codebase
- **New: variable per-domain question counts.** Parser reads the per-test domain count from the report header rather than assuming fixed denominators (different tests, different counts)
- Handles three formats: Full Exam, Reading Only, Math Only (regression fixtures from your 4 sample PDFs)
- Lives under: Student Profile → Score Tracking tab → "Upload WellEd Report" button
- Parsed output writes:
  - Per-domain time-points with the report's `tested-on` date
  - Per-subskill time-points if available in report
  - Total / R&W / Math scaled scores
- **Not** for WellEd Domain practices — those are manual entry per 18B B4

### Tests
- `tests/welled_parser.test.mjs` new file:
  - Each of the 4 fixture PDFs parses without error
  - Domain counts match what's in the report header
  - Tested-on date extraction
  - Diagnostic vs practice test detection (if any flag distinguishes them)
- `tests/wise_reconcile.test.mjs`:
  - SAT class match (case-insensitive)
  - Non-SAT class student not imported
  - Student class change → trash + allowlist revoke
- Consultation Student renders without error; numbers/counts visible

### Pause points
- Before running migration that moves non-SAT students to trash — show diff
- Before committing allowlist additions — confirm the format with Kiran (current allowlist schema unknown to me)

---

## Cross-cutting items to triage early

- **Live data inventory:** before 18A coding, snapshot current Firestore (export to GCS bucket) — gives us a rollback path
- **Feature-flag taxonomy:** new flags `PER_WORKSHEET_SUBMIT_ENABLED`, `IMPERSONATION_ENABLED`, `AUTO_ALLOWLIST_ENABLED`. All default false, flip per environment
- **Auth-rule review:** B6 (impersonation) + C1 (allowlist auto-add) both touch security rules. Pair-review with Kiran before deploy
- **Catalog cleanup commit hygiene:** the 19 unkeyed entries deserve a separate "catalog audit" commit independent of 18A so the diff is reviewable

---

## Decisions confirmed (2026-05-11)

1. **Wise is assign-time only.** No post-back, no status comments, no reactions when worksheets are submitted. The discussion is created on PSM assign and is never touched again by the portal.
2. **"View as student" uses the tutor's own Firebase Auth session** with an `impersonatingStudentId` marker. Simpler path. Security rules enforce read-only when the marker is present + tutor role.
3. **Consultation Student is excluded from all aggregates** (Heat Map rollups, tutor dashboards, score summaries). It exists only as a profile available in the student list, viewable like any real student. Its data never flows into cross-student stats.
4. **PSM edit window is unlimited as long as items are unsubmitted.** Tutor can add/remove worksheets indefinitely; the constraint is per-worksheet (not time-based).

---

## Checkpoint structure (each sub-session closes with one)

Each of 18A, 18B, 18C produces its own `PHASE_3_SESSION_18{A,B,C}.md` doc on close, mirroring the format of Session 17's closeout (what shipped / deploys / surprises / testing / follow-ups / kickoff for next).

## Next-session preview (Session 19)
- In-portal diagnostic standardized tests (carried from Session 17)
- Anything de-scoped from 18A/B/C that didn't ship cleanly
