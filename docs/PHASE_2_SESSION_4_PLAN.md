# Phase 2 Session 4 Implementation Plan — Parent Portal + Child Switcher

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a parent with multiple linked children switch between them in the portal, with the selected child persisted across reloads. Single-child parents and students see no switcher.

**Architecture:** Introduce a thin `ParentPortal` wrapper that owns `selectedChildId` state, renders a `ChildSwitcher` segmented control, and hands one `studentId` to the existing Session 3 `StudentPortal`. `StudentPortal` gains one optional `switcherSlot` prop (render-only) so the control can sit inside the existing `PortalShell` header. `RoleRouter` chooses between the existing single-student render path and `ParentPortal` based on `role === "parent" && studentIds.length > 1`. Persistence lives in `localStorage`. Child display names are fetched with ≤N parallel one-shot `.get()` calls via a new `usePortalChildrenMeta` hook. No changes to rules, schema, or `DUAL_WRITE_GRACE`.

**Tech Stack:** React (pragma runtime, no bundler), Firestore compat SDK (`window.db.collection("students").doc(id).get()`), node:test for pure-helper coverage, inline style objects matching existing `PortalShell` conventions.

---

## File Structure

- **Modify:** [app.jsx](../app.jsx)
  - Add pure helper `pickParentSelectedChildId(entry, storedId)` near [app.jsx:576](../app.jsx#L576) (next to `pickPortalStudentId`).
  - Extend `DEV_FAKE_STUDENT_ID` parse at [app.jsx:551-556](../app.jsx#L551-L556) to accept a comma-separated list; extend `DEV_FAKE_ENTRY.studentIds` at [app.jsx:568](../app.jsx#L568).
  - Add hook `usePortalChildrenMeta(studentIds)` near `usePortalStudent` at [app.jsx:337](../app.jsx#L337).
  - Add optional `switcherSlot` prop to `StudentPortal` ([app.jsx:3473](../app.jsx#L3473)) — pass-through only, default undefined.
  - Add optional `switcherSlot` prop to `PortalShell` ([app.jsx:3543](../app.jsx#L3543)) — render below the `Grade` pill when present.
  - Add new components `ParentPortal` and `ChildSwitcher` immediately below `StudentPortal` (after the `PortalShell` function definition, before `PortalTrackingTab`).
  - Modify `RoleRouter` ([app.jsx:599-606](../app.jsx#L599-L606)) to branch on parent-multi-child.
- **Modify:** [tests/portal.test.mjs](../tests/portal.test.mjs)
  - Add `pickParentSelectedChildId` pure copy + 7 test cases. Keep existing `pickPortalStudentId` tests intact.
- **Create:** [docs/PHASE_2_SESSION_4.md](PHASE_2_SESSION_4.md) at session closeout.

No other files change. No rules changes. No CSS additions required for baseline; optional responsive polish deferred unless the switcher visibly breaks at ≤480px.

---

## Task 1: Pure helper `pickParentSelectedChildId` + tests (TDD)

**Files:**
- Modify: [tests/portal.test.mjs](../tests/portal.test.mjs)
- Modify: [app.jsx](../app.jsx) near line 580

**Contract:** `pickParentSelectedChildId(entry, storedId) -> string`
- `entry` null/undefined → `""`
- `entry.studentIds` missing or not an array → `""`
- `studentIds.length === 0` → `""`
- `studentIds.length === 1` → `studentIds[0]` (storedId ignored)
- `studentIds.length > 1` and `storedId` is in `studentIds` → `storedId`
- `studentIds.length > 1` and `storedId` is missing/empty → `studentIds[0]`
- `studentIds.length > 1` and `storedId` is not in `studentIds` (stale) → `studentIds[0]`

- [ ] **Step 1: Write failing tests**

Append to [tests/portal.test.mjs](../tests/portal.test.mjs) after the existing `pickPortalStudentId` block (keep old tests unchanged):

```js
function pickParentSelectedChildId(entry, storedId){
  if(!entry) return "";
  const ids = Array.isArray(entry.studentIds) ? entry.studentIds : [];
  if(ids.length === 0) return "";
  if(ids.length === 1) return ids[0];
  if(storedId && ids.includes(storedId)) return storedId;
  return ids[0];
}

test('pickParentSelectedChildId: null entry → empty', () => {
  assert.equal(pickParentSelectedChildId(null, "anything"), "");
});

test('pickParentSelectedChildId: missing studentIds → empty', () => {
  assert.equal(pickParentSelectedChildId({role:"parent"}, "x"), "");
});

test('pickParentSelectedChildId: empty studentIds → empty', () => {
  assert.equal(pickParentSelectedChildId({role:"parent", studentIds:[]}, "x"), "");
});

test('pickParentSelectedChildId: single child → that id regardless of stored', () => {
  assert.equal(
    pickParentSelectedChildId({role:"parent", studentIds:["only1"]}, "ignored"),
    "only1"
  );
});

test('pickParentSelectedChildId: multi + stored matches → stored', () => {
  assert.equal(
    pickParentSelectedChildId({role:"parent", studentIds:["kid1","kid2","kid3"]}, "kid2"),
    "kid2"
  );
});

test('pickParentSelectedChildId: multi + no stored → first', () => {
  assert.equal(
    pickParentSelectedChildId({role:"parent", studentIds:["kid1","kid2"]}, ""),
    "kid1"
  );
});

test('pickParentSelectedChildId: multi + stale stored → first (fallback)', () => {
  assert.equal(
    pickParentSelectedChildId({role:"parent", studentIds:["kid1","kid2"]}, "removedKid"),
    "kid1"
  );
});
```

- [ ] **Step 2: Run tests, verify 7 new ones fail**

Run: `node --test tests/portal.test.mjs`
Expected: 7 new failures (ReferenceError or behavior mismatch if the helper-copy was defined but the assertions fail). Actually: because the helper is defined inline in the test file, the tests will **pass immediately** — TDD for pure helpers copied into tests is degenerate. Instead:

**Adjusted approach:** write the tests against a helper that is NOT yet defined; define the inline copy in the SAME commit as the app.jsx addition. Skip the "verify it fails" step for this one helper since the test-file pattern in this repo is "inline copy of the pure helper." Proceed to Step 3.

- [ ] **Step 3: Add helper to app.jsx**

In [app.jsx](../app.jsx), insert immediately after the existing `pickPortalStudentId` function (after line 580):

```js
// Parent multi-child picker. Given the parent's allowlist entry and the
// id they last viewed (from localStorage), return the id to render now.
// Falls back to studentIds[0] when the stored id is stale or missing.
// Returns "" when there are no linked children — the caller should render
// the empty state. Kept pure for unit testing.
function pickParentSelectedChildId(entry, storedId){
  if(!entry) return "";
  const ids = Array.isArray(entry.studentIds) ? entry.studentIds : [];
  if(ids.length === 0) return "";
  if(ids.length === 1) return ids[0];
  if(storedId && ids.includes(storedId)) return storedId;
  return ids[0];
}
```

- [ ] **Step 4: Run full test suite**

Run: `node --test tests/*.mjs`
Expected: previous count + 7 new tests pass. Full suite green.

- [ ] **Step 5: Commit**

```bash
git add app.jsx tests/portal.test.mjs
git commit -m "add pickParentSelectedChildId helper + tests"
git push
```

---

## Task 2: Extend `DEV_BYPASS` studentId to accept comma-separated list

**Files:**
- Modify: [app.jsx:551-568](../app.jsx#L551-L568)

**Rationale:** `?dev=1&role=parent&studentId=id1,id2,id3` must produce `DEV_FAKE_ENTRY.studentIds = ["id1","id2","id3"]` so multi-child can be exercised locally without touching production allowlist. Single-id form `?studentId=id1` must still work (backwards compatible).

- [ ] **Step 1: Replace the `DEV_FAKE_STUDENT_ID` block**

Old (lines ~548-556):

```js
// Optional studentId override for portal dev bypass:
//   ?dev=1&role=student&studentId=rnbw56f5
// When absent and role is student/parent, the portal renders an empty state.
const DEV_FAKE_STUDENT_ID = (()=>{
  if(!DEV_BYPASS) return "";
  try{
    return new URLSearchParams(location.search).get("studentId") || "";
  }catch{ return ""; }
})();
```

New:

```js
// Optional studentId override for portal dev bypass. Accepts a single id or
// a comma-separated list so parent multi-child can be tested locally:
//   ?dev=1&role=student&studentId=rnbw56f5
//   ?dev=1&role=parent&studentId=id1,id2,id3
// When absent and role is student/parent, the portal renders an empty state.
const DEV_FAKE_STUDENT_IDS = (()=>{
  if(!DEV_BYPASS) return [];
  try{
    const raw = new URLSearchParams(location.search).get("studentId") || "";
    return raw.split(",").map(s=>s.trim()).filter(Boolean);
  }catch{ return []; }
})();
```

- [ ] **Step 2: Update `DEV_FAKE_ENTRY.studentIds`**

Old (inside `DEV_FAKE_ENTRY`):

```js
  studentIds: DEV_FAKE_STUDENT_ID ? [DEV_FAKE_STUDENT_ID] : [],
```

New:

```js
  studentIds: DEV_FAKE_STUDENT_IDS,
```

- [ ] **Step 3: Grep for stale references**

Run (via Grep tool): pattern `DEV_FAKE_STUDENT_ID\b` in `app.jsx`.
Expected: zero matches. If any remain, update them.

- [ ] **Step 4: Manual smoke test**

Start a local server and load each URL in Chrome, inspect `DEV_FAKE_ENTRY` in the console via a temporary `console.log` or React DevTools:

1. `http://localhost:<port>/?dev=1&role=student&studentId=rnbw56f5` → `studentIds === ["rnbw56f5"]` (single-id backwards compat).
2. `http://localhost:<port>/?dev=1&role=parent&studentId=rnbw56f5,abc123` → `studentIds === ["rnbw56f5","abc123"]`.
3. `http://localhost:<port>/?dev=1&role=parent` → `studentIds === []` → empty state.

Remove any temporary `console.log` before committing.

- [ ] **Step 5: Commit**

```bash
git add app.jsx
git commit -m "dev bypass: accept comma-separated studentId list for multi-child"
git push
```

---

## Task 3: Add `usePortalChildrenMeta(studentIds)` hook

**Files:**
- Modify: [app.jsx](../app.jsx) — insert after `usePortalStudent` ends (around line 367)

**Contract:** Given an array of student ids, issue one `.get()` per id in parallel, return `{status, children}` where `children` is `[{id, name, grade}, ...]` in the same order as input. `status` values: `"idle"` (empty input), `"loading"`, `"ready"`, `"error"`. On any individual fetch failure, that child's entry falls back to `{id, name: "", grade: ""}` — the whole hook still resolves `"ready"`. This is display-only metadata; the main `usePortalStudent` subscription is still the source of truth for the selected child's data.

**Why one-shot, not `onSnapshot`:** switcher labels don't need to live-update. Parent names change rarely, and `usePortalStudent` handles the live view of whichever child is currently selected.

- [ ] **Step 1: Add the hook**

Insert after the closing `}` of `usePortalStudent` (after line ~367 in [app.jsx](../app.jsx#L367)):

```js
// Fetches display metadata ({id, name, grade}) for a small list of children
// in parallel. One-shot .get() per id — labels don't need live updates, and
// the selected child's full live view still goes through usePortalStudent.
// Failures per-child fall back to blank name so the switcher is still usable.
function usePortalChildrenMeta(studentIds){
  const key = (studentIds || []).join(",");
  const [state, setState] = useState({status: studentIds && studentIds.length ? "loading" : "idle", children: []});
  useEffect(()=>{
    if(!studentIds || studentIds.length === 0){
      setState({status:"idle", children:[]});
      return;
    }
    if(!window.db){
      setState({status:"error", children: studentIds.map(id=>({id, name:"", grade:""}))});
      return;
    }
    let cancelled = false;
    setState({status:"loading", children:[]});
    Promise.all(studentIds.map(id =>
      window.db.collection("students").doc(id).get()
        .then(snap => snap.exists
          ? {id, name: snap.data()?.name || "", grade: snap.data()?.grade || ""}
          : {id, name:"", grade:""}
        )
        .catch(err => {
          console.warn("[portal] child meta fetch error:", id, err);
          return {id, name:"", grade:""};
        })
    )).then(children => {
      if(!cancelled) setState({status:"ready", children});
    });
    return ()=>{ cancelled = true; };
  // key captures array identity — avoids re-running when the same ids re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
```

- [ ] **Step 2: Verify syntax**

Run: `node --check app.jsx` if the repo supports it; otherwise load the page with `?dev=1&role=tutor` and confirm the tutor flow still renders (no JS parse error). Check the browser console for errors.

Expected: tutor flow identical to Session 3; no new console errors.

- [ ] **Step 3: Commit**

```bash
git add app.jsx
git commit -m "add usePortalChildrenMeta hook for switcher labels"
git push
```

---

## Task 4: Add optional `switcherSlot` prop to `StudentPortal` and `PortalShell`

**Files:**
- Modify: [app.jsx:3473](../app.jsx#L3473) — `StudentPortal`
- Modify: [app.jsx:3543](../app.jsx#L3543) — `PortalShell`

**Rationale:** The constraint says "do NOT modify `StudentPortal` beyond what the switcher requires." Adding one optional prop that defaults to no-op is the minimal change. When `switcherSlot` is undefined, rendering is byte-for-byte identical to Session 3.

- [ ] **Step 1: Add `switcherSlot` pass-through in `StudentPortal`**

In the `StudentPortal` function signature, change:

```js
function StudentPortal({studentId, onSignOut, currentUserEntry}){
```

to:

```js
function StudentPortal({studentId, onSignOut, currentUserEntry, switcherSlot}){
```

In each of the three `PortalShell` render sites inside `StudentPortal` (error, not-found, main — lines ~3487, ~3499, ~3513), append `switcherSlot={switcherSlot}` to the props. For example the main render:

```jsx
<PortalShell studentName={student.name} studentGrade={student.grade} onSignOut={onSignOut} currentUserEntry={currentUserEntry} switcherSlot={switcherSlot}>
```

Apply the same addition to the error and not-found `PortalShell` call sites.

- [ ] **Step 2: Add `switcherSlot` rendering in `PortalShell`**

Change signature:

```js
function PortalShell({studentName, studentGrade, onSignOut, children}){
```

to:

```js
function PortalShell({studentName, studentGrade, onSignOut, switcherSlot, children}){
```

Inside the header `<div>` that holds the student name + grade pill (the one currently ending after the `Grade {studentGrade}` pill block), render the switcher immediately below the grade pill:

```jsx
{studentGrade && (
  <div style={{marginTop:8}}>
    <span style={{...mkPill("transparent","#003258"),border:"1px solid rgba(0,50,88,.28)"}}>Grade {studentGrade}</span>
  </div>
)}
{switcherSlot && (
  <div style={{marginTop:14}}>
    {switcherSlot}
  </div>
)}
```

When `switcherSlot` is falsy the block is omitted entirely — zero visual change for single-child/student flows.

- [ ] **Step 3: Verify tutor and single-child portal flows unchanged**

Manual check:
1. `?dev=1&role=tutor` → tutor UI identical.
2. `?dev=1&role=student&studentId=<real id>` (after signing in for real first, per the Session 3 closeout note) → student portal identical to Session 3, no switcher rendered.

- [ ] **Step 4: Commit**

```bash
git add app.jsx
git commit -m "portal shell: optional switcherSlot prop (no-op when unset)"
git push
```

---

## Task 5: Add `ChildSwitcher` component (segmented control)

**Files:**
- Modify: [app.jsx](../app.jsx) — insert after `PortalShell` function definition, before `PortalTrackingTab`

**Design:** Horizontal segmented control. Each option is a button styled with the Fraunces display face to match the existing tab row. The active child uses the navy fill used by active tabs; inactive children use a light outline. Labels show `student.name` when known, fall back to `Child N` while meta is loading or when a fetch failed. Optional grade micro-text under the name when grade is present and the label isn't already too wide.

**Rationale for segmented control over dropdown:** Per Session 1's open-question note, most ATS parents have ≤3 children. A segmented control is one-tap, discoverable, and matches the tab aesthetic already in the shell. If a real parent ever has >4 children we revisit — not a Session 4 blocker.

- [ ] **Step 1: Add the component**

Insert immediately after the closing `}` of `PortalShell` (around line 3571):

```jsx
// Segmented control for the parent portal. Controlled component: the parent
// (ParentPortal) owns selectedId and passes it down along with onSelect.
// Labels prefer student.name, fall back to "Child N" while meta is loading.
function ChildSwitcher({children, selectedId, onSelect}){
  if(!children || children.length < 2) return null;
  return (
    <div role="tablist" aria-label="Choose a child" style={{
      display:"inline-flex", gap:6, padding:4,
      border:"1px solid rgba(15,26,46,.18)", borderRadius:10, background:"#fff",
      flexWrap:"wrap"
    }}>
      {children.map((c, i) => {
        const active = c.id === selectedId;
        const label = c.name || `Child ${i+1}`;
        return (
          <button
            key={c.id}
            role="tab"
            aria-selected={active}
            onClick={()=>onSelect(c.id)}
            style={{
              border:"none", cursor:"pointer", padding:"8px 14px", borderRadius:7,
              background: active ? "#0F1A2E" : "transparent",
              color: active ? "#fff" : "#0F1A2E",
              fontFamily:"'Fraunces',Georgia,serif", fontVariationSettings:'"opsz" 48',
              fontSize:13, fontWeight: active ? 600 : 500, letterSpacing:-.1,
              display:"flex", alignItems:"center", gap:8,
            }}
          >
            <span>{label}</span>
            {c.grade && (
              <span style={{
                fontFamily:"'IBM Plex Mono',monospace", fontSize:9, letterSpacing:.8,
                textTransform:"uppercase",
                color: active ? "rgba(255,255,255,.65)" : "#66708A",
              }}>
                G{c.grade}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit (component exists but not yet wired)**

```bash
git add app.jsx
git commit -m "add ChildSwitcher segmented control component"
git push
```

---

## Task 6: Add `ParentPortal` wrapper with localStorage persistence

**Files:**
- Modify: [app.jsx](../app.jsx) — insert after `ChildSwitcher`, before `PortalTrackingTab`

**Behavior:**
1. Reads `localStorage["psm-portal-selected-child"]` once on mount.
2. Computes initial `selectedId` via `pickParentSelectedChildId(currentUserEntry, stored)`.
3. Fetches child meta via `usePortalChildrenMeta(studentIds)`.
4. Renders `<StudentPortal studentId={selectedId} switcherSlot={<ChildSwitcher .../>} ... />`.
5. On `onSelect(id)` from the switcher: updates state AND writes `localStorage["psm-portal-selected-child"] = id`.
6. If `studentIds` changes and the current `selectedId` is no longer in it, recompute via `pickParentSelectedChildId` — handles the "allowlist entry updated mid-session" edge.

**localStorage safety:** wrap read/write in try/catch. Private-mode Safari and some iOS contexts throw on localStorage access.

- [ ] **Step 1: Add the component**

Insert immediately after `ChildSwitcher`:

```jsx
// Parent multi-child wrapper. Owns the selected-child state, persists it in
// localStorage, pre-fetches sibling labels, and hands one studentId to the
// existing StudentPortal. Only used when role === "parent" and the allowlist
// entry has ≥2 studentIds — single-child parents bypass this and render
// StudentPortal directly from RoleRouter.
const PORTAL_SELECTED_CHILD_KEY = "psm-portal-selected-child";

function readStoredChildId(){
  try{ return localStorage.getItem(PORTAL_SELECTED_CHILD_KEY) || ""; }
  catch{ return ""; }
}
function writeStoredChildId(id){
  try{ localStorage.setItem(PORTAL_SELECTED_CHILD_KEY, id || ""); }
  catch{ /* private mode — ignore */ }
}

function ParentPortal({onSignOut, currentUserEntry}){
  const studentIds = Array.isArray(currentUserEntry?.studentIds) ? currentUserEntry.studentIds : [];
  const idsKey = studentIds.join(",");

  const [selectedId, setSelectedId] = useState(()=>
    pickParentSelectedChildId(currentUserEntry, readStoredChildId())
  );

  // Re-validate selection when the linked ids change (e.g. allowlist updated).
  useEffect(()=>{
    const next = pickParentSelectedChildId(currentUserEntry, selectedId || readStoredChildId());
    if(next !== selectedId) setSelectedId(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const meta = usePortalChildrenMeta(studentIds);

  const handleSelect = (id)=>{
    setSelectedId(id);
    writeStoredChildId(id);
  };

  const switcher = (
    <ChildSwitcher
      children={meta.children.length ? meta.children : studentIds.map(id=>({id, name:"", grade:""}))}
      selectedId={selectedId}
      onSelect={handleSelect}
    />
  );

  return (
    <StudentPortal
      studentId={selectedId}
      onSignOut={onSignOut}
      currentUserEntry={currentUserEntry}
      switcherSlot={switcher}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app.jsx
git commit -m "add ParentPortal wrapper with localStorage-persisted selection"
git push
```

---

## Task 7: Wire `RoleRouter` to route parent-multi-child → `ParentPortal`

**Files:**
- Modify: [app.jsx:599-606](../app.jsx#L599-L606)

**Behavior:**
- `role === "parent"` and `studentIds.length > 1` → `<ParentPortal/>`
- `role === "student" || role === "parent"` (single-child or zero) → existing single-student path (unchanged)
- Anything else → `<AppInner/>` (unchanged)

- [ ] **Step 1: Replace `RoleRouter`**

Old:

```js
function RoleRouter({authUser, onSignOut, currentUserEntry}){
  const role = currentUserEntry?.role || null;
  if(role === "student" || role === "parent"){
    const studentId = pickPortalStudentId(currentUserEntry);
    return <StudentPortal studentId={studentId} onSignOut={onSignOut} currentUserEntry={currentUserEntry}/>;
  }
  return <AppInner authUser={authUser} onSignOut={onSignOut} currentUserEntry={currentUserEntry}/>;
}
```

New:

```js
function RoleRouter({authUser, onSignOut, currentUserEntry}){
  const role = currentUserEntry?.role || null;
  if(role === "parent"){
    const ids = Array.isArray(currentUserEntry?.studentIds) ? currentUserEntry.studentIds : [];
    if(ids.length > 1){
      return <ParentPortal onSignOut={onSignOut} currentUserEntry={currentUserEntry}/>;
    }
    // Single-child (or zero) parent: fall through to the same single-student
    // path students use. Zero children renders the empty state inside StudentPortal.
  }
  if(role === "student" || role === "parent"){
    const studentId = pickPortalStudentId(currentUserEntry);
    return <StudentPortal studentId={studentId} onSignOut={onSignOut} currentUserEntry={currentUserEntry}/>;
  }
  return <AppInner authUser={authUser} onSignOut={onSignOut} currentUserEntry={currentUserEntry}/>;
}
```

- [ ] **Step 2: Checkpoint A manual verification (kickoff checkpoint 1)**

This is the **first pause point** from the kickoff prompt. Before committing, verify:

1. Start the local server (whatever dev script is in `README.md` / package-less static server).
2. Sign in for real via `http://localhost:<port>/` with Google (required so Firestore rules pass — see the Session 3 dev-bypass note).
3. Navigate to: `http://localhost:<port>/?dev=1&role=parent&studentId=<realId1>,<realId2>` using two real student ids from production (Kiran picks two of his own).
4. Confirm:
   - The switcher renders in the header with both children's names (or `Child 1` / `Child 2` very briefly while `usePortalChildrenMeta` resolves).
   - Clicking the non-selected child swaps the portal body (header name, grade, all three tabs) to the other student.
   - Each click causes `usePortalStudent` to re-subscribe (check Network tab for a new snapshot listener, or sprinkle a temporary `console.log` in `usePortalStudent` if needed — remove before commit).
5. Also sanity-check:
   - `?dev=1&role=parent&studentId=<realId1>` (single child) → no switcher visible.
   - `?dev=1&role=parent` (zero children) → existing "no student record linked" empty state.
   - `?dev=1&role=student&studentId=<realId1>` → identical to Session 3, no switcher.
   - `?dev=1&role=tutor` → tutor app identical to Session 3.

- [ ] **Step 3: Commit and STOP — await Kiran's review**

```bash
git add app.jsx
git commit -m "route parent multi-child to ParentPortal"
git push
```

**Stop here. Report status to Kiran. Do not start Task 8 until Kiran confirms Checkpoint A looks good.**

---

## Task 8: Checkpoint B — localStorage persistence verification

**Files:** none (manual verification only)

This is the **second pause point** from the kickoff prompt. All persistence code already landed in Task 6; this task exists as an explicit verification gate.

- [ ] **Step 1: Verify persistence across reloads**

1. Load `?dev=1&role=parent&studentId=id1,id2`. Click child 2.
2. Open DevTools → Application → Local Storage → `localhost:<port>` and confirm `psm-portal-selected-child === "id2"`.
3. Hard reload. Confirm child 2 is still selected (switcher highlights child 2, StudentPortal body shows child 2).
4. Click child 1. Hard reload. Confirm child 1 persists.

- [ ] **Step 2: Verify stale-id fallback**

1. With `psm-portal-selected-child === "id2"` in localStorage, load `?dev=1&role=parent&studentId=id1,id3` (note: `id2` is NOT in the list).
2. Expected: switcher selects `id1` (first), StudentPortal renders `id1`'s data, no crash. `localStorage` may still hold `id2` (only overwritten on explicit click) — this is fine; the next click will update it. If you prefer to self-heal on load, add a single `writeStoredChildId(next)` inside the `useEffect` in `ParentPortal` that recomputes the selection. **Decision: do self-heal on load** — saves a confused parent from seeing the same fallback forever. Update `ParentPortal`'s effect:

```jsx
useEffect(()=>{
  const next = pickParentSelectedChildId(currentUserEntry, selectedId || readStoredChildId());
  if(next !== selectedId){
    setSelectedId(next);
    writeStoredChildId(next);
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [idsKey]);
```

- [ ] **Step 3: Verify single-child and zero-child cases one more time**

1. `?dev=1&role=parent&studentId=id1` → no switcher, no writes to localStorage from this session (the single-child return-path in `pickParentSelectedChildId` means `ParentPortal` is never mounted, since `RoleRouter` routes length=1 straight to `StudentPortal`).
2. `?dev=1&role=parent` → empty state.

- [ ] **Step 4: Commit the self-heal tweak (if the line changed)**

```bash
git add app.jsx
git commit -m "parent portal: self-heal stored child id on stale fallback"
git push
```

- [ ] **Step 5: STOP — await Kiran's review**

**Stop here. Report status to Kiran. Await approval to proceed to closeout.**

---

## Task 9: Session 4 closeout doc

**Files:**
- Create: [docs/PHASE_2_SESSION_4.md](PHASE_2_SESSION_4.md)

Follow the same structure as [docs/PHASE_2_SESSION_3.md](PHASE_2_SESSION_3.md):

- [ ] **Step 1: Write the closeout**

Sections:
1. **What shipped** — list commits, tasks completed.
2. **What did not ship** — e.g. no Firestore rule changes, no allowlist rollout, no real-time meta refresh.
3. **Deviations from plan** — anything that diverged from this doc during execution.
4. **Open questions / risks** — e.g. >4-child families not handled, private-mode localStorage silently no-ops, prefetch meta staleness.
5. **Checkpoint** — `[x]` all items from the kickoff's "in scope" list.
6. **Kickoff prompt for Session 5** (student answer entry) at the bottom, same pattern as Session 3's kickoff.

- [ ] **Step 2: Commit**

```bash
git add docs/PHASE_2_SESSION_4.md
git commit -m "docs: phase 2 session 4 closeout"
git push
```

---

## Self-review checklist (author)

**Spec coverage vs kickoff "in scope":**
1. ✅ `ParentPortal` / `ChildSwitcher` component — Tasks 5, 6.
2. ✅ State lives outside `StudentPortal` — Task 6 (in `ParentPortal`).
3. ✅ localStorage persistence with stale-id fallback — Task 6 + Task 8 self-heal.
4. ✅ `DEV_BYPASS` accepts comma-separated ids — Task 2.
5. ✅ Pure-logic helper test coverage — Task 1 (7 new cases).

**Kickoff open questions resolved:**
- Switcher form → segmented control (Task 5 rationale).
- Display name source → parallel `.get()` via `usePortalChildrenMeta` (Task 3); falls back to `Child N` while loading or on fetch failure.
- Grade in header → grade pill already lives in `PortalShell` for the currently selected child; switcher buttons show `G{grade}` micro-text per button when available — no change to the shell grade pill.

**Constraints honored:**
- `StudentPortal` gets one optional additive prop, no logic change.
- No `USE_ALLOWLIST_AUTH` or `DUAL_WRITE_GRACE` flips.
- No bundler, no `npm install`.
- Commit messages are short, user-voice, no Co-Authored-By (psm-generator exception).
- Comments explain only non-obvious *why* (pure-helper rationale, one-shot vs onSnapshot, private-mode localStorage).

**Pause points matched:**
- Task 7 → Checkpoint A (switcher renders + click routing).
- Task 8 → Checkpoint B (localStorage persistence + stale fallback).
- Task 9 → closeout only after both checkpoints approved.

**Placeholder scan:** no TBDs, no "add appropriate X", every code step has actual code.

**Type consistency:** `pickParentSelectedChildId(entry, storedId)`, `usePortalChildrenMeta(studentIds)` returning `{status, children:[{id,name,grade}]}`, `ChildSwitcher({children, selectedId, onSelect})`, `ParentPortal({onSignOut, currentUserEntry})`, `StudentPortal`'s new `switcherSlot` prop, `PortalShell`'s new `switcherSlot` prop — all consistent across tasks.
