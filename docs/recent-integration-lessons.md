# Recent integration lessons

Reviewed **8 November 2026**, from consumer commits and feedback since 20 October. These are source-reviewed adaptations, not new runtime certification of the consumers, maintained kit or archived widgets. The [review record](usage-review-2026-11-08.md) distinguishes accepted guidance, remaining kit issues and proposals not adopted. Earlier guidance remains in [integration lessons](integration-lessons.md).

## Fit the actual host and preserve useful content space

A browser panel already supplies a host. Fill it with the requested application; GUI95 styling does not require a teal simulated desktop, duplicate main caption or outer window bevel. Keep functional dialog and child-window captions where needed. A desktop simulation remains appropriate when that is the requested product.

The maintained kit's descendant box-sizing reset does not include its scope root. Give a viewport-sized `.gui95` or `[data-gui95]` root `box-sizing: border-box` explicitly when it has padding or borders. Measure the bottom of the status bar, not just horizontal overflow.

Test short and narrow together, with enlarged reading text. Search fields, alphabet controls and footers can leave two technically scrollable panes with only a few pixels each. When both panes cannot remain useful, provide a clear switch between finding and reading, with an easy return to search. Do not copy one consumer's 500px minimum height as a universal requirement; choose whether the page scrolls or panes switch for the actual host.

## Bound grids and canvas geometry

For a height-constrained grid, use shrinkable content tracks such as `grid-template-rows: minmax(0, 1fr)` and give the intended scrollers `min-height: 0`. The equivalent width constraint must reach the grid item and its children: a wrapping badge row can still widen a `minmax(0, 1fr)` column if its tab panel retains its automatic minimum width. Use `min-width: 0` there, constrain individual badges, and preserve a way to read truncated labels with keyboard as well as pointer use.

A canvas's backing dimensions must not determine the flexible well that JavaScript measures to size that canvas. One working arrangement is a positioned, shrinkable well with an absolutely positioned canvas. Measure the drawable content box; `clientWidth` includes padding. A real border for the sunken bevel, with no padding, can avoid counting decorative space as canvas area. Verify resize settles without an observer loop, growth or clipping, including fractional scale and a hidden pane becoming visible.

For related pages owned and shipped together, reuse shared stylesheets and add scoped layout overrides instead of forking the entire CSS. Inspect ID selectors and view-specific rules before assuming a new class will override them. Give state classes distinct names such as `is-generating`; reusing a child component's `.generating` class on its parent applied the child's sizing to both.

## Property tabs and popup clipping

The selected property tab can join its panel through a small pseudo-element extending below the strip. `overflow: hidden` clips this join. In a non-scrolling strip that only needs horizontal clipping, `overflow-x: clip; overflow-y: visible` preserves it. This is not a substitute for making every tab reachable when the strip really needs scrolling. The two overflow axes interact; see the [overflow reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow).

Exclude property tabs from generic push-button press offsets and sunken shadows so pressing the selected tab does not break its raised connection. Check the join while pressing, focusing and switching tabs, including wrapped or overflowing layouts.

A horizontally scrolling menu bar can clip its absolutely positioned menus. Place popups outside the clipping ancestor, or use a suitable fixed overlay and position it from the heading's actual bounds. Account for ancestors that establish a fixed-position containing block. Reposition or close on scroll and resize, clamp to the viewport and keep Escape/focus restoration. A fixed top offset copied from one phone layout is not a general placement algorithm.

## Menu marks, disabled links and accessible names

Keep a check mark visible on both gray and navy rows, for example with `currentColor`; changing only the row text leaves a black image mark invisible on selection. Check radio marks too.

