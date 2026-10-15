const { contextBridge, ipcRenderer, webUtils } = require("electron");
contextBridge.exposeInMainWorld("vector95Desktop", {
  ready: (timing) => ipcRenderer.send("editor:ready", timing),
  open: () => ipcRenderer.invoke("file:open"),
  openDropped: (file) => {
    // Resolve native Files here so web content cannot supply arbitrary paths.
    const filePath = webUtils.getPathForFile(file);
    return filePath
      ? ipcRenderer.invoke("file:open-dropped", filePath)
      : Promise.resolve(null);
  },
  recent: () => ipcRenderer.invoke("file:recent"),
  openRecent: (file) => ipcRenderer.invoke("file:open-recent", file),
  remember: (file) => ipcRenderer.invoke("file:remember", file),
  save: (data) => ipcRenderer.invoke("file:save", data),
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  onMaximizedChanged: (callback) =>
    ipcRenderer.on("window:maximized-state", (_event, maximized) =>
      callback(maximized === true),
    ),
  close: () => ipcRenderer.send("window:close"),
  onCloseRequested: (callback) =>
    ipcRenderer.on("window:confirm-close", () => callback()),
  confirmClose: () => ipcRenderer.send("window:confirmed-close"),
});
