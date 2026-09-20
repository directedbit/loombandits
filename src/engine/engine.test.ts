import { describe, expect, it } from 'vitest';
import {
  MINUTE_MS,
  availableCount,
  currentStintMs,
  effectiveSwapSize,
  fairnessBoundMs,
  formatClock,
  gameElapsedMs,
  nextOffQueue,
  nextOnQueue,
  periodElapsedMs,
  periodPlayedMs,
  plannedIntervalMs,
  plannedIntervalNowMs,
  recommendedSwap,
  reduce,
  replay,
  subCountdownMs,
  subsPerPeriod,
  summary,
  totalPlayedMs,
  type GameConfig,
  type GameEvent,
  type GameState,
  type Location,
  type Player,
  type PlayerId,
} from './index';

const T0 = 1_700_000_000_000;

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));
}

function config(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    teamName: 'Test',
    periods: 4,
    periodMinutes: 10,
    onField: 7,
    swapSize: 2,
    intervalSeconds: null,
    rotationScope: 'game',
    ...overrides,
  };
}

function created(cfg: GameConfig, squad: Player[], out: PlayerId[] = [], at = T0): GameEvent {
  const location: Record<PlayerId, Location> = {};
  let onField = 0;
  for (const p of squad) {
    if (out.includes(p.id)) location[p.id] = 'out';
    else if (onField < cfg.onField) {
      location[p.id] = 'field';
      onField++;
    } else location[p.id] = 'bench';
  }
  return { type: 'GameCreated', at, config: cfg, players: squad, location };
}

interface ScheduledChange {
  atGameMs: number;
  id: PlayerId;
  to: Location;
}

interface Simulation {
  state: GameState;
  events: GameEvent[];
  now: number;
  /** Per-period minutes for every player, captured as each period ended. */
  periods: Array<Record<PlayerId, number>>;
}

/**
 * Plays a whole game the way a diligent coach would: kick off each period, make the
 * recommended swap whenever the countdown hits zero, swap again at every break.
 */
