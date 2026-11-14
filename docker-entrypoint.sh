#!/bin/sh
set -eu

bridge_url="${DEFAULT_BRIDGE_URL:-ws://localhost:8000/ws}"
sample_rate="${TARGET_SAMPLE_RATE:-16000}"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\r//g'
}

cat > /usr/share/nginx/html/config.js <<EOF
window.__VOICECODER__ = {
  DEFAULT_BRIDGE_URL: "$(json_escape "$bridge_url")",
  TARGET_SAMPLE_RATE: "$(json_escape "$sample_rate")"
};
EOF

exec "$@"
