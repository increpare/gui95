# Historical audit of GUI95 recommendations

Reviewed 18 October 2026. GUI95 captures the characteristic control states well. Its largest weakness is that short reuse instructions can lose the qualifications in the design guide: a default palette becomes an exact-color recipe, example dimensions become a general scale, and a useful menu adapter can appear to establish native behavior.

The findings below propose changes to the maintained guidance. Application and demo discrepancies need separate implementation decisions. This review does not change the archived sources.

## Scope and source editions

Reviewed the skill entrypoint, design and reuse guides, integration lessons, widget catalogue, demo description, and the historical status of desktop delivery guidance. Menu and Display Properties source was inspected where it establishes a concrete discrepancy. This is not a new runtime certification of every consumer app.

Primary material:

- [Microsoft interface guide, February 1995 preliminary edition](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf). Page links below are PDF viewer pages. The final 1995 handbook's contents are catalogued in the [reading shelf](historical-sources.md); its full published text was not available for this audit.
- [Randy Brown, Microsoft, Developing Windows 95 Applications in Visual FoxPro, updated January 1997](https://techshelps.github.io/MSDN/BACKGRND/html/msdn_win95app.htm), preserved MSDN article. Distinguishes Windows compatibility from Office 95 logo requirements.
- [The Microsoft Windows User Experience, online guide in a 2001 print snapshot](https://blog-geofcrowl-static-images.s3.us-east-1.amazonaws.com/2020-02-17-collection-higs/MS-Windows-User-Experience-2001.pdf). Later Windows guidance; the capture date does not make its recommendations stock Windows 95 rules.
- [Kent Sullivan, Microsoft, CHI 1996 usability case study](https://chi1996.acm.org/proceedings/desbrief/Sullivan/kds_txt.html).

## Appearance and dimensions

| Finding in our guidance | Historical evidence | Proposed correction |
| --- | --- | --- |
| The [reuse brief](reuse.md#brief-for-a-future-project) asks for exact bevel colors. The design guide more carefully identifies observed project colors. | The [1997 MSDN article](https://techshelps.github.io/MSDN/BACKGRND/html/msdn_win95app.htm) requires system metrics and recommends system colors. The [1995 border discussion](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=288) uses system color roles. | Describe our hexadecimal values as the default classic scheme. Preserve theme and contrast choices where the host supports them. A fixed reproduction can remain fixed, but should be identified as such. |
| The typography section accurately reports Vector95's Tahoma and ProcGen FM's recreation, but supplies no period baseline alongside them. | [1995, PDF p. 298](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=298) specifies MS Sans Serif 8 point as the U.S. default. The [later guide, PDF pp. 326–327](https://blog-geofcrowl-static-images.s3.us-east-1.amazonaws.com/2020-02-17-collection-higs/MS-Windows-User-Experience-2001.pdf#page=326), recommends Tahoma 8 point for Windows 2000. | Add a release-specific baseline; retain Tahoma as Vector95's adaptation. Do not present 11 CSS pixels, 8 pixels, and 8 points as interchangeable units. |
| The dimensions table is already qualified as implementation measurements. The brief can still encourage treating the entire scale as fixed. | The [1995 layout section, PDF p. 298](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=298), bases layout on fonts, system metrics, and dialog base units. | Keep the table as evidence of those implementations. Carry font changes and layout growth into the reusable brief; display scaling alone does not test longer text or a different font. |

## Menu fidelity

| Finding in our material | Historical evidence | Proposed correction |
| --- | --- | --- |
| The [archived menu controller](../references/vector95/src/menus.js) opens a dropdown on F10; Escape from a top-level dropdown leaves menu mode outright. Its closed-menu handler has no standalone Alt bar mode. | [1995, PDF p. 108](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=108): Alt activates menu-bar navigation; Escape unwinds a level before leaving the bar. | Identify the simplified state machine explicitly. Add this to the extraction checklist instead of describing the reference as complete native parity. |
| Its pointer hover opens a submenu immediately. | [1995, PDF p. 114](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=114): pointer cascades use a delay; keyboard opening is immediate. | Document the difference and preserve keyboard responsiveness when adding pointer dwell. |
| The renderer supplies one check glyph for every checked menu setting. Label punctuation is left to each app. | [1995, PDF pp. 117–118](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=117): independent settings use checks, exclusive choices use option marks; ellipses signal required input, not every secondary window. | Add the missing distinction to the menu contract. An exclusive View choice should not be taught as identical to an independent toggle. |
| The integration lesson permits cycling colliding heading mnemonics or choosing unique letters. | [1995, PDF p. 116](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=116) prefers unique access keys. | Put unique mnemonics first. Keep cycling as a fallback for existing labels, rather than an equally preferred starting point. |

These are limitations of the preserved implementation and its documentation, not authorization to rewrite the reference snapshot. The recent-files finding is already qualified separately in the [design guide](design-guide.md#file-menu-and-recently-opened-files).

## Dialogs and settings

| Finding in our material | Historical evidence | Proposed correction |
| --- | --- | --- |
| Dialog guidance discusses preview versus commit but leaves several transaction rules implicit. | [Later guide, PDF pp. 165–166](https://blog-geofcrowl-static-images.s3.us-east-1.amazonaws.com/2020-02-17-collection-higs/MS-Windows-User-Experience-2001.pdf#page=165): Apply keeps the sheet open; Cancel discards pending changes, not applied ones. Buttons outside pages normally cover all pages. | Add an explicit property-sheet contract and distinguish it from a live inspector. |
| The [demo's `closeWindow` and Cancel handler](../demo/dist/desktop.js) discard a Display draft through the same path. | Both [1995, PDF p. 158](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=158) and [the later guide, PDF p. 166](https://blog-geofcrowl-static-images.s3.us-east-1.amazonaws.com/2020-02-17-collection-higs/MS-Windows-User-Experience-2001.pdf#page=166) distinguish property-sheet Close from Cancel and discuss resolving pending edits. | Flag a demo-versus-manual discrepancy. Decide the intended sheet behavior before changing it; do not make a universal rule that every dialog X must prompt or that every X means Cancel. |
| The tab lesson explains multirow construction without helping choose whether to use it. | [1995, PDF p. 141](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=141) accommodates multiple rows. The [later guide, PDF pp. 147 and 164](https://blog-geofcrowl-static-images.s3.us-east-1.amazonaws.com/2020-02-17-collection-higs/MS-Windows-User-Experience-2001.pdf#page=147) discourages them. | Preserve the technique as an era-dependent option. Add a single-row default and alternatives for a crowded sheet; do not turn later advice into a 1995 prohibition. |
| The state table omits read-only and mixed-value fields; the dialog paragraph omits default-button safeguards. | [Later guide, PDF pp. 139, 160 and 323](https://blog-geofcrowl-static-images.s3.us-east-1.amazonaws.com/2020-02-17-collection-higs/MS-Windows-User-Experience-2001.pdf#page=139): read-only text can be selected; mixed values are distinct; destructive actions should not be the default. | Expand the state model before polishing appearances. Verify Enter and Space against the focused control. |

## Gaps beyond appearance

- **Choosing modality:** our frameless-caption lesson is an implementation solution. Add task-level guidance before it; repeated editing tools need a deliberate choice of modality. The [1995 modeless-interaction section, PDF p. 215](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=215), prioritizes continued interaction.
- **Keyboard reachability:** focused-control ownership is already covered well. Extend extraction checks to context menus, tab switching, and alternatives to dragging; [1995, PDF pp. 40 and 141](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=40) supplies relevant keyboard conventions.
- **Help and status:** the catalogue locates existing help code, but the main guide lacks a usage rule. In the [later guide, PDF p. 288](https://blog-geofcrowl-static-images.s3.us-east-1.amazonaws.com/2020-02-17-collection-higs/MS-Windows-User-Experience-2001.pdf#page=288), status help is supplemental. Essential information needs another reliable home.
- **Common dialogs:** an HTML `dialog` is a browser control, not the operating system's common file dialog. The [1997 MSDN guidance](https://techshelps.github.io/MSDN/BACKGRND/html/msdn_win95app.htm) recommends system-supplied dialogs and controls without making them universally mandatory. Clarify that distinction when choosing Open, Save, or Print interfaces.
- **Task testing:** most verification language checks controls individually. Sullivan's [1996 case study](https://chi1996.acm.org/proceedings/desbrief/Sullivan/kds_txt.html) emphasizes iterative and whole-product testing. Add one representative open–edit–save–reopen workflow to consumer reviews, including cancellation and recovery from a mistake.

## Recommendations to retain

The distinction between pressed, persistent, selected, and focused states is useful and consistent with the period control vocabulary. The guide already labels its dimensions as observed implementations. Existing lessons about input ownership, dialog cleanup, reachable controls, and restored geometry remain valuable.

Electron text rasterization, SVG tooling, CSS scrollbar selectors, 100–200% verification scales, macOS roles, and unpacked desktop delivery are contemporary GUI95 engineering choices. Their historical status does not establish whether they work; retain their implementation evidence and modern host checks. There is no reason to replace them with old compatibility-logo requirements such as mandatory printing, OLE, or mail integration merely to pursue a period appearance.

## Suggested next changes

1. Carry source qualifications into the entrypoint and reuse brief: default theme, chosen release's typography, scalable metrics, and identified adaptations.
2. Add a concise behavior checklist for menus, property sheets, input states, keyboard reachability, and help. Link detailed period passages rather than copying the manuals.
3. Label the archived menu's known simplifications and the demo's property-sheet Close policy. Fix consuming implementations separately from the preserved edition.
4. Keep later-era recommendations identifiable, especially Tahoma and tab-row advice. Evaluate the assembled workflow as well as its individual controls.
