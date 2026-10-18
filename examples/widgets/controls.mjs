import {example as e} from './shared.mjs';

export default [
e('buttons','Push buttons and default action','Basic controls',`
<form id="form" class="stack"><label>Name <input id="name" required value="Untitled"></label><div class="row"><button class="default" type="submit">Create</button><button type="reset">Reset</button><button type="button" disabled>Unavailable</button></div></form>`,
({$,on,report})=>{on($('#form'),'submit',ev=>{ev.preventDefault();report(`Created: ${$('#name').value}`);});on($('#form'),'reset',()=>report('Reset to the initial value.'));},
'Normal, pressed, focused, disabled, and default action. The default outline is separate from keyboard focus.',
'Tab moves focus; Space activates a focused button. Enter in the name field submits the form.',
'A default action must be safe in context. Browser form submission supplies Enter behavior; this is not a global Enter shortcut.','button'),

e('toggle','Toggle buttons','Basic controls',`
<div class="row"><button id="toggle" aria-pressed="false">Show grid</button><button aria-pressed="true" disabled>Snap (locked)</button></div><div id="grid" style="margin-top:18px;height:80px;border:1px solid gray"></div>`,
({$,on,report})=>on($('#toggle'),'click',()=>{const active=$('#toggle').getAttribute('aria-pressed')!=='true';$('#toggle').setAttribute('aria-pressed',active);$('#grid').style.background=active?'repeating-linear-gradient(90deg,transparent 0 19px,#888 19px 20px),repeating-linear-gradient(transparent 0 19px,#888 19px 20px)':'';report(active?'Grid shown.':'Grid hidden.');}),
'Off/on, pressed feedback, focus, and disabled on state.','Space or Enter toggles the focused button.',
'Keep the label stable and expose its persistent state with aria-pressed. A momentary command needs no aria-pressed.','button'),

e('checkbox','Checkboxes and mixed state','Basic controls',`
<fieldset class="stack"><legend>Export channels</legend><label><input type="checkbox" id="all">All channels (mixed until equal)</label><label><input type="checkbox" class="child" checked>Music</label><label><input type="checkbox" class="child">Effects</label><label><input type="checkbox" disabled checked>Required metadata</label></fieldset>`,
({$,$$,on,report})=>{const all=$('#all'),children=$$('.child');const sync=()=>{const n=children.filter(x=>x.checked).length;all.checked=n===children.length;all.indeterminate=n>0&&n<children.length;report(`${n} of ${children.length} optional channels selected.`);};on(all,'change',()=>{children.forEach(x=>x.checked=all.checked);sync();});children.forEach(x=>on(x,'change',sync));sync();},
'Unchecked, checked, mixed aggregate, focused, disabled checked.','Tab visits each enabled checkbox; Space toggles. Activating a mixed parent selects all children.',
'Mixed describes an aggregate, not a third saved boolean. Setting indeterminate is separate from checked.','checkbox'),

e('radio','Radio-button groups','Basic controls',`
<fieldset class="stack"><legend>Image quality</legend><label><input type="radio" name="quality" value="Draft" checked>Draft</label><label><input type="radio" name="quality" value="Normal">Normal</label><label><input type="radio" name="quality" value="Best">Best</label><label><input type="radio" name="quality" disabled>Printer managed</label></fieldset>`,
({$$,on,report})=>$$('[name=quality]').forEach(x=>on(x,'change',()=>report(`Quality: ${x.value}`))),
'One selected option, focus, and disabled option. The legend labels the choice as a whole.',
'Tab enters or leaves the group; arrow keys choose among enabled options; Space selects.',
'Native inputs with a shared name supply mutual exclusion and keyboard behavior. Separate unrelated groups need different names.','radio'),

e('text','Text fields and validation','Basic controls',`
<form id="form" class="stack"><label class="field">Document name <input id="name" maxlength="50" aria-describedby="help error" required value="Letter"></label><span id="help">Use a name without / or \\.</span><span id="error" class="error"></span><label class="field">Read-only location <input readonly value="C:\\Documents"></label><label class="field">Unavailable account <input disabled value="Local user"></label><label class="field">Password <input type="password" autocomplete="new-password"></label><button class="default">Save name</button></form>`,
({$,on,report})=>{const input=$('#name');on(input,'input',()=>{input.setCustomValidity(/[\\/]/.test(input.value)?'Remove slashes from the name.':'');$('#error').textContent=input.validationMessage;input.setAttribute('aria-invalid',!input.validity.valid);});on($('#form'),'submit',ev=>{ev.preventDefault();report(`Saved name: ${input.value}`);});},
'Editable, read-only (selectable), disabled, password, and invalid with a connected explanation.',
'Native selection, clipboard, Home/End and text editing keys remain available. Enter submits.',
'Do not intercept typing to implement application shortcuts. Validation appears beside the field and uses browser constraint validation.'),

e('multiline','Multiline text','Basic controls',`
<label class="field">Notes <textarea id="notes" rows="5" spellcheck="true">First line\nSecond line</textarea></label><div class="row"><button id="save">Save notes</button><span id="count"></span></div>`,
({$,on,report})=>{const update=()=>$('#count').textContent=`${$('#notes').value.length} characters`;on($('#notes'),'input',update);on($('#save'),'click',()=>report(`Saved ${$('#notes').value.split('\n').length} lines in this example.`));update();},
'Multiple lines, selection, scrolling, focus and resize.','Enter inserts a new line; Tab moves to Save. Native Ctrl+A/C/X/V and navigation work.',
'This is plain text. RichEdit, embedded objects and document formatting need a separate editor integration.'),

e('spinner','Numeric field and spin control','Basic controls',`
<label class="field">Copies (1–20) <input id="copies" type="number" min="1" max="20" step="1" value="2" required></label><div class="actions"><button id="use">Use copies</button></div><p class="hint">The browser supplies the spin buttons. Type 0 or 21 to try validation.</p>`,
({$,on,report})=>{on($('#use'),'click',()=>{const x=$('#copies');if(x.reportValidity())report(`${x.valueAsNumber} copies selected.`);});},
'Editable, increment/decrement, minimum/maximum and invalid typed values.','Up/Down changes one step; typing and native text selection work. Tab exits.',
'A native number input avoids inventing text editing rules. Its arrow artwork is browser dependent; paired custom spin buttons must preserve the same labeled field and bounds.','spinbutton'),

e('select','Drop-down selection','Basic controls',`
<div class="stack"><label class="field">Paper size <select id="paper"><option>A4</option><option>Letter</option><option>Legal</option><option disabled>Custom (unavailable)</option></select></label><label class="field">Unavailable device <select disabled><option>Offline printer</option></select></label></div>`,
({$,on,report})=>on($('#paper'),'change',()=>report(`Paper: ${$('#paper').value}`)),
'Closed/open, selected option, disabled option and disabled control.','Native arrows, type-ahead, Alt+Down and Escape behavior follow the browser and host.',
'The popup belongs to the browser or OS. Do not promise pixel-identical option menus on every host.'),

e('combobox','Editable combo box','Basic controls',`
<div style="position:relative;max-width:330px"><label class="field">Font family <input id="combo" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="choices" autocomplete="off" value="Arial"></label><ul id="choices" role="listbox" aria-label="Suggested font families" class="list" hidden style="position:absolute;width:100%;z-index:3"></ul></div><p class="hint">Type any font name or choose a suggestion.</p><button id="use">Use font</button>`,
({$,on,report})=>{
 const input=$('#combo'),list=$('#choices'),names=['Arial','Courier New','Georgia','Tahoma','Times New Roman','Verdana'];let active=-1,shown=[];
 const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;};
 const highlight=()=>{[...list.children].forEach((el,i)=>el.setAttribute('aria-selected',i===active));if(active>=0)input.setAttribute('aria-activedescendant',`choice-${active}`);else input.removeAttribute('aria-activedescendant');};
 const open=(filter=false)=>{shown=names.filter(n=>!filter||n.toLowerCase().includes(input.value.toLowerCase()));list.replaceChildren(...shown.map((name,i)=>{const li=document.createElement('li');li.id=`choice-${i}`;li.role='option';li.textContent=name;on(li,'mousedown',ev=>ev.preventDefault());on(li,'click',()=>{input.value=name;close();report(`Font: ${name}`);});return li;}));active=-1;list.hidden=!shown.length;input.setAttribute('aria-expanded',String(!!shown.length));highlight();};
 on(input,'input',()=>open(true));on(input,'keydown',ev=>{if(ev.key==='Escape'){if(!list.hidden){ev.preventDefault();ev.stopPropagation();close();}}else if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){ev.preventDefault();if(ev.altKey&&ev.key==='ArrowUp'){close();return;}if(list.hidden)open();if(shown.length){active=(active+(ev.key==='ArrowDown'?1:-1)+shown.length)%shown.length;highlight();}}else if(ev.key==='Enter'&&!list.hidden){ev.preventDefault();if(active>=0)input.value=shown[active];close();report(`Font: ${input.value}`);}else if(ev.key==='Tab')close();});on(input,'blur',close);on($('#use'),'click',()=>report(`Font: ${input.value}`));
},
'Free text, filtered suggestions, active suggestion distinct from committed value, empty results, closed popup.',
'Down/Up opens and moves suggestions; Enter accepts; Escape dismisses without replacing text; Tab leaves. Home/End edit text.',
'A modern ARIA adaptation. DOM focus stays in the field while aria-activedescendant names the current option. Native edit keys are not captured.','combobox'),

