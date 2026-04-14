# Auth Migration — Session 2 (Phase B)

**Date:** 2026-04-13
**Phase:** B — rules dual-gate + bootstrap. Client code stays flag-off in shipped form.
**Parent plan:** [AUTH_MIGRATION_PLAN.md](AUTH_MIGRATION_PLAN.md) · [Session 1](AUTH_MIGRATION_SESSION_1.md)

---

## What changed since Session 1

- Session 1 (Phase A) shipped: `USE_ALLOWLIST_AUTH` flag, allowlist helpers, `LockoutScreen`, `AdminsTab`, `DEV_BYPASS` role injection. Flag stayed off in prod — zero behavior change. Verified and pushed.
- No production impact yet. The client knows how to do allowlist auth but isn't asked to.

## Plan discrepancy resolved

Parent plan step B7 said "seed the allowlist from `wise_export.csv`... one doc per tutor." That was based on a wrong assumption. The actual Wise "Learner Report" CSV that [parseWiseCsv](../app.jsx#L62) handles is a **student** roster, not a tutor roster. Wise's tutor management UI shows ~10 tutor records but only **3 have usable emails** — the rest are phone-only:

| Tutor            | Email                                | Status for allowlist        |
| ---------------- | ------------------------------------ | --------------------------- |
| Aidan Meyers     | (personal: aidan.meyers12@gmail.com) | admin (bootstrapped)        |
| Aidan Meyers     | (personal: aidan.wolf2005@gmail.com) | admin (bootstrapped)        |
| Kiran Shay       | kiranshay123@gmail.com               | admin (bootstrapped)        |
| Danielle Desrochers | danielle.desrochers13@gmail.com   | tutor (added via admin UI)  |
| Maryam Alrahmani | maryam.alrahmani6@gmail.com          | tutor (added 2026-04-13)    |
| Lila Iwanowski   | —                                    | ask Aidan for email         |
| Jane Kogan       | —                                    | ask Aidan for email         |
| Joseph Konathapally | —                                 | ask Aidan for email         |
| ~~Heather DaSilva~~  | ~~dasilva.heather@brevardschools.org~~ | removed 2026-04-13 — not an actual tutor for ATS |
| ~~Dr. Donald Warden~~| ~~dewarden@memphis.edu~~         | removed 2026-04-13 — not an actual tutor for ATS |

**Decision:** no seed script. Manual entry via the Phase A admin UI is faster than plumbing a Node + `firebase-admin` script for 3 known + 6 chase-down emails. Aidan chases the 6 phone-only tutors for personal emails as they come up during rollout.

Note: Kiran's current workspace email `kshay@affordabletutoringsolutions.org` is **not** added to the allowlist — that account goes away with the workspace. Kiran's allowlist identity is `kiranshay123@gmail.com`.

## Scope of THIS session

1. **Rewrite `firestore.rules`** with a dual-gate: `isWorkspaceUser() || isAllowlisted()`. Both paths grant access to `psm-data/main` simultaneously. Either can be rolled back independently.
2. **Add an `allowlist` collection rule** that gates reads and writes to admins only (plus, transitionally, workspace users — see "Transitional read access" below).
3. **Rewrite the stale Phase 2 scaffold** in the rules to match the allowlist model instead of the old custom-claims design. Keep it commented out — Phase 2 ships it.
4. **Document the bootstrap procedure** so Kiran can: create 3 admin docs in Firebase Console, deploy rules, run a local flag-flip test, add the 3 known tutor emails via the admin UI, flip the flag back off, push.
5. **No changes to `app.jsx`.** The client from Session 1 is already correct — it just needs rules that allow its reads/writes to succeed.
6. **No deploys from Claude.** Kiran deploys `firestore.rules` manually via `firebase deploy --only firestore:rules`.

## Transitional read access to `allowlist`

Phase B has a chicken-and-egg problem. The admin UI reads `allowlist` to populate its table. Under the new rules, that read requires admin role. But you bootstrap admin role by writing allowlist docs via Firebase Console (which bypasses rules). Once the three admin docs exist, reads work for those accounts, so this is fine in normal operation.

**But:** what if an existing workspace tutor tries to open the app after the rules deploy and the allowlist read for their email returns `permission-denied`? They're not an admin, so they can't read any allowlist doc — including their own. The client code handles this: with the flag **off** in Phase B shipped code, the client never calls `getAllowlistEntry()` in the first place, because the auth path is still the workspace domain check. No reads attempted, no errors. The dual-gate in rules exists to let Phase C's flag-flip "just work" when it happens.

So the admin UI is only reachable in Phase B via `?dev=1&role=admin` locally. Kiran's local flag-flip test below is the only time the real admin UI queries fire. After Kiran's local test proves everything, flag stays off in pushed code.

## Architectural notes on the rules

- **Allowlist doc ID is always lowercased email.** Rules use `request.auth.token.email.lower()` for the lookup to match the client, which lowercases before writing.
- **`isWorkspaceUser()` is kept verbatim** from the existing `isTutor()` logic — same regex, same `email_verified` check. Renamed for clarity.
- **`isAllowlisted()` costs 1 Firestore read per rule evaluation.** Fine for ~51 concurrent users. Upgrade path (custom claims) documented in the parent plan.
- **Role-based writes on `psm-data/main`:** workspace users and allowlist `tutor`/`admin` can write. `student` and `parent` are read-only (Phase 2 will lock this tighter once per-student docs exist).
- **Admin-only allowlist writes.** Students/parents/tutors can't modify the allowlist even if they somehow got a client to try.
- **`list` operations on the allowlist collection** (the admin UI's `.get()`) are gated by admin — a non-admin listing the collection gets permission-denied immediately. This is correct: we don't want tutors enumerating peers.

## What Kiran does manually this session

In order:

### Step 1 — Bootstrap admin docs in Firebase Console

Firestore rules bypass is the only way to bootstrap before admin-auth exists. Open [Firebase Console → Firestore → Data](https://console.firebase.google.com/project/psm-generator/firestore) and create a collection `allowlist` with three documents. Use the exact doc IDs shown.

**Doc ID:** `kiranshay123@gmail.com`
```json
{
  "email": "kiranshay123@gmail.com",
  "role": "admin",
  "studentId": null,
  "studentIds": [],
  "addedBy": "bootstrap",
  "addedAt": "2026-04-13T00:00:00Z",
  "active": true
}
```

**Doc ID:** `aidan.meyers12@gmail.com`
```json
{
  "email": "aidan.meyers12@gmail.com",
  "role": "admin",
  "studentId": null,
  "studentIds": [],
  "addedBy": "bootstrap",
  "addedAt": "2026-04-13T00:00:00Z",
  "active": true
}
```

**Doc ID:** `aidan.wolf2005@gmail.com`
```json
{
  "email": "aidan.wolf2005@gmail.com",
  "role": "admin",
  "studentId": null,
  "studentIds": [],
  "addedBy": "bootstrap",
  "addedAt": "2026-04-13T00:00:00Z",
  "active": true
}
```

### Step 2 — Deploy the new rules

```
firebase deploy --only firestore:rules
```

After this, both the old workspace gate AND the new allowlist gate allow access to `psm-data/main`. Existing tutors notice nothing. You can now read/write the `allowlist` collection with any of the three admin Google accounts.

### Step 3 — Local flag-flip smoke test (do NOT push this)

This is the only way to exercise the real allowlist sign-in path before Phase C. The changes stay local; revert before pushing.

1. Open `app.jsx`. Temporarily change line ~318:
   ```
   const USE_ALLOWLIST_AUTH = true;
   ```
2. Rebuild: `python build_index.py`
3. Serve `index.html` locally and open the **production URL** or localhost without `?dev=1`. You want real Google sign-in, not dev bypass.
4. Click "Continue with Google". Sign in with `kiranshay123@gmail.com`.
5. Expected: you land in the tutor app with the "Admins" tab visible. Open the Admins tab. Expected: the table loads three entries (you + both of Aidan's).
6. Add a test tutor entry: `dasilva.heather@brevardschools.org`, role `tutor`. Expected: toast "Added…", table refreshes with 4 rows.
7. Add the other two known tutors via the same form:
   - `dewarden@memphis.edu`, role `tutor`
   - `danielle.desrochers13@gmail.com`, role `tutor`
8. Sign out. Sign back in with a throwaway Google account that is NOT on the allowlist. Expected: `LockoutScreen` with the email shown.
9. Sign out from lockout. Sign back in with `kiranshay123@gmail.com`. Confirm you still get in.
10. **Revert the flag:** change `USE_ALLOWLIST_AUTH` back to `false` in `app.jsx`, rebuild with `python build_index.py`.
11. **Verify revert:** reload the app — you should now see the old tutor sign-in screen again.

The allowlist entries you added in step 6–7 stay in Firestore permanently. They're the initial tutor roster. Do not delete them.

### Step 4 — Commit and push

Commit the rules change + any docs updates. The `app.jsx` flag should be back at `false`. Push.

## Checkpoint

Phase B is complete when:
- [x] `firestore.rules` has the dual-gate
- [x] Phase 2 scaffold is rewritten to the allowlist model (still commented)
- [ ] Kiran bootstrapped 3 admin docs via Firebase Console
- [ ] Kiran deployed rules
- [ ] Kiran local-tested flag flip and added 3 tutor docs
- [ ] Kiran reverted the flag and pushed

## What's next (not this session)

- **Session 3 (Phase C):** Flip `USE_ALLOWLIST_AUTH` to `true` in shipped code, push, monitor for ~3 days. By this time Aidan should have collected personal emails for the 6 phone-only tutors and added them via admin UI. This is the production cutover and the risky moment.
- **Session 4 (Phase D):** Remove `isWorkspaceUser()` from rules, remove `ATS_DOMAIN` from `app.jsx`, remove workspace sign-in copy. Migration complete.

## Open risks / things to watch

- **Admin lockout.** If you typo your own allowlist doc ID or set `active: false` on yourself, and the workspace gate is also gone (Phase D), you're locked out. Mitigation: AdminsTab refuses to let you deactivate or delete your own row (implemented in Session 1). Firebase Console recovery remains available as an escape hatch.
- **Case sensitivity.** All doc IDs are lowercased at write time and rules look up with `.lower()`. If someone signs in as `Foo@Gmail.com`, Firebase Auth normalizes `token.email` but `.lower()` is still a correct safety net.
- **Admin tab read of allowlist in Phase B prod.** With flag off in shipped code, admin tab is not rendered at all in prod (no `currentUserEntry`), so the permission-denied issue is moot. Only dev bypass locally surfaces it.
