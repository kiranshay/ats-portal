# Phase 3 — Session 12: Extraction + Audit + PDF Migration

**Date:** 2026-04-14
**Session type:** Data-layer work. Pure Node scripting + Firebase Admin SDK. No Cloud Functions, no client changes, no `firestore.rules` changes.
**Parent docs:** [PHASE_3_SPEC.md](PHASE_3_SPEC.md) §"Worksheet data model" · [PHASE_3_CUSTOM_DOMAIN.md](PHASE_3_CUSTOM_DOMAIN.md) · [PHASE_3_CATALOG_AUDIT.md](PHASE_3_CATALOG_AUDIT.md)
**Outcome:** `questionKeys/{id}` Firestore collection populated with **1,067 unique CB Question ID docs**. **130 student worksheet PDFs** uploaded to Firebase Storage at `gs://psm-generator.firebasestorage.app/worksheets/`. `worksheets_catalog.json` rewritten with `questionIds[]`, `answerFormat`, new Firebase Storage `stu` URLs, and 12 catalog corrections. **131 of 131 supported worksheets** (100%) are now end-to-end commit-ready for Session 14's bubble-sheet editor and Session 15's auto-grader.

---

## Headline numbers

| | Count |
|---|---:|
| Catalog rows (total) | 150 |
| Supported rows | **131** |
| Unsupported rows (marked, skipped) | 19 |
| Clean extraction (pure MC or pure FR) | 75 |
| True-mixed (MC+FR in same worksheet) | 56 |
| KEY PDFs found for supported rows | **131 / 131** ✓ |
| STU PDFs found for supported rows | **131 / 131** ✓ |
| `questionKeys/{id}` docs written to Firestore | **1,067** |
| Total question slots across catalog | 1,143 |
| STU PDFs uploaded to Firebase Storage | **130** (1 pre-existing duplicate-title row skipped) |
| STU bytes uploaded | ~170.9 MiB |
| Catalog `.bak*` files | 7 (7 checkpoints across the session) |

The gap between 1,143 total question slots and 1,067 unique `questionKeys` docs — **76 duplicates** — validates the spec's per-question storage rationale: ~5% of CB questions appear in more than one catalog worksheet (reshuffled difficulty variants), and per-question storage dedupes them cleanly.

---

## What shipped

### Firestore — `questionKeys/{id}` (new collection)

```
questionKeys/
  {cbQuestionId}                      e.g. "1e85caa9"
    {
      correctAnswer: "A" | ".9411, .9412, 16/17" | "27556" | ...,
      sourceFiles: ["KEY_COEvidence-Easy (15Qs).pdf", ...],  arrayUnion on re-run
      extractedAt: <FieldValue.serverTimestamp()>,
    }
```

- Written via Firebase Admin SDK with Application Default Credentials. Bypasses `firestore.rules`, which still has no `questionKeys` rule block (Session 15 adds it).
- **Idempotent re-runs.** `sourceFiles` uses `arrayUnion` so re-running the extractor from a refreshed OneDrive mirror merges into existing docs without losing provenance.
- **Conflict detection.** If the same `questionId` extracts to two different `correctAnswer` values across two worksheets, the first wins and a `WARN` is logged. Zero warnings fired on this session's run.

### Firebase Storage — `gs://psm-generator.firebasestorage.app/worksheets/`

- **First-time bucket init.** Firebase Storage had never been enabled for the `psm-generator` project. Kiran created it through the Firebase Console mid-session (production mode, `us-central1`, default rules `allow read, write: if false;`). Admin SDK writes bypass those rules; Session 14's client-side `pdf.js` viewer will be blocked until Session 15 adds per-collection rules.
- **130 STU PDFs uploaded.** Path scheme: `worksheets/{slugified-title}.pdf` where slug is `title.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-")`.
- **Download URLs.** Each uploaded file gets a public `firebasestorage.googleapis.com/v0/b/.../o/{encoded-path}?alt=media` URL written back to the catalog's `stu` field.

### `worksheets_catalog.json` — schema and data mutations

New per-row fields (on the 131 supported rows):