Textual `::before` content can enter an accessible name even though it does not appear in `textContent`. The maintained kit currently draws checked menu marks this way. In consuming markup, use an explicit accessible name matching the visible command text, or an `aria-labelledby` reference to its label, while retaining `aria-checked`. For new decorative markup, an `aria-hidden="true"` span or non-text CSS shape avoids duplicating state in the name. Verify the computed accessibility name, not only a text query. The [accessible-name computation](https://www.w3.org/TR/accname-1.2/#computation-steps) includes generated textual content; its 1.2 document is a working draft.

An anchor has no native `disabled` behavior. If a download command uses a link, expose `aria-disabled`, style it, and guard activation; `pointer-events: none` alone leaves keyboard and programmatic activation. Remove an unavailable destination where appropriate, or use a button when the action is a command. Test both pointer and Enter activation and the menu's disabled-item navigation policy.

## Nested trees and scrolling only the active pane

Scope each nested branch's indentation and connector rules to its direct child rows. A selector such as `[role="group"] .t-row` also affects deeper descendants and compounds indentation. Test at least three levels, including the last child of an expanded branch.

A flat visible-row model can simplify a large collapsible hierarchy. It still needs correct levels, parent relationships, expansion and selection semantics, one roving Tab stop and deliberate focus repair after collapse. If only part of a logical set is in the DOM, supply accurate set positions/sizes where required; visual grouping alone does not establish an accessible tree.

Handle the tree's navigation keys before page-level game/canvas shortcuts, including an arrow that intentionally does nothing on a leaf. Stop propagation as well as the default action. To reveal a row inside one pane, adjust that pane's scroll position rather than unconditionally calling `scrollIntoView`, which can move outer scrollers and pull a stacked layout away from the user's working view. Preserve manual scroll position when background rows arrive; follow the end only when the user was already following it.

## Progress: real values, unknown work and estimates

A segmented navy fill can style a native `<progress>` while retaining its semantics. For a custom `role="progressbar"`, provide its name and range and update `aria-valuenow` with the actual known value. Omit that value for indeterminate work and name the current stage; see [WAI-ARIA progressbar](https://www.w3.org/TR/wai-aria-1.2/#progressbar).

Apply measured fill updates directly. Repeated updates faster than the first step of a `steps()` width transition can keep restarting that transition, leaving the visible bar behind its number. A separate sweeping-segment animation suits indeterminate work; respect reduced motion and retain a readable stage label when animation stops.

For a long stage without measurable progress, prefer an indeterminate indicator. If a useful time estimate is available, label it as estimated in both visible and accessible status, cap it below that stage's completion boundary and reconcile with actual events. Elapsed time must not manufacture completion or a successful result. Clear timers on cancellation, failure and task replacement, and ignore late results from the old task. The consumer's capped estimate is evidence for this option, not a rule to simulate progress in every app.

## Document identity survives asynchronous work

The earlier [revision-safe save rule](integration-lessons.md#document-commands-an-asynchronous-save-covers-one-revision) also needs document identity in a multiwindow editor. Snapshot the originating document and the resources needed for serialization before yielding. Save completion updates that document's target and saved revision even if another document is active; newer edits remain dirty. Delayed imports/effects must check that their originating document still exists. Test a save held open while switching, editing or closing documents.

Binary imports need bytes through every path: browser file selection, native Open, recent files and operating-system file delivery. Do not decode binary data as UTF-8 and attempt to recover it later. Validate before replacement and follow the [conversion save contract](integration-lessons.md#imported-conversions-need-a-new-save-destination), including clearing native save ownership. Check the actual packaged bridge and source-file preservation.

Focus restoration needs a focusable target: a canvas receiving `focus()` needs an appropriate `tabindex`. Tool-setting gestures should claim the pointer before paint dispatch, avoid document Undo entries, and restore their starting setting on cancellation. Handle Escape for the active gesture even while its initiating modifiers remain held. These gesture details were also present in uncommitted consumer work; they are review guidance, not a released consumer fix.

## Readers: first paint, background rendering and persistent data

Prepared previews can make immutable scans readable before expensive high-resolution decoding. Retain the original document and its notices, and preserve text/search/accessibility needs as described in the [bundled-reader guidance](integration-lessons.md#bundled-readers-measure-the-first-usable-page).

Measure navigation through image decoding and presentation while a cold high-resolution request is running. Request-only timings and decoded-image readiness can miss a stalled compositor or competing work. A consumer still blocked preview delivery with HTTP request threads; moving its native rasterizer into a separate process removed that contention. Treat process isolation as a measured remedy for that backend, not proof that all rendering requires it. Bound background work, prioritize navigation and shut down workers with the app.

Hidden native windows may throttle presentation. An isolated offscreen rendering harness can measure its own paint path, but does not certify visible native font quality, focus or display scaling. Keep those checks separate and report their scope.

Give a packaged local reader a stable renderer origin even if its private backend chooses a different loopback port each launch. Keep mutable indexes, corrections and preferences in per-user data; seed an index only when needed rather than overwriting it during app replacement. Test a full restart with a new backend port and retained preferences, plus an update with existing corrections. Limit the renderer bridge to the intended app resources and backend.

For very long virtual documents, keep estimated page geometry consistent with measured layout. Small per-page rounding differences can accumulate into visible zoom-anchor drift far into a document. Derive geometry from the target renderer's layout rather than treating one browser's layout-unit precision as a portable constant.

## Controls belong to their target; status is not a command

Place trace-stepping commands on the trace page they operate, with a stable toolbar and disabled states instead of adding/removing the toolbar during a pause. Show window-wide state in a suitable window-wide surface. A passive thumbnail status overlay should look passive, with no command bevel or extra focus stop; expose the activity through accessible status on the item. Keep a real cancel/open command clearly separate.

Parse diagnostic severity from structured data when possible. For legacy markup, inspect exact class tokens rather than matching a substring across the HTML: an error-prefixed line-number class caused warnings to be classified as errors in one consumer. Do not make presentation decoration the authority for application state.

For scrollbar screenshot checks, verify whether the headless browser launcher hides scrollbars. In the reviewed Playwright setup, removing `--hide-scrollbars` from default launch arguments exposed them. This check does not establish native scrollbar behavior or physical OS scale coverage.
