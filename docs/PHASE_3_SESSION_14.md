# Phase 3 — Session 14: Bubble-sheet SubmissionEditor + in-browser PDF viewer

**Date:** 2026-04-15 (session started 2026-04-14, landed early 2026-04-15)
**Session type:** Client-side rewrite of `SubmissionEditor`, new `WorksheetBlock` + `InlinePdfViewer` + `useWorksheetCatalog` components, new `storage.rules`, `firebase.json` + CI workflow delta, Firebase Storage CORS config. One deploy pipeline (`firebase deploy --only hosting,storage`) via GitHub Actions. Manual `gsutil cors set` on the bucket (one-time bucket config).
**Parent docs:** [PHASE_3_SPEC.md](PHASE_3_SPEC.md) §"Worksheet data model" · [PHASE_3_SESSION_12.md](PHASE_3_SESSION_12.md) · [PHASE_3_SESSION_13.md](PHASE_3_SESSION_13.md) · [superpowers/specs/2026-04-14-session-14-submission-editor-design.md](superpowers/specs/2026-04-14-session-14-submission-editor-design.md) · [superpowers/plans/2026-04-14-session-14-submission-editor.md](superpowers/plans/2026-04-14-session-14-submission-editor.md)
**Outcome:** Students who sign in through the portal (Google OAuth and — pending SMTP, see Surprises — email link) now see a container-aware bubble-sheet editor instead of the Phase 2 single textarea. The editor iterates `asg.worksheets[]`, joins each worksheet to `worksheets_catalog.json` by title, and renders one `WorksheetBlock` per worksheet: heading + inline PDF viewer + per-question answer rows (MC chips, free-response input, or hybrid for `"mixed"` format). Answers write to Firestore as a nested `responses[]` shape tagged by `worksheetId`. Session 13's `pendingAssignmentBanner` placeholder is gone; deep-link arrivals now auto-open the referenced assignment directly. Storage rules opened for public read on `/worksheets/**` with CORS configured so `pdf.js` can fetch from the portal domain. Everything is live on `https://portal.affordabletutoringsolutions.org/`.

This session also shipped the first production deploy of **all of Session 13**, which had been sitting unshipped since its expired-`FIREBASE_TOKEN` deploy failure on 2026-04-14.

---

## Scope — what the kickoff prompt said vs. what actually shipped

Session 14's kickoff prompt was detailed and mostly accurate. Two things diverged mid-session:

| Kickoff framing | Actual reality |
|---|---|
| "Assignment has a worksheet title field, editor loads one catalog entry" | **Assignments are containers.** Each `asg.worksheets[]` can hold multiple worksheet items, plus `asg.welledDomain[]` and `asg.practiceExams[]` siblings. The spec and plan had to be revised mid-brainstorm to handle multi-worksheet. Documented in the design doc §"Multi-worksheet render model." |
| "Session 13's banner stays in error/not-found states of StudentPortal as a fallback" | Banner deleted entirely — deep-link auto-open via `setOpenAssignmentId` + `setTab("history")` handles the same purpose more directly. |
| "Storage rules mirror Firestore `canReadStudent` via cross-service `firestore.get()`" | Cross-service `firestore.get()` from Storage rules **did not work in production** despite `firestore.exists()` / `firestore.get()` syntax being valid per Firebase docs. Fell back first to a verified-email-only rule, then to public read on `/worksheets/**` once we discovered `pdf.js` can't carry Firebase auth tokens client-side. See "The storage rules journey" below. |

---

## What shipped

All 10 commits landed in this order between 2026-04-14 ~22:30 and 2026-04-15 ~00:15. Direct-to-main per the ats-portal commit override.

### 1. `useWorksheetCatalog()` hook — [app.jsx:382](../app.jsx#L382)
Module-cached fetch of `/worksheets_catalog.json` (already deployed as a Firebase Hosting static asset — `firebase.json` hosting ignore list never excluded it). Returns `{status, catalog}`. Shared promise across all callers so multiple `WorksheetBlock` instances on one editor mount resolve against one fetch. Error path resets the cached promise to allow retry on next hook mount.

**Decision:** runtime fetch was chosen over bundling into `embed.js` / Firestore collection / porting `WS_RAW` to the catalog. Smallest unblocking change, costs one HTTP request per portal session, leaves the tutor-side `WS_RAW` picker untouched. Session 12's "retire `WS_RAW`" follow-up stays deferred.

### 2. `InlinePdfViewer({url})` component — [app.jsx:4891](../app.jsx#L4891)
Renders a PDF URL inline by rasterizing each page to a canvas via `window.pdfjsLib.getDocument({url})`. The `pdf.js` CDN was already loaded globally by `index.html` from Phase 2's diagnostic tooling — this is the first *portal-side* consumer. Handles graceful error states for every failure mode: no `window.pdfjsLib`, no URL, fetch 403, fetch network error, page render error. On failure shows "Couldn't load the PDF here — Open externally" with the raw URL as a fallback link.

