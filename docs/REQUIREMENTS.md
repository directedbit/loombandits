# Loom Bandits Sub Tracker — Requirements

Status: **v1.2 built** (2026-10-16). Must-haves including F2.5, F2.6, F4.5 and F4.9 are implemented; should-haves are open.

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

| ID   | Pri | Requirement                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2.1 | M   | Parameters: number of periods, period length (minutes), players on the field, players swapped per substitution, substitution interval (minutes).                                                                                                                                                                                                                                                |
| F2.2 | M   | The app proposes a default substitution interval (see §5) which the coach can override.                                                                                                                                                                                                                                                                                                         |
| F2.3 | M   | The app proposes a starting line-up; the coach can change it by moving cards before kick-off.                                                                                                                                                                                                                                                                                                   |
| F2.4 | S   | Setup values are remembered as a preset so next week's game is one tap.                                                                                                                                                                                                                                                                                                                         |
| F2.5 | M   | **Rotation scope:** _whole game_ (default) or _each period_. In each-period mode the plan is one full rotation of the order per period, so every available player gets both field time and bench time in every period. Settings shows the resulting interval and warns when it drops under 2 minutes (suggesting a bigger swap size).                                                           |
| F2.6 | M   | **Sub order.** The columns are the order: position 1 on the field comes off first, position 1 on the sideline goes on first. Each card has _Earlier_ / _Later_ and _Sub off next_ / _Sub on next_ (to the front of her column) in every phase but finished. The order is state, not a sort: whatever the board shows is what will happen, and a change sticks until the coach changes it again. |

### F3 Game clock

| ID   | Pri | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F3.1 | M   | Start, pause, resume, end period, start next period. **Period length correction:** ±30 s on the length of the current period (or, at the break or before kick-off, the next one). Games that kick off late get cut short, so a 15-minute half may be played as 14. Minutes already played are untouched; the time remaining drops and the subs still to come are re-spread over it, so the half still comes out equal (§5, _Period corrections_). The adjustment is for that period only; a whole-game change goes through Settings → apply. |
| F3.2 | M   | The clock is derived from wall-clock timestamps, so it stays correct when the phone locks or the browser is backgrounded.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| F3.3 | M   | Header always shows: period number, time remaining in the period, countdown to next substitution.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| F3.4 | S   | Keep the screen awake while the clock runs (Screen Wake Lock API where available).                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### F4 Playing time and substitution plan

| ID    | Pri | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4.1  | M   | For each available player track: total time on field this game, and length of the current stint (on field or on bench).                                                                                                                                                                                                                                                                                                                                                                                                                         |
| F4.2  | M   | **Fairness target:** at the end of the scope (game, or each period in each-period mode) every available player has played `players_on_field × scope_time / available_players`, within one bench stint (`ceil(bench ÷ swap_size)` intervals). When the whole bench swaps each time this is one interval.                                                                                                                                                                                                                                         |
| F4.3  | M   | **Next-off queue:** the on-field players in rotation order. **Next-on queue:** the sideline players in rotation order. The top _S_ of each are the recommended swap. A sub moves the outgoing players to the back of the sideline order and the incoming players to the back of the field order; nobody else moves. Minutes are shown, never used to reorder.                                                                                                                                                                                   |
| F4.4  | M   | The next-sub countdown runs to the next planned sub time (see §5, _When_). At zero the header shows **SUB NOW**, the phone vibrates where supported, and the overdue time keeps counting so the coach can see how late they are.                                                                                                                                                                                                                                                                                                                |
| F4.5  | M   | **Do sub**: one tap executes the recommended swap. To sub someone who is not next, tap _Sub off next_ on her field card (or _Sub on next_ on a sideline card): she moves to the front of her column and the sub line follows. That is a change to the order, not a one-off: if the wrong girl comes off, record it the same way and the rotation carries on from the new order rather than swapping her straight back. Early or late subs simply re-time the next one.                                                                          |
| F4.6  | M   | **Undo** the last action (wrong sub, accidental pause).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| F4.7  | S   | Subs falling within ~45 s of a period end are pushed to the break, because a break swap costs nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| F4.8  | S   | Show each player's **projected** end-of-game minutes so the coach can see the plan is fair before it happens.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| F4.9  | M   | **Adaptive timing.** The plan is recomputed after every event: late or early sub, coach override, injury, late arrival, clock correction, shortened period. After a late sub the remaining planned subs are re-spread evenly over the time left, so lost time is shared out rather than landing on the last stint. Early or extra subs never stretch a stint beyond the planned interval: they continue the cadence. Who comes off and on is always the front of the order as it stands; the plan is never a pre-baked list of names and times. |
| F4.10 | S   | **Levelling.** Where an even re-spread still leaves a projected imbalance, the next sub time is nudged so the outgoing players finish on their target share.                                                                                                                                                                                                                                                                                                                                                                                    |

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

**Who.** A rotation. The squad is kept in one order; the on-field players in that order are
the next-off queue and the sideline players in that order are the next-on queue. A sub takes
the first _S_ of each and moves them to the back of the other column: whoever comes off is
last to go back on, whoever goes on is last to come off. With equal stints this is exactly
"off in the order you came on", and every player sits out the same number of stints per
rotation. Minutes are tracked and shown but never reorder anyone.

