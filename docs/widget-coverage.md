# Widget coverage and independent examples

The [gallery](../demo/dist/widgets/index.html) contains **38 self-contained examples** for standard Windows 95 control families, common dialog patterns, and explicit browser adapters. Each page includes states, keyboard behavior, scope limits, and period/current source pointers. They are original MIT implementations, independent of the archived application engines. This is a reference and starting point, not a packaged component API or a claim of complete Win32 emulation.

## Find a template

| Family | Example | What it covers |
| --- | --- | --- |
| Basic controls | [Push buttons and default action](../demo/dist/widgets/buttons.html) | Normal, pressed, focused, disabled, and default action. The default outline is separate from keyboard focus. |
| Basic controls | [Toggle buttons](../demo/dist/widgets/toggle.html) | Off/on, pressed feedback, focus, and disabled on state. |
| Basic controls | [Checkboxes and mixed state](../demo/dist/widgets/checkbox.html) | Unchecked, checked, mixed aggregate, focused, disabled checked. |
| Basic controls | [Radio-button groups](../demo/dist/widgets/radio.html) | One selected option, focus, and disabled option. The legend labels the choice as a whole. |
| Basic controls | [Text fields and validation](../demo/dist/widgets/text.html) | Editable, read-only (selectable), disabled, password, and invalid with a connected explanation. |
| Basic controls | [Multiline text](../demo/dist/widgets/multiline.html) | Multiple lines, selection, scrolling, focus and resize. |
| Basic controls | [Numeric field and spin control](../demo/dist/widgets/spinner.html) | Editable, increment/decrement, minimum/maximum and invalid typed values. |
| Basic controls | [Drop-down selection](../demo/dist/widgets/select.html) | Closed/open, selected option, disabled option and disabled control. |
| Basic controls | [Editable combo box](../demo/dist/widgets/combobox.html) | Free text, filtered suggestions, active suggestion distinct from committed value, empty results, closed popup. |
| Basic controls | [Single-selection list box](../demo/dist/widgets/listbox.html) | Selected row, focus, scroll and disabled item. Selection does not activate the document. |
| Basic controls | [Multiple-selection list box](../demo/dist/widgets/multiselect.html) | Discontiguous selections, range selection and empty selection. |
| Basic controls | [Group boxes and labels](../demo/dist/widgets/groupbox.html) | Etched group, legend interrupting the border, labels, enabled and disabled groups. |
| Feedback and layout | [Horizontal and vertical sliders](../demo/dist/widgets/slider.html) | Horizontal/vertical, value, bounds, focus and disabled. |
| Feedback and layout | [Progress bars](../demo/dist/widgets/progress.html) | Determinate, indeterminate, complete and canceled. |
| Feedback and layout | [Scrollbars and scrolling regions](../demo/dist/widgets/scrollbars.html) | Two axes, thumb, track, focus and resizable viewport. |
| Feedback and layout | [Tooltips and status help](../demo/dist/widgets/tooltip.html) | Delayed hover/focus hint, Escape dismissal, supplemental status text. |
| Navigation and data | [Tabs and tab panels](../demo/dist/widgets/tabs.html) | Selected tab, inactive tabs, focus, persistent values in hidden panels. |
| Navigation and data | [Toolbar buttons and groups](../demo/dist/widgets/toolbar.html) | Commands, toggles, separator, disabled command and one Tab stop. |
| Navigation and data | [Tree view](../demo/dist/widgets/tree.html) | Expanded/collapsed branches, visible focus and single selection; children retain their state when a parent closes. |
| Navigation and data | [List view and sortable columns](../demo/dist/widgets/listview.html) | Details/icons, selected item, focus and ascending/descending sort; selection survives reordering. |
| Navigation and data | [Column header and resizing](../demo/dist/widgets/header.html) | Sort direction, bounded width, pointer resizing, focus and keyboard resizing. |
| Feedback and layout | [Resizable split panes](../demo/dist/widgets/splitter.html) | Bounded pane widths, pointer capture, keyboard focus and canceled drag. |
| Navigation and data | [Menu bar, submenus and recent files](../demo/dist/widgets/menus.html) | Menu-bar mode, dropdown, delayed pointer submenu, disabled item, check mark, exclusive radio mark and numbered inline MRU group. |
| Navigation and data | [Context menus](../demo/dist/widgets/context-menu.html) | Pointer and keyboard invocation, disabled command, bounded horizontal placement and focus restoration. |
| Windows and dialogs | [Modal dialog and focus restoration](../demo/dist/widgets/modal.html) | Closed/open modal, default action, validation, cancellation, inert background and restored focus. |
| Windows and dialogs | [Modeless Find dialog](../demo/dist/widgets/modeless.html) | Open without blocking the document, repeated search, wraparound, match-case and not found. |
| Windows and dialogs | [Property sheet with Apply and Cancel](../demo/dist/widgets/properties.html) | Cross-page draft, Apply enabled only when changed, OK commit/close, Cancel rollback since last Apply, explicit caption Close decision. |
| Windows and dialogs | [Message box and safe default](../demo/dist/widgets/message.html) | Question, destructive action, safe initial focus/default and explicit outcome. |
| Windows and dialogs | [Wizard with validation and backtracking](../demo/dist/widgets/wizard.html) | First/middle/final step, required input, preserved draft while going Back, Finish commit and Cancel discard. |
| Specialized controls | [Palette, color well and color dialog](../demo/dist/widgets/color.html) | Swatches, RGB values, preview draft, committed well, validation and cancel rollback. |
| Specialized controls | [Font dialog with sample](../demo/dist/widgets/font.html) | Family, size, bold/italic, live draft sample, commit and cancel. |
| Windows and dialogs | [Window shell, system menu, move and size](../demo/dist/widgets/window.html) | Active caption, system menu, normal/minimized/maximized/restored bounds, close/reopen, move/size and cancellation. |
| Host integrations | [Open file through the browser](../demo/dist/widgets/open-file.html) | No selection, chosen file, successful read, preview limit and read failure. Canceling the host picker keeps the existing document. |
| Host integrations | [Save file through the browser](../demo/dist/widgets/save-file.html) | Edited content/name and a real UTF-8 text download request. |
| Host integrations | [Print through the browser](../demo/dist/widgets/print.html) | Screen/print layouts and print-dialog lifecycle. |
| Specialized controls | [Hot-key input](../demo/dist/widgets/hotkey.html) | Recorded chord, empty value, canceled capture and invalid chord. |
| Host integrations | [Rich text editing boundary](../demo/dist/widgets/rich-text.html) | Editable rich content, selection, multiline input, browser clipboard and undo. |
| Specialized controls | [Animation display](../demo/dist/widgets/animation.html) | Static initial image, explicit play/stop and accessible description. |

