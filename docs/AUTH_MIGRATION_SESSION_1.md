# Auth Migration — Session 1 (Phase A)

**Date:** 2026-04-13
**Phase:** A — build alongside, feature-flagged OFF. Zero behavior change on ship.
**Parent plan:** [AUTH_MIGRATION_PLAN.md](AUTH_MIGRATION_PLAN.md)

---

## Answers to the parent plan's open questions

1. **Workspace shutdown date:** No hard deadline — "soon." No fixed date drives Phase C urgency; prioritize correctness over speed.
2. **Admins:** Kiran and Aidan only.
   - Kiran: `kiranshay123@gmail.com`
   - Aidan: `aidan.meyers12@gmail.com` AND `aidan.wolf2005@gmail.com` (he uses both)
3. **Allowlist seed source:** Reuse the Wise CSV tutor emails, excluding any `@affordabletutoringsolutions.org` workspace addresses (those accounts are being shut down). Seed script is deferred to Session 2 (Phase B).
4. **Admin UI location:** New tab inside the existing app, gated on `role === "admin"`. Confirmed.
5. **Dev bypass:** Already exists at [app.jsx:367-390](../app.jsx#L367-L390) (`DEV_BYPASS` + `DEV_FAKE_USER`, localhost + `?dev=1` only). Extending it this session to accept `?role=admin|tutor|student|parent` so the allowlist-aware flow can be tested without being on the real allowlist.

## Scope of THIS session

Phase A only. Everything behind `USE_ALLOWLIST_AUTH = false`. Shipped with the flag off, which means tutors see zero change.

**In scope:**
1. `USE_ALLOWLIST_AUTH` feature flag (default `false`).
2. `getAllowlistEntry(email)` — reads `allowlist/{emailLowercase}`, returns `{role, studentId, active}` or `null`.
3. New sign-in path (flag-gated): drop `hd:` hint, drop domain check, post-sign-in allowlist lookup, lockout screen on miss showing the user's email so they can ask an admin to add them.
4. `currentUserRole` state, threaded into `AppInner` (unused this session except by the admin tab).
5. `DEV_BYPASS` extended to read `?role=` query param so local testing can impersonate any role.
6. **Admin UI** — new "Admins" tab, admin-only, for listing / adding / toggling allowlist entries. CRUD against the `allowlist` collection via the Firestore web SDK (already loaded). CSV bulk import is **deferred** to Phase B since it's a Node + `firebase-admin` one-shot, not client code.
7. Rebuild `index.html` via `build_index.py`; verify flag-off tutor flow is unchanged.

**Explicitly deferred:**
- **Phase B** — rules dual-gate (`isWorkspaceUser() || isAllowlisted()`), Wise CSV seed script, rewrite stale Phase 2 rules scaffold, local flip-the-flag testing.
- **Phase C** — production flag flip, monitoring.
- **Phase D** — remove old domain gate and `ATS_DOMAIN` constant entirely.

## What Kiran does manually during/after this session

These are Firebase Console operations — Claude will not touch production Firestore. Do these **before** flipping the flag locally to test (which happens in Session 2, not this one):

**Create initial admin allowlist entries.** In Firebase Console → Firestore → create collection `allowlist`. Add three documents:

Doc ID: `kiranshay123@gmail.com`
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

Doc ID: `aidan.meyers12@gmail.com`
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

Doc ID: `aidan.wolf2005@gmail.com`
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

> **Schema note:** `studentIds: []` is included on every doc — even admins — so Phase 2 parent multi-child support doesn't require a second migration. `studentId` (singular) is kept for compatibility during the intermediate design but the admin UI writes `studentIds` as the source of truth.

**Firestore rules during Phase A:** unchanged. The existing `isTutor()` domain rule still gates everything. The admin UI will fail in production because tutors aren't admins and the allowlist collection isn't reachable under current rules — but the admin tab is only rendered to admins, and in Phase A with the flag off, nobody has a role, so the tab is never rendered in production. It's reachable only via `?dev=1&role=admin` locally. That's intentional — rules dual-gate is Phase B.

## Phase A architectural decisions

- **Allowlist document ID is lowercased email.** Avoids case-sensitivity bugs where `Foo@Gmail.com` and `foo@gmail.com` create two entries. Client always `.toLowerCase()`s before lookup and before write.
- **Allowlist read is one-shot on sign-in, cached in React state for the session.** Not a live subscription. If an admin revokes a user mid-session, the change takes effect on next reload. Tradeoff: simpler, cheaper, slightly delayed revocation. Acceptable for ~51 users.
- **Role-based route gating is NOT added this session.** `AppInner` still renders the full tutor experience regardless of `currentUserRole` (except for the admin tab). Phase 2 adds the role router.
- **Lockout error message exposes the user's email.** This is intentional so they can copy-paste it to an admin. Not a security issue — the user already knows their own email.
- **No `firebase-admin` server script this session.** Everything client-side. CSV seed is Phase B.

## Checkpoint at end of session

After the code lands and `build_index.py` rebuilds cleanly:

1. Kiran pulls, runs `python build_index.py`, opens `index.html` locally.
2. Verifies normal tutor flow still works (flag is off — should be identical to before).
3. Verifies dev bypass still works: `?dev=1` → app loads as tutor.
4. Verifies dev role injection: `?dev=1&role=admin` → "Admins" tab appears in the header.
5. Admin tab renders placeholder UI (not production-usable until Phase B dual-gate rules allow allowlist writes).
6. Kiran commits and pushes manually. Claude does not commit.

Session 2 (Phase B) picks up with: rules dual-gate, Wise CSV seed script, local flag flip for real testing.

## Open questions NOT resolved this session

- Exact list of Wise CSV emails to seed (Phase B — Aidan audits first).
- Production flip timing — no hard workspace shutdown date yet, so no urgency.
