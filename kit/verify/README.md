# Local GUI95 verification

Install the exact kit dev dependency with `pnpm install --frozen-lockfile` inside `kit/`, then install Chromium with `pnpm exec playwright install chromium`. Start the application yourself and pass its explicit HTTP(S) URL:

```sh
node kit/verify/runner.mjs http://127.0.0.1:8000/kit/components/gallery.html /tmp/gui95-review
```

The reusable API is `await runVerification({ url, output, scales: [1, 1.25, 1.5, 2] })` from `runner.mjs`. Scales may be a unique nonempty subset of those four values. URLs with embedded credentials and non-HTTP schemes are rejected. The runner does not start servers or execute consumer source in Node. The existing output directory is reused and these fixed report/screenshot names are replaced; choose a fresh directory to retain previous evidence. The page itself runs normally in a fresh browser context. The menu probe opens the first GUI95 menu and cancels it without activating a command. When a modal dialog is already open on the loaded page, the menubar is inert: the probe then records itself as passed with `applicable: false` and a reason, sends no keys and leaves the application's dialog open, so the screenshots show the page as loaded.

`report.json` records the URL, date, Node/Chromium versions, OS, device scales, automatic assertions, observed failures, screenshots and native checks not run. The CLI exits 0 when assertions pass, 1 on observed failures, and 2 on invalid arguments. A 0 exit still requires screenshot review.

Automatic assertions cover load status, uncaught page errors, common control names, GUI95 ARIA relationships, current numeric range/step validity, tree visibility/expanded agreement, splitter values, first-menu keyboard opening/focus/cancellation and horizontal document fit at widths 1100 and 480. Missing component families are not tested through imaginary fixtures; the menu probe explicitly records applicability. These checks are useful regressions, not a full accessibility or behavioral audit. The component suite supplies deeper real-browser interaction tests.

## Period lint

`period-lint.mjs` reads the computed style of every visible element inside the `.gui95` / `[data-gui95]` scope and reports styling that has no Windows 95 counterpart. It is read-only: nothing is clicked or focused.

```sh
node kit/verify/period-lint.mjs http://127.0.0.1:8000/            # readable summary
node kit/verify/period-lint.mjs http://127.0.0.1:8000/ --json     # full report
```

| Rule | Reported when |
| --- | --- |
| `rounded-corner` | any corner radius is not zero, on an element or its `::before` / `::after` |
| `soft-shadow` | a box or text shadow has a blur radius |
| `translucency` | opacity below 1, or a partly transparent background, text, border or shadow colour |
| `animation` | a transition duration or a CSS animation is set |
| `pointer-cursor` | `cursor: pointer` outside a hyperlink |
| `keyword-bevel` | a visible `outset`, `inset`, `groove` or `ridge` border |
| `native-control` | a check box, option button, slider, progress bar, meter or drop-down list keeps the host appearance (`appearance: base-select` on a drop-down the page draws itself is accepted) |
| `modern-font` | the first font family is a host system UI face such as `system-ui` or Segoe UI |
| `filter-effect` | a blur filter or backdrop filter |
| `dimmed-backdrop` | a dialog's `::backdrop` is not transparent |
| `control-text-size` | the text of a button, label, field, drop-down list, legend, menu item or tab is not 11px; reported once against the outermost element that sets that size, with the number of controls it reaches |

Exit status is 0 when clean, 1 with findings and 2 for invalid arguments. `lintPage(page)` lints an already open Playwright page, for example after your test has opened a menu or dialog; `runPeriodLint({ url })` opens the URL itself; `RULES` maps each rule to the classic treatment to use instead.