| Field | Type | Added by | Purpose |
|---|---|---|---|
| `questionIds` | `string[]` | `extract_answer_keys.mjs --commit` | Join bridge for Session 15 grading: `responses[i]` ↔ `questionIds[i]` ↔ `questionKeys/{id}` |
| `answerFormat` | `"multiple-choice" \| "free-response" \| "mixed" \| "unsupported"` | extractor + catalog-fix scripts | Drives Session 14's `SubmissionEditor` layout variant |
| `unsupportedReason` | `string` | `apply_catalog_fixes*.mjs` | Human-readable reason for the 19 `unsupported` rows |
| `stuTitle` | `string?` | manual fix after portal-drift discovery | Filename override for the STU PDF on disk when it differs from `title` |

Catalog-row data corrections applied across 3 fix passes (reversible — 7 `.bak*` files retained through end of session):

| Pass | keyTitle fixes | qs backfills | unsupported marks | title reverts | Notes |
|---|---:|---:|---:|---:|---|
| `apply_catalog_fixes.mjs` | 9 | 3 | 17 | 0 | First pass after initial audit — abbreviation fixes (FSS → Form Structure Sense, etc.), stub/FLE/poetry unsupported marks |
| `apply_catalog_fixes_v2.mjs` | 1 | 3 | 2 | 0 | After case-insensitive filename index recovered more rows |
| inline | 0 | 0 | 0 | 7 | Manual revert after discovering portal `WS_RAW` uses different titles than catalog (see §Portal drift below) |
| **total** | **10** | **6** | **19** | **7** | **41 catalog-row mutations** |

### Scripts shipped

All in [scripts/](../scripts/), all dry-run by default, all with `--commit` for side-effectful pass:

- **`extract_answer_keys.mjs`** — indexes 3 OneDrive source trees, walks `pdftotext -layout` over each catalog row's `KEY_*.pdf`, regex-extracts `(Question ID, Correct Answer)` tuples, classifies answerFormat, writes `questionKeys/{id}` via Admin SDK, rewrites catalog with `questionIds[]` + `answerFormat`.
- **`audit_catalog.mjs`** — reads `extraction_output.json`, buckets every catalog row into clean / true-mixed / mismatch / unknown / missing-key / missing-stu / unsupported / orphan, writes [`docs/PHASE_3_CATALOG_AUDIT.md`](PHASE_3_CATALOG_AUDIT.md).
- **`migrate_stu_pdfs.mjs`** — uploads STU PDFs to Firebase Storage, rewrites catalog `stu` URLs. Skips unsupported rows and slug collisions.
- **`apply_catalog_fixes.mjs` / `apply_catalog_fixes_v2.mjs`** — one-shot mutation scripts for the first two fix passes. Idempotent; re-runnable.
- **`scripts/package.json`** (new) — pins `firebase-admin ^12.6.0` locally to the scripts dir. Kept separate from `functions/package.json` so admin script deps don't interfere with Cloud Functions' runtime graph.

### `docs/PHASE_3_CATALOG_AUDIT.md`

Full bucket breakdown with per-row tables, regenerated via `node scripts/audit_catalog.mjs` on demand. Current state: **0 missing KEY, 0 missing STU, 0 count-mismatch, 0 unknown** for supported rows.

---

## Surprises and failure modes

### 1. Three OneDrive trees, not one

The spec pointed at `~/Desktop/stuff/OneDrive copy/NEW_ SAT Test Banks & Diagnostics/` as the source of truth. That tree turned out to be **stale by ~50 KEY files**. The live tree is at `~/Library/CloudStorage/OneDrive-Personal/Desktop/Affordable Tutoring Solutions Inc/Official Worksheets & Resources/`. A third source — `~/Downloads/ats_psms/` — had files under expanded filenames (e.g. `Command of Evidence-Easy` vs the canonical `COEvidence-Easy`).

The final indexer walks **three roots in priority order** and dedupes by normalized basename (lowercase, whitespace-collapsed):

1. Live OneDrive `Official Worksheets & Resources/` (authoritative)
2. `~/Downloads/ats_psms/` (expanded-filename bulk download)
3. Live OneDrive `Client Profiles/` (per-session folders, last-resort fallback)

This three-root union was what finally recovered every supported row.

### 2. Case-sensitivity bugs in the extractor (two bugs in one)

The first-pass extractor used:

```js
if (!base.endsWith(".pdf")) continue;
if (base.startsWith("KEY_")) ...
```

This **silently excluded**:

- `KEY_LinEQ1Var - Comp.PDF` — uppercase `.PDF` extension
- `Key_CompAdvMath - Easy (15Qs).pdf` — title-case `Key_` prefix instead of `KEY_`

