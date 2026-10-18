import { mkdir, cp, readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { loadCatalog } from "./catalog.mjs";
import { VERSION } from "./server.mjs";
import { createKit } from "./kit.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const nameIndex = process.argv.indexOf("--plugin-name");
const pluginName = nameIndex < 0 ? "gui95-mcp" : process.argv[nameIndex + 1];
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pluginName ?? "") || pluginName.length > 64) throw new Error("Invalid --plugin-name.");
const catalog = await loadCatalog(root);
const releaseName = "gui95-mcp-" + VERSION + "-" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID().slice(0, 8);
const dist = path.join(root, "dist");
await mkdir(dist, { recursive: true });
const output = path.join(dist, releaseName);
await mkdir(output);
const deployment = path.join(output, "gui95-mcp");
const service = path.join(deployment, "service");
const content = path.join(deployment, "content");
await mkdir(service, { recursive: true });
await mkdir(content);
for (const name of ["server.mjs", "catalog.mjs", "kit.mjs", "kit-tools.mjs", "store.mjs", "admin.mjs", "smoke.mjs", "package.json", "package-lock.json"]) {
  await cp(path.join(here, name), path.join(service, name));
}
await cp(path.join(root, "kit"), path.join(deployment, "kit"), { recursive: true, filter: (source) => !source.split(path.sep).some((part) => ["node_modules", "test-results", "playwright-report", "artifacts"].includes(part) || part.startsWith("._")) });
await mkdir(path.join(deployment, "tools"));
for (const name of ["gui95-app.mjs", "gui95-icons.mjs"]) await cp(path.join(root, "tools", name), path.join(deployment, "tools", name));
for (const name of ["LICENSE", "THIRD-PARTY-NOTICES.md"]) await cp(path.join(root, name), path.join(deployment, name));
const dependencies = path.join(here, "node_modules");
if (!(await stat(dependencies)).isDirectory()) throw new Error("Install locked MCP dependencies before packaging.");
await cp(dependencies, path.join(service, "node_modules"), { recursive: true, dereference: true });
await cp(path.join(here, "deploy"), path.join(deployment, "deploy"), { recursive: true });
for (const name of ["SKILL.md", "README.md", "LICENSE", "THIRD-PARTY-NOTICES.md", "PRIVACY.md"]) await cp(path.join(root, name), path.join(content, name));
await mkdir(path.join(content, "docs"));
for (const entry of await readdir(path.join(root, "docs"), { withFileTypes: true })) {
  if (entry.isFile() && [".md", ".png"].includes(path.extname(entry.name))) await cp(path.join(root, "docs", entry.name), path.join(content, "docs", entry.name));
}
const snapshotPath = "references/snapshot-manifest.json";
const snapshot = JSON.parse(await readFile(path.join(root, snapshotPath), "utf8"));
for (const name of [snapshotPath, ...snapshot.files.map((file) => file.path)]) {
  const destination = path.join(content, name);
  if (!path.resolve(destination).startsWith(path.resolve(content) + path.sep)) throw new Error("Unsafe content destination.");
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, name), destination);
}
await writeFile(path.join(deployment, "RELEASE.json"), JSON.stringify({ version: VERSION, content_revision: catalog.revision, created_at: new Date().toISOString() }, null, 2) + "\n");
await cp(path.join(root, "docs/mcp-service.md"), path.join(deployment, "DEPLOYMENT.md"));
const deployedCatalog = await loadCatalog(content);
if (deployedCatalog.revision !== catalog.revision) throw new Error("Content changed while packaging; retry from a stable checkout.");
const tarName = "gui95-mcp-deploy.tar.gz";
const tar = spawnSync("tar", ["--no-xattrs", "-czf", path.join(output, tarName), "-C", output, "gui95-mcp"], { encoding: "utf8", env: { ...process.env, COPYFILE_DISABLE: "1" } });
if (tar.status !== 0) throw new Error("Deployment archive failed: " + tar.stderr);

