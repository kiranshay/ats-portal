# Phase 3 — Session 9: Brainstorming Outcome

**Date:** 2026-04-14
**Session type:** Brainstorm + spec. Zero code.
**Output:** [PHASE_3_SPEC.md](PHASE_3_SPEC.md) — the authoritative Phase 3 spec.

## What happened

Session 8 closed with Phase 3 scoped as four interdependent threads (Wise integration, student auth, worksheet data model, auto-grading) and a handful of unresolved architectural decisions. Session 9's job was to resolve them into an executable plan.

Inputs read:
- `worksheets_catalog.json` (150 entries, flat list, per-worksheet metadata only)
- Sample `KEY_*.pdf` and `STU_*.pdf` files from `~/Desktop/stuff/OneDrive copy/NEW_ SAT Test Banks & Diagnostics/` via `pdftotext -layout`, across Reading and Math, MC and free-response
- `SubmissionEditor` and `TutorSubmissionsPanel` in `app.jsx`
- Wise API Postman collection (pasted by Kiran; WebFetch blocked by client-side rendering)
- `docs/PHASE_2_SESSION_1.md` as the structural template

## Decisions locked

1. **Cloud Functions enters the project.** Phase 3 introduces the first server-side code psm-generator has ever had. Justified by two forcing functions: (a) the Wise API key cannot live in the browser, and (b) server-side grading is the only way to keep `questionKeys` unreadable to students. Rejected alternatives: Cloudflare Workers, Fly.io/Render, client-side-with-duplicated-keys.

2. **Data flow is inverted from the original vision.** Wise has no webhooks. psm-generator is the origin of every integration call: tutor assigns in psm-generator → Cloud Function → Wise `sendMessage` with deep link. Student taps, lands in psm-generator, signs in via Firebase email link, submits, grading trigger runs, Wise `sendMessage` delivers the score back to the same chat.

3. **`signInWithEmailLink` replaces the password path for students and parents.** Tutors keep Google / email-password. Passwords are zero support load for kids who never have to set them. Requires custom SMTP — Session 10.

4. **Automated answer-key extraction is the primary path.** `pdftotext -layout` recovers `Question ID <hex>` and `Correct Answer: <value>` from every sampled KEY PDF. A ~30-line script replaces the "bulk annotate 1,500 questions" option Session 8 close was recommending.

5. **Per-question `questionKeys/{questionId}` collection, not per-worksheet arrays.** Question IDs are stable College Board identifiers; per-question storage deduplicates naturally and survives worksheet reshuffles.

6. **Student PDFs migrate to Firebase Storage. KEY PDFs do not** (filesystem-only, accessed by extraction script and tutors via OneDrive). Decision revisited at Session 12 if laptop-SPOF concern resurfaces.

7. **Score post-back uses Wise Chats, not Assessments.** Wise Assessments is a richer but doubled-surface alternative. Deferred to Phase 4+.

## Decisions intentionally deferred

Listed in [PHASE_3_SPEC.md §Open questions deferred to later sessions](PHASE_3_SPEC.md#open-questions-deferred-to-later-sessions). Highlights:

- SMTP vendor (SendGrid default) → Session 10
- Deep-link URL scheme (query params vs signed tokens) → Session 13
- Mixed-format worksheet UI → Session 14
- Cross-device email-link UX → Session 13
- Reconciliation gap resolution rules → pre-Session 17

## Unknowns that remain

- **File-count gap.** Catalog has 150 entries; filesystem has 102 KEY / 93 STU. Session 12's audit produces the resolution report. Likely causes: Full Length Practice Exams, Diagnostic Exam, Literary Worksheets, Poetry Practice — all use different naming conventions than `KEY_/STU_`.
- **Wise 1:1 chat lifecycle.** Whether `Admin Only Chat with Student` is idempotent (safe to call on every assign) or whether we need to list chats first. Session 11 spike.
- **Firebase Blaze plan billing.** Required for Cloud Functions outbound HTTP. Kiran needs to enable billing before Session 11 can deploy. Flagged in Session 10 kickoff as a gate for Session 11.

## Session 9 did NOT do

- Touch any code. Zero changes to `app.jsx`, `firestore.rules`, `worksheets_catalog.json`, or anything else.
- Enable Firebase billing. Kiran does this before Session 11.
- Write any Cloud Functions scaffolding. Session 11's job.
- Resolve the file-count gap. Session 12's audit.

## Next

Kiran `/clear`s and starts Session 10 using the kickoff prompt at the bottom of [PHASE_3_SPEC.md](PHASE_3_SPEC.md#kickoff-prompt-for-session-10). Session 10 is custom SMTP — infrastructure only, no code.