Only visible elements are judged, so open the menus, dialogs and tab pages you want checked. An element at opacity 0, or inside one, counts as hidden. Scrollbar parts, hover and pressed states, the host's popup lists and image content are not inspected; image content includes the shapes inside an `<svg>`, though the `<svg>` element itself is judged like an `<img>`. `control-text-size` reads the declared size and cannot tell which typeface the host drew. A reading surface with its own larger type scale takes `data-gui95-lint-ignore="control-text-size"`. Mark deliberate exceptions, such as a document canvas showing the user's own artwork, with `data-gui95-lint-ignore="rounded-corner soft-shadow"` on the element; it covers that element and its descendants, and every use is listed in the report. A clean lint means none of these tells were found. It does not establish layout, glyph or Windows 95 fidelity, which still need the screenshots.

`runVerification` runs the lint at every scale and records it as the `period-lint` assertion. On a page with a GUI95 scope, findings fail verification. On a page without one, the findings are recorded with `applicable: false` and do not fail it.

## Wording lint

`wording-lint.mjs` reads the visible interface text inside the `.gui95` / `[data-gui95]` scope and reports wording that differs from 1995 Microsoft practice. It is read-only, like the period lint, and shares its conventions: only visible elements are judged, `data-gui95-lint-ignore="rule other-rule"` on an element exempts it and its descendants and is listed in the report, and a page without a scope is read as a whole and says so.

```sh
node kit/verify/wording-lint.mjs http://127.0.0.1:8000/            # readable summary
node kit/verify/wording-lint.mjs http://127.0.0.1:8000/ --json     # full report
node kit/verify/wording-lint.mjs http://127.0.0.1:8000/ --strict   # exit 1 on any finding
node kit/verify/wording-lint.mjs http://127.0.0.1:8000/ --skip ellipsis-character,period-vocabulary
node kit/cli.mjs lint-wording http://127.0.0.1:8000/               # the same through the kit CLI
```

**Findings are warnings.** Most of these rules come from how the 1995 *Microsoft Manual of Style* tells writers to describe the interface, not from rules stated about interface text, so every rule has severity `warn`. The exit status is 0 with or without findings, 1 only when `--strict` is given and there are findings, and 2 for invalid arguments. The report's `status` is `passed`, `warnings` or `failed`, and each entry in `violations` carries `rule`, `severity`, `element` and `value`. `lintPage(page, { strict, skip })` lints an already open Playwright page, `runWordingLint({ url, strict, skip })` opens the URL itself, and `RULES` maps each rule to its advice, which names the source and says whether the rule is stated about interface text or inferred.

**English only.** Text inside an element whose `lang` is not English, or inside `translate="no"`, is not judged.

| Rule | Reported when | Source |
| --- | --- | --- |
| `menu-title-caps` | a menu name or menu command is not in title caps | Manual of Style; stated about the interface as documentation reproduces it |
| `button-title-caps` | a command button label is not in title caps | Manual of Style; documentation convention describing interface practice |
| `dialog-title-caps` | a dialog box title is not in title caps (text after ` - ` is not judged) | Manual of Style; stated |
| `ellipsis-form` | an ellipsis on a menu or button has a space before it, spaced dots, or two or four dots | Manual of Style; use stated, exact form inferred from screen shots |
| `ellipsis-character` | the ellipsis is the single character `…` (U+2026), not three periods | inferred, low confidence; kept as its own rule so it can be skipped |
| `shortcut-key-format` | shortcut text in a menu is not of the form `Ctrl+S`, `Ctrl+Shift+N`, `Alt+F4`, `F5`, `Del` | Manual of Style; plus sign stated, mixed case inferred from screen shots |
| `label-colon-missing` | the label bound to a text box, list box, drop-down list or spin box does not end with a colon | final Windows Interface Guidelines; stated |
| `label-colon-unexpected` | a check box, option button, command button, tab or group box label ends with a colon | final Guidelines; stated for buttons, tabs and group boxes, inferred for check boxes and option buttons |
| `ok-button-spelling` | a button reads `Ok`, `ok`, `Okay` and so on | Manual of Style; stated |
| `exit-not-quit` | a menu command starts with Quit, Close Program or Exit Application | Manual of Style; stated as the command's name |
| `period-vocabulary` | interface text uses a term the manual replaces: radio button, context menu, log in, checkbox, tooltip, hard drive, directory, abort, e.g. and about thirty more (`VOCABULARY` in the module) | Manual of Style; stated for documentation, applied to interface text by inference |
| `message-blames-user` | a sentence in a dialog or alert starts "You cannot", "You can't", "You are unable", "You don't", "You failed" and the like ("You must" is allowed) | Manual of Style; stated about error messages |
| `message-question-symbol` | a dialog shows an image whose name, class or alternative text says question | final Guidelines and Manual of Style; stated |

