# Loom Bandits Sub Tracker — Requirements

Status: **draft for discussion** (2026-09-20).

## 1. Purpose

A sideline tool for the coach of the Loom Bandits, a girls' junior team. It runs the
game clock, tracks how long each player has been on the field, and tells the coach
**who comes off, who goes on, and when**, so that every available player gets an even
share of playing time over the game.

It replaces the mental arithmetic (and the arguments) that come with rotating a squad
of kids by hand.

## 2. Users and context

- **Primary user:** the coach or a parent on the sideline, holding a phone, in sunlight,
  half-distracted by the game. Must be usable one-handed with a few large taps.
- **Secondary users:** players and parents reading the "next on / next off" list over
  the coach's shoulder.
- **Environment:** sports grounds with poor or no mobile signal. After the first visit
  the app must work with no network at all.

## 3. Source of truth for the UI

The Excalidraw sketch `Loom Bandits 2026-09-20 15.00.55.excalidraw.md` at the repo root:

- Header bar: `time remaining: 14:09` and `Next Sub: 23s`.
- Three columns: **not playing** | **sideline** | **onfield**.
- One card per player showing the name and accumulated playing time.
- A small `<` control on the "not playing" column (collapse it out of the way).

## 4. Functional requirements

Priority: **M** must have for v1, **S** should have, **C** could have.

### F1 Squad

| ID   | Pri | Requirement |
|------|-----|-------------|
| F1.1 | M | Add, rename and remove players. The roster persists on the device between games. |
| F1.2 | M | Per game, mark each player **available** or **not playing** (absent, injured). Not-playing players are excluded from all fairness maths. |
| F1.3 | M | Availability can change mid-game (late arrival, injury). The plan recomputes immediately from that moment; time already played is kept. |
| F1.4 | S | Pin a player to the field (e.g. goalkeeper) so they are excluded from rotation for a period. |

### F2 Game setup

| ID   | Pri | Requirement |
|------|-----|-------------|
| F2.1 | M | Parameters: number of periods, period length (minutes), players on the field, players swapped per substitution, substitution interval (minutes). |
| F2.2 | M | The app proposes a default substitution interval (see §5) which the coach can override. |
| F2.3 | M | The app proposes a starting line-up; the coach can change it by moving cards before kick-off. |
| F2.4 | S | Setup values are remembered as a preset so next week's game is one tap. |

### F3 Game clock

| ID   | Pri | Requirement |
|------|-----|-------------|
| F3.1 | M | Start, pause, resume, end period, start next period. Manual ±30 s correction. |
| F3.2 | M | The clock is derived from wall-clock timestamps, so it stays correct when the phone locks or the browser is backgrounded. |
| F3.3 | M | Header always shows: period number, time remaining in the period, countdown to next substitution. |
| F3.4 | S | Keep the screen awake while the clock runs (Screen Wake Lock API where available). |

### F4 Playing time and substitution plan

| ID   | Pri | Requirement |
|------|-----|-------------|
| F4.1 | M | For each available player track: total time on field this game, and length of the current stint (on field or on bench). |
| F4.2 | M | **Fairness target:** at the final whistle every available player has played `players_on_field × total_game_time / available_players`, within one substitution interval. |
| F4.3 | M | **Next-off queue:** on-field players ordered by most total time played (tie: longest current stint). **Next-on queue:** sideline players ordered by least total time played (tie: longest on bench). The top *S* of each queue are the recommended swap. |
| F4.4 | M | The next-sub countdown runs from the last sub (or period start). At zero the header shows **SUB NOW**, the phone vibrates where supported, and the overdue time keeps counting so the coach can see how late they are. |
| F4.5 | M | **Do sub**: one tap executes the recommended swap. The coach can pick different players before confirming. Early or late subs simply re-time the next one. |
| F4.6 | M | **Undo** the last action (wrong sub, accidental pause). |
| F4.7 | S | Subs falling within ~45 s of a period end are pushed to the break, because a break swap costs nothing. |
| F4.8 | S | Show each player's **projected** end-of-game minutes so the coach can see the plan is fair before it happens. |

### F5 Board (main screen)

