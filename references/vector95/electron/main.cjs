const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  session,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const processCreated = process.getCreationTime() || Date.now();
const startup = {
  processCreatedUtc: new Date(processCreated).toISOString(),
  stages: [],
  resources: [],
};
const startupStage = (name) =>
  startup.stages.push({ name, elapsedMs: Date.now() - processCreated });
startupStage("main-script-started");
let startupFinished = false;
async function saveStartupTiming() {
  try {
    const directory = app.getPath("userData");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, "startup-timing.json"),
      JSON.stringify(startup, null, 2),
    );
  } catch (error) {
    console.warn("Could not record startup timing:", error.message);
  }
}
if (process.env.VECTOR95_USER_DATA)
  app.setPath("userData", path.resolve(process.env.VECTOR95_USER_DATA));
// Chromium's local-storage database has one writer. A second independent
// editor using this profile blocks its first storage read for several seconds.
const ownsProfile = app.requestSingleInstanceLock();
if (!ownsProfile) app.quit();
app.on("second-instance", () => {
  // Initialization will reveal the window itself if it is still starting.
  if (!win || !startupFinished) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});
protocol.registerSchemesAsPrivileged([
  {
    scheme: "vector95",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
let win;
let closing = false;
const authorizedPaths = new Set();
let lastFileDirectory;
let recentFiles = [];
let settingsWrite = Promise.resolve();
const samePath = (a, b) => a.toLowerCase() === b.toLowerCase();
const fileDialogSettings = () =>
  path.join(app.getPath("userData"), "file-dialog.json");
function persistFileSettings() {
  const settings = JSON.stringify({ lastFileDirectory, recentFiles });
  settingsWrite = settingsWrite.then(async () => {
    try {
      await fs.mkdir(app.getPath("userData"), { recursive: true });
      await fs.writeFile(fileDialogSettings(), settings, "utf8");
    } catch (error) {
      // Preferences must never turn a successful file operation into a failure.
      console.warn("Could not remember file settings:", error.message);
    }
  });
  return settingsWrite;
}
async function rememberRecentFile(file) {
  recentFiles = [
    file,
    ...recentFiles.filter((item) => !samePath(item, file)),
  ].slice(0, 4);
  await persistFileSettings();
  return recentFiles;
}
async function readDrawing(file) {
  if ((await fs.stat(file)).size > 20 * 1024 * 1024)
    throw new Error("This SVG is larger than 20 MB.");
  const content = await fs.readFile(file, "utf8");
  authorizedPaths.add(file);
  return { name: path.basename(file), path: file, content };
}
async function fileDialogDirectory() {
  if (lastFileDirectory) {
    try {
      if ((await fs.stat(lastFileDirectory)).isDirectory())
        return lastFileDirectory;
    } catch {}
  }
  return app.getPath("documents");
}
async function rememberFileDirectory(file) {
  lastFileDirectory = path.dirname(file);
  await persistFileSettings();
}
function trusted(event) {
  return (
    event.sender === win?.webContents &&
    event.senderFrame?.url.startsWith("vector95://app/")
  );
}
app.whenReady().then(async () => {
  if (!ownsProfile) return;
  startupStage("electron-ready");
  try {
    const settings = JSON.parse(
      await fs.readFile(fileDialogSettings(), "utf8"),
    );
    if (
      typeof settings.lastFileDirectory === "string" &&
      path.isAbsolute(settings.lastFileDirectory)
    )
      lastFileDirectory = settings.lastFileDirectory;
    if (Array.isArray(settings.recentFiles))
      recentFiles = settings.recentFiles
        .filter(
          (file, index, files) =>
            typeof file === "string" &&
            path.isAbsolute(file) &&
            files.findIndex(
              (item) => typeof item === "string" && samePath(item, file),
            ) === index,
        )
        .slice(0, 4);
  } catch {}
  startupStage("file-settings-read");
  const root = path.resolve(__dirname, "..");
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".wasm": "application/wasm",
    ".ico": "image/x-icon",
  };
  // Workers share the same local scripts and WASM. Read packaged resources
  // once, without passing each file through Chromium's file URL loader.
  const resources = new Map();
  protocol.handle("vector95", async (request) => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(
      url.pathname === "/" ? "/index.html" : url.pathname,
    );
    const file = path.resolve(root, "." + relative);
    if (
      url.hostname !== "app" ||
      !file.startsWith(root + path.sep) ||
      !/^(index\.html|src[\\/])/.test(file.slice(root.length + 1))
    )
      return new Response("Forbidden", { status: 403 });
    try {
      const readStarted = Date.now();
      let content = app.isPackaged && resources.get(file);
      const cached = !!content;
      if (!content) {
        content = fs.readFile(file);
        if (app.isPackaged) resources.set(file, content);
      }
      const body = await content;
      if (!startupFinished)
        startup.resources.push({
          file: relative,
          startMs: readStarted - processCreated,
          readMs: Date.now() - readStarted,
          bytes: body.length,
          cached,
        });
      return new Response(body, {
        headers: {
          "Content-Type":
            contentTypes[path.extname(file)] || "application/octet-stream",
        },
      });
    } catch {
      resources.delete(file);
      return new Response("Not found", { status: 404 });
    }
  });
  session.defaultSession.setPermissionRequestHandler(
    (wc, permission, callback, details) =>
      callback(
        permission === "local-fonts" &&
          wc === win?.webContents &&
          details.isMainFrame === true &&
          details.requestingUrl?.startsWith("vector95://app/"),
      ),
  );
  session.defaultSession.setPermissionCheckHandler(
    (wc, permission, origin) =>
      permission === "local-fonts" &&
      wc === win?.webContents &&
      /^vector95:\/\/app\/?$/.test(origin),
  );
  win = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    show: false,
    backgroundColor: "#c0c0c0",
    title: "Vector 95",
    icon: path.join(root, "src", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  startupStage("window-created");
  win.removeMenu();
  const notifyMaximized = () =>
    win.webContents.send("window:maximized-state", win.isMaximized());
  win.on("maximize", notifyMaximized);
  win.on("unmaximize", notifyMaximized);
  win.webContents.on("did-finish-load", notifyMaximized);
  win.webContents.once("dom-ready", () => startupStage("dom-ready"));
  win.webContents.once("did-finish-load", () => startupStage("page-loaded"));
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.on("close", (event) => {
    if (!closing) {
      event.preventDefault();
      win.webContents.send("window:confirm-close");
    }
  });
  // HTML can paint before the module graph and workspace are initialized.
  // Reveal only after the renderer has installed the controls and drawing.
  ipcMain.on("editor:ready", (event, timing) => {
    if (trusted(event) && !win.isVisible()) {
      if (!startupFinished) {
        startupStage("editor-initialized");
        if (timing && typeof timing === "object") {
          startup.renderer = Object.fromEntries(
            ["timeOrigin", "modulesReadyMs", "editorReadyMs", "documentCount"]
              .filter((key) => Number.isFinite(timing[key]))
              .map((key) => [key, timing[key]]),
          );
          if (Array.isArray(timing.checkpoints))
            startup.renderer.checkpoints = timing.checkpoints
              .slice(0, 32)
              .filter(
                (entry) =>
                  typeof entry?.name === "string" &&
                  Number.isFinite(entry.elapsedMs),
              )
              .map(({ name, elapsedMs }) => ({
                name: name.slice(0, 64),
                elapsedMs,
              }));
        }
      }
      win.show();
      notifyMaximized();
      if (!startupFinished) {
        startupStage("window-shown");
        startupFinished = true;
        void saveStartupTiming();
      }
    }
  });
  win.webContents.on("did-fail-load", (_event, code, description) => {
    if (code === -3) return; // An intentionally cancelled navigation.
    dialog.showErrorBox("Vector 95 could not start", description);
    closing = true;
    win.close();
  });
  startupStage("page-load-requested");
  win.loadURL("vector95://app/index.html");
  ipcMain.handle("file:recent", (event) => {
    if (!trusted(event)) throw new Error("Unauthorized sender");
    return recentFiles;
  });
  ipcMain.handle("file:remember", async (event, file) => {
    if (!trusted(event) || !authorizedPaths.has(file))
      throw new Error("Unauthorized file");
    // Called only after the renderer has successfully imported the SVG.
    return rememberRecentFile(file);
  });
  ipcMain.handle("file:open-recent", async (event, file) => {
    if (!trusted(event) || !recentFiles.includes(file))
      throw new Error("Unauthorized file");
    try {
      const entry = await readDrawing(file);
      await rememberFileDirectory(file);
      return entry;
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        recentFiles = recentFiles.filter((item) => item !== file);
        await persistFileSettings();
        throw new Error(
          `Cannot find ${path.basename(file)}. It may have been moved or deleted.`,
        );
      }
      throw error;
    }
  });
  ipcMain.handle("file:open-dropped", async (event, file) => {
    if (
      !trusted(event) ||
      typeof file !== "string" ||
      !path.isAbsolute(file) ||
      !/\.svg$/i.test(file)
    )
      throw new Error("Invalid drawing file");
    const entry = await readDrawing(file);
    await rememberFileDirectory(file);
    return entry;
  });
  ipcMain.handle("file:open", async (event) => {
    if (!trusted(event)) throw new Error("Unauthorized sender");
    const result = await dialog.showOpenDialog(win, {
      title: "Open SVG Drawings",
      defaultPath: await fileDialogDirectory(),
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "SVG drawings", extensions: ["svg"] }],
    });
    if (result.canceled) return null;
    const files = [];
    let lastOpenedFile;
    for (const file of result.filePaths) {
      const entry = { name: path.basename(file), path: file };
      try {
        Object.assign(entry, await readDrawing(file));
        lastOpenedFile = file;
      } catch (error) {
        entry.error = error.message;
      }
      files.push(entry);
    }
    if (lastOpenedFile) await rememberFileDirectory(lastOpenedFile);
    return files;
  });
  ipcMain.handle("file:save", async (event, data) => {
    if (
      !trusted(event) ||
      typeof data?.content !== "string" ||
      data.content.length > 30 * 1024 * 1024
    )
      throw new Error("Invalid drawing");
    let file = authorizedPaths.has(data.path) ? data.path : null;
    if (!file || data.saveAs || data.exportCopy) {
      const result = await dialog.showSaveDialog(win, {
        title: data.exportCopy ? "Export SVG" : "Save SVG Drawing",
        defaultPath: path.join(
          await fileDialogDirectory(),
          path.basename(data.name || "Untitled.svg"),
        ),
        filters: [{ name: "SVG drawings", extensions: ["svg"] }],
      });
      if (result.canceled) return null;
      file = result.filePath;
    }
    await fs.writeFile(file, data.content, "utf8");
    authorizedPaths.add(file);
    await rememberFileDirectory(file);
    if (!data.exportCopy) await rememberRecentFile(file);
    return { path: file, name: path.basename(file) };
  });
  ipcMain.on("window:minimize", (event) => {
    if (trusted(event)) win.minimize();
  });
  ipcMain.on("window:maximize", (event) => {
    if (trusted(event)) win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.on("window:close", (event) => {
    if (trusted(event)) win.close();
  });
  ipcMain.on("window:confirmed-close", (event) => {
    if (trusted(event)) {
      closing = true;
      win.close();
    }
  });
});
app.on("window-all-closed", () => app.quit());
