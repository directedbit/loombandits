# Loom Bandits Sub Tracker — Requirements

Status: **v1.1 built** (2026-09-20). Must-haves including F2.5 and F4.9 are implemented; should-haves are open.

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

| ID   | Pri | Requirement                                                                                                                              |
| ---- | --- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| F1.1 | M   | Add, rename and remove players. The roster persists on the device between games.                                                         |
| F1.2 | M   | Per game, mark each player **available** or **not playing** (absent, injured). Not-playing players are excluded from all fairness maths. |
| F1.3 | M   | Availability can change mid-game (late arrival, injury). The plan recomputes immediately from that moment; time already played is kept.  |
| F1.4 | S   | Pin a player to the field (e.g. goalkeeper) so they are excluded from rotation for a period.                                             |

### F2 Game setup

| ID   | Pri | Requirement                                                                                                                                                                                                                                                                                                                                                     |
| ---- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2.1 | M   | Parameters: number of periods, period length (minutes), players on the field, players swapped per substitution, substitution interval (minutes).                                                                                                                                                                                                                |
| F2.2 | M   | The app proposes a default substitution interval (see §5) which the coach can override.                                                                                                                                                                                                                                                                         |
| F2.3 | M   | The app proposes a starting line-up; the coach can change it by moving cards before kick-off.                                                                                                                                                                                                                                                                   |
| F2.4 | S   | Setup values are remembered as a preset so next week's game is one tap.                                                                                                                                                                                                                                                                                         |
| F2.5 | M   | **Rotation scope:** _whole game_ (default) or _each period_. In each-period mode every available player gets both field time and bench time in every period, and fairness is judged on minutes within the period; whole-game minutes break ties. Settings shows the resulting interval and warns when it drops under 2 minutes (suggesting a bigger swap size). |

### F3 Game clock

| ID   | Pri | Requirement                                                                                                               |
| ---- | --- | ------------------------------------------------------------------------------------------------------------------------- |
| F3.1 | M   | Start, pause, resume, end period, start next period. Manual ±30 s correction.                                             |
| F3.2 | M   | The clock is derived from wall-clock timestamps, so it stays correct when the phone locks or the browser is backgrounded. |
| F3.3 | M   | Header always shows: period number, time remaining in the period, countdown to next substitution.                         |
| F3.4 | S   | Keep the screen awake while the clock runs (Screen Wake Lock API where available).                                        |

### F4 Playing time and substitution plan

| ID    | Pri | Requirement                                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4.1  | M   | For each available player track: total time on field this game, and length of the current stint (on field or on bench).                                                                                                                                                                                                                                                                            |
| F4.2  | M   | **Fairness target:** at the end of the scope (game, or each period in each-period mode) every available player has played `players_on_field × scope_time / available_players`, within one bench stint (`ceil(bench ÷ swap_size)` intervals). When the whole bench swaps each time this is one interval.                                                                                            |
| F4.3  | M   | **Next-off queue:** on-field players ordered by most total time played (tie: longest current stint). **Next-on queue:** sideline players ordered by least total time played (tie: longest on bench). The top _S_ of each queue are the recommended swap.                                                                                                                                           |
| F4.4  | M   | The next-sub countdown runs to the next planned sub time (see §5, _When_). At zero the header shows **SUB NOW**, the phone vibrates where supported, and the overdue time keeps counting so the coach can see how late they are.                                                                                                                                                                   |
| F4.5  | M   | **Do sub**: one tap executes the recommended swap. The coach can pick different players before confirming. Early or late subs simply re-time the next one.                                                                                                                                                                                                                                         |
| F4.6  | M   | **Undo** the last action (wrong sub, accidental pause).                                                                                                                                                                                                                                                                                                                                            |
| F4.7  | S   | Subs falling within ~45 s of a period end are pushed to the break, because a break swap costs nothing.                                                                                                                                                                                                                                                                                             |
| F4.8  | S   | Show each player's **projected** end-of-game minutes so the coach can see the plan is fair before it happens.                                                                                                                                                                                                                                                                                      |
| F4.9  | M   | **Adaptive timing.** The plan is recomputed after every event: late or early sub, coach override, injury, late arrival, clock correction, shortened period. The subs still to come in the period are re-spread evenly over the time left, so lost time is shared out rather than landing on the last stint. Who comes off and on is always taken from actual minutes, never from a pre-baked list. |
| F4.10 | S   | **Levelling.** Where an even re-spread still leaves a projected imbalance, the next sub time is nudged so the outgoing players finish on their target share.                                                                                                                                                                                                                                       |

