# GUI95 components 1.1.0

Independent vanilla components with scoped CSS and native HTML controls. This is a maintained implementation informed by [the visual guide](../../docs/design-guide.md) and [integration lessons](../../docs/integration-lessons.md), separate from the preserved reference sources. No framework, font download, or global application shortcut handler is required.

```html
<link rel="stylesheet" href="./components/gui95.css">
<body class="gui95">
  <!-- semantic application markup -->
  <script type="module">
    import { enhance } from './components/gui95.mjs';
    const controls = enhance();
    // controls.destroy() before removing or rebuilding the enhanced root.
  </script>
</body>
```

Use `.gui95` or `[data-gui95]` on the containing element. `enhance(root = document)` returns the same `{ root, destroy() }` controller for repeated calls with the same root. Destroy also cancels managed dialogs in that root and settles their result promises. Use separate, nonoverlapping roots. Dynamic markup needs a destroy/enhance cycle; the current API does not observe inserted nodes. IDs referenced by attributes must be unique in the document. Use native `disabled` for buttons and fields; `aria-disabled="true"` is supported for tree items, menu items, tabs and list box options.

Serve the directory over HTTP and open [gallery.html](gallery.html) for working examples, long labels, empty content, native fields and a state atlas. Common layout classes are `.window`, `.title-bar`, `.window-body`, `.status-bar`, `.toolbar`, `.field-row`, `.group-box`, `.dialog-layout`, `.dialog-body` and `.dialog-actions`. Keep the dialog body scrolling and actions outside it. CSS is scoped; it does not style the surrounding page.

The scope root and its descendants use `border-box` sizing, so a viewport-sized root can carry padding or borders without overflowing. Push buttons take their padding from `--gui95-pad-y` and `--gui95-pad-x`; pressed push, toolbar and caption buttons move their content one pixel down and right inside the same box. To give your own buttons different padding, set those two variables rather than `padding`, or pressing them will change their size. Menu items and `role="tab"` buttons do not sink when pressed. Menu-bar headings never sink either: a resting heading is flat gray, and an open heading, a heading held down with the pointer, and a heading with keyboard focus while a menu is open are a flat navy highlight with white text (including the underlined mnemonic), the same box and the label in the same place. The highlight replaces the dotted focus rectangle. An unavailable heading stays gray embossed and never highlights. This is GUI95's reading of the Windows 95 menu bar; the framed, raised or sunken heading belongs to later Windows versions. A focused text field or text area shows only its caret, as in Windows 95; buttons, check boxes, option buttons, sliders, drop-down lists and other controls draw a dotted focus rectangle. Selected text in the scope is white on navy. Check and option marks and submenu arrows on menu commands are pixel artwork in the item's colour with no generated text, so they stay out of the command's accessible name and do not depend on a symbol font; `aria-checked` carries the state.

## Primitives drawn by the stylesheet

These need no JavaScript. Write ordinary semantic markup inside the scope and the stylesheet replaces the host's drawing with hard edges and pixel artwork.

