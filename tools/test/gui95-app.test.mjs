import { test, after } from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
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
after(() => { for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true }); });

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

// main is the command line. It runs only when the file is the entry script, so these start a process.
function runHelper(cwd, ...args) {
  return childProcess.spawnSync(process.execPath, [path.join(import.meta.dirname, "..", "gui95-app.mjs"), ...args], { cwd, encoding: "utf8" });
}
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
test("main exits 2 with the usage for a missing or unknown command", () => {
  for (const args of [[], ["frobnicate"], ["pack", "extra"]]) {
    const run = runHelper(fakeRepoWithoutBuild(), ...args);
    assert.equal(run.status, 2, args.join(" "));
    assert.match(run.stderr, /^Usage: node .*gui95-app\.mjs <pack>/m);
  }
});