Both bugs were invisible in dry-run output — the affected rows just appeared as "missing KEY PDF" with no hint that a case-variant of the file existed on disk. Discovered by manually grep-ing for `*CompAdvMath*` across the three trees.

**Fix:** normalize both case and whitespace on lookup:

```js
const normalize = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
const k = normalize(basename);
keys.get(normalize(`KEY_${entry.keyTitle}.pdf`));
```

Recovered 4 missing-KEY rows and avoided a corresponding number of false-positive catalog edits.

### 3. The `-layout` footer bleed

Early extraction for `KEY_COEvidence-Easy (15Qs).pdf` returned this tuple:

```
{"questionId":"e441da80","correctAnswer":"A Affordable Tutoring Solutions Inc. | Sourced from CBQB | Updated 2024"}
```

`pdftotext -layout` had rendered the `Correct Answer: A` line and the ATS branding footer onto the same physical line with only single-space separation — no whitespace gap for a regex to anchor on. Every other question in the same PDF extracted cleanly; only this one question had the collapsed layout.

**Fix:** post-process the captured answer by stripping known ATS footer markers:

```js
const FOOTER_MARKERS = [
  /\s*Affordable Tutoring Solutions Inc\..*$/,
  /\s*Sourced from CBQB.*$/,
  /\s*Updated \d{4}.*$/,
  /\s*\|\s*$/,
  /\s*Question #\d+.*$/,
];
```

Combined with a 3-plus-space boundary rule (`/Correct Answer:\s*(.+?)(?:\s{3,}|\r?\n|\r|$)/`), this handles both the wide-gap and adjacent-text cases while preserving legitimate multi-token answers like `.9411, .9412, 16/17`.

### 4. Dual-answer free-response grid-ins

SAT grid-in questions accept multiple equivalent forms for the same answer — typically a range low, range high, and fraction form:

```
Correct Answer: .9411, .9412, 16/17
```

The naive classifier saw the commas and called this `mixed`. After tightening the classifier to split comma-delimited answers and check each piece independently:

```js
const FR_PIECE = /^-?(?:\d+(?:\.\d+)?|\.\d+|\d+\/\d+)$/;
const pieces = a.split(/\s*,\s*/).filter(Boolean);
if (pieces.length > 0 && pieces.every((p) => FR_PIECE.test(p))) return "fr";
```

...the entire comma-separated form is correctly classified as pure FR. The full text is stored in `questionKeys/{id}.correctAnswer` for Session 15's `normalize()` grading function to interpret.

### 5. "True mixed" worksheets are real

After the dual-answer fix, **47 worksheets** were still classified `mixed` — every one with zero offending answer strings. They are genuinely mixed-format: math PSMs with some multiple-choice questions and some grid-in questions in the same worksheet. After the final fix round, the count grew to **56**.

The spec explicitly supports `answerFormat: "mixed"` as a first-class value driving Session 14's `SubmissionEditor` layout. These worksheets commit to Firestore with mixed format and every per-question answer preserved verbatim — the UI just has to render a hybrid layout.

### 6. Portal / catalog drift — the **big** surprise

Halfway through the commit pass, we checked how the portal currently loads worksheets and found:

- The portal reads worksheets from an inline **`WS_RAW` array in [embed.js](../embed.js)**, baked into `index.html` by `build_index.py`.
- **`WS_RAW` has 141 rows.** `worksheets_catalog.json` has 150.
- The two datasets were never synchronized. They diverged on naming convention for a handful of rows, stub representation, and which Full Length Exam rows to include.

The spec's model is that Session 12 produces the canonical catalog and Session 14 consumes it for the bubble-sheet editor. But the portal's **display** today is still driven by `WS_RAW`, which is a stale snapshot of an earlier catalog schema. Session 14 now has three options:

1. **Migrate the portal to read `worksheets_catalog.json`** (biggest change, single source of truth)
2. **Keep `WS_RAW` for display + join to catalog by title for grading metadata** (split-brain, depends on exact title match)
3. **Port `WS_RAW` entries into the catalog and retire `WS_RAW`** (pre-work for Session 14)

None of these are Session 12's scope. **Flagging for Session 13/14 kickoff.**

