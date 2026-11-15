// The brains of the bosses, by the name an Echo's definition gives. One line for each: a brain
// is a file in this folder (see ../boss.ts for what it must do), imported and listed here. Lines
// are kept in the order of the alphabet, so two people adding two brains change different lines.
import type { BossBrain } from '../boss';
import { CARILLON_BRAIN } from './carillon';
import { TOLL_BRAIN } from './toll';

export const BRAINS: Readonly<Record<string, BossBrain>> = {
  [CARILLON_BRAIN.id]: CARILLON_BRAIN,
  [TOLL_BRAIN.id]: TOLL_BRAIN,
};
