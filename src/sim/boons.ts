// What a player brings to every run from what they have earned in earlier ones (the Attunement):
// a little more health, Chimes to start with, the right to ask for other cards, a quicker dash,
// more Chimes, Tunings they may now be offered, and one they start with. Boons are fixed when the
// session is created and travel with its description, so every laptop plays the same game; and
// whatever a laptop claims is held to what the Attunement can really give.
import type { ContentRegistry } from './defs';
import type { ClassId } from './types';

export interface Boons {
  /** More greatest health. */
  health: number;
  /** Chimes in the purse at the start. */
  chimes: number;
  /** Times in a run the player may ask for their cards to be dealt again. */
  rerolls: number;
  /** How much sooner the dash comes back, as a share: 0.15 is 15% sooner. */
  dash: number;
  /** How many more Chimes come their way, as a share: 0.2 is a fifth more. */
  fortune: number;
  /** Locked Tunings the player may now be offered, by id. */
  unlocked: string[];
  /** A Tuning the player starts every run with, at its first rank; '' for none. */
  issued: string;
}

export const noBoons = (): Boons => ({ health: 0, chimes: 0, rerolls: 0, dash: 0, fortune: 0, unlocked: [], issued: '' });

/** The most the Attunement can ever give. */
export const BOON_LIMIT = { health: 30, chimes: 60, rerolls: 2, dash: 0.15, fortune: 0.2, unlocked: 6 };

const whole = (v: unknown, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(hi, Math.round(v))) : 0);
/** A share, kept to hundredths so that every laptop holds exactly the same number. */
const share = (v: unknown, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(0, Math.min(hi, v)) * 100) / 100 : 0);
const word = (v: unknown): string => (typeof v === 'string' && v.length <= 40 ? v : '');

/** Boons from anything at all, held to their limits. It does not know which Tunings exist: `cleanBoons` does. */
export function shapeBoons(raw: unknown): Boons {
  if (typeof raw !== 'object' || raw === null) return noBoons();
  const r = raw as Record<string, unknown>;
  const unlocked: string[] = [];
  if (Array.isArray(r.unlocked)) {
    for (const id of r.unlocked) {
      const w = word(id);
      if (w && !unlocked.includes(w) && unlocked.length < BOON_LIMIT.unlocked) unlocked.push(w);
    }
  }
  return {
    health: whole(r.health, BOON_LIMIT.health),
    chimes: whole(r.chimes, BOON_LIMIT.chimes),
    rerolls: whole(r.rerolls, BOON_LIMIT.rerolls),
    dash: share(r.dash, BOON_LIMIT.dash),
    fortune: share(r.fortune, BOON_LIMIT.fortune),
    unlocked: unlocked.sort(),
    issued: word(r.issued),
  };
}

/**
 * Boons as a session will honour them for a player of this class: within their limits, and
 * naming only Tunings that exist and that this class may hold. An unlocked Tuning must be one
 * that is locked; an issued one must be the class's own, and theirs to be offered.
 */
export function cleanBoons(raw: unknown, classId: ClassId, content: ContentRegistry): Boons {
  const b = shapeBoons(raw);
  b.unlocked = b.unlocked.filter((id) => {
    const t = content.tunings[id];
    return !!t && !!t.locked && (t.owner === classId || t.owner === 'common');
  });
  const issued = content.tunings[b.issued];
  if (!issued || issued.owner !== classId || (issued.locked && !b.unlocked.includes(issued.id))) b.issued = '';
  return b;
}
