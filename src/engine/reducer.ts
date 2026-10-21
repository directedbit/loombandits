import type {
  GameConfig,
  GameEvent,
  GameState,
  Location,
  Player,
  PlayerClock,
  PlayerId,
} from './types';
import { MINUTE_MS, periodMs } from './schedule';

/** Game-clock ms at a given wall-clock instant. */
export function gameElapsedMs(state: GameState, now: number): number {
  const running = state.runningSince === null ? 0 : Math.max(0, now - state.runningSince);
  return state.completedPeriodsMs + state.periodElapsedMs + running;
}

/** Fill in fields that older saved games (or callers) may not have. */
export function normalizeConfig(config: GameConfig): GameConfig {
  return {
    ...config,
    intervalSeconds: config.intervalSeconds ?? null,
    rotationScope: config.rotationScope ?? 'game',
  };
}

function zeroClock(): PlayerClock {
  return { playedMs: 0, periodPlayedMs: 0, stints: 0, stintStartGameMs: 0 };
}

function clockOf(state: GameState, id: PlayerId): PlayerClock {
  return { ...zeroClock(), ...state.clocks[id] };
}

/** Add `delta` ms of playing time to everyone on the field. */
function creditField(state: GameState, delta: number): Record<PlayerId, PlayerClock> {
  const clocks: Record<PlayerId, PlayerClock> = { ...state.clocks };
  for (const p of state.players) {
    if (state.location[p.id] === 'field') {
      const c = clockOf(state, p.id);
      clocks[p.id] = {
        ...c,
        playedMs: Math.max(0, c.playedMs + delta),
        periodPlayedMs: Math.max(0, c.periodPlayedMs + delta),
      };
    }
  }
  return clocks;
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
  return {
    ...state,
    clocks: creditField(state, delta),
    periodElapsedMs: state.periodElapsedMs + delta,
    runningSince: at,
  };
}

