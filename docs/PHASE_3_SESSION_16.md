# Phase 3 — Session 16: Null-answer re-extraction + Wise chat→discussion migration + Node 22

**Date:** 2026-04-15
**Session type:** Data-layer fix (extraction regex + Firestore commit), Cloud Function migration (chat API → discussion API), runtime upgrade (Node 20 → 22, firebase-functions 5.x → 7.x). One deploy: functions-only. No hosting deploy (no client changes).
**Parent docs:** [PHASE_3_SESSION_15.md](PHASE_3_SESSION_15.md) · [PHASE_3_SESSION_12.md](PHASE_3_SESSION_12.md) · [PHASE_3_SESSION_11b.md](PHASE_3_SESSION_11b.md)
**Outcome:** All 62 silently-dropped null answers from Session 12 recovered and committed to Firestore (`questionKeys/{id}` collection now has 1,126 docs, up from 1,067). `assignToWise` migrated from the Wise chat API (`ensureAdminChat` + `sendChatMessage`) to the discussion/announcement API (`resolveClassForStudent` + `createDiscussion`). Node runtime bumped to 22; `firebase-functions` upgraded from 5.1.1 to 7.2.5. Live smoke test: Michael received the discussion notification on his Wise class.

---

## What shipped

### 1. Null-answer re-extraction (Workstream A)

**Root cause:** 62 questions across 40 worksheets had `correctAnswer: null` in `extraction_output.json` because their KEY PDFs omit the `Correct Answer:` label entirely. Instead of the expected format:

```
ID: {hex} Answer
Correct Answer: B
Rationale
...
```

These blocks jump straight from the `Answer` header to the `Rationale` section:

```
ID: {hex} Answer
Rationale
Choice D is correct...          (MC)
The correct answer is 7.        (FR)
```

The Session 12 regex (`/Correct Answer:\s*(.+?)(?:\s{3,}|\r?\n|\r|$)/`) never matched because the literal text `Correct Answer:` doesn't exist in these blocks.

**Fix:** Added a cascading fallback extraction chain to `extractFromPdf()` in `scripts/extract_answer_keys.mjs`:

1. **Primary** (unchanged): `Correct Answer: X` regex
2. **Fallback MC**: `Choice [A-D] is correct` in rationale → single letter
3. **Fallback Note**: `Note that X and Y are examples` (newline-aware via `/s` flag) → multi-answer FR (e.g. `"1/6, .1666, .1667, 0.166, 0.167"`)
4. **Fallback FR**: `The correct answer is X.` where X is a clean numeric
5. **Fallback Either**: `either X or Y` → dual-answer FR (e.g. `"0, 3"`)

Additional fix: `stripThousands` normalizer removes comma-thousands formatting (`"3,540"` → `"3540"`) so the grader's comma-split doesn't misinterpret it as two separate answers. Only affected question `9ee22c16` (appearing in two worksheets).

**Results:**
- 62/62 recovered, 0 nulls remaining
- 9 MC, 53 FR (of which 2 via Note pattern, 2 via Either pattern)
- 1,126 unique `questionKeys/{id}` docs written to Firestore (up from 1,067)
- Spot-checked 5 previously-null docs in Firestore post-commit: all correct

**No function redeploy needed** — the grader reads `questionKeys` at runtime. Students immediately get full grading coverage on the 40 affected worksheets.

### 2. Wise chat → discussion migration (Workstream B)

**What changed:**

