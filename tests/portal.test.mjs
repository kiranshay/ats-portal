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

function pickLatestSubmission(docs){
  if(!Array.isArray(docs) || docs.length === 0) return null;
  const draft = docs.find(d => d && d.status === "draft");
  if(draft) return draft;
  const submitted = docs.filter(d => d && d.status === "submitted");
  if(submitted.length === 0) return null;
  const ms = (d) => {
    const t = d.submittedAt;
    if(!t) return 0;
    if(typeof t.toMillis === "function") return t.toMillis();
    if(typeof t === "string") return Date.parse(t) || 0;
    if(typeof t === "number") return t;
    return 0;
  };
  return submitted.slice().sort((a,b)=> ms(b) - ms(a))[0];
}

test('pickLatestSubmission: empty → null', () => {
  assert.equal(pickLatestSubmission([]), null);
});

test('pickLatestSubmission: null input → null', () => {
  assert.equal(pickLatestSubmission(null), null);
});

test('pickLatestSubmission: single draft → draft', () => {
  const d = {id:"a", status:"draft"};
  assert.equal(pickLatestSubmission([d]), d);
});

test('pickLatestSubmission: draft + submitted → draft wins', () => {
  const draft = {id:"a", status:"draft"};
  const sub = {id:"b", status:"submitted", submittedAt:"2026-04-10T00:00:00Z"};
  assert.equal(pickLatestSubmission([sub, draft]), draft);
});

test('pickLatestSubmission: two submitted → most recent', () => {
  const older = {id:"a", status:"submitted", submittedAt:"2026-01-01T00:00:00Z"};
  const newer = {id:"b", status:"submitted", submittedAt:"2026-04-01T00:00:00Z"};
  assert.equal(pickLatestSubmission([older, newer]).id, "b");
});

test('pickLatestSubmission: only submitted, missing submittedAt → first non-null', () => {
  const a = {id:"a", status:"submitted"};
  const out = pickLatestSubmission([a]);
  assert.equal(out.id, "a");
});

function canSubmitDraft(submission){
  if(!submission) return false;
  if(submission.status !== "draft") return false;
  const r = Array.isArray(submission.responses) ? submission.responses[0] : null;
  const text = (r && typeof r.studentAnswer === "string") ? r.studentAnswer.trim() : "";
  return text.length > 0;
}

test('canSubmitDraft: null → false', () => {
  assert.equal(canSubmitDraft(null), false);
});

test('canSubmitDraft: submitted status → false', () => {
  assert.equal(canSubmitDraft({status:"submitted", responses:[{questionIndex:0, studentAnswer:"x"}]}), false);
});

test('canSubmitDraft: draft with empty answer → false', () => {
  assert.equal(canSubmitDraft({status:"draft", responses:[{questionIndex:0, studentAnswer:"   "}]}), false);
});

test('canSubmitDraft: draft with missing responses → false', () => {
  assert.equal(canSubmitDraft({status:"draft"}), false);
});

test('canSubmitDraft: draft with content → true', () => {
  assert.equal(canSubmitDraft({status:"draft", responses:[{questionIndex:0, studentAnswer:"1. B\n2. C"}]}), true);
});

// FieldValue stub so the test file can run without firebase-admin.
const SERVER_TS = Symbol("server-ts");
const FIELD_VALUE_STUB = { serverTimestamp: () => SERVER_TS };

function makeDraftPayload({assignmentId, answersText, isCreate, FieldValue}){
  const base = {
    assignmentId,
    responses: [{questionIndex: 0, studentAnswer: answersText || ""}],
    status: "draft",
    updatedAt: FieldValue.serverTimestamp(),
  };
  if(isCreate){
    base.createdAt = FieldValue.serverTimestamp();
  }
  return base;
}

test('makeDraftPayload: create sets createdAt + updatedAt', () => {
  const p = makeDraftPayload({assignmentId:"asg1", answersText:"1. B", isCreate:true, FieldValue:FIELD_VALUE_STUB});
  assert.equal(p.assignmentId, "asg1");
  assert.equal(p.status, "draft");
  assert.equal(p.responses.length, 1);
  assert.equal(p.responses[0].questionIndex, 0);
  assert.equal(p.responses[0].studentAnswer, "1. B");
  assert.equal(p.createdAt, SERVER_TS);
  assert.equal(p.updatedAt, SERVER_TS);
});

