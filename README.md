# Loom Bandits Sub Tracker

A phone-first, offline-capable web app that helps the coach of the Loom Bandits rotate
the squad fairly. It runs the game clock, tracks each player's minutes, and shows who
comes off, who goes on, and when — so every girl gets an even share of the game.

**Live app:** https://directedbit.github.io/loombandits/ — open it once on the phone, then
"Add to Home Screen". It works with no signal after that.

**Status:** v1 prototype. See [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## What it does

- Three columns, as in the original sketch: **not playing · sideline · onfield**.
- Each card shows a player's total time on the field.
- Header shows time remaining in the period and a countdown to the next substitution.
- The columns are ordered so reading top-down gives the sub order; one tap makes the sub.
- Settings screen for team name, players, players on field, periods, period length and swap size.
- Works with no signal once installed. All data stays on the phone.

## How the maths works

Who: at each sub the players with the most minutes come off and the players with the fewest
go on. When: the interval is a setting; "auto" splits each period into equal chunks of at
most six minutes with enough subs for everyone to rotate. Everyone finishes within one bench
stint of each other. Details in the requirements doc, §5.

Stack: Svelte 5 + TypeScript + Vite, `vite-plugin-pwa` for offline, Vitest for the engine
tests, GitHub Actions → GitHub Pages. No backend.

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
