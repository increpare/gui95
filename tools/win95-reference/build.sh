#!/bin/sh
# Runs inside the container (see run.sh): compiles refgrid.exe into out/ and writes out/grid.json.
set -eu
cd "$(dirname "$0")"
mkdir -p out
# -bt=nt   target Win32            -3s  386 instructions, stack calling convention (runs on a 486 or Pentium)
# -os      favour small code       -wx  all warnings     -wcd=303  except "parameter not referenced"
wcc386 -zq -bt=nt -3s -os -wx -wcd=303 -i="$WATCOM/h" -i="$WATCOM/h/nt" -fo=out/refgrid.o refgrid/refgrid.c
# system nt_win: a Win32 GUI program. osversion=4.0 marks it for the Windows 95 / NT 4 subsystem version.
wlink option quiet system nt_win option osversion=4.0 option map=out/refgrid.map \
      name out/REFGRID.EXE file out/refgrid.o library comctl32.lib, version.lib
# refscene: the whole-window scenes (sheets 4 and up of the same cell table), driven over the serial port.
wcc386 -zq -bt=nt -3s -os -wx -wcd=303 -i="$WATCOM/h" -i="$WATCOM/h/nt" -fo=out/refscene.o refscene/refscene.c
wlink option quiet system nt_win option osversion=4.0 option map=out/refscene.map \
      name out/REFSCENE.EXE file out/refscene.o library comctl32.lib, comdlg32.lib, version.lib, winmm.lib
node grid-export.mjs out/grid.json
node check-pe.mjs out/REFGRID.EXE
node check-pe.mjs out/REFSCENE.EXE
