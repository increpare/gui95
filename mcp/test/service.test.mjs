import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile, appendFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApplication } from "../server.mjs";
import { loadCatalog } from "../catalog.mjs";
import { createStore, createRateLimiter } from "../store.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gui95-mcp-test-"));
  t.after(async () => {
    if (!path.resolve(directory).startsWith(path.join(os.tmpdir(), "gui95-mcp-test-"))) throw new Error("Unsafe test cleanup.");
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}
const report = (changes = {}) => ({
  client_report_id: randomUUID(), source: "agent", category: "lesson", summary: "Keep keyboard focus visible when opening a property dialog.",
  verification: "tested", evidence: "Verified Tab, Escape, and focus restoration in a disposable example.", ...changes
});

test("catalog finds behavioral guidance and bounds access to preserved public references", async () => {
  const catalog = await loadCatalog(root);
  assert.ok(catalog.files.size > 80);
  assert.ok(catalog.search("menu keyboard focus", 5).some((match) => match.path.startsWith("docs/")));
  const file = catalog.read("docs/integration-lessons.md", 1, 15);
  assert.equal(file.start_line, 1);
  assert.equal(file.end_line, 15);
  assert.ok(file.sha256.match(/^[a-f0-9]{64}$/));
  for (const unsafe of ["../PRIVACY.md", ".ssh/config", "mcp/var/feedback.jsonl", "docs\\design-guide.md", "/etc/passwd"]) assert.throws(() => catalog.read(unsafe), /Unknown reference/);
  assert.throws(() => catalog.read("SKILL.md", 0, 5), /Invalid line/);
  assert.throws(() => catalog.read("SKILL.md", 1, 201), /Invalid line/);
});

test("feedback survives restarts, deduplicates retries across content deployments, and rejects changed retries", async (t) => {
  const directory = await temporary(t);
  const first = await createStore(directory);
  const input = report({ content_revision: "one" });
  const saved = await first.submit(input);
  const restarted = await createStore(directory);
  const retry = await restarted.submit({ ...input, content_revision: "two" });
  assert.equal(retry.id, saved.id);
  assert.equal(retry.duplicate, true);
  await assert.rejects(restarted.submit({ ...input, summary: "Different feedback with the same UUID." }), /already used/);
  const text = await readFile(path.join(directory, (await readdir(directory)).find((name) => name.startsWith("feedback-"))), "utf8");
  assert.equal(text.trim().split("\n").length, 1);
});

test("feedback refuses obvious secrets and private paths", async (t) => {
  const store = await createStore(await temporary(t));
  for (const summary of ["A private file is at C:\\Users\\someone\\secret.txt", "A private file is at /Users/someone/secret.txt", "My key is ghp_123456789012345678901234567890", "-----BEGIN OPENSSH PRIVATE KEY-----"]) {
    await assert.rejects(store.submit(report({ summary })), /Remove credentials/);
  }
});

test("usage counters retain aggregate counts without search text, arguments, or user identifiers", async (t) => {
  const directory = await temporary(t);
  const store = await createStore(directory);
  await Promise.all(Array.from({ length: 20 }, () => store.recordUsage("search_gui95")));
  await store.recordUsage("read_gui95_reference", { reference: "docs/widgets.md", error: true });
  const file = (await readdir(directory)).find((name) => name.startsWith("usage-"));
  const counts = JSON.parse(await readFile(path.join(directory, file), "utf8"));
  assert.equal(counts.calls.search_gui95, 20);
  assert.equal(counts.errors.read_gui95_reference, 1);
  assert.equal(counts.references["docs/widgets.md"], 1);
  assert.deepEqual(Object.keys(counts).sort(), ["calls", "day", "errors", "references"]);
});

test("retention runs at startup and after midnight, and daily inbox limits are enforced", async (t) => {
  const directory = await temporary(t);
  await writeFile(path.join(directory, "usage-2025-01-01.json"), "{}");
  await writeFile(path.join(directory, "usage-2025-01-01.json.tmp"), "{}");
  await writeFile(path.join(directory, "feedback-2025-01-01.jsonl"), "");
  let now = new Date("2026-10-18T12:00:00Z");
  const store = await createStore(directory, { now: () => now, maxFeedbackPerDay: 1 });
  assert.deepEqual(await readdir(directory), []);
  await store.submit(report());
  await assert.rejects(store.submit(report()), /daily limit/);
  now = new Date("2027-02-18T12:00:00Z");
  await store.prune();
  assert.deepEqual(await readdir(directory), []);
  await store.submit(report());
});

test("restart recovers a crash-truncated final line before appending another report", async (t) => {
  const directory = await temporary(t);
  const store = await createStore(directory);
  await store.submit(report());
  const file = path.join(directory, (await readdir(directory))[0]);
  await appendFile(file, '{"partial":');
  const restarted = await createStore(directory);
  await restarted.submit(report());
  const lines = (await readFile(file, "utf8")).trim().split("\n");
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => JSON.parse(line).id));
});

