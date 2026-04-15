# Phase 3 Session 14 — Bubble-sheet SubmissionEditor + in-browser PDF viewer

**Date:** 2026-04-14
**Parent docs:** [PHASE_3_SPEC.md](../../PHASE_3_SPEC.md) §"Worksheet data model", §"Session plan" row 14 · [PHASE_3_SESSION_13.md](../../PHASE_3_SESSION_13.md) · [PHASE_3_SESSION_12.md](../../PHASE_3_SESSION_12.md) §"Portal / catalog drift"
**Scope:** Client-side React rewrite of `SubmissionEditor` + new `storage.rules` file + `firebase.json` delta. One deploy: `firebase deploy --only storage,hosting`.

---

## Goal

Replace Session 13's `pendingAssignmentBanner` placeholder with a real bubble-sheet editor that renders one input row per question, renders the STU PDF inline via `pdf.js`, and writes a per-question `responses[]` shape that Session 15's grader can join to `questionKeys/{id}`.

## Non-goals

- No auto-grading (Session 15).
- No `questionKeys` Firestore rules change (Session 15).
- No retiring of `WS_RAW` from `embed.js` (Session 12 Follow-up #1 option 3, deferred — see §"Deferred drift decision").
- No rewrite of `SignInScreen`, `ConfirmEmailScreen`, or the auth path (Session 13 frozen).
- No cleanup of row [116] Percentages duplicate unless it actively blocks editor rendering.
- No flipping of `WISE_WRITE_ENABLED`.

---

## Pause-point resolutions

### 1. Catalog data source: runtime fetch of `/worksheets_catalog.json`

The portal will `fetch('/worksheets_catalog.json')` on first `SubmissionEditor` mount and cache the result module-globally. Rationale:

- `firebase.json` hosting `ignore` list does **not** exclude `worksheets_catalog.json` → it's already deployed as a static asset.
- Smallest change that unblocks Session 14: no Firestore collection, no rules delta, no build-system change.
- Leaves `WS_RAW` alone as the tutor-side worksheet picker. The two data sources coexist for now.
- Cost: one HTTP request per portal session, cached by the browser thereafter.

Rejected alternatives:
- **Inline catalog into `embed.js` via `build_index.py`** — grows `index.html`, ties catalog updates to full rebuilds.
- **Mirror catalog to Firestore `/worksheets/{slug}`** — out of scope (new collection, new rules, admin migration).
- **Port `WS_RAW` into the catalog and retire `WS_RAW`** (Session 12 Follow-up #1 option 3) — correct eventual direction, too large for Session 14. Deserves its own session.

### 2. PDF viewer + Storage rules: ship now

Session 14 adds a new `storage.rules` file, registers it in `firebase.json`, and deploys it alongside hosting. The `InlinePdfViewer` loads the catalog's `stu` URL (Firebase Storage) via `pdf.js`.

Rationale:
- Spec row 14 explicitly lists the viewer as Session 14 scope.
- Session 15's planned rules delta (Session 12 Follow-up #3) is the same rule — deferring is pure sequencing cost.
- Students benefit from the inline viewer; tab-switching to OneDrive is a worse experience.

Tradeoff: Session 14 is no longer "client-side only" — it deploys a Storage rules change. Mitigated by isolating the deploy (`firebase deploy --only storage,hosting`) and testing against the Storage emulator first.

### 3. `responses[]` schema shape (container-aware)

**Critical data-model finding**: assignments are containers. One `asg.worksheets[]` can hold multiple worksheet items, plus `asg.welledDomain[]` and `asg.practiceExams[]` siblings. `useSubmissionDraft(studentId, assignment.id)` returns **one submission doc per assignment**, so all worksheets in an assignment share one submission. The existing Phase 2 editor ignored this and used a single textarea for the whole container.

Per-question submission shape (approved), **tagged by `worksheetId`**:

```js
{
  assignmentId: "asgn999",
  status: "draft" | "submitted",
  responses: [
    {worksheetId: "w1", questionIndex: 0, studentAnswer: "A"},
    {worksheetId: "w1", questionIndex: 1, studentAnswer: "B"},
    {worksheetId: "w2", questionIndex: 0, studentAnswer: "42"},
    {worksheetId: "w2", questionIndex: 1, studentAnswer: ""},
    ...
  ],
  updatedAt, submittedAt,
}
```

Rules:
1. `studentAnswer` is always a string. Numeric answers stored as `"42"`, not `42`. Grader does string-normalized compare.
2. Empty answers = `""`, never missing. For each worksheet with a catalog match, `responses` contains exactly `questionIds.length` entries tagged with that `worksheetId`. Invariant for Session 15's grader: `responses.filter(r => r.worksheetId === wId).length === catalog.find(c => c.title === asg.worksheets.find(w => w.id === wId).title).questionIds.length`.
3. `questionIndex` is per-worksheet (0-based within each worksheet), not global across the assignment.
4. No `answerFormat` on the submission — lives on the catalog.
5. **Legacy fallback shape** (for assignments with zero worksheets with catalog matches, or whose only content is WellEd / practice exams): `responses: [{worksheetId: null, questionIndex: 0, studentAnswer: "<blob>"}]` — the Phase 2 shape with `worksheetId: null` as the fallback marker. The grader sees `worksheetId === null` and skips auto-grading for that entry.
6. **Submission doc status** still means "the whole assignment": `draft` until the student hits Submit, `submitted` after. No per-worksheet status. Student can leave a worksheet half-filled and still submit — grader grades whatever's there.
7. No new top-level fields on the submission doc beyond the nested `responses[]` shape.
8. Firestore rules line 109 already permits `responses` updates from linked students — no rules change. The `hasOnly` check on `['status', 'responses', 'updatedAt', 'submittedAt']` still covers everything.

**Mixed-worksheet UI**: hybrid row per question showing both an A/B/C/D chip row and a numeric input, both live. Whichever the student fills is what's submitted for that question. Mixed worksheets are rare; ugly-but-correct beats a per-question format inference that would require reading `questionKeys` (forbidden to students).

### 3a. Multi-worksheet render model: stacked (Option 1)

When an assignment has multiple worksheets, **the editor renders them stacked vertically in one scrollable page**, each with its own `InlinePdfViewer` and its own answer rows section, separated by a visible heading showing the worksheet title + subject/domain/difficulty. One Submit button at the bottom submits all worksheets atomically.

Non-worksheet items:
- If `asg.welledDomain.length > 0` or `asg.practiceExams.length > 0`, the editor renders a small info note at the top: "This assignment also includes {N} WellEd item(s) and {M} practice exam(s). Engage with those outside the portal." No answer entry for these items — they aren't bubble-sheet gradeable.
- If an assignment has **zero worksheets** (only WellEd / practice exams), the editor falls through entirely to the legacy textarea path so the student can still log any written work.

Rationale for stacked over stepper / picker:
- Fewest new concepts. No per-worksheet status, no navigation state, no picker screen.
- Submission doc `status: draft|submitted` still means one thing — the whole assignment.
- Deep-link `?a=asgn999` opens the assignment page; student scrolls to whichever worksheet the tutor meant. No ambiguity about which worksheet to open.
- Matches how tutors think about a session: 3 worksheets assigned together = done together.

**PDF memory concern** (multiple `pdf.js` instances in one view): acknowledged but deferred. If real-world usage shows slowdown, we lazy-mount `InlinePdfViewer` on scroll-into-view. Not a Session 14 worry unless we see it.

**PDF URL precedence** per worksheet row:
1. **Prefer `catalogEntry.stu`** (catalog-joined via `w.title`) — authoritative Firebase Storage URL post-Session-12 migration.
2. **Fall back to `w.url`** if no catalog match — this is the pre-existing link from the worksheet picker, may be OneDrive / WS_RAW / Storage depending on assignment creation date.
3. **Graceful error** if `pdf.js` can't fetch the URL (OneDrive links will fail CORS). Shows "Couldn't load the PDF" with a raw link to open externally. Editor still renders answer rows.

### 4. `storage.rules` shape

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {

    function emailKey() {
      return request.auth.token.email.lower();
    }

    function isAllowlisted() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && firestore.exists(/databases/(default)/documents/allowlist/$(emailKey()))
        && firestore.get(/databases/(default)/documents/allowlist/$(emailKey())).data.active == true;
    }

    function allowlistRole() {
      return firestore.get(/databases/(default)/documents/allowlist/$(emailKey())).data.role;
    }

    function canReadWorksheet() {
      return isAllowlisted()
        && allowlistRole() in ['tutor', 'admin', 'student', 'parent'];
    }

    match /worksheets/{file=**} {
      allow read: if canReadWorksheet();
      allow write: if false;
    }

    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

Design notes:
- **Scope = role presence, not per-student linkage.** Worksheets aren't student-specific — the same PDF is assigned to many students. There's no `studentId` path component, so `canReadStudent()` is unreachable here.
- **`firestore.get()` cross-service syntax** needs verification in the Storage emulator before deploy. If the call doesn't work, fall back to `allow read: if request.auth != null && request.auth.token.email_verified == true` and flag it in `PHASE_3_SESSION_14.md`.
- **Default-deny wildcard** at the end keeps the bucket closed for any path outside `/worksheets/`.
- **Explicit security tradeoff**: any allowlisted user can fetch any worksheet PDF, not only the ones their assignments reference. For 51 pilot users this matches the effective access level of `WS_RAW`. Public launch would require per-user signed URLs via a Cloud Function.

---

## Architecture

### Components (all in `app.jsx`, no new files)

1. **`useWorksheetCatalog()`** hook — module-cached fetch of `/worksheets_catalog.json`. Returns `{status: "loading"|"ready"|"error", catalog}`. Shared promise across all callers, so even if `SubmissionEditor` renders 3 `WorksheetBlock`s they all resolve against the same fetch.

2. **`InlinePdfViewer({url})`** — loads `window.pdfjsLib.getDocument({url})`, renders each page to a `<canvas>` in a scrollable container. Graceful error states for pdf.js not loaded, network error, 403 from Storage rules, or a CORS-blocked OneDrive URL. Shows "Couldn't load the PDF — [open externally]({url})" on any failure.

3. **`WorksheetBlock({worksheet, catalogEntry, answersForThisWorksheet, onAnswersChange, isLocked})`** (new) — renders one worksheet: a heading (title + subject/domain/difficulty), the `InlinePdfViewer`, and the answer rows. Branches on `catalogEntry.answerFormat`:
   - `"multiple-choice"` → MC grid (A/B/C/D radios per row)
   - `"free-response"` → numeric input per row
   - `"mixed"` → hybrid row (chips + numeric)
   - missing catalog entry or missing `questionIds[]` → single textarea scoped to this worksheet only (per-worksheet fallback, still tagged with `worksheetId`)
   - Two-column desktop layout inside the block: PDF viewer left, answer rows right. Stacks vertically on narrow screens.

4. **`SubmissionEditor`** rewrite at [app.jsx:4833](../../../app.jsx#L4833):
   - Keeps existing data plumbing: `useSubmissionDraft`, debounced autosave (750ms), submit lock, back button.
   - New state: `answersByWorksheet: { [worksheetId]: string[] }`. Each worksheet's answer array is keyed by its `w.id` from the assignment doc.
   - **Zero-worksheet fallback**: if `asg.worksheets.filter(w => !w.deleted).length === 0`, render the legacy single textarea for the whole assignment (Phase 2 path). Uses `worksheetId: null` in the write payload.
   - **Legacy mode detection for existing drafts**: if `submission.responses` has exactly one entry with `worksheetId === null` OR no `worksheetId` field at all, seed it into a legacy textarea state and render legacy mode even if the assignment has worksheets now. Prevents clobbering in-progress Phase 2 drafts. (In practice: zero real submissions exist at Session 14 deploy time, per Session 13's check — this is defensive only.)
   - Seed effect: reads `submission.responses[]`, groups by `worksheetId`, pads missing slots with `""` for each worksheet's expected length from its catalog entry.
   - Write path: rewritten `makeDraftPayload` takes `{assignmentId, answersByWorksheet, catalogByWorksheetId}` and flattens to the nested `responses[]` shape.
   - Render: info note for non-worksheet items at top (if any), then one `WorksheetBlock` per `asg.worksheets[i]` (skipping deleted), then one Submit button at the bottom.

5. **`makeDraftPayload`** helper at [app.jsx:1135](../../../app.jsx#L1135) (existing, edited) — new signature accepting either `{answersText}` (legacy blob) OR `{answersByWorksheet, catalogByWorksheetId}` (new nested). Branches on which is present. Legacy blob callers (none remain after this session, but path preserved for the zero-worksheet fallback) produce `responses: [{worksheetId: null, questionIndex: 0, studentAnswer: answersText}]`. New callers flatten per-worksheet arrays into the tagged shape.

6. **`canSubmitDraft`** helper at [app.jsx:1127](../../../app.jsx#L1127) (existing, edited) — returns true if at least one `responses[i].studentAnswer` is non-empty (trim check). Works for both legacy and nested shapes without branching.

7. **`StudentPortal`** at [app.jsx:4316](../../../app.jsx#L4316) — `pendingAssignmentBanner` JSX deleted. Deep-link arrival with matching `studentId` invokes the existing `setOpenAssignmentId` flow that already mounts `SubmissionEditor` at [app.jsx:4692](../../../app.jsx#L4692). `sessionStorage.pendingAssignment` is cleared in the same effect that calls `setOpenAssignmentId`.

8. **`storage.rules`** new file at repo root + `firebase.json` gains a `"storage": {"rules": "storage.rules"}` block.

**Uniqueness assumption**: `w.id` is assumed unique within `asg.worksheets[]` of a single assignment. The editor uses it as the key in `answersByWorksheet` and as React's `key` prop. The plan includes a runtime defensive check during seed: if duplicate `w.id` values are detected, log a console warning and append a positional suffix to disambiguate (`${w.id}-${index}`). Collision is unlikely — ids are generated per-item at assignment creation — but the check is cheap insurance.

### Data flow

```
Deep link arrival
  → sessionStorage.pendingAssignment set by module-load parser (Session 13)
  → StudentPortal mounts → detects pendingAssignment + matching studentId
  → calls setOpenAssignmentId(pendingAssignment.a) + clears sessionStorage key
  → existing assignment-open flow mounts SubmissionEditor(assignment)
  → useWorksheetCatalog() fetches /worksheets_catalog.json (cached per session)
  → For each w in asg.worksheets (non-deleted):
      catalogEntry = catalog.find(c => c.title === w.title)
      if catalogEntry && catalogEntry.questionIds → bubble-sheet WorksheetBlock
      else                                         → per-worksheet textarea WorksheetBlock
  → If asg.worksheets is empty: legacy full-assignment textarea fallback
  → Each WorksheetBlock loads its PDF:
      url = catalogEntry?.stu || w.url
      InlinePdfViewer(url) via pdf.js
  → Student fills answersByWorksheet[wId][i] → debounced autosave (750ms) → Firestore write
  → Submit → status: "submitted" (whole submission, all worksheets atomically)
```

**Assignment → worksheet join**: per worksheet item `w.title` → `catalogEntry.title`. Confirmed by Session 12's post-revert: all 131 supported catalog rows match a `WS_RAW` row by title, and assignments are built from `WS_RAW`. If a specific worksheet title doesn't match (e.g., a worksheet created from a future `WS_RAW` addition), that worksheet falls through to the per-worksheet textarea branch.

---

## Error handling

| Failure | Behavior |
|---|---|
| Catalog fetch fails | Every `WorksheetBlock` falls through to per-worksheet textarea with a warning banner at the top of the editor: "Couldn't load worksheet metadata — using simple mode". Student can still submit. |
| Catalog entry not found for a specific `w.title` | That single `WorksheetBlock` renders per-worksheet textarea. Other worksheets in the same assignment still get bubble-sheet if their catalog match works. |
| `questionIds[]` missing on catalog entry (unsupported row) | Same as above — per-worksheet textarea for that block. |
| `asg.worksheets` is empty (only WellEd / practice exams) | Full-assignment legacy textarea fallback. |
| PDF fetch fails (403, network, bad URL, OneDrive CORS) | That `WorksheetBlock`'s PDF panel shows "Couldn't load the PDF — [open externally]({url})". Answer rows still render. |
| `pdf.js` not loaded (CDN blocked) | Same graceful fallback, all PDF panels show the error. |
| Firestore draft read loading/error/not-found | Unchanged from current editor. |
| Existing Phase 2 draft with legacy blob shape | Defensive legacy-mode detection: if `submission.responses.length === 1 && !submission.responses[0].worksheetId`, render legacy full-assignment textarea even if the assignment now has worksheets. Preserves in-progress drafts. |
| Storage rules `firestore.get()` call fails in emulator | Fall back to verified-email-only rule; document in session doc. |

---

## Testing

1. **Babel compile** of `app.jsx` — must be clean. Same smoke test as Session 13.
2. **Local browser tests** via `python -m http.server 8765`:
   - Deep-link arrival opens editor directly (dev bypass + fabricated assignment)
   - Single-worksheet assignment: MC-only worksheet renders radio rows
   - Single-worksheet assignment: free-response worksheet renders numeric inputs
   - Single-worksheet assignment: mixed worksheet renders hybrid rows
   - **Multi-worksheet assignment (2 worksheets) renders both stacked, each with its own PDF viewer + answer rows + heading**
   - **Mixed-format multi-worksheet: one MC + one FR in the same assignment both render correctly**
   - Unsupported worksheet (no `questionIds`) inside a multi-worksheet assignment renders per-worksheet textarea while other worksheets stay bubble-sheet
   - Zero-worksheet assignment (WellEd / practice exams only) renders legacy full-assignment textarea
   - Non-worksheet sibling items (`welledDomain`, `practiceExams`) render as info note at top of editor
   - Autosave fires after 750ms idle on any worksheet's answer change
   - Submit locks the form and sets `status: "submitted"` — all worksheets in the submission become read-only atomically
   - Back button returns to assignment history without losing draft
   - Defensive legacy-mode: a pre-existing draft with `responses: [{questionIndex:0, studentAnswer:"blob"}]` (no worksheetId) renders legacy textarea even if the assignment has worksheets
3. **Storage rules emulator test** before deploy — `firebase emulators:start --only storage,firestore` and exercise the `firestore.get()` cross-service call. If it fails, swap in the fallback rule.
4. **Deployed smoke test** after `firebase deploy --only storage,hosting` — one real end-to-end PDF load on `portal.affordabletutoringsolutions.org` using Kiran's own student account.

### Not tested this session

- Real student submission flow against production (pilot hasn't rolled out).
- Cross-device flow (student on phone after parent forwarded the email).
- Auto-grading (Session 15).
- Live email link send — deferred to Session 16 per Session 13 follow-up #2.

---

## Deferred drift decision

**Session 12 Follow-up #1 (retire `WS_RAW`) is explicitly deferred.** Reason: porting `WS_RAW` entries into the catalog and retiring the bake path touches the tutor-side worksheet picker, `build_index.py`, `embed.js`, and any code that reads `ALL_WS`. This is a refactor that deserves its own session. Session 14 unblocks its editor via runtime catalog fetch without disturbing `WS_RAW`.

The drift cost for Session 14 specifically: the portal now reads two worksheet sources (`WS_RAW` for tutor picker, `worksheets_catalog.json` for student editor). They were verified to match by title on all 131 supported rows in Session 12 post-revert. If a title ever drifts, the editor falls through to legacy textarea — graceful degradation, not a broken screen.

---

## Out of scope (carried forward to Session 15)

- `questionKeys` Firestore rules delta.
- Auto-grading Cloud Function trigger on `submissions/{id}` write.
- Wise score post-back.
- Row [116] Percentages duplicate-title cleanup.
- Retiring `WS_RAW` (own session).
- `.bak*` catalog backup file cleanup (Session 12 Follow-up #8).

---

## Constraints carrying forward

- No slop.
- ats-portal commit override: Claude may commit + push directly, short user-voice messages, no Co-Authored-By.
- No bundler.
- Every new function does its own Firebase Auth check internally.
- `firebase deploy --only storage,hosting` is the only deploy this session.

---

## Close out

- Write `docs/PHASE_3_SESSION_14.md` summarizing what shipped, surprises, follow-ups.
- Write Session 15 kickoff prompt (auto-grading trigger + Wise post-back + `questionKeys` rules + Storage rules verification if the fallback was used).
