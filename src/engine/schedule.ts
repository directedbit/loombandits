import type { GameConfig } from './types';

export const MINUTE_MS = 60_000;
/** Auto mode never proposes an interval longer than this. */
export const MAX_AUTO_INTERVAL_MS = 6 * MINUTE_MS;

/**
 * How often to substitute. If the coach fixed an interval, use it. Otherwise split each
 * period into equal chunks of at most six minutes, with at least enough subs over the
 * game for every available player to have come off once.
 */
export function resolveIntervalMs(config: GameConfig, availablePlayers: number): number {
  if (config.intervalSeconds !== null && config.intervalSeconds > 0) {
    return config.intervalSeconds * 1000;
  }
  const periodMs = config.periodMinutes * MINUTE_MS;
  const swap = Math.max(1, config.swapSize);
  const rotations = Math.max(1, Math.ceil(availablePlayers / swap));
  const chunksPerPeriod = Math.max(
    1,
    Math.ceil(rotations / Math.max(1, config.periods)),
    Math.ceil(periodMs / MAX_AUTO_INTERVAL_MS),
  );
  // Round to a whole number of seconds so the countdown reads cleanly.
  return Math.max(1000, Math.round(periodMs / chunksPerPeriod / 1000) * 1000);
}

/** Total scheduled game time. */
export function totalGameMs(config: GameConfig): number {
  return config.periods * config.periodMinutes * MINUTE_MS;
}