test("rate limiting expires and refuses unbounded unique-client growth", () => {
  let now = 0;
  const allow = createRateLimiter({ limit: 2, windowMs: 100, maxKeys: 1, now: () => now });
  assert.equal(allow("one"), true);
  assert.equal(allow("one"), true);
  assert.equal(allow("one"), false);
  assert.equal(allow("two"), false);
  now = 101;
  assert.equal(allow("two"), true);
});

test("real MCP client initializes, searches, reads, and submits authorized feedback over HTTP", async (t) => {
  const directory = await temporary(t);
  const service = await createApplication({ contentRoot: root, stateDir: directory });
  const listener = service.app.listen(0, "127.0.0.1");
  await new Promise((resolve) => listener.once("listening", resolve));
  const base = "http://127.0.0.1:" + listener.address().port + "/gui95";
  const client = new Client({ name: "gui95-integration-test", version: "1.0.0" });
  t.after(async () => { await client.close(); listener.closeAllConnections(); await new Promise((resolve) => listener.close(resolve)); await service.close(); });
  await client.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp")));
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 11);
  const feedbackTool = listed.tools.find((tool) => tool.name === "submit_gui95_feedback");
  assert.equal(feedbackTool.annotations.readOnlyHint, false);
  const sentinel = "menu keyboard focus private-query-sentinel";
  const found = await client.callTool({ name: "search_gui95", arguments: { query: sentinel, limit: 3 } });
  assert.ok(found.structuredContent.results.length);
  const read = await client.callTool({ name: "read_gui95_reference", arguments: { path: "docs/widgets.md", line_count: 5 } });
  assert.equal(read.structuredContent.end_line, 5);
  const forbidden = await client.callTool({ name: "read_gui95_reference", arguments: { path: "../../.ssh/id_rsa" } });
  assert.equal(forbidden.isError, true);
  const input = { ...report(), consent: true };
  const accepted = await client.callTool({ name: "submit_gui95_feedback", arguments: input });
  assert.equal(accepted.structuredContent.status, "received");
  const retry = await client.callTool({ name: "submit_gui95_feedback", arguments: input });
  assert.equal(retry.structuredContent.id, accepted.structuredContent.id);
  assert.equal(retry.structuredContent.duplicate, true);
  const noConsent = await client.callTool({ name: "submit_gui95_feedback", arguments: { ...report(), consent: false } });
  assert.equal(noConsent.isError, true);
  assert.equal((await fetch(base + "/healthz")).status, 200);
  assert.equal((await fetch(base + "/reference?path=" + encodeURIComponent("docs/widgets.md"))).status, 200);
  assert.equal((await fetch(base + "/reference?path=../../.ssh/id_rsa")).status, 404);
  assert.equal((await fetch(base + "/mcp")).status, 405);
  assert.equal((await fetch(base + "/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })).status, 400);
  assert.equal((await fetch(base + "/healthz", { headers: { Origin: "https://attacker.invalid" } })).status, 403);
  for (const name of await readdir(directory)) {
    const saved = await readFile(path.join(directory, name), "utf8");
    assert.ok(!saved.includes("private-query-sentinel"));
    assert.ok(!saved.includes("../../.ssh/id_rsa"));
    assert.ok(!saved.includes("127.0.0.1"));
  }
});
