// The Hand, the Fist Returner.
import type { Animator, RigDef } from './def';
import { EDGE_RIG, edgeAnimator } from './edge';
import { FIST_STATES } from './states';

export const HAND_RIG: RigDef = { ...EDGE_RIG, id: 'hand', states: FIST_STATES };
export const handAnimator: Animator = edgeAnimator;
