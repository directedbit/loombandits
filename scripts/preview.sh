#!/usr/bin/env bash
# Serve the production build (dist/) locally so the PWA/offline behaviour can be tested.
# Builds first unless --no-build is given.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${1:-}" != "--no-build" ]]; then scripts/build.sh; else shift; fi
exec npx vite preview --host "$@"
