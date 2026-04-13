/* ============ CONSTANTS ============ */
/* ATS brand navies — sampled from the official logo (2.png = #004A79).
   B1 = deepest, B2 = primary, B3 = lighter accent. Do not alter without brand approval. */
const B1="#003258", B2="#004A79", B3="#0066A6";
/* Editorial semantic palettes — muted, paper-friendly, readable at small sizes. */
const DC={easy:"#4C7A4C",medium:"#A9761B",hard:"#8C2E2E",comprehensive:"#5B4B8A",mixed:"#5B4B8A"};
const SUBJ_COLOR={
  "Reading & Writing":{bg:"#E9F0F6",fg:"#003258",accent:"#004A79"},
  "Math":{bg:"#F5ECDF",fg:"#6E3F12",accent:"#9A5B1F"}
};
const DOMAIN_COLOR={
  "Information & Ideas":"#003258",
  "Craft & Structure":"#5B4B8A",
  "Expression of Ideas":"#1F4E7A",
  "Standard English Conventions":"#2B6A6A",
  "Algebra":"#4C7A4C",
  "Advanced Math":"#2F5F4F",
  "Problem-Solving & Data Analysis":"#A9761B",
  "Geometry & Trigonometry":"#8C2E2E"
};
const DIFF_ORDER=["easy","medium","hard","comprehensive"];

const uid=()=>Math.random().toString(36).slice(2,10);
const todayStr=()=>new Date().toISOString().slice(0,10);
const sLoad=(k,fb)=>{try{const r=localStorage.getItem(k);return r?JSON.parse(r):fb;}catch{return fb;}};
const sSave=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};

/* Soft-delete helpers. Items with a truthy `deleted` flag are in the trash;
   live() strips them for display, trash() keeps only them for the Trash tab.
   Raw `students` state always contains both — we filter at display time so
   mutations (addAsg, setExamScore, etc.) keep working against the full array. */
const live = arr => (arr||[]).filter(x=>!x.deleted);
const trashed = arr => (arr||[]).filter(x=>x.deleted);
const softDel = x => ({...x, deleted:true, deletedAt: Date.now()});
const softRestore = x => { const {deleted, deletedAt, ...rest} = x; return rest; };

/* CSV parser — RFC 4180-ish, handles quoted fields with embedded commas,
   embedded newlines, and "" escapes. Returns array of row arrays. */
function parseCsvText(text){
  const rows=[]; let row=[]; let cell=""; let q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){
      if(ch==='"'){ if(text[i+1]==='"'){cell+='"';i++;} else q=false; }
      else cell+=ch;
    } else {
      if(ch==='"') q=true;
      else if(ch===','){ row.push(cell); cell=""; }
      else if(ch==='\r'){/*skip*/}
      else if(ch==='\n'){ row.push(cell); rows.push(row); row=[]; cell=""; }
      else cell+=ch;
    }
  }
  if(cell.length||row.length){ row.push(cell); rows.push(row); }
  return rows;
}

/* Parse a Wise "Learner Report" CSV export into a list of clean student
   objects. Skips rows before the header ("Table 1" title), handles duplicate
   "Phone Number" columns, and ignores the accommodations column entirely
   (PII we explicitly don't want in PSM). */
function parseWiseCsv(text){
  const rows = parseCsvText(text);
  const headerIdx = rows.findIndex(r => r.some(c => (c||"").trim() === "Name"));
  if(headerIdx < 0) throw new Error('Could not find "Name" column — is this a Wise Learner Report?');
  const header = rows[headerIdx].map(c => (c||"").trim());
  const col = n => header.indexOf(n);
  const idxName = col("Name");
  const idxPhone1 = col("Phone Number");
  const idxPhone2 = header.lastIndexOf("Phone Number");
  const idxEmail = col("Email");
  const idxJoined = col("Joined On");
  const idxGrade = col("Grade Level");
  const idxLevel = col("Level of Tutoring");
  const idxSubject = col("Specific Subject of Tutoring");
  const idxGoals = header.findIndex(c => c.toLowerCase().startsWith("what are your outcome goals"));
  const get = (r,i) => (i>=0 && r[i]!=null) ? String(r[i]).trim() : "";
  const out = [];
  for(let i = headerIdx+1; i < rows.length; i++){
    const r = rows[i];
    const name = get(r, idxName);
    if(!name) continue;
    const phone = get(r, idxPhone1) || (idxPhone2!==idxPhone1 ? get(r, idxPhone2) : "");
    out.push({
      name,
      meta: {
        email: get(r, idxEmail),
        phone,
        joinedOn: get(r, idxJoined),
        gradeLevel: get(r, idxGrade),
        levelOfTutoring: get(r, idxLevel),
        subjectOfTutoring: get(r, idxSubject),
        goals: get(r, idxGoals),
        source: "wise",
        importedAt: Date.now(),
      },
    });
  }
  return out;
}

/* ============ WORKSHEET CATALOG ============ */
const ALL_WS = WS_RAW.map(([subject,domain,subdomain,difficulty,qs,title,stu,key])=>({
  subject,domain,subdomain,difficulty,qs,title,stu,key,
  id:`${subject}|${domain}|${subdomain}|${difficulty}|${title}`,
  isComprehensiveGroup: subdomain.startsWith("Comprehensive "),
}));
// Ensure "Circles - Easy" exists (missing from WS_RAW)
if(!ALL_WS.find(ws=>ws.subdomain==="Circles"&&ws.difficulty==="easy")){
  ALL_WS.push({subject:"Math",domain:"Geometry & Trigonometry",subdomain:"Circles",difficulty:"easy",qs:0,title:"Circles - Easy (Inactive)",stu:"",key:"",id:"Math|Geometry & Trigonometry|Circles|easy|Circles - Easy (Inactive)",isComprehensiveGroup:false});
}

/* ============ WELLED DOMAIN ASSIGNMENTS ============ */
// R&W: 27 Qs each. Math: 22 Qs. Geo & PSDA only Easy/Hard.
const WELLED_DOMAIN = [
  {subject:"Reading & Writing",domain:"Information & Ideas",diffs:["easy","medium","hard"],qs:27},
  {subject:"Reading & Writing",domain:"Craft & Structure",diffs:["easy","medium","hard"],qs:27},
  {subject:"Reading & Writing",domain:"Expression of Ideas",diffs:["easy","medium","hard"],qs:27},
  {subject:"Reading & Writing",domain:"Standard English Conventions",diffs:["easy","medium","hard"],qs:27},
  {subject:"Math",domain:"Algebra",diffs:["easy","medium","hard"],qs:22},
  {subject:"Math",domain:"Advanced Math",diffs:["easy","medium","hard"],qs:22},
  {subject:"Math",domain:"Problem-Solving & Data Analysis",diffs:["easy","hard"],qs:22},
  {subject:"Math",domain:"Geometry & Trigonometry",diffs:["easy","hard"],qs:22},
];
const WE_DOMAIN_ITEMS = [];
WELLED_DOMAIN.forEach(e=>e.diffs.forEach(d=>{
  const label=`${e.domain} - ${d[0].toUpperCase()+d.slice(1)} (${e.qs}Qs)`;
  WE_DOMAIN_ITEMS.push({id:`WED|${e.subject}|${e.domain}|${d}`,subject:e.subject,domain:e.domain,difficulty:d,qs:e.qs,label,kind:"welled_domain"});
}));

const WELLED_PRACTICE_TESTS = Array.from({length:46},(_,i)=>i+1); // Tests 1-46
const BLUEBOOK_PRACTICE_TESTS = Array.from({length:6},(_,i)=>i+1); // Tests 1-6

/* ============ VOCAB ITEMS ============ */
const VOCAB_ITEMS = [];
VOCAB_SETS.forEach(name=>{
  VOCAB_ITEMS.push({id:`VF|${name}`,kind:"vocab_flash",name,label:`Flashcards: ${name}`});
  for(let i=1;i<=4;i++) VOCAB_ITEMS.push({id:`VQ|${name}|${i}`,kind:"vocab_quiz",name,variant:i,label:`Quiz ${i}: ${name}`});
});

/* ============ INSTRUCTION TEMPLATES ============ */
// Each block: {title, body}. Title is bolded with ** in output. Intro A has no title.
const INTRO_A = `The recording of today's session has been posted on Wise. Please complete the following worksheets using the PSM instructions posted in the PSMs modules.`;
const INTRO_B = {title:"Important Reminder:", body:"Please book your next session in advance, timing it for when you expect to have these PSMs completed. After completing the worksheets, check and mark your work according to the PSM instructions, then upload your marked work as a comment to this PSMs assignment."};
const ONENOTE_TXT = {title:"OneNote Instructions:", body:"Printouts of the worksheet have been added to the next session's page on OneNote for you to complete all of your work/annotations on. Please complete all of your work in black ink and check all answers with the answer keys provided below. Please use red ink for marks on your paper (correct/incorrect) and for stars on questions you had trouble on. Please make sure to leave room for us to work through problems you miss on each page."};
const WED_TXT = {title:"WellEd Labs Domain Assignment Instructions:", body:"Please complete assigned domain assignments on WellEd Labs. Use the instructions for WellEd Labs practice exams located in your Wise \"Full Practice Exam Instructions\" Module to login to the platform and make sure to toggle the assignments section in the top right of the page, so that you see the topic-specific assignments you are to complete.  https://ats.practicetest.io/sign-in"};
const VOCAB_TXT = {title:"WellEd Labs Vocab Instructions:", body:"Please complete assigned vocab flashcards and/or quizzes on WellEd Labs. Login to the platform using the instructions in your Wise \"Full Practice Exam Instructions\" Module and toggle to the Vocab section in the top right of the page, so that you see the vocab sets and quizzes you are to complete.  https://ats.practicetest.io/sign-in"};
const TIME_TXT = {title:"Time Drilling Instructions:", body:"Time limits are indicated in parentheses before each worksheet name. Please set a timer for the allotted minutes before beginning each worksheet and stop working when time expires. Mark any unfinished questions clearly so we can discuss them in the next session."};
const fmtInstr = (o)=>`**${o.title}** ${o.body}`;
// Convert our markdown-style `**bold**` output to safe HTML
const mdBoldToHtml = (text)=>{
  const esc = (s)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return esc(text||"")
    .split("\n")
    .map(line=>line.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>'))
    .map(line=>line.trim()===""?"<br/>":`<div>${line||"&nbsp;"}</div>`)
    .join("");
};

/* ============ STYLE HELPERS ============ */
/* Editorial primitives — all cards/inputs/buttons inherit the paper-and-ink system. */
const INP={border:"1px solid rgba(15,26,46,.18)",borderRadius:4,padding:"8px 12px",fontSize:13,outline:"none",width:"100%",background:"#fff",color:"#0F1A2E",fontFamily:"'IBM Plex Sans',system-ui,sans-serif"};
const CARD={background:"#fff",borderRadius:6,padding:18,boxShadow:"0 0 0 1px rgba(15,26,46,.08), 0 1px 2px rgba(15,26,46,.04)"};
const mkPill=(bg,fg)=>({background:bg,color:fg,borderRadius:3,padding:"2px 8px",fontSize:10,fontWeight:500,letterSpacing:.3,textTransform:"uppercase",fontFamily:"'IBM Plex Mono',monospace",display:"inline-block"});
const mkBtn=(bg,fg)=>({background:bg,color:fg,border:"1px solid transparent",borderRadius:4,padding:"8px 16px",fontSize:12,cursor:"pointer",fontWeight:500,letterSpacing:.2,fontFamily:"'IBM Plex Sans',system-ui,sans-serif"});

function Tag({c="#E9F0F6",t="#003258",children}){return <span style={mkPill(c,t)}>{children}</span>;}
function SH({children}){return <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 48',fontSize:11,fontWeight:600,color:"#66708A",textTransform:"uppercase",letterSpacing:1.6,marginBottom:10,paddingBottom:8,borderBottom:"1px solid rgba(15,26,46,.08)"}}>{children}</div>;}

function Toggle({on,set,label,sub}){
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>set(!on)}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 48',fontSize:15,fontWeight:600,color:"#0F1A2E",letterSpacing:-.1}}>{label}</div>
        {sub&&<div style={{fontSize:11,color:"#66708A",marginTop:2}}>{sub}</div>}
      </div>
      <div style={{width:38,height:22,borderRadius:11,background:on?B2:"rgba(15,26,46,.18)",position:"relative",transition:"background .2s",flexShrink:0,marginLeft:12,boxShadow:on?"inset 0 1px 2px rgba(0,50,88,.35)":"inset 0 1px 2px rgba(15,26,46,.12)"}}>
        <div style={{position:"absolute",top:2,left:on?18:2,width:18,height:18,borderRadius:9,background:"#FAF7F2",transition:"left .2s",boxShadow:"0 1px 2px rgba(15,26,46,.25)"}}/>
      </div>
    </div>
  );
}

/* ============ SAT SCORE CONVERSION TABLE ============ */
// From College Board Practice Test #4 scoring guide
// Indexed by raw score; each value is [lower, upper] of the scaled score range
const RW_TABLE = [[200,200],[200,200],[200,200],[200,200],[200,200],[200,200],[200,200],[200,210],[200,220],[210,230],[230,250],[240,260],[250,270],[260,280],[280,300],[290,310],[320,340],[340,360],[350,370],[360,380],[370,390],[370,390],[380,400],[390,410],[400,420],[410,430],[420,440],[420,440],[430,450],[440,460],[450,470],[460,480],[460,480],[470,490],[480,500],[490,510],[490,510],[500,520],[510,530],[520,540],[530,550],[540,560],[540,560],[550,570],[560,580],[570,590],[580,600],[590,610],[590,610],[600,620],[610,630],[620,640],[630,650],[630,650],[640,660],[650,670],[660,680],[670,690],[680,700],[690,710],[700,720],[710,730],[720,740],[730,750],[750,770],[770,790],[790,800]];
const MATH_TABLE = [[200,200],[200,200],[200,200],[200,200],[200,200],[200,200],[200,200],[200,220],[200,230],[220,250],[250,280],[280,310],[290,320],[300,330],[310,340],[320,350],[330,360],[330,360],[340,370],[350,380],[360,390],[370,400],[370,400],[380,410],[390,420],[400,430],[420,450],[430,460],[440,470],[460,490],[470,500],[480,510],[500,530],[510,540],[520,550],[530,560],[550,580],[560,590],[570,600],[580,610],[590,620],[600,630],[620,650],[630,660],[650,680],[670,700],[690,720],[710,740],[730,760],[740,770],[750,780],[760,790],[770,800],[780,800],[790,800]];
const scaleRW = (raw)=>{const r=Math.max(0,Math.min(66,raw|0));return RW_TABLE[r];};
const scaleMath = (raw)=>{const r=Math.max(0,Math.min(54,raw|0));return MATH_TABLE[r];};

/* ============ PDF DIAGNOSTIC PARSER ============ */
// Parses a ZipGrade SAT Diagnostic PDF, extracting the "Tag Name / Earn / Poss / %"
// table at the end. Handles multi-line tag names. Detects Reading / Math Mod 1 / Math Mod 2.
async function parseDiagnosticPdf(file){
  if(!window.pdfjsLib) throw new Error("pdf.js not loaded");
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({data:buf}).promise;
  let fullText = "";
  for(let p=1;p<=pdf.numPages;p++){
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.map(it=>({s:it.str,x:it.transform[4],y:it.transform[5]}));
    items.sort((a,b)=>(b.y-a.y)||(a.x-b.x));
    let lastY=null, line=[];
    const lines=[];
    items.forEach(it=>{
      if(lastY===null||Math.abs(it.y-lastY)>3){if(line.length)lines.push(line.join(" ").trim());line=[it.s];lastY=it.y;}
      else line.push(it.s);
    });
    if(line.length)lines.push(line.join(" ").trim());
    fullText += "\n" + lines.join("\n");
  }

  // Detect subject/module from the QUIZ NAME area (top of document + filename), not entire body.
  // Typical ZipGrade header has "Quiz: <name>" or the name on its own line near the top.
  const headerArea = fullText.slice(0, 800) + "\n" + (file.name || "");
  let subject="Unknown", module=null;
  const isMath = /\bmath\b|mathematics/i.test(headerArea);
  const isReading = /reading|writing|\br\s*&?\s*w\b|verbal|english/i.test(headerArea);
  // Module detection: look for "Mod", "Module", or " 1"/" 2" near "math"
  const modMatch = headerArea.match(/mod(?:ule)?\s*\.?\s*(\d)/i);
  if(isMath){
    subject = "Math";
    if(modMatch) module = Number(modMatch[1]);
    else if(/\b(m1|math1|math\s*1|part\s*1|section\s*1)\b/i.test(headerArea)) module = 1;
    else if(/\b(m2|math2|math\s*2|part\s*2|section\s*2)\b/i.test(headerArea)) module = 2;
  } else if(isReading){
    subject = "Reading & Writing";
  } else {
    // Fall back: if tag area is dominated by R&W domains, mark as R&W; else math
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
  // Some PDFs use "TAGGED QUESTIONS & QUIZ" or "TAGGED QUESTIONS" or similar header.
  const tagSplitIdx = fullText.search(/TAGGED\s*QUESTIONS/i);
  const tagSection = tagSplitIdx>=0 ? fullText.slice(tagSplitIdx) : "";
  const cleaned = tagSection.replace(/\s+/g," ").trim();
  const rows = [];
  const chunks = cleaned.split(/(?=!SAT\s)/g).filter(c=>c.trim().startsWith("!SAT"));
  for(const chunk of chunks){
    // Relaxed regex: allow fractional pct, optional trailing text, and different spacing
    const m = chunk.match(/^(!SAT\s+.+?)\s+(\d+)\s+(\d+)\s+([\d.]+)/);
    if(!m) continue;
    let name = m[1].replace(/^!SAT\s+/,"").replace(/\s*\(\d{4}\)\s*$/,"").replace(/\s+/g," ").trim();
    // Skip domain-only summary rows (they duplicate subskill roll-ups)
    // Only skip if we also found subskill rows for that domain
    rows.push({tag:name,earn:Number(m[2]),poss:Number(m[3]),pct:Number(m[4])});
  }
  // Debug: log parsed tags for troubleshooting
  if(rows.length) console.log("[PSM Parser] Extracted", rows.length, "tags:", rows.map(r=>`"${r.tag}" ${r.earn}/${r.poss}`));
  return {
    subject, module,
    percentCorrect: pctMatch?Number(pctMatch[1]):null,
    earned: earnedMatch?Number(earnedMatch[1]):null,
    possible: possMatch?Number(possMatch[1]):null,
    tags: rows,
    parsedAt: todayStr(),
    fileName: file.name,
  };
}

// Map parsed tag names to canonical domain/subdomain. Key is normalized lowercase, punctuation-light.
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
// Normalizer: lowercase, collapse non-alphanumeric to nothing, so tag lookup is tolerant
const normTag = (s)=>s.toLowerCase().replace(/\(2024\)/g,"").replace(/[^a-z0-9]/g,"");
const TAG_MAP = {};
Object.entries(_rawTagMap).forEach(([k,v])=>{
  const obj = v[1]==="domain" ? {subject:v[0],kind:"domain",name:v[2]} : {subject:v[0],kind:"sub",domain:v[2],name:v[3]};
  TAG_MAP[normTag(k)] = obj;
});

// Fuzzy tag lookup: exact match first, then partial contains, then keyword signature
function lookupTag(raw){
  const n = normTag(raw);
  if(TAG_MAP[n]) return TAG_MAP[n];
  // Substring match — try longest known key that's a substring of the normalized tag
  const keys = Object.keys(TAG_MAP).sort((a,b)=>b.length-a.length);
  for(const k of keys){ if(n.includes(k) || k.includes(n)) return TAG_MAP[k]; }
  // Keyword signature matching for common variants
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

// Build a student's diagnostic profile from parsed results.
// Math module 1 + module 2 are merged into one Math section; Reading is its own.
function buildDiagnosticProfile(parsedList){
  const domains={}, subs={};
  const sectionTotals = {"Reading & Writing":{earn:0,poss:0,count:0},"Math":{earn:0,poss:0,count:0}};
  // Track which domains have subskill data, so we can skip duplicate domain-level summary rows
  const domainsWithSubs = new Set();
  // First pass: identify which tags map to subskills
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
      if(!map){ console.warn("[PSM Parser] Unmapped diagnostic tag:", t.tag, `(${t.earn}/${t.poss})`); return; }
      // Add to subdomain slot AND roll up to domain slot
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
        // Only use domain-level row if we have NO sub-level data for it (avoids double-counting)
        const dKey = `${map.subject}|${map.name}`;
        if(domainsWithSubs.has(dKey)){
          console.log("[PSM Parser] Skipping domain-summary row (subs exist):", t.tag, t.earn+"/"+t.poss);
          return;
        }
        if(!domains[dKey]) domains[dKey]={earn:0,poss:0,subject:map.subject,domain:map.name,name:map.name};
        domains[dKey].earn += t.earn;
        domains[dKey].poss += t.poss;
      }
    });
  });
  const fmt=(rec)=>({...rec,pct:rec.poss?Math.round((rec.earn/rec.poss)*100):null});
  const domainArr = Object.values(domains).map(fmt);
  const subArr    = Object.values(subs).map(fmt);

  // Compute section/total scores if we have section totals
  const rw = sectionTotals["Reading & Writing"];
  const m  = sectionTotals["Math"];
  let rwScore=null, mathScore=null, totalLower=null, totalUpper=null;
  if(rw.count>0){ const s = scaleRW(rw.earn); rwScore = {earn:rw.earn,poss:rw.poss,lower:s[0],upper:s[1]}; }
  if(m.count>0){  const s = scaleMath(m.earn); mathScore = {earn:m.earn,poss:m.poss,lower:s[0],upper:s[1]}; }
  if(rwScore && mathScore){ totalLower = rwScore.lower + mathScore.lower; totalUpper = rwScore.upper + mathScore.upper; }
  return {domains:domainArr,subs:subArr,rwScore,mathScore,totalLower,totalUpper};
}

/* ============ WELLED SCORE REPORT PARSER ============ */
async function parseWelledReport(file){
  if(!window.pdfjsLib) throw new Error("pdf.js not loaded");
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({data:buf}).promise;
  let fullText = "";
  for(let i=1;i<=pdf.numPages;i++){
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    fullText += tc.items.map(it=>it.str).join(" ") + "\n";
  }
  const result = {fileName:file.name, raw:fullText, testName:null, testNumber:null, testedOn:null, totalScore:null, rwScore:null, mathScore:null, rawScores:{}, subskills:[], type:"full"};

  // Test name and number
  const tnMatch = fullText.match(/Test name[:\s]*(.+?)(?:\n|Tested)/i);
  if(tnMatch){
    result.testName = tnMatch[1].trim();
    const numMatch = result.testName.match(/Practice Test\s*#?\s*(\d+)/i);
    if(numMatch) result.testNumber = parseInt(numMatch[1]);
  }
  // Tested on date
  const tdMatch = fullText.match(/Tested on[:\s]*([\d\/\-]+)/i);
  if(tdMatch) result.testedOn = tdMatch[1].trim();

  // Total score
  const totalMatch = fullText.match(/TOTAL SCORE\s+(\d{3,4})/i);
  if(totalMatch) result.totalScore = parseInt(totalMatch[1]);

  // Section scores
  const rwMatch = fullText.match(/Reading and Writing\s+(\d{3})/i);
  if(rwMatch) result.rwScore = parseInt(rwMatch[1]);
  const mathMatch = fullText.match(/Math\s+(\d{3})/i);
  if(mathMatch) result.mathScore = parseInt(mathMatch[1]);

  // Determine type
  if(result.rwScore && !result.mathScore) result.type = "rw-only";
  else if(result.mathScore && !result.rwScore) result.type = "math-only";
  else result.type = "full";

  // Raw scores per module
  const modRx = /Module\s*(\d)\s*(?:\(([^)]+)\))?\s*:\s*(\d+)\s*\/\s*(\d+)/gi;
  let mm;
  while((mm=modRx.exec(fullText))!==null){
    const key = `Module ${mm[1]}${mm[2]?" ("+mm[2]+")":""}`;
    result.rawScores[key] = {correct:parseInt(mm[3]),total:parseInt(mm[4])};
  }
  const totalRaw = fullText.match(/Total\s*:\s*(\d+)\s*\/\s*(\d+)/i);
  if(totalRaw) result.rawScores["Total"] = {correct:parseInt(totalRaw[1]),total:parseInt(totalRaw[2])};

  // Subskill breakdown: "Words in Context 10/12" pattern
  const skillRx = /([A-Z][A-Za-z &\-,]+?)\s+(\d+)\s*\/\s*(\d+)/g;
  let sm;
  const skipPatterns = /^(Module|Total|Reading|Math|TOTAL|SECTION|Raw|Test|Name|Tested)/;
  while((sm=skillRx.exec(fullText))!==null){
    const name = sm[1].trim();
    if(!skipPatterns.test(name) && name.length>3 && name.length<60){
      result.subskills.push({name, earn:parseInt(sm[2]), poss:parseInt(sm[3])});
    }
  }
  return result;
}

/* ============ HEAT COLORS ============ */
const heatColorPct = (pct)=>{
  if(pct===null||pct===undefined) return "#f1f5f9";
  if(pct>=85) return "#15803d";
  if(pct>=70) return "#65a30d";
  if(pct>=55) return "#ca8a04";
  if(pct>=40) return "#ea580c";
  return "#dc2626";
};

/* ============ FIRESTORE HELPERS ============ */
// Firestore is initialized in the HTML shell as window.db
// We use a single document "psm-data/main" to store all app data
// This keeps things simple — one real-time listener, one write target
const FS_DOC = "psm-data/main";
const fsRef = ()=> window.db ? window.db.doc(FS_DOC) : null;
// Write to Firestore (debounced to avoid rapid writes)
let _fsWriteTimer = null;
const fsWrite = (data)=>{
  const ref = fsRef();
  if(!ref) return;
  if(_fsWriteTimer) clearTimeout(_fsWriteTimer);
  _fsWriteTimer = setTimeout(()=>{
    ref.set(data, {merge:true}).catch(e=>console.warn("[Firestore] write error:", e));
  }, 800);
};

/* ============ AUTH GATE ============ */
// Workspace-only Google sign-in. The firestore.rules enforce the same
// domain check server-side — this component is UX, not security.
const ATS_DOMAIN = "affordabletutoringsolutions.org";

