#!/usr/bin/env bash
# Run unit tests once. Pass --watch to keep them running: scripts/test.sh --watch
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${1:-}" == "--watch" ]]; then shift; exec npx vitest "$@"; fi
exec npx vitest run "$@"
