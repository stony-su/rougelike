// What travels between a laptop and the host program: small JSON messages over one WebSocket.
//
// Everything that arrives is treated as untrusted. A message that is not exactly one of the
// shapes below is dropped, and every number in an input is forced into its range before it goes
// into a bundle, so a confused or hostile page can neither crash the host nor make two laptops
// disagree: the host sends everyone the same cleaned bundle.
import type { Bundle, Command, CommandKind, SessionConfig } from '../sim/session';
import { AIM_STEPS, MOVE_MAG_MAX, MOVE_STEPS, PRESS_COUNT, emptyInput } from '../sim/types';
import type { ClassId, InputFrame } from '../sim/types';

export const PROTOCOL_VERSION = 1;
/** The path of the WebSocket on the host program. */
export const RELAY_PATH = '/relay';
export const MAX_NAME = 14;

export interface LobbySeat {
  slot: number;
  name: string;
  classId: ClassId;
  ready: boolean;
  connected: boolean;
}

/** An input frame as nine integers: move angle, move size, aim angle, aim distance, held, and four press counters. */
export type PackedInput = number[];
/** A bundle as [tick, inputs, commands]; a seat with no input is null. */
export type PackedBundle = [number, Array<PackedInput | null>, Array<[number, number, CommandKind, number]>];

export type ClientMsg =
  /** First message: who this is. `token` is a per-browser id, so a laptop that drops out can take its seat back. */
  | { t: 'hello'; v: number; build: string; token: string; name: string; classId: ClassId }
  /** In the lobby: change class, or say ready. */
  | { t: 'seat'; classId: ClassId; ready: boolean }
  /** In the lobby: begin, once everyone is ready. Any seat may ask. */
  | { t: 'start' }
  | { t: 'in'; f: PackedInput }
  | { t: 'cmd'; seq: number; kind: CommandKind; a: number }
  /** The hash of this laptop's session after a tick, so the host can tell if it has drifted. */
  | { t: 'hash'; tick: number; h: number }
  | { t: 'ping'; id: number }
  /** How long a round trip to the host takes from here, in ms: the host sizes the input delay by the slowest. */
  | { t: 'rtt'; ms: number }
  /** This laptop's whole session as it stood after `tick`, sent when it is told it had drifted, so the host can find where. */
  | { t: 'state'; tick: number; state: string };

export type HostMsg =
  | { t: 'welcome'; v: number; build: string; slot: number; seats: LobbySeat[] }
  | { t: 'refused'; why: string }
  | { t: 'lobby'; seats: LobbySeat[] }
  /** The game begins: everyone builds the same session from this. */
  | { t: 'start'; config: SessionConfig }
  /** Every tick closed since the last message, in order. */
  | { t: 'b'; b: PackedBundle[] }
  /** The whole session as it stood after `tick`, and the ticks since: for a laptop that joined late or drifted. */
  | { t: 'snap'; tick: number; config: SessionConfig; state: string; b: PackedBundle[] }
  | { t: 'pong'; id: number }
  /** The session is over for everyone (the host program is closing). */
  | { t: 'bye'; why: string };

const CLASSES: readonly string[] = ['sword', 'bow', 'fist'];
const KINDS: readonly string[] = ['pause', 'restart', 'pick', 'reroll'];

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const clampInt = (v: unknown, lo: number, hi: number): number => (isInt(v) ? (v < lo ? lo : v > hi ? hi : v) : lo);
export const isClassId = (v: unknown): v is ClassId => typeof v === 'string' && CLASSES.includes(v);
const isKind = (v: unknown): v is CommandKind => typeof v === 'string' && KINDS.includes(v);

/** A name as it will be shown: printable, trimmed, never empty, never long. */
export function cleanName(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  let out = '';
  for (const ch of v) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 32 && c !== 127 && out.length < MAX_NAME) out += ch;
  }
  out = out.trim();
  return out.length > 0 ? out : fallback;
}

