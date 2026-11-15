// The fork: three times a run the party splits. At a side-chamber every player walks into a
// short chamber of their own, at the same moment, and they meet again in the next chamber they
// share. Alone there is nothing to split: a side-chamber is simply a short fight. The session
// (session.ts) holds one world for each player while they are apart; this file says when the
// party splits, when a player's side-chamber is over, and how long the others wait.
import { standing } from './combat';
import type { Stop } from './run';
import { SIM_HZ } from './tuning';
import type { World } from './types';

export const FORK = {
  /** Once all but one of the party are done, how long the last has before they are fetched as they stand. */
  wait: 20 * SIM_HZ,
  /** The longest the party is ever apart. */
  most: 90 * SIM_HZ,
};

/** Does the party split up at this stop? Only where there is more than one of them. */
export const isFork = (stop: Stop | undefined, players: number): boolean => !!stop && stop.kind === 'solo' && players > 1;

/** Apart, a chamber is over for a player who has cleared it, or who has gone down in it. */
export const forkDone = (w: World): boolean => w.flow.phase === 'cleared' || !w.players.some(standing);