e('listbox','Single-selection list box','Basic controls',`
<label class="field">Available templates <select id="list" size="5"><option selected>Blank</option><option>Letter</option><option>Report</option><option>Invoice</option><option disabled>Archived</option></select></label><button id="open" style="margin-top:15px">Open template</button>`,
({$,on,report})=>on($('#open'),'click',()=>report(`Opened template: ${$('#list').value}`)),
'Selected row, focus, scroll and disabled item. Selection does not activate the document.',
'Arrows, Home/End and type-ahead choose an item; Tab reaches Open; Enter activates the button.',
'This native list deliberately keeps selection and the explicit Open action separate.','listbox'),

e('multiselect','Multiple-selection list box','Basic controls',`
<label class="field">Files to export <select id="files" size="5" multiple aria-describedby="selection-help"><option selected>Intro.wav</option><option>Theme.wav</option><option selected>Ending.wav</option><option>Credits.wav</option></select></label><p id="selection-help">Use Ctrl+click to toggle, or Shift to extend a range. Keyboard conventions follow your host.</p><button id="export">Export selected</button>`,
({$,on,report})=>on($('#export'),'click',()=>report(`Selected: ${[...$('#files').selectedOptions].map(x=>x.value).join(', ')||'none'}`)),
'Discontiguous selections, range selection and empty selection.','Native modifier+arrow/Space selection varies by platform; Ctrl+A selects all on Windows. Tab leaves.',
'The native multiple select retains host keyboard behavior; custom lists must choose and document a selection model.','listbox'),