export function packInput(f: InputFrame): PackedInput {
  return [f.moveAngle, f.moveMag, f.aimAngle, f.aimDist, f.held, f.presses[0], f.presses[1], f.presses[2], f.presses[3]];
}

/** Read a packed input into `out`, forcing every number into its range. Returns false if it is not an input at all. */
export function unpackInput(a: unknown, out: InputFrame): boolean {
  if (!Array.isArray(a) || a.length !== 5 + PRESS_COUNT) return false;
  out.moveAngle = clampInt(a[0], 0, MOVE_STEPS - 1);
  out.moveMag = clampInt(a[1], 0, MOVE_MAG_MAX);
  out.aimAngle = clampInt(a[2], 0, AIM_STEPS - 1);
  out.aimDist = clampInt(a[3], 0, 255);
  out.held = clampInt(a[4], 0, 15);
  for (let i = 0; i < PRESS_COUNT; i++) out.presses[i] = clampInt(a[5 + i], 0, 255);
  return true;
}

export function packBundle(b: Bundle): PackedBundle {
  return [b.tick, b.inputs.map((f) => (f ? packInput(f) : null)), b.cmds.map((c) => [c.slot, c.seq, c.kind, c.a])];
}

/** Read a packed bundle. Returns null if it is malformed. */
export function unpackBundle(p: unknown): Bundle | null {
  if (!Array.isArray(p) || p.length !== 3 || !isInt(p[0]) || !Array.isArray(p[1]) || !Array.isArray(p[2])) return null;
  const inputs: Array<InputFrame | undefined> = [];
  for (const packed of p[1] as unknown[]) {
    if (packed === null) {
      inputs.push(undefined);
      continue;
    }
    const f = emptyInput();
    if (!unpackInput(packed, f)) return null;
    inputs.push(f);
  }
  const cmds: Command[] = [];
  for (const c of p[2] as unknown[]) {
    if (!Array.isArray(c) || c.length !== 4 || !isInt(c[0]) || !isInt(c[1]) || !isKind(c[2]) || !isInt(c[3])) return null;
    cmds.push({ slot: c[0], seq: c[1], kind: c[2], a: c[3] });
  }
  return { tick: p[0], inputs, cmds };
}

function parse(text: string): Record<string, unknown> | null {
  if (text.length > 4_000_000) return null;
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A message from a laptop, checked. Anything else is null. */
export function parseClientMsg(text: string): ClientMsg | null {
  const m = parse(text);
  if (!m) return null;
  switch (m.t) {
    case 'hello':
      if (!isInt(m.v) || typeof m.build !== 'string' || typeof m.token !== 'string' || m.token.length < 8 || m.token.length > 64 || !isClassId(m.classId)) return null;
      return { t: 'hello', v: m.v, build: m.build.slice(0, 64), token: m.token, name: cleanName(m.name, 'Returner'), classId: m.classId };
    case 'seat':
      return isClassId(m.classId) && typeof m.ready === 'boolean' ? { t: 'seat', classId: m.classId, ready: m.ready } : null;
    case 'start':
      return { t: 'start' };
    case 'in': {
      const f = emptyInput();
      return unpackInput(m.f, f) ? { t: 'in', f: packInput(f) } : null;
    }
    case 'cmd':
      return isInt(m.seq) && m.seq > 0 && isKind(m.kind) && isInt(m.a) ? { t: 'cmd', seq: m.seq, kind: m.kind, a: m.a } : null;
    case 'hash':
      return isInt(m.tick) && isInt(m.h) ? { t: 'hash', tick: m.tick, h: m.h } : null;
    case 'ping':
      return isInt(m.id) ? { t: 'ping', id: m.id } : null;
    case 'rtt':
      return typeof m.ms === 'number' && Number.isFinite(m.ms) && m.ms >= 0 ? { t: 'rtt', ms: Math.min(1000, Math.round(m.ms)) } : null;
    case 'state':
      return isInt(m.tick) && typeof m.state === 'string' ? { t: 'state', tick: m.tick, state: m.state } : null;
    default:
      return null;
  }
}

function seats(v: unknown): LobbySeat[] | null {
  if (!Array.isArray(v) || v.length > 3) return null;
  const out: LobbySeat[] = [];
  for (const s of v as unknown[]) {
    if (typeof s !== 'object' || s === null) return null;
    const r = s as Record<string, unknown>;
    if (!isInt(r.slot) || !isClassId(r.classId) || typeof r.ready !== 'boolean' || typeof r.connected !== 'boolean') return null;
    out.push({ slot: r.slot, name: cleanName(r.name, 'Returner'), classId: r.classId, ready: r.ready, connected: r.connected });
  }
  return out;
}

function config(v: unknown): SessionConfig | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.seed !== 'string' || typeof r.buildId !== 'string' || !isInt(r.inputDelay) || !isInt(r.stress) || !Array.isArray(r.players)) return null;
  if (r.players.length < 1 || r.players.length > 3) return null;
  const players: SessionConfig['players'] = [];
  for (const p of r.players as unknown[]) {
    if (typeof p !== 'object' || p === null) return null;
    const q = p as Record<string, unknown>;
    if (!isClassId(q.classId)) return null;
    players.push({ name: cleanName(q.name, 'Returner'), classId: q.classId });
  }
  const out: SessionConfig = { seed: r.seed, players, buildId: r.buildId, inputDelay: clampInt(r.inputDelay, 0, 30), stress: clampInt(r.stress, 0, 200) };
  if (r.practice === true) out.practice = true;
  return out;
}