test('makeDraftPayload: update has updatedAt but no createdAt', () => {
  const p = makeDraftPayload({assignmentId:"asg1", answersText:"x", isCreate:false, FieldValue:FIELD_VALUE_STUB});
  assert.equal(p.createdAt, undefined);
  assert.equal(p.updatedAt, SERVER_TS);
});

test('makeDraftPayload: empty answer still produces a response entry', () => {
  const p = makeDraftPayload({assignmentId:"asg1", answersText:"", isCreate:true, FieldValue:FIELD_VALUE_STUB});
  assert.equal(p.responses[0].studentAnswer, "");
});

test('makeDraftPayload: status is always "draft" (never submitted)', () => {
  const p = makeDraftPayload({assignmentId:"asg1", answersText:"anything", isCreate:false, FieldValue:FIELD_VALUE_STUB});
  assert.equal(p.status, "draft");
});

// ── Session 6: tutor submission review helpers ────────────────────────────

function groupSubmissionsByAssignment(submissions, assignments){
  const byId = new Map();
  const orderIdx = new Map();
  (assignments||[]).forEach((a, i) => {
    if(a && a.id) orderIdx.set(a.id, i);
  });
  (submissions||[]).forEach(s => {
    if(!s) return;
    const key = s.assignmentId || "__orphan__";
    if(!byId.has(key)) byId.set(key, []);
    byId.get(key).push(s);
  });
  const groups = [];
  byId.forEach((subs, key) => {
    const assignment = key === "__orphan__"
      ? null
      : (assignments||[]).find(a => a && a.id === key) || null;
    groups.push({assignment, assignmentId: key, submissions: subs});
  });
  groups.sort((a, b) => {
    const ai = orderIdx.has(a.assignmentId) ? orderIdx.get(a.assignmentId) : -1;
    const bi = orderIdx.has(b.assignmentId) ? orderIdx.get(b.assignmentId) : -1;
    if(ai === -1 && bi === -1) return 0;
    if(ai === -1) return 1;
    if(bi === -1) return -1;
    return bi - ai;
  });
  return groups;
}

test('groupSubmissionsByAssignment: empty input → empty array', () => {
  assert.deepEqual(groupSubmissionsByAssignment([], []), []);
  assert.deepEqual(groupSubmissionsByAssignment(null, null), []);
});

test('groupSubmissionsByAssignment: groups by assignmentId', () => {
  const asgs = [{id:"a1"},{id:"a2"}];
  const subs = [
    {id:"s1", assignmentId:"a1"},
    {id:"s2", assignmentId:"a2"},
    {id:"s3", assignmentId:"a1"},
  ];
  const g = groupSubmissionsByAssignment(subs, asgs);
  assert.equal(g.length, 2);
  const a1 = g.find(x => x.assignmentId === "a1");
  assert.equal(a1.submissions.length, 2);
  assert.equal(a1.assignment.id, "a1");
});

test('groupSubmissionsByAssignment: newest-assignment-first order', () => {
  const asgs = [{id:"a1"},{id:"a2"},{id:"a3"}];
  const subs = [
    {id:"s1", assignmentId:"a1"},
    {id:"s2", assignmentId:"a3"},
    {id:"s3", assignmentId:"a2"},
  ];
  const g = groupSubmissionsByAssignment(subs, asgs);
  assert.deepEqual(g.map(x=>x.assignmentId), ["a3","a2","a1"]);
});

test('groupSubmissionsByAssignment: orphan submissions go in a null-assignment bucket at the end', () => {
  const asgs = [{id:"a1"}];
  const subs = [
    {id:"s1", assignmentId:"a1"},
    {id:"s2", assignmentId:"gone"},
  ];
  const g = groupSubmissionsByAssignment(subs, asgs);
  assert.equal(g.length, 2);
  assert.equal(g[0].assignmentId, "a1");
  assert.equal(g[1].assignment, null);
  assert.equal(g[1].submissions[0].id, "s2");
});

test('groupSubmissionsByAssignment: submissions without assignmentId bucketed as orphans', () => {
  const g = groupSubmissionsByAssignment([{id:"s1"}], [{id:"a1"}]);
  assert.equal(g.length, 1);
  assert.equal(g[0].assignment, null);
});
