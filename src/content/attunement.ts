// The Attunement: what Resonance buys, between runs. Each entry has one or more ranks, each rank
// a price, and each rank adds the same thing to what its holder brings to every run (boons.ts).
// An entry that names a Tuning is offered only once that Tuning exists.
import type { ClassId } from '../sim/types';

export interface AttuneDef {
  id: string;
  name: string;
  /** What each rank costs, in Resonance. Its length is how many ranks there are. */
  costs: number[];
  /** What it gives, in words, at each rank. */
  text: string[];
  /** What one rank adds. */
  gives: {
    health?: number;
    chimes?: number;
    rerolls?: number;
    dash?: number;
    fortune?: number;
    /** A locked Tuning its holder may now be offered. */
    unlock?: string;
    /** Its holder may start every run as this class with one of the class's own Tunings. */
    issue?: ClassId;
  };
}

/** Resonance a run earns: for each chamber cleared, for the Carillon, and for the Toll. */
export const RESONANCE = { chamber: 1, miniboss: 5, boss: 10 };

export const ATTUNEMENT: readonly AttuneDef[] = [
  { id: 'vitality', name: 'Vitality', costs: [5, 10, 18], text: ['10 more health', '20 more health', '30 more health'], gives: { health: 10 } },
  { id: 'purse', name: 'Purse', costs: [4, 9], text: ['Begin with 30 Chimes', 'Begin with 60 Chimes'], gives: { chimes: 30 } },
  { id: 'second-opinion', name: 'Second Opinion', costs: [6, 12], text: ['Once a run, ask for other cards', 'Twice a run, ask for other cards'], gives: { rerolls: 1 } },
  { id: 'quick-step', name: 'Quick Step', costs: [8], text: ['The dash comes back 15% sooner'], gives: { dash: 0.15 } },
  { id: 'fortune', name: 'Fortune', costs: [6], text: ['A fifth more Chimes'], gives: { fortune: 0.2 } },
  { id: 'signature-sword', name: 'Signature: Chorus', costs: [6], text: ['The Edge may be offered Chorus'], gives: { unlock: 'chorus' } },
  { id: 'signature-bow', name: 'Signature: Lodestone', costs: [6], text: ['The String may be offered Lodestone'], gives: { unlock: 'lodestone' } },
  { id: 'signature-fist', name: 'Signature: Tremor', costs: [6], text: ['The Hand may be offered Tremor'], gives: { unlock: 'tremor' } },
  { id: 'issue-sword', name: 'Issued: the Edge', costs: [10], text: ['The Edge begins with a Tuning of your choosing'], gives: { issue: 'sword' } },
  { id: 'issue-bow', name: 'Issued: the String', costs: [10], text: ['The String begins with a Tuning of your choosing'], gives: { issue: 'bow' } },
  { id: 'issue-fist', name: 'Issued: the Hand', costs: [10], text: ['The Hand begins with a Tuning of your choosing'], gives: { issue: 'fist' } },
];
