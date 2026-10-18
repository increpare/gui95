# Widget catalogue

Use this map to find the source for a control, then read its CSS and interaction code together. All links below point to the preserved local edition. Search terms are stable entry points; the modules remain coupled to their original apps.

Before extracting menus, dialogs, tabs, previews, or scrollbars, check the [later integration lessons](integration-lessons.md). The table locates archived implementations; it does not imply that later consumer fixes are present in those snapshots or available here as standalone components.

## Core controls

| Pattern | Reference | Search for | What makes it useful |
| --- | --- | --- | --- |
| Raised and sunken edges | [Vector95 CSS](../references/vector95/src/classic.css) | `--raised-lines`, `--sunken-lines` | Hard color stops and separate inner/outer edges |
| Push buttons and focus | [Vector95 CSS](../references/vector95/src/classic.css) | `button:active`, `button:focus-visible` | Press feedback, dotted focus, disabled embossing |
| Persistent tool buttons | [Vector95 CSS](../references/vector95/src/classic.css) | `.command-group button.active` | Sunken border plus checkerboard face; later cascade rules matter |
| Radio transport buttons | [Radio CSS](../references/sausage-music/web/site/radio.css) | `.key`, `.key.on` | Text with small transport glyphs and persistent state |
| Text and number fields | [Vector95 CSS](../references/vector95/src/classic.css) | `input[type="number"]` | Compact white sunken fields |
| Checkbox | [Vector95 CSS](../references/vector95/src/classic.css) | `input[type="checkbox"]` | 13 px face and drawn check mark |
| Slider | [Radio CSS](../references/sausage-music/web/site/radio.css) | `.vol input` | Separate Chromium and Firefox thumb/track styling |
| Group boxes | [Radio CSS](../references/sausage-music/web/site/radio.css) | `fieldset`, `legend` | Etched grouping with an interrupted border at the label |
| Segmented progress | [Radio CSS](../references/sausage-music/web/site/radio.css), [logic](../references/sausage-music/web/site/radio.js) | `.progress i`, `renderTime` | Repeating navy blocks plus `aria-valuenow` updates |
| Scrollbars | [Vector95 CSS](../references/vector95/src/classic.css), [arrow definitions](../references/vector95/src/generated/svg-assets.css) | `::-webkit-scrollbar` | Dithered track, raised thumb, separate arrow glyphs |

## Windows and workspace

| Pattern | Reference | Search for | What to preserve |
| --- | --- | --- | --- |
| App caption and controls | [Vector95 CSS](../references/vector95/src/classic.css), [markup](../references/vector95/index.html) | `.app-titlebar`, `.app-controls` | Compact caption, close-button spacing, drag/no-drag regions |
| Child document windows | [Vector95 app](../references/vector95/src/app.js), [CSS](../references/vector95/src/classic.css) | `addDocument`, `activateDocument`, `.mdi-window` | Active document, caption state, stacking, document identity |
| Moving and sizing | [Vector95 app](../references/vector95/src/app.js) | `startWindowDrag`, `applyWindowRect` | Pointer lifecycle and stored bounds |
| Minimize and maximize | [Vector95 app](../references/vector95/src/app.js) | `windowAction`, `setMdiMaximized`, `syncFrame` | Restored geometry and changed caption controls |
| Tiling and cascading | [Vector95 app](../references/vector95/src/app.js) | `arrangeWindows` | Arrangement within the desktop workspace |
| Document tabs | [Vector95 app](../references/vector95/src/app.js), [CSS](../references/vector95/src/classic.css) | `renderTabs`, `.doc-tab` | Active and dirty indicators |
| Inspector and resizers | [Vector95 CSS](../references/vector95/src/classic.css), [app](../references/vector95/src/app.js) | `#inspector-resizer`, `#toolbox-resizer` | Bounded panes and visible keyboard focus |
| Player window shell | [Radio markup](../references/sausage-music/web/site/radio.html), [logic](../references/sausage-music/web/site/radio.js) | `windowAction`, `applyWindowState` | System menu and browser/desktop distinctions |
| Native player window sizing | [Window controls](../references/sausage-music/web/electron/window_controls.js), [preload](../references/sausage-music/web/electron/preload.js) | `installWindowControls`, `resizeBounds` | Desktop IPC boundary and resize constraints |

## Menus and navigation

