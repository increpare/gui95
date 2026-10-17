import { test, after } from "node:test";
import assert from "node:assert/strict";
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
