// The String, the Bow Returner.
import type { Animator, RigDef } from './def';
import { EDGE_RIG, edgeAnimator } from './edge';
import { HERO_STATES } from './states';

export const STRING_RIG: RigDef = { ...EDGE_RIG, id: 'string', states: HERO_STATES };
export const stringAnimator: Animator = edgeAnimator;
