# Lessons from projects using GUI95

Public summary, 15 October 2026. These lessons come from integrations into editors, music tools, and small desktop utilities. They are improvement proposals, not claims of new runtime verification. The private audit's conversation excerpts and machine-specific paths are omitted.

## Improvements to prioritize

| Priority | Improvement | What a useful result looks like |
| --- | --- | --- |
| First | Proper document and multi-row tabs | The active tab joins the page; inactive tabs sit behind it. Keyboard navigation, resize reflow, long labels, and focus remain correct. |
| First | Color according to purpose | Neutral panels, clear editable fields, consistent selection, and content colors that communicate meaning. Trace shared host theme tokens before changing them. |
| First | Review the main interaction before styling | Fewer unnecessary modes and dialogs; direct manipulation where useful; previews, Escape, and undo for gestures. |
| Next | Small working examples | Tabs, menus, and dialogs with scoped CSS, required assets, and behavior checks, runnable without the original application engines. |
| Next | Native theme adaptation guide | Inspect theme/extension support before choosing a rewrite; account for shared color tokens, sprite states, fonts, and host scaling. |
| Next | Desktop delivery recipe | Editable SVG icon sources, automatic regeneration during builds, stable launch paths, and real desktop text/startup checks. |
| Next | Repeatable distribution | Versioned packages, previous-package preservation, and comparison of source, packaged, and installed files. |

## Lessons already incorporated

The [design guide](design-guide.md) documents colored text fringes in Windows Electron apps using the bundled font recreation, including why a CSS-only workaround was insufficient and how to verify the startup setting in the real host. It also records the unpacked-app startup principle and the need for stable launch paths.

Repeated tab corrections show that choosing an appropriate control matters as much as drawing its bevel. Property tabs, document tabs, toolbar toggles, and command buttons should communicate different roles.

Native theme work exposed color tokens shared by unrelated surfaces. A token named for an active tab may also fill an entire panel. Map actual usages before applying the palette.

Music-editor work exposed arbitrary colors and cumbersome connection modes. Content colors should have a stable meaning and labels; the interface should preserve the task's visual relationships. Good chrome alone does not establish good interaction design.

Menu adapters can reuse existing application commands and mirror enabled state, but may lose pointer press-and-drag behavior or focus restoration. Document such decisions and verify the interaction as a whole.

## Feeding improvements back

For a meaningful integration or correction, record the project and relevant source revision, observed friction, reusable lesson, and verification scope. Distinguish user feedback, source inspection, and runtime evidence. Note which host and display scales were checked.

Decide whether the result belongs in the design guide, widget catalogue, an independent example, or delivery guidance. Repackage after updating the maintained source, and distinguish that from updating an installed copy. Keep application-specific engines and policies in their own projects.

Preserve [snapshot integrity and attribution](provenance.md). Archived screenshots and test sources are evidence to study, not current passing results.