`assignToWise` callable migrated from posting a chat message to posting a discussion (Wise's "announcement" API). This matches Kiran's Session 15 directive: "Anything posted to Wise regarding PSM should be just as a discussion (for a new PSM) posted to the student's Wise when a tutor/admin assigns a PSM."

**New functions in `functions/wise.js`:**

| Function | Endpoint | Purpose |
|---|---|---|
| `listInstituteClasses(cfg)` | `GET /institutes/{id}/classes` | Fetch all classes with `joinedRequest` arrays |
| `resolveClassForStudent(cfg, wiseUserId)` | (uses listInstituteClasses) | Scan classes to find the 1:1 class containing the student |
| `createDiscussion(cfg, classId, { title, description })` | `POST /user/createAnnouncements` | Post a discussion to a class |

**`assignToWise` callable changes (`functions/index.js`):**

Old flow:
1. `resolveRecipient()` → Wise user ID
2. `ensureAdminChat()` → get/create admin chat
3. `sendChatMessage()` → post message to chat

New flow:
1. Dev mode: use `DEV_TEST_CLASS_ID` from env
2. Real mode: check cached `wiseClassId` on student doc, or resolve via `resolveClassForStudent()` + cache
3. `createDiscussion()` → post discussion to the student's 1:1 class

Discussion format:
- Title: `"New PSM: {worksheet title}"`
- Body: `"You have a new PSM assignment. Start here: {deepLink}"`

**New config:**
- `DEV_TEST_CLASS_ID` added to `functions/config.js` and `functions/.env`
- Set to `6807139ccf1d99a633a6ced6` (Michael's class) for dev-mode testing

**What didn't change:**
- `sendStudentMessage` still uses the chat API (it's for ad-hoc tutor notes, not PSM assignments)
- `lib/wise.js` client wrapper unchanged (same contract: `assignToWise({ studentId, assignmentId })`)
- `app.jsx` — no tutor button wired yet

### 3. Node 20 → 22 + firebase-functions upgrade (Workstream C)

| | Before | After |
|---|---|---|
| `engines.node` | `"20"` | `"22"` |
| `firebase-functions` | `^5.1.0` (5.1.1 installed) | `^7.2.5` |
| `firebase-admin` | `^12.6.0` | `^12.6.0` (unchanged) |

**Breaking changes from v5 → v7:** None for our code patterns. The project already uses v2 APIs (`onCall`, `onDocumentUpdated`, `defineSecret`/`defineString`/`defineBoolean`). The removed `functions.config()` API was never used.

Node 20 soft-deprecation was 2026-04-30 (15 days from session date). Decommission was 2026-10-30. Bumped with 15 days to spare.

---

## The deploy

### Deploy 1 — `firebase deploy --only functions`

Single deploy covering all four functions: `reconcileStudentsWithWise`, `assignToWise`, `sendStudentMessage`, `onSubmissionSubmit`. Clean first try. Node 22 runtime active. No deploy warnings about outdated runtime or firebase-functions version.

No hosting deploy this session — no `app.jsx`, `embed.js`, or `build_index.py` changes.

---

## Smoke test

Kiran loaded the Firebase Functions compat SDK via DevTools on the portal (signed in as `support@affordabletutoringsolutions.org`) and called:

```js
firebase.app().functions("us-central1")
  .httpsCallable("assignToWise")({ studentId: "rnbw56f5", assignmentId: "s62qx0bh" })
  .then(r => console.log(r.data))
```

Called Michael to confirm — he received the discussion notification on his Wise class. Discussion title and deep link both present.

---

## Surprises

### 1. The "Note that" regex needed newline-aware matching

The `Note that X and Y are examples` line in CBQB PDFs sometimes spans a line break:

```
Note that 1/5 and .2 are
examples of ways to enter a correct answer.
```

The initial regex `/Note that (.+?)(?:are|is an?) example/` failed because `are` and `example` were separated by `\n`. Fixed with the `/s` flag (dot-matches-newline) AND changing `are example` to `are\s+example`.

### 2. Comma-thousands in answer values

Question `9ee22c16` has the answer `3,540` — the comma is thousands formatting, not a delimiter between alternative answers. The grader's `gradeFr` splits on commas, which would misinterpret `"3,540"` as two answers (`"3"` and `"540"`). Fixed by adding `stripThousands` in the fallback extraction path.

### 3. Firebase Functions compat SDK not loaded in DevTools

The initial DevTools smoke test (`firebase.app().functions(...)`) failed with `functions is not a function` because `app.jsx` doesn't load `firebase-functions-compat.js`. Session 11b's `lib/wise.js` lazy-loads it, but that module isn't imported from `app.jsx` yet. Worked around by manually injecting the script tag via DevTools.

---

## State of `WISE_WRITE_ENABLED`

**Still `false`.** The discussion path is live and tested but gated. Session 17 flips the flag after the tutor UI button is wired.

---

## Testing performed

- **`node --test functions/grade.test.js`** — 20 tests, all pass
- **`node --test tests/portal.test.mjs`** — 58 tests, all pass
- **`node -e "require('./functions/index.js')"` parse check** — clean with firebase-functions 7.2.5
- **Extraction dry-run** — 0 nulls, 62 fallback-recovered, 0 trailing-dot problems, 0 comma-thousands
- **Extraction `--commit`** — 1,126 docs written, 5 spot-checked in Firestore post-commit
- **Live smoke test** — `assignToWise` called via DevTools, Michael received the discussion notification

### What was NOT tested this session

- **Real-mode `assignToWise`** (with `WISE_WRITE_ENABLED=true`). The `resolveClassForStudent` scan + `wiseClassId` caching path was not exercised end-to-end against a real student's class. Dev mode bypasses class resolution entirely.
- **Tutor UI button**. `lib/wise.js` is ready but not wired into `app.jsx`.
- **`onSubmissionSubmit` on Node 22.** The trigger was redeployed as part of the functions deploy but no new submission was created to verify it fires correctly on the Node 22 runtime. The grading logic is unchanged; the risk is low.
- **`sendStudentMessage`** (still chat-based, redeployed with the new runtime but not exercised).

---

## Follow-ups

1. **[Session 17 scope] Wire the tutor "Assign to Wise" button in `app.jsx`.** Import `assignToWise` from `lib/wise.js`, add a button in the tutor's assignment creation or student profile flow, handle loading/error/success states. The `firebase-functions-compat.js` script tag needs to be added to `index.html` (currently lazy-loaded by `lib/wise.js` but not pre-loaded).

2. **[Session 17 scope] Flip `WISE_WRITE_ENABLED=true`.** Once the tutor button is wired and tested against the dev class, flip the flag and assign the first real PSMs. Deploy: `firebase deploy --only functions`.

3. **[Session 17 scope] Populate `DEV_TEST_CLASS_ID` for real testing, then clear it.** The current value (`6807139ccf1d99a633a6ced6`, Michael's class) is fine for dev testing. Once `WISE_WRITE_ENABLED` is flipped, `DEV_TEST_CLASS_ID` is ignored — can be cleared from `.env` for hygiene.

4. **[Session 17 scope] Test real-mode class resolution.** The `resolveClassForStudent` scan needs to be exercised with `WISE_WRITE_ENABLED=true` to verify the class lookup + `wiseClassId` caching works against real Wise data. If the institute has many classes, the single-page scan in `listInstituteClasses` may need pagination.

5. **[Low priority] Migrate CI auth to Workload Identity Federation.** Carried from Session 15 Follow-up #6a. The `--token` flag is deprecated.

6. **[Low priority, unchanged] Row [116] Percentages duplicate-title triage.** Carried from Session 12.

7. **[Deferred] Aidan's student-portal UX asks.** Per-worksheet submit, student dashboard, external-item completion, instruction parity. Carried from Session 15 Follow-up #11.

---

## Checkpoint

- [x] `extract_answer_keys.mjs` extended with fallback extraction chain (MC rationale, FR rationale, Note pattern, Either pattern)
- [x] `stripThousands` normalizer for comma-thousands formatting
- [x] Extraction dry-run: 0 nulls remaining (was 62)
- [x] Extraction `--commit`: 1,126 `questionKeys/{id}` docs in Firestore (up from 1,067)
- [x] 5 spot-checked in Firestore post-commit
- [x] `functions/wise.js`: `listInstituteClasses`, `resolveClassForStudent`, `createDiscussion` added
- [x] `functions/config.js`: `DEV_TEST_CLASS_ID` param added
- [x] `functions/.env`: `DEV_TEST_CLASS_ID=6807139ccf1d99a633a6ced6`
- [x] `functions/index.js`: `assignToWise` migrated from chat to discussion API
- [x] `functions/index.js`: stale comments updated (Session 16 migration note, removed post-back references)
- [x] `functions/package.json`: `engines.node` → `"22"`, `firebase-functions` → `^7.2.5`
- [x] All tests pass (20 grader + 58 portal)
- [x] `firebase deploy --only functions` — clean, all four functions deployed on Node 22
- [x] Live smoke test: Michael received discussion notification via dev-redirect
- [x] This doc committed to the repo

---

## Kickoff prompt for Session 17

> Copy the block below into a fresh Claude Code session after `/clear`.

---

I'm ready to start **Phase 3 Session 17** of ats-portal: first real family rollout. Session 16 shipped the Wise discussion migration, fixed the 62-null answer gap, and bumped to Node 22. Session 17 wires the tutor UI button, flips `WISE_WRITE_ENABLED`, and assigns the first real PSMs to real students.

**Confirm today's date with me at session start before doing anything else.**

### Repo + project naming

- GitHub repo: `github.com/kiranshay/ats-portal`
- Local directory: `~/projects/ats-portal/`
- Firebase project ID: **still `psm-generator`** — immutable.
- App lives at `https://portal.affordabletutoringsolutions.org`.

### Read these in order

1. **`docs/PHASE_3_SESSION_16.md`** — what just shipped and the remaining follow-ups.
2. **`lib/wise.js`** — the client-side wrapper that needs to be imported into `app.jsx`. Note the lazy-load pattern for `firebase-functions-compat.js`.
3. **`functions/index.js`** §`assignToWise` — the server-side callable, now posting discussions. Understand the return shape: `{ ok, mode, classId, deepLink }`.
4. **`app.jsx`** — find where assignments are created/displayed in the tutor flow. The "Assign to Wise" button goes there.
5. **`functions/.env`** — `WISE_WRITE_ENABLED=false`, `DEV_TEST_CLASS_ID=6807139ccf1d99a633a6ced6`. Both need attention this session.

### What Session 17 ships

**A. Tutor "Assign to Wise" button**
- Import `assignToWise` from `lib/wise.js` in `app.jsx`.
- Add `<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-functions-compat.js"></script>` to `index.html` (or keep the lazy-load and verify it works).
- Add a button in the tutor's student profile or assignment view that calls `assignToWise({ studentId, assignmentId })`.
- Handle loading, error, and success states. On success, show the discussion was posted (no URL to link to — the `createAnnouncements` API doesn't return an announcement ID).

**B. `WISE_WRITE_ENABLED` flip**
- Test the button end-to-end against `DEV_TEST_CLASS_ID` first.
- Then flip `WISE_WRITE_ENABLED=true` in `functions/.env` and redeploy: `firebase deploy --only functions`.
- Test against a real student. The first real-mode call will trigger `resolveClassForStudent` (Wise API scan) and cache `wiseClassId` on the student doc.

**C. First real PSM assignments**
- Kiran assigns real PSMs to real students via the tutor UI.
- Monitor `firebase functions:log --only assignToWise` for the first real-mode calls.
- Verify students receive the discussion notification on Wise.

### What NOT to do

- **Do NOT change `functions/wise.js` or the `assignToWise` callable logic.** Session 16 shipped the migration. Session 17 wires the UI and flips the flag.
- **Do NOT touch the grading pipeline.** `onSubmissionSubmit`, `grade.js`, `questionKeys` are all stable.
- **Do NOT touch `SubmissionEditor`, `WorksheetBlock`, or `AnswerResultIndicator`.** Session 15 shipped the grading UI.
- **Do NOT touch `storage.rules`, CORS, or Session 14 client code.**

### Pause at

- **Before wiring the button in `app.jsx`** — confirm the button placement with Kiran (which view, which component, what the trigger is).
- **Before flipping `WISE_WRITE_ENABLED`** — complete a successful dev-mode test via the tutor button first.
- **Before the first real student assignment** — Kiran selects which student and which PSM.
- **Before ANY hosting deploy** — `python3 build_index.py` first.

### Close out

Write `docs/PHASE_3_SESSION_17.md` + kickoff for Session 18 (Aidan's student-portal UX rework or next priority).

### Constraints carrying forward

- **No slop.**
- **ats-portal commit override applies:** Claude may commit + push directly with short user-voice messages, no Co-Authored-By.
- **No bundler.** `build_index.py` produces `index.html`, always run before hosting deploys.
- **Every new function must do its own Firebase Auth check internally.**
- **PSM scores are portal-only. Wise only sees the tutor-initiated discussion for new PSM assignments.** Never a chat, never a score post-back.
