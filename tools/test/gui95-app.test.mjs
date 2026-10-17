import { test, after } from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as h from "../gui95-app.mjs";

const example = { id: "example-app", name: "Example App", version: "package.json", icon: "icon.png",
  fileTypes: [{ ext: "exa", name: "Example document", mime: "application/x-example", progId: "ExampleApp.Document", windowsIcon: "resources/doc.ico" }],
  builds: { windows: { dir: "release/win-unpacked", exe: "Example App.exe" }, macos: { dir: "release/mac-arm64", bundle: "Example App.app" }, linux: { dir: "release/linux-unpacked", exe: "example-app" } } };

function fixture(name) {
  return path.join(import.meta.dirname, "fixtures", name);
}

// Writes a manifest holding one copy of `example`, changed by `edit`, into a throwaway folder.
const scratch = [];
function manifestRoot(edit) {
  const app = structuredClone(example);
  edit(app);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gui95-app-test-"));
  scratch.push(root);
  fs.writeFileSync(path.join(root, h.MANIFEST), JSON.stringify({ apps: [app] }));
  return root;
}
after(() => { for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });

test("constants", () => {
  assert.equal(h.MANIFEST, "gui95-app.json");
  assert.equal(h.DIST_DIR, "gui95-dist");
  assert.equal(h.MARKER, "gui95-installed.json");
});
test("systemName maps Node platforms", () => {
  assert.equal(h.systemName("win32"), "windows");
  assert.equal(h.systemName("darwin"), "macos");
  assert.equal(h.systemName("linux"), "linux");
  assert.throws(() => h.systemName("aix"), /aix/);
});
test("archiveName", () => {
  assert.equal(h.archiveName({ name: "Example App", version: "1.2.0", system: "windows", arch: "x64" }), "Example-App-1.2.0-windows-x64.zip");
  assert.equal(h.archiveName({ name: "Example App", version: "1.2.0", system: "macos", arch: "arm64" }), "Example-App-1.2.0-macos-arm64.zip");
  assert.equal(h.archiveName({ name: "Example App", version: "1.2.0", system: "linux", arch: "x64" }), "Example-App-1.2.0-linux-x64.tar.gz");
});
test("builtAppPath", () => {
  assert.equal(h.builtAppPath("/repo", example, "windows"), path.join("/repo", "release/win-unpacked"));
  assert.equal(h.builtAppPath("/repo", example, "macos"), path.join("/repo", "release/mac-arm64", "Example App.app"));
  assert.equal(h.builtAppPath("/repo", example, "linux"), path.join("/repo", "release/linux-unpacked"));
  const windowsOnly = { ...example, builds: { windows: example.builds.windows } };
  assert.throws(() => h.builtAppPath("/repo", windowsOnly, "linux"), /Example App.*linux/);
});
test("installPaths per system", () => {
  assert.deepEqual(h.installPaths(example, "windows", { env: { LOCALAPPDATA: "C:\\L", APPDATA: "C:\\R" } }), {
    appDir: "C:\\L\\Programs\\GUI95\\Example App", resourcesDir: "C:\\L\\Programs\\GUI95\\Example App\\resources",
    launcher: "C:\\R\\Microsoft\\Windows\\Start Menu\\Programs\\GUI95\\Example App.lnk" });
  assert.deepEqual(h.installPaths(example, "macos", { env: {}, home: "/Users/s" }), {
    appDir: "/Users/s/Applications/GUI95/Example App.app", resourcesDir: "/Users/s/Applications/GUI95/Example App.app/Contents/Resources", launcher: null });
  assert.deepEqual(h.installPaths(example, "linux", { env: {}, home: "/home/s" }), {
    appDir: "/home/s/.local/share/gui95/example-app", resourcesDir: "/home/s/.local/share/gui95/example-app/resources",
    launcher: "/home/s/.local/share/applications/gui95-example-app.desktop" });
  assert.equal(h.installPaths(example, "linux", { env: { XDG_DATA_HOME: "/x" }, home: "/home/s" }).launcher, "/x/applications/gui95-example-app.desktop");
});
test("installPaths on Windows falls back to the profile folders", () => {
  const paths = h.installPaths(example, "windows", { env: {}, home: "C:\\Users\\s" });
  assert.equal(paths.appDir, "C:\\Users\\s\\AppData\\Local\\Programs\\GUI95\\Example App");
  assert.equal(paths.launcher, "C:\\Users\\s\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\GUI95\\Example App.lnk");
});
test("desktopEntry quotes the executable and lists MIME types", () => {
  assert.equal(h.desktopEntry(example, "/home/s/.local/share/gui95/example-app"), [
    "[Desktop Entry]", "Type=Application", "Name=Example App",
    'Exec="/home/s/.local/share/gui95/example-app/example-app" %F',
    "Icon=/home/s/.local/share/gui95/example-app/gui95-icon.png",
    "Terminal=false", "Categories=Utility;", "MimeType=application/x-example;", ""].join("\n"));
});
test("desktopEntry for an app without file types has no MimeType and takes no files", () => {
  const entry = h.desktopEntry({ ...example, fileTypes: undefined }, "/opt/example-app");
  assert.match(entry, /^Exec="\/opt\/example-app\/example-app"$/m);
  assert.doesNotMatch(entry, /MimeType/);
});
test("desktopEntry escapes characters the Exec key treats specially", () => {
  const entry = h.desktopEntry(example, "/home/my apps/50%/$x");
  assert.match(entry, /^Exec="\/home\/my apps\/50%%\/\\\\\$x\/example-app" %F$/m);
});
test("mimeXml declares each file type", () => {
  const xml = h.mimeXml(example);
  assert.match(xml, /<mime-type type="application\/x-example">/);
  assert.match(xml, /<comment>Example document<\/comment>/);
  assert.match(xml, /<glob pattern="\*\.exa"\/>/);
});
test("mimeXml escapes markup in names", () => {
  const xml = h.mimeXml({ ...example, fileTypes: [{ ...example.fileTypes[0], name: "Notes & <sketches>" }] });
  assert.match(xml, /<comment>Notes &amp; &lt;sketches&gt;<\/comment>/);
});
test("windowsFileTypeEntries point at the installed executable", () => {
  assert.deepEqual(h.windowsFileTypeEntries(example, "C:\\L\\Programs\\GUI95\\Example App"), [
    { key: "Software\\Classes\\ExampleApp.Document", name: "", value: "Example document" },
    { key: "Software\\Classes\\ExampleApp.Document", name: "FriendlyTypeName", value: "Example document" },
    { key: "Software\\Classes\\ExampleApp.Document\\DefaultIcon", name: "", value: '"C:\\L\\Programs\\GUI95\\Example App\\resources\\doc.ico",0' },
    { key: "Software\\Classes\\ExampleApp.Document\\shell\\open\\command", name: "", value: '"C:\\L\\Programs\\GUI95\\Example App\\Example App.exe" "%1"' },
    { key: "Software\\Classes\\.exa", name: "", value: "ExampleApp.Document" }]);
});
test("readManifest accepts the fixture and reads the version", async () => {
  const root = fixture("valid");               // tools/test/fixtures/valid: gui95-app.json (the example above) + package.json {"version":"1.2.0"}
  const { apps } = await h.readManifest(root);
  assert.equal(apps[0].id, "example-app");
  assert.equal(await h.readVersion(root, apps[0]), "1.2.0");
});
test("readManifest rejects bad manifests", async () => {
  await assert.rejects(h.readManifest(fixture("no-apps")), /^Error: gui95-app.json: apps/);
  await assert.rejects(h.readManifest(fixture("bad-id")), /gui95-app.json: .*id/);
  await assert.rejects(h.readManifest(fixture("linux-no-icon")), /gui95-app.json: .*icon/);
});
test("readManifest rejects a missing or unparsable file", async () => {
  await assert.rejects(h.readManifest(path.join(fixture("valid"), "nowhere")), /^Error: gui95-app.json: /);
  const root = manifestRoot(() => {});
  fs.writeFileSync(path.join(root, h.MANIFEST), "{ not json");
  await assert.rejects(h.readManifest(root), /^Error: gui95-app.json: /);
});
test("readVersion rejects a version file without a version", async () => {
  const root = manifestRoot(() => {});
  fs.writeFileSync(path.join(root, "package.json"), "{}");
  await assert.rejects(h.readVersion(root, example), /^Error: gui95-app.json: .*package\.json/);
});

