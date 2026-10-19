const {contextBridge,ipcRenderer}=require('electron');
// Capability-based file operations: the renderer never receives arbitrary filesystem access.
contextBridge.exposeInMainWorld('gui95Desktop',Object.freeze({
  openText:()=>ipcRenderer.invoke('gui95:open-text'),
  saveText:data=>ipcRenderer.invoke('gui95:save-text',{text:data.text,name:data.name,handle:data.handle??null,saveAs:Boolean(data.saveAs)}),
  getPreferences:()=>ipcRenderer.invoke('gui95:get-preferences'),
  savePreferences:value=>ipcRenderer.invoke('gui95:save-preferences',{fontSize:value.fontSize,wrap:value.wrap})
}));