**Design decisions:**
- Canvas scale `1.35` for crisp rendering on retina displays, with `maxWidth: 100%` so the canvas scales down to fit its grid column.
- `cancelled` flag guards every async setState during URL changes and component unmount. React Strict Mode double-invokes effects in dev; verified in local testing that double-mount does not leak or duplicate PDFs.
- `maxHeight: 900` viewport (raised from initial 600) with `overflowY: auto` — tall worksheets scroll within the viewer panel without pushing the answer column off screen.

### 3. `makeDraftPayload` + `canSubmitDraft` nested-shape support — [app.jsx:1135](../app.jsx#L1135), [app.jsx:1127](../app.jsx#L1127)
Both helpers now support the new nested `responses[]` shape tagged by `worksheetId`:

```js
responses: [
  {worksheetId: "w1", questionIndex: 0, studentAnswer: "A"},
  {worksheetId: "w1", questionIndex: 1, studentAnswer: "B"},
  {worksheetId: "w2", questionIndex: 0, studentAnswer: "42"},
  ...
]
```

Legacy blob shape (Phase 2 single-textarea fallback for assignments with no worksheets) uses `worksheetId: null` as the fallback marker:

```js
responses: [{worksheetId: null, questionIndex: 0, studentAnswer: "<blob>"}]
```

`canSubmitDraft` loops all `responses[]` entries checking any non-empty `trim()`, so it works across both shapes without branching. Node tests in `tests/portal.test.mjs` cover both shapes — 4 new tests added, all 58 total pass.

**No Firestore rules change required.** `firestore.rules` line 109's `hasOnly(['status', 'responses', 'updatedAt', 'submittedAt'])` diff check already permits the new shape — the rule gates on field names, not shape.

### 4. `WorksheetBlock` + MC/FR/mixed renderers — [app.jsx:4973](../app.jsx#L4973)
One block per worksheet. Controlled component — `answersByWorksheet[wId]` state lives in the parent `SubmissionEditor`. Renders:
- Heading (index label, title, subject/domain/difficulty subhead)
- Two-column grid: PDF viewer left, answer rows right
- Answer rows branch on `catalogEntry.answerFormat`:
  - `"multiple-choice"` → `renderMcRow` — A/B/C/D chips, selected chip dark, click selected to clear
  - `"free-response"` → `renderFrRow` — single text input (not `type="number"` so `"3/4"` and `"0.25"` work)
  - `"mixed"` → `renderMixedRow` — both chips AND a numeric input sharing one answer slot, whichever the student fills wins
  - missing catalog entry or missing `questionIds[]` → per-worksheet textarea fallback, with an italic note "No bubble sheet available for this worksheet — type your answers below"