The coach owns the order. Before kick-off it is the starting order (F2.6); during the game
_Earlier_ / _Later_ and _Sub off next_ / _Sub on next_ change it, and so does a mix-up
recorded that way. Every change sticks: the app never corrects the order back from minutes,
because that is exactly what makes the same two girls swap straight back. A mix-up costs or
gains one girl a stint; the coach settles it with the order, or it evens out over later
rotations. A player back from not-playing joins the front of the sideline (she has had
nothing yet); a manual move onto the field joins the back of the field. A swap never empties
the bench or overfills the field, and a short-handed field is refilled first.

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

**When (adaptive).** The `K`-th sub of a period is the free swap at the break, so `K − 1`
in-play subs are planned. At every anchor (period start, any sub) the engine recomputes:

```
k        = (K − 1) − in-play subs made this period          (remaining planned subs)
stint    = min(interval, (P − elapsed_in_period) / (k + 1))  (k ≤ 0 → interval)
next sub = last sub + stint, folded into the break if under half an interval would remain
```

Behind plan (a late sub): the time left is spread evenly, so stints get shorter and lost time
is shared out. Ahead of plan (early or extra subs): a stint is never stretched beyond the
planned interval, so extra subs simply continue the cadence. The planned count is a minimum,
not a cap; the plan is never a fixed list of times.

| Event                                                        | Fixed schedule (old)                     | Adaptive (F4.9)                                                                                                    |
| ------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Plan: 10-min period, K = 4 → subs at 2:30, 5:00, 7:30, break |                                          |                                                                                                                    |
| First sub made 30 s late at 3:00                             | 5:30, 8:00, break — last stint only 2:00 | 5:20, 7:40, break — the 30 s is shared three ways                                                                  |
| Coach subs early at 1:30                                     | 4:00, 6:30, 9:00, break — an extra stint | 4:00, 6:30, break — stints stay 2:30; a 1:00 last stint is folded into the break                                   |
| Coach taps "sub early" seven times in the first minute       | —                                        | next sub still one interval after the last one, never "wait until the break"                                       |
| Injury at 4:00, player marked not playing                    | who: field refilled from the bench       | same; K may change with the bench size                                                                             |
| Ref ends the period at 9:00                                  | —                                        | the order carries on into the next period from where it stopped; use −30 s (F3.1) when a half is known to be short |

A _pause_ stops game time, so nothing is lost and nothing moves: subs are planned in
game time, not wall-clock time.

**Period corrections.** Games that kick off late get cut short: a 15-minute half may be
played as 14. The coach takes the time off the _period_ (±30 s a tap). Nothing that has
happened changes: minutes played, stints and the anchor stay. The plan is derived from the
period length, so `K` (period scope: unchanged, one rotation), the interval (`P / K`) and the
re-spread of the remaining subs all follow the new length. With 8 players, 5 on and one per
sub, a 14-minute half plans 7 subs every 1:45 and gives everyone 8:45 instead of 9:22. Taken
off mid-period, the stints still to come share the loss evenly. A period is never shortened
below the time already played, or below one minute. The adjustment is for that period only
(the next period is the configured length again, and can be adjusted at the break); the
summary's fair share uses the actual lengths.

| Kick-off 1:00 late, half cut to 14:00 | Nothing done                                   | −30 s twice (F3.1)                   |
| ------------------------------------- | ---------------------------------------------- | ------------------------------------ |
| Clock                                 | 15:00 planned, ref ends it at 14:00            | 14:00 remaining at kick-off          |
| Subs                                  | every 1:52; the last stint is cut off at 14:00 | every 1:45, 7 in play plus the break |
| Minutes                               | last players on get ~1:00 less than the rest   | 8:45 each                            |

**Why a fixed order is enough.** In period scope the plan is one full rotation per period,
so wherever the order stands at kick-off every player sits out the same number of stints,
and with equal stints the times come out equal whatever the order. The _when_ keeps the
stints equal (re-spreading after a late sub); the _who_ is the order and nothing else, so
what the coach sees on the board is what will happen. The cost is that a mix-up or a late
sub is not clawed back automatically: that is the coach's call (F2.6), by design.

**Invariants to test.**

1. With no overrides, max−min playing time at the final whistle ≤ one bench stint (`ceil(B / S)` intervals); ≤ one interval when S ≥ B.
2. A late arriver joins the front of the sideline order, so she is on at the next sub, then
   rotates like everyone else.
3. Marking a player not-playing mid-game removes them from queues and does not
   distort others' targets retroactively.
4. Undoing a sub restores exact totals.
5. The columns read in rotation order in every phase. A sub moves the outgoing players to the
   back of the sideline order and the incoming players to the back of the field order; nobody
   else moves, and minutes never reorder anyone. A promoted player (_Sub … next_) stays at the
   front of her column until a sub or the coach moves her. After a mix-up the rotation carries
   on from the new order: the next sub never reverses the previous one, and the mix-up costs
   at most one stint, which is not clawed back.
6. Shortening a period by δ leaves every player's minutes unchanged, reduces the time remaining
   by δ, keeps `K` in period scope, and re-spreads the remaining stints so a shortened half still
   gives everyone the same time (zero spread when the swap size divides squad and bench).
7. After a sub made δ late, the remaining subs in the period are re-spread: each remaining
   stint is shorter by δ / (remaining stints). The players who were due on keep the loss (nobody
   is re-chosen by minutes), so the final spread grows by at most δ plus its share-out.
8. In period scope, every available player has field time and bench time in every period
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
