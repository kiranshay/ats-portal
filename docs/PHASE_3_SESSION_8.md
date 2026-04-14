# Phase 3 — Session 8: Email/Password Auth for Non-Gmail Families

**Date:** 2026-04-14
**Session type:** Medium risk. Client-only code (no rules change, no migration). Tabbed sign-in UI, secondary-app admin flow for account creation, full `USE_ALLOWLIST_AUTH` dead-branch cleanup. Shipped one commit; auto-deployed to production via the existing post-commit → Firebase Hosting CI path; end-to-end validated against production Firebase with a burner Gmail (`sixsiege1414@gmail.com`).
**Parent docs:** [PHASE_3_SESSION_8_PLAN.md](PHASE_3_SESSION_8_PLAN.md) · [PHASE_2_SESSION_7.md](PHASE_2_SESSION_7.md) · [AUTH_MIGRATION_PLAN.md](AUTH_MIGRATION_PLAN.md)
**Outcome:** Families without Google accounts can now be onboarded via the admin UI. Kiran ticks a checkbox, the client spins up a secondary Firebase app to avoid signing the admin out as a side effect, creates the family's password account, sends them a setup link that doubles as email verification, and writes the allowlist entry. Family clicks the link, sets a password, signs in via the new tabbed SignInScreen, lands in their role's portal. Validated end-to-end against production.

---

## What shipped

One commit, `abb7c84` on `main`, auto-deployed to Firebase Hosting:

### `abb7c84` — `phase 3 session 8: email/password auth for non-gmail families`

Four files, +803 / −222:

