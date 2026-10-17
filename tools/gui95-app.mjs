// This file is copied verbatim into each GUI95 app as scripts/gui95-app.mjs, so every
// copy must stay byte-identical and dependency-free: Node >= 20.11, built-in modules only.
//
// It describes a GUI95 app to the tools that build and install it: the gui95-app.json
// manifest, the names of release archives, and where an installed copy lives on each system.
// Run from the repository root, it also packs the app's finished build:
//   node scripts/gui95-app.mjs pack

import childProcess from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, readFile, rename, rm, rmdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MANIFEST = "gui95-app.json";
export const DIST_DIR = "gui95-dist";
export const MARKER = "gui95-installed.json";

const SYSTEMS = ["windows", "macos", "linux"];

export function systemName(platform = process.platform) {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "macos";
  if (platform === "linux") return "linux";
  throw new Error(`Unsupported platform: ${platform}`);
}

// ---- Manifest -------------------------------------------------------------

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.trim() !== "";

function invalid(field, problem) {
  return new Error(`${MANIFEST}: ${field} ${problem}`);
}

async function readJson(file) {
  return JSON.parse((await readFile(file, "utf8")).replace(/^﻿/, ""));
}

function checkBuild(build, system, field) {
  if (!isObject(build)) throw invalid(field, "must be an object");
  if (!isText(build.dir)) throw invalid(`${field}.dir`, "must be the build folder, relative to the repository");
  if (system === "macos") {
    if (!isText(build.bundle) || !build.bundle.endsWith(".app")) throw invalid(`${field}.bundle`, "must name the .app bundle");
  } else if (!isText(build.exe)) {
    throw invalid(`${field}.exe`, "must name the executable");
  }
}

function checkFileType(fileType, builds, field) {
  if (!isObject(fileType)) throw invalid(field, "must be an object");
  if (!isText(fileType.ext) || fileType.ext.startsWith(".")) throw invalid(`${field}.ext`, "must be the extension without a leading dot");
  if (!isText(fileType.name)) throw invalid(`${field}.name`, "must be the name of the file type");
  if (builds.windows) {
    if (!isText(fileType.progId)) throw invalid(`${field}.progId`, "is required when there is a windows build");
    if (!isText(fileType.windowsIcon)) throw invalid(`${field}.windowsIcon`, "is required when there is a windows build");
  }
  if (builds.linux && !isText(fileType.mime)) throw invalid(`${field}.mime`, "is required when there is a linux build");
}

