// Dialog layout primitives: the dialog-unit measures and the positions they produce in Chromium.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const cssUrl=new URL('../components/gui95.css',import.meta.url);
const css=await readFile(cssUrl,'utf8');
// The standard measures in dialog units, and the whole pixels they must come to with a 1.5 x 1.625 px unit.
const expected={'margin-x':11,'margin-y':11,'gap-x':6,'gap-y':6,'tight-y':2,'control-h':23,'button-w':75,'group-x':9,'group-top':18,'group-bottom':10};

const fixture=`<!doctype html><html><head><link rel="stylesheet" href="/gui95.css"></head><body class="gui95" style="margin:0;padding:20px">
<section class="window" id="bottom" style="width:360px"><div class="title-bar">Bottom row</div><form id="bottom-frame" data-gui95-dialog-layout>
<div data-gui95-dialog-body id="bottom-body"><div data-gui95-form id="form">
<label for="name" id="name-label">Name:</label><input id="name" value="Untitled">
<label for="kind" id="kind-label">Type of document:</label><select id="kind"><option>Text</option></select>
<label for="notes" id="notes-label">Comments:</label><textarea id="notes" rows="3">First line</textarea>
<label id="fonts-label">Fonts:</label><ul role="listbox" id="fonts" aria-label="Fonts" style="height:50px"><li role="option">Arial</li><li role="option">Tahoma</li></ul>
<label for="copies" id="copies-label">Copies:</label><span data-gui95-spin id="spin"><input id="copies" type="number" value="1"><button type="button" data-gui95-step="copies" data-gui95-delta="1" aria-label="More"></button><button type="button" data-gui95-step="copies" data-gui95-delta="-1" aria-label="Fewer"></button></span>
<label for="volume" id="volume-label">Volume:</label><input id="volume" type="range">
<label id="size-label">Size:</label><span id="size">12 KB</span>
<label data-gui95-wide id="long-check"><input type="checkbox" id="long-box"> Keep the original document metadata when exporting an additional copy of this file</label>
</div><fieldset data-gui95-group id="group"><legend id="legend">Output</legend><label id="first-option"><input type="radio" name="o" checked> Printer</label><label id="last-option"><input type="radio" name="o"> File</label></fieldset></div>
<div data-gui95-buttons id="bottom-buttons"><button class="default" id="ok">OK</button><button id="cancel">Cancel</button><button id="apply">Apply</button><button id="help">Help</button></div></form></section>
<section class="window" id="side" style="width:360px"><div class="title-bar">Right column</div><form id="side-frame" data-gui95-dialog-layout="side">
<div data-gui95-dialog-body><div data-gui95-stack="tight"><label for="file" id="file-label">File name:</label><input id="file" value="letter.txt"></div><label><input type="checkbox"> Read only</label></div>
<div data-gui95-buttons id="side-buttons"><button class="default" id="side-ok">OK</button><button id="side-cancel">Cancel</button><button id="side-long">Connect network drive…</button></div></form></section>
<section class="window" style="width:max-content"><div role="tablist" aria-label="Pages"><button role="tab" aria-selected="true" aria-controls="page">General</button></div><div role="tabpanel" data-gui95-page="small" id="page"><p id="page-text">Text</p></div></section>
<section class="window" style="width:300px"><div class="window-body" id="old-body"><fieldset id="old-group"><legend>Old</legend>x</fieldset></div><div class="dialog-actions" id="old-actions"><button id="old-ok">OK</button><button id="old-cancel">Cancel</button></div></section>
</body></html>`;

