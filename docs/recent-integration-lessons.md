# Recent integration lessons

Reviewed **8 November 2026**, from consumer commits and feedback since 20 October, and extended on **16 November 2026** with the following week's work (see [the November 16 lessons](#lessons-from-8-to-16-november) below). These are source-reviewed adaptations, not new runtime certification of the consumers, maintained kit or archived widgets. The review records for [8 November](usage-review-2026-11-08.md) and [16 November](usage-review-2026-11-16.md) distinguish accepted guidance, kit changes and proposals not adopted. Earlier guidance remains in [integration lessons](integration-lessons.md).

## Fit the actual host and preserve useful content space

A browser panel already supplies a host. Fill it with the requested application; GUI95 styling does not require a teal simulated desktop, duplicate main caption or outer window bevel. Keep functional dialog and child-window captions where needed. A desktop simulation remains appropriate when that is the requested product.

Kit 1.0.0's box-sizing reset covered descendants but not the scope root; the current kit source includes the root. Until a consumer has that fix, give a viewport-sized `.gui95` or `[data-gui95]` root `box-sizing: border-box` explicitly when it has padding or borders. Measure the bottom of the status bar, not just horizontal overflow.

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

Textual `::before` content can enter an accessible name even though it does not appear in `textContent`. Kit 1.0.0 draws checked menu marks this way; the current kit source gives them empty alternative text (`content: "\2713" / ""`), which keeps them out of the name in Chromium. In consuming markup, use an explicit accessible name matching the visible command text, or an `aria-labelledby` reference to its label, while retaining `aria-checked`. For new decorative markup, an `aria-hidden="true"` span or non-text CSS shape avoids duplicating state in the name. Verify the computed accessibility name, not only a text query. The [accessible-name computation](https://www.w3.org/TR/accname-1.2/#computation-steps) includes generated textual content; its 1.2 document is a working draft.

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

## Lessons from 8 to 16 November

Drawn from a dictionary reader (Electron, with a phone view), a 3D level editor with a multi-document workspace, and an offline puzzle workbench. Delivery and packaging lessons from the same week are in the [desktop delivery guide](desktop-delivery.md#lessons-from-november-2026-consumers).

### Pressed controls keep their size

Kit 1.0.0's generic pressed rule gave every button in the scope `padding: 5px 9px 3px 11px`. That included menu headings, toolbar and caption buttons, menu items and consumers' tabs. In one editor a pressed menu heading grew and pushed the workspace down. In the reader a pressed selected tab took the inactive tabs' height and its panel jumped 3px. A pressed offset moves the content one pixel down and right *inside an unchanged box*: add a pixel to the top and left padding and take it from the bottom and right of that control's own resting padding. The current kit source does this with `--gui95-pad-y` and `--gui95-pad-x`; menu items and `role="tab"` buttons do not sink. Measure bounds at rest, while the pointer is held and while a menu is open; a completed click does not show the held state.

### Property tabs: the selected tab grows into its neighbours

The [Wine project's reimplementation of the common tab control](https://gitlab.winehq.org/wine/wine/-/blob/master/dlls/comctl32/tab.c) starts inactive tabs 2px in from the control's left edge. It draws the selected tab 2px wider on each side and 2px taller (`SELECTED_TAB_OFFSET`). As a result, a selected first tab is flush with the panel's left edge while an unselected first tab is inset, and a selected middle tab overlaps both neighbours by 2px. A dictionary's user asked for exactly that left-edge behaviour without having seen this source. Their fix (a 2px strip inset plus `:first-child[aria-selected="true"] { margin-left: -2px }`) covers only the first tab. Wine is a compatibility reimplementation, not Microsoft's code; confirm the middle-tab overlap against period screenshots before treating it as settled.

In CSS: inset the strip by 2px, give the selected tab `margin-inline: -2px` with 2px of extra width and height, and raise it above its neighbours. The negative margins cancel the extra width, so selecting a tab never reflows a wrapping strip. Overlap the panel with the selected tab only. One consumer gave the whole strip a negative bottom margin, which hid the panel's top bevel beneath every inactive tab; its functional and layout checks all passed. Inspect the painted pixels under inactive and selected tabs, at rest and while pressed.

Tabs suit a small, frequently switched set, such as the books that contain the current entry, in catalogue order, with abbreviations when full names do not fit. The same user had rejected one tab per dictionary for the whole collection. Remember the last tab the user chose; when the next item lacks it, fall back automatically *without* overwriting the remembered choice. Arrow keys and Ctrl+Tab count as user choices.

### Long result lists

- Ordinary scrolling should reach the complete result set; paging an ordinary browse interrupts it.
- Mounting a control for every match took a one-letter search past 2 GB of renderer memory, and CSS containment did not fix it. Mount only the rows near the viewport, keep the focused row mounted when it scrolls away, expose `aria-setsize`/`aria-posinset`, and keep Home, End and activation working on the logical list.
- When off-screen row heights are estimates, restore a saved position as a row identity plus offset; a saved `scrollTop` drifted by about 60px.
- Share identical in-flight lookups. Until the complete list arrives, keep the reader's DOM, selection and both scroll positions.
- A selectable list is flat rows inside one sunken well, not raised buttons. Keep selection, focus and activation distinct; a selected navy row still needs a visible (white) dotted focus ring.
- Compact two-line rows: the headword, then one short cue. Show sources as flat, labelled abbreviations whose full names are in the tooltip and accessible name. Cap long titles at two lines. If there is no short, clean cue, omit the second line rather than truncating a paragraph into one.

### One name per command, one control per state

- Give each command one name everywhere. One reader used "Find" for looking up a word, opening find-in-entry and finding the next match; it now says Look up, Find and Next.
- A toggle keeps one label; its pressed state (and a field's placeholder) says which option is active. A latched button that opens a row should show whether that row is open.
- Use one name for a category in its filter and in its group heading. Show empty categories flat and disabled, without a "0" count.
- Status bars carry useful counts. A permanent panel for a normal state, such as "Offline" in an offline-only app, reads as a fault. Leave out internal terms.
- Put a filter directly above the results it changes. Keep a few frequently switched scopes visible as tabs rather than in a dropdown, and drop headings that neither name a choice nor tell the user anything.
- Open optional views, such as a side-by-side comparison, only on request, and name their target. Spare width is not a reason to show them.
- Coloured semantic labels in reading text, such as grammatical case abbreviations, must not borrow link or command affordances: no underline, no bevel, no click action. Colour is a scanning aid; the visible abbreviation carries the meaning.
- When a menu command opens a dialog, open it after the menu has closed and returned focus.
- Menu state can be computed while a document is still being built. Check optional view dependencies before reading them.
- Destructive native confirmations need explicit default and cancel buttons (Electron's `defaultId` and `cancelId`), so Enter and Escape both keep the data. An adapter that assumed the last button was Cancel got this wrong.
- Keep saved test or play states apart from File Save. Selecting or sorting a saved state never restores it; Restore, Enter or double-click does.
- Sortable column headings are focusable buttons that show their direction, set `aria-sort`, compare numbers numerically and remember the sort without changing the selection.

### Keyboard ownership

- Type-to-search: a printable key typed outside a text field can start a new lookup. Menus, dialogs, selects, type-ahead lists and the reader's own controls keep their keys; Space and Enter on a focused button are untouched.
- A repeated-lookup app can select the query when the *window* is reactivated (focus or visibility return), not on every focus of the field, which breaks ordinary caret placement. An open dialog or a deliberate click elsewhere wins.
- Route shared shortcuts before mode-specific editing guards, and check each advertised shortcut in every document mode, still respecting text fields, menus and dialogs.
- Real-time held keys: poll the held state on the app's own clock rather than queueing key repeats, and clear it when focus moves, a modal opens or the window blurs, so a key released during an ownership change cannot leave queued movement.

### Readers

- A running header (the current source and headword) should be an overlay that appears only after the article's own heading has scrolled out of view. Inset it by the scrollbar width and let it follow the article actually at the top. A permanent row repeated the headword up to four times and shifted the text. Update only its label text; do not rebuild the reader or move focus.
- An embedded host's paragraph rules can override the reader's font even when the container computes correctly. Set the reading font, size and line height explicitly on the article's descendants, and check the computed style of real paragraphs.
- Applying restored settings must not write them back or re-render equivalent state. Echoed saves cost a results list its keyboard focus and caused recursive updates.
- Start a splitter's controller from the saved pane width. Applying the saved CSS width after initialising the controller let a later resize reset it and ignore its bounds.
- Make lists and readers bordered sunken wells with classic 16px scrollbars. A child's background covered a reader's left bevel until the well had its own border.

### Editors and workspaces

- A non-scrolling multi-document workspace needs `overflow: clip`. With `overflow: hidden`, a `focus()` call can still scroll the container, shifting its origin and clipping maximised windows.
- Hover, keyboard focus and selection are separate states. Show each selected member's outline as well as the group's bounds, kept in step between list and canvas.
- A drag preview moves the actual selected geometry, commits once on release, and restores everything on cancellation or a document switch.
- Animated actions keep Undo, Pause, Restart and Close responsive, and cancel stale queued work when another document or a seek takes over.
- When a palette's spatial order teaches its keyboard shortcuts, keep that order.
- Canonicalise a document's identity and coalesce pending opens before loading asynchronously, so opening the same file twice keeps one edited window. This complements [document identity through asynchronous work](#document-identity-survives-asynchronous-work).

### Verification

- Test held and intermediate states: a held pointer, a pressed control, frames mid-animation. One editor passed its click and final-pose checks while painting only on release and rolling objects the wrong way.
- Under Electron zoom, judge layout from full native-window captures; a cropped capture's coordinates disagreed with a correct layout.
- Isolate test windows when they are constructed (off-screen, not focusable, out of the taskbar, muted), not by hiding them after startup, which still steals focus. Check that a hidden WebGL view produces fresh frames rather than trusting a capture of a never-shown window.
