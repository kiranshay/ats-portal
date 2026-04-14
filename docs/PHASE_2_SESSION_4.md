# Phase 2 — Session 4: Parent Portal + Child Switcher

**Date:** 2026-04-14
**Parent docs:** [PHASE_2_SESSION_1.md](PHASE_2_SESSION_1.md) (authoritative spec) · [PHASE_2_SESSION_3.md](PHASE_2_SESSION_3.md) (state this builds on) · [PHASE_2_SESSION_4_PLAN.md](PHASE_2_SESSION_4_PLAN.md) (approved implementation plan)
**Outcome:** Multi-child parents get a segmented-control child switcher in the portal header. Single-child parents and students are visually unchanged. Selection persists across reloads with self-healing fallback for stale ids. No rules changes, no schema changes, no production rollout.

---

## What shipped

All 7 implementation tasks from the Session 4 plan landed on `main`:

1. **`pickParentSelectedChildId(entry, storedId)` pure helper + tests** — validates a stored child id against the current allowlist entry and falls back to `studentIds[0]` on null/missing/stale input. Seven new test cases in `tests/portal.test.mjs` cover null entry, missing array, empty array, single-child (stored ignored), multi + matching stored, multi + no stored, multi + stale stored.
2. **`DEV_BYPASS` extended with comma-separated `studentId`** — `?dev=1&role=parent&studentId=id1,id2,id3` parses into `DEV_FAKE_ENTRY.studentIds = ["id1","id2","id3"]`. Single-id form still works. `DEV_FAKE_STUDENT_ID` renamed to `DEV_FAKE_STUDENT_IDS` (now always an array).
3. **`usePortalChildrenMeta(studentIds)` hook** — parallel one-shot `.get()` per id, returns `{status, children:[{id, name, grade}]}`. Used for switcher labels only. Per-child failures fall back to blank name so the switcher stays usable. Not an `onSnapshot` — labels don't need live updates, and the selected child's full live view still goes through `usePortalStudent`.
4. **`switcherSlot` optional prop on `StudentPortal` + `PortalShell`** — additive, no-op when unset. Rendered inside the existing header column below the grade pill with 14px top margin. All three `StudentPortal` render paths (error, not-found, main) thread the prop, so the switcher stays visible even when the currently selected child hits not-found or error.
5. **`ChildSwitcher` component** — segmented control styled to match the existing Fraunces tab row. Active child gets the navy fill used by active tabs; inactive uses a light outline. `role="tablist"` + `aria-selected` for accessibility. Grade shown as `G{n}` monospace micro-text per button when available. Early-returns `null` when fewer than 2 children.
6. **`ParentPortal` wrapper** — owns `selectedId` state, reads `localStorage["psm-portal-selected-child"]` on mount, writes on every click, validates selection via `pickParentSelectedChildId` and self-heals `localStorage` when a stored id is no longer in `studentIds`. Private-mode Safari is handled by try/catch around both reads and writes — storage failures silently no-op. Pre-fetches child meta via `usePortalChildrenMeta` and falls back to `studentIds.map(id=>({id, name:"", grade:""}))` while the hook is still loading, so the switcher buttons are clickable immediately.
7. **`RoleRouter` wire-up** — routes `role === "parent" && studentIds.length > 1` to `ParentPortal`; single-child and zero-child parents fall through to the same single-student path students use. `role === "student"` and legacy workspace users (null entry) are unchanged.

**Commits (`main`, oldest → newest):**
- `c396606` — add pickParentSelectedChildId helper + tests
- `ad6500d` — dev bypass: accept comma-separated studentId list for multi-child
- `33ddd23` — add usePortalChildrenMeta hook for switcher labels
- `75b4092` — portal shell: optional switcherSlot prop (no-op when unset)
- `0bbf7e9` — add ChildSwitcher and ParentPortal wrapper with localStorage persistence
- `7bcbc02` — route parent multi-child to ParentPortal

Test count: **45/45** (`node --test tests/*.mjs`). 38 from Session 3 baseline + 7 new (`pickParentSelectedChildId`).

## What did not ship