function checkApp(app, field) {
  if (!isObject(app)) throw invalid(field, "must be an object");
  if (typeof app.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(app.id)) {
    throw invalid(`${field}.id`, "must use lowercase letters, digits and hyphens, and start with a letter or digit");
  }
  if (!isText(app.name) || /[\\/:*?"<>|]/.test(app.name)) {
    throw invalid(`${field}.name`, 'must be a name without any of \\ / : * ? " < > |');
  }
  if (!isText(app.version)) throw invalid(`${field}.version`, "must be the path of a JSON file with a version field");
  if (app.icon !== undefined && !isText(app.icon)) throw invalid(`${field}.icon`, "must be the path of an image");

  if (!isObject(app.builds)) throw invalid(`${field}.builds`, "must be an object");
  const systems = Object.keys(app.builds);
  const unknown = systems.find((system) => !SYSTEMS.includes(system));
  if (unknown !== undefined) throw invalid(`${field}.builds`, `has "${unknown}", which is not one of ${SYSTEMS.join(", ")}`);
  if (systems.length === 0) throw invalid(`${field}.builds`, `needs at least one of ${SYSTEMS.join(", ")}`);
  for (const system of systems) checkBuild(app.builds[system], system, `${field}.builds.${system}`);
  if (app.builds.linux && !isText(app.icon)) throw invalid(`${field}.icon`, "is required when there is a linux build");

  if (app.fileTypes !== undefined) {
    if (!Array.isArray(app.fileTypes)) throw invalid(`${field}.fileTypes`, "must be an array");
    app.fileTypes.forEach((fileType, index) => checkFileType(fileType, app.builds, `${field}.fileTypes[${index}]`));
  }
}

export async function readManifest(repoRoot) {
  let manifest;
  try {
    manifest = await readJson(path.join(repoRoot, MANIFEST));
  } catch (err) {
    throw new Error(`${MANIFEST}: cannot read it from ${repoRoot} (${err.message})`, { cause: err });
  }
  if (!Array.isArray(manifest?.apps) || manifest.apps.length === 0) throw invalid("apps", "must be a non-empty array");
  manifest.apps.forEach((app, index) => checkApp(app, `apps[${index}]`));
  return { apps: manifest.apps };
}

export async function readVersion(repoRoot, app) {
  let data;
  try {
    data = await readJson(path.join(repoRoot, app.version));
  } catch (err) {
    throw new Error(`${MANIFEST}: cannot read the version file "${app.version}" (${err.message})`, { cause: err });
  }
  if (!isText(data?.version)) throw new Error(`${MANIFEST}: the version file "${app.version}" has no version string`);
  return data.version;
}

// ---- Names and paths ------------------------------------------------------

function buildFor(app, system) {
  const build = app.builds?.[system];
  if (!build) throw new Error(`${app.name} has no ${system} build in ${MANIFEST}`);
  return build;
}

export function archiveName({ name, version, system, arch }) {
  if (!SYSTEMS.includes(system)) throw new Error(`Unknown system: ${system}`);
  const extension = system === "linux" ? "tar.gz" : "zip";
  return `${name.trim().replace(/\s+/g, "-")}-${version}-${system}-${arch}.${extension}`;
}

export function builtAppPath(repoRoot, app, system) {
  const build = buildFor(app, system);
  return system === "macos" ? path.join(repoRoot, build.dir, build.bundle) : path.join(repoRoot, build.dir);
}

export function installPaths(app, system, { env = process.env, home = os.homedir() } = {}) {
  if (system === "windows") {
    const win = path.win32;
    const localAppData = env.LOCALAPPDATA || win.join(home, "AppData", "Local");
    const roamingAppData = env.APPDATA || win.join(home, "AppData", "Roaming");
    const appDir = win.join(localAppData, "Programs", "GUI95", app.name);
    return {
      appDir,
      resourcesDir: win.join(appDir, "resources"),
      launcher: win.join(roamingAppData, "Microsoft", "Windows", "Start Menu", "Programs", "GUI95", `${app.name}.lnk`),
    };
  }
  const posix = path.posix;
  if (system === "macos") {
    const appDir = posix.join(home, "Applications", "GUI95", `${app.name}.app`);
    return { appDir, resourcesDir: posix.join(appDir, "Contents", "Resources"), launcher: null };
  }
  if (system === "linux") {
    const dataHome = env.XDG_DATA_HOME || posix.join(home, ".local", "share");
    const appDir = posix.join(dataHome, "gui95", app.id);
    return {
      appDir,
      resourcesDir: posix.join(appDir, "resources"),
      launcher: posix.join(dataHome, "applications", `gui95-${app.id}.desktop`),
    };
  }
  throw new Error(`Unknown system: ${system}`);
}

// ---- Desktop integration --------------------------------------------------

// A quoted Exec argument backslash-escapes " ` $ \ (Desktop Entry spec); the file's own string
// escaping then doubles every backslash, and a literal % is written %%.
function execArgument(value) {
  return `"${value.replace(/["`$\\]/g, "\\$&").replace(/\\/g, "\\\\").replace(/%/g, "%%")}"`;
}

