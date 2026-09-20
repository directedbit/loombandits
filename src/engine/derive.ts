// Read-only views over GameState at a given wall-clock instant. Nothing here mutates.
import type { GameState, Location, PlayerId } from './types';
import { gameElapsedMs } from './reducer';
import {
  effectiveSwapSize,
  periodMs,
  plannedIntervalMs,
  subsPerPeriod,
  totalGameMs,
} from './schedule';

export { gameElapsedMs };

export function periodLengthMs(state: GameState): number {
  return periodMs(state.config);
}

export function periodElapsedMs(state: GameState, now: number): number {
  const running = state.runningSince === null ? 0 : Math.max(0, now - state.runningSince);
  return state.periodElapsedMs + running;
}

/** Time left in the current period. Negative once the period has run over. */
export function periodRemainingMs(state: GameState, now: number): number {
  return periodLengthMs(state) - periodElapsedMs(state, now);
}

/** Scheduled game time not yet played (ignores overtime). */
export function gameRemainingMs(state: GameState, now: number): number {
  return Math.max(0, totalGameMs(state.config) - gameElapsedMs(state, now));
}

function runningMs(state: GameState, id: PlayerId, now: number): number {
  return state.runningSince !== null && state.location[id] === 'field'
    ? Math.max(0, now - state.runningSince)
    : 0;
}

export function totalPlayedMs(state: GameState, id: PlayerId, now: number): number {
  const clock = state.clocks[id];
  return clock ? clock.playedMs + runningMs(state, id, now) : 0;
}

export function periodPlayedMs(state: GameState, id: PlayerId, now: number): number {
  const clock = state.clocks[id];
  return clock ? clock.periodPlayedMs + runningMs(state, id, now) : 0;
}

/** The minutes fairness is judged on: this period's in period scope, the game's otherwise. */
export function scopePlayedMs(state: GameState, id: PlayerId, now: number): number {
  return state.config.rotationScope === 'period'
    ? periodPlayedMs(state, id, now)
    : totalPlayedMs(state, id, now);
}

/** How long the player has been where they are now, in game-clock ms. */
export function currentStintMs(state: GameState, id: PlayerId, now: number): number {
  const clock = state.clocks[id];
  if (!clock) return 0;
  return Math.max(0, gameElapsedMs(state, now) - clock.stintStartGameMs);
}

export function playersAt(state: GameState, where: Location): PlayerId[] {
  return state.players.filter((p) => state.location[p.id] === where).map((p) => p.id);
}

export function availableCount(state: GameState): number {
  return state.players.filter((p) => state.location[p.id] !== 'out').length;
}

/** Substitution slots per period for the players available right now. */
export function subsPerPeriodNow(state: GameState): number {
  return subsPerPeriod(state.config, availableCount(state));
}

/** Time between subs when nothing goes wrong, for the players available right now. */
export function plannedIntervalNowMs(state: GameState): number {
  return plannedIntervalMs(state.config, availableCount(state));
}

/**
 * Game-clock ms at which the next substitution is due.
 *
 * Behind plan (a late sub): the subs still planned for this period are spread evenly over
 * the time left, so stints get shorter and lost time is shared out. Ahead of plan (early or
 * extra subs): a stint is never stretched beyond the planned interval, so extra subs simply
 * continue the cadence; the planned count is a minimum, not a cap. A last stint shorter than
 * half an interval is folded into the break. Null before kick-off and after full time.
 */
export function nextSubDueGameMs(state: GameState): number | null {
  if (state.phase === 'pre' || state.phase === 'finished') return null;
  const P = periodLengthMs(state);
  const interval = plannedIntervalNowMs(state);
  if (state.phase === 'break') {
    // A swap at the break is free: due until the coach makes one, then the first stint of
    // the next period.
    const swapped = state.subAnchorGameMs >= state.completedPeriodsMs;
    return swapped ? state.completedPeriodsMs + interval : state.completedPeriodsMs;
  }
  const end = state.periodStartGameMs + P;
  const anchor = state.subAnchorGameMs;
  const remainingPlanned = Math.max(0, subsPerPeriodNow(state) - 1 - state.inPlaySubsThisPeriod);
  const respread = remainingPlanned > 0 ? (end - anchor) / (remainingPlanned + 1) : interval;
  const due = Math.round(anchor + Math.min(interval, respread));
  return end - due < interval / 2 ? end : due;
}

