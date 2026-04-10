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
const INTRO_A = `The recording of today's session has been posted on Wise. Please complete the following worksheets using the PSM instructions posted in the PSMs modules.`;
const INTRO_B = `Important Reminder: Please book your next session in advance, timing it for when you expect to have these PSMs completed. After completing the worksheets, check and mark your work according to the PSM instructions, then upload your marked work as a comment to this PSMs assignment.`;
const ONENOTE_TXT = `OneNote Instructions: Printouts of the worksheet have been added to the next session's page on OneNote for you to complete all of your work/annotations on. Please complete all of your work in black ink and check all answers with the answer keys provided below. Please use red ink for marks on your paper (correct/incorrect) and for stars on questions you had trouble on. Please make sure to leave room for us to work through problems you miss on each page.`;
const WED_TXT = `WellEd Labs Domain Assignment Instructions: Please complete assigned domain assignments on WellEd Labs. Use the instructions for WellEd Labs practice exams located in your Wise "Full Practice Exam Instructions" Module to login to the platform and make sure to toggle the assignments section in the top right of the page, so that you see the topic-specific assignments you are to complete.  https://ats.practicetest.io/sign-in`;
const VOCAB_TXT = `WellEd Labs Vocab Instructions: Please complete assigned vocab flashcards and/or quizzes on WellEd Labs. Login to the platform using the instructions in your Wise "Full Practice Exam Instructions" Module and toggle to the Vocab section in the top right of the page, so that you see the vocab sets and quizzes you are to complete.  https://ats.practicetest.io/sign-in`;
const TIME_TXT = `Time Drilling Instructions: Time limits are indicated in parentheses before each worksheet name. Please set a timer for the allotted minutes before beginning each worksheet and stop working when time expires. Mark any unfinished questions clearly so we can discuss them in the next session.`;

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