### F5 Board (main screen)

| ID   | Pri | Requirement                                                                                                                                                                        |
| ---- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F5.1 | M   | Three columns as per the sketch. Cards show name and total played time `mm:ss`.                                                                                                    |
| F5.2 | M   | Within **onfield**, cards are ordered next-off first; within **sideline**, next-on first. Reading down the columns gives the sub order. The top _S_ cards in each are highlighted. |
| F5.3 | M   | Tap a card to move it to another column manually (drag is a could-have).                                                                                                           |
| F5.4 | S   | Collapse the "not playing" column to give the other two more room.                                                                                                                 |

### F6 Reports

| ID   | Pri | Requirement                                                                                                |
| ---- | --- | ---------------------------------------------------------------------------------------------------------- |
| F6.1 | M   | End-of-game summary: minutes played and number of stints per player. Copy as plain text for the team chat. |
| F6.2 | S   | Game history stored on the device.                                                                         |
| F6.3 | C   | Season-level fairness: carry small imbalances into the next game's plan.                                   |

### F7 Offline, install, hosting

| ID   | Pri | Requirement                                                                                                               |
| ---- | --- | ------------------------------------------------------------------------------------------------------------------------- |
| F7.1 | M   | Installable PWA: manifest, icons, service worker that precaches every asset. Works with no network after the first visit. |
| F7.2 | M   | Updates download in the background and are applied only when the user agrees ("reload to update"). Never reload mid-game. |
| F7.3 | M   | All data stays on the device. No accounts, no backend, no analytics.                                                      |
| F7.4 | M   | Source on GitHub; hosted on GitHub Pages; deployed by a script / CI.                                                      |

## 5. Substitution algorithm

Notation: _N_ available players, _F_ on the field, _B = N − F_ on the bench, _S_ players
swapped per sub, _T_ total game time, _R_ time remaining in the game.

**Who.** Greedy min–max at each substitution. Take off the _S_ on-field players with the
most total playing time (tie-break: longest current stint). Bring on the _S_ bench
players with the least total playing time (tie-break: longest time on the bench).
Greedy is robust to late arrivals, injuries and coach overrides because it only ever
looks at the current totals, never at a pre-baked schedule.

**Scope.** `rotationScope` is _game_ or _period_.

- _Game_ (default): fairness is judged on whole-game minutes. Subs per period
  `K = max(ceil(ceil(N / S) / periods), ceil(P / 6 min))`, i.e. chunks of at most six
  minutes with enough subs over the game for everyone to have come off once.
- _Period_ ("everyone on and off each half"): fairness is judged on minutes in the current
  period, whole-game minutes as tie-break. With `S_eff = min(S, B, F)` players actually
  moved per sub, the plan is **one full rotation per period**: `K = ceil(N / S_eff)` slots,
  so every player comes off exactly once (the last group at the break). Every starter is off
  during the period and every bench player gets on. When `S_eff` divides both `N` and `B`
  everyone's time is identical; otherwise the spread is one interval. "Everyone on and off
  once" alone (`ceil(F / S_eff) + 1` slots) is not enough: with 8 players, 5 on and one per
  sub it leaves a 5:00 gap in a 15-minute half.

  The trade-off for the Loom Bandits (8 players, 5 on, 15-minute halves):

  | Swap size | Subs a half | Every | Each player gets |
  | --------- | ----------- | ----- | ---------------- |
  | 1         | 7           | 1:52  | 9:22 exactly     |
  | 2         | 3           | 3:45  | 7:30 – 11:15     |
  | 3         | 2           | 5:00  | 5:00 – 10:00     |

  Settings shows this projection for the current squad so the coach can choose.

