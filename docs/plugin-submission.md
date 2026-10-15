# GUI95 plugin package

GUI95 is available as a standalone skill and as a plugin package containing that same skill. A downloadable package does not mean the plugin has been accepted into the public directory. Directory submission and approval are separate steps.

## Build

Run `powershell -File tools/package-plugin.ps1` from the repository root, or use `pwsh -File tools/package-plugin.ps1` with PowerShell on other platforms. This creates `dist/gui95-plugin.zip`. Preserve an older output before rebuilding; the script refuses to overwrite it.

The archive contains a single plugin folder with:

- `.codex-plugin/plugin.json`: listing metadata and skill discovery path.
- `assets/`: the original GUI95 icon and desktop screenshot.
- `skills/gui95/`: the complete standalone skill, bundled references, demo, and notices.
- Root license and privacy information.

The builder checks snapshot integrity, local documentation links, listing text limits, starter-prompt limits, and referenced assets. It preserves the dot-directory manifest on Windows and Linux. It excludes local deployment metadata, Git history, and backups.

## Directory listing

The display name is **GUI95**, with the subtitle **Build Windows 95-style UIs** and the category **Developer Tools**. The description explains web and Electron use cases, supported controls, keyboard behavior, bundled dependencies, and limitations. Keywords describe the actual subject: Windows 95, retro UI, UI design, widgets, HTML, CSS, JavaScript, Electron, desktop, and accessibility.

Three starter prompts cover a settings dialog, an Electron restyle, and an interaction review. The listing links to the [interactive desktop](https://increpare.github.io/gui95/), [source repository](https://github.com/increpare/gui95), [support tracker](https://github.com/increpare/gui95/issues), and [privacy information](https://github.com/increpare/gui95/blob/main/PRIVACY.md). The package requests no additional country restrictions; platform availability still applies. Search placement and directory acceptance are controlled by the platform.

## Submit

Follow the [official plugin submission instructions](https://developers.openai.com/plugins/deploy/submission). Use a verified developer identity matching the publisher and upload the plugin ZIP through the skills-only/package upload flow available to your account. GUI95 has no MCP server; do not enter a demo URL as an MCP endpoint.

Review automated metadata and skill findings, correct the source package, rebuild, and upload the corrected version. Check the imported listing and publisher identity before submitting. Complete any required policy attestations after reviewing their actual wording. Publish only after approval.

The ordinary `gui95.zip` release is the direct-install skill archive. The directory upload archive is `gui95-plugin.zip`; they are different formats.
