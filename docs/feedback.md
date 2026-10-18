# Recording and returning GUI95 feedback

Keep a running UI journal while implementing or reviewing a GUI95 interface. Capture problems when they occur, including ones fixed before the final result: those details are easily lost in a successful diff or commit message.

## Where and when to write

Use one report per task in the consuming project: `docs/gui95-feedback/<date>-<task>.md`, with a date such as `2026-10-18` and a short task name. Follow an established project location if one exists. Resume the same report when continuing a task; choose a distinct name for a separate task. Create it when the first finding arises and update it during the work, not just from memory at the end. For work without a writable project, return the report in the final response.

Record visual and interaction defects, UI-related build or host problems, user corrections, unsuccessful approaches, and missing, ambiguous, or misleading reference guidance. Keep useful successful patterns when they teach something reusable. Consolidate repeated occurrences under one finding, while preserving failed attempts and the eventual resolution. A concise journal is sufficient; command transcripts and unrelated application debugging are unnecessary.

## Report template

Copy this structure into the consuming project and repeat the finding section as needed. Use `unknown` or `not checked` when information is unavailable; do not infer runtime results from source inspection.

```markdown
# GUI95 feedback — task name

## Context

- Task and project:
- App revision and relevant uncommitted changes:
- GUI95 version/revision or MCP content revision, if known:
- Platform, browser/Electron version, display scale and window size:

## Handoff summary

- Unresolved issues:
- Reusable lessons:
- Verification limits:

## Finding: short descriptive title

- Status: unresolved / worked around / fixed
- Affected control or guidance:
- Expected behavior:
- Observed behavior or user correction:
- Evidence and reproduction: distinguish user report, source inspection,
  runtime observation, and hypothesis; link relevant files or screenshots.
- Attempts and outcome: include failed approaches and suspected versus
  confirmed causes.
- Resolution or remaining work:
- Verification: checks actually run, results, host/scales covered, and
  checks not run. A fix without verification remains explicitly unverified.
- Reusable lesson or proposed GUI95 improvement:
```

## Return the report

Before finishing, consolidate the findings, update their status and the handoff summary, and retain resolved entries. Link the report in the final response with a brief summary of unresolved issues and reusable lessons. If no findings arose, say so without inventing issues or creating an empty report. Passing checks establish only the scope actually checked.

Returning the report to the user in the current conversation completes the handoff. The optional [MCP feedback inbox](mcp-service.md#tools-and-feedback) is a separate destination: submit a concise reusable finding only when the user has authorized transmission. Preserve the service's evidence labels and privacy requirements; do not send the whole local journal automatically.

## Feed reviewed lessons into GUI95

When a commit in a consuming app teaches something another GUI95 app could reuse, add a trailer that makes sense without its diff:

```text
GUI95: <what went wrong or was unclear, and what works, in one sentence>
```

Use one line per lesson in the trailer block alongside any other trailers. Omit it for application-specific logic; when unsure whether a UI lesson is reusable, include it for review. Tell the user when you add a trailer so they can change it before pushing. The detailed report complements the trailers and is still useful when no commit is made.

When maintaining GUI95 itself, update its maintained docs directly instead of adding these trailers. During harvesting, use reports alongside diffs and source revisions, then incorporate reviewed conclusions into the appropriate design, widget, integration, or delivery guide. Keep private project evidence out of the public reference collection, whose `docs/` contents are distributed by the skill and MCP service. A proposed lesson is not established guidance until reviewed; source changes do not automatically update released packages, the hosted service, or installed copies.
