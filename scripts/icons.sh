#!/usr/bin/env bash
# Regenerate the PWA icons in public/icons/ from public/icon.svg (uses sharp).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "==> generating icons"
node scripts/icons.mjs
ls -la public/icons
