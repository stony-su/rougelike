// The brains of the bosses, by the name an Echo's definition gives. One line for each: a brain
// is a file in this folder (see ../boss.ts for what it must do), imported and listed here. Lines
// are kept in the order of the alphabet, so two people adding two brains change different lines.
import type { BossBrain } from '../boss';

export const BRAINS: Readonly<Record<string, BossBrain>> = {};
