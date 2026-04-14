# scripts/

## migrate_to_per_student.mjs

One-shot migration: `psm-data/main.students[]` → `/students/{id}` plus a `_private/info` subcollection doc holding the tutor-only `notes` field. See [`docs/PHASE_2_SESSION_1.md`](../docs/PHASE_2_SESSION_1.md) for the full procedure.

### Prerequisites

- Node 18+
- `firebase-admin` installed (either globally or via `npx`)
- A service-account JSON for the `psm-generator` Firebase project on disk
- `GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/service-account.json` exported in the shell

### Run

```sh
# Dry run — prints what it would do, writes nothing. REQUIRED on first run.
node scripts/migrate_to_per_student.mjs --dry-run

# Live — writes /students/{id} + _private/info and stamps migratedAt on the blob.
node scripts/migrate_to_per_student.mjs --live
```

Default mode is dry-run. `--live` must be passed explicitly. If both are passed, `--dry-run` wins.

The script is idempotent: re-running it skips students whose per-doc state already matches the blob (JSON-structural equality).

### What the script never does

- It does **not** modify `assignments`, `scores`, `diagnostics`, or `welledLogs`. These arrays are copied byte-for-byte. OneDrive URLs in `assignments[]` are preserved exactly as they exist in the blob.
- It does **not** delete `psm-data/main.students[]`. The blob stays intact as the rollback anchor during the `DUAL_WRITE_GRACE` window.

### Rollback

**Before the grace window closes:** delete the `/students` collection via Firebase Console. The blob is still current (dual-write keeps it that way), so reverting the client commit restores the old behavior with zero data loss.

**After the grace window closes:** requires a reverse-migration script that reads `/students/{id}` and reconstructs `psm-data/main.students[]`. See [`docs/PHASE_2_SESSION_1.md` §Rollback](../docs/PHASE_2_SESSION_1.md).
