#!/usr/bin/env bash
# Start the Vite dev server on http://localhost:5173/loombandits/  (Ctrl-C to stop)
set -euo pipefail
cd "$(dirname "$0")/.."
exec npx vite --host "$@"
