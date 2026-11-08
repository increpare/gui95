# GUI95 usage review — 8 November 2026

## Scope and evidence

Reviewed local consumer history and feedback from **20 October through 8 November 2026**, after the core's previous harvest at `59d77ef`. The scope included the registered suite, its newer reader, and additional editor/theme consumers. Relevant `GUI95:` trailers were checked against source or diffs; untagged UI changes and feedback reports were also examined. Repository-specific evidence for private projects remains in the local audit, outside the public skill and MCP inventory.

This is a source and report review. Consumer reports describe their own earlier runtime checks; their timings and pass counts were not reproduced here. Uncommitted consumer experiments were distinguished from committed work. No consumer checkout or archived reference was modified.

## Guidance added

The [recent integration lessons](recent-integration-lessons.md) capture the following corrections:

- Fill an embedded host panel, size the scope root explicitly and preserve useful reading/search space in short as well as narrow layouts.
- Bound grid tracks and children, decouple canvas bitmap size from flexible layout, and distinguish component classes from state classes.
- Keep selected-tab joins and menu overlays outside inappropriate clipping, without assuming a clipped strip makes every tab reachable.
- Preserve menu-mark contrast, clean accessible command names and real disabled-link behavior.
- Limit tree indentation to each branch, keep navigation keys local and reveal rows without scrolling the outer page.
- Apply measured progress directly; distinguish unknown work and labelled estimates from completed work.
- Carry document identity through asynchronous saves, keep binary imports as bytes, and restore focus to a focusable canvas.
- Measure first readable paint under background load; isolate a blocking native renderer when measurements justify it, and retain stable origins and writable per-user data.
- Place commands with their target, distinguish passive activity from buttons and derive diagnostic severity from explicit state.

The [desktop delivery guide](desktop-delivery.md) now also covers direct Electron runtime preparation, host-specific runtime roots, source/compiler cache keys, lazy worker assets and removal of obsolete generated resources. Existing guidance already covered explicit make targets, shared caption geometry, conversion save destinations and preserved installed copies; those lessons were not duplicated wholesale.

## Qualifications and remaining work

Two maintained-kit issues remain **documented consumer workarounds**, not component fixes in this release:

1. Its box-sizing reset covers descendants but not the `.gui95` / `[data-gui95]` root. Consumers with viewport sizing and padding need an explicit root reset.
2. Textual generated checked-menu marks can enter accessible names. Consumers need a deliberate label binding or decorative markup that does not alter the name. A CSS pseudo-element is not automatically hidden from accessibility.

A future component patch should cover root/footer bounds and computed accessible names in real browser regressions before changing kit versioning. This review changes guidance and packaging metadata; it does not claim a repaired kit runtime.

Several candidate trailers were deliberately qualified or not adopted:

- Advancing an unmeasured progress stage is an optional, labelled estimate, not a requirement to invent a percentage.
- Reported audio-clock stalls and codec-dependent seek offsets need targeted media/browser evidence before becoming universal GUI95 rules.
- Flat hierarchy markup does not by itself establish correct accessible set positions, levels and keyboard behavior.
- A specific minimum viewport height, a fixed popup offset and Chromium's layout rounding precision are implementation details to measure in each host.
- A consumer's title-case command labels do not override the existing suite sentence-case convention.
- Uncommitted gesture and hidden-test-harness work is useful review evidence, not proof of a released consumer fix.

Native visible-window behavior, physical display scales, screen-reader operation, audio background playback and consumer runtime regressions were not rechecked in this harvest. A separate local delivery record tracks package verification and which distribution destinations were actually updated.

## Checks run for this update

The reference verifier passed all 109 archived hashes and 316 local documentation links. All 38 generated widget examples match their sources, and Claude marketplace validation passed. The MCP suite passed all 25 tests outside the Windows sandbox, including real HTTP clients, inventory boundaries and extraction of a runnable deployment package. The initial sandbox run could not exercise local HTTP and symlink fixtures successfully; its failures are retained in the local audit rather than represented as passing consumer checks.
