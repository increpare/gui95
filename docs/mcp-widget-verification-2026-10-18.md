# Complete GUI95 MCP reference verification

Verified 18 October 2026. The [service guide](mcp-service.md) documents the six tools and public inventory. This update makes the independent examples, guidance, app source, delivery/icon tooling, verification and reusable assets available to connected agents. It does not establish that the public deployment is live.

## Service and retrieval

The 16 Node tests pass, including real MCP clients over HTTP. They cover all 38 template descriptors and their complete code/hash, discovery by each widget title and common control names, inventory pagination, all current asset bytes and notices, source pagination across long lines, new nested public docs, excluded private paths, symlink rejection, missing templates and archived hash failures. Existing feedback authorization, retry/recovery, retention, counters and rate-limit checks remain passing.

The inventory contains all 109 preserved snapshot files, including CommonJS Electron code, icons, screenshots and font bytes. The server and deployment packager use the same inventory. A package also requires the generated-widget check to pass, and its copied content revision must match the source inventory. The updated deployment smoke check exercises all six tools, complete template retrieval, an SVG, a working preview and a byte-exact download without submitting feedback by default.

## Browser previews

On Windows, headless Edge 155.0.4283.45 with Playwright 1.64.1 passed **45/45 checks through the MCP HTTP preview routes**. All 38 examples loaded; all fit wide/narrow viewports at browser device scale factors 1, 1.25, 1.5 and 2. Larger text, narrow open dialogs, keyboard navigation, menu dismissal, Apply/Cancel transactions, file reads/downloads, and other behavior checks passed. External requests were blocked while the service’s preview resources remained available.

The full desktop initialized without uncaught errors, its regular System95 font loaded through the sandbox’s cross-origin font request, and an editable combo box worked inside the gallery’s nested preview. Preview response headers isolate scripts from MCP/feedback connections; download tests verified the original byte hash. The [widget QA](../examples/widgets/QA.md) records the original offline checks and their limits. The browser runner can target a service with GUI95_EXAMPLE_BASE_URL as described in [its guide](../examples/widgets/README.md).

No actual print job was sent. Native Win32 widgets, screen readers, actual Windows DPI settings, production Electron chrome, durable persistence, Firefox and WebKit were not certified. Historical publications remain external reading pointers, and audit proposals remain labeled as proposals.

## Release checks

The generated-output and reference-hash/link checks pass. Deployment packaging and the extracted bundle are checked separately so a working source checkout cannot hide omitted content. Detailed local browser reports and screenshots are under the ignored `.codex_tmp/mcp-widget-preview-qa/` directory; they are not private project evidence and are not represented as a public-server test.