function bundles(v: unknown): PackedBundle[] | null {
  if (!Array.isArray(v)) return null;
  for (const b of v as unknown[]) if (unpackBundle(b) === null) return null;
  return v as PackedBundle[];
}

/** A message from the host, checked. Anything else is null. */
export function parseHostMsg(text: string): HostMsg | null {
  const m = parse(text);
  if (!m) return null;
  switch (m.t) {
    case 'welcome': {
      const s = seats(m.seats);
      return isInt(m.v) && typeof m.build === 'string' && isInt(m.slot) && s ? { t: 'welcome', v: m.v, build: m.build, slot: m.slot, seats: s } : null;
    }
    case 'refused':
      return typeof m.why === 'string' ? { t: 'refused', why: m.why } : null;
    case 'lobby': {
      const s = seats(m.seats);
      return s ? { t: 'lobby', seats: s } : null;
    }
    case 'start': {
      const c = config(m.config);
      return c ? { t: 'start', config: c } : null;
    }
    case 'b': {
      const b = bundles(m.b);
      return b ? { t: 'b', b } : null;
    }
    case 'snap': {
      const c = config(m.config);
      const b = bundles(m.b);
      return isInt(m.tick) && typeof m.state === 'string' && c && b ? { t: 'snap', tick: m.tick, config: c, state: m.state, b } : null;
    }
    case 'pong':
      return isInt(m.id) ? { t: 'pong', id: m.id } : null;
    case 'bye':
      return typeof m.why === 'string' ? { t: 'bye', why: m.why } : null;
    default:
      return null;
  }
}

// Bytes as text, for snapshots. Written out here because the simulation side of the code has no
// browser or Node helpers to lean on, and both ends must agree exactly.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToText(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out;
}

/** The bytes a text stands for, or null if it is not well formed. */
export function textToBytes(text: string): Uint8Array | null {
  if (text.length % 4 !== 0) return null;
  let pad = 0;
  if (text.endsWith('==')) pad = 2;
  else if (text.endsWith('=')) pad = 1;
  const out = new Uint8Array((text.length / 4) * 3 - pad);
  let n = 0;
  for (let i = 0; i < text.length; i += 4) {
    const v = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const ch = text[i + k];
      if (ch === '=' && i + k >= text.length - pad) continue;
      const idx = B64.indexOf(ch);
      if (idx < 0) return null;
      v[k] = idx;
    }
    const word = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
    if (n < out.length) out[n++] = (word >> 16) & 255;
    if (n < out.length) out[n++] = (word >> 8) & 255;
    if (n < out.length) out[n++] = word & 255;
  }
  return out;
}
