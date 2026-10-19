# GUI95 components 1.0.0

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

Use `.gui95` or `[data-gui95]` on the containing element. `enhance(root = document)` returns the same `{ root, destroy() }` controller for repeated calls with the same root. Destroy also cancels managed dialogs in that root and settles their result promises. Use separate, nonoverlapping roots. Dynamic markup needs a destroy/enhance cycle; the current API does not observe inserted nodes. IDs referenced by attributes must be unique in the document. Use native `disabled` for buttons and fields; `aria-disabled="true"` is supported for tree items and menu items.

Serve the directory over HTTP and open [gallery.html](gallery.html) for working examples, long labels, empty content, native fields and a state atlas. Common layout classes are `.window`, `.title-bar`, `.window-body`, `.status-bar`, `.toolbar`, `.field-row`, `.group-box`, `.dialog-layout`, `.dialog-body` and `.dialog-actions`. Keep the dialog body scrolling and actions outside it. CSS is scoped; it does not style the surrounding page.

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

Alt+mnemonic and F10 open menus; duplicate heading mnemonics cycle. Arrows, Home/End, Enter/Space, first-letter item mnemonics and Escape navigate; Tab closes and returns to normal navigation. Disabled commands are skipped. Use `role="menuitemcheckbox"` or `role="menuitemradio"` with `aria-checked` for checked commands; the stylesheet displays the check or option mark in normal, focused and disabled colors. Application commands own the checked value. Pointer press, drag and release are supported. Actual coordinate movement resumes pointer ownership after keyboard navigation; layout-induced hover does not steal it. Menus close for native modal dialogs and window blur/resize. Submenus flip left at the viewport edge.

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

`openDialog(dialog, { opener = document.activeElement, initialFocus } = {})` uses `showModal()` and returns a `Promise<string>` resolving to `dialog.returnValue`. `initialFocus` accepts an element or a selector within the dialog. An already active GUI95 dialog returns the same promise. `closeDialog(dialog, returnValue = '')` returns whether a lifecycle was closed, settles application state synchronously, restores focus and permits immediate reopen. The delayed native close event is a fallback for direct native closing. Prefer `closeDialog` for programmatic closes; direct `dialog.close()` settles when its native event arrives, or before an immediate `openDialog()` starts the next session. Native `form method="dialog"` submissions are supported.

Provide the accessible name and an initial focus choice. Nested dialogs restore their opener. Escape cancels the top dialog; repeated Escape is consumed until a fresh press. Native modality also makes an HTML frameless caption outside the dialog inert: verify actual desktop caption access in the target host. This component does not provide application-managed nonmodal modality.

## Toolbar

Add `data-gui95-toolbar` and an accessible label to a container of native buttons. Arrows and Home/End use a roving tab stop and skip unavailable controls. Changes to `disabled`, `aria-disabled`, `hidden` or `inert` within the toolbar automatically repair its Tab entry after the attribute mutation; this includes mixed buttons, inputs, selects and textareas. The current enabled entry is preserved when other controls become available again. Native input/select arrows retain value ownership. Space/Enter on toolbar buttons and native field input stay within the toolbar; repeated toggle activation is suppressed. Mark a toggle with `data-gui95-toggle` and `aria-pressed="false"`; add the same `data-gui95-toggle-group="tools"` to mutually exclusive tools. Toggles emit `gui95:toggle` with `{ pressed }`. Do not use this behavior on a button whose application code separately toggles the same ARIA state.

## Number fields

Use labelled `<input type="number" data-gui95-number min="0" max="100" step="1" value="10">`. Optional buttons use `data-gui95-step="input-id"` and `data-gui95-delta="1"` or `"-1"`; their accessible name must describe the operation. `commitNumber(input, { delta = 0 } = {})` reads the current draft, aligns its step, clamps its bounds and returns the committed number. Enter and blur commit; a step button settles the draft before applying the step. Empty or invalid drafts fall back to the minimum, or zero. `step="any"` preserves fractions and uses a one-unit explicit step. Input/change events fire for normalized text changes; `gui95:number-commit` carries `{ value }`. Readonly/disabled fields cannot be stepped.

## Trees

Use a `data-gui95-tree` container with an accessible label, nested `li role="treeitem"` and `ul role="group"`. Each item has a direct `[data-gui95-tree-label]`; a branch may include a `[data-gui95-disclosure]` span inside that label. Initial `aria-expanded="true"` expands a branch. The component maintains owned group visibility, roving focus and single selection. Attribute changes to disabled, hidden or inert state automatically keep one available row in the Tab sequence without changing the application selection; disabled ancestor branches also make their descendants unavailable. Up/Down navigate visible enabled items; Right expands then enters the first available child; Left collapses then returns to the parent; Home/End, Enter/Space and first-letter search work. Clicking disclosure or double-clicking the label expands. Events are `gui95:tree-select` with `{ item, id }` and `gui95:tree-expand` with `{ item, expanded }`. Drag/drop, editable labels and multiselection are application features.

## Splitters

A `[data-gui95-split]` container has exactly three direct children: first pane, `[data-gui95-splitter]`, second pane. `data-gui95-axis="x"` is left/right; `"y"` is top/bottom. Add an accessible label to the separator. Optional container attributes `data-gui95-position`, `data-gui95-min` and `data-gui95-min-secondary` are pixel values; minimums default to 80. Pointer capture supports dragging and cancellation; cancellation restores the drag start. Arrow keys move 10 px, Shift moves 1 px, Home/End reach bounds. ResizeObserver reclamps after container resizing. When there is insufficient space, the minimums relax to keep the separator reachable. `gui95:split` emits `{ value, axis }`.

## Verification

From `kit/`, run `npm ci`, `npx playwright install chromium`, then `npm run test:components`. The Chromium browser may already be cached. `node --test kit/test/components*.mjs` runs both behavior and runner cases from the repository root.

For a running consumer or the gallery, run `node kit/verify/runner.mjs http://127.0.0.1:PORT/components/gallery.html /absolute/output`. See [the runner contract](../verify/README.md). Screenshots require visual review; a passed browser assertion does not claim Windows fidelity, native window behavior or screen-reader coverage.
