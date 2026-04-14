# Phase 3 — Session 9: Spec & Session Plan

**Date:** 2026-04-14
**Session type:** Brainstorm + spec. **Zero code changes this session.**
**Parent docs:** [PHASE_3_SESSION_8.md](PHASE_3_SESSION_8.md) · [PHASE_2_SESSION_1.md](PHASE_2_SESSION_1.md) (structural template) · [AUTH_MIGRATION_PLAN.md](AUTH_MIGRATION_PLAN.md)
**Outcome:** this document, committed to the repo. Session 10 (SMTP) is the first implementation session of Phase 3.

---

## Scope decision

Phase 3 closes the loop between the tutor's assignment in psm-generator and the student actually doing the work, with auto-graded feedback delivered back to the tutor. Four interdependent threads:

1. **Wise API integration** — psm-generator pushes assignment notifications and feedback into the tutor's existing Wise chat with the student.
2. **Student auth via Firebase `signInWithEmailLink`** — passwordless, no prior account setup; the deep link from Wise lands students directly in the portal.
3. **Worksheet data model** — answer keys extracted from the OneDrive PDFs by an automated parser, stored per Question ID in Firestore, with student PDFs migrated to Firebase Storage.
4. **Auto-grading** — server-side Cloud Function triggered on submission, joining responses to the question-key collection and posting the score back to Wise.

