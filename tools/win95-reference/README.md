# Windows 95 reference capture

Captures a pixel-exact picture of real Windows 95 control states, and the numbers behind them, so the GUI95 kit's
state atlas can be compared with the real thing. Read [docs/win95-reference.md](../../docs/win95-reference.md) first:
it says what this establishes, the licensing constraint, and the one-time manual install.

**This folder contains no Microsoft software and must never contain any.** Windows 95 comes only from the owner's own
install media, as a disk image in `images/`, which git ignores.

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
./run.sh capture --disk images/win95.qcow2 --bits 16     # high colour
./run.sh capture --disk images/win95.qcow2 --bits 8      # 256 colours
node compare.mjs --capture out/capture-16bit/win95-4.00.950-16bit-capture.json --images out/pairs-16bit --json out/compare-16bit.json
```

Other commands: `./run.sh newdisk NAME SIZE`, `./run.sh session ...` (see the doc), `./run.sh shell`.

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

Output, in `out/capture-<bits>bit/`: `win95-4.00.950-16bit-sheet1.png` (and 2, 3), `…-report.txt`, `…-capture.json`.
The prefix comes from the guest's own `GetVersionEx`; a guest that is not Windows 95 4.00 cannot produce a file
named `win95-…`. Each PNG carries a `Source` text chunk saying what drew it. The script exits 1 with a warning if
the guest is not Windows 95, the common controls are not the original ones, or the depth is not the one asked for.

**Colour depth.** `--bits 16|8|24` is passed to `refgrid`, which asks Windows for that mode
(`ChangeDisplaySettings`) and restarts Windows if it must. `--bits 0` leaves the mode alone. A 16-bit dump shows each
5:6:5 pixel expanded to 8 bits (`#c0c0c0` appears as `#c6c3c6`); `compare.mjs` reduces the kit's image the same way.

**Video adapter.** QEMU's Cirrus Logic GD5446 PCI (`-vga cirrus`), the adapter QEMU's documentation names for
Windows 95 guests. Whether the *original* 1995 release has a driver that accepts it is **not confirmed**: reports
agree for the later OEM releases and disagree for the original. See the doc for the fallbacks, which were designed in:
the grid fits the standard VGA driver's 640 by 480.

**If keys do not reach the program**: `--keys off` boots once per sheet and powers off after each dump.

## What has been tested, and what has not

Tested on this machine (Apple Silicon, Docker Desktop):

- the image builds; `refgrid.c` compiles and links; `check-pe.mjs` passes and lists the imports;
- `./run.sh selftest`: QEMU runs headless in the container; `screendump` returns the FreeDOS screen; keys sent by QMP reach the guest; a file DOS writes to the data disk comes back to the host;
- `capture.mjs` on a blank disk: overlay, data disk, polling, timeout and the diagnostic last-screen image;
- `compare.mjs` on synthetic input, and the unit tests.

Not tested, because it needs the real system: `REFGRID.EXE` starting on Windows 95; every control rendering as
intended; the display-mode change; the marker being reached; the shutdown; everything in the manual install. Expect
to fix things on first contact.

Known limit: `-icount` (a fixed, slower guest CPU) stops QMP keys reaching the guest in the FreeDOS test, so it is
off by default; with it, use `--keys off`.
