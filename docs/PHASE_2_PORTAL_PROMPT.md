# Phase 2: Student/Parent Portal — Session Kickoff Prompt

**Status:** Not started. Plan written 2026-04-13.
**Prerequisites:** Auth migration (`docs/AUTH_MIGRATION_PLAN.md`) MUST be complete before starting this. Phase 2 builds on the role-aware allowlist that auth migration introduces.
**Estimated scope:** Multiple sessions. Probably 4-6.

---

## How to use this document

This file is designed to be the **kickoff prompt for a new Claude Code session**. When you (Kiran) are ready to start Phase 2, open a fresh session in the psm-generator project and paste the entire **"Prompt for the new session"** block at the bottom of this file. The new Claude will read this doc, the existing CLAUDE.md context, and propose a session-by-session plan before writing code.

The body of this document is the *briefing material* the new Claude needs to reason about the work. It's written for them, not for you.

---

## Context: what the user is asking for

Affordable Tutoring Solutions (ATS) wants a **read-only portal where students and their parents can log in and see the student's tutoring progress.** Today, all data lives in a tutor-facing app where tutors generate worksheets, log scores, upload diagnostics, and track assignment history. None of that is currently visible to the people whose education it tracks.

This is **real demand**, not speculation — Kiran confirmed (2026-04-13) that the ask is concrete. Tutors and parents have been requesting visibility.

The portal should NOT be a separate app — it lives in the same psm-generator codebase, served from the same `psm-generator.web.app` host, but with role-gated UI. A student logging in sees their own data; a parent sees their child(ren)'s data; a tutor sees the existing full app.

## Context: what already exists in the codebase

Read these before designing anything:

1. **`README.md`** — high-level project overview.
2. **`docs/AUTH_MIGRATION_PLAN.md`** — the auth model Phase 2 sits on top of. Critical: the allowlist schema already includes `role: "student"|"parent"` and `studentId` fields. Those exist BECAUSE of Phase 2 — they were designed in to avoid a second migration.
3. **`firestore.rules`** — has scaffolded comments for Phase 2 student/parent branches. The auth migration plan adds the real rules on top of this scaffold.
4. **`app.jsx` lines 595-610** — Firestore data layer. Single document `psm-data/main` holds the entire app blob. **This is the schema problem Phase 2 has to solve** (see "The schema problem" section below).
5. **`app.jsx` lines 780-845** — how the app loads + persists data. The single onSnapshot listener is what Phase 2 needs to replace or complement.
6. **`app.jsx` `StudentProfile` component** — the existing tutor view of a student. Phase 2's student view is a *strict subset* of this (read-only, fewer tabs).

## The schema problem

This is the biggest design question in Phase 2 and deserves the most thought before touching code.

**Current state:** all student data is stored as one big blob at `psm-data/main` in Firestore. The schema (paraphrased from `app.jsx`):

```js
{
  students: [
    {
      id, name, grade, tutor, notes, dateAdded,
      assignments: [...],     // worksheets generated, dates, scores
      scores: [...],          // manual score entries
      diagnostics: [...],     // parsed PDF results
      welledLogs: [...],      // WellEd domain practice logs
      deleted: false,
    },
    ...
  ],
  customAssignments: [...]
}
```

A single `onSnapshot` on `psm-data/main` loads the whole blob into React state. Tutors see all students. Writes debounce-replace the whole blob.

**This schema is incompatible with student/parent access:**

- A student needs to read ONLY their own record, not the array of all students. Firestore rules cannot grant "read this index of an array but not the others" — array elements aren't independently securable. Rules can gate access to *documents*, not array slices.
- The blob is large; sending it all to a parent who only needs one child's data is wasteful and (more importantly) leaks PII for every other student.
- Writes from tutors must NOT race with reads from students/parents.

**Three options for solving this:**

### Option A — Restructure to per-student documents

Migrate to `students/{studentId}` as one Firestore doc per student. The main `psm-data/main` blob becomes legacy/empty or holds only `customAssignments` and the student-id index.

**Pros:**
- Clean rules: students/parents read only their own doc. Trivial security.
- No PII leakage by construction.
- Parallel writes don't conflict — each student is independent.
- Scales naturally.

**Cons:**
- **Big migration.** All existing tutor code that iterates `students` has to be rewritten. Probably 200+ touch points.
- The single snapshot listener becomes 51 listeners (one per student, for the tutor view) OR a collection-group query. Either is more complex.
- The "list of all students" tutor view requires a separate index doc or a collection query, which has read-cost implications.
- Risk: behavior regressions in the existing tutor app while migrating.

### Option B — Keep the blob, add a derived per-student "snapshot" document

Tutors continue using `psm-data/main` exactly as today. A Firestore Cloud Function (or client-side hook on tutor writes) maintains a parallel `student-views/{studentId}` collection containing the student-facing subset of the data: just the fields a student/parent should see, copied from the blob.

Students/parents read from `student-views/{studentId}`; tutors read from `psm-data/main`. Two paths, never collide.

