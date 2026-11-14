// Every rig in the game, with its animator. Pixi-free: tests walk this to prove that each rig
// has each required animation state and that each state really moves; the gallery walks it to
// show them.
import { BURR_RIG, burrAnimator } from './burr';
import { CAIRN_RIG, cairnAnimator } from './cairn';
import type { Animator, RigDef } from './def';
import { EDGE_RIG, edgeAnimator } from './edge';
import { HAND_RIG, handAnimator } from './hand';
import { PIPER_RIG, piperAnimator } from './piper';
import { ENEMY_STATES, FIST_STATES, HERO_STATES, SWORD_STATES } from './states';
import { STRING_RIG, stringAnimator } from './string';
import { THRUM_RIG, thrumAnimator } from './thrum';

export interface RigEntry {
  def: RigDef;
  animator: Animator;
  /** States this kind of character must have. */
  required: readonly string[];
  /** States with more than one variant (e.g. the three swings of a combo). */
  variants: Record<string, number[]>;
}

export const RIGS: Record<string, RigEntry> = {
  edge: {
    def: EDGE_RIG,
    animator: edgeAnimator,
    required: SWORD_STATES,
    variants: { attack: [0, 1, 2] },
  },
  string: {
    def: STRING_RIG,
    animator: stringAnimator,
    required: HERO_STATES,
    variants: {},
  },
  hand: {
    def: HAND_RIG,
    animator: handAnimator,
    required: FIST_STATES,
    variants: { attack: [0, 1, 2] },
  },
  thrum: {
    def: THRUM_RIG,
    animator: thrumAnimator,
    required: ENEMY_STATES,
    variants: {},
  },
  piper: {
    def: PIPER_RIG,
    animator: piperAnimator,
    required: ENEMY_STATES,
    variants: {},
  },
  burr: {
    def: BURR_RIG,
    animator: burrAnimator,
    required: ENEMY_STATES,
    variants: {},
  },
  cairn: {
    def: CAIRN_RIG,
    animator: cairnAnimator,
    required: ENEMY_STATES,
    variants: { windup: [0, 1], attack: [0, 1], recover: [0, 1] },
  },
};

export function rigEntry(id: string): RigEntry {
  const r = RIGS[id];
  if (!r) throw new Error(`Unknown rig: ${id}`);
  return r;
}

/** The rig each class wears. */
export const HERO_RIG: Readonly<Record<'sword' | 'bow' | 'fist', string>> = { sword: 'edge', bow: 'string', fist: 'hand' };
