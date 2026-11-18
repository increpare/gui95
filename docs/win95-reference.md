# Windows 95 reference capture

A pipeline, in `tools/win95-reference/`, that runs real Windows 95 in an emulator, has a small test program
(`refgrid`) draw a fixed grid of control states, and saves the emulator's own dump of the guest screen as a PNG, with
a text report of system colours, metrics and fonts. `compare.mjs` then compares that capture with the kit's state
atlas, pair by pair. Commands and the list of cells are in `tools/win95-reference/README.md`.

## What it establishes, and what it does not

It establishes, for the one Windows 95 release installed and the one display mode captured: the exact pixels of each
drawn edge and control state, the sizes the system chooses (caption, menu item, list row, scroll thumb), and the
values of `GetSysColor`, `GetSystemMetrics` and `NONCLIENTMETRICS`.

It does not establish: behaviour (nothing is clicked); other releases or Internet Explorer 4's replaced common
controls; anything about colours beyond what the display mode can show (a 16-bit dump holds 5:6:5 colours, a
256-colour dump palette colours; the report's `[syscolors]` section holds the true values in any mode). The FreeDOS
self-test and the Wine smoke test prove only that the machinery runs; their images are not a reference for anything.

**Status: built and tested without Windows; never yet run on Windows 95.** Expect fixes on first contact.

## Licensing

Windows 95 is Microsoft's copyrighted software. The repository, the container image and the scripts contain none of
it and download none of it. Use only your own licensed install media. Do not commit a disk image, an installer, a
boot disk or a product key; `tools/win95-reference/images/` and `out/` are ignored by git for that reason. Captured
screen images show Microsoft's control artwork: keep them as private research material unless the owner decides
otherwise.

## What the owner supplies

- Windows 95, **original 1995 release (version 4.00.950)**, full or upgrade, on CD or floppies, with its product key.
  Not OSR2 (4.00.950 B), which ships Internet Explorer 3 and newer common controls.
- A way to boot DOS and run Setup: the boot floppy that came with the full version, as an image file. If you have
  only the CD, say so before starting.

## One-time install (manual, untested)

From `tools/win95-reference/`, after `./run.sh image` and `./run.sh build`:

1. Put your media images in `images/` (for example `boot.img`, `win95.iso`). Optionally copy the `WIN95` folder from
   your CD to `images/WIN95`, which lets Setup run with no CD-ROM driver.
2. `./run.sh newdisk win95.qcow2 500M`
3. `./run.sh session --disk images/win95.qcow2 --floppy images/boot.img --source images/WIN95 --boot a`
   and connect to the VNC address it prints. (A native QEMU window is more comfortable for the mouse:
   `brew install qemu mtools`, then `node session.mjs --display cocoa …` with the same options.)
   Drives: C: the new disk, D: the refgrid data disk, E: your `WIN95` folder.
4. In DOS: `fdisk` (one primary partition, active), restart the session, `format c: /s`, `md c:\win95`,
   `copy e:\win95\*.* c:\win95`, then `c:\win95\setup`. Installing from C: means later driver changes find the files.
5. In Setup choose Typical; no network, no Microsoft Network, no Exchange. **Do not install Internet Explorer,
   Microsoft Plus! or any update.** Keep the Windows Standard colour scheme and Small Fonts.
6. Restart with `./run.sh session --disk images/win95.qcow2`. Untick "Show this Welcome Screen next time".
7. Display driver: Display Properties, Settings, Change Display Type. The emulated adapter is a **Cirrus Logic
   GD5446 PCI** (`-vga cirrus`). QEMU's documentation says Windows 95 recognises it; for the original release this is
   unconfirmed and reports conflict. If Windows did not detect it, pick the Cirrus Logic entry it offers. Then set
   800 by 600, High Color (16 bit), and restart. Fallbacks, in order: keep the standard VGA driver (640 by 480, 16
   colours; the grid fits, and sizes, edge order and the report's colour values are still valid); reinstall with
   `--machine isapc` (an ISA Cirrus of the 5430 family); a third-party VESA driver with `--vga std`, your decision.
8. Startup group: right-click Start, Open, Programs, StartUp, then File, New, Shortcut, command line `D:\REFGRID.EXE`.
9. Shut down from the Start menu, then Ctrl+C in the terminal. The image is now the prepared image; captures never
   write to it.

Then `./run.sh capture --disk images/win95.qcow2 --bits 16`, again with `--bits 8`, and `node compare.mjs` as in the
README. `--bits` makes refgrid ask Windows for the mode and restart if needed; if that fails, set the depth by hand in
a session and capture with `--bits 0`.

If Windows fails to start with a protection error on this fast emulated CPU, try `--icount 4` with `--keys off`.

An optional second image with Internet Explorer 4 installed can be captured the same way; the report will show the
newer `comctl32.dll` and the capture script will label it as not the baseline.