- _Fixed interval_ (either scope): `K = round(P / interval)`, so the interval is rounded to
  fit whole stints into the period.

**When (adaptive).** The _K_-th sub of a period is the free swap at the break, so there
are `K − 1` in-play subs. At every anchor (period start, any sub, any move, config change)
the engine recomputes:

```
k        = (K − 1) − in-play subs made this period        (remaining in-play subs)
next sub = now + (P − elapsed_in_period) / (k + 1)         (k ≤ 0 → due at the break)
```

The plan is therefore always "spread what is left evenly", never a fixed list of times.

| Event                                                        | Fixed schedule (old)                     | Adaptive (F4.9)                                                                      |
| ------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Plan: 10-min period, K = 4 → subs at 2:30, 5:00, 7:30, break |                                          |                                                                                      |
| First sub made 30 s late at 3:00                             | 5:30, 8:00, break — last stint only 2:00 | 5:20, 7:40, break — the 30 s is shared three ways                                    |
| Coach subs early at 1:30                                     | 4:00, 6:30, 9:00, break — an extra stint | 4:20, 7:10, break — same number of subs, re-spread                                   |
| Injury at 4:00, player marked not playing                    | who: field refilled from the bench       | same, and the shorter bench means K may drop; times re-spread                        |
| Ref ends the period at 9:00                                  | —                                        | next period plans from actual minutes; short-changed players are top of the on-queue |

A _pause_ stops game time, so nothing is lost and nothing moves: subs are planned in
game time, not wall-clock time.

**Why greedy is enough.** Because _who_ is recomputed from actual minutes at every sub,
the _when_ only needs to be sensible; the fairness bound in F4.2 holds even if the coach
is late or early. Adaptive timing keeps stints similar in length; F4.10 (levelling) would
tighten the final spread further.

**Invariants to test.**

1. With no overrides, max−min playing time at the final whistle ≤ one bench stint (`ceil(B / S)` intervals); ≤ one interval when S ≥ B.
2. A late arriver is prioritised on until they catch up, never beyond.
3. Marking a player not-playing mid-game removes them from queues and does not
   distort others' targets retroactively.
4. Undoing a sub restores exact totals.
5. After a sub made δ late, the remaining subs in the period are re-spread: each remaining
   stint is shorter by δ / (remaining stints), and the final spread stays within the bound.
6. In period scope, every available player has field time and bench time in every period
   (given bench ≥ 1), and per-period spread ≤ one interval; zero when the swap size divides
   both the squad and the bench.

## 6. Non-functional requirements

| ID  | Requirement                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------- |
| N1  | Phone-first, portrait. iOS Safari 16.4+ and Android Chrome. Tap targets ≥ 48 px. High-contrast palette readable in sunlight.      |
| N2  | Small: ≤ 200 KB gzipped total; loads from cache in under a second.                                                                |
| N3  | The scheduling engine is pure, framework-free code with unit tests for the invariants in §5.                                      |
| N4  | Every development operation (install, dev, test, build, deploy, …) is a script a human can run without an agent. See `AGENTS.md`. |
| N5  | Free to host and run.                                                                                                             |

## 7. Out of scope for v1

Multi-device sync, live sharing of the line-up, positions/formations, score and goal
tracking, multiple teams, authentication.

## 8. Open questions

1. ~~Sport and defaults~~ — resolved: nothing is sport-specific; team, players on field, periods, period length and swap size are all set on the Settings screen.
2. **Goalkeeper / fixed positions.** Is F1.4 needed for v1?
3. ~~Period-break alignment~~ — resolved: the last sub of each period is the free swap at the break (§5, _When_).
4. **Season fairness** (F6.3): worth it, or is per-game fairness enough?
