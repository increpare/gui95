# Source provenance and notices

## Project snapshots

Edition: **14 October 2026**. The [manifest](../references/snapshot-manifest.json) is the exact file inventory and includes capture time, byte counts, SHA-256 hashes, original relative paths, and source revisions. Machine-specific checkout locations are omitted from the public manifest.

| Source | Preserved files | HEAD recorded at capture |
| --- | --- | --- |
| Vector95 | `references/vector95/` | `484f3b35e2f987978afb9b8c5d948cdd482f2c03` |
| sausage-music | `references/sausage-music/` | `cda204685846083b9e3811de52917f800e8c298a` |

Files were copied from the working trees. These revisions provide context; they do not assert that every copied file matches the commit. The file hashes identify the preserved content. Neither source project was edited.

The selection contains UI implementation, markup, styles, SVG assets, fonts, existing screenshots, and relevant test sources. It excludes the complete audio/vector engines, installed dependencies, build outputs, and runtime state. Original project documents are historical evidence, not instructions for work in this collection.

No top-level application license was present in either source root at capture. On **15 October 2026**, Stephen Lavelle authorized MIT licensing of his material redistributed in this collection. The root [MIT license](../LICENSE) covers his included source, artwork, screenshots, skill instructions, documentation, tooling, and demonstration code. This is a grant for the distributed material, not a change to the complete upstream applications. Archived bytes remain unchanged. Retain source identity and the applicable copyright and permission notices when extracting material.

The [third-party notices](../THIRD-PARTY-NOTICES.md) identify exceptions to the root MIT grant. The fonts and upstream theme material below retain their own terms and notices.

## Font attribution

The two projects' regular font files are byte-identical, and their bold files are also byte-identical. The paired SHA-256 values are recorded in the manifest. Their surrounding notices differ:

- Vector95's [vendoring script](../references/vector95/scripts/vendor.mjs) copies these files from `98.css/fonts/converted/` and copies [the package MIT license](../references/vector95/src/vendor/font-LICENSE.txt) as `font-LICENSE.txt`.
- ProcGen FM's [notices](../references/sausage-music/web/site/win31-notices.txt) identify the fonts as MS Sans Serif recreations by **lou**, licensed **CC BY-SA 3.0**, with the original font readmes and licenses preserved.

For font reuse, retain the specific original font attribution and CC BY-SA notices alongside either identical copy. A package-level MIT notice should not be used to discard the font's specific license.

| Font | Original source | Preserved notice |
| --- | --- | --- |
| MS Sans Serif regular recreation | [Fontstruct 1384746](https://fontstruct.com/fontstructions/show/1384746) | [Readme](../references/sausage-music/web/site/ms-sans-serif-readme.txt), [license](../references/sausage-music/web/site/ms-sans-serif-license.txt) |
| MS Sans Serif bold recreation | [Fontstruct 1384862](https://fontstruct.com/fontstructions/show/1384862) | [Readme](../references/sausage-music/web/site/ms-sans-serif-bold-readme.txt), [license](../references/sausage-music/web/site/ms-sans-serif-bold-license.txt) |

ProcGen FM also preserves attribution to Wiesław Šoltés's MIT-licensed Win31 theme in `win31-notices.txt`. Keep that notice with reused material derived from that theme.

## Historical publications

Microsoft's manuals and the CHI paper are linked in the [reading shelf](historical-sources.md) with their publication context. They are not relicensed or bundled in full. The February 1995 draft, the final 1995 book, later guidance, and modern recreation projects are distinguished explicitly.

## Verification scope

The collection's integrity check verifies archived bytes and local documentation links. Existing screenshots were visually inspected for use as references. Existing test sources were preserved as examples, not rerun against the original apps. This collection does not establish cross-browser compatibility or accessibility conformance for an extracted component.
