#!/usr/bin/env bash
# Everything CI runs: lint, unit tests, production build. Run before every commit.
set -euo pipefail
cd "$(dirname "$0")/.."
scripts/lint.sh
scripts/test.sh
scripts/build.sh
echo "==> all checks passed"
