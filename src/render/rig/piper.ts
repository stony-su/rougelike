// The Piper.
import type { Animator, RigDef } from './def';
import { THRUM_RIG, thrumAnimator } from './thrum';

export const PIPER_RIG: RigDef = { ...THRUM_RIG, id: 'piper' };
export const piperAnimator: Animator = thrumAnimator;
