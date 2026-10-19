# Consistent caption controls

Use the [shared caption stylesheet](../examples/caption-controls.css) for new HTML title bars. Copy it unchanged into the app, load it after general button styles, and retain the MIT header. The [standalone window example](../demo/dist/widgets/window.html) uses the same file, inlined by its builder for offline use.

```html
<link rel="stylesheet" href="caption-controls.css">
<div class="gui95-caption-controls">
  <button type="button" class="gui95-caption-button"
    data-caption-icon="minimize" aria-label="Minimize"></button>
  <button type="button" class="gui95-caption-button"
    data-caption-icon="maximize" aria-label="Maximize"></button>
  <button type="button" class="gui95-caption-button"
    data-caption-icon="close" aria-label="Close"></button>
</div>
```

The stylesheet owns the complete button face, reset, dimensions, glyph placement and states. Do not replace the icons with `_`, `□`, `×` or other font characters: their visible bounds and baselines vary by typeface, fallback font and line height. Centering a text box does not center its ink. Do not add application-specific padding, font sizes or transforms to these buttons.

Load this stylesheet after the application's styles and remove older caption-specific sizing, padding and glyph rules. Check state selectors too: general pressed-button padding can shift an icon twice, so the shared pressed and disabled rules explicitly reset it. If the page has a Content Security Policy, allow `data:` in `img-src` for the embedded SVG masks. A blocked image can leave an apparently valid mask URL in computed style while painting no icon.

This is a modern GUI95 adaptation: 18 × 18 CSS-pixel buttons with a shared 10 × 10 icon canvas, four-pixel insets, integer-coordinate SVG masks and a ten-pixel-wide maximize outline. The minimize bar deliberately sits low inside that canvas. Maximize and Close occupy the upper and middle area, independent of text metrics. Use a 22- or 24-pixel caption height with two-pixel vertical padding so the 18-pixel buttons land on whole CSS pixels; an odd 23-pixel caption centers them at a half pixel. The close mask uses horizontal and vertical pixel steps rather than antialiased diagonal strokes. Resting icons have no transform; a press moves the complete icon one pixel right and down. Gray/white disabled embossing, a dotted keyboard-focus outline and forced-color roles are included. Fractional OS scaling still maps CSS pixels to device pixels; this does not promise identical physical pixels at every scale.

Keep native `<button>` semantics, explicit accessible names and native `disabled`. Use `type="button"` so caption actions cannot submit an enclosing form. The controls declare Electron's no-drag region; the containing title bar owns its drag region. Attach the app's existing window commands rather than importing a new window manager.

The maximize control must track actual host state. When maximized, set `data-caption-icon="restore"`, `aria-label="Restore"` and the action to Restore (or use a host maximize/restore toggle). Update from host events as well as clicks, including double-clicking the title bar and OS shortcuts. Changing the icon alone is insufficient. Keep document-close confirmation in the application's existing close path.

Verify the final app cascade, long captions, narrow windows, pointer press/release, keyboard activation, disabled controls, minimize, maximize, Restore and Close. Capture the intended desktop host at 100%, 125%, 150% and 200% scale. Check the actual visible glyphs as well as button bounds; equal DOM rectangles cannot detect a low font glyph or a missing mask. Also check enlarged UI text and forced colors. A browser child-window check does not establish native Electron behavior.

The consuming GUI95 Suite provides `tools/check-captions.mjs`: it checks identical stylesheet copies, visible ink bounds from device-resolution captures, press offsets and native window actions at four startup scale factors. It also checks Enter/Space ownership, external host-state changes and actual close requests using isolated profiles. Inspect raw device pixels at fractional scale; a browser-downsampled CSS-resolution crop can give misleading ink measurements.

Verify the stylesheet inside the finished package too. Explicit resource filters can omit a new shared file even when the source app passes every check; include it in those filters and compare the packaged bytes with this reference.

Automated desktop checks must be quiet from window construction onward. Use an isolated profile and create test windows hidden, transparent, non-focusable, off-screen and absent from the taskbar; intercept later `show`/`focus` calls before loading the app. Hiding a window after launch is too late to prevent flashes or stolen typing. Keep these settings confined to the test host, retain GPU rendering for visual checks, mute audio and suppress native dialogs and global shortcuts in the isolated run.
