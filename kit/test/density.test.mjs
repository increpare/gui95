// The density switch: data-gui95-density="period" gives the sizes Windows 95 used, "comfortable" (the default) the kit's own.
// Period sizes are the ones measured on Windows 95 4.00.1111 C (OSR2.5) at 96 dpi; see docs/design-guide.md.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const css=await readFile(new URL('../components/gui95.css',import.meta.url),'utf8');

// Every density property: [comfortable, period], as the stylesheet declares them.
const properties={
  'window-frame':['3px','4px'],'caption-h':['20px','18px'],'caption-pad':['2px 3px','2px'],'caption-align':['center','flex-start'],'caption-gap':['0px','1px'],
  'menubar-pad':['1px 2px','0 0 1px'],'menubar-gap':['1px','0px'],'menubar-item-h':['20px','18px'],'menubar-item-drop':['0px','1px'],
  'menu-item-h':['22px','17px'],'menu-item-pad':['3px 23px','1px 21px 3px'],'menu-check-x':['7px','6px'],'menu-arrow-x':['7px','6px'],'menu-odd':['0px','1px'],'menu-separator-margin':['3px 1px','3px 0 4px'],
  'list-row-pad':['1px 3px','0 1px'],'drop-h':['23px','21px'],'drop-pad-y':['4px','3px'],'drop-arrow-x':['6px','7px'],'drop-arrow-y':['center','top 8px'],'drop-arrow-off-y':['top calc(50% + .5px)','top 8px'],
  'option-box':['12px','13px'],'option-at':['0 0','1px 0'],'status-pad':['2px','2px 0 0'],'status-pane-pad':['2px 4px','2px 3px 3px'],
  'tab-h':['20px','18px'],'tab-drop':['0px','-1px'],'tab-lift':['1px','0px'],'toolbar-button-h':['23px','22px'],'toolbar-gap':['2px','0px'],'legend-shift':['0px','-2px'],'legend-pad':['4px','2px'],'text-cell':['','13px'],
  // Tree view and caption buttons, measured for the example audit (docs/example-audit.md).
  'tree-pad':["4px","2px"],'tree-row':["20px","16px"],'tree-group-margin':["9px","28px"],'tree-group-pad':["15px","0px"],
  'tree-item-shift':["0px","-9px"],'tree-line-x':["-15px","11px"],'tree-line-w':["14px","7px"],'tree-line-y':["9px","8px"],
  'tree-mask-x':["-16px","9px"],'tree-line':["1px dotted #808080","0 dotted #808080"],'tree-dot':["0px","1px"],'tree-dots-x':["none","repeating-linear-gradient(90deg,#808080 0 1px,transparent 1px 2px)"],
  'tree-dots-y':["none","repeating-linear-gradient(#808080 0 1px,transparent 1px 2px) 0 0/1px 100% no-repeat"],'tree-label-x':["0px","19px"],'tree-label-pad':["2px 4px","0 3px"],'tree-box-position':["static","absolute"],
  'tree-box-size':["11px","9px"],'tree-box-font':["11px/9px monospace","0/0 monospace"],'tree-plus':["none","linear-gradient(#000,#000) center/5px 1px no-repeat,linear-gradient(#000,#000) center/1px 5px no-repeat"],'tree-minus':["none","linear-gradient(#000,#000) center/5px 1px no-repeat"],
  'caption-button-w':["18px","16px"],'caption-button-h':["18px","14px"],'caption-button-gap':["2px","0px"],'caption-art-minimize':["","url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M1 7h6v2H1z'/%3E%3C/svg%3E\")"],
  'caption-art-maximize':["","url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath fill-rule='evenodd' d='M0 0h9v9H0zM1 2v6h7V2z'/%3E%3C/svg%3E\")"],'caption-art-restore':["","url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath fill-rule='evenodd' d='M2 0h6v6H6V5h1V2H3v1H2zM0 3h6v6H0zM1 5v3h4V5z'/%3E%3C/svg%3E\")"],'caption-art-close':["","url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M1 1h2v1H1zM7 1h2v1H7zM2 2h2v1H2zM6 2h2v1H6zM3 3h4v1H3zM4 4h2v1H4zM3 5h4v1H3zM2 6h2v1H2zM6 6h2v1H6zM1 7h2v1H1zM7 7h2v1H7z'/%3E%3C/svg%3E\")"],
};

