#!/bin/sh
# Host entry point for the Windows 95 reference pipeline. Everything except "compare" runs in the container.
#
#   ./run.sh image                 build the container image (QEMU, Open Watcom, mtools, Node.js)
#   ./run.sh build                 compile refgrid.exe into out/ and write out/grid.json
#   ./run.sh selftest              prove the capture mechanics with FreeDOS (no Windows needed)
#   ./run.sh newdisk NAME SIZE     create an empty disk image /images/NAME (for example win95.qcow2 500M)
#   ./run.sh session [options]     run the guest with a VNC display, to install or adjust Windows by hand
#   ./run.sh session-bg [options]  the same, detached (container "refgrid-vm"); stop it with ./run.sh session-stop
#   ./run.sh vmctl ...             screen dumps and keys for the running session (see vmctl.mjs)
#   ./run.sh capture [options]     boot the prepared image headless and capture every sheet
#   ./run.sh shell                 a shell in the container
#   node compare.mjs ...           compare a capture with the kit's atlas (runs on the host, no container)
#
# Disk images are Microsoft's software once Windows is installed on them, so they live OUTSIDE the repository:
#   REFGRID_IMAGES   folder mounted at /images   (default ~/.gui95-win95-reference; read-only for "capture")
#   REFGRID_MEDIA    folder holding your own install media, mounted read-only at /media   (optional)
set -eu
cd "$(dirname "$0")"
IMAGE=gui95-win95-reference:1
DOCKER=${DOCKER:-docker}
IMAGES=${REFGRID_IMAGES:-$HOME/.gui95-win95-reference}
mkdir -p out "$IMAGES"
command=${1:-help}; [ $# -gt 0 ] && shift

# in_container MODE [docker options...] -- command...     MODE is ro or rw for the images folder
in_container() {
  mode=$1; shift
  tty=""; [ -t 0 ] && tty="-t"
  if [ -n "${REFGRID_MEDIA:-}" ]; then
    "$DOCKER" run --rm -i $tty -v "$PWD":/work -v "$IMAGES":/images:"$mode" -v "$REFGRID_MEDIA":/media:ro -w /work "$@"
  else
    "$DOCKER" run --rm -i $tty -v "$PWD":/work -v "$IMAGES":/images:"$mode" -w /work "$@"
  fi
}

case "$command" in
  image)        "$DOCKER" build -t "$IMAGE" . ;;
  build)        in_container ro "$IMAGE" ./build.sh ;;
  selftest)     in_container ro -e SELFTEST_STEPS -e SELFTEST_ICOUNT -e REFGRID_KEY_HOLD_MS -e SELFTEST_BOOT_MS "$IMAGE" node selftest-freedos.mjs "$@" ;;
  newdisk)      [ $# -eq 2 ] || { echo "usage: ./run.sh newdisk NAME SIZE" >&2; exit 2; }
                in_container rw "$IMAGE" qemu-img create -f qcow2 "/images/$1" "$2" ;;
  session)      in_container rw -p 127.0.0.1:5900:5900 --name refgrid-vm "$IMAGE" node session.mjs "$@" ;;
  session-bg)   in_container rw -d -p 127.0.0.1:5900:5900 --name refgrid-vm "$IMAGE" node session.mjs "$@" ;;
  session-stop) "$DOCKER" stop -t 20 refgrid-vm ;;
  vmctl)        "$DOCKER" exec -w /work refgrid-vm node vmctl.mjs "$@" ;;
  capture)      in_container ro "$IMAGE" node capture.mjs "$@" ;;
  shell)        in_container rw "$IMAGE" bash ;;
  *)            sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
