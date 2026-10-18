import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createHash } from 'node:crypto';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = new URL(process.argv[2]);
if (!["http:", "https:"].includes(endpoint.protocol)) throw new Error("Pass the HTTP(S) MCP endpoint.");
const client = new Client({ name: "gui95-deployment-check", version: "1.0.0" });
try {
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ['get_gui95_asset','get_gui95_widget','list_gui95_materials','read_gui95_reference','search_gui95','submit_gui95_feedback']);
  const search = await client.callTool({ name: "search_gui95", arguments: { query: "menu keyboard focus", limit: 2 } });
  assert.ok(search.structuredContent?.results.length);
  const read = await client.callTool({ name: "read_gui95_reference", arguments: { path: "docs/widgets.md", line_count: 5 } });
  assert.ok(read.structuredContent?.text.includes("Widget catalogue"));
  const listing=await client.callTool({name:'list_gui95_materials',arguments:{kind:'widget',limit:100}});
  assert.ok(listing.structuredContent.total>=38);
  const widget=await client.callTool({name:'get_gui95_widget',arguments:{widget_id:'combobox'}});
  const template=widget.structuredContent.template;
  assert.ok(template.code.includes('aria-activedescendant'));
  assert.equal(createHash('sha256').update(template.code).digest('hex'),template.sha256);
  const icon=await client.callTool({name:'get_gui95_asset',arguments:{path:'demo/dist/assets/icons/save.svg'}});
  assert.ok(Buffer.from(icon.structuredContent.data,'base64').toString().includes('<svg'));
  const preview=await fetch(template.preview_url);assert.equal(preview.status,200);assert.ok((await preview.text()).includes('aria-activedescendant'));
  const download=await fetch(template.download_url);assert.equal(createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'),template.sha256);
  const output = { endpoint: endpoint.href, tools: tools.tools.length, references: "passed",widgets:listing.structuredContent.total,complete_template:'passed',asset:'passed',preview:'passed',download:'passed', content_revision: read.structuredContent.content_revision };
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
