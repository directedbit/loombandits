// Domain types for the substitution engine. Pure data, no behaviour.

export type PlayerId = string;

export interface Player {
  id: PlayerId;
  name: string;
}

/** Where a player is right now: on the field, on the sideline, or not playing today. */
export type Location = 'field' | 'bench' | 'out';

/** Judge fairness over the whole game, or afresh in every period. */
export type RotationScope = 'game' | 'period';

export interface GameConfig {
  teamName: string;
  /** Number of playing periods (halves = 2, quarters = 4). */
  periods: number;
  /** Length of each period in minutes. */
  periodMinutes: number;
  /** Players on the field at once. */
  onField: number;
  /** Players swapped per substitution. */
  swapSize: number;
  /** Fixed substitution interval in seconds, or null to let the engine choose. */
  intervalSeconds: number | null;
  /** 'period': everyone gets field and bench time in every period. */
  rotationScope: RotationScope;
}

export type Phase = 'pre' | 'running' | 'paused' | 'break' | 'finished';

/** Everything that can happen in a game. `at` is wall-clock ms (Date.now()). */
export type GameEvent =
  | {
      type: 'GameCreated';
      at: number;
      config: GameConfig;
      players: Player[];
      location: Record<PlayerId, Location>;
    }
  | { type: 'PeriodStarted'; at: number }
  | { type: 'Paused'; at: number }
  | { type: 'Resumed'; at: number }
  | { type: 'PeriodEnded'; at: number }
  | { type: 'SubMade'; at: number; off: PlayerId[]; on: PlayerId[] }
  | { type: 'PlayerMoved'; at: number; id: PlayerId; to: Location }
  | { type: 'ClockAdjusted'; at: number; deltaMs: number }
  | { type: 'ConfigChanged'; at: number; config: GameConfig };

export interface PlayerClock {
  /** Settled playing time this game in ms (excludes the currently running segment). */
  playedMs: number;
  /** Settled playing time in the current period. Reset when a period starts. */
  periodPlayedMs: number;
  /** Number of spells on the field. */
  stints: number;
  /** Game-clock ms at which the player last changed location. */
  stintStartGameMs: number;
}

export interface GameState {
  config: GameConfig;
  players: Player[];
  location: Record<PlayerId, Location>;
  clocks: Record<PlayerId, PlayerClock>;
  phase: Phase;
  /** 1-based current period; 0 before kick-off. */
  period: number;
  /** Game-clock ms accumulated by completed periods. */
  completedPeriodsMs: number;
  /** Game-clock ms at which the current period started. */
  periodStartGameMs: number;
  /** Settled ms elapsed in the current period. */
  periodElapsedMs: number;
  /** Wall-clock ms when the clock last started running, or null when stopped. */
  runningSince: number | null;
  /** Game-clock ms of the last substitution or period start: the plan is re-spread from here. */
  subAnchorGameMs: number;
  /** Substitutions made while the clock was live in this period. */
  inPlaySubsThisPeriod: number;
}
