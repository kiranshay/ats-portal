/* ============ CONSTANTS ============ */
const B1="#003258", B2="#004a79", B3="#0066a6";
const DC={easy:"#16a34a",medium:"#d97706",hard:"#dc2626",comprehensive:"#7c3aed",mixed:"#7c3aed"};
const SUBJ_COLOR={"Reading & Writing":{bg:"#eef2ff",fg:"#4338ca",accent:"#6366f1"},"Math":{bg:"#ecfeff",fg:"#0e7490",accent:"#06b6d4"}};
const DOMAIN_COLOR={"Information & Ideas":"#4f46e5","Craft & Structure":"#7c3aed","Expression of Ideas":"#2563eb","Standard English Conventions":"#0891b2","Algebra":"#059669","Advanced Math":"#0d9488","Problem-Solving & Data Analysis":"#ca8a04","Geometry & Trigonometry":"#dc2626"};
const DIFF_ORDER=["easy","medium","hard","comprehensive"];

const uid=()=>Math.random().toString(36).slice(2,10);
const todayStr=()=>new Date().toISOString().slice(0,10);
const sLoad=(k,fb)=>{try{const r=localStorage.getItem(k);return r?JSON.parse(r):fb;}catch{return fb;}};
const sSave=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};

/* ============ WORKSHEET CATALOG ============ */
const ALL_WS = WS_RAW.map(([subject,domain,subdomain,difficulty,qs,title,stu,key])=>({
  subject,domain,subdomain,difficulty,qs,title,stu,key,
  id:`${subject}|${domain}|${subdomain}|${difficulty}|${title}`,
  isComprehensiveGroup: subdomain.startsWith("Comprehensive "),
}));

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

/* ============ STYLE HELPERS ============ */
const INP={border:"1px solid #cbd5e1",borderRadius:7,padding:"7px 11px",fontSize:13,outline:"none",width:"100%",background:"#fff",color:"#1e293b"};
const CARD={background:"#fff",borderRadius:12,padding:16,boxShadow:"0 1px 4px rgba(0,0,0,.07)"};
const mkPill=(bg,fg)=>({background:bg,color:fg,borderRadius:20,padding:"2px 9px",fontSize:10,fontWeight:700,display:"inline-block"});
const mkBtn=(bg,fg)=>({background:bg,color:fg,border:"none",borderRadius:7,padding:"7px 15px",fontSize:13,cursor:"pointer",fontWeight:600});

function Tag({c="#eff6ff",t="#1d4ed8",children}){return <span style={mkPill(c,t)}>{children}</span>;}
function SH({children}){return <div style={{fontSize:10,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1.2,marginBottom:8}}>{children}</div>;}

