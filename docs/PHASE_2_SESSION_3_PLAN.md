# Phase 2 Session 3 — Student Portal UI Implementation Plan

> **For agentic workers:** Execute task-by-task, preserving the checkpoint pauses. Steps use `- [ ]` checkboxes. This plan is scoped to Session 3 only — do not start Session 4 work (parent child-switcher, etc.) without a new planning pass.

**Goal:** Ship a read-only `StudentPortal` view and a top-level `RoleRouter` that gates tutors/admins to the existing `AppInner` and routes students/parents to the portal, reachable only via `?dev=1&role=student` for now.

**Architecture:** A new `RoleRouter` sits between `App` and `AppInner` in [app.jsx](../app.jsx). When `currentUserEntry.role` is `student` or `parent`, it renders `<StudentPortal studentId=... />`; otherwise it renders `<AppInner />` unchanged. `StudentPortal` subscribes to exactly one Firestore doc (`/students/{studentId}`) via `onSnapshot` — never the full collection. Chart is hand-rolled inline SVG (zero new dependencies, styleable with existing editorial tokens).

**Tech Stack:** Same as the rest of psm-generator — React via CDN, in-browser Babel, Firestore compat SDK, no bundler. Pure-logic helpers tested via `node --test tests/*.mjs`; UI verified manually via `?dev=1&role=student&studentId=<id>`.

---

## Decisions baked into this plan (confirm before executing)

