// No Electron process or visible window: exercise the real main/preload IPC
// wiring against a host window double, including restore and resize limits.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { installWindowControls } from "../window_controls.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ipcMain = new EventEmitter();
const handlers = new Map();
ipcMain.handle = (name, fn) => handlers.set(name, fn);
const renderer = new EventEmitter();
let win, bridge, cursor = { x: 200, y: 200 };
let diskVotes = "+ Pop: The Last Bus Home · on NES\n- 0:12 OST: Land's End · seed=199936790\n";
const voteWrites = [];
let voteReadError = false;
let voteWriteError = false;
class HostWindow extends EventEmitter {
    constructor(options) {
        super(); win = this; this.options = options;
        this.bounds = { x: 100, y: 80, width: options.width, height: options.height };
        this.maximized = this.minimized = this.destroyed = false;
        this.webContents = { mainFrame: {}, send: (name, value) => renderer.emit(name, {}, value) };
    }
    isDestroyed() { return this.destroyed; }
    isFocused() { return true; }
    isMaximized() { return this.maximized; }
    isMinimized() { return this.minimized; }
    maximize() { this.maximized = true; this.emit("maximize"); }
    unmaximize() { this.maximized = false; this.emit("unmaximize"); }
    minimize() { this.minimized = true; this.emit("minimize"); }
    restore() { this.minimized = false; this.emit("restore"); }
    close() { this.destroyed = true; this.emit("closed"); }
    getBounds() { return { ...this.bounds }; }
    setBounds(bounds) { this.bounds = { ...bounds }; }
    getMinimumSize() { return [this.options.minWidth, this.options.minHeight]; }
    setMenu(menu) { this.menu = menu; }
    loadURL(url) { this.url = url; }
}
const app = new EventEmitter();
Object.assign(app, { isPackaged: false, commandLine: { appendSwitch() {} }, requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(), getPath: () => "test-output", quit() {} });
const electron = { app, BrowserWindow: HostWindow, ipcMain, screen: { getCursorScreenPoint: () => cursor },
    Menu: { setApplicationMenu: (menu) => { electron.menu = menu; } },
    protocol: { registerSchemesAsPrivileged() {}, handle() {} }, globalShortcut: { register: () => true, unregisterAll() {} },
    shell: {}, dialog: {}, clipboard: {} };

vm.runInNewContext(fs.readFileSync(path.join(root, "main.js"), "utf8"), {
    require: (name) => name === "electron" ? electron : name === "node:path" ? path :
        name === "node:fs" ? { mkdirSync() {}, copyFileSync() {}, existsSync: () => true } :
        name === "./window_controls.js" ? { installWindowControls } : {
            kFiles: { overlay: "overlay.html" }, writeNowPlaying() {},
            readVotes() { if (voteReadError) throw new Error("Unreadable file"); return diskVotes; },
            writeVotes(_dir, text) { if (voteWriteError) throw new Error("Disk full"); diskVotes = text; voteWrites.push(text); },
        },
    __dirname: root, process: { env: {} }, console,
});
await new Promise(resolve => setImmediate(resolve));
const owner = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
renderer.invoke = async (name, ...args) => handlers.get(name)(owner, ...args);
renderer.send = (name, ...args) => ipcMain.emit(name, owner, ...args);
vm.runInNewContext(fs.readFileSync(path.join(root, "preload.js"), "utf8"), {
    require: () => ({ ipcRenderer: renderer, contextBridge: { exposeInMainWorld: (_name, api) => { bridge = api; } } }),
});

assert.equal(win.options.frame, false);
assert.equal(win.options.thickFrame, false);
assert.equal(win.options.roundedCorners, false);
assert.equal(win.options.resizable, true);
assert.equal(win.options.fullscreenable, false);
assert.equal(win.menu, null);
assert.equal(electron.menu, null);
console.log("ok - startup uses only the custom frame and menu");

