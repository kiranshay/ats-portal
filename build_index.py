# Builds index.html by composing: HTML shell + embed.js data + app.jsx React code
import os, re, base64
shell_head = r'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>PSM Generator — Affordable Tutoring Solutions</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='18' fill='%231C2033'/%3E%3Ctext x='50' y='68' font-family='Georgia,serif' font-size='58' font-style='italic' font-weight='700' text-anchor='middle' fill='%23FAF7F2'%3EP%3C/text%3E%3C/svg%3E" />

<!-- Fonts: Fraunces (editorial display serif, variable) + IBM Plex Sans/Mono -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..900,0..100;1,9..144,300..900,0..100&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">

<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script>
if(window['pdfjsLib']){window['pdfjsLib'].GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';}
// Initialize Firebase
firebase.initializeApp({
  apiKey: "AIzaSyAr4Gbc3nCV6zbJKSg1_xWUqsMVqFnhmjg",
  authDomain: "psm-generator.firebaseapp.com",
  projectId: "psm-generator",
  storageBucket: "psm-generator.firebasestorage.app",
  messagingSenderId: "456789704122",
  appId: "1:456789704122:web:b08189d7f6472c6206b183"
});
window.db = firebase.firestore();
window.auth = firebase.auth();
// Keep tutors signed in across tabs / reloads until explicit sign-out.
window.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});
</script>
<style>
  /* =========================================================
     PSM GENERATOR — Editorial design system
     Fraunces (display serif) + IBM Plex Sans (UI) + Plex Mono
     Palette: warm paper, deep ink, ATS-blue accent, sienna highlight
     ========================================================= */
  :root{
    /* Surfaces — warm paper, cool ink (editorial house style) */
    --paper: #FAF7F2;          /* warm off-white background */
    --paper-alt: #F3EEE4;      /* aged-paper surface for panels */
    --card: #FFFFFF;           /* card / input surface */

    /* Ink — cooled toward ATS navy family */
    --ink: #0F1A2E;            /* primary text, deep navy-black */
    --ink-soft: #2E3A57;       /* secondary text */
    --ink-mute: #66708A;       /* tertiary / captions */
    --rule: rgba(15,26,46,.12);/* border / hairline rules */
    --rule-strong: rgba(15,26,46,.22);

    /* ATS brand navies — sampled from the official logo */
    --brand: #004A79;          /* ATS primary navy */
    --brand-dark: #003258;     /* ATS deep navy / hover */
    --brand-light: #0066A6;    /* ATS lighter accent */
    --brand-soft: #E1ECF4;     /* brand-tinted surface */
    --accent: #9A5B1F;         /* burnt sienna editorial counterpoint */
    --accent-soft: #F5E9DA;

    /* Semantic */
    --ok: #2D6A4F;
    --warn: #B8860B;
    --danger: #8C2E2E;

    /* Typography */
    --font-display: 'Fraunces', 'Source Serif 4', Georgia, serif;
    --font-body: 'IBM Plex Sans', system-ui, -apple-system, sans-serif;
    --font-mono: 'IBM Plex Mono', 'SF Mono', Menlo, monospace;

    /* Elevation — restrained, editorial */
    --shadow-sm: 0 1px 2px rgba(28,32,51,.06), 0 0 0 1px rgba(28,32,51,.04);
    --shadow-md: 0 4px 14px -6px rgba(28,32,51,.14), 0 0 0 1px rgba(28,32,51,.05);
    --shadow-lg: 0 20px 40px -20px rgba(28,32,51,.22), 0 0 0 1px rgba(28,32,51,.06);
  }

  *{box-sizing:border-box;}
  html,body,#root{margin:0;padding:0;height:100%;}

  body{
    font-family: var(--font-body);
    font-feature-settings: "ss01","ss02","cv11";
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    background: var(--paper);
    color: var(--ink);
    /* Subtle paper grain */
    background-image:
      radial-gradient(circle at 20% 10%, rgba(47,107,154,.04), transparent 40%),
      radial-gradient(circle at 80% 60%, rgba(154,91,31,.035), transparent 45%);
  }

  /* Typographic defaults — Fraunces display with optical sizing */
  h1,h2,h3,h4,.display{
    font-family: var(--font-display);
    font-optical-sizing: auto;
    font-variation-settings: "opsz" 96, "SOFT" 30;
    letter-spacing: -0.015em;
    color: var(--ink);
  }

  /* Selection — brand-tinted, no blue OS default */
  ::selection{ background: var(--brand); color: var(--paper); }

  /* Scrollbars — thin, paper-toned */
  *::-webkit-scrollbar{ width:10px; height:10px; }
  *::-webkit-scrollbar-track{ background: transparent; }
  *::-webkit-scrollbar-thumb{
    background: rgba(28,32,51,.16);
    border-radius: 10px;
    border: 2px solid var(--paper);
  }
  *::-webkit-scrollbar-thumb:hover{ background: rgba(28,32,51,.28); }

  /* Focus ring — sienna, editorial not electric */
  *:focus-visible{
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 3px;
  }

  /* Button polish — inherits whatever inline styles set, adds transitions */
  button{ font-family: var(--font-body); transition: transform .12s ease, box-shadow .2s ease, background .2s ease, color .2s ease, border-color .2s ease; }
  button:not(:disabled):hover{ transform: translateY(-1px); }
  button:not(:disabled):active{ transform: translateY(0); }
  input,select,textarea{ font-family: var(--font-body); color: var(--ink); }
  input::placeholder,textarea::placeholder{ color: var(--ink-mute); font-style: italic; }
  input:focus,select:focus,textarea:focus{ outline: 2px solid var(--brand); outline-offset: 1px; border-color: var(--brand) !important; }
  input[type="checkbox"]{ accent-color: var(--brand); cursor: pointer; }

  /* Select — thin ink arrow, paper surface */
  select{
    appearance: none; -webkit-appearance: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'><path d='M1 1l4 4 4-4' stroke='%230F1A2E' stroke-width='1.5' fill='none' stroke-linecap='round'/></svg>");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 28px !important;
  }

  /* Number inputs — no spinners on specific inputs, cleaner look */
  input[type="number"]{ font-variant-numeric: tabular-nums; }

  /* Labels on click rows in the WellEd/Vocab pickers get a hover lift */
  label:hover input[type="checkbox"]{ transform: scale(1.05); }

  /* Loading pulse */
  .pl{ animation: pl 1.2s ease-in-out infinite; }
  @keyframes pl{ 0%,100%{opacity:.35;} 50%{opacity:1;} }

  /* App reveal on mount */
  #root > div{ animation: rise .6s cubic-bezier(.2,.7,.2,1) both; }
  @keyframes rise{ from{ opacity:0; transform: translateY(6px); } to{ opacity:1; transform:none; } }

  /* Editorial header — overrides the old blue gradient bar via data-attr */
  [data-psm-header]{
    background: var(--paper) !important;
    color: var(--ink) !important;
    border-bottom: 1px solid var(--rule) !important;
    height: auto !important;
    padding: 24px 36px 22px !important;
    position: relative;
  }
  [data-psm-header]::after{
    content: "";
    position: absolute; left: 36px; right: 36px; bottom: -1px; height: 2px;
    background: linear-gradient(90deg, var(--brand) 0, var(--brand) 72px, transparent 72px);
  }
  [data-psm-logo]{
    width: 52px; height: 52px;
    border-radius: 12px;
    object-fit: cover;
    box-shadow: 0 1px 0 rgba(255,255,255,.6) inset, 0 0 0 1px var(--rule-strong), 0 6px 16px -8px rgba(0,74,121,.45);
    flex-shrink: 0;
  }
  [data-psm-header] [data-psm-title]{
    font-family: var(--font-display) !important;
    font-variation-settings: "opsz" 144, "SOFT" 20 !important;
    font-weight: 600 !important;
    font-size: 26px !important;
    letter-spacing: -0.02em !important;
    color: var(--ink) !important;
    line-height: 1.1 !important;
  }
  [data-psm-header] [data-psm-title] em{
    font-style: italic; color: var(--brand); font-weight: 500;
  }
  [data-psm-header] [data-psm-eyebrow]{
    font-family: var(--font-body) !important;
    font-size: 10px !important;
    font-weight: 600 !important;
    letter-spacing: 0.18em !important;
    text-transform: uppercase !important;
    color: var(--ink-mute) !important;
    opacity: 1 !important;
    margin-bottom: 6px;
  }
  [data-psm-header] [data-psm-actions]{
    color: var(--ink-soft) !important;
    gap: 8px !important;
  }
  [data-psm-header] [data-psm-actions] button,
  [data-psm-header] [data-psm-actions] label,
  [data-psm-header] [data-psm-actions] a{
    background: transparent !important;
    color: var(--ink-soft) !important;
    border: 1px solid var(--rule) !important;
    border-radius: 999px !important;
    padding: 6px 12px !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    letter-spacing: 0.02em !important;
  }
  [data-psm-header] [data-psm-actions] button:hover,
  [data-psm-header] [data-psm-actions] label:hover,
  [data-psm-header] [data-psm-actions] a:hover{
    border-color: var(--ink) !important;
    color: var(--ink) !important;
    background: var(--paper-alt) !important;
  }
  [data-psm-header] [data-psm-exam] button[data-active="true"]{
    background: var(--brand) !important;
    color: var(--paper) !important;
    border-color: var(--brand) !important;
    box-shadow: 0 2px 8px -4px rgba(0,74,121,.6);
  }

  /* Editorial tab bar */
  [data-psm-tabs]{
    background: var(--paper) !important;
    border-bottom: 1px solid var(--rule) !important;
    padding: 0 36px !important;
    gap: 28px !important;
  }
  [data-psm-tabs] button{
    font-family: var(--font-display) !important;
    font-variation-settings: "opsz" 48 !important;
    font-size: 17px !important;
    font-weight: 500 !important;
    letter-spacing: -0.01em !important;
    padding: 18px 2px !important;
    color: var(--ink-mute) !important;
    border-bottom: 2px solid transparent !important;
    position: relative;
  }
  [data-psm-tabs] button:hover{ color: var(--ink) !important; }
  [data-psm-tabs] button[data-active="true"]{
    color: var(--ink) !important;
    border-bottom-color: var(--ink) !important;
    font-weight: 600 !important;
  }
  [data-psm-tabs] button[data-active="true"]::after{
    content:"";
    position:absolute; left:50%; bottom:-2px; width:6px; height:6px;
    transform: translate(-50%, 50%) rotate(45deg);
    background: var(--accent);
  }
  [data-psm-tabs] button span:first-child{ display:none !important; }  /* hide emoji icons */

  /* Body canvas */
  [data-psm-body]{
    background: var(--paper) !important;
    padding: 32px 36px !important;
  }

  /* Cloud / count chips in header */
  [data-psm-chip]{
    font-family: var(--font-mono) !important;
    font-size: 10px !important;
    letter-spacing: 0.04em !important;
    font-weight: 500 !important;
  }

  /* Signed-in user chip — override the global pill-button styling for the
     inline sign-out icon so it sits cleanly inside the chip container. */
  [data-psm-header] [data-psm-actions] [data-psm-user]{
    padding: 4px 4px 4px 12px !important;
  }
  [data-psm-header] [data-psm-actions] [data-psm-user] button{
    background: transparent !important;
    border: none !important;
    padding: 4px 6px 4px 2px !important;
    color: var(--ink-mute) !important;
    border-radius: 999px !important;
  }
  [data-psm-header] [data-psm-actions] [data-psm-user] button:hover{
    color: var(--danger) !important;
    background: transparent !important;
  }
  [data-psm-header] [data-psm-actions] [data-psm-user]:hover{
    border-color: var(--ink) !important;
  }

  /* Student portal responsive rules (Phase 2 Session 3). Scoped under
     [data-portal="student"] so no tutor-app selectors are affected. */
  @media (max-width: 768px){
    [data-portal="student"]{
      padding: 20px 16px 60px !important;
    }
    [data-portal="student"] table{
      font-size: 11px !important;
    }
    [data-portal="student"] table th,
    [data-portal="student"] table td{
      padding: 8px 6px !important;
    }
  }
  @media (max-width: 480px){
    [data-portal="student"]{
      padding: 16px 12px 48px !important;
    }
  }
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-type="module" data-presets="env,react">
const { useState, useEffect, useMemo, useRef } = React;
'''

embed = open('embed.js',encoding='utf-8').read()

# Inline the pure diagnostic-parser module. The file is valid ESM on disk
# (tests import it via `node --test`), but the browser bundle is a plain
# <script type="text/babel"> with no module system. We strip the ESM-only
# `export { ... }` block (marked by /* @module-only-start */ ... end */)
# before concatenating so the browser script stays plain-script-compatible.
diagnostic = open('lib/diagnostic.mjs',encoding='utf-8').read()
diagnostic = re.sub(
    r'/\*\s*@module-only-start\s*\*/.*?/\*\s*@module-only-end\s*\*/',
    '',
    diagnostic,
    flags=re.DOTALL,
)

app = open('app.jsx',encoding='utf-8').read()

# Embed ATS logo as base64 so PDF export has no network dependency.
logo_b64 = base64.b64encode(open('ats_logo.png','rb').read()).decode('ascii')
logo_js = f'window.ATS_LOGO_PNG = "data:image/png;base64,{logo_b64}";\n'

shell_tail = r'''
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
</script>
</body>
</html>
'''

full = shell_head + logo_js + embed + '\n' + diagnostic + '\n' + app + '\n' + shell_tail
with open('index.html','w',encoding='utf-8') as f:
    f.write(full)
print(f'index.html: {len(full)} bytes, {full.count(chr(10))+1} lines')
