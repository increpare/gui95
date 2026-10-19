# Lessons from GUI95 integrations

Follow-up guidance from source and changelist review and consumer integrations, updated **19 October 2026**. These are adaptations to consider when extracting the preserved controls. Runtime observations concern the reported consuming host; they do not establish new passing results for the 14 October snapshots or the collection's examples. Use the affected app's host, accessibility requirements, and interaction model to decide which apply.

## Caption buttons: center icon geometry, not font ink

Text characters used for Minimize, Maximize and Close inherit font-specific baselines and visible bounds. In a consumer, the icons sat too low and the hollow-square maximize glyph was visibly undersized despite equal button rectangles. Use the [shared caption controls](caption-controls.md) with fixed pixel geometry and its complete button reset. Copy the [stylesheet](../examples/caption-controls.css) unchanged; keep app command wiring separate, including actual host Maximize/Restore state. Inspect the final visible glyphs, press offset, keyboard and disabled states at each supported display scale.

The suite follow-up also found odd-height captions placing even-height buttons on half pixels, pressed-button padding moving the icon a second time, a restrictive image policy blocking embedded masks, a server allowlist omitting the new CSS, and canvas/playback shortcuts consuming Enter or Space on a focused caption button. Use the complete shared reset, integer caption layout, an explicit stylesheet route and policy, and native button key ownership. Check the visible ink in the final app cascade; equal button rectangles alone miss these failures.

## Reading surfaces: type size and control roles

