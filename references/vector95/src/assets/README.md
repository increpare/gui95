# Editable SVG artwork

These are the source files for the app's own artwork. Open them in Vector 95 and save your changes here.

| Location      | Artwork                                                          |
| ------------- | ---------------------------------------------------------------- |
| `icons/`      | Toolbar, menu and layer icons; 16 × 16                           |
| `captions/`   | Window controls; 12 × 10                                         |
| `scrollbars/` | Scrollbar arrows; 7 × 4 or 4 × 7                                 |
| `examples/`   | Editable sample drawings with named layers and document metadata |
| `favicon.svg` | Application icon, also used to generate the Windows icon         |

Keep icon backgrounds transparent and use `currentColor` for paint that follows the interface's text colour. Fixed colours such as the blue in Save remain literal SVG colours. Save preserves theme paint; the editor displays it in its own text colour. File names identify icons in the interface, so preserve existing names when editing. The SVG's viewBox, geometry, styles and references come from the source file.

Run `npm run build:assets` to rebuild the runtime catalog, scrollbar CSS, and favicon. Browser preview rebuilds on reload; `npm start` and desktop packaging rebuild automatically. Generated files live in `src/generated/` and must not be edited. Optimization leaves these source files and the example metadata intact.
