# Local GUI95 verification

Install the exact kit dev dependency with `npm ci` inside `kit/`, then install Chromium with `npx playwright install chromium`. Start the application yourself and pass its explicit HTTP(S) URL:

```sh
node kit/verify/runner.mjs http://127.0.0.1:8000/kit/components/gallery.html /tmp/gui95-review
```

The reusable API is `await runVerification({ url, output, scales: [1, 1.25, 1.5, 2] })` from `runner.mjs`. Scales may be a unique nonempty subset of those four values. URLs with embedded credentials and non-HTTP schemes are rejected. The runner does not start servers or execute consumer source in Node. The existing output directory is reused and these fixed report/screenshot names are replaced; choose a fresh directory to retain previous evidence. The page itself runs normally in a fresh browser context. The menu probe opens the first GUI95 menu and cancels it without activating a command.

`report.json` records the URL, date, Node/Chromium versions, OS, device scales, automatic assertions, observed failures, screenshots and native checks not run. The CLI exits 0 when assertions pass, 1 on observed failures, and 2 on invalid arguments. A 0 exit still requires screenshot review.

Automatic assertions cover load status, uncaught page errors, common control names, GUI95 ARIA relationships, current numeric range/step validity, tree visibility/expanded agreement, splitter values, first-menu keyboard opening/focus/cancellation and horizontal document fit at widths 1100 and 480. Missing component families are not tested through imaginary fixtures; the menu probe explicitly records applicability. These checks are useful regressions, not a full accessibility or behavioral audit. The component suite supplies deeper real-browser interaction tests.

Eight PNG screenshots cover wide and narrow layouts at device scale factors 1, 1.25, 1.5 and 2. Every screenshot has `status: "needs-review"`; automatic assertions and screenshots are separate. Inspect normal, pressed, latched, disabled, selected and focused states; text, long labels, clipping, scrollbars, pixel edges and open dialogs. The gallery supplies a state atlas; a generic application may need its own representative states or test hooks.

The `nativeChecks` array always says `not-run` for actual window controls, OS display scaling/text rasterization, native startup/packaging and assistive technology. Headless Chromium device scale screenshots cannot establish those claims. Perform them in the target desktop host and record that evidence separately.
