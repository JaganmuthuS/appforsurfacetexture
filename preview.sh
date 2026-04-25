#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8000}"
URL="http://localhost:${PORT}"

echo "Starting local server at ${URL}"
python -m http.server "${PORT}" >/tmp/surfacetexture_server.log 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "${SERVER_PID}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

sleep 1

if command -v google-chrome >/dev/null 2>&1; then
  google-chrome "${URL}" >/dev/null 2>&1 &
elif command -v chrome >/dev/null 2>&1; then
  chrome "${URL}" >/dev/null 2>&1 &
elif command -v chromium >/dev/null 2>&1; then
  chromium "${URL}" >/dev/null 2>&1 &
elif command -v chromium-browser >/dev/null 2>&1; then
  chromium-browser "${URL}" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  open -a "Google Chrome" "${URL}" >/dev/null 2>&1 || open "${URL}" >/dev/null 2>&1
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "${URL}" >/dev/null 2>&1 &
else
  echo "Could not find a browser launcher. Open this URL manually: ${URL}"
fi

echo "Preview is running. Press Ctrl+C to stop."
wait "${SERVER_PID}"
