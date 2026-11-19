# Widget coverage and independent examples

The [gallery](../demo/dist/widgets/index.html) contains **38 self-contained examples** for standard Windows 95 control families, common dialog patterns, and explicit browser adapters. Each page includes states, keyboard behavior, scope limits, and period/current source pointers. They are original MIT implementations, independent of the archived application engines. This is a reference and starting point, not a packaged component API or a claim of complete Win32 emulation.

## Find a template

| Family | Example | What it covers | Checked against Windows 95 |
| --- | --- | --- | --- |
| Basic controls | [Push buttons and default action](../demo/dist/widgets/buttons.html) | Normal, pressed, focused, disabled, and default action. The default outline is separate from keyboard focus. | [Verified, with open differences](example-audit.md#buttons) (1 open) |
| Basic controls | [Toggle buttons](../demo/dist/widgets/toggle.html) | Off/on, pressed feedback, focus, and disabled on state. | [Verified, apart from host limits](example-audit.md#toggle) |
| Basic controls | [Checkboxes and mixed state](../demo/dist/widgets/checkbox.html) | Unchecked, checked, mixed aggregate, focused, disabled checked. | [Verified, with open differences](example-audit.md#checkbox) (2 open) |
| Basic controls | [Radio-button groups](../demo/dist/widgets/radio.html) | One selected option, focus, and disabled option. The legend labels the choice as a whole. | [Verified, with open differences](example-audit.md#radio) (1 open) |
| Basic controls | [Text fields and validation](../demo/dist/widgets/text.html) | Editable, read-only (selectable), disabled, password, and invalid with a connected explanation. | [Verified, apart from host limits](example-audit.md#text) |
| Basic controls | [Multiline text](../demo/dist/widgets/multiline.html) | Multiple lines, selection, scrolling, focus and resize. | [Verified, apart from host limits](example-audit.md#multiline) |
| Basic controls | [Numeric field and spin control](../demo/dist/widgets/spinner.html) | Editable, up and down buttons, minimum/maximum and invalid typed values. | [Verified, with open differences](example-audit.md#spinner) (2 open) |
| Basic controls | [Drop-down selection](../demo/dist/widgets/select.html) | Closed/open, selected option, disabled option and disabled control. | [Verified, apart from host limits](example-audit.md#select) |
| Basic controls | [Editable combo box](../demo/dist/widgets/combobox.html) | Free text, filtered suggestions, active suggestion distinct from committed value, empty results, closed popup. | [Verified](example-audit.md#combobox) |
| Basic controls | [Single-selection list box](../demo/dist/widgets/listbox.html) | Selected row, focus, scroll and disabled item. Selection does not activate the document. | [Verified, with open differences](example-audit.md#listbox) (1 open) |
| Basic controls | [Multiple-selection list box](../demo/dist/widgets/multiselect.html) | Discontiguous selections, range selection and empty selection. | [Verified, with open differences](example-audit.md#multiselect) (1 open) |
| Basic controls | [Group boxes and labels](../demo/dist/widgets/groupbox.html) | Etched group, legend interrupting the border, labels, enabled and disabled groups. | [Verified](example-audit.md#groupbox) |
| Feedback and layout | [Horizontal and vertical sliders](../demo/dist/widgets/slider.html) | Horizontal/vertical, value, bounds, focus and disabled. | [Verified, with open differences](example-audit.md#slider) (1 open) |
| Feedback and layout | [Progress bars](../demo/dist/widgets/progress.html) | Determinate, indeterminate, complete and canceled. | [Partly checked](example-audit.md#progress) |
| Feedback and layout | [Scrollbars and scrolling regions](../demo/dist/widgets/scrollbars.html) | Two axes, thumb, track, focus and resizable viewport. | [Verified](example-audit.md#scrollbars) |
| Feedback and layout | [Tooltips and status help](../demo/dist/widgets/tooltip.html) | Delayed hover/focus hint, Escape dismissal, supplemental status text. | [Verified](example-audit.md#tooltip) |
| Navigation and data | [Tabs and tab panels](../demo/dist/widgets/tabs.html) | Selected tab, inactive tabs, focus, persistent values in hidden panels. | [Verified, with open differences](example-audit.md#tabs) (1 open) |
| Navigation and data | [Toolbar buttons and groups](../demo/dist/widgets/toolbar.html) | Commands, toggles, separator, disabled command and one Tab stop. | [Verified, with open differences](example-audit.md#toolbar) (1 open) |
| Navigation and data | [Tree view](../demo/dist/widgets/tree.html) | Expanded/collapsed branches, visible focus and single selection; children retain their state when a parent closes. | [Verified, with open differences](example-audit.md#tree) (1 open) |
| Navigation and data | [List view and sortable columns](../demo/dist/widgets/listview.html) | Details/icons, selected item, focus and ascending/descending sort; selection survives reordering. | [Verified, with open differences](example-audit.md#listview) (1 open) |
| Navigation and data | [Column header and resizing](../demo/dist/widgets/header.html) | Sort direction, bounded width, pointer resizing, focus and keyboard resizing. | [Verified](example-audit.md#header) |
| Feedback and layout | [Resizable split panes](../demo/dist/widgets/splitter.html) | Bounded pane widths, pointer capture, keyboard focus and canceled drag. | [Not verifiable](example-audit.md#splitter) |
| Navigation and data | [Menu bar, submenus and recent files](../demo/dist/widgets/menus.html) | Menu-bar mode, dropdown, delayed pointer submenu, unavailable item that still takes the highlight, check mark, exclusive radio mark and numbered inline MRU group. | [Verified](example-audit.md#menus) |
| Navigation and data | [Context menus](../demo/dist/widgets/context-menu.html) | Pointer and keyboard invocation, unavailable command that still takes the highlight, bounded horizontal placement and focus restoration. | [Verified, apart from host limits](example-audit.md#context-menu) |
| Windows and dialogs | [Modal dialog and focus restoration](../demo/dist/widgets/modal.html) | Closed/open modal, default action, validation, cancellation, inert background and restored focus. | [Verified, with open differences](example-audit.md#modal) (1 open) |
| Windows and dialogs | [Modeless Find dialog](../demo/dist/widgets/modeless.html) | Open without blocking the document, repeated search, wraparound, match-case and not found. | [Verified](example-audit.md#modeless) |
| Windows and dialogs | [Property sheet with Apply and Cancel](../demo/dist/widgets/properties.html) | Cross-page draft, Apply enabled only when changed, OK commit/close, Cancel rollback since last Apply, explicit caption Close decision. | [Verified, with open differences](example-audit.md#properties) (2 open) |
| Windows and dialogs | [Message box and safe default](../demo/dist/widgets/message.html) | Question, destructive action, safe initial focus/default and explicit outcome. | [Verified, with open differences](example-audit.md#message) (1 open) |
| Windows and dialogs | [Wizard with validation and backtracking](../demo/dist/widgets/wizard.html) | First/middle/final step, required input, preserved draft while going Back, Finish commit and Cancel discard. | [Verified, with open differences](example-audit.md#wizard) (2 open) |
| Specialized controls | [Palette, color well and color dialog](../demo/dist/widgets/color.html) | Swatches, RGB values, preview draft, committed well, validation and cancel rollback. | [Partly checked](example-audit.md#color) (1 open) |
| Specialized controls | [Font dialog with sample](../demo/dist/widgets/font.html) | Family, size, bold/italic, live draft sample, commit and cancel. | [Partly checked](example-audit.md#font) |
| Windows and dialogs | [Window shell, system menu, move and size](../demo/dist/widgets/window.html) | Active caption, system menu, normal/minimized/maximized/restored bounds, close/reopen, move/size and cancellation. | [Verified, with open differences](example-audit.md#window) (1 open) |
| Host integrations | [Open file through the browser](../demo/dist/widgets/open-file.html) | No selection, chosen file, successful read, preview limit and read failure. Canceling the host picker keeps the existing document. | [Not verifiable](example-audit.md#open-file) |
| Host integrations | [Save file through the browser](../demo/dist/widgets/save-file.html) | Edited content/name and a real UTF-8 text download request. | [Not verifiable](example-audit.md#save-file) |
| Host integrations | [Print through the browser](../demo/dist/widgets/print.html) | Screen/print layouts and print-dialog lifecycle. | [Not verifiable](example-audit.md#print) |
| Specialized controls | [Hot-key input](../demo/dist/widgets/hotkey.html) | Recorded chord, empty value, canceled capture and invalid chord. | [Verified](example-audit.md#hotkey) |
| Host integrations | [Rich text editing boundary](../demo/dist/widgets/rich-text.html) | Editable rich content, selection, multiline input, browser clipboard and undo. | [Not verifiable](example-audit.md#rich-text) |
| Specialized controls | [Animation display](../demo/dist/widgets/animation.html) | Static initial image, explicit play/stop and accessible description. | [Not verifiable](example-audit.md#animation) |

The last column is the verdict of the [example audit](example-audit.md), which compared each example at the period density with real Windows 95 running in an emulator: its rendering with screen dumps and its behaviour with step-by-step recordings. Follow a link for exactly what was compared, what differs and what was not checked. "Verified" there means both were compared and nothing is left open; it is not a claim about anything the record does not list.

## Reuse one example

1. Open its HTML file directly, or serve the gallery with <code>node demo/serve.mjs</code> and visit http://127.0.0.1:1995/widgets/.
2. Read its visible scope and keyboard notes. The file contains inline CSS and just that example’s initializer; no imports, external fonts, app engines, or network service are needed.
3. Each page’s CSS is the kit’s shared stylesheet (<code>kit/components/gui95.css</code>) followed by a short example layer. Copy the stylesheet once, then the example’s markup and initializer, put the markup inside a <code>.gui95</code> scope, replace demonstration data/actions, and retain the MIT notice. Take only the example-layer rules your layout needs.
4. Keep semantics, labels, selection, disabled/read-only behavior, validation, cancellation, focus restoration, and keyboard handling with the visuals. Replace example IDs when mounting multiple instances.
5. Verify the actual app at narrow widths, larger text, keyboard-only input, and 100/125/150/200% display scales. Native host controls, screen readers, browser differences and real persistence need their own checks.

Authoring sources are in [examples/widgets](../examples/widgets/README.md). Regenerate with <code>node tools/build-widget-examples.mjs</code>; check committed output with <code>node tools/build-widget-examples.mjs --check</code>. The [browser runner](../examples/widgets/check.mjs) verifies interactions and records its exact scope. See [the verification record](../examples/widgets/QA.md).

## Historical baseline and deliberate adaptations

The primary period baseline is Microsoft’s February 1995 **preliminary** guide, chapters 7–8, with edition qualifications in the [reading shelf](historical-sources.md). These examples demonstrate behavior contracts; their prose is not a quotation of the manual. The [historical audit](historical-audit-2026-10-18.md) records remaining issues in the older app-based recommendations.

The default palette represents classic system-color roles through CSS variables, not mandatory colors for every user. The pages use the shared GUI95 stylesheet with its 11px Tahoma stack; Tahoma stands in for the period MS Sans Serif bitmap face. Native HTML controls, HTML dialog, ARIA, pointer events, CSS resizing and SVG animation are browser adaptations. W3C APG links describe modern accessibility behavior; they are not historical evidence. Only transfer a pattern after checking its behavior in the intended host.

## Native and extended boundaries

- Open/Save/Print samples invoke working browser facilities. Browser security and settings determine paths, prompts, overwrite behavior and printer controls. For Electron, use a narrow preload/main-process adapter and the host’s actual dialogs; never pretend a download request proves a successful save.
- The rich-text page demonstrates browser editing, not RichEdit/RTF formatting, safe import or a production undo engine. Color/font dialogs are deliberately small draft/commit examples, not native enumeration, color management or full system custom-color stores.
- The window page demonstrates a bounded child shell, not native desktop chrome, MDI document management, docking or taskbar integration. The list view is single-selection and row-oriented, not an editable spreadsheet. The tree does not include multiselect or drag-and-drop.
- Image lists are represented by original glyphs/SVG in list/window/animation examples; no shared bitmap image-list API is supplied. Animation uses original SVG, not the native AVI control. Hot-key capture records a chord but does not register a system shortcut.
- Later date/time pickers, month calendars, rebar/coolbar controls, IP address fields, HTML/web views, modern touch widgets, and app-specific drawing canvases are outside this Windows 95 baseline. Add a dated extension rather than silently calling them original stock controls.

Retain browser/native accessibility unless there is a tested reason to replace it. There is no screen-reader or native-Win32 conformance certification for these samples.