The archived 11–12px UI rules are examples of compact interface styling. A reading-heavy editor also needs a deliberate scale for annotation prose, dictionary articles, citations and secondary metadata. Review all of those surfaces together: increasing paragraph text while leaving counts and source links at 9–11px can preserve the original usability problem. The [typography guidance](design-guide.md#reading-text-and-user-sizing) distinguishes period evidence from example defaults chosen for a modern host.

Use a shared content type scale and explicit roles for smaller metadata and larger reading text. Scope it to the relevant panes so that changing feedback size leaves document text, application controls and PDF zoom on their intended scales. Expose larger, smaller and reset commands with keyboard access, validate restored values, and remember the preference across full process restarts. Changing this preference must not modify the document, affect Undo, or mark a clean file dirty. Retain selection and focus when activating the commands.

Bevels communicate actions and states. A broad rule for every `button` can turn quiet annotation markers, citation links and loading indicators into noisy push buttons. Use concrete command-control classes or shell regions for raised controls. Keep the marker lane and reading surface unobtrusive while carrying the theme through the complete inspector, including expanded feedback sections and details.

Check a full passage with real notes and dictionary results, including a genuinely pending processing state. Verify text sizes and rendering, quiet markers, expanded details, citation activation, and keyboard focus. A Windows Electron 44.9.0 consumer checked readability, sizing commands, persistence and layout at 100%, 125%, 150% and 200% display scales, including content at twice its default size. That observation does not verify another app's font, cascade or layout.

## File dialogs: remember the last successful folder

For standalone file-based apps, persist the last successfully opened or saved directory across full app restarts. Use it for subsequent Open and new-document Save dialogs. A shared folder is a useful default; distinct import/export workflows can justify separate histories. Save As should retain the current document's folder and filename, and ordinary Save should keep writing the existing target.

Update the preference after the document has actually been read, validated or written successfully. Canceled choosers and failed operations must not replace the last successful folder. Validate remembered directories before reuse and fall back to a useful location such as Documents when a folder is missing, inaccessible or on an unavailable drive. Store the preference in the app's per-user data, with a safe replacement write. A preference-write failure must not make a completed document save appear to have failed; the current session can still retain its folder.

Check both Open-to-Save and Save-to-Open behavior, Save As names, cancellation, failed reads/writes, paths containing spaces or non-ASCII characters, unavailable folders and damaged preferences. Relaunch the process with the same isolated test profile to verify persistence. Native dialogs can retain some state themselves, but a test that merely reopens a dialog in one process does not establish the app's restart behavior.

### Imported conversions need a new save destination

Opening a foreign format for conversion is different from opening the app's own document. Validate the incoming data and complete the current document's Save/Discard/Cancel flow before replacing it. Once the conversion is accepted, mark the new document unsaved and clear both the renderer's filename binding and the native host's pending/current save destination. Suggest a filename in the receiving app's format. Ordinary Save must then ask for a destination instead of writing converted data over the source file.

Canceling or rejecting the conversion must preserve the existing document and its save target. Keep export destinations separate from the editable document's destination. Test import followed immediately by Save, canceled Save, malformed input, canceled replacement, and native command-line opening; confirm that the original source bytes survive. Exercise the conversion in the packaged app too, following the [shipped-resource checks](desktop-delivery.md#verify-shipped-commands-and-resources).

## Menus: keyboard focus survives a resting pointer

A menu opened by the keyboard can appear underneath a stationary mouse. The resulting `pointerover` or `pointerenter` can move focus to a different command or close a submenu even though the user has not moved the mouse. Give keyboard navigation ownership until actual pointer movement resumes. Track pointer coordinates or an equivalent input-mode state; keep intentional click and press-and-drag navigation working.

Test with the pointer parked where a menu command will appear: open the menu with Alt, navigate into a submenu, wait for layout and hover events, and press Enter. Then move the pointer and confirm that pointer navigation resumes. Moving the test mouse out of the way avoids a collision but does not test the fix.

If two headings share a mnemonic, provide a deliberate way to cycle between them or choose unique letters. Test that both are reachable; always opening the first match strands the other heading.

## Commands: focused controls and pending edits own their input

Keyboard ownership includes buttons, sliders, checkboxes, and tree disclosure controls, as well as text fields. Let Space activate a focused button and arrows operate a focused value control before application shortcuts claim those keys. Scope canvas nudges and preview keys to their actual command target. Decide which actions repeat: held nudges may repeat, while a held toggle usually should not toggle repeatedly. Preserve an accessible keyboard route if pointer-focused toolbar controls are removed from the ordinary tab sequence.

Define when typed drafts commit before commands and gestures read application state. A spin button that deliberately prevents focus changes will not blur another pending numeric field; settle that field explicitly before stepping the target. Read the target's current text when appropriate, and avoid committing the same value twice. A drag must start from the committed typed geometry rather than stale model coordinates. Check the resulting undo order as well as the displayed value.

### macOS: route Undo and Redo to their owner

A desktop editor can have native text-field history and a separate document history. A native Edit menu with generic Undo/Redo roles alone does not route between them. When an app supplies its own document history, dispatch its Undo/Redo menu actions according to current focus: text entry uses the host's text editing action; the workspace uses the enabled document command. Respect open dialogs and command guards, and avoid handling the same accelerator again in the renderer.

Retain native Cut, Copy, Paste and Select All roles. Use the platform's modifiers and shortcut labels, including Cmd+Shift+Z for Redo on macOS. Verify menu clicks and keyboard accelerators with an edited text field, the workspace and a modal dialog; each must affect only the intended history. The source-reviewed routing is an integration pattern, not a newly verified macOS runtime result. See the [desktop platform conventions](desktop-delivery.md#platform-conventions).

## Sliders: nonlinear position, meaningful values

For a large positive range such as brush diameter, a nonlinear position, such as a logarithmic scale, can give small values useful travel. Keep the stored value, exact numeric entry and accessible value in real units. Use the same forward/inverse mapping for thumb placement and pointer input, account for the thumb's travel, and clamp to exact endpoints. A special zero value needs an explicit mapping; logarithms do not define it. The curve and keyboard increments depend on the control's task, not on a universal GUI95 formula.

Keep keyboard steps predictable in the displayed units, with Home/End reaching the bounds and Page keys making deliberate larger steps. If Shift or another modifier changes drag sensitivity, apply it to movement from the current pointer position so pressing or releasing it does not jump the value. Distinguish grabbing the thumb, clicking the track, and starting a fine drag.

Preview during a drag, commit one completed change, and restore the starting value without an Undo entry on Escape, pointer cancellation or window deactivation. End an old gesture before changing the tool, range or document that the control edits. Check round-trip mapping, small values, endpoints, pointer and keyboard entry, modifier changes mid-drag, cancellation and context switches. These are regression scenarios; the archived slider is not this newer implementation.

### Shared tool controls retain separate defaults

A shared Size field can edit several tools without giving them one persistent size. Restore each tool's saved default on ordinary and temporary switches; changing a selected object's width must not silently replace those defaults. For a spring-loaded tool key, distinguish an unused key choice from a held key actually used for a canvas gesture. Committing an unused choice regardless of press duration avoids slow presses unexpectedly reverting. Persist committed tool state, and verify release after a gesture and switching while a size control has focus.

## Playback controls: show what can be changed

A passive progress meter and an interactive timeline have different contracts. A seekable timeline needs a visible slider thumb, a labeled current position and duration, pointer seeking and keyboard navigation. Preserve the thumb's preview while the pointer moves, commit a seek deliberately, and discard a canceled preview. Disable seeking when the media has no usable duration. Test beginning/end, paused and playing states, canceled drags and rapid successive seeks; a late asynchronous result must not replace a newer requested position.

Give volume a visible reference level and current-value feedback during pointer and keyboard adjustment. If 100% means normal unattenuated output, label that meaning; it need not be the midpoint or maximum of every app's range. Keep the accessible value meaningful, including a muted state, and leave the native range's keyboard behavior available. A tooltip must supplement an accessible label rather than supply the only name.

Separate the loaded media from list selection. Commands beside now-playing information, such as rating the current song, should target that loaded item even after another row is selected. List actions such as exporting a selected item can retain their own target. Keep labels, enabled state and target identity consistent through filtering, sorting and playback changes. Verify with one item playing while another is selected.

## Streaming workbenches: preserve space and control identity

Reserve a bounded results region before background results arrive so the canvas and editors do not move with every update. Reuse cards and their interactive children by stable identity when proof, status or statistics change. Rebuilding a visually identical button still loses focus and can change the target under a resting pointer.

When ranking would reorder a result being used, consider deferring that reordering while the results own keyboard focus or the pointer rests on a card. Continue collecting updates and flush pending changes when that interaction ends; verify that the flush also works when focus leaves a child button. Keep resizing and scrolling within the existing pane constraints.

When adapting a workbench's appearance, test real typing, selection, completion acceptance and dismissal, search, diagnostics and focus in every editor panel. A styled textarea, a source assertion or a screenshot alone does not exercise the editor integration. Check incoming results while a card action has focus, while its pointer target is stationary, and while the user types in another pane; verify canvas bounds, scroll position and eventual updates.

## Imported SVG: contain presentation rules before insertion

An SVG's embedded stylesheet can match the surrounding HTML document after inline insertion. Namespace IDs and local references, but also contain its CSS before mounting or temporarily measuring the artwork. For a supported subset, resolve allowed local presentation rules and inline declarations into attributes on the parsed SVG, then remove stylesheet nodes and unsupported attributes before inserting any of it. Preserve the supported cascade, inherited paint and local references; merely deleting styles can destroy the drawing's appearance.

Define the importer's supported CSS and SVG subset explicitly. A small selector/declaration parser is not a general CSS cascade or complete SVG sanitizer. Preserve the consuming app's policy for scripts, external resources and unsupported constructs, and reject or explain unsupported input. An isolated image or document can be more suitable when inline editing is unnecessary.

Check a drawing containing selectors that match host elements or classes, local class and ID rules, inline overrides and repeated IDs. Confirm both that the supported artwork still paints correctly and that host control styles remain unchanged after import and measurement. The [reuse guide](reuse.md#extract-a-complete-interaction) still applies to the app's own global CSS; imported artwork needs this separate containment step.

## Pointer gestures: keep ownership through UI refreshes

A drag can refresh selection, geometry and inspector fields on every move. Retain the pressed element and resize handle while updating their appearance; rebuilding them creates an avoidable interruption risk. Keep the gesture's base document and preview separate, commit once on release, and discard the preview on cancellation.

Pointer capture is useful for following a pointer outside a control, but test the full lifecycle in the actual host. One Windows Electron integration still observed capture loss after retaining the pressed nodes; stable node reuse alone did not fix it. Document-level move/up handling, guarded by an active gesture, allowed the edit to complete. If a fallback is needed, scope it to the initiating pointer and make its finish path idempotent. Define cancellation for pointer cancellation, Escape and window deactivation so a preview cannot remain active or be committed twice. Hover movement after a gesture has ended must not keep changing the document.

Exercise real pointer press/move/release sequences, not just synthetic clicks or direct model updates. Move and resize through the UI refresh, test a selection of several objects, cross the original control's bounds, and cancel mid-gesture. Check final document values and Undo, then move the idle pointer again to confirm that the gesture ended. Record host and automation limitations separately; a passing captured-pointer test does not establish behavior after capture is interrupted.

## Dialogs: close is an application lifecycle boundary

When an application wraps a dialog with its own stack, pending promise, or command guard, finish that application state in the close operation. A native `close` event can arrive later, after queued input. Waiting for it can leave an invisible dialog marked open and make an immediate reopen command do nothing.

Use an idempotent finish path to settle the stack, update inert regions, restore the appropriate focus, remove temporary markup, and resolve callers. Keep the native event as a fallback for other closing paths. Test close-and-immediate-reopen and nested confirmation dialogs, including repeated Escape input; one held key must not unexpectedly activate the dialog underneath.

### Frameless captions and modality

Start with native `dialog.showModal()` where it suits the host. Its modality also makes an HTML title bar outside the dialog inert. In a frameless desktop app, verify that dragging, minimizing, maximizing, and closing the actual window remain usable while a dialog is open. A transparent backdrop alone does not exempt that title bar.

If the host requires an interactive HTML caption, a nonmodal `show()` plus application-managed modality is a possible adaptation, with a substantial behavior contract: background content and lower dialogs are inert; only the top dialog receives Tab, Escape, and activation; initial and restored focus are deliberate; a backdrop blocks workspace interaction; and dialog naming and modal accessibility semantics are correct. Keep caption controls reachable without letting workspace commands through. Treat this as a host-specific design decision, not a drop-in replacement for native modality or a complete accessible component supplied by this collection.

## Tabs: the selected page meets its tab

Document tabs and property tabs are page selectors, with an open bottom edge that joins the selected page. Continue the page seam beneath inactive tabs and the empty strip; interrupt it beneath the active tab. A lower inactive tab and clipped upper corners can establish the depth without making each tab a four-sided push button. Preserve document-specific close, dirty, and drag behavior where present.

For multiple rows of property tabs, place the selected row beside the page. Reflow existing tab nodes instead of rebuilding them and losing keyboard focus. Keep a roving tab stop, `aria-selected`, and panel relationships. Resolve Up/Down by the rendered rows and the nearest horizontal position, since visual row order can change after selection or resize. Verify long labels, narrow widths, row changes, and focus after reflow. This is guidance; the archived edition does not supply a standalone multi-row tab component.

## Floating previews: geometry, focus, and pixel meaning

A utility window needs bounds that remain reachable after the workspace shrinks or the display scale changes. Validate saved coordinates and dimensions as finite, usable numbers before clamping restored and resized geometry to the current workspace. Keep moving and sizing distinct, handle the complete pointer lifecycle including cancellation, and offer keyboard equivalents when the utility is keyboard accessible. Define Escape and focus restoration deliberately: hiding a utility that does not own focus should not steal focus from the user's current field.

For a native top-level window, validate saved bounds against the current displays' work areas and the intended window dimensions. A removed monitor or changed work area can invalidate a previously useful position. Fall back to a visible placement instead of restoring an unreachable window.

Scope preview navigation keys to the preview's focus or active context, and preserve text editing in its fields. Wheel scrolling should still scroll; use a deliberate modifier or pinch gesture for zoom, anchored to the pointer when appropriate. If an arbitrary zoom value is possible, represent it truthfully in the selector rather than showing the nearest preset as though it were exact.

Define what **1:1** means. One source pixel per CSS pixel and one source pixel per physical display pixel are different at a device pixel ratio other than 1. When the preview promises physical pixel mapping, compute its CSS dimensions from `raster dimensions × zoom / devicePixelRatio` and update them when that ratio changes. Keep integer zoom steps for intentional pixel enlargement. Check fit layouts in both narrow and wide preview windows and verify the promised mapping in the real host.

## Split panes: scrollbars belong to their content

A document scrollbar should sit on the edge of the document pane, before a sibling inspector. Placing a document and its inspector inside one scrolling grid gives the outer scrollbar misleading ownership. Make independently scrolling panes siblings in a bounded layout, with zero minimum sizes on the relevant grid and flex children. Keep a document's aligned annotation lane in the same scroll container as its text.

Choose feedback placement deliberately. A desktop inspector can remain anchored at the top while its contents follow the selection. Reusing a web editor's active-verse placement routine can make that inspector drift or jump as the document scrolls. Disable that positioning routine for a fixed inspector rather than fighting its per-frame inline offsets with CSS. Keep its caption outside its scrolling body, show a body scrollbar only when needed, and contain wheel scrolling at the pane boundary. Offer smooth scrolling only where it serves the interaction; do not add animated inspector following as decoration.

Scrolling or geometry-only updates must not rebuild unchanged feedback and lose the reader's position or focus. Remeasure annotation markers separately from rendering note contents. Verify a long document with real feedback: wheel over each pane, continue at its scroll limits, change the selected verse, use keyboard document navigation, and check marker alignment. Sample the inspector position during subsequent frames to catch drifting, and repeat with enlarged text and narrow or short windows. These are consumer layout choices, not a replacement for the preserved web editor's interaction model.

## Scrollbars: check the target Chromium selector behavior

Carry the generated arrow assets with the CSS, then inspect the actual scrollbar. In an observed Windows Chromium integration, scrollbar state pseudo-classes such as `:vertical` and `:start` failed behind a `:where()` ancestor, leaving arrows missing, and `:double-button` did not match the unwanted extra buttons. A concrete app-scoping selector and explicit `:start:increment` / `:end:decrement` rules fixed that implementation.

A second Windows Electron integration applied directional SVG images to all generated button slots but put the sizing, centering and `background-repeat: no-repeat` base only on `:single-button`. Extra slots then tiled the tiny arrow image. Apply the complete base to `::-webkit-scrollbar-button` and hide unwanted positions explicitly in the target host. For example, retain the pattern's directional images and add:

```css
.gui95 ::-webkit-scrollbar-button {
  background-position: center;
  background-repeat: no-repeat;
}
.gui95 ::-webkit-scrollbar-button:increment:start,
.gui95 ::-webkit-scrollbar-button:decrement:end {
  display: none;
}
```

Do not assume every Chromium or operating-system theme behaves identically. Check both axes, one intended arrow button at each end, short and long content, disabled ends, thumb dragging, and fractional display scales. A screenshot of the main toolbar does not verify scrollbars.

## Small windows: keep the next action reachable

When a panel contains a long form and essential actions, make the form body the scrolling region and keep the action footer outside it. Give nested flex/grid children `min-height: 0` and `min-width: 0`, and allow the footer its required space. Choose a minimum window size that still accommodates the fixed controls.

Test short windows as well as narrow ones, especially the reduced CSS work area at 200% display scale. Confirm that action buttons are visible, unobscured, and clickable without an automatic scroll, and that scrolling the form leaves them in place. If the viewport cannot fit the fixed regions, provide a reachable fallback rather than silently clipping them.

Enlarged content text is a separate stress case. Size grid tracks for the actual in-flow children. A panel with one scrolling child can need `grid-template-rows: minmax(0, 1fr)`; carrying over an `auto` header track after its header became absolutely positioned can let that child grow beyond the panel. Give the scrolling region a constrained height and zero minimum sizes, then contain painting at the workspace boundary. Verify that the final content is reachable through the intended scroll region.

Recheck saved pixel split positions when a tall window becomes short. A shared splitter may stop handling resize events below its web/mobile breakpoint while a desktop stylesheet continues consuming its pixel variable. Use a consistent splitter policy, clamp against the current available height, or use a proportional layout where that saved value no longer applies. Keep enabled pointer and keyboard behavior consistent with that policy.

Bounds assertions alone miss content painted over a footer whose own rectangle is correct. Hit-test essential footer controls, confirm that the analysis region remains inside its panel, and scroll to its final content. Fractional Windows display scales can round client dimensions by a pixel; allow a small measurement tolerance and wait for native resize and compositor presentation before recording screenshots.

## Native themes: shared tokens, transparent overlays, and atlas aliases

Inspect the host's theme or extension API before replacing its UI. A theme can retain the host's mature tools, shortcuts, dialogs, and document handling. Establish which surfaces and window decorations that API actually controls, along with font fallback and existing user preferences.

Map a color token's actual consumers before changing it. A token named for an active tab can also paint a whole tool strip or palette; shared chrome usually needs a neutral face. Preserve transparent overlays that allow selection and user content colors to show through. Do not recolor every pixel with a similar source color as if it served the same semantic role.

Sprite atlases can alias the same source rectangle between different controls or states. Allocate independent slots for replacements and update their coordinates, with bounds checks, instead of overwriting another control through a shared rectangle. Edit the generator when assets are generated. Inspect normal, selected, pressed, disabled, and focused glyphs against their actual backgrounds; pressed gray buttons may need black glyphs while navy selections need white ones.

## Trees: draw and operate the complete branch

Represent an expanded branch as a parent row and an owned child group. Keep connector rails continuous through descendants and stop terminal rails at the final child. Put an insertion marker for dropping below a branch beneath that complete branch, not directly beneath its parent row. Review indentation, crisp square connector dots, expanded/collapsed glyphs, selection, and drop markers together at fractional scales.

Keep hierarchy roles, group labels, and expansion state aligned with the actual structure. Preserve the focused logical disclosure or row when rebuilding the tree, and let Enter/Space operate focused tree controls before unrelated canvas shortcuts. Do not infer a general tree keyboard contract from an application's layer-painting or drawing policy.

## Document commands: an asynchronous save covers one revision

A successful save marks the serialized revision as saved. If the user edits while a native save is pending, keep those newer edits dirty. A Save-and-Close command must recheck that state after saving instead of closing on the assumption that nothing changed. Likewise, take recovery snapshots after pending document gestures and edits settle, so a temporary interaction outline does not become recovered document content. Keep serialization, recovery formats, and engine queues specific to the consuming app.

## Windows build shells: verify the environment as well as the Makefile

Shell-neutral recipes still depend on the environment inherited by their tools. An observed MSYS2 GNU Make invocation from Git Bash lost `OS` and `COMSPEC`; the Makefile then missed its Windows branch and npm failed. For that combination, run the Windows build from PowerShell or cmd, or deliberately establish and validate an equivalent environment. Do not treat the absence of `OS=Windows_NT` as proof that a process is running on Unix.

Check the shell the user actually launches from, the selected npm launcher, and inherited command-processor variables. Keep this diagnosis separate from the GNU Make version baseline or the platform being built. The failure does not establish that every Git Bash or MSYS2 installation is incompatible.

## Startup and tests: optional work and generated assets

Keep optional diagnostics off the path to a usable window. Fetch an external tool's version lazily when an About or diagnostics surface needs it, with a bounded wait and a useful unavailable state. A hung optional probe should not prevent the main UI from appearing.

Tests that launch Electron directly bypass npm lifecycle hooks such as `prestart`. Generate required ignored icons and other build inputs explicitly before that launch; otherwise a clean checkout can fail while a developer's checkout passes because old outputs happen to exist. Test this prerequisite in a clean fixture or isolated checkout. Keep hidden background automation distinct from visible checks of native appearance, focus, and window behavior.

### Bundled readers: measure the first usable page

Measure cold document open, a citation jump to a distant page, wheel navigation and return to an already visited tab in the packaged app. A fast toolbar or a loading placeholder does not establish that the requested page is readable. Keep decoding off the repeated interaction path where possible, retain page/zoom/scroll state, and load nearby pages with a bounded cache.

For immutable scanned manuals, preparing page images at build time is one useful option. Key cached derivatives to the source hash and rendering parameters. Weigh the larger installed assets and the document's text/search/accessibility needs; retain source documents and their notices, and keep a runtime reader for document types that need it. This is a consumer-specific optimization, not a requirement to rasterize every PDF.

Preserve normal wheel scrolling, continuous page navigation and mouse panning where appropriate; use an explicit zoom gesture and retain pointer anchoring. Check reduced-motion preferences when adding smooth scrolling. A file-availability `HEAD` route should return metadata without unnecessarily fetching or decoding the full document body.

## Offline workbenches with workers and WebAssembly

A browser workbench that starts Web Workers and fetches a WebAssembly solver
needs an origin that supports those operations in its desktop host. A `file://`
launch is insufficient for apps whose browser version requires HTTP. Serve only
the packaged web assets through a stable privileged local scheme, including
the proper JavaScript and `application/wasm` response types. Keep Node access
disabled in the renderer and expose native file dialogs through a narrow preload
bridge. A stable origin also keeps recovery storage consistent across launches.

Wait for initial demo or recovery loading to settle before delivering a file
opened by the operating system. Otherwise the startup fetch can replace the
user's file after it has opened. Serialize subsequent file deliveries, and
preserve Save/Discard/Cancel before replacement. Test a cold command-line file
open as well as opening into an existing instance.

On Windows with Electron 44.7.0, a consumer's packaged desktop check exercised
offline native solving through this origin, native Open/Save, canceled and failed
saves, unsaved replacement, recent files after process restart, and restored
menu focus. This is host-specific evidence; repeat the checks in other desktop
hosts and do not infer operating-system display-scale coverage from it.

## Reuse and verification scope

Carry these decisions into the consuming app and add checks for the specific regression. Keep archived sources and their manifest unchanged. Existing consumer test code is evidence of an intended regression check, not a passing result for a new extraction.

See the [design guide](design-guide.md) for the base visual rules and [reuse guide](reuse.md) for extraction and attribution. Desktop packaging, grayscale text startup settings, and stable launch paths remain covered there; do not duplicate a consumer's older build workaround without checking the current delivery guidance.

## Maintained components: repair roving focus when availability changes

In the maintained build kit, command state can disable the control that currently owns a toolbar's Tab stop. Recompute the enabled, visible entry when disabled, aria-disabled, hidden or inert state changes, while preserving the current entry if it remains available. Otherwise every remaining enabled button can retain tabindex=-1 and Tab skips the whole toolbar. Apply the same availability rule when entering a tree branch: skip a disabled first child and reach an available sibling. Keep native value-control arrows and button Space owned by the focused control.

The kit's real browser regressions exercise these state changes and verify that destroy disconnects the observers. This is new maintained-kit behavior, not a claim that the preserved application snapshots contain those fixes. Menu checkbox/radio state also needs a visible current-color mark; an aria-checked value alone does not draw the checked state.