// Each case changes the example so that exactly one rule is broken; the message must name the field.
const broken = [
  ["name is empty", (a) => { a.name = ""; }, /name/],
  ["name has a forbidden character", (a) => { a.name = "Example: App"; }, /name/],
  ["version is missing", (a) => { delete a.version; }, /version/],
  ["builds is empty", (a) => { a.builds = {}; }, /builds/],
  ["builds has an unknown system", (a) => { a.builds.freebsd = { dir: "x", exe: "y" }; }, /builds.*freebsd/],
  ["windows build has no exe", (a) => { delete a.builds.windows.exe; }, /builds\.windows.*exe/],
  ["linux build has no dir", (a) => { delete a.builds.linux.dir; }, /builds\.linux.*dir/],
  ["macos build has no bundle", (a) => { delete a.builds.macos.bundle; }, /builds\.macos.*bundle/],
  ["macos bundle is not an .app", (a) => { a.builds.macos.bundle = "Example App"; }, /builds\.macos.*bundle/],
  ["file type has no ext", (a) => { delete a.fileTypes[0].ext; }, /fileTypes.*ext/],
  ["file type ext starts with a dot", (a) => { a.fileTypes[0].ext = ".exa"; }, /fileTypes.*ext/],
  ["file type has no name", (a) => { delete a.fileTypes[0].name; }, /fileTypes.*name/],
  ["file type has no progId for Windows", (a) => { delete a.fileTypes[0].progId; }, /fileTypes.*progId/],
  ["file type has no windowsIcon for Windows", (a) => { delete a.fileTypes[0].windowsIcon; }, /fileTypes.*windowsIcon/],
  ["file type has no mime for Linux", (a) => { delete a.fileTypes[0].mime; }, /fileTypes.*mime/],
];
for (const [title, edit, message] of broken) {
  test(`readManifest rejects: ${title}`, async () => {
    await assert.rejects(h.readManifest(manifestRoot(edit)), (err) => {
      assert.match(err.message, /^gui95-app\.json: /);
      assert.match(err.message, message);
      return true;
    });
  });
}
test("readManifest only asks for what the builds need", async () => {
  const { apps } = await h.readManifest(manifestRoot((a) => {
    delete a.icon; delete a.builds.windows; delete a.builds.linux;
    delete a.fileTypes[0].mime; delete a.fileTypes[0].progId; delete a.fileTypes[0].windowsIcon;
  }));
  assert.deepEqual(Object.keys(apps[0].builds), ["macos"]);
});

// ---- pack and main -----------------------------------------------------------

// A throwaway copy of fixtures/valid; addFakeBuild puts the example's build for `system` into it.
function fakeRepoWithoutBuild() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gui95-app-test-"));
  scratch.push(root);
  fs.cpSync(fixture("valid"), root, { recursive: true });
  return root;
}
function addFakeBuild(root, system) {
  const build = example.builds[system];
  const files = system === "macos"
    ? [path.join(build.bundle, "Contents", "Info.plist")]
    : [build.exe, path.join("resources", "x.txt")];
  for (const file of files) {
    const target = path.join(root, build.dir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "x");
  }
}
function fakeBuiltRepo() {
  const root = fakeRepoWithoutBuild();
  addFakeBuild(root, h.systemName());
  return root;
}
// The same for a system other than the host's, so that the commands pack would run there can be
// checked with a fake spawn.
function fakeBuiltRepoFor(system) {
  const root = fakeRepoWithoutBuild();
  addFakeBuild(root, system);
  return root;
}