**What Session 12 did to mitigate the drift:** reverted 6 catalog `title` fields that the mid-session fix passes had renamed to expanded forms (`Form Structure Sense-Easy (10Qs)` etc.), restoring exact match with `WS_RAW`. The expanded filenames for STU lookup are now stored in a new `stuTitle` field (parallel to the existing `keyTitle` pattern). Post-revert, **all 131 supported catalog rows match a `WS_RAW` row by title** — Session 14 can join safely.

### 7. The `[116]` duplicate-title pre-existing bug

`worksheets_catalog.json` has two rows with `title: "Percentages - Hard (5Qs)"`:

- `[115]` — `difficulty: "hard"`, content = 5 clean MC/FR tuples
- `[116]` — `difficulty: "comprehensive"`, content **originally** pointed at `KEY_Percentages - Comprehensive (15Qs).pdf` (15 questions)

Mid-session fix `apply_catalog_fixes_v2.mjs` changed `[116].keyTitle` from `Percentages - Comprehensive (15Qs)` to `Percentages - Hard (5Qs)` because the catalog's `title` + `qs: 5` pointed that direction. This may have been the wrong direction — the row was possibly meant to represent the Comprehensive worksheet and the `title` was the bug all along.

Either way, **the portal's `WS_RAW` has the same duplicate-title bug**: both `hard` and `comprehensive` Percentages rows are named `Percentages - Hard (5Qs)`. This is a pre-existing catalog quality issue, not introduced by Session 12.

**Session 12's handling:** the slug collision in `migrate_stu_pdfs.mjs` auto-skipped [116] (it would have overwritten [115]'s Storage URL). [116] kept its OneDrive `1drv.ms` link in the `stu` field. Its committed `questionKeys/{id}` docs in Firestore are **technically correct** — they're the answers for the Hard 5Qs questions, and [116]'s `questionIds[]` points at the same 5 CB IDs as [115], so Session 14's grader will grade [116] correctly as the Hard worksheet.

**Left for Session 14+ to triage:** whether [116] should be renamed (e.g. `Percentages - Comprehensive (15Qs)` pointing at the Comp file with a re-extraction) or deleted as a true duplicate.

### 8. Firebase Storage had never been initialized

The first `migrate_stu_pdfs.mjs --commit` run failed with `404: The specified bucket does not exist`. Probed both `psm-generator.firebasestorage.app` and `psm-generator.appspot.com` via admin SDK — neither existed. **Firebase Storage had not been enabled for `psm-generator`.**

Kiran enabled it through the Firebase Console (production mode, `us-central1`). Bucket name: `gs://psm-generator.firebasestorage.app`. Second commit run succeeded on all 130 uploads.

**Session 15 follow-up:** the default Storage rules are `allow read, write: if false;`. Admin SDK writes bypass them, but Session 14's client-side `pdf.js` viewer will be blocked from rendering any uploaded STU PDF until Session 15 adds real rules. Specifically:

```javascript
match /worksheets/{file=**} {
  allow read: if canReadStudent();   // same helper as Firestore submissions
  allow write: if false;
}
```

---

## File-count arithmetic (for auditability)

| | Count |
|---|---:|
| Catalog rows | 150 |
| minus unsupported (stubs, FLE writing, literary/poetry) | −19 |
| **= supported rows** | **131** |
| Commit-eligible (clean + true-mixed) | 131 |
| `questionKeys/{id}` Firestore docs written | 1,067 |
| STU PDFs uploaded to Storage | 130 (1 skipped: [116] slug collision) |
| Firebase Storage `stu` URLs in catalog | 130 |
| OneDrive `1drv.ms` `stu` links remaining | 16 (14 unsupported rows + [116] collision + 1 no-stu-file) |
| `null` `stu` values | 4 (stub rows that never had real data) |
| **Catalog total `stu` coverage** | 130 + 16 + 4 = 150 ✓ |

---

## What NOT to do in Session 13 or 14 based on Session 12 findings

1. **Do NOT try to commit questionKeys for the 19 unsupported rows without rewriting the extractor.** They are genuinely unextractable under the current per-question CB Question ID model. See `unsupportedReason` on each row.

2. **Do NOT assume `title` in the catalog matches the STU filename on disk.** Use `stuTitle || title` when building filename lookups for the 6 rows where they differ. Session 14's client-side code doesn't need to worry about this — it reads `stu` URLs, not filenames.

3. **Do NOT delete `WS_RAW` from `embed.js` without also ensuring the portal has a fallback path.** The catalog is richer but the portal still renders from `WS_RAW` today. Coordinated migration belongs in Session 13 or 14.

