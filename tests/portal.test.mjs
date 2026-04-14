import test from 'node:test';
import assert from 'node:assert/strict';

// Pure helpers copied out of app.jsx for node --test. Keep in sync manually.
// Matches the pattern used by tests/diagnostic.test.mjs.

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

// Operates on a synthetic __pts array shaped like allScoreDataPoints output.
// The real buildScoreTrendsSeries in app.jsx calls allScoreDataPoints(student);
// here we inject __pts directly so we can unit-test the filter+sort logic.
function buildScoreTrendsSeries(student){
  const isFull = (cat)=> /Total SAT|R&W Section|Math Section|Full —|Section —|Practice|Official SAT|Full Practice|BlueBook|WellEd Full/i.test(cat||"");
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
