#!/usr/bin/env node
// scripts/migrate_stu_pdfs.mjs
//
// Phase 3 Session 12 — uploads every matched STU_*.pdf referenced by a
// supported catalog row to Firebase Storage at worksheets/{slug}.pdf, then
// rewrites worksheets_catalog.json `stu` field from the OneDrive 1drv.ms
// share link to the Firebase Storage download URL.
//
// Supported rows only. Rows with answerFormat: "unsupported" are skipped.
// Rows without a STU file on disk (`stuFound: false` in extraction_output.json)
// keep their existing OneDrive link.
//
// Idempotent: uploading the same file to the same Storage path overwrites
// cleanly. Re-runs are safe.
//
// Usage:
//   node scripts/migrate_stu_pdfs.mjs             # dry-run
//   node scripts/migrate_stu_pdfs.mjs --commit    # real uploads + catalog rewrite
//
// Depends on: `node scripts/extract_answer_keys.mjs` having produced a
// current scripts/extraction_output.json.

import { readFileSync, writeFileSync, copyFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CATALOG_PATH = join(REPO_ROOT, "worksheets_catalog.json");
const EXTRACTION_PATH = join(__dirname, "extraction_output.json");

const PROJECT_ID = "psm-generator";
const STORAGE_BUCKET = "psm-generator.firebasestorage.app";
const STORAGE_PREFIX = "worksheets/";

const argv = process.argv.slice(2);
const isCommit = argv.includes("--commit");

// Slugify a worksheet title into a Storage path component. Keeps it short,
// URL-safe, deterministic. Collisions would be a catalog bug (two rows
// with different content under the same title).
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  console.log(`[stu] mode=${isCommit ? "COMMIT" : "DRY-RUN"}`);

  const extraction = JSON.parse(readFileSync(EXTRACTION_PATH, "utf8"));
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  console.log(`[stu] extraction rows: ${extraction.length}`);
  console.log(`[stu] catalog rows:    ${catalog.length}`);

  // Build the upload plan. One entry per supported row that has a STU file
  // on disk. Collision check: every slug must be unique.
  const plan = [];
  const slugSeen = new Map(); // slug -> first idx that used it
  for (const r of extraction) {
    const row = catalog[r.idx];
    if (!row) continue;
    if (row.answerFormat === "unsupported") continue;
    if (!r.stuFound || !r.stuPath) continue;

    const slug = slugify(row.title);
    if (!slug) {
      console.warn(`[stu] [${r.idx}] title "${row.title}" produced empty slug — skipping`);
      continue;
    }
    if (slugSeen.has(slug)) {
      console.warn(
        `[stu] [${r.idx}] slug "${slug}" collides with [${slugSeen.get(slug)}] — skipping second occurrence`
      );
      continue;
    }
    slugSeen.set(slug, r.idx);

    const st = statSync(r.stuPath);
    plan.push({
      idx: r.idx,
      title: row.title,
      slug,
      storagePath: `${STORAGE_PREFIX}${slug}.pdf`,
      localPath: r.stuPath,
      bytes: st.size,
    });
  }

  console.log(`[stu] upload plan size: ${plan.length}`);
  const totalBytes = plan.reduce((a, p) => a + p.bytes, 0);
  console.log(`[stu] total bytes:      ${(totalBytes / 1024 / 1024).toFixed(1)} MiB`);

  console.log("");
  console.log("[stu] === SAMPLE (first 5) ===");
  for (const p of plan.slice(0, 5)) {
    console.log(
      `  [${p.idx}] ${p.title}  ${(p.bytes / 1024).toFixed(0)} KiB  →  gs://${STORAGE_BUCKET}/${p.storagePath}`
    );
  }

  if (!isCommit) {
    console.log("");
    console.log(`[stu] dry-run complete. Re-run with --commit to upload.`);
    return;
  }

  // --commit path
  console.log("");
  console.log("[stu] === COMMIT PASS ===");
  admin.initializeApp({ projectId: PROJECT_ID, storageBucket: STORAGE_BUCKET });
  const bucket = admin.storage().bucket();
  console.log(`[stu] bucket: gs://${bucket.name}`);

  let uploaded = 0;
  const downloadUrls = new Map(); // idx -> download URL

  for (const p of plan) {
    await bucket.upload(p.localPath, {
      destination: p.storagePath,
      contentType: "application/pdf",
      metadata: {
        metadata: {
          sourceTitle: p.title,
          sourcePath: p.localPath,
          uploadedBy: "scripts/migrate_stu_pdfs.mjs",
        },
      },
    });

    // Construct a public Firebase Storage download URL via the object's
    // standard firebasestorage.googleapis.com endpoint. `alt=media` returns
    // the file content directly.
    const encoded = encodeURIComponent(p.storagePath);
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media`;
    downloadUrls.set(p.idx, url);

    uploaded++;
    if (uploaded % 10 === 0 || uploaded === plan.length) {
      console.log(`[stu]   uploaded ${uploaded}/${plan.length}`);
    }
  }
  console.log(`[stu] Storage uploads complete: ${uploaded} files`);

  // Catalog rewrite: stu field → Firebase Storage URL. Backup first.
  const backup = CATALOG_PATH + ".bak.stumigrate";
  copyFileSync(CATALOG_PATH, backup);
  console.log(`[stu] catalog backup: ${backup}`);

  const catalogRaw = readFileSync(CATALOG_PATH, "utf8");
  const catalogFresh = JSON.parse(catalogRaw);
  let mutated = 0;
  for (const [idx, url] of downloadUrls) {
    const row = catalogFresh[idx];
    if (!row) continue;
    row.stu = url;
    mutated++;
  }
  const trailing = catalogRaw.endsWith("\n") ? "\n" : "";
  writeFileSync(CATALOG_PATH, JSON.stringify(catalogFresh, null, 2) + trailing);
  console.log(`[stu] catalog rows mutated: ${mutated}`);
  console.log(`[stu] wrote ${CATALOG_PATH}`);

  console.log("");
  console.log("[stu] ✓ commit pass complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
