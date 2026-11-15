// The camp: a quiet chamber with two things in it. The Tuner sells Tunings from a shelf of
// three, a ration, and a fresh shelf, for Chimes. The Still Pool gives each player one thing,
// once: health back, or a rank of a Tuning they already hold. Everything here is asked for with
// a command, so every laptop agrees on who bought what; this file says what a command may do.
import type { ContentRegistry } from './defs';
import { OFFERS, rollOffers } from './draft';
import type { TuningDef } from './mods';
import { grantTuning } from './player';
import { SIM_HZ } from './tuning';
import type { Player, World } from './types';

export const CAMP = {
  /** What a Tuning costs at the Tuner, by rarity: common, uncommon, rare. */
  price: [40, 60, 90] as readonly number[],
  /** A ration: what it costs and the health it gives back. One to a player at each camp. */
  ration: 40,
  rationHeal: 30,
  /** A fresh shelf: what the first costs, and how much more each one after it. */
  restock: 20,
  restockStep: 10,
  /** The Still Pool: the share of their health it gives back, or the health it adds when there is nothing to raise. */
  heal: 0.35,
  gift: 10,
  /** Once the first of the party is ready to leave, how long the others have. */
  wait: 30 * SIM_HZ,
};

/** What `a` says in a 'buy' command: 0, 1 or 2 is a place on the shelf, then these. */
export const BUY_RATION = 3;
export const BUY_RESTOCK = 4;
/** What `a` says in a 'rest' command: this, or 1 + a place in `raisable`. */
export const REST_HEAL = 0;

/** What one player has in front of them at a camp. */
export interface CampSeat {
  /** The Tunings on the Tuner's shelf, by id; '' where one has been bought. Empty away from a camp. */
  shelf: string[];
  /** The ration is still for sale. */
  ration: boolean;
  /** Fresh shelves bought at this camp. */
  restocks: number;
  /** The Still Pool has given this player its one thing. */
  rested: boolean;
  /** Ready to leave. */
  ready: boolean;
}

export const noCamp = (): CampSeat => ({ shelf: [], ration: false, restocks: 0, rested: false, ready: false });

/** Is this player at a camp? */
export const atCamp = (seat: CampSeat | undefined): seat is CampSeat => !!seat && seat.shelf.length > 0;

export const priceOf = (t: TuningDef): number => CAMP.price[t.rarity] ?? CAMP.price[0];

/** What the next fresh shelf costs this player. */
export const restockPrice = (seat: CampSeat): number => CAMP.restock + CAMP.restockStep * seat.restocks;

/** The Tunings a player holds that the Still Pool could raise by a rank, in a fixed order. */
export function raisable(p: Player, content: ContentRegistry): string[] {
  return Object.keys(p.tunings)
    .sort()
    .filter((id) => {
      const t = content.tunings[id];
      return !!t && p.tunings[id] > 0 && p.tunings[id] < t.maxRank;
    });
}

/** Set out a shelf for a player: three Tunings from their own pools, one of them better than common. */
export function stock(seat: CampSeat, seed: string, p: Player, content: ContentRegistry): void {
  seat.shelf = rollOffers(seed, p.classId, p.tunings, content, 1, true);
  while (seat.shelf.length < OFFERS) seat.shelf.push('');
}

/** A player arrives at a camp: a shelf, a ration, and the Pool untouched. */
export function openCamp(seed: string, p: Player, content: ContentRegistry): CampSeat {
  const seat = noCamp();
  stock(seat, `${seed}/0`, p, content);
  seat.ration = true;
  return seat;
}

function heal(w: World, p: Player, amount: number): void {
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + Math.round(amount));
  if (p.hp > before) w.events.push({ type: 'heal', player: p.slot, amount: p.hp - before, x: p.x, y: p.y });
}

/**
 * Buy from the Tuner. Refused, with nothing changed, when the thing is not there to be bought,
 * the purse is short, or it would be wasted. Returns whether it was bought.
 */
export function buy(w: World, p: Player, seat: CampSeat, a: number, seed: string): boolean {
  if (!atCamp(seat)) return false;
  if (a === BUY_RATION) {
    if (!seat.ration || p.chimes < CAMP.ration || p.hp >= p.maxHp) return false;
    p.chimes -= CAMP.ration;
    seat.ration = false;
    heal(w, p, CAMP.rationHeal);
    return true;
  }
  if (a === BUY_RESTOCK) {
    const price = restockPrice(seat);
    if (p.chimes < price) return false;
    p.chimes -= price;
    seat.restocks++;
    stock(seat, `${seed}/${seat.restocks}`, p, w.content);
    return true;
  }
  const id = seat.shelf[a];
  const t = id ? w.content.tunings[id] : undefined;
  // it may have reached its top rank by another road since the shelf was set out
  if (!id || !t || (p.tunings[id] ?? 0) >= t.maxRank) return false;
  const price = priceOf(t);
  if (p.chimes < price) return false;
  p.chimes -= price;
  seat.shelf[a] = '';
  grantTuning(w, p, id);
  return true;
}

/**
 * Take the Still Pool's one thing: health back (`REST_HEAL`), or a rank of the Tuning at place
 * `a - 1` of `raisable`. With nothing to raise, place 1 is a little more health for good.
 */
export function rest(w: World, p: Player, seat: CampSeat, a: number): boolean {
  if (!atCamp(seat) || seat.rested) return false;
  if (a === REST_HEAL) {
    if (p.hp >= p.maxHp) return false;
    heal(w, p, p.maxHp * CAMP.heal);
  } else {
    const ids = raisable(p, w.content);
    if (ids.length === 0) {
      if (a !== 1) return false;
      p.maxHp += CAMP.gift;
      heal(w, p, CAMP.gift);
    } else {
      const id = ids[a - 1];
      if (!id) return false;
      grantTuning(w, p, id);
    }
  }
  seat.rested = true;
  return true;
}
