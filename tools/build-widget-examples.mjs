#!/usr/bin/env node
// Deterministic standalone examples; Node 18+; no dependencies.
import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {css, helpers} from '../examples/widgets/shared.mjs';
import controls from '../examples/widgets/controls.mjs';
import navigation from '../examples/widgets/navigation.mjs';
import menus from '../examples/widgets/menus.mjs';
import dialogs from '../examples/widgets/dialogs.mjs';
import host from '../examples/widgets/host.mjs';

const entries=[...controls,...navigation,...menus,...dialogs,...host];
const root=new URL('../',import.meta.url),out=new URL('demo/dist/widgets/',root);
const captionCss=await readFile(new URL('examples/caption-controls.css',root),'utf8');
const license=(await readFile(new URL('LICENSE',root),'utf8')).trim();
const escape=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const script=code=>code.replaceAll('</script','<\\/script');
const shell=(title,body,js='',extra='')=>`<!doctype html>
<!-- Original GUI95 example.\n${license}\n-->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} — GUI95</title><style>${css}${extra}</style></head><body>${body}<script>${script(js)}</script></body></html>\n`;
const outputs=new Map();
for(const entry of entries){
 if(!/^[a-z]+(?:-[a-z]+)*$/.test(entry.id))throw Error(`Invalid id ${entry.id}`);
 if(outputs.has(entry.id+'.html'))throw Error(`Duplicate id ${entry.id}`);
 const sources=entry.sources.map(s=>`<a href="${escape(s.url)}" target="_blank" rel="noopener">${escape(s.label)}</a>`).join(' · ');
 outputs.set(entry.id+'.html',shell(entry.title,`<main class="window"><header class="caption"><h1>${escape(entry.title)}</h1><span>GUI95</span></header><div class="content"><p class="crumb"><a href="index.html">Widget index</a> / ${escape(entry.family)} · <a href="${entry.id}.html" download>Download this HTML</a></p><div class="stage" id="stage">${entry.body}</div><p class="result" id="result" role="status" aria-live="polite">Ready — try the example.</p><div class="guide"><h2>States and behavior</h2><p>${escape(entry.states)}</p><h2>Keyboard</h2><p>${escape(entry.keys)}</p><h2>Scope and adaptation</h2><p>${escape(entry.note)}</p><h2>Sources</h2><p>${sources}</p><p class="hint">Original implementation; system colors are represented by CSS variables. The default 13 px system-font stack is a readable browser adaptation. The 1995 source is preliminary, not a final product specification. Test the target browser and native host before shipping.</p></div></div></main>`,
 `(()=>{'use strict';const context=(${helpers.toString()})();(${entry.setup.toString()})(context);})();`,entry.id==='window'?captionCss:''));
}
const families=[...new Set(entries.map(e=>e.family))];
const cards=families.map(family=>`<section data-family><h2>${escape(family)}</h2><div class="cards">${entries.filter(e=>e.family===family).map(e=>`<article class="card" data-search="${escape((e.title+' '+e.family+' '+e.states).toLowerCase())}"><h3><a href="${e.id}.html">${escape(e.title)}</a></h3><p>${escape(e.states)}</p><div class="row"><button data-preview="${e.id}" data-title="${escape(e.title)}">Preview</button><a href="${e.id}.html" download>HTML</a></div></article>`).join('')}</div></section>`).join('');
outputs.set('index.html',shell('Widget reference',`<main class="window gallery"><header class="caption"><h1>GUI95 · Widget reference</h1><span>${entries.length} examples</span></header><div class="content"><p>Small working examples for the Windows 95 control families and common dialog patterns. Every example is a self-contained HTML file: copy it, open it locally, and adapt only the controls you need.</p><p>These are original browser implementations. Native Open, Save, Print and rich-text editing use browser adapters with explicit limits. They do not reproduce every Windows API or later common control.</p><nav class="catalog-nav"><a href="../index.html">Desktop demo</a><a href="https://github.com/increpare/gui95/blob/master/docs/widget-coverage.md">Coverage and reuse guide</a><a href="https://github.com/increpare/gui95/blob/master/docs/historical-sources.md">Period reading shelf</a></nav><label class="field">Find a control <input id="search" type="search" placeholder="Try checkbox, tree, Apply, native…"></label><p id="count" role="status">${entries.length} examples</p><section id="preview-panel" hidden><div class="row"><h2 id="preview-title">Preview</h2><button id="close-preview">Close preview</button><a id="open-preview" href="buttons.html" target="_blank">Open separately</a></div><iframe id="preview" class="preview" title="Widget preview"></iframe><p class="hint">The preview is its own page. Open it separately to test full keyboard and dialog behavior.</p></section>${cards}<p class="hint">MIT · Copyright (c) 2026 Stephen Lavelle. No network requests are needed to run the examples. Font and native-popup rendering follow your browser and system.</p></div></main>`,
 `const $=s=>document.querySelector(s);const cards=[...document.querySelectorAll('.card')];$('#search').addEventListener('input',()=>{const query=$('#search').value.toLowerCase();let count=0;cards.forEach(card=>{card.hidden=!card.dataset.search.includes(query);if(!card.hidden)count++;});document.querySelectorAll('[data-family]').forEach(group=>group.hidden=![...group.querySelectorAll('.card')].some(card=>!card.hidden));$('#count').textContent=count+' examples';});document.querySelectorAll('[data-preview]').forEach(button=>button.addEventListener('click',()=>{$('#preview-panel').hidden=false;$('#preview-title').textContent=button.dataset.title;$('#preview').src=button.dataset.preview+'.html';$('#open-preview').href=button.dataset.preview+'.html';$('#preview-panel').scrollIntoView({block:'start',behavior:'instant'});}));$('#close-preview').addEventListener('click',()=>{$('#preview-panel').hidden=true;$('#preview').removeAttribute('src');$('#search').focus();});`));
