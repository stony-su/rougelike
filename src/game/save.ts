// What a player keeps between runs: the Resonance they have earned and not yet spent, what they
// have bought with it at the Attunement, the Tuning each class is issued, and their records as
// each class. It lives in the browser's storage under one key, with a version. Whatever is read
// back is cleaned first, so an old or damaged save loses only what cannot be read; and it can be
// written out as a code and read back from one, because a laptop that joins a host keeps its
// save under the host's address and needs a way to carry it.
import { ATTUNEMENT, RESONANCE } from '../content/attunement';
import type { AttuneDef } from '../content/attunement';
import { BOON_LIMIT, noBoons } from '../sim/boons';
import type { Boons } from '../sim/boons';
import type { ContentRegistry } from '../sim/defs';
import type { RunStats } from '../sim/session';
import type { ClassId } from '../sim/types';
import type { Store } from './settings';

export interface ClassRecord {
  runs: number;
  wins: number;
  /** The most chambers cleared in one run. */
  best: number;
  /** The highest Rally reached. */
  rally: number;
  /** The quickest win, in ticks of play; 0 until there is one. */
  fastest: number;
}

export interface Save {
  /** Resonance to spend, and all that was ever earned. */
  resonance: number;
  earned: number;
  /** Ranks bought at the Attunement, by entry id. */
  bought: Record<string, number>;
  /** The Tuning each class starts with, where that has been bought and chosen; '' for none. */
  issued: Record<ClassId, string>;
  records: Record<ClassId, ClassRecord>;
}

const CLASS_IDS: readonly ClassId[] = ['sword', 'bow', 'fist'];
const KEY = 'resound.save';
const VERSION = 1;

const noRecord = (): ClassRecord => ({ runs: 0, wins: 0, best: 0, rally: 0, fastest: 0 });
export const freshSave = (): Save => ({
  resonance: 0,
  earned: 0,
  bought: {},
  issued: { sword: '', bow: '', fist: '' },
  records: { sword: noRecord(), bow: noRecord(), fist: noRecord() },
});

const whole = (v: unknown, hi = 1e9): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(hi, Math.floor(v))) : 0);
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** A save from anything at all: what can be read is kept, the rest is as on a first visit. */
export function cleanSave(raw: unknown): Save {
  const r = obj(raw);
  const out = freshSave();
  out.resonance = whole(r.resonance);
  out.earned = Math.max(whole(r.earned), out.resonance);
  const bought = obj(r.bought);
  for (const def of ATTUNEMENT) {
    const rank = whole(bought[def.id], def.costs.length);
    if (rank > 0) out.bought[def.id] = rank;
  }
  const issued = obj(r.issued);
  const records = obj(r.records);
  for (const c of CLASS_IDS) {
    const id = issued[c];
    out.issued[c] = typeof id === 'string' && id.length <= 40 ? id : '';
    const rec = obj(records[c]);
    out.records[c] = { runs: whole(rec.runs), wins: whole(rec.wins), best: whole(rec.best, 99), rally: whole(rec.rally, 999), fastest: whole(rec.fastest) };
    out.records[c].wins = Math.min(out.records[c].wins, out.records[c].runs);
  }
  return out;
}

export function loadSave(store: Store | null): Save {
  if (!store) return freshSave();
  try {
    const text = store.getItem(KEY);
    const parsed: unknown = text ? JSON.parse(text) : null;
    return cleanSave(obj(parsed).save);
  } catch {
    return freshSave();
  }
}

export function storeSave(store: Store | null, save: Save): void {
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify({ v: VERSION, save: cleanSave(save) }));
  } catch {
    // storage is full or forbidden: what was earned lasts for this visit
  }
}

// ---------------------------------------------------------------- the Attunement

/** The entries a player can see: all of them, but for those that name a Tuning that does not exist. */
export function offered(content: ContentRegistry): AttuneDef[] {
  return ATTUNEMENT.filter((d) => {
    if (d.gives.unlock) return !!content.tunings[d.gives.unlock];
    if (d.gives.issue) return issuable(d.gives.issue, freshSave(), content).length > 0;
    return true;
  });
}

export const rankOf = (save: Save, id: string): number => save.bought[id] ?? 0;

/** What the next rank of an entry costs, or -1 when every rank is held. */
export function priceOf(save: Save, def: AttuneDef): number {
  const rank = rankOf(save, def.id);
  return rank < def.costs.length ? def.costs[rank] : -1;
}

/** Buy the next rank of an entry. Refused, with nothing changed, when it is all held or the Resonance is short. */
export function attune(save: Save, id: string): boolean {
  const def = ATTUNEMENT.find((d) => d.id === id);
  if (!def) return false;
  const price = priceOf(save, def);
  if (price < 0 || save.resonance < price) return false;
  save.resonance -= price;
  save.bought[id] = rankOf(save, id) + 1;
  return true;
}

