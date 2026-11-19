# Windows 95 reference capture

A pipeline, in `tools/win95-reference/`, that runs real Windows 95 in an emulator, has a small test program
(`refgrid`) draw a fixed grid of control states, and saves the emulator's own dump of the guest screen as a PNG, with
a text report of system colours, metrics and fonts. `compare.mjs` then compares that capture with the kit's state
atlas, pair by pair. Commands and the list of cells are in `tools/win95-reference/README.md`.

## What it establishes, and what it does not

It establishes, for the one Windows 95 release installed (see "Which Windows 95") and the one display mode captured: the exact pixels of each
drawn edge and control state, the sizes the system chooses (caption, menu item, list row, scroll thumb), and the
values of `GetSysColor`, `GetSystemMetrics` and `NONCLIENTMETRICS`.

It does not establish: behaviour (nothing is clicked); other releases or Internet Explorer 4's replaced common
controls; anything about colours beyond what the display mode can show (a 16-bit dump holds 5:6:5 colours, a
256-colour dump palette colours; the report's `[syscolors]` section holds the true values in any mode). The FreeDOS
self-test and the Wine smoke test prove only that the machinery runs; their images are not a reference for anything.

**Status: installed from the owner's media and captured; see the results section of `tools/win95-reference/README.md`.**

## Which Windows 95

The owner's media is an OEM Service Release 2 CD (`Win95 OSR2.ISO`, volume label `WIN_95C`), not the original
August 1995 release. Installed, it reports version 4.00.1111 with service-release letter C (OSR2.5), `user.exe`,
`user32.dll`, `gdi.exe` and `gdi32.dll` at 4.0.0.950, and `comctl32.dll` at 4.70.0.1146. Every capture is named and labelled from what the guest itself reports: the build and
service-release letter from `GetVersionEx`, and the file versions of `comctl32.dll`, `user32.dll`, `gdi32.dll`,
`kernel32.dll`, `user.exe`, `gdi.exe` and `shell32.dll`, all in the report.

What an OSR2 capture establishes about the 1995 release:

- **Window manager and GDI drawing** (`DrawEdge`, `DrawFrameControl`, buttons, edit, list and combo boxes, scroll
  bars, captions, frames, menus, system colours and metrics): OSR2 is a maintenance release of the same 4.00
  system and its window manager and GDI files carry the same version number, 4.0.0.950, as the 1995 release.
  That makes identical drawing likely; it is not proof, since a file can change without its version number.
- **Common controls** (status bar, progress bar, trackbar, up-down, tab, header): OSR2 ships Internet Explorer 3
  and with it `comctl32.dll` 4.70, a later library than the 1995 one (4.00). Captures of these cells show the 1996
  library. They are evidence for OSR2 only.

Internet Explorer 4 (`comctl32.dll` 4.71 or later) must not be installed; the capture script warns if it finds it.

## Licensing

Windows 95 is Microsoft's copyrighted software. The repository, the container image and the scripts contain none of
it and download none of it. Use only your own licensed install media.

- The media folder is mounted read-only (`REFGRID_MEDIA`). Nothing is copied from it.
- Installed disk images live outside the repository, in `~/.gui95-win95-reference/` (`REFGRID_IMAGES` changes it).
- The product key is typed by the owner. No script reads the key file.
- Do not commit a disk image, an installer, a boot disk or a product key. `tools/win95-reference/out/` (captures,
  setup screenshots) is ignored by git. Captured images show Microsoft's artwork: keep them as private research
  material unless the owner decides otherwise.

## One-time install

From `tools/win95-reference/`, after `./run.sh image` and `./run.sh build`. This is the route that was actually run
with the owner's OSR2 CD on 18 and 19 November 2026.

1. `export REFGRID_MEDIA="/path/to/the folder holding your ISO"`, then `./run.sh newdisk win95-osr2.qcow2 1G`.
2. `./run.sh session-bg --disk /images/win95-osr2.qcow2 --cdrom "/media/Win95 OSR2.ISO" --boot d --icount 4`
   This CD is bootable: it carries a boot floppy with a CD-ROM driver that starts Setup by itself. (A CD that is
   not bootable needs your own DOS boot floppy image, passed with `--floppy … --boot a`; `--source DIR` puts a
   copy of the CD's `WIN95` folder on a third disk so no CD driver is needed. Neither route has been tested.)
   The display is VNC on `localhost:5900`; `docker logs refgrid-vm` prints the password. Keys can also be sent
   with `./run.sh vmctl key …` and the screen read with `./run.sh vmctl dump FILE.png`.
3. Text-mode Setup: Enter; "Configure unallocated disk space"; "No, do not use large disk support" (FAT16); Enter
   to restart; Enter for the routine check; `X` to leave ScanDisk. Drives: C: the new disk, D: the refgrid data disk.
4. Graphical Setup: **the owner accepts the licence agreement and types the product key.** Choose Typical; no
   network, no Microsoft Network, no Exchange. **Do not install Internet Explorer 4, Microsoft Plus! or any update.**
5. When Setup restarts the PC, stop the session (`./run.sh session-stop`) and start it again with `--boot c`
   (keep `--icount 4` and the CD attached). At the Startup Menu choose 1, Normal. Windows detects hardware, asks
   for the time zone (Enter) and offers the printer wizard (Esc), then restarts once more to the desktop.
6. Display: Windows detected the emulated **Cirrus Logic GD5446 PCI** adapter (`-vga cirrus`) by itself and
   installed the driver from the CD; Display Properties offered 256 colours at once. Nothing to do by hand: the
   capture asks for its mode itself.
7. Start refgrid with Windows: Start, Run, `regedit /s d:\startup.reg`. That file (`refgrid/startup.reg`, put on
   the data disk by the session) adds `D:\REFGRID.EXE` to the registry's Run key.
8. Start, Shut Down, Yes. Windows powers the emulated PC off itself and the session ends. The image is now the
   prepared image; captures run on a throwaway overlay and never write to it. Keep a copy of it.

### The processor-speed failure

Started without `--icount`, the first restart after Setup stops with **"While initializing device IOS: Windows
protection error. You need to restart your computer."** This is the well-known Windows 95 failure on processors
much faster than those of 1996: a timing loop overflows. The emulated Pentium on Apple Silicon is fast enough to
trigger it. `--icount 4` fixes the emulated CPU at 62.5 million instructions a second, and Windows then starts
normally. No system file was patched. **Use `--icount 4` for every session and capture of this image.** (Keys
sent through the emulator do reach Windows with `--icount`; they did not reach FreeDOS in the self-test.)

## Capturing

`./run.sh capture --disk /images/win95-osr2.qcow2 --bits 16 --icount 4`, again with `--bits 8`, and with
`--bits 24 --width 640 --height 480` (the driver lists no 24-bit mode at 800 by 600), then `node compare.mjs` as in
the README. The 24-bit capture is the one whose colours are exact. `--bits` makes refgrid ask Windows for the mode and restart if needed; if that
fails, set the depth by hand in a session and capture with `--bits 0`.

A capture of the original 1995 release (for the 4.00 common controls) or of an Internet Explorer 4 system can be
made the same way from other media; the file names and the report keep them apart.
