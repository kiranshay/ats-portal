// Tests for lib/diagnostic.mjs. Run with:
//   node --test tests/
// No dependencies — uses Node's built-in test runner (node:test) and assert.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  scaleRW, scaleMath,
  normTag, lookupTag,
  parseDiagnosticText,
  buildDiagnosticProfile,
} from "../lib/diagnostic.mjs";

// ─── normTag ────────────────────────────────────────────────────────────────
describe("normTag", () => {
  test("lowercases and strips non-alphanumeric", () => {
    assert.equal(normTag("Craft & Structure"), "craftstructure");
    assert.equal(normTag("Alg- Linear Eq. in 1 Variable"), "alglineareqin1variable");
  });
  test("strips the (2024) suffix ZipGrade sometimes appends", () => {
    assert.equal(normTag("Percentages (2024)"), "percentages");
  });
  test("empty string → empty", () => {
    assert.equal(normTag(""), "");
  });
});

// ─── scaleRW / scaleMath ────────────────────────────────────────────────────
describe("scaleRW / scaleMath", () => {
  test("raw=0 returns lowest score band", () => {
    assert.deepEqual(scaleRW(0), [200, 200]);
    assert.deepEqual(scaleMath(0), [200, 200]);
  });
  test("raw at the top of the table returns highest band", () => {
    // RW table has 67 entries (raw 0-66); top is [790,800].
    assert.deepEqual(scaleRW(66), [790, 800]);
    // Math table has 55 entries (raw 0-54); top is [790,800].
    assert.deepEqual(scaleMath(54), [790, 800]);
  });
  test("raw above max clamps to the top band", () => {
    assert.deepEqual(scaleRW(200), [790, 800]);
    assert.deepEqual(scaleMath(200), [790, 800]);
  });
  test("negative raw clamps to the bottom band", () => {
    assert.deepEqual(scaleRW(-5), [200, 200]);
    assert.deepEqual(scaleMath(-5), [200, 200]);
  });
  test("mid-table values return the documented band", () => {
    // Raw 30 on RW (index 30): see RW_TABLE in diagnostic.mjs.
    assert.deepEqual(scaleRW(30), [450, 470]);
    assert.deepEqual(scaleMath(30), [470, 500]);
  });
});

// ─── lookupTag ──────────────────────────────────────────────────────────────
describe("lookupTag", () => {
  test("exact match from the raw map", () => {
    const r = lookupTag("Craft & Structure");
    assert.equal(r.subject, "Reading & Writing");
    assert.equal(r.kind, "domain");
    assert.equal(r.name, "Craft & Structure");
  });
  test("alternate spelling variant maps to canonical form", () => {
    const r = lookupTag("Alg- Linear Eq. in 1 Variable");
    assert.equal(r.subject, "Math");
    assert.equal(r.kind, "sub");
    assert.equal(r.domain, "Algebra");
    assert.equal(r.name, "Linear Equations (1 Variable)");
  });
  test("keyword fallback when exact match missing", () => {
    // "nonlinear equations" keyword path — this exact string may or may not be
    // in the raw map; fallback regex catches it either way.
    const r = lookupTag("Advanced Math Nonlinear Equations Extra");
    assert.equal(r.subject, "Math");
    assert.equal(r.domain, "Advanced Math");
    assert.equal(r.name, "Nonlinear Equations");
  });
  test("domain keyword fallback — Geometry", () => {
    const r = lookupTag("Geometry stuff");
    assert.equal(r.subject, "Math");
    assert.equal(r.name, "Geometry & Trigonometry");
  });
  test("unrelated string returns null", () => {
    assert.equal(lookupTag("!SAT Something Entirely Unknown Xyzzy"), null);
  });
  test("(2024) suffix does not block lookup", () => {
    const r = lookupTag("Percentages (2024)");
    assert.equal(r.subject, "Math");
    assert.equal(r.name, "Percentages");
  });
});