// The archive's entry names, listed by the system's own tar (on Windows the one in System32).
function listArchive(file) {
  const tar = process.platform === "win32" ? path.join(process.env.SystemRoot, "System32", "tar.exe") : "tar";
  return childProcess.execFileSync(tar, ["-tf", file], { encoding: "utf8" })
    .split(/\r?\n/).filter(Boolean).map((entry) => entry.replaceAll("\\", "/"));
}

const packOptions = { system: h.systemName(), arch: "x64", sign: false, log() {} };
const hostBuilt = async (repo) => h.builtAppPath(repo, (await h.readManifest(repo)).apps[0], h.systemName());

test("pack archives the host build under one top-level entry and keeps the build", async () => {
  const repo = fakeBuiltRepo();
  const system = h.systemName();
  const [result] = await h.pack(repo, packOptions);
  assert.equal(result.app, "Example App");
  assert.equal(path.dirname(result.archive), path.join(repo, h.DIST_DIR));
  assert.equal(path.basename(result.archive), h.archiveName({ name: "Example App", version: "1.2.0", system, arch: "x64" }));
  const top = system === "macos" ? "Example App.app/" : "Example App/";
  const entries = listArchive(result.archive);
  assert.ok(entries.length > 0 && entries.every((entry) => entry.startsWith(top)), entries.join(", "));
  assert.ok(fs.existsSync(await hostBuilt(repo)));
  assert.equal(fs.existsSync(path.join(repo, h.DIST_DIR, ".stage")), false);
});
test("pack replaces an archive left by an earlier run", async () => {
  const repo = fakeBuiltRepo();
  const [first] = await h.pack(repo, packOptions);
  fs.writeFileSync(first.archive, "left over, and not an archive");
  const [second] = await h.pack(repo, packOptions);
  assert.equal(first.archive, second.archive);
  assert.ok(listArchive(second.archive).length > 0);
});
test("pack logs one line per app", async () => {
  const lines = [];
  const [result] = await h.pack(fakeBuiltRepo(), { ...packOptions, log: (line) => lines.push(line) });
  assert.deepEqual(lines, [`Example App: ${path.join(h.DIST_DIR, path.basename(result.archive))}`]);
});
test("pack reports a missing build", async () => {
  const repo = fakeRepoWithoutBuild();
  await assert.rejects(h.pack(repo, packOptions), /Example App: no build at .*run the build first/);
  assert.equal(fs.existsSync(path.join(repo, h.DIST_DIR)), false);
});
test("pack skips an app without a build for the system, without reading its version", async () => {
  const repo = manifestRoot((a) => { delete a.builds.linux; });   // no package.json here
  const lines = [];
  const results = await h.pack(repo, { ...packOptions, system: "linux", log: (line) => lines.push(line) });
  assert.deepEqual(results, [{ app: "Example App", skipped: "no linux build" }]);
  assert.deepEqual(lines, ["Example App: skipped, no linux build"]);
});
test("pack puts the build back and leaves no archive when archiving fails", async (t) => {
  const repo = fakeBuiltRepo();
  t.mock.method(childProcess, "spawn", () => { throw new Error("archiver is gone"); });
  await assert.rejects(h.pack(repo, packOptions), /archiver is gone/);
  assert.ok(fs.existsSync(await hostBuilt(repo)));
  assert.deepEqual(fs.readdirSync(path.join(repo, h.DIST_DIR)), []);
});
test("pack reports the archiver's complaint and removes the half-written archive", async (t) => {
  const repo = fakeBuiltRepoFor("linux");
  t.mock.method(childProcess, "spawn", (command, args) => {
    fs.writeFileSync(args[1], "half an archive");     // tar -czf <archive> ...
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => { child.stderr.emit("data", "no space left on device\n"); child.emit("close", 1); });
    return child;
  });
  await assert.rejects(h.pack(repo, { ...packOptions, system: "linux" }), /^Error: tar exited with code 1: no space left on device$/);
  assert.deepEqual(fs.readdirSync(path.join(repo, h.DIST_DIR)), []);
  assert.ok(fs.existsSync(path.join(repo, "release", "linux-unpacked", "example-app")));
});
test("pack leaves the build alone when it cannot stage it",{ skip: h.systemName() === "macos" }, async () => {
  const repo = fakeBuiltRepo();
  const staged = path.join(repo, h.DIST_DIR, ".stage", "Example App");
  fs.mkdirSync(staged, { recursive: true });
  fs.writeFileSync(path.join(staged, "earlier.txt"), "x");
  await assert.rejects(h.pack(repo, packOptions), /Example App: cannot move the build/);
  assert.ok(fs.existsSync(await hostBuilt(repo)));
  assert.ok(fs.existsSync(path.join(staged, "earlier.txt")));
});

