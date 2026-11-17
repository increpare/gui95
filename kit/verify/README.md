# Local GUI95 verification

Install the exact kit dev dependency with `npm ci` inside `kit/`, then install Chromium with `npx playwright install chromium`. Start the application yourself and pass its explicit HTTP(S) URL:

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
| `native-control` | a check box, option button, slider, progress bar, meter or drop-down list keeps the host appearance |
| `modern-font` | the first font family is a host system UI face such as `system-ui` or Segoe UI |
| `filter-effect` | a blur filter or backdrop filter |
| `dimmed-backdrop` | a dialog's `::backdrop` is not transparent |

Exit status is 0 when clean, 1 with findings and 2 for invalid arguments. `lintPage(page)` lints an already open Playwright page, for example after your test has opened a menu or dialog; `runPeriodLint({ url })` opens the URL itself; `RULES` maps each rule to the classic treatment to use instead.

Only visible elements are judged, so open the menus, dialogs and tab pages you want checked. Scrollbar parts, hover and pressed states, the host's popup lists and image content are not inspected. Mark deliberate exceptions, such as a document canvas showing the user's own artwork, with `data-gui95-lint-ignore="rounded-corner soft-shadow"` on the element; it covers that element and its descendants, and every use is listed in the report. A clean lint means none of these tells were found. It does not establish layout, glyph or Windows 95 fidelity, which still need the screenshots.

`runVerification` runs the lint at every scale and records it as the `period-lint` assertion. On a page with a GUI95 scope, findings fail verification. On a page without one, the findings are recorded with `applicable: false` and do not fail it.

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
