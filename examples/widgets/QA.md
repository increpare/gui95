# Widget example verification

Verified 18 October 2026 on Windows with headless Microsoft Edge 155.0.4283.45 and Playwright 1.64.1: **45/45 checks passed**, with no uncaught page errors. The runner is [check.mjs](check.mjs); invocation and environment options are in [README](README.md).

- All 38 pages loaded through local file URLs with HTTP(S) requests blocked. The check also verified unique IDs and labels for fields.
- All 38 pages fit 1280 px and 390 px viewports at browser device scale factors 1, 1.25, 1.5 and 2 (304 layout checks). These are emulated display scales, not four physical Windows display settings.
- All pages were checked with text enlarged from 13 to 19.5 px. Seven dialog examples were opened at 390 px width with enlarged text; dialog bounds remained inside the viewport.
- Behavior checks exercised native fields and list selections, mixed checkboxes, editable combo acceptance/dismissal, tree navigation, sort/selection retention, toolbar/tab navigation, splitter/header resizing and canceled drags, menu-bar mode and staged Escape, delayed cascades, context menus, modal/modeless focus, property Apply/Cancel/Close, wizard validation/backtracking, color/font rollback, safe message defaults and window geometry restoration.
- A real selected text file was read, and a real browser download was checked for its edited content and sanitized name. Printing was tested with a stubbed host request and actual print CSS; no print job was sent. Hot-key capture, browser rich-text editing, explicit animation play/stop, gallery search and embedded previews were exercised.
- Contact sheets for all 38 examples, gallery/menu/property/tree captures at all four scales, and a forced-color checkbox page were visually inspected. Review corrected the progress appearance, dialog action order and forced-color caption text. Forced-color inspection is a sample check, not a complete high-contrast certification.

The generated-output check passed. The reference verifier passed **109 preserved snapshot hashes and 235 documentation links**. Both skill and plugin packages were built in an isolated staging directory; each packaged builder successfully checked its included examples and coverage index. Existing release packages were preserved.

No Firefox, WebKit, screen reader, native Electron chrome, native Win32 control, actual printer, native picker UI, production editor engine or durable application persistence was certified. The Open/Save/Print pages deliberately leave those responsibilities to the browser/host. Recheck behavior and visual states in the consuming app.

The runner writes detailed results and screenshots to `.codex_tmp/widget-qa/` by default; these local artifacts are excluded from releases. This record describes this edition, not future edits or a blanket compatibility guarantee.

## Caption follow-up, 19 October 2026

Two focused browser checks passed after adopting the shared caption stylesheet: font-independent dimensions and glyph placement, pointer press feedback, keyboard Maximize/Restore, disabled activation, forced-color captures and device scale factors 1, 1.25, 1.5 and 2; plus the existing child-window move/cancel/maximize/restore/close check. This reran the affected window example, not the full 38-example suite.

The consuming GUI95 Suite passed 52/52 checks across eleven Windows Electron apps, its Puppet95 prototype and this reference desktop at scale factors 1, 1.25, 1.5 and 2. Native checks exercised minimize, maximize, Restore, external host-state updates, Space/Enter activation and Close where the app supports those actions; GPU compositing was enabled in all 44 native runs. Resting controls at all four scales and the Restore, pressed and disabled states were visually inspected. These are Electron startup scale overrides, not four changes to the physical Windows display setting. Separate VCrop, ProcGen FM, packaged PuzzleScript+MIS and packaged Website Manager window-control checks also passed. All eleven finished packages contain an unchanged copy of the shared stylesheet.

Generated output is current; the reference verifier passed 109 snapshot hashes and 253 documentation links. The [shared caption contract](../../docs/caption-controls.md) records the reuse and host-state requirements.
