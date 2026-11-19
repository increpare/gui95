# Windows 95 reference capture

Captures a pixel-exact picture of real Windows 95 control states, and the numbers behind them, so the GUI95 kit's
state atlas can be compared with the real thing. Read [docs/win95-reference.md](../../docs/win95-reference.md) first:
it says what this establishes, the licensing constraint, and the one-time manual install.

**This folder contains no Microsoft software and must never contain any.** Windows 95 comes only from the owner's own
install media. Installed disk images live outside the repository, in `~/.gui95-win95-reference/`
(mounted at `/images`); the media folder named by `REFGRID_MEDIA` is mounted read-only at `/media`.

## Parts

| File | What it is |
| --- | --- |
| `Dockerfile` | The toolchain container: QEMU 10.0.13, Open Watcom v2 (build 2026-11-01), mtools 4.0.48, Node.js 20. Base image pinned by digest, Debian packages by a snapshot.debian.org date, Open Watcom by release tag and SHA-256. Native on Apple Silicon (arm64) and on amd64. |
| `refgrid/cells.def` | **The cell table**: every cell, its sheet, rectangle and state. The one place to edit. |
| `refgrid/refgrid.c` | The Win32 test program. Includes `cells.def`; draws the cells; writes `REFGRID.TXT`. |
| `build.sh` | Runs in the container: compiles `out/REFGRID.EXE`, writes `out/grid.json`, checks the executable. |
| `grid-export.mjs` | `cells.def` to `out/grid.json`. |
| `check-pe.mjs` | Checks an executable is i386, PE32, GUI subsystem 4.0, importing only from Windows 95 DLLs; lists imports. |
| `capture.mjs` | Boots the prepared image headless, dumps each sheet, shuts down, collects the report. |
| `session.mjs` | Runs the guest with a display for the manual install. |
| `vmctl.mjs` | Screen dumps and keys for a running session, through a second QMP socket. |
| `selftest-freedos.mjs` | Proves the capture mechanics with FreeDOS. No Windows needed. |
| `compare.mjs` | Compares a capture with the kit's atlas, per mapped pair. Runs on the host. |
| `mapping.json` | **The mapping table**: which reference cell pairs with which atlas rectangle, and how. |
| `atlas-cells.mjs`, `atlas-cells.json` | Where each control sits in the kit's atlas image (generated from the kit's own atlas page). |
| `Dockerfile.wine`, `wine-smoke.mjs` | Optional smoke test of the program under Wine. Not a reference for anything. |
| `run.sh` | Host entry point for all of the above. |

Tests: `tools/test/win95-reference.test.mjs`, run by `make test` at the repository root. They need no container.

## Commands

All from this folder. Docker must be running.

```sh
./run.sh image       # build the container image (once; about 3 minutes, downloads 150 MB of Open Watcom)
./run.sh build       # compile out/REFGRID.EXE, write out/grid.json, check the executable
./run.sh selftest    # FreeDOS: headless QEMU, screen dump, keys, file round trip through the FAT data disk
```

With a Windows 95 disk image prepared as the doc describes:

```sh
./run.sh capture --disk /images/win95-osr2.qcow2 --icount 4 --bits 16                             # high colour
./run.sh capture --disk /images/win95-osr2.qcow2 --icount 4 --bits 8                              # 256 colours
./run.sh capture --disk /images/win95-osr2.qcow2 --icount 4 --bits 24 --width 640 --height 480    # true colour
node compare.mjs --capture out/capture-16bit/win95-4.00.1111c-16bit-capture.json --images out/pairs-16bit --json out/compare-16bit.json
```

Other commands: `./run.sh newdisk NAME SIZE`, `./run.sh session ...`, `./run.sh session-bg ...`, `./run.sh vmctl ...`,
`./run.sh session-stop` (see the doc), `./run.sh shell`.

To check the imports against the Win32 Programmer's Reference text (kept outside the repository):