await assert.rejects(bridge.votes(""), /not been loaded/);
assert.equal(voteWrites.length, 0, "no startup save is allowed before restoration");
voteReadError = true;
await assert.rejects(bridge.loadVotes(), /Unreadable file/);
await assert.rejects(bridge.votes(""), /not been loaded/);
assert.equal(voteWrites.length, 0, "a failed restoration must not erase the desktop file");
voteReadError = false;
assert.equal(await handlers.get("load-votes")({ sender: {} }), null);
assert.equal(await handlers.get("load-votes")({ sender: win.webContents, senderFrame: {} }), null);
const restoredVotes = await bridge.loadVotes();
assert.equal(restoredVotes, diskVotes);
assert.throws(() => handlers.get("save-votes")({ sender: {} }, ""), /not been loaded/);
assert.throws(() => handlers.get("save-votes")({ sender: win.webContents, senderFrame: {} }, ""), /not been loaded/);
await assert.rejects(bridge.votes(undefined), /not been loaded/);
assert.equal(voteWrites.length, 0);
const migratedVotes = JSON.stringify({ schemaVersion: 1, tracks: [{ vote: "like", title: "The Last Bus Home" }] });
await bridge.votes(migratedVotes);
assert.equal(voteWrites.length, 1);
assert.equal(await bridge.loadVotes(), migratedVotes, "a fresh renderer loads the migrated desktop choices");
voteWriteError = true;
await assert.rejects(bridge.votes(migratedVotes), /Disk full/, "save failures reach the renderer");
assert.equal(voteWrites.length, 1);
voteWriteError = false;
console.log("ok - desktop choices restore before saving; read failures and foreign senders cannot erase them");

const reported = [];
bridge.onWindowState(state => reported.push(state));
await bridge.windowAction("toggle-maximize");
assert.equal(win.isMaximized(), true, "the bridge must maximize the host, not just change CSS");
assert.equal(reported.at(-1).maximized, true);
await bridge.windowAction("toggle-maximize");
assert.equal(win.isMaximized(), false);
assert.equal(reported.at(-1).maximized, false);
await bridge.windowAction("minimize");
assert.equal(win.isMinimized(), true);
await bridge.windowAction("restore");
assert.equal(win.isMinimized(), false);
console.log("ok - caption commands and native state round-trip through the preload");

assert.equal(await handlers.get("window-action")({ sender: {} }, "maximize"), null);
assert.equal(await handlers.get("window-action")({ sender: win.webContents, senderFrame: {} }, "maximize"), null);
assert.equal(win.isMaximized(), false);
console.log("ok - other windows and subframes cannot control the player");

const original = win.getBounds();
bridge.beginWindowGesture("nw");
cursor = { x: 2000, y: 2000 };
bridge.updateWindowGesture();
assert.equal(win.bounds.width, win.options.minWidth);
assert.equal(win.bounds.height, win.options.minHeight);
assert.equal(win.bounds.x + win.bounds.width, original.x + original.width);
assert.equal(win.bounds.y + win.bounds.height, original.y + original.height);
bridge.endWindowGesture(true);
assert.deepEqual(win.getBounds(), original);
console.log("ok - resizing respects minimum size, opposite edges, and cancellation");

bridge.beginWindowGesture("move");
bridge.stepWindowGesture(8, -8);
assert.deepEqual(win.getBounds(), { ...original, x: original.x + 8, y: original.y - 8 });
bridge.stepWindowGesture(Infinity, 0);
assert.equal(win.bounds.x, original.x + 8);
bridge.endWindowGesture(true);
bridge.beginWindowGesture("se");
win.emit("blur");
cursor = { x: 3000, y: 3000 };
bridge.updateWindowGesture();
assert.deepEqual(win.getBounds(), original);
console.log("ok - keyboard movement is bounded and losing focus ends a gesture");

await bridge.windowAction("close");
assert.equal(win.isDestroyed(), true);
assert.equal(await bridge.windowState(), null);
console.log("ok - the 3.1 Close command closes the host window");