| Pattern | Reference | Search for | What to preserve |
| --- | --- | --- | --- |
| Full menu system | [Vector95 menus](../references/vector95/src/menus.js) | `createMenus`, `mnemonic`, `openSubmenu` | Mnemonics, disabled items, arrows, Escape, pointer tracking, focus restoration |
| Small menu system | [Radio markup](../references/sausage-music/web/site/radio.html), [logic](../references/sausage-music/web/site/radio.js) | `details`, `closeMenus`, `openMenu` | Native disclosure elements plus explicit menu handling |
| Menu search | [Command search](../references/vector95/src/command-search.js), [menus](../references/vector95/src/menus.js) | `findMenuCommands`, `searchResultsMarkup` | Discoverability with command activation and reveal; a modern extension |
| Toolbar and status help | [Status help](../references/vector95/src/status-help.js), [app wiring](../references/vector95/src/app.js) | `createStatusHelp`, `describe`, `statusHelp` | Hover/focus precedence and restoration of the ordinary status message |
| List selection | [Radio logic](../references/sausage-music/web/site/radio.js), [CSS](../references/sausage-music/web/site/radio.css) | `refreshSelection`, `row`, `.row.selected` | Selection separate from current playback; roving tab stop and arrows |
| Property tabs | [Radio logic](../references/sausage-music/web/site/radio.js), [CSS](../references/sausage-music/web/site/radio.css) | `selectView`, `.library-tabs` | Arrow/Home/End navigation and tab panel visibility |
| Splitter | [Radio logic](../references/sausage-music/web/site/radio.js), [CSS](../references/sausage-music/web/site/radio.css) | `aria-valuemin`, `.splitter` | Keyboard resizing, pointer resizing, orientation and accessible values |
| Layer hierarchy | [Layer UI](../references/vector95/src/layer-ui.js), [CSS](../references/vector95/src/classic.css) | `.layer-row`, `data-drop` | Expansion, visibility, locking, selection, and drop positions |

## Dialogs and specialized controls

| Pattern | Reference | Search for | What to preserve |
| --- | --- | --- | --- |
| Dialog shell | [Vector95 CSS](../references/vector95/src/classic.css), [markup](../references/vector95/index.html) | `dialog`, `.dialog-title`, `.dialog-buttons .primary` | Native dialog semantics, caption, grouping, primary action |
| Color picker | [Color dialog](../references/vector95/src/color-dialog.js) | `colorDialogFields`, `attachColorPicker` | Swatches, numeric color fields, preview, pointer behavior |
| Palette selector | [Palettes](../references/vector95/src/palettes.js) | `populatePaletteSelect`, `renderPreview` | Palette names with miniature swatches; application color data is a dependency |
| Text editor and font preview | [Text dialog](../references/vector95/src/text-dialog.js) | `export` | Font selection, typography controls, preview, asynchronous font state |
| Document setup | [Canvas dialog](../references/vector95/src/canvas-dialog.js) | `canvasDialogFields`, `attachCanvasPreview` | Size controls, anchor choices, and visual preview |
| Shortcut preferences | [Preferences](../references/vector95/src/input-preferences.js), [bindings](../references/vector95/src/input-bindings.js) | `preferencesFields`, `attachPreferences` | Shortcut capture, remapping, and application-specific conflict handling |
| Artwork preview window | [Artwork preview](../references/vector95/src/artwork-preview.js) | `createArtworkPreview` | Separate preview surface; app-specific rendering dependencies |
| Mobile player | [Mobile CSS](../references/sausage-music/web/site/radio-mobile.css), [logic](../references/sausage-music/web/site/radio-mobile.js) | `@media`, `addEventListener` | Modern adaptation, distinct from the desktop reference |

## Artwork and source evidence

- [Icon source guide](../references/vector95/src/assets/README.md), [sample toolbar glyph](../references/vector95/src/assets/icons/save.svg), [caption glyph](../references/vector95/src/assets/captions/restore.svg), and [scrollbar arrow](../references/vector95/src/assets/scrollbars/up.svg).
- [Icon insertion](../references/vector95/src/icons.js) and [asset generation](../references/vector95/scripts/svg-assets.mjs). SVG ID namespacing is part of correct reuse.
- Existing menu screenshots at [100%](../references/vector95/artifacts/controls-1.png), [125%](../references/vector95/artifacts/controls-1.25.png), [150%](../references/vector95/artifacts/controls-1.5.png), and [200%](../references/vector95/artifacts/controls-2.png) display scale. These are prior captures, not a new cross-browser certification.
- [Workspace screenshot](../references/vector95/artifacts/layer-ui-checks/game-art-scene.png) and [text dialog screenshot](../references/vector95/artifacts/layer-ui-checks/game-art-font-dialog.png).
- Existing test sources for [control polish](../references/vector95/tests/ui/control-polish.spec.mjs), [keyboard focus](../references/vector95/tests/ui/keyboard-focus.spec.mjs), [status help](../references/vector95/tests/ui/status-help.spec.mjs), [SVG assets](../references/vector95/tests/ui/svg-assets.spec.mjs), [command search](../references/vector95/tests/ui/search-transform.spec.mjs), and [native radio window sizing](../references/sausage-music/web/electron/test/window_controls_test.mjs).

## Gaps and application dependencies

This catalogue covers the distinctive UI present in these two apps, not every Windows common control. It does not supply a complete reusable implementation of radio-button groups, a file-open dialog, a general data grid, a wizard framework, or native OS widgets. Use the historical guide and the separately labeled 98.css reference for further comparisons.

Source files such as `app.js`, `text-dialog.js`, and `radio.js` import application engines or data that are intentionally outside this collection. Existing tests likewise expect their original projects. CSS can also be coupled to document-wide selectors and generated assets. Use the [reuse guide](reuse.md) before transferring an implementation.
