# Builds index.html by composing: HTML shell + embed.js data + app.jsx React code
import os
shell_head = r'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>PSM Generator - Affordable Tutoring Solutions</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%93%90%3C/text%3E%3C/svg%3E" />
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
if(window['pdfjsLib']){window['pdfjsLib'].GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';}
</script>
<style>
  html,body,#root{margin:0;padding:0;height:100%;}
  body{font-family:'Segoe UI',system-ui,sans-serif;background:#eef2f7;}
  *{box-sizing:border-box;}
  .pl{animation:pl 1s linear infinite;}
  @keyframes pl{0%{opacity:.3;}50%{opacity:1;}100%{opacity:.3;}}
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-type="module" data-presets="env,react">
const { useState, useEffect, useMemo, useRef } = React;
'''

embed = open('embed.js',encoding='utf-8').read()

app = open('app.jsx',encoding='utf-8').read()

shell_tail = r'''
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
</script>
</body>
</html>
'''

full = shell_head + embed + '\n' + app + '\n' + shell_tail
with open('index.html','w',encoding='utf-8') as f:
    f.write(full)
print(f'index.html: {len(full)} bytes, {full.count(chr(10))+1} lines')
