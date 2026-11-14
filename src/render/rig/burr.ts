// The Burr.
import type { Animator, RigDef } from './def';
import { THRUM_RIG, thrumAnimator } from './thrum';

export const BURR_RIG: RigDef = { ...THRUM_RIG, id: 'burr' };
export const burrAnimator: Animator = thrumAnimator;
