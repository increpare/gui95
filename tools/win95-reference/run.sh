#!/bin/sh
# Host entry point for the Windows 95 reference pipeline. Everything except "compare" runs in the container.
#
#   ./run.sh image                 build the container image (QEMU, Open Watcom, mtools, Node.js)
#   ./run.sh build                 compile refgrid.exe into out/ and write out/grid.json
#   ./run.sh selftest              prove the capture mechanics with FreeDOS (no Windows needed)
#   ./run.sh newdisk NAME SIZE     create an empty disk image images/NAME (for example win95.qcow2 500M)
#   ./run.sh session [options]     run the guest with a VNC display, to install or adjust Windows by hand
#   ./run.sh capture [options]     boot the prepared image headless and capture every sheet
#   ./run.sh shell                 a shell in the container
#   node compare.mjs ...           compare a capture with the kit's atlas (runs on the host, no container)
#
# Disk images live in images/, which is ignored by git. "capture" mounts it read-only.
set -eu
cd "$(dirname "$0")"
IMAGE=gui95-win95-reference:1
DOCKER=${DOCKER:-docker}
mkdir -p out images
command=${1:-help}; [ $# -gt 0 ] && shift

in_container() { # in_container IMAGES_MODE [docker options] -- command...
  mode=$1; shift
  opts=""
  while [ "$1" != "--" ]; do opts="$opts $1"; shift; done; shift
  # shellcheck disable=SC2086
  "$DOCKER" run --rm -i $( [ -t 0 ] && echo -t ) $opts -v "$PWD":/work -v "$PWD/images":/work/images:"$mode" -w /work "$IMAGE" "$@"
}

case "$command" in
  image)    "$DOCKER" build -t "$IMAGE" . ;;
  build)    in_container ro -- ./build.sh ;;
  selftest) in_container ro -e SELFTEST_STEPS -e SELFTEST_ICOUNT -e REFGRID_KEY_HOLD_MS -e SELFTEST_BOOT_MS -- node selftest-freedos.mjs "$@" ;;
  newdisk)  [ $# -eq 2 ] || { echo "usage: ./run.sh newdisk NAME SIZE" >&2; exit 2; }
            in_container rw -- qemu-img create -f qcow2 "images/$1" "$2" ;;
  session)  in_container rw -p 127.0.0.1:5900:5900 -- node session.mjs "$@" ;;
  capture)  in_container ro -- node capture.mjs "$@" ;;
  shell)    in_container rw -- bash ;;
  *)        sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
