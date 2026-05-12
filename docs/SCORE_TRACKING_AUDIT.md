# Score Tracking — Architecture Audit

**Date:** 2026-05-12 (Session 18A wrap-up)
**Status:** Read this before suggesting changes. Captures the entire data flow from input → storage → aggregation → display, plus three gaps worth deciding on.

This doc is the canonical answer to "how does scoring actually work in this app." Every score the portal displays comes from one of five sources, all of which feed into a single function called `allScoreDataPoints(student)`. That function is the single source of truth for the Score Tracking tab, the trend chart, and every per-domain card.

---

## 5 sources of truth (input)

Every score lands in **one** of these five buckets on the student doc. Nothing else is read.

### 1. `student.diagnostics[]` — ZipGrade SAT diagnostic PDF uploads

**Captured how:** Tutor uploads a ZipGrade scan PDF on the **Diagnostics tab**. The parser (`lib/diagnostic.mjs::parseDiagnosticText`) extracts:
- Subject (Reading & Writing / Math)
- Raw earned / possible at the section level
- Tag-level breakdown: each tag carries `{tag: "Words in Context", earn: 7, poss: 9}`

**Shape on disk:**
```js
student.diagnostics: [
  { id, fileName, subject, earned, possible, percentCorrect,
    tags: [{tag, earn, poss}, ...],
    parsedAt: "YYYY-MM-DD" }
]
```

**Purpose:** Baseline mastery snapshot, taken once before prep starts. Not time-series — it's a single point that the trend chart treats as "day 0."

**Scaling:** `buildDiagnosticProfile()` runs the raw section totals through the official SAT raw→scaled tables (`RW_TABLE` and `MATH_TABLE`, 0–66 and 0–54 respectively). Output is a *range* (lower/upper) because raw scores map to a band, not a point.

### 2. `student.scores[]` — manual + WellEd report-parsed scores

**Captured how (manual):** Tutor types into the "Score History" panel's quick-add form: date, test type, score, max, notes.

**Captured how (WellEd PDF):** Tutor uploads a WellEd practice exam result PDF (now on Score Tracking tab, not Diagnostics — Session 18C). The parser (`parseWelledReport`) extracts:
- `testName`, `testNumber`, `testedOn` date
- `totalScore`, `rwScore`, `mathScore` (scaled, already on 800-point scale)
- `rawScores` per module
- `subskills[]` (per-subskill earn/poss within the report)

The parsed result is wrapped as a single score entry with `welledReport` carrying the full parsed object.

**Shape on disk:**
```js
student.scores: [
  // manual
  { id, date, testType: "BlueBook Practice Test 3", score, maxScore, notes },
  // welled-parsed (Session 18C)
  { id, date: <testedOn>, testType: "WellEd Practice Test 5",
    score: <totalScore>, maxScore: "1600",
    notes: "R&W: 580, Math: 560. Type: full. N subskills parsed.",
    welledReport: { testName, testNumber, testedOn, totalScore,
                    rwScore, mathScore, rawScores, subskills[], type, raw } }
]
```

**Gap #1:** the `welledReport.subskills[]` data is captured but **never flows into `allScoreDataPoints`**. See Gaps section below.

### 3. `student.assignments[].practiceExams[]` — exam scores entered in-row on assignment history

**Captured how:** Tutor opens the Assignment History card for a PSM and types section scores into the inline inputs (R&W / Math).

**Shape on disk:**
```js
student.assignments[i].practiceExams: [
  { id, platform: "BlueBook"|"WellEd", number: 3, type: "full"|"section",
    rwScore?: 640, mathScore?: 620,
    sectionSubject?: "R&W"|"Math", score?: 640 }  // section variant
]
```

**Purpose:** Quick scoring against an assignment that included a practice exam — keeps the score next to the PSM that prompted it.

### 4. `student.assignments[].welledDomain[]` — WellEd Domain practice scores entered in-row

**Captured how:** Tutor types a score in the WellEd Domain Assignments panel on each assignment card.

**Shape on disk:**
```js
student.assignments[i].welledDomain: [
  { id, subject, domain, difficulty, qs: 27|22, label, score: 19 }
]
```

**Convention:** Reading & Writing domains use `/27`; Math domains use `/22`. Encoded as `qs` on the row; the scoring UI enforces the cap.

### 5. `student.welledLogs[]` — standalone WellEd Domain practice scores