let server,browser,page,base;
before(async()=>{
  server=createServer((req,res)=>{if(req.url==='/gui95.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end(fixture);}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}/`;
  browser=await chromium.launch();page=await browser.newPage({viewport:{width:900,height:1000}});await page.goto(base);
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});

const rect=id=>page.evaluate(id=>{const r=document.getElementById(id).getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};},id);
// Top of the first line of text inside an element, the nearest thing to a baseline that can be read back.
const textTop=id=>page.evaluate(id=>{const walker=document.createTreeWalker(document.getElementById(id),NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))if(node.data.trim()){const range=document.createRange();range.selectNodeContents(node);return range.getClientRects()[0].top;}return null;},id);

test('the whole-pixel fallback measures equal the dialog-unit arithmetic',()=>{
  const units=css.match(/--gui95-du-x:([\d.]+)px;--gui95-du-y:([\d.]+)px/);assert.ok(units,'dialog units are declared once');
  const unit={x:Number(units[1]),y:Number(units[2])};assert.deepEqual(unit,{x:1.5,y:1.625});
  const fallback=css.match(/@supports not \(width:round\(1px,1px\)\)\{[^{]+\{([^}]+)\}\}/);assert.ok(fallback,'fallback rule present');
  const literal=Object.fromEntries(fallback[1].split(';').map(pair=>{const [name,value]=pair.split(':');return[name.replace('--gui95-dlg-',''),Number(value.replace('px',''))];}));
  assert.deepEqual(literal,expected);
  for(const [name,pixels] of Object.entries(expected)){
    const rule=css.match(new RegExp(`--gui95-dlg-${name}:round\\((down,)?calc\\((\\d+)\\*var\\(--gui95-du-([xy])\\)\\),1px\\)`));assert.ok(rule,`${name} is derived from a unit`);
    const exact=Number(rule[2])*unit[rule[3]];assert.equal(rule[1]?Math.floor(exact):Math.floor(exact+0.5),pixels,`${name}: ${rule[2]} units`);
  }
});

test('Chromium resolves every measure to the expected whole pixel',async()=>{
  const resolved=await page.evaluate(names=>Object.fromEntries(names.map(name=>{const probe=document.createElement('div');probe.style.width=`var(--gui95-dlg-${name})`;document.body.append(probe);const width=probe.getBoundingClientRect().width;probe.remove();return[name,width];})),Object.keys(expected));
  assert.deepEqual(resolved,expected);
});

test('bottom row: 7-unit margins, 4-unit gaps and equal 50 x 14 unit buttons, right-aligned',async()=>{
  const frame=await rect('bottom-frame'),buttons=await Promise.all(['ok','cancel','apply','help'].map(rect)),form=await rect('form'),group=await rect('group');
  for(const button of buttons)assert.deepEqual([button.width,button.height],[75,23]);
  for(let i=1;i<buttons.length;i++)assert.equal(buttons[i].left-buttons[i-1].right,6,'gap between buttons');
  assert.equal(frame.right-buttons[3].right,11,'right margin');assert.equal(frame.bottom-buttons[3].bottom,11,'bottom margin');
  assert.equal(form.left-frame.left,11,'left margin');assert.equal(form.top-frame.top,11,'top margin');assert.equal(frame.right-form.right,11,'content right margin');
  assert.equal(group.top-form.bottom,6,'gap between blocks in the body');assert.equal(buttons[0].top-group.bottom,11,'content to command row');
});

test('form grid: one field column, labels on the field text line, multi-line controls top-aligned',async()=>{
  const pairs=[['name-label','name'],['kind-label','kind'],['notes-label','notes'],['fonts-label','fonts'],['copies-label','spin'],['volume-label','volume'],['size-label','size']];
  const fields=await Promise.all(pairs.map(([,field])=>rect(field))),labels=await Promise.all(pairs.map(([label])=>rect(label)));
  assert.equal(new Set(fields.map(field=>field.left)).size,1,'fields share a left edge');assert.equal(new Set(labels.map(label=>label.left)).size,1,'labels share a left edge');
  for(const index of [0,1,2,5])assert.equal(fields[index].right,fields[0].right,'stretching fields share a right edge');
  assert.equal(fields[4].width,80,'an up-down control keeps its own width');
  for(let i=1;i<fields.length;i++)assert.equal(fields[i].top-Math.max(fields[i-1].bottom,labels[i-1].bottom),6,`row gap before ${pairs[i][1]}`);
  // A label's text starts where its field's text starts: 4px down in a field, 3px in a list box, flush for plain text.
  // Read the label's text top less the font's own half-leading (where its text sits inside its content box), so the
  // check holds for whichever fallback font the host has: Linux fonts put the text about 1px lower in the same line box.
  const lead=id=>page.evaluate(id=>{const el=document.getElementById(id),r=el.getBoundingClientRect(),cs=getComputedStyle(el);const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))if(node.data.trim()){const range=document.createRange();range.selectNodeContents(node);return range.getClientRects()[0].top-(r.top+parseFloat(cs.borderTopWidth)+parseFloat(cs.paddingTop));}return 0;},id);
  const offsets=await Promise.all(pairs.map(async([label,field],i)=>Math.round((await textTop(label)-await lead(label)-fields[i].top)*100)/100));
  const fieldText=await Promise.all([['fonts','fonts-label'],['size','size-label']].map(async([id,label])=>Math.round((await textTop(id)-await lead(label)-(await rect(id)).top)*100)/100));
  for(const index of [0,1,2,4])assert.ok(Math.abs(offsets[index]-4)<0.2,`${pairs[index][0]} sits on the field text line: ${offsets[index]}`);
  assert.ok(Math.abs(offsets[3]-fieldText[0])<0.2,'list box label matches the first option');assert.ok(Math.abs(offsets[6]-fieldText[1])<0.2,'static text label matches its value');
  assert.ok(Math.abs(offsets[5]-4)<0.2,'slider label is centred on the 14-unit height');
  assert.ok(fields[2].height>40&&labels[2].bottom<fields[2].top+25,'the label of a multi-line field stays at its top');
});