function simulate(
  cfg: GameConfig,
  squad: Player[],
  out: PlayerId[] = [],
  changes: ScheduledChange[] = [],
): Simulation {
  const events: GameEvent[] = [created(cfg, squad, out)];
  let state = reduce(null, events[0]!);
  let now = T0 + 5 * MINUTE_MS;
  const pending = [...changes].sort((a, b) => a.atGameMs - b.atGameMs);
  const periods: Array<Record<PlayerId, number>> = [];
  const push = (e: GameEvent) => {
    events.push(e);
    state = reduce(state, e);
  };
  const applyChangesUpTo = (gameMs: number, wallAt: (g: number) => number) => {
    while (pending.length > 0 && pending[0]!.atGameMs <= gameMs) {
      const c = pending.shift()!;
      push({ type: 'PlayerMoved', at: wallAt(c.atGameMs), id: c.id, to: c.to });
    }
  };
  const periodMs = cfg.periodMinutes * MINUTE_MS;
  for (let p = 1; p <= cfg.periods; p++) {
    push({ type: 'PeriodStarted', at: now });
    const periodStartWall = now;
    const periodStartGame = state.completedPeriodsMs;
    const wallAt = (g: number) => periodStartWall + (g - periodStartGame);
    const periodEnd = now + periodMs;
    for (;;) {
      const cd = subCountdownMs(state, now)!;
      const subAt = now + cd;
      const nextChange = pending[0] ? wallAt(pending[0].atGameMs) : Infinity;
      if (nextChange <= subAt && nextChange < periodEnd) {
        now = nextChange;
        applyChangesUpTo(gameElapsedMs(state, now), wallAt);
        continue;
      }
      if (subAt >= periodEnd - 1) break;
      now = subAt;
      const swap = recommendedSwap(state, now);
      push({ type: 'SubMade', at: now, ...swap });
    }
    now = periodEnd;
    push({ type: 'PeriodEnded', at: now });
    periods.push(Object.fromEntries(squad.map((pl) => [pl.id, periodPlayedMs(state, pl.id, now)])));
    if (p < cfg.periods) {
      const swap = recommendedSwap(state, now);
      push({ type: 'SubMade', at: now + 1000, ...swap });
      now += 2 * MINUTE_MS; // break
    }
  }
  return { state, events, now, periods };
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function playedByAvailable(state: GameState, now: number): number[] {
  return state.players
    .filter((p) => state.location[p.id] !== 'out')
    .map((p) => totalPlayedMs(state, p.id, now));
}

describe('subsPerPeriod and plannedIntervalMs', () => {
  it('fixed interval: as many slots as fit the period', () => {
    expect(subsPerPeriod(config({ intervalSeconds: 300 }), 9)).toBe(2);
    expect(plannedIntervalMs(config({ intervalSeconds: 240 }), 9)).toBe(200_000); // 3 slots
  });
  it('game scope: ≤6 min chunks with enough subs for a full rotation', () => {
    expect(plannedIntervalMs(config(), 9)).toBe(5 * MINUTE_MS);
    expect(plannedIntervalMs(config({ periods: 2, periodMinutes: 25, onField: 9 }), 11)).toBe(
      5 * MINUTE_MS,
    );
    expect(
      plannedIntervalMs(config({ periods: 2, periodMinutes: 30, onField: 11, swapSize: 3 }), 14),
    ).toBe(6 * MINUTE_MS);
    expect(plannedIntervalMs(config({ swapSize: 1 }), 10)).toBe(200_000);
  });
  it('period scope: every starter off during the period, plus the break swap', () => {
    const period = config({ rotationScope: 'period' });
    expect(subsPerPeriod(period, 9)).toBe(5); // 7 on, bench 2, swap 2 → 4 in play + break
    expect(plannedIntervalMs(period, 9)).toBe(2 * MINUTE_MS);
    expect(subsPerPeriod(period, 8)).toBe(8); // bench 1 → effective swap 1
    expect(effectiveSwapSize(period, 8)).toBe(1);
    expect(
      subsPerPeriod(config({ rotationScope: 'period', periodMinutes: 20, swapSize: 3 }), 10),
    ).toBe(4);
  });
  it('no bench means only the break slot', () => {
    expect(subsPerPeriod(config(), 7)).toBe(1);
    expect(subsPerPeriod(config({ rotationScope: 'period' }), 6)).toBe(1);
  });
});

describe('clock', () => {
  const squad = players(9);
  it('runs from timestamps and freezes while paused', () => {
    let s = reduce(null, created(config(), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    expect(periodElapsedMs(s, T0 + 90_000)).toBe(90_000);
    s = reduce(s, { type: 'Paused', at: T0 + 90_000 });
    expect(periodElapsedMs(s, T0 + 500_000)).toBe(90_000);
    s = reduce(s, { type: 'Resumed', at: T0 + 500_000 });
    expect(periodElapsedMs(s, T0 + 530_000)).toBe(120_000);
  });
  it('credits playing time only to players on the field', () => {
    let s = reduce(null, created(config(), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    const now = T0 + 60_000;
    expect(totalPlayedMs(s, 'p1', now)).toBe(60_000);
    expect(totalPlayedMs(s, 'p9', now)).toBe(0);
    const onField = s.players.filter((p) => s.location[p.id] === 'field').length;
    const sum = s.players.reduce((acc, p) => acc + totalPlayedMs(s, p.id, now), 0);
    expect(sum).toBe(onField * 60_000);
  });
  it('tracks minutes in the current period separately and resets them at period start', () => {
    let s = reduce(null, created(config({ periods: 2 }), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'PeriodEnded', at: T0 + 600_000 });
    expect(periodPlayedMs(s, 'p1', T0 + 600_000)).toBe(600_000);
    s = reduce(s, { type: 'PeriodStarted', at: T0 + 700_000 });
    expect(periodPlayedMs(s, 'p1', T0 + 760_000)).toBe(60_000);
    expect(totalPlayedMs(s, 'p1', T0 + 760_000)).toBe(660_000);
  });
  it('clock adjustments apply to the period and to everyone on the field', () => {
    let s = reduce(null, created(config(), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'ClockAdjusted', at: T0 + 60_000, deltaMs: 30_000 });
    expect(periodElapsedMs(s, T0 + 60_000)).toBe(90_000);
    expect(totalPlayedMs(s, 'p1', T0 + 60_000)).toBe(90_000);
    expect(periodPlayedMs(s, 'p1', T0 + 60_000)).toBe(90_000);
    expect(totalPlayedMs(s, 'p8', T0 + 60_000)).toBe(0);
    s = reduce(s, { type: 'ClockAdjusted', at: T0 + 60_000, deltaMs: -500_000 });
    expect(periodElapsedMs(s, T0 + 60_000)).toBe(0);
  });
  it('moves through periods to finished', () => {
    let s = reduce(null, created(config({ periods: 2 }), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'PeriodEnded', at: T0 + 600_000 });
    expect(s.phase).toBe('break');
    expect(subCountdownMs(s, T0 + 700_000)).toBe(0); // swap due at the break
    s = reduce(s, { type: 'SubMade', at: T0 + 610_000, off: ['p1', 'p2'], on: ['p8', 'p9'] });
    expect(subCountdownMs(s, T0 + 700_000)).toBe(plannedIntervalNowMs(s)); // already swapped
    s = reduce(s, { type: 'PeriodStarted', at: T0 + 720_000 });
    expect(s.period).toBe(2);
    expect(gameElapsedMs(s, T0 + 720_000 + 30_000)).toBe(630_000);
    s = reduce(s, { type: 'PeriodEnded', at: T0 + 1_320_000 });
    expect(s.phase).toBe('finished');
    expect(subCountdownMs(s, T0 + 1_400_000)).toBeNull();
  });
  it('older saved games without a rotation scope load as whole-game scope', () => {
    const cfg = config();
    const legacy = { ...cfg } as Partial<GameConfig>;
    delete legacy.rotationScope;
    const s = reduce(null, created(legacy as GameConfig, squad));
    expect(s.config.rotationScope).toBe('game');
  });
});

describe('adaptive sub timing', () => {
  const squad = players(9);
  // Fixed 2:30 → 4 slots in a 10-minute period: subs planned at 2:30, 5:00, 7:30, break.
  const cfg = config({ intervalSeconds: 150 });

  it('plans the first sub one stint after kick-off', () => {
    let s = reduce(null, created(cfg, squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    expect(subCountdownMs(s, T0)).toBe(150_000);
    expect(subCountdownMs(s, T0 + 60_000)).toBe(90_000);
  });
  it('shares a late sub across the remaining stints', () => {
    let s = reduce(null, created(cfg, squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    // 30 s late: 3:00 instead of 2:30. Remaining 7:00 over three stints → 5:20, 7:40, break.
    s = reduce(s, { type: 'SubMade', at: T0 + 180_000, ...recommendedSwap(s, T0 + 180_000) });
    expect(subCountdownMs(s, T0 + 180_000)).toBe(140_000);
    s = reduce(s, { type: 'SubMade', at: T0 + 320_000, ...recommendedSwap(s, T0 + 320_000) });
    expect(subCountdownMs(s, T0 + 320_000)).toBe(140_000);
    s = reduce(s, { type: 'SubMade', at: T0 + 460_000, ...recommendedSwap(s, T0 + 460_000) });
    expect(subCountdownMs(s, T0 + 460_000)).toBe(140_000); // due at the break, 10:00
  });
  it('re-spreads after an early sub without adding a stint', () => {
    let s = reduce(null, created(cfg, squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'SubMade', at: T0 + 90_000, ...recommendedSwap(s, T0 + 90_000) });
    // Remaining 8:30 over three stints → 4:20, 7:10, break.
    expect(subCountdownMs(s, T0 + 90_000)).toBe(170_000);
  });
  it('once the planned in-play subs are used, the next is due at the break', () => {
    let s = reduce(null, created(cfg, squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    for (const t of [60_000, 120_000, 180_000]) {
      s = reduce(s, { type: 'SubMade', at: T0 + t, ...recommendedSwap(s, T0 + t) });
    }
    expect(subCountdownMs(s, T0 + 180_000)).toBe(420_000);
  });
  it('a pause moves nothing: the plan lives in game time', () => {
    let s = reduce(null, created(cfg, squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'Paused', at: T0 + 60_000 });
    s = reduce(s, { type: 'Resumed', at: T0 + 360_000 });
    expect(subCountdownMs(s, T0 + 360_000)).toBe(90_000);
  });
  it('config changes mid-game re-plan from the same anchor', () => {
    let s = reduce(null, created(config(), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    expect(plannedIntervalNowMs(s)).toBe(5 * MINUTE_MS);
    s = reduce(s, {
      type: 'ConfigChanged',
      at: T0 + 1000,
      config: config({ intervalSeconds: 180 }),
    });
    expect(plannedIntervalNowMs(s)).toBe(200_000); // 3 slots
    expect(subCountdownMs(s, T0 + 60_000)).toBe(140_000);
  });
});

describe('queues and recommended swap', () => {
  it('takes off the most played and brings on the least played', () => {
    const squad = players(9);
    let s = reduce(null, created(config(), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    const now = T0 + 5 * MINUTE_MS;
    const swap = recommendedSwap(s, now);
    expect(swap.off).toHaveLength(2);
    expect(swap.on).toEqual(['p8', 'p9']);
    s = reduce(s, { type: 'SubMade', at: now, ...swap });
    const later = now + 5 * MINUTE_MS;
    expect(nextOffQueue(s, later).slice(-2).sort()).toEqual(['p8', 'p9']);
    expect(nextOnQueue(s, later).sort()).toEqual(swap.off.slice().sort());
  });
  it('period scope judges on this period first and the whole game second', () => {
    const squad = players(9);
    let s = reduce(null, created(config({ rotationScope: 'period', periods: 2 }), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    // p1 plays the whole first period; p8 and p9 never get on.
    s = reduce(s, { type: 'PeriodEnded', at: T0 + 600_000 });
    s = reduce(s, { type: 'PeriodStarted', at: T0 + 700_000 });
    // Period minutes are all zero again, so whole-game minutes decide: p1..p7 equal → stint.
    const later = T0 + 760_000;
    expect(nextOnQueue(s, later).slice(0, 2).sort()).toEqual(['p8', 'p9']);
    // Bring p8 on for p1; after a minute p8 has fewer period minutes than the rest.
    s = reduce(s, { type: 'SubMade', at: later, off: ['p1'], on: ['p8'] });
    const offQ = nextOffQueue(s, later + 60_000);
    expect(offQ[offQ.length - 1]).toBe('p8');
    // p1 now has 11 minutes overall, but only 1 this period: not first back on.
    const onQ = nextOnQueue(s, later + 60_000);
    expect(onQ[0]).toBe('p9');
  });
  it('fills the field first when short-handed and never exceeds the bench', () => {
    const squad = players(9);
    let s = reduce(null, created(config(), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'PlayerMoved', at: T0 + 60_000, id: 'p1', to: 'out' }); // injury
    const swap = recommendedSwap(s, T0 + 60_000);
    expect(swap.on).toHaveLength(2);
    expect(swap.off).toHaveLength(1);
    expect(swap.on).not.toContain('p1');
    expect(nextOffQueue(s, T0 + 60_000)).not.toContain('p1');
  });
  it('recommends taking players off when too many are on', () => {
    const squad = players(9);
    let s = reduce(null, created(config(), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'PlayerMoved', at: T0 + 1000, id: 'p8', to: 'field' });
    const swap = recommendedSwap(s, T0 + 2000);
    expect(swap.off.length).toBe(swap.on.length + 1);
  });
  it('tie-breaks on the longest current stint', () => {
    const squad = players(9);
    let s = reduce(null, created(config(), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'SubMade', at: T0 + 60_000, off: ['p1'], on: ['p8'] });
    s = reduce(s, { type: 'PlayerMoved', at: T0 + 60_000, id: 'p9', to: 'out' });
    expect(currentStintMs(s, 'p9', T0 + 120_000)).toBe(60_000);
    expect(nextOnQueue(s, T0 + 120_000)[0]).toBe('p1');
  });
});

describe('fairness over a whole game (game scope)', () => {
  const cases: Array<[string, GameConfig, number]> = [
    ['9 players, 7 on, swap 2, 4×10', config(), 9],
    ['8 players, 5 on, swap 2, 4×10', config({ onField: 5 }), 8],
    ['10 players, 7 on, swap 1, 4×10', config({ swapSize: 1 }), 10],
    [
      '12 players, 9 on, swap 3, 2×25',
      config({ periods: 2, periodMinutes: 25, onField: 9, swapSize: 3 }),
      12,
    ],
    ['11 players, 9 on, swap 2, 2×25', config({ periods: 2, periodMinutes: 25, onField: 9 }), 11],
    [
      '14 players, 11 on, swap 3, 2×30',
      config({ periods: 2, periodMinutes: 30, onField: 11, swapSize: 3 }),
      14,
    ],
    ['whole bench swaps: 9 players, 6 on, swap 3', config({ onField: 6, swapSize: 3 }), 9],
  ];
  for (const [label, cfg, n] of cases) {
    it(`${label}: everyone within one bench stint, total time conserved`, () => {
      const { state, now } = simulate(cfg, players(n));
      expect(state.phase).toBe('finished');
      const played = playedByAvailable(state, now);
      expect(spread(played)).toBeLessThanOrEqual(fairnessBoundMs(state) + 1);
      const total = played.reduce((a, b) => a + b, 0);
      expect(total).toBe(cfg.onField * cfg.periods * cfg.periodMinutes * MINUTE_MS);
      const target = (cfg.onField * cfg.periods * cfg.periodMinutes * MINUTE_MS) / n;
      expect(Math.min(...played)).toBeLessThanOrEqual(target);
      expect(Math.max(...played)).toBeGreaterThanOrEqual(target);
    });
  }
  it('whole-bench swaps end within a single interval', () => {
    const { state, now } = simulate(config({ onField: 6, swapSize: 3 }), players(9));
    expect(spread(playedByAvailable(state, now))).toBeLessThanOrEqual(
      plannedIntervalNowMs(state) + 1,
    );
  });
});

describe('fairness in every period (period scope)', () => {
  const cases: Array<[string, GameConfig, number]> = [
    [
      '8 players, 7 on, swap 2, 2×20',
      config({ rotationScope: 'period', periods: 2, periodMinutes: 20 }),
      8,
    ],
    ['9 players, 7 on, swap 2, 4×10', config({ rotationScope: 'period' }), 9],
    [
      '11 players, 9 on, swap 2, 2×25',
      config({ rotationScope: 'period', periods: 2, periodMinutes: 25, onField: 9 }),
      11,
    ],
    [
      '10 players, 7 on, swap 3, 2×20',
      config({ rotationScope: 'period', periods: 2, periodMinutes: 20, swapSize: 3 }),
      10,
    ],
    [
      '12 players, 7 on, swap 2, 2×20',
      config({ rotationScope: 'period', periods: 2, periodMinutes: 20 }),
      12,
    ],
  ];
  for (const [label, cfg, n] of cases) {
    it(`${label}: everyone on and off in every period, per-period spread ≤ one bench stint`, () => {
      const { state, now, periods } = simulate(cfg, players(n));
      const P = cfg.periodMinutes * MINUTE_MS;
      expect(periods).toHaveLength(cfg.periods);
      for (const minutes of periods) {
        const values = Object.values(minutes);
        for (const v of values) {
          expect(v).toBeGreaterThan(0);
          expect(v).toBeLessThan(P);
        }
        expect(spread(values)).toBeLessThanOrEqual(fairnessBoundMs(state) + 1);
      }
      const total = playedByAvailable(state, now).reduce((a, b) => a + b, 0);
      expect(total).toBe(cfg.onField * cfg.periods * P);
    });
  }
});

describe('mid-game changes', () => {
  it('a late arriver is brought on first and does not overtake the others', () => {
    const squad = players(9);
    const { state, now } = simulate(
      config(),
      squad,
      ['p9'],
      [{ atGameMs: 20 * MINUTE_MS, id: 'p9', to: 'bench' }],
    );
    const late = totalPlayedMs(state, 'p9', now);
    const others = squad.filter((p) => p.id !== 'p9').map((p) => totalPlayedMs(state, p.id, now));
    expect(late).toBeGreaterThan(0);
    expect(late).toBeLessThanOrEqual(Math.max(...others));
    expect(state.clocks['p9']!.stints).toBeGreaterThanOrEqual(1);
  });
  it('an injured player leaves the queues and keeps their minutes', () => {
    const { state, now } = simulate(
      config(),
      players(9),
      [],
      [{ atGameMs: 12 * MINUTE_MS, id: 'p1', to: 'out' }],
    );
    expect(state.location['p1']).toBe('out');
    expect(nextOffQueue(state, now)).not.toContain('p1');
    expect(nextOnQueue(state, now)).not.toContain('p1');
    expect(totalPlayedMs(state, 'p1', now)).toBeGreaterThan(0);
    expect(totalPlayedMs(state, 'p1', now)).toBeLessThanOrEqual(12 * MINUTE_MS);
    expect(spread(playedByAvailable(state, now))).toBeLessThanOrEqual(fairnessBoundMs(state) + 1);
  });
  it('a late sub does not change the final spread', () => {
    const cfg = config({ rotationScope: 'period', periods: 2, periodMinutes: 20 });
    const squad = players(9);
    const clean = simulate(cfg, squad);
    // Replay the same game but make the first sub 40 s late, then follow the countdown.
    const events: GameEvent[] = [created(cfg, squad)];
    let state = reduce(null, events[0]!);
    let now = T0;
    const push = (e: GameEvent) => {
      events.push(e);
      state = reduce(state, e);
    };
    push({ type: 'PeriodStarted', at: now });
    let first = true;
    const P = cfg.periodMinutes * MINUTE_MS;
    for (let p = 1; p <= cfg.periods; p++) {
      const periodEnd = now + P;
      for (;;) {
        let subAt = now + subCountdownMs(state, now)!;
        if (first) {
          subAt += 40_000;
          first = false;
        }
        if (subAt >= periodEnd - 1) break;
        now = subAt;
        push({ type: 'SubMade', at: now, ...recommendedSwap(state, now) });
      }
      now = periodEnd;
      push({ type: 'PeriodEnded', at: now });
      if (p < cfg.periods) {
        push({ type: 'SubMade', at: now + 1000, ...recommendedSwap(state, now) });
        now += 60_000;
        push({ type: 'PeriodStarted', at: now });
      }
    }
    expect(state.phase).toBe('finished');
    const late = spread(playedByAvailable(state, now));
    const tidy = spread(playedByAvailable(clean.state, clean.now));
    expect(late).toBeLessThanOrEqual(tidy + 40_000 / 4 + 1);
    expect(late).toBeLessThanOrEqual(fairnessBoundMs(state) + 1);
  });
  it('undo restores the exact previous state', () => {
    const { events } = simulate(config(), players(9));
    const before = replay(events.slice(0, 10));
    const after = replay(events.slice(0, 11));
    expect(after).not.toEqual(before);
    expect(replay(events.slice(0, 11).slice(0, -1))).toEqual(before);
  });
});

describe('summary and formatting', () => {
  it('formats clocks as m:ss with + for negatives', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(605_000)).toBe('10:05');
    expect(formatClock(-23_000)).toBe('+0:23');
  });
  it('summarises minutes and stints, most played first', () => {
    const { state, now } = simulate(config(), players(9));
    const rows = summary(state, now);
    expect(rows).toHaveLength(9);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.playedMs).toBeGreaterThanOrEqual(rows[i]!.playedMs);
    }
    expect(rows.every((r) => r.stints >= 1)).toBe(true);
    expect(availableCount(state)).toBe(9);
  });
});
