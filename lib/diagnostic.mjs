// ============================================================================
// DIAGNOSTIC PARSER — PURE LOGIC
// ============================================================================
// This file holds all the pure (non-DOM, non-React, non-pdf.js) pieces of the
// ZipGrade SAT diagnostic pipeline. It's consumed two ways:
//
//   1. Concatenated into index.html by build_index.py. The build script strips
//      the `/* @module-only-start */ ... /* @module-only-end */` block before
//      inlining so the `export { ... }` line never reaches the browser.
//
//   2. Imported as an ES module by tests/diagnostic.test.mjs, where Node's
//      built-in `node:test` runner exercises these functions directly.
//
// Do NOT add DOM, React, window, or pdf.js references to this file. The PDF
// I/O stays in app.jsx as a thin wrapper around `parseDiagnosticText`.
// ============================================================================

// ── SAT SCORE CONVERSION TABLES ─────────────────────────────────────────────
// From College Board Practice Test #4 scoring guide.
// Indexed by raw score; each value is [lower, upper] of the scaled score range.
const RW_TABLE = [[200,200],[200,200],[200,200],[200,200],[200,200],[200,200],[200,200],[200,210],[200,220],[210,230],[230,250],[240,260],[250,270],[260,280],[280,300],[290,310],[320,340],[340,360],[350,370],[360,380],[370,390],[370,390],[380,400],[390,410],[400,420],[410,430],[420,440],[420,440],[430,450],[440,460],[450,470],[460,480],[460,480],[470,490],[480,500],[490,510],[490,510],[500,520],[510,530],[520,540],[530,550],[540,560],[540,560],[550,570],[560,580],[570,590],[580,600],[590,610],[590,610],[600,620],[610,630],[620,640],[630,650],[630,650],[640,660],[650,670],[660,680],[670,690],[680,700],[690,710],[700,720],[710,730],[720,740],[730,750],[750,770],[770,790],[790,800]];
const MATH_TABLE = [[200,200],[200,200],[200,200],[200,200],[200,200],[200,200],[200,200],[200,220],[200,230],[220,250],[250,280],[280,310],[290,320],[300,330],[310,340],[320,350],[330,360],[330,360],[340,370],[350,380],[360,390],[370,400],[370,400],[380,410],[390,420],[400,430],[420,450],[430,460],[440,470],[460,490],[470,500],[480,510],[500,530],[510,540],[520,550],[530,560],[550,580],[560,590],[570,600],[580,610],[590,620],[600,630],[620,650],[630,660],[650,680],[670,700],[690,720],[710,740],[730,760],[740,770],[750,780],[760,790],[770,800],[780,800],[790,800]];
const scaleRW = (raw)=>{const r=Math.max(0,Math.min(66,raw|0));return RW_TABLE[r];};
const scaleMath = (raw)=>{const r=Math.max(0,Math.min(54,raw|0));return MATH_TABLE[r];};

