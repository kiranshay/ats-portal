# Session 14 — Bubble-sheet SubmissionEditor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 2 single-textarea `SubmissionEditor` with a container-aware bubble-sheet editor that renders one `WorksheetBlock` per worksheet in an assignment, joins to `worksheets_catalog.json` at runtime for `questionIds[]` + `answerFormat`, renders STU PDFs inline via `pdf.js`, and writes a nested `responses[]` shape tagged by `worksheetId`. Ship a new `storage.rules` file so the Firebase Storage STU PDFs are actually fetchable by authenticated students. Replace Session 13's `pendingAssignmentBanner` with the real editor open via the existing `setOpenAssignmentId` flow.

**Architecture:** Single `app.jsx` file, no new files except `storage.rules`. New helpers: `useWorksheetCatalog()` hook, `InlinePdfViewer` component, `WorksheetBlock` component. `SubmissionEditor` is rewritten to iterate `asg.worksheets[]` and render one block per worksheet. `makeDraftPayload` and `canSubmitDraft` gain nested-shape support. `responses[]` is a flat array tagged by `worksheetId`, legacy fallback uses `worksheetId: null`. Multi-worksheet render = stacked vertical.

**Tech Stack:** React (JSX via `type="text/babel"`), Firebase JS SDK v8 compat API, `pdf.js` v3.11.174 from CDN, Firebase Storage rules with cross-service `firestore.get()`, Firebase Hosting static asset fetch for `/worksheets_catalog.json`.

**Parent spec:** [2026-04-14-session-14-submission-editor-design.md](../specs/2026-04-14-session-14-submission-editor-design.md)

**Pre-flight state:**
- Session 13 landed on main but **did not deploy** to production (the `FIREBASE_TOKEN` was expired). Token has since been rotated. Session 14's deploy is the first deploy after Session 13, so it ships Session 13's auth path + Session 14's editor together. Any Session 14 deploy failure masks both.
- Firebase Storage bucket `gs://psm-generator.firebasestorage.app` has 130 STU PDFs under `worksheets/{slug}.pdf` but default rules `allow read, write: if false`. No client can fetch them until Task 8 lands.
- `worksheets_catalog.json` is committed at repo root with `questionIds[]` + `answerFormat` on all 131 supported rows. `firebase.json` hosting config does NOT ignore it, so it's already deployed as `/worksheets_catalog.json`.
- `firestore.rules` line 109 already permits linked students to update `responses` on their own submissions via the `hasOnly` diff check. No Firestore rules change this session.

**Testing approach:** No formal unit test harness for `app.jsx` (browser-loaded via Babel `type="text/babel"`). Primary verification = `esbuild` parse check (what the deploy workflow runs) + manual browser smoke tests via `python -m http.server 8765` with the dev bypass. Headless Node tests exist for pure helpers in `tests/*.mjs` — `canSubmitDraft` and `makeDraftPayload` are exported via the `__TEST_EXPORTS__` block and can be tested there.

**Commit cadence:** Commit after each task. ats-portal commit override applies — direct commit+push to main, short user-voice messages, no Co-Authored-By. Deploy lands on push to main automatically via `.github/workflows/deploy.yml`.

---

## Task 0: Pre-flight verification

**Files:**
- Read: `.github/workflows/deploy.yml`
- Verify: `gh run list --limit 3`

- [ ] **Step 1: Confirm Firebase token rotation worked**

