import type { GameConfig } from './types';

export const MINUTE_MS = 60_000;
/** Auto mode (whole-game scope) never proposes a stint longer than this. */
export const MAX_AUTO_INTERVAL_MS = 6 * MINUTE_MS;
/** Below this the settings screen warns that subs will be very frequent. */
export const FREQUENT_SUB_WARNING_MS = 2 * MINUTE_MS;

export function periodMs(config: GameConfig): number {
  return config.periodMinutes * MINUTE_MS;
}

/** Total scheduled game time. */
export function totalGameMs(config: GameConfig): number {
  return config.periods * periodMs(config);
}

/** Players actually moved per sub: the bench (or field) may be smaller than the setting. */
export function effectiveSwapSize(config: GameConfig, available: number): number {
  const onField = Math.min(config.onField, available);
  const bench = available - onField;
  return Math.max(1, Math.min(config.swapSize, bench, onField));
}

/**
 * Substitution slots per period. The last slot is the free swap at the break, so there are
 * `subsPerPeriod - 1` in-play substitutions.
 *
 * - Fixed interval: as many slots as fit the period.
 * - Period scope: every starter comes off during the period (and so every bench player
 *   comes on), plus the swap at the break.
 * - Game scope: chunks of at most six minutes, with enough subs over the game for every
 *   player to have come off once.
 */
export function subsPerPeriod(config: GameConfig, available: number): number {
  const P = periodMs(config);
  const onField = Math.min(config.onField, available);
  const bench = available - onField;
  if (bench <= 0 || onField <= 0) return 1;
  if (config.intervalSeconds !== null && config.intervalSeconds > 0) {
    return Math.max(1, Math.round(P / (config.intervalSeconds * 1000)));
  }
  const swap = effectiveSwapSize(config, available);
  if (config.rotationScope === 'period') {
    return Math.ceil(onField / swap) + 1;
  }
  const rotations = Math.ceil(available / swap);
  return Math.max(
    1,
    Math.ceil(rotations / Math.max(1, config.periods)),
    Math.ceil(P / MAX_AUTO_INTERVAL_MS),
  );
}

/** Time between subs when nothing goes wrong. */
export function plannedIntervalMs(config: GameConfig, available: number): number {
  return Math.round(periodMs(config) / subsPerPeriod(config, available));
}

/** Older name for plannedIntervalMs. */
export const resolveIntervalMs = plannedIntervalMs;
