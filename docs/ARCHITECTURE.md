# Loom Bandits Sub Tracker — Architecture

Status: **implemented as described** (2026-09-20). Deviations are noted inline. See `REQUIREMENTS.md` for what it must do.

## 1. Shape of the system

A single-page **progressive web app** with **no backend**. Everything runs in the
browser and all data lives on the device. The repo is deployed as static files to
GitHub Pages.

```
┌────────────────────────── phone ───────────────────────────┐
│  UI (Svelte components)                                     │
│    Header · Board (3 columns) · Setup · Squad · Summary     │
│          ▲ subscribes            │ dispatches events        │
│  Store  ─┴───────────────────────▼──────────────────────    │
│    event log  ──reduce──▶  GameState  ──derive──▶ view data │
│          │ persist (localStorage, versioned)                │
│  Engine (pure TypeScript, no DOM)                           │
│    clock · fairness queues · next-sub schedule · reducer    │
│  Service worker (Workbox via vite-plugin-pwa)               │
│    precache all assets · prompt-to-update                   │
└─────────────────────────────────────────────────────────────┘
```

## 2. Proposed stack

| Concern     | Choice                                               | Why                                                                                                                       |
| ----------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Language    | TypeScript                                           | Engine correctness matters; types catch time-unit mistakes.                                                               |
| Build       | Vite                                                 | Fast, simple, first-class PWA plugin, static output for Pages.                                                            |
| UI          | Svelte 5                                             | Reactive with very little boilerplate; small bundle (~10 KB runtime); good fit for a ticking clock and reorderable lists. |
| PWA         | vite-plugin-pwa (Workbox)                            | Generates manifest + service worker; `registerType: 'prompt'` so we never reload mid-game.                                |
| State       | Event log + reducer, in a small custom store         | Time tracking is naturally event-based (every event has a timestamp); gives undo and exact summaries for free.            |
| Persistence | localStorage, JSON, schema-versioned with migrations | State is a few KB; IndexedDB is unnecessary.                                                                              |
| Unit tests  | Vitest                                               | Same config as Vite; fast; runs engine tests in Node.                                                                     |
| E2E smoke   | Playwright driving the installed Chrome              | `scripts/e2e.sh`: squad setup, kick-off, sub, reload, offline reload, summary. Runs in CI.                                |
| Lint/format | Prettier + `svelte-check`                            | Type-checks TS and Svelte together; ESLint deferred until it earns its config.                                            |
| CI/CD       | GitHub Actions → GitHub Pages                        | Free, one workflow: check → build → deploy on push to `main`.                                                             |

### Alternatives considered

- **Preact + signals** — equally valid, similar size. Svelte chosen for less glue code; switching is cheap at this stage.
- **React** — heavier, more boilerplate, no benefit for a single-screen app.
- **No-build single HTML file** — simplest possible deploy, but loses TypeScript and a proper test runner for the engine, which is where the risk is. Rejected.
- **SvelteKit** — routing and SSR we don't need. Plain Vite SPA with hash-based screens.
- **IndexedDB / Dexie** — overkill for one small JSON blob.

## 3. Engine design (`src/engine/`)

Pure functions only. No DOM, no timers, no `Date.now()` inside — the current time is
always passed in. This is what makes the invariants in REQUIREMENTS §5 unit-testable.

```
types.ts      Player, GameConfig, GameState, Event union
reducer.ts    reduce(state, event) → state        (the only way state changes)
clock.ts      elapsedInPeriod(state, now), timeRemaining(state, now)
playtime.ts   totalPlayed(player, state, now), currentStint(...)
fairness.ts   nextOffQueue(state, now), nextOnQueue(state, now), recommendedSwap(state, now, S)
schedule.ts   defaultInterval(config, remaining), nextSubAt(state), projectedMinutes(state, now)
summary.ts    endOfGameReport(state)
```

