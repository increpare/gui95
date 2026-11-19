import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const kitRoot=fileURLToPath(new URL('../',import.meta.url));
let server,browser,page,base;
const fixture=`<!doctype html><html><head><link rel="stylesheet" href="/components/gui95.css"></head><body class="gui95">
<button id="before">Before menus</button><nav data-gui95-menubar aria-label="Application"><button id="file" data-gui95-menu="file-menu" data-gui95-mnemonic="f">File</button><button id="format" data-gui95-menu="format-menu" data-gui95-mnemonic="f">Format</button></nav>
<div id="file-menu" role="menu" hidden><button role="menuitem" id="new">New</button><button role="menuitem" id="unavailable" disabled>Unavailable</button><button role="menuitem" id="export" data-gui95-menu="export-menu">Export</button></div><div id="export-menu" role="menu" hidden><button role="menuitem" id="png">PNG</button><button role="menuitem" id="svg">SVG</button></div><div id="format-menu" role="menu" hidden><button role="menuitem">Format item</button></div>
<button id="opener" data-gui95-open-dialog="settings">Settings</button><dialog id="settings" data-gui95-dialog aria-labelledby="settings-title"><h2 id="settings-title">Settings</h2><input id="dialog-field" autofocus><button id="dialog-close" data-gui95-close-dialog="ok">OK</button><button data-gui95-open-dialog="confirm">Confirm</button></dialog><dialog id="confirm" data-gui95-dialog aria-labelledby="confirm-title"><h2 id="confirm-title">Confirm</h2><button data-gui95-close-dialog="cancel">Cancel</button></dialog>
<div data-gui95-toolbar aria-label="Tools"><button id="tool-a" data-gui95-toggle data-gui95-toggle-group="tools" aria-pressed="true">Select</button><button disabled>Unavailable</button><button id="tool-b" data-gui95-toggle data-gui95-toggle-group="tools" aria-pressed="false">Draw</button></div>
<label for="count">Count</label><input id="count" type="number" data-gui95-number min="0" max="10" step="2" value="4"><button id="increment" data-gui95-step="count" data-gui95-delta="1">Increase</button>
<ul data-gui95-tree aria-label="Files"><li id="branch" role="treeitem" aria-expanded="false"><span data-gui95-tree-label><span data-gui95-disclosure>+</span>Folder</span><ul role="group"><li id="leaf" role="treeitem"><span data-gui95-tree-label>Document</span></li></ul></li><li id="last" role="treeitem"><span data-gui95-tree-label>Other document</span></li></ul>
<div id="split" data-gui95-split data-gui95-axis="x" data-gui95-min="80" data-gui95-min-secondary="80" style="width:500px;height:100px"><div>First pane</div><div id="splitter" data-gui95-splitter aria-label="Resize panes"></div><div>Second pane</div></div><input id="text" value="ordinary text"><output id="activations">0</output>
<script type="module">try{window.gui95=await import('/components/gui95.mjs');window.controller=gui95.enhance()}catch{}document.querySelector('#png').addEventListener('click',()=>{document.querySelector('#activations').value=String(Number(document.querySelector('#activations').value)+1)});window.ready=true;</script></body></html>`;
before(async()=>{server=createServer(async(req,res)=>{if(req.url==='/'){res.setHeader('content-type','text/html');res.end(fixture);return}const path=req.url.split('?')[0];if(!/^\/(components|verify)\/[a-zA-Z0-9./-]+$/.test(path)||path.includes('..')){res.writeHead(404).end();return}try{res.setHeader('content-type',path.endsWith('.mjs')?'text/javascript':'text/css');res.end(await readFile(kitRoot+path))}catch{res.writeHead(404).end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch({headless:true})});
beforeEach(async()=>{await page?.close();page=await browser.newPage({viewport:{width:900,height:800}});await page.goto(base);await page.waitForFunction(()=>window.ready)});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r))});
const active=()=>page.evaluate(()=>document.activeElement.id);
// The selected menu item: the focused one, or the unavailable one its focused menu names as active descendant.
const selected=()=>page.evaluate(()=>document.activeElement.getAttribute('aria-activedescendant')||document.activeElement.id);
// Until 1.1.2 the arrow keys skipped unavailable commands. Windows stops on them (period evidence register: menu-keyboard-reaches-unavailable-items), and so does the kit now.
test('menu arrows stop on unavailable items, enter submenus and restore prior focus',async()=>{await page.locator('#before').focus();await page.keyboard.press('Alt+f');assert.equal(await page.locator('#file-menu').isVisible(),true);assert.equal(await active(),'new');await page.keyboard.press('ArrowDown');assert.equal(await selected(),'unavailable');await page.keyboard.press('ArrowDown');assert.equal(await active(),'export');await page.keyboard.press('ArrowRight');assert.equal(await active(),'png');await page.keyboard.press('Enter');assert.equal(await page.locator('#activations').textContent(),'1');assert.equal(await page.locator('#file-menu').isVisible(),false);assert.equal(await active(),'before')});
test('stationary pointer preserves keyboard submenu ownership; movement resumes pointer navigation',async()=>{await page.locator('#file').click();const box=await page.locator('#new').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.keyboard.press('Escape');await page.keyboard.press('Alt+f');await page.keyboard.press('End');await page.keyboard.press('ArrowRight');await page.waitForTimeout(100);assert.equal(await active(),'png');await page.keyboard.press('Enter');assert.equal(await page.locator('#activations').textContent(),'1');await page.keyboard.press('Alt+f');await page.keyboard.press('End');await page.mouse.move(box.x+box.width/2+2,box.y+box.height/2);assert.equal(await active(),'new')});
test('duplicate heading mnemonics cycle and ordinary text keys stay editable',async()=>{await page.keyboard.press('Alt+f');await page.keyboard.press('Alt+f');assert.equal(await page.locator('#format-menu').isVisible(),true);await page.keyboard.press('Escape');await page.locator('#text').focus();await page.keyboard.press('Home');await page.keyboard.type('f');assert.equal(await page.locator('#text').inputValue(),'fordinary text')});
test('pointer press-drag-release invokes a submenu command once',async()=>{const box=await page.locator('#file').boundingBox();await page.mouse.move(box.x+8,box.y+8);await page.mouse.down();const exp=await page.locator('#export').boundingBox();await page.mouse.move(exp.x+15,exp.y+8);await page.locator('#png').waitFor({state:'visible'});const cmd=await page.locator('#png').boundingBox();await page.mouse.move(cmd.x+8,cmd.y+8);await page.mouse.up();assert.equal(await page.locator('#activations').textContent(),'1');assert.equal(await page.locator('#file-menu').isVisible(),false)});
test('dialog close settles immediately, permits synchronous reopen and restores opener focus',async()=>{await page.locator('#opener').click();assert.equal(await active(),'dialog-field');const result=await page.evaluate(async()=>{const d=document.querySelector('#settings');gui95.closeDialog(d,'first');const reopened=gui95.openDialog(d);const open=d.open;gui95.closeDialog(d,'second');return{open,value:await reopened}});assert.deepEqual(result,{open:true,value:'second'});await page.waitForTimeout(30);assert.equal(await active(),'opener')});
test('nested dialogs consume one Escape and ignore repeated Escape on the lower dialog',async()=>{await page.locator('#opener').click();await page.locator('[data-gui95-open-dialog="confirm"]').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#confirm').evaluate(d=>d.open),false);assert.equal(await page.locator('#settings').evaluate(d=>d.open),true);await page.evaluate(()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',repeat:true,bubbles:true,cancelable:true})));assert.equal(await page.locator('#settings').evaluate(d=>d.open),true)});
test('toolbar arrows skip disabled controls and exclusive toggles expose pressed state',async()=>{await page.locator('#tool-a').focus();await page.keyboard.press('ArrowRight');assert.equal(await active(),'tool-b');await page.keyboard.press('Space');assert.equal(await page.locator('#tool-b').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#tool-a').getAttribute('aria-pressed'),'false')});
test('bounded numbers commit typed drafts before stepping and clamp to declared range',async()=>{await page.locator('#count').fill('9');await page.locator('#increment').click();assert.equal(await page.locator('#count').inputValue(),'10');await page.locator('#count').fill('-4');await page.locator('#text').focus();assert.equal(await page.locator('#count').inputValue(),'0')});
test('tree arrows expand, enter a child and return to the logical parent',async()=>{await page.locator('#branch').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#branch').getAttribute('aria-expanded'),'true');await page.keyboard.press('ArrowRight');assert.equal(await active(),'leaf');await page.keyboard.press('ArrowLeft');assert.equal(await active(),'branch');await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#branch').getAttribute('aria-expanded'),'false');await page.keyboard.press('ArrowDown');assert.equal(await active(),'last')});
test('splitter keyboard and pointer resizing stay within both pane bounds',async()=>{await page.locator('#splitter').focus();await page.keyboard.press('Home');assert.equal(await page.locator('#splitter').getAttribute('aria-valuenow'),'80');await page.keyboard.press('End');assert.equal(await page.locator('#splitter').getAttribute('aria-valuenow'),await page.locator('#splitter').getAttribute('aria-valuemax'));const box=await page.locator('#splitter').boundingBox();await page.mouse.move(box.x+2,box.y+10);await page.mouse.down();await page.mouse.move(0,box.y+10);await page.mouse.up();assert.equal(await page.locator('#splitter').getAttribute('aria-valuenow'),'80')});
test('enhancement is idempotent and destroy removes listeners',async()=>{await page.evaluate(()=>{gui95.enhance();gui95.enhance()});await page.locator('#tool-b').click();assert.equal(await page.locator('#tool-b').getAttribute('aria-pressed'),'true');await page.evaluate(()=>controller.destroy());await page.locator('#tool-b').click();assert.equal(await page.locator('#tool-b').getAttribute('aria-pressed'),'true')});
test('aria-disabled menu commands cannot activate application listeners',async()=>{await page.evaluate(()=>{const item=document.createElement('button');item.id='aria-disabled';item.setAttribute('role','menuitem');item.setAttribute('aria-disabled','true');item.textContent='Disabled command';item.onclick=()=>{document.querySelector('#activations').value='99'};document.querySelector('#file-menu').append(item)});await page.keyboard.press('Alt+f');await page.evaluate(()=>document.querySelector('#aria-disabled').click());assert.equal(await page.locator('#activations').textContent(),'0')});
test('splitter pointer cancellation restores the committed drag start',async()=>{await page.locator('#splitter').focus();await page.keyboard.press('Home');const box=await page.locator('#splitter').boundingBox();await page.mouse.move(box.x+2,box.y+10);await page.mouse.down();await page.mouse.move(box.x+60,box.y+10);await page.locator('#splitter').evaluate(bar=>bar.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));await page.mouse.up();assert.equal(await page.locator('#splitter').getAttribute('aria-valuenow'),'80')});
test('disabled tree branches cannot expand and the first enabled visible item owns the tab stop',async()=>{await page.evaluate(()=>{controller.destroy();document.querySelector('#branch').setAttribute('aria-disabled','true');window.controller=gui95.enhance()});assert.equal(await page.locator('#last').getAttribute('tabindex'),'0');await page.locator('#branch [data-gui95-disclosure]').click({force:true});assert.equal(await page.locator('#branch').getAttribute('aria-expanded'),'false')});
test('numeric upper bounds remain aligned to their declared step',async()=>{await page.locator('#count').evaluate(input=>{input.max='9';input.value='9'});await page.locator('#count').focus();await page.locator('#text').focus();assert.equal(await page.locator('#count').inputValue(),'8');assert.equal(await page.locator('#count').evaluate(input=>input.validity.valid),true)});
test('destroy settles managed dialogs before enhanced markup is removed',async()=>{await page.locator('#opener').click();const result=await page.evaluate(async()=>{const pending=gui95.openDialog(document.querySelector('#settings'));controller.destroy();return{open:document.querySelector('#settings').open,value:await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve('unsettled'),50))])}});assert.deepEqual(result,{open:false,value:'cancel'})});
test('toolbar value controls retain native arrows and button Space stays owned by the toolbar',async()=>{await page.evaluate(()=>{const input=document.createElement('input');input.type='number';input.id='toolbar-count';input.value='4';input.setAttribute('aria-label','Toolbar count');document.querySelector('[data-gui95-toolbar]').append(input);window.unownedKeys=0;document.addEventListener('keydown',event=>{if(event.key===' ')window.unownedKeys++})});await page.locator('#toolbar-count').focus();await page.keyboard.press('ArrowUp');assert.equal(await page.locator('#toolbar-count').inputValue(),'5');assert.equal(await active(),'toolbar-count');await page.locator('#tool-b').focus();await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>window.unownedKeys),0);assert.equal(await page.locator('#tool-b').getAttribute('aria-pressed'),'true')});
for(const scale of [1,1.25,1.5,2])test(`menu/dialog focus and numeric bounds operate at device scale ${scale}`,async()=>{const scaled=await browser.newPage({viewport:{width:480,height:700},deviceScaleFactor:scale});try{await scaled.goto(base);await scaled.waitForFunction(()=>window.ready);await scaled.locator('#before').focus();await scaled.keyboard.press('Alt+f');await scaled.keyboard.press('End');await scaled.keyboard.press('ArrowRight');assert.equal(await scaled.evaluate(()=>document.activeElement.id),'png');await scaled.keyboard.press('Enter');assert.equal(await scaled.locator('#activations').textContent(),'1');await scaled.locator('#opener').click();await scaled.keyboard.press('Escape');assert.equal(await scaled.evaluate(()=>document.activeElement.id),'opener');await scaled.locator('#count').fill('99');await scaled.locator('#text').focus();assert.equal(await scaled.locator('#count').inputValue(),'10')}finally{await scaled.close()}});
test('the first real pointer move after keyboard opening resumes menu pointer ownership',async()=>{await page.keyboard.press('Alt+f');await page.keyboard.press('End');assert.equal(await active(),'export');const box=await page.locator('#new').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);assert.equal(await active(),'new')});
test('a direct native close followed by immediate wrapper reopen settles both sessions',async()=>{await page.locator('#opener').click();const values=await page.evaluate(async()=>{const dialog=document.querySelector('#settings');const first=gui95.openDialog(dialog);dialog.close('native');const second=gui95.openDialog(dialog);gui95.closeDialog(dialog,'reopened');return await Promise.race([Promise.all([first,second]),new Promise(resolve=>setTimeout(()=>resolve(['unsettled']),50))])});assert.deepEqual(values,['native','reopened'])});
test('toolbar keeps an enabled Tab entry when its current command becomes disabled',async()=>{
  await page.evaluate(()=>{controller.destroy();document.body.innerHTML='<button id="before">Before</button><div data-gui95-toolbar aria-label="Edit"><button id="first">Cut</button><button id="second">Copy</button></div><button id="after">After</button>';window.controller=gui95.enhance();document.querySelector('#first').disabled=true});
  await page.locator('#before').focus();await page.keyboard.press('Tab');assert.equal(await active(),'second');assert.equal(await page.locator('#first').getAttribute('tabindex'),'-1');
  await page.locator('#first').evaluate(button=>{button.disabled=false});assert.equal(await page.locator('#first').getAttribute('tabindex'),'-1');assert.equal(await page.locator('#second').getAttribute('tabindex'),'0');
});
test('toolbar repairs hidden and aria-disabled entry states across mixed native controls',async()=>{
  await page.evaluate(()=>{controller.destroy();document.body.innerHTML='<button id="before">Before</button><div data-gui95-toolbar aria-label="Edit"><button id="first">Cut</button><span id="field-wrapper"><label for="mixed-field">Count</label><input type="number" id="mixed-field" value="2"></span><textarea id="mixed-notes" aria-label="Notes"></textarea></div><button id="after">After</button>';window.controller=gui95.enhance();document.querySelector('#first').setAttribute('aria-disabled','true')});
  await page.locator('#before').focus();await page.keyboard.press('Tab');assert.equal(await active(),'mixed-field');
  await page.locator('#field-wrapper').evaluate(wrapper=>{wrapper.hidden=true});await page.locator('#before').focus();await page.keyboard.press('Tab');assert.equal(await active(),'mixed-notes');
  await page.locator('#mixed-notes').evaluate(input=>{input.disabled=true});await page.locator('#before').focus();await page.keyboard.press('Tab');assert.equal(await active(),'after');
  await page.locator('#mixed-notes').evaluate(input=>{input.disabled=false});await page.locator('#before').focus();await page.keyboard.press('Tab');assert.equal(await active(),'mixed-notes');
});
test('tree keeps a reachable Tab entry after its current row becomes unavailable',async()=>{
  await page.evaluate(()=>{controller.destroy();document.body.innerHTML='<button id="before">Before</button><ul data-gui95-tree aria-label="Files"><li id="first" role="treeitem"><span data-gui95-tree-label>First</span></li><li id="second" role="treeitem"><span data-gui95-tree-label>Second</span></li></ul><button id="after">After</button>';window.controller=gui95.enhance();document.querySelector('#first').setAttribute('aria-disabled','true')});
  await page.locator('#before').focus();await page.keyboard.press('Tab');assert.equal(await active(),'second');assert.equal(await page.locator('#first').getAttribute('tabindex'),'-1');
  await page.locator('#first').evaluate(row=>{row.removeAttribute('aria-disabled')});assert.equal(await page.locator('#first').getAttribute('tabindex'),'-1');
  await page.locator('#second').evaluate(row=>{row.hidden=true});await page.locator('#before').focus();await page.keyboard.press('Tab');assert.equal(await active(),'first');
});
test('tree Right enters the first enabled child when earlier children are disabled',async()=>{await page.evaluate(()=>{const disabled=document.createElement('li');disabled.setAttribute('role','treeitem');disabled.setAttribute('aria-disabled','true');disabled.innerHTML='<span data-gui95-tree-label>Unavailable child</span>';document.querySelector('#branch [role=group]').prepend(disabled);controller.destroy();window.controller=gui95.enhance()});await page.locator('#branch').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');assert.equal(await active(),'leaf')});
test('checked menu commands have a visible indicator in normal and focused states',async()=>{await page.evaluate(()=>{const checkbox=document.createElement('button');checkbox.id='word-wrap';checkbox.setAttribute('role','menuitemcheckbox');checkbox.setAttribute('aria-checked','true');checkbox.textContent='Word Wrap';document.querySelector('#file-menu').append(checkbox)});await page.keyboard.press('Alt+f');const normal=await page.locator('#word-wrap').evaluate(item=>{const style=getComputedStyle(item,'::before');return{mask:style.maskImage,fill:style.backgroundColor,color:style.color}});assert.match(normal.mask,/^url\("data:image\/svg/,'checked menu indicator is drawn');assert.equal(normal.fill,'rgb(0, 0, 0)');await page.keyboard.press('End');assert.equal(await active(),'word-wrap');assert.deepEqual(await page.locator('#word-wrap').evaluate(item=>{const style=getComputedStyle(item,'::before');return[style.color,style.backgroundColor]}),['rgb(255, 255, 255)','rgb(255, 255, 255)'])});
test('menu check and option marks are pixel artwork in the item colour, embossed when unavailable, not font glyphs',async()=>{
  await page.evaluate(()=>{const menu=document.querySelector('#file-menu');menu.hidden=false;menu.insertAdjacentHTML('beforeend','<button id="mark-check" role="menuitemcheckbox" aria-checked="true">Wrap</button><button id="mark-option" role="menuitemradio" aria-checked="true">Large</button><button id="mark-check-off" role="menuitemcheckbox" aria-checked="true" disabled>Ruler</button><button id="mark-option-off" role="menuitemradio" aria-checked="true" aria-disabled="true">Small</button>')});
  const mark=id=>page.evaluate(id=>{const item=document.getElementById(id),s=getComputedStyle(item,'::before'),box=item.getBoundingClientRect();return{content:s.content,mask:s.maskImage,image:s.backgroundImage,fill:s.backgroundColor,w:s.width,h:s.height,top:parseFloat(s.top),itemHeight:box.height}},id);
  const check=await mark('mark-check'),option=await mark('mark-option'),checkOff=await mark('mark-check-off'),optionOff=await mark('mark-option-off');
  for(const drawn of [check,option,checkOff,optionOff])assert.doesNotMatch(drawn.content,/[✓●]/,'no font glyph');
  assert.deepEqual([check.w,check.h],['7px','7px'],'the 7 x 7 check');assert.deepEqual([option.w,option.h],['6px','6px'],'a 6 x 6 option mark');
  assert.match(check.mask,/^url\("data:image\/svg/);assert.match(option.mask,/^url\("data:image\/svg/);assert.notEqual(check.mask,option.mask);
  assert.equal(check.fill,'rgb(0, 0, 0)','drawn in the item colour');
  for(const drawn of [check,option])assert.ok(Number.isInteger(drawn.top),`the mark sits on a whole pixel: ${drawn.top}`);
  for(const drawn of [checkOff,optionOff]){assert.equal(drawn.mask,'none','unavailable marks are drawn, not masked');assert.match(drawn.image,/^url\("data:image\/svg/);assert.equal(drawn.fill,'rgba(0, 0, 0, 0)');assert.deepEqual([drawn.w,drawn.h],drawn===checkOff?['8px','8px']:['7px','7px'],'gray mark plus its white emboss')}
  assert.notEqual(checkOff.image,optionOff.image);
});
test('pressed and open states keep each control family at its resting size',async()=>{
  const rows=await page.evaluate(()=>{controller.destroy();document.body.innerHTML='<div class="title-bar"><span>Caption</span><button id="caption-close" aria-label="Close">x</button></div><nav data-gui95-menubar aria-label="Application"><button id="heading">File</button></nav><div data-gui95-toolbar aria-label="Tools"><button id="tool">Cut</button></div><button id="plain">Upload site</button><div role="menu"><button id="item" role="menuitem">Open</button></div><div role="tablist"><button id="tab" role="tab" aria-selected="true">General</button></div>';
    const measure=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{w:r.width,h:r.height,top:s.paddingTop,left:s.paddingLeft,shadow:s.boxShadow,background:s.backgroundColor,color:s.color}};
    return [...document.querySelectorAll('button')].map(el=>{const rest=measure(el);el.dataset.gui95State='pressed';const pressed=measure(el);delete el.dataset.gui95State;if(el.id==='heading'){el.setAttribute('aria-expanded','true')}const open=measure(el);return{id:el.id,rest,pressed,open}})});
  for(const {id,rest,pressed,open} of rows){
    assert.deepEqual([pressed.w,pressed.h],[rest.w,rest.h],`${id} keeps its size while pressed`);
    assert.deepEqual([open.w,open.h],[rest.w,rest.h],`${id} keeps its size while open`);
    if(['caption-close','tool','plain'].includes(id)){assert.equal(parseFloat(pressed.top),parseFloat(rest.top)+1,`${id} content moves down`);assert.equal(parseFloat(pressed.left),parseFloat(rest.left)+1,`${id} content moves right`)}
    else{assert.equal(pressed.top,rest.top,`${id} is not a push button`);assert.equal(pressed.shadow,id==='heading'?'none':rest.shadow,`${id} does not sink`)}
  }
  const heading=rows.find(row=>row.id==='heading');
  assert.deepEqual([heading.rest.shadow,heading.rest.background],['none','rgb(192, 192, 192)'],'a resting menu heading is flat gray');
  for(const state of ['pressed','open']){const drawn=heading[state];
    assert.deepEqual([drawn.top,drawn.left],[heading.rest.top,heading.rest.left],`a ${state} menu heading keeps its label in place`);
    assert.deepEqual([drawn.background,drawn.color,drawn.shadow],['rgb(0, 0, 128)','rgb(255, 255, 255)','none'],`a ${state} menu heading is a flat navy highlight`)}
});
test('menu-bar headings highlight flat navy in menu mode, without a focus rectangle, and unavailable headings never highlight',async()=>{
  await page.evaluate(()=>{document.querySelector('#file').innerHTML='<u id="file-key">F</u>ile';document.querySelector('nav[data-gui95-menubar]').insertAdjacentHTML('beforeend','<button id="off-heading" disabled>Tools</button>')});
  const look=id=>page.evaluate(id=>{const s=getComputedStyle(document.getElementById(id));return{background:s.backgroundColor,color:s.color,shadow:s.boxShadow,outline:s.outlineStyle,textShadow:s.textShadow}},id);
  await page.locator('#before').focus();await page.keyboard.press('Alt+f');
  assert.deepEqual(await look('file'),{background:'rgb(0, 0, 128)',color:'rgb(255, 255, 255)',shadow:'none',outline:'none',textShadow:'none'},'the open heading is highlighted');
  assert.equal((await look('file-key')).color,'rgb(255, 255, 255)','the underlined mnemonic stays visible in white');
  assert.equal((await look('format')).background,'rgb(192, 192, 192)','other headings stay gray');
  const box=await page.locator('#format').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  assert.equal(await active(),'format');assert.deepEqual(await look('format'),{background:'rgb(0, 0, 128)',color:'rgb(255, 255, 255)',shadow:'none',outline:'none',textShadow:'none'},'moving along the bar moves the highlight');
  assert.equal((await look('file')).background,'rgb(192, 192, 192)');
  await page.keyboard.press('Escape');await page.locator('#file').focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
  assert.equal(await active(),'file');assert.equal((await look('file')).background,'rgb(192, 192, 192)','a heading reached by Tab outside menu mode is not highlighted');
  const off=await page.evaluate(()=>{const el=document.querySelector('#off-heading');el.dataset.gui95State='pressed';el.setAttribute('aria-expanded','true');const s=getComputedStyle(el);return{background:s.backgroundColor,color:s.color,textShadow:s.textShadow,shadow:s.boxShadow}});
  assert.deepEqual(off,{background:'rgb(192, 192, 192)',color:'rgb(128, 128, 128)',textShadow:'rgb(255, 255, 255) 1px 1px 0px',shadow:'none'},'an unavailable heading stays gray embossed');
});
test('the scope root itself uses border-box sizing',async()=>{
  const size=await page.evaluate(()=>{document.body.classList.remove('gui95');const root=document.createElement('div');root.setAttribute('data-gui95','');root.style.cssText='width:120px;height:60px;padding:10px;border:3px solid';document.body.append(root);return[root.offsetWidth,root.offsetHeight]});
  assert.deepEqual(size,[120,60]);
});
test('a submenu arrow is a hard-edged 4 x 7 pixel triangle in the item colour',async()=>{
  await page.evaluate(()=>{controller.destroy();document.body.innerHTML='<div role="menu" style="width:120px"><button id="cascade" role="menuitem" data-gui95-menu="nowhere" aria-label="More"></button><button id="cascade-on" role="menuitem" data-gui95-menu="nowhere" aria-label="More"></button></div>'});
  const arrow=await page.locator('#cascade').evaluate(item=>{const s=getComputedStyle(item,'::after');return{mask:s.maskImage,fill:s.backgroundColor,w:s.width,h:s.height,border:s.borderLeftWidth}});
  assert.match(arrow.mask,/^url\("data:image\/svg/);assert.deepEqual([arrow.w,arrow.h,arrow.border],['4px','7px','0px']);assert.equal(arrow.fill,'rgb(0, 0, 0)');
  const colours=[...new Set((await pixels('cascade')).flat())].sort();assert.deepEqual(colours,['#000000','#c0c0c0'],'no anti-aliased edge pixels');
  const rows=(await pixels('cascade')).map(row=>row.filter(c=>c==='#000000').length).filter(Boolean);assert.deepEqual(rows,[1,2,3,4,3,2,1]);
  await page.locator('#cascade-on').focus();assert.equal(await page.locator('#cascade-on').evaluate(item=>getComputedStyle(item,'::after').backgroundColor),'rgb(255, 255, 255)','white on the highlight');
});
test('a tree connector line drops from the centre column of its parent disclosure box',async()=>{
  await page.evaluate(()=>{controller.destroy();document.body.innerHTML='<ul data-gui95-tree aria-label="Files"><li role="treeitem" aria-expanded="true"><span data-gui95-tree-label><span id="box" data-gui95-disclosure></span>Folder</span><ul id="branch" role="group"><li id="child" role="treeitem"><span data-gui95-tree-label>Document</span></li><li id="last" role="treeitem"><span data-gui95-tree-label>Other</span></li></ul></li></ul>'});
  const geometry=await page.evaluate(()=>{const box=document.getElementById('box').getBoundingClientRect(),group=document.getElementById('branch').getBoundingClientRect(),child=document.getElementById('child'),last=document.getElementById('last'),r=child.getBoundingClientRect(),c=getComputedStyle(child,'::before'),m=getComputedStyle(last,'::after');return{boxCentre:box.left+(box.width-1)/2,line:group.left,connector:r.left+parseFloat(c.left),mask:last.getBoundingClientRect().left+parseFloat(m.left)}});
  assert.equal(geometry.line,geometry.boxCentre,'the vertical line is in the box centre column');
  assert.equal(geometry.connector,geometry.line+1,'each child connector starts beside the line');assert.equal(geometry.mask,geometry.line,'the last child hides the line below its connector');
});
test('checked and radio menu marks stay out of the computed accessible name',async()=>{
  await page.evaluate(()=>{const menu=document.querySelector('#file-menu');menu.hidden=false;menu.insertAdjacentHTML('beforeend','<button role="menuitemcheckbox" aria-checked="true">Word wrap</button><button role="menuitemradio" aria-checked="true">Large icons</button>')});
  const cdp=await page.context().newCDPSession(page);
  const {nodes}=await cdp.send('Accessibility.getFullAXTree');
  const names=nodes.filter(node=>['menuitemcheckbox','menuitemradio'].includes(node.role?.value)).map(node=>node.name?.value);
  assert.deepEqual(names.sort(),['Large icons','Word wrap']);
  const mark=await page.locator('[role="menuitemcheckbox"]').evaluate(el=>getComputedStyle(el,'::before').maskImage);
  assert.match(mark,/^url\("data:image\/svg/,'the check mark is still drawn');
});
const primitives=`<div style="padding:10px;width:400px"><label><input id="check" type="checkbox"> Plain</label><label><input id="checked" type="checkbox" checked> Checked</label><label><input id="check-off" type="checkbox" disabled> Unavailable</label><label><input id="option" type="radio" name="o"> One</label><label><input id="option-on" type="radio" name="o" checked> Two</label><label>Zoom <select id="drop"><option>100%</option><option>200%</option></select></label><label>Level <input id="slide" type="range" value="40"></label><progress id="bar" value="40" max="100" aria-label="Copying"></progress><ul id="list" role="listbox" aria-label="Fonts" tabindex="0"><li id="row" role="option" aria-selected="false">Arial</li><li id="row-on" role="option" aria-selected="true">Tahoma</li></ul><div id="strip" role="tablist" aria-label="Pages"><button id="tab-on" role="tab" aria-selected="true" aria-controls="panel">General</button><button id="tab-off" role="tab" aria-selected="false" aria-controls="panel">Display</button></div><div id="panel" role="tabpanel">Page</div><div id="scroller" style="width:120px;height:60px;overflow:scroll"><div style="width:400px;height:400px"></div></div></div>`;
const usePrimitives=()=>page.evaluate(html=>{controller.destroy();document.body.innerHTML=html},primitives);
const computed=(id,props,pseudo)=>page.evaluate(([id,props,pseudo])=>{const el=document.getElementById(id),s=getComputedStyle(el,pseudo||undefined),r=el.getBoundingClientRect();return{...Object.fromEntries(props.map(p=>[p,s[p]])),w:r.width,h:r.height,top:r.top,bottom:r.bottom,left:r.left,right:r.right}},[id,props,pseudo]);
test('check boxes are drawn by the stylesheet as 13px sunken white boxes with a pixel check mark',async()=>{await usePrimitives();
  const plain=await computed('check',['appearance','backgroundColor','backgroundImage','boxShadow','borderTopLeftRadius']),on=await computed('checked',['backgroundImage']),off=await computed('check-off',['backgroundColor']);
  assert.equal(plain.appearance,'none');assert.deepEqual([plain.w,plain.h],[13,13]);assert.equal(plain.backgroundColor,'rgb(255, 255, 255)');assert.equal(plain.borderTopLeftRadius,'0px');assert.match(plain.boxShadow,/inset/);
  assert.equal(plain.backgroundImage,'none','an unchecked box has no mark');assert.match(on.backgroundImage,/^url\("data:image\/svg/,'a checked box draws its mark');assert.equal(off.backgroundColor,'rgb(192, 192, 192)','an unavailable box uses the control face');
});
test('option buttons are 12px pixel artwork without a CSS radius',async()=>{await usePrimitives();
  const off=await computed('option',['appearance','backgroundImage','borderTopLeftRadius']),on=await computed('option-on',['backgroundImage']);
  assert.equal(off.appearance,'none');assert.deepEqual([off.w,off.h],[12,12]);assert.equal(off.borderTopLeftRadius,'0px');assert.match(off.backgroundImage,/^url\("data:image\/svg/);assert.notEqual(on.backgroundImage,off.backgroundImage,'the selected option has its own artwork');
});
test('drop-down lists, sliders and progress bars do not use the host appearance',async()=>{await usePrimitives();
  const drop=await computed('drop',['appearance','backgroundImage','paddingRight','borderTopLeftRadius']),slide=await computed('slide',['appearance']),bar=await computed('bar',['appearance','boxShadow','backgroundColor']);
  assert.equal(drop.appearance,'none');assert.match(drop.backgroundImage,/url\("data:image\/svg/,'the drop-down button arrow is drawn');assert.ok(parseFloat(drop.paddingRight)>=18,'text clears the 16px button');assert.equal(drop.borderTopLeftRadius,'0px');
  assert.equal(slide.appearance,'none');assert.equal(bar.appearance,'none');assert.match(bar.boxShadow,/inset/);assert.equal(bar.backgroundColor,'rgb(192, 192, 192)');
});
test('a list box is a sunken white well whose selected row is navy',async()=>{await usePrimitives();
  const list=await computed('list',['backgroundColor','boxShadow']),row=await computed('row',['backgroundColor','color']),on=await computed('row-on',['backgroundColor','color']);
  assert.equal(list.backgroundColor,'rgb(255, 255, 255)');assert.match(list.boxShadow,/inset/);assert.equal(on.backgroundColor,'rgb(0, 0, 128)');assert.equal(on.color,'rgb(255, 255, 255)');assert.notEqual(row.backgroundColor,on.backgroundColor);
});
test('the selected tab is 2px larger on every side and alone overlaps its page',async()=>{await usePrimitives();
  const on=await computed('tab-on',['boxShadow','backgroundColor']),off=await computed('tab-off',['boxShadow']),panel=await computed('panel',['boxShadow']),strip=await computed('strip',[]);
  assert.equal(on.h,off.h+4,'selected tab is 2px taller above and 2px deeper below');assert.equal(on.top,off.top-2);
  assert.equal(on.left,strip.left,'a selected first tab is flush with the page edge');assert.equal(off.left,on.right-2,'the selected tab overlaps its neighbour by 2px');
  assert.equal(off.bottom,panel.top,'an inactive tab stops at the page edge');assert.equal(on.bottom,panel.top+2,'only the selected tab covers the page bevel');
  assert.match(panel.boxShadow,/inset/);assert.equal(on.backgroundColor,'rgb(192, 192, 192)');
  const before=await computed('tab-off',[]);await page.locator('#tab-off').evaluate(el=>{el.setAttribute('aria-selected','true');document.getElementById('tab-on').setAttribute('aria-selected','false')});const now=await computed('tab-off',[]);
  assert.equal(now.left+2,before.left,'selecting grows the tab outward');assert.equal(now.right-2,before.right,'without moving its neighbours');
});
test('scrolling regions use 16px classic scrollbars',async()=>{await usePrimitives();
  const bar=await computed('scroller',['width','height'],'::-webkit-scrollbar');assert.deepEqual([bar.width,bar.height],['16px','16px']);
  // Playwright's headless Chromium hides scrollbars, so their painted layout needs a headed check.
  const button=await computed('scroller',['width','height','backgroundImage'],'::-webkit-scrollbar-button');assert.deepEqual([button.width,button.height],['16px','16px']);
});
test('an unavailable text field and drop-down list take the gray control face',async()=>{await page.evaluate(()=>{controller.destroy();document.body.innerHTML='<label>Name <input id="field"></label><label>Old <input id="field-off" disabled value="x"></label><label>Zoom <select id="drop-off" disabled><option>100%</option></select></label>'});
  const on=await computed('field',['backgroundColor']),off=await computed('field-off',['backgroundColor','color']),drop=await computed('drop-off',['backgroundColor','color']);
  assert.equal(on.backgroundColor,'rgb(255, 255, 255)');assert.equal(off.backgroundColor,'rgb(192, 192, 192)');assert.equal(off.color,'rgb(128, 128, 128)');assert.equal(drop.backgroundColor,'rgb(192, 192, 192)');assert.equal(drop.color,'rgb(128, 128, 128)');
});
const additions=`<div style="padding:10px;width:400px"><button id="plain-button">OK</button><button id="default-button" class="default">OK</button><button id="default-attr" data-gui95-default>OK</button><label>Path <input id="read-only" readonly value="C:\\\\"></label><label>Notes <textarea id="read-only-notes" readonly>x</textarea></label><progress id="busy" max="100" aria-label="Working"></progress><div style="position:absolute;left:600px;top:20px"><input id="vertical" type="range" aria-label="Balance" aria-orientation="vertical" style="writing-mode:vertical-lr;direction:rtl;width:30px;height:130px"></div><label>Files <select id="files-list" size="3" multiple><option id="file-on" selected>One</option><option id="file-off">Two</option></select></label></div>`;
// Chromium reports host styles for progress and slider part pseudo-elements, so those parts are checked from rendered pixels.
const pixels=async id=>{const png=(await page.locator('#'+id).screenshot()).toString('base64');return page.evaluate(async src=>{const img=new Image();img.src='data:image/png;base64,'+src;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const d=ctx.getImageData(0,0,canvas.width,canvas.height).data;return Array.from({length:canvas.height},(_,y)=>Array.from({length:canvas.width},(_,x)=>{const o=(y*canvas.width+x)*4;return '#'+[d[o],d[o+1],d[o+2]].map(v=>v.toString(16).padStart(2,'0')).join('')}))},png)};
const useAdditions=()=>page.evaluate(html=>{controller.destroy();document.body.innerHTML=html},additions);
// Until 1.1.2 the frame was an outer shadow, so a default button painted one pixel past its box on every side. Windows drew the frame inside the button's rectangle and the bevel inside the frame (register: button-default-frame-inside).
test('a default push button draws its 1px black frame inside its own box, with the raised bevel inside the frame',async()=>{await useAdditions();
  const plain=await computed('plain-button',['boxShadow']),on=await computed('default-button',['boxShadow']),attr=await computed('default-attr',['boxShadow']);
  assert.equal(on.boxShadow,'rgb(0, 0, 0) 0px 0px 0px 1px inset, rgb(0, 0, 0) -2px -2px 0px 0px inset, rgb(255, 255, 255) 2px 2px 0px 0px inset, rgb(128, 128, 128) -3px -3px 0px 0px inset, rgb(223, 223, 223) 3px 3px 0px 0px inset','the frame, then the raised bevel one pixel further in, bottom and right first');assert.equal(attr.boxShadow,on.boxShadow,'the data attribute is equivalent');
  assert.deepEqual([on.w,on.h],[plain.w,plain.h],'the frame does not change the button size');
  await onPixels('<button id="default-button" class="default" style="width:75px">OK</button>');const box=await page.locator('#default-button').boundingBox(),around=await page.screenshot({clip:{x:box.x-1,y:box.y-1,width:box.width+2,height:box.height+2}});
  const ring=await page.evaluate(async src=>{const img=new Image();img.src='data:image/png;base64,'+src;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);const at=(px,py)=>[...x.getImageData(px,py,1,1).data].slice(0,3).join();return{outside:[at(0,5),at(5,0),at(c.width-1,5),at(5,c.height-1)],frame:[at(1,5),at(5,1),at(c.width-2,5),at(5,c.height-2)]}},around.toString('base64'));
  assert.deepEqual(ring.outside,Array(4).fill('192,192,192'),'nothing is painted outside the box');assert.deepEqual(ring.frame,Array(4).fill('0,0,0'),'the outermost pixel of the box is the frame');
  await page.locator('#default-button').evaluate(el=>el.dataset.gui95State='pressed');const pressed=await computed('default-button',['boxShadow']);
  assert.equal(pressed.boxShadow,'rgb(0, 0, 0) 0px 0px 0px 1px inset, rgb(128, 128, 128) 0px 0px 0px 2px inset','pressed keeps the frame and draws one shadow line round a flat face, as Windows does for the default button');assert.deepEqual([pressed.w,pressed.h],[75,plain.h]);
});
test('read-only text fields use the gray control face with black text',async()=>{await useAdditions();
  for(const id of ['read-only','read-only-notes']){const field=await computed(id,['backgroundColor','color']);assert.equal(field.backgroundColor,'rgb(192, 192, 192)',id);assert.equal(field.color,'rgb(0, 0, 0)',id);}
});
test('an indeterminate progress bar shows a still 2px dither instead of blocks',async()=>{await useAdditions();
  const bar=await computed('busy',['backgroundImage','backgroundSize','animationName']);
  assert.match(bar.backgroundImage,/^repeating-conic-gradient\(rgb\(255, 255, 255\) 0%, rgb\(255, 255, 255\) 25%, rgb\(192, 192, 192\) 0%, rgb\(192, 192, 192\) 50%\)/);assert.match(bar.backgroundSize,/^2px 2px/);assert.equal(bar.animationName,'none');
  const rows=await pixels('busy'),inside=rows.slice(3,-3).flatMap(row=>row.slice(3,-3));
  assert.equal(inside.includes('#000080'),false,'no navy blocks');assert.deepEqual([...new Set(inside)].sort(),['#c0c0c0','#ffffff'],'only the dither colours');assert.notEqual(rows[4][4],rows[4][5],'neighbouring pixels alternate');
});
test('a vertical slider has a 4px channel and a 21 x 11 thumb',async()=>{await useAdditions();
  const rows=await pixels('vertical'),marked=row=>row.flatMap((colour,x)=>colour==='#c0c0c0'?[]:[x]);
  const channel=marked(rows[4]);assert.equal(channel.length,4,'a 4px channel');assert.equal(channel.at(-1)-channel[0],3,'drawn as one strip');assert.deepEqual(rows.slice(4,-4).map(row=>marked(row).length>=4),rows.slice(4,-4).map(()=>true),'the channel runs the full height');
  const thumb=rows.flatMap((row,y)=>marked(row).filter(x=>x<channel[0]||x>channel.at(-1)).map(x=>({x,y})));const xs=thumb.map(p=>p.x),ys=thumb.map(p=>p.y);
  assert.deepEqual([Math.max(...xs)-Math.min(...xs)+1,Math.max(...ys)-Math.min(...ys)+1],[21,11],'a 21 x 11 thumb');
  assert.ok(Math.abs((Math.min(...xs)+Math.max(...xs))/2-(channel[0]+channel.at(-1))/2)<=0.5,'the thumb is centred on the channel');
});
test('the selected row of a list-style select is navy with white text',async()=>{await useAdditions();
  const on=await computed('file-on',['backgroundImage','color']),off=await computed('file-off',['backgroundImage','color']);
  assert.equal(on.backgroundImage,'linear-gradient(rgb(0, 0, 128), rgb(0, 0, 128))');assert.equal(on.color,'rgb(255, 255, 255)');assert.equal(off.backgroundImage,'none');
});
const useMarkup=html=>page.evaluate(html=>{controller.destroy();document.body.innerHTML=html;window.controller=gui95.enhance()},html);
// For pixel checks: a row of controls placed on whole pixels, clear of each other.
const onPixels=html=>useMarkup(`<div style="position:absolute;left:20px;top:20px;display:flex;gap:12px;align-items:flex-start">${html}</div>`);
const activeText=()=>page.evaluate(()=>document.activeElement.textContent.trim());
test('a managed modal dialog wraps Tab and Shift+Tab among its own available controls',async()=>{
  await page.locator('#settings').evaluate(dialog=>dialog.insertAdjacentHTML('beforeend','<button disabled>Off</button><button hidden>Gone</button><button style="display:none">Undrawn</button>'));
  await page.locator('#opener').click();assert.equal(await active(),'dialog-field');
  await page.locator('[data-gui95-open-dialog="confirm"]').focus();await page.keyboard.press('Tab');assert.equal(await active(),'dialog-field','Tab on the last control wraps to the first');
  await page.keyboard.press('Shift+Tab');assert.equal(await activeText(),'Confirm','Shift+Tab on the first control wraps to the last');
  await page.keyboard.press('Shift+Tab');assert.equal(await active(),'dialog-close','ordinary movement inside the dialog is unchanged');
});
test('only the top nested dialog wraps Tab',async()=>{
  await page.locator('#opener').click();await page.locator('[data-gui95-open-dialog="confirm"]').click();
  await page.locator('#confirm button').focus();
  for(const key of ['Tab','Shift+Tab','Tab']){await page.keyboard.press(key);assert.equal(await page.evaluate(()=>document.activeElement.closest('dialog')?.id),'confirm',`${key} stays in the top dialog`)}
  await page.keyboard.press('Escape');await page.locator('#dialog-close').focus();await page.keyboard.press('Tab');await page.keyboard.press('Tab');assert.equal(await active(),'dialog-field','the lower dialog wraps again once it is on top');
});
test('Enter in a number field commits the value and still submits its dialog form',async()=>{
  await useMarkup('<button id="opener">Open</button><dialog id="sized" data-gui95-dialog aria-label="Size"><form method="dialog"><input id="size" type="number" data-gui95-number min="0" max="10" step="2" value="4" aria-label="Size"><button id="ok" value="ok">OK</button></form></dialog>');
  await page.evaluate(()=>{window.enters=0;document.addEventListener('keydown',event=>{if(event.key==='Enter')window.enters++});window.submitted=null;document.querySelector('form').addEventListener('submit',()=>{window.submitted=document.querySelector('#size').value});window.result=gui95.openDialog(document.querySelector('#sized'))});
  await page.locator('#size').fill('5');await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>window.enters),1,'Enter reaches listeners further up');
  assert.equal(await page.evaluate(()=>window.submitted),'6','the number is committed before the form submits');
  assert.equal(await page.locator('#sized').evaluate(dialog=>dialog.open),false);assert.equal(await page.evaluate(()=>window.result),'ok');
});
test('a dialog form submission prevented by the application keeps the dialog open',async()=>{
  await useMarkup('<dialog id="named" data-gui95-dialog aria-label="Name"><form method="dialog"><input id="name" aria-label="Name"><button id="ok" value="ok">OK</button></form></dialog>');
  await page.evaluate(()=>{window.settled='pending';gui95.openDialog(document.querySelector('#named')).then(value=>{window.settled=value});window.reject=event=>{if(!document.querySelector('#name').value)event.preventDefault()};document.querySelector('form').addEventListener('submit',window.reject)});
  await page.locator('#ok').click();await page.waitForTimeout(30);
  assert.equal(await page.locator('#named').evaluate(dialog=>dialog.open),true,'a form-level validation listener keeps it open');assert.equal(await page.evaluate(()=>window.settled),'pending');
  await page.evaluate(()=>{document.querySelector('form').removeEventListener('submit',window.reject);document.addEventListener('submit',window.reject)});
  await page.locator('#ok').click();await page.waitForTimeout(30);
  assert.equal(await page.locator('#named').evaluate(dialog=>dialog.open),true,'a document-level validation listener keeps it open');
  await page.locator('#name').fill('Report');await page.locator('#ok').click();await page.waitForTimeout(30);
  assert.equal(await page.locator('#named').evaluate(dialog=>dialog.open),false);assert.equal(await page.evaluate(()=>window.settled),'ok');
});
const tabsMarkup='<button id="before">Before</button><div role="tablist" aria-label="Pages"><button role="tab" id="t1" aria-controls="p1" aria-selected="true">General</button><button role="tab" id="t2" aria-controls="p2" aria-selected="false">Display</button><button role="tab" id="t3" aria-controls="p3" disabled>Locked</button><button role="tab" id="t4" aria-controls="p4" aria-selected="false" aria-disabled="true">Sharing</button><button role="tab" id="t5" aria-controls="p5" aria-selected="false">Output</button></div><div role="tabpanel" id="p1"><input id="f1" aria-label="One"></div><div role="tabpanel" id="p2"><input id="f2" aria-label="Two"></div><div role="tabpanel" id="p3">Three</div><div role="tabpanel" id="p4">Four</div><div role="tabpanel" id="p5"><input id="f5" aria-label="Five"></div>';
const tabState=()=>page.evaluate(()=>({selected:[...document.querySelectorAll('[role=tab]')].filter(tab=>tab.getAttribute('aria-selected')==='true').map(tab=>tab.id),stops:[...document.querySelectorAll('[role=tab]')].filter(tab=>tab.tabIndex===0).map(tab=>tab.id),shown:[...document.querySelectorAll('[role=tabpanel]')].filter(panel=>!panel.hidden).map(panel=>panel.id)}));
test('tabs keep one Tab stop on the selected tab and show only its page',async()=>{
  await useMarkup(tabsMarkup);
  assert.deepEqual(await tabState(),{selected:['t1'],stops:['t1'],shown:['p1']});
  await page.locator('#before').focus();await page.keyboard.press('Tab');assert.equal(await active(),'t1');await page.keyboard.press('Tab');assert.equal(await active(),'f1','Tab leaves the tab list for the page');
});
test('tab arrows, Home and End move and select, skipping unavailable tabs, and announce the page',async()=>{
  await useMarkup(tabsMarkup);await page.evaluate(()=>{window.selections=[];document.addEventListener('gui95:tab-select',event=>window.selections.push([event.detail.tab.id,event.detail.panel.id,event.detail.id]))});
  await page.locator('#t1').focus();
  await page.keyboard.press('ArrowRight');assert.equal(await active(),'t2');assert.deepEqual(await tabState(),{selected:['t2'],stops:['t2'],shown:['p2']});
  await page.keyboard.press('ArrowRight');assert.equal(await active(),'t5','disabled and aria-disabled tabs are skipped');
  // Recorded on Windows 95 (tools/win95-reference/recordings/tab-control.json): the arrows stop at the first and last tab.
  await page.keyboard.press('ArrowRight');assert.equal(await active(),'t5','Right on the last tab stays there');
  await page.keyboard.press('ArrowLeft');assert.equal(await active(),'t2');await page.keyboard.press('Home');assert.equal(await active(),'t1');await page.keyboard.press('ArrowLeft');assert.equal(await active(),'t1','Left on the first tab stays there');await page.keyboard.press('End');assert.equal(await active(),'t5');
  await page.keyboard.press('ArrowUp');assert.equal(await active(),'t2');await page.keyboard.press('ArrowDown');assert.equal(await active(),'t5');
  assert.deepEqual(await tabState(),{selected:['t5'],stops:['t5'],shown:['p5']});
  assert.deepEqual((await page.evaluate(()=>window.selections))[0],['t2','p2','t2']);
});
test('clicking a tab selects it and unavailable tabs cannot be clicked',async()=>{
  await useMarkup(tabsMarkup);await page.locator('#t2').click();assert.deepEqual(await tabState(),{selected:['t2'],stops:['t2'],shown:['p2']});
  await page.locator('#t4').click({force:true});assert.deepEqual(await tabState(),{selected:['t2'],stops:['t2'],shown:['p2']});
});
test('Ctrl+Tab and Ctrl+PageDown switch pages from inside a page',async()=>{
  await useMarkup(tabsMarkup);await page.locator('#f1').focus();
  await page.keyboard.press('Control+Tab');assert.deepEqual((await tabState()).selected,['t2']);
  await page.keyboard.press('Control+Tab');assert.deepEqual((await tabState()).selected,['t5'],'Ctrl+Tab skips unavailable pages');
  await page.keyboard.press('Control+Shift+Tab');assert.deepEqual((await tabState()).selected,['t2']);
  await page.keyboard.press('Control+PageDown');assert.deepEqual((await tabState()).selected,['t5']);
  await page.keyboard.press('Control+PageUp');assert.deepEqual(await tabState(),{selected:['t2'],stops:['t2'],shown:['p2']});
  assert.equal(await page.evaluate(()=>document.activeElement.closest('[hidden]')),null,'focus is not left in a hidden page');
});
test('destroy removes tab behaviour',async()=>{
  await useMarkup(tabsMarkup);await page.evaluate(()=>controller.destroy());await page.locator('#t1').focus();await page.keyboard.press('ArrowRight');await page.locator('#t2').click();
  assert.deepEqual((await tabState()).selected,['t1']);
});
const listMarkup='<div style="height:760px">Spacer</div><button id="before">Before</button><ul id="fonts" role="listbox" aria-label="Fonts" style="height:62px;width:150px"><li role="option" id="arial">Arial</li><li role="option" id="courier" aria-disabled="true">Courier</li><li role="option" id="fixedsys">Fixedsys</li><li role="option" id="garamond">Garamond</li><li role="option" id="tahoma" aria-selected="true">Tahoma</li><li role="option" id="times">Times</li><li role="option">Terminal</li><li role="option" id="verdana">Verdana</li><li role="option" id="wingdings">Wingdings</li></ul><button id="after">After</button><div style="height:1200px"></div>';
const listState=()=>page.evaluate(()=>{const list=document.querySelector('#fonts'),current=document.getElementById(list.getAttribute('aria-activedescendant'));return{selected:[...list.querySelectorAll('[aria-selected=true]')].map(option=>option.textContent),active:current?.textContent??null,scrollY:window.scrollY}});
test('a list box is one Tab stop whose active descendant follows the selected option',async()=>{
  await useMarkup(listMarkup);
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#fonts,#fonts [role=option]')].filter(element=>element.tabIndex===0).map(element=>element.id)),['fonts']);
  await page.locator('#before').focus();await page.keyboard.press('Tab');assert.equal(await active(),'fonts');const state=await listState();assert.deepEqual([state.selected,state.active],[['Tahoma'],'Tahoma']);
  await page.keyboard.press('Tab');assert.equal(await active(),'after');
});
test('list box keys move and select, skip unavailable options and scroll only the list',async()=>{
  await useMarkup(listMarkup);await page.evaluate(()=>{window.picks=[];document.addEventListener('gui95:list-select',event=>window.picks.push([event.detail.option.textContent,event.detail.id]))});
  await page.locator('#fonts').focus();const scrollY=await page.evaluate(()=>window.scrollY);
  await page.keyboard.press('ArrowDown');assert.deepEqual(await listState(),{selected:['Times'],active:'Times',scrollY});
  await page.keyboard.press('Home');assert.equal((await listState()).active,'Arial');await page.keyboard.press('ArrowDown');assert.deepEqual((await listState()).selected,['Fixedsys'],'aria-disabled options are skipped');
  await page.keyboard.press('ArrowUp');assert.equal((await listState()).active,'Arial');
  await page.keyboard.press('End');assert.deepEqual(await listState(),{selected:['Wingdings'],active:'Wingdings',scrollY});
  const view=await page.evaluate(()=>{const list=document.querySelector('#fonts'),option=document.querySelector('#wingdings'),a=list.getBoundingClientRect(),b=option.getBoundingClientRect();return{scrolled:list.scrollTop>0,inside:b.top>=a.top&&b.bottom<=a.bottom}});
  assert.deepEqual(view,{scrolled:true,inside:true},'the selected option is scrolled into view within the list');
  await page.keyboard.press('PageUp');const up=(await listState()).active;assert.ok(!['Wingdings','Verdana'].includes(up),`PageUp moves by a page: ${up}`);
  await page.keyboard.press('PageDown');assert.equal((await listState()).active,'Wingdings');await page.keyboard.press('PageDown');assert.equal((await listState()).active,'Wingdings','PageDown stops at the end');
  await page.keyboard.press('t');assert.equal((await listState()).active,'Tahoma');await page.keyboard.press('t');assert.equal((await listState()).active,'Times');await page.keyboard.press('t');assert.deepEqual(await listState(),{selected:['Terminal'],active:'Terminal',scrollY});
  await page.keyboard.press('c');assert.equal((await listState()).active,'Terminal','an unavailable option is not reached by type-ahead');
  const picks=await page.evaluate(()=>window.picks);assert.deepEqual(picks[0],['Times','times']);assert.ok(picks.at(-1)[1],'every option is identified');
});
test('clicking a list option selects it and focuses the list, unavailable options excepted',async()=>{
  await useMarkup(listMarkup);await page.locator('#fonts').scrollIntoViewIfNeeded();await page.locator('#garamond').click();
  assert.equal(await active(),'fonts');assert.deepEqual((await listState()).selected,['Garamond']);
  await page.locator('#courier').click({force:true});assert.deepEqual((await listState()).selected,['Garamond']);
});
test('options added later work after a destroy and enhance cycle',async()=>{
  await useMarkup(listMarkup);await page.evaluate(()=>{controller.destroy();document.querySelector('#fonts').insertAdjacentHTML('beforeend','<li role="option">Zapf</li>');document.querySelector('#tahoma').remove();window.controller=gui95.enhance()});
  await page.locator('#fonts').focus();assert.equal((await listState()).active,'Arial','without a selection the first available option is active');await page.keyboard.press('End');assert.deepEqual((await listState()).selected,['Zapf']);
});
test('a focused list box draws one dotted rectangle, on its active option only',async()=>{
  await useMarkup(listMarkup);await page.locator('#before').focus();await page.keyboard.press('Tab');
  const list=await computed('fonts',['outlineStyle']),on=await computed('tahoma',['outlineStyle']),off=await computed('times',['outlineStyle']);
  assert.equal(list.outlineStyle,'none');assert.equal(on.outlineStyle,'dotted');assert.equal(off.outlineStyle,'none');
  await page.locator('#after').focus();assert.equal((await computed('tahoma',['outlineStyle'])).outlineStyle,'none','no rectangle once the list loses focus');
});
const spinMarkup='<label for="copies">Copies</label><span data-gui95-spin><input id="copies" type="number" data-gui95-number min="0" max="10" step="2" value="4"><button id="up" data-gui95-step="copies" data-gui95-delta="1" aria-label="Increase copies"></button><button id="down" data-gui95-step="copies" data-gui95-delta="-1" aria-label="Decrease copies"></button></span><button id="after">After</button><input id="plain-number" type="number" aria-label="Plain" value="1">';
test('up-down buttons are not Tab stops and Up/Down in the field step like the buttons',async()=>{
  await useMarkup(spinMarkup);await page.evaluate(()=>{window.commits=[];document.addEventListener('gui95:number-commit',event=>window.commits.push(event.detail.value))});
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('[data-gui95-step]')].map(button=>button.getAttribute('tabindex'))),['-1','-1']);
  await page.locator('#copies').focus();await page.keyboard.press('Tab');assert.equal(await active(),'after');
  await page.locator('#copies').focus();await page.evaluate(()=>{window.commits=[]});await page.keyboard.press('ArrowUp');assert.equal(await page.locator('#copies').inputValue(),'6');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#copies').inputValue(),'2');
  assert.deepEqual(await page.evaluate(()=>window.commits),[6,4,2],'arrow steps commit through the runtime');
  await page.locator('#copies').fill('9');await page.keyboard.press('ArrowUp');assert.equal(await page.locator('#copies').inputValue(),'10','a draft settles before the step, as for the buttons');
  await page.locator('#down').click();assert.equal(await page.locator('#copies').inputValue(),'8');assert.equal(await active(),'copies','clicking a step button keeps focus in the field');
});
test('an up-down control draws a stacked pair of 16px raised buttons inside the field',async()=>{
  await useMarkup(spinMarkup);
  const field=await computed('copies',['paddingRight','appearance']),up=await computed('up',['boxShadow','backgroundImage','fontSize']),down=await computed('down',['boxShadow','backgroundImage']),plain=await computed('plain-number',['appearance']);
  assert.deepEqual([up.w,down.w],[16,16]);assert.deepEqual([up.right,down.right],[field.right-2,field.right-2],'flush with the inner edge of the sunken border');
  assert.equal(up.top,field.top+2);assert.equal(down.bottom,field.bottom-2);assert.equal(up.bottom,down.top,'stacked with no gap');assert.ok(Math.abs(up.h-down.h)<=1,'two equal halves');
  assert.ok(parseFloat(field.paddingRight)>=18,'text clears the buttons');
  assert.match(up.boxShadow,/^rgb\(0, 0, 0\) -1px -1px 0px 0px inset, rgb\(223, 223, 223\) 1px 1px 0px 0px inset, rgb\(128, 128, 128\) -2px -2px 0px 0px inset, rgb\(255, 255, 255\) 2px 2px 0px 0px inset$/,'the plain raised edge of a scroll arrow: light outside, white inside');assert.match(up.backgroundImage,/^url\("data:image\/svg/);assert.match(down.backgroundImage,/^url\("data:image\/svg/);assert.notEqual(up.backgroundImage,down.backgroundImage,'an up arrow and a down arrow');
  assert.equal(up.fontSize,'0px','button text is not drawn over the arrow');
  assert.deepEqual([field.appearance,plain.appearance],['textfield','textfield'],'the browser spin arrows are hidden on every number field');
  await page.locator('#up').evaluate(el=>el.dataset.gui95State='pressed');const pressed=await computed('up',['boxShadow']);
  assert.notEqual(pressed.boxShadow,up.boxShadow,'pressed draws differently');assert.deepEqual([pressed.w,pressed.h],[up.w,up.h]);
  await page.locator('#copies').evaluate(input=>{input.disabled=true});const off=await computed('up',['backgroundImage']);assert.notEqual(off.backgroundImage,up.backgroundImage,'an unavailable control has gray arrows');
});
test('text fields use the caret as focus while other controls keep the dotted rectangle',async()=>{
  await useMarkup('<button id="b">OK</button><input id="t" aria-label="Text"><input id="n" type="number" aria-label="Number" value="1"><input id="s" type="search" aria-label="Search"><textarea id="ta" aria-label="Notes"></textarea><input id="c" type="checkbox" aria-label="Check"><input id="r" type="radio" aria-label="Option"><input id="g" type="range" aria-label="Level"><select id="d" aria-label="Zoom"><option>1</option></select><p id="para">Some text</p>');
  const outline=async id=>{await page.locator('#b').focus();let guard=0;while(await active()!==id&&guard++<12)await page.keyboard.press('Tab');assert.equal(await active(),id);return(await computed(id,['outlineStyle'])).outlineStyle};
  for(const id of ['t','n','s','ta'])assert.equal(await outline(id),'none',`${id} shows only the caret`);
  for(const id of ['c','r','g'])assert.equal(await outline(id),'dotted',`${id} keeps its focus rectangle`);
  assert.equal(await outline('d'),'none','a drop-down list shows focus in its text area instead: see the drop-down focus test');assert.equal((await computed('d',['color'])).color,'rgb(255, 255, 255)');
  await page.locator('#t').focus();await page.keyboard.press('Shift+Tab');assert.equal(await active(),'b');assert.equal((await computed('b',['outlineStyle'])).outlineStyle,'dotted');
  const selection=await computed('para',['backgroundColor','color'],'::selection');assert.deepEqual([selection.backgroundColor,selection.color],['rgb(0, 0, 128)','rgb(255, 255, 255)']);
  const fieldSelection=await computed('t',['backgroundColor','color'],'::selection');assert.deepEqual([fieldSelection.backgroundColor,fieldSelection.color],['rgb(0, 0, 128)','rgb(255, 255, 255)']);
});
test('menu shortcut text ends at the right edge in the item colour',async()=>{
  await page.evaluate(()=>{document.querySelector('#file-menu').insertAdjacentHTML('afterbegin','<button role="menuitem" id="cut">Cut<span id="cut-key" data-gui95-shortcut>Ctrl+X</span></button><button role="menuitem" id="paste" disabled>Paste<span id="paste-key" data-gui95-shortcut>Ctrl+V</span></button>')});
  await page.locator('#file').click();
  const item=await computed('cut',['paddingRight','color']),key=await computed('cut-key',['color']);
  const labelEnd=await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('#cut').firstChild);return range.getBoundingClientRect().right});
  assert.equal(Math.round(key.right),Math.round(item.right-parseFloat(item.paddingRight)),'pushed to the right edge');assert.ok(key.left-labelEnd>=16,`a gap from the label: ${key.left-labelEnd}`);
  assert.equal(key.color,item.color);
  await page.locator('#cut').focus();assert.equal((await computed('cut-key',['color'])).color,'rgb(255, 255, 255)','focused');
  const off=await computed('paste',['color','textShadow']),offKey=await computed('paste-key',['color','textShadow']);assert.deepEqual([offKey.color,offKey.textShadow],[off.color,off.textShadow],'unavailable');
});
// Behaviour and state fixes from the period evidence register (docs/evidence-register.md); each test names its record.
test('unavailable menu commands highlight gray from the keyboard, cannot run and never trap focus (menu-keyboard-reaches-unavailable-items)',async()=>{
  await page.evaluate(()=>{document.querySelector('#file-menu').insertAdjacentHTML('beforeend','<div role="separator"></div><button role="menuitemcheckbox" aria-checked="true" id="soft-off" aria-disabled="true">Ruler</button>');window.commands=0;document.addEventListener('gui95:command',()=>window.commands++)});
  await page.locator('#before').focus();await page.keyboard.press('Alt+f');await page.keyboard.press('ArrowDown');
  assert.equal(await active(),'file-menu','a disabled button cannot take focus, so its menu holds it');assert.equal(await page.locator('#file-menu').getAttribute('aria-activedescendant'),'unavailable');
  const bar=await computed('unavailable',['backgroundColor','color','textShadow']);assert.deepEqual([bar.backgroundColor,bar.color,bar.textShadow],['rgb(0, 0, 128)','rgb(128, 128, 128)','none'],'selection bar, gray text, no engraving');
  assert.equal((await computed('file-menu',['outlineStyle'])).outlineStyle,'none','the menu itself shows no focus rectangle');
  await page.keyboard.press('Enter');await page.keyboard.press('Space');
  assert.equal(await page.locator('#file-menu').isVisible(),true,'Enter and Space do nothing on an unavailable command');assert.equal(await page.evaluate(()=>window.commands),0);assert.equal(await selected(),'unavailable');
  await page.keyboard.press('ArrowDown');
  assert.equal(await active(),'export');assert.equal(await page.locator('#file-menu').getAttribute('aria-activedescendant'),null,'the marker goes when the selection moves on');assert.equal(await page.locator('#unavailable').getAttribute('data-gui95-active'),null);
  await page.keyboard.press('ArrowDown');assert.equal(await active(),'soft-off','separators are skipped; an aria-disabled command takes real focus');
  const soft=await computed('soft-off',['backgroundColor','color']),softMark=await computed('soft-off',['backgroundColor','maskImage'],'::before');assert.deepEqual([soft.backgroundColor,soft.color],['rgb(0, 0, 128)','rgb(128, 128, 128)']);assert.equal(softMark.backgroundColor,'rgb(128, 128, 128)','its check mark is plain gray while highlighted');assert.match(softMark.maskImage,/^url/);
  await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.commands),0);
  await page.keyboard.press('ArrowDown');assert.equal(await active(),'new','wraps');await page.keyboard.press('ArrowUp');assert.equal(await active(),'soft-off');await page.keyboard.press('Home');assert.equal(await active(),'new');
  await page.keyboard.press('ArrowDown');assert.equal(await selected(),'unavailable');await page.keyboard.press('Escape');assert.equal(await page.locator('#file-menu').isVisible(),false);assert.equal(await active(),'before','Escape from an unavailable item restores focus');
  await page.keyboard.press('Alt+f');await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');assert.equal(await page.locator('#file-menu').isVisible(),false,'Tab leaves the menu');assert.equal(await page.locator('#unavailable').getAttribute('data-gui95-active'),null);
  await page.keyboard.press('Alt+f');await page.keyboard.press('ArrowDown');const box=await page.locator('#new').boundingBox();await page.mouse.move(box.x+20,box.y+8);await page.mouse.move(box.x+22,box.y+8);assert.equal(await active(),'new');assert.equal(await page.locator('#unavailable').getAttribute('data-gui95-active'),null,'the pointer takes the selection over');
});
test('a submenu opens and closes only after the pointer has rested, and at once from a press or the keyboard (menu-cascade-time-out)',async()=>{
  const centre=async id=>{const box=await page.locator(id).boundingBox();return[box.x+box.width/2,box.y+box.height/2]};const shown=()=>page.locator('#export-menu').isVisible();
  await page.locator('#file').click();const exportAt=await centre('#export'),newAt=await centre('#new');
  await page.mouse.move(...exportAt);assert.equal(await active(),'export','the highlight follows the pointer at once');assert.equal(await shown(),false,'the submenu waits');
  await page.waitForTimeout(150);await page.mouse.move(exportAt[0]+3,exportAt[1]);assert.equal(await shown(),false,'still waiting part-way through');
  await page.locator('#png').waitFor({state:'visible',timeout:1500});assert.equal(await page.locator('#export').getAttribute('aria-expanded'),'true');
  await page.mouse.move(...newAt);assert.equal(await active(),'new');assert.equal(await shown(),true,'the open submenu stays while the pointer crosses a sibling');
  await page.mouse.move(...await centre('#png'));assert.equal(await active(),'png');await page.waitForTimeout(600);assert.equal(await shown(),true,'reaching the submenu in time keeps it open');
  await page.mouse.move(...newAt);await page.locator('#export-menu').waitFor({state:'hidden',timeout:1500});assert.equal(await page.locator('#export').getAttribute('aria-expanded'),'false');assert.equal(await active(),'new');
  await page.mouse.move(...exportAt);await page.mouse.down();assert.equal(await shown(),true,'a press opens it at once');await page.mouse.up();
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.mouse.move(...newAt);await page.keyboard.press('Alt+f');await page.keyboard.press('End');await page.keyboard.press('ArrowRight');assert.equal(await active(),'png','the keyboard opens it at once');
  await page.keyboard.press('Escape');await page.mouse.move(...exportAt);await page.mouse.move(exportAt[0]+2,exportAt[1]);await page.keyboard.press('Home');await page.waitForTimeout(600);assert.equal(await shown(),false,'a key press cancels a pending pointer open');assert.equal(await active(),'new');
});
test('menu shortcuts are left-aligned in one column shared by the menu (menu-shortcut-column)',async()=>{
  await page.evaluate(()=>{document.querySelector('#file-menu').insertAdjacentHTML('afterbegin','<button role="menuitem" id="open">Open<span id="open-key" data-gui95-shortcut>Ctrl+O</span></button><button role="menuitem" id="save-as">Save As<span id="save-as-key" data-gui95-shortcut>Ctrl+Shift+S</span></button><button role="menuitem" id="quit" disabled>Exit<span id="quit-key" data-gui95-shortcut>Alt+F4</span></button>')});
  await page.locator('#file').click();
  const keys=await Promise.all(['open-key','save-as-key','quit-key'].map(id=>computed(id,['paddingLeft']))),item=await computed('save-as',['paddingRight']);
  const starts=keys.map(key=>key.left+parseFloat(key.paddingLeft));assert.equal(new Set(starts).size,1,`every shortcut starts at the same x: ${starts}`);
  const textEnd=id=>page.evaluate(id=>{const range=document.createRange();range.selectNodeContents(document.getElementById(id));return range.getBoundingClientRect().right},id);
  assert.ok(await textEnd('open-key')<await textEnd('save-as-key')-10,'so a short shortcut ends short of a long one');assert.ok(Math.abs(await textEnd('save-as-key')-(item.right-parseFloat(item.paddingRight)))<=1,'the longest reaches the right edge');
  const labelEnd=await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('#save-as').firstChild);return range.getBoundingClientRect().right});assert.ok(starts[0]-labelEnd>=16,'and clears the longest label');
  await page.keyboard.press('Escape');await page.evaluate(()=>document.querySelector('#save-as').remove());await page.locator('#file').click();
  const again=await Promise.all(['open-key','quit-key'].map(id=>computed(id,['paddingLeft'])));assert.equal(again[0].left,again[1].left,'the column is measured again each time the menu opens');assert.ok(again[0].w<keys[0].w,'and narrows when the widest shortcut has gone');
});
test('a held check box or option button fills with the control face (check-option-pressed-interior)',async()=>{await onPixels('<input id="check" type="checkbox" aria-label="A"><input id="checked" type="checkbox" aria-label="B" checked><input id="check-off" type="checkbox" aria-label="C" disabled><input id="option" type="radio" name="o" aria-label="D"><input id="option-on" type="radio" name="p" aria-label="E" checked>');
  const hold=async id=>{const box=await page.locator('#'+id).boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down()};
  await hold('check');assert.equal((await computed('check',['backgroundColor'])).backgroundColor,'rgb(192, 192, 192)');let held=await pixels('check');assert.equal(held[6][6],'#c0c0c0');assert.equal(held[0][0],'#808080','the sunken edge stays');
  await page.mouse.move(300,300);await page.mouse.up();assert.equal((await computed('check',['backgroundColor'])).backgroundColor,'rgb(255, 255, 255)','white again on release');
  await hold('checked');held=await pixels('checked');assert.equal(held[3][3],'#c0c0c0');assert.equal(held[6][6],'#000000','the check mark stays black');await page.mouse.move(300,300);await page.mouse.up();
  const rest=await pixels('option');assert.equal(rest[6][6],'#ffffff');await hold('option');held=await pixels('option');assert.equal(held[6][6],'#c0c0c0');assert.equal(held[1][5],'#000000','the ring stays');await page.mouse.move(300,300);await page.mouse.up();
  await hold('option-on');held=await pixels('option-on');assert.equal(held[3][5],'#c0c0c0');assert.equal(held[5][5],'#000000','the dot stays black');await page.mouse.move(300,300);await page.mouse.up();
  const offBox=await page.locator('#check-off').boundingBox();await page.mouse.move(offBox.x+6,offBox.y+6);await page.mouse.down();assert.equal((await computed('check-off',['backgroundColor'])).backgroundColor,'rgb(192, 192, 192)');await page.mouse.up();
});
test('focus on a labelled check box or option button is a dotted rectangle round the label text (check-option-focus-on-label)',async()=>{
  await useMarkup('<button id="b">OK</button><label id="cl"><input id="c" type="checkbox"> Wrap text</label> <label id="rl"><input id="r" type="radio"> Large</label> <input id="s" type="checkbox"><label id="sl" for="s">Sibling</label> <input id="bare" type="checkbox" aria-label="Bare"><div data-gui95-stack style="width:300px"><label id="wide"><input id="w" type="checkbox"> Stacked</label></div>');
  const after=id=>page.evaluate(id=>{const s=getComputedStyle(document.getElementById(id),'::after');return{content:s.content,outline:s.outlineStyle,left:s.left,right:s.right,top:s.top,bottom:s.bottom,events:s.pointerEvents}},id);
  assert.equal((await after('cl')).content,'none','no rectangle without focus');
  await page.locator('#b').focus();await page.keyboard.press('Tab');assert.equal(await active(),'c');
  assert.equal((await computed('c',['outlineStyle'])).outlineStyle,'none','the box itself has no rectangle');
  assert.deepEqual(await after('cl'),{content:'""',outline:'dotted',left:'16px',right:'-1px',top:'0px',bottom:'0px',events:'none'},'from one pixel left of the text (13px box, 4px gap) to one pixel right of it');
  const shot=await pixels('cl'),row=shot[0].join('');// The label's top row crosses the box at a height that depends on the host's fallback font (the box is centred on the line), so the box's own colours, black included, may appear; what must not appear is a dotted run.
  assert.ok(shot[0].slice(0,13).every(p=>['#808080','#ffffff','#c0c0c0','#000000','#dfdfdf'].includes(p))&&!/(#000000#c0c0c0){2}/.test(shot[0].slice(0,13).join('')),'nothing dotted over the box: '+shot[0].slice(0,13).join(' '));assert.match(row,/(#000000#c0c0c0){8}/,'a dotted line above the text');
  await page.keyboard.press('Tab');assert.equal(await active(),'r');assert.equal((await after('cl')).content,'none');assert.equal((await after('rl')).left,'15px','12px option button, 4px gap');assert.equal((await computed('r',['outlineStyle'])).outlineStyle,'none');
  await page.keyboard.press('Tab');assert.equal(await active(),'s');assert.equal((await computed('s',['outlineStyle'])).outlineStyle,'none');assert.deepEqual([(await after('sl')).outline,(await after('sl')).left,(await after('sl')).right],['dotted','-1px','-1px'],'a label that follows its box');
  await page.keyboard.press('Tab');assert.equal(await active(),'bare');assert.equal((await computed('bare',['outlineStyle'])).outlineStyle,'dotted','a box with no label keeps its own rectangle');
  const rest=await computed('wide',[]);await page.keyboard.press('Tab');assert.equal(await active(),'w');const focused=await computed('wide',[]);
  assert.ok(focused.w<120&&rest.w===300,`a stretched label shrinks to its text while focused, so the rectangle does not span the row: ${focused.w}`);assert.deepEqual([focused.left,focused.top,focused.h],[rest.left,rest.top,rest.h],'without moving');
});
test('a focused, closed drop-down list highlights its text area only; its button is a plain raised edge (drop-down-focus-highlight, edge-drop-down-button)',async()=>{
  await onPixels('<select id="d" aria-label="Zoom" style="width:90px"><option>100%</option><option>200%</option></select><button id="b">OK</button>');
  const rest=await pixels('d'),w=rest[0].length,h=rest.length;assert.equal(rest[4][4],'#ffffff');
  assert.deepEqual([rest[2][w-18],rest[3][w-17],rest[2][w-3],rest[h-3][w-18],rest[3][w-4],rest[h-4][w-17],rest[h-4][w-4],rest[5][w-10]],['#dfdfdf','#ffffff','#000000','#000000','#808080','#808080','#808080','#c0c0c0'],'light outside and white inside at the top and left; black and shadow own both corners; face inside');
  await page.locator('#b').focus();await page.keyboard.press('Shift+Tab');assert.equal(await active(),'d');
  const style=await computed('d',['color','outlineStyle']);assert.deepEqual([style.color,style.outlineStyle],['rgb(255, 255, 255)','none']);
  const on=await pixels('d');
  assert.deepEqual([on[4][4],on[h-5][w-21]],['#000080','#000080'],'the text area is the selection colour');
  assert.deepEqual([on[2][2],on[2][10],on[10][2],on[h-3][10],on[10][w-19]],Array(5).fill('#ffffff'),'one white pixel between it and the border, and between it and the button');
  assert.deepEqual([on[3][3],on[3][4],on[3][5],on[5][3],on[4][3]],['#ffffff','#000080','#ffffff','#ffffff','#000080'],'the dotted rectangle runs round the text area');
  assert.equal(on[3][w-20]==='#ffffff'||on[3][w-21]==='#ffffff',true,'and stops short of the button');
  for(const [y,x] of [[2,w-18],[3,w-17],[2,w-3],[h-3,w-18],[5,w-10]])assert.equal(on[y][x],rest[y][x],'the button is unchanged by focus');
  await page.keyboard.press('Tab');assert.equal((await pixels('d'))[4][4],'#ffffff','white again without focus');
  assert.equal(await page.evaluate(()=>{const s=getComputedStyle(document.querySelector('#d option'));return s.color+' '+s.backgroundColor}),'rgb(0, 0, 0) rgb(255, 255, 255)','list items never inherit the white text');
});
test('unavailable drop-down and up-down arrows are engraved: shadow where the arrow was, white one pixel down and right (arrows-unavailable-engraved)',async()=>{
  await onPixels('<select id="on" aria-label="A" style="width:90px"><option>1</option></select><select id="off" aria-label="B" style="width:90px" disabled><option>1</option></select><span id="spin-on" data-gui95-spin><input id="n1" type="number" aria-label="C" value="1" style="width:60px"><button data-gui95-step="n1" data-gui95-delta="1" aria-label="Up"></button><button data-gui95-step="n1" data-gui95-delta="-1" aria-label="Down"></button></span><span id="spin-off" data-gui95-spin><input id="n2" type="number" aria-label="D" value="1" disabled style="width:60px"><button data-gui95-step="n2" data-gui95-delta="1" aria-label="Up"></button><button data-gui95-step="n2" data-gui95-delta="-1" aria-label="Down"></button></span>');
  for(const [normal,unavailable] of [['on','off'],['spin-on','spin-off']]){
    const a=await pixels(normal),b=await pixels(unavailable),w=a[0].length,glyph=[];
    for(let y=4;y<a.length-4;y++){const row=a[y].slice(w-15,w-5);if(row.every(p=>p==='#000000'))continue;row.forEach((p,i)=>{if(p==='#000000')glyph.push([y,w-15+i])})}
    assert.equal(glyph.length,normal==='on'?16:32,`${normal}: 16 black pixels per arrow`);
    for(const [y,x] of glyph)assert.equal(b[y][x],'#808080',`${unavailable}: shadow at ${x},${y}, where the black arrow was`);
    // The white copy shows wherever it falls on the button face (a short up-down button's edge covers its lowest row).
    const white=glyph.filter(([y,x])=>a[y+1][x+1]==='#c0c0c0');assert.ok(white.length>=4);
    for(const [y,x] of white)assert.equal(b[y+1][x+1],'#ffffff',`${unavailable}: white copy at ${x+1},${y+1}`);
  }
});
test('a group box caption interrupts the white line of the etched frame as well as the shadow line (group-box-caption-position)',async()=>{
  await onPixels('<fieldset id="box" style="width:160px;height:40px;margin:0"><legend id="cap">Paper</legend></fieldset><div id="plain" class="group-box" style="width:60px;height:20px;margin:0"></div>');
  const shot=await pixels('box'),box=await computed('box',[]),cap=await computed('cap',[]),top=shot.findIndex(row=>row[0]==='#808080'),from=Math.round(cap.left-box.left),to=Math.round(cap.right-box.left),w=shot[0].length,h=shot.length;
  assert.deepEqual([shot[top][3],shot[top+1][3],shot[top+1][0]],['#808080','#ffffff','#808080'],'shadow line with the white line under it, left of the caption');
  assert.deepEqual([shot[top][w-4],shot[top+1][w-4]],['#808080','#ffffff'],'and right of it');
  for(let x=from;x<to;x++){assert.notEqual(shot[top][x],'#808080',`no shadow line behind the caption at ${x}`);assert.notEqual(shot[top+1][x],'#ffffff',`no white line behind the caption at ${x}`)}
  assert.deepEqual([shot[h-10][0],shot[h-10][1],shot[h-10][w-1],shot[h-1][5],shot[h-2][5],shot[top][w-1],shot[h-1][0]],['#808080','#ffffff','#808080','#808080','#c0c0c0','#808080','#808080'],'the rest of the frame is unchanged: shadow outside and white inside at the left, shadow as the last pixel at the right and bottom');
  const around=await page.screenshot({clip:{x:box.left,y:box.bottom-4,width:box.w+1,height:5}}),edge=await page.evaluate(async src=>{const img=new Image();img.src='data:image/png;base64,'+src;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);const at=(px,py)=>[...x.getImageData(px,py,1,1).data].slice(0,3).join();return[at(c.width-1,0),at(5,4),at(c.width-1,4)]},around.toString('base64'));
  assert.deepEqual(edge,Array(3).fill('255,255,255'),'the white line outside the right and bottom edges');
  const plain=await pixels('plain');assert.deepEqual([plain[0][5],plain[1][5],plain[1][0]],['#808080','#ffffff','#808080'],'a .group-box without a caption has an unbroken frame');
});
test('the slider thumb gives its bottom and right lines the corner pixels (edge-slider-thumb-corners)',async()=>{await usePrimitives();
  const shot=await pixels('slide'),x=shot[1].indexOf('#ffffff');assert.ok(x>=0,'thumb found');
  assert.deepEqual([shot[1][x],shot[1][x+9],shot[2][x+1]],['#ffffff','#ffffff','#dfdfdf'],'white outside and light inside at the top and left');
  assert.deepEqual([shot[1][x+10],shot[21][x],shot[2][x+9],shot[20][x+1],shot[21][x+10],shot[20][x+9]],['#000000','#000000','#808080','#808080','#000000','#808080'],'black owns the outer top-right and bottom-left pixels, shadow the inner ones');
});
