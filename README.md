# Loom Bandits Sub Tracker

A phone-first, offline-capable web app that helps the coach of the Loom Bandits rotate
the squad fairly. It runs the game clock, tracks each player's minutes, and shows who
comes off, who goes on, and when — so every girl gets an even share of the game.

**Status:** planning. See [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## What it does

- Three columns, as in the original sketch: **not playing · sideline · onfield**.
- Each card shows a player's total time on the field.
- Header shows time remaining in the period and a countdown to the next substitution.
- The columns are ordered so reading top-down gives the sub order; one tap makes the sub.
- Works with no signal once installed. All data stays on the phone.

## Running it

Everything is a script — see [`AGENTS.md`](AGENTS.md) for the full catalogue.

```sh
scripts/setup.sh     # install
scripts/dev.sh       # local dev server
scripts/test.sh      # unit tests
scripts/check.sh     # everything CI runs
scripts/deploy.sh    # ship to GitHub Pages
```

## Design

The original whiteboard sketch is `Loom Bandits 2026-09-20 15.00.55.excalidraw.md`
(open with the Obsidian Excalidraw plugin or at excalidraw.com).