e('groupbox','Group boxes and labels','Basic controls',`
<div class="row" style="align-items:stretch"><fieldset class="stack"><legend>Page orientation</legend><label><input type="radio" name="orientation" checked>Portrait</label><label><input type="radio" name="orientation">Landscape</label></fieldset><fieldset class="stack" disabled><legend>Printer finishing (offline)</legend><label><input type="checkbox">Staple</label><label><input type="checkbox">Punch holes</label></fieldset></div>`,
()=>{},'Etched group, legend interrupting the border, labels, enabled and disabled groups.',
'The group itself adds no Tab stop. Tab and arrows operate the contained controls.',
'Use fieldset and legend for a related set. Borders alone do not provide the group name to assistive technology.'),

e('slider','Horizontal and vertical sliders','Feedback and layout',`
<div class="row"><label class="field">Volume <input id="volume" type="range" min="0" max="100" value="40"><output id="volume-value" for="volume">40%</output></label><label class="field">Balance <input id="balance" aria-orientation="vertical" style="writing-mode:vertical-lr;direction:rtl;min-width:25px;width:30px;height:130px" type="range" min="-10" max="10" value="0"><output id="balance-value" for="balance">0</output></label><input type="range" aria-label="Unavailable level" disabled></div>`,
({$,on,report})=>['volume','balance'].forEach(id=>on($('#'+id),'input',()=>{$('#'+id+'-value').value=$('#'+id).value+(id==='volume'?'%':'');report(`${id}: ${$('#'+id).value}`);})),
'Horizontal/vertical, value, bounds, focus and disabled.','Native arrows change a step; Home/End reach bounds. The vertical slider uses Up to increase.',
'CSS writing-mode is a modern browser adaptation; verify orientation and keys in each browser you support.','slider'),