## Reuse one example

1. Open its HTML file directly, or serve the gallery with <code>node demo/serve.mjs</code> and visit http://127.0.0.1:1995/widgets/.
2. Read its visible scope and keyboard notes. The file contains inline CSS and just that example’s initializer; no imports, external fonts, app engines, or network service are needed.
3. Copy the markup, relevant CSS, and initializer into the consuming project, scope the CSS, replace demonstration data/actions, and retain the MIT notice. The shared styles in a standalone page are a convenience, not a requirement to copy every selector.
4. Keep semantics, labels, selection, disabled/read-only behavior, validation, cancellation, focus restoration, and keyboard handling with the visuals. Replace example IDs when mounting multiple instances.
5. Verify the actual app at narrow widths, larger text, keyboard-only input, and 100/125/150/200% display scales. Native host controls, screen readers, browser differences and real persistence need their own checks.

Authoring sources are in [examples/widgets](../examples/widgets/README.md). Regenerate with <code>node tools/build-widget-examples.mjs</code>; check committed output with <code>node tools/build-widget-examples.mjs --check</code>. The [browser runner](../examples/widgets/check.mjs) verifies interactions and records its exact scope. See [the verification record](../examples/widgets/QA.md).

## Historical baseline and deliberate adaptations

The primary period baseline is Microsoft’s February 1995 **preliminary** guide, chapters 7–8, with edition qualifications in the [reading shelf](historical-sources.md). These examples demonstrate behavior contracts; their prose is not a quotation of the manual. The [historical audit](historical-audit-2026-10-18.md) records remaining issues in the older app-based recommendations.

The default palette represents classic system-color roles through CSS variables, not mandatory colors for every user. The 13 px system-font stack is an explicit modern readability choice, not a claim that original Windows used Tahoma at that size. Native HTML controls, HTML dialog, ARIA, pointer events, CSS resizing and SVG animation are browser adaptations. W3C APG links describe modern accessibility behavior; they are not historical evidence. Only transfer a pattern after checking its behavior in the intended host.

## Native and extended boundaries

- Open/Save/Print samples invoke working browser facilities. Browser security and settings determine paths, prompts, overwrite behavior and printer controls. For Electron, use a narrow preload/main-process adapter and the host’s actual dialogs; never pretend a download request proves a successful save.
- The rich-text page demonstrates browser editing, not RichEdit/RTF formatting, safe import or a production undo engine. Color/font dialogs are deliberately small draft/commit examples, not native enumeration, color management or full system custom-color stores.
- The window page demonstrates a bounded child shell, not native desktop chrome, MDI document management, docking or taskbar integration. The list view is single-selection and row-oriented, not an editable spreadsheet. The tree does not include multiselect or drag-and-drop.
- Image lists are represented by original glyphs/SVG in list/window/animation examples; no shared bitmap image-list API is supplied. Animation uses original SVG, not the native AVI control. Hot-key capture records a chord but does not register a system shortcut.
- Later date/time pickers, month calendars, rebar/coolbar controls, IP address fields, HTML/web views, modern touch widgets, and app-specific drawing canvases are outside this Windows 95 baseline. Add a dated extension rather than silently calling them original stock controls.

Retain browser/native accessibility unless there is a tested reason to replace it. There is no screen-reader or native-Win32 conformance certification for these samples.