/* ============ PDF DIAGNOSTIC PARSER ============ */
// Parses a ZipGrade SAT Diagnostic PDF, extracting the "Tag Name / Earn / Poss / %"
// table at the end which contains domain + subdomain scores.
async function parseDiagnosticPdf(file){
  if(!window.pdfjsLib) throw new Error("pdf.js not loaded");
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({data:buf}).promise;
  let fullText = "";
  for(let p=1;p<=pdf.numPages;p++){
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    // Sort by y then x so we get readable line order
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
  // Determine quiz type from title
  const isReading = /READING/i.test(fullText);
  const isMath = /MATH/i.test(fullText);
  const subject = isReading?"Reading & Writing":(isMath?"Math":"Unknown");
  // Extract percent correct
  const pctMatch = fullText.match(/Percent\s*Correct:?\s*([\d.]+)/i);
  const earnedMatch = fullText.match(/Earned\s*Points:?\s*(\d+)/i);
  const possMatch = fullText.match(/Possible\s*Points:?\s*(\d+)/i);
  // Extract tag rows: lines after "TAGGED QUESTIONS & QUIZ"
  const tagSection = fullText.split(/TAGGED\s*QUESTIONS\s*&\s*QUIZ/i)[1] || "";
  // Pattern: <tag name> <earn> <poss> <%>
  // The name may span lines; easier to use regex across whole section
  const rows = [];
  // Match: !SAT <name> <earn> <poss> <pct>  (where pct may be float)
  const rx = /(!?SAT\s[^\n]*?)\s+(\d+)\s+(\d+)\s+([\d.]+)/g;
  let m;
  const cleaned = tagSection.replace(/\s+/g," ");
  while((m = rx.exec(cleaned))!==null){
    const rawName = m[1].replace(/^!SAT\s*/,"").replace(/\s*\(2024\)\s*$/,"").trim();
    rows.push({tag:rawName,earn:Number(m[2]),poss:Number(m[3]),pct:Number(m[4])});
  }
  return {
    subject,
    percentCorrect: pctMatch?Number(pctMatch[1]):null,
    earned: earnedMatch?Number(earnedMatch[1]):null,
    possible: possMatch?Number(possMatch[1]):null,
    tags: rows,
    parsedAt: todayStr(),
    fileName: file.name,
  };
}

// Map parsed tag names to canonical domain/subdomain in our catalog
const TAG_MAP = {
  // Reading & Writing — domains
  "Craft & Structure":{subject:"Reading & Writing",kind:"domain",name:"Craft & Structure"},
  "Information & Ideas":{subject:"Reading & Writing",kind:"domain",name:"Information & Ideas"},
  "Expression of Ideas":{subject:"Reading & Writing",kind:"domain",name:"Expression of Ideas"},
  "Standard English Conventions":{subject:"Reading & Writing",kind:"domain",name:"Standard English Conventions"},
  // R&W subdomains (ZipGrade uses prefixes like "C&S -", "Info/Ideas -", "SEC -", "EOI -")
  "C&S - Cross-Text Connections":{subject:"Reading & Writing",kind:"sub",domain:"Craft & Structure",name:"Cross Text Connections"},
  "C&S - Text Structure & Purpose":{subject:"Reading & Writing",kind:"sub",domain:"Craft & Structure",name:"Text Structure & Purpose"},
  "C&S - Words in Context":{subject:"Reading & Writing",kind:"sub",domain:"Craft & Structure",name:"Words in Context"},
  "Info/Ideas - Central Idea & Details":{subject:"Reading & Writing",kind:"sub",domain:"Information & Ideas",name:"Central Ideas & Details"},
  "Info/Ideas - Command of Evidence":{subject:"Reading & Writing",kind:"sub",domain:"Information & Ideas",name:"Command of Evidence"},
  "Info/Ideas - Inferences":{subject:"Reading & Writing",kind:"sub",domain:"Information & Ideas",name:"Inferences"},
  "EOI - Rhetorical Synthesis":{subject:"Reading & Writing",kind:"sub",domain:"Expression of Ideas",name:"Rhetorical Synthesis"},
  "EOI - Transitions":{subject:"Reading & Writing",kind:"sub",domain:"Expression of Ideas",name:"Transitions"},
  "SEC - Form Structure Sense":{subject:"Reading & Writing",kind:"sub",domain:"Standard English Conventions",name:"Form, Structure, & Sense"},
  "SEC - Boundaries":{subject:"Reading & Writing",kind:"sub",domain:"Standard English Conventions",name:"Boundaries"},
  // Math domains
  "Algebra":{subject:"Math",kind:"domain",name:"Algebra"},
  "Advanced Math":{subject:"Math",kind:"domain",name:"Advanced Math"},
  "PSDA":{subject:"Math",kind:"domain",name:"Problem-Solving & Data Analysis"},
  "Geometry & Trig":{subject:"Math",kind:"domain",name:"Geometry & Trigonometry"},
  // Math subdomains
  "Alg- Linear Equations in One Variable":{subject:"Math",kind:"sub",domain:"Algebra",name:"Linear Equations (1 Variable)"},
  "Alg- Linear Equations in Two Variables":{subject:"Math",kind:"sub",domain:"Algebra",name:"Linear Equations (2 Variables)"},
  "Alg- Linear Functions":{subject:"Math",kind:"sub",domain:"Algebra",name:"Linear Functions"},
  "Alg- Linear Inequalities":{subject:"Math",kind:"sub",domain:"Algebra",name:"Linear Inequalities"},
  "Alg- Systems of Linear Equations":{subject:"Math",kind:"sub",domain:"Algebra",name:"Systems of Linear Equations"},
  "AdvMath- Equivalent Expressions":{subject:"Math",kind:"sub",domain:"Advanced Math",name:"Equivalent Expressions"},
  "AdvMath- Nonlinear Equations & SOEs":{subject:"Math",kind:"sub",domain:"Advanced Math",name:"Nonlinear Equations"},
  "AdvMath- Nonlinear Functions":{subject:"Math",kind:"sub",domain:"Advanced Math",name:"Nonlinear Functions"},
  "PSDA- Percentages":{subject:"Math",kind:"sub",domain:"Problem-Solving & Data Analysis",name:"Percentages"},
  "PSDA- Ratios, Rates, Proportions, Units":{subject:"Math",kind:"sub",domain:"Problem-Solving & Data Analysis",name:"Ratios, Rates, Proportions, Units"},
  "PSDA- One Var. Data Distributions":{subject:"Math",kind:"sub",domain:"Problem-Solving & Data Analysis",name:"One-Variable Data"},
  "PSDA- Two-Variable Data":{subject:"Math",kind:"sub",domain:"Problem-Solving & Data Analysis",name:"Two-Variable Data"},
  "PSDA- Probability & Conditional Probability":{subject:"Math",kind:"sub",domain:"Problem-Solving & Data Analysis",name:"Probability"},
  "PSDA- Inference from Sample Data & Margin of Error":{subject:"Math",kind:"sub",domain:"Problem-Solving & Data Analysis",name:"Inference & Margin of Error"},
  "PSDA- Evaluating Stat Claims in Obs Studies & Experiments":{subject:"Math",kind:"sub",domain:"Problem-Solving & Data Analysis",name:"Evaluating Statistical Claims"},
  "Geo- Area & Volume":{subject:"Math",kind:"sub",domain:"Geometry & Trigonometry",name:"Area & Volume"},
  "Geo- Circles":{subject:"Math",kind:"sub",domain:"Geometry & Trigonometry",name:"Circles"},
  "Geo- Lines, Angles, & Triangles":{subject:"Math",kind:"sub",domain:"Geometry & Trigonometry",name:"Lines, Angles, & Triangles"},
  "Geo- Right Triangles & Trigonometry":{subject:"Math",kind:"sub",domain:"Geometry & Trigonometry",name:"Right Triangles & Trigonometry"},
};

// Build a student's diagnostic profile from parsed tag rows
function buildDiagnosticProfile(parsedList){
  const domains={}, subs={};
  parsedList.forEach(res=>{
    res.tags.forEach(t=>{
      const map = TAG_MAP[t.tag];
      if(!map) return;
      const slot = map.kind==="domain"?domains:subs;
      const key = map.kind==="domain"?map.name:`${map.domain}|${map.name}`;
      if(!slot[key]) slot[key]={earn:0,poss:0,subject:map.subject};
      slot[key].earn += t.earn;
      slot[key].poss += t.poss;
    });
  });
  const fmt=(rec)=>({...rec,pct:rec.poss?Math.round((rec.earn/rec.poss)*100):null});
  const domainArr = Object.entries(domains).map(([k,v])=>({name:k,...fmt(v)}));
  const subArr = Object.entries(subs).map(([k,v])=>{const[d,s]=k.split("|");return{domain:d,name:s,...fmt(v)};});
  return {domains:domainArr,subs:subArr};
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
    lines.push("===============================================================");
    lines.push(`  PSM ASSIGNMENT${curStudent?` - ${curStudent.name}`:""}`);
    lines.push(`  Generated: ${new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}`);
    if(examType==="PSAT") lines.push(`  Test Type: PSAT`);
    lines.push("===============================================================\n");

    // Intro paragraphs (always)
    lines.push(INTRO_A);
    lines.push("");
    lines.push(INTRO_B);

    if(oneNote){lines.push("");lines.push(ONENOTE_TXT);}
    if(timeDrill){lines.push("");lines.push(TIME_TXT);}
    if(weDomEn && selWeDom.length){lines.push("");lines.push(WED_TXT);}
    if(vocabEn && selVocab.length){lines.push("");lines.push(VOCAB_TXT);}

    // WellEd Domain Assignments block
    if(weDomEn && selWeDom.length){
      lines.push("\nWellEd Domain Assignments:");
      selWeDom.forEach(i=>lines.push(`${i.label}`));
    }

    // Vocab block
    if(vocabEn && selVocab.length){
      lines.push("\nVocab Assignments:");
      selVocab.forEach(i=>lines.push(`${i.label}`));
    }

    // Practice Exams block
    if(addBB||addWE){
      lines.push("\nPractice Exams:");
      if(addBB){
        // Determine next BlueBook number for this student
        const bbNums = nextExamNumbers(curStudent,"BlueBook",bbCnt);
        bbNums.forEach((n,idx)=>{
          lines.push(`Please complete Practice Exam # ${n} on BlueBook (College Board) using the instructions for BlueBook (College Board) practice exams located in your Wise "Full Practice Exam Instructions" Module -  https://bluebook.app.collegeboard.org/.  Be sure to follow instructions regarding screenshots of missed questions!`);
        });
      }
      if(addWE){
        const weNums = nextExamNumbers(curStudent,"WellEd",weCnt);
        weNums.forEach((n,idx)=>{
          lines.push(`Please complete Practice Exam # ${n} on WellEd Labs using the instructions for WellEd Labs practice exams located in your Wise "Full Practice Exam Instructions" Module - https://ats.practicetest.io/sign-in.`);
        });
      }
    }

    // Worksheet section (grouped by domain)
    if(selWS.length>0){
      lines.push("\nWorksheets:");
      // Group by subject -> domain
      const bySubj={};
      selWS.forEach(ws=>{
        if(!bySubj[ws.subject])bySubj[ws.subject]={};
        if(!bySubj[ws.subject][ws.domain])bySubj[ws.subject][ws.domain]=[];
        bySubj[ws.subject][ws.domain].push(ws);
      });
      Object.entries(bySubj).forEach(([subj,doms])=>{
        lines.push(`\n--- ${subj.toUpperCase()} ---`);
        Object.entries(doms).forEach(([dom,arr])=>{
          lines.push(`\n* ${dom} *`);
          arr.forEach(ws=>{
            const eo = evenOdd[ws.id]?` (${evenOdd[ws.id]})`:"";
            const tl = timeDrill&&timeLims[ws.id]?`(${timeLims[ws.id]} min) `:"";
            lines.push(`  ${tl}${ws.title}${eo}`);
          });
        });
      });
    }

    // Answer Keys (always last section when worksheets present)
    if(selWS.length>0){
      lines.push("\nAnswer Keys:");
      selWS.forEach(ws=>{
        const keyName = `KEY_${ws.title}.pdf`;
        lines.push(`${keyName} - ${ws.key||"[LINK PENDING]"}`);
      });
    }

    if(weDomEn && selWeDom.length){
      lines.push("\nNote: WellEd Labs domain assignments will be auto-graded on the platform.");
    }
    if(vocabEn && selVocab.length){
      lines.push("\nNote: WellEd Labs vocab quizzes will be auto-graded on the platform.");
    }

    lines.push("\n===============================================================");
    lines.push("  Questions? Aidan Meyers - ameyers@affordabletutoringsolutions.org - (321) 341-9820");
    lines.push("===============================================================");
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

  // Update a WellEd exam score in assignment history
  const setExamScore = (aid,examIdx,score)=>{
    const upd = students.map(st=>{
      if(st.id!==profile.id) return st;
      return {...st, assignments: st.assignments.map(a=>{
        if(a.id!==aid) return a;
        const ex = [...(a.practiceExams||[])];
        ex[examIdx] = {...ex[examIdx], score};
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

        {tab==="heatmap"&&<HeatMapTab {...{students,heatDoms,getHV,heatC,openProfile}}/>}

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

      {/* MIDDLE: WORKSHEET PICKER */}
      <div style={{...CARD,display:"flex",flexDirection:"column",overflow:"hidden",maxHeight:"calc(100vh - 188px)"}}>
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
                                <div style={{fontSize:12,fontWeight:ck?700:400,color:"#1e293b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ws.title}</div>
                                {lastDate&&<div style={{fontSize:9,color:"#a16207",fontWeight:700,marginTop:1}}>✓ Previously assigned {lastDate}</div>}
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
                    {asg.welledDomain.map((i,idx)=>(
                      <div key={idx} style={{display:"flex",alignItems:"center",gap:8,fontSize:11,marginBottom:4}}>
                        <span style={{flex:1,color:"#065f46",fontWeight:600}}>{i.label}</span>
                        <span style={{fontSize:10,color:"#94a3b8"}}>Score:</span>
                        <input type="text" placeholder={`/${i.qs}`} value={i.score||""} onChange={e=>setWelledDomainScore(asg.id,idx,e.target.value)} style={{width:70,padding:"3px 6px",border:"1px solid #86efac",borderRadius:4,fontSize:11}}/>
                      </div>
                    ))}
                  </div>}
                  {(asg.vocab||[]).length>0&&<div style={{marginTop:8,padding:8,background:"#faf5ff",borderRadius:6}}>
                    <div style={{fontSize:10,fontWeight:800,color:"#6b21a8",marginBottom:4}}>VOCAB</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                      {asg.vocab.map((v,idx)=><span key={idx} style={{background:"#f3e8ff",color:"#6b21a8",padding:"2px 8px",borderRadius:4,fontSize:11}}>{v.label}</span>)}
                    </div>
                  </div>}
                  {(asg.practiceExams||[]).length>0&&<div style={{marginTop:8,padding:8,background:"#eff6ff",borderRadius:6}}>
                    <div style={{fontSize:10,fontWeight:800,color:"#1e40af",marginBottom:4}}>PRACTICE EXAMS</div>
                    {asg.practiceExams.map((ex,idx)=>(
                      <div key={idx} style={{display:"flex",alignItems:"center",gap:8,fontSize:11,marginBottom:4}}>
                        <span style={{flex:1,fontWeight:600,color:"#1e40af"}}>📘 {ex.platform} Practice Test #{ex.number||"?"} {ex.type==="section"?" (Section)":""}</span>
                        <span style={{fontSize:10,color:"#94a3b8"}}>Score:</span>
                        <input type="text" placeholder="e.g. 1200" value={ex.score||""} onChange={e=>setExamScore(asg.id,idx,e.target.value)} style={{width:80,padding:"3px 6px",border:"1px solid #93c5fd",borderRadius:4,fontSize:11}}/>
                      </div>
                    ))}
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

/* ============ HEAT MAP TAB ============ */
function HeatMapTab({students,heatDoms,getHV,heatC,openProfile}){
  return(
    <div>
      <div style={{fontSize:20,fontWeight:800,color:B2,marginBottom:4}}>Assignment Coverage Heat Map</div>
      <div style={{fontSize:13,color:"#64748b",marginBottom:14}}>Worksheets from each domain assigned per student. Click a name to view their profile.</div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,fontSize:11,color:"#475569"}}>
        <span>None</span>{["#f1f5f9","#bfdbfe","#60a5fa","#3b82f6","#1d4ed8"].map((c,i)=><div key={i} style={{width:22,height:22,borderRadius:4,background:c,border:"1px solid #e2e8f0"}}/>)}<span>Most</span>
      </div>
      {students.length===0?(
        <div style={{...CARD,padding:40,textAlign:"center",color:"#94a3b8"}}>No students enrolled yet.</div>
      ):(
        <div style={{...CARD,overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr>
                <th style={{padding:"8px 14px",textAlign:"left",color:"#475569",fontWeight:700,fontSize:11,minWidth:140,borderRight:"2px solid #e2e8f0"}}>Student</th>
                {heatDoms.map(d=><th key={d} style={{padding:"4px 2px",textAlign:"center",fontSize:9,color:"#64748b",fontWeight:700,width:64}}><div style={{writingMode:"vertical-lr",transform:"rotate(180deg)",height:110,overflow:"hidden"}}>{d}</div></th>)}
                <th style={{padding:"8px 12px",textAlign:"center",color:"#475569",fontWeight:700,fontSize:11,borderLeft:"2px solid #e2e8f0"}}>Total</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st,i)=>{
                const total=(st.assignments||[]).reduce((n,a)=>n+(a.worksheets||[]).length,0);
                return(
                  <tr key={st.id} style={{borderBottom:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f9fafb"}}>
                    <td style={{padding:"8px 14px",borderRight:"2px solid #e2e8f0"}}>
                      <button onClick={()=>openProfile(st)} style={{background:"none",border:"none",color:B2,fontWeight:700,cursor:"pointer",fontSize:13,padding:0}}>{st.name}</button>
                      {st.grade&&<span style={{...mkPill("#f1f5f9","#64748b"),marginLeft:6}}>{st.grade}</span>}
                    </td>
                    {heatDoms.map(d=>{const v=getHV(st,d);return(
                      <td key={d} style={{padding:3,textAlign:"center"}}>
                        <div style={{width:34,height:34,borderRadius:7,background:heatC(v),display:"flex",alignItems:"center",justifyContent:"center",fontWeight:v>0?800:400,color:v>0?"#1e3a5f":"#e2e8f0",fontSize:12,margin:"0 auto"}} title={`${st.name}: ${v} in ${d}`}>{v||"·"}</div>
                      </td>
                    );})}
                    <td style={{padding:"8px 12px",textAlign:"center",fontWeight:800,color:total>0?B2:"#94a3b8",fontSize:14,borderLeft:"2px solid #e2e8f0"}}>{total}</td>
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

/* ============ SCORES TAB ============ */
function ScoresTab({students,openProfile}){
  return(
    <div>
      <div style={{fontSize:20,fontWeight:800,color:B2,marginBottom:4}}>Score Tracking Overview</div>
      <div style={{fontSize:13,color:"#64748b",marginBottom:16}}>Latest scores and trends. Add scores from each student's profile.</div>
      {students.every(st=>!(st.scores?.length))?(
        <div style={{...CARD,padding:50,textAlign:"center",color:"#94a3b8"}}><div style={{fontSize:32,marginBottom:8}}>📊</div><div style={{fontSize:16,fontWeight:600}}>No scores recorded yet</div></div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {students.filter(st=>st.scores?.length>0).map(st=>{
            const byType=st.scores.reduce((acc,sc)=>{if(!acc[sc.testType])acc[sc.testType]=[];acc[sc.testType].push({date:sc.date,score:Number(sc.score),max:Number(sc.maxScore)});return acc;},{});
            const latest=[...st.scores].sort((a,b)=>b.date.localeCompare(a.date))[0];
            return(
              <div key={st.id} style={{...CARD}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:36,height:36,borderRadius:10,background:B2,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:16}}>{st.name.charAt(0)}</div>
                    <div><div style={{fontSize:16,fontWeight:800,color:B2}}>{st.name}</div><div style={{fontSize:11,color:"#94a3b8"}}>Last score: {latest?.date}</div></div>
                  </div>
                  <button onClick={()=>openProfile(st)} style={{...mkBtn("#eff6ff",B2),padding:"6px 14px",fontSize:12}}>View Profile</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:10}}>
                  {Object.entries(byType).map(([type,entries])=>{
                    const lv=entries[entries.length-1];
                    const pct=lv.max?Math.round((lv.score/lv.max)*100):null;
                    const improvement=entries.length>1?lv.score-entries[0].score:null;
                    const pColor=pct===null?"#64748b":pct>=75?"#15803d":pct>=60?"#d97706":"#dc2626";
                    return(
                      <div key={type} style={{background:"#f8fafc",borderRadius:10,padding:14,border:"1.5px solid #e2e8f0",position:"relative",overflow:"hidden"}}>
                        <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:pct===null?B2:pct>=75?"#22c55e":pct>=60?"#f59e0b":"#ef4444"}}/>
                        <div style={{fontSize:9,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:.7,marginBottom:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{type}</div>
                        <div style={{fontSize:24,fontWeight:900,color:B2,lineHeight:1}}>{lv.score}</div>
                        {pct!==null&&<div style={{fontSize:13,color:pColor,fontWeight:700,marginTop:4}}>{pct}%</div>}
                        {improvement!==null&&<div style={{fontSize:11,color:improvement>0?"#15803d":improvement<0?"#dc2626":"#64748b",marginTop:5,fontWeight:600}}>{improvement>0?"▲ +":improvement<0?"▼ ":"→ "}{Math.abs(improvement)} since start</div>}
                        <div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>{entries.length} score{entries.length!==1?"s":""} on record</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
