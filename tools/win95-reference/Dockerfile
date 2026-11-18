# The toolchain for the Windows 95 reference capture: Open Watcom v2 (builds refgrid.exe), QEMU (runs the guest),
# mtools (builds the FAT data disk) and Node.js (runs the capture and comparison scripts).
#
# Everything is pinned: the base image by digest, Debian packages by a snapshot.debian.org date, Open Watcom by
# release tag and SHA-256. Builds for linux/arm64 (Apple Silicon, native) and linux/amd64.
#
# This image contains no Microsoft software. Windows 95 comes only from the owner's own disk image at run time.
FROM debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2

ARG DEBIAN_SNAPSHOT=20261101T000000Z
RUN printf 'Types: deb\nURIs: http://snapshot.debian.org/archive/debian/%s\nSuites: trixie trixie-updates\nComponents: main\nSigned-By: /usr/share/keyrings/debian-archive-keyring.gpg\n\nTypes: deb\nURIs: http://snapshot.debian.org/archive/debian-security/%s\nSuites: trixie-security\nComponents: main\nSigned-By: /usr/share/keyrings/debian-archive-keyring.gpg\n' "$DEBIAN_SNAPSHOT" "$DEBIAN_SNAPSHOT" > /etc/apt/sources.list.d/debian.sources \
 && apt-get -o Acquire::Check-Valid-Until=false -o Acquire::Retries=5 update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      qemu-system-x86 qemu-utils seabios mtools nodejs ca-certificates curl xz-utils unzip \
 && rm -rf /var/lib/apt/lists/*

# Open Watcom v2, monthly build 2026-11-01. The snapshot holds every host; keep the Linux host for this
# architecture, the headers, the 32-bit libraries and the linker's system definitions.
ARG OW_TAG=2026-11-01-Build
ARG OW_SHA256=89e90b7544cf3ea4a38124ec4c104a5027f31101405d7115c3f833daa465bb48
RUN set -eu; \
    case "$(uname -m)" in aarch64) host=arml64 ;; x86_64) host=binl64 ;; *) echo "unsupported architecture" >&2; exit 1 ;; esac; \
    curl -fsSL -o /tmp/ow.tar.xz "https://github.com/open-watcom/open-watcom-v2/releases/download/${OW_TAG}/ow-snapshot.tar.xz"; \
    echo "${OW_SHA256}  /tmp/ow.tar.xz" | sha256sum -c -; \
    mkdir -p /opt/watcom; \
    tar -xJf /tmp/ow.tar.xz -C /opt/watcom "./${host}" ./binw ./h ./lib386 ./license.txt; \
    ln -s "/opt/watcom/${host}" /opt/watcom/host; \
    rm /tmp/ow.tar.xz

ENV WATCOM=/opt/watcom \
    PATH=/opt/watcom/host:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    INCLUDE=/opt/watcom/h:/opt/watcom/h/nt \
    MTOOLS_SKIP_CHECK=1

WORKDIR /work