const authoring=new Map([[controls,'controls'],[navigation,'navigation'],[menus,'menus'],[dialogs,'dialogs'],[host,'host']].flatMap(([items,module])=>items.map(item=>[item.id,'examples/widgets/'+module+'.mjs'])));
const metadata=entries.map(({setup,body,...rest})=>({...rest,file:`${rest.id}.html`,authoring_path:authoring.get(rest.id)}));
outputs.set('manifest.json',JSON.stringify({schema:1,license:'MIT',examples:metadata},null,2)+'\n');

const coverage=`# Widget coverage and independent examples

The [gallery](../demo/dist/widgets/index.html) contains **${entries.length} self-contained examples** for standard Windows 95 control families, common dialog patterns, and explicit browser adapters. Each page includes states, keyboard behavior, scope limits, and period/current source pointers. They are original MIT implementations, independent of the archived application engines. This is a reference and starting point, not a packaged component API or a claim of complete Win32 emulation.

## Find a template

| Family | Example | What it covers |
| --- | --- | --- |
${entries.map(e=>`| ${e.family} | [${e.title}](../demo/dist/widgets/${e.id}.html) | ${e.states} |`).join('\n')}

## Reuse one example

1. Open its HTML file directly, or serve the gallery with <code>node demo/serve.mjs</code> and visit http://127.0.0.1:1995/widgets/.
2. Read its visible scope and keyboard notes. The file contains inline CSS and just that example’s initializer; no imports, external fonts, app engines, or network service are needed.
3. Copy the markup, relevant CSS, and initializer into the consuming project, scope the CSS, replace demonstration data/actions, and retain the MIT notice. The shared styles in a standalone page are a convenience, not a requirement to copy every selector.
4. Keep semantics, labels, selection, disabled/read-only behavior, validation, cancellation, focus restoration, and keyboard handling with the visuals. Replace example IDs when mounting multiple instances.
5. Verify the actual app at narrow widths, larger text, keyboard-only input, and 100/125/150/200% display scales. Native host controls, screen readers, browser differences and real persistence need their own checks.

Authoring sources are in [examples/widgets](../examples/widgets/README.md). Regenerate with <code>node tools/build-widget-examples.mjs</code>; check committed output with <code>node tools/build-widget-examples.mjs --check</code>. The [browser runner](../examples/widgets/check.mjs) verifies interactions and records its exact scope. See [the verification record](../examples/widgets/QA.md).

## Historical baseline and deliberate adaptations

The primary period baseline is Microsoft’s February 1995 **preliminary** guide, chapters 7–8, with edition qualifications in the [reading shelf](historical-sources.md). These examples demonstrate behavior contracts; their prose is not a quotation of the manual. The [historical audit](historical-audit-2026-10-18.md) records remaining issues in the older app-based recommendations.

The default palette represents classic system-color roles through CSS variables, not mandatory colors for every user. The 13 px system-font stack is an explicit modern readability choice, not a claim that original Windows used Tahoma at that size. Native HTML controls, HTML dialog, ARIA, pointer events, CSS resizing and SVG animation are browser adaptations. W3C APG links describe modern accessibility behavior; they are not historical evidence. Only transfer a pattern after checking its behavior in the intended host.

## Native and extended boundaries

- Open/Save/Print samples invoke working browser facilities. Browser security and settings determine paths, prompts, overwrite behavior and printer controls. For Electron, use a narrow preload/main-process adapter and the host’s actual dialogs; never pretend a download request proves a successful save.
- The rich-text page demonstrates browser editing, not RichEdit/RTF formatting, safe import or a production undo engine. Color/font dialogs are deliberately small draft/commit examples, not native enumeration, color management or full system custom-color stores.
- The window page demonstrates a bounded child shell, not native desktop chrome, MDI document management, docking or taskbar integration. The list view is single-selection and row-oriented, not an editable spreadsheet. The tree does not include multiselect or drag-and-drop.
- Image lists are represented by original glyphs/SVG in list/window/animation examples; no shared bitmap image-list API is supplied. Animation uses original SVG, not the native AVI control. Hot-key capture records a chord but does not register a system shortcut.
- Later date/time pickers, month calendars, rebar/coolbar controls, IP address fields, HTML/web views, modern touch widgets, and app-specific drawing canvases are outside this Windows 95 baseline. Add a dated extension rather than silently calling them original stock controls.

Retain browser/native accessibility unless there is a tested reason to replace it. There is no screen-reader or native-Win32 conformance certification for these samples.
`;

const check=process.argv.includes('--check');
let failures=0;
async function emit(url,expected){if(check){let actual;try{actual=await readFile(url,'utf8');}catch{}if(actual!==expected){console.error(`Stale/missing: ${fileURLToPath(url)}`);failures++;}}else await writeFile(url,expected);}
if(!check)await mkdir(out,{recursive:true});
for(const [name,content]of outputs)await emit(new URL(name,out),content);
await emit(new URL('docs/widget-coverage.md',root),coverage);
await emit(new URL('demo/dist/caption-controls.css',root),captionCss);
const existing=await readdir(out);
for(const name of existing)if(!outputs.has(name)){console.error(`Unexpected generated output: ${name}; remove it explicitly if obsolete.`);failures++;}
if(failures)process.exitCode=1;else console.log(`${check?'Verified':'Built'} ${entries.length} standalone examples, gallery, manifest, and coverage index.`);
