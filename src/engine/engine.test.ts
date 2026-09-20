import { describe, expect, it } from 'vitest';
import {
  MINUTE_MS,
  availableCount,
  currentStintMs,
  formatClock,
  gameElapsedMs,
  nextOffQueue,
  nextOnQueue,
  periodElapsedMs,
  recommendedSwap,
  reduce,
  replay,
  resolveIntervalMs,
  subCountdownMs,
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

/**
 * Plays a whole game the way a diligent coach would: kick off each period, make the
 * recommended swap whenever the countdown hits zero, swap again at every break.
 */
function simulate(
  cfg: GameConfig,
  squad: Player[],
  out: PlayerId[] = [],
  changes: ScheduledChange[] = [],
) {
  const events: GameEvent[] = [created(cfg, squad, out)];
  let state = reduce(null, events[0]!);
  let now = T0 + 5 * MINUTE_MS;
  const pending = [...changes].sort((a, b) => a.atGameMs - b.atGameMs);
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
    if (p < cfg.periods) {
      const swap = recommendedSwap(state, now);
      push({ type: 'SubMade', at: now + 1000, ...swap });
      now += 2 * MINUTE_MS; // break
    }
  }
  return { state, events, now };
}

function spread(state: GameState, now: number): { min: number; max: number } {
  const played = state.players
    .filter((p) => state.location[p.id] !== 'out')
    .map((p) => totalPlayedMs(state, p.id, now));
  return { min: Math.min(...played), max: Math.max(...played) };
}

/** Greedy min–max keeps everyone within one bench stint of each other. */
function fairnessBoundMs(state: GameState): number {
  const bench = availableCount(state) - state.config.onField;
  return Math.ceil(Math.max(1, bench) / state.config.swapSize) * state.intervalMs;
}

describe('resolveIntervalMs', () => {
  it('uses a fixed interval when the coach set one', () => {
    expect(resolveIntervalMs(config({ intervalSeconds: 240 }), 9)).toBe(240_000);
  });
  it('splits periods into ≤6 min chunks with enough subs for a full rotation', () => {
    expect(resolveIntervalMs(config(), 9)).toBe(5 * MINUTE_MS); // 4×10, 9 players, swap 2
    expect(resolveIntervalMs(config({ periods: 2, periodMinutes: 25, onField: 9 }), 11)).toBe(
      5 * MINUTE_MS,
    );
    expect(
      resolveIntervalMs(config({ periods: 2, periodMinutes: 30, onField: 11, swapSize: 3 }), 14),
    ).toBe(6 * MINUTE_MS);
    expect(resolveIntervalMs(config({ swapSize: 1 }), 10)).toBe(200_000); // 3 chunks of 3:20
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
  it('clock adjustments apply to the period and to everyone on the field', () => {
    let s = reduce(null, created(config(), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'ClockAdjusted', at: T0 + 60_000, deltaMs: 30_000 });
    expect(periodElapsedMs(s, T0 + 60_000)).toBe(90_000);
    expect(totalPlayedMs(s, 'p1', T0 + 60_000)).toBe(90_000);
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
    expect(subCountdownMs(s, T0 + 700_000)).toBe(s.intervalMs); // already swapped
    s = reduce(s, { type: 'PeriodStarted', at: T0 + 720_000 });
    expect(s.period).toBe(2);
    expect(gameElapsedMs(s, T0 + 720_000 + 30_000)).toBe(630_000);
    s = reduce(s, { type: 'PeriodEnded', at: T0 + 1_320_000 });
    expect(s.phase).toBe('finished');
    expect(subCountdownMs(s, T0 + 1_400_000)).toBeNull();
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
    // p8 and p9 have played 5 min, everyone else on the field 10 → they are last off.
    const offQ = nextOffQueue(s, later);
    expect(offQ.slice(-2).sort()).toEqual(['p8', 'p9']);
    // The two that came off have 5 min; they are the only ones on the bench.
    expect(nextOnQueue(s, later).sort()).toEqual(swap.off.slice().sort());
  });
  it('fills the field first when short-handed and never exceeds the bench', () => {
    const squad = players(9);
    let s = reduce(null, created(config(), squad));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    s = reduce(s, { type: 'PlayerMoved', at: T0 + 60_000, id: 'p1', to: 'out' }); // injury
    const swap = recommendedSwap(s, T0 + 60_000);
    expect(swap.on).toHaveLength(2); // only 2 on the bench: 1 to fill + 1 rotation
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
    // p1 (60 s) and p8 (0 s) both on the bench; p8 has been waiting longer.
    s = reduce(s, { type: 'PlayerMoved', at: T0 + 60_000, id: 'p9', to: 'out' });
    expect(currentStintMs(s, 'p9', T0 + 120_000)).toBe(60_000);
    expect(nextOnQueue(s, T0 + 120_000)[0]).toBe('p1'); // fewer minutes wins over stint
  });
});

describe('fairness over a whole game', () => {
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
      const { min, max } = spread(state, now);
      expect(max - min).toBeLessThanOrEqual(fairnessBoundMs(state) + 1);
      const total = state.players.reduce((acc, p) => acc + totalPlayedMs(state, p.id, now), 0);
      expect(total).toBe(cfg.onField * cfg.periods * cfg.periodMinutes * MINUTE_MS);
      const target = (cfg.onField * cfg.periods * cfg.periodMinutes * MINUTE_MS) / n;
      expect(min).toBeLessThanOrEqual(target);
      expect(max).toBeGreaterThanOrEqual(target);
    });
  }
  it('whole-bench swaps end within a single interval', () => {
    const cfg = config({ onField: 6, swapSize: 3 });
    const { state, now } = simulate(cfg, players(9));
    const { min, max } = spread(state, now);
    expect(max - min).toBeLessThanOrEqual(state.intervalMs + 1);
  });
});