4. **Do NOT commit against `psm-generator` without fresh ADC tokens.** This session hit an `invalid_rapt` reauth error mid-run; `gcloud auth application-default login` refreshes them.

---

## Follow-ups

1. **[Session 13 or 14 kickoff] Resolve the portal ↔ catalog drift.** Three options listed above. Recommendation: **option 3** (port `WS_RAW` into the catalog and retire `WS_RAW`) as Session 14 pre-work, since Session 14's `SubmissionEditor` is already reading per-question metadata from the catalog anyway.

2. **[Session 14 triage] Row [116] Percentages duplicate-title.** Decide whether it should be renamed to `Percentages - Comprehensive (15Qs)` (with re-extraction) or deleted as a duplicate of [115]. Pre-existing portal bug, not introduced by Session 12.

3. **[Session 15 scope] Storage rules delta.** Replace default `allow read, write: if false;` with a rule that mirrors the Firestore `canReadStudent(studentId)` helper, scoped to `worksheets/{file}`. Without this, Session 14's `pdf.js` viewer cannot render uploaded STU PDFs from the client.

4. **[Session 15 scope, unchanged from spec] `firestore.rules` delta for `questionKeys`:**
   ```
   match /questionKeys/{questionId} {
     allow read: if isTutorOrAdmin();     // students never read this
     allow write: if false;                // only admin SDK
   }
   ```

5. **[Optional Session 14+ cleanup] Re-run extraction from refreshed OneDrive.** The extractor is idempotent. If Kiran adds or updates worksheets in OneDrive, re-running `extract_answer_keys.mjs --commit` merges new question IDs into existing `questionKeys/{id}` docs via `arrayUnion` on `sourceFiles`. Same for `migrate_stu_pdfs.mjs --commit` — file uploads overwrite cleanly.

6. **[Session 14+ investigation] [68] CompAlgebra - Easy and [127] Probability - Hard.** Both use non-CB-metadata PDF shapes (old `Question #N` hand-numbering in [68]; Question IDs but zero `Correct Answer:` lines in [127]). Marked unsupported. If Kiran can regenerate these from current CBQB sources with proper metadata, they can join the supported set via a follow-up extraction run.

7. **[Session 14+ investigation] The 75 orphan KEY / 80 orphan STU files on disk.** These are PDFs in the OneDrive trees that no catalog row points at. Either new content not yet in the catalog, or obsolete/duplicate copies. Not Session 12's scope to resolve. Listed in `docs/PHASE_3_CATALOG_AUDIT.md` §Orphan sections.

8. **[Cleanup, low priority] Delete `.bak*` files.** `worksheets_catalog.json` has 7 backup files (`.bak`, `.bak2`, `.bak3`, `.bak4`, `.bak5`, `.bak.precommit`, `.bak.stumigrate`) from the incremental fix passes. Keeping through end-of-day for rollback safety. Delete tomorrow after verifying nothing regressed.

9. **[Session 13 prep] Run `gcloud auth application-default login`** before any session that commits to Firestore via admin SDK. Session 12's commit hit a reauth error mid-run.

---

## Checkpoint

Session 12 is complete when:

- [x] `scripts/extract_answer_keys.mjs` ships with full dual-tree indexing, footer stripping, dual-answer FR normalization, and Firestore commit path
- [x] `scripts/audit_catalog.mjs` ships and produces `docs/PHASE_3_CATALOG_AUDIT.md`
- [x] `scripts/migrate_stu_pdfs.mjs` ships with dry-run + commit modes
- [x] `worksheets_catalog.json` has `questionIds[]` + `answerFormat` on all 131 supported rows
- [x] `worksheets_catalog.json` has `stu` rewritten to Firebase Storage URLs on 130 rows
- [x] 19 rows marked `answerFormat: "unsupported"` with `unsupportedReason`
- [x] All 131 supported catalog rows match a `WS_RAW` row by title (post-revert)
- [x] New `stuTitle` field on 6 rows where STU filename diverges from display title
- [x] 1,067 `questionKeys/{id}` docs live in Firestore on `psm-generator`
- [x] 130 STU PDFs live in `gs://psm-generator.firebasestorage.app/worksheets/`
- [x] Audit report current: 0 missing KEY, 0 missing STU, 0 count-mismatch, 0 unknown for supported set
- [x] `docs/PHASE_3_CATALOG_AUDIT.md` regenerated after all mutations
- [x] This doc committed to the repo

