# Windows interface manuals and historical sources

Start with the 1995 published handbook for the intended Windows 95 design vocabulary. The openly readable February draft is convenient for visual comparisons, but it predates the final release. Later guides and modern recreations are labeled separately below. Links checked on 14 October 2026; archival availability can change.

## The 1995 published handbook

**The Windows Interface Guidelines for Software Design**, Microsoft Press, 1995, ISBN **1-55615-679-0**. Microsoft's own [reading list](https://learn.microsoft.com/en-us/windows/win32/appuistart/other-resources) confirms the edition and identifies it as guidance for interface layout. A [bibliographic page with the published contents](https://guidebookgallery.org/books/thewindowsinterfaceguidelinesforsoftwaredesign/) provides navigation into the book.

The following are **printed pages in the published book**, not PDF viewer page numbers in the draft:

| Need | Reading pointer |
| --- | --- |
| Window frames, captions, scrolling, splitting | Chapter 6, from p. 95 |
| Menus, controls, toolbars | Chapter 7, from p. 121 |
| Modal and modeless windows, defaults, dialogs | Chapter 8, from p. 179 |
| MDI and other window models | Chapter 9, from p. 219 |
| Tooltips and status messages | Chapter 12, pp. 343–345 |
| Colors, fonts, borders, states, spacing, icons | Chapter 13, from p. 365; borders p. 372; states p. 377; layout p. 384 |
| Accessibility and internationalization | Chapter 14, from pp. 403 and 415 |
| Mouse and keyboard summaries | Appendixes A and B, from pp. 429 and 437 |

These pointers follow the reproduced table of contents; the linked catalogue is not the full book.

## The February 1995 preliminary guide

**The Windows Interface Guidelines — A Guide for Designing Software**, Microsoft, February 1995. [Read the PDF hosted by UC Irvine](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf).

The cover explicitly identifies this as preliminary documentation; the document is dated February 13, 1995 and the PDF has 372 pages. It is not the final 576-page printed handbook. Use its chapter titles, figure labels, or PDF viewer pages when navigating it.

Useful places to compare widgets:

