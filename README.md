# GUI95 for the Claude directory

GUI95 helps build, restyle and review Windows 95-inspired web and Electron interfaces. This edition connects to the public GUI95 reference service for current guidance, 38 independent widget templates, preserved source examples, icons, fonts, build kits, generators and verification material.

Enable the GUI95 connector when Claude asks. No GUI95 account, API key, local server or background executable is required. The skill explains which references to retrieve and how to adapt and verify them. An internet connection is required for live references; retain notices supplied with downloaded material and verify changes in the target application.

Try asking:

- Build a Windows 95-style settings dialog with tabs, keyboard navigation, and Apply/Cancel behavior.
- Restyle this Electron utility with classic gray controls, crisp bevels, and readable typography.
- Review this retro interface’s menus, focus states, disabled controls, and keyboard behavior.

## Privacy and feedback

Tool requests reach https://ded.increpare.com/gui95/mcp . Search queries and ordinary tool arguments are processed in memory; the service stores daily aggregate tool/reference/error counts without user identifiers. Those counts expire after 90 days. Generated build-kit downloads remain in a bounded memory cache for at most 15 minutes.

Feedback is sent only with the user’s authorization, stays in a private maintainer inbox and expires after 90 days. Do not send private project files, conversations, credentials or personal information. The plugin does not read environment credentials or automatically transmit local files. See [the privacy policy](PRIVACY.md).

## Full reference and offline use

The [complete GUI95 repository](https://github.com/increpare/gui95) and [offline downloads](https://github.com/increpare/gui95/releases/latest) retain the full source, demos, fonts and build tools. The original Claude Code marketplace remains available there. [Try the browser desktop](https://increpare.github.io/gui95/) or [browse live references](https://ded.increpare.com/gui95/).

## Directory packaging

The Claude directory edition is maintained in `claude-directory/` on the main source branch. Its contents are exported to the root of `codex/claude-directory`, which the existing directory submission tracks. Only its genuine Markdown, UTF-8 text, JSON and PNG icon are distributed in that branch. Source programs, fonts, SVG files, package-manager configuration and executable files stay in the full reference repository and hosted service.

The directory refused the full 1.2.3 bundle because these file types require a Verified organization. Anthropic chooses that status and currently offers no application route. Merely renaming source programs or fonts would not satisfy the rule. This edition uses the supported remote MCP plugin format instead.

When updating it, validate this folder with Claude’s plugin validator, check every file against the directory’s permitted content types, verify the public MCP tools and export the complete folder to the tracked directory branch. Preserve the source branch’s offline bundle and archived reference bytes. The directory still performs its own scan and review; local validation does not establish publication approval.

Original material by Stephen Lavelle is MIT licensed. Downloaded third-party fonts and reference material keep their separate notices. Independent project, not affiliated with or endorsed by Microsoft.