// The macOS and Linux branches cannot run on every host, so these check the commands they would run.
function recordSpawns(t, calls, onSpawn = () => {}) {
  t.mock.method(childProcess, "spawn", (command, args) => {
    calls.push([command, ...args]);
    onSpawn();
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => child.emit("close", 0));
    return child;
  });
}
test("pack runs tar.exe from System32 on Windows", async (t) => {
  const repo = fakeBuiltRepoFor("windows");
  const calls = [];
  recordSpawns(t, calls);
  await h.pack(repo, { ...packOptions, system: "windows" });
  assert.equal(calls.length, 1);
  const [tar, ...args] = calls[0];
  assert.equal(path.win32.basename(tar), "tar.exe");
  assert.equal(path.win32.basename(path.win32.dirname(tar)), "System32");
  assert.deepEqual(args, ["-a", "-c", "-f", path.join(repo, h.DIST_DIR, "Example-App-1.2.0-windows-x64.zip"),
    "-C", path.join(repo, h.DIST_DIR, ".stage"), "Example App"]);
});
test("pack finds tar.exe under C:\\Windows when the environment does not say where Windows is", async (t) => {
  const repo = fakeBuiltRepoFor("windows");
  const calls = [];
  recordSpawns(t, calls);
  const saved = { SystemRoot: process.env.SystemRoot, windir: process.env.windir };
  delete process.env.SystemRoot;
  delete process.env.windir;
  try {
    await h.pack(repo, { ...packOptions, system: "windows" });
  } finally {
    for (const [name, value] of Object.entries(saved)) if (value !== undefined) process.env[name] = value;
  }
  assert.equal(calls[0][0], "C:\\Windows\\System32\\tar.exe");
});
test("pack runs tar -czf on Linux", async (t) => {
  const repo = fakeBuiltRepoFor("linux");
  const calls = [];
  recordSpawns(t, calls);
  await h.pack(repo, { ...packOptions, system: "linux" });
  assert.deepEqual(calls, [["tar", "-czf", path.join(repo, h.DIST_DIR, "Example-App-1.2.0-linux-x64.tar.gz"),
    "-C", path.join(repo, h.DIST_DIR, ".stage"), "Example App"]]);
});
test("pack removes the old archive before it starts a new one", async (t) => {
  const repo = fakeBuiltRepoFor("linux");
  const archive = path.join(repo, h.DIST_DIR, "Example-App-1.2.0-linux-x64.tar.gz");
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  fs.writeFileSync(archive, "left by an earlier run");
  const oldArchiveSeen = [];
  recordSpawns(t, [], () => { oldArchiveSeen.push(fs.existsSync(archive)); });
  await h.pack(repo, { ...packOptions, system: "linux" });
  assert.deepEqual(oldArchiveSeen, [false]);
});
test("pack signs the macOS bundle ad hoc, then archives it with ditto", async (t) => {
  const repo = fakeBuiltRepoFor("macos");
  const bundle = path.join(repo, "release", "mac-arm64", "Example App.app");
  const archive = path.join(repo, h.DIST_DIR, "Example-App-1.2.0-macos-arm64.zip");
  const calls = [];
  recordSpawns(t, calls);
  await h.pack(repo, { ...packOptions, system: "macos", arch: "arm64", sign: true });
  assert.deepEqual(calls, [
    ["codesign", "--force", "--deep", "--sign", "-", bundle],
    ["ditto", "-c", "-k", "--keepParent", bundle, archive]]);
  calls.length = 0;
  await h.pack(repo, { ...packOptions, system: "macos", arch: "arm64", sign: false });
  assert.deepEqual(calls, [["ditto", "-c", "-k", "--keepParent", bundle, archive]]);
});

// ---- install -----------------------------------------------------------------

// A fake build for `system` plus throwaway locations for everything an install writes to. Every
// folder the helper, or a tool it starts, would use points into one temporary folder, so these
// tests cannot reach the real profile, Start menu, registry or application folders.
async function fakeInstallSetup({ system = h.systemName(), withoutFileTypes = false } = {}) {
  const repo = fakeBuiltRepoFor(system);
  fs.writeFileSync(path.join(repo, "icon.png"), "not really a png");
  if (withoutFileTypes) {
    const manifest = JSON.parse(fs.readFileSync(path.join(repo, h.MANIFEST), "utf8"));
    delete manifest.apps[0].fileTypes;
    fs.writeFileSync(path.join(repo, h.MANIFEST), JSON.stringify(manifest));
  }
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "gui95-app-test-"));
  scratch.push(sandbox);     // removed after all tests, when no test's helper process is left holding a folder in it
  const home = path.join(sandbox, "home");
  const env = {
    ...process.env, HOME: home, USERPROFILE: home,
    LOCALAPPDATA: path.join(sandbox, "local"), APPDATA: path.join(sandbox, "roaming"),
    XDG_DATA_HOME: path.join(sandbox, "data"), XDG_CONFIG_HOME: path.join(sandbox, "config"),
  };
  return { repo, env, home };
}

// A file the fake build contains, relative to the installed app folder.
const builtFile = (system) => (system === "macos" ? path.join("Contents", "Info.plist") : path.join("resources", "x.txt"));

// Replaces childProcess.spawn with a fake that records every call as [command, ...args] (and the
// environment it was given). `behave(command, args)` may answer with { stdout, stderr, code, error,
// run } for a call; with nothing, the tool succeeds quietly. `run` happens when the tool starts.
function fakeTools(t, behave = () => ({})) {
  const calls = [];
  const envs = [];
  t.mock.method(childProcess, "spawn", (command, args, options) => {
    calls.push([command, ...args]);
    envs.push(options?.env);
    const { stdout = "", stderr = "", code = 0, error, run } = behave(command, args) ?? {};
    run?.();
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      if (error) {
        child.emit("error", error);
        return;
      }
      if (stdout) child.stdout.emit("data", stdout);
      if (stderr) child.stderr.emit("data", stderr);
      child.emit("close", code);
    });
    return child;
  });
  return { calls, envs };
}
// ditto is what copies a macOS build, so a fake one has to copy as well.
const fakeDitto = (command, args) => (command === "ditto" ? { run: () => fs.cpSync(args[0], args[1], { recursive: true }) } : {});

const LSREGISTER = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
const PS_ARGS = ["-A", "-o", "args="];