// ── TAG NORMALIZATION + LOOKUP TABLE ────────────────────────────────────────
// Map parsed ZipGrade tag names to canonical {subject, domain, name}.
// Keys are normalized lowercase, punctuation-stripped via `normTag` below.
const _rawTagMap = {
  // R&W domains
  "Craft & Structure":             ["Reading & Writing","domain","Craft & Structure"],
  "Information & Ideas":           ["Reading & Writing","domain","Information & Ideas"],
  "Expression of Ideas":           ["Reading & Writing","domain","Expression of Ideas"],
  "Standard English Conventions":  ["Reading & Writing","domain","Standard English Conventions"],
  // R&W subdomains — multiple alternate forms
  "C&S - Cross-Text Connections":           ["Reading & Writing","sub","Craft & Structure","Cross Text Connections"],
  "C&S- Cross-Text Connections":            ["Reading & Writing","sub","Craft & Structure","Cross Text Connections"],
  "Cross-Text Connections":                 ["Reading & Writing","sub","Craft & Structure","Cross Text Connections"],
  "Cross Text Connections":                 ["Reading & Writing","sub","Craft & Structure","Cross Text Connections"],
  "C&S - Text Structure & Purpose":         ["Reading & Writing","sub","Craft & Structure","Text Structure & Purpose"],
  "C&S- Text Structure & Purpose":          ["Reading & Writing","sub","Craft & Structure","Text Structure & Purpose"],
  "Text Structure & Purpose":               ["Reading & Writing","sub","Craft & Structure","Text Structure & Purpose"],
  "Text Structure and Purpose":             ["Reading & Writing","sub","Craft & Structure","Text Structure & Purpose"],
  "C&S - Words in Context":                 ["Reading & Writing","sub","Craft & Structure","Words in Context"],
  "C&S- Words in Context":                  ["Reading & Writing","sub","Craft & Structure","Words in Context"],
  "Words in Context":                       ["Reading & Writing","sub","Craft & Structure","Words in Context"],
  "Info/Ideas - Central Idea & Details":    ["Reading & Writing","sub","Information & Ideas","Central Ideas & Details"],
  "Info/Ideas- Central Idea & Details":     ["Reading & Writing","sub","Information & Ideas","Central Ideas & Details"],
  "Info/Ideas - Central Ideas & Details":   ["Reading & Writing","sub","Information & Ideas","Central Ideas & Details"],
  "Central Ideas & Details":                ["Reading & Writing","sub","Information & Ideas","Central Ideas & Details"],
  "Central Ideas and Details":              ["Reading & Writing","sub","Information & Ideas","Central Ideas & Details"],
  "Central Idea & Details":                 ["Reading & Writing","sub","Information & Ideas","Central Ideas & Details"],
  "Info/Ideas - Command of Evidence":       ["Reading & Writing","sub","Information & Ideas","Command of Evidence"],
  "Info/Ideas- Command of Evidence":        ["Reading & Writing","sub","Information & Ideas","Command of Evidence"],
  "Command of Evidence":                    ["Reading & Writing","sub","Information & Ideas","Command of Evidence"],
  "Info/Ideas - Inferences":                ["Reading & Writing","sub","Information & Ideas","Inferences"],
  "Info/Ideas- Inferences":                 ["Reading & Writing","sub","Information & Ideas","Inferences"],
  "Inferences":                             ["Reading & Writing","sub","Information & Ideas","Inferences"],
  "EOI - Rhetorical Synthesis":             ["Reading & Writing","sub","Expression of Ideas","Rhetorical Synthesis"],
  "EOI- Rhetorical Synthesis":              ["Reading & Writing","sub","Expression of Ideas","Rhetorical Synthesis"],
  "Rhetorical Synthesis":                   ["Reading & Writing","sub","Expression of Ideas","Rhetorical Synthesis"],
  "EOI - Transitions":                      ["Reading & Writing","sub","Expression of Ideas","Transitions"],
  "EOI- Transitions":                       ["Reading & Writing","sub","Expression of Ideas","Transitions"],
  "Transitions":                            ["Reading & Writing","sub","Expression of Ideas","Transitions"],
  "SEC - Form Structure Sense":             ["Reading & Writing","sub","Standard English Conventions","Form, Structure, & Sense"],
  "SEC- Form Structure Sense":              ["Reading & Writing","sub","Standard English Conventions","Form, Structure, & Sense"],
  "SEC - Form, Structure, and Sense":       ["Reading & Writing","sub","Standard English Conventions","Form, Structure, & Sense"],
  "Form, Structure, & Sense":               ["Reading & Writing","sub","Standard English Conventions","Form, Structure, & Sense"],
  "Form Structure and Sense":               ["Reading & Writing","sub","Standard English Conventions","Form, Structure, & Sense"],
  "SEC - Boundaries":                       ["Reading & Writing","sub","Standard English Conventions","Boundaries"],
  "SEC- Boundaries":                        ["Reading & Writing","sub","Standard English Conventions","Boundaries"],
  "Boundaries":                             ["Reading & Writing","sub","Standard English Conventions","Boundaries"],
  // Math domains
  "Algebra":                       ["Math","domain","Algebra"],
  "Advanced Math":                 ["Math","domain","Advanced Math"],
  "PSDA":                          ["Math","domain","Problem-Solving & Data Analysis"],
  "Geometry & Trig":               ["Math","domain","Geometry & Trigonometry"],
  // Math subdomains — multiple alternate forms for ZipGrade tag name variations
  "Alg- Linear Equations in One Variable":  ["Math","sub","Algebra","Linear Equations (1 Variable)"],
  "Alg - Linear Equations in One Variable": ["Math","sub","Algebra","Linear Equations (1 Variable)"],
  "Alg- Linear Eq in 1 Variable":          ["Math","sub","Algebra","Linear Equations (1 Variable)"],
  "Alg- Linear Eq. in 1 Variable":         ["Math","sub","Algebra","Linear Equations (1 Variable)"],
  "Linear Equations in One Variable":       ["Math","sub","Algebra","Linear Equations (1 Variable)"],
  "Linear Equations in 1 Variable":         ["Math","sub","Algebra","Linear Equations (1 Variable)"],
  "Alg- Linear Equations in Two Variables": ["Math","sub","Algebra","Linear Equations (2 Variables)"],
  "Alg - Linear Equations in Two Variables":["Math","sub","Algebra","Linear Equations (2 Variables)"],
  "Alg- Linear Eq in 2 Variables":          ["Math","sub","Algebra","Linear Equations (2 Variables)"],
  "Linear Equations in Two Variables":      ["Math","sub","Algebra","Linear Equations (2 Variables)"],
  "Linear Equations in 2 Variables":        ["Math","sub","Algebra","Linear Equations (2 Variables)"],
  "Alg- Linear Functions":                  ["Math","sub","Algebra","Linear Functions"],
  "Alg - Linear Functions":                 ["Math","sub","Algebra","Linear Functions"],
  "Linear Functions":                       ["Math","sub","Algebra","Linear Functions"],
  "Alg- Linear Inequalities":               ["Math","sub","Algebra","Linear Inequalities"],
  "Alg - Linear Inequalities":              ["Math","sub","Algebra","Linear Inequalities"],
  "Linear Inequalities":                    ["Math","sub","Algebra","Linear Inequalities"],
  "Alg- Systems of Linear Equations":       ["Math","sub","Algebra","Systems of Linear Equations"],
  "Alg - Systems of Linear Equations":      ["Math","sub","Algebra","Systems of Linear Equations"],
  "Systems of Linear Equations":            ["Math","sub","Algebra","Systems of Linear Equations"],
  "AdvMath- Equivalent Expressions":        ["Math","sub","Advanced Math","Equivalent Expressions"],
  "AdvMath - Equivalent Expressions":       ["Math","sub","Advanced Math","Equivalent Expressions"],
  "Adv Math- Equivalent Expressions":       ["Math","sub","Advanced Math","Equivalent Expressions"],
  "Equivalent Expressions":                 ["Math","sub","Advanced Math","Equivalent Expressions"],
  "AdvMath- Nonlinear Equations & SOEs":    ["Math","sub","Advanced Math","Nonlinear Equations"],
  "AdvMath - Nonlinear Equations & SOEs":   ["Math","sub","Advanced Math","Nonlinear Equations"],
  "Adv Math- Nonlinear Equations":          ["Math","sub","Advanced Math","Nonlinear Equations"],
  "AdvMath- Nonlinear Equations":           ["Math","sub","Advanced Math","Nonlinear Equations"],
  "Nonlinear Equations":                    ["Math","sub","Advanced Math","Nonlinear Equations"],
  "Nonlinear Equations & SOEs":             ["Math","sub","Advanced Math","Nonlinear Equations"],
  "AdvMath- Nonlinear Functions":           ["Math","sub","Advanced Math","Nonlinear Functions"],
  "AdvMath - Nonlinear Functions":          ["Math","sub","Advanced Math","Nonlinear Functions"],
  "Adv Math- Nonlinear Functions":          ["Math","sub","Advanced Math","Nonlinear Functions"],
  "Nonlinear Functions":                    ["Math","sub","Advanced Math","Nonlinear Functions"],
  "PSDA- Percentages":                                         ["Math","sub","Problem-Solving & Data Analysis","Percentages"],
  "PSDA - Percentages":                                        ["Math","sub","Problem-Solving & Data Analysis","Percentages"],
  "Percentages":                                               ["Math","sub","Problem-Solving & Data Analysis","Percentages"],
  "PSDA- Ratios, Rates, Proportions, Units":                   ["Math","sub","Problem-Solving & Data Analysis","Ratios, Rates, Proportions, Units"],
  "PSDA - Ratios, Rates, Proportions, Units":                  ["Math","sub","Problem-Solving & Data Analysis","Ratios, Rates, Proportions, Units"],
  "Ratios, Rates, Proportional Relationships, and Units":      ["Math","sub","Problem-Solving & Data Analysis","Ratios, Rates, Proportions, Units"],
  "Ratios Rates Proportions Units":                            ["Math","sub","Problem-Solving & Data Analysis","Ratios, Rates, Proportions, Units"],
  "PSDA- One Var. Data Distributions":                         ["Math","sub","Problem-Solving & Data Analysis","One-Variable Data"],
  "PSDA - One Var. Data Distributions":                        ["Math","sub","Problem-Solving & Data Analysis","One-Variable Data"],
  "PSDA- One-Variable Data: Distributions and Measures":       ["Math","sub","Problem-Solving & Data Analysis","One-Variable Data"],
  "One-Variable Data":                                         ["Math","sub","Problem-Solving & Data Analysis","One-Variable Data"],
  "One Var Data Distributions":                                ["Math","sub","Problem-Solving & Data Analysis","One-Variable Data"],
  "PSDA- Two-Variable Data":                                   ["Math","sub","Problem-Solving & Data Analysis","Two-Variable Data"],
  "PSDA - Two-Variable Data":                                  ["Math","sub","Problem-Solving & Data Analysis","Two-Variable Data"],
  "PSDA- Two Var. Data":                                       ["Math","sub","Problem-Solving & Data Analysis","Two-Variable Data"],
  "Two-Variable Data":                                         ["Math","sub","Problem-Solving & Data Analysis","Two-Variable Data"],
  "PSDA- Probability & Conditional Probability":               ["Math","sub","Problem-Solving & Data Analysis","Probability"],
  "PSDA - Probability & Conditional Probability":              ["Math","sub","Problem-Solving & Data Analysis","Probability"],
  "PSDA- Probability":                                         ["Math","sub","Problem-Solving & Data Analysis","Probability"],
  "Probability & Conditional Probability":                     ["Math","sub","Problem-Solving & Data Analysis","Probability"],
  "Probability":                                               ["Math","sub","Problem-Solving & Data Analysis","Probability"],
  "PSDA- Inference from Sample Data & Margin of Error":        ["Math","sub","Problem-Solving & Data Analysis","Inference & Margin of Error"],
  "PSDA - Inference from Sample Data & Margin of Error":       ["Math","sub","Problem-Solving & Data Analysis","Inference & Margin of Error"],
  "PSDA- Inference & Margin of Error":                         ["Math","sub","Problem-Solving & Data Analysis","Inference & Margin of Error"],
  "Inference from Sample Statistics and Margin of Error":      ["Math","sub","Problem-Solving & Data Analysis","Inference & Margin of Error"],
  "PSDA- Evaluating Stat Claims in Obs Studies & Experiments": ["Math","sub","Problem-Solving & Data Analysis","Evaluating Statistical Claims"],
  "PSDA - Evaluating Stat Claims in Obs Studies & Experiments":["Math","sub","Problem-Solving & Data Analysis","Evaluating Statistical Claims"],
  "PSDA- Evaluating Statistical Claims":                       ["Math","sub","Problem-Solving & Data Analysis","Evaluating Statistical Claims"],
  "Evaluating Statistical Claims":                             ["Math","sub","Problem-Solving & Data Analysis","Evaluating Statistical Claims"],
  "Evaluating Stat. Claims: Obs. Studies & Experiments":       ["Math","sub","Problem-Solving & Data Analysis","Evaluating Statistical Claims"],
  "Geo- Area & Volume":                     ["Math","sub","Geometry & Trigonometry","Area & Volume"],
  "Geo - Area & Volume":                    ["Math","sub","Geometry & Trigonometry","Area & Volume"],
  "Area & Volume":                          ["Math","sub","Geometry & Trigonometry","Area & Volume"],
  "Area and Volume":                        ["Math","sub","Geometry & Trigonometry","Area & Volume"],
  "Geo- Circles":                           ["Math","sub","Geometry & Trigonometry","Circles"],
  "Geo - Circles":                          ["Math","sub","Geometry & Trigonometry","Circles"],
  "Circles":                                ["Math","sub","Geometry & Trigonometry","Circles"],
  "Geo- Lines, Angles, & Triangles":        ["Math","sub","Geometry & Trigonometry","Lines, Angles, & Triangles"],
  "Geo - Lines, Angles, & Triangles":       ["Math","sub","Geometry & Trigonometry","Lines, Angles, & Triangles"],
  "Lines, Angles, and Triangles":           ["Math","sub","Geometry & Trigonometry","Lines, Angles, & Triangles"],
  "Geo- Right Triangles & Trigonometry":    ["Math","sub","Geometry & Trigonometry","Right Triangles & Trigonometry"],
  "Geo - Right Triangles & Trigonometry":   ["Math","sub","Geometry & Trigonometry","Right Triangles & Trigonometry"],
  "Right Triangles & Trigonometry":         ["Math","sub","Geometry & Trigonometry","Right Triangles & Trigonometry"],
  "Right Triangles and Trigonometry":       ["Math","sub","Geometry & Trigonometry","Right Triangles & Trigonometry"],
};
// Normalizer: lowercase, collapse non-alphanumeric to nothing, so tag lookup is tolerant.
const normTag = (s)=>s.toLowerCase().replace(/\(2024\)/g,"").replace(/[^a-z0-9]/g,"");
const TAG_MAP = {};
Object.entries(_rawTagMap).forEach(([k,v])=>{
  const obj = v[1]==="domain" ? {subject:v[0],kind:"domain",name:v[2]} : {subject:v[0],kind:"sub",domain:v[2],name:v[3]};
  TAG_MAP[normTag(k)] = obj;
});

