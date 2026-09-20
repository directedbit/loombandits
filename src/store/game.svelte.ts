// The current game as an event log. State is always rebuilt from the log, which is what
// makes undo trivial and time accounting exact.
import { replay, type GameEvent, type GameState } from '../engine';

const KEY = 'lb.game.v1';

function load(): GameEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version: number; events: GameEvent[] };
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

function save(events: GameEvent[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, events }));
  } catch {
    // Storage unavailable: the game continues in memory.
  }
}

class GameStore {
  events = $state<GameEvent[]>(load());
  state: GameState | null = $derived(replay(this.events));

  get canUndo(): boolean {
    return this.events.length > 1;
  }

  dispatch(event: GameEvent): void {
    this.events = [...this.events, event];
    save(this.events);
  }

  /** Remove the last event. The game itself (the first event) cannot be undone away. */
  undo(): void {
    if (!this.canUndo) return;
    this.events = this.events.slice(0, -1);
    save(this.events);
  }

  discard(): void {
    this.events = [];
    save(this.events);
  }
}

export const game = new GameStore();
