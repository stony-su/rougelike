// Every rig in the game, with its animator. Pixi-free: tests walk this to prove that each rig
// has each required animation state and that each state really moves; the gallery walks it to
// show them.
import { CHAINMAN, chainmanAnimator } from './chainman';
import type { Animator, RigDef } from './def';

export interface RigEntry {
  def: RigDef;
  animator: Animator;
  /** States this kind of character must have. */
  required: readonly string[];
  /** States with more than one variant (e.g. the three swings of a combo). */
  variants: Record<string, number[]>;
}

/** What the brief asks of the player and of every enemy. */
export const PLAYER_STATES = ['idle', 'run', 'dash', 'swing', 'shot', 'plant', 'whip', 'hurt', 'dead'] as const;
export const ENEMY_STATES = ['spawn', 'idle', 'move', 'windup', 'attack', 'recover', 'hurt', 'stun', 'dead'] as const;

export const RIGS: Record<string, RigEntry> = {
  chainman: {
    def: CHAINMAN,
    animator: chainmanAnimator,
    required: PLAYER_STATES,
    variants: { swing: [0, 1, 2] },
  },
};