// Starts a process that keeps the installed app busy the way a running app does, and resolves once
// it is up. On Windows its working folder is the app folder, which makes the folder impossible to
// rename; elsewhere its command line names a script inside the app folder.
async function holdOpen(appDir) {
  let child;
  if (process.platform === "win32") {
    child = childProcess.spawn(process.execPath, ["-e", "console.log('ready'); setTimeout(() => {}, 30000)"],
      { cwd: appDir, stdio: ["ignore", "pipe", "ignore"] });
  } else {
    const script = path.join(appDir, "hold.sh");
    fs.writeFileSync(script, "echo ready\nsleep 30\n");
    child = childProcess.spawn("sh", [script], { stdio: ["ignore", "pipe", "ignore"] });
  }
  await once(child.stdout, "data");
  return child;
}
const stopHolder = async (holder) => {
  holder.stdout.destroy();
  if (holder.exitCode === null && holder.signalCode === null) {
    holder.kill();
    await once(holder, "exit");
  }
};

test("install copies the build, writes the marker and replaces an older copy", async (t) => {
  const { repo, env, home } = await fakeInstallSetup();
  const system = h.systemName();
  const app = (await h.readManifest(repo)).apps[0];
  const { appDir, resourcesDir } = h.installPaths(app, system, { env, home });
  fs.mkdirSync(appDir, { recursive: true }); fs.writeFileSync(path.join(appDir, "stale.txt"), "old");
  fs.mkdirSync(appDir + ".gui95-new", { recursive: true });      // left by an interrupted run
  fs.mkdirSync(appDir + ".gui95-old", { recursive: true });      // so is this
  const lines = [];
  const results = await h.install(repo, { system, env, home, integrate: false, sign: false, log: (line) => lines.push(line) });
  assert.deepEqual(results, [{ app: "Example App", appDir }]);
  assert.deepEqual(lines, [`Example App: installed in ${appDir}`]);
  assert.equal(fs.existsSync(path.join(appDir, "stale.txt")), false);
  assert.equal(fs.existsSync(appDir + ".gui95-new"), false);
  assert.equal(fs.existsSync(appDir + ".gui95-old"), false);
  assert.ok(fs.existsSync(path.join(appDir, builtFile(system))));
  assert.ok(fs.existsSync(await hostBuilt(repo)));
  const marker = JSON.parse(fs.readFileSync(path.join(resourcesDir, "gui95-installed.json"), "utf8"));
  assert.deepEqual(Object.keys(marker), ["id", "name", "version", "installedAt"]);
  assert.equal(marker.id, "example-app"); assert.equal(marker.name, "Example App"); assert.equal(marker.version, "1.2.0");
  assert.equal(new Date(marker.installedAt).toISOString(), marker.installedAt);
});
test("install refuses while the installed app is running and keeps the old copy", async (t) => {
  const { repo, env, home } = await fakeInstallSetup();
  const system = h.systemName();
  const options = { system, env, home, integrate: false, sign: false, log() {} };
  await h.install(repo, options);
  const { appDir } = h.installPaths((await h.readManifest(repo)).apps[0], system, { env, home });
  fs.writeFileSync(path.join(appDir, "keep.txt"), "old copy");
  const holder = await holdOpen(appDir);
  t.after(() => stopHolder(holder));
  await assert.rejects(h.install(repo, options), /^Error: Close Example App and run make install again\.$/);
  assert.ok(fs.existsSync(path.join(appDir, "keep.txt")));
  assert.equal(fs.existsSync(appDir + ".gui95-new"), false);
  assert.equal(fs.existsSync(appDir + ".gui95-old"), false);
});
test("install integrates on Windows with a Start menu shortcut", { skip: process.platform !== "win32" }, async (t) => {
  const { repo, env, home } = await fakeInstallSetup({ withoutFileTypes: true });   // no registry writes from tests
  await h.install(repo, { system: "windows", env, home, log() {} });
  const shortcut = path.join(env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "GUI95", "Example App.lnk");
  assert.ok(fs.existsSync(shortcut));
  // Read the shortcut back: it must start the installed executable, in the app folder, with the executable's icon.
  const { appDir } = h.installPaths((await h.readManifest(repo)).apps[0], "windows", { env, home });
  const exe = path.join(appDir, "Example App.exe");
  const read = childProcess.execFileSync(powershellPath(), ["-NoProfile", "-NonInteractive", "-Command",
    "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:GUI95_TEST_LINK); $s.TargetPath; $s.WorkingDirectory; $s.IconLocation"],
  { encoding: "utf8", env: { ...process.env, GUI95_TEST_LINK: shortcut } });
  assert.deepEqual(read.split(/\r?\n/).filter(Boolean), [exe, appDir, `${exe},0`]);
});
test("install integrates on Linux with a desktop entry", { skip: process.platform !== "linux" }, async (t) => {
  const { repo, env, home } = await fakeInstallSetup();     // env.XDG_DATA_HOME = temp dir
  await h.install(repo, { system: "linux", env, home, log() {} });
  assert.match(fs.readFileSync(path.join(env.XDG_DATA_HOME, "applications", "gui95-example-app.desktop"), "utf8"), /^Name=Example App$/m);
  assert.ok(fs.existsSync(path.join(env.XDG_DATA_HOME, "mime", "packages", "gui95-example-app.xml")));
});

