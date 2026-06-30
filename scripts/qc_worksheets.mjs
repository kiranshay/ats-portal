// QC: every worksheet the generator can assign must resolve to a catalog
// row that actually has questionIds — otherwise the student gets the
// "No bubble sheet available — type your answers below" fallback with no
// questions to answer. This script is the procedural guard for that.
//
// It uses the EXACT same tolerant title matcher the portal uses
// (normalizeTitle + findCatalogEntry, extracted from app.jsx), so the
// check reflects what students actually experience.
//
// Run locally:  node scripts/qc_worksheets.mjs
// CI runs it on every push; a non-zero exit fails the build and prints
// the offending worksheet titles.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// 1. Assignable worksheet titles come from embed.js WS_RAW (index 5).
const embed = read("embed.js");
const wsRawMatch = embed.match(/const WS_RAW\s*=\s*(\[[\s\S]*?\]);/);
if (!wsRawMatch) { console.error("QC ERROR: WS_RAW not found in embed.js"); process.exit(2); }
const WS_RAW = JSON.parse(wsRawMatch[1]);

// 2. Pull the portal's real matcher out of app.jsx so QC == runtime.
const app = read("app.jsx");
const fnMatch = app.match(/function normalizeTitle[\s\S]*?return null;\s*\n\}/);
if (!fnMatch) { console.error("QC ERROR: normalizeTitle/findCatalogEntry not found in app.jsx"); process.exit(2); }
// ESM eval is strict-mode and scopes the declarations to the eval, so we
// expose them through globalThis to use them below. This keeps the QC's
// matcher byte-identical to the portal's (no drift).
// eslint-disable-next-line no-eval
eval(fnMatch[0] + "\nglobalThis.findCatalogEntry = findCatalogEntry;");

// 3. Catalog = the answer-bank metadata served to the portal.
const catalog = JSON.parse(read("worksheets_catalog.json"));

const fails = [];
let ok = 0;
for (const row of WS_RAW) {
  const title = row && row[5];
  if (!title) continue;
  // eslint-disable-next-line no-undef
  const entry = findCatalogEntry(catalog, title);
  const good = entry && Array.isArray(entry.questionIds) && entry.questionIds.length > 0;
  if (good) ok++;
  else fails.push({ title, reason: !entry ? "no catalog row" : "catalog row has 0 questionIds" });
}

console.log(`[QC worksheets] assignable=${ok + fails.length}  bubble-sheet OK=${ok}  fallback=${fails.length}`);
if (fails.length) {
  console.error("\n[QC worksheets] FAIL — these assignable worksheets would show the 'No bubble sheet' fallback:");
  for (const f of fails) console.error(`  - ${f.title}   [${f.reason}]`);
  console.error("\nFix: either extract this worksheet's questions into worksheets_catalog.json (questionIds),");
  console.error("or remove it from WS_RAW in embed.js so it can't be assigned half-ready.");
  process.exit(1);
}
console.log("[QC worksheets] PASS — every assignable worksheet renders a bubble sheet.");
