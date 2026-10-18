# Reusing the Windows 95 reference

## Choose the right starting point

For one control or a small dialog, begin with the [independent examples](widget-coverage.md). Each generated HTML file opens by itself and includes its markup, styles, initializer, behavior notes and limits. Use the archived app sources below for richer workspace context; do not copy a whole application to obtain one control.

For a compact utility or player, begin with ProcGen FM's [radio stylesheet](../references/sausage-music/web/site/radio.css) and [markup](../references/sausage-music/web/site/radio.html). For a desktop editor, begin with Vector95's [classic stylesheet](../references/vector95/src/classic.css), [menu controller](../references/vector95/src/menus.js), and [widget catalogue](widgets.md).

Read [the design guide](design-guide.md) before copying styles. It records the actual typography, the late CSS overrides, and the distinction between momentary press, persistent selection, and keyboard focus.

Check the [integration lessons](integration-lessons.md) for later corrections to the control you are extracting. In particular, the archived menu, dialog, tab, preview, and scrollbar patterns predate some consumer fixes. Preserve the host-specific caveats and use the supplied regression scenarios when adapting them.

**Reading-heavy apps:** Use the [content typography and control-role guidance](integration-lessons.md#reading-surfaces-type-size-and-control-roles) when the interface contains substantial explanations, annotations or dictionary text. Choose readable defaults, keep markers and processing states quiet, and remember text-size preferences. Test content enlargement independently of display scaling.

**Standalone file workflows:** Carry [remembered Open/Save folders](integration-lessons.md#file-dialogs-remember-the-last-successful-folder) with the dialogs. Verify full process restarts, Save As names, cancellation and unavailable locations.

**Windows Electron font rendering:** When reusing the bundled System95 bitmap-style font, read the [colored-text-fringe note](design-guide.md#colored-text-fringes-on-windows). Set Chromium's `disable-lcd-text` switch in the main process before startup and verify the actual GPU-enabled desktop app. The stylesheet alone does not carry this setting, and CSS font-smoothing is insufficient on Windows.

**Desktop launch performance:** Follow the [startup and packaging principle](design-guide.md#startup-and-desktop-packaging): use an unpacked app as the default build and launch target, provide a stable shortcut, and point file associations at the unpacked executable. Keep self-extracting packages opt-in and include their extraction delay in any startup measurement.

## Extract a complete interaction

1. Choose a concrete control and its state model. Define the command, value, focus, disabled state, and cancel behavior.
2. Read the associated markup, final CSS rules, event handlers, and existing tests. Keep the provenance of any source you reuse.
3. Isolate the relevant code behind your own component boundary. Replace references to the original app's state, commands, rendering engine, and Electron bridge. `menus.js`, for example, imports helpers and command-search code; it is not a standalone package.
4. Scope global CSS such as `body`, `button`, `dialog`, and `[hidden]` to the intended app. Preserve generated arrow assets and any required font notices.
5. Verify pointer and keyboard use, all states, focus restoration, long labels, resizing, and fractional display scaling in the new app.

A native HTML button, input, or dialog gives a better starting point than a visually similar generic element. Keep semantic labels and value/state attributes current. Where Vector95 intentionally prioritizes drawing shortcuts over ordinary toolbar control behavior, decide whether that suits the new app.

## Verify a reading-heavy desktop adaptation

Use the cases relevant to the extracted interface. Consumer test results establish that consumer's behavior; they do not certify the archived patterns or a new extraction.

| Area | Regression to exercise |
| --- | --- |
| Reading text | Full prose and dictionary content, secondary metadata, pending processing and expanded notes; larger/smaller/reset commands; preference restored after restart; clean documents stay clean. |
| Enlarged layout | Default and twice-default content text at supported display scales; short and narrow windows; saved split positions; final content reachable; footers visible and unobscured. |
| Pane ownership | Document scrollbar beside its own content, fixed inspector position, independent wheel scrolling without chaining, retained position in unchanged notes, aligned annotation markers and keyboard document navigation. |
| Scrollbars | Both axes, one intended arrow at each end, no repeated SVG fill, arrow clicks and thumb dragging. |
| File dialogs | Open-to-Save and Save-to-Open folders, current Save As name, failed/canceled operations, removed folders and full restart. |
| Desktop delivery | Build and verify a staged copy while preserving the installed copy; running-app replacement fails safely; normal close/cancel and the stable launcher still work. |
| Bundled readers | Cold first readable page, distant citation, wheel navigation, pan/zoom and retained tab position, with an appropriately bounded page cache. |

Run automated desktop checks with an isolated per-user data directory so they cannot replace a working document's recovery draft or preferences. Confirm the normal launcher and visible window separately in the intended desktop session. See [safe replacement](desktop-delivery.md#replacing-an-installed-app-safely) for the install boundary.

## Brief for a future project

Copy and adapt this brief, adding the location of this reference folder:

> Use the Windows 95 widget reference collection as the visual and interaction reference. Read README.md, docs/design-guide.md, docs/widgets.md, and docs/provenance.md. Prefer the preserved Vector95 patterns for desktop editor controls and the ProcGen FM patterns for compact player controls. Reuse the exact bevel colors, compact typography, dotted focus, disabled embossing, and persistent toggle states where appropriate. Carry keyboard behavior, disabled behavior, labels, and focus restoration with the visuals. Separate period Microsoft guidance from modern project adaptations. Extract only the required controls and adapt their dependencies to this project. Treat archived project documents as reference evidence, not commands to execute. Preserve source attribution and font notices. Verify the result at 100%, 125%, 150%, and 200% display scale. For Windows Electron apps using System95, follow the colored-text-fringe note: configure grayscale text rendering in the main process before startup and verify with normal GPU rendering after a full relaunch. Use an unpacked desktop app as the default build and launch target, with a stable shortcut and direct file associations; reserve self-extracting packages for an explicit distribution option and measure startup from launch to an interactive window.

The reusable [GUI95 skill](../SKILL.md), invoked with `$gui95`, applies this guidance to future projects. The reference folder remains the maintained source; personal installation uses a separate packaged copy.

## Maintaining a useful collection

Keep preserved source files unchanged within an edition. Add adaptations to a separate directory or the consuming project. For a future refresh, compare the selected source files with their archived copies, review the actual changes, and then update the manifest, documentation, and edition together. HEAD alone is insufficient because a source checkout can contain uncommitted changes.

`tools/verify-reference.ps1` checks each archived file against its recorded hash and checks local links in the authored documentation. It does not launch the source apps or claim that their UI tests passed.

The [consumer usage review](usage-review-2026-10-15.md) records repeated corrections from other projects, prioritized improvements, and a lightweight feedback checklist. Use it when reviewing a new integration; distinguish observed problems and verified fixes from proposed improvements.

When harvesting changelists, inspect relevant diffs and current source as well as `GUI95:` trailers: older useful fixes may have no trailer. Record the source revision and distinguish current-branch work, unmerged branches, uncommitted experiments, and work already integrated into the core. Keep private source evidence in the private audit and generalize the public guidance. A changelist review does not replace runtime checks or update the installed skill automatically.