**Events** (all carry `at: number` ms epoch): `GameConfigured`, `LineupSet`,
`PeriodStarted`, `Paused`, `Resumed`, `PeriodEnded`, `SubMade {off[], on[]}`,
`PlayerMoved {id, to}`, `AvailabilityChanged`, `ClockAdjusted {deltaMs}`,
`Undo` (implemented as popping the log and re-reducing).

**Time model.** A player's total time on field = Σ over their on-field segments of
(segment end − segment start), where segments are cut by `SubMade`/`PlayerMoved` and
only count while the clock is running (`PeriodStarted`/`Resumed` … `Paused`/`PeriodEnded`).
Computed from the log on demand; never accumulated with `setInterval`.

## 4. UI (`src/ui/`)

Screens (hash routes, no router library): `#/setup`, `#/squad`, `#/game`, `#/summary`.

- `Header.svelte` — period, time remaining, next-sub countdown / SUB NOW, start/pause.
- `Board.svelte` — three `Column.svelte`s of `PlayerCard.svelte`; tap to select, tap a column to move.
- `SubBar.svelte` — "Do sub: Tilly ↔ Immy" one-tap confirm, plus undo.
- UI ticks once a second with `Date.now()` and re-derives view data from the engine.

Design notes: portrait phone first; cards ≥ 56 px tall; two colours of highlight (next off, next on); a light theme with strong contrast for sunlight, dark theme respected if the OS asks for it.

## 5. Offline and PWA

- `vite-plugin-pwa` with `registerType: 'prompt'`; an "Update available — reload" banner that is hidden while a game is running.
- Precache everything (`globPatterns: ['**/*']`); there are no runtime network requests at all.
- `base: '/loombandits/'` for the GitHub Pages project URL.
- Icons generated by a script from one SVG (`scripts/icons.sh`).
- Screen Wake Lock requested on game start; no-op where unsupported.

## 6. Repository layout

```
.
├── AGENTS.md              rules for agents (scripts-first)
├── README.md
├── docs/                  REQUIREMENTS.md, ARCHITECTURE.md
├── scripts/               every dev operation as a runnable script
├── .github/workflows/     ci.yml (check) + deploy.yml (Pages)
├── public/                manifest icons, favicon
├── src/
│   ├── engine/            pure TS + tests alongside (*.test.ts)
│   ├── store/             persistence, migrations
│   ├── ui/                Svelte components and screens
│   └── main.ts
├── index.html
├── package.json / vite.config.ts / tsconfig.json
└── Loom Bandits 2026-09-20 15.00.55.excalidraw.md   original sketch
```

## 7. Delivery plan

1. Scaffold: Vite + Svelte + TS, PWA plugin, Vitest, scripts, CI. Deploy a "hello" build to Pages to prove the pipeline offline-installs.
2. Engine with tests: reducer, clock, playtime, fairness queues, default interval, undo.
3. Setup + Squad screens; persistence.
4. Game board per the sketch; do-sub / undo; SUB NOW alert; wake lock.
5. Summary screen and copy-to-text.
6. Should-haves: pinned players, period-break alignment, projections, history.

## 8. Next: rotation scope and adaptive timing (REQUIREMENTS F2.5, F4.9)

Engine changes, all pure and unit-tested:

- `GameConfig.rotationScope: 'game' | 'period'`; `GameState.inPlaySubsThisPeriod` counter,
  reset on `PeriodStarted`, incremented on `SubMade` while running or paused.
- `PlayerClock.playedThisPeriodMs`, reset on `PeriodStarted`, settled like `playedMs`.
- `schedule.ts`: `subsPerPeriod(config, available)` per scope; `nextSubDueGameMs(state)` =
  the adaptive formula, replacing `subAnchorGameMs + intervalMs`.
- `fairness.ts`: sort key becomes `[scopeMinutes, gameMinutes, stint]`.
- Settings UI: scope toggle plus the computed "subs per period / every m:ss" readout with a
  warning under two minutes.
