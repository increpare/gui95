// This file is copied verbatim into each GUI95 app as scripts/gui95-app.mjs, so every
// copy must stay byte-identical and dependency-free: Node >= 20.11, built-in modules only.
//
// It describes a GUI95 app to the tools that build and install it: the gui95-app.json
// manifest, the names of release archives, and where an installed copy lives on each system.

import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
