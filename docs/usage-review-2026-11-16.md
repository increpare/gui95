# GUI95 usage review — 16 November 2026

## Scope and evidence

Reviewed local consumer history and feedback from **8 to 16 November 2026**, after the previous harvest at `b322cec`. Three consumers changed in that week: a dictionary reader (Electron desktop app with a phone view), a 3D level editor with a multi-document workspace, and an offline puzzle workbench. Together they left about 48 `GUI95:` trailers and 15 feedback reports. A music generator also had many commits, but none changed its interface. One more consumer has an uncommitted, older copy of a shared delivery helper. Repository-specific evidence stays in a local audit outside the public skill and MCP inventory.

This is a source and report review. Consumers' timings, memory figures and pass counts come from their own reports and were not reproduced here. Committed work was distinguished from uncommitted work. No consumer checkout or archived reference was modified.

The dictionary's final UX-pass report was read in full. Its open question was whether only the selected first tab should sit flush with the left edge of the panel. The [Wine source](https://gitlab.winehq.org/wine/wine/-/blob/master/dlls/comctl32/tab.c) suggests a more general rule, which is now in the lessons: every selected tab grows 2px each side. Its proposed running-header lesson was adopted.

## Kit changes (in source, not yet released)

Two consumers independently hit one kit bug. The generic pressed rule set fixed padding on every button in the scope, so pressed menu headings, toolbar buttons, caption buttons, menu items and tabs changed size. The current `kit/components/gui95.css`:

1. Takes push-button padding from `--gui95-pad-y` and `--gui95-pad-x`, and gives pressed buttons and open menu headings a one-pixel offset inside the same box. Menu items and `role="tab"` buttons no longer sink. Caption buttons in `.title-bar` now use a 12px line height with 1px vertical padding, so they stay 14px high when pressed.
2. Includes the scope root in the `border-box` reset. This was a workaround listed as open on 8 November.
3. Draws the menu check and option marks with escaped code points and empty alternative text (`content: "\2713" / ""`). They stay out of the computed accessible name in Chromium, and they no longer depend on the page declaring UTF-8. This was the other open workaround from 8 November.

Three new browser tests cover these: each control family's bounds when resting, pressed and open; the root's border-box size; and Chromium's computed accessible names for checked and radio menu items. Each new test fails against the 1.0.0 stylesheet. The [kit README](../kit/components/README.md) documents the padding variables. The kit version, `verification.json` and the published packages are unchanged: these changes need a version bump, a fresh gallery verification and a release before consumers can download them.

## Guidance added

- [Recent integration lessons](recent-integration-lessons.md#lessons-from-8-to-16-november): pressed geometry; selected-tab geometry and the painted panel edge; remembered tab choices with automatic fallback; long result lists (windowed mounting, logical scroll anchors, shared in-flight lookups, flat rows, compact cues); one name per command and category; quieter status bars; non-link semantic colour; type-to-search and activation select-all; held real-time keys; running headers; reader font inheritance; persistence echoes; splitter restoration; `overflow: clip` for multi-document workspaces; selection, drag and animation ownership; and verification of held and intermediate states.
- [Desktop delivery](desktop-delivery.md#lessons-from-november-2026-consumers): awaited close handshakes for final saves, local crash capture, non-blocking optional accelerators, native-helper smoke tests, macOS `roundedCorners` and bundle naming, `realpathSync.native`, consistent output roots and snapshots, versioned worker URLs, transfer of ignored assets, `.gitattributes` for hash-checked text, and recopying shared helpers unchanged.

## Qualifications and proposals not adopted

- The selected middle tab's 2px overlap of its neighbours comes from Wine's compatibility reimplementation, not Microsoft's code or a period screenshot. The lessons say so. The standalone [tabs widget](../demo/dist/widgets/tabs.html) has not been changed to this geometry.
- Several trailers were app-specific and left out: thumbnail fitting to projected vertices, positional field order in a level format, keeping recognisable source assets, the default preview camera, and keeping authored history text after a native reload.
- Dictionary-specific findings stay with the dictionary: formatting of sources, grouping across languages, and gloss extraction. One general point, that a merged result must not claim two records mean the same thing, was not needed as a separate GUI95 rule.
- Wrapping `requestAnimationFrame` to keep its `Window` receiver is a general JavaScript point, not a GUI95 lesson.
- Memory, latency and restore timings are consumer observations from particular hosts, not targets.
- The left-edge fix in the dictionary's report and its type-to-search behaviour were committed or reported with native checks on macOS only. Windows and Linux hosts, physical display scaling and screen readers were not rechecked there or here.

## Checks run for this update

On macOS with Node 25 and Playwright's Chromium:

- Kit: all 66 tests pass, including the three new ones. Each new test was also run against the 1.0.0 stylesheet and failed there.
- Delivery helpers (`make test`): 170 passed, 0 failed; the 14 skips are the existing platform-specific desktop cases.
- MCP server: all 26 tests pass.
- Local documentation links: 317 links and their heading anchors in `SKILL.md`, `README.md`, `docs/` and the kit README all resolve. PowerShell was unavailable, so `tools/verify-reference.ps1` and its archive hash check were not run; no archived reference file was changed.
- The kit gallery was opened in Chromium. Its menu heading, toolbar button and dialog button keep the same size when pressed.

Native hosts, physical display scales and screen readers were not checked. No packages were built and nothing was published.