// Fuzzy tag lookup: exact match first, then substring, then keyword signature.
function lookupTag(raw){
  const n = normTag(raw);
  if(TAG_MAP[n]) return TAG_MAP[n];
  // Substring match — try longest known key that's a substring of the normalized tag.
  const keys = Object.keys(TAG_MAP).sort((a,b)=>b.length-a.length);
  for(const k of keys){ if(n.includes(k) || k.includes(n)) return TAG_MAP[k]; }
  // Keyword signature matching for common variants.
  const lc = raw.toLowerCase();
  // Math subdomains
  if(/linear.*one.*variable|1\s*var|one\s*variable/i.test(lc) && /linear/i.test(lc)) return {subject:"Math",kind:"sub",domain:"Algebra",name:"Linear Equations (1 Variable)"};
  if(/linear.*two.*variable|2\s*var|two\s*variable/i.test(lc) && /linear/i.test(lc)) return {subject:"Math",kind:"sub",domain:"Algebra",name:"Linear Equations (2 Variables)"};
  if(/linear.*function/i.test(lc)) return {subject:"Math",kind:"sub",domain:"Algebra",name:"Linear Functions"};
  if(/linear.*inequalit/i.test(lc)) return {subject:"Math",kind:"sub",domain:"Algebra",name:"Linear Inequalities"};
  if(/system.*linear/i.test(lc))    return {subject:"Math",kind:"sub",domain:"Algebra",name:"Systems of Linear Equations"};
  if(/equivalent.*expression/i.test(lc)) return {subject:"Math",kind:"sub",domain:"Advanced Math",name:"Equivalent Expressions"};
  if(/nonlinear.*equation/i.test(lc))    return {subject:"Math",kind:"sub",domain:"Advanced Math",name:"Nonlinear Equations"};
  if(/nonlinear.*function/i.test(lc))    return {subject:"Math",kind:"sub",domain:"Advanced Math",name:"Nonlinear Functions"};
  if(/percentage|percent/i.test(lc))     return {subject:"Math",kind:"sub",domain:"Problem-Solving & Data Analysis",name:"Percentages"};
  if(/ratio|rate|proportion|unit/i.test(lc)) return {subject:"Math",kind:"sub",domain:"Problem-Solving & Data Analysis",name:"Ratios, Rates, Proportions, Units"};
  if(/one[\s-]*var.*data|1[\s-]*var.*data/i.test(lc)) return {subject:"Math",kind:"sub",domain:"Problem-Solving & Data Analysis",name:"One-Variable Data"};
  if(/two[\s-]*var.*data|2[\s-]*var.*data/i.test(lc)) return {subject:"Math",kind:"sub",domain:"Problem-Solving & Data Analysis",name:"Two-Variable Data"};
  if(/probability/i.test(lc))                         return {subject:"Math",kind:"sub",domain:"Problem-Solving & Data Analysis",name:"Probability"};
  if(/inference|margin.*error/i.test(lc))             return {subject:"Math",kind:"sub",domain:"Problem-Solving & Data Analysis",name:"Inference & Margin of Error"};
  if(/statistic.*claim|observ.*stud|experiment/i.test(lc)) return {subject:"Math",kind:"sub",domain:"Problem-Solving & Data Analysis",name:"Evaluating Statistical Claims"};
  if(/area|volume/i.test(lc))           return {subject:"Math",kind:"sub",domain:"Geometry & Trigonometry",name:"Area & Volume"};
  if(/circle/i.test(lc))                return {subject:"Math",kind:"sub",domain:"Geometry & Trigonometry",name:"Circles"};
  if(/right.*triangle|trigonometry/i.test(lc)) return {subject:"Math",kind:"sub",domain:"Geometry & Trigonometry",name:"Right Triangles & Trigonometry"};
  if(/line.*angle.*triangle/i.test(lc)) return {subject:"Math",kind:"sub",domain:"Geometry & Trigonometry",name:"Lines, Angles, & Triangles"};
  // R&W subdomains
  if(/cross.*text.*connection/i.test(lc)) return {subject:"Reading & Writing",kind:"sub",domain:"Craft & Structure",name:"Cross Text Connections"};
  if(/text.*structure.*purpose|structure.*purpose/i.test(lc)) return {subject:"Reading & Writing",kind:"sub",domain:"Craft & Structure",name:"Text Structure & Purpose"};
  if(/word.*in.*context/i.test(lc))       return {subject:"Reading & Writing",kind:"sub",domain:"Craft & Structure",name:"Words in Context"};
  if(/central.*idea/i.test(lc))           return {subject:"Reading & Writing",kind:"sub",domain:"Information & Ideas",name:"Central Ideas & Details"};
  if(/command.*evidence/i.test(lc))       return {subject:"Reading & Writing",kind:"sub",domain:"Information & Ideas",name:"Command of Evidence"};
  if(/inference/i.test(lc) && /reading|info|idea/i.test(lc)) return {subject:"Reading & Writing",kind:"sub",domain:"Information & Ideas",name:"Inferences"};
  if(/rhetorical.*synthesis|synthesis/i.test(lc)) return {subject:"Reading & Writing",kind:"sub",domain:"Expression of Ideas",name:"Rhetorical Synthesis"};
  if(/transition/i.test(lc))                      return {subject:"Reading & Writing",kind:"sub",domain:"Expression of Ideas",name:"Transitions"};
  if(/form.*structure.*sense/i.test(lc))          return {subject:"Reading & Writing",kind:"sub",domain:"Standard English Conventions",name:"Form, Structure, & Sense"};
  if(/boundaries/i.test(lc))                       return {subject:"Reading & Writing",kind:"sub",domain:"Standard English Conventions",name:"Boundaries"};
  // Domain-only fallbacks
  if(/^alg/i.test(lc) || /algebra/i.test(lc))    return {subject:"Math",kind:"domain",name:"Algebra"};
  if(/adv.*math/i.test(lc))                       return {subject:"Math",kind:"domain",name:"Advanced Math"};
  if(/psda|problem.*solving.*data|data.*analysis/i.test(lc)) return {subject:"Math",kind:"domain",name:"Problem-Solving & Data Analysis"};
  if(/^geo/i.test(lc) || /geometry/i.test(lc))    return {subject:"Math",kind:"domain",name:"Geometry & Trigonometry"};
  if(/craft.*structure/i.test(lc))                return {subject:"Reading & Writing",kind:"domain",name:"Craft & Structure"};
  if(/information.*idea|info.*idea/i.test(lc))    return {subject:"Reading & Writing",kind:"domain",name:"Information & Ideas"};
  if(/expression.*idea/i.test(lc))                return {subject:"Reading & Writing",kind:"domain",name:"Expression of Ideas"};
  if(/standard.*english|conventions/i.test(lc))   return {subject:"Reading & Writing",kind:"domain",name:"Standard English Conventions"};
  return null;
}