1. **[app.jsx](../app.jsx)** — the work:
   - **`SignInScreen` rewritten with a two-tab segmented control** between "Google" and "Email & password". Password tab has email + password fields, a "Sign in" button, and a "Forgot password?" link that calls `sendPasswordResetEmail` on whatever email is in the field.
   - **`UnverifiedScreen` added** ([app.jsx](../app.jsx)) — routed to when `onAuthStateChanged` sees `emailVerified === false`. Shows the user's email, a "Resend setup link" button (calls `sendPasswordResetEmail`, which Firebase treats as a setup link on first use and marks the email verified on completion), and a "Sign out" button. Google users should never hit this state because Google always reports verified emails; this is the safety net for email/password users who arrive before completing the reset flow.
   - **`onAuthStateChanged` rewritten** — instead of silently signing out unverified users (Session 7 behavior), it now routes them to `UnverifiedScreen` with their user object intact. Verified + allowlisted users flow through unchanged.
   - **New auth handlers:** `handleGoogleSignIn`, `handleEmailSignIn`, `handleForgotPassword`, `handleResendVerification`. The first and last are minor wrappers; `handleEmailSignIn` maps Firebase error codes to human-readable messages (`auth/invalid-credential`, `auth/wrong-password`, `auth/user-not-found`, `auth/too-many-requests`, `auth/invalid-email`).
   - **`AdminsTab` gets a "Also create a password account and email a setup link" checkbox** on the add-entry form. When ticked, the add flow:
     1. Spins up a secondary named Firebase app via `firebase.initializeApp(window.firebaseConfig, "admin-create-" + Date.now())`. The secondary app is the standard workaround for `createUserWithEmailAndPassword`'s sign-in side effect — the new user is signed in on the *secondary* app, leaving the admin's primary-app session untouched.
     2. Calls `createUserWithEmailAndPassword` on secondary with a random temp password.
     3. Signs out the secondary instance.
     4. Calls `sendPasswordResetEmail` via the *primary* app (stateless call — doesn't affect auth state).
     5. Writes the allowlist entry via the primary db.
     6. Deletes the secondary app instance.
   - **Graceful handling of `auth/email-already-in-use`** — if the email already has a Firebase Auth record, skip the create step, still send the reset email, still write the allowlist entry, tell the admin in the banner.
   - **Button label adapts** — reads "Add entry" when the checkbox is unticked, "Create account + add entry" when ticked.

2. **[build_index.py](../build_index.py)** — exposes `window.firebaseConfig` so the secondary app can bootstrap from the same config the primary app uses. Four-line change.

3. **[index.html](../index.html)** — rebuilt from `app.jsx` via `python3 build_index.py`. Committed alongside source per Session 6 discipline.

4. **[docs/PHASE_3_SESSION_8_PLAN.md](PHASE_3_SESSION_8_PLAN.md)** — the plan doc. Stayed accurate against what actually shipped; one small scope note below.

### Dead-branch cleanup folded in

The plan called for folding the `USE_ALLOWLIST_AUTH` dead-branch cleanup from the Session 7 follow-up list into Session 8. Done, in the same commit:

- **`USE_ALLOWLIST_AUTH` constant removed** (was at [app.jsx:493](../app.jsx#L493)).
- **`ATS_DOMAIN` constant removed** (was at [app.jsx:488](../app.jsx#L488)).
- **Legacy workspace-domain branches in `onAuthStateChanged` deleted** — the fallback path at the old [app.jsx:965-977](../app.jsx#L965-L977) that domain-checked against `@affordabletutoringsolutions.org` is gone.
- **Legacy provider hint deleted** — `handleSignIn` no longer conditionally sets `hd: ATS_DOMAIN` on the Google provider.
- **Stale `!USE_ALLOWLIST_AUTH` banner in `AdminsTab` deleted** — the "Phase A — flag off" warning banner at the old [app.jsx:1186-1192](../app.jsx#L1186-L1192) is gone.
- **Stale comments updated** — `RoleRouter`, `AppInner`, and `SignInScreen` no longer reference the flag or legacy workspace users.

Every dead branch had been unreachable in production since Session 7's flag flip, so the cleanup is purely cosmetic / cognitive-load reduction. No behavior change.

---

## What did not ship (deliberately)

- **Custom SMTP configuration for Firebase Auth emails.** This surfaced mid-session as a deliverability issue (see §"The Gmail spam problem" below). Configuring SendGrid/Mailgun/Postmark with SPF/DKIM on `affordabletutoringsolutions.org` is a 1–2 hour Phase 3 session of its own. Out of scope for Session 8. **Must happen before any real family rollout.**
- **Firestore rules changes.** The existing rules already enforce `email_verified == true` on the allowlist self-read, which is provider-agnostic. No rules deploy this session.
- **Bulk CSV import of family accounts.** One-at-a-time via the admin UI is fine for the ~20 non-Gmail families on a first pass. If it proves painful, a CSV import path is a small follow-up.
- **`DUAL_WRITE_GRACE` flip.** Still `true` from Session 2. Queued for a Phase 3 housekeeping session.
- **Real family rollout.** Still gated on tutors actually logging session data. Nothing to show families yet.

---

## Deviations from the Session 8 plan

### 1. Plan doc's "ATS domain winding down" framing was stale

**Plan said** (and the Session 8 kickoff prompt inherited from Session 7 repeated): "the ATS Google Workspace is winding down." This was inherited belief from the original [AUTH_MIGRATION_PLAN.md](AUTH_MIGRATION_PLAN.md) framing.

**Actual state (clarified mid-session by Kiran):** the workspace is NOT being fully wound down. `support@affordabletutoringsolutions.org` is retained indefinitely as the admin escape hatch / Firebase project owner / CI token source. `kshay@` and `ameyers@` are *potentially* retained (unconfirmed). The domain itself is staying. Only the tutor workspace seats were phased out.

**Why it matters:** this cleanly answers the Phase 3 SMTP sender question. `noreply@affordabletutoringsolutions.org` is a viable long-term sender domain — we own it, it's staying, and SPF/DKIM/DMARC records we set up won't get ripped out from under us. No need to register a new domain for portal email.

**Memory updated:** `memory/project_psm_auth_migration.md` was rewritten mid-session to correct the stale framing.

### 2. I lost track of who pushed and when

**Plan said:** commit locally, wait for Kiran's manual in-browser verification, then push after approval.

**What actually happened:** I committed `abb7c84` at 05:22 local time. Kiran began his manual testing sometime after that, found the email wasn't arriving (Gmail spam issue — see Deviation 3), fixed it via Firebase Console template settings, and re-verified the full happy path against production. When I tried `git push origin main` at session end three and a half hours later, the push returned "Everything up-to-date" — meaning the commit was already on origin. At the time I misattributed this to an "auto-push-on-commit hook"; **there is no such hook** (checked `.git/hooks/` — no post-commit hook exists, and the closeout commit itself did NOT auto-push). The real explanation is that Kiran pushed/deployed `abb7c84` himself during his testing window, and I didn't notice until the end.

**Net impact:** zero. Kiran's manual testing WAS the production validation, which is the strongest possible signal. The only lesson is for me: when a push returns "Everything up-to-date," the first hypothesis should be "the other human pushed it" before reaching for more exotic explanations like git hooks. No repo invariant changed; plan structure for future sessions stays the same (commit, hand off to Kiran for manual verification, push after approval — with the acknowledgement that Kiran may short-circuit by pushing himself).

### 3. The Gmail spam problem (the big mid-session detour)

**Discovered when:** Kiran ran test flow step 3 (create a throwaway password account, check for setup email in his burner `sixsiege1414@gmail.com` inbox). The allowlist write succeeded, the admin UI showed "Password account created and setup link emailed", but no email arrived in the inbox.

**Initial hypothesis:** checkbox wasn't ticked (`fCreatePw` is opt-in and defaults to false, and nothing in the UI forces the admin to notice it). Ruled out by Kiran — he confirmed the checkbox was ticked and the button had read "Create account + add entry". The info banner in his screenshot confirmed both `createUserWithEmailAndPassword` and `sendPasswordResetEmail` had returned without throwing.

**Actual root cause:** Firebase's default sender `noreply@psm-generator.firebaseapp.com` has no SPF/DKIM reputation, and Gmail has learned to spam-classify `firebaseapp.com` across the board. The email was sent successfully — it landed in `sixsiege1414@gmail.com`'s **spam folder**, not the inbox. With `[project-456789704122]` as the subject line (the raw Firebase project ID, not a human-readable name), Gmail's classifier treats it as very likely phishing.

**Quick-win fixes applied (Firebase Console settings, zero code):**

1. **Project settings → General → Public-facing name** set to `PSM Generator`. The `%APP_NAME%` placeholder in Firebase's default email templates auto-populates from this, so the email subject and body now read "PSM Generator" instead of "project-456789704122".
2. **Authentication → Templates → Password reset → Sender name** set to `PSM Generator`. Before: emails sent from a blank sender. After: "PSM Generator <noreply@psm-generator.firebaseapp.com>".
3. The body / subject / message content were **not** edited — keeping the defaults means Firebase can improve the template in the future without manual drift.

**After the fixes:** Kiran re-tested with a fresh admin-issued account creation. Email landed directly in the inbox (not spam). Password reset link worked. `emailVerified` was set to `true` on completion (empirical confirmation of the assumption Session 8 was built on). Sign-in via the email/password tab succeeded. Full happy path validated against production Firebase.

**Residual risk:** Gmail's spam classifier has persistent memory. For any recipient who has previously marked a `firebaseapp.com` email as spam, future emails from the same sender will continue landing in spam *even after the settings fix*. This is a recipient-local problem that a sender-side fix can't undo. The real fix is configuring custom SMTP via a transactional email service (SendGrid / Mailgun / Postmark / Resend) with a verified sender domain — see Phase 3 follow-up below.

### 4. `kshay@`, `ameyers@`, `support@` admin entries — held, not added

**Mid-session question from Kiran:** should we add the three retained ATS workspace accounts to the allowlist as admins while we're here?

**Decision:** add `support@` (committed-retained, serves as admin escape hatch), hold on `kshay@` and `ameyers@` until their retention is confirmed. Both are strictly redundant with Kiran's and Aidan's personal Gmails which are already on the admin allowlist, so there's zero access loss from waiting. Adding allowlist entries you might have to remove later is small but avoidable churn.

**Caveat flagged:** adding the `support@` entry is only useful if it's a real user account someone can sign in to via Google OAuth — not a group/alias. Kiran to confirm before adding. **Not blocking Session 8.**

**Not yet shipped** — Kiran to add `support@` via the admin UI when convenient, post-Session-8.

---

## Open questions and risks (new from Session 8)

### A. Custom SMTP for Firebase Auth emails is a Phase 3 prerequisite for family rollout

**State:** default Firebase sender works, but deliverability is fragile. Post-spam-classification recipients get their emails silently dropped to spam forever.

**Fix:** configure Firebase Auth → Templates → SMTP to use a transactional email service (SendGrid / Mailgun / Postmark / Resend — all have free tiers suitable for ~50 users). Verify `affordabletutoringsolutions.org` with the chosen provider (DNS records: SPF, DKIM, DMARC). Set the sender to `noreply@affordabletutoringsolutions.org`. Deliverability jumps from ~60% to ~99%.

**Priority:** must happen before real family rollout. Budgeting it as a 1–2 hour Phase 3 session.

**Sender domain decision:** `noreply@affordabletutoringsolutions.org`. The ATS domain is staying per the corrected memory. No need to register a new domain.

### B. `sixsiege1414@gmail.com` burner account should be deleted from Firebase Auth

**State:** Kiran said he'd delete it at session end. Not a code issue — just making sure it doesn't linger as confusing test data in the Users console.

**Follow-up (not blocking):** verify the delete happened, and that the allowlist entry was also cleaned up (deleting the Firebase Auth user doesn't auto-delete the allowlist doc).

### C. Session 7's `hasOnly([...])` rule fragility is unchanged

Session 7 open question D. Session 8 did not touch the student submission update rule and did not add rule-level test coverage. Still a latent fragility; still queued for Phase 3 infra hygiene.

### D. `sendPasswordResetEmail` on a Google-only Firebase Auth user is untested

**State:** my admin-create flow catches `auth/email-already-in-use` from `createUserWithEmailAndPassword` and falls through to `sendPasswordResetEmail`. If the existing account is Google-only (no password provider), Firebase may throw `auth/user-not-found` on the reset call — in which case my outer try/catch surfaces the error to the admin and aborts before the allowlist write.

**Why unverified:** this code path never fired during Session 8 testing. `sixsiege1414@gmail.com` had no prior Firebase Auth user record.

**Risk:** low. It only matters if an admin ticks "create password account" for a family email that already has a Google-only Firebase Auth record (e.g., the family previously test-signed-in via Google to the same project). Even then, the failure mode is "clear error banner in the admin UI, no partial state written" — strictly safe.

**Mitigation (not shipped):** the happy path is to either uncheck the box (for Google users) or first reach out to the family to confirm they don't already have a Google sign-in with us.

---

## Test results

### Pre-push (working tree)
- **Test suite:** 84/84 green, 78.4ms total. No new tests added — Session 8 is all UI + auth-layer changes, not business logic.
- **JSX parse check:** `npx esbuild app.jsx --loader:.jsx=jsx` — clean.
- **`index.html` rebuilt:** 507,071 bytes, 6521 lines.

### Post-deploy (production Firebase)
- **Kiran signed in as `kiranshay123@gmail.com` via Google tab** — no regression, landed in the admin view.
- **Admin-issued account creation for `sixsiege1414@gmail.com`** — allowlist row appeared, secondary-app flow completed, admin stayed signed in as `kiranshay123@gmail.com` throughout (the whole point of the secondary app), info banner showed "Password account created and setup link emailed".
- **Setup email delivery (first try)** — landed in `sixsiege1414@gmail.com` spam folder, "project-456789704122" subject. See Deviation 3.
- **Setup email delivery (after Public-facing name + Sender name fix)** — landed in inbox, "PSM Generator" subject. Clean.
- **Password setup via the reset link** — completed successfully. `emailVerified` auto-set to `true` (confirming the assumption that completing a password reset marks email verified — this was the highest-stakes assumption of the whole session and it held).
- **Email/password sign-in tab from SignInScreen** — entered email + new password, landed in the correct role view, no `permission-denied` in devtools console.

### Not tested (out of scope for Session 8)
- Email/password sign-in from a second browser / incognito — Kiran tested in his primary session only. Low risk; the auth state handling is identical regardless of browser.
- Parent-role family via email/password — Kiran tested tutor-role. Parent role goes through the same auth path and is routed in `RoleRouter` by role alone, so this is structurally validated but not literally exercised.
- Locked-out state via email/password — i.e., an email/password user who authenticates successfully but isn't on the allowlist. Structurally this flows through `LockoutScreen` via the same `getAllowlistEntry` → null path as Google users. Not exercised.
- `auth/email-already-in-use` branch — see Open Question E.

---

## Commits

Oldest → newest, this session only:

- `abb7c84` — `phase 3 session 8: email/password auth for non-gmail families` (four files, +803 / −222; bundles the dead-branch cleanup)
- `<TBD>` — `phase 3 session 8: closeout doc` (this file)

---

## Follow-ups rolled forward

**IMPORTANT pivot at Session 8 close:** Kiran described the real Phase 3 vision — Wise-integrated auto-grading PDF workflow with `signInWithEmailLink` auth for students/parents. This supersedes the SMTP-first priority that had been at the top of this list. SMTP drops significantly because students/parents will never use password auth in the new design, so Firebase email deliverability only matters for admin-issued tutor accounts, which already use Gmail. See the updated Session 9 kickoff prompt at the bottom of this doc for the full reset.

Priority-ordered, updated for the pivot:

1. **Phase 3 brainstorming + spec session (Session 9).** Modeled on PHASE_2_SESSION_1.md. Outputs `docs/PHASE_3_SPEC.md` which decomposes Phase 3 into executable sessions. No code. See Session 9 kickoff prompt at the bottom.
2. **Wise API integration** (inbound + outbound). Blocks real family rollout.
3. **Student PDF migration from OneDrive to Firebase Storage.** Removes SPOF.
4. **Answer-key data model + auto-grading.** Either bulk-annotate `correctAnswers` in `worksheets_catalog.json` (Kiran's lean) or tutor-entered-on-demand fallback.
5. **`signInWithEmailLink` auth path for students/parents** — Kiran's preferred lighter-weight auth tied to Wise email.
6. **Bubble-sheet `SubmissionEditor` variant** for multiple-choice worksheets.
7. **Close `DUAL_WRITE_GRACE`.** Unchanged. Housekeeping. Before family rollout.
8. **Custom SMTP for Firebase Auth emails.** DEMOTED from top priority. Still worth doing eventually for admin-issued tutor account flows, but no longer blocks family rollout.
9. **Grant `kiranshay123@gmail.com` Firebase project Editor role.** Unchanged from Session 7. IAM change, future-proofs local CLI deploys.
10. **Real family rollout.** Gated on Wise integration + PDF migration + auto-grading + email-link auth.
11. **Revisit `kshay@` and `ameyers@` admin entries** once their retention is confirmed. Low priority.
12. **Per-question submission granularity.** Largely obsoleted by auto-grading (which generates per-question data natively).
13. **Aidan privacy review of tutor-only fields.** Unchanged.
14. **Rule-level test coverage for the `hasOnly([...])` student submission update rule.** Unchanged from Session 7 Open Question D.

**Completed at Session 8 close** (crossed off the list):
- ~~`support@affordabletutoringsolutions.org` added to admin allowlist~~ — done by Kiran
- ~~`sixsiege1414@gmail.com` burner deleted from allowlist AND Firebase Auth users list~~ — done by Kiran

---

## Session 9 kickoff prompt — Phase 3 reset: brainstorming + spec

> Copy everything between the horizontal rules below into a fresh Claude Code session, after running `/clear` in the psm-generator workspace.

**Note to future-me:** Session 8's original Session 9 kickoff was "configure custom SMTP." That plan was superseded at the end of Session 8 when Kiran described the real Phase 3 vision — a Wise-integrated auto-grading PDF workflow. SMTP drops in priority (see end of this kickoff for why). If that kickoff version is still what a future Claude starts from, stop and re-read this version.

---

I'm ready to start **Phase 3 Session 9** of psm-generator: the brainstorming + spec session for Phase 3's real scope. This is a **no-code session** modeled on [PHASE_2_SESSION_1.md](PHASE_2_SESSION_1.md), which is the template for a phase-kickoff spec. Output: one document, `docs/PHASE_3_SPEC.md`, that decomposes Phase 3 into right-sized executable sessions the same way Phase 2 Session 1 decomposed Phase 2 into seven.

**Confirm today's date with me at session start before doing anything else.**

### The Phase 3 vision, in Kiran's words

> "Tutor assigns PSM to student, it posts to their Wise with a link to the PSM-generator for the student to just go into (ideally with same email as Wise) and the student just needs to enter a PIN or something. There, they can see the PDF of the assignments themselves and have a place to enter their answers as they work through the PDFs kind of like a bubble sheet scantron thing. Then, because the answer keys are also in the OneDrive, the PSM-generator can auto-grade the answers and send the feedback to the tutor and post back to Wise."

Four threads: (1) in-app PDF delivery of worksheets, (2) answer-key data model + auto-grading, (3) two-way Wise API integration, (4) frictionless student/parent auth via Firebase `signInWithEmailLink`. All four are interdependent.

### Read these in order

1. **`docs/PHASE_3_SESSION_8.md`** — this file. §"The Phase 3 vision" (this section) is the one-paragraph scope. §"Critical finding about worksheets_catalog.json" (below) has the biggest data-model discovery from Session 8 close.
2. **`docs/PHASE_2_SESSION_1.md`** — the reference template for how a phase-kickoff spec is written. Read its structure: brainstorm → design decisions → session plan table with risk ratings. `PHASE_3_SPEC.md` should follow the same shape.
3. **`worksheets_catalog.json`** — read it directly, not through the app. 150 worksheet entries, each with `subject/domain/subdomain/difficulty/title/qs/stu/key`. This is your single most important input for scoping the worksheet-data-model thread.
3b. **Sample PDFs at `~/Desktop/stuff/OneDrive copy/NEW_ SAT Test Banks & Diagnostics/`** — actually read one `STU_*.pdf` and one matching `KEY_*.pdf` via `pdftotext -layout <path>` using the already-installed `poppler`. Confirm for yourself that the text-extraction finding (§"Critical findings" below) still holds before writing the spec. Spot-check at least one Reading-section key AND one Math-section key AND one free-response key.
4. **`app.jsx`** — specifically `SubmissionEditor` from Session 5 (around line 3400, grep for it) and `TutorSubmissionsPanel` from Session 6. These are the existing pieces the auto-grading thread will plug into. Do NOT redesign from scratch — the answer-entry UI already exists, it just needs a bubble-sheet renderer variant.
5. **Wise API Postman docs:** https://documenter.getpostman.com/view/17903053/2sA3XPChyE — Kiran confirmed Wise has a public API. Your first research task is reading these docs and understanding: (a) what auth does the API require (OAuth? API key? JWT?), (b) does it have webhooks or is it pull-only, (c) what is the object model for "assignment" / "student" / "session" / "notification," (d) does it expose a stable student email field we can match against Firebase Auth. Spend real time on this — it's a constraint on the other three threads.
6. **`memory/project_psm_auth_migration.md`** — confirmed state of the ATS domain.

### Critical findings about worksheets + answer keys — load these into brainstorming

Session 8 close peeked at both `worksheets_catalog.json` AND the actual OneDrive folder (local path below). Three findings, in order of importance:

**1. The catalog is worksheet metadata, not question content.**

- 150 entries in `worksheets_catalog.json`, flat list
- Fields per entry: `subject`, `domain`, `subdomain`, `difficulty`, `title`, `qs` (int, question count), `stu` (OneDrive URL to student-facing worksheet PDF), `key` (OneDrive URL to answer-key PDF), `keyTitle`
- **NOT in it:** the individual questions themselves, the correct answers, or any per-question metadata

The actual question content and correct answers live inside the OneDrive PDFs as rendered pages. Any auto-grading has to source correct-answer data from somewhere.

**2. BIG WIN: answer key PDFs are machine-extractable with a trivial regex. Automated extraction works.**

The OneDrive folder is synced locally at `~/Desktop/stuff/OneDrive copy/NEW_ SAT Test Banks & Diagnostics/`. Session 8 close installed `poppler` via `brew install poppler` to get `pdftotext`, then ran it against sample answer key PDFs from both Reading and Math subjects. Result: the answer key PDFs are generated from College Board question bank data and follow a perfectly consistent text layout across all subjects:

```
Question ID 1e85caa9
...
Correct Answer: A
```

and for free-response / student-produced-response questions:

```
Question ID 575f1e12
...
Correct Answer: 986
```

A ~30-line Python parser (walk dir, `pdftotext`, regex `Question ID ([a-f0-9]+)` + `Correct Answer: (.+)`) extracts correct answers for every worksheet in one pass. Zero manual data entry. **This collapses the "bulk annotate 1,500 questions by hand" option that Session 8 close was recommending.**

Better still: the **Question ID** is a stable College Board identifier. This means the ingested data can be stored as a per-question database keyed by ID, not a per-worksheet array. Same question in multiple worksheets → deduplicated. Worksheets get reshuffled without touching the answer data. Question ID + correct answer is the right primitive to store, not `correctAnswers: [...]` on the worksheet doc.

Revised options:

1. **[NEW, RECOMMENDED] Automated extraction from answer key PDFs.** Parser script walks the OneDrive folder, extracts `(questionId, correctAnswer)` tuples from every `KEY_*.pdf`, writes them to either `worksheets_catalog.json` (per-worksheet) or a new Firestore collection `questionKeys/{questionId}` (per-question, deduplicated). Also extracts the question number → question ID mapping per worksheet so `responses[i]` can join to the correct answer. One-shot script, no manual data entry, verifiable by spot-check against a few worksheets.
2. **[FALLBACK] Per-worksheet tutor-entered answer keys** if the extraction parser hits worksheets where the layout breaks. Tutors fill in the key the first time they assign a worksheet, cached to Firestore. Good as a safety net for edge-case PDFs, not as a primary path.
3. **[REJECTED] Bulk manual annotation.** Was Session 8 close's recommendation. No longer necessary given finding #2.
4. **[REJECTED] OCR.** Not needed — the PDFs have embedded selectable text, so `pdftotext` handles them without any rasterization or OCR.

Brainstorming should confirm finding #2 by running the parser against a ~10-worksheet sample and verifying 100% successful extraction before committing to it as the primary path.

**3. File count mismatch — Session 9's first discovery task**

```
catalog entries:                150
KEY_*.pdf files in OneDrive:     87
STU_*.pdf files in OneDrive:     78
```

The catalog references 150 worksheets; the folder only has 87 answer keys and 78 student PDFs following the `KEY_/STU_` naming convention. Possible causes:

- The "Full Length Practice Exams," "Diagnostic Exam," "Literary Worksheets," and "Poetry Practice" subfolders likely use different naming conventions. `ls` showed these as top-level folders.
- Some catalog entries may be aspirational (planned worksheets not yet written).
- Some worksheets may be older content from before the `KEY_/STU_` convention was established.

**Session 9 must audit this before any migration or extraction work.** Write a script that joins the catalog against the filesystem and outputs: (a) matched pairs, (b) catalog entries with no file, (c) filesystem files with no catalog entry. The spec's session plan should budget for resolving all three classes — some will be "mark as archived," some will need new file paths, some will need catalog updates.

**Adjacent folder structure observations:**

- Top level: `I. Reading Section/`, `II. Math Section/`, `Diagnostic Exam/`, `Full Length Practice Exams/`, plus a handful of standalone cheat-sheet PDFs at the root.
- Under each section: domain subfolders (e.g., `III. Information and Ideas/`), then subdomain subfolders (e.g., `.COMPREHENSIVE/`), then `STUDENT TESTS/` and `ANSWER KEYS/` sibling folders containing the `STU_` and `KEY_` files.
- The Math section has a slightly different structure with `Answer Keys/` (title case, no caps) instead of `ANSWER KEYS/`. Parser must be case-insensitive.

**Adjacent finding: OneDrive as worksheet-PDF host is still a SPOF on Kiran's laptop** (Session 7 open question E). Phase 3 should migrate the `STU_*.pdf` files (and probably `KEY_*.pdf` too, for auto-grading data permanence) to Firebase Storage as part of the worksheet-data-model thread. The migration and the correctAnswers extraction work can be bundled into one session since they walk the same folder.

**Adjacent finding: the answer keys also contain full question text, choices, and rationales as extractable text.** This is a longer-term scope unlock — psm-generator could eventually render questions natively in-browser instead of serving PDFs at all, reusing the extracted data for an entirely PDF-free student UX. Out of scope for Phase 3's first pass, but worth noting in the spec as a Phase 4+ possibility.

### Scope and architecture questions brainstorming must resolve

These are the decisions `PHASE_3_SPEC.md` must lock in before any execution session runs.

1. **Wise API capabilities.** The single biggest dependency. Until you've read the Postman docs, nothing else is plannable. Specific questions to answer in the spec:
   - What auth does Wise use (API key / OAuth / JWT / basic)?
   - Can psm-generator *push* data into Wise (create an assignment, post feedback) or only pull?
   - Does Wise emit webhooks for "tutor assigned worksheet" / "session scheduled" that psm-generator can subscribe to?
   - What is the stable identity field for a student — email? ID? — that psm-generator can match against its own student/parent records?
   - Is there a sandbox or test workspace, or does all dev hit Kiran's real ATS Wise account?
2. **Auth model for students/parents.** Kiran committed to `signInWithEmailLink` (Firebase email-link auth — user enters email, gets a link, clicks it, signed in, no password ever). This is a **new third auth path** alongside the Google and email/password flows Session 8 shipped. Decisions:
   - Does the email-link path replace the password path for students/parents, or coexist with it? (Recommendation: replace. One less thing to support. Session 8's password path stays as the admin/tutor fallback.)
   - Does the email link come from Firebase directly (requires SMTP fix, Session 8 follow-up A) or from the Wise post (Wise posts a link with a one-time-use token we generate)? The Wise-posted path is more elegant but couples us to Wise for every sign-in; Firebase-emailed is self-contained but requires the SMTP follow-up. Brainstorming decision.
   - `firestore.rules` currently requires `email_verified == true`. `signInWithEmailLink` sets `emailVerified` automatically on completion (same as password reset does), so the rule survives. Verify this in the spec.
3. **Worksheet PDF delivery to students.**
   - Migrate `stu` PDFs from OneDrive to Firebase Storage, yes/no. (Recommendation: yes, but it's separable from the auto-grading thread.)
   - Rendered in-browser via `pdf.js` (already loaded in `build_index.py` for the existing diagnostic parser) or linked as downloads? (Recommendation: rendered in-browser so the student stays inside the app.)
4. **Answer entry UI.** `SubmissionEditor` from Session 5 already exists and handles draft autosave. It has a free-form textarea for answers. Phase 3 wants a bubble-sheet grid. Design question: is the bubble-sheet a replacement or a variant?
   - The `qs` field in the catalog gives the question count. Student sees N radio-button rows, each with A/B/C/D choices. One answer per row. On submit, this serializes into the same `responses` array the existing `allow update` rule at [firestore.rules:108-109](../firestore.rules#L108-L109) already accepts. No rules change required.
   - The existing `SubmissionEditor` textarea stays as a fallback for worksheets where the bubble-sheet model doesn't fit (e.g., free-response questions). `worksheets_catalog.json` may need an `answerFormat: "multiple-choice" | "free-response"` field to drive this.
5. **Auto-grading + feedback flow.**
   - On submit (student moves draft → submitted), the client looks up `correctAnswers[i]` for each question, computes N-correct / M-total, writes it to the submission doc. Same `hasOnly([...])` rule at [firestore.rules:108-109](../firestore.rules#L108-L109) needs to be updated to allow `scoreCorrect / scoreTotal` in the student-write path (currently those fields are tutor-only per Session 6).
   - **Or:** the student write stays exactly as it is, and auto-grading runs server-side via a Firestore trigger / Cloud Function that writes the score as the tutor would. Downside: requires Cloud Functions, which psm-generator does NOT currently use. First-time addition of server-side code. Significant infra addition.
   - Brainstorming decision: client-side grading (simpler, requires one rule change, keeps the no-backend invariant) vs server-side (more secure, allows the `correctAnswers` data to stay admin-only, but adds Cloud Functions).
   - Security note: if grading is client-side, a motivated student could read the `correctAnswers` array out of the client before submitting. That's the cost of keeping the architecture simple. If that's unacceptable, server-side grading is the answer. Brainstorming should ask Kiran which tradeoff he prefers.
6. **Wise webhook / poll for tutor assignment → psm-generator.** Inbound direction: tutor creates an assignment in Wise, psm-generator learns about it, psm-generator generates/fetches the worksheet for the student. This requires either (a) Wise webhook pointing at a psm-generator endpoint (requires a server to receive it — new infra), or (b) psm-generator polls Wise on some cadence (no infra but introduces latency), or (c) a browser extension / tampermonkey script on the tutor's Wise session (ugly, don't). **Hard brainstorming decision dependent on what the Wise API actually supports.**
7. **Feedback post-back to Wise.** Outbound direction: after auto-grading, post the score and missed-question report to Wise. Probably a direct API call from the client when a submission transitions to "reviewed" status. Again, gated on API auth model.

### Prerequisites before brainstorming starts

1. **Kiran has read-access to the Wise Postman docs.** Confirmed at Session 8 close.
2. **Kiran has a Wise account / dev access.** He uses Wise daily as the ATS tutoring platform; dev access might require a separate API key from ATS. Ask early.
3. **OneDrive access to a sample student PDF + matching answer key PDF** for at least one worksheet, so brainstorming can see the actual format being dealt with. Kiran to share one example.
4. **Kiran's opinion on bulk-annotate vs deferred-annotate for `correctAnswers`** — resolve this during brainstorming, not after.

### Scope of what Phase 3 will decompose into (rough prior, to be validated in spec)

Based on Session 8's end-of-session understanding. The actual Session 9 spec may differ.

| # | Session | Ships | Risk | Dependency |
|---|---|---|---|---|
| 9 | **Phase 3 brainstorming + spec (this session)** | `PHASE_3_SPEC.md` only. Zero code. | None | — |
| 10 | Wise API integration layer (read-only first) | Client-side Wise client, assignment pull, student-email matching. Probably a new `lib/wise.js` module. | Medium | API auth model |
| 11 | Student PDF migration: OneDrive → Firebase Storage | Migration script + catalog `stu` URL rewrite + in-browser viewer | Low | — |
| 12 | Answer-key data model + bulk annotation OR deferred-annotate UI | Depends on Option 1 vs Option 3 decision | Low-Medium | Kiran's Option pick |
| 13 | `signInWithEmailLink` auth path for students/parents | New flow in `SignInScreen`, possibly new Wise-sourced sign-in link path | Medium | Wise integration for sign-in post path |
| 14 | Bubble-sheet `SubmissionEditor` variant | New answer-entry UI gated on `answerFormat: "multiple-choice"` | Low | Catalog schema change from #12 |
| 15 | Auto-grading + feedback post-back to Wise | Client-side grading, score write, Wise outbound post | Medium-High | #10 + #12 |
| 16 | Custom SMTP for Firebase Auth (deferred from SESSION 8 kickoff) | SendGrid/Postmark + DNS setup | Low | — |
| 17 | Real family rollout | First cohort via Wise-posted links | Medium | All of the above |

SMTP (formerly the top Phase 3 priority) moves to session 16 because if students/parents never use password auth (they use `signInWithEmailLink` via Wise), SMTP is only relevant for admin-issued tutor accounts, which already use Gmail. Still worth doing, no longer blocking.

### Constraints

- **No code in Session 9.** Brainstorming + spec only. If the session starts editing `app.jsx`, stop — something went wrong.
- **Do NOT pick Wise API answers from the docs without reading them.** Actually read the Postman docs. Don't guess.
- **Do NOT widen the `email_verified == true` rule.** Still load-bearing.
- **Do NOT introduce a bundler or npm install.** Same Phase 2 constraint, still holds.
- **Do NOT add Cloud Functions without Kiran's explicit approval.** Server-side auto-grading is attractive on security grounds but it's a first-time infra addition for this project and a real operational commitment. Brainstorming can *propose* it but cannot *assume* it.
- **psm-generator commit override still applies** (commit + push directly, short user-voice messages, no Co-Authored-By).
- **No slop.** Comments only when the *why* is non-obvious. The spec should lead with decisions, not process.

### Pause at the first natural checkpoint

- **After reading the Wise Postman docs and `worksheets_catalog.json`**, before doing any spec writing — report what you learned. Kiran validates your understanding before you commit it to a spec.
- **After the spec's section on auth model is written**, before the rest of the spec — the `signInWithEmailLink`-via-Wise vs Firebase-SMTP decision is load-bearing for everything downstream.
- **After the full spec draft exists**, before committing it — Kiran reviews.

Stop at the first one. Report. Wait.

### Close out

Session 9 closes by committing `PHASE_3_SPEC.md` and writing `docs/PHASE_3_SESSION_9.md` (brainstorming outcome doc — what was decided, what remains unknown, kickoff prompt for Session 10).

---
