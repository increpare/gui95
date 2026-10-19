const {app,BrowserWindow,ipcMain,dialog,Menu}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {randomUUID}=require('node:crypto');
const {atomicWriteText}=require('./files.cjs');
app.commandLine.appendSwitch('disable-lcd-text');
let win;let settings={width:900,height:620,fontSize:13,wrap:true};
const handles=new Map();
const index=path.join(__dirname,'..','index.html');
const indexURL=pathToFileURL(index).href;
const limit=4*1024*1024;
function sender(event){if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==indexURL)throw new Error('Untrusted document request');}
function remember(file){const handle=randomUUID();if(handles.size>=128)handles.delete(handles.keys().next().value);handles.set(handle,file);return handle;}
function validName(name){return typeof name==='string'&&name.length<=128&&!/[\\/:*?"<>|\x00-\x1f]/.test(name)&&name.trim()&&!/^\.+$/.test(name)?name:'Untitled.txt';}
let settingsWrite=Promise.resolve();
function storeSettings(){const text=JSON.stringify(settings);settingsWrite=settingsWrite.catch(()=>{}).then(async()=>{const folder=app.getPath('userData');await fs.mkdir(folder,{recursive:true});const target=path.join(folder,'preferences.json');const temporary=target+'.tmp';await fs.writeFile(temporary,text,'utf8');await fs.rename(temporary,target);});return settingsWrite;}
ipcMain.handle('gui95:open-text',async event=>{sender(event);const result=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Text documents',extensions:['txt','md','json','csv','log']},{name:'All files',extensions:['*']}]});if(result.canceled)return null;const file=result.filePaths[0];if((await fs.stat(file)).size>limit)throw new Error('Choose a text file smaller than 4 MiB');const text=await fs.readFile(file,'utf8');return {text,name:path.basename(file),handle:remember(file)};});
ipcMain.handle('gui95:save-text',async(event,data)=>{sender(event);if(!data||typeof data.text!=='string'||Buffer.byteLength(data.text,'utf8')>limit||typeof data.saveAs!=='boolean')throw new Error('Invalid save request');if(data.handle!==null&&data.handle!==undefined&&!handles.has(data.handle))throw new Error('Unknown file handle');let file=!data.saveAs&&data.handle?handles.get(data.handle):null;if(!file){const result=await dialog.showSaveDialog(win,{defaultPath:validName(data.name),filters:[{name:'Text document',extensions:['txt']},{name:'All files',extensions:['*']}]});if(result.canceled)return null;file=result.filePath;}await atomicWriteText(file,data.text);return {name:path.basename(file),handle:remember(file)};});
ipcMain.handle('gui95:get-preferences',event=>{sender(event);return {fontSize:settings.fontSize,wrap:settings.wrap};});
ipcMain.handle('gui95:save-preferences',async(event,value)=>{sender(event);if(!value||!Number.isInteger(value.fontSize)||value.fontSize<11||value.fontSize>32||typeof value.wrap!=='boolean')throw new Error('Invalid preferences');settings={...settings,fontSize:value.fontSize,wrap:value.wrap};await storeSettings();return true;});
async function createWindow(){
  win=new BrowserWindow({width:settings.width,height:settings.height,minWidth:420,minHeight:320,show:false,backgroundColor:'#c0c0c0',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(url!==indexURL)event.preventDefault();});
  win.webContents.session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  win.webContents.session.setPermissionCheckHandler(()=>false);
  win.webContents.on('will-prevent-unload',event=>{const choice=dialog.showMessageBoxSync(win,{type:'warning',buttons:['Keep Editing','Discard Changes'],defaultId:0,cancelId:0,message:'This document has unsaved changes.',detail:'Save the document before closing to keep your changes.'});if(choice===1)event.preventDefault();});
  win.once('ready-to-show',()=>win.show());
  win.on('resize',()=>{if(win&&!win.isMaximized()){const [width,height]=win.getSize();settings={...settings,width,height};}});
  win.on('closed',()=>{win=null;void storeSettings().catch(console.error);});
  await win.loadFile(index);
}
app.whenReady().then(async()=>{try{const stored=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'preferences.json'),'utf8'));if(Number.isInteger(stored.width)&&stored.width>=420&&stored.width<=2400)settings.width=stored.width;if(Number.isInteger(stored.height)&&stored.height>=320&&stored.height<=1800)settings.height=stored.height;if(Number.isInteger(stored.fontSize)&&stored.fontSize>=11&&stored.fontSize<=32)settings.fontSize=stored.fontSize;if(typeof stored.wrap==='boolean')settings.wrap=stored.wrap;}catch{}Menu.setApplicationMenu(process.platform==='darwin'?Menu.buildFromTemplate([{label:app.name,submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},{role:'editMenu'}]):null);await createWindow();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)void createWindow();});