**Pros:**
- Zero changes to existing tutor code. Lowest behavior-regression risk.
- Cleanest separation: the student-facing schema can omit notes, internal scoring, anything tutors flagged as "don't show students."
- Read-only by design from the student side — they literally can't write because the rules say so.

**Cons:**
- **Sync complexity.** Every tutor write has to fan out an update to the per-student snapshot. If the fan-out fails, the student view goes stale. Need to handle retry / inconsistency.
- Cloud Functions introduce a server-side dependency the project currently doesn't have. Adds Firebase pricing tier concerns and another service to monitor.
- Without Cloud Functions, doing the fan-out client-side means every tutor write does N extra Firestore writes (one per touched student), and a tutor going offline mid-write leaves staleness.

### Option C — Hybrid: per-student docs going forward, blob for legacy data

New writes go to `students/{studentId}`. The existing blob stays as a read-only fallback for any student that doesn't have a per-student doc yet. A migration script backfills per-student docs from the blob at deploy time. Once everything's migrated, retire the blob.

**Pros:**
- Incremental — can ship one student at a time, verify, continue.
- Endpoint state is the same as Option A.

**Cons:**
- During the migration window, code has to read from BOTH locations and merge. Annoying.
- Higher cognitive complexity for the duration of the migration.

### Recommendation (subject to debate with Kiran)

**Lean toward Option A** with a careful migration. The structural correctness is worth the one-time cost; Option B's fan-out reliability is a long-term tax that compounds.

But this is the kind of decision the new session should *brainstorm with Kiran* before committing. Don't just pick one and start coding. Use the `superpowers:brainstorming` skill if available.

## Feature scope (the actual portal)

Once the schema decision is made, the portal itself is comparatively straightforward. What students and parents should see:

### Student view

Tabs (subset of existing `StudentProfile`):