| ID   | Pri | Requirement |
|------|-----|-------------|
| F5.1 | M | Three columns as per the sketch. Cards show name and total played time `mm:ss`. |
| F5.2 | M | Within **onfield**, cards are ordered next-off first; within **sideline**, next-on first. Reading down the columns gives the sub order. The top *S* cards in each are highlighted. |
| F5.3 | M | Tap a card to move it to another column manually (drag is a could-have). |
| F5.4 | S | Collapse the "not playing" column to give the other two more room. |

### F6 Reports

| ID   | Pri | Requirement |
|------|-----|-------------|
| F6.1 | M | End-of-game summary: minutes played and number of stints per player. Copy as plain text for the team chat. |
| F6.2 | S | Game history stored on the device. |
| F6.3 | C | Season-level fairness: carry small imbalances into the next game's plan. |

### F7 Offline, install, hosting

| ID   | Pri | Requirement |
|------|-----|-------------|
| F7.1 | M | Installable PWA: manifest, icons, service worker that precaches every asset. Works with no network after the first visit. |
| F7.2 | M | Updates download in the background and are applied only when the user agrees ("reload to update"). Never reload mid-game. |
| F7.3 | M | All data stays on the device. No accounts, no backend, no analytics. |
| F7.4 | M | Source on GitHub; hosted on GitHub Pages; deployed by a script / CI. |

## 5. Substitution algorithm

Notation: *N* available players, *F* on the field, *B = N − F* on the bench, *S* players
swapped per sub, *T* total game time, *R* time remaining in the game.

**Who.** Greedy min–max at each substitution. Take off the *S* on-field players with the
most total playing time (tie-break: longest current stint). Bring on the *S* bench
players with the least total playing time (tie-break: longest time on the bench).
Greedy is robust to late arrivals, injuries and coach overrides because it only ever
looks at the current totals, never at a pre-baked schedule.

**When.** The interval is a setting. The app proposes a default so that the remaining
game divides into whole rotations (a rotation = every player has come off once =
`ceil(N / S)` subs):

```
interval = R / (m × ceil(N / S))     with the smallest m such that interval ≤ 6 min
```

Examples:

| N | F | S | Game | Default interval | Each player sits out |
|---|---|---|------|------------------|----------------------|
| 8  | 5 | 2 | 40 min | 5 min (m = 2) | 15 min total, in ~7.5 min blocks |
| 10 | 7 | 1 | 40 min | 4 min (m = 1) | 12 min total, one 12 min block |
| 9  | 7 | 2 | 40 min | 4 min (m = 2) | ~9 min total |

Because *who* is recomputed from totals every time, the interval only needs to be
"about right"; the fairness bound in F4.2 still holds.

**Invariants to test.**

1. With no overrides, max−min playing time at the final whistle ≤ one interval.
2. A late arriver is prioritised on until they catch up, never beyond.
3. Marking a player not-playing mid-game removes them from queues and does not
   distort others' targets retroactively.
4. Undoing a sub restores exact totals.

## 6. Non-functional requirements

| ID | Requirement |
|----|-------------|
| N1 | Phone-first, portrait. iOS Safari 16.4+ and Android Chrome. Tap targets ≥ 48 px. High-contrast palette readable in sunlight. |
| N2 | Small: ≤ 200 KB gzipped total; loads from cache in under a second. |
| N3 | The scheduling engine is pure, framework-free code with unit tests for the invariants in §5. |
| N4 | Every development operation (install, dev, test, build, deploy, …) is a script a human can run without an agent. See `AGENTS.md`. |
| N5 | Free to host and run. |

## 7. Out of scope for v1

Multi-device sync, live sharing of the line-up, positions/formations, score and goal
tracking, multiple teams, authentication.

## 8. Open questions

1. **Sport and defaults.** Players on field, period structure (quarters vs halves), typical squad size, players swapped per sub. Needed to pick sensible presets.
2. **Goalkeeper / fixed positions.** Is F1.4 needed for v1?
3. **Period-break alignment** (F4.7): should the plan always prefer swapping at breaks?
4. **Season fairness** (F6.3): worth it, or is per-game fairness enough?
