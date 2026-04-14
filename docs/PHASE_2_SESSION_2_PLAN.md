# Phase 2 — Session 2 Implementation Plan

**Date:** 2026-04-14
**Spec:** [PHASE_2_SESSION_1.md](PHASE_2_SESSION_1.md) (authoritative)
**Risk:** HIGH — migrates production Firestore and rewrites the core sync path.
**Execution model:** Checkpoint-gated. Claude writes; Kiran runs every production operation (rules deploy, migration script, push, flag flip). Claude does not commit, push, or deploy.

**Goal:** Rewrite `firestore.rules`, write the migration script, and rewrite the client sync layer at [app.jsx:1008-1054](../app.jsx#L1008-L1054) to read/write per-student docs while dual-writing the legacy blob during a 24-hour grace window.

**Architecture:** React state shape is preserved byte-for-byte. Only the Firestore persistence boundary changes — the `students[]` array becomes a `/students/{id}` collection listener; writes become a batched per-doc write plus (conditionally) a dual-write to `psm-data/main`. Tutor-only `notes` is split into a `_private/info` subcollection doc and loaded via a separate listener layer. `customAssignments` stays on the legacy blob.

---

## Constraints (from kickoff prompt — these are hard limits)

- **Never rewrite OneDrive URLs in `student.assignments[]`.** Migration copies arrays byte-for-byte.
- **Do not flip `USE_ALLOWLIST_AUTH`.** Phases C/D of auth migration stay deferred.
- **Do not commit, push, or deploy.** Kiran runs all production operations.
- **Do not run the migration script against production.** Kiran runs it. `--dry-run` is required on first run.
- **Tutor flow must be unchanged** under `?dev=1` after the rewrite. Regression gate.
- **No slop in docs/comments.** Only comment when the *why* is non-obvious.

---

## File map

| Path | Action | Responsibility |
|---|---|---|
| [firestore.rules](../firestore.rules) | **Rewrite** | Replace Phase B dual-gate + commented-out scaffold with live Phase 2 rules per the spec's §Firestore rules block. `isWorkspaceUser()` stays in the OR chain. |
| `scripts/migrate_to_per_student.mjs` | **Create** | One-shot `firebase-admin` script. Reads `psm-data/main`, writes `/students/{id}` + `/students/{id}/_private/info`. `--dry-run` flag. Idempotent. Stamps `migratedAt` tombstone. |
| `scripts/README.md` | **Create** | ~20 lines: how to run the migration script, required env vars, `--dry-run` first, rollback notes. |
| [app.jsx](../app.jsx) ~L317 | **Add constant** | `DUAL_WRITE_GRACE = true` next to `USE_ALLOWLIST_AUTH`. |
| [app.jsx](../app.jsx) ~L288-303 | **Extend helpers** | Add `studentsCollection()`, `studentDocRef(id)`, `notesDocRef(id)`, `saveStudentNotes(id, notes)`. Leave `FS_DOC` and `fsWrite` alone — they remain the legacy-blob path used by dual-write. |
| [app.jsx:1008-1054](../app.jsx#L1008-L1054) | **Rewrite** | Replace the single `onSnapshot` with two listeners (students collection + legacy blob for `customAssignments`). Replace `fsWrite({students})` with a batch write to `/students/{id}` plus conditional dual-write to the blob. Keep React state shape identical. |
| `docs/PHASE_2_SESSION_2.md` | **Create at session end** | Closeout doc. What shipped, deviations, risks, Session 3 kickoff prompt. |

**Not touched:** `AppInner` business logic, `StudentProfile`, `build_index.py`, `firebase.json`, anything in `tests/`. The entire point of the "preserve React state shape" rule is that none of this has to move.

---

## Known schema/code facts that shape the plan

1. **`students[]` today:** each entry has `{id, name, grade, tutor, notes, dateAdded, assignments, scores, diagnostics, welledLogs, deleted}`. Confirmed at [app.jsx:1502](../app.jsx#L1502).
2. **`notes` read path:** only one display site found — [app.jsx:2947](../app.jsx#L2947) reads `p.notes` (profile card pill). It's set on student creation at [app.jsx:1502](../app.jsx#L1502). There's no current edit-notes UI; `notes` is write-once at creation. This matters for the sync layer — `saveStudentNotes` only needs to fire on `addStudent`, not on every mutation.
3. **Write sources today:** `setStudents(...)` is called from ~28 sites, all of which feed the single `useEffect([students])` at [app.jsx:1044-1048](../app.jsx#L1044-L1048). The sync-layer rewrite catches all of them.
4. **`_fromFirestore` guard** at [app.jsx:1005](../app.jsx#L1005) prevents write-back loops. The new code must preserve this mechanism across both listeners.
5. **`customAssignments`** stays on `psm-data/main`. No change to its write path — it keeps calling `fsWrite({customAssignments})`.
6. **Rules `isWorkspaceUser` stays in the OR chain.** Auth Phase C/D still deferred. The new rules must not break existing workspace-gated tutor access.

---

## Checkpoint flow (from kickoff — matches execution)

Work stops at the **first** checkpoint reached. Claude reports status and waits.

1. **CHECKPOINT 1 (Task 1 complete):** `firestore.rules` rewritten. Not deployed. Kiran reviews, optionally tests in the rules simulator, then tells Claude to continue.
2. **CHECKPOINT 2 (Task 2 complete):** Migration script + `scripts/README.md` written. Not run. Kiran reads end-to-end, discusses, then dry-runs manually.
3. **CHECKPOINT 3 (Task 3 complete):** Client sync layer rewritten. Not pushed. Kiran runs locally under `?dev=1`, verifies tutor flow, then pushes.
4. **CHECKPOINT 4 (post-push):** Client live with `DUAL_WRITE_GRACE = true`. 24-hour monitoring window. Flip to `false` only after 24 clean hours.

**This plan only covers Tasks 1–3 and the closeout doc.** Task 3's completion is Session 2's end-of-active-Claude-work. Checkpoint 4 is Kiran-time, not Claude-time.

---

## Task 1 — Rewrite `firestore.rules`

**Files:** Rewrite [firestore.rules](../firestore.rules) in place.

**Why checkpoint here:** Rules are the first production-touching artifact. Getting them wrong locks out tutors the moment Kiran deploys. Kiran reads + simulator-tests before deploy.

### Step 1.1 — Replace the rules file

Use the exact structure from [PHASE_2_SESSION_1.md §Firestore rules](PHASE_2_SESSION_1.md#firestore-rules-phase-2-target-shape). Specifically:

- Keep the existing helpers: `isWorkspaceUser()`, `emailKey()`, `isAllowlisted()`, `allowlistRole()`, `isAllowlistAdmin()`. Verbatim from current file.
- Add new helpers:
  - `allowlistStudentIds()` — reads `allowlist/{emailKey}.studentIds`.
  - `isTutorOrAdmin()` — `isWorkspaceUser() OR (isAllowlisted() AND allowlistRole() in ['tutor','admin'])`.
  - `isLinkedToStudent(studentId)` — `isAllowlisted() AND allowlistRole() in ['student','parent'] AND studentId in allowlistStudentIds()`.
  - `canReadStudent(studentId)` — `isTutorOrAdmin() OR isLinkedToStudent(studentId)`.
- `match /allowlist/{email}`: unchanged — `isAllowlistAdmin()` only.
- `match /psm-data/main`: **loosen to** `allow read, write: if isTutorOrAdmin();` The spec's shape uses `isTutorOrAdmin` here; this preserves workspace access via the OR chain inside that helper and drops `allow read: if isAllowlisted()` because students/parents no longer touch the blob under the new schema. **Verification required before deploy:** confirm with Kiran that no client code path still expects student/parent reads against `psm-data/main`. (The Session 2 client rewrite routes student/parent reads exclusively through `/students/{id}`, so this is consistent — but call it out explicitly at checkpoint review.)
- `match /students/{studentId}`:
  - `allow read: if canReadStudent(studentId);`
  - `allow write: if isTutorOrAdmin();`
  - Nested `match /_private/{doc}`: `allow read, write: if isTutorOrAdmin();`
  - Nested `match /submissions/{submissionId}`:
    - `allow read: if canReadStudent(studentId);`
    - `allow create: if isLinkedToStudent(studentId) && request.resource.data.status == 'draft';`
    - `allow update: if isLinkedToStudent(studentId) && resource.data.status == 'draft' && request.resource.data.status in ['draft','submitted'];`
    - `allow write: if isTutorOrAdmin();` (tutor/admin can do anything)
    - `allow delete: if isTutorOrAdmin();`
- Final fallthrough `match /{document=**} { allow read, write: if isWorkspaceUser(); }` — kept. Workspace users retain access to ad-hoc docs during Phases C/D deferral.

### Step 1.2 — Comment discipline

Preserve the top-of-file header comment, but update it to describe the Phase 2 state accurately. Drop the old "Phase 2 scaffolding (do NOT uncomment…)" block — its content has been promoted to live rules. Keep inline comments only where the *why* is non-obvious:

- Why `isWorkspaceUser()` is still in `isTutorOrAdmin()` (auth Phase C/D deferred — one line).
- Why `_private/info` is a subcollection, not a field (rules can't gate fields — one line).
- Why `allow write: if isTutorOrAdmin()` appears after the student-create/update rules on `submissions/` (tutor override — one line).

No other comments. Strip any filler left over from the old scaffold.

### Step 1.3 — Self-verify

Read the rewritten file end-to-end and confirm:
- [ ] No reference to the deleted scaffold block.
- [ ] `isWorkspaceUser()` appears inside `isTutorOrAdmin()` exactly once.
- [ ] Every `match` block has explicit `allow` rules (no implicit denies via omission that would surprise the reader).
- [ ] Doc comments at the top reference `docs/PHASE_2_SESSION_1.md` as the source of truth.

### Step 1.4 — STOP at CHECKPOINT 1

Report to Kiran:
- Rules rewritten. Not deployed.
- Flag the one call-out: the `psm-data/main` rule dropped `allow read: if isAllowlisted()` — confirm no client path depends on student/parent reading the blob.
- Suggest: test in the Firebase rules simulator with representative identities (workspace user, admin allowlist, tutor allowlist, student allowlist linked to studentId, student allowlist NOT linked, unauthenticated) before deploying.
- Wait for approval to continue to Task 2.

---

## Task 2 — Migration script `scripts/migrate_to_per_student.mjs`

**Files:**
- Create: `scripts/migrate_to_per_student.mjs`
- Create: `scripts/README.md`

**Why checkpoint here:** This script touches production Firestore. Kiran runs it manually with `--dry-run` first and reviews dry-run output before any real run.

### Step 2.1 — Script contract

**Runtime:** Node 18+, ESM (`.mjs`). `firebase-admin` SDK.

**CLI:**
```
node scripts/migrate_to_per_student.mjs --dry-run          # default: dry run
node scripts/migrate_to_per_student.mjs --live             # writes for real
node scripts/migrate_to_per_student.mjs --live --project psm-generator
```

**Default to dry-run.** Requires explicit `--live` to write. No ambiguous states.

**Auth:** Uses `GOOGLE_APPLICATION_CREDENTIALS` env var pointing at a service-account JSON, OR `firebase-admin` default app discovery. Document both in `scripts/README.md`.

### Step 2.2 — Behavior

```
1. Initialize admin SDK. Print target project id.
2. Read psm-data/main. If missing, fail loud and exit 1.
3. Extract students = data.students || []. Print "Found N students."
4. For each student s in students:
     a. Destructure: const {notes, ...rest} = s.
     b. Validate: s.id is a non-empty string. If not, fail loud (list the offending
        index and skip — do not guess an id).
     c. Target main doc: /students/{s.id}.
     d. Target notes doc: /students/{s.id}/_private/info.
     e. Idempotency check: read /students/{s.id}. If exists and its data deep-equals
        rest (ignoring server timestamps), mark as "skip (already migrated)".
        Otherwise mark as "write".
     f. In dry-run: print "[DRY] write /students/{id} (N bytes)" and
        "[DRY] write /students/{id}/_private/info (notes: <present|absent>)".
     g. In live: batch.set(mainRef, rest, {merge:false}) and
                 batch.set(notesRef, {notes: notes ?? ""}, {merge:false}).
5. Commit the batch in chunks of 250 (Firestore batch limit is 500; 250 is a
   safe margin since each student is 2 writes).
6. After successful batch commit (live only): set
   psm-data/main { migratedAt: FieldValue.serverTimestamp() }, merge:true.
   Dry-run prints the intended tombstone update but does not write it.
7. Print summary: {migrated, skipped, errors, dryRun}. Exit 0 on success,
   non-zero on any error.
```

**Hard rules (encoded in the script, not just in comments):**
- `assignments`, `scores`, `diagnostics`, `welledLogs` are copied **by reference from the destructured `rest`**. No mapping, no filtering, no reformatting. Any code that reads `s.assignments[i].url` and rewrites it is a bug — the script must not contain such code.
- The script never deletes anything. No `delete`, no `set` with `{students: FieldValue.delete()}`, no overwrite of `psm-data/main.students`.
- The script never writes to `/students/` if run without `--live`.

### Step 2.3 — Implementation sketch

```js
#!/usr/bin/env node
// scripts/migrate_to_per_student.mjs
//
// One-shot: psm-data/main.students[] -> /students/{id} + /_private/info.
// Spec: docs/PHASE_2_SESSION_1.md §Migration procedure.
// Preserves OneDrive URLs verbatim — do not add any URL-handling code here.

import admin from "firebase-admin";

const args = new Set(process.argv.slice(2));
const isLive = args.has("--live");
const isDryRun = !isLive || args.has("--dry-run"); // dry-run wins on conflict

admin.initializeApp();
const db = admin.firestore();

async function main() {
  console.log(`[migrate] project=${admin.app().options.projectId || "(default)"} mode=${isDryRun ? "DRY-RUN" : "LIVE"}`);

  const blobRef = db.doc("psm-data/main");
  const blobSnap = await blobRef.get();
  if (!blobSnap.exists) { console.error("[migrate] psm-data/main missing"); process.exit(1); }

  const students = Array.isArray(blobSnap.data().students) ? blobSnap.data().students : [];
  console.log(`[migrate] found ${students.length} students in blob`);

  let migrated = 0, skipped = 0, errors = 0;
  const chunks = [];
  for (let i = 0; i < students.length; i += 250) chunks.push(students.slice(i, i + 250));

  for (const chunk of chunks) {
    const batch = db.batch();
    let batched = 0;

    for (const s of chunk) {
      if (!s || typeof s.id !== "string" || !s.id) {
        console.error(`[migrate] skipping entry with missing id:`, s);
        errors++;
        continue;
      }
      const { notes, ...rest } = s;
      const mainRef = db.doc(`students/${s.id}`);
      const notesRef = db.doc(`students/${s.id}/_private/info`);

      const existing = await mainRef.get();
      if (existing.exists && deepEqual(existing.data(), rest)) {
        console.log(`[migrate] skip ${s.id} (already migrated, unchanged)`);
        skipped++;
        continue;
      }

      if (isDryRun) {
        console.log(`[DRY] write /students/${s.id}  (assignments=${(rest.assignments||[]).length}, scores=${(rest.scores||[]).length})`);
        console.log(`[DRY] write /students/${s.id}/_private/info  (notes=${notes ? "present" : "absent"})`);
      } else {
        batch.set(mainRef, rest); // overwrite; preserves arrays byte-for-byte
        batch.set(notesRef, { notes: notes ?? "" });
        batched += 2;
      }
      migrated++;
    }

    if (!isDryRun && batched > 0) await batch.commit();
  }

  if (!isDryRun) {
    await blobRef.set({ migratedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  } else {
    console.log(`[DRY] would stamp psm-data/main.migratedAt`);
  }

  console.log(`[migrate] done  migrated=${migrated} skipped=${skipped} errors=${errors} mode=${isDryRun ? "DRY" : "LIVE"}`);
  process.exit(errors > 0 ? 2 : 0);
}

function deepEqual(a, b) {
  // Structural equality for plain JSON-ish data. Good enough for idempotency.
  return JSON.stringify(a) === JSON.stringify(b);
}

main().catch(e => { console.error("[migrate] fatal", e); process.exit(1); });
```

Note the deliberate simplicity of `deepEqual` — this runs once, on 51 students, with no cyclic refs. A more sophisticated comparator is YAGNI.

### Step 2.4 — `scripts/README.md`

Short. Exactly this content (no more):

```markdown
# scripts/

## migrate_to_per_student.mjs

One-shot migration: `psm-data/main.students[]` → `/students/{id}` + `_private/info` subcollection doc. See `docs/PHASE_2_SESSION_1.md` for the full procedure.

### Prerequisites

- Node 18+
- `npm i -g firebase-admin` (or run via `npx`)
- A service-account JSON for project `psm-generator` on disk, and `GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/sa.json` exported in the shell

### Run

```
# Dry run — no writes, prints what it would do. REQUIRED first.
node scripts/migrate_to_per_student.mjs --dry-run

# Live — writes /students/{id} and stamps psm-data/main.migratedAt
node scripts/migrate_to_per_student.mjs --live
```

The script is idempotent: re-running it skips students whose per-doc state already matches the blob.

### Rollback

Before grace window closes: delete the `/students` collection via Firebase Console. The blob is untouched.

After grace window closes: requires a reverse-migration script. See `docs/PHASE_2_SESSION_1.md §Rollback`.
```

### Step 2.5 — STOP at CHECKPOINT 2

Report to Kiran:
- Script + README written.
- Kiran reads the script end-to-end.
- Kiran exports `GOOGLE_APPLICATION_CREDENTIALS` and runs `--dry-run` against production.
- Kiran pastes dry-run output back for a sanity check on student count + first few entries.
- Only then does Kiran run `--live`.
- Wait for approval to continue to Task 3.

---

## Task 3 — Rewrite the client sync layer

**Files:** [app.jsx](../app.jsx) — specifically the helper block (~L288-303), the flag block (~L310-317), and the sync `useEffect`s (~L1008-1054). No changes elsewhere.

**Why checkpoint here:** This is the payload that goes to tutors. Kiran verifies tutor flow locally via `?dev=1` before pushing.

### Step 3.1 — Add `DUAL_WRITE_GRACE` flag

Right below `USE_ALLOWLIST_AUTH` (around [app.jsx:317](../app.jsx#L317)):

```js
// Dual-write grace window for the Phase 2 schema migration.
// When true, tutor writes go to BOTH /students/{id} (new authoritative path)
// and psm-data/main.students[] (legacy blob). Kept on for ~24 hours post-cutover
// so rollback is a client revert instead of a reverse migration. Flipped to
// false manually by Kiran after a clean monitoring window.
// See docs/PHASE_2_SESSION_1.md §Cutover sequence.
const DUAL_WRITE_GRACE = true;
```

### Step 3.2 — Add new Firestore helpers

Immediately after the existing `fsRef` / `fsWrite` block (~L293-303), add:

```js
// Per-student collection refs (Phase 2). Legacy FS_DOC still used for
// customAssignments and for dual-write during DUAL_WRITE_GRACE.
const studentsCollection = () => window.db ? window.db.collection("students") : null;
const studentDocRef = (id) => window.db ? window.db.collection("students").doc(id) : null;
const notesDocRef = (id) => window.db
  ? window.db.collection("students").doc(id).collection("_private").doc("info")
  : null;

// Notes are written out-of-band from the main batch — they change rarely
// (only on student creation today) and mixing them into every tutor state
// change would fire wasted writes.
async function saveStudentNotes(id, notes) {
  const ref = notesDocRef(id);
  if (!ref) return;
  try { await ref.set({ notes: notes ?? "" }); }
  catch (e) { console.warn("[Firestore] notes write error:", e); }
}
```

Do **not** remove or modify `FS_DOC`, `fsRef`, or `fsWrite`. The legacy blob path stays as-is; the dual-write uses it.

### Step 3.3 — Rewrite the read-side `useEffect`

Replace [app.jsx:1008-1041](../app.jsx#L1008-L1041). Target shape:

```js
// ── Firestore real-time sync (Phase 2 — per-student docs + legacy blob) ──
useEffect(() => {
  const col = studentsCollection();
  const blobRef = fsRef();
  if (!col || !blobRef) {
    setCloudStatus("offline");
    console.log("[Firestore] No db available, using localStorage only");
    return;
  }

  // Listener 1: /students collection -> students[] in React state.
  // The notes field lives in /_private/info and is NOT loaded here; it is
  // read lazily when a tutor opens a profile (Task 3.5).
  const unsubStudents = col.onSnapshot((snap) => {
    const next = snap.docs.map(d => {
      const data = d.data() || {};
      // Preserve field shape identical to legacy blob entries so the rest
      // of AppInner does not care where the data came from. `notes` is
      // absent here by design — hydrated separately.
      return { ...data, id: data.id || d.id };
    });
    _fromFirestore.current = true;
    setStudents(next);
    _fromFirestore.current = false;
    setCloudStatus("synced");
    sSave("psm_v4", next);
  }, (err) => {
    console.warn("[Firestore] students listen error:", err);
    setCloudStatus("offline");
  });

  // Listener 2: legacy blob -> customAssignments only. During the grace
  // window this also carries the dual-written students[] but we ignore it;
  // the /students collection is authoritative.
  const unsubBlob = blobRef.onSnapshot((snap) => {
    if (!snap.exists) return;
    const data = snap.data() || {};
    if (data.customAssignments) {
      _fromFirestore.current = true;
      setCustomAssignments(data.customAssignments);
      _fromFirestore.current = false;
      sSave("psm_custom_asg", data.customAssignments);
    }
  }, (err) => {
    console.warn("[Firestore] blob listen error:", err);
  });

  return () => { unsubStudents(); unsubBlob(); };
}, []);
```

**Deliberate omissions:**
- **No "seed from localStorage" fallback** for the students collection. That path existed for an empty Firestore on first boot; post-migration the collection is always populated, and a "seed from localStorage" path on a migrated project would silently *overwrite* the authoritative collection with whatever stale data is in the tutor's browser. That's a data-loss footgun. If the collection is genuinely empty, that's an ops problem — fail loud via empty state, not by writing stale data.
- **Notes are not loaded into the `students[]` array.** See 3.5.

### Step 3.4 — Rewrite the write-side `useEffect`

Replace [app.jsx:1044-1048](../app.jsx#L1044-L1048). Target:

```js
// Write students to /students/{id} via batch. During DUAL_WRITE_GRACE also
// write to psm-data/main.students so an in-grace rollback is a client revert.
useEffect(() => {
  if (_fromFirestore.current) return;
  sSave("psm_v4", students);

  // Debounce batch writes identically to the legacy fsWrite (800ms).
  if (_studentsBatchTimer) clearTimeout(_studentsBatchTimer);
  _studentsBatchTimer = setTimeout(() => {
    const db = window.db;
    if (!db) return;
    const batch = db.batch();
    students.forEach(s => {
      if (!s || !s.id) return;
      // Strip `notes` before writing — notes live in /_private/info and
      // would bleed tutor-only data into the student-readable doc.
      const { notes, ...rest } = s;
      batch.set(db.collection("students").doc(s.id), rest);
    });
    batch.commit().catch(e => console.warn("[Firestore] students batch error:", e));

    if (DUAL_WRITE_GRACE) fsWrite({ students });
  }, 800);
}, [students]);
```

And declare `_studentsBatchTimer` at module scope next to `_fsWriteTimer` (~[app.jsx:295](../app.jsx#L295)):

```js
let _fsWriteTimer = null;
let _studentsBatchTimer = null;
```

Leave the `customAssignments` write `useEffect` ([app.jsx:1050-1054](../app.jsx#L1050-L1054)) **unchanged** — it still calls `fsWrite({customAssignments})` against the legacy blob. That's the correct destination for `customAssignments` permanently per the spec.

### Step 3.5 — Notes handling

**Current state:** `notes` is set on student creation at [app.jsx:1502](../app.jsx#L1502) inside `addStudent` and displayed at [app.jsx:2947](../app.jsx#L2947) inside the profile header as `p.notes`. There is no edit-notes UI today.

**Plan:**

1. **On creation:** after `setStudents(prev => [...prev, {...newS, id:uid(), ...}])` in `addStudent`, also call `saveStudentNotes(newId, newS.notes)`. The new `students[]` state triggers the batch write; `notes` is stripped there per Step 3.4; the notes doc is written separately. This is two writes for a brand-new student — acceptable.

2. **On display:** in the profile card, `p.notes` will be `undefined` post-migration because notes are not in `/students/{id}`. To preserve the existing UI during this session without rebuilding the tutor's notes-loading path, add a small hydration hook inside `StudentProfile` (or at the profile open site) that reads `notesDocRef(profile.id).get()` once and stores the result in local component state, rendered in place of `p.notes`.

   **Location:** find the existing `profile` state setter, `openProfile` at [app.jsx:1503](../app.jsx#L1503). Extend it to fire a `.get()` on `notesDocRef(st.id)` and store the result in a new `profileNotes` state. Display site at [app.jsx:2947](../app.jsx#L2947) uses `profileNotes` instead of `p.notes`.

   Concrete diff:
   ```js
   // near other useState in AppInner:
   const [profileNotes, setProfileNotes] = useState("");

   // replace openProfile:
   const openProfile = (st) => {
     setProfile(st);
     setPtab("history");
     setPaChk({});
     setPaSubj("All");
     setPaSrch("");
     setSfm({date:todayStr(),testType:"",score:"",maxScore:"",notes:""});
     setTab("students");
     setProfileNotes("");
     const ref = notesDocRef(st.id);
     if (ref) ref.get().then(snap => {
       if (snap.exists) setProfileNotes(snap.data().notes || "");
     }).catch(e => console.warn("[Firestore] notes read error:", e));
   };

   // at the display site (~L2947), replace `p.notes` with `profileNotes`.
   ```

3. **Regression check:** for a student created before the migration, their notes live in `_private/info`. For a student created by the new client code, they also live in `_private/info` (via `saveStudentNotes` in `addStudent`). Either way, `openProfile` reads from the same place. Good.

### Step 3.6 — Regression gate

Before declaring Task 3 done, verify locally via `?dev=1`:

- [ ] App boots. `cloudStatus === "synced"`.
- [ ] `students[]` populates from the `/students` collection listener.
- [ ] `customAssignments` populates from the legacy blob listener.
- [ ] Adding a student: student appears in the table, writes land at `/students/{newId}`, notes land at `/students/{newId}/_private/info`, legacy blob also updated (since `DUAL_WRITE_GRACE = true`).
- [ ] Adding a score: `/students/{id}` updates; blob also updates.
- [ ] Deleting (soft-delete) a student: `/students/{id}` reflects `deleted: true`; student disappears from the active list.
- [ ] Opening a profile: notes display (if the student had notes in the migrated data).
- [ ] No new console errors compared to pre-rewrite baseline.
- [ ] OneDrive URLs in existing students' `assignments[]` are intact (spot-check one student's worksheet link).

**If any of these fail:** stop, report to Kiran, do not declare Task 3 done.

Note: Kiran must have already completed Checkpoint 2's migration dry-run + live run before Task 3 can be tested meaningfully. Without migrated data, the `/students` collection is empty and the tutor UI will look blank. That's not a Task 3 bug — it's ordering.

### Step 3.7 — STOP at CHECKPOINT 3

Report to Kiran:
- Sync layer rewritten.
- Local `?dev=1` regression checks passed (list them).
- Kiran runs the app locally one more time to sanity-check, then pushes.
- Remind: after push, `DUAL_WRITE_GRACE` stays `true` for 24 hours. Flip it to `false` manually, rebuild, push again. Do not flip it inside this session.

---

## Task 4 — Session closeout doc

**Files:** Create `docs/PHASE_2_SESSION_2.md`.

**When:** After Task 3 is complete and Kiran says the session is ending (either at Checkpoint 3 pause point, or later if we continue through Checkpoint 4).

**Contents:**

1. **What shipped** — bulleted list matching the kickoff prompt's expected artifacts: rules, script, README, client sync rewrite, `DUAL_WRITE_GRACE` constant.
2. **What did NOT ship** — explicitly: nothing was deployed; nothing was pushed; grace window not yet closed.
3. **Deviations from Session 1 spec, with reasons.** None expected, but surface any discovered during implementation (e.g., if the `psm-data/main` rule change turned out to need different handling, document it).
4. **New open questions / risks** — e.g. the "drop `allow read: if isAllowlisted()` on the blob" decision; the notes-on-creation two-write cost; anything else surfaced.
5. **Kickoff prompt for Session 3** at the bottom, same format as the current kickoff. Session 3's work is (per the spec's Session plan table): "Read-only student portal UI — RoleRouter, StudentPortal component, Score Trends chart."

---

## Self-review

Running the checklist from the skill against this plan:

1. **Spec coverage:**
   - Rules rewrite → Task 1 ✓
   - Migration script with dry-run → Task 2 ✓
   - `scripts/README.md` if missing → Task 2 ✓ (project has no `scripts/` dir yet, so both get created)
   - Client sync rewrite (two listeners, batch write, dual-write, `DUAL_WRITE_GRACE`, `saveStudentNotes`) → Task 3 ✓
   - Tutor-flow regression gate via `?dev=1` → Step 3.6 ✓
   - Do-not-commit, do-not-deploy, do-not-run-migration, do-not-touch-OneDrive → encoded in Task 1/2/3 constraints and in the Constraints section at the top ✓
   - Pause at first checkpoint → Task 1 Step 1.4, Task 2 Step 2.5, Task 3 Step 3.7 ✓
   - Session closeout doc with Session 3 kickoff → Task 4 ✓

2. **Placeholder scan:** No `TBD`, no `implement later`, no `similar to Task N`. Code blocks are provided for every code-change step. One known intentional soft spot: Task 2's `deepEqual` uses `JSON.stringify` — called out explicitly as YAGNI, not a placeholder.

3. **Type / name consistency:**
   - `DUAL_WRITE_GRACE` — used consistently.
   - `studentsCollection`, `studentDocRef`, `notesDocRef`, `saveStudentNotes` — defined in Step 3.2, used in 3.3/3.4/3.5.
   - `_studentsBatchTimer` — declared in 3.4, used in 3.4.
   - `profileNotes` state — declared and used in 3.5.
   - `_fromFirestore` guard — preserved across both listeners and both write effects in 3.3/3.4.
   - `notes` field handling — stripped in write (3.4), saved via `saveStudentNotes` in create path (3.5), loaded via `openProfile` hook (3.5). One source, one sink, matches the migration script's split (2.2).

One gap caught during review and fixed above: initial draft routed notes via the batch write. That's wrong — notes in `/students/{id}` would be visible to students. Fixed in Step 3.4 by stripping `notes` from `rest` before `batch.set`, and in Step 3.5 by writing notes exclusively via `saveStudentNotes` / `_private/info`.

---

**End of plan.**