---

## Kickoff prompt for Session 13

> Copy the block below into a fresh Claude Code session after `/clear`.

---

I'm ready to start **Phase 3 Session 13** of ats-portal: the student portal split + magic-link auth. Session 12 (data layer) closed with 1,067 `questionKeys/{id}` docs in Firestore, 130 STU PDFs in Firebase Storage, and a catalog enriched with `questionIds[]` + `answerFormat` on all 131 supported worksheets. Session 13 now builds the student-facing entry point.

**Confirm today's date with me at session start before doing anything else.**

### Repo + project naming

- GitHub repo: `github.com/kiranshay/ats-portal`
- Local directory: `~/projects/ats-portal/`
- Firebase project ID: **still `psm-generator`** — immutable. Display name is `ats-portal`.
- App lives at `https://portal.affordabletutoringsolutions.org` (flipped in the custom domain mini-session, pre-Session-12).

### Read these in order

1. **`docs/PHASE_3_SPEC.md`** §"Student portal design" and §"Auth model" for the split-view architecture and magic-link flow.
2. **`docs/PHASE_3_SESSION_12.md`** — the data layer Session 13 will build UI on top of. Pay particular attention to §"Portal / catalog drift" (Follow-up #1) — this is the decision point for how Session 13's `StudentPortal` loads worksheet data.
3. **`docs/PHASE_3_SESSION_11b.md`** — Wise write-path state. Still `WISE_WRITE_ENABLED=false`.
4. **`app.jsx`** — look for where the tutor UI currently branches on auth state; Session 13 adds a `?portal=student` branch (or similar).
5. **`worksheets_catalog.json`** — the per-row `questionIds[]`, `answerFormat`, and Firebase Storage `stu` URLs Session 13 may read.

### What Session 13 ships

- **Magic-link email auth** (`signInWithEmailLink`) for students, using the new `portal.affordabletutoringsolutions.org` domain in the auth continue URL.
- **`StudentPortal` component** — minimal view: assigned worksheets list, each with a "Start" button that opens Session 14's future `SubmissionEditor` (stubbed for now, real in Session 14).
- **Routing split in [app.jsx](../app.jsx)** — query-param or path-based branch so the same bundle can render either `TutorApp` or `StudentPortal`.
- **Firestore rules delta** — students can read their own `students/{id}` doc, their own `assignments/`, and their own `submissions/`. Rules for `worksheets` (if we read the catalog from Firestore at all) or client-side catalog fetch decided in Session 13 based on the Session 12 drift follow-up.

### What NOT to do

- **Do NOT build the bubble-sheet editor.** That's Session 14. Session 13's "Start" button opens a placeholder.
- **Do NOT change `questionKeys/{id}` or `worksheets_catalog.json` data.** Session 12's output is frozen input for Session 13.
- **Do NOT flip `WISE_WRITE_ENABLED`.** Still gated.
- **Do NOT touch Session 12's scripts** unless a real bug surfaces — the data layer is stable.
- **Do NOT resolve the [116] Percentages duplicate** — Session 14 owns that triage.

### Pause at

- **Before touching `app.jsx`** — confirm the routing split strategy with Kiran (query param, path, subdomain, or build-time flag).
- **Before writing Firestore rules for students** — walk through the read-path with Kiran: which collections does `StudentPortal` need, and how does student→student-doc linkage work?
- **Before the first deploy** — confirm the auth continue URL uses `portal.affordabletutoringsolutions.org`, not `psm-generator.web.app`.
- **Session 12 drift decision** — before deciding how `StudentPortal` loads worksheet data, resolve the `WS_RAW` vs `worksheets_catalog.json` question documented in Session 12 §"Portal / catalog drift".

### Close out

Write `docs/PHASE_3_SESSION_13.md` + kickoff prompt for Session 14 (bubble-sheet `SubmissionEditor` + in-browser PDF viewer).

### Constraints carrying forward

- **No slop.**
- **ats-portal commit override applies:** Claude may commit + push directly with short user-voice messages, no Co-Authored-By.
- **No bundler.**
- **Every new function must do its own Firebase Auth check internally.**
- **Run `gcloud auth application-default login` before any admin SDK commit.** Session 12 hit a reauth mid-run.