Final grid proportion: `minmax(0, 1fr) 260px` — PDF gets all flex space, answer column is a fixed 260px (enough for the number label + A/B/C/D buttons + breathing room). Initial render was 1fr:1fr which felt cramped for the PDF; tightened in [commit e6a975c](https://github.com/kiranshay/ats-portal/commit/e6a975c) after Kiran's visual review.

### 5. `SubmissionEditor` rewrite — [app.jsx:5145](../app.jsx#L5145)
The biggest change in the session. The Phase 2 function was a single textarea with one `responses[0]` entry regardless of how many worksheets the assignment contained. The new version:

- Keeps the existing data plumbing: `useSubmissionDraft`, debounced 750ms autosave, submit lock, back button.
- New state: `answersByWorksheet: {[wId]: string[]}` keyed by defensively-deduped `w.id`. Per-worksheet collision detection suffixes colliding ids with their positional index and logs a console warning.
- **`worksheetsStable` is memoized on `[assignment.worksheets]`.** Initial implementation used a bare IIFE that created a new array reference every render, which caused `catalogByWorksheetId` (a `useMemo` depending on `worksheetsStable`) to recompute every render, which caused the seed `useEffect` to fire every render, which called `setAnswersByWorksheet(next)` with a new object every render → **infinite render loop** that would also clobber in-progress student input. Caught by the spec reviewer subagent during code review — see "Surprises." Fix shipped in commit `cb16ea5`.
- Seed effect groups existing `submission.responses[]` by `worksheetId` and pads each worksheet's answer array to its catalog-expected length with `""`.
- Render iterates `worksheetsStable.map((w, idx) => <WorksheetBlock ... />)`. Each block gets its catalog entry via `catalogByWorksheetId[w.id]`, its slice of `answersByWorksheet`, and an `onAnswersChange` callback that immutably updates the parent's state.
- Info note at the top when `asg.welledDomain` or `asg.practiceExams` are non-empty: *"This assignment also includes N WellEd item(s) and M practice exam(s). Engage with those outside the portal."* Students are expected to know which exam/item from tutor communication, not from the portal. See Follow-ups #3 for a related UX gap.
- Zero-worksheet fallback: if `asg.worksheets` is empty (WellEd / exam-only assignments), render the Phase 2 legacy full-assignment textarea. Preserves Phase 2 behavior for non-bubble-sheet cases.
- Legacy draft detection: if an existing submission has `responses.length === 1 && !responses[0].worksheetId`, render legacy textarea even if the assignment now has worksheets. Defensive — no real Phase 2 drafts exist at Session 14 deploy time but the code path is there.
- Submit builds a flat `fakeResponses` array from nested state to feed `canSubmitDraft`. On submit, writes the doc with `status: "submitted"` and locks the entire form (all worksheets atomically).

### 6. `pendingAssignmentBanner` deleted, deep-link auto-open wired — [app.jsx:4316](../app.jsx#L4316), [app.jsx:4717](../app.jsx#L4717)
Session 13's placeholder banner is gone. The new flow:
1. `StudentPortal` mounts, reads `sessionStorage[PENDING_ASSIGNMENT_KEY]` once via `useState` initializer, validates `raw.s === studentId` to prevent cross-child leaks.
2. On mount, clears the sessionStorage key and calls `setTab("history")` to force the history tab.
3. Passes `deepLinkAssignmentId` down to `PortalHistoryTab` as a prop.
4. `PortalHistoryTab` has a new `useEffect([deepLinkAssignmentId, student])` that calls `setOpenAssignmentId(deepLinkAssignmentId)` when the referenced assignment exists in `student.assignments` (filtered for `!deleted`). If it doesn't exist, silently ignore — outdated links and tutor-deleted assignments don't error.

Session 13's module-level `PENDING_ASSIGNMENT_KEY` and `stashPendingAssignmentFromUrl()` are untouched — those are load-bearing for the auth path.

### 7. `storage.rules` — finally landed on public read on `/worksheets/**`
See "The storage rules journey" below for the full arc. Final rule:

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /worksheets/{file=**} {
      allow read: if true;
      allow write: if false;  // admin SDK only
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

Security tradeoff explicitly approved by Kiran: worksheets are branded variants of public College Board practice questions, not proprietary IP; public read is fine for the pilot and likely for public launch. Per-user signed URLs via Cloud Function are the upgrade path when DRM / watermarking / per-user audit becomes a real requirement.

### 8. `firebase.json` storage registration + CI workflow update
`firebase.json` gained:
```json
"storage": { "rules": "storage.rules" }
```
`.github/workflows/deploy.yml` line 62 changed from `--only hosting` to `--only hosting,storage` so CI deploys both in one run. No split deploy, no manual laptop step.

### 9. `cors.json` + one-time bucket CORS config
Committed to repo at root as documentation of bucket config:

```json
[
  {
    "origin": ["*"],
    "method": ["GET"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type"]
  }
]
```

Applied to the bucket once via `gsutil cors set cors.json gs://psm-generator.firebasestorage.app` (Kiran ran this manually — gcloud CLI in the Claude sandbox hit the same reauth wall that firebase CLI hit earlier this session). This is bucket-level config, not rules, and is **not** managed by `firebase deploy`. Future bucket recreations would need this re-applied.

### 10. PDF panel width polish
`WorksheetBlock`'s grid changed from `minmax(0, 1fr) minmax(0, 1fr)` (50/50) to `minmax(0, 1fr) 260px` (PDF gets all flex, answer column fixed). `InlinePdfViewer`'s `maxHeight` raised from `600` to `900` to give tall worksheets more viewport before scroll kicks in. Shipped after the first round of Kiran's real-student-session visual review.

---

## The four pause points — resolutions

### 1. Catalog data source
**Decision:** runtime fetch of `/worksheets_catalog.json` (already deployed static asset).
Rejected alternatives: inline into `embed.js`, mirror to Firestore, retire `WS_RAW`. All three had merit; runtime fetch was the smallest unblocking change. Session 12 Follow-up #1 (retire `WS_RAW`) stays deferred.

### 2. PDF viewer + Storage rules
**Decision:** ship the viewer in Session 14, deploy new `storage.rules` in the same push.
The rules journey took three iterations (see below). End state: public read on `/worksheets/**` + CORS configured. The viewer itself works reliably once the two infrastructure pieces are in place.

### 3. `responses[]` schema shape
**Decision:** flat array, tagged by `worksheetId`, one entry per question per worksheet, `""` for unanswered. `questionIndex` kept as per-worksheet index (0-based within each worksheet). Legacy fallback uses `worksheetId: null`. All 7 schema rules from the design doc approved without modification. 4 new Node tests in `tests/portal.test.mjs` verify both shapes.

### 4. Storage rules shape
**Initial proposal:** cross-service `firestore.get(/databases/(default)/documents/allowlist/$(emailKey()))` to mirror Firestore's allowlist gate.
**Final:** `allow read: if true` on `/worksheets/**`, everything else default-deny. Tradeoff explicitly approved. See journey below.

---

## The storage rules journey

Three rule iterations in roughly 45 minutes of mid-session debugging. The goal was always "student's browser can fetch worksheet PDFs via `pdf.js`"; the path to getting there was longer than expected.

### Iteration 1 — cross-service `firestore.get()` (failed)

Initial rule (shipped in commit `26de304`) mirrored the Firestore allowlist gate:

```
function isAllowlisted() {
  return request.auth != null
    && request.auth.token.email_verified == true
    && firestore.exists(/databases/(default)/documents/allowlist/$(emailKey()))
    && firestore.get(/databases/(default)/documents/allowlist/$(emailKey())).data.active == true;
}
```

The rule compiled successfully (`firebase.storage: rules file storage.rules compiled successfully`) and CI reported `✔ storage: released rules storage.rules to firebase.storage`. But PDF fetches from the live portal still returned 403 after deploy, even when signed in as a student-role user.

Likely causes (not definitively diagnosed — we pivoted before root-causing):
- Cross-service rule evaluation from Storage rules to Firestore may require an explicit IAM binding that wasn't auto-granted on this older project.
- `firestore.get()` syntax variants differ between Firebase doc versions.
- `emailKey()` casing vs allowlist doc ID casing mismatch.

### Iteration 2 — verified-email only (failed for a different reason)

Fallback rule (commit `855357c`):

```
function isVerifiedSignedIn() {
  return request.auth != null
    && request.auth.token.email_verified == true;
}
match /worksheets/{file=**} {
  allow read: if isVerifiedSignedIn();
}
```

Still 403. Diagnosis revealed the real bug: **`pdf.js` fetches URLs via plain `fetch()` without Firebase Auth tokens.** When Firebase Storage receives an unauthenticated request to a URL without a download token (`&token=...` query param), `request.auth == null`, rule rejects. The Firebase JS Storage SDK would generate tokenized URLs via `getDownloadURL()` — but that SDK isn't loaded in `index.html` (only the `storageBucket` config string is). The catalog's `stu` URLs are the non-tokenized "public download URL" format from Session 12's migration script.

Two paths forward: (a) load the Firebase Storage SDK and rewrite `InlinePdfViewer` to call `getDownloadURL()`; (b) make `/worksheets/**` public-read. Kiran chose (b) after weighing the tradeoff.

### Iteration 3 — public read on `/worksheets/**` (rule works, CORS doesn't)

Final rule (commit `b2ad3bd`): `allow read: if true`. Deploy green. The "Open externally" link (top-level browser navigation to the PDF URL) now worked. But `pdf.js`'s inline fetch **still** failed — different reason.

### Iteration 3.5 — CORS config (not a rule, a separate bucket config)

`pdf.js` is a cross-origin JavaScript fetch from `portal.affordabletutoringsolutions.org` to `firebasestorage.googleapis.com`. Cross-origin fetches require CORS response headers. Firebase Storage buckets **do not have CORS configured by default** — you have to set it explicitly via `gsutil cors set`, and this is **completely separate** from `storage.rules` and `firebase deploy`.

Fix: `cors.json` committed to repo, Kiran ran `gsutil cors set cors.json gs://psm-generator.firebasestorage.app` manually (gcloud reauth wall blocked running it from the Claude session). After this one-shot bucket config, inline PDF rendering works end-to-end.

**Lesson for future Firebase Storage work:** `firebase deploy` does NOT manage CORS. Bucket CORS is a one-time `gsutil`/console operation. If you move to a new bucket, this must be re-applied.

---

## Mid-session corrections

### A. Container data model discovery

Brainstorming started with "one assignment = one worksheet." A few minutes into plan-writing I ran `grep -n "asg.worksheets" app.jsx` to find the assignment → worksheet join field and discovered that assignments are containers with `asg.worksheets[]`, `asg.welledDomain[]`, and `asg.practiceExams[]`. Session 14's existing Phase 2 `SubmissionEditor` ignored this entirely — it took the whole assignment and produced one textarea with one `responses[0]` entry regardless of how many worksheets the assignment contained. That worked for Phase 2's "type whatever you want" model; it breaks for bubble-sheet.

Went back to brainstorming, presented three options for multi-worksheet render (stacked / stepper / picker), and Kiran approved **stacked vertical** (Option 1). Rewrote the affected spec sections in place, re-ran the spec self-review, then proceeded to writing-plans. This added ~20 minutes but prevented building the whole editor against a wrong mental model.

### B. The render loop bug

Task 5's first draft (`SubmissionEditor` rewrite, commit `975004e`) had `worksheetsStable` computed as a bare IIFE:

```js
const worksheetsStable = (()=>{ ... })();
```

This produces a new array reference every render. Downstream `catalogByWorksheetId` was a `useMemo` with `worksheetsStable` in its deps — new ref every render → memo recomputes every render. The seed `useEffect` had `catalogByWorksheetId` and `worksheetsStable` in its deps — both new every render → effect fires every render → `setAnswersByWorksheet(next)` called with fresh object → React re-renders → loop. Also guaranteed to clobber in-progress student input on every keystroke because the seed would run again and reset answers.

The spec reviewer subagent caught this during code review (not the implementer self-review, not manual testing — it takes a browser run to surface in practice). Fix shipped in commit `cb16ea5`: wrap `worksheetsStable` in `useMemo(..., [assignment.worksheets])`. This is a textbook "useMemo fixes downstream useMemo fixes downstream useEffect" cascade, and it's exactly the kind of bug that silent tests don't catch.

**Lesson:** when a memoization chain depends on a derived value, that derived value must itself be memoized. Bare IIFEs look "free" but they break every downstream reference-equality check.

### C. Admin session vs. dev bypass on production

Initial production verification attempt: Kiran opened `https://portal.affordabletutoringsolutions.org/?dev=1&role=student&studentId=rnbw56f5` expecting the same dev-bypass routing he uses locally. Got a "Couldn't load your student record" error screen because `DEV_BYPASS` is **localhost-only by design** ([app.jsx:905](../app.jsx#L905)). The `?dev=1` flag is ignored on any non-localhost hostname.

Pivoted to the real path: created an allowlist entry for a burner email (`sixsiege1414@gmail.com`) via the portal's AdminsTab UI, linked to `rnbw56f5`, role `student`. Signed into the burner via Google OAuth on prod. That routed correctly to `StudentPortal` and unblocked the Task 8 verification.

This took some back-and-forth because the email-link path for the burner also didn't work (see Surprises), so Google OAuth was the only working sign-in path for the test session.

---

## Testing performed

### Pre-deploy verification

- `esbuild` JSX parse check after every code commit (6 passes, all clean).
- `node --test tests/portal.test.mjs` — 58 tests total including 4 new draft-payload tests covering both legacy and nested shapes. All pass.
- Local `python3 -m http.server 8765` + browser smoke test against real Firestore data using the localhost dev bypass layered on top of a real Firebase Auth session (admin account). Verified: multi-worksheet editor renders, MC chips respond, FR inputs accept, autosave fires, submit locks, back button preserves state. PDFs showed the expected "Couldn't load" fallback in local (Storage rules not deployed yet).

### Post-deploy verification

- GitHub Actions deploy workflow ran green 3 times (token rotation confirmed working on push 1; storage rule iterations on pushes 2 and 3).
- Production verification with real student auth session: signed in as `sixsiege1414@gmail.com` via Google OAuth, allowlisted as `student` linked to `rnbw56f5`. Navigated to unsubmitted assignment with multiple worksheets. Confirmed:
  - Multi-worksheet stacked layout renders correctly (screenshot captured)
  - Each `WorksheetBlock` shows heading + two-column layout + MC/FR/mixed inputs as expected
  - Previously-submitted assignments correctly show read-only mode (discovered because Kiran initially tried one he'd submitted during local testing)
  - PDFs render inline after CORS was applied (final rule + CORS combination, iteration 3.5)
  - "Open externally" link works when inline viewer fails
  - Info note for WellEd/practice-exam-only assignments

### What was NOT tested this session

- **Real end-to-end email-link sign-in.** The outbound `sendSignInLinkToEmail` call returned success but no email arrived at the burner inbox (see Surprises). The email-link code path has still never been proven end-to-end against real Firebase — Session 13's unchanged follow-up.
- **Cross-device email-link flow (`ConfirmEmailScreen`).** Requires email delivery; blocked on the same issue.
- **Actual student submission write.** Kiran signed in as a real student but didn't complete a submit flow — the editor rendered correctly, autosave was observed in earlier local testing, submit lock was verified locally. No write to production Firestore as `rnbw56f5` happened this session.
- **Assignment with `mixed` answer format worksheets.** None of rnbw56f5's current assignments have `answerFormat: "mixed"` — the hybrid render path was verified in local but not against real prod data.
- **Parent role with multi-child access to the editor.** Not exercised.
- **What happens when a worksheet's `w.title` doesn't match any catalog row.** The per-worksheet textarea fallback code path was not triggered in any live test. Unit tests cover the helper logic; the render path wasn't exercised.

---

## Surprises

### 1. Container data model

Covered above in "Mid-session corrections." Biggest single finding of the session — the spec and plan both had to be revised before any code landed.

### 2. `FIREBASE_TOKEN` rotation — untested until Session 14 pushed

The rotated token Kiran put in GitHub Secrets before Session 14 started had never been exercised. Session 14's first push was the implicit acceptance test. It worked on the first try. But the session opened with a minor anxiety — if it had failed, we'd have been blocked on token before touching any Session 14 code.

### 3. Session 13 had never actually deployed

Session 13's deploy failed on its own push with the original expired token. Session 13's code (auth path, three-tab sign-in, `ConfirmEmailScreen`, `pendingAssignmentBanner`) had been sitting on main for ~30 minutes of real time but was never live in production. Session 14's first push was therefore the first production deploy of **both** Session 13 and Session 14 simultaneously. Added risk surface, but the hosting deploy was green so it was fine.

### 4. Email-link provider not enabled in Firebase Auth

The Session 13 code path for `sendSignInLinkToEmail` assumed the **Email link (passwordless sign-in)** sign-in method was enabled in Firebase Console → Authentication → Sign-in method → Email/Password provider. It wasn't. Kiran's first attempt to exercise the email-link path in prod returned `auth/operation-not-allowed`. He flipped the toggle mid-session, and the API started accepting requests.

**This is a Session 13 hole, not a Session 14 bug.** Session 13's doc even flagged that outbound delivery was untested; what it didn't flag was that the provider toggle was never verified.

### 5. Email delivery doesn't work even with the provider enabled

After flipping the provider toggle, `sendSignInLinkToEmail` returned success (UI banner said "Sign-in link sent to..."), but no email arrived at the burner Gmail. Checked Spam, Promotions, Updates, All Mail — nothing. This may be:
- Firebase's default SMTP rate-limited/flaky
- "Email address sign-in" template not configured
- Custom SMTP assumed-configured by Session 10 but actually not

Not debugged further this session — it's a Session 13 pre-req hole that needs its own investigation. Critical follow-up: **the email-link auth path is not production-ready until outbound delivery is proven.**

### 6. Cross-service `firestore.get()` from Storage rules is unreliable

Covered in "The storage rules journey." Compiled successfully, deployed successfully, returned 403 at runtime with no useful error message. Pivoted to a simpler rule.

### 7. `pdf.js` can't send Firebase Auth tokens

Also covered above. The Firebase JS Storage SDK wasn't loaded in `index.html` — only the `storageBucket` config string. `pdf.js` does plain `fetch()` without Firebase auth, which means authenticated Storage rules always reject it. This is why iteration 2 of the rules also failed. Forced the pivot to public read.

### 8. Firebase Storage CORS is not managed by `firebase deploy`

Covered above. `storage.rules` is separate from bucket CORS config. The latter is a one-shot `gsutil` or Cloud Console operation. Not documented in the plan — had to be discovered mid-session when iteration 3 of the rules worked for direct browser nav but not for `pdf.js`'s cross-origin fetch.

### 9. `PortalHistoryTab`'s `Answer →` button text was misleading

Kiran observed mid-test that assignments with previously-submitted submissions show a locked read-only editor. The `Answer →` button on those rows doesn't say "View," it says "Answer." Opens in read-only mode, and initially confused Kiran into thinking the inputs were broken. Real behavior: correct per design. Button label could be clearer. Added to follow-ups.

### 10. `AdminsTab`'s password checkbox copy is stale

The "Also create a password account..." checkbox in the Admins tab predates Session 13. The copy says "Use this for families without a Google account" — which was true before Session 13 added email-link as a third sign-in path. Email link is now the intended default for non-Gmail families; the password path is a niche fallback. Copy needs updating. Added to follow-ups.

### 11. The portal still shows `PSM Generator` in the browser tab title

`<title>` tag in the HTML shell still says "PSM Generator — Affordable Tutoring Solutions" from Phase 1. The on-page student-portal header correctly says "Affordable Tutoring Solutions — Student Portal," but the browser tab doesn't match. Part of a broader branding inconsistency — see Follow-ups for the full polish-pass item.

### 12. The history row shows `No PDF` next to worksheets even after Session 12's migration

The Phase 2 history row render conditionally shows `Open PDF →` if `w.url` exists, otherwise "No PDF". But Session 12's migration updated `WS_RAW` catalog entries to have Storage URLs — those `w.url` values still exist at assignment creation time depending on when the assignment was created. Some assignments still render "No PDF" even though the underlying worksheet definitely has a PDF in Storage. Should be removed entirely — students don't need this badge, and the bubble-sheet editor is the primary way to view worksheets now. Added to follow-ups.

---

## State of `WISE_WRITE_ENABLED`

**Still `false`.** Orthogonal to Session 14 — no Wise writes were touched this session. Flip remains tied to Session 17 pilot rollout.

---

## Follow-ups

1. **[CRITICAL — Session 15 or earlier] Email-link auth outbound delivery.** The whole Session 13 auth path is blocked on unexplained email non-delivery. Investigate in order: (a) Firebase Console → Authentication → Templates → "Email address sign-in" — confirm template is configured; (b) Firebase Console → Authentication → Settings → SMTP — confirm whether default Firebase SMTP is in use or custom SMTP was configured by Session 10; (c) if default, expect delivery to be unreliable and consider configuring custom SMTP via SendGrid / Gmail app password / Mailgun; (d) check Firebase Console → Authentication → Users — confirm whether the burner user was actually created on a send attempt (tells us if the API accepted the request).

2. **[Session 15 scope, unchanged from spec] Auto-grading Cloud Function + `questionKeys` Firestore rules delta + Wise score post-back.** Session 14 wrote the nested `responses[]` shape Session 15's grader will consume. Grader joins `responses[i].worksheetId` → `asg.worksheets[].title` → `worksheets_catalog.json.questionIds[i]` → `questionKeys/{id}.answer`.

3. **[Session 15 scope, unchanged from Session 12] Retire the `firestore.get()` cross-service attempt properly.** Session 14's final rule is public read on `/worksheets/**`. If per-user tracking (audit logs, DRM, watermarking) ever becomes a real requirement, move to per-user signed URLs via a Cloud Function. Not a Session 15 blocker.

4. **[NEW follow-up] Portal-wide polish pass.** Before the final Phase 3 session (or as its own dedicated session), do a full sweep of the portal looking for:
   - Spelling errors (Kiran observed some during testing but didn't capture specifics)
   - Stale `PSM Generator` references in the student portal (browser tab `<title>`, any remaining in-UI references)
   - Dead UI left over from Phase 2 (e.g., the "No PDF" badge in the history row — see item 5)
   - Copy that predates Session 13 (e.g., the `AdminsTab` password checkbox — see item 6)
   - Any other "old stuff that doesn't need to be there anymore" as Kiran put it
   This should be its own session rather than bundled into Session 15 (which is already scoped to auto-grading). Tentatively **Session 16.5 or equivalent** — before Session 17 pilot rollout.

5. **[NEW follow-up, from item 4] Delete the `No PDF` badge in `PortalHistoryTab`'s worksheet row.** The `Open PDF →` / `No PDF` badge at [app.jsx:4745](../app.jsx#L4745) is Phase 2 UI that's no longer useful — students access worksheets through the bubble-sheet editor now. Just remove the conditional. Probably a 3-line diff.

6. **[NEW follow-up, from item 4] Fix `AdminsTab` password checkbox copy.** Copy at [app.jsx:1845](../app.jsx#L1845) says "Use this for families without a Google account." Post-Session-13, email link is the default for non-Gmail families; this copy is stale. New copy should say something like "Optional: create a password account in addition to email-link sign-in, for families who prefer a persistent password."

7. **[NEW follow-up, from Surprise #9] `Answer →` button label for submitted assignments.** The button in `PortalHistoryTab` says "Answer" regardless of submission status. When the assignment is submitted, clicking it opens a read-only view. Label should switch to "View →" or "Review →" when `submission.status === 'submitted'`. Requires reading submission state into the history row — minor complexity bump.

8. **[Session 15 scope] Mid-session test gap: exercise the `mixed` worksheet render path against real data.** Local tests covered the MC and FR rows; mixed was code-reviewed but not visually verified on a real mixed-format worksheet (none in rnbw56f5's current assignments). Session 15 should pick one mixed-format worksheet from the catalog, assign it to a test student, and confirm the hybrid row renders correctly.

9. **[Low priority, unchanged from Session 12] Delete the 7 `worksheets_catalog.json.bak*` backup files.** Still there. Still not blocking. Still should be removed at some point.

10. **[Low priority, from Surprise #8] Document that Firebase Storage CORS is separate from `storage.rules`.** If Phase 4+ ever touches the bucket or moves to a new one, this needs to be remembered. The `cors.json` file in repo root is the artifact — just needs a note in CLAUDE.md or somewhere durable.

11. **[Low priority, from Surprise #11] Update the HTML `<title>` tag.** `shell_head.html` probably has the literal "PSM Generator — Affordable Tutoring Solutions" string. The portal should say "ATS Student Portal" or similar. Student-portal-specific titles would be ideal if `build_index.py` supports template branching, otherwise a single "Affordable Tutoring Solutions" title fits both tutor and student views. Bundle into follow-up #4's polish pass.

12. **[Observation] First-session-deploy of Session 13 happened silently.** Session 13 ran for hours with its code on main but not in production because nobody noticed the deploy had failed. Consider adding a post-deploy Slack/email notification (or at minimum an end-of-session `gh run list --limit 1` check in the close-out ritual) so "landed on main" isn't conflated with "live in production."

---

## Checkpoint — spec coverage

- [x] `useWorksheetCatalog()` hook shipped
- [x] `InlinePdfViewer` component shipped
- [x] `WorksheetBlock` + MC/FR/mixed renderers shipped
- [x] `SubmissionEditor` rewritten for container model (stacked vertical, one block per worksheet)
- [x] Per-question `responses[]` shape with `worksheetId` tagging shipped, both legacy and nested supported in helpers
- [x] Zero-worksheet legacy textarea fallback works
- [x] Non-worksheet items (WellEd, practice exams) render as info note
- [x] Session 13's `pendingAssignmentBanner` deleted, deep-link auto-open wired
- [x] `storage.rules` shipped (landed on public read after two iterations)
- [x] `firebase.json` updated, CI workflow updated to include storage
- [x] CORS configured on the Firebase Storage bucket
- [x] Node tests updated (4 new, 58 total passing)
- [x] `esbuild` parse check passes on final code
- [x] Production deploy green for Session 13 + Session 14 combined
- [x] Real student session verified editor + PDF rendering end-to-end on prod
- [x] Render loop bug caught and fixed before land
- [x] Design doc committed: [docs/superpowers/specs/2026-04-14-session-14-submission-editor-design.md](superpowers/specs/2026-04-14-session-14-submission-editor-design.md)
- [x] Plan doc committed: [docs/superpowers/plans/2026-04-14-session-14-submission-editor.md](superpowers/plans/2026-04-14-session-14-submission-editor.md)
- [x] This session doc committed

---

## Kickoff prompt for Session 15

> Copy the block below into a fresh Claude Code session after `/clear`.

---

I'm ready to start **Phase 3 Session 15** of ats-portal: auto-grading Cloud Function trigger + Wise score post-back + `questionKeys` Firestore rules delta. Session 14 shipped the bubble-sheet `SubmissionEditor` that writes the nested `responses[]` shape tagged by `worksheetId`. Session 15 is what makes those submissions actually grade themselves and push scores back to Wise.

**Confirm today's date with me at session start before doing anything else.**

### Repo + project naming

- GitHub repo: `github.com/kiranshay/ats-portal`
- Local directory: `~/projects/ats-portal/`
- Firebase project ID: **still `psm-generator`** — immutable.
- App lives at `https://portal.affordabletutoringsolutions.org`.

### Read these in order

1. **`docs/PHASE_3_SPEC.md`** §"Worksheet data model" and §"Session plan" row 15.
2. **`docs/PHASE_3_SESSION_14.md`** — nested `responses[]` schema, the container data model, the storage rules journey, and all follow-ups.
3. **`docs/PHASE_3_SESSION_12.md`** §"questionKeys collection" — the 1,067 committed docs Session 15's grader reads.
4. **`functions/index.js`** — existing Cloud Functions (the Wise sync + the `reconcileStudentsWithWise` HTTP endpoint). Session 15 adds a new Firestore trigger alongside these.

### What Session 15 ships

- **`onSubmissionSubmit` Firestore trigger** at `students/{sid}/submissions/{subid}` — fires when a submission's `status` transitions `draft → submitted`. Reads the submission's `responses[]`, joins each `responses[i].worksheetId` → `student.assignments[].worksheets[].title` → `worksheets_catalog.json.questionIds[i]` → `questionKeys/{id}.answer`. String-normalized compare, computes `scoreCorrect / scoreTotal`, writes back to the submission doc.
- **`questionKeys` Firestore rules delta** — tutor/admin read, student/parent blocked, no client writes. Per Session 13's frozen spec.
- **Wise score post-back** via the existing Wise Cloud Function path. Gated behind `WISE_WRITE_ENABLED` (still `false`) so Session 15 tests without actually writing to Wise. Flip happens in Session 17 rollout.
- **Grader unit tests** in `functions/` covering: MC correct, MC incorrect, FR exact match, FR whitespace trim, mixed worksheet, unsupported worksheet fallback (skip grading), missing catalog entry (skip grading), partial submission (some answers empty).
- **Session 14 follow-up item #8**: exercise the `mixed` worksheet render path against real data — pick one `answerFormat: "mixed"` worksheet from the catalog, assign to a test student, visually verify the hybrid row renders.

### What NOT to do

- **Do NOT touch `SubmissionEditor`, `WorksheetBlock`, `InlinePdfViewer`, or any Session 14 client code** unless Session 14 Follow-up #7 (Answer button label) needs to move forward — and even then, do it as a separate small commit, not bundled with grader work.
- **Do NOT fix the email-link SMTP problem (Follow-up #1).** That's its own investigation and doesn't block auto-grading.
- **Do NOT touch `storage.rules` or CORS.** Session 14 closed that chapter.
- **Do NOT flip `WISE_WRITE_ENABLED`.** Session 17.
- **Do NOT start the portal-wide polish pass (Follow-up #4).** That's its own session.

### Pause at

- **Before touching `firestore.rules`** for the `questionKeys` delta. The delta is small but it's a new collection rule and deserves a pause-point walk-through.
- **Before writing any live Wise API calls** even with the flag off. The flag-gated code path should be complete, but the first Wise call happens in Session 17.
- **Before deploying the Cloud Function.** Run `firebase deploy --only functions:onSubmissionSubmit` as a targeted deploy; don't redeploy the full functions bundle.
- **If the grader needs to read `worksheets_catalog.json` from the Cloud Function context** — the catalog is a static asset on Hosting, not in Firestore. The function will need to either fetch it via HTTP at cold start, bundle it into the function source at deploy time, or read it from Cloud Storage. Walk through the tradeoff with Kiran before committing.

### Close out

Write `docs/PHASE_3_SESSION_15.md` + kickoff prompt for Session 16 (tutor "assign to Wise" button, the first real Wise write path).

### Constraints carrying forward

- **No slop.**
- **ats-portal commit override applies:** Claude may commit + push directly with short user-voice messages, no Co-Authored-By.
- **No bundler.**
- **Every new function must do its own Firebase Auth check internally.**
- **Run `gcloud auth application-default login` before any admin SDK commit** — Session 15 deploys a Cloud Function, so this is likely needed. Cloud Function deploys use the CLI's own token, not ADC, but the local test scripts (if any) against real Firestore need ADC refreshed.
- **Before Session 15 starts**: confirm the rotated `FIREBASE_TOKEN` in GitHub Secrets is still valid. Session 14 proved it works on 2026-04-15; it should still be valid for subsequent sessions, but verify with `gh run list --workflow=deploy.yml --limit 1` after the first push.