function Toggle({on,set,label,sub}){
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>set(!on)}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:700,color:B2}}>{label}</div>
        {sub&&<div style={{fontSize:11,color:"#64748b",marginTop:2}}>{sub}</div>}
      </div>
      <div style={{width:44,height:24,borderRadius:12,background:on?B2:"#cbd5e1",position:"relative",transition:"background .2s",flexShrink:0,marginLeft:10}}>
        <div style={{position:"absolute",top:3,left:on?22:3,width:18,height:18,borderRadius:9,background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
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
  // Detect quiz type from title
  let subject="Unknown", module=null;
  if(/SECTION\s*1[-\s]*READING/i.test(fullText) || (/READING/i.test(fullText) && !/MATH/i.test(fullText.split("TAGGED")[0]||""))) subject = "Reading & Writing";
  if(/MATH\s*MOD\w*\s*\.?\s*1/i.test(fullText)){ subject = "Math"; module = 1; }
  else if(/MATH\s*MOD\w*\s*\.?\s*2/i.test(fullText)){ subject = "Math"; module = 2; }
  else if(/MATH/i.test(fullText) && subject==="Unknown"){ subject = "Math"; }

  const pctMatch = fullText.match(/Percent\s*Correct:?\s*([\d.]+)/i);
  const earnedMatch = fullText.match(/Earned\s*Points:?\s*(\d+)/i);
  const possMatch = fullText.match(/Possible\s*Points:?\s*(\d+)/i);

  // Extract tag rows. The section layout is:
  //   <tag name possibly wrapped across lines> <space> <earn> <poss> <pct>
  // We collapse whitespace/newlines then scan for sequences starting with "!SAT".
  const tagSection = fullText.split(/TAGGED\s*QUESTIONS\s*&?\s*QUIZ/i)[1] || "";
  const cleaned = tagSection.replace(/\s+/g," ").trim();
  const rows = [];
  // Match: "!SAT <name...> <earn> <poss> <pct>" where the name is anything until we hit "number number float" at the end
  // Split at each "!SAT " occurrence, then parse the trailing 3 numbers off each chunk.
  const chunks = cleaned.split(/(?=!SAT\s)/g).filter(c=>c.trim().startsWith("!SAT"));
  for(const chunk of chunks){
    // End of chunk: "<name> <int> <int> <float>"
    const m = chunk.match(/^(!SAT\s+.+?)\s+(\d+)\s+(\d+)\s+([\d.]+)\s*$/);
    if(!m) continue;
    let name = m[1].replace(/^!SAT\s+/,"").replace(/\s*\(2024\)\s*$/,"").replace(/\s+/g," ").trim();
    rows.push({tag:name,earn:Number(m[2]),poss:Number(m[3]),pct:Number(m[4])});
  }
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
  // R&W subdomains
  "C&S - Cross-Text Connections":           ["Reading & Writing","sub","Craft & Structure","Cross Text Connections"],
  "C&S - Text Structure & Purpose":         ["Reading & Writing","sub","Craft & Structure","Text Structure & Purpose"],
  "C&S - Words in Context":                 ["Reading & Writing","sub","Craft & Structure","Words in Context"],
  "Info/Ideas - Central Idea & Details":    ["Reading & Writing","sub","Information & Ideas","Central Ideas & Details"],
  "Info/Ideas - Command of Evidence":       ["Reading & Writing","sub","Information & Ideas","Command of Evidence"],
  "Info/Ideas - Inferences":                ["Reading & Writing","sub","Information & Ideas","Inferences"],
  "EOI - Rhetorical Synthesis":             ["Reading & Writing","sub","Expression of Ideas","Rhetorical Synthesis"],
  "EOI - Transitions":                      ["Reading & Writing","sub","Expression of Ideas","Transitions"],
  "SEC - Form Structure Sense":             ["Reading & Writing","sub","Standard English Conventions","Form, Structure, & Sense"],
  "SEC - Boundaries":                       ["Reading & Writing","sub","Standard English Conventions","Boundaries"],
  // Math domains
  "Algebra":                       ["Math","domain","Algebra"],
  "Advanced Math":                 ["Math","domain","Advanced Math"],
  "PSDA":                          ["Math","domain","Problem-Solving & Data Analysis"],
  "Geometry & Trig":               ["Math","domain","Geometry & Trigonometry"],
  // Math subdomains
  "Alg- Linear Equations in One Variable":  ["Math","sub","Algebra","Linear Equations (1 Variable)"],
  "Alg- Linear Equations in Two Variables": ["Math","sub","Algebra","Linear Equations (2 Variables)"],
  "Alg- Linear Functions":                  ["Math","sub","Algebra","Linear Functions"],
  "Alg- Linear Inequalities":               ["Math","sub","Algebra","Linear Inequalities"],
  "Alg- Systems of Linear Equations":       ["Math","sub","Algebra","Systems of Linear Equations"],
  "AdvMath- Equivalent Expressions":        ["Math","sub","Advanced Math","Equivalent Expressions"],
  "AdvMath- Nonlinear Equations & SOEs":    ["Math","sub","Advanced Math","Nonlinear Equations"],
  "AdvMath- Nonlinear Functions":           ["Math","sub","Advanced Math","Nonlinear Functions"],
  "PSDA- Percentages":                                         ["Math","sub","Problem-Solving & Data Analysis","Percentages"],
  "PSDA- Ratios, Rates, Proportions, Units":                   ["Math","sub","Problem-Solving & Data Analysis","Ratios, Rates, Proportions, Units"],
  "PSDA- One Var. Data Distributions":                         ["Math","sub","Problem-Solving & Data Analysis","One-Variable Data"],
  "PSDA- Two-Variable Data":                                   ["Math","sub","Problem-Solving & Data Analysis","Two-Variable Data"],
  "PSDA- Two Var. Data":                                       ["Math","sub","Problem-Solving & Data Analysis","Two-Variable Data"],
  "PSDA- Probability & Conditional Probability":               ["Math","sub","Problem-Solving & Data Analysis","Probability"],
  "PSDA- Probability":                                         ["Math","sub","Problem-Solving & Data Analysis","Probability"],
  "PSDA- Inference from Sample Data & Margin of Error":        ["Math","sub","Problem-Solving & Data Analysis","Inference & Margin of Error"],
  "PSDA- Inference & Margin of Error":                         ["Math","sub","Problem-Solving & Data Analysis","Inference & Margin of Error"],
  "PSDA- Evaluating Stat Claims in Obs Studies & Experiments": ["Math","sub","Problem-Solving & Data Analysis","Evaluating Statistical Claims"],
  "PSDA- Evaluating Statistical Claims":                       ["Math","sub","Problem-Solving & Data Analysis","Evaluating Statistical Claims"],
  "Geo- Area & Volume":                     ["Math","sub","Geometry & Trigonometry","Area & Volume"],
  "Geo- Circles":                           ["Math","sub","Geometry & Trigonometry","Circles"],
  "Geo- Lines, Angles, & Triangles":        ["Math","sub","Geometry & Trigonometry","Lines, Angles, & Triangles"],
  "Geo- Right Triangles & Trigonometry":    ["Math","sub","Geometry & Trigonometry","Right Triangles & Trigonometry"],
};
// Normalizer: lowercase, collapse non-alphanumeric to nothing, so tag lookup is tolerant
const normTag = (s)=>s.toLowerCase().replace(/\(2024\)/g,"").replace(/[^a-z0-9]/g,"");
const TAG_MAP = {};
Object.entries(_rawTagMap).forEach(([k,v])=>{
  const obj = v[1]==="domain" ? {subject:v[0],kind:"domain",name:v[2]} : {subject:v[0],kind:"sub",domain:v[2],name:v[3]};
  TAG_MAP[normTag(k)] = obj;
});

// Build a student's diagnostic profile from parsed results.
// Math module 1 + module 2 are merged into one Math section; Reading is its own.
function buildDiagnosticProfile(parsedList){
  const domains={}, subs={};
  const sectionTotals = {"Reading & Writing":{earn:0,poss:0,count:0},"Math":{earn:0,poss:0,count:0}};
  parsedList.forEach(res=>{
    if(res.subject && sectionTotals[res.subject] && res.earned!=null && res.possible!=null){
      sectionTotals[res.subject].earn += res.earned;
      sectionTotals[res.subject].poss += res.possible;
      sectionTotals[res.subject].count += 1;
    }
    (res.tags||[]).forEach(t=>{
      const map = TAG_MAP[normTag(t.tag)];
      if(!map) return;
      const slot = map.kind==="domain"?domains:subs;
      const key = map.kind==="domain"?`${map.subject}|${map.name}`:`${map.subject}|${map.domain}|${map.name}`;
      if(!slot[key]) slot[key]={earn:0,poss:0,subject:map.subject,domain:map.domain||map.name,name:map.name};
      slot[key].earn += t.earn;
      slot[key].poss += t.poss;
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

/* ============ HEAT COLORS ============ */
const heatColorPct = (pct)=>{
  if(pct===null||pct===undefined) return "#f1f5f9";
  if(pct>=85) return "#15803d";
  if(pct>=70) return "#65a30d";
  if(pct>=55) return "#ca8a04";
  if(pct>=40) return "#ea580c";
  return "#dc2626";
};

/* ============ APP ============ */
function App(){
  const[tab,setTab]=useState("generator");
  const[students,setStudents]=useState(()=>sLoad("psm_v4",sLoad("psm_v3",[])));
  const[selSt,setSelSt]=useState("");
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
  const[newS,setNewS]=useState({name:"",grade:"",tutor:"",notes:""});
  const[ptab,setPtab]=useState("history");
  const[paChk,setPaChk]=useState({});
  const[paSubj,setPaSubj]=useState("All");
  const[paSrch,setPaSrch]=useState("");
  const[sfm,setSfm]=useState({date:todayStr(),testType:"",score:"",maxScore:"",notes:""});
  const[toast,setToast]=useState("");
  const[parsing,setParsing]=useState(false);
  const diagInputRef = useRef(null);

  useEffect(()=>{sSave("psm_v4",students);},[students]);

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

  const curStudent = students.find(st=>st.id===selSt);

  // Heat Map domains (from assignments)
  const heatDoms = useMemo(()=>[...new Set(ALL_WS.map(ws=>ws.domain))],[]);
  const getHV = (st,d)=>(st.assignments||[]).reduce((n,a)=>n+(a.worksheets||[]).filter(w=>w.domain===d).length,0);
  const heatMax = useMemo(()=>students.reduce((mx,st)=>heatDoms.reduce((m,d)=>Math.max(m,getHV(st,d)),mx),1),[students,heatDoms]);
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
  const addStudent=()=>{if(!newS.name.trim())return;setStudents(prev=>[...prev,{...newS,id:uid(),dateAdded:todayStr(),assignments:[],scores:[],diagnostics:[]}]);setNewS({name:"",grade:"",tutor:"",notes:""});setShowAdd(false);showToast("Student added");};
  const openProfile=(st)=>{setProfile(st);setPtab("history");setPaChk({});setPaSubj("All");setPaSrch("");setSfm({date:todayStr(),testType:"",score:"",maxScore:"",notes:""});setTab("students");};

  const savePreAssign=()=>{
    const ids=Object.keys(paChk).filter(k=>paChk[k]);
    if(!ids.length)return;
    const sheets=ALL_WS.filter(ws=>ids.includes(ws.id));
    const entry={id:uid(),date:todayStr(),preAssigned:true,examType,worksheets:sheets.map(ws=>({id:ws.id,title:ws.title,subject:ws.subject,domain:ws.domain,subdomain:ws.subdomain,difficulty:ws.difficulty,qs:ws.qs})),welledDomain:[],vocab:[],practiceExams:[],timeDrill:false,oneNote:false};
    const upd=students.map(st=>st.id===profile.id?{...st,assignments:[...(st.assignments||[]),entry]}:st);
    setStudents(upd);setProfile(upd.find(st=>st.id===profile.id));setPaChk({});showToast(`${ids.length} worksheets pre-assigned`);
  };
  const addScore=()=>{if(!sfm.testType||!sfm.score)return;const entry={...sfm,id:uid()};const upd=students.map(st=>st.id===profile.id?{...st,scores:[...(st.scores||[]),entry]}:st);setStudents(upd);setProfile(upd.find(st=>st.id===profile.id));setSfm({date:todayStr(),testType:"",score:"",maxScore:"",notes:""});showToast("Score recorded");};
  const delScore=(sid)=>{const upd=students.map(st=>st.id===profile.id?{...st,scores:st.scores.filter(sc=>sc.id!==sid)}:st);setStudents(upd);setProfile(upd.find(st=>st.id===profile.id));};
  const delAsg=(aid)=>{const upd=students.map(st=>st.id===profile.id?{...st,assignments:st.assignments.filter(a=>a.id!==aid)}:st);setStudents(upd);setProfile(upd.find(st=>st.id===profile.id));};
  const delStudent=(id)=>{if(!confirm("Delete this student and all their data?"))return;setStudents(prev=>prev.filter(st=>st.id!==id));if(profile?.id===id)setProfile(null);};

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
        const upd = students.map(st=>{
          if(st.id!==profile.id) return st;
          const existing = st.diagnostics||[];
          return {...st, diagnostics:[...existing, ...results]};
        });
        setStudents(upd);
        setProfile(upd.find(st=>st.id===profile.id));
        showToast(`Parsed ${results.length} diagnostic report${results.length!==1?"s":""}`);
      }
    } finally { setParsing(false); }
  };
  const clearDiagnostics=()=>{
    if(!confirm("Clear all diagnostic data for this student?")) return;
    const upd = students.map(st=>st.id===profile.id?{...st,diagnostics:[]}:st);
    setStudents(upd); setProfile(upd.find(st=>st.id===profile.id));
  };

  const p = profile && (students.find(st=>st.id===profile.id)||profile);
  const diagProfile = useMemo(()=>p?.diagnostics?.length?buildDiagnosticProfile(p.diagnostics):null,[p]);

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
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#eef2f7",minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      {toast&&<div style={{position:"fixed",top:16,right:16,background:"#1e293b",color:"#fff",padding:"10px 18px",borderRadius:10,fontSize:13,fontWeight:600,zIndex:9999,boxShadow:"0 4px 16px rgba(0,0,0,.25)"}}>{toast}</div>}
      {parsing&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",background:"#4338ca",color:"#fff",padding:"10px 18px",borderRadius:10,fontSize:13,fontWeight:600,zIndex:9999}} className="pl">Parsing diagnostic PDF(s)...</div>}

      {/* HEADER */}
      <div style={{background:`linear-gradient(135deg,${B1} 0%,${B2} 55%,${B3} 100%)`,color:"#fff",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:58,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:10,background:"rgba(255,255,255,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📐</div>
          <div>
            <div style={{fontSize:16,fontWeight:800}}>Affordable Tutoring Solutions</div>
            <div style={{fontSize:10,opacity:.75,letterSpacing:.5}}>PSM GENERATOR &amp; STUDENT TRACKING SYSTEM</div>
          </div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center",fontSize:12,opacity:.95}}>
          <div style={{display:"flex",background:"rgba(255,255,255,.12)",borderRadius:7,padding:2}}>
            {["SAT","PSAT"].map(t=>(
              <button key={t} onClick={()=>setExamType(t)} style={{background:examType===t?"#fff":"transparent",color:examType===t?B2:"#fff",border:"none",borderRadius:5,padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{t}</button>
            ))}
          </div>
          <span>👤 {students.length}</span>
          <span>📋 {students.reduce((n,st)=>n+(st.assignments||[]).reduce((m,a)=>m+(a.worksheets||[]).length,0),0)}</span>
          <button onClick={exportData} title="Export data" style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer",fontWeight:600}}>⬇ Export</button>
          <label title="Import data" style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer",fontWeight:600}}>
            ⬆ Import
            <input type="file" accept="application/json" onChange={importData} style={{display:"none"}}/>
          </label>
        </div>
      </div>

      {/* TABS */}
      <div style={{background:"#fff",borderBottom:"2px solid #e2e8f0",display:"flex",padding:"0 24px",gap:2,flexShrink:0}}>
        {[{id:"generator",icon:"📋",label:"Generator"},{id:"students",icon:"👤",label:"Students"},{id:"heatmap",icon:"🔥",label:"Heat Map"},{id:"scores",icon:"📊",label:"Score Tracking"}].map(t=>(
          <button key={t.id} onClick={()=>{if(t.id!=="students")setProfile(null);setTab(t.id);}} style={{border:"none",background:"none",cursor:"pointer",padding:"12px 18px",fontSize:13,fontWeight:tab===t.id?700:500,color:tab===t.id?B2:"#64748b",borderBottom:tab===t.id?`3px solid ${B2}`:"3px solid transparent",marginBottom:-2,display:"flex",alignItems:"center",gap:6}}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* BODY */}
      <div style={{flex:1,padding:20,overflowY:"auto"}}>
        {tab==="generator"&&<GeneratorTab {...{
          students,curStudent,selSt,setSelSt,openProfile,
          subjF,setSubjF,domF,setDomF,sdomF,setSdomF,diffF,setDiffF,srch,setSrch,
          availDoms,availSdoms,grouped,
          chk,setChk,evenOdd,setEvenOdd,weChk,setWeChk,vocabChk,setVocabChk,
          timeDrill,setTimeDrill,timeLims,setTimeLims,oneNote,setOneNote,
          weDomEn,setWeDomEn,vocabEn,setVocabEn,
          addBB,setAddBB,bbType,setBbType,bbCnt,setBbCnt,
          addWE,setAddWE,weType,setWeType,weCnt,setWeCnt,
          selWS,selWeDom,selVocab,totalQs,examType,
          generate,output,copyOut,copied,
          lastAssignedDate,
        }}/>}

        {tab==="students"&&!profile&&<StudentsList {...{students,showAdd,setShowAdd,newS,setNewS,addStudent,openProfile,delStudent}}/>}

        {tab==="students"&&profile&&p&&<StudentProfile {...{p,setProfile,ptab,setPtab,
          paChk,setPaChk,paSubj,setPaSubj,paSrch,setPaSrch,savePreAssign,
          sfm,setSfm,addScore,delScore,delAsg,setExamScore,setWelledDomainScore,
          handleDiagUpload,clearDiagnostics,diagInputRef,diagProfile,
        }}/>}

        {tab==="heatmap"&&<HeatMapTab {...{students,openProfile}}/>}

        {tab==="scores"&&<ScoresTab {...{students,openProfile}}/>}
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
    generate,output,copyOut,copied,lastAssignedDate} = props;

  const totalSelected = selWS.length + selWeDom.length + selVocab.length + (addBB?1:0) + (addWE?1:0);

  return(
    <div style={{display:"grid",gridTemplateColumns:"275px 1fr 345px",gap:14,minHeight:"calc(100vh - 188px)"}}>
      {/* LEFT SIDEBAR */}
      <div style={{display:"flex",flexDirection:"column",gap:10,paddingRight:2,overflowY:"auto",maxHeight:"calc(100vh - 188px)"}}>
        <div style={{...CARD}}>
          <SH>Assign To</SH>
          <select value={selSt} onChange={e=>setSelSt(e.target.value)} style={INP}>
            <option value="">— No Student —</option>
            {students.map(st=><option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
          {selSt&&<button onClick={()=>openProfile(curStudent)} style={{...mkBtn("#eff6ff",B2),marginTop:8,width:"100%",fontSize:12}}>👤 View Profile</button>}
        </div>

        <div style={{...CARD}}>
          <SH>Filters</SH>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:10,color:"#94a3b8",marginBottom:5}}>SUBJECT</div>
            <div style={{display:"flex",gap:4}}>
              {["All","Reading & Writing","Math"].map(s=>(
                <button key={s} onClick={()=>{setSubjF(s);setDomF("All");setSdomF("All");}} style={{...mkBtn(subjF===s?B2:"#f1f5f9",subjF===s?"#fff":"#475569"),padding:"4px 10px",fontSize:11,flex:1}}>
                  {s==="All"?"All":s==="Reading & Writing"?"R&W":"Math"}
                </button>
              ))}
            </div>
          </div>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>DOMAIN</div>
            <select value={domF} onChange={e=>{setDomF(e.target.value);setSdomF("All");}} style={{...INP,fontSize:12}}>
              <option value="All">All Domains</option>
              {availDoms.map(d=><option key={d}>{d}</option>)}
            </select>
          </div>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>SUBSKILL</div>
            <select value={sdomF} onChange={e=>setSdomF(e.target.value)} style={{...INP,fontSize:12}}>
              <option value="All">All Subskills</option>
              {availSdoms.map(d=><option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:10,color:"#94a3b8",marginBottom:5}}>DIFFICULTY</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:3}}>
              {["All","easy","medium","hard","comprehensive"].map(d=>(
                <button key={d} onClick={()=>setDiffF(d)} style={{...mkBtn(diffF===d?(d==="All"?B2:DC[d]):"#f1f5f9",diffF===d?"#fff":"#475569"),padding:"3px 4px",fontSize:9}}>
                  {d==="All"?"All":d==="comprehensive"?"Comp":d[0].toUpperCase()+d.slice(1,3)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <input placeholder="🔍 Search worksheets..." value={srch} onChange={e=>setSrch(e.target.value)} style={{...INP,boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}/>

        {/* TIME DRILL */}
        <div style={{...CARD,background:timeDrill?"#eff6ff":"#fff",border:timeDrill?"1.5px solid #93c5fd":"1.5px solid #e2e8f0"}}>
          <Toggle on={timeDrill} set={setTimeDrill} label="⏱ Enable Time Drilling"/>
          {timeDrill&&<div style={{marginTop:10,padding:10,background:"#f0f9ff",borderRadius:8,fontSize:11,color:"#1e40af",lineHeight:1.5}}>
            <div style={{fontWeight:700,marginBottom:4}}>⏱ Time Drilling Instructions</div>
            <div style={{color:"#475569",marginBottom:6}}>Enter time limits in minutes for each selected worksheet. These will appear in parentheses before the worksheet names in your assignment. Leave blank to exclude time limit for specific worksheets.</div>
            <div style={{background:"#dbeafe",padding:"6px 8px",borderRadius:5,fontSize:10}}>
              <div style={{fontWeight:700,marginBottom:2}}>Reference Timing:</div>
              <div>• Reading &amp; Writing: ~71 seconds per question</div>
              <div>• Math: ~1 minute 35 seconds per question</div>
            </div>
          </div>}
        </div>

        {/* ONENOTE */}
        <div style={{...CARD,background:oneNote?"#eff6ff":"#fff",border:oneNote?"1.5px solid #93c5fd":"1.5px solid #e2e8f0"}}>
          <Toggle on={oneNote} set={setOneNote} label="📝 PSMs Completed on OneNote"/>
          {oneNote&&<div style={{marginTop:10,padding:10,background:"#f0f9ff",borderRadius:8,fontSize:11,color:"#475569",lineHeight:1.5}}>
            When enabled, only answer keys will be included (no student worksheets) and special OneNote instructions will be added for students completing work digitally.
          </div>}
        </div>

        {/* WELLED DOMAIN */}
        <div style={{...CARD,background:weDomEn?"#f0fdf4":"#fff",border:weDomEn?"1.5px solid #86efac":"1.5px solid #e2e8f0"}}>
          <Toggle on={weDomEn} set={setWeDomEn} label="🌿 WellEd Domain Assignments"/>
          {weDomEn&&<div style={{marginTop:10}}>
            <div style={{padding:10,background:"#ecfdf5",borderRadius:8,fontSize:11,color:"#065f46",lineHeight:1.5,marginBottom:8}}>
              Select topic-specific assignments. R&amp;W assignments have 27 Qs each; Math have 22 Qs each. PSDA and Geometry only offer Easy and Hard.
            </div>
            <div style={{maxHeight:260,overflowY:"auto",border:"1px solid #d1fae5",borderRadius:6,padding:6}}>
              {WELLED_DOMAIN.map(e=>(
                <div key={e.subject+"|"+e.domain} style={{marginBottom:6}}>
                  <div style={{fontSize:10,fontWeight:800,color:DOMAIN_COLOR[e.domain]||B2,marginBottom:3}}>{e.domain}</div>
                  {e.diffs.map(d=>{
                    const it = WE_DOMAIN_ITEMS.find(x=>x.subject===e.subject&&x.domain===e.domain&&x.difficulty===d);
                    const ck=!!weChk[it.id];
                    return(
                      <label key={d} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,padding:"3px 6px",cursor:"pointer",background:ck?"#dcfce7":"transparent",borderRadius:4,marginBottom:2}}>
                        <input type="checkbox" checked={ck} onChange={()=>setWeChk(prev=>({...prev,[it.id]:!prev[it.id]}))}/>
                        <span style={{color:"#065f46",fontWeight:600}}>{d[0].toUpperCase()+d.slice(1)}</span>
                        <span style={{color:"#94a3b8",marginLeft:"auto"}}>{e.qs}Qs</span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>}
        </div>

        {/* VOCAB */}
        <div style={{...CARD,background:vocabEn?"#fdf4ff":"#fff",border:vocabEn?"1.5px solid #d8b4fe":"1.5px solid #e2e8f0"}}>
          <Toggle on={vocabEn} set={setVocabEn} label="📚 Vocab (WellEd Labs)"/>
          {vocabEn&&<div style={{marginTop:10}}>
            <div style={{padding:10,background:"#faf5ff",borderRadius:8,fontSize:11,color:"#6b21a8",lineHeight:1.5,marginBottom:8}}>
              Select vocab flashcard sets or quizzes. Each set has 4 quiz variants. Question counts are not tracked for vocab.
            </div>
            <VocabPicker vocabChk={vocabChk} setVocabChk={setVocabChk}/>
          </div>}
        </div>

        {/* PRACTICE EXAMS */}
        <div style={{...CARD}}>
          <SH>Practice Exams</SH>
          <div style={{padding:10,background:"#f8fafc",borderRadius:8,marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:addBB?8:0}}>
              <span style={{fontSize:12,fontWeight:700,color:"#1e40af"}}>📘 BlueBook</span>
              <input type="checkbox" checked={addBB} onChange={e=>setAddBB(e.target.checked)} style={{cursor:"pointer"}}/>
            </div>
            {addBB&&<div style={{display:"grid",gridTemplateColumns:"1fr 54px",gap:6}}>
              <select value={bbType} onChange={e=>setBbType(e.target.value)} style={{...INP,fontSize:11}}>
                <option value="full">Full Test</option>
                <option value="section">Section</option>
              </select>
              <input type="number" min={1} max={10} value={bbCnt} onChange={e=>setBbCnt(Number(e.target.value))} style={{...INP,fontSize:12,textAlign:"center"}}/>
            </div>}
          </div>
          <div style={{padding:10,background:"#f8fafc",borderRadius:8}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:addWE?8:0}}>
              <span style={{fontSize:12,fontWeight:700,color:"#065f46"}}>🌿 WellEd Labs</span>
              <input type="checkbox" checked={addWE} onChange={e=>setAddWE(e.target.checked)} style={{cursor:"pointer"}}/>
            </div>
            {addWE&&<div style={{display:"grid",gridTemplateColumns:"1fr 54px",gap:6}}>
              <select value={weType} onChange={e=>setWeType(e.target.value)} style={{...INP,fontSize:11}}>
                <option value="full">Full Test</option>
                <option value="section">Section</option>
              </select>
              <input type="number" min={1} max={10} value={weCnt} onChange={e=>setWeCnt(Number(e.target.value))} style={{...INP,fontSize:12,textAlign:"center"}}/>
            </div>}
          </div>
        </div>

        {/* LIVE COUNTERS */}
        <div style={{background:totalSelected>0?"#ecfdf5":"#f8fafc",border:`1.5px solid ${totalSelected>0?"#a7f3d0":"#e2e8f0"}`,borderRadius:10,padding:12,fontSize:12,color:totalSelected>0?"#065f46":"#94a3b8",fontWeight:600}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span>Worksheets</span><span>{selWS.length}</span>
          </div>
          {selWeDom.length>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span>WellEd Domain</span><span>{selWeDom.length}</span></div>}
          {selVocab.length>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span>Vocab Items</span><span>{selVocab.length}</span></div>}
          <div style={{display:"flex",justifyContent:"space-between",paddingTop:6,marginTop:4,borderTop:"1px solid #a7f3d0",fontSize:14,fontWeight:800}}>
            <span>Total Qs</span><span>{totalQs}</span>
          </div>
        </div>
      </div>

      {/* MIDDLE: STUDENT SUMMARY (when selected) + WORKSHEET PICKER */}
      <div style={{display:"flex",flexDirection:"column",gap:12,overflow:"hidden",maxHeight:"calc(100vh - 188px)"}}>
      {curStudent && <StudentSummaryCard student={curStudent}/>}
      <div style={{...CARD,display:"flex",flexDirection:"column",overflow:"hidden",flex:1,minHeight:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexShrink:0}}>
          <div style={{fontSize:14,fontWeight:800,color:B2}}>Worksheets <span style={{fontSize:12,fontWeight:500,color:"#94a3b8"}}>({Object.values(grouped).reduce((n,doms)=>n+Object.values(doms).reduce((m,subs)=>m+Object.values(subs).reduce((k,arr)=>k+arr.length,0),0),0)} shown)</span></div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>{const a={};Object.values(grouped).forEach(doms=>Object.values(doms).forEach(subs=>Object.values(subs).forEach(arr=>arr.forEach(ws=>a[ws.id]=true))));setChk(prev=>({...prev,...a}));}} style={{...mkBtn("#f1f5f9","#475569"),padding:"4px 12px",fontSize:11}}>Select All</button>
            <button onClick={()=>setChk({})} style={{...mkBtn("#fee2e2","#dc2626"),padding:"4px 12px",fontSize:11}}>Clear</button>
          </div>
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          {Object.keys(grouped).length===0&&<div style={{color:"#94a3b8",textAlign:"center",paddingTop:40,fontSize:13}}>No worksheets match filters.</div>}
          {Object.entries(grouped).map(([subj,doms])=>{
            const sc = SUBJ_COLOR[subj]||{bg:"#f1f5f9",fg:"#475569",accent:B2};
            return(
              <div key={subj} style={{marginBottom:18}}>
                <div style={{background:sc.bg,color:sc.fg,fontSize:11,fontWeight:800,padding:"5px 12px",borderRadius:6,letterSpacing:.8,borderLeft:`4px solid ${sc.accent}`,marginBottom:8,textTransform:"uppercase"}}>{subj}</div>
                {Object.entries(doms).map(([dom,subs])=>(
                  <div key={dom} style={{marginBottom:14,marginLeft:6}}>
                    <div style={{fontSize:12,fontWeight:800,color:DOMAIN_COLOR[dom]||B2,padding:"3px 10px",background:"#f8fafc",borderRadius:5,marginBottom:6,borderLeft:`3px solid ${DOMAIN_COLOR[dom]||B2}`}}>{dom}</div>
                    {Object.entries(subs).sort((a,b)=>{const ac=a[0].startsWith("Comprehensive ")?0:1;const bc=b[0].startsWith("Comprehensive ")?0:1;return ac-bc||a[0].localeCompare(b[0]);}).map(([sub,arr])=>(
                      <div key={sub} style={{marginBottom:8,marginLeft:10}}>
                        <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.6,marginBottom:3}}>{sub}</div>
                        {arr.map(ws=>{
                          const ck=!!chk[ws.id];
                          const cnt=curStudent?.assignments?.reduce((n,a)=>n+(a.worksheets||[]).filter(w=>(w.id||w.title)===(ws.id)||w.title===ws.title).length,0)||0;
                          const lastDate = curStudent?lastAssignedDate(curStudent,ws.id):null;
                          return(
                            <div key={ws.id} onClick={()=>setChk(prev=>({...prev,[ws.id]:!prev[ws.id]}))} style={{display:"flex",alignItems:"center",padding:"6px 10px",cursor:"pointer",borderRadius:7,marginBottom:2,background:ck?"#eff6ff":"transparent",border:ck?"1.5px solid #bfdbfe":"1.5px solid transparent"}}>
                              <input type="checkbox" checked={ck} onChange={()=>{}} onClick={e=>e.stopPropagation()} style={{marginRight:9,cursor:"pointer"}}/>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:12,fontWeight:ck?700:400,color:"#1e293b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                  {ws.title}
                                  {lastDate&&<span style={{fontSize:9,color:"#fff",background:"#dc2626",padding:"1px 6px",borderRadius:4,marginLeft:6,fontWeight:800}}>✓ ASSIGNED {lastDate}</span>}
                                </div>
                              </div>
                              {ws.qs>0&&<span style={{...mkPill("#eff6ff","#1e40af"),marginRight:4}}>{ws.qs}Q</span>}
                              {cnt>0&&<span style={{...mkPill("#fef3c7","#92400e"),marginRight:4,flexShrink:0}}>×{cnt}</span>}
                              <span style={{...mkPill(DC[ws.difficulty]+"22",DC[ws.difficulty]),flexShrink:0}}>{ws.difficulty}</span>
                              {ck&&<select value={evenOdd[ws.id]||""} onChange={e=>{e.stopPropagation();setEvenOdd(prev=>({...prev,[ws.id]:e.target.value}));}} onClick={e=>e.stopPropagation()} style={{marginLeft:6,fontSize:10,padding:"2px 4px",border:"1px solid #cbd5e1",borderRadius:4}}>
                                <option value="">All</option>
                                <option value="EVEN">Even</option>
                                <option value="ODD">Odd</option>
                              </select>}
                              {timeDrill&&ck&&<input type="number" placeholder="min" min={1} max={120} value={timeLims[ws.id]||""} onChange={e=>{e.stopPropagation();setTimeLims(prev=>({...prev,[ws.id]:e.target.value}));}} onClick={e=>e.stopPropagation()} style={{width:46,marginLeft:6,border:"1.5px solid #93c5fd",borderRadius:5,padding:"3px 5px",fontSize:11,outline:"none"}}/>}
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
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <button onClick={generate} style={{...mkBtn(B2,"#fff"),padding:"13px 20px",fontSize:14,boxShadow:"0 3px 10px rgba(0,74,121,.3)"}}>⚡ Generate Assignment</button>
        <div style={{...CARD,flex:1,display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexShrink:0}}>
            <div style={{fontSize:13,fontWeight:800,color:B2}}>Output</div>
            <button onClick={copyOut} disabled={!output} style={{...mkBtn(copied?"#22c55e":"#f1f5f9",copied?"#fff":"#475569"),padding:"5px 14px",fontSize:12}}>{copied?"✓ Copied!":"📋 Copy"}</button>
          </div>
          <textarea readOnly value={output||"Generate an assignment to see output here..."} style={{flex:1,border:"1.5px solid #e2e8f0",borderRadius:8,padding:12,fontSize:11,fontFamily:"monospace",color:output?"#1e293b":"#94a3b8",resize:"none",background:"#f8fafc",lineHeight:1.6,minHeight:260}}/>
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

  return(
    <div style={{...CARD,padding:14,background:"#fafbfc",border:"1.5px solid #dbeafe"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <div style={{width:34,height:34,borderRadius:9,background:B2,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:15}}>{student.name.charAt(0).toUpperCase()}</div>
        <div>
          <div style={{fontSize:15,fontWeight:800,color:B2}}>{student.name}</div>
          <div style={{fontSize:10,color:"#64748b"}}>Quick reference while assigning</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}}>
          {diagProfile?.totalLower!=null && <Tag c="#fdf2f8" t="#be185d">Diagnostic: {diagProfile.totalLower}–{diagProfile.totalUpper}</Tag>}
          {latestPractice && <Tag c="#eff6ff" t="#1e40af">Last Exam: {latestPractice.score}</Tag>}
          <Tag c="#f1f5f9" t="#475569">{allAsg.length} session{allAsg.length!==1?"s":""}</Tag>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {/* Left: mini heat map (worksheets+WellEd) */}
        <div>
          <div style={{fontSize:9,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Coverage (worksheets + WellEd)</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:3}}>
            {ALL_DOMAINS.map(d=>{
              const total = DIFFS.reduce((n,diff)=>n+(counts[`${d}|${diff}`]||0),0);
              const short = d.replace(/Problem-Solving & Data Analysis/,"PSDA").replace(/Standard English Conventions/,"SEC").replace(/Information & Ideas/,"Info").replace(/Craft & Structure/,"C&S").replace(/Expression of Ideas/,"EOI").replace(/Advanced Math/,"Adv Math").replace(/Geometry & Trigonometry/,"Geo");
              return(
                <div key={d} title={`${d}: ${total}`} style={{background:heatCellColor(total),borderRadius:5,padding:"4px 3px",textAlign:"center"}}>
                  <div style={{fontSize:8,color:total>=3?"#fff":"#475569",fontWeight:700,lineHeight:1}}>{short}</div>
                  <div style={{fontSize:14,fontWeight:900,color:total>=3?"#fff":total>0?"#1e3a5f":"#cbd5e1"}}>{total||"·"}</div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Right: diagnostic weakest areas */}
        <div>
          <div style={{fontSize:9,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Diagnostic — Weakest Areas</div>
          {diagProfile?.subs?.length ? (
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              {[...diagProfile.subs].sort((a,b)=>(a.pct||0)-(b.pct||0)).slice(0,4).map(s=>(
                <div key={s.domain+s.name} style={{display:"flex",alignItems:"center",gap:6,fontSize:10}}>
                  <div style={{width:34,height:16,background:heatColorPct(s.pct),color:"#fff",borderRadius:3,fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{s.pct}%</div>
                  <div style={{flex:1,color:"#475569",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>No diagnostic uploaded yet</div>
          )}
        </div>
      </div>

      {/* Last PSM set */}
      {lastAsg && <div style={{marginTop:10,paddingTop:10,borderTop:"1px dashed #cbd5e1"}}>
        <div style={{fontSize:9,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Last PSM Set — {lastAsg.date}</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
          {(lastAsg.worksheets||[]).slice(0,6).map((w,i)=>(
            <span key={i} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:5,padding:"2px 7px",fontSize:10,color:"#475569"}}>{w.title}</span>
          ))}
          {(lastAsg.worksheets||[]).length>6 && <span style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>+{lastAsg.worksheets.length-6} more</span>}
          {(lastAsg.welledDomain||[]).map((w,i)=>(
            <span key={`w${i}`} style={{background:"#ecfdf5",border:"1px solid #a7f3d0",color:"#065f46",borderRadius:5,padding:"2px 7px",fontSize:10}}>{w.label}</span>
          ))}
          {(lastAsg.practiceExams||[]).map((ex,i)=>(
            <span key={`p${i}`} style={{background:"#eff6ff",border:"1px solid #bfdbfe",color:"#1e40af",borderRadius:5,padding:"2px 7px",fontSize:10}}>📘 {ex.platform} #{ex.number}</span>
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
      <input placeholder="🔍 Search vocab sets..." value={search} onChange={e=>setSearch(e.target.value)} style={{...INP,fontSize:11,marginBottom:6}}/>
      <div style={{maxHeight:240,overflowY:"auto",border:"1px solid #e9d5ff",borderRadius:6,padding:6}}>
        {sets.map(name=>{
          const flashId = `VF|${name}`;
          const expanded = show[name];
          return(
            <div key={name} style={{marginBottom:5,background:expanded?"#faf5ff":"transparent",borderRadius:5,padding:4}}>
              <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}>
                <input type="checkbox" checked={!!vocabChk[flashId]} onChange={()=>setVocabChk(prev=>({...prev,[flashId]:!prev[flashId]}))}/>
                <span style={{flex:1,fontWeight:600,color:"#581c87"}}>{name}</span>
                <button onClick={()=>setShow(prev=>({...prev,[name]:!prev[name]}))} style={{background:"none",border:"1px solid #d8b4fe",borderRadius:4,padding:"1px 6px",fontSize:9,color:"#7c3aed",cursor:"pointer"}}>{expanded?"−":"Quiz"}</button>
              </div>
              {expanded&&<div style={{display:"flex",gap:4,marginTop:4,marginLeft:20}}>
                {[1,2,3,4].map(v=>{
                  const qid = `VQ|${name}|${v}`;
                  const ck=!!vocabChk[qid];
                  return <button key={v} onClick={()=>setVocabChk(prev=>({...prev,[qid]:!prev[qid]}))} style={{background:ck?"#7c3aed":"#f3e8ff",color:ck?"#fff":"#7c3aed",border:"none",borderRadius:4,padding:"3px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>Q{v}</button>;
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
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <div style={{fontSize:20,fontWeight:800,color:B2}}>Students</div>
        <button onClick={()=>setShowAdd(!showAdd)} style={{...mkBtn(B2,"#fff")}}>+ Add Student</button>
      </div>
      {showAdd&&(
        <div style={{...CARD,maxWidth:520,marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:800,color:B2,marginBottom:14}}>New Student</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            {[["name","Student Name *","e.g. Jane Smith"],["grade","Grade Level","e.g. 11th"],["tutor","Assigned Tutor","Tutor name"],["notes","Notes","Optional info"]].map(([k,label,ph])=>(
              <div key={k}>
                <div style={{fontSize:10,color:"#64748b",marginBottom:4,fontWeight:600}}>{label}</div>
                <input value={newS[k]} onChange={e=>setNewS(prev=>({...prev,[k]:e.target.value}))} placeholder={ph} style={INP}/>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={addStudent} style={{...mkBtn(B2,"#fff")}}>Add Student</button>
            <button onClick={()=>setShowAdd(false)} style={{...mkBtn("#f1f5f9","#475569")}}>Cancel</button>
          </div>
        </div>
      )}
      {students.length===0?(
        <div style={{...CARD,padding:50,textAlign:"center",color:"#94a3b8"}}><div style={{fontSize:32,marginBottom:8}}>👤</div><div style={{fontSize:16,fontWeight:600}}>No students enrolled yet</div></div>
      ):(
        <div style={{...CARD,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{background:B2,color:"#fff"}}>{["Name","Grade","Tutor","Date Added","Worksheets","Diagnostics","Actions"].map(h=><th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:11,fontWeight:700}}>{h}</th>)}</tr></thead>
            <tbody>
              {students.map((st,i)=>{
                const wsCnt=(st.assignments||[]).reduce((n,a)=>n+(a.worksheets||[]).length,0);
                const dCnt=(st.diagnostics||[]).length;
                return(
                  <tr key={st.id} style={{borderBottom:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc"}}>
                    <td style={{padding:"11px 14px",fontWeight:700,color:B2,fontSize:14}}>{st.name}</td>
                    <td style={{padding:"11px 14px",fontSize:13,color:"#475569"}}>{st.grade||"—"}</td>
                    <td style={{padding:"11px 14px",fontSize:13,color:"#475569"}}>{st.tutor||"—"}</td>
                    <td style={{padding:"11px 14px",fontSize:12,color:"#94a3b8"}}>{st.dateAdded}</td>
                    <td style={{padding:"11px 14px"}}><Tag c="#eff6ff" t="#1d4ed8">{wsCnt} worksheets</Tag></td>
                    <td style={{padding:"11px 14px"}}><Tag c={dCnt?"#f0fdf4":"#f1f5f9"} t={dCnt?"#15803d":"#94a3b8"}>{dCnt} reports</Tag></td>
                    <td style={{padding:"11px 14px"}}><div style={{display:"flex",gap:6}}><button onClick={()=>openProfile(st)} style={{...mkBtn("#eff6ff",B2),padding:"4px 12px",fontSize:12}}>Profile</button><button onClick={()=>delStudent(st.id)} style={{...mkBtn("#fee2e2","#dc2626"),padding:"4px 10px",fontSize:12}}>✕</button></div></td>
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
function StudentProfile({p,setProfile,ptab,setPtab,paChk,setPaChk,paSubj,setPaSubj,paSrch,setPaSrch,savePreAssign,sfm,setSfm,addScore,delScore,delAsg,setExamScore,setWelledDomainScore,handleDiagUpload,clearDiagnostics,diagInputRef,diagProfile}){
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
      {/* HEADER */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <button onClick={()=>setProfile(null)} style={{...mkBtn("#f1f5f9","#475569"),padding:"5px 12px"}}>← Back</button>
        <div style={{width:44,height:44,borderRadius:12,background:B2,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:18,fontWeight:700}}>{p.name.charAt(0).toUpperCase()}</div>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:B2}}>{p.name}</div>
          <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
            {p.grade&&<Tag c="#eff6ff" t="#1d4ed8">Grade {p.grade}</Tag>}
            {p.tutor&&<Tag c="#f0fdf4" t="#15803d">📐 {p.tutor}</Tag>}
            <Tag c="#f1f5f9" t="#475569">Since {p.dateAdded}</Tag>
            {p.notes&&<Tag c="#fffbeb" t="#92400e">📝 {p.notes}</Tag>}
          </div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:10}}>
          {[[(p.assignments||[]).reduce((n,a)=>n+(a.worksheets||[]).length,0),"Worksheets","#eff6ff",B2],[(p.diagnostics||[]).length,"Diagnostics","#fdf2f8","#be185d"],[(p.assignments||[]).length,"Sessions","#fefce8","#92400e"]].map(([v,l,bg,fg])=>(
            <div key={l} style={{textAlign:"center",background:bg,borderRadius:10,padding:"8px 16px"}}>
              <div style={{fontWeight:800,color:fg,fontSize:20}}>{v}</div>
              <div style={{color:"#64748b",fontSize:10}}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* TABS */}
      <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:"2px solid #e2e8f0",flexWrap:"wrap"}}>
        {[{id:"history",icon:"📋",label:"Assignment History"},{id:"diagnostics",icon:"🔬",label:"Diagnostics"},{id:"preassign",icon:"✅",label:"Pre-Assign"},{id:"scores",icon:"📊",label:"WellEd Scores"}].map(pt=>(
          <button key={pt.id} onClick={()=>setPtab(pt.id)} style={{border:"none",background:"none",cursor:"pointer",padding:"10px 18px",fontSize:13,fontWeight:ptab===pt.id?700:500,color:ptab===pt.id?B2:"#64748b",borderBottom:ptab===pt.id?`3px solid ${B2}`:"3px solid transparent",marginBottom:-2,display:"flex",alignItems:"center",gap:6}}>
            {pt.icon} {pt.label}
          </button>
        ))}
      </div>

      {/* ASSIGNMENT HISTORY */}
      {ptab==="history"&&(
        <div>
          {(!p.assignments||p.assignments.length===0)?(
            <div style={{...CARD,padding:40,textAlign:"center",color:"#94a3b8"}}>No assignments recorded yet.</div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[...p.assignments].reverse().map(asg=>(
                <div key={asg.id} style={{...CARD}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontWeight:700,color:B2,fontSize:14}}>{asg.date}</span>
                      {asg.preAssigned&&<Tag c="#fef3c7" t="#92400e">PRE-EXISTING</Tag>}
                      {asg.examType&&asg.examType!=="SAT"&&<Tag c="#f3e8ff" t="#7c3aed">{asg.examType}</Tag>}
                      {asg.timeDrill&&<Tag c="#eff6ff" t="#1d4ed8">⏱ TIMED</Tag>}
                      {asg.oneNote&&<Tag c="#f0fdf4" t="#15803d">📝 ONENOTE</Tag>}
                      <span style={mkPill("#f1f5f9","#64748b")}>{(asg.worksheets||[]).length} worksheet{(asg.worksheets||[]).length!==1?"s":""}</span>
                    </div>
                    <button onClick={()=>delAsg(asg.id)} style={{...mkBtn("#fee2e2","#dc2626"),padding:"3px 10px",fontSize:11}}>✕ Remove</button>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                    {(asg.worksheets||[]).map(ws=>(
                      <span key={ws.id||ws.title} style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:6,padding:"3px 9px",fontSize:11,color:"#475569"}}>{ws.title||ws.name} {ws.evenOdd&&<em style={{color:"#7c3aed"}}>({ws.evenOdd})</em>} <span style={{color:DC[ws.difficulty],fontSize:9,fontWeight:700}}>({ws.difficulty})</span></span>
                    ))}
                  </div>
                  {(asg.welledDomain||[]).length>0&&<div style={{marginTop:8,padding:8,background:"#f0fdf4",borderRadius:6}}>
                    <div style={{fontSize:10,fontWeight:800,color:"#065f46",marginBottom:4}}>WELLED DOMAIN ASSIGNMENTS</div>
                    {asg.welledDomain.map((i,idx)=>{
                      const wMax = i.subject==="Math"?22:27;
                      return(
                      <div key={idx} style={{display:"flex",alignItems:"center",gap:8,fontSize:11,marginBottom:4}}>
                        <span style={{flex:1,color:"#065f46",fontWeight:600}}>{i.label}</span>
                        <span style={{fontSize:10,color:"#94a3b8"}}>Score:</span>
                        <input type="number" min="0" max={wMax} placeholder="0" value={i.score||""} onChange={e=>setWelledDomainScore(asg.id,idx,e.target.value)} style={{width:50,padding:"3px 6px",border:"1px solid #86efac",borderRadius:4,fontSize:11,textAlign:"right"}}/>
                        <span style={{fontSize:10,color:"#065f46",fontWeight:700,minWidth:24}}>/{wMax}</span>
                      </div>
                    );})}
                  </div>}
                  {(asg.vocab||[]).length>0&&<div style={{marginTop:8,padding:8,background:"#faf5ff",borderRadius:6}}>
                    <div style={{fontSize:10,fontWeight:800,color:"#6b21a8",marginBottom:4}}>VOCAB</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                      {asg.vocab.map((v,idx)=><span key={idx} style={{background:"#f3e8ff",color:"#6b21a8",padding:"2px 8px",borderRadius:4,fontSize:11}}>{v.label}</span>)}
                    </div>
                  </div>}
                  {(asg.practiceExams||[]).length>0&&<div style={{marginTop:8,padding:8,background:"#eff6ff",borderRadius:6}}>
                    <div style={{fontSize:10,fontWeight:800,color:"#1e40af",marginBottom:4}}>PRACTICE EXAMS</div>
                    {asg.practiceExams.map((ex,idx)=>{
                      const isFull = ex.type!=="section";
                      const rw = ex.rwScore||"", math = ex.mathScore||"";
                      const total = (Number(rw)||0)+(Number(math)||0);
                      return(
                      <div key={idx} style={{display:"flex",alignItems:"center",gap:8,fontSize:11,marginBottom:6,flexWrap:"wrap"}}>
                        <span style={{flex:"1 1 180px",fontWeight:600,color:"#1e40af"}}>📘 {ex.platform} Practice Test #{ex.number||"?"}{isFull?"":" (Section)"}</span>
                        {isFull ? (<>
                          <span style={{fontSize:10,color:"#94a3b8"}}>R&amp;W:</span>
                          <input type="number" min="0" max="800" placeholder="0" value={rw} onChange={e=>setExamScore(asg.id,idx,{rwScore:e.target.value})} style={{width:56,padding:"3px 6px",border:"1px solid #93c5fd",borderRadius:4,fontSize:11,textAlign:"right"}}/>
                          <span style={{fontSize:10,color:"#1e40af",fontWeight:700}}>/800</span>
                          <span style={{fontSize:10,color:"#94a3b8"}}>Math:</span>
                          <input type="number" min="0" max="800" placeholder="0" value={math} onChange={e=>setExamScore(asg.id,idx,{mathScore:e.target.value})} style={{width:56,padding:"3px 6px",border:"1px solid #93c5fd",borderRadius:4,fontSize:11,textAlign:"right"}}/>
                          <span style={{fontSize:10,color:"#1e40af",fontWeight:700}}>/800</span>
                          {(rw||math) && <span style={{fontSize:11,fontWeight:800,color:"#1e40af",marginLeft:4}}>= {total}/1600</span>}
                        </>) : (<>
                          <select value={ex.sectionSubject||""} onChange={e=>setExamScore(asg.id,idx,{sectionSubject:e.target.value})} style={{padding:"3px 6px",border:"1px solid #93c5fd",borderRadius:4,fontSize:11}}>
                            <option value="">Section…</option>
                            <option value="R&W">R&amp;W</option>
                            <option value="Math">Math</option>
                          </select>
                          <span style={{fontSize:10,color:"#94a3b8"}}>Score:</span>
                          <input type="number" min="0" max="800" placeholder="0" value={ex.score||""} onChange={e=>setExamScore(asg.id,idx,{score:e.target.value})} style={{width:56,padding:"3px 6px",border:"1px solid #93c5fd",borderRadius:4,fontSize:11,textAlign:"right"}}/>
                          <span style={{fontSize:10,color:"#1e40af",fontWeight:700}}>/800</span>
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
          <div style={{...CARD,marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:B2,marginBottom:4}}>🔬 Diagnostic Reports</div>
                <div style={{fontSize:12,color:"#64748b"}}>Upload ZipGrade SAT Diagnostic PDFs (Reading, Math Mod 1, Math Mod 2). The parser extracts domain &amp; subdomain scores automatically.</div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <input ref={diagInputRef} type="file" multiple accept="application/pdf" onChange={e=>handleDiagUpload(e.target.files)} style={{display:"none"}}/>
                <button onClick={()=>diagInputRef.current?.click()} style={{...mkBtn(B2,"#fff")}}>📄 Upload PDF(s)</button>
                {(p.diagnostics||[]).length>0&&<button onClick={clearDiagnostics} style={{...mkBtn("#fee2e2","#dc2626")}}>Clear</button>}
              </div>
            </div>
          </div>

          {(!p.diagnostics||p.diagnostics.length===0)?(
            <div style={{...CARD,padding:40,textAlign:"center",color:"#94a3b8"}}>
              <div style={{fontSize:32,marginBottom:8}}>🔬</div>
              <div style={{fontSize:14,fontWeight:600}}>No diagnostic reports uploaded yet</div>
              <div style={{fontSize:12,marginTop:4}}>Upload the student's ZipGrade SAT Diagnostic PDFs to see their domain/subdomain breakdown.</div>
            </div>
          ):(<>
            {/* Report list */}
            <div style={{...CARD,marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:800,color:B2,marginBottom:10}}>Uploaded Reports</div>
              {p.diagnostics.map((r,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",background:i%2===0?"#f8fafc":"#fff",borderRadius:5,marginBottom:3,fontSize:12}}>
                  <span style={{fontWeight:700,color:B2}}>📄 {r.fileName}</span>
                  <Tag c="#eff6ff" t="#1d4ed8">{r.subject}</Tag>
                  <span style={{marginLeft:"auto",color:"#475569"}}>{r.earned}/{r.possible} ({r.percentCorrect}%)</span>
                  <span style={{color:"#94a3b8",fontSize:10}}>{r.tags?.length||0} tags</span>
                </div>
              ))}
            </div>

            {/* Domain heat map */}
            {diagProfile&&<div style={{...CARD,marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:800,color:B2,marginBottom:10}}>📊 Diagnostic Performance Heat Map</div>
              <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>Use this to inform what to assign. Red = weakest areas.</div>
              {diagProfile.domains.length>0&&<div style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:800,color:"#475569",marginBottom:6}}>DOMAINS</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:6}}>
                  {diagProfile.domains.sort((a,b)=>(a.pct||0)-(b.pct||0)).map(d=>(
                    <div key={d.name} style={{background:heatColorPct(d.pct),color:"#fff",padding:"8px 12px",borderRadius:7}}>
                      <div style={{fontSize:10,opacity:.85,fontWeight:600}}>{d.name}</div>
                      <div style={{fontSize:18,fontWeight:800}}>{d.pct}%</div>
                      <div style={{fontSize:10,opacity:.85}}>{d.earn}/{d.poss} correct</div>
                    </div>
                  ))}
                </div>
              </div>}
              {diagProfile.subs.length>0&&<div>
                <div style={{fontSize:11,fontWeight:800,color:"#475569",marginBottom:6}}>SUBSKILLS</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:5}}>
                  {diagProfile.subs.sort((a,b)=>(a.pct||0)-(b.pct||0)).map(s=>(
                    <div key={s.domain+s.name} style={{background:"#fff",border:`2px solid ${heatColorPct(s.pct)}`,padding:"6px 10px",borderRadius:6}}>
                      <div style={{fontSize:9,color:"#94a3b8",fontWeight:700,textTransform:"uppercase"}}>{s.domain}</div>
                      <div style={{fontSize:11,fontWeight:700,color:"#1e293b"}}>{s.name}</div>
                      <div style={{fontSize:14,fontWeight:800,color:heatColorPct(s.pct)}}>{s.pct}% <span style={{fontSize:10,color:"#94a3b8",fontWeight:500}}>({s.earn}/{s.poss})</span></div>
                    </div>
                  ))}
                </div>
              </div>}
            </div>}
          </>)}
        </div>
      )}

      {/* PRE-ASSIGN */}
      {ptab==="preassign"&&(
        <div>
          <div style={{background:"#fffbeb",border:"1.5px solid #fcd34d",borderRadius:10,padding:12,marginBottom:14,fontSize:13,color:"#92400e"}}>
            💡 <strong>Pre-Assign Panel</strong> — Mark worksheets already given before this student was added. Previously-assigned worksheets still show so you can assign them again.
          </div>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
            {["All","Reading & Writing","Math"].map(s=>(
              <button key={s} onClick={()=>setPaSubj(s)} style={{...mkBtn(paSubj===s?B2:"#f1f5f9",paSubj===s?"#fff":"#475569"),padding:"5px 14px",fontSize:12}}>{s==="Reading & Writing"?"R&W":s}</button>
            ))}
            <input placeholder="🔍 Search..." value={paSrch} onChange={e=>setPaSrch(e.target.value)} style={{...INP,width:180}}/>
            <span style={{fontSize:12,color:"#64748b",marginLeft:"auto"}}>{Object.values(paChk).filter(Boolean).length} selected</span>
          </div>
          <div style={{...CARD,maxHeight:500,overflowY:"auto"}}>
            {paGrouped.map(g=>(
              <div key={`${g.subject}|${g.domain}|${g.subdomain}`} style={{marginBottom:14}}>
                <div style={{fontSize:10,fontWeight:800,color:DOMAIN_COLOR[g.domain]||B2,textTransform:"uppercase",letterSpacing:.6,padding:"3px 10px",background:"#f8fafc",borderRadius:5,marginBottom:6,borderLeft:`3px solid ${DOMAIN_COLOR[g.domain]||B2}`}}>
                  {g.subject} › {g.domain} › {g.subdomain}
                </div>
                {g.sheets.map(ws=>{
                  const alreadyAsg = (p.assignments||[]).find(a=>(a.worksheets||[]).some(w=>(w.id||w.title)===ws.id||w.title===ws.title));
                  const lastDate = alreadyAsg?.date;
                  return(
                    <div key={ws.id} onClick={()=>setPaChk(prev=>({...prev,[ws.id]:!prev[ws.id]}))} style={{display:"flex",alignItems:"center",padding:"6px 10px",cursor:"pointer",borderRadius:7,marginBottom:2,background:paChk[ws.id]?"#f0fdf4":alreadyAsg?"#fefce8":"transparent",border:paChk[ws.id]?"1.5px solid #86efac":alreadyAsg?"1.5px solid #fde68a":"1.5px solid transparent"}}>
                      <input type="checkbox" checked={!!paChk[ws.id]} onChange={()=>{}} onClick={e=>e.stopPropagation()} style={{marginRight:9,cursor:"pointer"}}/>
                      <span style={{fontSize:12,flex:1,color:"#1e293b"}}>{ws.title} {alreadyAsg&&<span style={{fontSize:9,marginLeft:8,color:"#a16207",fontWeight:800,background:"#fef3c7",padding:"1px 6px",borderRadius:4}}>✓ ASSIGNED {lastDate}</span>}</span>
                      {ws.qs>0&&<span style={{...mkPill("#eff6ff","#1e40af"),marginRight:5}}>{ws.qs}Q</span>}
                      <span style={{fontSize:10,color:DC[ws.difficulty],fontWeight:700}}>{ws.difficulty}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{marginTop:12,display:"flex",gap:8}}>
            <button onClick={savePreAssign} style={{...mkBtn(B2,"#fff"),padding:"9px 20px"}}>✅ Save Pre-Assigned ({Object.values(paChk).filter(Boolean).length} selected)</button>
            <button onClick={()=>setPaChk({})} style={{...mkBtn("#f1f5f9","#475569")}}>Clear</button>
          </div>
        </div>
      )}

      {/* SCORES */}
      {ptab==="scores"&&(
        <div style={{display:"grid",gridTemplateColumns:"310px 1fr",gap:16}}>
          <div style={{...CARD}}>
            <div style={{fontSize:14,fontWeight:800,color:B2,marginBottom:14}}>Add Score</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div><div style={{fontSize:10,color:"#64748b",marginBottom:4,fontWeight:600}}>DATE</div><input type="date" value={sfm.date} onChange={e=>setSfm(prev=>({...prev,date:e.target.value}))} style={INP}/></div>
              <div>
                <div style={{fontSize:10,color:"#64748b",marginBottom:4,fontWeight:600}}>TEST / SECTION</div>
                <select value={sfm.testType} onChange={e=>setSfm(prev=>({...prev,testType:e.target.value}))} style={INP}>
                  <option value="">Select test type…</option>
                  <optgroup label="Reading & Writing">
                    <option>R&amp;W — Information & Ideas</option>
                    <option>R&amp;W — Craft & Structure</option>
                    <option>R&amp;W — Expression of Ideas</option>
                    <option>R&amp;W — Standard English Conventions</option>
                    <option>R&amp;W — Full Section</option>
                  </optgroup>
                  <optgroup label="Math">
                    <option>Math — Algebra</option>
                    <option>Math — Advanced Math</option>
                    <option>Math — Problem-Solving & Data Analysis</option>
                    <option>Math — Geometry & Trigonometry</option>
                    <option>Math — Full Section</option>
                  </optgroup>
                  <optgroup label="Full Practice Tests">
                    <option>WellEd Full Practice Test</option>
                    <option>BlueBook Full Practice Test</option>
                    <option>Official SAT / PSAT</option>
                  </optgroup>
                  <option value="Other">Other (see notes)</option>
                </select>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div><div style={{fontSize:10,color:"#64748b",marginBottom:4,fontWeight:600}}>SCORE</div><input type="number" value={sfm.score} onChange={e=>setSfm(prev=>({...prev,score:e.target.value}))} placeholder="e.g. 650" style={INP}/></div>
                <div><div style={{fontSize:10,color:"#64748b",marginBottom:4,fontWeight:600}}>MAX SCORE</div><input type="number" value={sfm.maxScore} onChange={e=>setSfm(prev=>({...prev,maxScore:e.target.value}))} placeholder="e.g. 800" style={INP}/></div>
              </div>
              <div><div style={{fontSize:10,color:"#64748b",marginBottom:4,fontWeight:600}}>NOTES</div><input value={sfm.notes} onChange={e=>setSfm(prev=>({...prev,notes:e.target.value}))} placeholder="Optional notes…" style={INP}/></div>
              <button onClick={addScore} style={{...mkBtn(B2,"#fff"),padding:10,fontSize:13}}>+ Add Score</button>
            </div>
          </div>
          <div style={{...CARD}}>
            <div style={{fontSize:14,fontWeight:800,color:B2,marginBottom:14}}>Score History</div>
            {(!p.scores||p.scores.length===0)?(
              <div style={{color:"#94a3b8",textAlign:"center",paddingTop:30,fontSize:13}}>No scores yet.</div>
            ):(
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{background:"#f1f5f9"}}>{["Date","Test / Section","Score","Max","%","Notes",""].map(h=><th key={h} style={{padding:"7px 11px",textAlign:"left",fontSize:10,color:"#64748b",fontWeight:700}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {[...p.scores].sort((a,b)=>b.date.localeCompare(a.date)).map(sc=>{
                      const pct=sc.maxScore?Math.round((Number(sc.score)/Number(sc.maxScore))*100):null;
                      return(
                        <tr key={sc.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                          <td style={{padding:"8px 11px",color:"#475569"}}>{sc.date}</td>
                          <td style={{padding:"8px 11px",fontWeight:700,color:B2}}>{sc.testType}</td>
                          <td style={{padding:"8px 11px",fontWeight:800,fontSize:14}}>{sc.score}</td>
                          <td style={{padding:"8px 11px",color:"#94a3b8"}}>{sc.maxScore||"—"}</td>
                          <td style={{padding:"8px 11px"}}>{pct!==null&&<span style={mkPill(pct>=75?"#f0fdf4":pct>=60?"#fffbeb":"#fef2f2",pct>=75?"#15803d":pct>=60?"#92400e":"#dc2626")}>{pct}%</span>}</td>
                          <td style={{padding:"8px 11px",color:"#94a3b8",fontSize:11}}>{sc.notes||"—"}</td>
                          <td style={{padding:"8px 11px"}}><button onClick={()=>delScore(sc.id)} style={{...mkBtn("#fee2e2","#dc2626"),padding:"2px 9px",fontSize:11}}>✕</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
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
const heatCellColor = (v)=>{
  if(!v) return "#f1f5f9";
  if(v>=10) return "#1d4ed8";
  if(v>=6)  return "#3b82f6";
  if(v>=3)  return "#60a5fa";
  return "#bfdbfe";
};
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
  const diffColor = {easy:"#16a34a",medium:"#d97706",hard:"#dc2626",comprehensive:"#7c3aed"};

  return(
    <div>
      <div style={{fontSize:20,fontWeight:800,color:B2,marginBottom:4}}>Assignment Coverage Heat Map</div>
      <div style={{fontSize:13,color:"#64748b",marginBottom:14}}>Counts only worksheets &amp; WellEd domain assignments. Split by difficulty.</div>

      {students.length===0 ? (
        <div style={{...CARD,padding:40,textAlign:"center",color:"#94a3b8"}}>No students enrolled yet.</div>
      ) : (<>
        <div style={{...CARD,marginBottom:14,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#64748b"}}>STUDENT</div>
          <select value={selSt} onChange={e=>setSelSt(e.target.value)} style={{...INP,width:260}}>
            {students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {st && <button onClick={()=>openProfile(st)} style={{...mkBtn("#eff6ff",B2),padding:"6px 14px",fontSize:12}}>View Profile</button>}
          <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center",fontSize:11,color:"#475569"}}>
            <span>Low</span>{["#f1f5f9","#bfdbfe","#60a5fa","#3b82f6","#1d4ed8"].map((c,i)=><div key={i} style={{width:20,height:20,borderRadius:4,background:c,border:"1px solid #e2e8f0"}}/>)}<span>High</span>
          </div>
        </div>

        {/* Practice Exam counts (non-colored) */}
        <div style={{...CARD,marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:800,color:B2,marginBottom:10}}>Practice Exams Assigned</div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {[["Full",pract.full,"📘"],["Math Only",pract.math,"🧮"],["Reading Only",pract.reading,"📖"]].map(([l,v,icon])=>(
              <div key={l} style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"12px 20px",minWidth:140}}>
                <div style={{fontSize:11,color:"#64748b",fontWeight:700}}>{icon} {l}</div>
                <div style={{fontSize:26,fontWeight:900,color:B2,marginTop:4}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 4 heat maps by difficulty */}
        {DIFFS.map(d=>{
          const total = ALL_DOMAINS.reduce((n,dom)=>n+(counts[`${dom}|${d}`]||0),0);
          return(
            <div key={d} style={{...CARD,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <div style={{width:6,height:22,background:diffColor[d],borderRadius:3}}/>
                <div style={{fontSize:14,fontWeight:800,color:B2}}>{diffLabel[d]} Difficulty</div>
                <Tag c="#f1f5f9" t="#64748b">{total} assigned</Tag>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(8, 1fr)",gap:6}}>
                {ALL_DOMAINS.map(dom=>{
                  const v = counts[`${dom}|${d}`]||0;
                  const isRW = DOMAINS_RW.includes(dom);
                  return(
                    <div key={dom} style={{background:heatCellColor(v),borderRadius:8,padding:"10px 8px",textAlign:"center",border:`2px solid ${isRW?"#6366f1":"#06b6d4"}`,minHeight:72,display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
                      <div style={{fontSize:9,fontWeight:700,color:v>=3?"#fff":"#475569",lineHeight:1.2}}>{dom}</div>
                      <div style={{fontSize:20,fontWeight:900,color:v>=3?"#fff":v>0?"#1e3a5f":"#cbd5e1"}}>{v||"·"}</div>
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
      pts.push({date:dd,category:`${d.subject} — ${d.name}`,subcategory:d.name,score:d.earn,max:d.poss,source:"diagnostic",pct:d.pct});
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
        pts.push({date:a.date,category:cat,subcategory:w.domain,score:Number(w.score)||0,max:w.qs||(w.subject==="Math"?22:27),source:"history_welled",difficulty:w.difficulty});
      }
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
      <div style={{fontSize:20,fontWeight:800,color:B2,marginBottom:4}}>Score Tracking Overview</div>
      <div style={{fontSize:13,color:"#64748b",marginBottom:16}}>Diagnostic results, manual scores, and scores entered in assignment history. Domains split by E/M/H.</div>

      {students.length===0 ? (
        <div style={{...CARD,padding:50,textAlign:"center",color:"#94a3b8"}}>No students enrolled yet.</div>
      ) : (<>
        <div style={{...CARD,marginBottom:14,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#64748b"}}>STUDENT</div>
          <select value={selSt} onChange={e=>setSelSt(e.target.value)} style={{...INP,width:260}}>
            {students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {st && <button onClick={()=>openProfile(st)} style={{...mkBtn("#eff6ff",B2),padding:"6px 14px",fontSize:12}}>View Profile</button>}
          <div style={{marginLeft:"auto",fontSize:11,color:"#64748b"}}>{pts.length} data points</div>
        </div>

        {pts.length===0 ? (
          <div style={{...CARD,padding:40,textAlign:"center",color:"#94a3b8"}}>
            <div style={{fontSize:28,marginBottom:8}}>📊</div>
            <div style={{fontSize:14,fontWeight:600}}>No scores recorded yet for {st?.name||"this student"}</div>
            <div style={{fontSize:12,marginTop:4}}>Upload a diagnostic PDF or enter scores in assignment history to populate this view.</div>
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
              const pColor = lastPct===null?"#64748b":lastPct>=75?"#15803d":lastPct>=60?"#d97706":"#dc2626";
              const diffColor = {easy:"#16a34a",medium:"#d97706",hard:"#dc2626",comprehensive:"#7c3aed"};
              const accent = grp.difficulty && diffColor[grp.difficulty] ? diffColor[grp.difficulty] : B2;
              return(
                <div key={grp.key} style={{background:"#f8fafc",borderRadius:10,padding:14,border:"1.5px solid #e2e8f0",position:"relative",overflow:"hidden"}}>
                  <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:accent}}/>
                  <div style={{fontSize:10,fontWeight:800,color:"#475569",textTransform:"uppercase",letterSpacing:.6,marginBottom:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{grp.key}</div>
                  <div style={{fontSize:22,fontWeight:900,color:B2,lineHeight:1}}>{last.score}{last.max?<span style={{fontSize:13,color:"#94a3b8",fontWeight:600}}>/{last.max}</span>:null}</div>
                  {lastPct!=null && <div style={{fontSize:12,color:pColor,fontWeight:700,marginTop:3}}>{lastPct}%</div>}
                  {delta!=null && sorted.length>1 && <div style={{fontSize:11,color:delta>0?"#15803d":delta<0?"#dc2626":"#64748b",marginTop:4,fontWeight:600}}>{delta>0?"▲ +":delta<0?"▼ ":"→ "}{Math.abs(delta)}% since first</div>}
                  <div style={{fontSize:9,color:"#94a3b8",marginTop:6}}>{sorted.length} data point{sorted.length!==1?"s":""} · Latest {last.date}</div>
                  {grp.source==="diagnostic" && first===last && <div style={{fontSize:9,color:"#be185d",marginTop:3,fontWeight:700}}>DIAGNOSTIC BASELINE</div>}
                </div>
              );
            })}
          </div>
        )}
      </>)}
    </div>
  );
}
