# GUI95 build kit release

The user approved all seven proposals in this chat: independent components, local verification, original CC0 icons, app starters, structured layouts and commands, precise evidence, and repair/upgrade guidance. Deliver every category as working software, documentation, and public MCP capabilities. Build on PR #4 without changing its preserved reference bytes. The existing private feedback contract and state directory remain compatible.

## Product and boundaries

Publish one versioned build kit used by downloadable bundles, a local CLI, and bounded MCP tools. Vanilla JavaScript and semantic HTML are the initial supported component API. Three starters cover a utility, document editor, and list/detail workspace, each with browser and Electron entry points. Generated artifacts are inspectable file manifests with hashes and a downloadable ZIP. Remote generation accepts bounded structured fields; it never executes consumer code. Browser verification runs locally against an explicit URL and writes a JSON report plus screenshots.

## Components and verification

Implement scoped Windows 95 CSS and menus, native dialogs, splitters, trees, toolbars, and numeric controls. Export `enhance(root = document)` from `kit/components/gui95.mjs`, plus documented focused APIs. The declarative enhancement convention uses `data-gui95-*` attributes. A gallery exercises all states and includes meaningful browser regression cases for input ownership, stationary-pointer menu opening, dialog close/reopen and restored focus, tree expansion, splitter keyboard operation, numeric bounds, and long/narrow layouts. Local verification distinguishes observed failures, automatic assertions, screenshots needing review, and unsupported/native-host checks. Test device scales 1, 1.25, 1.5, and 2 without claiming native OS coverage from Chromium screenshots.

## Icons

Create original geometric artwork, not copies of Microsoft icons or third-party packs. Dedicate these new icon sources to CC0 and preserve other material's existing licenses. Supply at least 80 stable semantic names, small and large compositions, SVG/PNG exports, normal/selected/disabled rendering, document-badge composition, provenance and hashes, and an HTML contact sheet. Reuse the repository's tested rasterizer when possible. Do not silently substitute an unrelated icon for an unknown semantic name.

## Generators and starters

`kit/generators/layout.mjs` exports `generateLayout(spec)` returning `{ files: [{path, text}], warnings }` for `properties`, `preferences`, `inspector`, and `editor` layouts. The bounded schema includes title, labelled fields, groups, actions, and sizing; strings must be escaped in HTML and JavaScript contexts. Export command-registry functionality from `kit/generators/commands.mjs`: shared commands drive menus, toolbars, shortcuts, tooltips, and status help; duplicate IDs, shortcuts and mnemonic conflicts produce actionable diagnostics. Keyboard dispatch respects editable/interactive targets and repeat policy.

`kit/generators/starters.mjs` exports `generateStarter({template, name, id})` with the same file-manifest return shape. Include usable browser and secure Electron entry points, narrow IPC, context isolation and sandboxing, native open/save with error handling, preferences, and standard packaging integration. Use the shared `components/gui95.mjs` and CSS inside each artifact. Include app manifests and locked/reproducible dependencies or exact version requirements, meaningful start/build/test instructions, and honest platform verification scope.

## Evidence, repairs and upgrades

`kit/evidence/catalog.mjs` exports `listEvidence({query, topic, limit})`, `getEvidence(id)`, `findRepairs({query, component, version})`, and `checkUpdates(manifest)` using curated checked-in evidence data. Each evidence item includes exact supported claim, source kind, official URL/section or historical edition/page, checked date, applicability and limitations. Cite historical Windows material, W3C interaction patterns, Electron and browser documentation separately. Local citations resolve to served content with path/line/hash identity rather than assuming archived bytes match an upstream commit. Repairs include symptoms, causes, fixes and executable check names. Component versions and a consumer manifest make upgrade results deterministic; newer/unknown versions cannot be represented as verified compatible.

## MCP and packaging

Extend the service with tools to discover the kit, retrieve components/icons/evidence/repairs, generate layouts/starters, and check a consumer manifest. Reuse a focused registry module instead of growing server.mjs indefinitely. Keep result size and inputs bounded. File results include path, UTF-8 text or base64 binary data, byte counts, MIME types and SHA-256 values. Publish a full kit ZIP and per-request reproducible artifact IDs/download URLs with private arguments held only in bounded expiring memory; do not persist generation inputs, snippets, project manifests or search queries. Existing feedback remains the only user-authorized persistent report operation. Artifact downloads are read-only generated output, never executable server jobs. Route all public paths under /gui95/ through the current Caddy route.

Fix cross-platform packaging by excluding AppleDouble and macOS xattrs from archives. Package kit runtime files alongside the service and kit CLI/helpers in the public archive; verify extracted-bundle behavior before deployment. Retain startup state separately and preserve the old release/unit for rollback.

## Acceptance and delivery

Run the existing service/helper suite and new unit, real browser, real MCP client and extracted-archive checks. Verify original snapshot hashes. Review implementation for contract coverage and code quality. Commit on codex/gui95-build-kit, publish a draft PR that identifies its dependency on PR #4, deploy the new tested release through the already-authorized SSH path, and verify public discovery, generated downloads, citations and existing search/feedback behavior. Record runtime and browser versions with verification dates. OpenAI portal publication and legal attestations remain separate actions.
