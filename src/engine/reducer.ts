import type { GameEvent, GameState, Location, PlayerClock, PlayerId } from './types';
import { resolveIntervalMs } from './schedule';

/** Game-clock ms at a given wall-clock instant. */
export function gameElapsedMs(state: GameState, now: number): number {
  const running = state.runningSince === null ? 0 : Math.max(0, now - state.runningSince);
  return state.completedPeriodsMs + state.periodElapsedMs + running;
}

function availableCount(state: GameState): number {
  return state.players.filter((p) => state.location[p.id] !== 'out').length;
}

/**
 * Bank the currently running segment (if any) into the settled counters and restart the
 * segment at `at`. Called before every event that changes who is on the field or whether
 * the clock is running.
 */
function settle(state: GameState, at: number): GameState {
  if (state.runningSince === null) return state;
  const delta = Math.max(0, at - state.runningSince);
  if (delta === 0) return state;
  const clocks: Record<PlayerId, PlayerClock> = { ...state.clocks };
  for (const p of state.players) {
    if (state.location[p.id] === 'field') {
      const c = clocks[p.id] ?? zeroClock();
      clocks[p.id] = { ...c, playedMs: c.playedMs + delta };
    }
  }
  return { ...state, clocks, periodElapsedMs: state.periodElapsedMs + delta, runningSince: at };
}

function zeroClock(): PlayerClock {
  return { playedMs: 0, stints: 0, stintStartGameMs: 0 };
}

function moveOne(state: GameState, id: PlayerId, to: Location, gameMs: number): GameState {
  const from = state.location[id];
  if (from === undefined || from === to) return state;
  const clock = state.clocks[id] ?? zeroClock();
  const enteringField = to === 'field' && state.phase !== 'pre';
  return {
    ...state,
    location: { ...state.location, [id]: to },
    clocks: {
      ...state.clocks,
      [id]: {
        ...clock,
        stints: enteringField ? clock.stints + 1 : clock.stints,
        stintStartGameMs: gameMs,
      },
    },
  };
}

function anchor(state: GameState, gameMs: number): GameState {
  return {
    ...state,
    subAnchorGameMs: gameMs,
    intervalMs: resolveIntervalMs(state.config, availableCount(state)),
  };
}

/** The only way state changes. Pure: same inputs, same output. */
export function reduce(state: GameState | null, event: GameEvent): GameState {
  if (event.type === 'GameCreated') {
    const clocks: Record<PlayerId, PlayerClock> = {};
    const location: Record<PlayerId, Location> = {};
    for (const p of event.players) {
      clocks[p.id] = zeroClock();
      location[p.id] = event.location[p.id] ?? 'bench';
    }
    const fresh: GameState = {
      config: event.config,
      players: event.players,
      location,
      clocks,
      phase: 'pre',
      period: 0,
      completedPeriodsMs: 0,
      periodElapsedMs: 0,
      runningSince: null,
      subAnchorGameMs: 0,
      intervalMs: 0,
    };
    return anchor(fresh, 0);
  }
  if (state === null) {
    throw new Error(`Cannot apply ${event.type} before GameCreated`);
  }

  switch (event.type) {
    case 'PeriodStarted': {
      if (state.phase !== 'pre' && state.phase !== 'break') return state;
      let next: GameState = {
        ...state,
        phase: 'running',
        period: state.period + 1,
        periodElapsedMs: 0,
        runningSince: event.at,
      };
      const gameMs = next.completedPeriodsMs;
      if (next.period === 1) {
        const clocks = { ...next.clocks };
        for (const p of next.players) {
          const c = clocks[p.id] ?? zeroClock();
          clocks[p.id] = {
            ...c,
            stints: next.location[p.id] === 'field' ? 1 : 0,
            stintStartGameMs: 0,
          };
        }
        next = { ...next, clocks };
      }
      return anchor(next, gameMs);
    }
    case 'Paused': {
      if (state.phase !== 'running') return state;
      return { ...settle(state, event.at), runningSince: null, phase: 'paused' };
    }
    case 'Resumed': {
      if (state.phase !== 'paused') return state;
      return { ...state, runningSince: event.at, phase: 'running' };
    }
    case 'PeriodEnded': {
      if (state.phase !== 'running' && state.phase !== 'paused') return state;
      const settled = settle(state, event.at);
      const finished = settled.period >= settled.config.periods;
      return {
        ...settled,
        completedPeriodsMs: settled.completedPeriodsMs + settled.periodElapsedMs,
        periodElapsedMs: 0,
        runningSince: null,
        phase: finished ? 'finished' : 'break',
      };
    }
    case 'SubMade': {
      if (state.phase === 'finished') return state;
      let next = settle(state, event.at);
      const gameMs = gameElapsedMs(next, event.at);
      for (const id of event.off) next = moveOne(next, id, 'bench', gameMs);
      for (const id of event.on) next = moveOne(next, id, 'field', gameMs);
      return state.phase === 'pre' ? next : anchor(next, gameMs);
    }
    case 'PlayerMoved': {
      const next = settle(state, event.at);
      return moveOne(next, event.id, event.to, gameElapsedMs(next, event.at));
    }
    case 'ClockAdjusted': {
      const next = settle(state, event.at);
      const elapsed = Math.max(0, next.periodElapsedMs + event.deltaMs);
      const applied = elapsed - next.periodElapsedMs;
      const clocks = { ...next.clocks };
      for (const p of next.players) {
        if (next.location[p.id] === 'field') {
          const c = clocks[p.id] ?? zeroClock();
          clocks[p.id] = { ...c, playedMs: Math.max(0, c.playedMs + applied) };
        }
      }
      return { ...next, clocks, periodElapsedMs: elapsed };
    }
    case 'ConfigChanged': {
      const next = { ...state, config: event.config };
      return anchor(next, next.subAnchorGameMs);
    }
  }
}

/** Rebuild state from a full event log. Empty log → null (no game). */
export function replay(events: readonly GameEvent[]): GameState | null {
  let state: GameState | null = null;
  for (const e of events) state = reduce(state, e);
  return state;
}