describe('mid-game changes', () => {
  it('a late arriver is brought on first and does not overtake the others', () => {
    const cfg = config();
    const squad = players(9);
    const { state, now } = simulate(
      cfg,
      squad,
      ['p9'],
      [{ atGameMs: 20 * MINUTE_MS, id: 'p9', to: 'bench' }],
    );
    const late = totalPlayedMs(state, 'p9', now);
    const others = squad.filter((p) => p.id !== 'p9').map((p) => totalPlayedMs(state, p.id, now));
    expect(late).toBeGreaterThan(0);
    expect(late).toBeLessThanOrEqual(Math.max(...others));
    // They came on at the very next substitution after arriving.
    expect(state.clocks['p9']!.stints).toBeGreaterThanOrEqual(1);
  });
  it('an injured player leaves the queues and keeps their minutes', () => {
    const cfg = config();
    const { state, now } = simulate(
      cfg,
      players(9),
      [],
      [{ atGameMs: 12 * MINUTE_MS, id: 'p1', to: 'out' }],
    );
    expect(state.location['p1']).toBe('out');
    expect(nextOffQueue(state, now)).not.toContain('p1');
    expect(nextOnQueue(state, now)).not.toContain('p1');
    expect(totalPlayedMs(state, 'p1', now)).toBeGreaterThan(0);
    expect(totalPlayedMs(state, 'p1', now)).toBeLessThanOrEqual(12 * MINUTE_MS);
    const remaining = state.players.filter((p) => p.id !== 'p1');
    const played = remaining.map((p) => totalPlayedMs(state, p.id, now));
    expect(Math.max(...played) - Math.min(...played)).toBeLessThanOrEqual(
      fairnessBoundMs(state) + 1,
    );
  });
  it('undo restores the exact previous state', () => {
    const cfg = config();
    const { events } = simulate(cfg, players(9));
    const before = replay(events.slice(0, 10));
    const after = replay(events.slice(0, 11));
    expect(after).not.toEqual(before);
    expect(replay(events.slice(0, 11).slice(0, -1))).toEqual(before);
  });
  it('config changes mid-game re-resolve the interval', () => {
    let s = reduce(null, created(config(), players(9)));
    s = reduce(s, { type: 'PeriodStarted', at: T0 });
    expect(s.intervalMs).toBe(5 * MINUTE_MS);
    s = reduce(s, {
      type: 'ConfigChanged',
      at: T0 + 1000,
      config: config({ intervalSeconds: 180 }),
    });
    expect(s.intervalMs).toBe(180_000);
    expect(subCountdownMs(s, T0 + 60_000)).toBe(120_000);
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
    for (let i = 1; i < rows.length; i++)
      expect(rows[i - 1]!.playedMs).toBeGreaterThanOrEqual(rows[i]!.playedMs);
    expect(rows.every((r) => r.stints >= 1)).toBe(true);
  });
});
