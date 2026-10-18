# GUI95 plugin packages

GUI95 is available as a standalone skill, as a Claude Code plugin, and as a Codex plugin package containing that same skill. A downloadable package does not mean the plugin has been accepted into a public directory. Directory submission and approval are separate steps.

## Claude

The repository root is itself a Claude Code plugin. `.claude-plugin/plugin.json` holds the plugin metadata, and `.claude-plugin/marketplace.json` lists it in a single-plugin marketplace named `gui95`. Users install it with `/plugin marketplace add increpare/gui95` and `/plugin install gui95@gui95`. Claude Code loads the root `SKILL.md` as the plugin's only skill and copies the repository, including references and the demo, into its plugin cache. No build step is needed.

Raise `version` in `.claude-plugin/plugin.json` for each release, in step with the Codex manifest. Claude Code compares this value when users run `claude plugin update`, so changes pushed without a new version do not reach existing installations. Run `claude plugin validate . --strict` before pushing.

To list GUI95 in Anthropic's directory, submit the repository as a plugin bundle at [claude.ai/directory/manage](https://claude.ai/directory/manage), following the [submission guide](https://claude.com/docs/plugins/submit). The bundle is the repository root, so leave the plugin path empty. Listing details come from `plugin.json` and the README. Submission requires a paid Claude plan and a GitHub account connected to claude.ai with push access to the repository, which must be public before the listing goes live. Each version is validated and scanned, and a person reviews new listings.

The directory icon is `.claude-plugin/icon.png`, a 1024 px rendering of `plugin/assets/gui95.svg` at eight times its size. The directory takes the icon only the first time the plugin is saved or submitted in the portal, so push any icon change before that first save.

The automated scan holds the plugin for review on three findings. All are false positives that need no change, because the plugin runs no code:

- `UNREAD_ASSET_REFERENCED`: documentation, CSS, manifests, and scripts name the bundled fonts and PNG screenshots. Nothing executes these files; they are reference material.
- `MCP_FORWARDS_CREDENTIAL_ENV`: the scanner reads JavaScript template literals as credential environment variables. These are `${key}` in `references/vector95/src/app.js` and `canvas-dialog.js`, and `${Object.keys(...)}` in `demo/dist/desktop.js`. It also reads the SVG namespace `http://www.w3.org/2000/svg` and the demo's link to a CHI 1996 paper as remote destinations. Nothing reads the environment or sends data.
- `RUNTIME_FETCH_EXEC`: both copies of `nudge.svg` are flagged as download-and-execute commands. The icon contains no command; it is the only icon that keeps Vector95's JSON editing metadata.

The flagged archived files are hash-pinned snapshots, so leave them unchanged. Changing only the demo copies would not clear the holds, and a person reviews every new listing anyway.

## Codex build

Run `powershell -File tools/package-plugin.ps1` from the repository root, or use `pwsh -File tools/package-plugin.ps1` with PowerShell on other platforms. This creates `dist/gui95-plugin.zip`. Preserve an older output before rebuilding; the script refuses to overwrite it.

The archive contains a single plugin folder with:

- `.codex-plugin/plugin.json`: listing metadata and skill discovery path.
- `assets/`: the original GUI95 icon.
- `skills/gui95/`: the complete standalone skill, bundled references, demo, and notices.
- Root license and privacy information.

The builder checks snapshot integrity, local documentation links, listing text limits, starter-prompt limits, and referenced assets. It rejects `interface.screenshots` before creating output: OpenAI's skills-only upload validator excludes listing screenshots, which require an MCP server with custom UI. Keep example screenshots inside the skill's documentation and reference material instead. See the [submission error reference](https://developers.openai.com/plugins/deploy/submission-errors). The builder preserves the dot-directory manifest on Windows and Linux. It excludes local deployment metadata, Git history, and backups.

## Codex directory listing

The display name is **GUI95**, with the subtitle **Build Windows 95-style UIs** and the category **Developer Tools**. The description explains web and Electron use cases, supported controls, keyboard behavior, bundled dependencies, and limitations. Keywords describe the actual subject: Windows 95, retro UI, UI design, widgets, HTML, CSS, JavaScript, Electron, desktop, and accessibility.

Three starter prompts cover a settings dialog, an Electron restyle, and an interaction review. The listing links to the [interactive desktop](https://increpare.github.io/gui95/), [source repository](https://github.com/increpare/gui95), [support tracker](https://github.com/increpare/gui95/issues), and [privacy information](https://github.com/increpare/gui95/blob/master/PRIVACY.md). The package requests no additional country restrictions; platform availability still applies. Search placement and directory acceptance are controlled by the platform.

## Codex submission

Follow the [official plugin submission instructions](https://developers.openai.com/plugins/deploy/submission). Use a verified developer identity matching the publisher and upload the plugin ZIP through the skills-only/package upload flow available to your account. GUI95 has no MCP server; do not enter a demo URL as an MCP endpoint.

**Portal availability checked 18 October 2026:** The portal accepted GUI95 1.1.1 as a skills-only draft and discovered the skill, but blocked submission with "We are not accepting more skills-only submissions at this time." Upload support does not establish eligibility to publish. Recheck the portal before planning a public skills-only listing; the [plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines) reserve additional eligibility requirements for these submissions.

Review automated metadata and skill findings, correct the source package, rebuild, and upload the corrected version. Check the imported listing and publisher identity before submitting. Complete any required policy attestations after reviewing their actual wording. Publish only after approval.

The ordinary `gui95.zip` release is the direct-install skill archive. The directory upload archive is `gui95-plugin.zip`; they are different formats.

## OpenAI updates and usage feedback

The optional hosted service and its separate remote-plugin package are described in the [MCP service guide](mcp-service.md). The standalone skills-only package remains available independently.

The public OpenAI directory takes a package snapshot. Changes to bundled skills, references, listing metadata, or assets require a complete new ZIP uploaded to the existing plugin, followed by the applicable checks, review, and publication. A repository URL in the manifest identifies the source; it does not make the public listing track repository changes. Repo marketplaces are a separate distribution route. See the [submission and update instructions](https://developers.openai.com/plugins/deploy/submission).

A hosted MCP server can return current guidance or reference files through live tool calls. Updates to those results can be deployed on the server while preserving its published tool contract; tool definition changes go through MCP scans. Skills imported from an MCP server are still submission-time snapshots: changing them requires another scan and plugin version. See [MCP server review and update rules](https://developers.openai.com/plugins/deploy/app-review) and [importing skills from MCP](https://developers.openai.com/plugins/build/mcp-server#import-skills-from-the-mcp-server).

Server requests can support aggregate measurements of requested topics, errors, and response times, plus feedback that users explicitly choose to send. They do not reveal the rest of a user's conversation or prove that a generated interface worked. If adding a server, document the collected data and retention in the privacy policy, collect only what is needed, and provide a clear user-facing feedback action. An existing skills-only plugin cannot currently gain an MCP server through the update flow, so decide on the server architecture before publishing.
