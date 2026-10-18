import { mkdir, cp, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { loadCatalog } from "./catalog.mjs";
import { VERSION } from "./server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const nameIndex = process.argv.indexOf("--plugin-name");
const pluginName = nameIndex < 0 ? "gui95-mcp" : process.argv[nameIndex + 1];
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pluginName ?? "") || pluginName.length > 64) throw new Error("Invalid --plugin-name.");
const generated=spawnSync(process.execPath,[path.join(root,'tools/build-widget-examples.mjs'),'--check'],{encoding:'utf8'});
if(generated.status!==0)throw new Error('Build/check standalone widget examples before packaging: '+generated.stdout+generated.stderr);
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
for (const name of ["server.mjs", "catalog.mjs", "content.mjs", "store.mjs", "admin.mjs", "smoke.mjs", "package.json", "package-lock.json"]) {
  await cp(path.join(here, name), path.join(service, name));
}
const dependencies = path.join(here, "node_modules");
if (!(await stat(dependencies)).isDirectory()) throw new Error("Install locked MCP dependencies before packaging.");
await cp(dependencies, path.join(service, "node_modules"), { recursive: true, dereference: true });
await cp(path.join(here, "deploy"), path.join(deployment, "deploy"), { recursive: true });
// Ship exactly the inventoried bytes, including binary assets and standalone demos.
// No independent copy list can silently omit newly published guidance or templates.
for (const [name,file] of catalog.files) {
  const destination = path.join(content, name);
  if (!path.resolve(destination).startsWith(path.resolve(content) + path.sep)) throw new Error("Unsafe content destination.");
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination,file.bytes);
}
await writeFile(path.join(deployment, "RELEASE.json"), JSON.stringify({ version: VERSION, content_revision: catalog.revision, created_at: new Date().toISOString() }, null, 2) + "\n");
await cp(path.join(root, "docs/mcp-service.md"), path.join(deployment, "DEPLOYMENT.md"));
const deployedCatalog = await loadCatalog(content);
if (deployedCatalog.revision !== catalog.revision) throw new Error("Content changed while packaging; retry from a stable checkout.");
const tarName = "gui95-mcp-deploy.tar.gz";
const tar = spawnSync("tar", ["-czf", path.join(output, tarName), "-C", output, "gui95-mcp"], { encoding: "utf8" });
if (tar.status !== 0) throw new Error("Deployment archive failed: " + tar.stderr);

const manifest = JSON.parse(await readFile(path.join(root, "plugin/.codex-plugin/plugin.json"), "utf8"));
manifest.name = pluginName;
manifest.version = VERSION;
manifest.description = "Complete GUI95 guidance, independent widget templates, source, tools, assets and verification through a hosted MCP server, with an explicit private agent feedback inbox.";
manifest.mcpServers = "./.mcp.json";
manifest.interface.shortDescription = "Live Windows 95 UI guidance";
manifest.interface.longDescription = "Build high-quality Windows 95-inspired web and Electron interfaces with the complete public GUI95 reference. Browse control families, get independent runnable HTML templates with states and keyboard rules, preview them, and retrieve original app source, build/icon tools, verification, icons, fonts, screenshots and notices. Adapt only the markup, CSS and behavior needed by your framework.\n\nThe hosted service can receive concise, authorized feedback written by an agent or a human. Reports distinguish tested results from observations and suggestions, and stay in a private maintainer inbox. No report automatically changes guidance. Do not submit private code, conversations, credentials, or personal information.\n\nThe service stores aggregate tool and reference counts without search text or user identifiers. Feedback and counters expire after 90 calendar days. Neither source application needs to be installed. GUI95 is reference guidance, not a drop-in widget library; changes still need testing in the target app. Bundled third-party notices apply. Independent project, not affiliated with Microsoft.";
manifest.interface.websiteURL = "https://ded.increpare.com/gui95/";
manifest.interface.privacyPolicyURL = "https://ded.increpare.com/gui95/privacy";
manifest.interface.capabilities = ["Find current GUI95 guidance", "Get complete widget templates", "Retrieve icons, fonts and screenshots", "Read source, tooling and verification", "Review keyboard and focus behavior", "Share authorized agent feedback"];
manifest.extensions["com.openai"].review = { test_cases: JSON.parse(await readFile(path.join(here, "review-cases.json"), "utf8")) };
manifest.extensions["com.openai"].publication.release_notes = "Expose complete widget templates, source, tooling, verification and reusable assets through six MCP tools, with byte-exact downloads, sandboxed previews, explicit feedback and retention.";
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
const checksumLines = [];
for (const name of [tarName, zipName]) checksumLines.push(createHash("sha256").update(await readFile(path.join(output, name))).digest("hex") + "  " + name);
await writeFile(path.join(output, "SHA256SUMS"), checksumLines.join("\n") + "\n");
console.log(JSON.stringify({ output, deployment: path.join(output, tarName), plugin: path.join(output, zipName), content_revision: catalog.revision }, null, 2));
