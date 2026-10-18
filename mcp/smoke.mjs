import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = new URL(process.argv[2]);
if (!["http:", "https:"].includes(endpoint.protocol)) throw new Error("Pass the HTTP(S) MCP endpoint.");
const client = new Client({ name: "gui95-deployment-check", version: "1.0.0" });
try {
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ["read_gui95_reference", "search_gui95", "submit_gui95_feedback"]);
  const search = await client.callTool({ name: "search_gui95", arguments: { query: "menu keyboard focus", limit: 2 } });
  assert.ok(search.structuredContent?.results.length);
  const read = await client.callTool({ name: "read_gui95_reference", arguments: { path: "docs/widgets.md", line_count: 5 } });
  assert.ok(read.structuredContent?.text.includes("Widget catalogue"));
  const output = { endpoint: endpoint.href, tools: tools.tools.length, references: "passed", content_revision: read.structuredContent.content_revision };
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
