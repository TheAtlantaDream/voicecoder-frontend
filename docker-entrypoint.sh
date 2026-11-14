#!/bin/sh
set -eu

bridge_url="${DEFAULT_BRIDGE_URL:-ws://localhost:8000/ws}"
sample_rate="${TARGET_SAMPLE_RATE:-16000}"
vscode_url="${VSCODE_WEB_URL:-/vscode/}"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\r//g'
}

cat > /usr/share/nginx/html/config.js <<EOF
window.__VOICECODER__ = {
  DEFAULT_BRIDGE_URL: "$(json_escape "$bridge_url")",
  TARGET_SAMPLE_RATE: "$(json_escape "$sample_rate")",
  VSCODE_WEB_URL: "$(json_escape "$vscode_url")"
};
EOF

exec "$@"
