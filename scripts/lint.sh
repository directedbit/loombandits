#!/usr/bin/env bash
# Type-check (svelte-check) and format-check (prettier). Pass --fix to reformat.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${1:-}" == "--fix" ]]; then
  echo "==> prettier --write"
  npx prettier --write .
else
  echo "==> prettier --check"
  npx prettier --check .
fi
echo "==> svelte-check"
npx svelte-check --tsconfig ./tsconfig.json --fail-on-warnings
