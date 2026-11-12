// Test fixtures. Rule tests run on a plain open room so that editing the game's own room
// templates can never change what a rule test measures.
import type { RoomTemplate } from '../src/sim/defs';

/** 14 x 12, all floor, no pillars. */
export const OPEN_ROOM: RoomTemplate = {
  id: 'test-open',
  name: 'Test Ground',
  zone: 'bluefen',
  kind: 'combat',
  map: [
    '.....D...D....',
    '.s..........s.',
    '..............',
    '..............',
    '..............',
    '..............',
    '......r.......',
    '..............',
    '..............',
    '..............',
    '.s..........s.',
    '......P.......',
  ],
};