// ─── parseDiagnosticText ────────────────────────────────────────────────────
describe("parseDiagnosticText", () => {
  test("detects Reading & Writing subject from header", () => {
    const txt = "Reading and Writing Diagnostic\nStudent Name: Foo\n\nEarned Points: 18\nPossible Points: 27\nPercent Correct: 66.7\n\nTAGGED QUESTIONS\n!SAT Cross-Text Connections 2 3 66.7\n!SAT Words in Context 4 5 80";
    const r = parseDiagnosticText(txt, "reading_diag.pdf");
    assert.equal(r.subject, "Reading & Writing");
    assert.equal(r.module, null);
    assert.equal(r.earned, 18);
    assert.equal(r.possible, 27);
    assert.equal(r.percentCorrect, 66.7);
    assert.equal(r.tags.length, 2);
  });

  test("detects Math subject + module number from header", () => {
    const txt = "Math Module 1 Diagnostic\nEarned Points: 14\nPossible Points: 22\nPercent Correct: 63.6\n\nTAGGED QUESTIONS\n!SAT Alg- Linear Functions 3 4 75";
    const r = parseDiagnosticText(txt, "math_m1.pdf");
    assert.equal(r.subject, "Math");
    assert.equal(r.module, 1);
    assert.equal(r.earned, 14);
    assert.equal(r.possible, 22);
  });

  test("detects Math Module 2 from alternate phrasing", () => {
    const txt = "Math Section 2\nEarned Points: 16\nPossible Points: 22\nPercent Correct: 72.7\n\nTAGGED QUESTIONS\n!SAT Geo- Circles 2 3 66";
    const r = parseDiagnosticText(txt, "m2.pdf");
    assert.equal(r.subject, "Math");
    assert.equal(r.module, 2);
  });

  test("extracts multiple !SAT tag rows with integer and decimal percentages", () => {
    const txt = "Math Module 1\nTAGGED QUESTIONS\n!SAT Alg- Linear Functions 3 4 75\n!SAT Alg- Systems of Linear Equations 2 5 40.0\n!SAT AdvMath- Equivalent Expressions 1 3 33.3";
    const r = parseDiagnosticText(txt, "x.pdf");
    assert.equal(r.tags.length, 3);
    assert.equal(r.tags[0].tag, "Alg- Linear Functions");
    assert.equal(r.tags[0].earn, 3);
    assert.equal(r.tags[0].poss, 4);
    assert.equal(r.tags[0].pct, 75);
    assert.equal(r.tags[1].pct, 40);
    assert.equal(r.tags[2].pct, 33.3);
  });

  test("strips (2024) suffix from tag names during extraction", () => {
    const txt = "Math\nTAGGED QUESTIONS\n!SAT Percentages (2024) 4 5 80";
    const r = parseDiagnosticText(txt, "x.pdf");
    assert.equal(r.tags.length, 1);
    assert.equal(r.tags[0].tag, "Percentages");
  });

  test("returns empty tag list when no TAGGED QUESTIONS section", () => {
    const txt = "Reading\nEarned Points: 10\nPossible Points: 20\nPercent Correct: 50";
    const r = parseDiagnosticText(txt, "x.pdf");
    assert.equal(r.tags.length, 0);
    assert.equal(r.earned, 10);
  });

  test("handles missing Earned/Possible/Percent gracefully (null, not crash)", () => {
    const txt = "Math Module 1\nSome other text\nTAGGED QUESTIONS\n!SAT Geo- Circles 1 2 50";
    const r = parseDiagnosticText(txt, "x.pdf");
    assert.equal(r.earned, null);
    assert.equal(r.possible, null);
    assert.equal(r.percentCorrect, null);
    assert.equal(r.tags.length, 1);
  });

  test("empty / null inputs return an Unknown-subject result with empty tags", () => {
    const r1 = parseDiagnosticText("", "");
    assert.equal(r1.subject, "Unknown");
    assert.equal(r1.tags.length, 0);
    const r2 = parseDiagnosticText(null, null);
    assert.equal(r2.subject, "Unknown");
    assert.equal(r2.tags.length, 0);
  });

  test("no subject-keyword but math tags present → falls back to Math", () => {
    const txt = "Some header with no clear subject\nTAGGED QUESTIONS\n!SAT Alg- Linear Functions 3 4 75\n!SAT AdvMath- Equivalent Expressions 2 3 66";
    const r = parseDiagnosticText(txt, "ambiguous.pdf");
    assert.equal(r.subject, "Math");
  });
});

