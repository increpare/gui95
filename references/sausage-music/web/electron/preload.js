// The bridge radio.js sees as window.procgenFM when the page runs in the
// desktop app. Reports go up to main.js, which writes the files; commands
// (from the global shortcuts) and notices come down. Nothing here decides
// anything: the page's own handlers run on each command.
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("procgenFM", {
    nowPlaying: (np) => ipcRenderer.send("nowplaying", np),
    votes: (text) => ipcRenderer.invoke("save-votes", text),
    loadVotes: () => ipcRenderer.invoke("load-votes"),
    ready: () => ipcRenderer.send("ready"),
    onCommand: (fn) => { ipcRenderer.on("command", (_e, cmd) => fn(String(cmd))); },
    onNotice: (fn) => { ipcRenderer.on("notice", (_e, text) => fn(String(text))); },
    windowState: () => ipcRenderer.invoke("window-state"),
    windowAction: (action) => ipcRenderer.invoke("window-action", action),
    onWindowState: (fn) => { ipcRenderer.on("window-state", (_e, state) => fn(state)); },
    beginWindowGesture: (edge) => ipcRenderer.send("window-gesture-start", edge),
    updateWindowGesture: () => ipcRenderer.send("window-gesture-update"),
    stepWindowGesture: (dx, dy) => ipcRenderer.send("window-gesture-step", dx, dy),
    endWindowGesture: (cancel = false) => ipcRenderer.send("window-gesture-end", cancel),
    desktopAction: (action) => ipcRenderer.invoke("desktop-action", action),
});