test("install skips an app without a build for the system, without reading its version", async (t) => {
  const { env, home } = await fakeInstallSetup();
  const repo = manifestRoot((a) => { delete a.builds.linux; });   // no package.json and no build here
  const lines = [];
  const results = await h.install(repo, { system: "linux", env, home, sign: false, log: (line) => lines.push(line) });
  assert.deepEqual(results, [{ app: "Example App", skipped: "no linux build" }]);
  assert.deepEqual(lines, ["Example App: skipped, no linux build"]);
  assert.equal(fs.existsSync(env.XDG_DATA_HOME), false);
});
test("install reports a missing build and installs nothing", async (t) => {
  const { env, home } = await fakeInstallSetup();
  const spawned = fakeTools(t);
  await assert.rejects(h.install(fakeRepoWithoutBuild(), { system: "linux", env, home, log() {} }), /Example App: no build at .*run the build first/);
  assert.equal(fs.existsSync(env.XDG_DATA_HOME), false);
  assert.deepEqual(spawned.calls, []);
});
test("install on Linux needs the icon the desktop entry shows, and checks before it installs", async (t) => {
  const { repo, env, home } = await fakeInstallSetup({ system: "linux" });
  fs.rmSync(path.join(repo, "icon.png"));
  const spawned = fakeTools(t);
  await assert.rejects(h.install(repo, { system: "linux", env, home, log() {} }), /Example App: .*icon.*icon\.png/);
  assert.equal(fs.existsSync(env.XDG_DATA_HOME), false);
  assert.deepEqual(spawned.calls, []);
  await h.install(repo, { system: "linux", env, home, integrate: false, log() {} });   // without integration there is no icon to copy
});

test("install on Linux writes the launcher and registers the file types", async (t) => {
  const { repo, env, home } = await fakeInstallSetup({ system: "linux" });
  const app = (await h.readManifest(repo)).apps[0];
  const { appDir, launcher } = h.installPaths(app, "linux", { env, home });
  const spawned = fakeTools(t);
  await h.install(repo, { system: "linux", env, home, log() {} });
  assert.equal(fs.readFileSync(launcher, "utf8"), h.desktopEntry(app, appDir));
  assert.equal(path.posix.join(env.XDG_DATA_HOME, "applications", "gui95-example-app.desktop"), launcher);
  assert.equal(fs.readFileSync(path.join(env.XDG_DATA_HOME, "mime", "packages", "gui95-example-app.xml"), "utf8"), h.mimeXml(app));
  assert.equal(fs.readFileSync(path.join(appDir, "gui95-icon.png"), "utf8"), "not really a png");
  assert.deepEqual(spawned.calls, [
    ["update-mime-database", path.posix.join(env.XDG_DATA_HOME, "mime")],
    ["update-desktop-database", path.posix.join(env.XDG_DATA_HOME, "applications")],
    ["xdg-mime", "default", "gui95-example-app.desktop", "application/x-example"]]);
  for (const childEnv of spawned.envs) {     // the tools write their settings where the caller said
    assert.equal(childEnv.XDG_CONFIG_HOME, env.XDG_CONFIG_HOME);
    assert.equal(childEnv.XDG_DATA_HOME, env.XDG_DATA_HOME);
  }
});
test("install on Linux falls back to ~/.local/share without XDG_DATA_HOME", async (t) => {
  const { repo, env, home } = await fakeInstallSetup({ system: "linux" });
  delete env.XDG_DATA_HOME;
  const spawned = fakeTools(t);
  await h.install(repo, { system: "linux", env, home, log() {} });
  const dataHome = path.posix.join(home, ".local", "share");
  assert.ok(fs.existsSync(path.join(dataHome, "mime", "packages", "gui95-example-app.xml")));
  assert.deepEqual(spawned.calls[0], ["update-mime-database", path.posix.join(dataHome, "mime")]);
});
test("install on Linux leaves out the MIME steps for an app without file types", async (t) => {
  const { repo, env, home } = await fakeInstallSetup({ system: "linux", withoutFileTypes: true });
  const spawned = fakeTools(t);
  await h.install(repo, { system: "linux", env, home, log() {} });
  assert.deepEqual(spawned.calls, [["update-desktop-database", path.posix.join(env.XDG_DATA_HOME, "applications")]]);
  assert.equal(fs.existsSync(path.join(env.XDG_DATA_HOME, "mime")), false);
  assert.doesNotMatch(fs.readFileSync(path.posix.join(env.XDG_DATA_HOME, "applications", "gui95-example-app.desktop"), "utf8"), /MimeType/);
});
test("install on Linux skips a missing tool with a warning and installs anyway", async (t) => {
  const { repo, env, home } = await fakeInstallSetup({ system: "linux" });
  const gone = Object.assign(new Error("spawn xdg-mime ENOENT"), { code: "ENOENT" });
  const spawned = fakeTools(t, (command) => (command === "xdg-mime" ? { error: gone } : {}));
  const lines = [];
  const results = await h.install(repo, { system: "linux", env, home, log: (line) => lines.push(line) });
  assert.equal(results.length, 1);
  assert.equal(spawned.calls.length, 3);
  const warnings = lines.filter((line) => line.startsWith("warning:"));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /xdg-mime.*not installed/);
});
test("install on Linux warns, and carries on, when a tool fails", async (t) => {
  const { repo, env, home } = await fakeInstallSetup({ system: "linux" });
  fakeTools(t, (command) => (command === "update-mime-database" ? { code: 1, stderr: "bad XML\n" } : {}));
  const lines = [];
  await h.install(repo, { system: "linux", env, home, log: (line) => lines.push(line) });
  assert.ok(lines.some((line) => /^warning: .*update-mime-database exited with code 1: bad XML/.test(line)), lines.join("\n"));
});
test("install without integration runs no tool and writes no launcher", async (t) => {
  const { repo, env, home } = await fakeInstallSetup({ system: "linux" });
  const spawned = fakeTools(t);
  await h.install(repo, { system: "linux", env, home, integrate: false, log() {} });
  assert.deepEqual(spawned.calls, []);
  assert.equal(fs.existsSync(path.join(env.XDG_DATA_HOME, "applications")), false);
});