- **Real parent rollout.** Still reachable only via `?dev=1&role=parent&studentId=<ids>` on localhost. `USE_ALLOWLIST_AUTH` stays `false`. Real parents cannot reach the portal in production — Phase C/D cutover is still deferred per the Session 1 constraint.
- **Firestore rules changes.** None. Rules already gate reads by `studentId in allowlistStudentIds` (plural array) from Session 2, which is exactly what the switcher needs. Zero rule surface changed.
- **Schema changes.** None. No new collections, no new fields, no migrations.
- **`StudentPortal` internals.** Untouched except for the one additive `switcherSlot` prop pass-through. No logic, no rendering, no subscription behavior changed for the single-student path.
- **Live meta refresh.** `usePortalChildrenMeta` is one-shot, not a subscription. If a tutor renames a child while a parent has the portal open, the switcher label won't update until the parent reloads. Acceptable — names change rarely and the selected child's header name is still live via `usePortalStudent`.
- **Responsive CSS.** No `@media` additions. The segmented control's `flex-wrap: wrap` handles the narrow-viewport case, and the existing `data-portal="student"` responsive rules from Session 3 still apply to the rest of the shell. Not tested on a real phone, only Chrome DevTools device emulation.
- **Student answer entry.** Session 5 work. No `submissions/` subcollection touched.

## Deviations from plan

### 1. Tasks 5 and 6 landed in a single commit instead of two

The plan split `ChildSwitcher` (Task 5) and `ParentPortal` (Task 6) into separate commits for narrative clarity. They landed as one commit (`0bbf7e9`) because `ParentPortal` imports `ChildSwitcher` and committing the switcher alone would have produced dead code. Combining them matches the "no half-finished implementations" rule and avoids a commit that can't stand on its own. Not a behavior change.

### 2. Stale-id self-heal landed in Task 6, not Task 8

The plan called out the self-heal as a decision to make during Checkpoint B verification. It was cheap enough to ship in the initial `ParentPortal` wrapper (`0bbf7e9`), so it's already live. Task 8 became verification-only with no additional code.

### 3. Vite dev server surprise → stale-JS confusion during Checkpoint A

**What happened:** Checkpoint A initially showed the "No student record linked" empty state with no switcher visible, even with a valid `?studentId=id1,id2` URL and real student ids.

**Root cause:** `psm-generator` uses `build_index.py` to inline `app.jsx` into `index.html`, and the browser runs the inlined copy via `@babel/standalone`. Pushing new `app.jsx` commits doesn't update what the browser executes until `python3 build_index.py` is re-run. Nothing in the dev flow automatically rebuilds.

**Why this wasn't caught earlier:** Session 3's Checkpoint A used the same setup, but Kiran happened to have a fresh build. Neither the Session 3 closeout nor the Session 4 plan documents the "rebuild before reload" step.

**Resolution:** Documented here for future sessions. Rebuild step for any `app.jsx` change during local dev:

```bash
python3 build_index.py
```

Then hard-refresh (Cmd+Shift+R). No code change was needed — once the browser loaded the rebuilt `index.html`, the switcher rendered correctly with both children's names and toggled cleanly.

## Open questions and risks

### `usePortalChildrenMeta` is one-shot, not live

If a tutor edits a student's `name` or `grade` while a parent has the portal open, the switcher button label shows the stale value until the parent reloads. The currently-selected child's header still updates live (via `usePortalStudent`). Acceptable trade-off for Session 4 — names change rarely, and switching to a live listener means N additional persistent snapshots per parent session for minimal real-world benefit.

### `>4` children is visually untested

Most ATS parents have ≤3 kids. The segmented control handles ≥4 via `flexWrap: wrap`, but has never been laid out with that many buttons in a real viewport. If a real family with 4+ children lands in the pilot, revisit — the dropdown form becomes more attractive at that point.

### Private-mode Safari silently drops persistence

Both `readStoredChildId` and `writeStoredChildId` are wrapped in try/catch. In private mode, writes throw and are silently swallowed, so selection resets to `studentIds[0]` on every reload. The switcher still works per-session. Not fixing — private-mode portal use is a corner case and the fallback is tolerable.

### No live Firestore verification of the switcher

Checkpoint A was verified against two real student ids on a local Vite server with a real Firebase Auth session. Rules passed, docs loaded, switcher toggled. What was NOT tested: whether a real allowlist entry with `role: "parent", studentIds: [id1, id2]` (as opposed to a `DEV_FAKE_ENTRY`) correctly gates reads under the deployed Phase 2 rules. That's a Session 7 rollout concern, not a Session 4 regression.

### Dev flow "rebuild before reload" is a documentation gap

The `build_index.py` step is not in any README or CLAUDE.md that a fresh Claude would find on session start. Session 3 got lucky; Session 4 hit it. If the tutor app uses the same build path (it does), any future Claude editing `app.jsx` will hit the same confusion until this lands in a dev-flow doc. **Flag for follow-up — not a Session 4 blocker but worth a one-line README note.**

## Checkpoint

