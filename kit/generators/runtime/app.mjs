import {enhance,openDialog,closeDialog} from './components/gui95.mjs';
import {createCommandRegistry} from './commands.mjs';
import {createDocumentModel} from './document-model.mjs';
import {APP_NAME,TEMPLATE} from './config.mjs';
const byId=id=>document.getElementById(id);
const input=byId('document');
const caption=byId('caption');
const status=byId('status');
const reportError=error=>{status.textContent=error.message||String(error);};
const filename=byId('filename');
const model=createDocumentModel();
const desktop=globalThis.gui95Desktop;
function openAppDialog(dialog){let opener=document.activeElement;const menu=opener?.closest?.('[role="menu"]');if(menu)opener=document.querySelector('[data-gui95-menu="'+menu.id+'"]')??input;return openDialog(dialog,{opener});}
let busy=false;
let preferences={fontSize:13,wrap:true};
let records=[{id:'welcome',name:'Welcome.txt',text:'Welcome to '+APP_NAME+'\n\nOpen a local text document, edit it, and save your changes.'},{id:'notes',name:'Notes.txt',text:'A second document. Use the search field to filter this collection.'}];
try{const stored=JSON.parse(localStorage.getItem('gui95:records')||'null');if(Array.isArray(stored)&&stored.length<=100&&stored.every(x=>x&&typeof x.id==='string'&&typeof x.name==='string'&&typeof x.text==='string'))records=stored;}catch{}
const registry=createCommandRegistry([
  {id:'file.new',label:'New',help:'Start a new document',shortcut:'Primary+N',allowInEditable:true,enabled:()=>!busy,run:async()=>{if(await discard()){model.load();input.value='';render();}}},
  {id:'file.open',label:'Open…',help:'Open a text file from this computer',shortcut:'Primary+O',allowInEditable:true,enabled:()=>!busy,run:openFile},
  {id:'file.save',label:'Save',help:'Save the current document',shortcut:'Primary+S',allowInEditable:true,enabled:()=>!busy&&model.read().dirty,run:()=>saveFile(false)},
  {id:'file.save-as',label:'Save As…',help:'Choose a new file name',shortcut:'Primary+Shift+S',allowInEditable:true,enabled:()=>!busy,run:()=>saveFile(true)},
  {id:'edit.uppercase',label:'Uppercase',help:'Convert the document to uppercase',enabled:()=>!busy&&input.value.length>0,run:()=>transform(text=>text.toUpperCase())},
  {id:'edit.lowercase',label:'Lowercase',help:'Convert the document to lowercase',enabled:()=>!busy&&input.value.length>0,run:()=>transform(text=>text.toLowerCase())},
  {id:'view.wrap',label:'Word Wrap',help:'Wrap long lines',shortcut:'Primary+Shift+W',checked:()=>preferences.wrap,run:()=>{preferences.wrap=!preferences.wrap;applyPreferences();}},
  {id:'app.preferences',label:'Preferences…',help:'Choose text size and word wrap',run:showPreferences},
  {id:'collection.add',label:'Add to Collection',help:'Keep this document in the local collection',enabled:()=>!busy,run:()=>{const next=[...records,{id:String(Date.now())+'-'+Math.random().toString(36).slice(2),name:model.read().name,text:input.value}].slice(-100);if(persistRecords(next)){records=next;renderRecords();status.textContent='Added to collection.';}}},
  {id:'app.about',label:'About',help:'About this application',run:()=>openAppDialog(byId('about'))}
],{onError:reportError});
function render(){const state=model.read();caption.textContent=APP_NAME+' — '+state.name+(state.dirty?' *':'');document.title=caption.textContent;filename.textContent=state.name;byId('count').textContent=state.text.length+' characters · '+(state.text.trim()?state.text.trim().split(/\s+/).length:0)+' words';registry.refresh();}
function transform(fn){input.value=fn(input.value);model.edit(input.value);render();input.focus();}
async function discard(){if(!model.read().dirty)return true;const result=await openAppDialog(byId('unsaved'));if(result==='save')return saveFile(false);return result==='discard';}
async function openFile(){
  if(!await discard())return;
  const before=model.snapshot();busy=true;registry.refresh();
  try{
    const result=desktop?await desktop.openText():await browserOpen();
    if(!result)return;
    if(model.read().documentId!==before.documentId||model.read().revision!==before.revision){busy=false;registry.refresh();if(!await discard())return;busy=true;registry.refresh();}
    model.load(result);input.value=result.text;render();status.textContent='Opened '+result.name+'.';
  }finally{busy=false;registry.refresh();}
}
function browserOpen(){return new Promise(resolve=>{const picker=byId('file-picker');picker.value='';const finish=()=>{picker.removeEventListener('change',changed);picker.removeEventListener('cancel',cancelled);};const cancelled=()=>{finish();resolve(null);};const changed=async()=>{finish();const file=picker.files[0];if(!file){resolve(null);return;}if(file.size>4*1024*1024){status.textContent='Choose a text file smaller than 4 MiB.';resolve(null);return;}try{resolve({name:file.name,text:await file.text(),handle:null});}catch(error){status.textContent=error.message;resolve(null);}};picker.addEventListener('change',changed,{once:true});picker.addEventListener('cancel',cancelled,{once:true});picker.click();});}
async function saveFile(saveAs){
  if(busy)return false;const snapshot=model.snapshot();busy=true;registry.refresh();
  try{
    let result;let snapshotName=snapshot.name;
    if(desktop)result=await desktop.saveText({text:snapshot.text,name:snapshot.name,handle:snapshot.handle,saveAs});
    else {if(saveAs){byId('save-name').value=snapshot.name;if(await openAppDialog(byId('save-as'))!=='ok')return false;snapshotName=byId('save-name').value;}const blob=new Blob([snapshot.text],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=snapshotName;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);result={name:snapshotName,handle:null};}
    if(!result)return false;model.saved(snapshot,result);render();status.textContent=desktop?'Saved '+result.name+'.':'Downloaded '+result.name+'.';return !model.read().dirty;
  }finally{busy=false;registry.refresh();}
}
function applyPreferences(){input.style.fontSize=preferences.fontSize+'px';input.wrap=preferences.wrap?'soft':'off';registry.refresh();try{localStorage.setItem('gui95:preferences',JSON.stringify(preferences));}catch{}if(desktop)desktop.savePreferences(preferences).catch(error=>{status.textContent=error.message;});}
async function showPreferences(){byId('font-size').value=preferences.fontSize;byId('wrap').checked=preferences.wrap;const result=await openAppDialog(byId('preferences'));if(result==='ok'){preferences={fontSize:Number(byId('font-size').value),wrap:byId('wrap').checked};applyPreferences();}}
function persistRecords(next){try{localStorage.setItem('gui95:records',JSON.stringify(next));return true;}catch{status.textContent='Collection could not be stored; the document was not added.';return false;}}
function renderRecords(){const query=byId('search')?.value.toLowerCase()??'';const list=byId('records');if(!list)return;list.replaceChildren();for(const record of records.filter(record=>record.name.toLowerCase().includes(query))){const item=document.createElement('li');const button=document.createElement('button');button.type='button';button.textContent=record.name;button.addEventListener('click',async()=>{try{if(await discard()){model.load({name:record.name,text:record.text});input.value=record.text;render();}}catch(error){reportError(error);}});item.append(button);list.append(item);}if(!list.children.length){const empty=document.createElement('li');empty.textContent='No matching documents.';list.append(empty);}}
input.addEventListener('input',()=>{model.edit(input.value);render();});
byId('search')?.addEventListener('input',renderRecords);
for(const form of document.querySelectorAll('dialog form'))form.addEventListener('submit',event=>{event.preventDefault();if(form.reportValidity())closeDialog(form.closest('dialog'),event.submitter?.value??'ok');});
window.addEventListener('beforeunload',event=>{if(model.read().dirty){event.preventDefault();event.returnValue='';}});
registry.bind(document,{status});enhance(document);
try{const stored=desktop?await desktop.getPreferences():JSON.parse(localStorage.getItem('gui95:preferences')||'null');if(stored&&Number.isFinite(stored.fontSize)&&stored.fontSize>=11&&stored.fontSize<=32&&typeof stored.wrap==='boolean')preferences=stored;}catch{}
applyPreferences();render();renderRecords();
if(TEMPLATE==='browser'){model.load(records[0]??{});input.value=model.read().text;render();}
export {model,registry};