**The architectural call that unlocks the other three:** Phase 3 introduces server-side code for the first time, in the form of Firebase Cloud Functions. The decision is load-bearing — it is called out explicitly in [§Cloud Functions: the new infrastructure commitment](#cloud-functions-the-new-infrastructure-commitment) and is the reason Session 11 is rated **High** risk.

## What Session 8 close discovered that changes the plan

Three facts surfaced at the end of Session 8 that the original Phase 3 kickoff did not anticipate:

1. **Answer key PDFs are machine-extractable with a 30-line parser.** Every `KEY_*.pdf` in the OneDrive folder is generated from College Board data and follows a perfectly consistent text layout: `Question ID <hex>` + `Correct Answer: <A-D or numeric>`. `pdftotext -layout` recovers these cleanly across Reading (MC), Math (MC), and Math (student-produced response). The "bulk annotate 1,500 questions by hand" path that Session 8 close was recommending is dead. See [§Worksheet data model](#worksheet-data-model).

2. **Math question *stems* and *choices* do NOT extract** (they render as embedded fonts/glyphs pdftotext can't recover). For grading this is irrelevant — only the `Correct Answer:` line matters. But any future "render SAT questions natively in-browser" ambition is a Reading-only feature until someone builds a math-aware extractor. Noted in non-goals.

3. **Wise runs on Firebase Auth.** The `createUser` response exposes each Wise user's `FIREBASE_ID` identity, and every user has a stable `email` field plus an optional `vendorUserId` that we control. This means identity join between psm-generator and Wise is a single `GET /vendors/userByIdentifier?provider=EMAIL&identifier=...` call. No sync jobs, no bulk imports. See [§Wise API integration](#wise-api-integration).

## Wise API integration

### What Wise actually supports

Verified from the Postman collection (Session 9 intake, pasted by Kiran):

| Capability | Endpoint | Phase 3 use |
|---|---|---|
| Resolve user by email | `GET /vendors/userByIdentifier?provider=EMAIL&identifier=...` | Identity join; run on first assignment per student, cache result |
| Create 1:1 chat | `POST /…/chats` (Admin Only Chat with Student) | Ensure an admin chat exists before the first message |
| Send chat message | `POST /…/chats/…/messages` (Send a Message) | Deliver the assignment deep link; later, deliver the graded score summary |
| List students in institute | `GET /institutes/v3/…/students` | One-time reconciliation: does every psm-generator student exist in Wise? |
| Create user | `POST /vendors/institutes/{id}/users` | Fallback if reconciliation finds a gap |

**Not supported, confirmed by absence in the folder list:**
- **Webhooks / events / subscriptions.** No inbound direction exists. Wise cannot notify psm-generator of anything. All integration flows are psm-generator-originated pushes.
- **No sandbox environment documented.** Dev hits the real ATS Wise institute. Session 11 must be defensive: read-only endpoints first, writes gated behind a `WISE_WRITE_ENABLED` flag, test recipient pinned to Kiran's own Wise account until the surface is proven.

Rate limit: 500 calls/minute per API key. Not a constraint at 51 students.

Auth: Basic Auth (`user_id` + `api_key`) plus required headers `x-api-key`, `x-wise-namespace`, `user-agent: VendorIntegrations/{namespace}`. These credentials **cannot live in the browser** — this is the forcing function for Cloud Functions.

### The data flow (inverted from the original vision)

The original Phase 3 framing read as "Tutor assigns PSM → Wise → psm-generator." With no webhooks, that's not possible without polling, and polling is fragile. The correct direction is:

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Tutor (existing psm-generator UI)                                         │
│  │                                                                         │
│  │  1. Assign worksheet to student                                         │
│  ▼                                                                         │
│  psm-generator client (app.jsx)                                            │
│  │                                                                         │
│  │  2. Write assignment to students/{sid}.assignments[] (as today)         │
│  │  3. Call Cloud Function: assignToWise(studentId, assignmentId)          │
│  ▼                                                                         │
│  Cloud Function: assignToWise                                              │
│  │  a. Verify Firebase ID token, authorize caller as tutor/admin           │
│  │  b. Load student doc → get email → get cached wiseUserId if present     │
│  │  c. If no wiseUserId: resolve via Wise userByIdentifier, cache it       │
│  │  d. Ensure admin chat exists                                            │
│  │  e. Wise sendMessage: "New worksheet: {title}. Start: {deepLink}"       │
│  │     deepLink = https://psm-generator.../?a=<assignmentId>&s=<studentId> │
│  ▼                                                                         │
│  Wise (tutor's existing admin chat with the student)                       │
│  │                                                                         │
│  │  4. Student receives message on Wise mobile/web                         │
│  │  5. Student taps deep link                                              │
│  ▼                                                                         │
│  psm-generator (unauthenticated landing)                                   │
│  │                                                                         │
│  │  6. Parse a=, s= from URL                                               │
│  │  7. Prompt for email, send Firebase signInWithEmailLink                 │
│  │  8. Student clicks email, Firebase signs them in (emailVerified=true)   │
│  │  9. Allowlist check passes (student is already in allowlist)            │
│  │ 10. StudentPortal loads assignment a, shows SubmissionEditor            │
│  ▼                                                                         │
│  Student submits (draft → submitted)                                       │
│  │                                                                         │
│  │ 11. submissions/{subId}.status = "submitted" (client write)             │
│  ▼                                                                         │
│  Cloud Function: gradeSubmission (Firestore onUpdate trigger)              │
│  │  a. Status transitioned draft → submitted                               │
│  │  b. Load questionKeys for this worksheet, join by questionId            │
│  │  c. Write scoreCorrect, scoreTotal, perQuestion[].correct back          │
│  │  d. Call Wise sendMessage: "Score: 8/10. Review: {deepLink}"            │
│  ▼                                                                         │
│  Tutor receives message in same Wise chat; can open deep link              │
│  to see the full report in TutorSubmissionsPanel.                          │
└────────────────────────────────────────────────────────────────────────────┘
```

Every Wise API call goes through the Cloud Function proxy. The browser never sees the Wise API key.

### What we explicitly do NOT use from Wise in Phase 3

- **`Create Assessments in a Content Section` / `Evaluate Student Assessment Submission`.** Richer alternative to the Chats post-back: pre-register each worksheet as a Wise Assessment, post grades into Wise's native gradebook. Rejected for Phase 3 because it requires bidirectional state sync (worksheets ↔ assessments), doubles the error surface, and the Chats path delivers the same end-user value with a fraction of the code. Revisit in Phase 4+ if tutors want grades to show up in Wise's native reports.
- **`enableJoinMagicLink` / `magicJoinTokenConfig`.** Wise has its own magic-link flow. Tempting as a way to skip Firebase SMTP. Rejected because Wise's magic links authenticate the student *into Wise*, not into psm-generator's Firebase Auth context — and Firestore rules require a Firebase principal with `email_verified == true`. The Wise magic link and our email link are solving different problems.

## Auth model for students and parents

### Decision: `signInWithEmailLink` replaces the password path for students and parents

Session 8 shipped a third auth method (email/password) to cover the impending ATS Google Workspace shutdown. That path stays available **for admin-issued tutor accounts** (Gmail tutors keep using Google sign-in; any non-Gmail tutor can be issued a password). For **students and parents**, the password path is unused in Phase 3: the first time a student ever signs in, they come in via a Wise-delivered deep link, enter their email, click the Firebase email link, and they're in. No password is ever set.

Rationale:
- Students and parents are the lowest-technical-literacy user cohort. Passwords = support load (forgot-password, lockouts, reuse across devices) that Aidan would absorb. Email links move that cost to zero.
- Firebase `signInWithEmailLink` sets `emailVerified = true` on completion (same mechanism as password reset). The existing `email_verified == true` rule in [firestore.rules](../firestore.rules) survives without changes.
- The email link is one-time-use and time-limited by Firebase. Safer than a password students might reuse from school accounts.

### The deep-link flow in detail

1. **Tutor assigns.** `assignToWise` Cloud Function runs (see flow diagram). Wise delivers a chat message to the student with body: `"New worksheet: {title}. Start: https://psm-generator.example/?a=<assignmentId>&s=<studentId>"`.
2. **Student taps.** Lands on psm-generator. Client parses `a` and `s` params, stashes them in `sessionStorage.pendingAssignment`, and renders the existing sign-in screen **pre-filled with an email prompt** (no tab switching needed).
3. **Student enters email.** Client calls `firebase.auth().sendSignInLinkToEmail(email, { url: currentUrlWithParams, handleCodeInApp: true })`. `currentUrlWithParams` preserves `a` and `s` so the redirect target knows what to open.
4. **Firebase sends email.** Requires custom SMTP (see [Session 10](#session-plan)). The email lands in the student's inbox with a link back to psm-generator.
5. **Student clicks.** Lands on psm-generator again. Client detects `firebase.auth().isSignInWithEmailLink(window.location.href)`, prompts for email confirmation (Firebase requires this to defend against link-forwarding), and calls `signInWithEmailLink`. Firebase creates the Auth user if new, sets `emailVerified = true`, signs them in.
6. **Allowlist check runs** (existing Session 8 code path). Student is already in the allowlist with role `student` and `studentIds: [theirOwnId]`. Pass.
7. **RoleRouter dispatches** to StudentPortal, which reads `sessionStorage.pendingAssignment` and opens that assignment directly in `SubmissionEditor`.

**Edge cases the spec locks in:**

- **Student not in allowlist.** Show "This email isn't set up for the portal yet. Ask your tutor." No Firebase account is created because the allowlist check happens post-sign-in but the UI refuses to render the portal. (A Firebase Auth user *is* created by `signInWithEmailLink`; that's unavoidable. We accept orphaned Auth users as the cost of passwordless — they are harmless without an allowlist entry.)
- **Email doesn't match Wise.** The deep link carries `s=<studentId>`, which is psm-generator's own ID. If the student signs in with a different email than the one on the student doc, the allowlist check fails (the allowlist keys on email). Good: this is the desired behavior — only the intended recipient can open the link.
- **Student uses a different device than the one that got the email.** Firebase requires the user to re-enter their email on the device that opens the link. This is standard and handled by the same sign-in screen. Session 13 implements it.
- **Parent with multiple children.** The Wise message goes to the student's chat, not the parent's. If parents need their own deep links, Session 16 adds a variant that sends to the parent's chat via `Add New Parent to existing Student` → parent gets their own `wiseUserId`. Deferred out of the critical path.

### SMTP is hard-blocking

`signInWithEmailLink` requires Firebase to send email, which requires custom SMTP configured in the Firebase console. This was Session 8 follow-up item A, originally deferred as low-priority. Phase 3 cannot ship without it. **Session 10 is SMTP setup.** See the session plan.

## Worksheet data model

### Finding: automated extraction works

`pdftotext -layout` against `KEY_*.pdf` files in `~/Desktop/stuff/OneDrive copy/NEW_ SAT Test Banks & Diagnostics/` recovers two stable fields per question across all subjects:

```
Question ID 3580533b
...
Correct Answer: A
```

Verified across samples from:
- Reading: Information & Ideas, Craft & Structure → MC letter answers
- Math: Geometry (Area & Volume, Circles), Algebra (Linear Functions) → MC letter answers AND numeric student-produced responses (e.g., `Correct Answer: 27556`, `Correct Answer: 986`)

A ~30-line Python or Node script walks the folder, runs `pdftotext` on every `KEY_*.pdf`, regex-extracts `(questionId, correctAnswer)` tuples, and writes them to Firestore. **One-shot, no manual data entry, re-runnable whenever the OneDrive folder updates.**

### Schema: per-question, not per-worksheet

The natural temptation is to store `correctAnswers: ["A","C","B",...]` on each worksheet catalog entry. Reject this: Question IDs are stable College Board identifiers, worksheets reuse questions across reshuffles, and a per-worksheet array duplicates data and rots when worksheets are regenerated.

Store instead:

```
questionKeys/
  {questionId}                          Document per question.
    {
      correctAnswer: "A" | "27556" | ...,  the answer as it appears in the KEY PDF
      subject: "Reading" | "Math",         optional, from folder path
      extractedAt: <timestamp>,
      sourceFile: "KEY_CID-Easy (7Qs).pdf", for audit
    }

worksheets_catalog.json                 Unchanged shape EXCEPT add:
  [
    {
      ... existing fields ...,
      questionIds: ["3580533b", "1e85caa9", ...],  order matches the PDF
      answerFormat: "multiple-choice" | "mixed" | "free-response",
    }
  ]
```

The `questionIds` array on the catalog entry is the **join bridge**: `responses[i]` in a submission corresponds to `questionIds[i]` in the catalog entry, which keys into `questionKeys/{id}` for grading. Order matters and must match the order questions appear in the student PDF.

`answerFormat` is derived during extraction (if every answer is A-D, it's multiple-choice; if every answer is numeric, free-response; if mixed, mixed). Drives which UI variant `SubmissionEditor` renders in Session 14.

### Firestore rules for `questionKeys`

```javascript
match /questionKeys/{questionId} {
  allow read: if isTutorOrAdmin();     // students never read this
  allow write: if false;                // only admin SDK (extraction script, Cloud Functions)
}
```

Students grading their own work would leak the answer key. Grading is server-side via a Cloud Function using the admin SDK, which bypasses rules. Students' submission docs receive `scoreCorrect` / `scoreTotal` / `perQuestion[i].correct` as the trigger's output — they see their results but never the answer bank.

### File-count audit (new Session 12 deliverable)

Catalog has 150 entries. The filesystem has 102 `KEY_*.pdf` and 93 `STU_*.pdf` files. The gap is real and must be resolved before Session 17 rollout. Session 12's extraction script doubles as an audit tool and emits:

- **Matched pairs** (catalog entry has a `stu` and a `key` file on disk): proceed to extraction + migration.
- **Catalog entries with no matching file on disk**: output list, flag for manual resolution. Likely candidates: Full Length Practice Exams, Diagnostic Exam, Literary Worksheets, Poetry Practice subfolders which use different naming conventions.
- **Disk files with no catalog entry**: output list, may need new catalog rows.

Session 12 does NOT try to auto-resolve these. It produces the report; Kiran and Aidan decide what to do with each category.

### Student PDF migration to Firebase Storage

The `stu` URLs in `worksheets_catalog.json` currently point at `1drv.ms` OneDrive share links. These are:
1. A single point of failure on Kiran's laptop (Session 7 open item E).
2. Not reliably embeddable in-browser (OneDrive's viewer has hostile CORS and iframe behavior).
3. Opaque — the student navigates away to OneDrive instead of staying inside psm-generator.

Session 12 uploads every matched `STU_*.pdf` to Firebase Storage at `worksheets/{slugified-title}.pdf` and rewrites the catalog's `stu` field to the Firebase Storage download URL. `pdf.js` (already loaded by [build_index.py](../build_index.py)) renders the PDF inline in Session 14's SubmissionEditor.

`KEY_*.pdf` files are **not** migrated — they're only needed by the extraction script, which walks the local filesystem. Tutors continue to access keys through OneDrive as today.

## Auto-grading design

### Server-side via Firestore trigger

A Cloud Function with a Firestore `onUpdate` trigger on `students/{sid}/submissions/{subId}` fires on every submission update. It grades iff the update transitioned `status: "draft" → "submitted"`:

```javascript
// Cloud Function pseudocode. Real implementation in Session 15.
exports.gradeSubmission = functions.firestore
  .document('students/{sid}/submissions/{subId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.status !== 'draft' || after.status !== 'submitted') return;

    const assignment = await loadAssignmentFromStudent(context.params.sid, after.assignmentId);
    const worksheet = lookupWorksheet(assignment);  // catalog entry
    const questionIds = worksheet.questionIds;      // [id0, id1, ...]
    const keyDocs = await Promise.all(questionIds.map(id => db.doc(`questionKeys/${id}`).get()));

    let correct = 0;
    const perQuestion = after.responses.map((r, i) => {
      const expected = keyDocs[i].data().correctAnswer;
      const actual = String(r.studentAnswer || '').trim().toUpperCase();
      const isCorrect = normalize(expected) === normalize(actual);
      if (isCorrect) correct++;
      return { questionIndex: i, correct: isCorrect };
    });

    await change.after.ref.update({
      scoreCorrect: correct,
      scoreTotal: questionIds.length,
      perQuestion,
      gradedAt: FieldValue.serverTimestamp(),
    });

    // Fire-and-forget: post the summary back to Wise.
    await postScoreToWise(context.params.sid, after.assignmentId, correct, questionIds.length);
  });
```

The normalization function handles A/a whitespace, numeric comparisons ("27556" vs "27556.0"), and is the single non-obvious piece. Session 15 defines it precisely and ships a unit-tested table.

### Why server-side, not client-side

At Session 9 kickoff this was an open question. Two things closed it:

1. **We are already adding Cloud Functions** for the Wise proxy. The "preserve the no-backend invariant" argument against server-side grading evaporates — the backend exists regardless.
2. **Client-side grading would require students to read `questionKeys`**, which leaks the entire answer bank to anyone who opens DevTools. The alternative (duplicate the correct answers into the submission doc at assign time) is messier and still leaks them.

Server-side grading keeps `questionKeys` tutor-readable only, produces scores as a trusted write, and lets Wise post-back happen in the same function invocation. One call site, one security boundary.

### Firestore rules delta for submissions

Current rules (Phase 2, [firestore.rules](../firestore.rules)) allow students to update draft submissions with only specific fields via `hasOnly([...])`. Phase 3 adds trigger-written fields on top, which the student-write path must NOT allow. The rules stay as-is on the student path:

```javascript
match /submissions/{submissionId} {
  allow read: if canReadStudent(studentId);

  allow create: if isLinkedToStudent(studentId)
    && request.resource.data.status == 'draft';

  allow update: if isLinkedToStudent(studentId)
    && resource.data.status == 'draft'
    && request.resource.data.status in ['draft', 'submitted']
    && request.resource.data.diff(resource.data).affectedKeys()
         .hasOnly(['responses', 'status', 'submittedAt', 'updatedAt']);
  // scoreCorrect, scoreTotal, perQuestion, gradedAt are NOT in the student-allowed
  // affectedKeys set. Only the admin SDK (Cloud Function) can write them.

  allow write:  if isTutorOrAdmin();
  allow delete: if isTutorOrAdmin();
}
```

Session 15 adds the `hasOnly(...)` clause if Phase 2 Session 5 didn't already; verify in the plan.

### Responses shape change

Phase 2 Session 5 shipped `SubmissionEditor` with a single textarea whose content lands at `responses[0] = {questionIndex: 0, studentAnswer: "<blob>"}`. The bubble-sheet variant needs one entry per question: `responses[i] = {questionIndex: i, studentAnswer: "A"}`.

This is a schema shift for existing drafts. Session 14 handles it:
- **New submissions** after Session 14 deploy use the per-question shape.
- **Legacy drafts** (blob shape) are either migrated in place or abandoned — Session 14 checks production state first. If zero real student submissions exist at that point (likely, since Phase 2 Session 7 rollout hasn't happened), no migration is needed.
- **Grading logic** assumes per-question shape only. If it encounters a blob-shape submission, it logs and skips without writing a score. Non-blocking fallback.

## Cloud Functions: the new infrastructure commitment

Phase 3 introduces server-side code to psm-generator for the first time. This is the single biggest architectural change in the project's history and the reason Session 11 is rated High risk.

### Why Firebase Cloud Functions, not alternatives

Options considered:

| Option | Pro | Con | Verdict |
|---|---|---|---|
| **Firebase Cloud Functions** | Native Firestore triggers, same Firebase project, `firebase deploy` is one command, Admin SDK for bypassing rules, Firebase Auth verification built-in | Requires GCP billing to be enabled (Blaze plan), first time psm-generator runs server code, cold starts | **Chosen** |
| Cloudflare Worker | Free tier, fast cold starts, simple deploy | New vendor; Firestore triggers require polling or Eventarc; Firebase Admin SDK in Workers is awkward | Rejected |
| Fly.io / Render tiny Node server | Familiar shape | Always-on cost, more ops surface, harder auth story | Rejected |
| Stay client-side, duplicate keys into submission docs | Preserves no-backend invariant | Leaks answer keys; Wise API key can't live in browser regardless | Rejected |

Cloud Functions wins because we need Firestore triggers (for grading) AND authenticated HTTP endpoints (for the Wise proxy) AND admin-SDK access (for trusted writes). It is the only option that provides all three natively.

**Cost impact:** Firebase Blaze plan requires a billing account. Free tier covers 2M function invocations/month; at 51 students × (1 assign + 1 grade + 1 post-back) per assignment, we're looking at ~hundreds of invocations/week. Cost is ~$0/month for the foreseeable future.

### The proxy surface area

Four HTTP-triggered functions (for tutor-initiated Wise calls) and one Firestore-triggered function (for grading). All live in a new top-level `functions/` directory.

```
functions/
  package.json           firebase-functions, firebase-admin, node-fetch
  index.js               exports all five functions
  wise.js                all Wise API calls live here — one SPOF for Wise changes
  auth.js                verifyCallerIsTutor(req), verifyCallerIsStudent(req)
  grade.js               grading logic + normalize() table
  .env.local             WISE_API_KEY, WISE_USER_ID, WISE_INSTITUTE_ID, WISE_NAMESPACE
                         never committed; deployed via `firebase functions:secrets:set`
```

HTTP functions (callable from the browser via `httpsCallable`):

1. **`assignToWise({ studentId, assignmentId })`** — tutor only. Resolves Wise user, ensures chat, sends the deep-link message. Returns `{ ok: true, wiseUserId, chatId }`.
2. **`reconcileStudentsWithWise()`** — admin only. Walks the psm-generator student list, hits `userByIdentifier` for each, returns a report of matched/unmatched/email-mismatched students. Run manually before Session 17 rollout. Does NOT auto-create Wise users — Kiran reviews the report and creates missing ones by hand.
3. **`sendStudentMessage({ studentId, text })`** — tutor only. Wraps Wise sendMessage for ad-hoc tutor notes. Bonus; may be cut from Session 11 scope if it's not needed.
4. **`gradeSubmissionManual({ studentId, submissionId })`** — tutor only. Re-runs grading for a submission (e.g., after a `questionKeys` fix). Bypasses the `draft → submitted` trigger gate. Useful for post-launch corrections; may be deferred.

Firestore trigger:

5. **`gradeSubmission`** — `onUpdate` for `students/{sid}/submissions/{subId}`. See [§Auto-grading design](#auto-grading-design).

### Security model

Every HTTP function:
1. Verifies the Firebase ID token via `functions.https.onCall` (automatic) or `admin.auth().verifyIdToken(req.headers.authorization)` (manual).
2. Loads the caller's allowlist entry.
3. Authorizes the specific action based on the caller's role — tutors can assign to their own students, admins can reconcile, students cannot call any of these directly.

The Wise API key is injected via Firebase Functions secrets (`firebase functions:secrets:set WISE_API_KEY`). It is never in the repo, never in client code, never logged.

### What Cloud Functions does NOT do

- **No generic API gateway.** Only the specific Wise calls needed for Phase 3. Adding a new Wise endpoint requires editing `functions/wise.js` and redeploying.
- **No cron jobs.** No scheduled reconciliation, no daily sync. Reconciliation is a manual admin action.
- **No other integrations.** Google Calendar, OneDrive, etc. are out of scope. Only Wise.
- **No queueing / retry beyond what Cloud Functions provides natively.** The grading trigger has at-least-once semantics; `gradeSubmission` must be idempotent (re-writing the same score on a re-fire is safe). Wise sendMessage failures are logged but not retried — if a score post-back fails, the tutor sees the score in psm-generator but not in Wise, and can manually re-send via `sendStudentMessage`.

## Firestore schema deltas from Phase 2

Additions only — nothing in the Phase 2 schema is removed or renamed.

```
students/{studentId}
  + wiseUserId: string          cached after first resolve. Written by assignToWise
                                CF, never by the client.
  + wiseResolveAttempts: int    counter. Not load-bearing; useful for audit.

  submissions/{submissionId}
    + scoreCorrect: int         written by gradeSubmission trigger
    + scoreTotal: int           written by gradeSubmission trigger
    + perQuestion: [             written by gradeSubmission trigger
        { questionIndex, correct: bool }, ...
      ]
    + gradedAt: timestamp       written by gradeSubmission trigger

questionKeys/{questionId}       NEW collection. Admin SDK writes only.
  {
    correctAnswer: string,
    subject: string,
    answerFormat: string,
    extractedAt: timestamp,
    sourceFile: string,
  }

worksheets_catalog.json         NOT in Firestore — still shipped with the app.
  + questionIds: [string, ...]  per entry, length == qs
  + answerFormat: string        per entry
```

No migration is required for existing documents — all new fields are optional, and the `responses` shape change is handled by Session 14 as described.

## Session plan

| # | Session | Ships | Risk | Dependency |
|---|---|---|---|---|
| **9** | **Spec (this session)** | `PHASE_3_SPEC.md`. Zero code. | None | — |
| **10** | **Custom SMTP for Firebase Auth** | SendGrid (or Postmark) account, DNS SPF/DKIM records, verified sender, email template customized, test send to Kiran's personal email | Low | — |
| **11** | **Cloud Functions proxy + `lib/wise.js`** | Billing enabled, `functions/` directory scaffolded, four HTTP callables (`assignToWise`, `reconcileStudentsWithWise`, `sendStudentMessage`, maybe `gradeSubmissionManual`), secrets deployed, `lib/wise.js` client-side wrapper that calls the HTTP callables. **No Firestore trigger yet.** First deploy is read-only reconcile only; writes gated behind `WISE_WRITE_ENABLED` flag. | **High** (first server code, real $$, real prod surface) | 10 |
| **12** | **Extraction + audit + PDF migration** | `scripts/extract_answer_keys.mjs` (Node, uses `pdftotext` via child_process), `scripts/audit_catalog.mjs`, `scripts/migrate_stu_pdfs.mjs`, `questionKeys` collection populated, `worksheets_catalog.json` rewritten with `questionIds` + `answerFormat` + new Firebase Storage URLs, audit report in `docs/PHASE_3_CATALOG_AUDIT.md` | Medium (open-ended audit output; unknown shape of Full Length Exams etc.) | — |
| **13** | **`signInWithEmailLink` + deep-link handler** | New sign-in path in `SignInScreen`, deep-link URL parser, `sessionStorage.pendingAssignment`, updated `SignInScreen` copy, same-device and cross-device flows tested, dev bypass (`?dev=1`) still works | Medium | 10 |
| **14** | **Bubble-sheet `SubmissionEditor` + in-browser PDF viewer** | MC grid component, free-response input component, hybrid layout for `answerFormat: "mixed"`, per-question `responses[]` shape, `pdf.js` viewer alongside the answer entry area, Phase 2 textarea path kept as fallback for any worksheet without `questionIds` | Medium | 12 |
| **15** | **Auto-grading trigger + Wise post-back** | `gradeSubmission` Firestore trigger, `normalize()` answer-comparison table with unit tests, score fields written back, `TutorSubmissionsPanel` updated to display `scoreCorrect/scoreTotal`, Wise post-back via `sendMessage` | Medium-High | 11, 12 |
| **16** | **Tutor "assign to Wise" wiring** | Tutor UI button in `StudentProfile` calls `assignToWise`, loading + error states, success confirmation showing the Wise chat URL | Low | 11, 13 |
| **17** | **Real family rollout** | First 3-5 students end-to-end: admin reconciles, allowlist entries added, tutor assigns via Wise, student receives email link, completes worksheet, score posts back. Monitor for 1 week before wider rollout. | Medium | all above |

Every session after this one starts with its own spec-review → plan → review cycle, as in Phase 2.

## Non-goals for Phase 3

Explicitly out of scope. Named so future sessions don't scope-creep.

1. **Wise Assessments integration.** Using Wise's native assessment/gradebook objects instead of Chats for score post-back. Phase 4+ only.
2. **Wise webhooks / polling for tutor-initiated actions in Wise.** Tutors assign from psm-generator, not from Wise. If they start assigning worksheets directly inside Wise, that's a different product and a different Phase.
3. **Native in-browser question rendering.** The finding that answer-key PDFs contain extractable question text is a Phase 4+ unlock, and only for Reading (Math stems don't extract). Phase 3 serves the student PDF as-is.
4. **Automatic parent notifications.** Phase 3 sends the assignment and score to the student's Wise chat. If parents need their own deep links delivered to a separate chat, that's a Session 16+ extension, not the critical path.
5. **Gradebook / historical score visualization for students.** Score Trends chart (Phase 2 Session 3) covers the tutor view. A student-facing "my past worksheets" view is deferred.
6. **Retention or expiration of deep links.** Links are URLs with query params; Firebase email links carry their own expiry. No additional expiry layer.
7. **Auto-creating Wise users for missing students.** Session 11's reconciliation reports gaps; Kiran creates them manually via Wise UI or a one-off admin call. Automating this would risk spamming Wise with duplicates on misconfiguration.
8. **Math question stem extraction.** `pdftotext` doesn't recover math expressions. Not a Phase 3 problem.
9. **Cron / scheduled jobs in Cloud Functions.** No daily sync, no automated reconciliation. Every Cloud Function call is either tutor-initiated or trigger-initiated.
10. **Auth migration Phases C and D.** Still deferred from Phase 2. `isWorkspaceUser()` stays in the rules OR chain.
11. **Bundler / build tool introduction.** Phase 2 constraint carries forward. Phase 3 Cloud Functions are a new `functions/` directory with its own `package.json` — that's Node tooling, not a frontend bundler. The client-side app stays bundler-free.
12. **Any change to `firestore.rules` beyond the `questionKeys` collection and the `hasOnly([...])` clause on submissions.** Phase 2's rules shape is load-bearing and re-testing them is out of scope.

## Open questions deferred to later sessions

Intentionally unresolved. Each is scoped to the session that actually needs the answer.

- **SMTP vendor choice: SendGrid vs Postmark vs Amazon SES.** SendGrid is the Firebase docs' default. Postmark has better transactional-email reputation. SES is cheapest. **Trigger: Session 10.**
- **Deep-link URL scheme.** Query params (`?a=...&s=...`) are simple but visible in Wise chat history. Opaque signed tokens are uglier but safer. For the 51-student trusted pilot, query params are fine. **Trigger: Session 13 if anyone objects.**
- **Whether `gradeSubmissionManual` ships in Session 11 or later.** Nice to have; not critical. **Trigger: Session 15 if grading bugs force a re-grade.**
- **Handling of worksheets with `answerFormat: "mixed"` in the bubble-sheet UI.** Two columns? Separate sections? One row per question with a type-switching input? **Trigger: Session 14.**
- **Cross-device email-link sign-in UX.** Firebase requires re-entering the email on the opening device. How do we explain this to parents who forward the link to their kid? **Trigger: Session 13.**
- **Session 11 first-deploy verification plan.** How do we test `assignToWise` against real Wise without spamming real students? Proposal: hardcode the test recipient to Kiran's own Wise account for the first week. **Trigger: Session 11.**
- **Whether Session 12 migrates KEY PDFs to Firebase Storage too.** Currently no — extraction is filesystem-only and tutors access keys via OneDrive. If the extraction script needs to re-run after Kiran's laptop dies, we need another source. Low-cost insurance to migrate them too. **Trigger: Session 12.**
- **Reconciliation gap resolution.** When Session 11's reconcile finds psm-generator students not in Wise (or vice versa), what's the rule for resolving? **Trigger: Before Session 17 rollout.**

## What changes in Session 10

Session 10 implements custom SMTP for Firebase Auth. Scope is small but load-bearing.

1. **Vendor selection.** Default to SendGrid unless Session 10 surfaces a reason to pick differently.
2. **Account setup.** Free-tier account, API key generated. Credentials go into a Kiran-only password store, NOT into the repo.
3. **DNS configuration.** SPF and DKIM records on the domain Firebase Auth emails are sent from. This is a zone-file change — Kiran runs it, not Claude.
4. **Firebase Auth SMTP configuration.** Firebase console → Authentication → Templates → SMTP settings. Paste credentials, set sender name/email, customize the "email sign-in" template copy to mention ATS.
5. **Test send.** Trigger a `sendSignInLinkToEmail` call against Kiran's personal email. Confirm delivery, confirm the link opens the app. Dev bypass flow, not prod.
6. **Document** in `docs/PHASE_3_SESSION_10.md` what shipped and a kickoff prompt for Session 11.

Session 10 does NOT touch `app.jsx`. No code changes. It's pure infra configuration.

## Checkpoint

This session is complete when:
- [x] Phase 3 vision decomposed into executable sessions
- [x] Wise API integration scoped against actual endpoint evidence
- [x] Auth model locked (`signInWithEmailLink`, Firebase SMTP, deep-link flow)
- [x] Worksheet data model defined (automated extraction, per-question schema)
- [x] Cloud Functions commitment named and justified
- [x] Session plan with risk ratings
- [x] Non-goals explicitly named
- [x] This spec committed to the repo
- [x] Kickoff prompt for Session 10 appended below
- [ ] Kiran reviews the spec and commits
- [ ] Kiran `/clear`s and starts Session 10 using the kickoff prompt below

---

## Kickoff prompt for Session 10

> Copy everything between the horizontal rules below into a fresh Claude Code session, after running `/clear` in the psm-generator workspace.

---

I'm ready to start **Phase 3 Session 10** of psm-generator: custom SMTP setup for Firebase Auth. This session is **infra configuration only** — no `app.jsx` changes, no code. Scope is narrow but the work is load-bearing: every subsequent Phase 3 session depends on email-link sign-in actually delivering email.

**Confirm today's date with me at session start before doing anything else.**

### Read these in order

1. **`docs/PHASE_3_SPEC.md`** — the authoritative Phase 3 spec. "What changes in Session 10" is your scope. Everything in Session 11+ is context only.
2. **`docs/PHASE_2_SESSION_7.md`** (or whichever session's follow-ups documented SMTP as item A) — the original framing of why SMTP is blocking.
3. **Firebase console** — Authentication → Templates → SMTP settings. You can't touch this, but you should know where Kiran will paste credentials.

### What to do in this session

1. **Research and recommend a vendor.** Default: SendGrid. If you find a compelling reason to pick Postmark or SES instead, make the case and let Kiran decide. Justify on deliverability, free tier, ease of setup — in that order.
2. **Write a setup checklist** Kiran can follow manually:
   - Create account
   - Generate API key
   - Configure DNS records (SPF, DKIM) for the sender domain — list the exact record values
   - Configure Firebase Auth SMTP settings in the Firebase console
   - Customize the email sign-in template copy
   - Run a test send to Kiran's personal email
3. **Write a rollback plan.** If the SMTP configuration breaks Firebase Auth in some unexpected way, how do we revert in under 5 minutes?
4. **Write `docs/PHASE_3_SESSION_10.md`** capturing the vendor choice, the DNS records added, any screenshots Kiran took, and a kickoff prompt for Session 11.

### What NOT to do

- **Do NOT touch `app.jsx`.** Session 13 implements the client-side sign-in flow. Session 10 is pure Firebase console + DNS.
- **Do NOT write any Cloud Functions code.** Session 11 is the Cloud Functions session. Don't scaffold `functions/` in Session 10.
- **Do NOT touch `firestore.rules`, `worksheets_catalog.json`, or the build pipeline.**
- **Do NOT upload any secrets, credentials, or API keys to the repo.** DNS records are public; API keys are not.
- **Do NOT run any DNS changes yourself.** Kiran operates the domain registrar.

### Pause at the first natural checkpoint

- **After the vendor recommendation is written**, before any account is created — Kiran approves.
- **After the setup checklist and DNS record values are written**, before Kiran makes changes — Kiran reviews the exact records he's about to add to the zone file.
- **After the test send succeeds**, before closing the session — Kiran confirms he received the email and the link opened correctly.

Stop at the first one. Report. Wait.

### Close out

Write `docs/PHASE_3_SESSION_10.md` capturing:
- Vendor chosen and why
- DNS records added (the exact values, for audit)
- Any surprises or follow-ups
- Kickoff prompt for Session 11 (Cloud Functions + Wise proxy)

### Constraints that carry forward from Phase 2 and Session 8

- **No slop.** Honest, verified claims. No filler.
- **psm-generator commit override applies:** Claude may commit + push directly with short user-voice messages, no Co-Authored-By.
- **No bundler.** `functions/` gets its own `package.json` in Session 11 — that's Node server tooling, not a frontend bundler. The client app stays bundler-free.
- **Do not widen `email_verified == true` in firestore.rules.** Still load-bearing.

---
