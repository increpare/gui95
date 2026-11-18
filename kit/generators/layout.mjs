/** Generate a labelled, validated form layout. Values are data, never executable source. */
export const html=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const json=value=>JSON.stringify(value,null,2).replace(/[<>\u2028\u2029]/g,char=>`\\u${char.charCodeAt(0).toString(16).padStart(4,'0')}`);
const types=['properties','preferences','inspector','editor'];
const controls=['text','number','checkbox','select','textarea','range','color'];
const idPattern=/^[a-z][a-z0-9-]{0,63}$/i;
function string(value,label,max=1024,fallback='') {if(value===undefined)return fallback;if(typeof value!=='string'||value.length>max)throw new TypeError(`${label} must be a string up to ${max} characters`);return value;}
function id(value,label){if(typeof value!=='string'||!idPattern.test(value)||value.toLowerCase().startsWith('gui95-'))throw new TypeError(`${label} must start with a letter and contain letters, digits or hyphens; gui95- is reserved`);return value;}
function dimension(value,label,min,max,fallback){if(value===undefined)return fallback;if(!Number.isInteger(value)||value<min||value>max)throw new RangeError(`${label} must be an integer from ${min} to ${max}`);return value;}
export function validateLayout(spec) {
  if(!spec||typeof spec!=='object'||Array.isArray(spec))throw new TypeError('layout must be an object');
  if(!types.includes(spec.type))throw new TypeError(`type must be one of ${types.join(', ')}`);
  const allIds=new Set();let count=0;
  const field=source=>{
    if(!source||typeof source!=='object'||Array.isArray(source))throw new TypeError('field must be an object');
    const key=id(source.id,'field.id'); if(allIds.has(key))throw new TypeError(`Duplicate field id: ${key}`);allIds.add(key);count++;
    const type=source.type??'text';if(!controls.includes(type))throw new TypeError(`${key}: unsupported field type`);
    const result={id:key,type,label:string(source.label,`${key}.label`,1024,key),help:string(source.help,`${key}.help`,2048)};
    for(const flag of ['required','disabled']){if(source[flag]!==undefined&&typeof source[flag]!=='boolean')throw new TypeError(`${key}.${flag} must be boolean`);result[flag]=source[flag]??false;}
    if(type==='number'||type==='range') {
      for(const prop of ['min','max','step'])if(source[prop]!==undefined){if(typeof source[prop]!=='number'||!Number.isFinite(source[prop]))throw new TypeError(`${key}.${prop} must be finite`);result[prop]=source[prop];}
      if(type==='range'){result.min??=0;result.max??=100;}
      if(result.min!==undefined&&result.max!==undefined&&result.min>result.max)throw new RangeError(`${key}: min must not exceed max`);
      if(result.step!==undefined&&result.step<=0)throw new RangeError(`${key}: step must be positive`);
      result.value=source.value??result.min??0;
      if(typeof result.value!=='number'||!Number.isFinite(result.value)||(result.min!==undefined&&result.value<result.min)||(result.max!==undefined&&result.value>result.max))throw new RangeError(`${key}: value must be finite and within min/max`);
    }else if(type==='checkbox'){
      if(source.value!==undefined&&typeof source.value!=='boolean')throw new TypeError(`${key}.value must be boolean`);result.value=source.value??false;
    }else {
      result.value=string(source.value,`${key}.value`,65536);
      if(type==='color'){result.value=source.value??'#000080';if(!/^#[0-9a-f]{6}$/i.test(result.value))throw new TypeError(`${key}: color value must use #rrggbb`);}
      if(type==='select'){
        if(!Array.isArray(source.options)||source.options.length<1||source.options.length>100)throw new TypeError(`${key}: select needs 1 to 100 options`);
        const values=new Set();result.options=source.options.map(option=>{if(!option||typeof option!=='object')throw new TypeError(`${key}: option must be an object`);const value=string(option.value,`${key}.option.value`,256);if(values.has(value))throw new TypeError(`${key}: duplicate option value`);values.add(value);return {value,label:string(option.label,`${key}.option.label`,1024,value)};});
        result.value=source.value??result.options[0].value;if(!values.has(result.value))throw new RangeError(`${key}: value must match an option`);
      }
    }
    return result;
  };
  if(spec.fields!==undefined&&!Array.isArray(spec.fields))throw new TypeError('fields must be an array');
  if(spec.groups!==undefined&&(!Array.isArray(spec.groups)||spec.groups.length>12))throw new TypeError('groups must be an array of at most 12 groups');
  const groupIds=new Set();
  const groups=(spec.groups??[]).map(source=>{if(!source||typeof source!=='object')throw new TypeError('group must be an object');const key=id(source.id,'group.id');if(groupIds.has(key))throw new TypeError(`Duplicate group id: ${key}`);groupIds.add(key);if(!Array.isArray(source.fields))throw new TypeError(`${key}.fields must be an array`);return{id:key,label:string(source.label,`${key}.label`,1024,key),fields:source.fields.map(field)};});
  const fields=(spec.fields??[]).map(field);if(count>80)throw new RangeError('layout supports at most 80 fields');
  const actionIds=new Set();
  if(spec.actions!==undefined&&(!Array.isArray(spec.actions)||spec.actions.length>8))throw new TypeError('actions must be an array of at most 8 actions');
  const actions=(spec.actions??[{id:'apply',label:spec.type==='inspector'?'Apply':'OK',primary:true},{id:'cancel',label:'Cancel'}]).map(source=>{if(!source||typeof source!=='object')throw new TypeError('action must be an object');const key=id(source.id,'action.id');if(actionIds.has(key))throw new TypeError(`Duplicate action id: ${key}`);actionIds.add(key);if(source.primary!==undefined&&typeof source.primary!=='boolean')throw new TypeError(`${key}.primary must be boolean`);return {id:key,label:string(source.label,`${key}.label`,256,key),primary:source.primary??false};});
  return {type:spec.type,title:string(spec.title,'title',256,'Properties'),description:string(spec.description,'description',2048),width:dimension(spec.width,'width',240,1600,spec.type==='editor'?800:480),height:dimension(spec.height,'height',180,1200,spec.type==='editor'?560:420),fields,groups,actions};
}
// Labels of fields end with a colon, as Windows 95 dialogs wrote them; check box labels do not.
const fieldLabel=text=>/[:?.!…]$/.test(text.trim())||!text.trim()?text:`${text}:`;
function fieldMarkup(field){
  const common=`id="${html(field.id)}" name="${html(field.id)}"${field.required?' required':''}${field.disabled?' disabled':''}${field.help?` aria-describedby="gui95-help-${html(field.id)}"`:''}`;
  const attrs=['min','max','step'].filter(key=>field[key]!==undefined).map(key=>` ${key}="${field[key]}"`).join('');
  const help=field.help?`<small id="gui95-help-${html(field.id)}" ${field.type==='checkbox'?'data-gui95-wide':'data-gui95-indent'}>${html(field.help)}</small>`:'';
  if(field.type==='checkbox')return `<label for="${html(field.id)}" data-gui95-wide><input type="checkbox" ${common}${field.value?' checked':''}>${html(field.label)}</label>${help}`;
  let input;
  if(field.type==='textarea')input=`<textarea ${common} rows="4">${html(field.value)}</textarea>`;
  else if(field.type==='select')input=`<select ${common}>${field.options.map(option=>`<option value="${html(option.value)}"${option.value===field.value?' selected':''}>${html(option.label)}</option>`).join('')}</select>`;
  else input=`<input type="${field.type}" ${common} value="${html(field.value)}"${attrs}${field.type==='number'?' data-gui95-number':''}>`;
  return `<label for="${html(field.id)}">${html(fieldLabel(field.label))}</label>${input}${help}`;
}
// Fields go in the kit's label and field grid; groups are group boxes; the actions are the bottom command row.
const formGrid=fields=>fields.length?`<div data-gui95-form>${fields.map(fieldMarkup).join('\n')}</div>`:'';
export function generateLayout(input) {
  const spec=validateLayout(input);
  const groups=spec.groups.map(group=>`<fieldset class="group-box" data-gui95-group><legend>${html(group.label)}</legend>${formGrid(group.fields)}</fieldset>`).join('\n');
  const main=`<form id="gui95-form" data-gui95-dialog-layout><div data-gui95-dialog-body>${spec.description?`<p>${html(spec.description)}</p>`:''}${formGrid(spec.fields)}${groups}</div><div data-gui95-buttons>${spec.actions.map(action=>`<button type="${action.id==='cancel'?'button':'submit'}" data-action="${html(action.id)}"${action.primary?' class="default"':''}>${html(action.label)}</button>`).join('')}</div></form>`;
  const body=spec.type==='editor'?`<div class="gui95-editor-layout"><textarea id="gui95-editor" aria-label="Document" spellcheck="false"></textarea><aside aria-label="Properties">${main}</aside></div>`:main;
  return {files:[
    {path:'index.html',text:`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'"><title>${html(spec.title)}</title><link rel="stylesheet" href="./components/gui95.css"><link rel="stylesheet" href="./layout.css"></head><body class="gui95"><main class="window gui95-layout"><div class="title-bar"><span id="gui95-caption">${html(spec.title)}</span></div><div class="window-body">${body}</div><output id="gui95-status" class="status-bar" role="status" aria-live="polite">Ready</output></main><script type="module" src="./app.mjs"></script></body></html>\n`},
    {path:'layout.css',text:`body{margin:0;padding:12px;min-width:0;box-sizing:border-box;background:#008080}.gui95 .gui95-layout{width:min(${spec.width}px,100%);min-height:min(${spec.height}px,calc(100dvh - 24px));margin:auto}.gui95 .gui95-layout>.window-body{padding:0;display:flex;flex-direction:column}.gui95 #gui95-form{flex:1}.gui95 .gui95-editor-layout{flex:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,35%);min-height:380px}.gui95 .gui95-editor-layout>aside{display:flex;min-width:0;min-height:0}.gui95 #gui95-editor{resize:none;min-width:0;min-height:0;margin:var(--gui95-dlg-margin-y) 0 var(--gui95-dlg-margin-y) var(--gui95-dlg-margin-x);font-family:monospace}@media(max-width:600px){.gui95 .gui95-editor-layout{grid-template-columns:minmax(0,1fr)}.gui95 #gui95-editor{min-height:200px;margin-right:var(--gui95-dlg-margin-x);margin-bottom:0}}\n`},
    {path:'app.mjs',text:`import {enhance} from './components/gui95.mjs';\nconst spec=${json(spec)};\nconst form=document.getElementById('gui95-form');\nconst status=document.getElementById('gui95-status');\nconst fields=[...spec.fields,...spec.groups.flatMap(group=>group.fields)];\nlet committed=Object.fromEntries(fields.map(field=>[field.id,field.value]));\nconst controls=new Map(fields.map(field=>[field.id,document.getElementById(field.id)]));\nconst storageKey='gui95:layout:'+spec.type+':'+spec.title;\nfunction values(){return Object.fromEntries(fields.map(field=>{const input=controls.get(field.id);return [field.id,field.type==='checkbox'?input.checked:['number','range'].includes(field.type)?input.valueAsNumber:input.value];}));}\nfunction restore(data){for(const field of fields){const input=controls.get(field.id);if(Object.hasOwn(data,field.id)){if(field.type==='checkbox')input.checked=Boolean(data[field.id]);else input.value=data[field.id];}}}\nif(spec.type==='preferences'){try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved&&typeof saved==='object'){restore(saved);if(form.checkValidity())committed=values();else restore(committed);}}catch{status.textContent='Preferences could not be loaded.';}}\nform.addEventListener('submit',event=>{event.preventDefault();if(!form.reportValidity())return;const action=event.submitter?.dataset.action??'apply';const candidate=values();if(spec.type==='preferences'){try{localStorage.setItem(storageKey,JSON.stringify(candidate));}catch{status.textContent='Preferences could not be saved.';return;}}committed=candidate;form.dispatchEvent(new CustomEvent('gui95:commit',{bubbles:true,detail:{action,values:committed}}));status.textContent='Applied.';});\nform.addEventListener('click',event=>{if(event.target.closest('[data-action="cancel"]')){restore(committed);status.textContent='Changes cancelled.';form.dispatchEvent(new CustomEvent('gui95:cancel',{bubbles:true}));}});\nif(spec.type==='inspector')form.addEventListener('input',()=>{if(form.checkValidity()){form.dispatchEvent(new CustomEvent('gui95:change',{bubbles:true,detail:{values:values()}}));status.textContent='Preview updated.';}});\nenhance(document);\n`},
    {path:'layout.json',text:json(spec)+'\n'},
    {path:'README.md',text:`# ${spec.title}\n\nGenerated ${spec.type} layout. Serve this folder over HTTP and open index.html. The public download includes components/gui95.css and components/gui95.mjs. Native labels, required fields, numeric bounds and select values are generated from layout.json. Spacing, label alignment and button sizes come from the kit's dialog layout attributes (data-gui95-dialog-layout, data-gui95-dialog-body, data-gui95-form, data-gui95-group and data-gui95-buttons); layout.css only sizes the window.\n\nThe form emits bubbling gui95:commit with {action,values}, gui95:cancel, and (for inspectors) gui95:change for valid live values. Preferences persist on Apply/OK in localStorage; Cancel restores the last committed values. The editor layout supplies a document textarea for your application to connect.\n`}
  ],warnings:spec.fields.length+spec.groups.reduce((n,g)=>n+g.fields.length,0)===0?['No fields were supplied; this is an empty layout shell.']:[]};
}