What is read: menu names (the children of `[role=menubar]` / `[data-gui95-menubar]`), menu commands (`[role=menuitem]`, `menuitemcheckbox`, `menuitemradio` inside `[role=menu]`), command buttons (not title bar buttons, up-down arrows, tabs or column headings), tabs, group box legends, dialog titles (`aria-labelledby`, else the dialog's `.title-bar`), labels bound by `for`, by wrapping or by `aria-labelledby`, and static text in dialogs, status bars, ToolTips, alerts and title bars. A label's shortcut (`[data-gui95-shortcut]`, `<kbd>` or text after a tab character), marks and icons are not part of its wording. A label that wraps its field is judged on the text before the field, so "Copies: [ ] pages" is correct. User content is skipped: text boxes and their values, the items of lists, trees, tables and grids, and editable documents. Page citations in `period-vocabulary` findings are PDF pages of the scanned manual; the printed folio is eight less.

### Title caps

The manual's rule: capitalize every word except articles, coordinating conjunctions and prepositions of four or fewer letters, and always capitalize the first and last word. `titleCaps(label)` applies it as follows, and is exported so an application can test its own strings.

1. Trailing decoration is removed: an ellipsis, a colon, `>>` or `<<`, and anything after ` - ` (a document name in a title). A parenthesized remark such as "(unavailable)" is removed from the label.
2. The label is **not judged** when it has no letters, is wholly parenthesized ("(No recent files)"), starts with a number and a space (a recent-file entry), reads as a sentence (ends with `.`, `?` or `!`, or has sentence punctuation inside), or has more than eight words.
3. Quoted text is user data and is dropped. A word containing `\`, `@`, `_`, a drive or URL prefix, or a period followed by a letter or digit ("readme.txt", "v1.2") is a file name or address and is accepted as written.
4. A word joined by `/` is judged part by part ("Import/Export"). Of a hyphenated word only the first part is judged ("Read-only" and "Read-Only" both pass).
5. A word that does not start with a letter ("3D", "95") is accepted. A word with a capital after its first letter is an acronym or a name with its own casing and is accepted as written: OK, ASCII, MS-DOS, WordPad, ToolTip. Proper nouns need no list because they are capitalized anyway.
6. The first and last words must start with a capital, whatever they are ("Go To", "Send To").
7. Inside the label, these stay **lower case**: a, an, the, and, but, nor, or, for, of, to, at, by, as, from, with, into, per, via. "Save And Close" is reported.
8. Inside the label, these are accepted in **either case**, because they are prepositions in some commands and adverbs in others ("Keep Help on Top" but "Log On to Network"): in, on, off, up, out, over, down, onto, upon, near, past, like, than, plus. The cost is that "Keep Help On Top", which the manual calls wrong, is not reported.
9. Every other word must start with a capital.
10. A label of two or more words set entirely in capitals, at least one of them four letters or longer, is reported once as all capitals ("SAVE AS"); "FTP URL" passes.

### Rules deliberately left out

| Candidate | Why it is not checked |
| --- | --- |
| Label capitalization inside dialogs (title caps or sentence caps for field, check box and option button labels) | The Manual of Style says "initial cap" without defining it, and its own examples and screen shots show both styles. |
| Tab label capitalization | The final Guidelines say book-title caps in two sections and list page tabs under sentence-style labels in a third. |
| An ellipsis on a checked (toggle) command | Inferred, low confidence. |
| Message punctuation (full sentences, no exclamation point) | Inferred from three examples; the manual is silent on exclamation points. |
| Status bar command descriptions ("Creates a new document.") | Stated, but the lint changes nothing on the page, so it cannot highlight a command to read its status text. |
| Size units ("12 KB" against "360K") | The manual's documentation rule is contradicted by its own interface screen shot. |
| Screen resolution form ("640 × 480") | Stated for documentation only. |
| A dialog title matching the command that opened it | Stated with "usually, but not always", and the lint cannot see which command opens which dialog. |
| When a command needs an ellipsis at all | Needs to know whether the command opens a dialog; a matter for review. |

## Layout lint

`layout-lint.mjs` measures the controls of every visible dialog (`dialog`, `[role=dialog]`, `[role=alertdialog]`) and window (`.window`) inside the scope against the final 1995 *Windows Interface Guidelines*. It is read-only and follows the same scope, visibility, `data-gui95-lint-ignore`, `--json`, `--strict`, `--skip` and exit-status conventions as the wording lint: every rule warns, and the exit status is 0 unless `--strict` is given.

```sh
node kit/verify/layout-lint.mjs http://127.0.0.1:8000/
node kit/cli.mjs lint-layout http://127.0.0.1:8000/ --json
```

The kit CLI already uses `layout` for the layout generator, so the two commands are `lint-wording` and `lint-layout` beside the existing `lint`, which is unchanged.

**The pixel thresholds rest on an assumed conversion.** The guidelines give sizes in dialog units. The lint assumes that with 8-point MS Sans Serif at 96 dpi one horizontal unit is 1.5px and one vertical unit 1.625px. That has not been measured on Windows 95; a measurement is under way. All of it is in one object, `UNITS`, at the top of `layout-lint.mjs`: the conversion, the 4-unit minimum gap (6px across, 6.5px down), the 7-unit margin (10.5px, 11.4px), the 263-unit window limit (394.5px by 427.4px), a 0.5px tolerance for sub-pixel layout, and the near-miss bands. Correct it there. Each report includes the `units` it used.

| Rule | Reported when |
| --- | --- |
| `control-gap` | a control is closer than 4 units to the nearest control below it or to its right. Controls that touch are one composite control (a text box and its up-down arrows) and are not reported. |
| `uneven-gap` | three or more like controls, or like groups of controls, that follow each other in one parent as a row or column have gaps differing by more than 0.5px and at most 4px. A larger difference is taken as deliberate grouping. |
| `edge-near-miss` | a control's left edge is more than 0.5px and at most 2.5px away from the left edge of the control above it. |
| `baseline-near-miss` | a label beside its text box or drop-down list has a text baseline 1 to 3px away from the field's text. Baselines are estimated from font metrics and the field's padding. |
| `button-height-mismatch` | command buttons sharing a parent, in one row or one column, differ in height. |
| `button-width-mismatch` | in such a row or column, two of OK, Cancel, Yes, No, Close, Apply, Help, Retry, Ignore, Abort, Back, Next, Finish, Save, Open and Browse differ in width, or any two buttons differ by at most 4px. A much wider button for a long label is accepted. |
| `no-default-button` | a dialog has command buttons and none is marked `class="default"` or `data-gui95-default`. A dialog with a multiline text box is not reported, since Enter belongs to the text. |
| `destructive-default` | the default button's label starts with Delete, Remove, Erase, Format, Discard, Overwrite, Destroy, Purge, Wipe, Empty, Reset, Clear, Uninstall, Revert, Terminate, Kill, Drop or Replace All. |
| `duplicate-access-key` | two labels in one dialog or window, or two items of one menu or menu bar, advertise the same access key (`accesskey`, `data-gui95-mnemonic`, or a single underlined letter in `<u>`). |
| `ok-cancel-access-key` | an OK or Cancel button has an access key. |
| `apply-access-key` | an Apply button's access key is not A, or it has none while another control in the dialog takes A. |
| `dialog-margin` | a dialog's contents come closer than 7 units to the edge of its client area (inside the frame, below the title bar). |
| `window-too-large` | a dialog's client area is wider or taller than 263 units. |

A check box or option button is measured together with its wrapping label, as the one control Windows draws. Menus, toolbars, tab strips, title bars and the contents of lists, trees and tables are not measured. The near-miss rules report only small differences, on the reasoning that a control 2px off its neighbour is a mistake and one 40px away is a decision. `destructive-default` reads the label only and cannot tell that "Yes" confirms a deletion. The guidelines call the default button a common convention, not a requirement, so read `no-default-button` as a prompt. A clean report does not establish that a layout is right; review the screenshots.

`runVerification` does not run the wording or layout lint. Its assertions pass or fail, and these findings are warnings resting on documentation practice and an unmeasured conversion; run the two commands beside `verify`. `kit/test/lint-self.test.mjs` runs both lints over the kit's gallery and the widget examples under `demo/dist/widgets/`, as loaded and with each dialog open. It asserts that they run and report in the documented shape, not that those pages are clean.

## State atlas

`atlas.mjs` is a rendering regression check for the kit's own stylesheet. A change to a bevel, mark or arrow can pass every computed-style test, so this compares what `components/gui95.css` actually paints. [`components/atlas.html`](../components/atlas.html) lays out every stylesheet-drawn state on a fixed grid of fixed-size cells: push buttons (rest, pressed, latched, unavailable, default), check boxes, option buttons, drop-down lists, up-down controls, sliders, progress bars, a list box, property tabs, text fields, a group box, an etched rule, active and inactive window frames, a status bar, an open menu with highlighted, unavailable, checked, option-marked, submenu and shortcut items, a menu bar and a tree. The page is captured in headless Chromium at device scale factor 1 and a fixed 809 × 442 viewport and compared with `kit/test/baseline/state-atlas.png` exactly, with no tolerance.

```sh
node kit/verify/atlas.mjs                  # compare; exits 1 on any difference
node kit/verify/atlas.mjs --out my-atlas   # write the actual and difference images there
node kit/verify/atlas.mjs --update         # accept the current rendering as the baseline
node kit/cli.mjs atlas [--update]          # the same through the kit CLI
```

On a difference it reports the number of changed pixels and their bounds and writes `state-atlas.actual.png` and `state-atlas.diff.png` (changed pixels in magenta over a faded copy of the baseline) to the folder it prints, a new temporary folder unless `--out` is given. Look at both before running `--update`; an intended stylesheet change needs a new baseline in the same change. `kit/test/atlas.test.mjs` runs the comparison, proves that a one-level change to the raised bevel's white edge is caught, and lints the page. The API is `renderAtlas()`, `checkAtlas()`, `updateAtlas()` and `compareImages()`; PNGs are decoded with Node's zlib, without extra dependencies.

Text is deliberately excluded, so the image does not depend on installed fonts: the atlas contains no text, each label is an empty fixed-size placeholder whose bottom edge is drawn in the label's colour (white on a highlight, gray when unavailable), and the page sets font size and line height to 0. Embossed unavailable text, mnemonic underlines and the tree's +/− signs, which are text, are therefore not covered. This is a headless-Chromium rendering check of the kit's CSS. It does not establish Windows 95 fidelity, and a newer Chromium may legitimately render differently; review the difference image, then update the baseline.

## Screenshots and native checks

Eight PNG screenshots cover wide and narrow layouts at device scale factors 1, 1.25, 1.5 and 2. Every screenshot has `status: "needs-review"`; automatic assertions and screenshots are separate. Inspect normal, pressed, latched, disabled, selected and focused states; text, long labels, clipping, scrollbars, pixel edges and open dialogs. The gallery supplies a state atlas; a generic application may need its own representative states or test hooks.

The `nativeChecks` array always says `not-run` for actual window controls, OS display scaling/text rasterization, native startup/packaging and assistive technology. Headless Chromium device scale screenshots cannot establish those claims. Perform them in the target desktop host and record that evidence separately.