const controls=`<div class="window" data-part="window" style="width:260px"><div class="title-bar" data-part="caption"><span data-part="caption-text">Title</span><button data-part="caption-button" aria-label="Close"></button></div>
<nav data-gui95-menubar data-part="menubar" aria-label="Menu bar"><button data-part="menubar-item">File</button><button>Edit</button></nav>
<div class="toolbar" data-part="toolbar" aria-label="Tools"><button data-part="tool">A</button><button data-part="tool-2">B</button></div>
<div class="window-body" data-part="body" style="padding:0"><div role="menu" data-part="menu" aria-label="Menu" style="width:180px"><button role="menuitem" data-part="item"><span data-part="item-text">Open</span><span data-gui95-shortcut>Ctrl+O</span></button><button role="menuitemcheckbox" aria-checked="true" data-part="check-item">Ruler</button><button role="menuitemradio" aria-checked="true" data-part="option-item">Large</button><div role="separator" data-part="separator"></div><button role="menuitem" data-gui95-menu="more" data-part="arrow-item">More</button><button role="menuitem" data-part="after-separator">Exit</button></div>
<ul role="listbox" data-part="list" aria-label="List" style="width:120px;height:60px"><li role="option" data-part="row">Alpha</li><li role="option" aria-selected="true" data-part="row-2">Bravo</li><li role="option" data-part="row-3">Charlie</li></ul>
<select data-part="drop" style="width:120px"><option>Alpha</option></select><input type="radio" data-part="option" aria-label="Option"><input type="checkbox" data-part="check" aria-label="Check"><input data-part="field" value="Text"><button data-part="button">OK</button>
<fieldset data-part="group" style="width:120px"><legend data-part="legend">Group</legend>x</fieldset>
<div role="tablist" data-part="tabs" aria-label="Pages"><button role="tab" aria-selected="true" data-part="tab-selected">General</button><button role="tab" aria-selected="false" data-part="tab">View</button></div><div role="tabpanel" data-part="page" style="height:30px"></div></div>
<div class="status-bar" data-part="status"><div data-part="pane">Ready</div><div>Ln 1</div></div></div>`;
const scope=(id,density,inner=controls)=>`<section class="gui95" id="${id}"${density?` data-gui95-density="${density}"`:''} style="margin:8px;width:max-content">${inner}</section>`;
// Controls that take no size from the density, in a dialog layout built only from the dialog-unit measures.
const dialog=`<form data-gui95-dialog-layout data-part="dlg" style="width:320px"><div data-gui95-dialog-body data-part="dlg-body"><div data-gui95-form><label data-part="dlg-label">Name:</label><input data-part="dlg-field" value="x"><label>Notes:</label><textarea data-part="dlg-area" rows="2"></textarea><label data-gui95-wide data-part="dlg-check"><input type="checkbox"> Read only</label></div><fieldset data-gui95-group data-part="dlg-group"><legend data-part="dlg-legend">Output</legend><label data-part="dlg-option"><input type="checkbox"> Printer</label><button data-part="dlg-inner">Browse</button></fieldset></div><div data-gui95-buttons data-part="dlg-buttons"><button class="default" data-part="dlg-ok">OK</button><button data-part="dlg-cancel">Cancel</button></div></form>`;
const fixture=`<!doctype html><html><head><link rel="stylesheet" href="/gui95.css"><style>body{margin:0}.app-line li{line-height:20px}</style></head><body>
${scope('default','')}${scope('comfortable','comfortable')}${scope('period','period')}
${scope('mixed','',`<div id="period-inside" data-gui95-density="period">${controls}</div>`)}
${scope('reverse','period',`<div id="comfortable-inside" data-gui95-density="comfortable">${controls}</div><div class="gui95" id="nested-root">${controls}</div>`)}
${scope('dialog-comfortable','',dialog)}${scope('dialog-period','period',dialog)}
${scope('app-comfortable','',`<ul role="listbox" class="app-line" aria-label="App"><li role="option" data-part="app-row">Alpha</li></ul>`)}${scope('app-period','period',`<ul role="listbox" class="app-line" aria-label="App"><li role="option" data-part="app-row">Alpha</li></ul>`)}
</body></html>`;

