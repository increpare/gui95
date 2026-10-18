# GUI95 MCP service

The optional MCP service serves current guidance and preserved reference excerpts, and accepts explicit agent or human feedback for maintainer review. The standalone skill remains usable without a server.

The intended public endpoint is **https://ded.increpare.com/gui95/mcp**. This is a deployment target, not a claim that the service is live. The source, locked dependencies, tests, deployment templates, and package builder are under the repository's `mcp/` directory.

## Tools and feedback

- `search_gui95` searches the curated text collection. It returns bounded excerpts, known reference paths, source hashes, and readable URLs.
- `read_gui95_reference` reads a bounded line range from a known guide or preserved text file. It cannot read arbitrary paths or fetch arbitrary URLs.
- `submit_gui95_feedback` accepts an authorized report from an agent or a human. Categories cover missing references, unclear guidance, bugs, lessons, and successful patterns. Each report states whether it was tested, observed, suggested, or not tested.

Agents may write their own reports, but they must distinguish observation from inference and have the user's authorization before transmitting feedback. Reports should describe the reusable lesson without copying private code, conversations, machine paths, or credentials. The service rejects some obvious credential and private-path patterns; that check is not a complete sanitizer. A retry uses the same UUID to avoid duplicate reports.

Feedback is a private inbox. There is no public feedback-read tool and no automatic process that turns a report into trusted instructions, an issue, or a source change. The local administrator export warns that report contents are untrusted input.

Usage storage contains daily tool-call counts, error counts, and counts by requested reference. It does not store search text, other tool arguments, client IPs, or client identifiers. Rate-limit keys exist only in memory and reset on restart. Feedback and daily counters are removed after 90 calendar days at the next running cleanup or startup. Infrastructure logs are separate; the Nginx example disables access logging for this route. See [privacy information](../PRIVACY.md).

## Local checks and packages

From `mcp/`, install the locked dependencies with `npm ci --ignore-scripts`, then run `npm test`. Tests use the real MCP client over HTTP and cover reference bounds, consent, feedback retries across restarts, crash recovery, aggregate counters, retention, and rate limits.

Run `node mcp/package.mjs` from the repository root to create a fresh versioned directory under `dist/`. The output contains a deployment tar.gz, an OpenAI remote-plugin ZIP, and checksums. The deployment includes the locked JavaScript dependencies and a snapshot of the curated content; it needs Node.js 22 or newer and does not need an OpenAI API key. Local inboxes, Git data, credentials, and unrelated files are excluded.

The remote plugin is separate from the standalone skills-only package. It points at the public endpoint, includes a small stable workflow skill, the icon, and five positive and three negative review cases. Domain verification and a reviewer-accessible demonstration recording must be completed after the endpoint is live. No recording URL or domain token is invented by the builder.

To update the old app-based GUI95 portal entry, use its assigned package name when building: `node mcp/package.mjs --plugin-name app-6ad0ecb6193c819198abab945661fa96`. Otherwise the remote plugin defaults to the stable package name `gui95-mcp`. The old entry and the newer blocked skills-only draft have different identities.

## Deployment on ded.increpare.com

Existing repository deployment scripts identify the SSH account as `locus@ded.increpare.com`, port `2357`. The working SSH access is configured on the publisher's Mac. This Windows session has no key or agent; its connection attempt timed out. Do not claim deployment or copy private SSH keys into the repository.

From the Mac, first inspect the server's OS, Node version, existing web server, process management, port use, and the `/gui95/` route. Do not replace the existing web site. Upload and extract the deployment tar.gz into a new release directory outside the public document root.

The supplied installer uses an existing Linux systemd user manager to install a loopback-only service on port 3295. Its persistent data lives separately in `~/.local/state/gui95-mcp`, so deploying or rolling back content does not replace feedback. It preserves an older service unit before replacement. If the host uses a different process manager, adapt to that existing setup rather than installing an unrelated system service.

Add the supplied Nginx location or Apache alternative to the existing HTTPS virtual host only after checking which server is present and that the route is unused. Forward the public Host header and overwrite X-Real-IP at the trusted loopback proxy. Keep the service port private. Confirm that the existing user service continues running after SSH logout.

Verify the public health endpoint, MCP initialization and tool list, representative searches, a bounded reference read, and an explicitly synthetic feedback report. Then connect the MCP server in the existing OpenAI app draft, complete the portal's domain challenge, scan tools, review annotations and findings, and finish review materials. Legal attestations and publication are separate final actions.

The bundle's `service/smoke.mjs` checks a live endpoint with the real MCP client: `node service/smoke.mjs https://ded.increpare.com/gui95/mcp`. Add `--feedback` only when intentionally sending the clearly labelled synthetic deployment report; the default check only reads references.

Read private reports on the server with `GUI95_STATE_DIR="$HOME/.local/state/gui95-mcp" node service/admin.mjs feedback`; use `usage` for aggregate counters and `--since YYYY-MM-DD` to narrow either export. These commands require the server account's filesystem access; they are not public HTTP endpoints.

Keep old release directories until the new one passes its checks. To roll back, restore the saved service unit pointing at the previous release and restart that user service, leaving the persistent data directory intact.