function SignInScreen({onSignIn, error, busy}){
  return (
    <div style={{
      minHeight:"100vh",background:"var(--paper)",display:"flex",
      alignItems:"center",justifyContent:"center",padding:"40px 24px",
      backgroundImage:"radial-gradient(circle at 20% 10%, rgba(0,74,121,.06), transparent 45%), radial-gradient(circle at 80% 80%, rgba(154,91,31,.05), transparent 45%)"
    }}>
      <div style={{
        maxWidth:480,width:"100%",background:"var(--card)",
        border:"1px solid var(--rule)",borderRadius:14,
        boxShadow:"var(--shadow-lg)",padding:"44px 44px 36px",position:"relative",overflow:"hidden"
      }}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:"linear-gradient(90deg,var(--brand) 0,var(--brand) 72px,transparent 72px)"}}/>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:28}}>
          <img src="ats_logo.png" alt="ATS" style={{width:48,height:48,borderRadius:11,boxShadow:"0 0 0 1px var(--rule-strong), 0 6px 16px -8px rgba(0,74,121,.45)"}}/>
          <div>
            <div style={{fontFamily:"var(--font-body)",fontSize:10,fontWeight:600,letterSpacing:"0.18em",textTransform:"uppercase",color:"var(--ink-mute)",marginBottom:4}}>Affordable Tutoring Solutions</div>
            <div style={{fontFamily:"var(--font-display)",fontVariationSettings:"'opsz' 144, 'SOFT' 20",fontWeight:600,fontSize:26,letterSpacing:"-0.02em",lineHeight:1.05,color:"var(--ink)"}}>PSM <em style={{fontStyle:"italic",color:"var(--brand)",fontWeight:500}}>Generator</em></div>
          </div>
        </div>
        <h2 style={{fontFamily:"var(--font-display)",fontVariationSettings:"'opsz' 72",fontWeight:500,fontSize:22,margin:"0 0 10px",letterSpacing:"-0.01em"}}>Tutor sign-in</h2>
        <p style={{fontSize:13.5,lineHeight:1.55,color:"var(--ink-soft)",margin:"0 0 26px"}}>
          Access is limited to verified <span style={{fontFamily:"var(--font-mono)",fontSize:12.5,color:"var(--ink)"}}>@{ATS_DOMAIN}</span> accounts. Student records are protected by this sign-in.
        </p>
        <button
          onClick={onSignIn}
          disabled={busy}
          style={{
            width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:12,
            padding:"14px 20px",borderRadius:10,border:"1px solid var(--brand)",
            background:busy?"var(--paper-alt)":"var(--brand)",color:busy?"var(--ink-mute)":"var(--paper)",
            fontFamily:"var(--font-body)",fontSize:14,fontWeight:500,letterSpacing:"0.01em",
            cursor:busy?"default":"pointer",boxShadow:busy?"none":"0 6px 18px -10px rgba(0,74,121,.7)"
          }}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#fff" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#fff" opacity=".95" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#fff" opacity=".85" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#fff" opacity=".75" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
          </svg>
          <span>{busy ? "Opening Google…" : "Continue with Google"}</span>
        </button>
        {error && (
          <div style={{
            marginTop:18,padding:"12px 14px",borderRadius:8,
            background:"var(--accent-soft)",border:"1px solid rgba(154,91,31,.3)",
            fontSize:12.5,color:"var(--accent)",lineHeight:1.5
          }}>{error}</div>
        )}
        <div style={{marginTop:28,paddingTop:18,borderTop:"1px solid var(--rule)",fontSize:11,color:"var(--ink-mute)",letterSpacing:"0.01em",lineHeight:1.6}}>
          Need an account? Contact your workspace admin. Personal Gmail accounts will be denied.
        </div>
      </div>
    </div>
  );
}

