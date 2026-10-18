import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = new URL(process.argv[2]);
if (!["http:", "https:"].includes(endpoint.protocol)) throw new Error("Pass the HTTP(S) MCP endpoint.");
const client = new Client({ name: "gui95-deployment-check", version: "1.0.0" });
try {
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ["check_gui95_updates", "generate_gui95_layout", "generate_gui95_starter", "get_gui95_asset", "get_gui95_component", "get_gui95_evidence", "get_gui95_icons", "get_gui95_repairs", "get_gui95_widget", "list_gui95_kits", "list_gui95_materials", "read_gui95_reference", "search_gui95", "submit_gui95_feedback"]);
  const search = await client.callTool({ name: "search_gui95", arguments: { query: "menu keyboard focus", limit: 2 } });
  assert.ok(search.structuredContent?.results.length);
  const read = await client.callTool({ name: "read_gui95_reference", arguments: { path: "docs/widgets.md", line_count: 5 } });
  assert.ok(read.structuredContent?.text.includes("Widget catalogue"));
  const output = { endpoint: endpoint.href, tools: tools.tools.length, references: "passed", content_revision: read.structuredContent.content_revision };
  const invoke = async (name, args = {}) => {
    const response = await client.callTool({ name, arguments: args });
    assert.notEqual(response.isError, true, JSON.stringify(response));
    return response.structuredContent;
  };
  const inventory = await invoke("list_gui95_kits");
  assert.equal(inventory.components.length, 6);
  const component = await invoke("get_gui95_component", { component: "menu" });
  const download = new URL(component.artifact.url);
  download.host = endpoint.host;
  download.protocol = endpoint.protocol;
  const response = await fetch(download);
  assert.equal(response.status, 200);
  const archive = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash("sha256").update(archive).digest("hex"), component.artifact.sha256);
  const icons = await invoke("get_gui95_icons", { query: "save", limit: 2 });
  assert.ok(icons.icons.length);
  const icon = await invoke("get_gui95_icons", { name: icons.icons[0].name, format: "svg", size: 16 });
  assert.equal(icon.icon.license, "CC0-1.0");
  const layout = await invoke("generate_gui95_layout", { type: "properties", title: "Synthetic deployment layout", fields: [{ id: "name", label: "Name", type: "text" }] });
  assert.ok(layout.files.some(file => file.path.endsWith(".html")));
  const starter = await invoke("generate_gui95_starter", { template: "utility", name: "Synthetic Check", id: "synthetic-check" });
  assert.ok(starter.files.some(file => file.path === "package.json"));
  const evidence = await invoke("get_gui95_evidence", { query: "dialog", limit: 3 });
  assert.ok(evidence.items.length);
  const repairs = await invoke("get_gui95_repairs", { query: "pointer" });
  assert.ok(repairs.items.length);
  const updates = await invoke("check_gui95_updates", { manifest: { schema_version: 1, components: { menu: "1.0.0" } } });
  assert.equal(updates.components[0].status, "current");
  output.build_kit = { version: inventory.kit_version, components: inventory.components.length, artifact_hash: "verified", icons: "CC0 SVG passed", layout: "passed", starter: "passed", evidence: "passed", repairs: "passed", updates: "passed" };
  const listing=await client.callTool({name:'list_gui95_materials',arguments:{kind:'widget',limit:100}});
  assert.ok(listing.structuredContent.total>=38);
  const widget=await client.callTool({name:'get_gui95_widget',arguments:{widget_id:'combobox'}});
  const template=widget.structuredContent.template;
  assert.ok(template.code.includes('aria-activedescendant'));
  assert.equal(createHash('sha256').update(template.code).digest('hex'),template.sha256);
  const asset=await client.callTool({name:'get_gui95_asset',arguments:{path:'demo/dist/assets/icons/save.svg'}});
  assert.ok(Buffer.from(asset.structuredContent.data,'base64').toString().includes('<svg'));
  const preview=await fetch(template.preview_url);assert.equal(preview.status,200);assert.ok((await preview.text()).includes('aria-activedescendant'));
  const assetDownload=await fetch(template.download_url);assert.equal(createHash('sha256').update(Buffer.from(await assetDownload.arrayBuffer())).digest('hex'),template.sha256);
  Object.assign(output, { widgets:listing.structuredContent.total, complete_template:'passed', asset:'passed', preview:'passed', download:'passed' });
  if (process.argv.includes("--feedback")) {
    const feedback = await client.callTool({ name: "submit_gui95_feedback", arguments: {
      consent: true, client_report_id: randomUUID(), source: "agent", category: "worked_well",
      summary: "Synthetic deployment check: reference search and bounded reads completed successfully.",
      verification: "tested", evidence: "This is a synthetic service deployment test, not feedback from a real GUI95 project."
    } });
    assert.equal(feedback.structuredContent?.status, "received");
    output.synthetic_feedback_receipt = feedback.structuredContent.id;
  }
  console.log(JSON.stringify(output, null, 2));
} finally {
  await client.close();
}
