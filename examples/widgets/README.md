# Independent widget examples

Start with the [gallery](../../demo/dist/widgets/index.html) and [coverage index](../../docs/widget-coverage.md). Every generated HTML example works on its own, including through `file://`, with no engine, framework, font download or server. The gallery also ships beside the desktop demo.

The authoring modules separate basic controls, navigation, menus, dialogs and host integrations. `shared.mjs` holds semantic color tokens, common styling and small helpers. Each example describes its behavior, limits and sources; the builder inlines its initializer and helpers. Generated output belongs in `demo/dist/widgets/` and is committed for offline use and Pages deployment. Edit these sources, then rebuild; do not hand-edit the generated files.

```text
node tools/build-widget-examples.mjs
node tools/build-widget-examples.mjs --check
node examples/widgets/check.mjs
```

The browser check requires Playwright and Chromium. It first uses an installed `playwright` package; alternatively set `GUI95_PLAYWRIGHT_ROOT` to a directory containing that package (or its absolute `index.js` path). `GUI95_BROWSER_EXECUTABLE` can select an existing Chromium/Chrome/Edge binary. No package install or browser download occurs automatically. `GUI95_QA_DIR` optionally selects a screenshot/report directory; otherwise `.codex_tmp/widget-qa` is used. See [QA](QA.md) for the actual tested scope.

To verify the same examples through MCP previews, set `GUI95_EXAMPLE_BASE_URL` to the running service’s widget directory (for example `http://127.0.0.1:3296/gui95/preview/widgets/`). The runner permits only that service’s preview resources; external network requests remain blocked. Without this option it tests local files offline.

MIT, Copyright (c) 2026 Stephen Lavelle. All artwork in these examples is original CSS, text glyphs or inline SVG. The archived fonts and source snapshots are not imported. Source links point to Microsoft’s preliminary 1995 material and, separately, modern W3C accessibility patterns; full manuals are not redistributed.
