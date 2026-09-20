# AGENTS.md — how to work in this repo

These rules apply to any AI agent (and are good practice for humans) working on the
Loom Bandits Sub Tracker.

## Rule 1: every operation is a script

Any development operation an agent performs — install, dev server, build, test, lint,
format, type-check, icon generation, release, deploy, data migration, anything that
will ever be run twice — must exist as a script under `scripts/` so that a **person can
run it without an agent**.

- Before running an operation, look for its script in `scripts/` and in the catalogue
  below. If there isn't one, **write the script first**, then run it. Do not run ad-hoc
  command sequences for things that will recur.
- If you find yourself doing something by hand that isn't in the catalogue, that is
  the signal to add a script.
- CI (`.github/workflows/`) calls these same scripts. Never duplicate the commands
  inside a workflow file.

### Script conventions

- Bash, `#!/usr/bin/env bash`, `set -euo pipefail`, executable (`chmod +x`).
- Work from any directory: start with `cd "$(dirname "$0")/.."`.
- Non-interactive by default. Options are flags or env vars, never prompts.
- Print what they are doing; exit non-zero on failure.
- One-line header comment saying what the script does and how to call it.
- Each script has a row in the catalogue below. **Keep the table in sync.**

### Script catalogue

| Script | What it does |
|--------|--------------|
| `scripts/setup.sh` | Install toolchain deps (`npm ci`). Run once after clone. |
| `scripts/dev.sh` | Start the Vite dev server. |
| `scripts/test.sh` | Run unit tests (Vitest). `--watch` to keep running. |
| `scripts/lint.sh` | ESLint + Prettier check + `svelte-check`. `--fix` to auto-fix. |
| `scripts/build.sh` | Production build to `dist/`. |
| `scripts/check.sh` | Everything CI runs: lint, test, build. Run before every commit. |
| `scripts/preview.sh` | Serve `dist/` locally to test the PWA/offline behaviour. |
| `scripts/icons.sh` | Regenerate PWA icons from `public/icon.svg`. |
| `scripts/deploy.sh` | Run `check.sh` then push `main`, which triggers the Pages deploy. |

(The table lists the scripts the architecture calls for; tick them off as they land.)

## Rule 2: the engine stays pure

`src/engine/` has no DOM access, no timers, no `Date.now()`. The current time is passed
in. Every engine change comes with a unit test. The fairness invariants in
`docs/REQUIREMENTS.md` §5 are the tests that matter most.

## Rule 3: time comes from timestamps

Never accumulate elapsed time with `setInterval`. Store `at` timestamps on events and
derive durations. The phone will lock, the tab will sleep; the maths must not care.

## Rule 4: offline is not optional

Every feature must work with the network switched off. Before calling a UI change done,
load it once, go offline (DevTools → Network → Offline, or airplane mode), reload, and
use it.

## Rule 5: keep the docs true

`docs/REQUIREMENTS.md` and `docs/ARCHITECTURE.md` are the source of truth. When
behaviour or structure changes, update them in the same commit.

## Rule 6: small and free

No backend, no accounts, no analytics, no dependency without a clear need. Bundle
budget: 200 KB gzipped.

## Housekeeping

- Default branch `main`; deploys come from `main`. Never force-push it.
- Conventional, present-tense commit messages ("Add fairness queue tests").
- Run `scripts/check.sh` before committing.
