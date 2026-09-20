// Read-only views over GameState at a given wall-clock instant. Nothing here mutates.
import type { GameState, Location, PlayerId } from './types';
import { gameElapsedMs } from './reducer';
import { MINUTE_MS, totalGameMs } from './schedule';

export { gameElapsedMs };

export function periodLengthMs(state: GameState): number {
  return state.config.periodMinutes * MINUTE_MS;
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

export function totalPlayedMs(state: GameState, id: PlayerId, now: number): number {
  const clock = state.clocks[id];
  if (!clock) return 0;
  const running =
    state.runningSince !== null && state.location[id] === 'field'
      ? Math.max(0, now - state.runningSince)
      : 0;
  return clock.playedMs + running;
}

/** How long the player has been where they are now, in game-clock ms. */
export function currentStintMs(state: GameState, id: PlayerId, now: number): number {
  const clock = state.clocks[id];
  if (!clock) return 0;
  return Math.max(0, gameElapsedMs(state, now) - clock.stintStartGameMs);
}

/** Ms until the next substitution is due; negative when overdue; null before kick-off. */
export function subCountdownMs(state: GameState, now: number): number | null {
  if (state.phase === 'pre' || state.phase === 'finished') return null;
  if (state.phase === 'break') {
    // A swap at the break is free: due until the coach makes one.
    return state.subAnchorGameMs < state.completedPeriodsMs ? 0 : state.intervalMs;
  }
  return state.subAnchorGameMs + state.intervalMs - gameElapsedMs(state, now);
}

export function playersAt(state: GameState, where: Location): PlayerId[] {
  return state.players.filter((p) => state.location[p.id] === where).map((p) => p.id);
}

export function availableCount(state: GameState): number {
  return state.players.filter((p) => state.location[p.id] !== 'out').length;
}

/** The fair share of field time each available player should end the game with. */
export function targetPlayedMs(state: GameState): number {
  const n = availableCount(state);
  if (n === 0) return 0;
  return (Math.min(state.config.onField, n) * totalGameMs(state.config)) / n;
}

/** On-field players, most-played first; ties broken by longest current stint. */
export function nextOffQueue(state: GameState, now: number): PlayerId[] {
  return playersAt(state, 'field').sort((a, b) => {
    const d = totalPlayedMs(state, b, now) - totalPlayedMs(state, a, now);
    return d !== 0 ? d : currentStintMs(state, b, now) - currentStintMs(state, a, now);
  });
}

/** Sideline players, least-played first; ties broken by longest time on the bench. */
export function nextOnQueue(state: GameState, now: number): PlayerId[] {
  return playersAt(state, 'bench').sort((a, b) => {
    const d = totalPlayedMs(state, a, now) - totalPlayedMs(state, b, now);
    return d !== 0 ? d : currentStintMs(state, b, now) - currentStintMs(state, a, now);
  });
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
  let offCount = rotate;
  let onCount = rotate;
  if (deficit > 0) onCount = Math.min(onQ.length, rotate + deficit);
  if (deficit < 0) offCount = Math.min(offQ.length, rotate - deficit);
  // Never bring on more than the bench can supply or take off more than are on.
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
    .map((p) => `${p.name}: ${formatClock(p.playedMs)} (${p.stints} ${p.stints === 1 ? 'stint' : 'stints'})`);
  return [`${state.config.teamName} — playing time`, ...lines].join('\n');
}
