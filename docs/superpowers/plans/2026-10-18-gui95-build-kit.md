# GUI95 build kit implementation plan

> **For agentic workers:** Use superpowers:dispatching-parallel-agents for the independent domains below and superpowers:test-driven-development for behavior changes. Review specification coverage and code quality before release.

**Goal:** Deliver all seven approved build-kit features through maintained local artifacts and the hosted GUI95 MCP service.

**Architecture:** A portable kit owns components, icons, generators and curated evidence. Thin service adapters discover and distribute that same code; a local Playwright runner verifies consumer UIs. Shared file manifests carry stable paths, bytes, hashes and licenses.

**Tech Stack:** JavaScript ES modules, semantic HTML/CSS, Node.js built-ins, the existing locked MCP SDK and Zod, Playwright for local Chromium checks.

## Independent domains

- [x] Components: create `kit/components/gui95.mjs`, `gui95.css`, `gallery.html`, `README.md`, `kit/verify/runner.mjs`, browser fixtures and tests. Define `enhance(root=document)` and publish declarative markup to the generator implementer. First assert keyboard/pointer/dialog behavior against an unimplemented module, then implement and run the real browser suite. Verify screenshots at four scales.
- [x] Assets/generation: create `kit/icons/`, `kit/generators/{commands,layout,starters}.mjs` and domain tests. Assert at least 80 distinct semantic icons, correct pixel exports/state variants, escaping and bounded schemas, conflict diagnostics, generated editor/browser utility behavior, and Electron's narrow bridge. Implement from failing cases. Reuse icon/app helpers unchanged and run generated source with real browser checks.
- [x] Evidence: create `kit/evidence/{catalog.mjs,sources.json,repairs.json,releases.json}` and tests. Verify primary sources through their official documents; model claims, editions, anchors, checked dates, scope and repair regressions explicitly. Test unsupported versions and local evidence resolution.

## Integration work

- [x] Add failing `mcp/test/kit.test.mjs` cases for discovery, per-component files, semantic icons, generators, evidence, repairs, updates, invalid input, expiring bounded artifacts, and ZIP integrity. Keep legacy real-client tests while expanding their expected tool set.
- [x] Implement `mcp/kit.mjs` for kit inventory/file loading, file manifests, ZIP output, bounded in-memory artifact retention, and metadata. Implement `mcp/kit-tools.mjs` for typed MCP registration. Wire both from `server.mjs`; preserve the existing request/feedback handling.
- [x] Add `kit/cli.mjs` commands for inventory, component/icon extraction, layout/starter generation, evidence, repair, update and verification. Validate before writing and refuse overwriting existing output. Package shared component assets and helper scripts into generated app projects.
- [x] Update `mcp/package.mjs`, plugin workflow, root skill/docs and service smoke checks. Exclude OS metadata in the archive process itself and test tar extraction through a fresh content root. Add Caddy deployment documentation and annotate real platform verification limits.
- [x] Run the whole Node suite, browser suite, generated-project checks, snapshot integrity and full extracted deployment. Review the diff against all seven requirements and resolve issues before committing.
- [x] Push the feature branch and create/attach a draft PR based on PR #4's branch. Build from the committed revision, upload to a fresh private release directory, install via the existing user-service script, verify local and public endpoints, artifacts, content hashes, private state and rollback paths.

## API checks

```js
const generated = generateLayout({ type: 'properties', title: 'Properties', fields: [{ id: 'name', label: 'Name', type: 'text' }] });
assert.ok(generated.files.some(file => file.path.endsWith('.html')));
assert.throws(() => generateStarter({ template: 'unknown', name: 'Example', id: 'example' }));
assert.ok(listEvidence({ query: 'dialog focus', limit: 3 }).length);
assert.ok(findRepairs({ query: 'stationary pointer' }).length);
```

For each integration cycle, run `node --test mcp/test/*.test.mjs kit/test/*.test.mjs tools/test/*.test.mjs` and the kit's documented browser command. Inspect the actual assertion failure before implementing each behavior. CLI and artifact tests must extract real generated files, parse every manifest, verify SHA-256 values and exercise browser entry points. Assertions on source strings alone do not establish runtime behavior.