const manifest = JSON.parse(await readFile(path.join(root, "plugin/.codex-plugin/plugin.json"), "utf8"));
manifest.name = pluginName;
manifest.version = VERSION;
manifest.description = "Current GUI95 interface guidance and preserved source references through a hosted MCP server, with an explicit private agent feedback inbox.";
manifest.mcpServers = "./.mcp.json";
manifest.interface.shortDescription = "Live Windows 95 UI guidance";
manifest.interface.longDescription = "Build or restyle Windows 95-inspired web and Electron interfaces using current GUI95 guidance and preserved Vector95 and ProcGen FM examples. Search controls and integration lessons, read bounded source excerpts, and adapt the relevant markup, CSS, and interaction behavior to your framework.\n\nThe hosted service can receive concise, authorized feedback written by an agent or a human. Reports distinguish tested results from observations and suggestions, and stay in a private maintainer inbox. No report automatically changes guidance. Do not submit private code, conversations, credentials, or personal information.\n\nThe service stores aggregate tool and reference counts without search text or user identifiers. Feedback and counters expire after 90 calendar days. Neither source application needs to be installed. The optional versioned build kit supplies standalone controls, original CC0 icons, generators and app starters. Run its local checks in the target app and retain the relevant source notices. Bundled third-party notices apply. Independent project, not affiliated with Microsoft.";
manifest.interface.websiteURL = "https://ded.increpare.com/gui95/";
manifest.interface.privacyPolicyURL = "https://ded.increpare.com/gui95/privacy";
manifest.interface.capabilities = ["Get standalone controls and original CC0 icons", "Generate layouts and browser/Electron starters", "Find precise evidence, repairs and version guidance", "Share authorized agent feedback"];
manifest.extensions["com.openai"].review = { test_cases: JSON.parse(await readFile(path.join(here, "review-cases.json"), "utf8")) };
manifest.extensions["com.openai"].publication.release_notes = "GUI95 build kits: standalone components and local checks, original CC0 icons, layout and app generators, precise evidence, repairs and version guidance, alongside the private feedback inbox.";
delete manifest.interface.screenshots;
const pluginFiles = new Map([
  ["gui95-mcp/.codex-plugin/plugin.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n")],
  ["gui95-mcp/.mcp.json", Buffer.from(JSON.stringify({ mcpServers: { gui95: { type: "http", url: "https://ded.increpare.com/gui95/mcp" } } }, null, 2) + "\n")],
  ["gui95-mcp/assets/gui95.svg", await readFile(path.join(root, "plugin/assets/gui95.svg"))],
  ["gui95-mcp/skills/gui95-live/SKILL.md", await readFile(path.join(here, "plugin/skills/gui95-live/SKILL.md"))],
  ["gui95-mcp/LICENSE", await readFile(path.join(root, "LICENSE"))],
  ["gui95-mcp/PRIVACY.md", await readFile(path.join(root, "PRIVACY.md"))]
]);

// Standard stored ZIP for six small plugin files, including the dot-directory.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const locals = [];
const central = [];
let offset = 0;
for (const [name, data] of pluginFiles) {
  const filename = Buffer.from(name);
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x800, 6);
  local.writeUInt16LE(33, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(filename.length, 26);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x800, 8);
  entry.writeUInt16LE(33, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(data.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(filename.length, 28);
  entry.writeUInt32LE(offset, 42);
  locals.push(local, filename, data);
  central.push(entry, filename);
  offset += local.length + filename.length + data.length;
}
const centralBytes = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(pluginFiles.size, 8);
end.writeUInt16LE(pluginFiles.size, 10);
end.writeUInt32LE(centralBytes.length, 12);
end.writeUInt32LE(offset, 16);
const zipName = "gui95-mcp-plugin.zip";
await writeFile(path.join(output, zipName), Buffer.concat([...locals, centralBytes, end]));
const kit = createKit({ root: path.join(root, "kit") });
const kitExport = await kit.fullKit();
const iconExport = await kit.iconPack();
const kitName = "gui95-build-kit.zip";
const iconsName = "gui95-cc0-icons.zip";
await writeFile(path.join(output, kitName), kit.artifacts.get(kitExport.artifact.id).bytes);
await writeFile(path.join(output, iconsName), kit.artifacts.get(iconExport.artifact.id).bytes);
kit.artifacts.close();
const checksumLines = [];
for (const name of [tarName, zipName, kitName, iconsName]) checksumLines.push(createHash("sha256").update(await readFile(path.join(output, name))).digest("hex") + "  " + name);
await writeFile(path.join(output, "SHA256SUMS"), checksumLines.join("\n") + "\n");
console.log(JSON.stringify({ output, deployment: path.join(output, tarName), plugin: path.join(output, zipName), kit: path.join(output, kitName), icons: path.join(output, iconsName), content_revision: catalog.revision }, null, 2));
