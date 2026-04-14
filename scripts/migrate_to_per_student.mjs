#!/usr/bin/env node
// scripts/migrate_to_per_student.mjs
//
// One-shot migration: psm-data/main.students[] -> /students/{id}
// plus /students/{id}/_private/info for the tutor-only `notes` field.
//
// Spec: docs/PHASE_2_SESSION_1.md §Migration procedure.
//
// Hard rule: assignments[], scores[], diagnostics[], welledLogs[] are
// copied byte-for-byte. No reformatting, no URL rewriting, no cleanup.
// The script never deletes anything — psm-data/main.students[] stays
// intact as the rollback anchor during the dual-write grace window.

import admin from "firebase-admin";

const argv = new Set(process.argv.slice(2));
const isLive = argv.has("--live");
const isDryRun = !isLive || argv.has("--dry-run"); // --dry-run wins on conflict

admin.initializeApp();
const db = admin.firestore();

async function main() {
  const projectId = admin.app().options.projectId || process.env.GOOGLE_CLOUD_PROJECT || "(default)";
  console.log(`[migrate] project=${projectId} mode=${isDryRun ? "DRY-RUN" : "LIVE"}`);

  const blobRef = db.doc("psm-data/main");
  const blobSnap = await blobRef.get();
  if (!blobSnap.exists) {
    console.error("[migrate] psm-data/main does not exist — nothing to migrate");
    process.exit(1);
  }

  const blob = blobSnap.data() || {};
  const students = Array.isArray(blob.students) ? blob.students : [];
  console.log(`[migrate] found ${students.length} students in blob`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  // Firestore batch limit is 500 writes. Each student is 2 writes
  // (main doc + notes doc), so 250 students per batch is the ceiling.
  const BATCH_STUDENTS = 250;

  for (let start = 0; start < students.length; start += BATCH_STUDENTS) {
    const chunk = students.slice(start, start + BATCH_STUDENTS);
    const batch = db.batch();
    let batched = 0;

    for (const s of chunk) {
      if (!s || typeof s.id !== "string" || !s.id) {
        console.error(`[migrate] ERROR: student entry missing id, skipping:`, s);
        errors++;
        continue;
      }

      const { notes, ...rest } = s;
      const mainRef = db.doc(`students/${s.id}`);
      const notesRef = db.doc(`students/${s.id}/_private/info`);

      const existing = await mainRef.get();
      if (existing.exists && deepEqual(existing.data(), rest)) {
        console.log(`[migrate] skip ${s.id} (${s.name || "?"}) — already migrated, unchanged`);
        skipped++;
        continue;
      }

      if (isDryRun) {
        console.log(
          `[DRY] write /students/${s.id} (${s.name || "?"}) — ` +
          `assignments=${(rest.assignments || []).length}, ` +
          `scores=${(rest.scores || []).length}, ` +
          `diagnostics=${(rest.diagnostics || []).length}, ` +
          `welledLogs=${(rest.welledLogs || []).length}`
        );
        console.log(`[DRY] write /students/${s.id}/_private/info — notes=${notes ? "present" : "absent"}`);
      } else {
        batch.set(mainRef, rest);
        batch.set(notesRef, { notes: notes ?? "" });
        batched += 2;
      }
      migrated++;
    }

    if (!isDryRun && batched > 0) {
      await batch.commit();
      console.log(`[migrate] committed batch of ${batched} writes`);
    }
  }

  if (!isDryRun) {
    await blobRef.set(
      { migratedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    console.log(`[migrate] stamped psm-data/main.migratedAt`);
  } else {
    console.log(`[DRY] would stamp psm-data/main.migratedAt`);
  }

  console.log(
    `[migrate] done  migrated=${migrated} skipped=${skipped} errors=${errors} ` +
    `mode=${isDryRun ? "DRY" : "LIVE"}`
  );
  process.exit(errors > 0 ? 2 : 0);
}

// Structural equality for JSON-ish data. The blob has no cyclic refs
// and no Firestore sentinels in the migrated fields, so stringify is
// a correct idempotency check for this one-shot migration.
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

main().catch(e => {
  console.error("[migrate] fatal", e);
  process.exit(1);
});
