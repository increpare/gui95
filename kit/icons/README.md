# Original geometric icons

105 original semantic symbols, authored for GUI95 in 2026. They use simple geometric
forms rather than copied Microsoft illustrations. See [CC0.txt](CC0.txt) for the
artwork dedication. Archived assets are not part of this collection.

`listIcons({query='',limit}={})` returns name, label, category, supported sizes,
states, formats, CC0 license, and provenance. `getIcon({name,size=16,state='normal',
format='svg',document=false})` returns those request fields plus `mimeType`,
`license`, `provenance`, `sha256`, and `data` (SVG text or a PNG Buffer). Unknown
names and unsupported options throw. Supported sizes are 16/32; states are normal,
selected, disabled. Selected artwork expects a navy selection background.

The large compositions use an integer grid and original extra highlights/insets.
Disabled icons use the classic white offset and gray foreground. `document:true`
composes the symbol on the shared folded-page document badge. All PNGs use the
unchanged exported `rasterize` and `encodePng` functions in tools/gui95-icons.mjs.

`getContactSheet()` in pack.mjs returns `{svg,png,html,width,height}`. The PNG shows
both sizes and every state with semantic labels. `await buildIconPack(directory)`
writes all 1,260 standalone SVG/PNG variants, contact sheets, CC0 dedication,
per-icon provenance manifest and SHA256SUMS. The public service creates equivalent
ready-to-use downloads on request; generated duplicate image files need not live
in source control.
