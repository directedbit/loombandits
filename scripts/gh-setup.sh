#!/usr/bin/env bash
# One-time GitHub setup: create the repo if missing, add the remote, push main,
# and switch GitHub Pages to deploy from Actions. REPO=owner/name overrides the default.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="${REPO:-directedbit/loombandits}"
gh auth status >/dev/null 2>&1 || { echo "not logged in: run  gh auth login -h github.com"; exit 1; }
if gh repo view "$REPO" >/dev/null 2>&1; then
  echo "==> repo $REPO exists"
else
  echo "==> creating public repo $REPO"
  gh repo create "$REPO" --public --description "Fair substitution tracker for the Loom Bandits (offline PWA)"
fi
git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$REPO.git"
echo "==> pushing main"
git push -u origin main
echo "==> enabling GitHub Pages (source: GitHub Actions)"
gh api -X POST "repos/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 \
  || gh api -X PUT "repos/$REPO/pages" -f build_type=workflow >/dev/null
echo "==> done: https://${REPO%%/*}.github.io/${REPO##*/}/"
