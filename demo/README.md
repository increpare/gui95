# GUI95 reference desktop

Open `dist/index.html` directly in a modern browser, or run `node serve.mjs` in this directory and visit [the local preview](http://127.0.0.1:1995). No installation or build is required. Audio begins only after Play is pressed.

The demo puts controls into small working programs:

- Explorer: folders, object selection, icon/detail views, resizable split pane, source images, and reference topics.
- Paint: pencil, brush, eraser, rectangles, ellipses, palette, custom colors, text, 20-step undo, and PNG export.
- Display Properties: preview, property tabs, font radio choices, larger-text checkbox, and distinct OK / Cancel / Apply behavior.
- Media Player: original synthesized melodies, track selection, play/pause, stop, repeat, volume, and mute.
- GUI95 Help: searchable topics explaining interactions, sources, editions, and modern adaptations.

Program windows can be moved, resized from all four edges and corners, minimized, maximized, restored, closed, and reopened through desktop shortcuts or Start. Display Properties uses a fixed property-sheet window with a close button. Menus support pointer tracking, F10, Alt plus their heading initial, and arrow navigation. Desktop and Explorer objects open on double-click or keyboard activation.

This is an original demonstration app, not an OS emulator or a bundled version of either reference application. It does not load the vector or audio engines. SVG icons are from the preserved Vector95 reference; the bundled font recreations by lou retain their original CC BY-SA 3.0 notices under `dist/assets/`. The Help credits link to those notices. The reference screenshots remain labeled as source captures.

Native browser color selection, PNG downloads, responsive window fitting, and enlarged text are deliberate modern adaptations. The page does not save desktop preferences or drawings between reloads; use Paint's Save As command to retain an image.

The default interface uses Tahoma at 12 px, following Vector95’s font choice with a small readability increase. Display → Appearance retains the unmodified pixel-font recreation as an optional 11 px reference; it may render with gaps at some display scales. Larger text applies to dialogs as well as program windows.