Session 4 is complete when:
- [x] `pickParentSelectedChildId` helper + 7 tests land, full suite 45/45 green
- [x] `DEV_BYPASS` accepts `?studentId=id1,id2,id3`
- [x] `ParentPortal` + `ChildSwitcher` route multi-child parents correctly
- [x] Switcher click re-subscribes the underlying `usePortalStudent` to the new child (Checkpoint A verified)
- [x] Selection persists across reloads via `localStorage["psm-portal-selected-child"]` (Checkpoint B verified)
- [x] Stale-id fallback self-heals to `studentIds[0]`
- [x] Single-child parent, zero-child parent, student role, and tutor role flows unchanged
- [x] This closeout doc committed

Session 4 does NOT require any production operation. No rules deploy, no migration, no flag flip. `DUAL_WRITE_GRACE` and `USE_ALLOWLIST_AUTH` both remain exactly as Session 2/3 left them.

---

## Kickoff prompt for Session 5

> Copy everything between the horizontal rules below into a fresh Claude Code session, after running `/clear` in the psm-generator workspace.

---

I'm ready to start **Phase 2 Session 5** of psm-generator: student answer entry — the `SubmissionEditor` component and draft autosave. This session is **MEDIUM risk** — it is the first time the `submissions/` subcollection is exercised against live Phase 2 rules. Writes go to Firestore from a non-tutor principal for the first time in the project's history.

**Confirm today's date with me at session start before doing anything else.**

### Read these in order before any planning or code

1. **`docs/PHASE_2_SESSION_1.md`** — the authoritative Phase 2 spec. Specifically §Schema → `submissions/` subcollection shape, §Firestore rules → the `match /submissions/{submissionId}` block, and §Session plan row 5.
2. **`docs/PHASE_2_SESSION_2.md`** — confirms the rules landed and what shape they took. The `create` / `update` constraints on `submissions` (status `draft` → `submitted`, no reverse transition, only linked students can create) are the write-path contract Session 5 must satisfy.
3. **`docs/PHASE_2_SESSION_3.md`** — Session 3 built `StudentPortal` read-only. The dev-bypass "sign in for real first" note from its closeout is STILL relevant for Session 5 because the new writes also need a real Firebase Auth session to satisfy rules.
4. **`docs/PHASE_2_SESSION_4.md`** — this doc. The parent child-switcher from Session 4 is orthogonal to Session 5 — submissions are always per-student, not per-parent. But know that `StudentPortal` now has an optional `switcherSlot` prop and that a parent portal path exists via `ParentPortal`. Submission editing is student-role only; parents should NOT see the editor (they can view submitted work but not create drafts).
5. **`docs/PHASE_2_PORTAL_PROMPT.md`** — original Phase 2 briefing. Context only; the Session 1 spec overrides it.
6. **[firestore.rules](../firestore.rules)** — read the live rules for the `submissions` subcollection. These are what your writes will be checked against.
7. **[app.jsx](../app.jsx)** — specifically:
   - `StudentPortal`, its tab row, and `PortalTrackingTab` / `PortalHistoryTab` / `PortalTrendsTab` (Session 3 shipped these). The new `SubmissionEditor` is a fourth tab OR a drill-in from the History tab — Session 5 plan must decide.
   - `usePortalStudent` — single-doc subscription pattern. Session 5's submission hook should mirror the lifecycle (status-state tuple, cleanup in effect return, dev-bypass note).
   - `RoleRouter` — note that both "student" and "parent" roles reach `StudentPortal`. Session 5's editor must gate itself on `role === "student"`, not just on being in the portal.
   - The `DUAL_WRITE_GRACE` constant — Session 5 does NOT dual-write submissions. Submissions only exist in the new `/students/{id}/submissions/` path; there is no legacy blob counterpart.

### Then, before touching ANY code

- Invoke the **`superpowers:writing-plans`** skill to produce a detailed Session 5 implementation plan.
- Present the plan to me for review.
- **Do not start implementing until I approve the plan.**

### Constraints that must not be violated

