#!/usr/bin/env bash
# Deploy: run all checks, then push main. GitHub Actions builds and publishes to Pages.
# Site: https://directedbit.github.io/loombandits/
set -euo pipefail
cd "$(dirname "$0")/.."
branch=$(git rev-parse --abbrev-ref HEAD)
[[ "$branch" == "main" ]] || { echo "deploy from main (currently on $branch)"; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "working tree not clean; commit first"; exit 1; }
scripts/check.sh
echo "==> git push origin main"
git push origin main
echo "==> watch the deploy: gh run watch"