test("install on macOS copies with ditto, signs the copy, then registers it", async (t) => {
  const { repo, env, home } = await fakeInstallSetup({ system: "macos" });
  const app = (await h.readManifest(repo)).apps[0];
  const { appDir, resourcesDir } = h.installPaths(app, "macos", { env, home });
  const built = h.builtAppPath(repo, app, "macos");
  const staging = appDir + ".gui95-new";
  let markerWhenSigned;
  const spawned = fakeTools(t, (command, args) => {
    if (command === "codesign") return { run: () => { markerWhenSigned = fs.existsSync(path.join(staging, "Contents", "Resources", "gui95-installed.json")); } };
    return fakeDitto(command, args);
  });
  await h.install(repo, { system: "macos", env, home, sign: true, log() {} });
  assert.deepEqual(spawned.calls, [
    ["ditto", built, staging],
    ["codesign", "--force", "--deep", "--sign", "-", staging],
    [LSREGISTER, "-f", appDir]]);
  assert.equal(markerWhenSigned, true, "the marker must be in the bundle before it is signed");
  assert.ok(fs.existsSync(path.join(resourcesDir, "gui95-installed.json")));
  assert.equal(fs.existsSync(staging), false);
});
test("install on macOS does not sign when told not to, and looks for the running app before it replaces one", async (t) => {
  const { repo, env, home } = await fakeInstallSetup({ system: "macos" });
  const spawned = fakeTools(t, fakeDitto);
  const options = { system: "macos", env, home, sign: false, log() {} };
  await h.install(repo, options);
  spawned.calls.length = 0;
  await h.install(repo, options);
  const { appDir } = h.installPaths((await h.readManifest(repo)).apps[0], "macos", { env, home });
  assert.deepEqual(spawned.calls.map(([command]) => command), ["ditto", "ps", LSREGISTER]);
  assert.deepEqual(spawned.calls[1], ["ps", ...PS_ARGS]);
  assert.deepEqual(spawned.calls[2], [LSREGISTER, "-f", appDir]);
});
test("install on macOS keeps the old copy and removes the staging copy when signing fails", async (t) => {
  const { repo, env, home } = await fakeInstallSetup({ system: "macos" });
  const app = (await h.readManifest(repo)).apps[0];
  const { appDir } = h.installPaths(app, "macos", { env, home });
  fs.mkdirSync(appDir, { recursive: true }); fs.writeFileSync(path.join(appDir, "keep.txt"), "old copy");
  fakeTools(t, (command, args) => (command === "codesign" ? { code: 1, stderr: "bundle format unrecognized\n" } : fakeDitto(command, args)));
  await assert.rejects(h.install(repo, { system: "macos", env, home, sign: true, log() {} }), /^Error: codesign exited with code 1: bundle format unrecognized$/);
  assert.ok(fs.existsSync(path.join(appDir, "keep.txt")));
  assert.equal(fs.existsSync(appDir + ".gui95-new"), false);
});

// Where the app runs from is told by the process list; the Windows way (a locked folder) is tested above.
for (const system of ["linux", "macos"]) {
  test(`install on ${system} refuses while a process runs from the app folder`, async (t) => {
    const { repo, env, home } = await fakeInstallSetup({ system });
    const app = (await h.readManifest(repo)).apps[0];
    const { appDir } = h.installPaths(app, system, { env, home });
    let processes = "";
    const spawned = fakeTools(t, (command, args) => (command === "ps" ? { stdout: processes } : fakeDitto(command, args)));
    const options = { system, env, home, sign: false, integrate: false, log() {} };
    await h.install(repo, options);
    fs.writeFileSync(path.join(appDir, "keep.txt"), "old copy");
    processes = `/usr/bin/node server.js\n${appDir}/running --type=renderer\n`;
    await assert.rejects(h.install(repo, options), /^Error: Close Example App and run make install again\.$/);
    assert.deepEqual(spawned.calls.at(-1), ["ps", ...PS_ARGS]);
    assert.ok(fs.existsSync(path.join(appDir, "keep.txt")));
    assert.equal(fs.existsSync(appDir + ".gui95-new"), false);
    assert.equal(fs.existsSync(appDir + ".gui95-old"), false);
  });
  test(`install on ${system} is not stopped by another app whose folder starts the same way`, async (t) => {
    const { repo, env, home } = await fakeInstallSetup({ system });
    const app = (await h.readManifest(repo)).apps[0];
    const { appDir } = h.installPaths(app, system, { env, home });
    let processes = "";
    fakeTools(t, (command, args) => (command === "ps" ? { stdout: processes } : fakeDitto(command, args)));
    const options = { system, env, home, sign: false, integrate: false, log() {} };
    await h.install(repo, options);
    fs.writeFileSync(path.join(appDir, "stale.txt"), "old copy");
    processes = `${appDir}-beta/bin/tool\n${appDir}2/x\n`;
    await h.install(repo, options);
    assert.equal(fs.existsSync(path.join(appDir, "stale.txt")), false);
  });
  test(`install on ${system} goes ahead, with a warning, when it cannot list the processes`, async (t) => {
    const { repo, env, home } = await fakeInstallSetup({ system });
    fakeTools(t, (command, args) => (command === "ps" ? { code: 1, stderr: "ps: nope\n" } : fakeDitto(command, args)));
    const options = { system, env, home, sign: false, integrate: false };
    await h.install(repo, { ...options, log() {} });
    const lines = [];
    await h.install(repo, { ...options, log: (line) => lines.push(line) });
    assert.ok(lines.some((line) => /^warning: .*running/.test(line)), lines.join("\n"));
  });
}

