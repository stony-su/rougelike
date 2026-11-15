// Drafts. After a fight every player is offered three Tunings and takes one. What is offered is
// worked out from the seed alone, so every laptop deals the same cards, and it leans toward what
// the player has begun to build: a build already started, a rank still to gain, and most of all
// the missing half of a Harmony.
import { Rng } from '../core/rng';
import type { ContentRegistry } from './defs';
import type { HarmonyDef, TuningDef } from './mods';
import { SIM_HZ } from './tuning';
import type { ClassId } from './types';

export interface Draft {
  /** Ids of the Tunings on offer; empty when nothing is. */
  offers: string[];
  /** Ticks left before the first card is taken for a player who has not chosen. */
  timer: number;
  /** Drafts this player has made in this run. The first one shows a card from each build of their class. */
  made: number;
  /** This offer promises something better than common (an elite or a mini-boss was beaten). */
  rare: boolean;
  /** Times the present offer has been dealt again, and how many more times this run it may be. */
  rolled: number;
  rerolls: number;
}

/** How long a player may look at their cards before the first is taken for them. */
export const DRAFT_TICKS = 30 * SIM_HZ;
export const OFFERS = 3;
/** How likely a card is, by rarity: common, uncommon, rare. */
const RARITY_WEIGHT: readonly number[] = [10, 6, 2.5];
/** A class's fourth Tuning belongs to no build; the first draft leaves it out. */
export const WILDCARD = 'Wildcard';

export const newDraft = (rerolls = 0): Draft => ({ offers: [], timer: 0, made: 0, rare: false, rolled: 0, rerolls });

type Held = Readonly<Record<string, number>>;
const rankOf = (held: Held, id: string): number => held[id] ?? 0;

/** The Tunings a player could be offered: their class's and the common ones, unlocked, and not yet at full rank. */
export function candidates(classId: ClassId, held: Held, content: ContentRegistry, unlocked: readonly string[] = []): TuningDef[] {
  return Object.keys(content.tunings)
    .sort()
    .map((id) => content.tunings[id])
    .filter((t) => (t.owner === classId || t.owner === 'common') && (!t.locked || unlocked.includes(t.id)) && rankOf(held, t.id) < t.maxRank);
}

/** The Harmony this Tuning would switch on if taken now (its other parent is already held), or null. */
export function completes(id: string, held: Held, content: ContentRegistry): HarmonyDef | null {
  if (rankOf(held, id) > 0) return null;
  for (const h of content.harmonies) {
    if (h.parents[0] === id && rankOf(held, h.parents[1]) > 0) return h;
    if (h.parents[1] === id && rankOf(held, h.parents[0]) > 0) return h;
  }
  return null;
}

function weightOf(t: TuningDef, held: Held, content: ContentRegistry): number {
  let w = RARITY_WEIGHT[t.rarity] ?? 1;
  if (rankOf(held, t.id) > 0) w *= 1.3;
  else if (completes(t.id, held, content)) w *= 2.5;
  // a build the player has begun
  for (const id of Object.keys(held)) {
    const other = content.tunings[id];
    if (other && rankOf(held, id) > 0 && other.id !== t.id && other.owner === t.owner && other.build === t.build) {
      w *= 1.5;
      break;
    }
  }
  return w;
}

/**
 * Deal an offer. `made` is how many drafts the player has made this run; `rare` promises a card
 * above common. Fewer than three come back only when fewer than three Tunings are left to take.
 */
export function rollOffers(seed: string, classId: ClassId, held: Held, content: ContentRegistry, made: number, rare: boolean, unlocked: readonly string[] = []): string[] {
  const rng = new Rng(seed);
  const pool = candidates(classId, held, content, unlocked);
  const out: TuningDef[] = [];
  const take = (from: readonly TuningDef[]): void => {
    if (out.length >= OFFERS) return;
    const left = from.filter((t) => !out.includes(t));
    if (left.length > 0) out.push(rng.weighted(left, (t) => weightOf(t, held, content)));
  };
  const own = pool.filter((t) => t.owner === classId);
  const common = pool.filter((t) => t.owner === 'common');
  if (made === 0) {
    // the first draft of a run: one card from each build of the class, so a direction is chosen on purpose
    const builds = [...new Set(own.filter((t) => t.build !== WILDCARD).map((t) => t.build))].sort();
    for (const b of builds) take(own.filter((t) => t.build === b));
  } else {
    if (rare) take(pool.filter((t) => t.rarity >= 1));
    // at least one of the class and at least one that anyone can take
    if (!out.some((t) => t.owner === classId)) take(own);
    if (!out.some((t) => t.owner === 'common')) take(common);
  }
  for (let n = -1; out.length < OFFERS && out.length !== n;) {
    n = out.length;
    take(pool);
  }
  return out.map((t) => t.id);
}
