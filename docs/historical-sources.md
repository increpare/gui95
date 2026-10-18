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

## Modern implementation companions

| Project | Useful for | Historical status |
| --- | --- | --- |
| [98.css](https://jdan.github.io/98.css/) | A broad CSS control reference; Vector95's vendoring script takes its font files from this package | Modern Windows 98-inspired recreation |
| [Win31](https://github.com/wieslawsoltes/Win31) | The visual/font source credited by ProcGen FM's bundled notices | Modern Windows 3.1 recreation; a different era |
| [Chicago95](https://github.com/grassmunk/Chicago95) | Comparison with a Windows 95-inspired Linux desktop theme | Modern theme, not Microsoft guidance |

For implementation details, use the [local source catalogue](widgets.md). For an era-specific decision, prefer the relevant Microsoft primary document over a recreation's styling choice.
