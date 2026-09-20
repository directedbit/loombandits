// Team settings: roster and game parameters. Persisted on the device between games.
import type { Player, RotationScope } from '../engine';

export interface Settings {
  teamName: string;
  players: Player[];
  periods: number;
  periodMinutes: number;
  onField: number;
  swapSize: number;
  /** Fixed sub interval in seconds; null lets the engine choose. */
  intervalSeconds: number | null;
  /** 'period': everyone gets field and bench time in every period. */
  rotationScope: RotationScope;
}

const KEY = 'lb.settings.v2';
const LEGACY_KEY = 'lb.settings.v1';
const LEGACY_DEFAULT_NAMES = ['Immy', 'Rosie', 'Tilly', 'Annie'];

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

export const DEFAULT_SETTINGS: Settings = {
  teamName: 'Loom Bandits',
  players: ['Rosie', 'Tilly', 'Immy', 'Annie', 'Ella', 'Harper', 'Flora', 'Kenzie'].map((name) => ({
    id: newId(),
    name,
  })),
  periods: 2,
  periodMinutes: 15,
  onField: 5,
  swapSize: 1,
  intervalSeconds: null,
  rotationScope: 'period',
};

/** Earlier shipped defaults. A stored copy that still matches one of these was never edited. */
const PREVIOUS_DEFAULTS: Array<Omit<Settings, 'players'> & { names: string[] }> = [
  {
    teamName: 'Loom Bandits',
    names: ['Rosie', 'Tilly', 'Immy', 'Annie', 'Ella', 'Harper', 'Flora', 'Kenzie'],
    periods: 2,
    periodMinutes: 10,
    onField: 7,
    swapSize: 2,
    intervalSeconds: null,
    rotationScope: 'period',
  },
  {
    teamName: 'Loom Bandits',
    names: ['Rosie', 'Tilly', 'Immy', 'Annie', 'Ella', 'Harper', 'Flora', 'Kenzie'],
    periods: 2,
    periodMinutes: 15,
    onField: 5,
    swapSize: 2,
    intervalSeconds: null,
    rotationScope: 'period',
  },
];

function isUntouchedPreviousDefault(stored: Partial<Settings>): boolean {
  const names = (stored.players ?? []).map((p) => p.name);
  return PREVIOUS_DEFAULTS.some(
    (d) =>
      d.teamName === stored.teamName &&
      d.periods === stored.periods &&
      d.periodMinutes === stored.periodMinutes &&
      d.onField === stored.onField &&
      d.swapSize === stored.swapSize &&
      (stored.intervalSeconds ?? null) === d.intervalSeconds &&
      (stored.rotationScope ?? 'period') === d.rotationScope &&
      names.length === d.names.length &&
      names.every((n, i) => n === d.names[i]),
  );
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { version: number; settings: Partial<Settings> };
      if (isUntouchedPreviousDefault(parsed.settings)) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...parsed.settings };
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as { version: number; settings: Partial<Settings> };
      const names = (parsed.settings.players ?? []).map((p) => p.name);
      const untouchedRoster =
        names.length === LEGACY_DEFAULT_NAMES.length &&
        names.every((n, i) => n === LEGACY_DEFAULT_NAMES[i]);
      // A v1 install that never edited the roster gets the new defaults wholesale;
      // real edits are kept and only the new fields are filled in.
      return untouchedRoster ? DEFAULT_SETTINGS : { ...DEFAULT_SETTINGS, ...parsed.settings };
    }
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function save(value: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 2, settings: value }));
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