1. **Score Tracking** — exam history table, diagnostic profile, WellEd logs. All read-only.
2. **Assignment History** — sessions list, with worksheet titles + date + status. Links to worksheet PDFs (the existing `STU_*.pdf` URLs in the assignment objects).
3. **Score Trends** — a chart of practice test scores over time (this is new, doesn't exist in the tutor view, but is the highest-value addition for student motivation).

Hidden from students: tutor notes, the Pre-Assign panel, the Trash, anything mentioning other students, internal flags.

### Parent view

Same as student view, but:
- If a parent has multiple children, a child-switcher at the top.
- Optional: a "summary email me a weekly digest" button (defer — out of scope for first ship).

### Tutor view

Unchanged. Tutors continue using the existing app.

### Admin view

Unchanged. Admins (Kiran, Aidan) continue using the existing app + the new admin allowlist UI from auth migration.

## Login flow per role

After auth migration ships, the sign-in flow is unified:

1. User clicks "Sign in with Google" on `psm-generator.web.app`.
2. Allowlist lookup happens (same code path for everyone).
3. Based on `role` in their allowlist entry, the app routes:
   - `admin` → existing tutor app + admin tab
   - `tutor` → existing tutor app
   - `student` → student portal view, scoped to `studentId`
   - `parent` → parent portal view, scoped to `studentId` (or list of them — see schema TBD)

The **routing layer** is a new piece of infrastructure: probably a top-level `<RoleRouter />` component that picks which app to render based on the cached allowlist entry. Today there's only `<AppInner />` for tutors.

## What to build first

Suggested session breakdown (the new Claude should propose their own and confirm with Kiran):

**Session 1 — Design and align**
- Brainstorm with Kiran on schema (Option A vs B vs C). Get a decision in writing.
- Sketch the exact data shape that students/parents will see (what fields, what hidden).
- Confirm the parent multi-child story (one entry per child? array of studentIds?).
- Write a sub-plan doc capturing the schema decision.
- Maybe: prototype the `<RoleRouter />` in isolation with mock allowlist data.

**Session 2 — Schema migration (if Option A or C)**
- Write the migration script.
- Run on a test Firestore project, NOT the live one.
- Backfill per-student docs from the existing blob.
- Update the tutor-side code to read from the new structure (this is the painful part).
- Verify zero regressions in the tutor app via dev bypass mode.

**Session 3 — Student portal UI**
- New component `StudentPortal` that mirrors a stripped-down `StudentProfile`.
- Wire it through `<RoleRouter />`.
- Test with a fake `student` allowlist entry in dev mode.

**Session 4 — Parent portal UI**
- Likely 90% the same as the student portal, plus a child-switcher.

**Session 5 — Score Trends chart (new feature)**
- The one net-new thing that didn't exist in the tutor view.
- Recharts or similar lightweight chart lib? The project has no bundler, so anything added has to work via CDN script tag. Verify before committing to a library.

**Session 6 — Production rollout**
- Add real student/parent allowlist entries.
- Coordinate with Aidan to email the families with their access.
- Monitor for issues.

## Constraints inherited from the project

- **No bundler, no npm.** The codebase deliberately avoids package.json. Anything new has to load via CDN `<script>` tag from `build_index.py`. This affects library choices (e.g., Recharts works via UMD, but newer ESM-only libs don't). Verify CDN compatibility *before* committing to a dependency.
- **Single index.html.** Everything compiles into one file. Keep size discipline.
- **In-browser Babel transform.** No TypeScript, no JSX preprocessing at build time.
- **Editorial design system** ([build_index.py](build_index.py) `<style>` block). The portal must use the same Fraunces/Plex/paper+navy+sienna tokens. Don't drift.
- **Manual deploy gates.** Kiran handles all commits, pushes, and Firebase deploys. The new Claude should NEVER `git commit`, `git push`, or `firebase deploy` without explicit per-action approval.
- **Tests live in `tests/*.mjs`.** New pure logic should get test coverage in the same pattern as `tests/diagnostic.test.mjs`. CI runs them via `node --test`.
- **Two existing GitHub workflows** (`.github/workflows/ci.yml`, `deploy.yml`) gate pushes. Phase 2 must keep them passing.

## Things Phase 2 should NOT do

- **Don't add a real-time chat / messaging feature.** Out of scope. Tutoring conversations belong in Wise.
- **Don't add billing / payment views.** ATS handles billing externally.
- **Don't add tutor-to-student / parent messaging.** Out of scope.
- **Don't redesign the tutor app.** The portal is *additive*. The existing tutor experience should be unchanged from a tutor's perspective.
- **Don't introduce a build tool / bundler.** That's task #15, deferred indefinitely. If Phase 2 *requires* a bundler to ship sanely, that's a flag to pause and discuss with Kiran first, not a license to add one.
- **Don't ship before Aidan has reviewed the data the portal exposes.** Some fields might be tutor-internal and not appropriate for parent eyes (e.g., notes about a student's struggles). Aidan does the privacy review.

## Open questions to resolve in Session 1

1. **Schema decision: Option A, B, or C?** Brainstorm + decide.
2. **Parent → child(ren) cardinality.** One parent → one child? One → many? Both directions?
3. **Privacy review of fields.** Aidan needs to flag any tutor-only fields.
4. **Score Trends chart library.** Recharts via CDN? Chart.js? Hand-rolled SVG?
5. **Initial student/parent rollout.** All 51 students at once, or pilot with a few first?
6. **Mobile?** Currently the tutor app is desktop-only. Parents will likely use phones. Responsive layout needed for the portal even though tutor view stays desktop-first.

## Things to NOT skip in Session 1

- Reading the auth migration plan doc end-to-end. Phase 2 inherits everything from it.
- Confirming auth migration is actually complete (allowlist exists, role field works).
- Brainstorming the schema decision with Kiran BEFORE any code.
- Writing a session-1 sub-plan doc that captures decisions, so Session 2 doesn't re-litigate them.

---

## Prompt for the new session

I'm ready to start Phase 2 of psm-generator: the student/parent portal. Read docs/PHASE_2_PORTAL_PROMPT.md end-to-end before doing anything. It has the full briefing — schema problem, options, scope, constraints, recommended session breakdown, open questions.

Auth migration status (as of 2026-04-13): Phases A and B are shipped. Phase A (client code behind USE_ALLOWLIST_AUTH flag, default false) is in app.jsx. Phase B (rules dual-gate + allowlist collection bootstrapped with 3 admin docs) is in firestore.rules and Firestore. Phases C (production flag flip) and D (remove workspace gate entirely) are intentionally deferred — they're small cleanup that doesn't block Phase 2. Phase 2 can proceed now. See docs/AUTH_MIGRATION_SESSION_1.md and docs/AUTH_MIGRATION_SESSION_2.md for what was actually done.

Before any code, do these things in order:

Read docs/PHASE_2_PORTAL_PROMPT.md.
Read docs/AUTH_MIGRATION_PLAN.md, docs/AUTH_MIGRATION_SESSION_1.md, and docs/AUTH_MIGRATION_SESSION_2.md to understand the auth layer Phase 2 builds on. Note: Phase B shipped the allowlist schema with studentIds: [] specifically so Phase 2 doesn't need a second allowlist migration.
Verify Phase A + B are actually shipped: firestore.rules should reference allowlist/ via isAllowlisted() helpers; app.jsx should have a USE_ALLOWLIST_AUTH constant, getAllowlistEntry helper, LockoutScreen component, and AdminsTab component. If any of these are missing, STOP and tell me — Phase 2 cannot start. (Note: USE_ALLOWLIST_AUTH being false in shipped code is CORRECT — that's Phase C, deferred. Don't stop on that.)
Read the current app.jsx Firestore data layer — search for FS_DOC and onSnapshot to find where the single psm-data/main blob is loaded and written. This is the schema problem Phase 2 has to solve.
Use the brainstorming skill to walk me through the schema decision (Option A: per-student docs, Option B: derived snapshots, Option C: hybrid). Don't recommend yet — ask me what I care about (data correctness, migration risk, ongoing complexity, scale, parent latency) and let me reason through the tradeoffs out loud. Then make a recommendation.
Once we agree on schema, write docs/PHASE_2_SESSION_1.md capturing the decision and the plan for THIS session specifically.
Only then start touching code, and stop at the first natural checkpoint so I can verify and push.
Do not commit, push, or deploy anything without my explicit per-action approval. Confirm today's date with me at session start.