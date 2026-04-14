#!/usr/bin/env node
// scripts/apply_catalog_fixes_v2.mjs
//
// Phase 3 Session 12 — follow-up mutation after the first
// apply_catalog_fixes.mjs pass. Surfaced by the second audit run:
//
//   (a) 3 more `qs: null` backfills for rows whose extraction produced 15
//       clean tuples once the case-insensitive index recovered their KEY PDF
//   (b) keyTitle fix for [116] Percentages - Hard — the row's keyTitle was
//       pointing at the Comprehensive (15Qs) file instead of the Hard (5Qs)
//       file. Title + STU file were already correct.
//   (c) 2 more unsupported marks — worksheets where the KEY PDF is present
//       on disk but physically cannot be extracted:
//         [68] CompAlgebra - Easy: uses old `Question #N` hand-numbering
//              format, not College Board `Question ID {hex}` metadata
//         [127] Probability - Hard: has `Question ID` headers but zero
//              `Correct Answer:` lines in the document (template bug)
//
// Re-runnable: keyTitle and qs checks are idempotent; the unsupported
// marks compare before overwriting.
//
// Usage:
//   node scripts/apply_catalog_fixes_v2.mjs

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = join(__dirname, "..", "worksheets_catalog.json");

const KEY_TITLE_FIXES = {
  116: "Percentages - Hard (5Qs)",
};

const QS_BACKFILLS = {
  74: 15,
  91: 15,
  93: 15,
};

const UNSUPPORTED = {
  68: "uses old `Question #N` hand-numbering format — no per-question CB metadata to extract",
  127: "KEY PDF has `Question ID` headers but zero `Correct Answer:` lines (template bug)",
};

function main() {
  const raw = readFileSync(CATALOG_PATH, "utf8");
  const catalog = JSON.parse(raw);
  console.log(`[fix-v2] loaded ${catalog.length} catalog rows`);

  copyFileSync(CATALOG_PATH, CATALOG_PATH + ".bak2");
  console.log(`[fix-v2] wrote backup: ${CATALOG_PATH}.bak2`);

  for (const [idxStr, newKeyTitle] of Object.entries(KEY_TITLE_FIXES)) {
    const idx = Number(idxStr);
    const row = catalog[idx];
    const before = row.keyTitle;
    if (before === newKeyTitle) {
      console.log(`[fix-v2] [${idx}] keyTitle already correct`);
      continue;
    }
    row.keyTitle = newKeyTitle;
    console.log(`[fix-v2] [${idx}] keyTitle: "${before}" → "${newKeyTitle}"`);
  }

  for (const [idxStr, qs] of Object.entries(QS_BACKFILLS)) {
    const idx = Number(idxStr);
    const row = catalog[idx];
    if (row.qs !== null && row.qs !== undefined) {
      console.log(`[fix-v2] [${idx}] qs already = ${row.qs}, skipping`);
      continue;
    }
    row.qs = qs;
    console.log(`[fix-v2] [${idx}] qs: null → ${qs}`);
  }

  for (const [idxStr, reason] of Object.entries(UNSUPPORTED)) {
    const idx = Number(idxStr);
    const row = catalog[idx];
    if (row.answerFormat === "unsupported") {
      console.log(`[fix-v2] [${idx}] already marked unsupported`);
      continue;
    }
    row.answerFormat = "unsupported";
    row.unsupportedReason = reason;
    console.log(`[fix-v2] [${idx}] marked unsupported: ${reason}`);
  }

  const trailing = raw.endsWith("\n") ? "\n" : "";
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + trailing);
  console.log(`[fix-v2] wrote ${CATALOG_PATH}`);
}

main();
