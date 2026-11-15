// What a player has set for themselves, kept in the browser between visits: how loud, how much
// the screen shakes, how sharp the picture is, and whether the controller rumbles. Whatever is
// read back is cleaned first, so a damaged or old entry costs nothing but the settings it held.

export interface Settings {
  /** 0 is silent, 1 is full. */
  volume: number;
  /** Sound switched off altogether (the M key). */
  muted: boolean;
  /** How much of the screen shake is shown: 0, 0.5 or 1. */
  shake: number;
  /** The picture: 0 light (coarser, no living backdrop), 1 plain, 2 sharp (every pixel the screen has, up to two for one). */
  picture: number;
  /** A controller rumbles on hits. */
  rumble: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = { volume: 0.8, muted: false, shake: 1, picture: 2, rumble: true };

export const SHAKES: ReadonlyArray<readonly [number, string]> = [
  [0, 'Off'],
  [0.5, 'Half'],
  [1, 'Full'],
];
export const PICTURES: readonly string[] = ['Light', 'Plain', 'Sharp'];

const KEY = 'resound.settings';
const VERSION = 1;

const num = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback);

/** Settings from anything at all: what is sound is kept, the rest is the default. */
export function cleanSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (typeof raw !== 'object' || raw === null) return { ...d };
  const r = raw as Record<string, unknown>;
  const shake = num(r.shake, 0, 1, d.shake);
  return {
    // to the nearest tenth, as the screen sets it
    volume: Math.round(num(r.volume, 0, 1, d.volume) * 10) / 10,
    muted: typeof r.muted === 'boolean' ? r.muted : d.muted,
    // to the nearest of the three it can be
    shake: SHAKES.reduce((best, [v]) => (Math.abs(v - shake) < Math.abs(best - shake) ? v : best), SHAKES[0][0]),
    picture: Math.round(num(r.picture, 0, PICTURES.length - 1, d.picture)),
    rumble: typeof r.rumble === 'boolean' ? r.rumble : d.rumble,
  };
}

/** The little of a browser's storage that is used, so tests can stand in for it. */
export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The browser's own storage, or null where there is none or it may not be used (a private window, a test). */
export function browserStore(): Store | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadSettings(store: Store | null): Settings {
  if (!store) return { ...DEFAULT_SETTINGS };
  try {
    const text = store.getItem(KEY);
    const parsed: unknown = text ? JSON.parse(text) : null;
    return cleanSettings(parsed && typeof parsed === 'object' ? (parsed as { settings?: unknown }).settings : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(store: Store | null, s: Settings): void {
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify({ v: VERSION, settings: cleanSettings(s) }));
  } catch {
    // storage is full or forbidden: the settings simply last for this visit
  }
}