function xmlText(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function desktopEntry(app, appDir) {
  const exe = path.posix.join(appDir, buildFor(app, "linux").exe);
  const mimeTypes = (app.fileTypes ?? []).map((fileType) => fileType.mime);
  return [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${app.name}`,
    `Exec=${execArgument(exe)}${mimeTypes.length > 0 ? " %F" : ""}`,
    `Icon=${path.posix.join(appDir, "gui95-icon.png")}`,
    "Terminal=false",
    "Categories=Utility;",
    ...(mimeTypes.length > 0 ? [`MimeType=${mimeTypes.map((mime) => `${mime};`).join("")}`] : []),
    "",
  ].join("\n");
}

export function mimeXml(app) {
  const types = (app.fileTypes ?? []).flatMap((fileType) => [
    `  <mime-type type="${xmlText(fileType.mime)}">`,
    `    <comment>${xmlText(fileType.name)}</comment>`,
    `    <glob pattern="*.${xmlText(fileType.ext)}"/>`,
    "  </mime-type>",
  ]);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">',
    ...types,
    "</mime-info>",
    "",
  ].join("\n");
}

export function windowsFileTypeEntries(app, appDir) {
  const win = path.win32;
  const exe = win.join(appDir, buildFor(app, "windows").exe);
  return (app.fileTypes ?? []).flatMap((fileType) => {
    const progId = `Software\\Classes\\${fileType.progId}`;
    return [
      { key: progId, name: "", value: fileType.name },
      { key: progId, name: "FriendlyTypeName", value: fileType.name },
      { key: `${progId}\\DefaultIcon`, name: "", value: `"${win.join(appDir, fileType.windowsIcon)}",0` },
      { key: `${progId}\\shell\\open\\command`, name: "", value: `"${exe}" "%1"` },
      { key: `Software\\Classes\\.${fileType.ext}`, name: "", value: fileType.progId },
    ];
  });
}

// ---- Packing --------------------------------------------------------------

// Runs a program without a shell. Resolves when it exits 0, rejects with what it said otherwise.
function runTool(command, args) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (err) => reject(new Error(`cannot run ${command} (${err.message})`, { cause: err })));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} exited with code ${code}${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

// Windows ships a bsdtar that writes zip files. Another tar earlier on PATH (the GNU tar that
// comes with MSYS or Git Bash, say) cannot, so the system's own is called by its full path.
function windowsTar() {
  const systemRoot = process.env.SystemRoot || process.env.windir || "C:\\Windows";
  return path.win32.join(systemRoot, "System32", "tar.exe");
}

async function isDirectory(dir) {
  return (await stat(dir).catch(() => null))?.isDirectory() ?? false;
}

// Every archive has one top-level entry: the .app bundle on macOS, <Name>/ elsewhere. The build
// folder has some other name, so for the length of the tar run it is moved to .stage/<Name> (same
// volume, so the move is instant) and then moved back, even if tar fails.
async function createArchive({ app, built, distDir, archive, system }) {
  if (system === "macos") {
    await runTool("ditto", ["-c", "-k", "--keepParent", built, archive]);
    return;
  }
  const stageDir = path.join(distDir, ".stage");
  const staged = path.join(stageDir, app.name);
  await mkdir(stageDir, { recursive: true });
  try {
    await rename(built, staged);
  } catch (err) {
    throw new Error(`${app.name}: cannot move the build to ${staged} (${err.message})`, { cause: err });
  }
  try {
    if (system === "windows") await runTool(windowsTar(), ["-a", "-c", "-f", archive, "-C", stageDir, app.name]);
    else await runTool("tar", ["-czf", archive, "-C", stageDir, app.name]);
  } finally {
    try {
      await rename(staged, built);
    } catch (err) {
      throw new Error(`${app.name}: the build is still at ${staged}; move it back to ${built} (${err.message})`, { cause: err });
    }
    await rmdir(stageDir).catch(() => {});   // not recursive: it must never remove a build
  }
}

export async function pack(repoRoot, { system = systemName(), arch = process.arch, sign = system === "macos", log = console.log } = {}) {
  const { apps } = await readManifest(repoRoot);
  const distDir = path.join(repoRoot, DIST_DIR);

  // Check every app before packing any, so a missing build stops the run with nothing half done.
  const plan = [];
  for (const app of apps) {
    if (!app.builds[system]) {
      plan.push({ app });
      continue;
    }
    const built = builtAppPath(repoRoot, app, system);
    if (!(await isDirectory(built))) throw new Error(`${app.name}: no build at ${built}; run the build first.`);
    plan.push({ app, built, version: await readVersion(repoRoot, app) });
  }

  const results = [];
  for (const { app, built, version } of plan) {
    if (built === undefined) {
      const skipped = `no ${system} build`;
      log(`${app.name}: skipped, ${skipped}`);
      results.push({ app: app.name, skipped });
      continue;
    }
    const archive = path.join(distDir, archiveName({ name: app.name, version, system, arch }));
    await mkdir(distDir, { recursive: true });
    await rm(archive, { force: true });
    try {
      if (system === "macos" && sign) await runTool("codesign", ["--force", "--deep", "--sign", "-", built]);
      await createArchive({ app, built, distDir, archive, system });
    } catch (err) {
      await rm(archive, { force: true }).catch(() => {});
      throw err;
    }
    log(`${app.name}: ${path.relative(repoRoot, archive)}`);
    results.push({ app: app.name, archive });
  }
  return results;
}

// ---- Command line ---------------------------------------------------------

const COMMANDS = {
  pack: (repoRoot) => pack(repoRoot),
};

// Returns the exit code: 0 done, 1 something failed (the message goes to stderr), 2 bad usage.
export async function main(argv) {
  const [name, ...rest] = argv;
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (command === undefined || rest.length > 0) {
    const file = fileURLToPath(import.meta.url);
    const relative = path.relative(process.cwd(), file);
    console.error(`Usage: node ${relative.startsWith("..") ? file : relative} <${Object.keys(COMMANDS).join("|")}>`);
    return 2;
  }
  try {
    await command(process.cwd());
    return 0;
  } catch (err) {
    console.error(err.message);
    return 1;
  }
}

function isEntryScript() {
  try {
    return realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryScript()) process.exitCode = await main(process.argv.slice(2));
