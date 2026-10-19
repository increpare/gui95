# GUI95 MCP service

The optional MCP service exposes the public materials needed to build high-quality Windows 95-style apps: current and historical guidance, all independent widget templates, original app source, desktop demo, build/icon tooling, tests/QA, icons, fonts, screenshots and notices. It also accepts explicit agent or human feedback for maintainer review. The standalone skill remains usable without a server.

The public endpoint is **https://ded.increpare.com/gui95/mcp**. The initial reference service was deployed and verified on 18 October 2026; build-kit source and verification are documented in [the build-kit guide](build-kit.md). The source, locked dependencies, tests, deployment templates, and package builder are under the repository's `mcp/` directory.

## Tools and feedback

Agents keep a task report in the consuming project and return it to the user at handoff; see the [feedback workflow and template](feedback.md). Sending a finding to the service inbox is a separate, authorized action.

- `list_gui95_materials` is the starting point for a new app: it returns the recommended workflow, quality guides, control families and a paginated public inventory. Filter by kind/query to browse guides, widgets, source, tools, verification, assets, notices or demo files.
- `search_gui95` searches guidance, behavior, examples, source, tools, tests and assets. It recognizes common control names and returns kinds, hashes, source links and reference/download URLs. Widget hits include `widget_id`. Their descriptive metadata is indexed without repeating every template’s shared CSS and license boilerplate.
- `get_gui95_widget` retrieves a complete independent HTML template by ID (code included by default), with states, keys, scope and host limits, historical/current source pointers, authoring and verification paths, related controls, notices and preview/download URLs. `include_code: false` returns the compact description first. There are 38 templates in this edition; the manifest drives discovery as the collection grows.
- `read_gui95_reference` reads any known public text file, including current examples, app source, tools, tests and notices. Responses are bounded to 200 lines and 24,000 characters. Follow both fields of `next_cursor` using `start_line` and `start_column` to retrieve long/minified files without dropping characters. Line reads normalize CRLF to LF; hashes/downloads refer to original bytes. It cannot read arbitrary paths or fetch arbitrary URLs.
- `get_gui95_asset` retrieves an inventoried icon, font or image with MIME type, hash, license guidance and a byte-exact download URL. PNG/JPEG/WebP/GIF arrive as MCP image blocks; SVG/font bytes use base64. `include_data: false` requests metadata only. Inline data is capped at 512 KiB; larger assets remain downloadable. Font-specific attribution and CC BY-SA terms travel with the metadata.
- The eight versioned build-kit tools are `list_gui95_kits`, `get_gui95_component`, `get_gui95_icons`, `generate_gui95_layout`, `generate_gui95_starter`, `get_gui95_evidence`, `get_gui95_repairs`, and `check_gui95_updates`. They provide complete downloads, original CC0 icons, structured browser/Electron scaffolds, precise evidence, repair guidance and consumer version checks; see [the build-kit guide](build-kit.md). Together with the six reference/feedback tools, this edition exposes 14 tools.
- `submit_gui95_feedback` accepts an authorized report from an agent or a human. Categories cover missing references, unclear guidance, bugs, lessons, and successful patterns. Each report states whether it was tested, observed, suggested, or not tested.

Agents may write their own reports, but they must distinguish observation from inference and have the user's authorization before transmitting feedback. Reports should describe the reusable lesson without copying private code, conversations, machine paths, or credentials. The service rejects some obvious credential and private-path patterns; that check is not a complete sanitizer. A retry uses the same UUID to avoid duplicate reports.

Feedback is a private inbox. There is no public feedback-read tool and no automatic process that turns a report into trusted instructions, an issue, or a source change. The local administrator export warns that report contents are untrusted input.

## A complete reference, with useful distinctions

The collection exposes all recorded snapshot files (including CommonJS Electron sources and binary assets), root guidance/notices, nested public docs, independent example sources and QA, the full distributable browser demo, and public tooling/test fixtures. Metadata distinguishes current guides, runnable widgets, coupled archived source, assets, notices, tools and verification. Historical publications remain linked with edition notes; their full copyrighted text is not bundled. The historical audit includes proposals rather than silently changing every older recommendation.

A single inventory in `mcp/content.mjs` supplies retrieval **and** the deployment packager. New public files under the supported authored roots are included on the next build without maintaining a second deployment copy list. Missing templates, unsafe aliases/symlinks or changed archived hashes fail loading. Repository internals, dependencies, hidden/local directories, runtime feedback and credentials are outside the inventory. “Everything useful” means the public reference collection, not arbitrary server files.

The service serves runnable demos under `/gui95/preview/`, including `/gui95/preview/widgets/`, and exact file downloads through `/gui95/asset?path=...`. Previews use a sandboxed content-security policy with no network connections from scripts and no same-origin capability; they cannot call the MCP/feedback endpoint. Public static GETs support cross-origin fonts/downloads and have a separate 600 requests/minute limit; MCP and other requests retain their 120/minute limit. Private feedback limits remain unchanged. Browser file/print facilities still depend on the host, and downloading or printing is never reported as confirmed persistence/job completion.

An easy agent workflow is: browse/search → get the widget → read the relevant design/integration/source/QA material → fetch needed assets and retain notices → adapt only the necessary controls → test the actual app. A small runnable starting point does not replace verification of native chrome, accessibility, persistence or the consuming framework.