let server,browser,page;
before(async()=>{
  server=createServer((req,res)=>{if(req.url==='/gui95.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end(fixture);}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch();page=await browser.newPage({viewport:{width:1000,height:900},deviceScaleFactor:1});await page.goto(`http://127.0.0.1:${server.address().port}/`);
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});

const variables=selector=>page.evaluate(([selector,names])=>{const style=getComputedStyle(document.querySelector(selector));return Object.fromEntries(names.map(name=>[name,style.getPropertyValue('--gui95-'+name).trim()]));},[selector,Object.keys(properties)]);
const expected=index=>Object.fromEntries(Object.entries(properties).map(([name,values])=>[name,values[index]]));
/** Sizes and positions of the fixture's controls inside `selector`, in CSS pixels at device scale 1. */
const measure=selector=>page.evaluate(selector=>{
  const root=document.querySelector(selector),part=name=>root.querySelector(`[data-part="${name}"]`),box=name=>part(name).getBoundingClientRect();
  const pseudo=(name,which)=>{const style=getComputedStyle(part(name),which);return {top:parseFloat(style.top),left:parseFloat(style.left),right:parseFloat(style.right)};};
  const out={};
  out.windowFrame=box('caption').left-box('window').left;
  out.captionHeight=box('caption').height;
  out.captionLine=box('menubar').top-box('caption').bottom;
  out.captionTextTop=box('caption-text').top-box('caption').top;
  out.captionTextHeight=box('caption-text').height;
  out.captionButton=[box('caption-button').width,box('caption-button').height];
  out.captionButtonInset=[box('caption-button').top-box('caption').top,box('caption').right-box('caption-button').right];
  out.menuBarHeight=box('menubar').height;
  out.menuBarItemHeight=box('menubar-item').height;
  out.menuBarItemTop=box('menubar-item').top-box('menubar').top;
  out.toolbarButton=[box('tool').width,box('tool').height];
  out.toolbarGap=box('tool-2').left-box('tool').right;
  out.menuItemHeight=box('item').height;
  out.menuMargin=box('item').top-box('menu').top;
  out.menuTextInset=box('item-text').left-box('menu').left;
  out.menuTextTop=box('item-text').top-box('item').top;
  out.separatorItem=box('arrow-item').top-box('option-item').bottom;
  out.separatorLine=[box('separator').top-box('option-item').bottom,box('separator').height,box('separator').left-box('option-item').left];
  out.checkMark=pseudo('check-item','::before');out.optionMark=pseudo('option-item','::before');out.submenuArrow=pseudo('arrow-item','::after');
  out.listRow=box('row').height;
  out.listRowPitch=box('row-3').top-box('row-2').top;
  out.listTextInset=parseFloat(getComputedStyle(part('row')).paddingLeft);
  out.dropDown=box('drop').height;
  out.dropArrow=getComputedStyle(part('drop')).backgroundPosition.split(',')[0];
  out.optionButton=[box('option').width,box('option').height];
  out.checkBox=[box('check').width,box('check').height];
  out.textField=box('field').height;
  out.pushButton=box('button').height;
  out.legendTextInset=box('legend').left+parseFloat(getComputedStyle(part('legend')).paddingLeft)-box('group').left;
  out.tab=box('tab').height;out.tabSelected=box('tab-selected').height;
  out.tabPageOverlap=box('tab-selected').bottom-box('page').top;
  out.statusBar=box('status').height;out.statusPane=box('pane').height;
  out.statusPaneInset=[box('pane').left-box('status').left,box('pane').top-box('status').top,box('status').bottom-box('pane').bottom];
  return out;
},selector);

// Chromium lays 11px text at line-height 1.35 out as 14.84375px; the comfortable rows that hold it are fractional.
const line=14.84375;
const comfortable={windowFrame:3,captionHeight:20,captionLine:0,captionTextTop:2.578125,captionTextHeight:line,captionButton:[16,14],captionButtonInset:[3,3],menuBarHeight:22,menuBarItemHeight:20,menuBarItemTop:1,toolbarButton:[24,23],toolbarGap:2,
  menuItemHeight:22,menuMargin:3,menuTextInset:26,menuTextTop:3.578125,separatorItem:8,separatorLine:[3,2,1],checkMark:{top:7,left:7},optionMark:{top:8,left:7},submenuArrow:{top:7,right:7},
  listRow:line+2,listRowPitch:line+2,listTextInset:3,dropDown:23,dropArrow:'calc(100% - 6px) 50%',optionButton:[12,12],checkBox:[13,13],textField:23,pushButton:23,legendTextInset:13,tab:line+6,tabSelected:line+10,tabPageOverlap:2,statusBar:line+8,statusPane:line+4,statusPaneInset:[2,2,2]};
const period={windowFrame:4,captionHeight:18,captionLine:1,captionTextTop:2,captionTextHeight:13,captionButton:[16,14],captionButtonInset:[2,2],menuBarHeight:19,menuBarItemHeight:18,menuBarItemTop:0,toolbarButton:[24,22],toolbarGap:0,
  menuItemHeight:17,menuMargin:3,menuTextInset:24,menuTextTop:1,separatorItem:9,separatorLine:[3,2,0],checkMark:{top:5,left:6},optionMark:{top:5,left:7},submenuArrow:{top:4,right:6},
  listRow:13,listRowPitch:13,listTextInset:1,dropDown:21,dropArrow:'calc(100% - 7px) 8px',optionButton:[13,13],checkBox:[13,13],textField:23,pushButton:23,legendTextInset:9,tab:18,tabSelected:22,tabPageOverlap:2,statusBar:20,statusPane:18,statusPaneInset:[0,2,0]};
const pick=(measured,want)=>Object.fromEntries(Object.entries(want).map(([key,value])=>[key,value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).map(k=>[k,measured[key][k]])):measured[key]]));

test('with no density attribute every property has its comfortable value',async()=>{
  assert.deepEqual(await variables('#default'),expected(0));
});

test('data-gui95-density="comfortable" states the default and changes nothing',async()=>{
  assert.deepEqual(await variables('#comfortable'),expected(0));
  assert.deepEqual(await measure('#comfortable'),await measure('#default'));
});

test('data-gui95-density="period" on the scope root sets every period value',async()=>{
  assert.deepEqual(await variables('#period'),expected(1));
});

test('the comfortable density renders the sizes the kit has always drawn',async()=>{
  const measured=await measure('#default');
  assert.deepEqual(pick(measured,comfortable),comfortable);
});

test('the period density renders the sizes measured on Windows 95',async()=>{
  const measured=await measure('#period');
  assert.deepEqual(pick(measured,period),period);
});

test('a period subtree inside a comfortable scope, and the reverse',async()=>{
  assert.deepEqual(await variables('#mixed'),expected(0));
  assert.deepEqual(await variables('#period-inside'),expected(1));
  assert.deepEqual(pick(await measure('#period-inside'),period),period);
  assert.deepEqual(await variables('#reverse'),expected(1));
  assert.deepEqual(await variables('#comfortable-inside'),expected(0));
  assert.deepEqual(pick(await measure('#comfortable-inside'),comfortable),comfortable);
});

test('a scope root nested in a period subtree keeps the period density',async()=>{
  assert.deepEqual(await variables('#nested-root'),expected(1));
  assert.deepEqual(pick(await measure('#nested-root'),period),period);
});

test('every period control and mark lies on whole pixels',async()=>{
  const fractional=await page.evaluate(()=>{
    const root=document.querySelector('#period'),bad=[];
    // Heights are the density's; widths follow the text, and where a control sits follows the page around it.
    for(const name of ['caption','caption-text','caption-button','menubar','menubar-item','tool','menu','item','item-text','check-item','option-item','separator','arrow-item','list','row','row-2','row-3','drop','option','legend','tabs','tab','tab-selected','status','pane']){const r=root.querySelector(`[data-part="${name}"]`).getBoundingClientRect();if(!Number.isInteger(r.height))bad.push(name+' '+r.height);}
    for(const [inner,outer] of [['caption-text','caption'],['caption-button','caption'],['menubar-item','menubar'],['item-text','item'],['row-2','list'],['row-3','list'],['pane','status'],['tab','tabs'],['tab-selected','tabs']]){const offset=root.querySelector(`[data-part="${inner}"]`).getBoundingClientRect().top-root.querySelector(`[data-part="${outer}"]`).getBoundingClientRect().top;if(!Number.isInteger(offset))bad.push(inner+' in '+outer+' '+offset);}
    for(const [part,which] of [['check-item','::before'],['option-item','::before'],['arrow-item','::after']]){const s=getComputedStyle(root.querySelector(`[data-part="${part}"]`),which);if(![s.top,s.width,s.height].map(parseFloat).every(Number.isInteger))bad.push(part+which);}
    return bad;
  });
  assert.deepEqual(fractional,[]);
});

test('period text sits on the 13px line: one pixel above the middle of a menu item, flush in a list row',async()=>{
  const lines=await page.evaluate(()=>Object.fromEntries(['item','menubar-item','caption','row','pane','tab','legend'].map(name=>[name,getComputedStyle(document.querySelector(`#period [data-part="${name}"]`)).lineHeight])));
  assert.deepEqual(lines,{item:'13px','menubar-item':'13px',caption:'13px',row:'13px',pane:'13px',tab:'13px',legend:'13px'});
  const padding=await page.evaluate(()=>Object.fromEntries(['item','menubar-item','tab','tab-selected','pane'].map(name=>{const s=getComputedStyle(document.querySelector(`#period [data-part="${name}"]`));return [name,[s.paddingTop,s.paddingBottom].join(' ')];})));
  assert.deepEqual(padding,{item:'1px 3px','menubar-item':'2px 3px',tab:'3px 2px','tab-selected':'3px 6px',pane:'2px 3px'});
});

test('the comfortable density leaves line height to the page, and a page rule still wins in both',async()=>{
  const inherited=await page.evaluate(()=>['item','menubar-item','caption','row','pane','tab'].map(name=>{const el=document.querySelector(`#default [data-part="${name}"]`);return getComputedStyle(el).lineHeight===getComputedStyle(el.parentElement).lineHeight;}));
  assert.deepEqual(inherited,[true,true,true,true,true,true]);
  const app=await page.evaluate(()=>['#app-comfortable','#app-period'].map(scope=>getComputedStyle(document.querySelector(scope+' [data-part="app-row"]')).lineHeight));
  assert.deepEqual(app,['20px','20px']);
});

test('dialog layout measures and positions are the same in both densities',async()=>{
  const read=scope=>page.evaluate(scope=>{
    const root=document.querySelector(scope),own=root.getBoundingClientRect(),style=getComputedStyle(root);
    const measures=Object.fromEntries(['du-x','du-y','dlg-margin-x','dlg-margin-y','dlg-gap-x','dlg-gap-y','dlg-tight-y','dlg-control-h','dlg-button-w','dlg-group-x','dlg-group-top','dlg-group-bottom'].map(name=>[name,style.getPropertyValue('--gui95-'+name).trim()]));
    const boxes=Object.fromEntries([...root.querySelectorAll('[data-part]')].map(el=>{const r=el.getBoundingClientRect();return [el.dataset.part,[r.left-own.left,r.top-own.top,r.width,r.height]];}));
    return {measures,boxes};
  },scope);
  const [a,b]=[await read('#dialog-comfortable'),await read('#dialog-period')];
  assert.deepEqual(b.measures,a.measures);
  assert.deepEqual(b.boxes,a.boxes);
  assert.deepEqual([a.boxes['dlg-ok'][2],a.boxes['dlg-ok'][3]],[75,23]);
});

test('the stylesheet repeats no rule for the period density',()=>{
  const period=css.split('\n').filter(line=>line.includes('data-gui95-density="period"')&&!line.startsWith('/*'));
  assert.equal(period.length,1,'one rule mentions the period density');
  assert.match(period[0],/^:is\(\.gui95,\[data-gui95\]\)\[data-gui95-density="period"\],:is\(\.gui95,\[data-gui95\]\) \[data-gui95-density="period"\]\{(--gui95-[a-z-]+:[^;{}]+;?)+\}$/,'and it sets custom properties only');
  for(const name of Object.keys(properties))assert.ok(css.includes(`--gui95-${name}:`),name+' is declared');
});

test('the repository holds a state atlas baseline for each density',async()=>{
  const {BASELINES}=await import('../verify/atlas.mjs');
  for(const [density,file] of Object.entries(BASELINES))assert.ok(existsSync(file),density+': '+file);
});