**Captured how:** Tutor logs a domain practice score from the **Score History panel** quick-add form. Not tied to an assignment — used for continuous tracking between sessions.

**Shape on disk:**
```js
student.welledLogs: [
  { id, date, subject, domain, difficulty, score, notes }
]
```

**Same convention as #4** — `/27` for R&W, `/22` for Math. The denominator is **implicit** here (inferred from `subject`) rather than stored.

---

## The aggregator: `allScoreDataPoints(student)`

This single function in `app.jsx` is **the only thing that reads scores for display**. It walks the 5 sources above and returns a flat array of `pt` records:

```js
pt = {
  date,                              // YYYY-MM-DD (sort key)
  category, subcategory,             // free-text labels for grouping
  subject?, domain?, subskill?,      // semantic tags for filtering
  score, max,                        // numeric values
  pct?,                              // pre-computed % when known
  source: "diagnostic" | "manual" |
          "history_exam" | "history_welled" | "welled_log",
  level?: "domain" | "sub",          // distinguishes domain vs subskill point
  difficulty?,                       // WellEd domain practices have this
  note?, _id?,                       // pass-through metadata
}
```

**Output uses:**
- **Score Trends Chart** filters `pt`s where category matches `/Total SAT|R&W Section|Math Section|Full —|Section —|Practice|Official SAT|Full Practice|BlueBook|WellEd Full/i` AND `level !== "domain"/"sub"`. Result: a single overall-score time-series.
- **ScoreHistoryPanel** splits into 4 buckets:
  - `fullPts` — full-test or section scaled scores (1600 / 800)
  - `domainPts` — domain-level rollups (`level === "domain"`)
  - `subPts` — subskill rollups (`level === "sub"`)
  - `otherPts` — anything else (manual scores that don't match patterns)
- **Heat Map** (top-level Heat Map tab) iterates `assignments[].worksheets[]` — separate code path that does NOT go through `allScoreDataPoints`. Counts worksheet *assignments* per domain, not scores.

---

## What goes into the per-domain cards

The Score History tab's domain cards are the primary "did this student learn this?" view. They aggregate **only**:
- WellEd domain practice scores from `assignments[].welledDomain` (source: `history_welled`)
- WellEd domain practice scores from `welledLogs` (source: `welled_log`)
- Diagnostic domain-level rollups (source: `diagnostic`, `level: "domain"`)
- Diagnostic subskill-level rollups (source: `diagnostic`, `level: "sub"`)

Each card shows: line chart of % over time, average %, latest %, delta from first to last attempt, optional expansion to per-subskill children (only when diagnostic subskill data exists).

---

## What goes into the score-trends chart

A simple line chart at the top of Score Tracking. Plots only "full" practice exam scores (1600 or section 800) over time. Domain and subskill points are excluded so the line is stable.

---

## What does NOT get tracked into `allScoreDataPoints` (the gaps)

### Gap #1 — WellEd report subskill breakdown is captured but not surfaced

When you upload a WellEd report PDF, the parser extracts `welledReport.subskills = [{name, earn, poss}, …]` for that test. The data is stored on the score entry. But `allScoreDataPoints` only reads the score's top-line total / RW / math — **the subskill array is never converted to time-points**.

So if a student takes 4 WellEd tests over 6 months and each has a "Words in Context" subskill score, the trend on Words in Context from those 4 tests is invisible in the per-domain cards.

**Fix:** add a 6th branch to `allScoreDataPoints` that walks `scores[].welledReport.subskills` and emits `level:"sub"` time-points. Trivial — 15 lines.

### Gap #2 — Auto-graded portal submissions aren't time-points

When a student submits a worksheet through the portal and the Cloud Function grades it, the result lands on the submission doc as `scoreCorrect/scoreTotal/perQuestion`. The portal renders the score on the assignment card and inside the submission editor.

But this data **does not flow into `allScoreDataPoints`**. The score is locked inside the submission doc, scoped to one assignment, never visible in Score Tracking or trends.

**Fix:** add a 7th branch that subscribes to submissions and converts each graded one into a time-point. Per-worksheet docs (the new Session 18A path) would be the cleaner data source — one time-point per worksheet, tagged by domain/subdomain/difficulty from the catalog row.

**Why this matters:** the whole point of auto-grading is data-driven prep planning. Right now those grades stay hidden from the dashboards.

### Gap #3 — Practice exam scaled section scores have implicit metadata loss

`history_exam` records the platform and exam number, but the **section breakdown (R&W vs Math)** is encoded only in the category string (`"BlueBook Practice #3 — R&W"`). Filtering or grouping by section after the fact requires regex on the label.

**Fix:** add `section: "rw"|"math"|"full"` to the emitted point. 3-line change.

---

## Data version sanity check (where I think things stand)

| Source | Storage | Flow | Backed by tests |
|---|---|---|---|
| Diagnostic upload (#1) | `students/{sid}.diagnostics[]` | → `buildDiagnosticProfile` → `allScoreDataPoints` | ✅ `lib/diagnostic.mjs` covered |
| Manual score (#2a) | `students/{sid}.scores[]` | → `allScoreDataPoints` | partial |
| WellEd report upload (#2b) | `students/{sid}.scores[]` with `welledReport` | → `allScoreDataPoints` (totals only — see Gap #1) | parser not unit-tested |
| Assignment-row practice exam (#3) | `students/{sid}.assignments[].practiceExams[]` | → `allScoreDataPoints` | not tested |
| Assignment-row WellEd domain (#4) | `students/{sid}.assignments[].welledDomain[]` | → `allScoreDataPoints` | not tested |
| Standalone WellEd log (#5) | `students/{sid}.welledLogs[]` | → `allScoreDataPoints` | not tested |
| Portal submission grading | `students/{sid}.submissions[]` or `…/worksheetSubmissions/{wsId}` | → NOT in `allScoreDataPoints` (see Gap #2) | grade.js covered |
| Per-question correctness | `submission.perQuestion[]` | → tutor review only; no aggregation | grade.js covered |

---

## Recommended changes (for your approval)

Order of impact:

1. **(HIGH) Close Gap #2** — feed graded submissions into `allScoreDataPoints` as subskill time-points keyed by catalog `domain` + `difficulty`. Makes the per-worksheet submit flow meaningfully visible in score tracking. ~30 LOC.

2. **(HIGH) Close Gap #1** — feed `welledReport.subskills` into `allScoreDataPoints` as `level:"sub"` time-points. Makes per-test subskill progression visible. ~15 LOC.

3. **(MEDIUM)** Add `section` explicit field on `history_exam` points. Enables grouping section trends. ~3 LOC.

4. **(MEDIUM)** Add a "method" badge on every score in the UI showing where it came from: 🔬 diagnostic / ✋ manual / 📄 WellEd report / 📝 portal submission / 🎯 in-row entry. Better tutor visibility into data provenance.

5. **(LOW)** Unit tests for the four untested branches of `allScoreDataPoints`. Currently only the diagnostic branch is hardened — manual/exam/welled paths are read-only walks of data shapes that could silently change.

6. **(LOW)** Track WellEd domain practice denominators explicitly on `welledLogs[]` entries (currently inferred from subject). Future-proofs against denominator changes per-test.

---

## How to read this for sanity checks

When a score appears wrong:

1. Find the source — which of the 5 buckets is it in? Open the student doc in Firestore Console.
2. Trace through `allScoreDataPoints` — which branch emits the point? What `category` / `level` does it get?
3. Check which renderer reads it — Score Trends (full-only) vs domain cards (level:domain/sub) vs ScoresTab grid (all).
4. If it's not appearing where you expect, the bug is one of:
   - Data is in the wrong source bucket (e.g. a diagnostic stored as a manual score)
   - The category string doesn't match the regex the renderer uses (the `/Total SAT|R&W Section|.../i` chain in `buildScoreTrendsSeries`)
   - The `level` field is missing or wrong
   - Date format is malformed (Firestore Timestamps vs YYYY-MM-DD strings — only strings sort correctly)

---

## Pause-points before structural changes

If we close Gap #1 or Gap #2, both add new branches to `allScoreDataPoints`. Risk:
- **Double-counting** — if the same physical event (e.g. a WellEd Domain practice scored on Wise) also gets logged via #4 AND #5, it'll appear twice on the chart. Need a dedup pass.
- **Trend chart polluted** — if subskill points start matching the "full practice" regex by accident, the chart will scatter. Need to keep `level:"sub"`/`"domain"` filter strict.
- **Date conflicts** — same-day points from two sources currently sort but don't merge. Probably fine — let them stack — but worth deciding.

I'd want to land Gap #1 and Gap #2 separately, behind no flag (they're additive), but with tests added in the same commit so we have regression coverage going forward.