// ── PARSE DIAGNOSTIC TEXT ───────────────────────────────────────────────────
// Pure core of `parseDiagnosticPdf`. Takes the already-extracted full text of
// a ZipGrade diagnostic PDF (newline-joined lines) plus the file name, returns
// the structured parse result. `parsedAt` is NOT set here — the caller stamps
// it so this function stays deterministic for tests.
function parseDiagnosticText(fullText, fileName){
  fullText = fullText || "";
  fileName = fileName || "";

  // Detect subject/module from the QUIZ NAME area (top of document + filename),
  // not the entire body. ZipGrade headers have "Quiz: <name>" or the name on
  // its own line near the top.
  const headerArea = fullText.slice(0, 800) + "\n" + fileName;
  let subject = "Unknown", module = null;
  const isMath = /\bmath\b|mathematics/i.test(headerArea);
  const isReading = /reading|writing|\br\s*&?\s*w\b|verbal|english/i.test(headerArea);
  const modMatch = headerArea.match(/mod(?:ule)?\s*\.?\s*(\d)/i);
  if(isMath){
    subject = "Math";
    if(modMatch) module = Number(modMatch[1]);
    else if(/\b(m1|math1|math\s*1|part\s*1|section\s*1)\b/i.test(headerArea)) module = 1;
    else if(/\b(m2|math2|math\s*2|part\s*2|section\s*2)\b/i.test(headerArea)) module = 2;
  } else if(isReading){
    subject = "Reading & Writing";
  } else {
    // Fall back: if tag area is dominated by R&W domains, mark as R&W; else math.
    const tagArea = (fullText.split(/TAGGED/i)[1]||"").toLowerCase();
    if(/c&s|eoi|sec|info\/ideas|craft|reading|writing/i.test(tagArea)) subject = "Reading & Writing";
    else if(/alg|advmath|psda|geo/i.test(tagArea)) subject = "Math";
  }

  const pctMatch = fullText.match(/Percent\s*Correct:?\s*([\d.]+)/i);
  const earnedMatch = fullText.match(/Earned\s*Points:?\s*(\d+)/i);
  const possMatch = fullText.match(/Possible\s*Points:?\s*(\d+)/i);

  // Extract tag rows. The section layout is:
  //   <tag name possibly wrapped across lines> <space> <earn> <poss> <pct>
  // We collapse whitespace/newlines then scan for sequences starting with "!SAT".
  // Some PDFs use "TAGGED QUESTIONS & QUIZ" or "TAGGED QUESTIONS".
  const tagSplitIdx = fullText.search(/TAGGED\s*QUESTIONS/i);
  const tagSection = tagSplitIdx>=0 ? fullText.slice(tagSplitIdx) : "";
  const cleaned = tagSection.replace(/\s+/g," ").trim();
  const rows = [];
  const chunks = cleaned.split(/(?=!SAT\s)/g).filter(c=>c.trim().startsWith("!SAT"));
  for(const chunk of chunks){
    // Relaxed regex: allow fractional pct, optional trailing text, different spacing.
    const m = chunk.match(/^(!SAT\s+.+?)\s+(\d+)\s+(\d+)\s+([\d.]+)/);
    if(!m) continue;
    let name = m[1].replace(/^!SAT\s+/,"").replace(/\s*\(\d{4}\)\s*$/,"").replace(/\s+/g," ").trim();
    rows.push({tag:name,earn:Number(m[2]),poss:Number(m[3]),pct:Number(m[4])});
  }
  return {
    subject, module,
    percentCorrect: pctMatch?Number(pctMatch[1]):null,
    earned: earnedMatch?Number(earnedMatch[1]):null,
    possible: possMatch?Number(possMatch[1]):null,
    tags: rows,
    fileName,
  };
}

