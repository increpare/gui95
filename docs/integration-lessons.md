# Lessons from GUI95 integrations

Follow-up guidance from a source and changelist review on **18 October 2026**. These are adaptations to consider when extracting the preserved controls, not changes to the 14 October snapshots or claims of fresh runtime verification. Use the affected app's host, accessibility requirements, and interaction model to decide which apply.

## Menus: keyboard focus survives a resting pointer

A menu opened by the keyboard can appear underneath a stationary mouse. The resulting `pointerover` or `pointerenter` can move focus to a different command or close a submenu even though the user has not moved the mouse. Give keyboard navigation ownership until actual pointer movement resumes. Track pointer coordinates or an equivalent input-mode state; keep intentional click and press-and-drag navigation working.

Test with the pointer parked where a menu command will appear: open the menu with Alt, navigate into a submenu, wait for layout and hover events, and press Enter. Then move the pointer and confirm that pointer navigation resumes. Moving the test mouse out of the way avoids a collision but does not test the fix.

If two headings share a mnemonic, provide a deliberate way to cycle between them or choose unique letters. Test that both are reachable; always opening the first match strands the other heading.

## Commands: focused controls and pending edits own their input

Keyboard ownership includes buttons, sliders, checkboxes, and tree disclosure controls, as well as text fields. Let Space activate a focused button and arrows operate a focused value control before application shortcuts claim those keys. Scope canvas nudges and preview keys to their actual command target. Decide which actions repeat: held nudges may repeat, while a held toggle usually should not toggle repeatedly. Preserve an accessible keyboard route if pointer-focused toolbar controls are removed from the ordinary tab sequence.

Define when typed drafts commit before commands and gestures read application state. A spin button that deliberately prevents focus changes will not blur another pending numeric field; settle that field explicitly before stepping the target. Read the target's current text when appropriate, and avoid committing the same value twice. A drag must start from the committed typed geometry rather than stale model coordinates. Check the resulting undo order as well as the displayed value.

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

## Scrollbars: check the target Chromium selector behavior

Carry the generated arrow assets with the CSS, then inspect the actual scrollbar. In an observed Windows Chromium integration, scrollbar state pseudo-classes such as `:vertical` and `:start` failed behind a `:where()` ancestor, leaving arrows missing, and `:double-button` did not match the unwanted extra buttons. A concrete app-scoping selector and explicit `:start:increment` / `:end:decrement` rules fixed that implementation.

Do not assume every Chromium or operating-system theme behaves identically. Check both axes, one intended arrow button at each end, short and long content, disabled ends, thumb dragging, and fractional display scales. A screenshot of the main toolbar does not verify scrollbars.

## Small windows: keep the next action reachable

When a panel contains a long form and essential actions, make the form body the scrolling region and keep the action footer outside it. Give nested flex/grid children `min-height: 0` and `min-width: 0`, and allow the footer its required space. Choose a minimum window size that still accommodates the fixed controls.

Test short windows as well as narrow ones, especially the reduced CSS work area at 200% display scale. Confirm that action buttons are visible, unobscured, and clickable without an automatic scroll, and that scrolling the form leaves them in place. If the viewport cannot fit the fixed regions, provide a reachable fallback rather than silently clipping them.

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

## Reuse and verification scope

Carry these decisions into the consuming app and add checks for the specific regression. Keep archived sources and their manifest unchanged. Existing consumer test code is evidence of an intended regression check, not a passing result for a new extraction.

See the [design guide](design-guide.md) for the base visual rules and [reuse guide](reuse.md) for extraction and attribution. Desktop packaging, grayscale text startup settings, and stable launch paths remain covered there; do not duplicate a consumer's older build workaround without checking the current delivery guidance.

## Maintained components: repair roving focus when availability changes

In the maintained build kit, command state can disable the control that currently owns a toolbar's Tab stop. Recompute the enabled, visible entry when disabled, aria-disabled, hidden or inert state changes, while preserving the current entry if it remains available. Otherwise every remaining enabled button can retain tabindex=-1 and Tab skips the whole toolbar. Apply the same availability rule when entering a tree branch: skip a disabled first child and reach an available sibling. Keep native value-control arrows and button Space owned by the focused control.

The kit's real browser regressions exercise these state changes and verify that destroy disconnects the observers. This is new maintained-kit behavior, not a claim that the preserved application snapshots contain those fixes. Menu checkbox/radio state also needs a visible current-color mark; an aria-checked value alone does not draw the checked state.
