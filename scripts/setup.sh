#!/usr/bin/env bash
# Install toolchain dependencies. Run once after clone: scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "==> npm ci"
npm ci