e('progress','Progress bars','Feedback and layout',`
<label class="field">Export progress <progress id="progress" max="100" value="0"></progress></label><p id="amount">0% — ready</p><div class="row"><button id="advance">Advance 25%</button><button id="unknown">Unknown duration</button><button id="cancel">Cancel</button></div>`,
({$,on,report})=>{const p=$('#progress');on($('#advance'),'click',()=>{p.value=Math.min(100,(p.hasAttribute('value')?p.value:0)+25);$('#amount').textContent=`${p.value}%${p.value===100?' — complete':''}`;report($('#amount').textContent);});on($('#unknown'),'click',()=>{p.removeAttribute('value');$('#amount').textContent='Working — duration unknown';report('Indeterminate progress.');});on($('#cancel'),'click',()=>{p.value=0;$('#amount').textContent='Canceled';report('Canceled the demonstration.');});},
'Determinate, indeterminate, complete and canceled.','The bar is not a Tab stop. Buttons operate this manually advanced demonstration.',
'Use a real job’s measurements in an app; do not invent percentages. Announce milestones instead of every animation frame.'),

e('scrollbars','Scrollbars and scrolling regions','Feedback and layout',`
<div class="scrollbox" tabindex="0" aria-label="Scrollable document"><div style="width:750px;height:400px;background:repeating-linear-gradient(#fff 0 29px,#ddd 29px 30px)"><strong>Wide document — horizontal and vertical scrolling</strong><p>Native overflow keeps wheel, keyboard, touch and accessibility support.</p><p style="padding-top:190px">End of the sample document.</p></div></div>`,
()=>{},'Two axes, thumb, track, focus and resizable viewport.','Focus the region; arrows/Page Up/Page Down scroll. Wheel and touch retain native behavior.',
'WebKit scrollbar styling is approximate and platform dependent. Arrow glyphs and always-visible bars are not guaranteed; use native overflow before implementing a custom scrollbar.'),

e('tooltip','Tooltips and status help','Feedback and layout',`
<div class="row"><span style="position:relative"><button id="tool" aria-describedby="tip">Fit page</button><span id="tip" role="tooltip" hidden style="position:absolute;left:0;top:34px;padding:5px;background:#ffffe1;border:1px solid #000;white-space:nowrap;z-index:3">Fit the entire page in the view</span></span><button id="other">Actual size</button></div><div role="status" id="status" style="margin-top:70px;border:2px inset white;padding:5px">Ready</div>`,
({$,on,report})=>{let timer,leaving,dismissed=false;const tool=$('#tool'),tip=$('#tip'),status=$('#status');const show=()=>{clearTimeout(timer);clearTimeout(leaving);if(!dismissed)timer=setTimeout(()=>tip.hidden=false,500);status.textContent='Fit the entire page in the view';};const hide=()=>{clearTimeout(timer);clearTimeout(leaving);tip.hidden=true;status.textContent='Ready';};on(tool,'pointerenter',()=>{dismissed=false;show();});on(tool,'focus',()=>{dismissed=false;show();});on(tool,'pointerleave',()=>{if(document.activeElement!==tool)leaving=setTimeout(hide,200);});on(tip,'pointerenter',()=>clearTimeout(leaving));on(tip,'pointerleave',()=>{if(document.activeElement!==tool)hide();});on(tool,'blur',hide);on(document,'keydown',ev=>{if(ev.key==='Escape'&&!tip.hidden){dismissed=true;hide();}});on(tool,'click',()=>report('Page fitted to the view.'));on($('#other'),'click',()=>report('View set to actual size.'));},
'Delayed hover/focus hint, Escape dismissal, supplemental status text.','Tab focuses the command; Escape dismisses its tooltip; Enter or Space runs it.',
'The button has a meaningful visible label without a tooltip. Essential instructions must remain visible. This noninteractive tooltip uses aria-describedby.','tooltip'),
];
