#!/usr/bin/env bash
# Production build into dist/. BASE_PATH overrides the URL base (default /loombandits/).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "==> vite build (base=${BASE_PATH:-/loombandits/})"
npx vite build
echo "==> bundle size (gzip)"
find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \) -print0 \
  | xargs -0 cat | gzip -9 | wc -c | awk '{printf "   %d bytes gzipped (budget 204800)\n", $1; exit ($1 > 204800)}'
