#!/usr/bin/env node
// scripts/upload_old_writing_keys.mjs
//
// Session 18A — uploads the pre-extracted Old Writing questionKey docs
// from scripts/old_writing_keys.json into Firestore. Companion to
// extract_old_writing_keys.mjs, which produced the JSON locally from the
// source PDFs.
//
// This script does NOT need the source PDFs — only the JSON. It's the
// safe runner for Cloud Shell + any other environment that has gcloud
// ADC but doesn't have the OneDrive mirror.
//
// Usage (from any project root with admin SDK creds):
//   cd ats-portal/scripts && npm install
//   node upload_old_writing_keys.mjs              # dry-run, prints summary
//   node upload_old_writing_keys.mjs --commit     # writes Firestore

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT_PATH = join(__dirname, "old_writing_keys.json");

const argv = process.argv.slice(2);
const isCommit = argv.includes("--commit");

const data = JSON.parse(readFileSync(INPUT_PATH, "utf8"));
const docs = Array.isArray(data.questionKeyDocs) ? data.questionKeyDocs : [];
if (docs.length === 0) {
  console.error(`[upload] ${INPUT_PATH} has no questionKeyDocs`);
  process.exit(1);
}

console.log(`[upload] mode=${isCommit ? "COMMIT" : "DRY-RUN"}`);
console.log(`[upload] source: ${INPUT_PATH}`);
console.log(`[upload] docs to write: ${docs.length}`);

// Distribution sanity check.
const byPrefix = new Map();
const byLetter = new Map();
for (const d of docs) {
  const prefix = d.id.split("-q")[0];
  byPrefix.set(prefix, (byPrefix.get(prefix) || 0) + 1);
  byLetter.set(d.correctAnswer, (byLetter.get(d.correctAnswer) || 0) + 1);
}
console.log("[upload] worksheets:");
for (const [p, n] of byPrefix) console.log(`    ${p}: ${n} questions`);
console.log("[upload] letter distribution:", Object.fromEntries(byLetter));

if (!isCommit) {
  console.log("[upload] dry-run, exiting. Pass --commit to write Firestore.");
  process.exit(0);
}

// Firestore write — Admin SDK uses ADC (gcloud auth application-default
// login) or GOOGLE_APPLICATION_CREDENTIALS env var.
admin.initializeApp({ projectId: "psm-generator" });
const db = admin.firestore();

let written = 0;
const BATCH_SIZE = 400; // Firestore batch limit is 500; leave headroom.
for (let i = 0; i < docs.length; i += BATCH_SIZE) {
  const batch = db.batch();
  for (const q of docs.slice(i, i + BATCH_SIZE)) {
    batch.set(db.collection("questionKeys").doc(q.id), { correctAnswer: q.correctAnswer });
    written++;
  }
  await batch.commit();
  console.log(`[upload] committed ${written}/${docs.length}`);
}
console.log(`[upload] done. ${written} questionKey docs written to /questionKeys/`);
process.exit(0);