```sh
node check-pe.mjs out/REFGRID.EXE --reference /path/to/win32.txt
```

After the kit's atlas page changes, regenerate the atlas rectangle list (needs `pnpm install --frozen-lockfile` in `kit/`):

```sh
node atlas-cells.mjs
```

## The program: sheets and cells

`refgrid` opens one borderless 640 by 480 window at the top left of the screen, on a button-face background, and
shows one **sheet** at a time. Three sheets rather than one large grid, so that everything fits in 640 by 480: the
program then works even with the plain VGA driver, the one display driver Windows 95 is certain to have.

Coordinates in `cells.def` are screen pixels. For a drawn cell they are exactly the rectangle passed to `DrawEdge` or
`DrawFrameControl`; for a control they are the rectangle it was created with. Where the system decides the final size
(a combo box's height, the pop-up menu) the measured rectangle is in the report, and `compare.mjs` prefers it.

**Sheet 1, drawn directly.** What the system's own drawing functions produce, with no control logic in between.

- `edge_<type>_<flags>`: `DrawEdge`, 48 by 24. Eight rows: `EDGE_RAISED`, `EDGE_SUNKEN`, `EDGE_ETCHED`, `EDGE_BUMP` and the four single lines `BDR_RAISEDOUTER`, `BDR_SUNKENOUTER`, `BDR_RAISEDINNER`, `BDR_SUNKENINNER`. Four columns: no flags, `BF_SOFT`, `BF_FLAT`, `BF_MONO` (`BF_RECT` always). These settle which colour sits on which line of each edge, the subject of "Which edge goes where" in the design guide.
- `dfc_push_*`, `dfc_check_*`, `dfc_radio_*`: `DrawFrameControl(DFC_BUTTON)`: push button (normal, pushed, checked, inactive, flat, mono); check box and option button at 13 by 13 (unchecked, checked, pushed, inactive and combinations; `dfc_check_mixed*` is the 3-state box).
- `dfc_scroll_<direction>_<state>`, `dfc_combo_*`, `dfc_sizegrip*`: `DFC_SCROLL` at 16 by 16: four arrows, the drop-down arrow, the size grip; normal, pushed, inactive, flat.
- `dfc_caption_<button>_<state>`: `DFC_CAPTION` at 16 by 14: close, minimize, maximize, restore, help.
- `dfc_menu_*`: `DFC_MENU`: the submenu arrow, check mark and bullet glyphs.
- `syscolor_00` to `syscolor_24`: one solid swatch per `GetSysColor` index. Index 22 is `COLOR_3DLIGHT`.
- `focusrect`, `text_*`: `DrawFocusRect`, and one line of text in each system font (and one drawn unavailable), for font and text-rendering questions.

**Sheet 2, real child controls.** State is set by message, never by the mouse: `BM_SETSTATE` for pushed,
`BM_SETCHECK` for checked and mixed, `WM_SETFOCUS` sent to the control for the focused look (the real focus stays
on the grid window), `EnableWindow` for unavailable.

- `button_*`: push button, default, pushed, pushed default, focused, focused default, unavailable (75 by 23).
- `check_*`, `radio_*`: check boxes and option buttons in each state; `check_mixed*` are `BS_AUTO3STATE`.
- `edit_*`: enabled, read-only, unavailable. None has the focus, because a blinking caret would make the image depend on time.
- `combo_*`: drop-down list closed, with focus, unavailable; editable drop-down.
- `list_*`: list box with a selected row and focus, selection without focus, no selection, unavailable, with a scroll bar. Row height is in the report.
- `groupbox`, `static_*`: group box, etched lines and frames, the old black, grey and white frames, labels.
- `hscroll_*`, `vscroll_*`: plain (square thumb), with a page (proportional thumb), `minthumb` (a page of 1 in 10000: the smallest thumb the system draws), unavailable.
- `status*`, `progress_*`, `header`, `trackbar*`, `updown_*`, `tab`: the common controls from the original `comctl32.dll`.

**Sheet 3, windows and the menu.**

- `window_active` (with a menu bar), `window_inactive` (with scroll bars), `dialog_*`, `toolwindow_*`: captions, active and inactive, normal and small. Caption height comes from here and from `SM_CYCAPTION` in the report.
- `frame_*`: one bare window per frame style (`WS_DLGFRAME`, `WS_BORDER`, `WS_THICKFRAME`, `WS_EX_CLIENTEDGE`, `WS_EX_STATICEDGE`, `WS_EX_WINDOWEDGE`, `WS_EX_DLGMODALFRAME`).
- `menu`: a real pop-up menu, open, in the same order as the kit's atlas: normal with shortcut, checked and highlighted, unavailable, checked, option-marked, unavailable checked, separator, cascading, with shortcut. Its measured window and item rectangles are in the report as `menu`, `menu.item0`…; the menu bar's as `menubar.item0`….

**The report**, `REFGRID.TXT`, records the numbers so they do not have to be read off pixels: Windows version;
`comctl32.dll` version and whether it is the original library; screen size and depth; every `GetSysColor` value and
the colour the display actually shows for it; `GetSystemMetrics` (caption, menu, scroll, border, edge, icon and
small-icon sizes, and more); `NONCLIENTMETRICS` sizes and fonts; the metrics of each font; dialog base units for the
System font and for 8-point MS Sans Serif; and the measured rectangle of every control.

**The ready marker.** When a sheet has finished drawing, five 8 by 8 squares appear at the top left: red (yellow if
the program hit a failure), three squares giving the sheet number in binary (white 1, black 0), blue. The capture
script polls the screen dump for it. This needs no serial port, network or guest driver.

**Keys.** `1` `2` `3` show a sheet, `X` exits the program, `Q` shuts Windows down. The capture script sends `Esc`
first, which closes the pop-up menu so the next key reaches the program.

## The capture

`capture.mjs`, per run:

1. builds a 16 MB FAT16 hard disk image holding `REFGRID.EXE` and a `REFGRID.INI` naming the wanted colour depth; the guest sees it as drive D:;
2. creates a throwaway copy-on-write overlay on the prepared Windows image, which is mounted read-only, so every run starts from the same disk state;
3. starts `qemu-system-i386` headless (`-display none`) with QMP on a Unix socket;
4. polls QMP `screendump` until the marker for the sheet appears and two dumps a second apart are identical; that dump, converted from PPM to PNG, is the guest framebuffer exactly;
5. sends `Esc` and the next sheet's digit through QMP `send-key`, and repeats;
6. sends `Esc`, `Q`; waits for Windows to shut down; stops QEMU;
7. reads `REFGRID.TXT` back from the data disk and names the output from what the report says the guest is.

Output, in `out/capture-<bits>bit/`: `win95-4.00.1111c-16bit-sheet1.png` (and 2, 3; the name carries the build and
service-release letter the guest reports), `…-report.txt`, `…-capture.json`.
The prefix comes from the guest's own `GetVersionEx`; a guest that is not Windows 95 4.00 cannot produce a file
named `win95-…`. Each PNG carries a `Source` text chunk saying what drew it. The script exits 1 with a warning if
the guest is not Windows 95, Internet Explorer 4's common controls are present, or the depth is not the one asked for.

**Colour depth.** `--bits 16|8|24` is passed to `refgrid`, which asks Windows for that mode
(`ChangeDisplaySettings`) and restarts Windows if it must. `--bits 0` leaves the mode alone. A 16-bit dump shows each
5:6:5 pixel expanded to 8 bits (`#c0c0c0` appears as `#c6c3c6`); `compare.mjs` reduces the kit's image the same way.

**Video adapter.** QEMU's Cirrus Logic GD5446 PCI (`-vga cirrus`), the adapter QEMU's documentation names for
Windows 95 guests. OSR2.5 detected it and installed its driver from the CD with no help; it offers 256 colours, 16-bit at 800 by 600
and 24-bit at 640 by 480 (24-bit at 800 by 600 is not listed). Reports disagree about the original 1995 release. See the doc for the fallbacks, which were designed in:
the grid fits the standard VGA driver's 640 by 480.

**If keys do not reach the program**: `--keys off` boots once per sheet and powers off after each dump (not yet needed).

## What has been run

On this machine (Apple Silicon, Docker Desktop), 18 and 19 November 2026:

- the image builds; `refgrid.c` compiles and links; `check-pe.mjs` passes and lists the imports;
- `./run.sh selftest` (FreeDOS): headless QEMU, screen dump, keys, file round trip through the data disk;
- **Windows 95 installed from the owner's OSR2 CD** (the owner accepted the licence and typed the key), and
  **captured at 24-bit (640 by 480), 16-bit and 256 colours (800 by 600)**: mode change by `refgrid`, all three
  sheets, clean shutdown, report read back; `compare.mjs` run on each;
- the unit tests, `compare.mjs` on synthetic input, and `capture.mjs`'s timeout path on a blank disk.

Not run: the original 1995 release; a non-bootable CD (`--floppy`, `--source`); `--keys off`; `--machine isapc`;
`--vga std`. The Wine smoke test currently stops after sheet 1 (its key does not reach Wine's virtual desktop).

Every session and capture of this image needs `--icount 4`: without it Windows 95 stops with a protection error
in IOS, the known failure on a too-fast CPU (see the doc).

## First results (Windows 95 4.00.1111 C, OSR2.5)

The guest reports build 1111 with service-release letter C; `user.exe`, `user32.dll`, `gdi.exe` and `gdi32.dll`
are version 4.0.0.950, `kernel32.dll` and `shell32.dll` 4.0.0.1111, `comctl32.dll` 4.70.0.1146. The window manager
and GDI files therefore carry the same version number as the 1995 release; the common controls do not.

Numbers from the report:

| Question | Windows 95 OSR2.5 | Kit |
| --- | --- | --- |
| `COLOR_3DLIGHT` | `#dfdfdf` at 24-bit; reported as `#e0e0e0` at 16-bit and `#c0c0c0` at 256 colours | `#dfdfdf` |
| Pop-up menu item height | 17 px; separator item 9 px | 22 |
| Menu bar | items 18 px high; `SM_CYMENU` 19 | 20 |
| Caption | `SM_CYCAPTION` 19 (18 plus a 1 px line); small caption 16 | 20 |
| Caption button | `SM_CXSIZE` by `SM_CYSIZE` 18 by 18 (button drawn 16 by 14) | 16 by 14 |
| List box row | 13 px | 16.84 |
| Drop-down list, closed | 21 px high (field 15, item 13) | 23 |
| Scroll bar | 16 px wide; plain thumb 16 px; smallest thumb 8 px | |
| Dialog units, 8-point MS Sans Serif | 4 by 8 units = 6 by 13 px, so a 50 by 14 button is 75 by 23 px | 75 by 23 |
| Fonts | caption, menu, status, message: MS Sans Serif, height -11 (caption bold); cell height 13 | |

### Comparison with the kit's atlas (re-run 19 November 2026 after merging `master`)

`mapping.json` now has 54 pairs: the merged atlas added a held check box and option button and a focused drop-down
list, which have reference cells; its highlighted unavailable menu command has none and stays unmapped.

| Depth | Match pixel for pixel | Same edges, different size | Size differs (pixels not compared) | Differs |
| --- | --- | --- | --- | --- |
| 24-bit | 21 | 17 | 6 | 10 |
| 16-bit | 0 | 0 | 6 | 48 |
| 256 colours | 0 | 13 | 6 | 35 |

The 24-bit capture is the one to read. At 16-bit Windows reports `COLOR_3DLIGHT` as `#e0e0e0`, which a 5:6:5 display
shows one step lighter than the kit's `#dfdfdf`, so every raised edge differs by that one colour; at 256 colours the
light line is the face colour. Neither is a fault in the kit's drawing.

**Matching at 24-bit (21):** push button at rest, pushed, latched, unavailable and default (outer 4 px ring); check
box unchecked, checked, mixed, unavailable, unavailable-checked, held and held-checked (whole box); option button
off, on, unavailable, unavailable-on, held-off and held-on (whole 12 by 12 circle); text field normal, unavailable
and read-only (ring).

**Differences that are now gone:**

- The default push button: its black frame is inside the box and the ring now matches pixel for pixel.
- The option button: an error in this comparison, not in the kit. `DrawFrameControl` draws the 12 by 12 circle at
  the top right of the 13 by 13 rectangle it is given; compared on the circle itself, all six states match.
- The window frame: the kit's window has a dialog's 3 px frame and, compared with the dialog cell, the six pixels
  inward from every side are identical. (A sizable window's frame is 4 px; the kit has no such frame.)
- The group box: the etched line matches once the white line the kit draws just outside its box is included.
- Held check boxes and option buttons, which the kit did not have, now exist and match.

**Size differences that remain** (the edges agree; the density switch is the place to address them):

| Part | Windows 95 | Kit |
| --- | --- | --- |
| Pop-up menu item | 17 px high | 22 |
| Menu separator item | 9 px | 8 |
| Menu bar title / bar | 18 / 19 px | 20 / 22 |
| Title bar | 18 px | 20 |
| Closed drop-down list (plain, unavailable, focused) | 21 px | 23 |
| List box row | 13 px | 16 |
| Status bar | 20 px (2 above the panes, none below) | 22 (2 above, 2 below) |
| Caption button inset | 2 px from top and right | 3 |
| Check box to label | 5 px | 4 |
| Group box caption | text starts 9 px from the left | 13 |

**Drawing differences that remain:**

- Caption buttons: the kit's stylesheet draws no glyph. The button edges match exactly; the 12 to 26 differing pixels are the glyph.
- Menu separator: Windows starts the etched line at the item's left edge; the kit insets it by one pixel.
- Focus rectangle on a default button: Windows puts it on the fifth pixel in, the kit on the fourth (an ordinary button, fourth pixel, agrees).
- Scroll arrows: the kit's artwork sits one pixel to the right (columns 5 to 11 against 4 to 10); the rows agree.
- Menu text and check mark: one pixel further right in the kit.
- At 256 colours Windows has no light line at all; the kit always draws `#dfdfdf`.

**Not like for like, so not settled by this comparison:** the trackbar (both rectangles are the whole control), the
selected tab (`TCM_GETITEMRECT` gives the tab's inside, the kit's rectangle its outline), the up-down control (refgrid
measures the shrunken buddy edit) and the list box ring (it crosses a selected row that sits at a different height).
Read the side-by-side images in `out/pairs-24bit/` for those. A toolbar was not captured.

**Other things the capture showed:** the pressed default button is a black frame, one `#808080` line, then the face;
the focused closed drop-down list has one window-colour pixel inside its edge, then the highlight with an inverted
dotted rectangle on its outline, the button untouched; `DFCS_SCROLLSIZEGRIPRIGHT` drew an up arrow, not a grip;
`GetMenuItemRect` answers for a pop-up relative to the owner window, which `refgrid` corrects and reports. These and
the measurements above are recorded, with their sources, in `docs/evidence-register.md` (55 records carry a
"Windows 95 capture" source).

The captures, reports and comparison output are in `out/` (ignored by git): `capture-24bit/`, `capture-16bit/`,
`capture-8bit/`, `compare-*.txt`, `compare-*.json`, `pairs-*/`.