// ── BUILD DIAGNOSTIC PROFILE ────────────────────────────────────────────────
// Merges a list of parsed diagnostic results into a student profile: domain
// and subskill rollups, plus scaled SAT scores from section totals. Math
// module 1 + module 2 merge into one Math section; R&W is its own.
function buildDiagnosticProfile(parsedList){
  const domains={}, subs={};
  const sectionTotals = {"Reading & Writing":{earn:0,poss:0,count:0},"Math":{earn:0,poss:0,count:0}};
  // Track which domains have subskill data, so we can skip duplicate
  // domain-level summary rows (avoids double-counting).
  const domainsWithSubs = new Set();
  // First pass: identify which tags map to subskills.
  parsedList.forEach(res=>{
    (res.tags||[]).forEach(t=>{
      const map = lookupTag(t.tag);
      if(map && map.kind==="sub") domainsWithSubs.add(`${map.subject}|${map.domain}`);
    });
  });
  parsedList.forEach(res=>{
    if(res.subject && sectionTotals[res.subject] && res.earned!=null && res.possible!=null){
      sectionTotals[res.subject].earn += res.earned;
      sectionTotals[res.subject].poss += res.possible;
      sectionTotals[res.subject].count += 1;
    }
    (res.tags||[]).forEach(t=>{
      const map = lookupTag(t.tag);
      if(!map){ /* unmapped tag — skipped, not crashed */ return; }
      if(map.kind==="sub"){
        const sKey = `${map.subject}|${map.domain}|${map.name}`;
        if(!subs[sKey]) subs[sKey]={earn:0,poss:0,subject:map.subject,domain:map.domain,name:map.name};
        subs[sKey].earn += t.earn;
        subs[sKey].poss += t.poss;
        const dKey = `${map.subject}|${map.domain}`;
        if(!domains[dKey]) domains[dKey]={earn:0,poss:0,subject:map.subject,domain:map.domain,name:map.domain};
        domains[dKey].earn += t.earn;
        domains[dKey].poss += t.poss;
      } else {
        // Only use domain-level row if we have NO sub-level data for it.
        const dKey = `${map.subject}|${map.name}`;
        if(domainsWithSubs.has(dKey)) return;
        if(!domains[dKey]) domains[dKey]={earn:0,poss:0,subject:map.subject,domain:map.name,name:map.name};
        domains[dKey].earn += t.earn;
        domains[dKey].poss += t.poss;
      }
    });
  });
  const fmt=(rec)=>({...rec,pct:rec.poss?Math.round((rec.earn/rec.poss)*100):null});
  const domainArr = Object.values(domains).map(fmt);
  const subArr    = Object.values(subs).map(fmt);

  const rw = sectionTotals["Reading & Writing"];
  const m  = sectionTotals["Math"];
  let rwScore=null, mathScore=null, totalLower=null, totalUpper=null;
  if(rw.count>0){ const s = scaleRW(rw.earn); rwScore = {earn:rw.earn,poss:rw.poss,lower:s[0],upper:s[1]}; }
  if(m.count>0){  const s = scaleMath(m.earn); mathScore = {earn:m.earn,poss:m.poss,lower:s[0],upper:s[1]}; }
  if(rwScore && mathScore){ totalLower = rwScore.lower + mathScore.lower; totalUpper = rwScore.upper + mathScore.upper; }
  return {domains:domainArr,subs:subArr,rwScore,mathScore,totalLower,totalUpper};
}

/* @module-only-start */
export {
  RW_TABLE, MATH_TABLE, scaleRW, scaleMath,
  normTag, TAG_MAP, lookupTag,
  parseDiagnosticText,
  buildDiagnosticProfile,
};
/* @module-only-end */
