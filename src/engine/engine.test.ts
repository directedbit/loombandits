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
  periodLengthMs,
  periodPlayedMs,
  periodRemainingMs,
  plannedIntervalMs,
  plannedIntervalNowMs,
  projectPeriod,
  promotedLineup,
  recommendedSwap,
  reduce,
  reorderedLineup,
  replay,
  subCountdownMs,
  subsPerPeriod,
  subsPerPeriodNow,
  summary,
  targetPlayedMs,
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
      const swap = recommendedSwap(state);
      push({ type: 'SubMade', at: now, ...swap });
    }
    now = periodEnd;
    push({ type: 'PeriodEnded', at: now });
    periods.push(Object.fromEntries(squad.map((pl) => [pl.id, periodPlayedMs(state, pl.id, now)])));
    if (p < cfg.periods) {
      const swap = recommendedSwap(state);
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
  it('period scope: one full rotation per period', () => {
    const period = config({ rotationScope: 'period' });
    expect(subsPerPeriod(period, 9)).toBe(5); // 9 players, swap 2 → 5 slots, 4 in play
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
  it('a period adjustment changes the time remaining, not the time played', () => {
    let s = reduce(null, created(config(), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'PeriodAdjusted', at: T0 + 60_000, deltaMs: -30_000 });
    expect(periodLengthMs(s)).toBe(570_000);
    expect(periodRemainingMs(s, T0 + 60_000)).toBe(510_000);
    expect(periodElapsedMs(s, T0 + 60_000)).toBe(60_000);
    expect(totalPlayedMs(s, 'p1', T0 + 60_000)).toBe(60_000);
    expect(periodPlayedMs(s, 'p1', T0 + 60_000)).toBe(60_000);
    expect(totalPlayedMs(s, 'p8', T0 + 60_000)).toBe(0);
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
    s = reduce(s, { type: 'SubMade', at: T0 + 180_000, ...recommendedSwap(s) });
    expect(subCountdownMs(s, T0 + 180_000)).toBe(140_000);
    s = reduce(s, { type: 'SubMade', at: T0 + 320_000, ...recommendedSwap(s) });
    expect(subCountdownMs(s, T0 + 320_000)).toBe(140_000);
    s = reduce(s, { type: 'SubMade', at: T0 + 460_000, ...recommendedSwap(s) });
    expect(subCountdownMs(s, T0 + 460_000)).toBe(140_000); // due at the break, 10:00
  });
  it('an early sub never stretches the next stint beyond the planned interval', () => {
    let s = reduce(null, created(cfg, squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'SubMade', at: T0 + 90_000, ...recommendedSwap(s) });
    // Spreading 8:30 over three stints would be 2:50; the plan keeps 2:30 → 4:00.
    expect(subCountdownMs(s, T0 + 90_000)).toBe(150_000);
    s = reduce(s, { type: 'SubMade', at: T0 + 240_000, ...recommendedSwap(s) });
    expect(subCountdownMs(s, T0 + 240_000)).toBe(150_000); // 6:30
    s = reduce(s, { type: 'SubMade', at: T0 + 390_000, ...recommendedSwap(s) });
    // 9:00 would leave a 1:00 stint, under half an interval: fold it into the break.
    expect(subCountdownMs(s, T0 + 390_000)).toBe(210_000);
  });
  it('extra subs keep the planned cadence instead of waiting for the break', () => {
    let s = reduce(null, created(cfg, squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    for (const t of [60_000, 120_000, 180_000]) {
      s = reduce(s, { type: 'SubMade', at: T0 + t, ...recommendedSwap(s) });
    }
    // All three planned in-play subs are used by 3:00; the next is still one interval away.
    expect(subCountdownMs(s, T0 + 180_000)).toBe(150_000);
  });
  it('seven quick "sub early" taps do not push the next sub to the break (the 13:49 bug)', () => {
    const half = config({
      rotationScope: 'period',
      periods: 2,
      periodMinutes: 15,
      onField: 5,
      swapSize: 1,
    });
    let s = reduce(null, created(half, players(8)));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    for (let i = 1; i <= 7; i++) {
      const at = T0 + i * 10_000;
      s = reduce(s, { type: 'SubMade', at, ...recommendedSwap(s) });
    }
    // Last sub at 1:10; the next is due one planned interval (1:52.5) later, at 3:02.5.
    expect(subCountdownMs(s, T0 + 71_000)).toBe(111_500);
    expect(subCountdownMs(s, T0 + 71_000)).toBeLessThan(13 * MINUTE_MS);
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
  it('rotates the front of each column; the movers join the back of the other', () => {
    const squad = players(9);
    let s = reduce(null, created(config(), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    const now = T0 + 5 * MINUTE_MS;
    const swap = recommendedSwap(s);
    expect(swap).toEqual({ off: ['p1', 'p2'], on: ['p8', 'p9'] });
    s = reduce(s, { type: 'SubMade', at: now, ...swap });
    expect(nextOffQueue(s)).toEqual(['p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']);
    expect(nextOnQueue(s)).toEqual(['p1', 'p2']);
    expect(s.players.map((p) => p.id)).toEqual([
      'p3',
      'p4',
      'p5',
      'p6',
      'p7',
      'p8',
      'p9',
      'p1',
      'p2',
    ]);
  });
  it('minutes never reorder anyone: a whole period on the field changes nothing', () => {
    const squad = players(9);
    let s = reduce(null, created(config({ rotationScope: 'period', periods: 2 }), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    // Nobody is subbed all period; p8 and p9 never get on.
    s = reduce(s, { type: 'PeriodEnded', at: T0 + 600_000 });
    s = reduce(s, { type: 'PeriodStarted', at: T0 + 700_000 });
    expect(nextOffQueue(s)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    expect(nextOnQueue(s)).toEqual(['p8', 'p9']);
    const later = T0 + 760_000;
    s = reduce(s, { type: 'SubMade', at: later, off: ['p1'], on: ['p8'] });
    // p8 has the fewest minutes on the field and p1 the most on the bench: irrelevant.
    expect(nextOffQueue(s)).toEqual(['p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
    expect(nextOnQueue(s)).toEqual(['p9', 'p1']);
    expect(totalPlayedMs(s, 'p1', later + 60_000)).toBeGreaterThan(
      totalPlayedMs(s, 'p9', later + 60_000),
    );
  });
  it('fills the field first when short-handed and never exceeds the bench', () => {
    const squad = players(9);
    let s = reduce(null, created(config(), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'PlayerMoved', at: T0 + 60_000, id: 'p1', to: 'out' }); // injury
    const swap = recommendedSwap(s);
    expect(swap.on).toHaveLength(2);
    expect(swap.off).toHaveLength(1);
    expect(swap.on).not.toContain('p1');
    expect(nextOffQueue(s)).not.toContain('p1');
  });
  it('recommends taking players off when too many are on', () => {
    const squad = players(9);
    let s = reduce(null, created(config(), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'PlayerMoved', at: T0 + 1000, id: 'p8', to: 'field' });
    const swap = recommendedSwap(s);
    expect(swap.off.length).toBe(swap.on.length + 1);
    // The manual move put p8 at the back of the field order, so she is not among them.
    expect(swap).toEqual({ off: ['p1', 'p2'], on: ['p9'] });
  });
  it('a manual move joins the back of its column; back from not-playing joins the front', () => {
    const squad = players(9);
    let s = reduce(null, created(config(), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'SubMade', at: T0 + 60_000, off: ['p1'], on: ['p8'] });
    s = reduce(s, { type: 'PlayerMoved', at: T0 + 60_000, id: 'p9', to: 'out' });
    expect(nextOnQueue(s)).toEqual(['p1']);
    s = reduce(s, { type: 'PlayerMoved', at: T0 + 120_000, id: 'p9', to: 'bench' });
    expect(nextOnQueue(s)).toEqual(['p9', 'p1']);
    // Injury without a replacement: she comes off and goes to the back of the sideline.
    s = reduce(s, { type: 'PlayerMoved', at: T0 + 180_000, id: 'p3', to: 'bench' });
    expect(nextOnQueue(s)).toEqual(['p9', 'p1', 'p3']);
    expect(nextOffQueue(s)).toEqual(['p2', 'p4', 'p5', 'p6', 'p7', 'p8']);
    // Straight from not-playing onto the field: the freshest, so last off.
    s = reduce(s, { type: 'PlayerMoved', at: T0 + 200_000, id: 'p3', to: 'out' });
    s = reduce(s, { type: 'PlayerMoved', at: T0 + 240_000, id: 'p3', to: 'field' });
    expect(nextOffQueue(s)).toEqual(['p2', 'p4', 'p5', 'p6', 'p7', 'p8', 'p3']);
    expect(currentStintMs(s, 'p3', T0 + 300_000)).toBe(60_000);
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
    it(`${label}: everyone on and off in every period, per-period spread ≤ one interval`, () => {
      const { state, now, periods } = simulate(cfg, players(n));
      const P = cfg.periodMinutes * MINUTE_MS;
      expect(periods).toHaveLength(cfg.periods);
      for (const minutes of periods) {
        const values = Object.values(minutes);
        for (const v of values) {
          expect(v).toBeGreaterThan(0);
          expect(v).toBeLessThan(P);
        }
        expect(spread(values)).toBeLessThanOrEqual(plannedIntervalNowMs(state) + 1);
      }
      const total = playedByAvailable(state, now).reduce((a, b) => a + b, 0);
      expect(total).toBe(cfg.onField * cfg.periods * P);
    });
  }
});

describe('the Loom Bandits default plan: 8 players, 5 on, 1 per sub, 2 × 15 min', () => {
  const squad = players(8);
  const cfg = config({
    rotationScope: 'period',
    periods: 2,
    periodMinutes: 15,
    onField: 5,
    swapSize: 1,
  });
  const P = 15 * MINUTE_MS;
  const fairShare = (5 * P) / 8; // 9:22.5

  it('plans a full rotation each half: 7 subs in play plus the break, about every 1:52', () => {
    expect(subsPerPeriod(cfg, 8)).toBe(8);
    expect(plannedIntervalMs(cfg, 8)).toBe(112_500);
  });
  it('gets all eight players on the field in every half', () => {
    const { periods } = simulate(cfg, squad);
    for (const minutes of periods) {
      expect(Object.keys(minutes)).toHaveLength(8);
      for (const v of Object.values(minutes)) expect(v).toBeGreaterThan(0);
    }
  });
  it('gives every player the same time in each half: 9:22 each', () => {
    const projection = projectPeriod(cfg, 8);
    expect(projection.minutesMs).toHaveLength(8);
    expect(projection.maxMs - projection.minMs).toBeLessThanOrEqual(1);
    expect(Math.abs(projection.minMs - fairShare)).toBeLessThanOrEqual(1);
    expect(projection.minutesMs.reduce((a, b) => a + b, 0)).toBe(5 * P);
  });
  it('over the whole game everyone ends within a second of each other', () => {
    const { state, now, periods } = simulate(cfg, squad);
    expect(spread(playedByAvailable(state, now))).toBeLessThanOrEqual(1000);
    for (const minutes of periods) expect(spread(Object.values(minutes))).toBeLessThanOrEqual(1);
  });
  it('bigger swaps mean fewer subs but a bigger gap between players', () => {
    const two = projectPeriod({ ...cfg, swapSize: 2 }, 8);
    expect(two.slots).toBe(4); // 3 in play, every 3:45
    expect(two.intervalMs).toBe(225_000);
    expect(two.maxMs - two.minMs).toBe(225_000);
    expect(two.minMs).toBe(450_000); // 7:30
    expect(two.maxMs).toBe(675_000); // 11:15

    const three = projectPeriod({ ...cfg, swapSize: 3 }, 8);
    expect(three.slots).toBe(3); // 2 in play, every 5:00
    expect(three.intervalMs).toBe(300_000);
    expect(three.maxMs - three.minMs).toBe(300_000);
    expect(three.minMs).toBe(300_000); // 5:00
    expect(three.maxMs).toBe(600_000); // 10:00
  });
  it('the projection agrees with a full simulation of the first half', () => {
    const projection = projectPeriod(cfg, 8);
    const { periods } = simulate(cfg, squad);
    const simulated = Object.values(periods[0]!).sort((a, b) => b - a);
    expect(simulated).toEqual(projection.minutesMs);
  });
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
    expect(nextOffQueue(state)).not.toContain('p1');
    expect(nextOnQueue(state)).not.toContain('p1');
    expect(totalPlayedMs(state, 'p1', now)).toBeGreaterThan(0);
    expect(totalPlayedMs(state, 'p1', now)).toBeLessThanOrEqual(12 * MINUTE_MS);
    expect(spread(playedByAvailable(state, now))).toBeLessThanOrEqual(fairnessBoundMs(state) + 1);
  });
  it('a late sub shortens the remaining stints; its cost lands on the players who were due on', () => {
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
        push({ type: 'SubMade', at: now, ...recommendedSwap(state) });
      }
      now = periodEnd;
      push({ type: 'PeriodEnded', at: now });
      if (p < cfg.periods) {
        push({ type: 'SubMade', at: now + 1000, ...recommendedSwap(state) });
        now += 60_000;
        push({ type: 'PeriodStarted', at: now });
      }
    }
    expect(state.phase).toBe('finished');
    // The three stints after the late sub were 3:50 instead of 4:00: the 40 s shared out.
    const subAts = events.filter((e) => e.type === 'SubMade').map((e) => e.at - T0);
    expect(subAts.slice(0, 4)).toEqual([280_000, 510_000, 740_000, 970_000]);
    // Who is not re-chosen by minutes, so the two who came on 40 s late keep the loss (and
    // the rest share the 40 s), and the spread grows by at most that. The coach settles it
    // with the order, or it evens out over later rotations.
    const late = spread(playedByAvailable(state, now));
    const tidy = spread(playedByAvailable(clean.state, clean.now));
    expect(late).toBeGreaterThan(tidy);
    expect(late).toBeLessThanOrEqual(tidy + 40_000 + 40_000 / 4 + 1);
  });
  it('undo restores the exact previous state', () => {
    const { events } = simulate(config(), players(9));
    const before = replay(events.slice(0, 10));
    const after = replay(events.slice(0, 11));
    expect(after).not.toEqual(before);
    expect(replay(events.slice(0, 11).slice(0, -1))).toEqual(before);
  });
});

describe('the rotation order', () => {
  const half = config({
    rotationScope: 'period',
    periods: 2,
    periodMinutes: 15,
    onField: 5,
    swapSize: 1,
  });
  const squad = players(8);
  function running() {
    let s = reduce(null, created(half, squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    return s;
  }
  /** Follow the countdown for `count` subs, letting `before` change the order first. */
  function playSubs(
    s: GameState,
    now: number,
    count: number,
    before: (i: number, s: GameState, now: number) => GameState = (_, s) => s,
  ) {
    const subs: Array<[PlayerId, PlayerId]> = [];
    for (let i = 0; i < count; i++) {
      now += subCountdownMs(s, now)!;
      s = before(i, s, now);
      const swap = recommendedSwap(s);
      subs.push([swap.off[0]!, swap.on[0]!]);
      s = reduce(s, { type: 'SubMade', at: now, ...swap });
    }
    return { s, now, subs };
  }

  it('before kick-off the columns read in roster order', () => {
    const s = reduce(null, created(half, squad));
    expect(nextOffQueue(s)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(nextOnQueue(s)).toEqual(['p6', 'p7', 'p8']);
  });
  it('LineupOrdered re-sorts the roster and so the queues', () => {
    let s = reduce(null, created(half, squad));
    s = reduce(s, {
      type: 'LineupOrdered',
      at: T0,
      order: ['p3', 'p1', 'p2', 'p4', 'p5', 'p8', 'p6', 'p7'],
    });
    expect(s.players.map((p) => p.id)).toEqual(['p3', 'p1', 'p2', 'p4', 'p5', 'p8', 'p6', 'p7']);
    expect(nextOffQueue(s)).toEqual(['p3', 'p1', 'p2', 'p4', 'p5']);
    expect(nextOnQueue(s)).toEqual(['p8', 'p6', 'p7']);
    expect(recommendedSwap(s)).toEqual({ off: ['p3'], on: ['p8'] });
  });
  it('the chosen order is the order of the first rotation', () => {
    let s = reduce(null, created(half, squad));
    s = reduce(s, {
      type: 'LineupOrdered',
      at: T0,
      order: ['p5', 'p4', 'p3', 'p2', 'p1', 'p8', 'p7', 'p6'],
    });
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    const { subs } = playSubs(s, T0, 3);
    expect(subs).toEqual([
      ['p5', 'p8'],
      ['p4', 'p7'],
      ['p3', 'p6'],
    ]);
  });
  it('ignores unknown ids, drops duplicates and keeps anyone left out at the end', () => {
    let s = reduce(null, created(half, squad));
    s = reduce(s, { type: 'LineupOrdered', at: T0, order: ['p7', 'ghost', 'p7', 'p2'] });
    expect(s.players.map((p) => p.id)).toEqual(['p7', 'p2', 'p1', 'p3', 'p4', 'p5', 'p6', 'p8']);
    expect(s.players).toHaveLength(8);
  });
  it('a sub rotates the order: off to the back of the sideline, on to the back of the field', () => {
    let s = running();
    s = reduce(s, { type: 'SubMade', at: T0 + 112_500, ...recommendedSwap(s) });
    expect(nextOffQueue(s)).toEqual(['p2', 'p3', 'p4', 'p5', 'p6']);
    expect(nextOnQueue(s)).toEqual(['p7', 'p8', 'p1']);
    expect(s.players.map((p) => p.id)).toEqual(['p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p1']);
    // A full half later the whole squad has rotated through and the order is intact.
    const { s: end, subs } = playSubs(s, T0 + 112_500, 6);
    expect(subs.map(([off]) => off)).toEqual(['p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    expect(subs.map(([, on]) => on)).toEqual(['p7', 'p8', 'p1', 'p2', 'p3', 'p4']);
    expect(nextOffQueue(end)).toEqual(['p8', 'p1', 'p2', 'p3', 'p4']);
    expect(nextOnQueue(end)).toEqual(['p5', 'p6', 'p7']);
  });
  it('reorderedLineup moves a player one place within her own column only', () => {
    const s = reduce(null, created(half, squad));
    // p3 earlier: swaps with p2 in the roster; the bench is untouched.
    expect(reorderedLineup(s, 'p3', -1)).toEqual(['p1', 'p3', 'p2', 'p4', 'p5', 'p6', 'p7', 'p8']);
    // p7 (bench, 2nd) later: swaps with p8, skipping nobody on the field.
    expect(reorderedLineup(s, 'p7', 1)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p8', 'p7']);
    // p5 later would have to leave the field column: not possible.
    expect(reorderedLineup(s, 'p5', 1)).toBeNull();
    expect(reorderedLineup(s, 'p1', -1)).toBeNull();
    expect(reorderedLineup(s, 'p6', -1)).toBeNull();
    expect(reorderedLineup(s, 'nobody', 1)).toBeNull();
  });
  it('a sequence of moves lands where the coach put it', () => {
    let s = reduce(null, created(half, squad));
    const move = (id: PlayerId, dir: -1 | 1) => {
      const order = reorderedLineup(s, id, dir);
      expect(order).not.toBeNull();
      s = reduce(s, { type: 'LineupOrdered', at: T0, order: order! });
    };
    move('p5', -1);
    move('p5', -1);
    move('p5', -1);
    move('p5', -1);
    move('p8', -1);
    expect(nextOffQueue(s)).toEqual(['p5', 'p1', 'p2', 'p3', 'p4']);
    expect(nextOnQueue(s)).toEqual(['p6', 'p8', 'p7']);
  });
  it('the order can be changed mid-game, and the change sticks', () => {
    let s = running();
    const now = T0 + 60_000;
    s = reduce(s, { type: 'LineupOrdered', at: now, order: reorderedLineup(s, 'p3', -1)! });
    expect(nextOffQueue(s)).toEqual(['p1', 'p3', 'p2', 'p4', 'p5']);
    // Minutes tick on; nothing moves until the next sub, which follows the new order.
    const { subs, s: later } = playSubs(s, now, 2);
    expect(subs).toEqual([
      ['p1', 'p6'],
      ['p3', 'p7'],
    ]);
    expect(nextOffQueue(later)).toEqual(['p2', 'p4', 'p5', 'p6', 'p7']);
    expect(nextOnQueue(later)).toEqual(['p8', 'p1', 'p3']);
  });
  it('promotedLineup puts a player at the front of her column and moves nobody else', () => {
    const s = running();
    expect(promotedLineup(s, 'p4')).toEqual(['p4', 'p1', 'p2', 'p3', 'p5', 'p6', 'p7', 'p8']);
    expect(promotedLineup(s, 'p8')).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p8', 'p6', 'p7']);
    expect(promotedLineup(s, 'p1')).toBeNull(); // already first off
    expect(promotedLineup(s, 'p6')).toBeNull(); // already first on
    expect(promotedLineup(s, 'nobody')).toBeNull();
    const out = reduce(s, { type: 'PlayerMoved', at: T0, id: 'p8', to: 'out' });
    expect(promotedLineup(out, 'p8')).toBeNull();
  });
  it('a mix-up changes the order once and the change sticks: nobody is pulled back by her minutes', () => {
    // Plan: p4 off / p1 on at 7:30. Instead p5 comes off and p2 (who came off at 3:45) goes
    // back on. From then on p2 is simply the last to come off, although she has more minutes
    // than p8, and the rotation carries on around her.
    const { s, now, subs } = playSubs(running(), T0, 7, (i, s, at) => {
      if (i !== 3) return s;
      s = reduce(s, { type: 'LineupOrdered', at, order: promotedLineup(s, 'p5')! });
      return reduce(s, { type: 'LineupOrdered', at, order: promotedLineup(s, 'p2')! });
    });
    expect(subs).toEqual([
      ['p1', 'p6'],
      ['p2', 'p7'],
      ['p3', 'p8'],
      ['p5', 'p2'], // the mix-up
      ['p4', 'p1'],
      ['p6', 'p3'],
      ['p7', 'p5'],
    ]);
    expect(nextOffQueue(s)).toEqual(['p8', 'p2', 'p1', 'p3', 'p5']);
    const end = T0 + 15 * MINUTE_MS;
    expect(now).toBeLessThan(end);
    const finished = reduce(s, { type: 'PeriodEnded', at: end });
    const minutes = Object.fromEntries(
      squad.map((p) => [p.id, periodPlayedMs(finished, p.id, end)]),
    );
    // The mix-up cost p1 a stint and gave p2 one; the app leaves that for the coach to settle.
    expect(minutes['p1']).toBe(450_000); // 7:30
    expect(minutes['p2']).toBe(675_000); // 11:15
    for (const id of ['p3', 'p4', 'p5', 'p6', 'p7', 'p8']) {
      expect(Math.abs(minutes[id]! - 562_500)).toBeLessThanOrEqual(1); // 9:22
    }
  });
});

describe("'Sub off next' and 'Sub on next': promoting a player in the order", () => {
  const half = config({
    rotationScope: 'period',
    periods: 2,
    periodMinutes: 15,
    onField: 5,
    swapSize: 1,
  });
  function running() {
    let s = reduce(null, created(half, players(8)));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    return s;
  }
  function promote(s: GameState, id: PlayerId, at: number): GameState {
    const order = promotedLineup(s, id);
    expect(order).not.toBeNull();
    return reduce(s, { type: 'LineupOrdered', at, order: order! });
  }
  it('the front of each column is the suggestion', () => {
    expect(recommendedSwap(running())).toEqual({ off: ['p1'], on: ['p6'] });
  });
  it('promoting a player replaces the suggestion on her side only', () => {
    let s = running();
    s = promote(s, 'p4', T0 + 60_000);
    expect(recommendedSwap(s)).toEqual({ off: ['p4'], on: ['p6'] });
    s = promote(s, 'p8', T0 + 60_000);
    expect(recommendedSwap(s)).toEqual({ off: ['p4'], on: ['p8'] });
    // She stays promoted until the sub, however long that takes.
    expect(nextOffQueue(s)).toEqual(['p4', 'p1', 'p2', 'p3', 'p5']);
    expect(nextOnQueue(s)).toEqual(['p8', 'p6', 'p7']);
  });
  it('promoting twice puts the later pick first; a bigger swap takes them both', () => {
    let s = running();
    s = promote(s, 'p4', T0 + 60_000);
    s = promote(s, 'p2', T0 + 60_000);
    expect(nextOffQueue(s)).toEqual(['p2', 'p4', 'p1', 'p3', 'p5']);
    expect(recommendedSwap(s)).toEqual({ off: ['p2'], on: ['p6'] });
    const two = reduce(s, {
      type: 'ConfigChanged',
      at: T0 + 60_000,
      config: { ...half, swapSize: 2 },
    });
    expect(recommendedSwap(two)).toEqual({ off: ['p2', 'p4'], on: ['p6', 'p7'] });
  });
  it('a promoted player still refills a short-handed field', () => {
    let s = running();
    s = reduce(s, { type: 'PlayerMoved', at: T0 + 30_000, id: 'p1', to: 'out' });
    s = promote(s, 'p5', T0 + 60_000);
    expect(recommendedSwap(s)).toEqual({ off: ['p5'], on: ['p6', 'p7'] });
  });
  it('a mix-up is absorbed by the rotation, not swapped straight back', () => {
    // The app wants p1 off / p6 on at 1:52 but p5 comes off instead. The order carries on
    // (p1, p2, p3 ...), p5 goes back on only after the fresh bench players, and nobody
    // is ever asked to swap straight back. The half still comes out exactly equal.
    let s = running();
    let now = T0;
    const subs: Array<[PlayerId, PlayerId]> = [];
    for (let i = 0; i < 7; i++) {
      now += subCountdownMs(s, now)!;
      if (i === 0) s = promote(s, 'p5', now);
      const swap = recommendedSwap(s);
      subs.push([swap.off[0]!, swap.on[0]!]);
      s = reduce(s, { type: 'SubMade', at: now, ...swap });
    }
    expect(subs).toEqual([
      ['p5', 'p6'],
      ['p1', 'p7'],
      ['p2', 'p8'],
      ['p3', 'p5'],
      ['p4', 'p1'],
      ['p6', 'p2'],
      ['p7', 'p3'],
    ]);
    for (let i = 1; i < subs.length; i++) {
      const [off, on] = subs[i]!;
      const [prevOff, prevOn] = subs[i - 1]!;
      expect(off).not.toBe(prevOn);
      expect(on).not.toBe(prevOff);
    }
    const end = T0 + 15 * MINUTE_MS;
    s = reduce(s, { type: 'PeriodEnded', at: end });
    const minutes = players(8).map((p) => periodPlayedMs(s, p.id, end));
    expect(spread(minutes)).toBeLessThanOrEqual(1);
  });
  it('a promoted sub is an ordinary sub: it anchors the plan and counts', () => {
    let s = running();
    const now = T0 + 60_000;
    s = promote(s, 'p4', now);
    s = reduce(s, { type: 'SubMade', at: now, ...recommendedSwap(s) });
    expect(s.location['p4']).toBe('bench');
    expect(s.location['p6']).toBe('field');
    expect(s.inPlaySubsThisPeriod).toBe(1);
    expect(subCountdownMs(s, now)).toBe(plannedIntervalNowMs(s));
    // p4 has just come off so she is last back on; p1 is still first off; p6 is last off.
    expect(nextOnQueue(s)).toEqual(['p7', 'p8', 'p4']);
    expect(nextOffQueue(s)).toEqual(['p1', 'p2', 'p3', 'p5', 'p6']);
  });
});

describe('a half cut short: period length corrections', () => {
  const half = config({
    rotationScope: 'period',
    periods: 2,
    periodMinutes: 15,
    onField: 5,
    swapSize: 1,
  });
  const squad = players(8);
  const P = 15 * MINUTE_MS;

  it('taking a minute off shortens the half, keeps the minutes and re-spreads the subs', () => {
    let s = reduce(null, created(half, squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    const now = T0 + 10_000;
    s = reduce(s, { type: 'PeriodAdjusted', at: now, deltaMs: -30_000 });
    s = reduce(s, { type: 'PeriodAdjusted', at: now, deltaMs: -30_000 });
    expect(periodLengthMs(s)).toBe(14 * MINUTE_MS);
    expect(periodRemainingMs(s, now)).toBe(14 * MINUTE_MS - 10_000);
    expect(periodElapsedMs(s, now)).toBe(10_000);
    expect(totalPlayedMs(s, 'p1', now)).toBe(10_000);
    expect(totalPlayedMs(s, 'p6', now)).toBe(0);
    expect(subsPerPeriodNow(s)).toBe(8);
    expect(plannedIntervalNowMs(s)).toBe(105_000); // 14:00 / 8 = 1:45
    expect(subCountdownMs(s, now)).toBe(105_000 - 10_000);
  });
  it('a 14-minute half still gives all eight players exactly the same time: 8:45', () => {
    let s = reduce(null, created(half, squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    let now = T0 + 5000;
    s = reduce(s, { type: 'PeriodAdjusted', at: now, deltaMs: -60_000 });
    const end = T0 + 14 * MINUTE_MS;
    for (;;) {
      const subAt = now + subCountdownMs(s, now)!;
      if (subAt >= end - 1) break;
      now = subAt;
      s = reduce(s, { type: 'SubMade', at: now, ...recommendedSwap(s) });
    }
    expect(s.inPlaySubsThisPeriod).toBe(7);
    s = reduce(s, { type: 'PeriodEnded', at: end });
    const minutes = squad.map((p) => periodPlayedMs(s, p.id, end));
    expect(spread(minutes)).toBeLessThanOrEqual(1);
    expect(Math.abs(minutes[0]! - (5 * 14 * MINUTE_MS) / 8)).toBeLessThanOrEqual(1);
    expect(minutes.reduce((a, b) => a + b, 0)).toBe(5 * 14 * MINUTE_MS);
  });
  it('shortening mid-period re-spreads only the subs still to come', () => {
    let s = reduce(null, created(half, squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    let now = T0;
    for (let i = 0; i < 2; i++) {
      now += subCountdownMs(s, now)!;
      s = reduce(s, { type: 'SubMade', at: now, ...recommendedSwap(s) });
    }
    expect(gameElapsedMs(s, now)).toBe(225_000); // second sub at 3:45
    s = reduce(s, { type: 'PeriodAdjusted', at: now, deltaMs: -60_000 });
    // 14:00 − 3:45 = 10:15 over the six stints left → 1:42.5 each.
    expect(subCountdownMs(s, now)).toBe(102_500);
    expect(totalPlayedMs(s, 'p3', now)).toBe(225_000);
  });
  it('adding time lengthens the half and stretches the stints', () => {
    let s = reduce(null, created(half, squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'PeriodAdjusted', at: T0 + 1000, deltaMs: 60_000 });
    expect(periodLengthMs(s)).toBe(16 * MINUTE_MS);
    expect(plannedIntervalNowMs(s)).toBe(2 * MINUTE_MS);
    expect(subCountdownMs(s, T0 + 1000)).toBe(2 * MINUTE_MS - 1000);
  });
  it('never shortens a period below the time already played, or below a minute', () => {
    let s = reduce(null, created(half, squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'PeriodAdjusted', at: T0 + 5 * MINUTE_MS, deltaMs: -20 * MINUTE_MS });
    expect(periodLengthMs(s)).toBe(5 * MINUTE_MS);
    expect(periodRemainingMs(s, T0 + 5 * MINUTE_MS)).toBe(0);
    let t = reduce(null, created(half, squad));
    t = reduce(t, { type: 'PeriodAdjusted', at: T0, deltaMs: -20 * MINUTE_MS });
    expect(periodLengthMs(t)).toBe(MINUTE_MS);
  });
  it('the adjustment is for this period only; the next one can be set at the break', () => {
    let s = reduce(null, created(half, squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'PeriodAdjusted', at: T0 + 1000, deltaMs: -60_000 });
    s = reduce(s, { type: 'PeriodEnded', at: T0 + 14 * MINUTE_MS });
    expect(periodLengthMs(s)).toBe(P);
    s = reduce(s, { type: 'PeriodAdjusted', at: T0 + 15 * MINUTE_MS, deltaMs: -30_000 });
    expect(periodLengthMs(s)).toBe(P - 30_000);
    const p2 = T0 + 16 * MINUTE_MS;
    s = reduce(s, { type: 'PeriodStarted', at: p2 });
    expect(periodLengthMs(s)).toBe(P - 30_000);
    expect(periodRemainingMs(s, p2 + 10_000)).toBe(P - 40_000);
    expect(plannedIntervalNowMs(s)).toBe(Math.round((P - 30_000) / 8));
  });
  it('can be set before kick-off and is ignored after full time', () => {
    let s = reduce(null, created(half, squad));
    s = reduce(s, { type: 'PeriodAdjusted', at: T0, deltaMs: -60_000 });
    expect(periodLengthMs(s)).toBe(14 * MINUTE_MS);
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    expect(subCountdownMs(s, T0)).toBe(105_000);
    s = reduce(s, { type: 'PeriodEnded', at: T0 + 14 * MINUTE_MS });
    s = reduce(s, { type: 'PeriodStarted', at: T0 + 15 * MINUTE_MS });
    s = reduce(s, { type: 'PeriodEnded', at: T0 + 30 * MINUTE_MS });
    expect(s.phase).toBe('finished');
    const after = reduce(s, { type: 'PeriodAdjusted', at: T0 + 31 * MINUTE_MS, deltaMs: -60_000 });
    expect(after).toBe(s);
  });
  it('the fair share follows the actual game length', () => {
    let s = reduce(null, created(half, squad));
    expect(targetPlayedMs(s)).toBe((5 * 2 * P) / 8);
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'PeriodAdjusted', at: T0 + 1000, deltaMs: -60_000 });
    const expected = (5 * (14 * MINUTE_MS + P)) / 8;
    expect(targetPlayedMs(s)).toBe(expected);
    s = reduce(s, { type: 'PeriodEnded', at: T0 + 14 * MINUTE_MS });
    expect(targetPlayedMs(s)).toBe(expected);
    s = reduce(s, { type: 'PeriodStarted', at: T0 + 15 * MINUTE_MS });
    s = reduce(s, { type: 'PeriodEnded', at: T0 + 30 * MINUTE_MS });
    expect(targetPlayedMs(s)).toBe(expected);
  });
  it('an event from an older build is skipped, not fatal', () => {
    const s = reduce(null, created(half, squad));
    const legacy = { type: 'ClockAdjusted', at: T0, deltaMs: 30_000 } as unknown as GameEvent;
    expect(reduce(s, legacy)).toBe(s);
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