- [PDF page 116](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=116): menu access keys.
- [PDF page 149](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=149): common toolbar images.
- [PDF pages 286–287](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=286): font roles, legibility and use of the user's system font; followed by dimensionality.
- [PDF page 290](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=290): field borders, followed by status and grouping borders.
- [PDF pages 291–296](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=291): pressed, option-set, unavailable, and focus appearances.
- [PDF page 298](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=298): 8-point MS Sans Serif as the default interface font, adjustment to user font settings, system metrics and dialog base units.
- [PDF pages 317–319](https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf#page=317): scaling custom information, application zoom and testing with enlarged system fonts.

PDF links use one-based viewer page numbers. The draft's printed pagination is irregular in places, so do not substitute the final book's page numbers.

## Period product documentation

**Introducing Microsoft Windows 95**, Microsoft Press, 1995, ISBN **1-55615-860-2**. [Archived Microsoft manual](https://bitsavers.computerhistory.org/pdf/microsoft/windows_95/Introducing_Microsoft_Windows_95_1995.pdf).

Useful for period product terminology and explanations of the operating system. This is a product manual, not the widget design specification. The search index exposed the title and copyright pages; direct retrieval of this archive failed during verification. Keep the title and ISBN as the fallback lookup rather than relying solely on the link.

## The original usability case study

**The Windows 95 User Interface: A Case Study in Usability Engineering**, Kent Sullivan, Microsoft, CHI 1996. [Read the paper at ACM](https://chi1996.acm.org/proceedings/desbrief/Sullivan/kds_txt.html).

This is the companion for understanding why the interface took its eventual form. It describes prototype iterations, task-based studies, and changes prompted by usability findings. Read the early findings and change-of-direction sections before deciding that every nostalgic interaction should be reproduced unchanged.

## Later Microsoft material

**Microsoft Windows User Experience**, Microsoft Press, 1999, ISBN **0735605661**. The edition is listed in [Microsoft's bibliography](https://learn.microsoft.com/en-us/windows/win32/appuistart/other-resources). Treat this as later Windows-era guidance when comparing changes, not as proof of stock Windows 95 appearance.

[About Common Controls](https://learn.microsoft.com/en-us/windows/win32/controls/common-controls-intro) is current Microsoft Win32 documentation. Use it to navigate native control concepts and APIs; its current contents are not a frozen 1995 SDK reference.

To date a control feature, read its minimum comctl32 version in that reference and the [Common Control Versions](https://learn.microsoft.com/en-us/windows/win32/controls/common-control-versions) page, whose `_WIN32_IE` table pairs 4.70 with `0x0300` (Internet Explorer 3.0) and 4.71 with `0x0400`. An element with no version note is, by Microsoft's convention, in every version of the DLL. For example, the [tree-view styles](https://learn.microsoft.com/en-us/windows/win32/controls/tree-view-control-window-styles) mark `TVS_CHECKBOXES` as 4.70, so check boxes in a tree are 1996 Windows 95 with Internet Explorer 3.0, not the 1995 release; the [integration lessons](integration-lessons.md#tree-check-boxes-what-the-control-did-and-what-the-app-did) record what the style did and did not do.

## Period API and component references

The following API shelf was checked on **10 November 2026**. It complements the design manuals above with implementation contracts. Local originals and searchable derivatives were saved in the repository's ignored `.codex_tmp/period-api/` folder, whose `README.md` and `collection.json` record provenance and hashes. They are research copies, not part of GUI95's MIT source distribution.

**Programming the Windows 95 User Interface**, Nancy Winnick Cluts, Microsoft Press, 1995, ISBN **1-55615-884-X**. [Archived original PDF](https://archive.decromancer.ca/bitsavers.org/pdf/microsoft/windows_95/Programming_the_Windows_95_User_Interface_1995.pdf). The retrieved scan has 410 PDF pages; title and copyright pages were inspected. It gives both Win32 C and MFC C++ examples, tested with Visual C++ 2.1/MFC 3.1. This is particularly useful for toolbars/status bars (chapter 1), list/tree/header controls (chapter 3), tabs/property sheets/wizards (chapter 4), rich edit (chapter 5), and common dialogs (chapter 6). Prefer chapter titles when comparing scans; printed and PDF pagination differ.

**Programmer's Guide to Microsoft Windows 95**, Microsoft Press, 1995, ISBN **1-55615-834-3**. [Archived original PDF](https://archive.decromancer.ca/bitsavers.org/pdf/microsoft/windows_95/Programmers_Guide_to_Microsoft_Windows_95_1995.pdf). The retrieved scan has 698 PDF pages. The title identifies contributions from the Microsoft Windows development team. Start with article 5, *Using Common Controls and Dialog Boxes*, then use the shell/taskbar sections when researching platform integration. This is a collection of implementation guidance, not a complete alphabetical SDK reference.

**Delphi 2 Desktop original online help**, Borland, 1996. [Archived CD and original file listing](https://archive.org/download/borland-delphi-desktop-version-2/borland-delphi-desktop-version-2.iso/). Only selected documentation files under `RUNIMAGE/DELPHI20/HELP` were retrieved; the IDE was not installed. Useful files are `VCL.HLP` (Delphi Library Reference), `CWG.HLP` (Component Writer's Guide), `DELPHI.HLP` (product/application help), `OBPASCAL.HLP` (Object Pascal Reference) and their contents files. The help explicitly discusses migration from Delphi 1.0 to 2.0. Local text/HTML derivatives were generated with the open-source [winhlp parser](https://pypi.org/project/winhlp/0.3.2/); keep originals authoritative if extraction formatting or links differ.

Relevant verified topics include `TForm.FormStyle`, `ActiveMDIChild`, `WindowMenu`, `Cascade`, `Tile`, `ArrangeIcons`, `CloseQuery`, `OnCloseQuery`, `Owner`, `Parent`, `Align`, `TPanel`, `TSpeedButton`, `TCustomControl`, `TGraphicControl` and `TCanvas`. The Component Writer's Guide separates properties, events, methods, persistence and drawing. These are useful references for a portable component contract.

**Do not backdate later VCL features.** This Delphi 2 reference describes a toolbar assembled from an aligned `TPanel` and `TSpeedButton` controls; no `TToolBar`, `TActionList` or `Anchors` topic was found in the retrieved reference. Modern Embarcadero documentation is useful for comparison but is not proof of an API's availability in Delphi 2. Windows 95's toolbar common control is independently documented in the Microsoft sources above.

**Microsoft Win32 Programmer's Reference**, archived WinHelp edition. [Archive listing and download](https://www.phatcode.net/articles.php?id=238). A local `win32.hlp` copy and its contents/index were retrieved and converted to searchable text (16,167 topic records). Its legal topic gives copyright 1992–1996, while the hosting page labels the release 1995. The exact SDK build has not been established. Use it as a supplementary period reference, not proof that every entry existed in stock Windows 95 or Windows 98.

**Control Spy Exposes the Clandestine Life of Windows Common Controls**, Mark Finocchio, Microsoft Systems Journal, 1998: [Part I, July](https://jacobfilipp.com/MSJ/controlspy.html), [Part II, September](https://jacobfilipp.com/MSJ/control.html), [Part III, December](https://jacobfilipp.com/MSJ/controlspy3.html). These are archived articles by a member of Microsoft's user-interface developer-support team. They explain common-control messages, notifications, styles, callbacks and changes through Internet Explorer 4.0's controls, making them useful Windows 98-era API material. Part I distinguishes the original Windows 95 set from later common-control additions; Part III includes toolbars, rebars and tooltips. They are not a full Windows 98 SDK reference. Local HTML copies retain article text; some archived images/cross-links may require the online source.

**Visual C++ 6.0 Brings Home a Full Bag of Tricks and Treats for MFC Developers**, Paul DiLascia, Microsoft Systems Journal, October 1998. [Archived article](https://jacobfilipp.com/MSJ/vc6.html). Useful for the C++ wrapper side of the same controls, including changed common-control support and property sheets. The author states that the article used a preview release; preserve that qualification when comparing final MFC behaviour.

## Modern implementation companions

| Project | Useful for | Historical status |
| --- | --- | --- |
| [98.css](https://jdan.github.io/98.css/) | A broad CSS control reference; Vector95's vendoring script takes its font files from this package | Modern Windows 98-inspired recreation |
| [Win31](https://github.com/wieslawsoltes/Win31) | The visual/font source credited by ProcGen FM's bundled notices | Modern Windows 3.1 recreation; a different era |
| [Chicago95](https://github.com/grassmunk/Chicago95) | Comparison with a Windows 95-inspired Linux desktop theme | Modern theme, not Microsoft guidance |

For implementation details, use the [local source catalogue](widgets.md). For an era-specific decision, prefer the relevant Microsoft primary document over a recreation's styling choice.