// ─── buildDiagnosticProfile ─────────────────────────────────────────────────
describe("buildDiagnosticProfile", () => {
  test("empty input produces empty rollups and null scaled scores", () => {
    const r = buildDiagnosticProfile([]);
    assert.deepEqual(r.domains, []);
    assert.deepEqual(r.subs, []);
    assert.equal(r.rwScore, null);
    assert.equal(r.mathScore, null);
    assert.equal(r.totalLower, null);
    assert.equal(r.totalUpper, null);
  });

  test("single R&W result rolls up section totals + scaled score", () => {
    const input = [{
      subject: "Reading & Writing", module: null,
      earned: 40, possible: 54, percentCorrect: 74.1,
      tags: [
        { tag: "Cross Text Connections", earn: 3, poss: 4, pct: 75 },
        { tag: "Words in Context",       earn: 5, poss: 6, pct: 83 },
      ],
    }];
    const r = buildDiagnosticProfile(input);
    assert.ok(r.rwScore, "rwScore should exist");
    assert.equal(r.rwScore.earn, 40);
    assert.equal(r.rwScore.poss, 54);
    // Math section unused — should stay null.
    assert.equal(r.mathScore, null);
    // Two subs for Craft & Structure → one domain rollup.
    assert.equal(r.subs.length, 2);
    const cs = r.domains.find(d => d.domain === "Craft & Structure");
    assert.ok(cs, "Craft & Structure domain rollup expected");
    assert.equal(cs.earn, 8);
    assert.equal(cs.poss, 10);
    assert.equal(cs.pct, 80);
  });

  test("Math Module 1 + Module 2 merge into one Math section total", () => {
    const input = [
      {
        subject: "Math", module: 1, earned: 14, possible: 22, percentCorrect: 63.6,
        tags: [{ tag: "Alg- Linear Functions", earn: 3, poss: 4, pct: 75 }],
      },
      {
        subject: "Math", module: 2, earned: 16, possible: 22, percentCorrect: 72.7,
        tags: [{ tag: "AdvMath- Equivalent Expressions", earn: 2, poss: 3, pct: 66 }],
      },
    ];
    const r = buildDiagnosticProfile(input);
    assert.ok(r.mathScore);
    assert.equal(r.mathScore.earn, 30); // 14 + 16
    assert.equal(r.mathScore.poss, 44); // 22 + 22
    assert.equal(r.rwScore, null);
  });

  test("unmapped tag is silently skipped (no crash)", () => {
    const input = [{
      subject: "Math", module: 1, earned: 5, possible: 10, percentCorrect: 50,
      tags: [
        { tag: "Alg- Linear Functions", earn: 3, poss: 4, pct: 75 },
        { tag: "!SAT Some Unknown Garbage Xyzzy Qqqq", earn: 2, poss: 6, pct: 33 },
      ],
    }];
    const r = buildDiagnosticProfile(input);
    // Unmapped tag contributed nothing; only the Linear Functions sub exists.
    assert.equal(r.subs.length, 1);
    assert.equal(r.subs[0].name, "Linear Functions");
    assert.equal(r.subs[0].earn, 3);
  });

  test("domain-level summary row is dropped when sub rows for the same domain exist", () => {
    // This prevents double-counting: ZipGrade sometimes emits both a domain
    // summary "Algebra 10/15" AND its subskill rows that sum to the same 10/15.
    const input = [{
      subject: "Math", module: 1, earned: 10, possible: 15, percentCorrect: 66,
      tags: [
        { tag: "Algebra",                 earn: 10, poss: 15, pct: 66 }, // domain summary
        { tag: "Alg- Linear Functions",   earn: 6,  poss: 8,  pct: 75 }, // sub
        { tag: "Alg- Linear Inequalities", earn: 4, poss: 7,  pct: 57 }, // sub
      ],
    }];
    const r = buildDiagnosticProfile(input);
    // Algebra domain rollup should sum the TWO sub rows (10/15), not add the
    // summary row on top (which would yield 20/30).
    const alg = r.domains.find(d => d.domain === "Algebra");
    assert.ok(alg);
    assert.equal(alg.earn, 10);
    assert.equal(alg.poss, 15);
    assert.equal(r.subs.length, 2);
  });

  test("full R&W + Math pair produces totalLower/totalUpper summing both sections", () => {
    const input = [
      {
        subject: "Reading & Writing", module: null, earned: 40, possible: 54, percentCorrect: 74,
        tags: [{ tag: "Cross Text Connections", earn: 3, poss: 4, pct: 75 }],
      },
      {
        subject: "Math", module: 1, earned: 14, possible: 22, percentCorrect: 63,
        tags: [{ tag: "Alg- Linear Functions", earn: 3, poss: 4, pct: 75 }],
      },
      {
        subject: "Math", module: 2, earned: 16, possible: 22, percentCorrect: 72,
        tags: [{ tag: "Geo- Circles", earn: 2, poss: 3, pct: 66 }],
      },
    ];
    const r = buildDiagnosticProfile(input);
    assert.ok(r.rwScore);
    assert.ok(r.mathScore);
    assert.equal(r.totalLower, r.rwScore.lower + r.mathScore.lower);
    assert.equal(r.totalUpper, r.rwScore.upper + r.mathScore.upper);
  });

  test("domain rollup pct is rounded to integer", () => {
    const input = [{
      subject: "Math", module: 1, earned: 1, possible: 3, percentCorrect: 33,
      tags: [{ tag: "Alg- Linear Functions", earn: 1, poss: 3, pct: 33.3 }],
    }];
    const r = buildDiagnosticProfile(input);
    assert.equal(r.subs[0].pct, 33); // Math.round(1/3 * 100)
  });
});
