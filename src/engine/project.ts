// Plays one period on paper with the engine's own recommendations, so the settings screen
// (and the tests) can show what a configuration actually does to everyone's minutes.
import type { GameConfig, Location, Player, PlayerId } from './types';
import { reduce } from './reducer';
import { nextSubDueGameMs, periodPlayedMs, recommendedSwap } from './derive';
import { periodMs, plannedIntervalMs, subsPerPeriod } from './schedule';

export interface PeriodProjection {
  /** Substitution slots in the period, the last being the swap at the break. */
  slots: number;
  /** Substitutions made while the clock runs. */
  inPlaySubs: number;
  intervalMs: number;
  /** Least and most any player is on the field during the period. */
  minMs: number;
  maxMs: number;
  /** players_on_field × period / available: what everyone would get if it were perfectly even. */
  targetMs: number;
  /** Per-player minutes, most first. */
  minutesMs: number[];
}

/** Simulate one period from a fresh line-up, subbing exactly when the plan says. */
export function projectPeriod(config: GameConfig, available: number): PeriodProjection {
  const P = periodMs(config);
  const slots = subsPerPeriod(config, available);
  const onField = Math.min(config.onField, available);
  const base = {
    slots,
    inPlaySubs: slots - 1,
    intervalMs: plannedIntervalMs(config, available),
    targetMs: available > 0 ? (onField * P) / available : 0,
  };
  if (available === 0) return { ...base, minMs: 0, maxMs: 0, minutesMs: [] };

  const players: Player[] = Array.from({ length: available }, (_, i) => ({
    id: `p${i + 1}`,
    name: `p${i + 1}`,
  }));
  const location: Record<PlayerId, Location> = {};
  players.forEach((p, i) => {
    location[p.id] = i < onField ? 'field' : 'bench';
  });
  // Wall clock starts at 0 and never pauses, so game-clock ms equal wall-clock ms.
  let state = reduce(null, { type: 'GameCreated', at: 0, config, players, location });
  state = reduce(state, { type: 'PeriodStarted', at: 0 });
  for (let guard = 0; guard < 500; guard++) {
    const due = nextSubDueGameMs(state);
    if (due === null || due >= P - 1) break;
    state = reduce(state, { type: 'SubMade', at: due, ...recommendedSwap(state, due) });
  }
  state = reduce(state, { type: 'PeriodEnded', at: P });
  const minutesMs = players.map((p) => periodPlayedMs(state, p.id, P)).sort((a, b) => b - a);
  return {
    ...base,
    minMs: Math.min(...minutesMs),
    maxMs: Math.max(...minutesMs),
    minutesMs,
  };
}