function moveOne(state: GameState, id: PlayerId, to: Location, gameMs: number): GameState {
  const from = state.location[id];
  if (from === undefined || from === to) return state;
  const clock = clockOf(state, id);
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

interface Move {
  id: PlayerId;
  from: Location | undefined;
  to: Location;
}

/**
 * The rotation order after `moves` (already applied to `state.location`). Whoever joins the
 * field goes to the back of the field order: she is the freshest. Whoever leaves the field
 * goes to the back of the sideline order: she has just come off. Whoever joins the sideline
 * from not-playing goes to its front: she has had nothing yet. Nobody else moves, so a
 * mix-up changes the order once and the change sticks.
 */
function rotated(state: GameState, moves: Move[]): Player[] {
  const toFieldBack: PlayerId[] = [];
  const toBenchFront: PlayerId[] = [];
  const toBenchBack: PlayerId[] = [];
  for (const m of moves) {
    if (m.from === undefined || m.from === m.to) continue;
    if (m.to === 'field') toFieldBack.push(m.id);
    else if (m.to === 'bench') (m.from === 'field' ? toBenchBack : toBenchFront).push(m.id);
  }
  const moved = new Set([...toFieldBack, ...toBenchFront, ...toBenchBack]);
  if (moved.size === 0) return state.players;
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const pick = (ids: PlayerId[]) => ids.map((id) => byId.get(id)!);
  const rest = state.players.filter((p) => !moved.has(p.id));
  // The field/sideline boundary: just after the last player still on the field.
  let cut = 0;
  rest.forEach((p, i) => {
    if (state.location[p.id] === 'field') cut = i + 1;
  });
  return [
    ...rest.slice(0, cut),
    ...pick(toFieldBack),
    ...pick(toBenchFront),
    ...rest.slice(cut),
    ...pick(toBenchBack),
  ];
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
    return {
      config: normalizeConfig(event.config),
      players: event.players,
      location,
      clocks,
      phase: 'pre',
      period: 0,
      completedPeriodsMs: 0,
      periodStartGameMs: 0,
      periodElapsedMs: 0,
      runningSince: null,
      subAnchorGameMs: 0,
      inPlaySubsThisPeriod: 0,
      periodAdjustMs: 0,
    };
  }
  if (state === null) {
    throw new Error(`Cannot apply ${event.type} before GameCreated`);
  }

  switch (event.type) {
    case 'PeriodStarted': {
      if (state.phase !== 'pre' && state.phase !== 'break') return state;
      const period = state.period + 1;
      const clocks: Record<PlayerId, PlayerClock> = {};
      for (const p of state.players) {
        const c = clockOf(state, p.id);
        clocks[p.id] = {
          ...c,
          periodPlayedMs: 0,
          stints: period === 1 ? (state.location[p.id] === 'field' ? 1 : 0) : c.stints,
          stintStartGameMs: period === 1 ? 0 : c.stintStartGameMs,
        };
      }
      return {
        ...state,
        clocks,
        phase: 'running',
        period,
        periodStartGameMs: state.completedPeriodsMs,
        periodElapsedMs: 0,
        runningSince: event.at,
        subAnchorGameMs: state.completedPeriodsMs,
        inPlaySubsThisPeriod: 0,
      };
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
        // A shortened half does not carry over: the next period is the configured length
        // until the coach adjusts it (which they can do at the break).
        periodAdjustMs: 0,
      };
    }
    case 'SubMade': {
      if (state.phase === 'finished') return state;
      const inPlay = state.phase === 'running' || state.phase === 'paused';
      let next = settle(state, event.at);
      const gameMs = gameElapsedMs(next, event.at);
      const moves: Move[] = [
        ...event.off.map((id) => ({ id, from: next.location[id], to: 'bench' as Location })),
        ...event.on.map((id) => ({ id, from: next.location[id], to: 'field' as Location })),
      ];
      for (const m of moves) next = moveOne(next, m.id, m.to, gameMs);
      next = { ...next, players: rotated(next, moves) };
      if (state.phase === 'pre') return next;
      return {
        ...next,
        subAnchorGameMs: gameMs,
        inPlaySubsThisPeriod: next.inPlaySubsThisPeriod + (inPlay ? 1 : 0),
      };
    }
    case 'PlayerMoved': {
      const settled = settle(state, event.at);
      const move: Move = { id: event.id, from: settled.location[event.id], to: event.to };
      const next = moveOne(settled, event.id, event.to, gameElapsedMs(settled, event.at));
      return { ...next, players: rotated(next, [move]) };
    }
    case 'PeriodAdjusted': {
      // The period's length changes; nothing that has happened changes. The plan is derived
      // from the length, so the remaining subs re-spread over the new time left. A period is
      // never shorter than the time already played in it, nor than one minute.
      if (state.phase === 'finished') return state;
      const running = state.runningSince === null ? 0 : Math.max(0, event.at - state.runningSince);
      const elapsed = state.periodElapsedMs + running;
      const floor = Math.max(MINUTE_MS, elapsed) - periodMs(state.config);
      return { ...state, periodAdjustMs: Math.max(floor, state.periodAdjustMs + event.deltaMs) };
    }
    case 'LineupOrdered': {
      const byId = new Map(state.players.map((p) => [p.id, p]));
      const ordered = event.order.filter((id, i) => byId.has(id) && event.order.indexOf(id) === i);
      const rest = state.players.filter((p) => !ordered.includes(p.id));
      return { ...state, players: [...ordered.map((id) => byId.get(id)!), ...rest] };
    }
    case 'ConfigChanged': {
      return { ...state, config: normalizeConfig(event.config) };
    }
    default: {
      // An event type this build no longer knows (a log saved by an older version): skip it
      // rather than lose the whole game.
      return state;
    }
  }
}

/** Rebuild state from a full event log. Empty log → null (no game). */
export function replay(events: readonly GameEvent[]): GameState | null {
  let state: GameState | null = null;
  for (const e of events) state = reduce(state, e);
  return state;
}
