// The Wager: the risk the road offers for a reward. When the chamber before an elite's is
// cleared and everyone has taken their card, the party is asked whether it will carry a Discord
// into the elite's chamber. Each player says yes or no within a count; the party takes it only
// if more than half say yes. Taken, the next chamber is played Brittle (everyone's greatest
// health is cut for as long as the fight lasts), and beating it pays double Chimes and a second
// card, a rare one.
import { SIM_HZ } from './tuning';
import type { World } from './types';

export const WAGER = {
  /** How long the party has to decide. */
  count: 10 * SIM_HZ,
  /** Brittle: the share of their greatest health everyone gives up for the chamber. */
  brittle: 0.3,
  /** What the chamber's Chimes are multiplied by, and how many more cards it pays. */
  chimes: 2,
  cards: 1,
};

export const VOTE_NONE = -1;
export const VOTE_WALK = 0;
export const VOTE_TAKE = 1;

export interface Wager {
  /** Ticks left to decide, or 0 when the Wager is not on the table. */
  timer: number;
  /** What each player has said: VOTE_TAKE, VOTE_WALK, or VOTE_NONE. */
  votes: number[];
  /** The Wager of this chamber has been decided (so it is offered once). */
  decided: boolean;
  /** The party took it: the next chamber, or the one being fought, is played under the Discord. */
  on: boolean;
  /** What the Discord took from each player's greatest health, given back when the chamber is cleared. */
  taken: number[];
}

export const noWager = (players: number): Wager => ({ timer: 0, votes: Array.from({ length: players }, () => VOTE_NONE), decided: false, on: false, taken: Array.from({ length: players }, () => 0) });

/** Is the Wager on the table, waiting for the party to answer? */
export const onTable = (wg: Wager): boolean => wg.timer > 0;

/** Put the Wager on the table. */
export function offer(wg: Wager): void {
  wg.timer = WAGER.count;
  wg.votes.fill(VOTE_NONE);
}

/** A player answers. They may change their mind until the table closes. */
export function vote(wg: Wager, slot: number, a: number): void {
  if (!onTable(wg) || slot < 0 || slot >= wg.votes.length) return;
  wg.votes[slot] = a === VOTE_TAKE ? VOTE_TAKE : VOTE_WALK;
}

/** Would the party take it, as the votes stand? More than half must have said yes: a tie walks on, and so does silence. */
export const carried = (wg: Wager): boolean => wg.votes.filter((v) => v === VOTE_TAKE).length * 2 > wg.votes.length;

/**
 * Count the table down one tick. It closes when everyone has answered or the count runs out, and
 * the party's answer stands from then on. Returns true on the tick it closes.
 */
export function stepTable(wg: Wager): boolean {
  if (!onTable(wg)) return false;
  wg.timer--;
  if (wg.timer > 0 && wg.votes.some((v) => v === VOTE_NONE)) return false;
  wg.timer = 0;
  wg.decided = true;
  wg.on = carried(wg);
  return true;
}

/** The party walks into the chamber it wagered on: everyone is Brittle, and the chamber pays double. */
export function discord(w: World, wg: Wager): void {
  w.flow.discord = 'brittle';
  w.flow.chimeMul = WAGER.chimes;
  for (const p of w.players) {
    const cut = Math.round(p.maxHp * WAGER.brittle);
    wg.taken[p.slot] = cut;
    p.maxHp -= cut;
    p.hp = Math.min(p.hp, p.maxHp);
  }
}

/** The wagered chamber is cleared: the Discord lifts, and what it took of everyone's greatest health comes back. */
export function lift(w: World, wg: Wager): void {
  for (const p of w.players) {
    p.maxHp += wg.taken[p.slot] ?? 0;
    wg.taken[p.slot] = 0;
  }
  wg.on = false;
}