test('a long check box label wraps under its own text and the box stays on the first line',async()=>{
  const label=await rect('long-check'),box=await rect('long-box'),form=await rect('form');
  assert.ok(label.height>25,'label wrapped');assert.equal(box.top-label.top,1);assert.equal(box.left,form.left);assert.equal(label.right,form.right,'spans both columns');
});

test('group box: caption text 7px from the frame, first control 11 units down, 6-unit inner margin',async()=>{
  const group=await rect('group'),first=await rect('first-option'),last=await rect('last-option');
  const legendLeft=await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.getElementById('legend'));return range.getClientRects()[0].left;});
  assert.equal(legendLeft-group.left,7);assert.equal(first.top-group.top,18);assert.equal(first.left-group.left,9);assert.equal(group.bottom-last.bottom,10);assert.equal(last.top-first.bottom,6);
});

test('right column: OK above Cancel, equal widths that grow with the longest label',async()=>{
  const frame=await rect('side-frame'),buttons=await Promise.all(['side-ok','side-cancel','side-long'].map(rect)),file=await rect('file'),label=await rect('file-label');
  assert.ok(buttons[0].width>75,'grown for the long label');for(const button of buttons){assert.equal(button.width,buttons[0].width);assert.equal(button.height,23);assert.equal(button.left,buttons[0].left);}
  const scroll=await page.locator('#side-long').evaluate(button=>button.scrollWidth<=button.clientWidth);assert.ok(scroll,'long label is not clipped');
  assert.equal(buttons[1].top-buttons[0].bottom,6);assert.equal(buttons[2].top-buttons[1].bottom,6);
  assert.equal(buttons[0].top-frame.top,11);assert.equal(frame.right-buttons[0].right,11);assert.equal(buttons[0].left-file.right,11,'body to button column');
  assert.equal(label.left-frame.left,11);assert.equal(label.top-frame.top,11);assert.equal(file.top-label.bottom,2,'label directly above its field');
});

test('property page: 7-unit inset and the small recommended size',async()=>{
  const sheet=await rect('page'),text=await rect('page-text');
  assert.deepEqual([sheet.width,sheet.height],[318,306]);assert.deepEqual([text.left-sheet.left,text.top-sheet.top],[11,11]);
});

test('long labels and narrow dialogs wrap without breaking the columns',async()=>{
  const narrow=await browser.newPage({viewport:{width:900,height:1000}});
  try{
    await narrow.goto(base);
    await narrow.evaluate(()=>{document.getElementById('bottom').style.width='230px';document.getElementById('kind-label').textContent='Dokumenttyp, der standardmäßig erstellt werden soll:';document.getElementById('cancel').textContent='Abbrechen und schließen';});
    const state=await narrow.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect();const form=r('form');return{label:r('kind-label'),name:r('name'),kind:r('kind'),form,cancel:r('cancel'),ok:r('ok'),clipped:document.getElementById('cancel').scrollWidth>document.getElementById('cancel').clientWidth};});
    assert.ok(state.label.height>25,'label wrapped');assert.ok(state.label.width<=state.form.width/2+0.5,'label column takes at most half');
    assert.equal(state.kind.left,state.name.left);assert.equal(state.kind.right,state.name.right);assert.equal(Math.round(state.kind.right),Math.round(state.form.right),'fields stay inside the body');
    assert.equal(state.clipped,false,'button label not clipped');assert.ok(state.cancel.height>23,'button grew taller');assert.equal(state.ok.height,state.cancel.height,'row keeps one height');assert.equal(state.ok.width,state.cancel.width);
  }finally{await narrow.close();}
});

test('existing class-based layout keeps its metrics',async()=>{
  const style=await page.evaluate(()=>{const get=(id,props)=>{const s=getComputedStyle(document.getElementById(id));return props.map(p=>s[p]);};return{body:get('old-body',['padding','display']),actions:get('old-actions',['padding','display','columnGap']),ok:get('old-ok',['minWidth','minHeight']),group:get('old-group',['padding','marginTop'])};});
  assert.deepEqual(style,{body:['8px','block'],actions:['8px','flex','6px'],ok:['75px','23px'],group:['8px','8px']});
});
