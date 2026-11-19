# GUI95 components 1.2.0

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

Serve the directory over HTTP and open [gallery.html](gallery.html) for working examples, long labels, empty content, native fields and a state atlas. Common layout classes are `.window`, `.title-bar`, `.window-body`, `.status-bar`, `.toolbar`, `.field-row`, `.group-box`, `.dialog-layout`, `.dialog-body` and `.dialog-actions`. For a new dialog, property sheet or form, use the layout attributes in [Laying out a dialog](#laying-out-a-dialog) instead of `.field-row`, `.dialog-body` and `.dialog-actions`: they supply Windows 95's spacing, label alignment and button sizes. Keep the dialog body scrolling and actions outside it. CSS is scoped; it does not style the surrounding page.

The scope root and its descendants use `border-box` sizing, so a viewport-sized root can carry padding or borders without overflowing. Push buttons take their padding from `--gui95-pad-y` and `--gui95-pad-x`; pressed push, toolbar and caption buttons move their content one pixel down and right inside the same box. To give your own buttons different padding, set those two variables rather than `padding`, or pressing them will change their size. Menu items and `role="tab"` buttons do not sink when pressed. Menu-bar headings never sink either: a resting heading is flat gray, and an open heading, a heading held down with the pointer, and a heading with keyboard focus while a menu is open are a flat navy highlight with white text (including the underlined mnemonic), the same box and the label in the same place. The highlight replaces the dotted focus rectangle. An unavailable heading stays gray embossed and never highlights. This is GUI95's reading of the Windows 95 menu bar; the framed, raised or sunken heading belongs to later Windows versions. A focused text field or text area shows only its caret, as in Windows 95; buttons, sliders and other controls draw a dotted focus rectangle. Two controls place it as Windows did. A check box or option button with a label shows the rectangle round the label text, one pixel wider than the text on each side, and none round the box; the label must either wrap the box as its first child (`<label><input type="checkbox"> Wrap text</label>`) or follow it as the next element (`<input id="w" type="checkbox"><label for="w">Wrap text</label>`). A box with no label of its own, such as one named by `aria-label`, keeps a rectangle round the box. A label stretched across a layout row narrows to its text while it has the focus so the rectangle fits the text. A closed drop-down list with the focus fills its text area with navy, turns its text white and draws the rectangle round that area only, leaving the button alone. All of these follow `:focus-visible`, so they appear for keyboard focus. Selected text in the scope is white on navy. Check and option marks and submenu arrows on menu commands are pixel artwork in the item's colour with no generated text, so they stay out of the command's accessible name and do not depend on a symbol font; `aria-checked` carries the state.

The stylesheet holds four edge recipes as custom properties, each a two-line `box-shadow`. `--gui95-raised` is the edge of push buttons, caption buttons and tab pages: white outside and light gray inside on the top and left. `--gui95-raised-plain` is the edge of windows, dialogs, pop-up menus, scroll bar parts and spin arrows: light gray outside and white inside. `--gui95-sunken` is the edge of fields, lists and wells: gray outside and black inside. `--gui95-pressed` is a held or latched push button: black outside and gray inside. In all four the bottom and right lines own the top-right and bottom-left corner pixels, which is why each recipe lists its bottom-right shadows first. Use the recipe that matches the kind of surface; a window drawn with the button edge is a small but real difference from Windows 95.

## Density

The kit draws menus, title bars, list rows and a few other controls larger than Windows 95 did, because a 22px menu command is easier to hit with a trackpad on a modern display than a 17px one. `data-gui95-density` chooses between the two sets of sizes:

| Value | Sizes | Use it when |
| --- | --- | --- |
| `comfortable` (the default; the attribute may be left out) | The sizes GUI95 has always drawn. | The interface is used with a trackpad or touch screen, or you are not trying to match screenshots. |
| `period` | The sizes Windows 95 used, measured on a running copy at 96 dpi. | The interface should be the same size as the real thing, pixel for pixel. |

Put the attribute on the scope root, or on any element inside it. It applies to that element and everything in it, so one application can mix the two: a period dialog in a comfortable shell, or the reverse. A menu takes the density of the place it is in the document, not of the button that opens it.

```html
<body class="gui95" data-gui95-density="period">
  ...
  <section data-gui95-density="comfortable">a comfortable part of a period application</section>
</body>
```

**Period is the authentic one.** Comfortable stays the default so that existing applications do not change size, and because the period targets are small: a 17px menu command and a 13px list row are well under the 24px that current accessibility guidance asks of a pointer target. The period density adds no invisible padding to make up for that. If you choose it, you are choosing Windows 95's targets too.

What changes, in pixels (comfortable, then period):

| Control | Comfortable | Period |
| --- | --- | --- |
| Pop-up menu command | 22 high; text 26 from the menu's edge | 17 high; text 24 from the edge, one pixel above centre |
| Menu separator | 8 high, line 1px short at each end | 9 high, line the full width of the item |
| Menu check mark and submenu arrow | 7 from the item's edge | 6 from the edge; the arrow one pixel higher |
| Menu bar | 22 high, headings 20, 1px apart | 19 high, headings 18, touching, flush with the bar's top and sides |
| `.title-bar` | 20 high; buttons 3 from the top and right | 18 high with one line of face colour under it; buttons 2 from the top and right |
| `.window` frame | 3 | 4, the sizable window frame (`dialog` keeps the 3px dialog frame in both) |
| List box row (`role="option"`) | 16.84 high, text 3 in | 13 high, text 1 in |
| Drop-down list, closed | 23 high | 21 high |
| Option button | 12 × 12 | The same 12 × 12 artwork in a 13 × 13 box, as wide as a check box |
| `.status-bar` | 22.84 high, panes 18.84, 2px edge all round | 20 high, panes 18, no edge at the left, right or bottom |
| `role="tab"` | 20.84 high (selected 24.84) | 18 high (selected 22) |
| Toolbar button | 24 × 23, 2px apart | 24 × 22, touching |
| Group box caption (plain `fieldset`) | Text 13 from the frame's left, 4px clear each side | Text 9 from the left, 2px clear each side |
| Tree view | Rows 20 high, 25 a level; an 11px plus or minus box inside the label | Rows 16 high, 19 a level; a 9px box at the left of the row, outside the label, with dotted lines at every level |
| Buttons of [caption-controls.css](../../docs/caption-controls.md) | 18 × 18, 2px apart | 16 × 14, Minimize and Maximize touching, with the marks Windows 95 drew |
| Native list box (`select` with `size` or `multiple`) | Rows 14 high, 2px inside the frame | Rows 13 high, starting at the frame |
| Up-down control | Two 16px buttons that touch, 7 × 4 arrows | Two 15 × 9 buttons one pixel apart, 3 × 2 arrows |
| Slider thumb | A rectangle centred on the channel; dithered when unavailable | Pointed at the bottom (at the right when vertical), the channel 7px below its top; not drawn when unavailable |
| Toolbar | Buttons 3px in from the left and top | Buttons at the left edge, 2px down |

Push buttons, text fields, check boxes, progress bars, scroll bars and every [dialog layout measure](#the-measures) are the same in both. A dialog laid out with the layout attributes has the same margins, gaps and button sizes in either density; the one visible difference inside it is that a drop-down list is 21px high beside 23px text fields, as it was in Windows 95.

In the period density those controls set their text on a 13px line (`--gui95-text-cell`), the height of 8-point MS Sans Serif. In the comfortable density they keep whatever line height they inherit, as before. Either way a `line-height` rule of your own on a menu command, list row, tab, title bar or status pane still wins.

Toolbar buttons touch in the period density. Windows 95 set related buttons edge to edge and left a gap between groups; the kit has no group separator, so give the first button of a new group `margin-left:6px`.

Each size is a custom property, declared once with its comfortable value and once with its period value, so you can change one without leaving the density: for example `--gui95-menu-item-h:20px` on a menu. The properties are `--gui95-window-frame`, `--gui95-caption-h`, `--gui95-caption-pad`, `--gui95-caption-align`, `--gui95-caption-gap`, `--gui95-menubar-pad`, `--gui95-menubar-gap`, `--gui95-menubar-item-h`, `--gui95-menubar-item-drop`, `--gui95-menu-item-h`, `--gui95-menu-item-pad`, `--gui95-menu-check-x`, `--gui95-menu-arrow-x`, `--gui95-menu-odd`, `--gui95-menu-separator-margin`, `--gui95-list-row-pad`, `--gui95-drop-h`, `--gui95-drop-pad-y`, `--gui95-drop-arrow-x`, `--gui95-drop-arrow-y`, `--gui95-drop-arrow-off-y`, `--gui95-option-box`, `--gui95-option-at`, `--gui95-status-pad`, `--gui95-status-pane-pad`, `--gui95-tab-h`, `--gui95-tab-drop`, `--gui95-tab-lift`, `--gui95-toolbar-button-h`, `--gui95-toolbar-gap`, `--gui95-legend-shift`, `--gui95-legend-pad` and `--gui95-text-cell`.

Where the period numbers come from, what was measured and what was only read from documents, is in [the design guide](../../docs/design-guide.md#density-period-and-comfortable-sizes). [gallery.html](gallery.html) has two option buttons at the top that switch the whole page between the densities; `gallery.html?density=period` opens it in the period density.

## Primitives drawn by the stylesheet

These need no JavaScript. Write ordinary semantic markup inside the scope and the stylesheet replaces the host's drawing with hard edges and pixel artwork.

| Control | Markup | Drawn as |
| --- | --- | --- |
| Default push button | `<button class="default">` or `<button data-gui95-default>` | A 1px black frame as the outermost pixel of the button's own box, with the raised bevel one pixel further in, so a default button occupies and paints exactly the same rectangle as its neighbours. While pressed, the frame stays and the bevel becomes one gray line round a flat face, as Windows draws a pressed default button. |
| Read-only text field | `<input readonly>`, `<textarea readonly>` | Sunken field on the gray face `#c0c0c0` with black text. |
| Check box | `<input type="checkbox">` | 13px sunken white box with a pixel check mark; gray face when unavailable; dithered face for the mixed state (set `indeterminate` from script). While the mouse button is held on the box or its label the interior is the gray face; `data-gui95-state="pressed"` shows the same state for a static picture. Focus is drawn round the label: see above. |
| Option button | `<input type="radio">` | 12px pixel artwork with no CSS radius (in a 13px box in the [period density](#density)), in selected, unavailable and held variants; the interior is the gray face while the mouse button is held, as for a check box. |
| Drop-down list | `<select>` without `multiple` or `size` | Sunken field with a drawn 16px arrow button, which has the plain raised edge of a scroll arrow (light gray outside, white inside). With the keyboard focus and the list closed, the text area is navy with white text and a dotted rectangle; `data-gui95-state="focused"` shows the same state for a static picture. An unavailable list has an engraved arrow: gray with a white copy one pixel down and right, as on an unavailable up-down control. The opened list is still the host's popup, and opening, closing and Esc are the host's behaviour. |
| Slider | `<input type="range">` | 4px sunken channel and an 11 × 21 thumb with the `--gui95-raised` edge. |
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

Alt+mnemonic and F10 open menus; duplicate heading mnemonics cycle. Arrows, Home/End, Enter/Space, first-letter item mnemonics and Escape navigate; Tab closes and returns to normal navigation. The arrow keys, Home and End stop on unavailable commands as well, as Windows menus do: the item gets the navy bar with gray text and no engraving, and Enter, Space and its mnemonic do nothing. Only separators and hidden items are passed over. An `aria-disabled="true"` command takes the focus itself; a natively `disabled` button cannot, so its menu takes the focus, names the item with `aria-activedescendant` and marks it with `data-gui95-active` until the selection moves on (the component gives the item an `id` if it has none). The pointer does not highlight unavailable commands. Show a keyboard shortcut with `<button role="menuitem">Cut<span data-gui95-shortcut>Ctrl+X</span></button>`: shortcuts are left-aligned in one column for the whole menu, placed so the longest ends at the right edge, with a gap from the labels, and take the item's colour in normal, focused and unavailable states. The component measures the column each time a menu opens and sets `--gui95-shortcut-column` on it; a menu shown without the component right-aligns each shortcut. It is display text only; bind the shortcut in application code. Use `role="menuitemcheckbox"` or `role="menuitemradio"` with `aria-checked` for checked commands; the stylesheet draws a 7 × 7 check or a 6 × 6 option mark in the item's colour (white when focused) and embosses it in gray and white when the command is unavailable. Application commands own the checked value. Pointer press, drag and release are supported. The highlight follows the pointer at once, but a submenu opens only after the pointer has rested on its parent item for 400 ms, and an open submenu closes 400 ms after the pointer moves to another item, so the pointer can cut across the items between on its way into the submenu. A press on the parent item, and Right arrow or Enter, open it at once. Actual coordinate movement resumes pointer ownership after keyboard navigation; layout-induced hover does not steal it. Menus close for native modal dialogs and window blur/resize. Submenus flip left at the viewport edge.

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

## Laying out a dialog

Lay out every dialog, property sheet and settings form with the attributes below. They give Windows 95's margins, gaps, label alignment and button sizes from one set of measures, so a dialog needs no `gap`, `margin`, `padding` or button `width` of its own. If you find yourself writing a pixel value to space controls in a dialog, use one of these instead. They are opt-in: plain `dialog`, `button`, `fieldset`, `.dialog-body`, `.dialog-actions` and `.field-row` keep their earlier metrics, so existing markup does not move.

A dialog with its command buttons in a row along the bottom:

```html
<dialog data-gui95-dialog id="page-setup" aria-labelledby="page-setup-title">
  <form method="dialog" data-gui95-dialog-layout>
    <div class="title-bar" id="page-setup-title">Page Setup</div>
    <div data-gui95-dialog-body>
      <div data-gui95-form>
        <label for="paper">Paper size:</label>
        <select id="paper"><option>A4</option><option>Letter</option></select>
        <label for="header">Header text:</label>
        <input id="header" autofocus>
        <label for="notes">Notes:</label>
        <textarea id="notes" rows="3"></textarea>
      </div>
      <fieldset data-gui95-group>
        <legend>Orientation</legend>
        <label><input type="radio" name="orientation" checked> Portrait</label>
        <label><input type="radio" name="orientation"> Landscape</label>
      </fieldset>
      <label><input type="checkbox"> Print page numbers</label>
    </div>
    <div data-gui95-buttons>
      <button class="default" value="ok">OK</button>
      <button value="cancel" formnovalidate>Cancel</button>
      <button type="button">Help</button>
    </div>
  </form>
</dialog>
```

The same parts with the buttons stacked in a column at the upper right, OK above Cancel. Only the value of `data-gui95-dialog-layout` changes:

```html
<dialog data-gui95-dialog id="find" aria-labelledby="find-title">
  <form method="dialog" data-gui95-dialog-layout="side">
    <div class="title-bar" id="find-title">Find</div>
    <div data-gui95-dialog-body>
      <div data-gui95-form>
        <label for="find-what">Find what:</label>
        <input id="find-what" autofocus>
      </div>
      <label><input type="checkbox"> Match case</label>
    </div>
    <div data-gui95-buttons>
      <button class="default" value="find">Find Next</button>
      <button value="cancel" formnovalidate>Cancel</button>
    </div>
  </form>
</dialog>
```

| Attribute | Put it on | What it does |
| --- | --- | --- |
| `data-gui95-dialog-layout` | The element that holds the title bar (if any), the body and the buttons: a `<form>` or `<div>` inside a `<dialog>`, or a `.window`. Not the `<dialog>` element itself if you can avoid it. | Body above a bottom button row. `="side"` puts the button column to the right of the body. `="sheet"` is a property sheet: 4 units round the tab control instead of 7, as Windows 95 framed its pages (the 7-unit inset is inside each `data-gui95-page`). The body takes the spare height and scrolls; the buttons stay in view. |
| `data-gui95-dialog-body` | One child of the layout | The 7-unit margin on all four sides and a vertical stack of its children 4 units apart. The space between the body and the buttons is that same 7-unit margin. |
| `data-gui95-buttons` | One child of the layout, after the body | The command buttons. Every button in the set gets the same width: 50 units, or the width of the longest label if that is more, and the 14-unit height. A bottom row is right-aligned. `="center"` centres the row, as a message box does. `="column"` stacks a set anywhere else, for example beside a list. `="wizard"` takes exactly Back, Next (or Finish) and Cancel: Back and Next edge to edge, Cancel 10px away, 10px from the edges, as measured on Windows 95. |
| `data-gui95-form` | A container of alternating labels and fields | Two columns. Labels share a left edge, fields share a left edge and stretch to a shared right edge. Each label sits on the text line of its field; beside a `<textarea>` or list box that is the first line, so the label is at the top. A long label wraps inside its column, which never takes more than half the width. Up-down controls, number fields and buttons keep their own width. |
| `data-gui95-wide`, `data-gui95-indent` | A child of a form | `wide` spans both columns (a check box, a rule, a paragraph). `indent` starts in the field column with no label (help text under a field). |
| `data-gui95-top` | A field in a form that has no text of its own, such as a preview box | Top-aligns it with its label. `<canvas>`, `<img>` and `<svg>` get this without the attribute; sliders and progress bars are centred on their label. |
| `data-gui95-stack` | Any container | Children in a column 4 units apart. `="group"` uses 7 units, for unrelated blocks. `="tight"` uses 1 unit, for a label directly above its field. |
| `data-gui95-row` | Any container | Children in a row 4 units apart, centred on each other, wrapping when they do not fit. `="group"` uses 7 units between them. |
| `data-gui95-fill` | A child of a body, stack or row | Takes the spare space: a text field beside a Browse button, or a list that should grow with the dialog. |
| `data-gui95-group` | A `<fieldset>` with a `<legend>` | A group box. The caption text starts 7px from the frame's left edge, the first control is 11 units below the top of the box, the inner margin is 6 units, and the contents are 4 units apart. |
| `data-gui95-page` | A `role="tabpanel"` | A property page with the 7-unit inset whose contents are 4 units apart. `="small"`, `="medium"` or `="large"` also gives it one of the three page sizes Windows recommended: 212 × 188, 227 × 215 or 252 × 218 units (318 × 306, 341 × 349 or 378 × 354px). |
| `data-gui95-check` | A `<label>` that wraps a check box or option button, when it is not a direct child of one of the containers above | Keeps the box on the first line of a label that wraps. Inside the containers above this happens without the attribute. |

A property sheet is the bottom-row layout with the tabs in the body and OK, Cancel and Apply outside the pages:

```html
<div data-gui95-dialog-layout>
  <div class="title-bar">Display Properties</div>
  <div data-gui95-dialog-body>
    <div>
      <div role="tablist" aria-label="Display properties">
        <button role="tab" id="tab-background" aria-controls="page-background" aria-selected="true">Background</button>
        <button role="tab" id="tab-settings" aria-controls="page-settings">Settings</button>
      </div>
      <div role="tabpanel" id="page-background" aria-labelledby="tab-background" data-gui95-page="small">…</div>
      <div role="tabpanel" id="page-settings" aria-labelledby="tab-settings" data-gui95-page="small">…</div>
    </div>
  </div>
  <div data-gui95-buttons><button class="default">OK</button><button>Cancel</button><button disabled>Apply</button></div>
</div>
```

Rules the attributes cannot apply for you:

- Order the buttons OK, Cancel, Apply, Help. The default button comes first; mark it with `class="default"`. Help, if there is one, is last.
- End a field's label with a colon. Labels on buttons, tabs, group boxes, check boxes and option buttons have none.
- Put a button that acts on one field next to that field (a `data-gui95-row` in the field column), not in the command set.
- Do not set a width on a command button. If one label is much longer than the rest, shorten it; the set grows to fit the longest label.

### The measures

Windows 95 laid dialogs out in dialog units, not pixels: horizontally a quarter of the dialog font's average character width, vertically an eighth of its height. The kit declares the two units once, at the top of the dialog-layout block in `gui95.css`, and derives every measure from them, rounded to a whole pixel:

| Custom property | Units | Pixels | Used for |
| --- | --- | --- | --- |
| `--gui95-du-x`, `--gui95-du-y` | 1 | 1.5, 1.625 | The horizontal and vertical dialog unit |
| `--gui95-dlg-margin-x`, `--gui95-dlg-margin-y` | 7 | 11, 11 | Window edge to contents; body to buttons; property-page inset; `="group"` gaps |
| `--gui95-dlg-gap-x`, `--gui95-dlg-gap-y` | 4 | 6, 6 | Between controls, between label and field, between buttons |
| `--gui95-dlg-control-h` | 14 | 23 | Height of a command button (fields already have this height) |
| `--gui95-dlg-button-w` | 50 | 75 | Least width of a command button |
| `--gui95-dlg-tight-y` | 1 | 2 | A label directly above its field |
| `--gui95-dlg-group-x`, `--gui95-dlg-group-bottom` | 6 | 9, 10 | Group box frame to its contents |
| `--gui95-dlg-group-top` | 11 | 18 | Top of a group box to its first control |

**The pixel values rest on an assumption.** They take 8-point MS Sans Serif at 96 dpi, which the kit's 11px control text stands for, to have a 6 × 13px character cell. That has not yet been checked against a running copy of Windows 95; a capture may correct it. To change a measure, override its custom property on the scope root, or change the two units; do not put corrected pixel values into individual rules. Four vertical units are 6.5px and are rounded down to 6, so that a 14-unit control plus its gap comes to 29px, the nearest whole pixel to Windows' 18-unit pitch of 29.25px. The sources of each measure, and where they disagree, are in [the design guide](../../docs/design-guide.md#dialog-layout-measures).

The measures are whole CSS pixels, so edges are exact at 100% and 200% display scale. At 150% a 6px gap is exactly 9 device pixels, but 11px, 23px and 75px fall on half pixels (16.5, 34.5 and 112.5); at 125% every measure is fractional (7.5, 13.75, 28.75 and 93.75). Chromium snaps each edge to a device pixel, so nothing blurs, but two gaps that are equal at 100% can differ by one device pixel: measured at 125%, three 6px button gaps came to 8, 8 and 7 device pixels. The same already applies to every other box in the kit. A browser without CSS `round()` (Chromium before 125, Firefox before 118, Safari before 15.4) gets the same whole-pixel measures from a fallback rule.

### When content does not fit

- A label longer than its column wraps; the fields keep their shared edges. The label column takes at most half of the form.
- A command button never clips its label. The whole set widens to the longest label, and if the dialog is too narrow for that, labels wrap and the row's buttons grow taller together.
- A bottom row does not wrap onto a second line. A dialog narrower than its buttons (about 75px per button, plus gaps and margins) scrolls sideways; use fewer buttons or the `side` layout.
- A body taller than the space available scrolls on its own, and the buttons stay in view. Give a list or text area `data-gui95-fill` if it should absorb the height instead.
- A check box or option-button label that wraps keeps its box on the first line and its text aligned under itself.

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

Use a `data-gui95-tree` container with an accessible label, nested `li role="treeitem"` and `ul role="group"`. Each item has a direct `[data-gui95-tree-label]`; a branch may include a `[data-gui95-disclosure]` span inside that label. In the [period density](#density) that span is drawn as the 9px box at the left of the row, so the selection covers the label text alone, and the plus or minus comes from `aria-expanded`, not from the span's text. Initial `aria-expanded="true"` expands a branch. The component maintains owned group visibility, roving focus and single selection. Attribute changes to disabled, hidden or inert state automatically keep one available row in the Tab sequence without changing the application selection; disabled ancestor branches also make their descendants unavailable. Up/Down navigate visible enabled items; Right expands then enters the first available child; Left collapses then returns to the parent; Home/End, Enter/Space and first-letter search work. Clicking disclosure or double-clicking the label expands. Events are `gui95:tree-select` with `{ item, id }` and `gui95:tree-expand` with `{ item, expanded }`. Drag/drop, editable labels and multiselection are application features.

## Splitters

A `[data-gui95-split]` container has exactly three direct children: first pane, `[data-gui95-splitter]`, second pane. `data-gui95-axis="x"` is left/right; `"y"` is top/bottom. Add an accessible label to the separator. Optional container attributes `data-gui95-position`, `data-gui95-min` and `data-gui95-min-secondary` are pixel values; minimums default to 80. Pointer capture supports dragging and cancellation; cancellation restores the drag start. Arrow keys move 10 px, Shift moves 1 px, Home/End reach bounds. ResizeObserver reclamps after container resizing. When there is insufficient space, the minimums relax to keep the separator reachable. `gui95:split` emits `{ value, axis }`.

## Verification

From `kit/`, run `pnpm install --frozen-lockfile`, `pnpm exec playwright install chromium`, then `pnpm run test:components`. The Chromium browser may already be cached. `node --test kit/test/components*.mjs` runs both behavior and runner cases from the repository root.

Run the period lint against any running page with `node kit/verify/period-lint.mjs http://127.0.0.1:PORT/`. It reports rounded corners, blurred shadows, translucency, transitions, hand cursors, keyword bevels, host-drawn controls, modern system fonts, control text that is not 11px and dimmed dialog backdrops inside the GUI95 scope, each with the classic treatment to use instead. The gallery must pass it.

Run `node kit/cli.mjs atlas` (or `node kit/verify/atlas.mjs`, or `pnpm run test:atlas` in `kit/`) after changing `gui95.css`. It renders [atlas.html](atlas.html), every stylesheet-drawn control state on a fixed grid, in headless Chromium and compares it pixel for pixel with `test/baseline/state-atlas.png`, then does the same in the [period density](#density) against `test/baseline/state-atlas-period.png`; `--density period` or `--density comfortable` checks one of them. `--update` accepts an intended change once you have looked at the difference image it writes. Text is deliberately left out so the image does not depend on fonts. It is a rendering regression check, not proof of Windows 95 fidelity. See [the state atlas](../verify/README.md#state-atlas).

For a running consumer or the gallery, run `node kit/verify/runner.mjs http://127.0.0.1:PORT/components/gallery.html /absolute/output`. See [the runner contract](../verify/README.md). Screenshots require visual review; a passed browser assertion does not claim Windows fidelity, native window behavior or screen-reader coverage.
