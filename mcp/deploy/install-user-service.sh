#!/bin/sh
# Run on the Linux server after inspecting the existing service and proxy setup.
set -eu
umask 077
release=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
node_bin=$(command -v node)
command -v systemctl >/dev/null
node_major=$("$node_bin" -p 'Number(process.versions.node.split(".")[0])')
if [ "$node_major" -lt 22 ]; then
    echo "GUI95 MCP needs Node.js 22 or newer." >&2
    exit 1
fi
case "$release:$node_bin" in
    *[!A-Za-z0-9_./:-]*) echo "Use an installation path without spaces or special characters." >&2; exit 1 ;;
esac
if [ ! -f "$release/service/server.mjs" ] || [ ! -d "$release/service/node_modules" ] || [ ! -f "$release/content/SKILL.md" ]; then
    echo "Run this installer from a complete gui95-mcp deployment bundle." >&2
    exit 1
fi
systemctl --user show-environment >/dev/null
state_dir="$HOME/.local/state/gui95-mcp"
unit_dir="$HOME/.config/systemd/user"
mkdir -p "$state_dir" "$unit_dir"
unit_file="$unit_dir/gui95-mcp.service"
if [ -f "$unit_file" ]; then
    cp "$unit_file" "$unit_file.backup.$(date -u +%Y%m%dT%H%M%SZ)"
fi
cat > "$unit_file" <<EOF
[Unit]
Description=GUI95 live references and private agent feedback inbox
After=network.target

[Service]
Type=simple
WorkingDirectory=$release/service
ExecStart=$node_bin $release/service/server.mjs
Environment=GUI95_CONTENT_ROOT=$release/content
Environment=GUI95_STATE_DIR=%h/.local/state/gui95-mcp
Environment=GUI95_PUBLIC_URL=https://ded.increpare.com/gui95/
Environment=GUI95_HOST=127.0.0.1
Environment=GUI95_PORT=3295
Restart=on-failure
RestartSec=3
TimeoutStopSec=15
UMask=0077
NoNewPrivileges=true

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable gui95-mcp.service
systemctl --user restart gui95-mcp.service
systemctl --user --no-pager --full status gui95-mcp.service
echo "Service installed on loopback only. Add the /gui95/ proxy route to the existing HTTPS site."
echo "Confirm user lingering is already enabled if the service must run after logout."
