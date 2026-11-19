# Example audit

Compares each of the 38 widget examples with real Windows 95. The result is [docs/example-audit.md](../../docs/example-audit.md)
and `examples/widgets/audit.json`; read the doc first.

| File | What it is |
| --- | --- |
| `specs.mjs` | Per example: which rectangle pairs with which real control, which layout numbers, which recorded steps are replayed and which element stands for which real control. |
| `engine.mjs` | The comparison: pixel and edge comparison of a pair, layout numbers, replay of recorded steps in Chromium, reading the same facts from the page. |
| `run.mjs` | Runs it all and writes `results.json`. Needs Playwright (`pnpm install --frozen-lockfile` in `kit/`) and, for pixels, the screen dumps in `tools/win95-reference/out/`, which are not in git. |
| `make-decisions.py` | The judgement, as a script because the same decision recurs: every difference with severity and status, the lint triage, what was not checked. Writes `decisions.json`. |
| `../build-example-audit.mjs` | `results.json` + `decisions.json` → the audit file and the doc. `--check` runs in `make test`. It refuses a difference no decision covers. |

```sh
node tools/example-audit/run.mjs                 # all 38; --only tabs,menus for some
python3 tools/example-audit/make-decisions.py
node tools/build-example-audit.mjs
node tools/build-widget-examples.mjs             # the coverage table reads the verdicts
```

`results.json` is the record of one run on one host (Chromium on macOS here). Text widths and native controls depend
on that host, so no test asserts on its numbers; the tests check only that the audit and doc match it and that no
verdict claims more than was compared. A timing check can fall either side of its tolerance from run to run; if a
rerun changes what disagrees, the builder says which decision to revisit.

Side-by-side images of every pair are written to `.codex_tmp/example-audit/` (ignored): real on the left.
