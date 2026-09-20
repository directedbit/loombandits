#!/usr/bin/env bash
# Browser smoke test against the production build using the installed Chrome.
# Builds first unless --no-build is given. Screenshots: e2e/screenshots/
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${1:-}" != "--no-build" ]]; then scripts/build.sh; fi
PORT="${PORT:-4173}"
echo "==> vite preview on :$PORT"
npx vite preview --port "$PORT" --strictPort >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do
  curl -sf "http://localhost:$PORT/loombandits/" >/dev/null && break
  sleep 0.2
done
echo "==> smoke test"
BASE_URL="http://localhost:$PORT/loombandits/" node e2e/smoke.mjs
