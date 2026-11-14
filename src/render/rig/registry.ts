// Every rig in the game, with its animator. Pixi-free: tests walk this to prove that each rig
// has each required animation state and that each state really moves; the gallery walks it to
// show them.
import { CAIRN_RIG, cairnAnimator } from './cairn';
import { CHAINMAN, chainmanAnimator } from './chainman';
import type { Animator, RigDef } from './def';
import { HACHURE_RIG, hachureAnimator } from './hachure';
import { SHEARWING_RIG, shearwingAnimator } from './shearwing';
import { SMUDGE_RIG, smudgeAnimator } from './smudge';
import { ENEMY_STATES, PLAYER_STATES } from './states';

export interface RigEntry {
  def: RigDef;
  animator: Animator;
  /** States this kind of character must have. */
  required: readonly string[];
  /** States with more than one variant (e.g. the three swings of a combo). */
  variants: Record<string, number[]>;
}

export const RIGS: Record<string, RigEntry> = {
  chainman: {
    def: CHAINMAN,
    animator: chainmanAnimator,
    required: PLAYER_STATES,
    variants: { swing: [0, 1, 2] },
  },
  cairn: {
    def: CAIRN_RIG,
    animator: cairnAnimator,
    required: ENEMY_STATES,
    variants: { windup: [0, 1], attack: [0, 1], recover: [0, 1] },
  },
  smudge: {
    def: SMUDGE_RIG,
    animator: smudgeAnimator,
    required: ENEMY_STATES,
    variants: {},
  },
  shearwing: {
    def: SHEARWING_RIG,
    animator: shearwingAnimator,
    required: ENEMY_STATES,
    variants: {},
  },
  hachure: {
    def: HACHURE_RIG,
    animator: hachureAnimator,
    required: ENEMY_STATES,
    variants: {},
  },
};

export function rigEntry(id: string): RigEntry {
  const r = RIGS[id];
  if (!r) throw new Error(`Unknown rig: ${id}`);
  return r;
}
