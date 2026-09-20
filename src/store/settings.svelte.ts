// Team settings: roster and game parameters. Persisted on the device between games.
import type { Player } from '../engine';

export interface Settings {
  teamName: string;
  players: Player[];
  periods: number;
  periodMinutes: number;
  onField: number;
  swapSize: number;
  /** Fixed sub interval in seconds; null lets the engine choose. */
  intervalSeconds: number | null;
}

const KEY = 'lb.settings.v1';

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

export const DEFAULT_SETTINGS: Settings = {
  teamName: 'Loom Bandits',
  players: ['Immy', 'Rosie', 'Tilly', 'Annie'].map((name) => ({ id: newId(), name })),
  periods: 4,
  periodMinutes: 10,
  onField: 7,
  swapSize: 2,
  intervalSeconds: null,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as { version: number; settings: Settings };
    return { ...DEFAULT_SETTINGS, ...parsed.settings };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function save(value: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, settings: value }));
  } catch {
    // Storage unavailable (private mode, quota): keep working in memory.
  }
}

class SettingsStore {
  value = $state<Settings>(load());

  update(patch: Partial<Settings>): void {
    this.value = { ...this.value, ...patch };
    save(this.value);
  }

  addPlayer(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.update({ players: [...this.value.players, { id: newId(), name: trimmed }] });
  }

  renamePlayer(id: string, name: string): void {
    this.update({ players: this.value.players.map((p) => (p.id === id ? { ...p, name } : p)) });
  }

  removePlayer(id: string): void {
    this.update({ players: this.value.players.filter((p) => p.id !== id) });
  }
}

export const settings = new SettingsStore();