Run:
```bash
cd ~/projects/ats-portal && gh run list --limit 3
```
Expected: the most recent `Deploy to Firebase Hosting` run on main is `success`, OR no deploy has run since the rotation (in which case Task 0 is proven only after Task 8's deploy). If the most recent run is still `failure`, STOP and tell the user — do not proceed.

- [ ] **Step 2: Confirm `worksheets_catalog.json` is fetchable locally**

Run:
```bash
cd ~/projects/ats-portal && python -m http.server 8765 &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8765/worksheets_catalog.json
kill %1
```
Expected: `200`. If 404, the file is being excluded by hosting config — STOP and investigate `firebase.json` ignore rules.

- [ ] **Step 3: Confirm `pdf.js` CDN is loaded in `index.html`**

Run:
```bash
grep -n "pdfjsLib" ~/projects/ats-portal/index.html
```
Expected: at least one line showing `window['pdfjsLib'].GlobalWorkerOptions.workerSrc = ...`. Confirmed as present during brainstorming.

---

## Task 1: Add `useWorksheetCatalog()` hook

**Files:**
- Modify: `app.jsx` — add new hook near existing `useSubmissionDraft` at [app.jsx:381](../../../app.jsx#L381)

**Context:** Module-cached fetch of `/worksheets_catalog.json`. Shared promise across all callers so multiple `WorksheetBlock`s sharing one mount don't re-fetch. Never throws — error state is a return value.

- [ ] **Step 1: Add the hook**

Locate the existing helper region just above `useSubmissionDraft` (around [app.jsx:375-380](../../../app.jsx#L375)). Insert:

```jsx
// Module-cached fetch of the static worksheets catalog hosted at
// /worksheets_catalog.json. Session 14 reads this instead of WS_RAW for
// per-question metadata (questionIds, answerFormat) that Session 12 populated.
// Shared promise — multiple SubmissionEditor instances on the same page
// resolve against one fetch.
let __worksheetCatalogPromise = null;
function fetchWorksheetCatalog(){
  if(__worksheetCatalogPromise) return __worksheetCatalogPromise;
  __worksheetCatalogPromise = fetch("/worksheets_catalog.json", {cache:"force-cache"})
    .then(r => {
      if(!r.ok) throw new Error(`catalog fetch ${r.status}`);
      return r.json();
    })
    .catch(err => {
      __worksheetCatalogPromise = null;  // allow retry on next hook mount
      throw err;
    });
  return __worksheetCatalogPromise;
}
function useWorksheetCatalog(){
  const [state, setState] = useState({status:"loading", catalog:null});
  useEffect(()=>{
    let alive = true;
    fetchWorksheetCatalog().then(
      catalog => { if(alive) setState({status:"ready", catalog}); },
      err => {
        console.warn("[portal] catalog fetch failed:", err);
        if(alive) setState({status:"error", catalog:null});
      }
    );
    return ()=>{ alive = false; };
  }, []);
  return state;
}
```

- [ ] **Step 2: Parse check**

Run:
```bash
cd ~/projects/ats-portal && npx --yes esbuild@0.24.0 app.jsx --jsx=transform --jsx-factory=React.createElement --jsx-fragment=React.Fragment --log-level=error > /dev/null
```
Expected: clean exit, no output.

- [ ] **Step 3: Commit**

```bash
cd ~/projects/ats-portal && git add app.jsx && git commit -m "add useWorksheetCatalog hook for runtime catalog fetch"
```

---

## Task 2: Add `InlinePdfViewer` component

**Files:**
- Modify: `app.jsx` — add new component near `SubmissionEditor` around [app.jsx:4828](../../../app.jsx#L4828) (just above `SubmissionEditor`'s definition, after the style constants).

**Context:** Renders a Firebase Storage (or fallback) PDF URL inline using `window.pdfjsLib.getDocument({url})`. Renders each page to a canvas in a scrollable container. Never throws — all errors become a visible "Couldn't load the PDF" message with a link to open externally.

- [ ] **Step 1: Add the component**

Insert just before `function SubmissionEditor(`:

```jsx
// Inline PDF viewer using pdf.js (loaded globally by index.html). Fetches the
// URL client-side and rasterizes each page to a canvas. Renders a graceful
// "couldn't load" fallback on any error — CORS (OneDrive), 403 (Storage rules),
// network, or pdf.js not loaded. Answer rows always remain usable.
function InlinePdfViewer({url}){
  const containerRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [pageCount, setPageCount] = useState(0);

  useEffect(()=>{
    let cancelled = false;
    const container = containerRef.current;
    if(!container) return;
    if(!url){ setStatus("error"); return; }
    if(!window.pdfjsLib){ setStatus("error"); return; }

    // Clear any prior render if the URL changes.
    container.innerHTML = "";
    setStatus("loading");
    setPageCount(0);

    (async () => {
      try {
        const pdf = await window.pdfjsLib.getDocument({url}).promise;
        if(cancelled) return;
        setPageCount(pdf.numPages);
        for(let pageNum=1; pageNum<=pdf.numPages; pageNum++){
          if(cancelled) return;
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({scale: 1.35});
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.display = "block";
          canvas.style.marginBottom = "8px";
          canvas.style.maxWidth = "100%";
          canvas.style.height = "auto";
          canvas.style.boxShadow = "0 1px 3px rgba(15,26,46,.12)";
          container.appendChild(canvas);
          const ctx = canvas.getContext("2d");
          await page.render({canvasContext: ctx, viewport}).promise;
        }
        if(!cancelled) setStatus("ready");
      } catch(err){
        console.warn("[portal] pdf viewer error:", err);
        if(!cancelled) setStatus("error");
      }
    })();

    return ()=>{ cancelled = true; };
  }, [url]);

  return (
    <div style={{
      border:"1px solid rgba(15,26,46,.1)", borderRadius:8, padding:10,
      background:"#F7F5EF", maxHeight:600, overflowY:"auto", boxSizing:"border-box",
    }}>
      {status === "loading" && (
        <div style={{textAlign:"center", padding:"40px 0", fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#66708A", letterSpacing:1, textTransform:"uppercase"}}>
          Loading PDF…
        </div>
      )}
      {status === "error" && (
        <div style={{textAlign:"center", padding:"40px 12px"}}>
          <div style={{fontFamily:"'Fraunces',Georgia,serif", fontStyle:"italic", color:"#8C2E2E", fontSize:14, marginBottom:8}}>
            Couldn't load the PDF here.
          </div>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" style={{
              fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#9A5B1F",
              letterSpacing:1, textTransform:"uppercase", textDecoration:"none",
              border:"1px solid rgba(154,91,31,.4)", padding:"6px 12px", borderRadius:4,
              display:"inline-block",
            }}>Open externally →</a>
          )}
        </div>
      )}
      <div ref={containerRef} style={{display: status==="ready" ? "block" : "none"}}/>
      {status === "ready" && pageCount > 0 && (
        <div style={{fontFamily:"'IBM Plex Mono',monospace", fontSize:9, color:"#66708A", textAlign:"center", marginTop:4, letterSpacing:1}}>
          {pageCount} PAGE{pageCount===1?"":"S"}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Parse check**

Run:
```bash
cd ~/projects/ats-portal && npx --yes esbuild@0.24.0 app.jsx --jsx=transform --jsx-factory=React.createElement --jsx-fragment=React.Fragment --log-level=error > /dev/null
```
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
cd ~/projects/ats-portal && git add app.jsx && git commit -m "add InlinePdfViewer component with graceful pdf.js fallback"
```

---

## Task 3: Update `makeDraftPayload` and `canSubmitDraft` for nested shape

**Files:**
- Modify: `app.jsx` at [app.jsx:1127-1145](../../../app.jsx#L1127)
- Test: `tests/draft-payload.test.mjs` (new, if a test harness exists; otherwise manual verification)

**Context:** `makeDraftPayload` currently takes `{assignmentId, answersText, isCreate}` and produces `responses: [{questionIndex: 0, studentAnswer: answersText}]`. New signature accepts EITHER `answersText` (legacy blob) OR `answersByWorksheet` + `catalogByWorksheetId` (new nested). `canSubmitDraft` works unchanged for both shapes because it just scans `responses[]` for any non-empty answer.

- [ ] **Step 1: Check if test exports exist**

Run:
```bash
grep -n "__TEST_EXPORTS__\|canSubmitDraft" ~/projects/ats-portal/app.jsx | head -20
```
If `__TEST_EXPORTS__` exists and exports `canSubmitDraft` / `makeDraftPayload`, the new tests below go in a test file. If not, skip Step 2 and verify manually in Step 5.

- [ ] **Step 2: Write a failing test (if test exports exist)**

Create or extend `tests/draft-payload.test.mjs`:

```js
import {test} from "node:test";
import assert from "node:assert/strict";
import {makeDraftPayload, canSubmitDraft} from "../app.jsx";

test("makeDraftPayload legacy blob shape", () => {
  const p = makeDraftPayload({assignmentId:"a1", answersText:"hello", isCreate:true});
  assert.equal(p.assignmentId, "a1");
  assert.equal(p.responses.length, 1);
  assert.equal(p.responses[0].worksheetId, null);
  assert.equal(p.responses[0].questionIndex, 0);
  assert.equal(p.responses[0].studentAnswer, "hello");
  assert.equal(p.status, "draft");
});

test("makeDraftPayload nested shape flattens per-worksheet", () => {
  const p = makeDraftPayload({
    assignmentId: "a1",
    answersByWorksheet: {
      w1: ["A", "B", ""],
      w2: ["42", ""],
    },
    catalogByWorksheetId: {
      w1: {questionIds: ["q1a","q1b","q1c"]},
      w2: {questionIds: ["q2a","q2b"]},
    },
    isCreate: false,
  });
  assert.equal(p.responses.length, 5);
  assert.deepEqual(p.responses[0], {worksheetId:"w1", questionIndex:0, studentAnswer:"A"});
  assert.deepEqual(p.responses[2], {worksheetId:"w1", questionIndex:2, studentAnswer:""});
  assert.deepEqual(p.responses[3], {worksheetId:"w2", questionIndex:0, studentAnswer:"42"});
});

test("canSubmitDraft true on any non-empty legacy answer", () => {
  assert.equal(canSubmitDraft({status:"draft", responses:[{questionIndex:0, studentAnswer:"x"}]}), true);
});

test("canSubmitDraft true on any non-empty nested answer", () => {
  assert.equal(canSubmitDraft({status:"draft", responses:[
    {worksheetId:"w1", questionIndex:0, studentAnswer:""},
    {worksheetId:"w1", questionIndex:1, studentAnswer:"B"},
  ]}), true);
});

test("canSubmitDraft false when all nested answers empty", () => {
  assert.equal(canSubmitDraft({status:"draft", responses:[
    {worksheetId:"w1", questionIndex:0, studentAnswer:""},
    {worksheetId:"w1", questionIndex:1, studentAnswer:"  "},
  ]}), false);
});
```

Run:
```bash
cd ~/projects/ats-portal && node --test tests/draft-payload.test.mjs
```
Expected: FAIL (new signature not yet implemented).

If `app.jsx` doesn't export these functions, skip this step and proceed to Step 3.

- [ ] **Step 3: Update `makeDraftPayload` implementation**

Replace the existing function at [app.jsx:1135-1145](../../../app.jsx#L1135):

```jsx
function makeDraftPayload({assignmentId, answersText, answersByWorksheet, catalogByWorksheetId, isCreate}){
  const FV = firebase.firestore.FieldValue;
  let responses;
  if(answersByWorksheet && catalogByWorksheetId){
    // Nested shape — one entry per question per worksheet, flat + tagged.
    responses = [];
    for(const wId of Object.keys(answersByWorksheet)){
      const answers = answersByWorksheet[wId] || [];
      const expectedLength = catalogByWorksheetId[wId]?.questionIds?.length ?? answers.length;
      for(let i=0; i<expectedLength; i++){
        responses.push({
          worksheetId: wId,
          questionIndex: i,
          studentAnswer: typeof answers[i] === "string" ? answers[i] : "",
        });
      }
    }
  } else {
    // Legacy single-blob shape — zero-worksheet fallback or Phase 2 resume.
    responses = [{worksheetId: null, questionIndex: 0, studentAnswer: answersText || ""}];
  }
  const base = {
    assignmentId,
    responses,
    status: "draft",
    updatedAt: FV.serverTimestamp(),
  };
  if(isCreate) base.createdAt = FV.serverTimestamp();
  return base;
}
```

- [ ] **Step 4: Update `canSubmitDraft` to tolerate both shapes**

The existing function at [app.jsx:1127-1133](../../../app.jsx#L1127) only checks `responses[0]`. Replace:

```jsx
function canSubmitDraft(submission){
  if(!submission) return false;
  if(submission.status !== "draft") return false;
  if(!Array.isArray(submission.responses)) return false;
  for(const r of submission.responses){
    const text = (r && typeof r.studentAnswer === "string") ? r.studentAnswer.trim() : "";
    if(text.length > 0) return true;
  }
  return false;
}
```

- [ ] **Step 5: Run tests or parse check**

If tests exist:
```bash
cd ~/projects/ats-portal && node --test tests/draft-payload.test.mjs
```
Expected: PASS.

Otherwise parse check:
```bash
cd ~/projects/ats-portal && npx --yes esbuild@0.24.0 app.jsx --jsx=transform --jsx-factory=React.createElement --jsx-fragment=React.Fragment --log-level=error > /dev/null
```
Expected: clean exit.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/ats-portal && git add app.jsx tests/ 2>/dev/null && git commit -m "makeDraftPayload supports nested per-worksheet responses"
```

---

## Task 4: Add `WorksheetBlock` component

**Files:**
- Modify: `app.jsx` — insert between `InlinePdfViewer` (Task 2) and `SubmissionEditor`.

**Context:** One block per worksheet. Branches on `catalogEntry.answerFormat` for the answer rows. Two-column layout: PDF viewer left, answer rows right, stacks on narrow screens. When no catalog entry or no `questionIds`, renders a per-worksheet textarea.

- [ ] **Step 1: Add the component**

Insert just before `function SubmissionEditor(` (after `InlinePdfViewer`):

```jsx
// One block per worksheet inside an assignment. Reads catalogEntry via
// Session 14's catalog join to produce bubble-sheet inputs; falls through to
// a per-worksheet textarea when the catalog match or questionIds[] is missing.
// Answer state is owned by the parent SubmissionEditor — this component is
// a controlled view.
function WorksheetBlock({worksheet, catalogEntry, answers, onAnswersChange, isLocked, indexLabel}){
  const hasCatalog = !!(catalogEntry && Array.isArray(catalogEntry.questionIds) && catalogEntry.questionIds.length > 0);
  const format = hasCatalog ? catalogEntry.answerFormat : null;
  const pdfUrl = (catalogEntry && catalogEntry.stu) || worksheet.url || null;

  const headerTitle = worksheet.title || `${worksheet.domain||""} — ${worksheet.difficulty||""}`;
  const headerSub = [worksheet.subject, worksheet.domain, worksheet.difficulty].filter(Boolean).join(" · ");

  const setAnswerAt = (i, value) => {
    if(isLocked) return;
    const next = answers.slice();
    while(next.length <= i) next.push("");
    next[i] = value;
    onAnswersChange(next);
  };

  const renderRow = (i) => {
    const value = answers[i] || "";
    if(format === "multiple-choice"){
      return renderMcRow(i, value, v => setAnswerAt(i, v), isLocked);
    }
    if(format === "free-response"){
      return renderFrRow(i, value, v => setAnswerAt(i, v), isLocked);
    }
    if(format === "mixed"){
      return renderMixedRow(i, value, v => setAnswerAt(i, v), isLocked);
    }
    return null;
  };

  return (
    <div style={{
      marginTop:20, paddingTop:20,
      borderTop:"1px solid rgba(15,26,46,.12)",
    }}>
      <div style={{marginBottom:12}}>
        <div style={{fontFamily:"'IBM Plex Mono',monospace", fontSize:9, color:"#66708A", letterSpacing:1, textTransform:"uppercase", marginBottom:4}}>
          {indexLabel}
        </div>
        <div style={{fontFamily:"'Fraunces',Georgia,serif", fontSize:18, color:"#0F1A2E", fontWeight:600, letterSpacing:-.1}}>
          {headerTitle}
        </div>
        {headerSub && (
          <div style={{fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#66708A", marginTop:2}}>
            {headerSub}
          </div>
        )}
      </div>

      {hasCatalog ? (
        <div style={{display:"grid", gridTemplateColumns:"minmax(0, 1fr) minmax(0, 1fr)", gap:16, alignItems:"start"}}>
          <InlinePdfViewer url={pdfUrl}/>
          <div style={{display:"flex", flexDirection:"column", gap:8}}>
            {catalogEntry.questionIds.map((_qid, i) => (
              <div key={i} style={{display:"flex", alignItems:"center", gap:10, padding:"6px 0", borderBottom:"1px solid rgba(15,26,46,.05)"}}>
                <div style={{fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#66708A", width:24, flexShrink:0}}>
                  {i+1}.
                </div>
                <div style={{flex:1, minWidth:0}}>
                  {renderRow(i)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div style={{fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#8C6A2E", marginBottom:8, fontStyle:"italic"}}>
            No bubble sheet available for this worksheet — type your answers below.
          </div>
          {pdfUrl && <InlinePdfViewer url={pdfUrl}/>}
          <textarea
            value={answers[0] || ""}
            onChange={e => setAnswerAt(0, e.target.value)}
            disabled={isLocked}
            placeholder={"Type your answers here. Example:\n\n1. B\n2. C\n3. A"}
            style={{
              width:"100%", minHeight:160, padding:"12px 14px", borderRadius:8,
              border:"1px solid rgba(15,26,46,.2)", fontFamily:"'IBM Plex Mono',monospace",
              fontSize:14, lineHeight:1.6, color:"#0F1A2E", resize:"vertical",
              boxSizing:"border-box", marginTop:10,
            }}
          />
        </div>
      )}
    </div>
  );
}

// MC row: A/B/C/D chip row. Chip click sets answer to that letter; clicking
// the selected letter clears it.
function renderMcRow(i, value, onChange, isLocked){
  const letters = ["A","B","C","D"];
  return (
    <div style={{display:"flex", gap:6}}>
      {letters.map(L => {
        const selected = value === L;
        return (
          <button
            key={L}
            disabled={isLocked}
            onClick={()=> onChange(selected ? "" : L)}
            style={{
              width:36, height:32, borderRadius:6,
              border:`1px solid ${selected?"#0F1A2E":"rgba(15,26,46,.22)"}`,
              background: selected?"#0F1A2E":"#fff",
              color: selected?"#fff":"#0F1A2E",
              fontFamily:"'IBM Plex Mono',monospace", fontSize:13, fontWeight:600,
              cursor: isLocked?"not-allowed":"pointer",
            }}
          >{L}</button>
        );
      })}
    </div>
  );
}

// FR row: single numeric input. Text type (not number) so "3/4" and "0.25" both work.
function renderFrRow(i, value, onChange, isLocked){
  return (
    <input
      type="text"
      value={value}
      disabled={isLocked}
      onChange={e => onChange(e.target.value)}
      placeholder="Your answer"
      style={{
        width:"100%", maxWidth:220, padding:"8px 12px", borderRadius:6,
        border:"1px solid rgba(15,26,46,.22)",
        fontFamily:"'IBM Plex Mono',monospace", fontSize:13, color:"#0F1A2E",
        boxSizing:"border-box",
      }}
    />
  );
}

// Mixed row: both MC chips AND a numeric input, both live. Whichever the
// student fills wins. If both are filled, the text input takes precedence
// (last-write-wins on the shared answer slot).
function renderMixedRow(i, value, onChange, isLocked){
  const isMc = value === "A" || value === "B" || value === "C" || value === "D";
  return (
    <div style={{display:"flex", gap:10, alignItems:"center", flexWrap:"wrap"}}>
      {renderMcRow(i, isMc ? value : "", onChange, isLocked)}
      <span style={{fontFamily:"'IBM Plex Mono',monospace", fontSize:9, color:"#66708A", letterSpacing:1}}>OR</span>
      <input
        type="text"
        value={isMc ? "" : value}
        disabled={isLocked}
        onChange={e => onChange(e.target.value)}
        placeholder="Numeric"
        style={{
          flex:"1 1 140px", maxWidth:180, padding:"8px 12px", borderRadius:6,
          border:"1px solid rgba(15,26,46,.22)",
          fontFamily:"'IBM Plex Mono',monospace", fontSize:13, color:"#0F1A2E",
          boxSizing:"border-box",
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Parse check**

Run:
```bash
cd ~/projects/ats-portal && npx --yes esbuild@0.24.0 app.jsx --jsx=transform --jsx-factory=React.createElement --jsx-fragment=React.Fragment --log-level=error > /dev/null
```
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
cd ~/projects/ats-portal && git add app.jsx && git commit -m "add WorksheetBlock with MC/FR/mixed renderers"
```

---

## Task 5: Rewrite `SubmissionEditor` for container model

**Files:**
- Modify: `app.jsx` at [app.jsx:4833-4994](../../../app.jsx#L4833)

**Context:** This is the biggest structural change. The existing function takes an assignment and renders one textarea. The new version iterates `asg.worksheets[]` and renders one `WorksheetBlock` per worksheet, managing `answersByWorksheet` state for all of them. Preserves the existing `useSubmissionDraft` + 750ms debounced autosave + submit lock model.

- [ ] **Step 1: Replace the entire `SubmissionEditor` function body**

Replace the function at [app.jsx:4833](../../../app.jsx#L4833) with:

```jsx
function SubmissionEditor({studentId, assignment, readOnly, onClose}){
  const {status, submission} = useSubmissionDraft(studentId, assignment.id);
  const {status: catalogStatus, catalog} = useWorksheetCatalog();

  const worksheets = (assignment.worksheets||[]).filter(w => !w.deleted);
  const welledCount = (assignment.welledDomain||[]).filter(w => !w.deleted).length;
  const examCount = (assignment.practiceExams||[]).filter(e => !e.deleted).length;

  // Dedupe worksheet ids defensively — if the assignment doc has collisions,
  // suffix with the positional index. Logged once.
  const worksheetsStable = (()=>{
    const seen = new Set();
    return worksheets.map((w, idx) => {
      let id = w.id;
      if(!id || seen.has(id)){
        const newId = `${id || "w"}-${idx}`;
        console.warn("[portal] worksheet id collision or missing, rekey", id, "->", newId);
        id = newId;
      }
      seen.add(id);
      return {...w, id};
    });
  })();

  // Build catalogByWorksheetId once per catalog/worksheets change.
  const catalogByWorksheetId = useMemo(()=>{
    if(catalogStatus !== "ready" || !catalog) return {};
    const out = {};
    for(const w of worksheetsStable){
      const entry = catalog.find(c => c.title === w.title);
      if(entry && Array.isArray(entry.questionIds) && entry.questionIds.length > 0){
        out[w.id] = entry;
      }
    }
    return out;
  }, [catalogStatus, catalog, worksheetsStable]);

  // Legacy mode detection: zero worksheets on the assignment, OR the existing
  // submission is a Phase 2 blob (one entry with no worksheetId).
  const hasAnyWorksheets = worksheetsStable.length > 0;
  const submissionIsLegacy = submission
    && Array.isArray(submission.responses)
    && submission.responses.length === 1
    && !submission.responses[0].worksheetId;
  const legacyMode = !hasAnyWorksheets || (submissionIsLegacy && worksheetsStable.length === 0);
  // Note: if submission is legacy-shaped but assignment now has worksheets,
  // we still render the new editor — the seed effect ignores the legacy blob
  // and starts fresh. No real Phase 2 drafts exist at Session 14 deploy time.

  // State
  const [answersByWorksheet, setAnswersByWorksheet] = useState({});
  const [legacyText, setLegacyText] = useState("");
  const submissionIdRef = useRef(null);
  const [localStatus, setLocalStatus] = useState("draft");
  const [submittedAt, setSubmittedAt] = useState(null);
  const [submittingState, setSubmittingState] = useState(false);
  const pendingTimerRef = useRef(null);
  const writeDraftRef = useRef(null);

  // Seed from loaded submission.
  useEffect(()=>{
    if(status !== "ready" || !submission) return;
    submissionIdRef.current = submission.id;
    setLocalStatus(submission.status || "draft");
    setSubmittedAt(submission.submittedAt || null);

    if(legacyMode){
      const r = Array.isArray(submission.responses) ? submission.responses[0] : null;
      setLegacyText((r && r.studentAnswer) || "");
      return;
    }

    // Group existing responses by worksheetId.
    const grouped = {};
    if(Array.isArray(submission.responses)){
      for(const r of submission.responses){
        const wId = r.worksheetId;
        if(!wId) continue;
        if(!grouped[wId]) grouped[wId] = [];
        grouped[wId][r.questionIndex] = r.studentAnswer || "";
      }
    }
    // Pad each worksheet's array to its expected length.
    const next = {};
    for(const w of worksheetsStable){
      const entry = catalogByWorksheetId[w.id];
      const expected = entry?.questionIds?.length || 1;
      const existing = grouped[w.id] || [];
      const padded = [];
      for(let i=0; i<expected; i++) padded.push(existing[i] || "");
      next[w.id] = padded;
    }
    setAnswersByWorksheet(next);
  }, [status, submission, legacyMode, catalogByWorksheetId, worksheetsStable]);

  const isLockedNow = readOnly || localStatus === "submitted";

  writeDraftRef.current = async () => {
    if(isLockedNow) return;
    const col = studentSubmissionsCollection(studentId);
    if(!col) return;
    const payload = legacyMode
      ? makeDraftPayload({
          assignmentId: assignment.id,
          answersText: legacyText,
          isCreate: !submissionIdRef.current,
        })
      : makeDraftPayload({
          assignmentId: assignment.id,
          answersByWorksheet,
          catalogByWorksheetId,
          isCreate: !submissionIdRef.current,
        });
    try{
      if(!submissionIdRef.current){
        const newRef = col.doc();
        submissionIdRef.current = newRef.id;
        await newRef.set(payload);
      } else {
        // Drop createdAt from update (it's only set on create).
        const {createdAt: _drop, ...updatePayload} = payload;
        await col.doc(submissionIdRef.current).update(updatePayload);
      }
    } catch(err){
      console.warn("[portal] draft write error:", err);
    }
  };

  const handleSubmit = async () => {
    if(isLockedNow || submittingState) return;
    // Build a fake submission shape to run canSubmitDraft against.
    const fakeResponses = legacyMode
      ? [{worksheetId: null, questionIndex: 0, studentAnswer: legacyText}]
      : (()=>{
          const out = [];
          for(const wId of Object.keys(answersByWorksheet)){
            (answersByWorksheet[wId]||[]).forEach((a, i) => out.push({worksheetId: wId, questionIndex: i, studentAnswer: a}));
          }
          return out;
        })();
    if(!canSubmitDraft({status:"draft", responses: fakeResponses})) return;
    setSubmittingState(true);
    try{
      if(pendingTimerRef.current){ clearTimeout(pendingTimerRef.current); pendingTimerRef.current = null; }
      if(writeDraftRef.current) await writeDraftRef.current();
      const id = submissionIdRef.current;
      if(!id) throw new Error("no submission id after flush");
      await studentSubmissionsCollection(studentId).doc(id).update({
        status: "submitted",
        submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      setLocalStatus("submitted");
      setSubmittedAt(new Date().toISOString());
    } catch(err){
      console.warn("[portal] submit error:", err);
      alert("Could not submit. Try again.");
    } finally {
      setSubmittingState(false);
    }
  };

  // Debounced autosave on any answer change.
  useEffect(()=>{
    if(isLockedNow) return;
    if(status !== "ready" && status !== "not-found") return;
    if(pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = setTimeout(()=>{
      if(writeDraftRef.current) writeDraftRef.current();
    }, 750);
    return ()=>{ if(pendingTimerRef.current) clearTimeout(pendingTimerRef.current); };
  }, [answersByWorksheet, legacyText, status, isLockedNow]);

  // Status rendering
  if(status === "loading" || (catalogStatus === "loading" && hasAnyWorksheets)){
    return (
      <div style={{...CARD, padding:"40px 24px", textAlign:"center"}}>
        <div style={{fontFamily:"'Fraunces',Georgia,serif", color:"#66708A"}}>Loading…</div>
      </div>
    );
  }
  if(status === "error"){
    return (
      <div style={{...CARD, padding:"40px 24px", textAlign:"center"}}>
        <div style={{fontFamily:"'Fraunces',Georgia,serif", fontStyle:"italic", color:"#8C2E2E", marginBottom:16}}>
          Couldn't load this submission. Try reloading.
        </div>
        <button onClick={onClose} style={SUBMIT_EDITOR_BACK_BTN}>← Back</button>
      </div>
    );
  }

  const isLocked = isLockedNow;
  const displayDate = (()=>{
    if(!submittedAt) return "";
    if(typeof submittedAt === "string") return submittedAt.slice(0,10);
    if(submittedAt.toDate){ try { return submittedAt.toDate().toISOString().slice(0,10); } catch { return ""; } }
    return "";
  })();

  // Submit enabled check against the current in-memory state.
  const fakeResponses = legacyMode
    ? [{worksheetId: null, questionIndex: 0, studentAnswer: legacyText}]
    : (()=>{
        const out = [];
        for(const wId of Object.keys(answersByWorksheet)){
          (answersByWorksheet[wId]||[]).forEach((a, i) => out.push({worksheetId: wId, questionIndex: i, studentAnswer: a}));
        }
        return out;
      })();
  const submitEnabled = !isLocked && canSubmitDraft({status:"draft", responses: fakeResponses}) && !submittingState;

  return (
    <div style={{...CARD, padding:"24px 22px"}}>
      <button onClick={onClose} style={SUBMIT_EDITOR_BACK_BTN}>← Back to assignments</button>
      <div style={{fontFamily:"'Fraunces',Georgia,serif", fontSize:22, fontWeight:600, color:"#0F1A2E", marginTop:14, marginBottom:6, letterSpacing:-.2}}>
        {assignment.date || assignment.dateAssigned || "Assignment"}
      </div>
      {isLocked && displayDate && (
        <div style={{fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#66708A", textTransform:"uppercase", letterSpacing:1, marginBottom:14}}>
          Submitted {displayDate}
        </div>
      )}

      {catalogStatus === "error" && hasAnyWorksheets && (
        <div style={{fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#8C6A2E", background:"#FFF4E0", border:"1px solid rgba(140,106,46,.25)", borderRadius:6, padding:"8px 12px", marginTop:10}}>
          Couldn't load worksheet metadata — using simple mode.
        </div>
      )}

      {(welledCount > 0 || examCount > 0) && !legacyMode && (
        <div style={{fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#66708A", marginTop:12, padding:"8px 12px", background:"rgba(15,26,46,.04)", borderRadius:6, lineHeight:1.5}}>
          This assignment also includes{" "}
          {welledCount > 0 && <span>{welledCount} WellEd item{welledCount===1?"":"s"}</span>}
          {welledCount > 0 && examCount > 0 && " and "}
          {examCount > 0 && <span>{examCount} practice exam{examCount===1?"":"s"}</span>}
          . Engage with those outside the portal.
        </div>
      )}

      {legacyMode ? (
        <div style={{marginTop:14}}>
          {isLocked ? (
            <div style={{whiteSpace:"pre-wrap", fontFamily:"'Fraunces',Georgia,serif", fontSize:15, color:"#0F1A2E", lineHeight:1.55, padding:"14px 0", borderTop:"1px solid rgba(15,26,46,.08)", borderBottom:"1px solid rgba(15,26,46,.08)"}}>
              {legacyText || <span style={{color:"#66708A", fontStyle:"italic"}}>No answer recorded.</span>}
            </div>
          ) : (
            <textarea
              value={legacyText}
              onChange={e => setLegacyText(e.target.value)}
              placeholder={"Type your answers here. Example:\n\n1. B\n2. C\n3. A"}
              style={{
                width:"100%", minHeight:260, padding:"14px 16px", borderRadius:8,
                border:"1px solid rgba(15,26,46,.2)", fontFamily:"'IBM Plex Mono',monospace",
                fontSize:14, lineHeight:1.6, color:"#0F1A2E", resize:"vertical", boxSizing:"border-box",
              }}
            />
          )}
        </div>
      ) : (
        worksheetsStable.map((w, idx) => (
          <WorksheetBlock
            key={w.id}
            worksheet={w}
            catalogEntry={catalogByWorksheetId[w.id]}
            answers={answersByWorksheet[w.id] || []}
            onAnswersChange={(next)=> setAnswersByWorksheet(prev => ({...prev, [w.id]: next}))}
            isLocked={isLocked}
            indexLabel={`Worksheet ${idx+1} of ${worksheetsStable.length}`}
          />
        ))
      )}

      {!isLocked && (
        <div style={{marginTop:24, display:"flex", justifyContent:"flex-end"}}>
          <button
            disabled={!submitEnabled}
            onClick={handleSubmit}
            style={submitEnabled ? SUBMIT_BTN_STYLE : SUBMIT_BTN_STYLE_DISABLED}
          >
            {submittingState ? "Submitting…" : "Submit"}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify `useMemo` is imported**

Run:
```bash
grep -n "useMemo\|React.useMemo" ~/projects/ats-portal/app.jsx | head -5
```
If `useMemo` is not already destructured from React (e.g., `const {useState, useEffect, useRef, useMemo} = React`), locate the existing destructure near the top of `app.jsx` and add `useMemo` to it. If React is accessed via `React.useMemo(...)` convention, use that form instead in the code above.

- [ ] **Step 3: Parse check**

Run:
```bash
cd ~/projects/ats-portal && npx --yes esbuild@0.24.0 app.jsx --jsx=transform --jsx-factory=React.createElement --jsx-fragment=React.Fragment --log-level=error > /dev/null
```
Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
cd ~/projects/ats-portal && git add app.jsx && git commit -m "rewrite SubmissionEditor as container-aware bubble-sheet editor"
```

---

## Task 6: Replace `pendingAssignmentBanner` with auto-open editor

**Files:**
- Modify: `app.jsx` at [app.jsx:4316-4397](../../../app.jsx#L4316) — `StudentPortal` component

**Context:** Session 13 left a placeholder banner that reads `sessionStorage.pendingAssignment`. Session 14 replaces this with an effect that calls `setOpenAssignmentId(pendingAssignment.a)` on mount when the stashed `s` matches the portal's `studentId`, then clears `sessionStorage`.

- [ ] **Step 1: Find the current banner implementation**

Run:
```bash
grep -n "pendingAssignmentBanner\|PENDING_ASSIGNMENT_KEY\|pendingAssignment" ~/projects/ats-portal/app.jsx | head -30
```
Note the line numbers of: (a) where `pendingAssignment` state is read, (b) where `pendingAssignmentBanner` JSX is defined, (c) where it's rendered (three places per Session 13 doc). Also note where `setOpenAssignmentId` lives — it's defined inside `PortalHistoryTab` per [app.jsx:4680](../../../app.jsx#L4680), not in `StudentPortal` itself.

- [ ] **Step 2: Lift `openAssignmentId` state to `StudentPortal` level**

The deep-link handoff needs to reach into the history tab's open-assignment state. Simplest approach: pass a `deepLinkAssignmentId` prop down to `PortalHistoryTab` and have it call `setOpenAssignmentId` in its own effect when the prop appears.

In `StudentPortal`, near the existing `pendingAssignment` read:

1. Read `sessionStorage[PENDING_ASSIGNMENT_KEY]` once on mount into a local state variable `deepLinkAssignmentId` (null if not present or studentId mismatch).
2. On mount (if set), immediately clear the sessionStorage key and force the tab to History.
3. Delete the `pendingAssignmentBanner` variable and all three places it's rendered.
4. Pass `deepLinkAssignmentId={deepLinkAssignmentId}` to `<PortalHistoryTab/>`.

Concrete edit pattern — locate the block around [app.jsx:4316](../../../app.jsx#L4316) that currently looks roughly like:

```jsx
const [pendingAssignment, setPendingAssignment] = useState(()=>{
  try { return JSON.parse(sessionStorage.getItem(PENDING_ASSIGNMENT_KEY) || "null"); }
  catch { return null; }
});
// ... later ...
const pendingAssignmentBanner = pendingAssignment ? ( /* big JSX */ ) : null;
```

Replace with:

```jsx
const [deepLinkAssignmentId, setDeepLinkAssignmentId] = useState(()=>{
  try {
    const raw = JSON.parse(sessionStorage.getItem(PENDING_ASSIGNMENT_KEY) || "null");
    if(raw && raw.a && raw.s && raw.s === studentId) return raw.a;
  } catch {}
  return null;
});
useEffect(()=>{
  if(deepLinkAssignmentId){
    try { sessionStorage.removeItem(PENDING_ASSIGNMENT_KEY); } catch {}
    // Force history tab so the editor auto-open is visible.
    setActiveTab("history");
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

(If `setActiveTab` is not the real setter name, use whatever the existing tab state setter is called — inspect `StudentPortal` to find it.)

- [ ] **Step 3: Remove the three banner renders**

Search for every `{pendingAssignmentBanner}` in `StudentPortal` and delete those lines. Delete the `pendingAssignmentBanner` local variable and its JSX. Also delete the `pendingAssignment` state if it's no longer read (the `deepLinkAssignmentId` above replaces it).

- [ ] **Step 4: Accept `deepLinkAssignmentId` in `PortalHistoryTab`**

Find the `PortalHistoryTab` function signature (near [app.jsx:4676](../../../app.jsx#L4676), look for `const [openAssignmentId, setOpenAssignmentId] = useState(null);`). Add `deepLinkAssignmentId` to the props, and add an effect:

```jsx
function PortalHistoryTab({student, studentId, currentUserEntry, deepLinkAssignmentId}){
  const [openAssignmentId, setOpenAssignmentId] = useState(null);
  // ... existing code ...

  useEffect(()=>{
    if(!deepLinkAssignmentId) return;
    const assignments = (student.assignments||[]).filter(a=>!a.deleted);
    const exists = assignments.some(a => a.id === deepLinkAssignmentId);
    if(exists) setOpenAssignmentId(deepLinkAssignmentId);
    // If it doesn't exist we silently ignore — the student may have an
    // outdated link or the tutor deleted the assignment.
  }, [deepLinkAssignmentId, student]);

  // ... rest unchanged ...
}
```

And pass it from the parent:

```jsx
<PortalHistoryTab student={student} studentId={studentId} currentUserEntry={currentUserEntry} deepLinkAssignmentId={deepLinkAssignmentId}/>
```

- [ ] **Step 5: Parse check**

Run:
```bash
cd ~/projects/ats-portal && npx --yes esbuild@0.24.0 app.jsx --jsx=transform --jsx-factory=React.createElement --jsx-fragment=React.Fragment --log-level=error > /dev/null
```
Expected: clean exit.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/ats-portal && git add app.jsx && git commit -m "deep link auto-opens SubmissionEditor, drop Session 13 placeholder banner"
```

---

## Task 7: Local browser smoke tests

**Files:** none — manual verification only.

**Context:** Before deploying rules, exercise every render path in the browser locally. The dev bypass (`?dev=1&role=student&studentId=...`) skips Firebase Auth so you can hit the editor directly without sending an email link.

- [ ] **Step 1: Rebuild index.html**

```bash
cd ~/projects/ats-portal && python build_index.py
```
Expected: no errors. The build should produce an up-to-date `index.html` with the new `app.jsx` inlined.

- [ ] **Step 2: Start the local server**

```bash
cd ~/projects/ats-portal && python -m http.server 8765 &
```

- [ ] **Step 3: Test the real-assignment render path**

Use the dev bypass with a real studentId from the `psm-generator` Firestore that has at least one assignment with multiple worksheets. Ask the user which studentId to use — do NOT fabricate.

URL: `http://localhost:8765/?dev=1&role=student&studentId=<REAL_ID>`

Expected flow:
1. StudentPortal renders
2. Navigate to History tab
3. Click Answer → on an assignment with 2+ worksheets
4. Editor opens with the date header
5. Each worksheet renders as its own `WorksheetBlock` with:
   - Header (title + subject/domain/difficulty)
   - Two-column layout: PDF viewer left, answer rows right
6. For MC worksheets: A/B/C/D chips respond to clicks
7. For FR worksheets: text input accepts typing
8. PDFs either load (if catalog has been deployed AND Storage rules allow it — Task 8 gate) OR show "Couldn't load the PDF — Open externally" (expected pre-Task-8)
9. Typing in an answer triggers an autosave ~750ms later — watch Network tab or Firestore console

If ANY of these fails, stop and fix before proceeding.

- [ ] **Step 4: Test the deep-link path**

URL: `http://localhost:8765/?dev=1&role=student&studentId=<REAL_ID>&a=<REAL_ASSIGNMENT_ID>&s=<REAL_ID>`

Expected: the editor auto-opens directly on the referenced assignment. `sessionStorage.pendingAssignment` is cleared (check DevTools → Application → Session Storage).

- [ ] **Step 5: Test the zero-worksheet fallback**

Find (or ask the user to create in dev) an assignment with only WellEd domain items or only practice exams, no worksheets. Open it in the editor. Expected: legacy full-assignment textarea, no `WorksheetBlock`s, the info note about WellEd/exam items renders.

- [ ] **Step 6: Test the submit lock**

Type an answer in one worksheet, click Submit. Expected: form locks, all inputs disabled, shows "Submitted {date}". Reopen the same assignment — the submitted state persists.

- [ ] **Step 7: Stop the local server**

```bash
kill %1 2>/dev/null || true
```

- [ ] **Step 8: No commit**

Task 7 is pure verification. If a bug surfaces, fix it under whichever Task 1–6 owns that code, commit the fix under that task's scope, and re-run Task 7.

---

## Task 8: Add `storage.rules` and deploy

**Files:**
- Create: `storage.rules`
- Modify: `firebase.json` to register storage rules

**Context:** The Firebase Storage bucket has 130 STU PDFs but default rules deny all reads. This task adds a Storage rules file that mirrors Firestore's allowlist gate, registers it in `firebase.json`, tests it via the Storage emulator, and deploys.

**⚠ This task is a production deploy. It ships Session 13's auth path + all of Session 14 to portal.affordabletutoringsolutions.org in one push. The Session 13 deploy is still pending from the expired-token failure.**

- [ ] **Step 1: Create `storage.rules`**

Create `storage.rules` at repo root:

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {

    function emailKey() {
      return request.auth.token.email.lower();
    }

    function isAllowlisted() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && firestore.exists(/databases/(default)/documents/allowlist/$(emailKey()))
        && firestore.get(/databases/(default)/documents/allowlist/$(emailKey())).data.active == true;
    }

    function allowlistRole() {
      return firestore.get(/databases/(default)/documents/allowlist/$(emailKey())).data.role;
    }

    function canReadWorksheet() {
      return isAllowlisted()
        && allowlistRole() in ['tutor', 'admin', 'student', 'parent'];
    }

    match /worksheets/{file=**} {
      allow read: if canReadWorksheet();
      allow write: if false;
    }

    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 2: Register storage rules in `firebase.json`**

Add a `"storage"` top-level key next to `"firestore"`:

```json
"storage": {
  "rules": "storage.rules"
},
```

Insert it between the existing `"firestore"` block and `"functions"`.

- [ ] **Step 3: Test via emulator (if available)**

```bash
cd ~/projects/ats-portal && firebase emulators:start --only storage,firestore --project psm-generator
```

If `firebase-tools` is installed locally and the emulator starts cleanly, upload a test file via the emulator UI (http://localhost:4000) and attempt a read with and without an `allowlist/{email}` doc present. Confirm `firestore.get()` resolves.

If the emulator reports "firestore.get() not supported" or similar, **fall back** to a simpler rule:

```
function canReadWorksheet() {
  return request.auth != null && request.auth.token.email_verified == true;
}
```

Document the fallback in `docs/PHASE_3_SESSION_14.md` as a surprise.

If you don't have `firebase-tools` installed locally, **skip the emulator step** and proceed to deploy — the production deploy will surface the issue, and you can roll back to the fallback rule with one commit + redeploy.

- [ ] **Step 4: Deploy**

Deploy is normally via `git push` to main → GitHub Actions. However, the Actions workflow only runs `firebase deploy --only hosting`, NOT `--only storage`. For Session 14 we need to deploy both. Two options:

**Option A (recommended): Manual deploy from laptop**

```bash
cd ~/projects/ats-portal && firebase deploy --only storage,hosting --project psm-generator
```

This requires a locally-authenticated `firebase login`. Tell the user: "I'm about to deploy Storage rules and Hosting to production. Confirm?" Wait for explicit approval before running.

**Option B: Update the Actions workflow to include storage, then push**

Edit `.github/workflows/deploy.yml` line 62 to change `--only hosting` to `--only storage,hosting`. Then the normal `git push` pipeline handles it. Tradeoff: slower because it waits on CI, and the expired-token issue is still recent — a failed deploy leaves Storage rules unchanged but the code landed on main.

**Recommend A for Session 14 specifically.** The token was rotated, but we haven't yet seen a green deploy with the new token. Manual deploy removes one variable.

Get user approval, then run:

```bash
cd ~/projects/ats-portal && firebase deploy --only storage,hosting --project psm-generator
```

Expected: `✔ Deploy complete!` with a `Hosting URL:` line.

- [ ] **Step 5: Verify production PDF fetch**

Open `https://portal.affordabletutoringsolutions.org/` in your real browser (NOT dev bypass — real Firebase Auth). Sign in as a student account on the allowlist. Navigate to an assignment with worksheets. Confirm the PDF viewer loads the STU PDF inline.

If it fails with 403 in DevTools, the Storage rule is rejecting the read — investigate `firestore.get()` cross-service call. Fall back to the simpler rule, redeploy.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/ats-portal && git add storage.rules firebase.json && git commit -m "add storage.rules for worksheet PDF reads + register in firebase.json"
```

Note: the deploy was already done manually in Step 4 — this commit is for repo history only. Push separately:

```bash
cd ~/projects/ats-portal && git push
```

---

## Task 9: Write Session 14 closeout doc

**Files:**
- Create: `docs/PHASE_3_SESSION_14.md`

**Context:** Following the pattern of Session 12 and Session 13 closeout docs. Captures what shipped, pause-point resolutions, surprises, testing performed, follow-ups, and a kickoff prompt for Session 15.

- [ ] **Step 1: Draft the closeout doc**

Use `docs/PHASE_3_SESSION_13.md` as a template for structure. Sections to include:

1. **Header** — date, session type, parent docs, outcome
2. **What shipped** — one section per task (`useWorksheetCatalog`, `InlinePdfViewer`, `WorksheetBlock`, `SubmissionEditor` rewrite, banner replacement, `storage.rules`, deploy)
3. **The four pause points** — catalog data source, Storage rules, responses[] shape, storage.rules shape — and how each resolved
4. **The container-model correction** — the mid-brainstorming discovery that assignments are containers. Document the Option 1 (stacked) decision with full reasoning, since it wasn't in the kickoff prompt.
5. **Deferred drift decision** — Session 12 Follow-up #1 option 3 was not executed. Reason: scope.
6. **Testing performed** — esbuild parse check, local browser smoke tests, emulator Storage rules test (or fallback), deployed smoke test against prod
7. **What was NOT tested** — real student flow, cross-device flow, auto-grading, row [116] duplicate
8. **Surprises** — token rotation blocker, container model discovery, any Storage rules `firestore.get()` gotcha
9. **Follow-ups** — Storage rules fallback (if used), WS_RAW retirement, `.bak*` cleanup, auto-grading (Session 15)
10. **State of `WISE_WRITE_ENABLED`** — still false
11. **Checkpoint** — every item from the spec marked complete
12. **Kickoff prompt for Session 15** — auto-grading trigger + Wise post-back + `questionKeys` Firestore rules + any Storage rules follow-up

- [ ] **Step 2: Commit**

```bash
cd ~/projects/ats-portal && git add docs/PHASE_3_SESSION_14.md && git commit -m "session 14 closeout doc" && git push
```

---

## Self-review

**Spec coverage:**
- `useWorksheetCatalog` → Task 1 ✓
- `InlinePdfViewer` → Task 2 ✓
- `WorksheetBlock` + MC/FR/mixed renderers → Task 4 ✓
- `SubmissionEditor` rewrite with container model → Task 5 ✓
- `makeDraftPayload` + `canSubmitDraft` nested-shape support → Task 3 ✓
- Zero-worksheet fallback + legacy-blob defensive mode → Task 5 ✓
- `pendingAssignmentBanner` deletion + deep-link auto-open → Task 6 ✓
- `storage.rules` + `firebase.json` delta → Task 8 ✓
- Deploy with token rotation verification → Task 0 + Task 8 ✓
- Local browser smoke tests covering all render paths → Task 7 ✓
- Session 14 closeout doc → Task 9 ✓

**Placeholder scan:** none found — every step has concrete commands or code. Task 6 Steps 2–4 reference specific line numbers with a `grep` step to relocate if they've shifted, and specify the exact edit pattern.

**Type consistency:** `worksheetId` used consistently across `responses[]` entries, `answersByWorksheet` keys, `catalogByWorksheetId` keys. `catalogEntry.questionIds` used consistently. `isLocked` prop consistent. `canSubmitDraft` signature unchanged. `makeDraftPayload` new signature matches between Task 3 implementation and Task 5 caller.

**Known soft spots the executing agent should watch:**
1. Task 5 uses `useMemo` — if React isn't destructured with it, the parse check will fail immediately and Step 2 tells the agent how to fix.
2. Task 6 lifts state between `StudentPortal` and `PortalHistoryTab` — the exact prop names depend on reading the current code. The task tells the agent to `grep` first.
3. Task 8 Step 3 has an emulator fallback path — if `firestore.get()` doesn't work cross-service, the agent has a pre-written fallback rule.
4. Task 8 Step 4 is a production deploy — the task explicitly requires user approval before running, following CLAUDE.md's risky-action rules.

---

**Plan complete and saved to [docs/superpowers/plans/2026-04-14-session-14-submission-editor.md](../plans/2026-04-14-session-14-submission-editor.md).**
