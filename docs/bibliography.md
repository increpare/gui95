# Bibliography for period-appropriate Windows 95 applications

This is the wider reading list behind the [historical reading shelf](historical-sources.md). The shelf says which Microsoft document to trust for a Windows 95 decision. This list covers everything else worth having to hand: the design books, the programming references, source code you can read, picture archives, and the Windows 98 and Windows XP material for comparison.

Links were checked on 18 November 2026. Each entry says how far it was verified:

- **Opened** means the document itself was retrieved and looked at.
- **Local copy** means the repository owner bought a copy on 18 November 2026 and it is in the library folder below. Its title and copyright pages were checked; the book was not read through for this list, so descriptions still rest on the catalogue record and general reputation.
- **Catalogued** means a library or archive record confirms the edition, but the text was not read for this list. Descriptions of those books come from their catalogue records and general reputation, so check a claim against the book before relying on it.

Research copies are in two ignored folders in the repository. `.codex_tmp/period-library/` holds the design guides, books, MSDN mirror and source code listed here. `.codex_tmp/period-api/` holds the API shelf described in the [reading shelf](historical-sources.md#period-api-and-component-references): the Delphi 2 help, the Win32 help file and the Systems Journal articles. Each folder has a `README.md` and a `collection.json` recording where every file came from and its hash. They are research copies, not part of GUI95's MIT source distribution, and a fresh clone has neither folder.

## The ten that help most

| # | Source | Why it earns its place |
| --- | --- | --- |
| 1 | The final 1995 *Windows Interface Guidelines for Software Design* | The repository only had the February 1995 draft as a full text. The final text is now held twice: a scan of the printed book, and searchable HTML with figures from the MSDN mirror below. |
| 2 | Wine's `uitools.c` | A readable, tested implementation of `DrawEdge` and `DrawFrameControl`. It answers "which pixel is which color" questions that the manuals only describe in prose. |
| 3 | Microsoft's own File Manager source (`microsoft/winfile`, MIT) | Real Microsoft dialog templates, menus, accelerators and toolbar bitmaps from the Windows NT 4 tree, legally published. |
| 4 | Virginia Howlett, *Visual Interface Design for Windows* (1996) | Written by the person who managed the visual design of Windows 95. It covers color, icons, fonts and layout from the designer's side. |
| 5 | *The Windows Interface: An Application Design Guide* (1992) | The Windows 3.1 guide the 1995 one replaced. It shows what changed and what was simply carried over. |
| 6 | Charles Petzold, *Programming Windows 95* (1996) | The standard account of how controls, dialogs, menus and scroll bars behave, with source for every example. |
| 7 | The MSDN Library mirror (`techshelps.github.io/MSDN`) | Period articles, the Knowledge Base, the logo handbook, and the Windows 98-era SDK reference, all as linkable HTML. |
| 8 | Raymond Chen, *The Old New Thing* | The reasons behind decisions, from someone on the Windows 95 team. Especially the dialog manager and dialog template series. |
| 9 | GUIdebook and Toasty Tech screenshot galleries | Pictures of every stock dialog and control state, for comparison with what you built. |
| 10 | *The Microsoft Manual of Style for Technical Publications* (1995) | The wording rules for menus, buttons, messages and Help in the period: what was capitalized, what took an ellipsis, what a dialog was called. |

## Microsoft design guidance, 1992–1995

**The Windows Interface Guidelines for Software Design** (final text), Microsoft, 1995. [HTML in the MSDN Library mirror](https://techshelps.github.io/MSDN/WINGUIDE/S115b5.htm). Opened: the folder holds 338 pages and the book's figures as GIFs, the introduction matches the published title, and no page carries the draft's "preliminary" label. The mirror comes from a later MSDN Library disc (the folders around it date it to about 1998), so treat it as the final book's text republished, and use the [printed-page pointers](historical-sources.md#the-1995-published-handbook) when quoting the book. A scan of the printed book is a local copy (580 PDF pages, Microsoft Press, 1995); the same scan can be [borrowed at the Internet Archive](https://archive.org/details/windowsinterface00micr). The scan is the one to cite for printed page numbers.

**The Windows Interface: An Application Design Guide**, Microsoft, 1992 (Windows 3.1 SDK document PC28921-0692). [Bitsavers PDF](https://bitsavers.org/pdf/microsoft/windows_3.1/Microsoft_Windows_3.1_SDK_1992/PC28921-0692_Windows_Interface_Applications_Design_Guide_199206.pdf). Opened. This is the Windows 3.1 predecessor. Use it to tell a Windows 95 change from an inherited convention such as menu order, access keys or the MDI rules. It is not evidence for the Windows 95 look.

**Designed for Microsoft Windows NT and Windows 95 Logo Handbook**, Microsoft. [HTML in the MSDN mirror](https://techshelps.github.io/MSDN/SPECS/html/nt95logo.htm), with the [later logo requirements](https://techshelps.github.io/MSDN/WINLOGO/devdoc/good/pdapp/logo_84xf.htm). Opened (title pages). This is what an application had to do to carry the logo: install and uninstall, long file names, the registry, and following the interface guidelines. It is useful for desktop-packaging decisions. The mirrored edition covers both NT and 95, so it is later than the first 1995 requirements.

**The Microsoft Manual of Style for Technical Publications**, Microsoft Press, 1995 (first edition). [Lending scan](https://archive.org/details/microsoftmanualo00micr). Local copy. Use it for interface wording. The 1998 second edition is a different text; see the later material below.

**Microsoft Windows Guidelines for Accessible Software Design**. The earliest dated edition found was 7 May 1997, cited in a [W3C list message](https://lists.w3.org/Archives/Public/w3c-wai-au/1999AprJun/0231.html). A 1995 edition was not found, so do not cite one. The 1995 handbook's own chapter 14 remains the period source for accessibility.

## Books by the people who built or studied it

**Visual Interface Design for Windows: Effective User Interfaces for Windows 95, Windows NT, and Windows 3.1**, Virginia Howlett, Wiley, 1996, ISBN 0-471-13419-8. [Lending scan](https://archive.org/details/visualinterfaced0000howl). Local copy. Howlett managed the visual design of Windows 3.1, NT and 95 at Microsoft.

**The Windows 95 User Interface: A Case Study in Usability Engineering**, Kent Sullivan, CHI 1996. [ACM page](https://chi1996.acm.org/proceedings/desbrief/Sullivan/kds_txt.html). Opened; already on the shelf.

**About Face: The Essentials of User Interface Design**, Alan Cooper, IDG Books, 1995, ISBN 1-56884-322-4. [Lending scan](https://archive.org/details/aboutfaceessenti00coop). Local copy. A critique of Windows interface conventions written in the same year, by a Windows developer. Use the 1995 first edition; the later editions are different books.

**GUI Design Essentials**, Susan Weinschenk, Pamela Jamar and Sarah Yeo, Wiley, 1997 ([lending scan](https://archive.org/details/guidesignessenti00wein)); **GUI Design Handbook**, Susan Fowler, McGraw-Hill, 1998 ([lending scan](https://archive.org/details/guidesignhandboo0000fowl)); **The Cross-GUI Handbook**, Aaron Marcus and others, Addison-Wesley, 1995 ([lending scan](https://archive.org/details/crossguihandbook0000marc)). Local copies of all three. These are third-party control-by-control guides from the period. They show how working designers read Microsoft's rules, and the last compares Windows with Motif, OS/2 and the Macintosh.

**Hardcore Software**, Steven Sinofsky, chapter [038: Designed for Windows 95](https://hardcoresoftware.learningbyshipping.com/p/038-designed-for-windows-95). Opened (title only). A later memoir of how Office adopted the Windows 95 conventions. It is a recollection, not a specification.

**The Old New Thing**, Raymond Chen, Microsoft. Opened (titles and links from the blog's own index). Chen worked on Windows 95. The most useful posts here:

- [The evolution of dialog templates: summary](https://devblogs.microsoft.com/oldnewthing/20040624-00/?p=38733/), the series on the binary layout of dialog resources, including the 32-bit classic template and its `DS_3DLOOK` flag.
- [GetDialogBaseUnits is a crock](https://devblogs.microsoft.com/oldnewthing/20040217-00/?p=40573/), on converting dialog units to pixels correctly.
- [The dialog manager, part 3: Creating the controls](https://devblogs.microsoft.com/oldnewthing/20050331-00/?p=36003/), part of a nine-part series on how dialogs are built, navigated and dismissed.
- [The evolution of menu templates: introduction](https://devblogs.microsoft.com/oldnewthing/20080708-00/?p=21713/).
- [When do you put … after a button or menu?](https://devblogs.microsoft.com/oldnewthing/20040517-00/?p=39313/)
- [Where did the names of the fonts Marlett and Verdana come from?](https://devblogs.microsoft.com/oldnewthing/20130625-00/?p=3993/)
- [Why do some people call the taskbar the "tray"?](https://devblogs.microsoft.com/oldnewthing/20030910-00/?p=42583/) and [Why do you have to click the Start button to shut down?](https://devblogs.microsoft.com/oldnewthing/?p=43083)
- [What defines an old-style common dialog?](https://devblogs.microsoft.com/oldnewthing/20180917-00/?p=99745)
- [The history of the Windows XP common controls](https://devblogs.microsoft.com/oldnewthing/20080129-00/?p=23663/), for the 98-to-XP transition.

These are recollections written years later. They explain intent well; confirm a specific measurement elsewhere.

## Programming references

The shelf already lists Nancy Cluts's *Programming the Windows 95 User Interface*, the *Programmer's Guide to Microsoft Windows 95*, the Win32 Programmer's Reference help file and the Delphi 2 help. Add these:

**Programming Windows 95**, Charles Petzold, Microsoft Press, 1996, ISBN 1-55615-676-6. [Open scan](https://archive.org/details/programming-windows-95) and [companion CD image with all sample source](https://archive.org/details/programming-windows-95-cd) at the Internet Archive (catalogued; the open PDF returned a server error on the day, so it is not in the local folder). Petzold's own [list of editions](https://www.charlespetzold.com/pw5/ProgWinEditions.html) confirms which edition covers which Windows.

**Windows 95: A Developer's Guide**, Jeffrey Richter and Jonathan Locke, M&T Books, 1995. [Lending scan](https://archive.org/details/windows95develop00rich). Local copy. Known for dialog techniques, custom controls and subclassing.

**Microsoft Windows 3.1 Programmer's Reference, Volume 4: Resources**, Microsoft Press, 1992. [Bitsavers PDF](https://bitsavers.org/pdf/microsoft/windows_3.1/Windows_3.1_Programmers_Reference_Volume_4_Resources_1992.pdf). Opened. The resource-script language for dialogs, menus, accelerators and string tables, which Windows 95 kept. Read it with Chen's template series.

**Win32 SDK for Windows 95 and Windows NT 3.51**, Microsoft, 1995. [Disc image at the Internet Archive](https://archive.org/details/Microsoft_Developer_Network_Developer_Platform_Disk_2_of_3_Win32_SDK_1995) (catalogued, 470 MB, not downloaded). The SDK's sample tree and headers are primary evidence for control styles and constants. An archive user's [guide to the early MSDN discs](https://virtuallyfun.com/2019/03/27/early-msdn-cds-on-archive-org/) lists the 1992–1995 Development Library discs.

**MSDN Library mirror**, [techshelps.github.io/MSDN](https://techshelps.github.io/MSDN/WINGUIDE/S115b5.htm) (the only index is a 12 MB [flat file list](https://techshelps.github.io/MSDN/indexms.html), so go in by folder). Opened. Useful folders: `WINGUIDE` (the guidelines), `WIN95UI` (Cluts's book), `DNWIN95` (Windows 95 technical articles), `PERIOD95` to `PERIOD98` (Microsoft Systems Journal and MSDN News by year), `KB` (Knowledge Base, for example [Q134861 on the Marlett font](https://techshelps.github.io/MSDN/KB/Source/win95x/q134861.htm)), `SPECS` and `WINLOGO` (logo handbooks), `SHELLCC` and `WINUI` (the shell, common controls and user-interface reference as of about 1998). The API folders are Windows 98-era; date a feature by its stated minimum version, as the shelf explains.

**Microsoft Systems Journal archive**, [jacobfilipp.com/MSJ](https://jacobfilipp.com/MSJ/). Opened. Already used on the shelf for the Control Spy articles; the rest of 1995–1998 is there too.

**Microsoft Knowledge Base archive**, [jeffpar.github.io/kbarchive](https://jeffpar.github.io/kbarchive/). Opened (index). A second, searchable copy of the old KB articles.

## Product documentation and internals

**Microsoft Windows 95 Resource Kit**, Microsoft Press, 1995. [Bitsavers PDF](https://bitsavers.org/pdf/microsoft/resource_kits/Windows_95_Resource_Kit_1995.pdf). Opened. The administrator's reference. Use it for the registry, where settings such as window metrics and color schemes are stored, and for the exact names of system components.

**Inside Windows 95**, Adrian King, Microsoft Press, 1994. [Bitsavers PDF](https://bitsavers.org/pdf/microsoft/windows_95/King_-_Inside_Windows_95_1994.pdf). Opened. Written before release, so it describes the design as intended in 1994, including the shell chapter.

**Windows Internals**, Matt Pietrek, Addison-Wesley, 1993. [Bitsavers PDF](https://bitsavers.org/pdf/microsoft/windows_3.1/Pietrek_-_Windows_Internals_1993.pdf). Opened. Pseudocode for the Windows 3.1 window manager: window creation, painting, the dialog manager and message dispatch. Windows 95's USER grew from this code, so it is the nearest thing to reading the original. It describes 3.1, not 95.

**Windows 95 System Programming Secrets**, Matt Pietrek, IDG Books, 1995 ([lending scan](https://archive.org/details/windows95systemp00matt)); **Unauthorized Windows 95**, Andrew Schulman, IDG Books, 1994 ([lending scan](https://archive.org/details/unauthorizedwind00schu)). Local copies; the Pietrek file is a 1999 electronic conversion with live text, not a page scan, so its page numbers may not match the printed book. Both are about the system underneath. They are rarely needed for interface work.

## Source code you can read

No Windows 95 source has been published by Microsoft. What exists legally is one real Microsoft program, several independent reimplementations, and a number of toolkits that drew the classic look themselves.

### Published by Microsoft

**Windows File Manager**, [github.com/microsoft/winfile](https://github.com/microsoft/winfile), MIT. Opened (README). Released by Microsoft in 2018 from the Windows NT 4 source and archived in 2025. The repository's `original_plus` tag is the NT 4 source with minimal changes; the main branch has later additions. File Manager is a Windows 3.x design, but `src/res.rc` and the toolbar bitmaps beside it are genuine Microsoft dialogs and artwork, and it is the only stock Windows program of the era with a clear open license.

**Windows classic samples**, [github.com/microsoft/Windows-classic-samples](https://github.com/microsoft/Windows-classic-samples), MIT. Opened (README). Modern Win32 samples, useful for control APIs rather than for 1995 behavior.

**MFC and VCL source** shipped with Visual C++ 4 and the higher Delphi 2 editions. It is readable if you own the product, but it is not open source, so it is not collected here. The [Visual C++ 4.0 manuals](https://bitsavers.org/pdf/microsoft/visual_c++/Visual_C++_4.0_Sep95/) are at Bitsavers.

### Independent reimplementations of the Windows libraries

**Wine**, [gitlab.winehq.org/wine/wine](https://gitlab.winehq.org/wine/wine), LGPL 2.1 or later. Opened, through the [GitHub mirror](https://github.com/wine-mirror/wine) because the project's own site turns away scripted readers. Written without reference to Microsoft source and tested against real Windows. The files that matter:

| File | What it answers |
| --- | --- |
| [`dlls/user32/uitools.c`](https://github.com/wine-mirror/wine/blob/master/dlls/user32/uitools.c) | `DrawEdge` and `DrawFrameControl`: which of the four bevel colors goes on which line for raised, sunken, etched and bump edges; caption, scroll and check glyphs |
| [`dlls/win32u/sysparams.c`](https://github.com/wine-mirror/wine/blob/master/dlls/win32u/sysparams.c) | Default system colors and default window metrics. The defaults are the Windows 2000 scheme (button face `212, 208, 200`), not Windows 95's `192, 192, 192`, so take the structure from here and the 1995 values from elsewhere |
| [`dlls/win32u/defwnd.c`](https://github.com/wine-mirror/wine/blob/master/dlls/win32u/defwnd.c), [`scroll.c`](https://github.com/wine-mirror/wine/blob/master/dlls/win32u/scroll.c), [`menu.c`](https://github.com/wine-mirror/wine/blob/master/dlls/win32u/menu.c) | Title bars and frames, scroll bar geometry and timing, menu layout and keyboard handling |
| [`dlls/user32/button.c`](https://github.com/wine-mirror/wine/blob/master/dlls/user32/button.c) and its neighbours | Push buttons, check boxes, group boxes, edit, list and combo boxes |
| [`dlls/comctl32/`](https://github.com/wine-mirror/wine/tree/master/dlls/comctl32) | Toolbar, status bar, tabs, header, trackbar, progress, up-down, tooltips, tree and list views, property sheets |
| [`dlls/comdlg32/comdlg32.rc`](https://github.com/wine-mirror/wine/blob/master/dlls/comdlg32/comdlg32.rc) | Open, Save, Font, Color, Print and Find dialog templates in dialog units |

A [1997 snapshot of `uitools.c`](https://goma.googlesource.com/wine/+/refs/tags/wine-970914/controls/uitools.c) is short and close to the Windows 95 behavior alone, before later additions.

**ReactOS**, [github.com/reactos/reactos](https://github.com/reactos/reactos), GPL 2 or later. Opened. A second implementation; [`win32ss/user/ntuser/draw.c`](https://github.com/reactos/reactos/blob/master/win32ss/user/ntuser/draw.c) and [`nonclient.c`](https://github.com/reactos/reactos/blob/master/win32ss/user/ntuser/nonclient.c) cover the same ground as Wine's `uitools.c` and `defwnd.c`. Where the two agree, the behavior is probably right. It targets Windows Server 2003 behavior, so check era-sensitive details.

### Toolkits that drew the classic look themselves

| Project | File | License | Note |
| --- | --- | --- | --- |
| Qt | [`qwindowsstyle.cpp`](https://code.qt.io/cgit/qt/qtbase.git/tree/src/widgets/styles/qwindowsstyle.cpp), `qdrawutil.cpp` | LGPL 3 and others | A complete classic Windows style drawn without calling Windows |
| wxWidgets | [`src/univ/themes/win32.cpp`](https://github.com/wxWidgets/wxWidgets/blob/master/src/univ/themes/win32.cpp) | wxWindows Library Licence | The same, for wxUniversal |
| SerenityOS | [`ClassicStylePainter.cpp`, `ClassicWindowTheme.cpp`](https://github.com/SerenityOS/serenity/tree/master/Userland/Libraries/LibGfx) | BSD 2-Clause | A modern system with a 1990s look. Short and readable, but its own design, not a copy of Windows |

All opened. These are interpretations. Use them to see how someone else solved a drawing problem, not as evidence of what Windows did.

### Web and desktop recreations

Besides 98.css, Win31 and Chicago95 on the shelf: [os-gui](https://github.com/1j01/os-gui) and [jspaint](https://github.com/1j01/jspaint) (menus, windows and a full Paint recreation in the browser), [React95](https://github.com/react95-io/React95), and [XP.css](https://github.com/botoxparty/XP.css) for the XP look. Opened (READMEs). [felixrieseberg/windows95](https://github.com/felixrieseberg/windows95) runs the real system in an emulator inside Electron, which is the quickest way to check real behavior against a recreation.

### Decompilations

[SpaceCadetPinball](https://github.com/k4zmu2a/SpaceCadetPinball) is a decompilation of the Plus! pinball game. Opened (README). It is included as the best-known example; it teaches nothing about the standard controls, and decompiled Microsoft code has no license from Microsoft.

### Not included: leaked Windows source

Leaked source trees for Windows NT 4, 2000 and XP circulate online. They are unlicensed Microsoft property, and reading them would compromise the provenance of this project's own code, which is why Wine and ReactOS forbid contributors from doing so. None was retrieved or consulted, and none should be cited here.

## Pictures and running systems

**GUIdebook**, [guidebookgallery.org](https://guidebookgallery.org/), with its [Windows 95 section](https://guidebookgallery.org/guis/windows/win95). Opened. Screenshots sorted by component (dialogs, icons, splash screens, cursors), plus scanned articles and advertisements.

**Toasty Tech GUI gallery**, [Windows 95 page](http://toastytech.com/guis/win95.html). Opened. Walk-through screenshots of each release, including the betas.

**A running Windows 95**, in an emulator such as 86Box or PCem, or the Electron package above. This is the final authority for any behavior question, and the only way to capture states that no screenshot archive has. You need your own licensed copy of Windows.

## Fonts

**Marlett**, [Microsoft Typography page](https://learn.microsoft.com/en-us/typography/font-list/marlett) and [KB Q134861](https://techshelps.github.io/MSDN/KB/Source/win95x/q134861.htm). Opened. Marlett is the TrueType font Windows 95 introduced for caption buttons, scroll arrows, check marks and option-button dots. The font itself is Microsoft's and is not redistributable.

## Later material: Windows 98, 2000 and XP

None of this is evidence for Windows 95. It is here for comparison and for apps that deliberately target a later look.

**The Microsoft Manual of Style for Technical Publications, Second Edition**, Microsoft Press, 1998, ISBN 1-57231-890-2. [Lending scan](https://archive.org/details/isbn_9781572318908). Local copy. The Windows 98-era revision of the wording rules.

**Microsoft Windows 98 Resource Kit**, Microsoft Press, 1998. [Bitsavers PDF](https://bitsavers.org/pdf/microsoft/resource_kits/Windows_98_Resource_Kit_1998.pdf). Opened.

**Windows 98-era controls**: the `SHELLCC` and `WINUI` folders of the MSDN mirror, and the Control Spy articles on the shelf, cover the Internet Explorer 4 common controls (rebars, flat toolbars, the date picker).

**Microsoft Windows User Experience**, Microsoft Press, 1999, ISBN 0-7356-0566-1. [Text at Microsoft Learn](https://learn.microsoft.com/en-us/previous-versions/ms997438(v=msdn.10)). Opened (first page). The successor to the 1995 handbook, written for Windows 98 and 2000. Its [layout specifications](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/bb226818(v=vs.85)) page gives control sizes and spacing in dialog units.

**Creating Windows XP Icons**, Windows User Experience Team, July 2001. [Microsoft Learn](https://learn.microsoft.com/en-us/previous-versions/ms997636(v=msdn.10)). Opened. The XP icon style: sizes, palette, perspective and drop shadow.

**Visual styles**: [Visual Styles overview](https://learn.microsoft.com/en-us/windows/win32/controls/themes-overview) and [Enabling Visual Styles](https://learn.microsoft.com/en-us/windows/win32/controls/cookbook-overview). Opened. How the XP theme engine replaced the classic drawing code, and how a program opted in. The 2001 *Windows XP Visual Guidelines* site was found only as third-party uploads, so it is not linked.

**Windows User Experience Interaction Guidelines** (Vista and Windows 7), Microsoft, 2010. [PDF hosted by UC Irvine](https://www.ics.uci.edu/~kobsa/courses/ICS104/course-notes/UXGuide.pdf) and [current text](https://learn.microsoft.com/en-us/windows/win32/uxguide/guidelines). Opened. Much later, but it states many of the classic rules (ellipses, access keys, dialog-unit spacing) more precisely than the 1995 book did.

## Not found

- *Designing Windows 95 Help* and the Windows 95 Help Authoring Kit. No archive copy turned up.
- A 1995 edition of the accessibility guidelines.
- An official copy of the 2001 Windows XP Visual Guidelines.
