#!/usr/bin/env node
// scripts/apply_catalog_fixes.mjs
//
// Phase 3 Session 12 — one-shot mutation of worksheets_catalog.json to:
//   (a) rename `keyTitle` on 9 rows so the extractor can locate files that
//       already exist under slightly different filenames on disk
//   (b) backfill `qs` on 3 rows where the catalog had null but extraction
//       produced a clean tuple count
//   (c) mark 17 rows with `answerFormat: "unsupported"` — stubs, Full Length
//       exam writing PDFs, and literary/poetry prompts that do not fit the
//       per-question answer-key model. These rows stay in the catalog so
//       future sessions can upgrade them in place if a supported variant
//       becomes available.
//
// Read-only aside from the catalog file itself. Writes a .bak next to it
// before mutating.
//
// Usage:
//   node scripts/apply_catalog_fixes.mjs

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = join(__dirname, "..", "worksheets_catalog.json");

// idx → new keyTitle
const KEY_TITLE_FIXES = {
  48: "Form Structure Sense-Easy (10Qs)",
  49: "Form Structure Sense-Medium (7Qs)",
  50: "Form Structure Sense-Hard (7Qs)",
  51: "Form Structure Sense-Comp (7Qs 2,2,3)",
  91: "CompAdvMath - Easy (15Qs)",
  93: "CompAdvMath - Hard (15Qs)",
  97: "NonLinearFns - Comprehensive (15Qs)",
  99: "NonLinEQs&SOEs - Medium (10Qs)",
  101: "NonLinEQs&SOEs - Comprehensive (15Qs)",
};

// idx → extracted count (catalog had qs: null)
const QS_BACKFILLS = {
  13: 11,
  71: 10,
  72: 10,
};

// idx → reason for marking unsupported
const UNSUPPORTED = {
  52: "stub row (title=STU, keyTitle=KEY)",
  53: "Full Length exam — section-level answer sheet, not per-question",
  54: "Full Length exam — section-level answer sheet, not per-question",
  55: "Full Length exam — section-level answer sheet, not per-question",
  56: "Full Length exam — section-level answer sheet, not per-question",
  57: "Full Length exam — section-level answer sheet, not per-question",
  58: "Full Length exam — section-level answer sheet, not per-question",
  59: "Full Length exam — section-level answer sheet, not per-question",
  60: "Full Length exam — section-level answer sheet, not per-question",
  61: "stub row (title=STU, keyTitle=KEY)",
  62: "literary worksheet — prose prompt, no per-question answer key",
  63: "stub row (title=STU, keyTitle=KEY)",
  64: "poetry prompt — no per-question answer key",
  65: "poetry prompt — no per-question answer key",
  66: "poetry prompt — no per-question answer key",
  67: "poetry prompt — no per-question answer key",
  144: "stub row (title=N.A, keyTitle=N/A)",
};

function main() {
  const raw = readFileSync(CATALOG_PATH, "utf8");
  const catalog = JSON.parse(raw);
  console.log(`[fix] loaded ${catalog.length} catalog rows`);

  // Backup
  copyFileSync(CATALOG_PATH, CATALOG_PATH + ".bak");
  console.log(`[fix] wrote backup: ${CATALOG_PATH}.bak`);

  let keyTitleCount = 0;
  let qsCount = 0;
  let unsupportedCount = 0;

  for (const [idxStr, newKeyTitle] of Object.entries(KEY_TITLE_FIXES)) {
    const idx = Number(idxStr);
    const row = catalog[idx];
    if (!row) {
      console.warn(`[fix] [${idx}] missing row — skipping keyTitle fix`);
      continue;
    }
    const before = row.keyTitle;
    row.keyTitle = newKeyTitle;
    console.log(`[fix] [${idx}] keyTitle: "${before}" → "${newKeyTitle}"`);
    keyTitleCount++;
  }

  for (const [idxStr, qs] of Object.entries(QS_BACKFILLS)) {
    const idx = Number(idxStr);
    const row = catalog[idx];
    if (!row) {
      console.warn(`[fix] [${idx}] missing row — skipping qs backfill`);
      continue;
    }
    if (row.qs !== null && row.qs !== undefined) {
      console.warn(
        `[fix] [${idx}] qs already = ${row.qs}, NOT backfilling to ${qs}`
      );
      continue;
    }
    row.qs = qs;
    console.log(`[fix] [${idx}] qs: null → ${qs}`);
    qsCount++;
  }

  for (const [idxStr, reason] of Object.entries(UNSUPPORTED)) {
    const idx = Number(idxStr);
    const row = catalog[idx];
    if (!row) {
      console.warn(`[fix] [${idx}] missing row — skipping unsupported mark`);
      continue;
    }
    row.answerFormat = "unsupported";
    row.unsupportedReason = reason;
    console.log(`[fix] [${idx}] marked unsupported: ${reason}`);
    unsupportedCount++;
  }

  // Preserve trailing newline if the original had one.
  const trailing = raw.endsWith("\n") ? "\n" : "";
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + trailing);

  console.log("");
  console.log(`[fix] wrote ${CATALOG_PATH}`);
  console.log(`[fix]   keyTitle fixes:    ${keyTitleCount}`);
  console.log(`[fix]   qs backfills:      ${qsCount}`);
  console.log(`[fix]   unsupported marks: ${unsupportedCount}`);
}

main();
