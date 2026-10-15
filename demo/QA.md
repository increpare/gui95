# Browser verification

Verified on 14 October 2026 in the Codex in-app browser, at its 1280 × 720 viewport and a temporary 390 × 844 viewport.

- Desktop shortcuts open programs on double-click. Taskbar buttons minimize and restore windows.
- Explorer opens folders, switches to details, and resizes its folder pane with the keyboard. F10 and arrow navigation move between menus and select commands.
- Paint adds text, draws a pointer stroke, undoes a change, and asks whether to save a modified drawing before closing.
- Paint's Save As command downloaded `Untitled.png`; the output file was present and nonempty.
- Display Properties applies a chosen color, then correctly discards a different pending color on Cancel. Appearance tabs, font radio buttons, and larger-text settings work.
- Display Properties remains readable with its actions accessible at 390 × 844 with larger text enabled.
- Media Player starts its Web Audio synthesis, changes tracks while playing, and toggles Repeat. The visible playback state updates without console errors.
- Syntax checks pass for the application script and preview server. The reference collection's snapshot hashes and documentation links remain valid.

The demo is an independent browser adaptation. Native OS behavior, cross-browser compatibility, and formal accessibility conformance are outside these checks. Full source-application test suites are not part of the demo.

GUI 95 border resizing: browser drags verified for all four edges and four corners, with the opposite border anchored. Maximized windows hide resize targets; Display Properties has none. All 32 geometry checks passed for normal movement, minimum size, and desktop bounds. JavaScript syntax check passed.

Font readability: visually compared the pixel recreation against Tahoma using the reported Source Projects label. Verified the new default is Tahoma at 12 px after reload, Appearance selects it by default, and larger text applies 14 px to both the body and dialogs. Captured the corrected folder labels. JavaScript syntax check passed.
