// The renderer's 3.1 frame controls the real, frameless BrowserWindow.
// Cursor positions come from Electron, so resizing also works across DPI scales.
"use strict";

function resizeBounds(bounds, edge, dx, dy, minimum) {
    let { x, y, width, height } = bounds;
    if (edge.includes("e")) width = Math.max(minimum[0], width + dx);
    if (edge.includes("s")) height = Math.max(minimum[1], height + dy);
    if (edge.includes("w")) { width = Math.max(minimum[0], width - dx); x += bounds.width - width; }
    if (edge.includes("n")) { height = Math.max(minimum[1], height - dy); y += bounds.height - height; }
    return { x, y, width, height };
}

function installWindowControls(win, ipcMain, screen) {
    let gesture = null;
    const owns = (event) => event.sender === win.webContents && !win.isDestroyed() &&
        (!event.senderFrame || event.senderFrame === win.webContents.mainFrame);
    const state = () => ({ maximized: win.isMaximized(), minimized: win.isMinimized(), focused: win.isFocused() });
    const report = () => { if (!win.isDestroyed()) win.webContents.send("window-state", state()); };
    for (const name of ["maximize", "unmaximize", "minimize", "restore", "focus", "blur"])
        win.on(name, report);
    win.on("blur", () => { gesture = null; });

    ipcMain.handle("window-state", (event) => owns(event) ? state() : null);
    ipcMain.handle("window-action", (event, action) => {
        if (!owns(event)) return null;
        gesture = null;
        if (action === "minimize") win.minimize();
        else if (action === "maximize") win.maximize();
        else if (action === "toggle-maximize") { if (win.isMaximized()) win.unmaximize(); else win.maximize(); }
        else if (action === "restore") { if (win.isMinimized()) win.restore(); if (win.isMaximized()) win.unmaximize(); }
        else if (action === "close") { win.close(); return null; }
        return win.isDestroyed() ? null : state();
    });

    ipcMain.on("window-gesture-start", (event, edge) => {
        if (!owns(event) || win.isMaximized() || !["move", "n", "s", "e", "w", "ne", "nw", "se", "sw"].includes(edge)) return;
        gesture = { edge, bounds: win.getBounds(), cursor: screen.getCursorScreenPoint(), dx: 0, dy: 0 };
    });
    function apply(dx, dy) {
        if (!gesture) return;
        const { edge, bounds } = gesture;
        win.setBounds(edge === "move" ? { ...bounds, x: bounds.x + dx, y: bounds.y + dy } :
            resizeBounds(bounds, edge, dx, dy, win.getMinimumSize()));
    }
    ipcMain.on("window-gesture-update", (event) => {
        if (!owns(event) || !gesture) return;
        const cursor = screen.getCursorScreenPoint();
        apply(cursor.x - gesture.cursor.x, cursor.y - gesture.cursor.y);
    });
    ipcMain.on("window-gesture-step", (event, dx, dy) => {
        if (!owns(event) || !gesture || !Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) > 32 || Math.abs(dy) > 32) return;
        gesture.dx += dx; gesture.dy += dy;
        apply(gesture.dx, gesture.dy);
    });
    ipcMain.on("window-gesture-end", (event, cancel) => {
        if (!owns(event) || !gesture) return;
        if (cancel === true) win.setBounds(gesture.bounds);
        gesture = null;
    });
}

module.exports = { installWindowControls, resizeBounds };