test("install on Windows creates the shortcut and writes the file types through PowerShell", { skip: process.platform !== "win32" }, async (t) => {
  const { repo, env, home } = await fakeInstallSetup();     // the file types are real here, so PowerShell is a fake: no registry write
  const app = (await h.readManifest(repo)).apps[0];
  const { appDir, launcher } = h.installPaths(app, "windows", { env, home });
  const exe = path.join(appDir, "Example App.exe");
  const spawned = fakeTools(t);
  await h.install(repo, { system: "windows", env, home, log() {} });
  assert.equal(spawned.calls.length, 2);
  const [shortcut, registry] = spawned.calls.map(([command, ...args]) => {
    assert.equal(command, powershellPath());
    assert.deepEqual(args.slice(0, 3), ["-NoProfile", "-NonInteractive", "-EncodedCommand"]);
    assert.equal(args.length, 4);
    return Buffer.from(args[3], "base64").toString("utf16le");
  });
  // Paths and values travel in the environment, never inside the script text.
  for (const script of [shortcut, registry]) {
    for (const secret of [appDir, launcher, exe, "Example"]) assert.equal(script.includes(secret), false, secret);
    assert.deepEqual(powershellSyntaxErrors(script), []);
  }
  assert.match(shortcut, /CreateShortcut/);
  assert.match(registry, /CurrentUser\.CreateSubKey/);
  assert.match(registry, /SHChangeNotify\(0x08000000, 0, \[IntPtr\]::Zero, \[IntPtr\]::Zero\)/);
  assert.deepEqual([spawned.envs[0].GUI95_SHORTCUT_PATH, spawned.envs[0].GUI95_SHORTCUT_TARGET, spawned.envs[0].GUI95_SHORTCUT_FOLDER],
    [launcher, exe, appDir]);
  const entries = JSON.parse(Buffer.from(spawned.envs[1].GUI95_REGISTRY_DATA, "base64").toString("utf8"));
  assert.deepEqual(entries, h.windowsFileTypeEntries(app, appDir));
  for (const childEnv of spawned.envs) assert.equal(childEnv.APPDATA, env.APPDATA);
});
test("install on Windows leaves the registry alone for an app without file types", { skip: process.platform !== "win32" }, async (t) => {
  const { repo, env, home } = await fakeInstallSetup({ withoutFileTypes: true });
  const spawned = fakeTools(t);
  await h.install(repo, { system: "windows", env, home, log() {} });
  assert.equal(spawned.calls.length, 1);
  assert.ok(spawned.envs[0].GUI95_SHORTCUT_PATH);
  assert.equal(spawned.envs[0].GUI95_REGISTRY_DATA, undefined);
});
test("install on Windows says what failed when PowerShell does", { skip: process.platform !== "win32" }, async (t) => {
  const { repo, env, home } = await fakeInstallSetup({ withoutFileTypes: true });
  fakeTools(t, () => ({ code: 1, stderr: "Exception calling Save\n" }));
  await assert.rejects(h.install(repo, { system: "windows", env, home, log() {} }), /Example App: .*Start menu shortcut.*Exception calling Save/);
});

function powershellPath() {
  return path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}
// Parses a script with PowerShell's own parser (nothing is run) and returns the syntax errors.
function powershellSyntaxErrors(script) {
  const out = childProcess.execFileSync(powershellPath(), ["-NoProfile", "-NonInteractive", "-Command",
    "$e = $null; [void][System.Management.Automation.Language.Parser]::ParseInput($env:GUI95_TEST_SCRIPT, [ref]$null, [ref]$e); $e | ForEach-Object { $_.Message }"],
  { encoding: "utf8", env: { ...process.env, GUI95_TEST_SCRIPT: script } });
  return out.split(/\r?\n/).filter(Boolean);
}

// main is the command line. It runs only when the file is the entry script, so these start a process.
function runHelperWithEnv(cwd, env, ...args) {
  return childProcess.spawnSync(process.execPath, [path.join(import.meta.dirname, "..", "gui95-app.mjs"), ...args], { cwd, env, encoding: "utf8" });
}
const runHelper = (cwd, ...args) => runHelperWithEnv(cwd, process.env, ...args);
test("main pack archives the build and prints one line per app", { skip: h.systemName() === "macos" }, () => {
  const repo = fakeBuiltRepo();
  const run = runHelper(repo, "pack");
  assert.equal(run.status, 0, run.stderr);
  const archive = h.archiveName({ name: "Example App", version: "1.2.0", system: h.systemName(), arch: process.arch });
  assert.equal(run.stdout.trim(), `Example App: ${path.join(h.DIST_DIR, archive)}`);
  assert.ok(fs.existsSync(path.join(repo, h.DIST_DIR, archive)));
});
test("main pack exits 1 and says why when the build is missing", () => {
  const run = runHelper(fakeRepoWithoutBuild(), "pack");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Example App: no build at .*run the build first/);
  assert.equal(run.stdout, "");
});
// A real install by the command line has to land in the sandbox, so macOS is left out: it would
// register the app with the real Launch Services database.
test("main install puts the build in place and prints one line per app", { skip: h.systemName() === "macos" }, async (t) => {
  const { repo, env, home } = await fakeInstallSetup({ withoutFileTypes: true });
  const run = runHelperWithEnv(repo, env, "install");
  assert.equal(run.status, 0, run.stderr);
  const { appDir } = h.installPaths((await h.readManifest(repo)).apps[0], h.systemName(), { env, home });
  assert.equal(run.stdout.trim(), `Example App: installed in ${appDir}`);
  assert.ok(fs.existsSync(path.join(appDir, builtFile(h.systemName()))));
});
test("main install exits 1 and says why when the build is missing", async (t) => {
  const { env } = await fakeInstallSetup();
  const run = runHelperWithEnv(fakeRepoWithoutBuild(), env, "install");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Example App: no build at .*run the build first/);
  assert.equal(run.stdout, "");
});
test("main exits 2 with the usage for a missing or unknown command", () => {
  for (const args of [[], ["frobnicate"], ["pack", "extra"]]) {
    const run = runHelper(fakeRepoWithoutBuild(), ...args);
    assert.equal(run.status, 2, args.join(" "));
    assert.match(run.stderr, /^Usage: node .*gui95-app\.mjs <pack\|install>$/m);
  }
});