/** Ms until the next substitution is due; negative when overdue; null before kick-off. */
export function subCountdownMs(state: GameState, now: number): number | null {
  const due = nextSubDueGameMs(state);
  return due === null ? null : due - gameElapsedMs(state, now);
}

/** The fair share of field time each available player should end the game with. */
export function targetPlayedMs(state: GameState): number {
  const n = availableCount(state);
  if (n === 0) return 0;
  return (Math.min(state.config.onField, n) * totalGameMs(state.config)) / n;
}

/** Greedy min–max keeps everyone within one bench stint: this many ms. */
export function fairnessBoundMs(state: GameState): number {
  const n = availableCount(state);
  const onField = Math.min(state.config.onField, n);
  const bench = n - onField;
  const swap = effectiveSwapSize(state.config, n);
  return Math.ceil(Math.max(1, bench) / swap) * plannedIntervalNowMs(state);
}

/** On-field players, most-played first (scope minutes, then game minutes, then stint). */
export function nextOffQueue(state: GameState, now: number): PlayerId[] {
  return playersAt(state, 'field').sort(
    (a, b) =>
      scopePlayedMs(state, b, now) - scopePlayedMs(state, a, now) ||
      totalPlayedMs(state, b, now) - totalPlayedMs(state, a, now) ||
      currentStintMs(state, b, now) - currentStintMs(state, a, now),
  );
}

/** Sideline players, least-played first; ties broken by longest time on the bench. */
export function nextOnQueue(state: GameState, now: number): PlayerId[] {
  return playersAt(state, 'bench').sort(
    (a, b) =>
      scopePlayedMs(state, a, now) - scopePlayedMs(state, b, now) ||
      totalPlayedMs(state, a, now) - totalPlayedMs(state, b, now) ||
      currentStintMs(state, b, now) - currentStintMs(state, a, now),
  );
}

export interface Swap {
  off: PlayerId[];
  on: PlayerId[];
}

/**
 * The swap the engine recommends right now. Corrects the field count first (injuries,
 * manual moves), then rotates `swapSize` players if the bench allows it.
 */
export function recommendedSwap(state: GameState, now: number): Swap {
  const offQ = nextOffQueue(state, now);
  const onQ = nextOnQueue(state, now);
  const deficit = state.config.onField - offQ.length; // >0 short-handed, <0 too many
  const rotate = Math.min(state.config.swapSize, onQ.length, offQ.length);
  let onCount = Math.min(onQ.length, rotate + Math.max(0, deficit));
  let offCount = Math.min(offQ.length, rotate + Math.max(0, -deficit));
  // Leave the field as close to full as the bench allows after the swap.
  if (deficit > 0) offCount = Math.max(0, Math.min(offCount, onCount - deficit));
  if (deficit < 0) onCount = Math.max(0, Math.min(onCount, offCount + deficit));
  return { off: offQ.slice(0, offCount), on: onQ.slice(0, onCount) };
}

export interface PlayerSummary {
  id: PlayerId;
  name: string;
  location: Location;
  playedMs: number;
  stints: number;
}

export function summary(state: GameState, now: number): PlayerSummary[] {
  return state.players
    .map((p) => ({
      id: p.id,
      name: p.name,
      location: state.location[p.id] ?? 'out',
      playedMs: totalPlayedMs(state, p.id, now),
      stints: state.clocks[p.id]?.stints ?? 0,
    }))
    .sort((a, b) => b.playedMs - a.playedMs);
}

/** mm:ss, with a leading "+" when negative (overtime / overdue). */
export function formatClock(ms: number): string {
  const sign = ms < 0 ? '+' : '';
  const total = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${sign}${m}:${s.toString().padStart(2, '0')}`;
}

export function summaryText(state: GameState, now: number): string {
  const lines = summary(state, now)
    .filter((p) => p.location !== 'out' || p.playedMs > 0)
    .map(
      (p) =>
        `${p.name}: ${formatClock(p.playedMs)} (${p.stints} ${p.stints === 1 ? 'stint' : 'stints'})`,
    );
  return [`${state.config.teamName} — playing time`, ...lines].join('\n');
}