Usage storage contains daily tool-call counts, error counts, and counts by requested reference. It does not store search text, other tool arguments, client IPs, or client identifiers. Rate-limit keys exist only in memory and reset on restart. Feedback and daily counters are removed after 90 calendar days at the next running cleanup or startup. Infrastructure logs are separate; the Nginx example disables access logging for this route. See [privacy information](../PRIVACY.md).

## Local checks and packages

From `mcp/`, install the locked dependencies with `npm ci --ignore-scripts`, then run `npm test`. Tests use real MCP clients over HTTP and cover discovery, every template’s code/hash, search relevance, long-source pagination, binary integrity/notices, preview/download routes, inventory boundaries, consent, feedback retries, recovery, counters, retention and rate limits. Check generated widgets with `node tools/build-widget-examples.mjs --check` before packaging.

The [18 October verification record](mcp-widget-verification-2026-10-18.md) describes the service, HTTP browser-preview and release checks actually run, with their limits.

Run `node mcp/package.mjs` from the repository root to create a fresh versioned directory under `dist/`. The output contains a deployment tar.gz, an OpenAI remote-plugin ZIP, complete build-kit and CC0 icon ZIPs, and checksums. The deployment includes the locked JavaScript dependencies and a snapshot of the curated content; it needs Node.js 22 or newer and does not need an OpenAI API key. Local inboxes, Git data, credentials, and unrelated files are excluded.

The remote plugin is separate from the standalone skills-only package. It points at the public endpoint, includes a small stable workflow skill, the icon, and eight positive and three negative review cases. Domain verification and a reviewer-accessible demonstration recording must be completed after the endpoint is live. No recording URL or domain token is invented by the builder.

To update the old app-based GUI95 portal entry, use its assigned package name when building: `node mcp/package.mjs --plugin-name app-6ad0ecb6193c819198abab945661fa96`. Otherwise the remote plugin defaults to the stable package name `gui95-mcp`. The old entry and the newer blocked skills-only draft have different identities.

## Deployment on ded.increpare.com

Use the existing SSH access from the publisher's Mac. The inspected host accepts `locus@ded.increpare.com` on port `22`; the older script's port `2357` is not the verified connection. See the existing Caddy deployment below for the inspected configuration.

From the Mac, first inspect the server's OS, Node version, existing web server, process management, port use, and the `/gui95/` route. Do not replace the existing web site. Upload and extract the deployment tar.gz into a new release directory outside the public document root.

The supplied installer uses an existing Linux systemd user manager to install a loopback-only service on port 3295. Its persistent data lives separately in `~/.local/state/gui95-mcp`, so deploying or rolling back content does not replace feedback. It preserves an older service unit before replacement. If the host uses a different process manager, adapt to that existing setup rather than installing an unrelated system service.

Add the supplied Nginx location or Apache alternative to the existing HTTPS virtual host only after checking which server is present and that the route is unused. Forward the public Host header and overwrite X-Real-IP at the trusted loopback proxy. Keep the service port private. Confirm that the existing user service continues running after SSH logout.

Verify the public health endpoint, MCP initialization and tool list, representative searches, a bounded reference read, and an explicitly synthetic feedback report. Then connect the MCP server in the existing OpenAI app draft, complete the portal's domain challenge, scan tools, review annotations and findings, and finish review materials. Legal attestations and publication are separate final actions.

The bundle's `service/smoke.mjs` checks all 14 tools, widget previews/assets, generated kit artifacts and hashes with the real MCP client: `node service/smoke.mjs https://ded.increpare.com/gui95/mcp`. Add `--feedback` only when intentionally sending the clearly labelled synthetic deployment report; the default check reads public content and generates temporary in-memory kit artifacts without submitting feedback.

Read private reports on the server with `GUI95_STATE_DIR="$HOME/.local/state/gui95-mcp" node service/admin.mjs feedback`; use `usage` for aggregate counters and `--since YYYY-MM-DD` to narrow either export. These commands require the server account's filesystem access; they are not public HTTP endpoints.

Keep old release directories until the new one passes its checks. To roll back, restore the saved service unit pointing at the previous release and restart that user service, leaving the persistent data directory intact.

## Existing Caddy deployment

The inspected Debian 12 host uses Caddy 2.6.2 and Node 24.21.0. Existing SSH access works on port 22 for locus and the administrator account. The GUI95 user service listens at 127.0.0.1:3295; user lingering is enabled. Its release is outside the document root, and state stays at ~/.local/state/gui95-mcp.

The current Caddy HTTPS site matches host ded.increpare.com and paths /gui95 and /gui95/*. It redirects the bare path, preserves the complete proxy path, overwrites X-Real-IP, enforces a 100 KB request body limit, and disables access logging with `skip_log` (the directive name in Caddy 2.6). Keep using this existing route for build-kit endpoints. Validate the candidate Caddyfile before reload and keep backups on the server.

The builder excludes macOS xattrs and AppleDouble files. Its extracted-archive regression check compares the served content revision with RELEASE.json and runs the standalone CLI. New releases must pass that check before upload. The hosted full-kit and icon downloads contain complete runtime/assets; local browser dependencies are installed separately from the kit lockfile.