1. **Chart library: hand-rolled inline SVG.** A single-series line chart with points and an x-axis of dates. ~80 lines of JSX, zero CDN trust, already styleable with the `#0F1A2E` / `#9A5B1F` / Fraunces tokens. No Recharts, no Chart.js, no ECharts. **Confirm at Task 10.**
2. **`StudentPortal` takes `studentId` as a prop, not a hardcoded lookup.** `RoleRouter` picks `currentUserEntry.studentIds[0]` today; Session 4 adds a child-switcher that varies the prop. This keeps Session 4 additive.
3. **Notes are NOT read from `_private/info`.** Students must not see tutor notes. The `notesDocRef` path stays out of `StudentPortal` entirely.
4. **`?dev=1&role=student` extended with `&studentId=<id>`.** Required so we can exercise the portal against a real student. Falls back to `""` (which renders an empty-state card at the portal root).
5. **Empty states are explicit per tab.** Matches the existing tutor empty-state pattern ([app.jsx:3059](../app.jsx#L3059)) — paper-alt background, Fraunces italic copy, no placeholder divs.
6. **Responsive target: 375px viewport, no horizontal scroll.** Header stacks, tabs wrap, cards go full-width below 768px. Tutor `AppInner` stays desktop-only and is not touched.
7. **`AppInner` is not modified.** Session 3 only adds new code. No refactor to extract "shared read-only components" — we accept duplication of ~200 lines of rendering code because extracting would force `AppInner` edits during the post-cutover grace window.

---

## File structure

**Modify:** `app.jsx`
- New `~line 520` zone (before `function App()`): `pickPortalStudentId(entry)` pure helper.
- Extend `DEV_BYPASS` block to parse `&studentId=` param and plumb into `DEV_FAKE_ENTRY.studentIds`.
- New `RoleRouter({authUser, onSignOut, currentUserEntry})` component — inserted between `App`'s return and `AppInner`.
- Replace `App`'s `return <AppInner ... />` with `return <RoleRouter ... />`.
- New `StudentPortal({studentId, onSignOut, currentUserEntry})` component — added near bottom of file, before `AppInner` closes out, or after `StudentProfile`. Preference: after `StudentProfile` (~line 3381) so it's near the code it mirrors.
- New `usePortalStudent(studentId)` hook inside or near `StudentPortal`.
- New `ScoreTrendsChart({points})` inline SVG component inside `StudentPortal`'s module area.
- Add responsive CSS rules to the existing `<style>` block in [build_index.py](../build_index.py) under a `@media (max-width: 768px)` block scoped to `[data-portal="student"]`.

**Create:** `tests/portal.test.mjs` — pure-logic tests for `pickPortalStudentId` and a `computeFullScoreTrendPoints` helper extracted for testability.

**No new top-level files in `app.jsx`**, no new CDN scripts, no new `package.json`.

---

## Task 1: `pickPortalStudentId` pure helper + test

**Files:**
- Modify: `app.jsx` (add near line 520, before `function App()`)
- Test: `tests/portal.test.mjs` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/portal.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';

// Pure helpers copied out of app.jsx for node --test. Keep in sync manually.
// (Matches the pattern used by tests/diagnostic.test.mjs.)
function pickPortalStudentId(entry){
  if(!entry) return "";
  const ids = Array.isArray(entry.studentIds) ? entry.studentIds : [];
  return ids[0] || "";
}

test('pickPortalStudentId: null entry → empty string', () => {
  assert.equal(pickPortalStudentId(null), "");
});

test('pickPortalStudentId: missing studentIds → empty string', () => {
  assert.equal(pickPortalStudentId({role:"student"}), "");
});

test('pickPortalStudentId: empty studentIds → empty string', () => {
  assert.equal(pickPortalStudentId({role:"student", studentIds:[]}), "");
});

test('pickPortalStudentId: single studentId → that id', () => {
  assert.equal(pickPortalStudentId({role:"student", studentIds:["abc123"]}), "abc123");
});

test('pickPortalStudentId: multiple studentIds → first one (Session 4 adds switcher)', () => {
  assert.equal(pickPortalStudentId({role:"parent", studentIds:["kid1","kid2"]}), "kid1");
});
```

- [ ] **Step 2: Run test to verify it passes** (the helper is inlined in the test file)

Run: `node --test tests/portal.test.mjs`
Expected: 5 passing tests.

- [ ] **Step 3: Add the real helper to `app.jsx`**

Insert just before `function App()` (around line 520):

```javascript
// Portal routing helper. Session 4 will add a child-switcher that may pick a
// different id from the entry.studentIds array. For Session 3 we always take
// the first one and treat zero-id entries as an empty-state render.
function pickPortalStudentId(entry){
  if(!entry) return "";
  const ids = Array.isArray(entry.studentIds) ? entry.studentIds : [];
  return ids[0] || "";
}
```

- [ ] **Step 4: Commit**

```bash
git add app.jsx tests/portal.test.mjs
git commit -m "add pickPortalStudentId helper + tests"
```

---

## Task 2: Extend `DEV_BYPASS` to accept `&studentId=`

**Files:**
- Modify: `app.jsx` lines ~495-519 (`DEV_FAKE_ROLE` / `DEV_FAKE_ENTRY` block)

- [ ] **Step 1: Add `DEV_FAKE_STUDENT_ID` parser**

Insert after `DEV_FAKE_ROLE` definition:

```javascript
// Optional studentId override for portal dev bypass:
// ?dev=1&role=student&studentId=rnbw56f5
// When absent and role is student/parent, the portal renders an empty-state.
const DEV_FAKE_STUDENT_ID = (()=>{
  if(!DEV_BYPASS) return "";
  try{
    return new URLSearchParams(location.search).get("studentId") || "";
  }catch{ return ""; }
})();
```

- [ ] **Step 2: Wire it into `DEV_FAKE_ENTRY`**

Change:

```javascript
const DEV_FAKE_ENTRY = {
  email: "dev@localhost",
  role: DEV_FAKE_ROLE || "tutor",
  studentIds: [],
  ...
};
```

to:

```javascript
const DEV_FAKE_ENTRY = {
  email: "dev@localhost",
  role: DEV_FAKE_ROLE || "tutor",
  studentIds: DEV_FAKE_STUDENT_ID ? [DEV_FAKE_STUDENT_ID] : [],
  active: true,
  addedBy: "dev-bypass",
  addedAt: null,
};
```

- [ ] **Step 3: Parse check**

Run: `node -e "require('child_process').execSync('python3 build_index.py', {stdio:'inherit'})"` or whatever the existing build command is (check `README.md`). Expected: build succeeds, no Babel parse errors.

- [ ] **Step 4: Commit**

```bash
git add app.jsx
git commit -m "dev bypass: accept ?studentId= for portal testing"
```

---

## Task 3: `usePortalStudent` hook

**Files:**
- Modify: `app.jsx` (add near other portal helpers around line 320, or inline just above `StudentPortal`)

- [ ] **Step 1: Add the hook**

Insert near `studentDocRef` / `saveStudentNotes`:

```javascript
// Subscribe to a single /students/{id} doc. Used by StudentPortal — which
// must NEVER read the full collection (that would defeat the per-student
// rules from Phase 2 Session 2). Returns {status, student, error}.
//   status: "loading" | "ready" | "not-found" | "error"
function usePortalStudent(studentId){
  const [state, setState] = useState({status:"loading", student:null, error:null});
  useEffect(()=>{
    if(!studentId){
      setState({status:"not-found", student:null, error:null});
      return;
    }
    const ref = studentDocRef(studentId);
    if(!ref){
      setState({status:"error", student:null, error:new Error("Firestore not initialized")});
      return;
    }
    setState({status:"loading", student:null, error:null});
    const unsub = ref.onSnapshot(
      (snap)=>{
        if(!snap.exists){
          setState({status:"not-found", student:null, error:null});
          return;
        }
        const data = snap.data() || {};
        setState({status:"ready", student:{id:snap.id, ...data}, error:null});
      },
      (err)=>{
        console.warn("[portal] student snapshot error:", err);
        setState({status:"error", student:null, error:err});
      }
    );
    return ()=>unsub();
  }, [studentId]);
  return state;
}
```

Note: this hook uses `useState`/`useEffect` from the same React instance `AppInner` uses. No new imports needed — React is window-global.

- [ ] **Step 2: Commit**

```bash
git add app.jsx
git commit -m "add usePortalStudent single-doc subscription hook"
```

---

## Task 4: `StudentPortal` skeleton (header + empty tabs)

**Files:**
- Modify: `app.jsx` — add new component after `StudentProfile` closes (around line 3381)

- [ ] **Step 1: Add component skeleton**

```jsx
function StudentPortal({studentId, onSignOut, currentUserEntry}){
  const [tab, setTab] = useState("tracking"); // tracking | history | trends
  const {status, student} = usePortalStudent(studentId);

  if(status === "loading"){
    return (
      <div data-portal="student" style={{minHeight:"100vh",background:"var(--paper)",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{fontFamily:"var(--font-display)",fontSize:18,color:"var(--ink-mute)"}}>Loading…</div>
      </div>
    );
  }

  if(status === "not-found" || !student){
    return (
      <PortalShell studentName="" onSignOut={onSignOut} currentUserEntry={currentUserEntry}>
        <div style={{...CARD, padding:"60px 40px", textAlign:"center", margin:"40px auto", maxWidth:520}}>
          <div style={{fontFamily:"'Fraunces',Georgia,serif",fontStyle:"italic",fontSize:22,color:"#66708A",letterSpacing:-.2,marginBottom:10}}>
            No student record linked to this account.
          </div>
          <div style={{fontSize:13,color:"#66708A",lineHeight:1.55}}>
            If you believe this is a mistake, email your tutor or <span style={{fontFamily:"'IBM Plex Mono',monospace"}}>support@affordabletutoringsolutions.org</span>.
          </div>
        </div>
      </PortalShell>
    );
  }

  if(status === "error"){
    return (
      <PortalShell studentName="" onSignOut={onSignOut} currentUserEntry={currentUserEntry}>
        <div style={{...CARD, padding:"60px 40px", textAlign:"center", margin:"40px auto", maxWidth:520}}>
          <div style={{fontFamily:"'Fraunces',Georgia,serif",fontStyle:"italic",fontSize:22,color:"#8C2E2E",letterSpacing:-.2}}>
            Couldn't load your student record. Try reloading.
          </div>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell studentName={student.name} studentGrade={student.grade} onSignOut={onSignOut} currentUserEntry={currentUserEntry}>
      <div style={{display:"flex",gap:28,marginBottom:24,borderBottom:"1px solid rgba(15,26,46,.12)",flexWrap:"wrap"}}>
        {[
          {id:"tracking", label:"Score Tracking"},
          {id:"history",  label:"Assignment History"},
          {id:"trends",   label:"Score Trends"},
        ].map(t=>{
          const active = tab===t.id;
          return (
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              border:"none",background:"none",cursor:"pointer",padding:"14px 0",
              fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 48',
              fontSize:15,fontWeight:active?600:500,color:active?"#0F1A2E":"#66708A",
              borderBottom:active?"2px solid #0F1A2E":"2px solid transparent",marginBottom:-1,
              letterSpacing:-.1,position:"relative"
            }}>
              {t.label}
              {active&&<span style={{position:"absolute",left:"50%",bottom:-2,width:5,height:5,transform:"translate(-50%,50%) rotate(45deg)",background:"#9A5B1F"}}/>}
            </button>
          );
        })}
      </div>

      {tab==="tracking" && <PortalTrackingTab student={student}/>}
      {tab==="history"  && <PortalHistoryTab student={student}/>}
      {tab==="trends"   && <PortalTrendsTab student={student}/>}
    </PortalShell>
  );
}

function PortalShell({studentName, studentGrade, onSignOut, currentUserEntry, children}){
  return (
    <div data-portal="student" style={{minHeight:"100vh",background:"var(--paper)",padding:"28px 32px 80px"}}>
      <div style={{maxWidth:960,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:32,flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,letterSpacing:1.4,color:"#66708A",textTransform:"uppercase",marginBottom:4}}>
              Affordable Tutoring Solutions — Student Portal
            </div>
            <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 144',fontSize:36,fontWeight:600,color:"#0F1A2E",letterSpacing:-.6,lineHeight:1.05}}>
              {studentName || "Welcome"}
            </div>
            {studentGrade && (
              <div style={{marginTop:8}}>
                <span style={{...mkPill("transparent","#003258"),border:"1px solid rgba(0,50,88,.28)"}}>Grade {studentGrade}</span>
              </div>
            )}
          </div>
          <button onClick={onSignOut} style={{
            border:"1px solid var(--rule-strong)",background:"var(--card)",color:"var(--ink)",
            padding:"10px 16px",borderRadius:8,fontFamily:"var(--font-body)",fontSize:12.5,
            fontWeight:500,cursor:"pointer"
          }}>Sign out</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PortalTrackingTab({student}){
  return <div style={{...CARD, padding:24}}>Score Tracking — coming in Task 7</div>;
}
function PortalHistoryTab({student}){
  return <div style={{...CARD, padding:24}}>Assignment History — coming in Task 8</div>;
}
function PortalTrendsTab({student}){
  return <div style={{...CARD, padding:24}}>Score Trends — coming in Task 10</div>;
}
```

- [ ] **Step 2: Commit**

```bash
git add app.jsx
git commit -m "scaffold StudentPortal component with blank tabs"
```

---

## Task 5: `RoleRouter` + wire into `App`

**Files:**
- Modify: `app.jsx` around line 660 (`App`'s return + add `RoleRouter` nearby)

- [ ] **Step 1: Add `RoleRouter` component**

Insert directly above `function App()`:

```jsx
// Top-level role-aware router. Tutors and admins (and legacy workspace users
// with no allowlist entry) see AppInner unchanged. Students and parents see
// StudentPortal scoped to their linked student. This is the ONLY place the
// role check gates which app renders — AppInner and StudentPortal each
// assume their own audience.
function RoleRouter({authUser, onSignOut, currentUserEntry}){
  const role = currentUserEntry?.role || null;
  if(role === "student" || role === "parent"){
    const studentId = pickPortalStudentId(currentUserEntry);
    return <StudentPortal studentId={studentId} onSignOut={onSignOut} currentUserEntry={currentUserEntry}/>;
  }
  return <AppInner authUser={authUser} onSignOut={onSignOut} currentUserEntry={currentUserEntry}/>;
}
```

- [ ] **Step 2: Swap `App`'s return**

Change line ~660:

```jsx
return <AppInner authUser={authUser} onSignOut={handleSignOut} currentUserEntry={currentUserEntry}/>;
```

to:

```jsx
return <RoleRouter authUser={authUser} onSignOut={handleSignOut} currentUserEntry={currentUserEntry}/>;
```

- [ ] **Step 3: Build and parse-check**

Run the repo's build command (whatever `build_index.py` expects). Expected: clean build, no Babel errors.

Run: `node --test tests/*.mjs`
Expected: all tests green (30/30 from Session 2 + 5 new = 35).

- [ ] **Step 4: Commit**

```bash
git add app.jsx
git commit -m "add RoleRouter, gate student/parent to StudentPortal"
```

---

## Task 6: Manual verification — **CHECKPOINT A**

**Files:** none

- [ ] **Step 1: Pick a real studentId**

Use the `Sample` student from Session 2 verification (`rnbw56f5`) since it's the only one with non-zero data, or any of the 51 production IDs.

- [ ] **Step 2: Serve locally and open two URLs in a browser**

Run whatever local serve command the repo uses (probably `python3 -m http.server` after build, or however build_index.py produces `index.html`). Then open:

1. `http://localhost:8000/?dev=1` — should render the existing tutor app unchanged.
2. `http://localhost:8000/?dev=1&role=student&studentId=rnbw56f5` — should render `StudentPortal` with the student's name in the header, three tab buttons, and the "coming in Task N" placeholder in whichever tab is selected.

- [ ] **Step 3: Verify edge cases**

- `?dev=1&role=student` (no studentId) → "No student record linked to this account." empty state.
- `?dev=1&role=student&studentId=bogus-id-that-doesnt-exist` → same empty state (not-found is collapsed with "no id" intentionally).
- `?dev=1&role=parent&studentId=rnbw56f5` → same portal render as student.

- [ ] **Step 4: STOP — report status to Kiran**

Do not continue to Task 7 until Kiran verifies:
- Tutor flow via `?dev=1` is unchanged (regression gate).
- Portal routing works for student + parent.
- Name and grade render from the live `/students/{id}` doc.

Wait for Kiran to push the commits or approve continuing.

---

## Task 7: `PortalTrackingTab` — scores + diagnostics + WellEd logs (read-only)

**Files:** `app.jsx` — replace the `PortalTrackingTab` stub

- [ ] **Step 1: Build the read-only view**

Replace:

```jsx
function PortalTrackingTab({student}){
  return <div style={{...CARD, padding:24}}>Score Tracking — coming in Task 7</div>;
}
```

with (this reuses `buildDiagnosticProfile`, `allScoreDataPoints`, `PctBar`, `CARD`, `mkPill` which are already in scope in `app.jsx`):

```jsx
function PortalTrackingTab({student}){
  const pts = allScoreDataPoints(student);
  const diagProfile = (student.diagnostics||[]).length ? buildDiagnosticProfile(student.diagnostics) : null;
  const welled = (student.welledLogs||[]).filter(l=>!l.deleted);

  // Full-practice subset — same filter as tutor ScoreHistoryPanel uses.
  const fullPts = pts.filter(pt=>{
    const catStr = pt.category||"";
    const isFull = /Total SAT|R&W Section|Math Section|Full —|Section —|Practice|Official SAT|Full Practice|BlueBook|WellEd Full/i.test(catStr);
    return isFull && pt.level!=="domain" && pt.level!=="sub";
  }).sort((a,b)=>(a.date||"").localeCompare(b.date||""));

  const anyData = fullPts.length>0 || diagProfile || welled.length>0;

  if(!anyData){
    return (
      <div style={{...CARD, padding:"60px 40px", textAlign:"center"}}>
        <div style={{fontFamily:"'Fraunces',Georgia,serif",fontStyle:"italic",fontSize:22,color:"#66708A",letterSpacing:-.2,marginBottom:10}}>
          No scores logged yet.
        </div>
        <div style={{fontSize:13,color:"#66708A",lineHeight:1.55}}>
          As you complete practice tests and sessions, your scores will appear here.
        </div>
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:24}}>
      {/* Exam history */}
      <div style={CARD}>
        <SectionHeading>Practice exam history</SectionHeading>
        {fullPts.length===0 ? (
          <EmptyInline copy="No practice exam scores recorded."/>
        ) : (
          <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"'IBM Plex Mono',monospace",fontSize:12}}>
            <thead>
              <tr style={{textAlign:"left",color:"#66708A",fontSize:10,letterSpacing:1,textTransform:"uppercase"}}>
                <th style={{padding:"8px 8px 8px 0",borderBottom:"1px solid rgba(15,26,46,.12)"}}>Date</th>
                <th style={{padding:"8px",borderBottom:"1px solid rgba(15,26,46,.12)"}}>Exam</th>
                <th style={{padding:"8px",borderBottom:"1px solid rgba(15,26,46,.12)",textAlign:"right"}}>Score</th>
              </tr>
            </thead>
            <tbody>
              {fullPts.map((pt,i)=>(
                <tr key={i}>
                  <td style={{padding:"10px 8px 10px 0",borderBottom:"1px solid rgba(15,26,46,.06)"}}>{pt.date||"—"}</td>
                  <td style={{padding:"10px 8px",borderBottom:"1px solid rgba(15,26,46,.06)",fontFamily:"'Fraunces',Georgia,serif",fontSize:14}}>{pt.category||"Exam"}</td>
                  <td style={{padding:"10px 8px",borderBottom:"1px solid rgba(15,26,46,.06)",textAlign:"right",fontWeight:600}}>{pt.score ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Diagnostic profile */}
      <div style={CARD}>
        <SectionHeading>Diagnostic profile</SectionHeading>
        {!diagProfile ? (
          <EmptyInline copy="No diagnostic reports uploaded yet."/>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {Object.entries(diagProfile.byDomain||{}).map(([dom, v])=>(
              <div key={dom} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:14,color:"#0F1A2E"}}>{dom}</div>
                <PctBar value={typeof v?.accuracy==="number"?Math.round(v.accuracy):null} width={120}/>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* WellEd logs (read-only) */}
      <div style={CARD}>
        <SectionHeading>WellEd practice log</SectionHeading>
        {welled.length===0 ? (
          <EmptyInline copy="No WellEd practice logged yet."/>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {welled.slice().reverse().map(l=>(
              <div key={l.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid rgba(15,26,46,.06)",gap:12,flexWrap:"wrap"}}>
                <div style={{display:"flex",flexDirection:"column",gap:2,minWidth:0}}>
                  <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:14,color:"#0F1A2E"}}>{l.domain||"Domain"} · <span style={{color:"#66708A",fontStyle:"italic"}}>{l.difficulty||""}</span></div>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#66708A"}}>{l.date||""} · {l.subject||""}</div>
                </div>
                <div style={{minWidth:140,textAlign:"right"}}>
                  <PctBar value={typeof l.score==="number"?l.score:(parseInt(l.score,10)||null)} width={100}/>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeading({children}){
  return (
    <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,fontWeight:600,letterSpacing:1.4,color:"#66708A",textTransform:"uppercase",marginBottom:16}}>
      {children}
    </div>
  );
}
function EmptyInline({copy}){
  return (
    <div style={{fontFamily:"'Fraunces',Georgia,serif",fontStyle:"italic",fontSize:14,color:"#66708A",padding:"16px 0"}}>
      {copy}
    </div>
  );
}
```

- [ ] **Step 2: Build and manual-verify**

Open `?dev=1&role=student&studentId=rnbw56f5`. The Score Tracking tab should now render the Sample student's 4 assignments worth of data (or the "No scores logged yet" empty state for a stock student). Open the sign-in flow via `?dev=1` and confirm the tutor app is still unaffected (specifically: the normal `StudentProfile` tabs still render).

- [ ] **Step 3: Commit**

```bash
git add app.jsx
git commit -m "portal: score tracking tab (read-only)"
```

---

## Task 8: `PortalHistoryTab` — assignment history (read-only)

**Files:** `app.jsx` — replace the `PortalHistoryTab` stub

- [ ] **Step 1: Build the assignment history view**

Replace:

```jsx
function PortalHistoryTab({student}){
  return <div style={{...CARD, padding:24}}>Assignment History — coming in Task 8</div>;
}
```

with:

```jsx
function PortalHistoryTab({student}){
  const assignments = (student.assignments||[]).filter(a=>!a.deleted);

  if(assignments.length===0){
    return (
      <div style={{...CARD, padding:"60px 40px", textAlign:"center"}}>
        <div style={{fontFamily:"'Fraunces',Georgia,serif",fontStyle:"italic",fontSize:22,color:"#66708A",letterSpacing:-.2,marginBottom:10}}>
          No assignments yet.
        </div>
        <div style={{fontSize:13,color:"#66708A",lineHeight:1.55}}>
          Your tutor will start assigning practice here.
        </div>
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {assignments.slice().reverse().map(asg=>{
        const worksheets = (asg.worksheets||[]).filter(w=>!w.deleted);
        const welledDomain = (asg.welledDomain||[]).filter(w=>!w.deleted);
        const practiceExams = (asg.practiceExams||[]).filter(e=>!e.deleted);
        return (
          <div key={asg.id} style={{...CARD, padding:20}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,paddingBottom:12,borderBottom:"1px solid rgba(15,26,46,.08)",gap:12,flexWrap:"wrap"}}>
              <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:18,color:"#0F1A2E",fontWeight:600,letterSpacing:-.2}}>
                {asg.date || asg.dateAssigned || "Undated session"}
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {worksheets.length>0 && <span style={{...mkPill("transparent","#003258"),border:"1px solid rgba(0,50,88,.28)"}}>{worksheets.length} Worksheet{worksheets.length===1?"":"s"}</span>}
                {welledDomain.length>0 && <span style={{...mkPill("transparent","#4C7A4C"),border:"1px solid rgba(76,122,76,.35)"}}>{welledDomain.length} WellEd</span>}
                {practiceExams.length>0 && <span style={{...mkPill("transparent","#6E3F12"),border:"1px solid rgba(154,91,31,.35)"}}>{practiceExams.length} Exam{practiceExams.length===1?"":"s"}</span>}
              </div>
            </div>

            {worksheets.length>0 && (
              <div style={{marginBottom:welledDomain.length||practiceExams.length?14:0}}>
                {worksheets.map(w=>(
                  <div key={w.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid rgba(15,26,46,.06)",gap:12}}>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:14,color:"#0F1A2E"}}>
                        {w.title || `${w.domain||""} — ${w.difficulty||""}`}
                      </div>
                      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#66708A",marginTop:2}}>
                        {w.subject||""} {w.domain?`· ${w.domain}`:""} {w.difficulty?`· ${w.difficulty}`:""}
                      </div>
                    </div>
                    {w.url ? (
                      <a href={w.url} target="_blank" rel="noopener noreferrer" style={{
                        fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#9A5B1F",
                        textDecoration:"none",border:"1px solid rgba(154,91,31,.4)",padding:"4px 10px",
                        borderRadius:3,textTransform:"uppercase",letterSpacing:1
                      }}>Open PDF →</a>
                    ) : (
                      <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#66708A",letterSpacing:1,textTransform:"uppercase"}}>No PDF</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {welledDomain.length>0 && (
              <div style={{marginBottom:practiceExams.length?14:0}}>
                {welledDomain.map(w=>(
                  <div key={w.id} style={{padding:"6px 0",fontFamily:"'Fraunces',Georgia,serif",fontSize:13,color:"#0F1A2E"}}>
                    WellEd · {w.domain} · <span style={{color:"#66708A",fontStyle:"italic"}}>{w.difficulty}</span>
                  </div>
                ))}
              </div>
            )}

            {practiceExams.length>0 && (
              <div>
                {practiceExams.map(e=>(
                  <div key={e.id} style={{padding:"6px 0",fontFamily:"'Fraunces',Georgia,serif",fontSize:13,color:"#0F1A2E"}}>
                    Practice Exam · <span style={{color:"#66708A",fontStyle:"italic"}}>{e.type||"full"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Build and manual-verify**

`?dev=1&role=student&studentId=rnbw56f5` → Assignment History tab shows Sample student's 4 worksheets with Open PDF buttons pointing at their OneDrive URLs. Click one — it should open in a new tab.

- [ ] **Step 3: Commit**

```bash
git add app.jsx
git commit -m "portal: assignment history tab (read-only)"
```

---

## Task 9: **CHECKPOINT B** — Kiran reviews the two data tabs

**Files:** none

- [ ] **Step 1: STOP and report status**

Do not proceed to the chart (Task 10) without Kiran's approval. This is the natural review gate — Kiran plays with the data tabs using one or more real studentIds, confirms the empty-state copy reads naturally, confirms the Open PDF links work, and confirms no PII leaks from adjacent students (e.g. nothing in the student's view should reference any other student).

Wait for approval.

---

## Task 10: `ScoreTrendsChart` — hand-rolled inline SVG

**Files:** `app.jsx` — add chart component + replace `PortalTrendsTab`

- [ ] **Step 1: Confirm the chart library decision is still hand-rolled SVG**

If Kiran changes his mind at Checkpoint B, revisit before writing code. Otherwise proceed.

- [ ] **Step 2: Extract a tested helper for the chart's data shape**

Add to `app.jsx` near `pickPortalStudentId`:

```javascript
// Build the x-ordered points the Score Trends chart plots. A full practice
// score is any score whose category matches the fullPts regex used in
// ScoreHistoryPanel. We return {date, score, label} sorted ascending.
// A date-less point is dropped (can't be plotted).
function buildScoreTrendsSeries(student){
  const pts = allScoreDataPoints(student);
  const isFull = (cat)=> /Total SAT|R&W Section|Math Section|Full —|Section —|Practice|Official SAT|Full Practice|BlueBook|WellEd Full/i.test(cat||"");
  return pts
    .filter(pt => isFull(pt.category) && pt.level!=="domain" && pt.level!=="sub")
    .filter(pt => pt.date && typeof pt.score==="number" && !Number.isNaN(pt.score))
    .map(pt => ({date: pt.date, score: pt.score, label: pt.category||"Exam"}))
    .sort((a,b)=> a.date.localeCompare(b.date));
}
```

Add to `tests/portal.test.mjs`:

```javascript
function buildScoreTrendsSeries(student){
  const isFull = (cat)=> /Total SAT|R&W Section|Math Section|Full —|Section —|Practice|Official SAT|Full Practice|BlueBook|WellEd Full/i.test(cat||"");
  // For the test, operate directly on a synthetic pts array shaped like
  // allScoreDataPoints output. App.jsx's real version calls allScoreDataPoints.
  return (student.__pts || [])
    .filter(pt => isFull(pt.category) && pt.level!=="domain" && pt.level!=="sub")
    .filter(pt => pt.date && typeof pt.score==="number" && !Number.isNaN(pt.score))
    .map(pt => ({date: pt.date, score: pt.score, label: pt.category||"Exam"}))
    .sort((a,b)=> a.date.localeCompare(b.date));
}

test('buildScoreTrendsSeries: filters non-full points', () => {
  const out = buildScoreTrendsSeries({__pts:[
    {date:"2026-01-01", score:1200, category:"Total SAT Practice"},
    {date:"2026-01-02", score:80,   category:"Information & Ideas", level:"domain"},
    {date:"2026-01-03", score:70,   category:"Inference", level:"sub"},
  ]});
  assert.equal(out.length, 1);
  assert.equal(out[0].score, 1200);
});

test('buildScoreTrendsSeries: drops dateless/NaN points', () => {
  const out = buildScoreTrendsSeries({__pts:[
    {date:"",           score:1200, category:"Total SAT Practice"},
    {date:"2026-02-01", score:NaN,  category:"Total SAT Practice"},
    {date:"2026-03-01", score:1250, category:"Total SAT Practice"},
  ]});
  assert.equal(out.length, 1);
  assert.equal(out[0].date, "2026-03-01");
});

test('buildScoreTrendsSeries: sorts ascending by date', () => {
  const out = buildScoreTrendsSeries({__pts:[
    {date:"2026-03-01", score:1300, category:"Total SAT Practice"},
    {date:"2026-01-01", score:1200, category:"Total SAT Practice"},
    {date:"2026-02-01", score:1250, category:"Total SAT Practice"},
  ]});
  assert.deepEqual(out.map(p=>p.date), ["2026-01-01","2026-02-01","2026-03-01"]);
});
```

Run: `node --test tests/portal.test.mjs`
Expected: 8 passing tests (5 previous + 3 new).

- [ ] **Step 3: Add the `ScoreTrendsChart` SVG component**

Insert into `app.jsx` near `PortalTrendsTab`:

```jsx
function ScoreTrendsChart({series}){
  // Render an inline SVG line chart.
  // Editorial tokens: navy line, sienna points, plex mono axis labels.
  const W = 640, H = 280;
  const PAD = {top:20, right:24, bottom:48, left:56};
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  if(!series || series.length===0){
    return (
      <div style={{...CARD, padding:"60px 40px", textAlign:"center"}}>
        <div style={{fontFamily:"'Fraunces',Georgia,serif",fontStyle:"italic",fontSize:22,color:"#66708A",letterSpacing:-.2,marginBottom:10}}>
          Not enough data to draw a trend yet.
        </div>
        <div style={{fontSize:13,color:"#66708A",lineHeight:1.55}}>
          Your practice test scores will plot here once you have at least one on file.
        </div>
      </div>
    );
  }

  // Domain: dates (ordinal), scores (0..1600 for full SAT, otherwise auto).
  const scores = series.map(p=>p.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  // Pad the y-axis 5% on each side; clamp to sane SAT bounds when appropriate.
  const yLo = Math.max(0, Math.floor((minScore - (maxScore-minScore||40)*0.1)/10)*10);
  const yHi = Math.ceil((maxScore + (maxScore-minScore||40)*0.1)/10)*10;
  const yRange = Math.max(1, yHi - yLo);

  const x = (i)=> series.length===1
    ? PAD.left + innerW/2
    : PAD.left + (i/(series.length-1)) * innerW;
  const y = (v)=> PAD.top + innerH - ((v - yLo)/yRange) * innerH;

  const pathD = series.map((p,i)=> `${i===0?"M":"L"} ${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(" ");

  // Y-axis ticks — 4 gridlines evenly spaced
  const ticks = [0,1,2,3,4].map(k => yLo + (yRange*k/4));

  return (
    <div style={{...CARD, padding:"24px 20px"}}>
      <SectionHeading>Practice test scores over time</SectionHeading>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block",fontFamily:"'IBM Plex Mono',monospace"}} role="img" aria-label="Score trend chart">
        {/* Y gridlines + labels */}
        {ticks.map((t,i)=>(
          <g key={i}>
            <line
              x1={PAD.left} x2={W-PAD.right}
              y1={y(t)} y2={y(t)}
              stroke="rgba(15,26,46,.08)" strokeWidth="1"/>
            <text
              x={PAD.left-10} y={y(t)+4}
              textAnchor="end" fontSize="10" fill="#66708A">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {/* Line */}
        <path d={pathD} fill="none" stroke="#0F1A2E" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        {/* Points */}
        {series.map((p,i)=>(
          <g key={i}>
            <circle cx={x(i)} cy={y(p.score)} r="4.5" fill="#9A5B1F" stroke="#FAF7F2" strokeWidth="2"/>
            <title>{p.date} · {p.label} · {p.score}</title>
          </g>
        ))}
        {/* X-axis date labels — thinned to avoid overlap if >6 points */}
        {series.map((p,i)=>{
          const stride = Math.max(1, Math.ceil(series.length/6));
          if(i % stride !== 0 && i !== series.length-1) return null;
          return (
            <text key={i} x={x(i)} y={H-PAD.bottom+18} textAnchor="middle" fontSize="10" fill="#66708A">
              {p.date}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
```

- [ ] **Step 4: Wire `PortalTrendsTab`**

Replace:

```jsx
function PortalTrendsTab({student}){
  return <div style={{...CARD, padding:24}}>Score Trends — coming in Task 10</div>;
}
```

with:

```jsx
function PortalTrendsTab({student}){
  const series = buildScoreTrendsSeries(student);
  return <ScoreTrendsChart series={series}/>;
}
```

- [ ] **Step 5: Build, run tests, manual-verify**

Run: `node --test tests/*.mjs` → 35+ passing.

Open `?dev=1&role=student&studentId=rnbw56f5` → Score Trends tab. Verify:
- Zero-data student → empty-state card.
- Single-point student → chart renders with the single point centered.
- Multi-point student → line + points, x-axis dates thinned sensibly.

- [ ] **Step 6: Commit**

```bash
git add app.jsx tests/portal.test.mjs
git commit -m "portal: score trends svg chart + tests"
```

---

## Task 11: **CHECKPOINT C** — Kiran reviews the chart

**Files:** none

- [ ] **Step 1: STOP and report status**

Wait for Kiran to review the chart against a real student's data. Common feedback points to anticipate:
- Y-axis scaling choice (auto-fit vs fixed 0–1600 for full SATs).
- Date label format (ISO vs month abbreviation).
- Line vs scatter (does the line mislead between sparse points?).

Do not begin responsive polish (Task 12) until Kiran signs off.

---

## Task 12: Responsive layout — 375px viewport target

**Files:**
- Modify: `build_index.py` — add a `@media (max-width: 768px)` block targeting `[data-portal="student"]`
- Possibly modify: `app.jsx` inline styles if any hardcoded widths break the breakpoint

- [ ] **Step 1: Add responsive CSS**

Find the existing `<style>` block in `build_index.py`. Append:

```css
@media (max-width: 768px) {
  [data-portal="student"] {
    padding: 20px 16px 60px !important;
  }
  [data-portal="student"] h1,
  [data-portal="student"] h2 {
    font-size: 28px !important;
  }
  [data-portal="student"] table {
    font-size: 11px !important;
  }
  [data-portal="student"] table th,
  [data-portal="student"] table td {
    padding: 8px 6px !important;
  }
}
@media (max-width: 480px) {
  [data-portal="student"] {
    padding: 16px 12px 48px !important;
  }
}
```

Rationale for `!important`: inline styles on the JSX would otherwise win over stylesheet rules. Scoped under `[data-portal="student"]` so no tutor-app selector is affected.

- [ ] **Step 2: Build and manual-verify at 375px**

In Chrome devtools, enable device emulation (iPhone SE, 375×667). Open `?dev=1&role=student&studentId=rnbw56f5` on each of the three tabs and confirm:
- No horizontal scroll.
- Assignment cards wrap pills to a second row instead of overflowing.
- The SVG chart auto-scales (it already uses `width:100%`).
- Sign Out button doesn't collide with the student name.

Fix any overflows with additional responsive rules or JSX adjustments.

- [ ] **Step 3: Verify tutor app is NOT affected**

Open `?dev=1` and confirm the tutor app looks identical (no stray `[data-portal="student"]` rules bleeding through because the selector is scoped).

- [ ] **Step 4: Commit**

```bash
git add build_index.py app.jsx
git commit -m "portal: responsive layout for <=768px and <=480px"
```

---

## Task 13: Session 3 closeout doc

**Files:**
- Create: `docs/PHASE_2_SESSION_3.md`

- [ ] **Step 1: Write the closeout**

Follow the same structure as `docs/PHASE_2_SESSION_2.md`:
1. **What shipped** — bullet list of the concrete changes (RoleRouter, StudentPortal, usePortalStudent, ScoreTrendsChart, responsive rules, tests). Include commit hashes.
2. **What did not ship** — parent child-switcher (Session 4), student answer entry (Session 5), real allowlist rollout (Session 7).
3. **Deviations from the Session 1 plan or this plan** — anything we did differently than spec'd. Include rationale.
4. **Open questions / risks** — chart UX decisions, any empty-state awkwardness, parent multi-child interface outline, anything Kiran flagged during Checkpoint B/C.
5. **Kickoff prompt for Session 4** — mirrors the one at the bottom of `PHASE_2_SESSION_2.md`. Points at parent child-switcher work.

- [ ] **Step 2: Commit**

```bash
git add docs/PHASE_2_SESSION_3.md
git commit -m "docs: Phase 2 Session 3 closeout"
```

---

## Self-review checklist (run this before executing Task 1)

- [x] **Spec coverage:** Every bullet in the Session 2 doc's §Kickoff prompt → "What's in scope for Session 3" is covered by a task above (RoleRouter = Task 5, StudentPortal skeleton = Task 4, Score Tracking = Task 7, Assignment History = Task 8, Score Trends = Task 10, wire into boot = Task 5, single-doc subscribe = Task 3, dev harness = Task 2).
- [x] **Open questions addressed:** Chart lib = hand-rolled SVG (declared upfront, gated at Task 10). `studentId` prop ≠ hardcoded (Task 4 + Task 5). Empty-state UX = explicit per tab (Tasks 7, 8, 10). Responsive = Task 12 targeting 375px.
- [x] **No placeholders:** Every code step shows real code or a real command. The one "TBD-ish" moment — "follow the same structure as Session 2 doc" in Task 13 — is deliberate because closeout content depends on what actually happens during execution.
- [x] **Type/name consistency:** `pickPortalStudentId`, `usePortalStudent`, `StudentPortal`, `PortalShell`, `PortalTrackingTab`, `PortalHistoryTab`, `PortalTrendsTab`, `ScoreTrendsChart`, `buildScoreTrendsSeries`, `SectionHeading`, `EmptyInline` — used consistently across all tasks.
- [x] **Constraints honored:** No bundler, no npm, no `AppInner` modification, no `USE_ALLOWLIST_AUTH` flip, no `DUAL_WRITE_GRACE` flip, no production operations.
- [x] **Checkpoints align with the kickoff prompt:** A (after Task 6, blank portal routing), B (after Task 9, data tabs), C (after Task 11, chart). Responsive polish comes after the chart, matching the kickoff's third checkpoint.