| Control | Markup | Drawn as |
| --- | --- | --- |
| Default push button | `<button class="default">` or `<button data-gui95-default>` | Raised bevel with a 1px black frame outside it, kept when pressed; the button's size does not change. |
| Read-only text field | `<input readonly>`, `<textarea readonly>` | Sunken field on the gray face `#c0c0c0` with black text. |
| Check box | `<input type="checkbox">` | 13px sunken white box with a pixel check mark; gray face when unavailable; dithered face for the mixed state (set `indeterminate` from script). |
| Option button | `<input type="radio">` | 12px pixel artwork with no CSS radius, in selected and unavailable variants. |
| Drop-down list | `<select>` without `multiple` or `size` | Sunken field with a drawn 16px arrow button. The opened list is still the host's popup. |
| Slider | `<input type="range">` | 4px sunken channel and an 11 × 21 raised thumb. |
| Vertical slider | `<input type="range" aria-orientation="vertical">` with `writing-mode: vertical-lr; direction: rtl` | 4px-wide sunken channel and a 21 × 11 thumb centred on it. |
| Progress bar | `<progress value max>` | Navy blocks in a sunken gray well. Without `value` (indeterminate) the well shows a still 2px white and gray dither, with no animation. |
| List box | `role="listbox"` with `role="option"` children | Sunken white well; `aria-selected="true"` is navy with white text. While the list has focus, its active option alone has a dotted focus rectangle. Behaviour: [List box](#list-box). |
| List-style select | `<select size>` or `<select multiple>` | Sunken white well; selected options are navy with white text (a navy gradient image, because Chromium ignores an author background colour there). |
| Property tabs | `role="tablist"`, `role="tab"` buttons, `role="tabpanel"` | Open-bottomed tabs with stepped top corners. The tab with `aria-selected="true"` is 2px larger on every side and alone covers the page's top edge. Behaviour: [Tabs](#tabs). |
| Scrollbars | any scrolling element in the scope | 16px bars with one arrow button at each end, a raised thumb and a dithered track (Chromium and other WebKit-style engines). |
| Number field | `<input type="number">` | Sunken white field; the browser's own spin arrows are hidden on every number field in the scope. Add buttons with an [up-down control](#up-down-control). |
| Rule | `<hr>` | Etched gray and white line. |

The stylesheet draws the state your attributes declare; `enhance()` adds the keyboard, pointer and selection behaviour for [tabs](#tabs) and [list boxes](#list-box). Put the tab panel directly after its tab list. Give tabs different padding through `--gui95-pad-y` and `--gui95-pad-x`. A scope on `<body>` does not restyle the viewport's own scrollbar, which belongs to the root element; scroll an inner pane instead. Scrollbar parts are hidden in Playwright's headless Chromium, so review them in a headed browser.

## Menus

```html
<nav data-gui95-menubar aria-label="Application">
  <button data-gui95-menu="file-menu" data-gui95-mnemonic="f"><u>F</u>ile</button>
</nav>
<div id="file-menu" role="menu" hidden aria-label="File">
  <button role="menuitem" data-command="new">New</button>
  <button role="menuitem" disabled>Save</button>
  <div role="separator"></div>
  <button role="menuitem" data-gui95-menu="export-menu">Export</button>
</div>
<div id="export-menu" role="menu" hidden aria-label="Export">
  <button role="menuitem" data-command="png">PNG image</button>
</div>
```

Menu items are direct children of their popup; put each popup anywhere inside the enhanced root. The enhancement sets `aria-controls`, `aria-haspopup`, `aria-expanded` and temporary positions. Implement application commands with ordinary `click` listeners or a shared command registry; activation also emits `gui95:command` with `{ id }`. It does not implement save, undo or other application semantics.

Alt+mnemonic and F10 open menus; duplicate heading mnemonics cycle. Arrows, Home/End, Enter/Space, first-letter item mnemonics and Escape navigate; Tab closes and returns to normal navigation. Disabled commands are skipped. Show a keyboard shortcut with `<button role="menuitem">Cut<span data-gui95-shortcut>Ctrl+X</span></button>`: the shortcut is pushed to the right edge with a gap from the label and takes the item's colour in normal, focused and unavailable states. It is display text only; bind the shortcut in application code. Use `role="menuitemcheckbox"` or `role="menuitemradio"` with `aria-checked` for checked commands; the stylesheet draws a 7 × 7 check or a 6 × 6 option mark in the item's colour (white when focused) and embosses it in gray and white when the command is unavailable. Application commands own the checked value. Pointer press, drag and release are supported. Actual coordinate movement resumes pointer ownership after keyboard navigation; layout-induced hover does not steal it. Menus close for native modal dialogs and window blur/resize. Submenus flip left at the viewport edge.

## Native dialogs

```html
<button data-gui95-open-dialog="settings">Settings…</button>
<dialog data-gui95-dialog id="settings" aria-labelledby="settings-title">
  <h2 id="settings-title">Settings</h2>
  <label>Name <input autofocus></label>
  <button data-gui95-close-dialog="ok">OK</button>
  <button data-gui95-close-dialog="cancel">Cancel</button>
</dialog>
```

`openDialog(dialog, { opener = document.activeElement, initialFocus } = {})` uses `showModal()` and returns a `Promise<string>` resolving to `dialog.returnValue`. `initialFocus` accepts an element or a selector within the dialog. An already active GUI95 dialog returns the same promise. `closeDialog(dialog, returnValue = '')` returns whether a lifecycle was closed, settles application state synchronously, restores focus and permits immediate reopen. The delayed native close event is a fallback for direct native closing. Prefer `closeDialog` for programmatic closes; direct `dialog.close()` settles when its native event arrives, or before an immediate `openDialog()` starts the next session. Native `form method="dialog"` submissions are supported and close with the submitter's `value`. The runtime decides at the window, after listeners on the form, dialog and document: a submit listener there that calls `preventDefault()`, for example to reject invalid input, keeps the dialog open. A submit listener added to `window` after `enhance()` runs too late to stop the close.

Provide the accessible name and an initial focus choice. Nested dialogs restore their opener. Escape cancels the top dialog; repeated Escape is consumed until a fresh press. Tab and Shift+Tab wrap among the top dialog's own tabbable, enabled and visible controls (Chromium otherwise lets Tab leave a modal dialog for the page); a lower nested dialog does not wrap until it is on top again. Native modality also makes an HTML frameless caption outside the dialog inert: verify actual desktop caption access in the target host. This component does not provide application-managed nonmodal modality.

## Toolbar

Add `data-gui95-toolbar` and an accessible label to a container of native buttons. Arrows and Home/End use a roving tab stop and skip unavailable controls. Changes to `disabled`, `aria-disabled`, `hidden` or `inert` within the toolbar automatically repair its Tab entry after the attribute mutation; this includes mixed buttons, inputs, selects and textareas. The current enabled entry is preserved when other controls become available again. Native input/select arrows retain value ownership. Space/Enter on toolbar buttons and native field input stay within the toolbar; repeated toggle activation is suppressed. Mark a toggle with `data-gui95-toggle` and `aria-pressed="false"`; add the same `data-gui95-toggle-group="tools"` to mutually exclusive tools. Toggles emit `gui95:toggle` with `{ pressed }`. Do not use this behavior on a button whose application code separately toggles the same ARIA state.

## Number fields

Use labelled `<input type="number" data-gui95-number min="0" max="100" step="1" value="10">`. Optional buttons use `data-gui95-step="input-id"` and `data-gui95-delta="1"` or `"-1"`; their accessible name must describe the operation. `commitNumber(input, { delta = 0 } = {})` reads the current draft, aligns its step, clamps its bounds and returns the committed number. Enter and blur commit; Enter then continues, so it still submits an enclosing `<form>` (including `method="dialog"`) and reaches listeners further up. Up and Down in the field, like a step button, settle the draft before applying one step. Empty or invalid drafts fall back to the minimum, or zero. `step="any"` preserves fractions and uses a one-unit explicit step. Input/change events fire for normalized text changes; `gui95:number-commit` carries `{ value }`. Readonly/disabled fields cannot be stepped.

### Up-down control

```html
<label for="copies">Copies:</label>
<span data-gui95-spin>
  <input id="copies" type="number" data-gui95-number min="1" max="99" value="1">
  <button data-gui95-step="copies" data-gui95-delta="1" aria-label="Increase copies"></button>
  <button data-gui95-step="copies" data-gui95-delta="-1" aria-label="Decrease copies"></button>
</span>
```

The wrapper draws the two step buttons as a stacked pair of 16px raised buttons at the right edge inside the sunken field, with pixel up and down arrows, a flat pressed state and gray arrows when the field is disabled or read-only. The runtime sets `tabindex="-1"` on both buttons, so the field is the only Tab stop; clicking a button keeps focus in the field. Holding a button does not auto-repeat. Button text is not drawn, so the accessible name must come from `aria-label`.

## Tabs

```html
<div role="tablist" aria-label="Display properties">
  <button role="tab" id="tab-general" aria-controls="page-general" aria-selected="true">General</button>
  <button role="tab" id="tab-colors" aria-controls="page-colors">Colors</button>
</div>
<div role="tabpanel" id="page-general" aria-labelledby="tab-general">…</div>
<div role="tabpanel" id="page-colors" aria-labelledby="tab-colors">…</div>
```

`enhance()` manages every `[role="tablist"]` in its root. The selected tab is the only Tab stop (roving `tabindex`); `aria-selected` stays current, the panel named by the selected tab's `aria-controls` is shown and the other tabs' panels are `hidden`. The first available tab is selected when none is. Left/Right and Up/Down move to the previous or next tab and select it, wrapping; Home/End select the first and last; clicking selects. Ctrl+Tab / Ctrl+Shift+Tab and Ctrl+PageDown / Ctrl+PageUp from the tab list or anywhere inside its panels switch pages and focus the new tab; browsers reserve these chords, so they matter in hosts such as Electron. Tabs that are `disabled`, `aria-disabled="true"` or hidden are skipped. A change emits `gui95:tab-select` on the tab list with `{ tab, panel, id }`. Panels are found once, when `enhance()` runs; rebuild with a destroy/enhance cycle.

## List box

```html
<ul role="listbox" aria-label="Fonts">
  <li role="option" id="font-arial">Arial</li>
  <li role="option" id="font-tahoma" aria-selected="true">Tahoma</li>
</ul>
```

`enhance()` manages each single-selection `[role="listbox"]` (lists with `aria-multiselectable="true"` are left to the application). The list is one Tab stop (`tabindex="0"` unless you set one) and `aria-activedescendant` names the active option; options without an `id` get a generated `gui95-option-N` id. Up/Down, Home/End, PageUp/PageDown and first-letter type-ahead move and select; selection follows the active option. Clicking an option selects it and focuses the list. Options with `aria-disabled="true"` or `hidden` are skipped. The selected option is scrolled into view inside the list without scrolling the page. A change emits `gui95:list-select` on the list with `{ option, id }`. Options are read when a key or click arrives; after adding or removing options, run a destroy/enhance cycle so the active option is recalculated.

## Trees

Use a `data-gui95-tree` container with an accessible label, nested `li role="treeitem"` and `ul role="group"`. Each item has a direct `[data-gui95-tree-label]`; a branch may include a `[data-gui95-disclosure]` span inside that label. Initial `aria-expanded="true"` expands a branch. The component maintains owned group visibility, roving focus and single selection. Attribute changes to disabled, hidden or inert state automatically keep one available row in the Tab sequence without changing the application selection; disabled ancestor branches also make their descendants unavailable. Up/Down navigate visible enabled items; Right expands then enters the first available child; Left collapses then returns to the parent; Home/End, Enter/Space and first-letter search work. Clicking disclosure or double-clicking the label expands. Events are `gui95:tree-select` with `{ item, id }` and `gui95:tree-expand` with `{ item, expanded }`. Drag/drop, editable labels and multiselection are application features.

## Splitters

A `[data-gui95-split]` container has exactly three direct children: first pane, `[data-gui95-splitter]`, second pane. `data-gui95-axis="x"` is left/right; `"y"` is top/bottom. Add an accessible label to the separator. Optional container attributes `data-gui95-position`, `data-gui95-min` and `data-gui95-min-secondary` are pixel values; minimums default to 80. Pointer capture supports dragging and cancellation; cancellation restores the drag start. Arrow keys move 10 px, Shift moves 1 px, Home/End reach bounds. ResizeObserver reclamps after container resizing. When there is insufficient space, the minimums relax to keep the separator reachable. `gui95:split` emits `{ value, axis }`.

## Verification

From `kit/`, run `pnpm install --frozen-lockfile`, `pnpm exec playwright install chromium`, then `pnpm run test:components`. The Chromium browser may already be cached. `node --test kit/test/components*.mjs` runs both behavior and runner cases from the repository root.

Run the period lint against any running page with `node kit/verify/period-lint.mjs http://127.0.0.1:PORT/`. It reports rounded corners, blurred shadows, translucency, transitions, hand cursors, keyword bevels, host-drawn controls, modern system fonts, control text that is not 11px and dimmed dialog backdrops inside the GUI95 scope, each with the classic treatment to use instead. The gallery must pass it.

Run `node kit/cli.mjs atlas` (or `node kit/verify/atlas.mjs`, or `pnpm run test:atlas` in `kit/`) after changing `gui95.css`. It renders [atlas.html](atlas.html), every stylesheet-drawn control state on a fixed grid, in headless Chromium and compares it pixel for pixel with `test/baseline/state-atlas.png`; `--update` accepts an intended change once you have looked at the difference image it writes. Text is deliberately left out so the image does not depend on fonts. It is a rendering regression check, not proof of Windows 95 fidelity. See [the state atlas](../verify/README.md#state-atlas).

For a running consumer or the gallery, run `node kit/verify/runner.mjs http://127.0.0.1:PORT/components/gallery.html /absolute/output`. See [the runner contract](../verify/README.md). Screenshots require visual review; a passed browser assertion does not claim Windows fidelity, native window behavior or screen-reader coverage.