/** The locked Tunings this save has unlocked. */
function unlockedBy(save: Save): string[] {
  const out: string[] = [];
  for (const d of ATTUNEMENT) if (d.gives.unlock && rankOf(save, d.id) > 0) out.push(d.gives.unlock);
  return out;
}

/** The Tunings a class could be issued: its own, at their first rank, and not a locked one unless it has been unlocked. */
export function issuable(classId: ClassId, save: Save, content: ContentRegistry): string[] {
  const open = unlockedBy(save);
  return Object.keys(content.tunings)
    .sort()
    .filter((id) => {
      const t = content.tunings[id];
      return t.owner === classId && (!t.locked || open.includes(id));
    });
}

/** May this class be issued a Tuning yet? */
export const mayIssue = (save: Save, classId: ClassId): boolean => ATTUNEMENT.some((d) => d.gives.issue === classId && rankOf(save, d.id) > 0);

/** Choose the Tuning a class is issued ('' for none). Refused unless the right has been bought and the Tuning is one it could be. */
export function issue(save: Save, classId: ClassId, tuning: string, content: ContentRegistry): boolean {
  if (!mayIssue(save, classId)) return false;
  if (tuning !== '' && !issuable(classId, save, content).includes(tuning)) return false;
  save.issued[classId] = tuning;
  return true;
}

/** What this save brings to a run as a class. */
export function boonsFor(save: Save, classId: ClassId, content: ContentRegistry): Boons {
  const b = noBoons();
  for (const d of ATTUNEMENT) {
    const rank = rankOf(save, d.id);
    if (rank <= 0) continue;
    b.health += (d.gives.health ?? 0) * rank;
    b.chimes += (d.gives.chimes ?? 0) * rank;
    b.rerolls += (d.gives.rerolls ?? 0) * rank;
    b.dash += (d.gives.dash ?? 0) * rank;
    b.fortune += (d.gives.fortune ?? 0) * rank;
    const t = d.gives.unlock ? content.tunings[d.gives.unlock] : undefined;
    if (t && (t.owner === classId || t.owner === 'common')) b.unlocked.push(t.id);
  }
  b.health = Math.min(b.health, BOON_LIMIT.health);
  b.chimes = Math.min(b.chimes, BOON_LIMIT.chimes);
  b.rerolls = Math.min(b.rerolls, BOON_LIMIT.rerolls);
  b.dash = Math.min(b.dash, BOON_LIMIT.dash);
  b.fortune = Math.min(b.fortune, BOON_LIMIT.fortune);
  b.unlocked.sort();
  const issued = save.issued[classId];
  if (mayIssue(save, classId) && issuable(classId, save, content).includes(issued)) b.issued = issued;
  return b;
}

// ---------------------------------------------------------------- what a run earns

/** The Resonance a run earned: for each chamber cleared, more for the Carillon's, and more again for the Toll's. */
export function resonanceFor(stats: RunStats, won: boolean, minibossAt: number): number {
  return stats.chambers * RESONANCE.chamber + (minibossAt > 0 && stats.chambers >= minibossAt ? RESONANCE.miniboss : 0) + (won ? RESONANCE.boss : 0);
}

/** Write a finished run into the save: its Resonance, and the records of the class it was played as. Returns the Resonance gained. */
export function bankRun(save: Save, classId: ClassId, stats: RunStats, won: boolean, played: number, minibossAt: number): number {
  const gained = resonanceFor(stats, won, minibossAt);
  save.resonance += gained;
  save.earned += gained;
  const r = save.records[classId];
  r.runs++;
  if (won) {
    r.wins++;
    if (played > 0 && (r.fastest === 0 || played < r.fastest)) r.fastest = played;
  }
  r.best = Math.max(r.best, stats.chambers);
  r.rally = Math.max(r.rally, stats.bestRally);
  return gained;
}

// ---------------------------------------------------------------- a save as a code

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += ALPHABET[a >> 2] + ALPHABET[((a & 3) << 4) | (b >> 4)];
    if (i + 1 < bytes.length) out += ALPHABET[((b & 15) << 2) | (c >> 6)];
    if (i + 2 < bytes.length) out += ALPHABET[c & 63];
  }
  return out;
}

function fromBase64(text: string): Uint8Array | null {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of text) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
  }
  return Uint8Array.from(out);
}

/** A short check on a code, so one that was cut short or mistyped is refused instead of half-read. */
function check(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0');
}

/** A save as a line of text that can be copied to another address or another laptop. */
export function writeCode(save: Save): string {
  const body = toBase64(new TextEncoder().encode(JSON.stringify(cleanSave(save))));
  return `RS${VERSION}.${body}.${check(body)}`;
}

/** Read a code back into a save. Null if it is not a whole, sound code. */
export function readCode(text: string): Save | null {
  const parts = text.trim().split('.');
  if (parts.length !== 3 || parts[0] !== `RS${VERSION}` || check(parts[1]) !== parts[2]) return null;
  const bytes = fromBase64(parts[1]);
  if (!bytes) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof parsed === 'object' && parsed !== null ? cleanSave(parsed) : null;
  } catch {
    return null;
  }
}