function App(){
  const [authUser, setAuthUser] = useState(()=>window.auth ? window.auth.currentUser : null);
  const [authReady, setAuthReady] = useState(false);
  const [signInError, setSignInError] = useState("");
  const [signInBusy, setSignInBusy] = useState(false);

  useEffect(()=>{
    if(!window.auth){ setAuthReady(true); return; }
    const unsub = window.auth.onAuthStateChanged((u)=>{
      if(u){
        const email = (u.email||"").toLowerCase();
        if(!email.endsWith("@"+ATS_DOMAIN) || !u.emailVerified){
          // Workspace check failed — immediately sign out and surface error.
          window.auth.signOut();
          setSignInError(`Access restricted to verified @${ATS_DOMAIN} accounts. You signed in as ${email||"an unknown account"}.`);
          setAuthUser(null);
        } else {
          setSignInError("");
          setAuthUser(u);
        }
      } else {
        setAuthUser(null);
      }
      setAuthReady(true);
      setSignInBusy(false);
    });
    return ()=>unsub();
  },[]);

  const handleSignIn = async ()=>{
    if(!window.auth){ setSignInError("Auth not initialized."); return; }
    setSignInBusy(true);
    setSignInError("");
    try{
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({hd: ATS_DOMAIN, prompt:"select_account"});
      await window.auth.signInWithPopup(provider);
    }catch(e){
      setSignInBusy(false);
      if(e && e.code === "auth/popup-closed-by-user"){ setSignInError(""); return; }
      if(e && e.code === "auth/cancelled-popup-request"){ return; }
      setSignInError(e && e.message ? e.message : "Sign-in failed. Try again.");
    }
  };

  const handleSignOut = ()=>{
    if(!window.auth) return;
    window.auth.signOut();
  };

  if(!authReady){
    return (
      <div style={{minHeight:"100vh",background:"var(--paper)",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{fontFamily:"var(--font-display)",fontSize:18,color:"var(--ink-mute)"}} className="pl">Loading…</div>
      </div>
    );
  }

  if(!authUser){
    return <SignInScreen onSignIn={handleSignIn} error={signInError} busy={signInBusy}/>;
  }

  return <AppInner authUser={authUser} onSignOut={handleSignOut}/>;
}

/* ============ APP (authenticated inner) ============ */
function AppInner({authUser, onSignOut}){
  const[tab,setTab]=useState("generator");
  const[students,setStudents]=useState(()=>sLoad("psm_v4",sLoad("psm_v3",[])));
  const[selSt,setSelSt]=useState("");
  const[cloudStatus,setCloudStatus]=useState("connecting"); // connecting | synced | offline
  // Filters
  const[subjF,setSubjF]=useState("All");
  const[domF,setDomF]=useState("All");
  const[sdomF,setSdomF]=useState("All");
  const[diffF,setDiffF]=useState("All");
  const[srch,setSrch]=useState("");
  // Selections
  const[chk,setChk]=useState({});            // worksheet id -> true
  const[evenOdd,setEvenOdd]=useState({});    // worksheet id -> "" | "EVEN" | "ODD"
  const[weChk,setWeChk]=useState({});        // welled domain id -> true
  const[vocabChk,setVocabChk]=useState({});  // vocab id -> true
  // Toggles
  const[examType,setExamType]=useState("SAT"); // "SAT" | "PSAT"
  const[timeDrill,setTimeDrill]=useState(false);
  const[timeLims,setTimeLims]=useState({});
  const[oneNote,setOneNote]=useState(false);
  const[weDomEn,setWeDomEn]=useState(false);  // WellEd Domain assignments enable
  const[vocabEn,setVocabEn]=useState(false);
  const[addBB,setAddBB]=useState(false);
  const[bbType,setBbType]=useState("full");
  const[bbCnt,setBbCnt]=useState(1);
  const[addWE,setAddWE]=useState(false);
  const[weType,setWeType]=useState("full");
  const[weCnt,setWeCnt]=useState(1);
  // Output
  const[output,setOutput]=useState("");
  const[copied,setCopied]=useState(false);
  // Students / profile
  const[profile,setProfile]=useState(null);
  const[showAdd,setShowAdd]=useState(false);
  // Wise CSV import staging — null = no import in progress, object = preview dialog open.
  const[wiseImport,setWiseImport]=useState(null);
  const wiseInputRef=useRef(null);
  const[newS,setNewS]=useState({name:"",grade:"",tutor:"",notes:""});
  const[ptab,setPtab]=useState("history");
  const[paChk,setPaChk]=useState({});
  const[paSubj,setPaSubj]=useState("All");
  const[paSrch,setPaSrch]=useState("");
  const[paDate,setPaDate]=useState(todayStr());
  const[paWeChk,setPaWeChk]=useState({});   // pre-assign WellEd domain checks
  const[paBBNums,setPaBBNums]=useState("");  // comma-separated BlueBook test numbers
  const[paWENums,setPaWENums]=useState("");  // comma-separated WellEd test numbers
  const[sfm,setSfm]=useState({date:todayStr(),testType:"",score:"",maxScore:"",notes:""});
  const[toast,setToast]=useState("");
  const[parsing,setParsing]=useState(false);
  const diagInputRef = useRef(null);
  const welledInputRef = useRef(null);
  // Custom assignments
  const[customAssignments,setCustomAssignments]=useState(()=>sLoad("psm_custom_asg",[]));

  // Track whether current state came from Firestore (prevent write-back loops)
  const _fromFirestore = useRef(false);

  // ── Firestore real-time sync ──
  useEffect(()=>{
    const ref = fsRef();
    if(!ref){
      setCloudStatus("offline");
      console.log("[Firestore] No db available, using localStorage only");
      return;
    }
    // Subscribe to real-time updates
    const unsub = ref.onSnapshot((snap)=>{
      if(snap.exists){
        const data = snap.data();
        _fromFirestore.current = true;
        if(data.students) setStudents(data.students);
        if(data.customAssignments) setCustomAssignments(data.customAssignments);
        _fromFirestore.current = false;
        setCloudStatus("synced");
        // Also update localStorage as offline cache
        if(data.students) sSave("psm_v4", data.students);
        if(data.customAssignments) sSave("psm_custom_asg", data.customAssignments);
      } else {
        // Firestore doc doesn't exist yet — seed from localStorage (migration)
        console.log("[Firestore] No cloud data found, seeding from localStorage...");
        const localStudents = sLoad("psm_v4", sLoad("psm_v3", []));
        const localCustom = sLoad("psm_custom_asg", []);
        ref.set({students: localStudents, customAssignments: localCustom})
          .then(()=>{console.log("[Firestore] Seeded successfully"); setCloudStatus("synced");})
          .catch(e=>{console.warn("[Firestore] Seed failed:", e); setCloudStatus("offline");});
      }
    }, (err)=>{
      console.warn("[Firestore] Listen error:", err);
      setCloudStatus("offline");
    });
    return ()=>unsub();
  }, []);

  // ── Write to Firestore on state changes (skip if change came from Firestore) ──
  useEffect(()=>{
    if(_fromFirestore.current) return;
    sSave("psm_v4", students); // always cache locally
    fsWrite({students});
  },[students]);

  useEffect(()=>{
    if(_fromFirestore.current) return;
    sSave("psm_custom_asg", customAssignments);
    fsWrite({customAssignments});
  },[customAssignments]);

  const showToast=(msg)=>{setToast(msg);setTimeout(()=>setToast(""),2500);};

  /* ============ FILTERED LISTS ============ */
  const availDoms=useMemo(()=>{const s=new Set();ALL_WS.forEach(ws=>{if(subjF==="All"||ws.subject===subjF)s.add(ws.domain);});return[...s];},[subjF]);
  const availSdoms=useMemo(()=>{const s=new Set();ALL_WS.forEach(ws=>{if((subjF==="All"||ws.subject===subjF)&&(domF==="All"||ws.domain===domF))s.add(ws.subdomain);});return[...s].sort((a,b)=>{const ac=a.startsWith("Comprehensive ")?0:1;const bc=b.startsWith("Comprehensive ")?0:1;return ac-bc||a.localeCompare(b);});},[subjF,domF]);

  const filtWS=useMemo(()=>ALL_WS.filter(ws=>{
    if(subjF!=="All"&&ws.subject!==subjF)return false;
    if(domF!=="All"&&ws.domain!==domF)return false;
    if(sdomF!=="All"&&ws.subdomain!==sdomF)return false;
    if(diffF!=="All"&&ws.difficulty!==diffF)return false;
    if(srch&&!ws.title.toLowerCase().includes(srch.toLowerCase()))return false;
    return true;
  }),[subjF,domF,sdomF,diffF,srch]);

  // Group by subject -> domain -> subdomain, with Comprehensive (domain-level) first
  const grouped=useMemo(()=>{
    const bySubj={};
    filtWS.forEach(ws=>{
      if(!bySubj[ws.subject]) bySubj[ws.subject]={};
      if(!bySubj[ws.subject][ws.domain]) bySubj[ws.subject][ws.domain]={};
      if(!bySubj[ws.subject][ws.domain][ws.subdomain]) bySubj[ws.subject][ws.domain][ws.subdomain]=[];
      bySubj[ws.subject][ws.domain][ws.subdomain].push(ws);
    });
    // Sort each sheet list by difficulty order
    Object.values(bySubj).forEach(doms=>Object.values(doms).forEach(subs=>Object.values(subs).forEach(arr=>arr.sort((a,b)=>DIFF_ORDER.indexOf(a.difficulty)-DIFF_ORDER.indexOf(b.difficulty)))));
    return bySubj;
  },[filtWS]);

  const selWS = useMemo(()=>ALL_WS.filter(ws=>chk[ws.id]),[chk]);
  const selWeDom = useMemo(()=>WE_DOMAIN_ITEMS.filter(i=>weChk[i.id]),[weChk]);
  const selVocab = useMemo(()=>VOCAB_ITEMS.filter(i=>vocabChk[i.id]),[vocabChk]);

  // LIVE QUESTION COUNTER
  const totalQs = useMemo(()=>{
    let t = selWS.reduce((n,ws)=>n+(ws.qs||0),0);
    t += selWeDom.reduce((n,i)=>n+(i.qs||0),0);
    // Practice exams
    if(addBB){t += bbCnt * (bbType==="full" ? 98 : 49);}  // 54 R&W + 44 Math per full
    if(addWE){t += weCnt * (weType==="full" ? 98 : 49);}
    return t;
  },[selWS,selWeDom,addBB,bbCnt,bbType,addWE,weCnt,weType]);

  // visibleStudents is the deep-filtered view used for all display. Raw `students`
  // still contains soft-deleted records so the Trash tab can show them and mutations
  // keep working against the full array.
  const visibleStudents = useMemo(()=>live(students).map(st=>({
    ...st,
    assignments: live(st.assignments),
    scores: live(st.scores),
    welledLogs: live(st.welledLogs),
    diagnostics: live(st.diagnostics),
  })),[students]);
  const curStudent = visibleStudents.find(st=>st.id===selSt);

  // Heat Map domains (from assignments)
  const heatDoms = useMemo(()=>[...new Set(ALL_WS.map(ws=>ws.domain))],[]);
  const getHV = (st,d)=>(st.assignments||[]).reduce((n,a)=>n+(a.worksheets||[]).filter(w=>w.domain===d).length,0);
  const heatMax = useMemo(()=>visibleStudents.reduce((mx,st)=>heatDoms.reduce((m,d)=>Math.max(m,getHV(st,d)),mx),1),[visibleStudents,heatDoms]);
  const heatC = (v)=>{if(!v)return"#f1f5f9";const i=v/heatMax;return i<.25?"#bfdbfe":i<.5?"#60a5fa":i<.75?"#3b82f6":"#1d4ed8";};

  /* ============ GENERATE OUTPUT ============ */
  const generate = ()=>{
    const lines = [];
    // Intro paragraphs (always). Plain text, no decorative borders.
    lines.push(INTRO_A);
    lines.push("");
    lines.push(fmtInstr(INTRO_B));
    if(oneNote){ lines.push(""); lines.push(fmtInstr(ONENOTE_TXT)); }
    if(timeDrill){ lines.push(""); lines.push(fmtInstr(TIME_TXT)); }
    if(weDomEn && selWeDom.length){ lines.push(""); lines.push(fmtInstr(WED_TXT)); }
    if(vocabEn && selVocab.length){ lines.push(""); lines.push(fmtInstr(VOCAB_TXT)); }

    // WellEd Domain Assignments block
    if(weDomEn && selWeDom.length){
      lines.push("");
      lines.push("**WellEd Domain Assignments:**");
      selWeDom.forEach(i=>lines.push(i.label));
    }
    // Vocab block
    if(vocabEn && selVocab.length){
      lines.push("");
      lines.push("**Vocab Assignments:**");
      selVocab.forEach(i=>lines.push(i.label));
    }
    // Practice Exams block
    if(addBB||addWE){
      lines.push("");
      lines.push("**Practice Exams:**");
      if(addBB){
        const bbNums = nextExamNumbers(curStudent,"BlueBook",bbCnt);
        bbNums.forEach(n=>{
          lines.push(`Please complete Practice Exam # ${n} on BlueBook (College Board) using the instructions for BlueBook (College Board) practice exams located in your Wise "Full Practice Exam Instructions" Module -  https://bluebook.app.collegeboard.org/.  Be sure to follow instructions regarding screenshots of missed questions!`);
        });
      }
      if(addWE){
        const weNums = nextExamNumbers(curStudent,"WellEd",weCnt);
        weNums.forEach(n=>{
          lines.push(`Please complete Practice Exam # ${n} on WellEd Labs using the instructions for WellEd Labs practice exams located in your Wise "Full Practice Exam Instructions" Module - https://ats.practicetest.io/sign-in.`);
        });
      }
    }

    // Student Forms (flat list, STU_ prefix, .pdf suffix, URL appended)
    if(selWS.length>0){
      lines.push("");
      lines.push("**Student Forms:**");
      selWS.forEach(ws=>{
        const eo = evenOdd[ws.id] ? ` (${evenOdd[ws.id]})` : "";
        const tl = timeDrill && timeLims[ws.id] ? `(${timeLims[ws.id]} min) ` : "";
        lines.push(`${tl}STU_${ws.title}.pdf${eo} - ${ws.stu||"[LINK PENDING]"}`);
      });

      // Answer Keys
      lines.push("");
      lines.push("**Answer Keys:**");
      selWS.forEach(ws=>{
        lines.push(`KEY_${ws.title}.pdf - ${ws.key||"[LINK PENDING]"}`);
      });
    }

    setOutput(lines.join("\n"));

    // Save to student profile
    if(curStudent){
      const weEntries = selWeDom.map(i=>({kind:"welled_domain",subject:i.subject,domain:i.domain,difficulty:i.difficulty,label:i.label,qs:i.qs}));
      const vocabEntries = selVocab.map(i=>({kind:i.kind,name:i.name,variant:i.variant||null,label:i.label}));
      const bbNums = addBB ? nextExamNumbers(curStudent,"BlueBook",bbCnt) : [];
      const weNums = addWE ? nextExamNumbers(curStudent,"WellEd",weCnt) : [];
      const entry={
        id:uid(),
        date:todayStr(),
        preAssigned:false,
        examType,
        worksheets:selWS.map(ws=>({id:ws.id,title:ws.title,subject:ws.subject,domain:ws.domain,subdomain:ws.subdomain,difficulty:ws.difficulty,qs:ws.qs,evenOdd:evenOdd[ws.id]||null,timeLimit:timeDrill?timeLims[ws.id]||null:null})),
        welledDomain:weEntries,
        vocab:vocabEntries,
        practiceExams:[
          ...(addBB?bbNums.map(n=>({platform:"BlueBook",type:bbType,number:n,examType})) :[]),
          ...(addWE?weNums.map(n=>({platform:"WellEd",type:weType,number:n,examType})) :[]),
        ],
        timeDrill,oneNote,
      };
      if(selWS.length>0 || weEntries.length>0 || vocabEntries.length>0 || addBB || addWE){
        setStudents(prev=>prev.map(st=>st.id===curStudent.id?{...st,assignments:[...(st.assignments||[]),entry]}:st));
        showToast(`Saved to ${curStudent.name}'s profile`);
      }
    }
  };

  // Returns an array of exam numbers to assign next (avoiding already-used numbers)
  function nextExamNumbers(student,platform,count){
    const used = new Set();
    (student?.assignments||[]).forEach(a=>{
      (a.practiceExams||[]).forEach(ex=>{
        if(ex.platform===platform && ex.number) used.add(ex.number);
      });
    });
    const out=[];
    let n=1;
    while(out.length<count){
      if(!used.has(n)){out.push(n);used.add(n);}
      n++;
    }
    return out;
  }

  const copyOut=()=>{if(!output)return;navigator.clipboard.writeText(output).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});};
  const copyRichOut=()=>{
    if(!output)return;
    const html = mdBoldToHtml(output);
    const plain = output.replace(/\*\*/g,"");
    try{
      const item = new ClipboardItem({
        "text/html": new Blob([`<div style="font-family:Segoe UI,system-ui,sans-serif;font-size:13px;line-height:1.55;">${html}</div>`],{type:"text/html"}),
        "text/plain": new Blob([plain],{type:"text/plain"}),
      });
      navigator.clipboard.write([item]).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);showToast("Copied with formatting");});
    }catch(err){
      // Fallback: copy plain
      navigator.clipboard.writeText(plain).then(()=>showToast("Copied (plain)"));
    }
  };
  const downloadPdf=async()=>{
    if(!output){showToast("Nothing to export");return;}
    if(!window.jspdf){showToast("PDF library not loaded");return;}
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({unit:"pt",format:"letter"});
    const margin = 54, pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
    const wrapW = pageW - margin*2;
    // ATS brand colors
    const ATS_NAVY = [0,74,121]; // #004a79
    const ATS_BLUE = [0,74,151]; // #004a97
    const ATS_GRAY = [100,116,139]; // #64748b
    const ATS_TEXT = [30,41,59]; // #1e293b
    let y = margin;
    // Try to load ATS logos (icon + horizontal)
    let iconData = null, horizData = null;
    const loadImg = (url)=>new Promise((resolve)=>{
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload=()=>{
        try{
          const c = document.createElement("canvas");
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext("2d").drawImage(img,0,0);
          resolve(c.toDataURL("image/png"));
        }catch{resolve(null);}
      };
      img.onerror=()=>resolve(null);
      img.src=url;
      setTimeout(()=>resolve(null), 4000);
    });
    [iconData, horizData] = await Promise.all([
      loadImg("https://www.affordabletutoringsolutions.org/__static/a5b47adc-5f67-4265-b84a-f8af839f6a17/image_desktop"),
      loadImg("https://www.affordabletutoringsolutions.org/__static/jdj5jdewjge5r21lmvdyu0vwztrzwdzy/ATS-Horiz-Logo(2)")
    ]);

    // ── Header on first page ──
    // Navy header bar
    doc.setFillColor(...ATS_NAVY);
    doc.rect(0, 0, pageW, 72, "F");
    // Logo: prefer horizontal logo, fallback to icon + text, fallback to text only
    let logoX = margin;
    if(horizData){
      try{doc.addImage(horizData,"PNG",margin,10,180,52); logoX=margin+186;}catch(e){}
    }
    if(logoX===margin && iconData){
      try{doc.addImage(iconData,"PNG",margin,10,48,48); logoX=margin+54;}catch(e){}
    }
    if(logoX===margin){
      // Pure text fallback
      doc.setFontSize(18); doc.setFont("helvetica","bold"); doc.setTextColor(255,255,255);
      doc.text("Affordable Tutoring Solutions", margin, 42);
    } else {
      // Add text beside logo
      doc.setFontSize(14); doc.setFont("helvetica","bold"); doc.setTextColor(255,255,255);
      doc.text("Affordable Tutoring Solutions", logoX, 34);
      doc.setFontSize(9); doc.setFont("helvetica","normal"); doc.setTextColor(200,220,240);
      doc.text("PSM Assignment", logoX, 48);
    }
    // Tagline on right
    doc.setFontSize(8); doc.setFont("helvetica","italic"); doc.setTextColor(200,220,240);
    doc.text("Making Quality Education Accessible to All", pageW-margin, 30, {align:"right"});
    // Student info below bar
    y = 92;
    const studentName = curStudent?.name || "";
    doc.setFontSize(13); doc.setFont("helvetica","bold"); doc.setTextColor(...ATS_NAVY);
    doc.text(`${studentName ? studentName + " — " : ""}PSM Assignment`, margin, y); y += 16;
    doc.setFontSize(10); doc.setFont("helvetica","normal"); doc.setTextColor(...ATS_GRAY);
    doc.text(`Date: ${todayStr()}`, margin, y); y += 14;
    // Total question count
    doc.setFontSize(10); doc.setFont("helvetica","normal"); doc.setTextColor(...ATS_GRAY);
    doc.text(`Total Questions: ${totalQs||"N/A"}`, margin, y); y += 14;
    // Decorative navy rule
    doc.setDrawColor(...ATS_NAVY); doc.setLineWidth(1.5);
    doc.line(margin, y, pageW-margin, y); y += 16;

    // ── Body ──
    doc.setTextColor(...ATS_TEXT);
    const paras = output.split("\n");
    paras.forEach(raw=>{
      if(raw.trim()===""){ y += 6; return; }
      const isHeader = /^\*\*[^*]+\*\*\s*$/.test(raw.trim()) || /^\*\*[^*]+:\*\*/.test(raw.trim());
      const segments = [];
      const rx = /\*\*([^*]+)\*\*/g;
      let lastIdx = 0, m;
      while((m = rx.exec(raw))!==null){
        if(m.index>lastIdx) segments.push({bold:false,text:raw.slice(lastIdx,m.index)});
        segments.push({bold:true,text:m[1]});
        lastIdx = m.index + m[0].length;
      }
      if(lastIdx<raw.length) segments.push({bold:false,text:raw.slice(lastIdx)});
      const fullText = segments.map(s=>s.text).join("");
      doc.setFontSize(isHeader?12:10);
      doc.setFont("helvetica", isHeader?"bold":"normal");
      if(isHeader) doc.setTextColor(...ATS_NAVY);
      else doc.setTextColor(...ATS_TEXT);
      const lines = doc.splitTextToSize(fullText, wrapW);
      lines.forEach(line=>{
        if(y > pageH - 60){ doc.addPage(); y = margin; }
        // Check for URLs in the line and render with clickable links
        const urlRx = /(https?:\/\/[^\s]+)/g;
        const urlMatch = line.match(urlRx);
        if(urlMatch && lines.length<=2 && !segments.some(s=>s.bold)){
          // Render line with clickable URL parts
          let lx = margin;
          let remaining = line;
          let um;
          const urlRx2 = /(https?:\/\/[^\s]+)/g;
          let lastI = 0;
          while((um=urlRx2.exec(remaining))!==null){
            if(um.index>lastI){
              const pre = remaining.slice(lastI,um.index);
              doc.setTextColor(...ATS_TEXT);
              doc.text(pre, lx, y);
              lx += doc.getTextWidth(pre);
            }
            doc.setTextColor(0,102,204);
            doc.textWithLink(um[1], lx, y, {url:um[1]});
            lx += doc.getTextWidth(um[1]);
            lastI = um.index + um[1].length;
          }
          if(lastI<remaining.length){
            doc.setTextColor(...ATS_TEXT);
            doc.text(remaining.slice(lastI), lx, y);
          }
        } else if(segments.some(s=>s.bold) && lines.length===1){
          let x = margin;
          segments.forEach(seg=>{
            doc.setFont("helvetica", seg.bold?"bold":"normal");
            if(seg.bold) doc.setTextColor(...ATS_NAVY); else doc.setTextColor(...ATS_TEXT);
            doc.text(seg.text, x, y);
            x += doc.getTextWidth(seg.text);
          });
        } else {
          doc.text(line, margin, y);
        }
        y += isHeader?15:13;
      });
      y += 2;
    });

    // ── Footer on every page ──
    const pageCount = doc.getNumberOfPages();
    for(let i=1;i<=pageCount;i++){
      doc.setPage(i);
      // Navy footer bar
      doc.setFillColor(...ATS_NAVY);
      doc.rect(0, pageH-36, pageW, 36, "F");
      doc.setFontSize(7.5); doc.setFont("helvetica","normal"); doc.setTextColor(255,255,255);
      doc.text("Affordable Tutoring Solutions Inc.  ·  Melbourne, FL  ·  Winter Park, FL  ·  Baltimore, MD", margin, pageH-16);
      doc.text("+1 (321) 341-9820  ·  support@affordabletutoringsolutions.org", margin, pageH-8);
      doc.text(`Page ${i} / ${pageCount}`, pageW-margin, pageH-12, {align:"right"});
    }
    const safeName = (studentName||"student").replace(/[^a-zA-Z0-9-_]/g,"_");
    doc.save(`PSM_${safeName}_${todayStr()}.pdf`);
    showToast("PDF downloaded");
  };
  const addStudent=()=>{if(!newS.name.trim())return;setStudents(prev=>[...prev,{...newS,id:uid(),dateAdded:todayStr(),assignments:[],scores:[],diagnostics:[]}]);setNewS({name:"",grade:"",tutor:"",notes:""});setShowAdd(false);showToast("Student added");};
  const openProfile=(st)=>{setProfile(st);setPtab("history");setPaChk({});setPaSubj("All");setPaSrch("");setSfm({date:todayStr(),testType:"",score:"",maxScore:"",notes:""});setTab("students");};

  const savePreAssign=()=>{
    const ids=Object.keys(paChk).filter(k=>paChk[k]);
    const weIds=Object.keys(paWeChk).filter(k=>paWeChk[k]);
    const bbArr=(paBBNums||"").split(/[,\s]+/).map(Number).filter(n=>n>0);
    const weArr=(paWENums||"").split(/[,\s]+/).map(Number).filter(n=>n>0);
    if(!ids.length&&!weIds.length&&!bbArr.length&&!weArr.length)return;
    const sheets=ALL_WS.filter(ws=>ids.includes(ws.id));
    const weEntries=WE_DOMAIN_ITEMS.filter(i=>weIds.includes(i.id)).map(i=>({kind:"welled_domain",subject:i.subject,domain:i.domain,difficulty:i.difficulty,label:i.label,qs:i.qs}));
    const practiceExams=[
      ...bbArr.map(n=>({platform:"BlueBook",type:"full",number:n,examType})),
      ...weArr.map(n=>({platform:"WellEd",type:"full",number:n,examType})),
    ];
    const entry={id:uid(),date:paDate||todayStr(),preAssigned:true,examType,worksheets:sheets.map(ws=>({id:ws.id,title:ws.title,subject:ws.subject,domain:ws.domain,subdomain:ws.subdomain,difficulty:ws.difficulty,qs:ws.qs})),welledDomain:weEntries,vocab:[],practiceExams,timeDrill:false,oneNote:false};
    const upd=students.map(st=>st.id===profile.id?{...st,assignments:[...(st.assignments||[]),entry]}:st);
    const totalItems=ids.length+weIds.length+bbArr.length+weArr.length;
    setStudents(upd);setProfile(upd.find(st=>st.id===profile.id));setPaChk({});setPaWeChk({});setPaBBNums("");setPaWENums("");showToast(`${totalItems} item(s) pre-assigned`);
  };
  const addScore=()=>{if(!sfm.testType||!sfm.score)return;const entry={...sfm,id:uid()};const upd=students.map(st=>st.id===profile.id?{...st,scores:[...(st.scores||[]),entry]}:st);setStudents(upd);setProfile(upd.find(st=>st.id===profile.id));setSfm({date:todayStr(),testType:"",score:"",maxScore:"",notes:""});showToast("Score recorded");};
  // Soft-delete — items stay in the array with deleted:true and deletedAt,
  // filtered out of display via live(). Restore + hard-delete live in the Trash tab.
  const delScore=(sid)=>{const upd=students.map(st=>st.id===profile.id?{...st,scores:(st.scores||[]).map(sc=>sc.id===sid?softDel(sc):sc)}:st);setStudents(upd);setProfile(upd.find(st=>st.id===profile.id));showToast("Score moved to Trash");};
  // Standalone WellEd Domain score logs — continuous tracking per subdomain outside of assignment history
  const addWelledLog=(log)=>{
    const entry = {...log,id:uid()};
    const upd = students.map(st=>st.id===profile.id?{...st,welledLogs:[...(st.welledLogs||[]),entry]}:st);
    setStudents(upd); setProfile(upd.find(st=>st.id===profile.id));
    showToast("WellEd domain score logged");
  };
  const delWelledLog=(lid)=>{
    const upd = students.map(st=>st.id===profile.id?{...st,welledLogs:(st.welledLogs||[]).map(l=>l.id===lid?softDel(l):l)}:st);
    setStudents(upd); setProfile(upd.find(st=>st.id===profile.id));
    showToast("Log moved to Trash");
  };
  const delAsg=(aid)=>{const upd=students.map(st=>st.id===profile.id?{...st,assignments:(st.assignments||[]).map(a=>a.id===aid?softDel(a):a)}:st);setStudents(upd);setProfile(upd.find(st=>st.id===profile.id));showToast("Assignment moved to Trash");};
  const delStudent=(id)=>{
    if(!confirm("Move this student to Trash? You can restore them later from the Trash tab.")) return;
    setStudents(prev=>prev.map(st=>st.id===id?softDel(st):st));
    if(profile?.id===id) setProfile(null);
    showToast("Student moved to Trash");
  };

  // Restore / hard-delete operations used by the Trash tab.
  const restoreStudent=(id)=>setStudents(prev=>prev.map(st=>st.id===id?softRestore(st):st));
  const purgeStudent=(id)=>{
    if(!confirm("Delete this student forever? This cannot be undone.")) return;
    setStudents(prev=>prev.filter(st=>st.id!==id));
  };
  const restoreSubItem=(stId,key,itemId)=>setStudents(prev=>prev.map(st=>st.id===stId?{...st,[key]:(st[key]||[]).map(x=>x.id===itemId?softRestore(x):x)}:st));
  const purgeSubItem=(stId,key,itemId)=>{
    if(!confirm("Delete forever? This cannot be undone.")) return;
    setStudents(prev=>prev.map(st=>st.id===stId?{...st,[key]:(st[key]||[]).filter(x=>x.id!==itemId)}:st));
  };
  const emptyTrash=()=>{
    if(!confirm("Permanently delete every item in Trash? This cannot be undone.")) return;
    setStudents(prev=>prev.filter(st=>!st.deleted).map(st=>({
      ...st,
      assignments: (st.assignments||[]).filter(a=>!a.deleted),
      scores: (st.scores||[]).filter(x=>!x.deleted),
      welledLogs: (st.welledLogs||[]).filter(x=>!x.deleted),
      diagnostics: (st.diagnostics||[]).filter(x=>!x.deleted),
    })));
    showToast("Trash emptied");
  };

  // Update a practice exam in assignment history — accepts a patch object
  const setExamScore = (aid,examIdx,patch)=>{
    const upd = students.map(st=>{
      if(st.id!==profile.id) return st;
      return {...st, assignments: st.assignments.map(a=>{
        if(a.id!==aid) return a;
        const ex = [...(a.practiceExams||[])];
        ex[examIdx] = {...ex[examIdx], ...patch};
        return {...a, practiceExams: ex};
      })};
    });
    setStudents(upd); setProfile(upd.find(st=>st.id===profile.id));
  };
  const setWelledDomainScore = (aid,idx,score)=>{
    const upd = students.map(st=>{
      if(st.id!==profile.id) return st;
      return {...st, assignments: st.assignments.map(a=>{
        if(a.id!==aid) return a;
        const arr=[...(a.welledDomain||[])];
        arr[idx]={...arr[idx],score};
        return {...a, welledDomain:arr};
      })};
    });
    setStudents(upd); setProfile(upd.find(st=>st.id===profile.id));
  };

  const exportData=()=>{
    const blob=new Blob([JSON.stringify(students,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`psm-data-${todayStr()}.json`;a.click();
    URL.revokeObjectURL(url);
    showToast("Data exported");
  };
  const importData=(e)=>{
    const f=e.target.files?.[0];if(!f)return;
    const r=new FileReader();
    r.onload=()=>{try{const d=JSON.parse(r.result);if(Array.isArray(d)){if(confirm(`Import ${d.length} students? This will REPLACE all current data.`)){setStudents(d);showToast("Data imported");}}else alert("Invalid file format");}catch{alert("Failed to parse file");}};
    r.readAsText(f);
    e.target.value="";
  };

  // Wise Learner Report CSV import — additive, with preview + dedupe.
  const handleWiseFile=(e)=>{
    const f=e.target.files?.[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>{
      try{
        const parsed = parseWiseCsv(String(r.result||""));
        if(!parsed.length){ alert("No students found in this file."); return; }
        const existingNames = new Set(students.filter(s=>!s.deleted).map(s=>s.name.trim().toLowerCase()));
        const rows = parsed.map(p=>({
          ...p,
          duplicate: existingNames.has(p.name.trim().toLowerCase()),
          selected: !existingNames.has(p.name.trim().toLowerCase()),
        }));
        setWiseImport({fileName: f.name, rows});
      }catch(err){
        console.error("[Wise import]", err);
        alert("Failed to parse: "+(err.message||err));
      }
    };
    r.readAsText(f);
    e.target.value="";
  };
  const toggleWiseRow=(i)=>setWiseImport(w=>w?{...w, rows: w.rows.map((r,idx)=>idx===i?{...r,selected:!r.selected}:r)}:w);
  const setWiseAll=(sel,onlyNew)=>setWiseImport(w=>w?{...w, rows: w.rows.map(r=>({...r, selected: onlyNew ? (sel && !r.duplicate) : sel}))}:w);
  const cancelWiseImport=()=>setWiseImport(null);
  const confirmWiseImport=()=>{
    if(!wiseImport) return;
    const picked = wiseImport.rows.filter(r=>r.selected);
    if(!picked.length){ cancelWiseImport(); return; }
    const newStudents = picked.map(p=>({
      id: uid(),
      name: p.name,
      meta: p.meta,
      assignments: [],
      scores: [],
      welledLogs: [],
      diagnostics: [],
    }));
    setStudents(prev=>[...prev, ...newStudents]);
    showToast(`Imported ${newStudents.length} student${newStudents.length!==1?"s":""} from Wise`);
    setWiseImport(null);
  };

  /* ============ DIAGNOSTIC UPLOAD ============ */
  const handleDiagUpload = async(files)=>{
    if(!files||!files.length) return;
    setParsing(true);
    try{
      const results=[];
      for(const f of files){
        try{
          const r = await parseDiagnosticPdf(f);
          results.push(r);
        }catch(err){
          console.error("parse error",f.name,err);
          showToast(`Failed to parse ${f.name}`);
        }
      }
      if(results.length){
        const stamped = results.map(r=>({id:uid(),...r}));
        const upd = students.map(st=>{
          if(st.id!==profile.id) return st;
          const existing = st.diagnostics||[];
          return {...st, diagnostics:[...existing, ...stamped]};
        });
        setStudents(upd);
        setProfile(upd.find(st=>st.id===profile.id));
        showToast(`Parsed ${results.length} diagnostic report${results.length!==1?"s":""}`);
      }
    } finally { setParsing(false); }
  };
  const clearDiagnostics=()=>{
    if(!confirm("Move all diagnostic data for this student to Trash? You can restore them individually.")) return;
    const upd = students.map(st=>{
      if(st.id!==profile.id) return st;
      const diags = (st.diagnostics||[]).map(d=>d.deleted?d:softDel({id:d.id||uid(),...d}));
      return {...st, diagnostics: diags};
    });
    setStudents(upd); setProfile(upd.find(st=>st.id===profile.id));
    showToast("Diagnostics moved to Trash");
  };

  /* ============ WELLED REPORT UPLOAD ============ */
  const handleWelledUpload = async(files)=>{
    if(!files||!files.length||!profile) return;
    setParsing(true);
    try{
      for(const f of files){
        try{
          const r = await parseWelledReport(f);
          // Log scores to student's score history
          const scoreEntry = {
            id:uid(), date:r.testedOn||todayStr(),
            testType:`WellEd Practice Test ${r.testNumber||"?"}`,
            score:r.totalScore||((r.rwScore||0)+(r.mathScore||0))||"",
            maxScore:"1600",
            notes:`R&W: ${r.rwScore||"N/A"}, Math: ${r.mathScore||"N/A"}. Type: ${r.type}. ${r.subskills.length} subskills parsed.`,
            welledReport:r,
          };
          const upd = students.map(st=>{
            if(st.id!==profile.id) return st;
            return {...st, scores:[...(st.scores||[]), scoreEntry]};
          });
          setStudents(upd);
          setProfile(upd.find(st=>st.id===profile.id));
          showToast(`WellEd report parsed: Test #${r.testNumber||"?"} — ${r.totalScore||"N/A"}`);
        }catch(err){
          console.error("WellEd parse error",f.name,err);
          showToast(`Failed to parse ${f.name}: ${err.message}`);
        }
      }
    } finally { setParsing(false); }
  };

  // p is looked up from visibleStudents so its sub-items are already filtered.
  // If the underlying student was soft-deleted since the profile opened we fall
  // back to the raw record (rare — delStudent closes the profile itself).
  const p = profile && (visibleStudents.find(st=>st.id===profile.id) || students.find(st=>st.id===profile.id) || profile);
  const diagProfile = useMemo(()=>p?.diagnostics?.length?buildDiagnosticProfile(p.diagnostics):null,[p]);

  // Counts for the Trash tab badge.
  const trashCount = useMemo(()=>{
    let n = 0;
    for(const st of students){
      if(st.deleted) n++;
      n += trashed(st.assignments).length;
      n += trashed(st.scores).length;
      n += trashed(st.welledLogs).length;
      n += trashed(st.diagnostics).length;
    }
    return n;
  },[students]);

  // Check whether a given worksheet was already assigned, and find the latest date
  const lastAssignedDate = (stud, wsId)=>{
    if(!stud) return null;
    let latest = null;
    (stud.assignments||[]).forEach(a=>{
      (a.worksheets||[]).forEach(w=>{
        if((w.id||w.name)===wsId || w.title===wsId){
          if(!latest || (a.date||"")>latest) latest = a.date||"pre-assigned";
        }
      });
    });
    return latest;
  };

  /* ============ RENDER ============ */
  return(
    <div style={{fontFamily:"'IBM Plex Sans',system-ui,sans-serif",background:"var(--paper)",minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      {toast&&<div style={{position:"fixed",top:16,right:16,background:"#1e293b",color:"#fff",padding:"10px 18px",borderRadius:10,fontSize:13,fontWeight:600,zIndex:9999,boxShadow:"0 4px 16px rgba(0,0,0,.25)"}}>{toast}</div>}
      {parsing&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",background:"#4338ca",color:"#fff",padding:"10px 18px",borderRadius:10,fontSize:13,fontWeight:600,zIndex:9999}} className="pl">Parsing diagnostic PDF(s)...</div>}

      {wiseImport && (()=>{
        const newCount = wiseImport.rows.filter(r=>!r.duplicate).length;
        const dupCount = wiseImport.rows.filter(r=>r.duplicate).length;
        const selCount = wiseImport.rows.filter(r=>r.selected).length;
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(15,26,46,.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:"40px 24px"}} onClick={cancelWiseImport}>
            <div onClick={e=>e.stopPropagation()} style={{background:"var(--card)",border:"1px solid var(--rule)",borderRadius:14,boxShadow:"var(--shadow-lg)",maxWidth:1000,width:"100%",maxHeight:"88vh",display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:"linear-gradient(90deg,var(--brand) 0,var(--brand) 72px,transparent 72px)"}}/>
              <div style={{padding:"28px 32px 20px",borderBottom:"1px solid var(--rule)"}}>
                <div style={{fontFamily:"var(--font-body)",fontSize:10,fontWeight:600,letterSpacing:"0.18em",textTransform:"uppercase",color:"var(--ink-mute)",marginBottom:6}}>Wise · Learner Report</div>
                <h2 style={{fontFamily:"var(--font-display)",fontVariationSettings:"'opsz' 144, 'SOFT' 20",fontWeight:600,fontSize:26,letterSpacing:"-0.02em",margin:"0 0 10px",lineHeight:1.1}}>Import {newCount} new student{newCount!==1?"s":""}</h2>
                <div style={{fontSize:13,color:"var(--ink-soft)",lineHeight:1.55,maxWidth:680}}>
                  Parsed <span style={{fontFamily:"var(--font-mono)",fontSize:12.5,color:"var(--ink)"}}>{wiseImport.fileName}</span> — found <strong>{wiseImport.rows.length}</strong> rows, <strong>{newCount}</strong> new, <strong>{dupCount}</strong> already in PSM. Addresses, hourly rates, and accommodations are intentionally not imported.
                </div>
                <div style={{marginTop:14,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                  <button onClick={()=>setWiseAll(true,true)} style={{...mkBtn("transparent","var(--brand)"),border:"1px solid rgba(0,74,121,.35)",padding:"5px 12px",fontSize:11}}>Select all new</button>
                  <button onClick={()=>setWiseAll(true,false)} style={{...mkBtn("transparent","var(--ink-soft)"),border:"1px solid var(--rule)",padding:"5px 12px",fontSize:11}}>Select all</button>
                  <button onClick={()=>setWiseAll(false,false)} style={{...mkBtn("transparent","var(--ink-soft)"),border:"1px solid var(--rule)",padding:"5px 12px",fontSize:11}}>Clear</button>
                  <div style={{marginLeft:"auto",fontFamily:"var(--font-mono)",fontSize:10,color:"var(--ink-mute)",letterSpacing:"0.04em",textTransform:"uppercase"}}>{selCount} selected</div>
                </div>
              </div>
              <div style={{flex:1,overflowY:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead style={{position:"sticky",top:0,background:"var(--paper-alt)",zIndex:1}}>
                    <tr style={{borderBottom:"1px solid var(--rule)"}}>
                      {["","Name","Email","Phone","Grade","Level","Subject","Status"].map((h,i)=>(
                        <th key={i} style={{padding:"12px 14px",textAlign:"left",fontFamily:"var(--font-mono)",fontSize:9,fontWeight:600,color:"var(--ink-mute)",letterSpacing:"0.1em",textTransform:"uppercase"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {wiseImport.rows.map((r,i)=>(
                      <tr key={i} style={{borderBottom:i===wiseImport.rows.length-1?"none":"1px solid rgba(15,26,46,.06)",background:r.duplicate?"rgba(154,91,31,.04)":"transparent",opacity:r.selected?1:0.55}}>
                        <td style={{padding:"10px 14px",width:34}}>
                          <input type="checkbox" checked={r.selected} onChange={()=>toggleWiseRow(i)}/>
                        </td>
                        <td style={{padding:"10px 14px",fontFamily:"var(--font-display)",fontVariationSettings:"'opsz' 48",fontSize:13,fontWeight:500,color:"var(--ink)"}}>{r.name}</td>
                        <td style={{padding:"10px 14px",fontFamily:"var(--font-mono)",fontSize:11,color:"var(--ink-soft)"}}>{r.meta.email||"—"}</td>
                        <td style={{padding:"10px 14px",fontFamily:"var(--font-mono)",fontSize:11,color:"var(--ink-soft)"}}>{r.meta.phone||"—"}</td>
                        <td style={{padding:"10px 14px",color:"var(--ink-soft)"}}>{r.meta.gradeLevel||"—"}</td>
                        <td style={{padding:"10px 14px",color:"var(--ink-soft)"}}>{r.meta.levelOfTutoring||"—"}</td>
                        <td style={{padding:"10px 14px",color:"var(--ink-soft)"}}>{r.meta.subjectOfTutoring||"—"}</td>
                        <td style={{padding:"10px 14px",whiteSpace:"nowrap"}}>
                          {r.duplicate ? (
                            <span style={{display:"inline-block",padding:"2px 9px",borderRadius:999,border:"1px solid rgba(154,91,31,.35)",color:"var(--accent)",fontFamily:"var(--font-mono)",fontSize:9,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase"}}>Already in PSM</span>
                          ) : (
                            <span style={{display:"inline-block",padding:"2px 9px",borderRadius:999,border:"1px solid rgba(0,74,121,.35)",color:"var(--brand)",fontFamily:"var(--font-mono)",fontSize:9,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase"}}>New</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{padding:"18px 32px",borderTop:"1px solid var(--rule)",display:"flex",justifyContent:"flex-end",gap:10,background:"var(--paper-alt)"}}>
                <button onClick={cancelWiseImport} style={{...mkBtn("transparent","var(--ink-soft)"),border:"1px solid var(--rule)",padding:"9px 18px",fontSize:12}}>Cancel</button>
                <button onClick={confirmWiseImport} disabled={selCount===0} style={{...mkBtn(selCount===0?"var(--paper-alt)":"var(--brand)",selCount===0?"var(--ink-mute)":"var(--paper)"),border:`1px solid ${selCount===0?"var(--rule)":"var(--brand)"}`,padding:"9px 20px",fontSize:12,fontWeight:500,cursor:selCount===0?"default":"pointer"}}>
                  Import {selCount} student{selCount!==1?"s":""}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* HEADER — editorial wordmark + refined action rail */}
      <div data-psm-header style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",flexShrink:0,gap:24}}>
        <div data-psm-brand style={{display:"flex",alignItems:"center",gap:16}}>
          <img src="ats_logo.png" alt="ATS" data-psm-logo/>
          <div style={{display:"flex",flexDirection:"column"}}>
            <div data-psm-eyebrow>Affordable Tutoring Solutions · Est. 2023</div>
            <div data-psm-title>PSM <em>Generator</em></div>
          </div>
        </div>
        <div data-psm-actions style={{display:"flex",alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
          <div data-psm-exam style={{display:"flex",gap:0,border:"1px solid var(--rule)",borderRadius:999,padding:2}}>
            {["SAT","PSAT"].map(t=>(
              <button key={t} data-active={examType===t} onClick={()=>setExamType(t)} style={{padding:"4px 14px",cursor:"pointer"}}>{t}</button>
            ))}
          </div>
          <a href="https://tutor.thesatcrashcourse.com/" target="_blank" rel="noopener noreferrer">WellEd</a>
          <a href="https://ats.wise.live/get-started" target="_blank" rel="noopener noreferrer">Wise</a>
          <span data-psm-chip title="Enrolled students" style={{padding:"6px 10px",border:"1px solid var(--rule)",borderRadius:999,color:"var(--ink-soft)"}}>{visibleStudents.length.toString().padStart(2,"0")} students</span>
          <span data-psm-chip title="Total assigned worksheets" style={{padding:"6px 10px",border:"1px solid var(--rule)",borderRadius:999,color:"var(--ink-soft)"}}>{visibleStudents.reduce((n,st)=>n+(st.assignments||[]).reduce((m,a)=>m+(a.worksheets||[]).length,0),0)} assigned</span>
          <span data-psm-chip title={cloudStatus==="synced"?"Cloud synced — all tutors see changes in real-time":cloudStatus==="connecting"?"Connecting to cloud...":"Offline — changes saved locally"} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 10px",border:"1px solid var(--rule)",borderRadius:999,color:cloudStatus==="synced"?"var(--ok)":cloudStatus==="connecting"?"var(--warn)":"var(--danger)"}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:"currentColor"}}/>
            {cloudStatus==="synced"?"Synced":cloudStatus==="connecting"?"Syncing":"Offline"}
          </span>
          <button onClick={exportData} title="Export data">Export</button>
          <label title="Import data" style={{cursor:"pointer"}}>
            Import
            <input type="file" accept="application/json" onChange={importData} style={{display:"none"}}/>
          </label>
          <label title="Import students from a Wise Learner Report CSV" style={{cursor:"pointer"}}>
            Import Wise
            <input ref={wiseInputRef} type="file" accept=".csv,text/csv" onClick={e=>{e.currentTarget.value="";}} onChange={handleWiseFile} style={{display:"none"}}/>
          </label>
          <div data-psm-user title={authUser.email} style={{
            display:"inline-flex",alignItems:"center",gap:8,
            padding:"4px 4px 4px 12px",border:"1px solid var(--rule)",borderRadius:999,
            marginLeft:4
          }}>
            <span style={{
              fontFamily:"var(--font-display)",fontVariationSettings:"'opsz' 48",
              fontSize:12,fontWeight:500,color:"var(--ink)",letterSpacing:"-0.005em",
              maxWidth:140,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"
            }}>{(authUser.displayName||authUser.email||"").split(" ")[0]||authUser.email}</span>
            {authUser.photoURL ? (
              <img src={authUser.photoURL} alt="" referrerPolicy="no-referrer" style={{
                width:24,height:24,borderRadius:"50%",
                boxShadow:"0 0 0 1px var(--rule-strong)"
              }}/>
            ) : (
              <span style={{
                width:24,height:24,borderRadius:"50%",background:"var(--brand-soft)",
                color:"var(--brand-dark)",display:"inline-flex",alignItems:"center",
                justifyContent:"center",fontSize:11,fontWeight:600,fontFamily:"var(--font-body)"
              }}>{(authUser.displayName||authUser.email||"?").charAt(0).toUpperCase()}</span>
            )}
            <button onClick={onSignOut} title="Sign out" aria-label="Sign out" style={{
              border:"none !important",background:"transparent !important",
              padding:"4px 8px 4px 2px",cursor:"pointer",color:"var(--ink-mute)",
              display:"inline-flex",alignItems:"center"
            }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M10 5l3 3-3 3M13 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* TABS — editorial nav with serif labels */}
      <div data-psm-tabs style={{display:"flex",flexShrink:0}}>
        {[{id:"generator",label:"Generator"},{id:"students",label:"Students"},{id:"heatmap",label:"Heat Map"},{id:"scores",label:"Score Tracking"},{id:"trash",label:"Trash"}].map(t=>(
          <button key={t.id} data-active={tab===t.id} onClick={()=>{if(t.id!=="students")setProfile(null);setTab(t.id);}} style={{border:"none",background:"none",cursor:"pointer",position:"relative"}}>
            {t.label}
            {t.id==="trash"&&trashCount>0&&<span style={{marginLeft:8,padding:"1px 7px",borderRadius:999,background:"var(--accent-soft)",color:"var(--accent)",fontFamily:"var(--font-mono)",fontSize:9,fontWeight:600,verticalAlign:"middle"}}>{trashCount}</span>}
          </button>
        ))}
      </div>

      {/* BODY */}
      <div data-psm-body style={{flex:1,overflowY:"auto"}}>
        {tab==="generator"&&<GeneratorTab {...{
          students:visibleStudents,curStudent,selSt,setSelSt,openProfile,
          subjF,setSubjF,domF,setDomF,sdomF,setSdomF,diffF,setDiffF,srch,setSrch,
          availDoms,availSdoms,grouped,
          chk,setChk,evenOdd,setEvenOdd,weChk,setWeChk,vocabChk,setVocabChk,
          timeDrill,setTimeDrill,timeLims,setTimeLims,oneNote,setOneNote,
          weDomEn,setWeDomEn,vocabEn,setVocabEn,
          addBB,setAddBB,bbType,setBbType,bbCnt,setBbCnt,
          addWE,setAddWE,weType,setWeType,weCnt,setWeCnt,
          selWS,selWeDom,selVocab,totalQs,examType,
          generate,output,copyOut,copyRichOut,downloadPdf,copied,
          lastAssignedDate,
          customAssignments,setCustomAssignments,showToast,
        }}/>}

        {tab==="students"&&!profile&&<StudentsList {...{students:visibleStudents,showAdd,setShowAdd,newS,setNewS,addStudent,openProfile,delStudent}}/>}

        {tab==="students"&&profile&&p&&<StudentProfile {...{p,setProfile,ptab,setPtab,
          paChk,setPaChk,paSubj,setPaSubj,paSrch,setPaSrch,savePreAssign,
          paDate,setPaDate,paWeChk,setPaWeChk,paBBNums,setPaBBNums,paWENums,setPaWENums,
          sfm,setSfm,addScore,delScore,delAsg,setExamScore,setWelledDomainScore,
          addWelledLog,delWelledLog,
          handleDiagUpload,clearDiagnostics,diagInputRef,diagProfile,showToast,
          students,setStudents,examType,
          handleWelledUpload,welledInputRef,
          customAssignments,setCustomAssignments,
        }}/>}

        {tab==="heatmap"&&<HeatMapTab {...{students:visibleStudents,openProfile}}/>}

        {tab==="scores"&&<ScoresTab {...{students:visibleStudents,openProfile}}/>}

        {tab==="trash"&&<TrashTab {...{students,restoreStudent,purgeStudent,restoreSubItem,purgeSubItem,emptyTrash,trashCount}}/>}
      </div>

      <div style={{background:B1,color:"#64748b",padding:"10px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:11,flexShrink:0}}>
        <span style={{fontWeight:700,color:"#94a3b8"}}>Affordable Tutoring Solutions Inc.</span>
        <span>Support: Aidan Meyers · ameyers@affordabletutoringsolutions.org · (321) 341-9820</span>
      </div>
    </div>
  );
}

/* ============ GENERATOR TAB ============ */
function GeneratorTab(props){
  const {curStudent,selSt,setSelSt,students,openProfile,
    subjF,setSubjF,domF,setDomF,sdomF,setSdomF,diffF,setDiffF,srch,setSrch,
    availDoms,availSdoms,grouped,
    chk,setChk,evenOdd,setEvenOdd,weChk,setWeChk,vocabChk,setVocabChk,
    timeDrill,setTimeDrill,timeLims,setTimeLims,oneNote,setOneNote,
    weDomEn,setWeDomEn,vocabEn,setVocabEn,
    addBB,setAddBB,bbType,setBbType,bbCnt,setBbCnt,
    addWE,setAddWE,weType,setWeType,weCnt,setWeCnt,
    selWS,selWeDom,selVocab,totalQs,examType,
    generate,output,copyOut,copyRichOut,downloadPdf,copied,lastAssignedDate,
    customAssignments,setCustomAssignments,showToast} = props;

  const[showCustomForm,setShowCustomForm]=useState(false);
  const[customName,setCustomName]=useState("");
  const[customSubj,setCustomSubj]=useState("Reading & Writing");
  const[customQs,setCustomQs]=useState(27);

  const totalSelected = selWS.length + selWeDom.length + selVocab.length + (addBB?1:0) + (addWE?1:0);

  return(
    <div style={{display:"grid",gridTemplateColumns:"275px 1fr 345px",gap:14,minHeight:"calc(100vh - 140px)"}}>
      {/* LEFT SIDEBAR */}
      <div style={{display:"flex",flexDirection:"column",gap:10,paddingRight:2,overflowY:"auto",maxHeight:"calc(100vh - 140px)"}}>
        <div style={{...CARD}}>
          <SH>Assign To</SH>
          <select value={selSt} onChange={e=>setSelSt(e.target.value)} style={INP}>
            <option value="">— No Student —</option>
            {students.map(st=><option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
          {selSt&&<button onClick={()=>openProfile(curStudent)} style={{...mkBtn("transparent",B2),border:"1px solid rgba(0,74,121,.28)",marginTop:10,width:"100%",fontSize:11}}>View Profile →</button>}
        </div>

        <div style={{...CARD}}>
          <SH>Filters</SH>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:9,color:"#66708A",marginBottom:6,letterSpacing:1.2,fontWeight:600,fontFamily:"'IBM Plex Mono',monospace"}}>SUBJECT</div>
            <div style={{display:"flex",gap:4}}>
              {["All","Reading & Writing","Math"].map(s=>(
                <button key={s} onClick={()=>{setSubjF(s);setDomF("All");setSdomF("All");}} style={{...mkBtn(subjF===s?B2:"transparent",subjF===s?"#FAF7F2":"#2E3A57"),border:subjF===s?"1px solid "+B2:"1px solid rgba(15,26,46,.15)",padding:"5px 10px",fontSize:11,flex:1}}>
                  {s==="All"?"All":s==="Reading & Writing"?"R&W":"Math"}
                </button>
              ))}
            </div>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:9,color:"#66708A",marginBottom:5,letterSpacing:1.2,fontWeight:600,fontFamily:"'IBM Plex Mono',monospace"}}>DOMAIN</div>
            <select value={domF} onChange={e=>{setDomF(e.target.value);setSdomF("All");}} style={{...INP,fontSize:12}}>
              <option value="All">All Domains</option>
              {availDoms.map(d=><option key={d}>{d}</option>)}
            </select>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:9,color:"#66708A",marginBottom:5,letterSpacing:1.2,fontWeight:600,fontFamily:"'IBM Plex Mono',monospace"}}>SUBSKILL</div>
            <select value={sdomF} onChange={e=>setSdomF(e.target.value)} style={{...INP,fontSize:12}}>
              <option value="All">All Subskills</option>
              {availSdoms.map(d=><option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:9,color:"#66708A",marginBottom:6,letterSpacing:1.2,fontWeight:600,fontFamily:"'IBM Plex Mono',monospace"}}>DIFFICULTY</div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {["All","easy","medium","hard","comprehensive"].map(d=>{
                const label = d==="All"?"All Difficulties":d[0].toUpperCase()+d.slice(1);
                const active = diffF===d;
                const accent = d==="All"?B2:DC[d];
                return(
                  <button key={d} onClick={()=>setDiffF(d)} style={{...mkBtn(active?accent:"transparent",active?"#FAF7F2":"#2E3A57"),border:active?"1px solid "+accent:"1px solid rgba(15,26,46,.15)",padding:"6px 12px",fontSize:11,textAlign:"left",fontWeight:active?600:500,display:"flex",alignItems:"center",gap:8}}>
                    {!active&&d!=="All"&&<span style={{width:6,height:6,borderRadius:"50%",background:accent,flexShrink:0}}/>}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <input placeholder="Search worksheets…" value={srch} onChange={e=>setSrch(e.target.value)} style={{...INP,fontStyle:srch?"normal":"italic",boxShadow:"0 0 0 1px rgba(15,26,46,.05)"}}/>

        {/* TIME DRILL */}
        <div style={{...CARD,background:timeDrill?"#E9F0F6":"#fff",boxShadow:timeDrill?"0 0 0 1px "+B2+", 0 1px 2px rgba(0,74,121,.08)":CARD.boxShadow}}>
          <Toggle on={timeDrill} set={setTimeDrill} label="Time Drilling"/>
          {timeDrill&&<div style={{marginTop:12,padding:12,background:"rgba(255,255,255,.7)",borderRadius:4,fontSize:11,color:"#2E3A57",lineHeight:1.55,border:"1px solid rgba(0,74,121,.15)"}}>
            <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:12,fontWeight:600,color:"#003258",marginBottom:6}}>Instructions</div>
            <div style={{color:"#2E3A57",marginBottom:8}}>Enter time limits in minutes for each selected worksheet. These appear in parentheses before the worksheet names in the assignment. Leave blank to omit.</div>
            <div style={{background:"#FAF7F2",padding:"8px 10px",borderRadius:3,fontSize:10,border:"1px solid rgba(15,26,46,.08)",fontFamily:"'IBM Plex Mono',monospace"}}>
              <div style={{fontWeight:600,marginBottom:3,color:"#003258",letterSpacing:.4}}>REFERENCE TIMING</div>
              <div>Reading &amp; Writing &nbsp;·&nbsp; ~71 sec / question</div>
              <div>Math &nbsp;·&nbsp; ~1 min 35 sec / question</div>
            </div>
          </div>}
        </div>

        {/* ONENOTE */}
        <div style={{...CARD,background:oneNote?"#E9F0F6":"#fff",boxShadow:oneNote?"0 0 0 1px "+B2+", 0 1px 2px rgba(0,74,121,.08)":CARD.boxShadow}}>
          <Toggle on={oneNote} set={setOneNote} label="PSMs on OneNote"/>
          {oneNote&&<div style={{marginTop:12,padding:12,background:"rgba(255,255,255,.7)",borderRadius:4,fontSize:11,color:"#2E3A57",lineHeight:1.55,border:"1px solid rgba(0,74,121,.15)"}}>
            Only answer keys will be included — no student worksheets. Special OneNote instructions are added for students completing work digitally.
          </div>}
        </div>

        {/* WELLED DOMAIN */}
        <div style={{...CARD,background:weDomEn?"#F5ECDF":"#fff",boxShadow:weDomEn?"0 0 0 1px #9A5B1F, 0 1px 2px rgba(154,91,31,.1)":CARD.boxShadow}}>
          <Toggle on={weDomEn} set={setWeDomEn} label="WellEd Domain Assignments"/>
          {weDomEn&&<div style={{marginTop:12}}>
            <div style={{padding:12,background:"rgba(255,255,255,.7)",borderRadius:4,fontSize:11,color:"#6E3F12",lineHeight:1.55,marginBottom:10,border:"1px solid rgba(154,91,31,.18)"}}>
              Select topic-specific assignments. R&amp;W assignments have 27 Qs each; Math have 22 Qs each. PSDA and Geometry only offer Easy and Hard.
            </div>
            <div style={{maxHeight:260,overflowY:"auto",border:"1px solid #d1fae5",borderRadius:6,padding:6}}>
              {WELLED_DOMAIN.map(e=>(
                <div key={e.subject+"|"+e.domain} style={{marginBottom:6}}>
                  <div style={{fontSize:10,fontWeight:800,color:DOMAIN_COLOR[e.domain]||B2,marginBottom:3}}>{e.domain}</div>
                  {e.diffs.map(d=>{
                    const it = WE_DOMAIN_ITEMS.find(x=>x.subject===e.subject&&x.domain===e.domain&&x.difficulty===d);
                    const ck=!!weChk[it.id];
                    const wedAssigned = curStudent && (curStudent.assignments||[]).some(a=>(a.welledDomain||[]).some(w=>w.subject===e.subject&&w.domain===e.domain&&w.difficulty===d));
                    return(
                      <label key={d} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,padding:"3px 6px",cursor:"pointer",background:ck?"#dcfce7":wedAssigned?"#fefce8":"transparent",borderRadius:4,marginBottom:2}}>
                        <input type="checkbox" checked={ck} onChange={()=>setWeChk(prev=>({...prev,[it.id]:!prev[it.id]}))}/>
                        <span style={{color:"#065f46",fontWeight:600}}>{d[0].toUpperCase()+d.slice(1)}</span>
                        {wedAssigned&&<span style={{fontSize:8,fontWeight:800,color:"#a16207",background:"#fef3c7",padding:"1px 5px",borderRadius:3}}>ASSIGNED</span>}
                        <span style={{color:"#94a3b8",marginLeft:"auto"}}>{e.qs}Qs</span>
                      </label>
                    );
                  })}
                </div>
              ))}
              {/* Custom assignments */}
              {customAssignments&&customAssignments.length>0&&<div style={{marginTop:8,borderTop:"1px solid #d1fae5",paddingTop:8}}>
                <div style={{fontSize:10,fontWeight:800,color:"#7c3aed",marginBottom:4}}>CUSTOM ASSIGNMENTS</div>
                {customAssignments.map(ca=>{
                  const caId=`CUSTOM|${ca.id}`;
                  const caCk=!!weChk[caId];
                  return(
                    <label key={ca.id} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,padding:"3px 6px",cursor:"pointer",background:caCk?"#dcfce7":"transparent",borderRadius:4,marginBottom:2}}>
                      <input type="checkbox" checked={caCk} onChange={()=>setWeChk(prev=>({...prev,[caId]:!prev[caId]}))}/>
                      <span style={{color:"#065f46",fontWeight:600}}>{ca.name}</span>
                      <span style={{color:"#94a3b8",marginLeft:"auto"}}>{ca.qs}Qs</span>
                      <button onClick={e=>{e.preventDefault();e.stopPropagation();setCustomAssignments(prev=>prev.filter(x=>x.id!==ca.id));}} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:10,padding:"0 2px"}}>✕</button>
                    </label>
                  );
                })}
              </div>}
              <div style={{marginTop:8,borderTop:"1px solid #d1fae5",paddingTop:6}}>
                {!showCustomForm ? (
                  <button onClick={()=>setShowCustomForm(true)} style={{...mkBtn("#f0fdf4","#065f46"),padding:"4px 10px",fontSize:10,width:"100%"}}>+ Add Custom Assignment</button>
                ) : (
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    <input placeholder="Assignment name" value={customName} onChange={e=>setCustomName(e.target.value)} style={{...INP,fontSize:11}}/>
                    <div style={{display:"flex",gap:4}}>
                      <select value={customSubj} onChange={e=>{setCustomSubj(e.target.value);setCustomQs(e.target.value==="Math"?22:27);}} style={{...INP,fontSize:11,flex:1}}>
                        <option value="Reading & Writing">R&W</option>
                        <option value="Math">Math</option>
                      </select>
                      <input type="number" min={1} value={customQs} onChange={e=>setCustomQs(Number(e.target.value))} placeholder="Qs" style={{...INP,fontSize:11,width:50,textAlign:"center"}}/>
                    </div>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={()=>{if(!customName.trim())return;setCustomAssignments(prev=>[...prev,{id:uid(),name:customName.trim(),subject:customSubj,qs:customQs}]);setCustomName("");setShowCustomForm(false);showToast("Custom assignment added");}} style={{...mkBtn("#065f46","#fff"),padding:"4px 10px",fontSize:10,flex:1}}>Save</button>
                      <button onClick={()=>{setShowCustomForm(false);setCustomName("");}} style={{...mkBtn("#f1f5f9","#475569"),padding:"4px 10px",fontSize:10}}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>}
        </div>

        {/* VOCAB */}
        <div style={{...CARD,background:vocabEn?"#EFEAE0":"#fff",boxShadow:vocabEn?"0 0 0 1px #5B4B8A, 0 1px 2px rgba(91,75,138,.08)":CARD.boxShadow}}>
          <Toggle on={vocabEn} set={setVocabEn} label="Vocabulary"/>
          {vocabEn&&<div style={{marginTop:12}}>
            <div style={{padding:12,background:"rgba(255,255,255,.7)",borderRadius:4,fontSize:11,color:"#3A305C",lineHeight:1.55,marginBottom:10,border:"1px solid rgba(91,75,138,.2)"}}>
              Select vocab flashcard sets or quizzes. Each set has 4 quiz variants. Question counts are not tracked for vocab.
            </div>
            <VocabPicker vocabChk={vocabChk} setVocabChk={setVocabChk}/>
          </div>}
        </div>

        {/* PRACTICE EXAMS */}
        <div style={{...CARD}}>
          <SH>Practice Exams</SH>
          <div style={{padding:12,background:"#F3EEE4",borderRadius:4,marginBottom:10,border:"1px solid rgba(15,26,46,.06)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:addBB?10:0}}>
              <span style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:14,fontWeight:600,color:"#003258",letterSpacing:-.1}}>BlueBook</span>
              <input type="checkbox" checked={addBB} onChange={e=>setAddBB(e.target.checked)} style={{cursor:"pointer",accentColor:B2}}/>
            </div>
            {addBB&&<div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 54px",gap:6,marginBottom:6}}>
                <select value={bbType} onChange={e=>setBbType(e.target.value)} style={{...INP,fontSize:11}}>
                  <option value="full">Full Test</option>
                  <option value="section">Section</option>
                </select>
                <input type="number" min={1} max={10} value={bbCnt} onChange={e=>setBbCnt(Number(e.target.value))} style={{...INP,fontSize:12,textAlign:"center"}}/>
              </div>
              {curStudent&&(()=>{const used=new Set();(curStudent.assignments||[]).forEach(a=>(a.practiceExams||[]).forEach(ex=>{if(ex.platform==="BlueBook")used.add(ex.number);}));return used.size>0?<div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>{BLUEBOOK_PRACTICE_TESTS.map(n=><span key={n} style={{fontSize:9,padding:"1px 5px",borderRadius:3,fontWeight:700,background:used.has(n)?"#fef3c7":"#f1f5f9",color:used.has(n)?"#a16207":"#94a3b8",border:used.has(n)?"1px solid #fde68a":"1px solid #e2e8f0"}}>{n}{used.has(n)?" ✓":""}</span>)}</div>:null;})()}
            </div>}
          </div>
          <div style={{padding:12,background:"#F3EEE4",borderRadius:4,border:"1px solid rgba(15,26,46,.06)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:addWE?10:0}}>
              <span style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:14,fontWeight:600,color:"#6E3F12",letterSpacing:-.1}}>WellEd Labs</span>
              <input type="checkbox" checked={addWE} onChange={e=>setAddWE(e.target.checked)} style={{cursor:"pointer",accentColor:"#9A5B1F"}}/>
            </div>
            {addWE&&<div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 54px",gap:6,marginBottom:6}}>
                <select value={weType} onChange={e=>setWeType(e.target.value)} style={{...INP,fontSize:11}}>
                  <option value="full">Full Test</option>
                  <option value="section">Section</option>
                </select>
                <input type="number" min={1} max={10} value={weCnt} onChange={e=>setWeCnt(Number(e.target.value))} style={{...INP,fontSize:12,textAlign:"center"}}/>
              </div>
              {curStudent&&(()=>{const used=new Set();(curStudent.assignments||[]).forEach(a=>(a.practiceExams||[]).forEach(ex=>{if(ex.platform==="WellEd")used.add(ex.number);}));return used.size>0?<div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>{WELLED_PRACTICE_TESTS.slice(0,20).map(n=><span key={n} style={{fontSize:9,padding:"1px 5px",borderRadius:3,fontWeight:700,background:used.has(n)?"#dcfce7":"#f1f5f9",color:used.has(n)?"#065f46":"#94a3b8",border:used.has(n)?"1px solid #86efac":"1px solid #e2e8f0"}}>{n}{used.has(n)?" ✓":""}</span>)}</div>:null;})()}
            </div>}
          </div>
        </div>

        {/* LIVE COUNTERS */}
        <div style={{background:totalSelected>0?"#0F1A2E":"#F3EEE4",borderRadius:6,padding:"14px 16px",fontSize:12,color:totalSelected>0?"#FAF7F2":"#66708A",fontWeight:500,boxShadow:totalSelected>0?"0 4px 14px -6px rgba(15,26,46,.3)":"0 0 0 1px rgba(15,26,46,.08)",transition:"background .3s, color .3s"}}>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,letterSpacing:1.4,opacity:.7,marginBottom:8}}>SELECTION</div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontFamily:"'IBM Plex Mono',monospace"}}>
            <span>Worksheets</span><span>{selWS.length.toString().padStart(2,"0")}</span>
          </div>
          {selWeDom.length>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontFamily:"'IBM Plex Mono',monospace"}}><span>WellEd Domain</span><span>{selWeDom.length.toString().padStart(2,"0")}</span></div>}
          {selVocab.length>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontFamily:"'IBM Plex Mono',monospace"}}><span>Vocab Items</span><span>{selVocab.length.toString().padStart(2,"0")}</span></div>}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:8,marginTop:6,borderTop:"1px solid "+(totalSelected>0?"rgba(250,247,242,.2)":"rgba(15,26,46,.1)"),fontFamily:"'IBM Plex Mono',monospace"}}>
            <span style={{fontSize:9,letterSpacing:1.4,opacity:.7}}>TOTAL QUESTIONS</span>
            <span style={{fontSize:13,fontWeight:600,color:totalSelected>0?"#FAF7F2":"#0F1A2E"}}>{totalQs.toString().padStart(3,"0")}</span>
          </div>
        </div>
      </div>

      {/* MIDDLE: STUDENT SUMMARY (when selected) + WORKSHEET PICKER */}
      <div style={{display:"flex",flexDirection:"column",gap:12,overflow:"hidden",maxHeight:"calc(100vh - 140px)"}}>
      {curStudent && <StudentSummaryCard student={curStudent}/>}
      <div style={{...CARD,display:"flex",flexDirection:"column",overflow:"hidden",flex:1,minHeight:0,padding:20}}>
        <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:16,flexShrink:0,paddingBottom:12,borderBottom:"1px solid rgba(15,26,46,.08)"}}>
          <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontSize:22,fontWeight:600,color:"#0F1A2E",letterSpacing:-.3}}>Worksheets <span style={{fontSize:11,fontWeight:500,color:"#66708A",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:.3,marginLeft:8}}>{Object.values(grouped).reduce((n,doms)=>n+Object.values(doms).reduce((m,subs)=>m+Object.values(subs).reduce((k,arr)=>k+arr.length,0),0),0)} shown</span></div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>{const a={};Object.values(grouped).forEach(doms=>Object.values(doms).forEach(subs=>Object.values(subs).forEach(arr=>arr.forEach(ws=>a[ws.id]=true))));setChk(prev=>({...prev,...a}));}} style={{...mkBtn("transparent","#2E3A57"),border:"1px solid rgba(15,26,46,.18)",padding:"5px 14px",fontSize:11}}>Select All</button>
            <button onClick={()=>setChk({})} style={{...mkBtn("transparent","#8C2E2E"),border:"1px solid rgba(140,46,46,.3)",padding:"5px 14px",fontSize:11}}>Clear</button>
          </div>
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          {Object.keys(grouped).length===0&&<div style={{color:"#94a3b8",textAlign:"center",paddingTop:40,fontSize:13}}>No worksheets match filters.</div>}
          {Object.entries(grouped).map(([subj,doms])=>{
            const sc = SUBJ_COLOR[subj]||{bg:"#F3EEE4",fg:"#2E3A57",accent:B2};
            return(
              <div key={subj} style={{marginBottom:24}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,paddingBottom:6,borderBottom:"1px solid rgba(15,26,46,.1)"}}>
                  <div style={{width:3,height:18,background:sc.accent}}/>
                  <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontSize:15,fontWeight:600,color:sc.fg,letterSpacing:-.15}}>{subj}</div>
                </div>
                {Object.entries(doms).map(([dom,subs])=>(
                  <div key={dom} style={{marginBottom:16,marginLeft:4}}>
                    <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,fontWeight:600,color:DOMAIN_COLOR[dom]||B2,padding:"3px 0",marginBottom:8,letterSpacing:1,textTransform:"uppercase"}}>{dom}</div>
                    {Object.entries(subs).sort((a,b)=>{const ac=a[0].startsWith("Comprehensive ")?0:1;const bc=b[0].startsWith("Comprehensive ")?0:1;return ac-bc||a[0].localeCompare(b[0]);}).map(([sub,arr])=>(
                      <div key={sub} style={{marginBottom:10,marginLeft:4}}>
                        <div style={{fontSize:10,fontWeight:500,color:"#66708A",letterSpacing:.6,marginBottom:4,fontStyle:"italic",fontFamily:"'Fraunces',Georgia,serif"}}>{sub}</div>
                        {arr.map(ws=>{
                          const ck=!!chk[ws.id];
                          const cnt=curStudent?.assignments?.reduce((n,a)=>n+(a.worksheets||[]).filter(w=>(w.id||w.title)===(ws.id)||w.title===ws.title).length,0)||0;
                          const lastDate = curStudent?lastAssignedDate(curStudent,ws.id):null;
                          return(
                            <div key={ws.id} onClick={()=>setChk(prev=>({...prev,[ws.id]:!prev[ws.id]}))} style={{display:"flex",alignItems:"center",padding:"8px 12px",cursor:"pointer",borderRadius:4,marginBottom:2,background:ck?"#E9F0F6":"transparent",boxShadow:ck?"inset 0 0 0 1px "+B2:"none",transition:"background .15s"}}>
                              <input type="checkbox" checked={ck} onChange={()=>{}} onClick={e=>{e.stopPropagation();setChk(prev=>({...prev,[ws.id]:!prev[ws.id]}));}} style={{marginRight:11,cursor:"pointer",accentColor:B2}}/>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:12,fontWeight:ck?600:400,color:"#0F1A2E",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                  {ws.title}
                                  {lastDate&&<span style={{fontSize:8,color:"#FAF7F2",background:"#8C2E2E",padding:"2px 7px",borderRadius:2,marginLeft:8,fontWeight:600,letterSpacing:.5,fontFamily:"'IBM Plex Mono',monospace",textTransform:"uppercase"}}>Assigned {lastDate}</span>}
                                </div>
                              </div>
                              {ws.qs>0&&<span style={{...mkPill("transparent","#003258"),marginRight:6,border:"1px solid rgba(0,50,88,.2)"}}>{ws.qs}Q</span>}
                              {cnt>0&&<span style={{...mkPill("transparent","#A9761B"),marginRight:6,flexShrink:0,border:"1px solid rgba(169,118,27,.35)"}}>×{cnt}</span>}
                              <span style={{...mkPill(DC[ws.difficulty]+"18",DC[ws.difficulty]),flexShrink:0,border:"1px solid "+DC[ws.difficulty]+"44"}}>{ws.difficulty}</span>
                              {ck&&<select value={evenOdd[ws.id]||""} onChange={e=>{e.stopPropagation();setEvenOdd(prev=>({...prev,[ws.id]:e.target.value}));}} onClick={e=>e.stopPropagation()} style={{marginLeft:8,fontSize:10,padding:"3px 5px",border:"1px solid rgba(15,26,46,.18)",borderRadius:3,background:"#fff",fontFamily:"'IBM Plex Mono',monospace"}}>
                                <option value="">All</option>
                                <option value="EVEN">Even</option>
                                <option value="ODD">Odd</option>
                              </select>}
                              {timeDrill&&ck&&<input type="number" placeholder="min" min={1} max={120} value={timeLims[ws.id]||""} onChange={e=>{e.stopPropagation();setTimeLims(prev=>({...prev,[ws.id]:e.target.value}));}} onClick={e=>e.stopPropagation()} style={{width:50,marginLeft:8,border:"1px solid "+B2,borderRadius:3,padding:"3px 6px",fontSize:11,outline:"none",fontFamily:"'IBM Plex Mono',monospace"}}/>}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      </div>

      {/* RIGHT: OUTPUT */}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <button onClick={generate} style={{...mkBtn(B2,"#FAF7F2"),padding:"14px 20px",fontSize:13,fontWeight:600,letterSpacing:.4,textTransform:"uppercase",boxShadow:"0 4px 14px -4px rgba(0,50,88,.45), inset 0 1px 0 rgba(255,255,255,.1)"}}>Generate Assignment →</button>
        <div style={{...CARD,flex:1,display:"flex",flexDirection:"column",padding:20}}>
          <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:14,flexShrink:0,flexWrap:"wrap",gap:8,paddingBottom:12,borderBottom:"1px solid rgba(15,26,46,.08)"}}>
            <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontSize:22,fontWeight:600,color:"#0F1A2E",letterSpacing:-.3}}>Output</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button onClick={copyRichOut} disabled={!output} title="Copy with bold formatting preserved" style={{...mkBtn(copied?"#4C7A4C":"transparent",copied?"#FAF7F2":"#003258"),border:"1px solid "+(copied?"#4C7A4C":"rgba(0,50,88,.3)"),padding:"5px 12px",fontSize:11,opacity:!output?.45:1}}>{copied?"✓ Copied":"Copy Rich"}</button>
              <button onClick={copyOut} disabled={!output} title="Copy plain text with asterisks" style={{...mkBtn("transparent","#2E3A57"),border:"1px solid rgba(15,26,46,.18)",padding:"5px 12px",fontSize:11,opacity:!output?.45:1}}>Plain</button>
              <button onClick={downloadPdf} disabled={!output} title="Download as PDF" style={{...mkBtn("transparent","#8C2E2E"),border:"1px solid rgba(140,46,46,.3)",padding:"5px 12px",fontSize:11,opacity:!output?.45:1}}>PDF</button>
            </div>
          </div>
          {output ? (
            <div style={{flex:1,border:"1px solid rgba(15,26,46,.12)",borderRadius:4,padding:18,fontSize:12,color:"#0F1A2E",background:"#FDFBF6",lineHeight:1.65,minHeight:260,overflowY:"auto",fontFamily:"'IBM Plex Sans',system-ui,sans-serif"}} dangerouslySetInnerHTML={{__html: mdBoldToHtml(output)}}/>
          ) : (
            <div style={{flex:1,border:"1.5px solid #e2e8f0",borderRadius:8,padding:14,fontSize:12,color:"#94a3b8",background:"#f8fafc",minHeight:260,display:"flex",alignItems:"center",justifyContent:"center"}}>Generate an assignment to see output here…</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============ STUDENT SUMMARY CARD (Generator) ============ */
function StudentSummaryCard({student}){
  const counts = buildHeatCounts(student);
  const diagProfile = useMemo(()=>student.diagnostics?.length?buildDiagnosticProfile(student.diagnostics):null,[student]);
  const lastAsg = [...(student.assignments||[])].reverse().find(a=>!a.preAssigned) || [...(student.assignments||[])].reverse()[0];
  const allAsg = (student.assignments||[]);
  // Latest practice exam score
  let latestPractice = null;
  allAsg.forEach(a=>(a.practiceExams||[]).forEach(ex=>{
    if(ex.score && (!latestPractice || (a.date||"")>=latestPractice.date)){
      latestPractice = {date:a.date,platform:ex.platform,number:ex.number,score:ex.score,type:ex.type};
    }
  }));

  // Recent score breakdown — most recent data point per domain and per subdomain
  const scorePts = useMemo(()=>allScoreDataPoints(student),[student]);
  const latestDomainByKey = useMemo(()=>{
    const m = {};
    scorePts.forEach(pt=>{
      if(pt.level==="domain" || pt.source==="history_welled"){
        const key = pt.subcategory;
        if(!m[key] || (pt.date||"")>(m[key].date||"")) m[key] = pt;
      }
    });
    return m;
  },[scorePts]);
  const latestSubByKey = useMemo(()=>{
    const m = {};
    scorePts.forEach(pt=>{
      if(pt.level==="sub"){
        const key = pt.subcategory;
        if(!m[key] || (pt.date||"")>(m[key].date||"")) m[key] = pt;
      }
    });
    return m;
  },[scorePts]);
  const domainRows = Object.values(latestDomainByKey).sort((a,b)=>{
    const ap = a.max?Math.round((a.score/a.max)*100):(a.pct||0);
    const bp = b.max?Math.round((b.score/b.max)*100):(b.pct||0);
    return ap-bp;
  });
  const subRows = Object.values(latestSubByKey).sort((a,b)=>{
    const ap = a.max?Math.round((a.score/a.max)*100):(a.pct||0);
    const bp = b.max?Math.round((b.score/b.max)*100):(b.pct||0);
    return ap-bp;
  }).slice(0,6);

  const eyebrow = {fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:"#66708A",textTransform:"uppercase",letterSpacing:1.2,marginBottom:8};
  const hairline = {marginTop:14,paddingTop:14,borderTop:"1px solid rgba(15,26,46,.08)"};

  return(
    <div style={{...CARD,padding:18,background:"#fff"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16,paddingBottom:14,borderBottom:"1px solid rgba(15,26,46,.08)"}}>
        <div style={{width:44,height:44,borderRadius:4,background:B2,color:"#FAF7F2",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontWeight:600,fontSize:20,flexShrink:0,boxShadow:"0 2px 8px -4px rgba(0,74,121,.5)"}}>{student.name.charAt(0).toUpperCase()}</div>
        <div>
          <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontSize:20,fontWeight:600,color:"#0F1A2E",letterSpacing:-.3,lineHeight:1.1}}>{student.name}</div>
          <div style={{fontSize:10,color:"#66708A",fontStyle:"italic",marginTop:2}}>Quick reference while assigning</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
          {diagProfile?.totalLower!=null && <span style={{...mkPill("transparent","#8C2E2E"),border:"1px solid rgba(140,46,46,.3)"}}>Diag {diagProfile.totalLower}–{diagProfile.totalUpper}</span>}
          {latestPractice && <span style={{...mkPill("transparent","#003258"),border:"1px solid rgba(0,50,88,.28)"}}>Last {latestPractice.score}</span>}
          <span style={{...mkPill("transparent","#2E3A57"),border:"1px solid rgba(15,26,46,.18)"}}>{allAsg.length} session{allAsg.length!==1?"s":""}</span>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        {/* Left: mini heat map (worksheets+WellEd) */}
        <div>
          <div style={eyebrow}>Coverage · Worksheets + WellEd</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4}}>
            {ALL_DOMAINS.map(d=>{
              const total = DIFFS.reduce((n,diff)=>n+(counts[`${d}|${diff}`]||0),0);
              const short = d.replace(/Problem-Solving & Data Analysis/,"PSDA").replace(/Standard English Conventions/,"SEC").replace(/Information & Ideas/,"Info").replace(/Craft & Structure/,"C&S").replace(/Expression of Ideas/,"EOI").replace(/Advanced Math/,"Adv Math").replace(/Geometry & Trigonometry/,"Geo");
              const hot = total>=3;
              return(
                <div key={d} title={`${d}: ${total}`} style={{background:heatCellColor(total),borderRadius:3,padding:"6px 4px",textAlign:"center",border:"1px solid "+(total>0?"transparent":"rgba(15,26,46,.08)")}}>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:8,color:hot?"#FAF7F2":"#66708A",fontWeight:500,lineHeight:1,letterSpacing:.3}}>{short}</div>
                  <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontSize:16,fontWeight:600,color:hot?"#FAF7F2":total>0?"#0F1A2E":"rgba(15,26,46,.25)",marginTop:2}}>{total||"·"}</div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Right: diagnostic weakest areas */}
        <div>
          <div style={eyebrow}>Diagnostic · Weakest Areas</div>
          {diagProfile?.subs?.length ? (
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {[...diagProfile.subs].sort((a,b)=>(a.pct||0)-(b.pct||0)).slice(0,4).map(s=>(
                <div key={s.domain+s.name} style={{display:"flex",alignItems:"center",gap:8,fontSize:10}}>
                  <div style={{width:38,height:18,background:heatColorPct(s.pct),color:"#FAF7F2",borderRadius:2,fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,letterSpacing:.2}}>{s.pct}%</div>
                  <div style={{flex:1,color:"#2E3A57",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{fontSize:10,color:"#66708A",fontStyle:"italic"}}>No diagnostic uploaded yet</div>
          )}
        </div>
      </div>

      {/* Recent score breakdown by domain/subdomain */}
      {(domainRows.length>0 || subRows.length>0) && <div style={hairline}>
        <div style={eyebrow}>Recent Score Breakdown · latest per area</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <div>
            <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:10,fontStyle:"italic",color:"#66708A",marginBottom:6}}>By Domain</div>
            {domainRows.length===0 ? <div style={{fontSize:10,color:"#66708A",fontStyle:"italic"}}>No domain scores yet</div> : (
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {domainRows.slice(0,6).map(pt=>{
                  const pct = pt.max?Math.round((pt.score/pt.max)*100):(pt.pct||0);
                  const label = pt.subcategory.replace(/^(Math|Reading & Writing) — /,"").replace(/\s*\(easy\)/i," (E)").replace(/\s*\(medium\)/i," (M)").replace(/\s*\(hard\)/i," (H)").replace(/\s*\(comprehensive\)/i," (C)");
                  return(
                    <div key={pt.subcategory} style={{display:"flex",alignItems:"center",gap:8,fontSize:10}}>
                      <div style={{width:38,height:18,background:heatColorPct(pct),color:"#FAF7F2",borderRadius:2,fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,letterSpacing:.2}}>{pct}%</div>
                      <div style={{flex:1,color:"#2E3A57",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={`${pt.subcategory} · ${pt.score}${pt.max?"/"+pt.max:""} · ${pt.date||""}`}>{label}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:10,fontStyle:"italic",color:"#66708A",marginBottom:6}}>Weakest Subskills</div>
            {subRows.length===0 ? <div style={{fontSize:10,color:"#66708A",fontStyle:"italic"}}>No subskill scores yet</div> : (
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {subRows.map(pt=>{
                  const pct = pt.max?Math.round((pt.score/pt.max)*100):(pt.pct||0);
                  const name = pt.subcategory.split(" — ").pop();
                  return(
                    <div key={pt.subcategory} style={{display:"flex",alignItems:"center",gap:8,fontSize:10}}>
                      <div style={{width:38,height:18,background:heatColorPct(pct),color:"#FAF7F2",borderRadius:2,fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,letterSpacing:.2}}>{pct}%</div>
                      <div style={{flex:1,color:"#2E3A57",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={`${pt.subcategory} · ${pt.score}${pt.max?"/"+pt.max:""} · ${pt.date||""}`}>{name}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>}

      {/* Last PSM set */}
      {lastAsg && <div style={hairline}>
        <div style={eyebrow}>Last PSM Set · {lastAsg.date}</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
          {(lastAsg.worksheets||[]).slice(0,6).map((w,i)=>(
            <span key={i} style={{background:"#FAF7F2",border:"1px solid rgba(15,26,46,.12)",borderRadius:2,padding:"3px 8px",fontSize:10,color:"#2E3A57",fontFamily:"'IBM Plex Sans',system-ui,sans-serif"}}>{w.title}</span>
          ))}
          {(lastAsg.worksheets||[]).length>6 && <span style={{fontSize:10,color:"#66708A",fontStyle:"italic",padding:"3px 4px"}}>+{lastAsg.worksheets.length-6} more</span>}
          {(lastAsg.welledDomain||[]).map((w,i)=>(
            <span key={`w${i}`} style={{background:"#F5ECDF",border:"1px solid rgba(154,91,31,.25)",color:"#6E3F12",borderRadius:2,padding:"3px 8px",fontSize:10,fontFamily:"'IBM Plex Sans',system-ui,sans-serif"}}>{w.label}</span>
          ))}
          {(lastAsg.practiceExams||[]).map((ex,i)=>(
            <span key={`p${i}`} style={{background:"#E9F0F6",border:"1px solid rgba(0,74,121,.25)",color:"#003258",borderRadius:2,padding:"3px 8px",fontSize:10,fontFamily:"'IBM Plex Sans',system-ui,sans-serif"}}>{ex.platform} #{ex.number}</span>
          ))}
        </div>
      </div>}
    </div>
  );
}

function VocabPicker({vocabChk,setVocabChk}){
  const[search,setSearch]=useState("");
  const[show,setShow]=useState({}); // show quizzes for set
  const sets = useMemo(()=>VOCAB_SETS.filter(n=>n.toLowerCase().includes(search.toLowerCase())),[search]);
  return(
    <div>
      <input placeholder="Search vocab sets…" value={search} onChange={e=>setSearch(e.target.value)} style={{...INP,fontSize:11,marginBottom:8,fontStyle:search?"normal":"italic"}}/>
      <div style={{maxHeight:240,overflowY:"auto",border:"1px solid rgba(91,75,138,.22)",borderRadius:4,padding:6,background:"rgba(255,255,255,.5)"}}>
        {sets.map(name=>{
          const flashId = `VF|${name}`;
          const expanded = show[name];
          return(
            <div key={name} style={{marginBottom:4,background:expanded?"rgba(91,75,138,.06)":"transparent",borderRadius:3,padding:"5px 6px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,fontSize:11}}>
                <input type="checkbox" checked={!!vocabChk[flashId]} onChange={()=>setVocabChk(prev=>({...prev,[flashId]:!prev[flashId]}))} style={{accentColor:"#5B4B8A"}}/>
                <span style={{flex:1,fontWeight:500,color:"#0F1A2E"}}>{name}</span>
                <button onClick={()=>setShow(prev=>({...prev,[name]:!prev[name]}))} style={{background:"transparent",border:"1px solid rgba(91,75,138,.35)",borderRadius:2,padding:"2px 8px",fontSize:9,color:"#5B4B8A",cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:.4,textTransform:"uppercase",fontWeight:500}}>{expanded?"Hide":"Quiz"}</button>
              </div>
              {expanded&&<div style={{display:"flex",gap:4,marginTop:6,marginLeft:22}}>
                {[1,2,3,4].map(v=>{
                  const qid = `VQ|${name}|${v}`;
                  const ck=!!vocabChk[qid];
                  return <button key={v} onClick={()=>setVocabChk(prev=>({...prev,[qid]:!prev[qid]}))} style={{background:ck?"#5B4B8A":"transparent",color:ck?"#FAF7F2":"#5B4B8A",border:"1px solid "+(ck?"#5B4B8A":"rgba(91,75,138,.35)"),borderRadius:2,padding:"3px 12px",fontSize:10,fontWeight:500,cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:.3}}>Q{v}</button>;
                })}
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============ STUDENTS LIST ============ */
function StudentsList({students,showAdd,setShowAdd,newS,setNewS,addStudent,openProfile,delStudent}){
  const thStyle = {padding:"12px 16px",textAlign:"left",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,letterSpacing:1.2,textTransform:"uppercase",color:"#66708A",borderBottom:"1px solid rgba(15,26,46,.15)"};
  return(
    <div>
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:24,paddingBottom:16,borderBottom:"1px solid rgba(15,26,46,.1)"}}>
        <div>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,fontWeight:600,letterSpacing:1.4,color:"#66708A",textTransform:"uppercase",marginBottom:6}}>Roster</div>
          <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 144',fontSize:34,fontWeight:600,color:"#0F1A2E",letterSpacing:-.6,lineHeight:1}}>Students</div>
        </div>
        <button onClick={()=>setShowAdd(!showAdd)} style={{...mkBtn(B2,"#FAF7F2"),padding:"10px 18px",fontSize:12,fontWeight:600,letterSpacing:.3,textTransform:"uppercase",boxShadow:"0 4px 14px -4px rgba(0,50,88,.4)"}}>{showAdd?"Cancel":"+ New Student"}</button>
      </div>
      {showAdd&&(
        <div style={{...CARD,maxWidth:640,marginBottom:24,padding:24}}>
          <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontSize:20,fontWeight:600,color:"#0F1A2E",marginBottom:16,letterSpacing:-.3}}>New Student</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:18}}>
            {[["name","Student Name *","e.g. Jane Smith"],["grade","Grade Level","e.g. 11th"],["tutor","Assigned Tutor","Tutor name"],["notes","Notes","Optional info"]].map(([k,label,ph])=>(
              <div key={k}>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#66708A",marginBottom:5,fontWeight:600,letterSpacing:1.2,textTransform:"uppercase"}}>{label}</div>
                <input value={newS[k]} onChange={e=>setNewS(prev=>({...prev,[k]:e.target.value}))} placeholder={ph} style={INP}/>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={addStudent} style={{...mkBtn(B2,"#FAF7F2"),padding:"8px 18px",fontSize:12,fontWeight:600,letterSpacing:.3,textTransform:"uppercase"}}>Add Student</button>
            <button onClick={()=>setShowAdd(false)} style={{...mkBtn("transparent","#2E3A57"),border:"1px solid rgba(15,26,46,.18)",padding:"8px 18px",fontSize:12}}>Cancel</button>
          </div>
        </div>
      )}
      {students.length===0?(
        <div style={{...CARD,padding:"72px 40px",textAlign:"center"}}>
          <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 144',fontStyle:"italic",fontSize:22,fontWeight:400,color:"#66708A",letterSpacing:-.2,marginBottom:8}}>No students enrolled yet.</div>
          <div style={{fontSize:11,color:"#66708A"}}>Click <span style={{fontWeight:600,color:"#0F1A2E"}}>+ New Student</span> to get started.</div>
        </div>
      ):(
        <div style={{...CARD,overflow:"hidden",padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{["Name","Grade","Tutor","Enrolled","Worksheets","Diagnostics",""].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>
              {students.map((st,i)=>{
                const wsCnt=(st.assignments||[]).reduce((n,a)=>n+(a.worksheets||[]).length,0);
                const dCnt=(st.diagnostics||[]).length;
                return(
                  <tr key={st.id} style={{borderBottom:i===students.length-1?"none":"1px solid rgba(15,26,46,.06)"}}>
                    <td style={{padding:"14px 16px"}}>
                      <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontSize:16,fontWeight:600,color:"#0F1A2E",letterSpacing:-.2}}>{st.name}</div>
                    </td>
                    <td style={{padding:"14px 16px",fontSize:12,color:"#2E3A57"}}>{st.grade||<span style={{color:"#66708A"}}>—</span>}</td>
                    <td style={{padding:"14px 16px",fontSize:12,color:"#2E3A57"}}>{st.tutor||<span style={{color:"#66708A"}}>—</span>}</td>
                    <td style={{padding:"14px 16px",fontSize:11,color:"#66708A",fontFamily:"'IBM Plex Mono',monospace"}}>{st.dateAdded}</td>
                    <td style={{padding:"14px 16px"}}><span style={{...mkPill("transparent","#003258"),border:"1px solid rgba(0,50,88,.25)"}}>{wsCnt} sheets</span></td>
                    <td style={{padding:"14px 16px"}}><span style={{...mkPill("transparent",dCnt?"#4C7A4C":"#66708A"),border:"1px solid "+(dCnt?"rgba(76,122,76,.35)":"rgba(15,26,46,.15)")}}>{dCnt} reports</span></td>
                    <td style={{padding:"14px 16px",textAlign:"right"}}><div style={{display:"flex",gap:6,justifyContent:"flex-end"}}><button onClick={()=>openProfile(st)} style={{...mkBtn("transparent",B2),border:"1px solid rgba(0,74,121,.3)",padding:"5px 14px",fontSize:11}}>Profile →</button><button onClick={()=>delStudent(st.id)} title="Remove student" style={{...mkBtn("transparent","#8C2E2E"),border:"1px solid rgba(140,46,46,.3)",padding:"5px 10px",fontSize:11}}>✕</button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============ STUDENT PROFILE ============ */
function StudentProfile({p,setProfile,ptab,setPtab,paChk,setPaChk,paSubj,setPaSubj,paSrch,setPaSrch,savePreAssign,paDate,setPaDate,paWeChk,setPaWeChk,paBBNums,setPaBBNums,paWENums,setPaWENums,sfm,setSfm,addScore,delScore,delAsg,setExamScore,setWelledDomainScore,addWelledLog,delWelledLog,handleDiagUpload,clearDiagnostics,diagInputRef,diagProfile,showToast,students,setStudents,examType,handleWelledUpload,welledInputRef,customAssignments,setCustomAssignments}){
  const[editDateId,setEditDateId]=useState(null);
  const[editDateVal,setEditDateVal]=useState("");
  const paFiltered = useMemo(()=>ALL_WS.filter(ws=>{
    if(paSubj!=="All"&&ws.subject!==paSubj)return false;
    if(paSrch&&!ws.title.toLowerCase().includes(paSrch.toLowerCase()))return false;
    return true;
  }),[paSubj,paSrch]);
  const paGrouped = useMemo(()=>{
    const g={};
    paFiltered.forEach(ws=>{
      const k=`${ws.subject}|${ws.domain}|${ws.subdomain}`;
      if(!g[k])g[k]={subject:ws.subject,domain:ws.domain,subdomain:ws.subdomain,sheets:[]};
      g[k].sheets.push(ws);
    });
    return Object.values(g);
  },[paFiltered]);

  return(
    <div>
      {/* HEADER — editorial masthead for a student profile */}
      <div style={{marginBottom:20,paddingBottom:18,borderBottom:"1px solid rgba(15,26,46,.1)"}}>
        <button onClick={()=>setProfile(null)} style={{...mkBtn("transparent","#66708A"),border:"none",padding:"0",fontSize:11,marginBottom:14,letterSpacing:.4,textTransform:"uppercase",cursor:"pointer"}}>← Back to Roster</button>
        <div style={{display:"flex",alignItems:"flex-start",gap:20,flexWrap:"wrap"}}>
          <div style={{width:64,height:64,borderRadius:4,background:B2,display:"flex",alignItems:"center",justifyContent:"center",color:"#FAF7F2",fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 144',fontSize:32,fontWeight:600,flexShrink:0,boxShadow:"0 6px 18px -8px rgba(0,50,88,.5)"}}>{p.name.charAt(0).toUpperCase()}</div>
          <div style={{flex:"1 1 320px",minWidth:0}}>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,letterSpacing:1.4,color:"#66708A",textTransform:"uppercase",marginBottom:4}}>Student Profile</div>
            <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 144',fontSize:36,fontWeight:600,color:"#0F1A2E",letterSpacing:-.6,lineHeight:1}}>{p.name}</div>
            <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
              {p.grade&&<span style={{...mkPill("transparent","#003258"),border:"1px solid rgba(0,50,88,.28)"}}>Grade {p.grade}</span>}
              {p.tutor&&<span style={{...mkPill("transparent","#4C7A4C"),border:"1px solid rgba(76,122,76,.35)"}}>{p.tutor}</span>}
              <span style={{...mkPill("transparent","#2E3A57"),border:"1px solid rgba(15,26,46,.18)"}}>Since {p.dateAdded}</span>
              {p.notes&&<span style={{...mkPill("transparent","#6E3F12"),border:"1px solid rgba(154,91,31,.35)"}}>{p.notes}</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:0,borderLeft:"1px solid rgba(15,26,46,.1)"}}>
            {[[(p.assignments||[]).reduce((n,a)=>n+(a.worksheets||[]).length,0),"Worksheets"],[(p.diagnostics||[]).length,"Diagnostics"],[(p.assignments||[]).length,"Sessions"]].map(([v,l])=>(
              <div key={l} style={{textAlign:"center",padding:"0 24px",borderRight:"1px solid rgba(15,26,46,.1)"}}>
                <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 144',fontSize:34,fontWeight:600,color:"#0F1A2E",letterSpacing:-.6,lineHeight:1}}>{v}</div>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",color:"#66708A",fontSize:9,letterSpacing:1.2,textTransform:"uppercase",marginTop:6,fontWeight:500}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SUB-TABS — same editorial treatment as the main tab bar */}
      <div style={{display:"flex",gap:32,marginBottom:24,borderBottom:"1px solid rgba(15,26,46,.12)",flexWrap:"wrap"}}>
        {[{id:"history",label:"Assignment History"},{id:"diagnostics",label:"Diagnostics"},{id:"preassign",label:"Pre-Assign"},{id:"scores",label:"Score History"}].map(pt=>{
          const active = ptab===pt.id;
          return(
            <button key={pt.id} onClick={()=>setPtab(pt.id)} style={{border:"none",background:"none",cursor:"pointer",padding:"14px 0",fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 48',fontSize:15,fontWeight:active?600:500,color:active?"#0F1A2E":"#66708A",borderBottom:active?"2px solid #0F1A2E":"2px solid transparent",marginBottom:-1,letterSpacing:-.1,position:"relative"}}>
              {pt.label}
              {active&&<span style={{position:"absolute",left:"50%",bottom:-2,width:5,height:5,transform:"translate(-50%,50%) rotate(45deg)",background:"#9A5B1F"}}/>}
            </button>
          );
        })}
      </div>

      {/* ASSIGNMENT HISTORY */}
      {ptab==="history"&&(
        <div>
          {(!p.assignments||p.assignments.length===0)?(
            <div style={{...CARD,padding:"60px 40px",textAlign:"center"}}>
              <div style={{fontFamily:"'Fraunces',Georgia,serif",fontStyle:"italic",fontSize:20,color:"#66708A",letterSpacing:-.2}}>No assignments recorded yet.</div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {[...p.assignments].reverse().map(asg=>(
                <div key={asg.id} style={{...CARD,padding:20}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14,paddingBottom:12,borderBottom:"1px solid rgba(15,26,46,.08)",gap:12,flexWrap:"wrap"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                      {editDateId===asg.id ? (
                        <span style={{display:"flex",alignItems:"center",gap:6}}>
                          <input type="date" value={editDateVal} onChange={e=>setEditDateVal(e.target.value)} style={{...INP,width:150,fontSize:12,padding:"4px 8px"}}/>
                          <button onClick={()=>{setStudents(prev=>prev.map(st=>st.id===p.id?{...st,assignments:(st.assignments||[]).map(a=>a.id===asg.id?{...a,date:editDateVal}:a)}:st));setEditDateId(null);showToast("Date updated");}} style={{...mkBtn("#4C7A4C","#FAF7F2"),padding:"4px 12px",fontSize:10}}>Save</button>
                          <button onClick={()=>setEditDateId(null)} style={{...mkBtn("transparent","#66708A"),border:"1px solid rgba(15,26,46,.18)",padding:"4px 12px",fontSize:10}}>Cancel</button>
                        </span>
                      ) : (
                        <span style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontSize:18,fontWeight:600,color:"#0F1A2E",letterSpacing:-.2}}>{asg.date}</span>
                          <button onClick={()=>{setEditDateId(asg.id);setEditDateVal(asg.date||todayStr());}} title="Edit date" style={{background:"none",border:"1px solid rgba(15,26,46,.15)",borderRadius:2,cursor:"pointer",fontSize:9,color:"#66708A",padding:"2px 8px",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:.4,textTransform:"uppercase",fontWeight:500}}>Edit</button>
                        </span>
                      )}
                      {asg.preAssigned&&<span style={{...mkPill("transparent","#6E3F12"),border:"1px solid rgba(154,91,31,.35)"}}>Pre-existing</span>}
                      {asg.examType&&asg.examType!=="SAT"&&<span style={{...mkPill("transparent","#5B4B8A"),border:"1px solid rgba(91,75,138,.35)"}}>{asg.examType}</span>}
                      {asg.timeDrill&&<span style={{...mkPill("transparent","#003258"),border:"1px solid rgba(0,50,88,.28)"}}>Timed</span>}
                      {asg.oneNote&&<span style={{...mkPill("transparent","#4C7A4C"),border:"1px solid rgba(76,122,76,.35)"}}>OneNote</span>}
                      <span style={{...mkPill("transparent","#66708A"),border:"1px solid rgba(15,26,46,.15)"}}>{(asg.worksheets||[]).length} worksheet{(asg.worksheets||[]).length!==1?"s":""}</span>
                    </div>
                    <button onClick={()=>delAsg(asg.id)} style={{...mkBtn("transparent","#8C2E2E"),border:"1px solid rgba(140,46,46,.3)",padding:"4px 12px",fontSize:10}}>Remove</button>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                    {(asg.worksheets||[]).map(ws=>(
                      <span key={ws.id||ws.title} style={{background:"#FAF7F2",border:"1px solid rgba(15,26,46,.12)",borderRadius:2,padding:"4px 10px",fontSize:11,color:"#2E3A57",fontFamily:"'IBM Plex Sans',system-ui,sans-serif",display:"inline-flex",alignItems:"center",gap:6}}>
                        {ws.title||ws.name}
                        {ws.evenOdd&&<em style={{color:"#5B4B8A",fontSize:9,fontStyle:"italic"}}>{ws.evenOdd}</em>}
                        <span style={{color:DC[ws.difficulty],fontSize:9,fontWeight:600,letterSpacing:.3,textTransform:"uppercase",fontFamily:"'IBM Plex Mono',monospace"}}>{ws.difficulty}</span>
                      </span>
                    ))}
                  </div>
                  {(asg.welledDomain||[]).length>0&&<div style={{marginTop:14,padding:14,background:"#F5ECDF",borderRadius:4,border:"1px solid rgba(154,91,31,.2)"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:"#6E3F12",letterSpacing:1.2,textTransform:"uppercase"}}>WellEd Domain Assignments</div>
                      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#66708A",letterSpacing:.4,textTransform:"uppercase",fontWeight:500}}>Auto-synced to Score Tracking</div>
                    </div>
                    {asg.welledDomain.map((i,idx)=>{
                      const wMax = i.subject==="Math"?22:27;
                      return(
                      <div key={idx} style={{display:"flex",alignItems:"center",gap:10,fontSize:11,marginBottom:4}}>
                        <span style={{flex:1,color:"#6E3F12",fontWeight:500}}>{i.label}</span>
                        <span style={{fontSize:9,color:"#66708A",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:.4,textTransform:"uppercase"}}>Score</span>
                        <input type="number" min="0" max={wMax} placeholder="0" value={i.score||""} onChange={e=>setWelledDomainScore(asg.id,idx,e.target.value)} style={{width:54,padding:"4px 8px",border:"1px solid rgba(154,91,31,.35)",borderRadius:2,fontSize:11,textAlign:"right",fontFamily:"'IBM Plex Mono',monospace",background:"#fff"}}/>
                        <span style={{fontSize:10,color:"#6E3F12",fontWeight:600,minWidth:28,fontFamily:"'IBM Plex Mono',monospace"}}>/ {wMax}</span>
                      </div>
                    );})}
                  </div>}
                  {(asg.vocab||[]).length>0&&<div style={{marginTop:14,padding:14,background:"#EFEAE0",borderRadius:4,border:"1px solid rgba(91,75,138,.2)"}}>
                    <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:"#3A305C",marginBottom:8,letterSpacing:1.2,textTransform:"uppercase"}}>Vocabulary</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      {asg.vocab.map((v,idx)=><span key={idx} style={{background:"#fff",color:"#3A305C",padding:"3px 10px",borderRadius:2,fontSize:11,border:"1px solid rgba(91,75,138,.25)"}}>{v.label}</span>)}
                    </div>
                  </div>}
                  {(asg.practiceExams||[]).length>0&&<div style={{marginTop:14,padding:14,background:"#E9F0F6",borderRadius:4,border:"1px solid rgba(0,74,121,.2)"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:"#003258",letterSpacing:1.2,textTransform:"uppercase"}}>Practice Exams</div>
                      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#66708A",letterSpacing:.4,textTransform:"uppercase",fontWeight:500}}>Auto-synced to Score Tracking</div>
                    </div>
                    {asg.practiceExams.map((ex,idx)=>{
                      const isFull = ex.type!=="section";
                      const rw = ex.rwScore||"", math = ex.mathScore||"";
                      const total = (Number(rw)||0)+(Number(math)||0);
                      const examInp = {width:60,padding:"4px 8px",border:"1px solid rgba(0,74,121,.35)",borderRadius:2,fontSize:11,textAlign:"right",fontFamily:"'IBM Plex Mono',monospace",background:"#fff"};
                      return(
                      <div key={idx} style={{display:"flex",alignItems:"center",gap:8,fontSize:11,marginBottom:6,flexWrap:"wrap"}}>
                        <span style={{flex:"1 1 200px",fontWeight:500,color:"#003258"}}>{ex.platform} Practice Test #{ex.number||"?"}{isFull?"":" (Section)"}</span>
                        {isFull ? (<>
                          <span style={{fontSize:9,color:"#66708A",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:.4,textTransform:"uppercase"}}>R&amp;W</span>
                          <input type="number" min="0" max="800" placeholder="0" value={rw} onChange={e=>setExamScore(asg.id,idx,{rwScore:e.target.value})} style={examInp}/>
                          <span style={{fontSize:10,color:"#003258",fontWeight:600,fontFamily:"'IBM Plex Mono',monospace"}}>/ 800</span>
                          <span style={{fontSize:9,color:"#66708A",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:.4,textTransform:"uppercase"}}>Math</span>
                          <input type="number" min="0" max="800" placeholder="0" value={math} onChange={e=>setExamScore(asg.id,idx,{mathScore:e.target.value})} style={examInp}/>
                          <span style={{fontSize:10,color:"#003258",fontWeight:600,fontFamily:"'IBM Plex Mono',monospace"}}>/ 800</span>
                          {(rw||math) && <span style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:14,fontWeight:600,color:"#003258",marginLeft:6}}>= {total}/1600</span>}
                        </>) : (<>
                          <select value={ex.sectionSubject||""} onChange={e=>setExamScore(asg.id,idx,{sectionSubject:e.target.value})} style={{padding:"4px 10px",border:"1px solid rgba(0,74,121,.35)",borderRadius:2,fontSize:11,background:"#fff"}}>
                            <option value="">Section…</option>
                            <option value="R&W">R&amp;W</option>
                            <option value="Math">Math</option>
                          </select>
                          <span style={{fontSize:9,color:"#66708A",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:.4,textTransform:"uppercase"}}>Score</span>
                          <input type="number" min="0" max="800" placeholder="0" value={ex.score||""} onChange={e=>setExamScore(asg.id,idx,{score:e.target.value})} style={examInp}/>
                          <span style={{fontSize:10,color:"#003258",fontWeight:600,fontFamily:"'IBM Plex Mono',monospace"}}>/ 800</span>
                        </>)}
                      </div>
                    );})}
                  </div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DIAGNOSTICS */}
      {ptab==="diagnostics"&&(
        <div>
          <div style={{...CARD,marginBottom:16,padding:20}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
              <div style={{flex:"1 1 320px"}}>
                <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontSize:20,fontWeight:600,color:"#0F1A2E",letterSpacing:-.3,marginBottom:6}}>Diagnostic Reports</div>
                <div style={{fontSize:12,color:"#66708A",lineHeight:1.55,maxWidth:520}}>Upload ZipGrade SAT Diagnostic PDFs (Reading, Math Mod 1, Math Mod 2). The parser extracts domain and subdomain scores automatically.</div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <input ref={diagInputRef} type="file" multiple accept="application/pdf" onChange={e=>handleDiagUpload(e.target.files)} style={{display:"none"}}/>
                <button onClick={()=>diagInputRef.current?.click()} style={{...mkBtn(B2,"#FAF7F2"),padding:"8px 16px",fontSize:11,fontWeight:600,letterSpacing:.3,textTransform:"uppercase"}}>Upload Diagnostic PDF</button>
                <input ref={welledInputRef} type="file" multiple accept="application/pdf" onChange={e=>handleWelledUpload(e.target.files)} style={{display:"none"}}/>
                <button onClick={()=>welledInputRef.current?.click()} style={{...mkBtn("transparent","#6E3F12"),border:"1px solid rgba(154,91,31,.4)",padding:"8px 16px",fontSize:11}}>Upload WellEd Report</button>
                {(p.diagnostics||[]).length>0&&<button onClick={clearDiagnostics} style={{...mkBtn("transparent","#8C2E2E"),border:"1px solid rgba(140,46,46,.3)",padding:"8px 14px",fontSize:11}}>Clear</button>}
              </div>
            </div>
          </div>

          {(!p.diagnostics||p.diagnostics.length===0)?(
            <div style={{...CARD,padding:"72px 40px",textAlign:"center"}}>
              <div style={{fontFamily:"'Fraunces',Georgia,serif",fontStyle:"italic",fontSize:22,color:"#66708A",letterSpacing:-.2,marginBottom:8}}>No diagnostic reports uploaded yet.</div>
              <div style={{fontSize:11,color:"#66708A"}}>Upload the student's ZipGrade SAT Diagnostic PDFs to see their domain and subdomain breakdown.</div>
            </div>
          ):(<>
            {/* Report list */}
            <div style={{...CARD,marginBottom:16,padding:20}}>
              <SH>Uploaded Reports</SH>
              <div style={{display:"flex",flexDirection:"column",gap:2}}>
                {p.diagnostics.map((r,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 12px",borderRadius:2,fontSize:12,background:i%2===0?"rgba(15,26,46,.02)":"transparent"}}>
                    <span style={{fontWeight:500,color:"#0F1A2E",fontFamily:"'Fraunces',Georgia,serif",fontSize:13}}>{r.fileName}</span>
                    <span style={{...mkPill("transparent","#003258"),border:"1px solid rgba(0,50,88,.25)"}}>{r.subject}</span>
                    <span style={{marginLeft:"auto",color:"#2E3A57",fontFamily:"'IBM Plex Mono',monospace",fontSize:11}}>{r.earned}/{r.possible} · {r.percentCorrect}%</span>
                    <span style={{color:"#66708A",fontSize:10,fontFamily:"'IBM Plex Mono',monospace"}}>{r.tags?.length||0} tags</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Diagnostic Section & Total Scores — quiet data readout */}
            {diagProfile&&(diagProfile.rwScore||diagProfile.mathScore)&&<div style={{...CARD,marginBottom:16,padding:24}}>
              <SH>Baseline Scores · Estimated Scaled Range</SH>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:0,borderTop:"1px solid rgba(15,26,46,.08)"}}>
                {diagProfile.rwScore&&<div style={{padding:"16px 22px",borderRight:"1px solid rgba(15,26,46,.08)",borderBottom:"1px solid rgba(15,26,46,.08)"}}>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:"#66708A",textTransform:"uppercase",letterSpacing:1.4}}>R&amp;W Section</div>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:20,fontWeight:500,color:"#003258",marginTop:6,letterSpacing:.2,lineHeight:1.1}}>{diagProfile.rwScore.lower}<span style={{color:"rgba(0,50,88,.5)",margin:"0 2px"}}>–</span>{diagProfile.rwScore.upper}</div>
                  <div style={{fontSize:10,color:"#66708A",marginTop:6,fontFamily:"'IBM Plex Mono',monospace"}}>Raw {diagProfile.rwScore.earn}/{diagProfile.rwScore.poss}</div>
                </div>}
                {diagProfile.mathScore&&<div style={{padding:"16px 22px",borderRight:"1px solid rgba(15,26,46,.08)",borderBottom:"1px solid rgba(15,26,46,.08)"}}>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:"#66708A",textTransform:"uppercase",letterSpacing:1.4}}>Math Section</div>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:20,fontWeight:500,color:"#6E3F12",marginTop:6,letterSpacing:.2,lineHeight:1.1}}>{diagProfile.mathScore.lower}<span style={{color:"rgba(110,63,18,.5)",margin:"0 2px"}}>–</span>{diagProfile.mathScore.upper}</div>
                  <div style={{fontSize:10,color:"#66708A",marginTop:6,fontFamily:"'IBM Plex Mono',monospace"}}>Raw {diagProfile.mathScore.earn}/{diagProfile.mathScore.poss}</div>
                </div>}
                {diagProfile.totalLower!=null&&<div style={{padding:"16px 22px",borderBottom:"1px solid rgba(15,26,46,.08)"}}>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:"#66708A",textTransform:"uppercase",letterSpacing:1.4}}>Total SAT · Est.</div>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:22,fontWeight:600,color:"#0F1A2E",marginTop:6,letterSpacing:.2,lineHeight:1.1}}>{diagProfile.totalLower}<span style={{color:"rgba(15,26,46,.4)",margin:"0 2px"}}>–</span>{diagProfile.totalUpper}</div>
                  <div style={{fontSize:10,color:"#66708A",marginTop:6,fontFamily:"'IBM Plex Mono',monospace"}}>Out of 1600</div>
                </div>}
              </div>
            </div>}

            {/* Domain / Subskill performance */}
            {diagProfile&&<div style={{...CARD,marginBottom:16,padding:20}}>
              <SH>Performance Breakdown · Weakest First</SH>
              {diagProfile.domains.length>0&&<div style={{marginBottom:24}}>
                <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontSize:14,fontStyle:"italic",color:"#2E3A57",marginBottom:12}}>By Domain</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:8}}>
                  {diagProfile.domains.sort((a,b)=>(a.pct||0)-(b.pct||0)).map(d=>(
                    <div key={d.name} style={{background:heatColorPct(d.pct),color:"#FAF7F2",padding:"14px 16px",borderRadius:3}}>
                      <div style={{fontFamily:"'IBM Plex Sans',system-ui,sans-serif",fontSize:13,fontWeight:700,lineHeight:1.25,letterSpacing:-.1}}>{d.name}</div>
                      <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontSize:26,fontWeight:600,letterSpacing:-.4,marginTop:6,lineHeight:1}}>{d.pct}<span style={{fontSize:15,opacity:.7}}>%</span></div>
                      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,opacity:.85,marginTop:5}}>{d.earn} / {d.poss}</div>
                    </div>
                  ))}
                </div>
              </div>}
              {diagProfile.subs.length>0&&<div>
                <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontSize:14,fontStyle:"italic",color:"#2E3A57",marginBottom:12}}>By Subskill</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:6}}>
                  {diagProfile.subs.sort((a,b)=>(a.pct||0)-(b.pct||0)).map(s=>{
                    const c = heatColorPct(s.pct);
                    return(
                      <div key={s.domain+s.name} style={{background:"#fff",borderLeft:`3px solid ${c}`,padding:"10px 14px",borderRadius:2,boxShadow:"inset 0 0 0 1px rgba(15,26,46,.08)"}}>
                        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#66708A",fontWeight:500,letterSpacing:.7,textTransform:"uppercase"}}>{s.domain}</div>
                        <div style={{fontSize:13,fontWeight:600,color:"#0F1A2E",marginTop:3,letterSpacing:-.1}}>{s.name}</div>
                        <div style={{display:"flex",alignItems:"baseline",gap:8,marginTop:6}}>
                          <span style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 48',fontSize:19,fontWeight:600,color:c,letterSpacing:-.2,lineHeight:1}}>{s.pct}<span style={{fontSize:12}}>%</span></span>
                          <span style={{fontSize:11,color:"#66708A",fontFamily:"'IBM Plex Mono',monospace"}}>{s.earn}/{s.poss}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>}
            </div>}
          </>)}
        </div>
      )}

      {/* PRE-ASSIGN */}
      {ptab==="preassign"&&(
        <div>
          <div style={{background:"#F5ECDF",border:"1px solid rgba(154,91,31,.28)",borderRadius:4,padding:"14px 18px",marginBottom:16,fontSize:12,color:"#6E3F12",lineHeight:1.55}}>
            <span style={{fontFamily:"'Fraunces',Georgia,serif",fontWeight:600,fontSize:13}}>Pre-Assign Panel.</span> Mark worksheets already given before this student was added. Previously-assigned worksheets still show so you can assign them again.
          </div>
          <div style={{...CARD,marginBottom:16,padding:16,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <label style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",fontWeight:600,color:"#66708A",letterSpacing:1.2,textTransform:"uppercase"}}>Date
              <input type="date" value={paDate} onChange={e=>setPaDate(e.target.value)} style={{...INP,marginLeft:10,width:160,display:"inline-block"}}/>
            </label>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
            {["All","Reading & Writing","Math"].map(s=>(
              <button key={s} onClick={()=>setPaSubj(s)} style={{...mkBtn(paSubj===s?B2:"transparent",paSubj===s?"#FAF7F2":"#2E3A57"),border:"1px solid "+(paSubj===s?B2:"rgba(15,26,46,.18)"),padding:"5px 14px",fontSize:11}}>{s==="Reading & Writing"?"R&W":s}</button>
            ))}
            <input placeholder="Search…" value={paSrch} onChange={e=>setPaSrch(e.target.value)} style={{...INP,width:200,fontStyle:paSrch?"normal":"italic"}}/>
            <span style={{fontSize:10,color:"#66708A",marginLeft:"auto",fontFamily:"'IBM Plex Mono',monospace",letterSpacing:.4,textTransform:"uppercase"}}>{Object.values(paChk).filter(Boolean).length.toString().padStart(2,"0")} selected</span>
          </div>
          <div style={{...CARD,maxHeight:500,overflowY:"auto",padding:20}}>
            {paGrouped.map(g=>(
              <div key={`${g.subject}|${g.domain}|${g.subdomain}`} style={{marginBottom:18}}>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:DOMAIN_COLOR[g.domain]||B2,textTransform:"uppercase",letterSpacing:1,padding:"4px 0",marginBottom:8,borderBottom:"1px solid rgba(15,26,46,.08)"}}>
                  {g.subject} · {g.domain} · {g.subdomain}
                </div>
                {g.sheets.map(ws=>{
                  const alreadyAsg = (p.assignments||[]).find(a=>(a.worksheets||[]).some(w=>(w.id||w.title)===ws.id||w.title===ws.title));
                  const lastDate = alreadyAsg?.date;
                  const ck = !!paChk[ws.id];
                  return(
                    <div key={ws.id} onClick={()=>setPaChk(prev=>({...prev,[ws.id]:!prev[ws.id]}))} style={{display:"flex",alignItems:"center",padding:"8px 12px",cursor:"pointer",borderRadius:3,marginBottom:2,background:ck?"#E9F0F6":alreadyAsg?"#F5ECDF":"transparent",boxShadow:ck?"inset 0 0 0 1px "+B2:alreadyAsg?"inset 0 0 0 1px rgba(154,91,31,.3)":"none",transition:"background .15s"}}>
                      <input type="checkbox" checked={ck} onChange={()=>{}} onClick={e=>{e.stopPropagation();setPaChk(prev=>({...prev,[ws.id]:!prev[ws.id]}));}} style={{marginRight:11,cursor:"pointer",accentColor:B2}}/>
                      <span style={{fontSize:12,flex:1,color:"#0F1A2E",fontWeight:ck?600:400}}>
                        {ws.title}
                        {alreadyAsg&&<span style={{fontSize:8,marginLeft:10,color:"#FAF7F2",fontWeight:600,background:"#9A5B1F",padding:"2px 7px",borderRadius:2,fontFamily:"'IBM Plex Mono',monospace",letterSpacing:.5,textTransform:"uppercase"}}>Assigned {lastDate}</span>}
                      </span>
                      {ws.qs>0&&<span style={{...mkPill("transparent","#003258"),marginRight:6,border:"1px solid rgba(0,50,88,.22)"}}>{ws.qs}Q</span>}
                      <span style={{fontSize:9,color:DC[ws.difficulty],fontWeight:600,letterSpacing:.3,textTransform:"uppercase",fontFamily:"'IBM Plex Mono',monospace"}}>{ws.difficulty}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {/* WellEd Domain Pre-Assign */}
          <div style={{...CARD,marginTop:16,padding:18}}>
            <SH>WellEd Domain Assignments</SH>
            <div style={{maxHeight:220,overflowY:"auto",border:"1px solid rgba(154,91,31,.2)",borderRadius:3,padding:8,background:"rgba(245,236,223,.3)"}}>
              {WELLED_DOMAIN.map(e=>(
                <div key={e.subject+"|"+e.domain} style={{marginBottom:8}}>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:DOMAIN_COLOR[e.domain]||B2,marginBottom:4,letterSpacing:.8,textTransform:"uppercase"}}>{e.domain}</div>
                  {e.diffs.map(d=>{
                    const it = WE_DOMAIN_ITEMS.find(x=>x.subject===e.subject&&x.domain===e.domain&&x.difficulty===d);
                    const ck=!!paWeChk[it.id];
                    const alreadyAsg = (p.assignments||[]).some(a=>(a.welledDomain||[]).some(w=>w.subject===e.subject&&w.domain===e.domain&&w.difficulty===d));
                    return(
                      <label key={d} style={{display:"flex",alignItems:"center",gap:8,fontSize:11,padding:"4px 8px",cursor:"pointer",background:ck?"#F5ECDF":alreadyAsg?"rgba(154,91,31,.08)":"transparent",borderRadius:2,marginBottom:1,boxShadow:ck?"inset 0 0 0 1px #9A5B1F":"none"}}>
                        <input type="checkbox" checked={ck} onChange={()=>setPaWeChk(prev=>({...prev,[it.id]:!prev[it.id]}))} style={{accentColor:"#9A5B1F"}}/>
                        <span style={{color:"#0F1A2E",fontWeight:500}}>{d[0].toUpperCase()+d.slice(1)}</span>
                        {alreadyAsg&&<span style={{fontSize:8,fontWeight:600,color:"#FAF7F2",background:"#9A5B1F",padding:"2px 6px",borderRadius:2,fontFamily:"'IBM Plex Mono',monospace",letterSpacing:.5,textTransform:"uppercase"}}>Assigned</span>}
                        <span style={{color:"#66708A",marginLeft:"auto",fontFamily:"'IBM Plex Mono',monospace",fontSize:10}}>{e.qs}Qs</span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
            <div style={{fontSize:10,color:"#66708A",marginTop:8,fontFamily:"'IBM Plex Mono',monospace",letterSpacing:.4,textTransform:"uppercase"}}>{Object.values(paWeChk).filter(Boolean).length.toString().padStart(2,"0")} WellEd domains selected</div>
          </div>

          {/* Practice Exams Pre-Assign */}
          <div style={{...CARD,marginTop:16,padding:18}}>
            <SH>Practice Exams</SH>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div>
                <label style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:"#66708A",display:"block",marginBottom:5,letterSpacing:1.2,textTransform:"uppercase"}}>BlueBook Test Numbers</label>
                <input placeholder="e.g. 1, 2, 3" value={paBBNums} onChange={e=>setPaBBNums(e.target.value)} style={{...INP,fontSize:11}}/>
                <div style={{fontSize:9,color:"#66708A",marginTop:4,fontStyle:"italic"}}>Comma-separated numbers</div>
              </div>
              <div>
                <label style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:"#66708A",display:"block",marginBottom:5,letterSpacing:1.2,textTransform:"uppercase"}}>WellEd Test Numbers</label>
                <input placeholder="e.g. 1, 2, 3" value={paWENums} onChange={e=>setPaWENums(e.target.value)} style={{...INP,fontSize:11}}/>
                <div style={{fontSize:9,color:"#66708A",marginTop:4,fontStyle:"italic"}}>Comma-separated numbers</div>
              </div>
            </div>
          </div>

          <div style={{marginTop:16,display:"flex",gap:8}}>
            <button onClick={savePreAssign} style={{...mkBtn(B2,"#FAF7F2"),padding:"10px 22px",fontSize:12,fontWeight:600,letterSpacing:.3,textTransform:"uppercase",boxShadow:"0 4px 14px -4px rgba(0,50,88,.4)"}}>Save Pre-Assigned · {Object.values(paChk).filter(Boolean).length + Object.values(paWeChk).filter(Boolean).length + ((paBBNums||"").split(/[,\s]+/).filter(s=>s&&Number(s)>0).length) + ((paWENums||"").split(/[,\s]+/).filter(s=>s&&Number(s)>0).length)} items</button>
            <button onClick={()=>{setPaChk({});setPaWeChk({});setPaBBNums("");setPaWENums("");}} style={{...mkBtn("transparent","#66708A"),border:"1px solid rgba(15,26,46,.18)",padding:"10px 20px",fontSize:11}}>Clear</button>
          </div>
        </div>
      )}

      {/* SCORE HISTORY (aggregated from all sources) */}
      {ptab==="scores"&&(
        <ScoreHistoryPanel p={p} sfm={sfm} setSfm={setSfm} addScore={addScore} delScore={delScore} addWelledLog={addWelledLog} delWelledLog={delWelledLog}/>
      )}
    </div>
  );
}

/* ============ HEAT MAP HELPERS ============ */
// Count worksheet + WellEd Domain assignments per {domain, difficulty}
// Only worksheets and WellEd domain assignments count toward the heat map (not practice exams, not vocab).
function buildHeatCounts(student){
  const counts = {}; // key: domain|difficulty → count
  (student?.assignments||[]).forEach(a=>{
    (a.worksheets||[]).forEach(w=>{
      const k = `${w.domain}|${w.difficulty}`;
      counts[k] = (counts[k]||0)+1;
    });
    (a.welledDomain||[]).forEach(w=>{
      const k = `${w.domain}|${w.difficulty}`;
      counts[k] = (counts[k]||0)+1;
    });
  });
  return counts;
}
// Count practice exams — non-colored breakdown
function buildPracticeCounts(student){
  const out = {full:0, math:0, reading:0};
  (student?.assignments||[]).forEach(a=>{
    (a.practiceExams||[]).forEach(ex=>{
      if(ex.type==="full") out.full++;
      else if(ex.type==="math") out.math++;
      else if(ex.type==="reading"||ex.type==="rw") out.reading++;
      else out.full++;
    });
  });
  return out;
}
/* Editorial coverage heat ramp — paper → navy progression matching the ATS brand. */
const heatCellColor = (v)=>{
  if(!v) return "#F3EEE4";
  if(v>=10) return "#003258";
  if(v>=6)  return "#004A79";
  if(v>=3)  return "#2F6B9A";
  return "#C7D8E5";
};

/* Editorial threshold palette + inline progress bar — used across ScoreHistory, Scores, Heat Map. */
const pctColor = (v)=> v==null?"#66708A":v>=80?"#4C7A4C":v>=65?"#A9761B":"#8C2E2E";
const pctBg = (v)=> v==null?"#F3EEE4":v>=80?"rgba(76,122,76,.1)":v>=65?"rgba(169,118,27,.12)":"rgba(140,46,46,.1)";
function PctBar({value, width=72, inline=false}){
  if(value==null) return <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#66708A"}}>—</span>;
  const c = pctColor(value);
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:8,verticalAlign:"middle"}}>
      <span style={{display:"inline-block",width,height:5,background:"rgba(15,26,46,.08)",borderRadius:1,overflow:"hidden",position:"relative",flexShrink:0}}>
        <span style={{position:"absolute",left:0,top:0,bottom:0,width:clamped+"%",background:c,borderRadius:1}}/>
      </span>
      <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:inline?10:11,fontWeight:600,color:c,letterSpacing:.2,minWidth:inline?24:30,textAlign:"right"}}>{value}%</span>
    </span>
  );
}
const DOMAINS_RW = ["Information & Ideas","Craft & Structure","Expression of Ideas","Standard English Conventions"];
const DOMAINS_M  = ["Algebra","Advanced Math","Problem-Solving & Data Analysis","Geometry & Trigonometry"];
const ALL_DOMAINS = [...DOMAINS_RW, ...DOMAINS_M];
const DIFFS = ["easy","medium","hard","comprehensive"];

/* ============ HEAT MAP TAB ============ */
function HeatMapTab({students,openProfile}){
  const[selSt,setSelSt]=useState(students[0]?.id||"");
  const st = students.find(s=>s.id===selSt) || students[0];
  const counts = st ? buildHeatCounts(st) : {};
  const pract = st ? buildPracticeCounts(st) : {full:0,math:0,reading:0};

  const diffLabel = {easy:"Easy",medium:"Medium",hard:"Hard",comprehensive:"Comprehensive"};

  return(
    <div>
      <div style={{marginBottom:24,paddingBottom:16,borderBottom:"1px solid rgba(15,26,46,.1)"}}>
        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,fontWeight:600,letterSpacing:1.4,color:"#66708A",textTransform:"uppercase",marginBottom:6}}>Coverage</div>
        <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 144',fontSize:34,fontWeight:600,color:"#0F1A2E",letterSpacing:-.6,lineHeight:1}}>Assignment Heat Map</div>
        <div style={{fontSize:12,color:"#66708A",marginTop:8,fontStyle:"italic",fontFamily:"'Fraunces',Georgia,serif"}}>Worksheet and WellEd domain assignments, split by difficulty tier.</div>
      </div>

      {students.length===0 ? (
        <div style={{...CARD,padding:"72px 40px",textAlign:"center"}}>
          <div style={{fontFamily:"'Fraunces',Georgia,serif",fontStyle:"italic",fontSize:22,color:"#66708A",letterSpacing:-.2}}>No students enrolled yet.</div>
        </div>
      ) : (<>
        <div style={{...CARD,marginBottom:16,padding:16,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:"#66708A",letterSpacing:1.2,textTransform:"uppercase"}}>Student</div>
          <select value={selSt} onChange={e=>setSelSt(e.target.value)} style={{...INP,width:280,flexShrink:0}}>
            {students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {st && <button onClick={()=>openProfile(st)} style={{...mkBtn("transparent",B2),border:"1px solid rgba(0,74,121,.3)",padding:"7px 14px",fontSize:11}}>View Profile →</button>}
          <div style={{marginLeft:"auto",display:"flex",gap:10,alignItems:"center"}}>
            <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#66708A",letterSpacing:1,textTransform:"uppercase"}}>Low</span>
            <div style={{display:"flex",gap:2}}>{["#F3EEE4","#C7D8E5","#2F6B9A","#004A79","#003258"].map((c,i)=><div key={i} style={{width:18,height:18,background:c,border:"1px solid rgba(15,26,46,.08)"}}/>)}</div>
            <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#66708A",letterSpacing:1,textTransform:"uppercase"}}>High</span>
          </div>
        </div>

        {/* Practice Exam counts */}
        <div style={{...CARD,marginBottom:16,padding:20}}>
          <SH>Practice Exams Assigned</SH>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:0,borderTop:"1px solid rgba(15,26,46,.08)"}}>
            {[["Full",pract.full],["Math Only",pract.math],["Reading Only",pract.reading]].map(([l,v],i,arr)=>(
              <div key={l} style={{padding:"18px 22px",borderRight:i===arr.length-1?"none":"1px solid rgba(15,26,46,.08)",borderBottom:"1px solid rgba(15,26,46,.08)"}}>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#66708A",fontWeight:600,letterSpacing:1.2,textTransform:"uppercase"}}>{l}</div>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:26,fontWeight:600,color:"#0F1A2E",marginTop:8,letterSpacing:.2,lineHeight:1}}>{v.toString().padStart(2,"0")}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 4 heat maps by difficulty */}
        {DIFFS.map(d=>{
          const total = ALL_DOMAINS.reduce((n,dom)=>n+(counts[`${dom}|${d}`]||0),0);
          return(
            <div key={d} style={{...CARD,marginBottom:14,padding:20}}>
              <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:16,paddingBottom:10,borderBottom:"1px solid rgba(15,26,46,.08)"}}>
                <div style={{width:3,height:18,background:DC[d]}}/>
                <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontSize:18,fontWeight:600,color:"#0F1A2E",letterSpacing:-.25,flex:1}}>{diffLabel[d]}</div>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#66708A",letterSpacing:.8,textTransform:"uppercase",fontWeight:500}}>{total.toString().padStart(2,"0")} Assigned</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(8, 1fr)",gap:4}}>
                {ALL_DOMAINS.map(dom=>{
                  const v = counts[`${dom}|${d}`]||0;
                  const hot = v>=3;
                  return(
                    <div key={dom} style={{background:heatCellColor(v),padding:"12px 8px",textAlign:"center",minHeight:80,display:"flex",flexDirection:"column",justifyContent:"space-between",borderRadius:2,border:v===0?"1px solid rgba(15,26,46,.08)":"none"}}>
                      <div style={{fontFamily:"'IBM Plex Sans',system-ui,sans-serif",fontSize:10,fontWeight:600,color:hot?"#FAF7F2":"#2E3A57",lineHeight:1.2,letterSpacing:-.05}}>{dom}</div>
                      <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontSize:22,fontWeight:600,color:hot?"#FAF7F2":v>0?"#0F1A2E":"rgba(15,26,46,.25)",letterSpacing:-.3,marginTop:8,lineHeight:1}}>{v||"·"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </>)}
    </div>
  );
}

/* ============ EDITORIAL SVG LINE CHART ============ */
function LineChart({points, color="#004A79", max, height=80, width=260}){
  // points: [{x:number, y:number, label?:string}]  x = 0..N-1 typically
  if(!points || points.length===0) return <div style={{fontSize:10,color:"#66708A",fontFamily:"'Fraunces',Georgia,serif",fontStyle:"italic"}}>No data</div>;
  const pad = 10;
  const w = width - pad*2, h = height - pad*2;
  const maxY = max!=null ? max : Math.max(...points.map(p=>p.y));
  const minY = 0;
  const range = maxY-minY || 1;
  const stepX = points.length>1 ? w/(points.length-1) : 0;
  const coords = points.map((p,i)=>({
    cx: pad + (points.length>1?i*stepX:w/2),
    cy: pad + h - ((p.y-minY)/range)*h,
    raw: p
  }));
  const path = coords.map((c,i)=>`${i===0?"M":"L"}${c.cx.toFixed(1)},${c.cy.toFixed(1)}`).join(" ");
  const area = `${path} L${coords[coords.length-1].cx.toFixed(1)},${(pad+h).toFixed(1)} L${coords[0].cx.toFixed(1)},${(pad+h).toFixed(1)} Z`;
  return (
    <svg width={width} height={height} style={{display:"block"}}>
      <rect x={0} y={0} width={width} height={height} fill="#FDFBF6" stroke="rgba(15,26,46,.08)"/>
      {[0.25,0.5,0.75].map(f=>(
        <line key={f} x1={pad} y1={pad+h*f} x2={pad+w} y2={pad+h*f} stroke="rgba(15,26,46,.08)" strokeWidth={1} strokeDasharray="2,4"/>
      ))}
      <path d={area} fill={color} fillOpacity={0.08}/>
      <path d={path} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"/>
      {coords.map((c,i)=>(
        <circle key={i} cx={c.cx} cy={c.cy} r={2.5} fill="#FAF7F2" stroke={color} strokeWidth={1.5}>
          <title>{c.raw.label||""}: {c.raw.y}{max?`/${max}`:""}</title>
        </circle>
      ))}
    </svg>
  );
}

/* ============ SCORE HISTORY PANEL (inside StudentProfile) ============ */
function ScoreHistoryPanel({p, sfm, setSfm, addScore, delScore, addWelledLog, delWelledLog}){
  const pts = allScoreDataPoints(p);
  const [expanded,setExpanded] = useState({}); // {domainKey: true}
  const [diffFilter,setDiffFilter] = useState("all"); // all|easy|medium|hard|comprehensive
  const [wlog,setWlog] = useState({date:todayStr(),subject:"Reading & Writing",domain:"Information & Ideas",difficulty:"medium",score:"",notes:""});

  // Split points into (A) full practice, (B) domain-level, (C) subskill-level, (D) other
  const { fullPts, domainPts, subPts, otherPts } = useMemo(()=>{
    const full=[], dom=[], sub=[], oth=[];
    pts.forEach(pt=>{
      const catStr = pt.category||"";
      const isFull = /Total SAT|R&W Section|Math Section|Full —|Section —|Practice|Official SAT|Full Practice|BlueBook|WellEd Full/i.test(catStr);
      if(isFull && pt.level!=="domain" && pt.level!=="sub") full.push(pt);
      else if(pt.level==="sub") sub.push(pt);
      else if(pt.level==="domain") dom.push(pt);
      else oth.push(pt);
    });
    return {fullPts:full,domainPts:dom,subPts:sub,otherPts:oth};
  },[pts]);

  // Group full practice by subcategory
  const fullGroups = useMemo(()=>{
    const g={};
    fullPts.forEach(pt=>{
      const key = pt.subcategory||pt.category;
      if(!g[key]) g[key]={key,pts:[]};
      g[key].pts.push(pt);
    });
    Object.values(g).forEach(grp=>grp.pts.sort((a,b)=>(a.date||"").localeCompare(b.date||"")));
    return Object.values(g);
  },[fullPts]);

  // Build domain structure: {subject|domain: {subject, domain, pts, byDiff:{easy:[],...}, subskills:{name:[pts]}}}
  const domainCards = useMemo(()=>{
    const m = {};
    const addDomain = (subject,domain)=>{
      const k = `${subject}|${domain}`;
      if(!m[k]) m[k]={subject,domain,key:k,pts:[],byDiff:{easy:[],medium:[],hard:[],comprehensive:[]},subskills:{}};
      return m[k];
    };
    domainPts.forEach(pt=>{
      const subj = pt.subject || (pt.category||"").split(" — ")[0] || "Unknown";
      const dom = pt.domain || pt.subcategory;
      const d = addDomain(subj,dom);
      d.pts.push(pt);
      const diff = (pt.difficulty||"").toLowerCase();
      if(d.byDiff[diff]) d.byDiff[diff].push(pt);
    });
    subPts.forEach(pt=>{
      const subj = pt.subject || "Unknown";
      const dom = pt.domain || "Unknown";
      const name = pt.subskill || pt.subcategory;
      const d = addDomain(subj,dom);
      if(!d.subskills[name]) d.subskills[name]=[];
      d.subskills[name].push(pt);
    });
    // Sort pts in each
    Object.values(m).forEach(d=>{
      d.pts.sort((a,b)=>(a.date||"").localeCompare(b.date||""));
      Object.values(d.byDiff).forEach(arr=>arr.sort((a,b)=>(a.date||"").localeCompare(b.date||"")));
      Object.values(d.subskills).forEach(arr=>arr.sort((a,b)=>(a.date||"").localeCompare(b.date||"")));
    });
    // Order: R&W first, then Math, then alpha by domain within
    return Object.values(m).sort((a,b)=>{
      if(a.subject!==b.subject) return a.subject==="Reading & Writing"?-1:1;
      return a.domain.localeCompare(b.domain);
    });
  },[domainPts,subPts]);

  // Filtered by difficulty
  const filterPts = (arr)=>{
    if(diffFilter==="all") return arr;
    return arr.filter(pt=>(pt.difficulty||"").toLowerCase()===diffFilter);
  };

  const pctOf = (pt)=> pt.max?Math.round((pt.score/pt.max)*100):(pt.pct??null);
  const avgPct = (arr)=>{
    const vals = arr.map(pctOf).filter(v=>v!=null);
    if(!vals.length) return null;
    return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
  };
  // pctColor / pctBg / PctBar are defined at module scope above.
  // Small sparkline card (used for full practice & subskills)
  const miniCard = (key,title,ptsArr,accent)=>{
    if(!ptsArr.length) return null;
    const last = ptsArr[ptsArr.length-1], first=ptsArr[0];
    const lastPct = pctOf(last), firstPct = pctOf(first);
    const delta = lastPct!=null&&firstPct!=null?lastPct-firstPct:null;
    const chartPoints = ptsArr.map((pt,i)=>({x:i,y:pctOf(pt)??0,label:`${pt.date}${pt.source==="diagnostic"?" (Diagnostic)":""}`}));
    const hasDiag = ptsArr.some(p=>p.source==="diagnostic");
    const srcLabels = [...new Set(ptsArr.map(p=>({diagnostic:"Diagnostic",manual:"Manual",history_exam:"Practice",history_welled:"WellEd Asg",welled_log:"WellEd Log"}[p.source]||p.source)))];
    return(
      <div key={key} style={{background:"#fff",borderRadius:3,padding:14,boxShadow:"0 0 0 1px rgba(15,26,46,.08)",borderLeft:`3px solid ${accent}`}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
          <div style={{fontFamily:"'IBM Plex Sans',system-ui,sans-serif",fontSize:12,fontWeight:600,color:"#0F1A2E",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,letterSpacing:-.1}} title={title}>{title}</div>
          {hasDiag&&<span style={{...mkPill("transparent","#6E3F12"),border:"1px solid rgba(154,91,31,.35)",fontSize:8}}>Diag</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <div style={{display:"flex",alignItems:"baseline",gap:4}}>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:20,fontWeight:600,color:accent,letterSpacing:.2,lineHeight:1}}>{last.score}</div>
            {last.max && <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:"#66708A",fontWeight:500}}>/ {last.max}</div>}
          </div>
          {delta!=null&&ptsArr.length>1&&<div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:delta>0?"#4C7A4C":delta<0?"#8C2E2E":"#66708A",fontWeight:600,marginLeft:"auto",letterSpacing:.2}}>{delta>0?"+":delta<0?"−":"·"}{Math.abs(delta)}%</div>}
        </div>
        {lastPct!=null && <div style={{marginBottom:8}}><PctBar value={lastPct} width={150}/></div>}
        <LineChart points={chartPoints} color={accent} max={100} height={60} width={230}/>
        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#66708A",marginTop:6,letterSpacing:.2}}>{ptsArr.length} pt{ptsArr.length!==1?"s":""} · {last.date} · {srcLabels.join(", ")}</div>
      </div>
    );
  };

  // Big domain card — editorial treatment
  const renderDomainCard = (d)=>{
    const color = DOMAIN_COLOR[d.domain]||B2;
    const filtered = filterPts(d.pts);
    if(filtered.length===0 && diffFilter!=="all") return null;
    const avg = avgPct(filtered);
    const last = filtered[filtered.length-1];
    const first = filtered[0];
    const delta = last && first && filtered.length>1 ? pctOf(last)-pctOf(first) : null;
    const chartPoints = filtered.map((pt,i)=>({x:i,y:pctOf(pt)??0,label:`${pt.date} (${pt.difficulty||"—"})`}));
    const isOpen = expanded[d.key];
    const subskillNames = Object.keys(d.subskills);

    return(
      <div key={d.key} style={{background:"#fff",borderRadius:4,boxShadow:"0 0 0 1px rgba(15,26,46,.1)",borderLeft:`3px solid ${color}`,overflow:"hidden"}}>
        {/* Header bar — editorial hairline row */}
        <div style={{padding:"16px 20px",borderBottom:"1px solid rgba(15,26,46,.08)",display:"flex",alignItems:"center",gap:14}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:"#66708A",textTransform:"uppercase",letterSpacing:1.2}}>{d.subject}</div>
            <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontSize:19,fontWeight:600,color:"#0F1A2E",letterSpacing:-.25,marginTop:3}}>{d.domain}</div>
          </div>
          {avg!=null && <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5}}>
            <PctBar value={avg} width={140}/>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#66708A",fontWeight:500,letterSpacing:.4,textTransform:"uppercase"}}>Avg · {filtered.length} pt{filtered.length!==1?"s":""}</div>
          </div>}
          {delta!=null && <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:delta>0?"#4C7A4C":delta<0?"#8C2E2E":"#66708A",fontWeight:600,padding:"5px 10px",border:"1px solid "+(delta>0?"rgba(76,122,76,.35)":delta<0?"rgba(140,46,46,.35)":"rgba(15,26,46,.18)"),borderRadius:2,letterSpacing:.3}}>{delta>0?"+":delta<0?"−":"·"}{Math.abs(delta)}%</div>}
        </div>

        {/* Body: chart + difficulty breakdown */}
        <div style={{padding:20}}>
          {filtered.length>0 ? (
            <div style={{display:"grid",gridTemplateColumns:"1fr 200px",gap:20,alignItems:"center"}}>
              <LineChart points={chartPoints} color={color} max={100} height={110} width={400}/>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={{fontFamily:"'Fraunces',Georgia,serif",fontSize:11,fontStyle:"italic",color:"#66708A",marginBottom:2}}>By Difficulty</div>
                {DIFF_ORDER.map(diff=>{
                  const diffPts = d.byDiff[diff]||[];
                  if(diffPts.length===0) return null;
                  const a = avgPct(diffPts);
                  const lastD = diffPts[diffPts.length-1];
                  return(
                    <div key={diff} style={{display:"flex",flexDirection:"column",gap:3,fontSize:11}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:8,height:8,background:DC[diff],flexShrink:0}}/>
                        <div style={{flex:1,color:"#2E3A57",fontWeight:500,textTransform:"capitalize"}}>{diff}</div>
                        <div style={{fontSize:10,color:"#66708A",fontFamily:"'IBM Plex Mono',monospace"}}>{lastD.score}/{lastD.max}</div>
                      </div>
                      <div style={{paddingLeft:16}}><PctBar value={a} width={130}/></div>
                    </div>
                  );
                })}
                {DIFF_ORDER.every(diff=>(d.byDiff[diff]||[]).length===0) && <div style={{fontSize:10,color:"#66708A",fontStyle:"italic"}}>No difficulty breakdown (diagnostic only)</div>}
              </div>
            </div>
          ) : <div style={{fontSize:11,color:"#66708A",fontStyle:"italic",textAlign:"center",padding:16,fontFamily:"'Fraunces',Georgia,serif"}}>No data at this difficulty filter</div>}

          {/* Expand subskills toggle */}
          {subskillNames.length>0 && <button onClick={()=>setExpanded(prev=>({...prev,[d.key]:!prev[d.key]}))} style={{...mkBtn("transparent",color),border:"1px solid "+color+"55",marginTop:16,width:"100%",padding:"8px 14px",fontSize:11,letterSpacing:.3,textTransform:"uppercase",fontWeight:600}}>
            {isOpen?"Hide":"Show"} · {subskillNames.length} Subskill{subskillNames.length!==1?"s":""}
          </button>}

          {isOpen && subskillNames.length>0 && <div style={{marginTop:14,padding:16,background:"rgba(15,26,46,.02)",borderRadius:3,border:"1px solid rgba(15,26,46,.08)"}}>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:"#66708A",textTransform:"uppercase",letterSpacing:1.2,marginBottom:10}}>Subskill Performance Over Time</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10}}>
              {subskillNames.map(name=>miniCard(`${d.key}|${name}`,name,d.subskills[name],color))}
            </div>
          </div>}
        </div>
      </div>
    );
  };

  // WellEd log form helpers
  const wlogDomainOptions = WELLED_DOMAIN.filter(e=>e.subject===wlog.subject);
  const wlogCurrentEntry = WELLED_DOMAIN.find(e=>e.subject===wlog.subject && e.domain===wlog.domain);
  const wlogMax = wlog.subject==="Math"?22:27;
  const wlogSubmit = ()=>{
    if(!wlog.score || !wlog.domain){return;}
    addWelledLog({date:wlog.date,subject:wlog.subject,domain:wlog.domain,difficulty:wlog.difficulty,score:Number(wlog.score),max:wlogMax,notes:wlog.notes});
    setWlog({...wlog,score:"",notes:""});
  };

  const fieldLabel = {fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#66708A",marginBottom:4,fontWeight:600,letterSpacing:1.2,textTransform:"uppercase"};

  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"340px 1fr",gap:20}}>
        {/* ========== LEFT: Quick Add ========== */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* WellEd domain logger */}
          <div style={{...CARD,padding:20,borderLeft:`3px solid ${B2}`}}>
            <SH>Log WellEd Domain Score</SH>
            <div style={{display:"flex",flexDirection:"column",gap:11}}>
              <div><div style={fieldLabel}>Date</div><input type="date" value={wlog.date} onChange={e=>setWlog({...wlog,date:e.target.value})} style={INP}/></div>
              <div><div style={fieldLabel}>Subject</div>
                <select value={wlog.subject} onChange={e=>{
                  const subj = e.target.value;
                  const firstDom = WELLED_DOMAIN.find(x=>x.subject===subj);
                  setWlog({...wlog,subject:subj,domain:firstDom?.domain||"",difficulty:firstDom?.diffs[0]||"easy"});
                }} style={INP}>
                  <option>Reading & Writing</option>
                  <option>Math</option>
                </select>
              </div>
              <div><div style={fieldLabel}>Domain</div>
                <select value={wlog.domain} onChange={e=>{
                  const entry = WELLED_DOMAIN.find(x=>x.subject===wlog.subject && x.domain===e.target.value);
                  setWlog({...wlog,domain:e.target.value,difficulty:entry?.diffs.includes(wlog.difficulty)?wlog.difficulty:entry?.diffs[0]||"easy"});
                }} style={INP}>
                  {wlogDomainOptions.map(e=><option key={e.domain}>{e.domain}</option>)}
                </select>
              </div>
              <div><div style={fieldLabel}>Difficulty</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:5}}>
                  {(wlogCurrentEntry?.diffs||["easy","medium","hard","comprehensive"]).concat(["comprehensive"]).filter((v,i,a)=>a.indexOf(v)===i).map(diff=>{
                    const active = wlog.difficulty===diff;
                    return <button key={diff} onClick={()=>setWlog({...wlog,difficulty:diff})} style={{...mkBtn(active?DC[diff]:"transparent",active?"#FAF7F2":"#2E3A57"),border:"1px solid "+(active?DC[diff]:"rgba(15,26,46,.15)"),padding:"6px 10px",fontSize:10,textTransform:"capitalize"}}>{diff}</button>;
                  })}
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8,alignItems:"end"}}>
                <div><div style={fieldLabel}>Score</div><input type="number" value={wlog.score} onChange={e=>setWlog({...wlog,score:e.target.value})} placeholder={`0-${wlogMax}`} max={wlogMax} min={0} style={INP}/></div>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:12,color:"#66708A",fontWeight:500,paddingBottom:10}}>/ {wlogMax}</div>
              </div>
              <div><div style={fieldLabel}>Notes</div><input value={wlog.notes} onChange={e=>setWlog({...wlog,notes:e.target.value})} placeholder="Optional…" style={{...INP,fontStyle:wlog.notes?"normal":"italic"}}/></div>
              <button onClick={wlogSubmit} disabled={!wlog.score} style={{...mkBtn(wlog.score?B2:"rgba(15,26,46,.12)",wlog.score?"#FAF7F2":"#66708A"),padding:"10px 16px",fontSize:11,fontWeight:600,letterSpacing:.3,textTransform:"uppercase",cursor:wlog.score?"pointer":"not-allowed"}}>+ Log Score</button>
            </div>
          </div>

          {/* Manual full-test score */}
          <div style={{...CARD,padding:20,borderLeft:"3px solid #5B4B8A"}}>
            <SH>Log Full Test Score</SH>
            <div style={{display:"flex",flexDirection:"column",gap:11}}>
              <div><div style={fieldLabel}>Date</div><input type="date" value={sfm.date} onChange={e=>setSfm(prev=>({...prev,date:e.target.value}))} style={INP}/></div>
              <div>
                <div style={fieldLabel}>Test / Section</div>
                <select value={sfm.testType} onChange={e=>setSfm(prev=>({...prev,testType:e.target.value}))} style={INP}>
                  <option value="">Select…</option>
                  <optgroup label="Full Practice Tests">
                    <option>WellEd Full Practice Test</option>
                    <option>BlueBook Full Practice Test</option>
                    <option>Official SAT / PSAT</option>
                  </optgroup>
                  <optgroup label="Sections">
                    <option>R&amp;W Section</option>
                    <option>Math Section</option>
                  </optgroup>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div><div style={fieldLabel}>Score</div><input type="number" value={sfm.score} onChange={e=>setSfm(prev=>({...prev,score:e.target.value}))} placeholder="1250" style={INP}/></div>
                <div><div style={fieldLabel}>Max</div><input type="number" value={sfm.maxScore} onChange={e=>setSfm(prev=>({...prev,maxScore:e.target.value}))} placeholder="1600" style={INP}/></div>
              </div>
              <div><div style={fieldLabel}>Notes</div><input value={sfm.notes} onChange={e=>setSfm(prev=>({...prev,notes:e.target.value}))} placeholder="Optional…" style={{...INP,fontStyle:sfm.notes?"normal":"italic"}}/></div>
              <button onClick={addScore} style={{...mkBtn("#5B4B8A","#FAF7F2"),padding:"10px 16px",fontSize:11,fontWeight:600,letterSpacing:.3,textTransform:"uppercase"}}>+ Add Score</button>
            </div>
          </div>

          <div style={{fontSize:11,color:"#66708A",lineHeight:1.55,padding:14,background:"#F3EEE4",borderRadius:3,border:"1px solid rgba(15,26,46,.06)",fontStyle:"italic",fontFamily:"'Fraunces',Georgia,serif"}}>Scores from Assignment History and diagnostic PDFs are automatically aggregated here. WellEd logs and manual scores persist independently.</div>
        </div>

        {/* ========== RIGHT: Aggregated view ========== */}
        <div style={{display:"flex",flexDirection:"column",gap:20}}>
          {pts.length===0 && <div style={{...CARD,padding:"72px 40px",textAlign:"center"}}>
            <div style={{fontFamily:"'Fraunces',Georgia,serif",fontStyle:"italic",fontSize:22,color:"#66708A",letterSpacing:-.2,marginBottom:8}}>No scores recorded yet.</div>
            <div style={{fontSize:11,color:"#66708A"}}>Upload a diagnostic PDF, log a WellEd score, or enter scores in Assignment History.</div>
          </div>}

          {/* SECTION 1: Full practice tests */}
          {fullGroups.length>0 && <div style={{...CARD,padding:20}}>
            <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:14,paddingBottom:10,borderBottom:"1px solid rgba(15,26,46,.08)"}}>
              <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontSize:19,fontWeight:600,color:"#0F1A2E",letterSpacing:-.25}}>Full Practice Tests &amp; Section Scores</div>
              <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#66708A",fontWeight:500,letterSpacing:1,textTransform:"uppercase"}}>{fullGroups.length} track{fullGroups.length!==1?"s":""}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
              {fullGroups.map(g=>miniCard(g.key,g.key,g.pts,"#5B4B8A"))}
            </div>
          </div>}

          {/* SECTION 2: Domain Performance */}
          {domainCards.length>0 && <div style={{...CARD,padding:20}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap",paddingBottom:12,borderBottom:"1px solid rgba(15,26,46,.08)"}}>
              <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 96',fontSize:19,fontWeight:600,color:"#0F1A2E",letterSpacing:-.25,flex:1}}>Domain Performance</div>
              <div style={{display:"flex",gap:5,alignItems:"center"}}>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#66708A",fontWeight:500,textTransform:"uppercase",letterSpacing:1,marginRight:4}}>Filter</div>
                {["all","easy","medium","hard","comprehensive"].map(d=>{
                  const active = diffFilter===d;
                  const c = d==="all"?B2:DC[d];
                  return <button key={d} onClick={()=>setDiffFilter(d)} style={{...mkBtn(active?c:"transparent",active?"#FAF7F2":"#2E3A57"),border:"1px solid "+(active?c:"rgba(15,26,46,.15)"),padding:"4px 10px",fontSize:10,textTransform:"capitalize"}}>{d==="all"?"All":d}</button>;
                })}
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {domainCards.map(renderDomainCard)}
            </div>
          </div>}

          {/* SECTION 3: Orphan subskills (no parent domain data) */}
          {domainCards.length===0 && subPts.length>0 && <div style={{...CARD,padding:20}}>
            <SH>Subskill Data</SH>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
              {(()=>{
                const sg={};
                subPts.forEach(pt=>{const k=pt.subskill||pt.subcategory; if(!sg[k])sg[k]=[]; sg[k].push(pt);});
                return Object.entries(sg).map(([k,arr])=>miniCard(k,k,arr.sort((a,b)=>(a.date||"").localeCompare(b.date||"")),B2));
              })()}
            </div>
          </div>}

          {/* SECTION 4: Manual entries table */}
          {(p.scores||[]).length>0 && <div style={{...CARD,padding:20}}>
            <SH>Manual Entry Log</SH>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr>{["Date","Test","Score","Max","%","Notes",""].map(h=><th key={h} style={{padding:"10px 12px",textAlign:"left",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#66708A",fontWeight:600,letterSpacing:1.2,textTransform:"uppercase",borderBottom:"1px solid rgba(15,26,46,.15)"}}>{h}</th>)}</tr></thead>
                <tbody>
                  {[...p.scores].sort((a,b)=>b.date.localeCompare(a.date)).map((sc,i,arr)=>{
                    const pct=sc.maxScore?Math.round((Number(sc.score)/Number(sc.maxScore))*100):null;
                    return(
                      <tr key={sc.id} style={{borderBottom:i===arr.length-1?"none":"1px solid rgba(15,26,46,.06)"}}>
                        <td style={{padding:"10px 12px",color:"#2E3A57",fontFamily:"'IBM Plex Mono',monospace",fontSize:11}}>{sc.date}</td>
                        <td style={{padding:"10px 12px",fontWeight:500,color:"#0F1A2E",fontFamily:"'Fraunces',Georgia,serif",fontSize:13}}>{sc.testType}</td>
                        <td style={{padding:"10px 12px",fontWeight:600,color:"#0F1A2E",fontFamily:"'IBM Plex Mono',monospace",fontSize:12}}>{sc.score}</td>
                        <td style={{padding:"10px 12px",color:"#66708A",fontFamily:"'IBM Plex Mono',monospace"}}>{sc.maxScore||<span style={{color:"rgba(15,26,46,.25)"}}>—</span>}</td>
                        <td style={{padding:"10px 12px"}}>{pct!==null?<PctBar value={pct} width={80}/>:<span style={{color:"rgba(15,26,46,.25)"}}>—</span>}</td>
                        <td style={{padding:"10px 12px",color:"#66708A",fontStyle:"italic"}}>{sc.notes||<span style={{color:"rgba(15,26,46,.25)",fontStyle:"normal"}}>—</span>}</td>
                        <td style={{padding:"10px 12px",textAlign:"right"}}><button onClick={()=>delScore(sc.id)} style={{...mkBtn("transparent","#8C2E2E"),border:"1px solid rgba(140,46,46,.3)",padding:"3px 10px",fontSize:10}}>✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>}

          {/* SECTION 5: WellEd log table */}
          {(p.welledLogs||[]).length>0 && <div style={{...CARD,padding:20}}>
            <SH>WellEd Domain Log</SH>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr>{["Date","Subject","Domain","Difficulty","Score","%","Notes",""].map(h=><th key={h} style={{padding:"10px 12px",textAlign:"left",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#66708A",fontWeight:600,letterSpacing:1.2,textTransform:"uppercase",borderBottom:"1px solid rgba(15,26,46,.15)"}}>{h}</th>)}</tr></thead>
                <tbody>
                  {[...(p.welledLogs||[])].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map((lg,i,arr)=>{
                    const mx = lg.max||(lg.subject==="Math"?22:27);
                    const pct = Math.round((Number(lg.score)/mx)*100);
                    const dc = DOMAIN_COLOR[lg.domain]||B2;
                    return(
                      <tr key={lg.id} style={{borderBottom:i===arr.length-1?"none":"1px solid rgba(15,26,46,.06)"}}>
                        <td style={{padding:"10px 12px",color:"#2E3A57",fontFamily:"'IBM Plex Mono',monospace",fontSize:11}}>{lg.date}</td>
                        <td style={{padding:"10px 12px",color:"#2E3A57"}}>{lg.subject}</td>
                        <td style={{padding:"10px 12px",fontWeight:500,color:dc,fontFamily:"'Fraunces',Georgia,serif",fontSize:13}}>{lg.domain}</td>
                        <td style={{padding:"10px 12px"}}><span style={{...mkPill("transparent",DC[lg.difficulty]||"#66708A"),border:"1px solid "+(DC[lg.difficulty]||"#66708A")+"55"}}>{lg.difficulty}</span></td>
                        <td style={{padding:"10px 12px",fontWeight:600,color:"#0F1A2E",fontFamily:"'IBM Plex Mono',monospace"}}>{lg.score}/{mx}</td>
                        <td style={{padding:"10px 12px"}}><PctBar value={pct} width={80}/></td>
                        <td style={{padding:"10px 12px",color:"#66708A",fontStyle:"italic"}}>{lg.notes||<span style={{color:"rgba(15,26,46,.25)",fontStyle:"normal"}}>—</span>}</td>
                        <td style={{padding:"10px 12px",textAlign:"right"}}><button onClick={()=>delWelledLog(lg.id)} style={{...mkBtn("transparent","#8C2E2E"),border:"1px solid rgba(140,46,46,.3)",padding:"3px 10px",fontSize:10}}>✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>}
        </div>
      </div>
    </div>
  );
}

/* ============ SCORE DATA AGGREGATOR ============ */
// Merges all score sources for a student into one flat list:
//   1. Diagnostic section scores + total (first, at parsedAt date)
//   2. Manual scores from student.scores
//   3. Practice exam scores from assignment history
//   4. WellEd Domain scores from assignment history (split by E/M/H)
// Each point: {date, category, subcategory, score, max, source, note, difficulty?}
function allScoreDataPoints(student){
  const pts = [];
  // 1. Diagnostic → section + total scores
  if(student.diagnostics?.length){
    const diag = buildDiagnosticProfile(student.diagnostics);
    const dd = student.diagnostics[0]?.parsedAt || todayStr();
    if(diag.rwScore)   pts.push({date:dd,category:"R&W Section",subcategory:"R&W Section",score:Math.round((diag.rwScore.lower+diag.rwScore.upper)/2),max:800,source:"diagnostic",note:`Range: ${diag.rwScore.lower}–${diag.rwScore.upper}`});
    if(diag.mathScore) pts.push({date:dd,category:"Math Section",subcategory:"Math Section",score:Math.round((diag.mathScore.lower+diag.mathScore.upper)/2),max:800,source:"diagnostic",note:`Range: ${diag.mathScore.lower}–${diag.mathScore.upper}`});
    if(diag.totalLower!=null) pts.push({date:dd,category:"Total SAT",subcategory:"Total SAT",score:Math.round((diag.totalLower+diag.totalUpper)/2),max:1600,source:"diagnostic",note:`Range: ${diag.totalLower}–${diag.totalUpper}`});
    // Domain-level diagnostic %s
    (diag.domains||[]).forEach(d=>{
      pts.push({date:dd,category:`${d.subject} — ${d.name}`,subcategory:d.name,subject:d.subject,domain:d.name,score:d.earn,max:d.poss,source:"diagnostic",pct:d.pct,level:"domain"});
    });
    // Subdomain-level diagnostic %s
    (diag.subs||[]).forEach(s=>{
      pts.push({date:dd,category:`${s.subject} — ${s.domain} — ${s.name}`,subcategory:s.name,subject:s.subject,domain:s.domain,subskill:s.name,score:s.earn,max:s.poss,source:"diagnostic",pct:s.pct,level:"sub"});
    });
  }
  // 2. Manual scores
  (student.scores||[]).forEach(sc=>{
    pts.push({date:sc.date,category:sc.testType,subcategory:sc.testType,score:Number(sc.score)||0,max:Number(sc.maxScore)||null,source:"manual",note:sc.notes||"",_id:sc.id});
  });
  // 3 & 4. Assignment history — practice exam scores + WellEd domain scores
  (student.assignments||[]).forEach(a=>{
    (a.practiceExams||[]).forEach(ex=>{
      const isFull = ex.type!=="section";
      if(isFull){
        const rw = Number(ex.rwScore)||0, math = Number(ex.mathScore)||0;
        if(ex.rwScore || ex.mathScore){
          if(ex.rwScore)   pts.push({date:a.date,category:`${ex.platform} Practice #${ex.number||"?"} — R&W`,subcategory:`${ex.platform} Full — R&W`,score:rw,max:800,source:"history_exam"});
          if(ex.mathScore) pts.push({date:a.date,category:`${ex.platform} Practice #${ex.number||"?"} — Math`,subcategory:`${ex.platform} Full — Math`,score:math,max:800,source:"history_exam"});
          if(ex.rwScore && ex.mathScore) pts.push({date:a.date,category:`${ex.platform} Practice #${ex.number||"?"} — Total`,subcategory:`${ex.platform} Full — Total`,score:rw+math,max:1600,source:"history_exam"});
        } else if(ex.score){
          pts.push({date:a.date,category:`${ex.platform} Practice #${ex.number||"?"}`,subcategory:`${ex.platform} Full — Total`,score:Number(ex.score)||0,max:1600,source:"history_exam"});
        }
      } else if(ex.score && ex.score!==""){
        const subj = ex.sectionSubject ? ` — ${ex.sectionSubject}` : "";
        pts.push({date:a.date,category:`${ex.platform} Practice #${ex.number||"?"} Section${subj}`,subcategory:`${ex.platform} Section${subj}`,score:Number(ex.score)||0,max:800,source:"history_exam"});
      }
    });
    (a.welledDomain||[]).forEach(w=>{
      if(w.score && w.score!==""){
        const cat = `${w.subject} — ${w.domain}`;
        pts.push({date:a.date,category:cat,subcategory:w.domain,subject:w.subject,domain:w.domain,score:Number(w.score)||0,max:w.qs||(w.subject==="Math"?22:27),source:"history_welled",difficulty:w.difficulty,level:"domain"});
      }
    });
  });
  // 5. Standalone WellEd domain logs (continuous tracking, not tied to an assignment)
  (student.welledLogs||[]).forEach(log=>{
    pts.push({
      date:log.date,
      category:`${log.subject} — ${log.domain}`,
      subcategory:log.domain,
      subject:log.subject,
      domain:log.domain,
      score:Number(log.score)||0,
      max:Number(log.max)||(log.subject==="Math"?22:27),
      source:"welled_log",
      difficulty:log.difficulty,
      level:"domain",
      _id:log.id,
      note:log.notes||""
    });
  });
  return pts.sort((a,b)=>(a.date||"").localeCompare(b.date||""));
}

/* ============ SCORES TAB ============ */
function ScoresTab({students,openProfile}){
  const[selSt,setSelSt]=useState(students[0]?.id||"");
  const st = students.find(s=>s.id===selSt)||students[0];
  const pts = st?allScoreDataPoints(st):[];

  // Group by subcategory. For WellEd domain entries, further split by difficulty.
  const groups = useMemo(()=>{
    const g = {};
    pts.forEach(p=>{
      const key = p.source==="history_welled" && p.difficulty ? `${p.subcategory} (${p.difficulty})` : p.subcategory;
      if(!g[key]) g[key]={key,points:[],source:p.source,difficulty:p.difficulty};
      g[key].points.push(p);
    });
    return g;
  },[pts]);

  return(
    <div>
      <div style={{marginBottom:24,paddingBottom:16,borderBottom:"1px solid rgba(15,26,46,.1)"}}>
        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,fontWeight:600,letterSpacing:1.4,color:"#66708A",textTransform:"uppercase",marginBottom:6}}>Performance</div>
        <div style={{fontFamily:"'Fraunces',Georgia,serif",fontVariationSettings:'"opsz" 144',fontSize:34,fontWeight:600,color:"#0F1A2E",letterSpacing:-.6,lineHeight:1}}>Score Tracking</div>
        <div style={{fontSize:12,color:"#66708A",marginTop:8,fontStyle:"italic",fontFamily:"'Fraunces',Georgia,serif"}}>Diagnostic results, manual scores, and scores from assignment history. Domains split by difficulty.</div>
      </div>

      {students.length===0 ? (
        <div style={{...CARD,padding:"72px 40px",textAlign:"center"}}>
          <div style={{fontFamily:"'Fraunces',Georgia,serif",fontStyle:"italic",fontSize:22,color:"#66708A",letterSpacing:-.2}}>No students enrolled yet.</div>
        </div>
      ) : (<>
        <div style={{...CARD,marginBottom:16,padding:16,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:"#66708A",letterSpacing:1.2,textTransform:"uppercase"}}>Student</div>
          <select value={selSt} onChange={e=>setSelSt(e.target.value)} style={{...INP,width:280,flexShrink:0}}>
            {students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {st && <button onClick={()=>openProfile(st)} style={{...mkBtn("transparent",B2),border:"1px solid rgba(0,74,121,.3)",padding:"7px 14px",fontSize:11}}>View Profile →</button>}
          <div style={{marginLeft:"auto",fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#66708A",letterSpacing:.4,textTransform:"uppercase"}}>{pts.length.toString().padStart(3,"0")} Data Points</div>
        </div>

        {pts.length===0 ? (
          <div style={{...CARD,padding:"72px 40px",textAlign:"center"}}>
            <div style={{fontFamily:"'Fraunces',Georgia,serif",fontStyle:"italic",fontSize:22,color:"#66708A",letterSpacing:-.2,marginBottom:8}}>No scores recorded yet for {st?.name||"this student"}.</div>
            <div style={{fontSize:11,color:"#66708A"}}>Upload a diagnostic PDF or enter scores in Assignment History to populate this view.</div>
          </div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
            {Object.values(groups).sort((a,b)=>a.key.localeCompare(b.key)).map(grp=>{
              const sorted = [...grp.points].sort((a,b)=>(a.date||"").localeCompare(b.date||""));
              const first = sorted[0];
              const last  = sorted[sorted.length-1];
              const firstPct = first.max?Math.round((first.score/first.max)*100):first.pct||null;
              const lastPct  = last.max?Math.round((last.score/last.max)*100):last.pct||null;
              const delta = firstPct!=null && lastPct!=null ? (lastPct-firstPct) : null;
              const accent = grp.difficulty && DC[grp.difficulty] ? DC[grp.difficulty] : B2;
              return(
                <div key={grp.key} style={{background:"#fff",padding:16,boxShadow:"0 0 0 1px rgba(15,26,46,.08)",borderRadius:3,borderLeft:`3px solid ${accent}`}}>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:600,color:"#66708A",textTransform:"uppercase",letterSpacing:1.2,marginBottom:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={grp.key}>{grp.key}</div>
                  <div style={{display:"flex",alignItems:"baseline",gap:4,marginBottom:10}}>
                    <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:22,fontWeight:600,color:"#0F1A2E",lineHeight:1,letterSpacing:.2}}>{last.score}</div>
                    {last.max&&<div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:12,color:"#66708A",fontWeight:500}}>/ {last.max}</div>}
                    {delta!=null && sorted.length>1 && <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:delta>0?"#4C7A4C":delta<0?"#8C2E2E":"#66708A",fontWeight:600,marginLeft:"auto",letterSpacing:.2}}>{delta>0?"+":delta<0?"−":"·"}{Math.abs(delta)}%</div>}
                  </div>
                  {lastPct!=null && <div style={{marginBottom:10}}><PctBar value={lastPct} width={180}/></div>}
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#66708A",letterSpacing:.2}}>
                    <span>{sorted.length} pt{sorted.length!==1?"s":""}</span>
                    <span style={{opacity:.4}}>·</span>
                    <span>Latest {last.date}</span>
                    {grp.source==="diagnostic" && first===last && <span style={{marginLeft:"auto",...mkPill("transparent","#6E3F12"),border:"1px solid rgba(154,91,31,.35)"}}>Baseline</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>)}
    </div>
  );
}

/* ============ TRASH TAB ============ */
function TrashTab({students,restoreStudent,purgeStudent,restoreSubItem,purgeSubItem,emptyTrash,trashCount}){
  // Flatten every deleted thing into a single timeline sorted by deletedAt desc.
  const rows = useMemo(()=>{
    const out = [];
    const fmt = (ts)=> ts ? new Date(ts).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}) : "—";
    for(const st of students){
      if(st.deleted){
        out.push({
          kind:"student", id:st.id, parentId:null, deletedAt:st.deletedAt||0,
          label: st.name || "(unnamed student)",
          detail: `${(st.assignments||[]).length} assignments · ${(st.scores||[]).length} scores`,
          restore: ()=>restoreStudent(st.id),
          purge: ()=>purgeStudent(st.id),
        });
      }
      // Sub-items only surface under LIVE students. If the parent student is
      // itself deleted, restoring the student brings them back whole.
      if(!st.deleted){
        for(const a of trashed(st.assignments)){
          out.push({
            kind:"assignment", id:a.id, parentId:st.id, deletedAt:a.deletedAt||0,
            label: `${st.name} — Assignment ${a.date||""}`.trim(),
            detail: `${(a.worksheets||[]).length} worksheet${(a.worksheets||[]).length!==1?"s":""}`,
            restore: ()=>restoreSubItem(st.id,"assignments",a.id),
            purge: ()=>purgeSubItem(st.id,"assignments",a.id),
          });
        }
        for(const sc of trashed(st.scores)){
          out.push({
            kind:"score", id:sc.id, parentId:st.id, deletedAt:sc.deletedAt||0,
            label: `${st.name} — ${sc.testType||"Score"}`,
            detail: `${sc.score||"—"}${sc.maxScore?` / ${sc.maxScore}`:""} · ${sc.date||""}`,
            restore: ()=>restoreSubItem(st.id,"scores",sc.id),
            purge: ()=>purgeSubItem(st.id,"scores",sc.id),
          });
        }
        for(const lg of trashed(st.welledLogs)){
          out.push({
            kind:"welledLog", id:lg.id, parentId:st.id, deletedAt:lg.deletedAt||0,
            label: `${st.name} — WellEd ${lg.domain||lg.subdomain||""}`,
            detail: `${lg.score||"—"} · ${lg.date||""}`,
            restore: ()=>restoreSubItem(st.id,"welledLogs",lg.id),
            purge: ()=>purgeSubItem(st.id,"welledLogs",lg.id),
          });
        }
        for(const d of trashed(st.diagnostics)){
          out.push({
            kind:"diagnostic", id:d.id, parentId:st.id, deletedAt:d.deletedAt||0,
            label: `${st.name} — Diagnostic`,
            detail: d.testName || d.dateTaken || "—",
            restore: ()=>restoreSubItem(st.id,"diagnostics",d.id),
            purge: ()=>purgeSubItem(st.id,"diagnostics",d.id),
          });
        }
      }
    }
    out.sort((a,b)=>(b.deletedAt||0)-(a.deletedAt||0));
    return out.map(r=>({...r, deletedAtLabel: fmt(r.deletedAt)}));
  },[students,restoreStudent,purgeStudent,restoreSubItem,purgeSubItem]);

  const kindLabel = {student:"Student",assignment:"Assignment",score:"Score",welledLog:"WellEd Log",diagnostic:"Diagnostic"};
  const kindAccent = {student:"var(--brand)",assignment:"var(--ink-soft)",score:"var(--ok)",welledLog:"var(--accent)",diagnostic:"var(--brand-light)"};

  return (
    <div style={{maxWidth:1100,margin:"0 auto"}}>
      <div style={{marginBottom:22,display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
        <div>
          <div style={{fontFamily:"var(--font-body)",fontSize:10,fontWeight:600,letterSpacing:"0.18em",textTransform:"uppercase",color:"var(--ink-mute)",marginBottom:6}}>Recoverable</div>
          <h1 style={{fontFamily:"var(--font-display)",fontVariationSettings:"'opsz' 144, 'SOFT' 20",fontWeight:600,fontSize:32,letterSpacing:"-0.02em",margin:0,lineHeight:1.05}}>Trash</h1>
          <div style={{marginTop:8,fontSize:13,color:"var(--ink-soft)",maxWidth:560,lineHeight:1.55}}>
            Deleted students, assignments, scores, logs, and diagnostics live here until you restore or permanently delete them. Nothing in this list has been removed from Firestore.
          </div>
        </div>
        {rows.length>0 && (
          <button onClick={emptyTrash} style={{
            ...mkBtn("transparent","#8C2E2E"),
            border:"1px solid rgba(140,46,46,.35)",
            padding:"9px 18px",fontSize:11,letterSpacing:"0.04em",textTransform:"uppercase",fontWeight:600
          }}>Empty Trash</button>
        )}
      </div>

      {rows.length===0 ? (
        <div style={{...CARD,padding:"72px 40px",textAlign:"center"}}>
          <div style={{fontFamily:"var(--font-display)",fontStyle:"italic",fontSize:22,color:"var(--ink-mute)",letterSpacing:"-0.01em",marginBottom:8}}>Trash is empty.</div>
          <div style={{fontSize:12,color:"var(--ink-mute)"}}>Deleted items appear here and can be restored with one click.</div>
        </div>
      ) : (
        <div style={{...CARD,padding:0,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"var(--paper-alt)",borderBottom:"1px solid var(--rule)"}}>
                <th style={{padding:"12px 16px",textAlign:"left",fontFamily:"var(--font-mono)",fontSize:9,fontWeight:600,color:"var(--ink-mute)",letterSpacing:"0.1em",textTransform:"uppercase"}}>Type</th>
                <th style={{padding:"12px 16px",textAlign:"left",fontFamily:"var(--font-mono)",fontSize:9,fontWeight:600,color:"var(--ink-mute)",letterSpacing:"0.1em",textTransform:"uppercase"}}>Item</th>
                <th style={{padding:"12px 16px",textAlign:"left",fontFamily:"var(--font-mono)",fontSize:9,fontWeight:600,color:"var(--ink-mute)",letterSpacing:"0.1em",textTransform:"uppercase"}}>Deleted</th>
                <th style={{padding:"12px 16px",textAlign:"right",fontFamily:"var(--font-mono)",fontSize:9,fontWeight:600,color:"var(--ink-mute)",letterSpacing:"0.1em",textTransform:"uppercase"}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>(
                <tr key={`${r.kind}-${r.id}-${r.parentId||""}`} style={{borderBottom:i===rows.length-1?"none":"1px solid rgba(15,26,46,.06)"}}>
                  <td style={{padding:"14px 16px",whiteSpace:"nowrap"}}>
                    <span style={{display:"inline-block",padding:"3px 10px",borderRadius:999,border:`1px solid ${kindAccent[r.kind]}`,color:kindAccent[r.kind],fontFamily:"var(--font-mono)",fontSize:9,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase"}}>{kindLabel[r.kind]}</span>
                  </td>
                  <td style={{padding:"14px 16px"}}>
                    <div style={{fontFamily:"var(--font-display)",fontVariationSettings:"'opsz' 48",fontSize:14,fontWeight:500,color:"var(--ink)"}}>{r.label}</div>
                    {r.detail&&<div style={{fontSize:11,color:"var(--ink-mute)",marginTop:2}}>{r.detail}</div>}
                  </td>
                  <td style={{padding:"14px 16px",fontFamily:"var(--font-mono)",fontSize:11,color:"var(--ink-soft)",whiteSpace:"nowrap"}}>{r.deletedAtLabel}</td>
                  <td style={{padding:"14px 16px",textAlign:"right",whiteSpace:"nowrap"}}>
                    <div style={{display:"inline-flex",gap:6}}>
                      <button onClick={r.restore} style={{...mkBtn("transparent","#004A79"),border:"1px solid rgba(0,74,121,.35)",padding:"5px 12px",fontSize:11}}>Restore</button>
                      <button onClick={r.purge} title="Delete forever" style={{...mkBtn("transparent","#8C2E2E"),border:"1px solid rgba(140,46,46,.3)",padding:"5px 10px",fontSize:11}}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