- **Do NOT modify the Firestore rules.** The Phase 2 rules from Session 2 already specify the submission write contract. If your plan requires a rules change, STOP and raise it — that's a Session 1 spec deviation, not a Session 5 implementation detail.
- **Do NOT let parents create or edit submissions.** The write path must check `currentUserEntry.role === "student"` client-side even though rules also enforce it server-side. Parents read only.
- **Do NOT auto-grade.** Session 5 stores `{questionIndex, studentAnswer}` per response. No `correct` field, no tutor feedback surface, no grading logic. Grading is Session 6+.
- **Do NOT write to `psm-data/main`** for any submission purpose. Submissions have no legacy blob counterpart.
- **Do NOT flip `USE_ALLOWLIST_AUTH` or `DUAL_WRITE_GRACE`.** Kiran's call, not yours.
- **Do NOT introduce a bundler or `npm install` anything.**
- **psm-generator commit override still applies** (commit + push directly, short user-voice messages, no Co-Authored-By).
- **Rebuild before reload.** `psm-generator` uses `build_index.py` to inline `app.jsx` into `index.html`. The browser does NOT see your `app.jsx` changes until you run `python3 build_index.py`. Add a TodoWrite reminder or a shell step in your plan — Session 4 lost a review cycle to this.
- **No slop.** Comments only when the *why* is non-obvious.

### What's in scope for Session 5

Per Session 1's §Session plan row 5 and the `submissions/` schema in §Schema:

1. **`SubmissionEditor` component.** Per-question response entry for a single assignment. Status lifecycle: `draft` (mutable by student) → `submitted` (immutable from student side). The plan decides whether this is a fourth tab in `StudentPortal` or a drill-in from the existing Assignment History tab. Drill-in is probably cleaner — submissions are scoped to one assignment at a time.
2. **`useSubmissionDraft(studentId, assignmentId)` hook.** Subscribes (or one-shot reads) the student's current draft for this assignment. Mirrors `usePortalStudent` in shape: `{status, submission, error}`. Returns an idle state when no draft exists yet.
3. **Draft autosave.** Debounced write on field change (probably 600-1000ms). Writes to `students/{studentId}/submissions/{submissionId}`. `submissionId` generation strategy must be decided in the plan — auto-id on first create, then reuse. Never create a new doc per keystroke.
4. **Submit-lock behavior.** Clicking "Submit" transitions `status: "draft" → "submitted"` in a single write. Post-submit UI shows the responses read-only with a "Submitted on <date>" header. No way to edit back to draft from the client.
5. **Role gate.** Parents viewing a student's submissions see a read-only view (same component, different mode) — never the editor.
6. **Per-question response entry.** `responses: [{questionIndex, studentAnswer}, ...]`. Question count and structure comes from... where? This is an open question the Session 5 plan must resolve — see below.
7. **Test coverage.** Pure-logic helpers (draft diff, submit-lock guard, id generation) get tests in `tests/portal.test.mjs`. UI verified manually via `?dev=1&role=student&studentId=<id>`.

### Open questions Session 5 must resolve

- **Where does question structure come from?** Worksheets in the current schema are stored as URLs to OneDrive PDFs (`assignments[].worksheets[].url`), with no machine-readable question list. Options: (a) student picks a question count in the UI and fills in `Q1..QN`; (b) tutor specifies `questionCount` when creating the assignment (new field); (c) defer entirely — show a single free-text field and have students type answers as `"1. B\n2. C\n3. ..."`. **Option (c) is simplest and preserves forward compatibility with per-question parsing later.** Recommend (c) for Session 5 and defer structured entry to the "worksheet regeneration" project.
- **Drill-in vs fourth tab?** Drill-in from Assignment History is probably the right call — submissions are per-assignment, and the current history tab already lists assignments with cards. Clicking "Answer" on an assignment card opens the editor. Plan must confirm.
- **`submissionId` format?** Auto-id (Firestore default) is fine. Reuse the same id for all drafts-of-one-attempt by keeping the id in React state until submit.
- **What happens when a student opens an assignment that already has a `submitted` submission?** Show the read-only view with submitted answers. Do NOT allow retake from Session 5 UI — the schema supports multiple submission docs per assignment, but the retake UI is out of scope.
- **Autosave debounce window?** 750ms is a reasonable default. Plan should name it explicitly.
- **Offline / network failure UX?** Firestore compat SDK queues writes. Acceptable for Session 5 — the portal won't explicitly show "saving…" / "saved" badges unless the plan adds them. Recommend skipping the badges for v1.

### Pause at the first natural checkpoint

- **After the editor renders in a drill-in mode and can create a draft doc (verified via Firebase Console)** — Kiran verifies the write lands at `/students/{id}/submissions/{auto-id}` with the correct shape.
- **After autosave + submit-lock work end-to-end** — Kiran verifies a full flow: open assignment → type answers → wait for autosave → click submit → confirm submitted state → reload page → confirm read-only view.

Stop at the first one. Report status. Wait for Kiran to push or tell you to continue.

### Close out at the end of Session 5

Same pattern as this doc: write `docs/PHASE_2_SESSION_5.md` capturing what shipped, deviations, open questions, and a Session 6 kickoff prompt at the bottom.

---
