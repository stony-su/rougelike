// Test fixtures. Rule tests run on plain rooms of their own so that editing the game's room
// templates can never change what a rule test measures.
import type { RoomTemplate } from '../src/sim/defs';

/** A walled box: 14 x 12 tiles of open floor (x 1..15, y 1..13), nothing in it. */
export const OPEN_ROOM: RoomTemplate = {
  id: 'test-open',
  name: 'Test Ground',
  zone: 'outer',
  kind: 'combat',
  map: [
    '######D####D####',
    '#..............#',
    '#.s..........s.#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#......r.......#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#.s..........s.#',
    '#......P.......#',
    '################',
  ],
};

/**
 * A walled box with one of everything a bounce can meet: cut corners, a post, a bumper and a
 * pit. Floor is x 1..17, y 1..11. The post is at (5.5, 3.5), the bumper at (12.5, 3.5), the pit
 * covers x 8..10, y 7..9.
 */
export const BOUNCE_ROOM: RoomTemplate = {
  id: 'test-bounce',
  name: 'Bounce Ground',
  zone: 'outer',
  kind: 'combat',
  map: [
    '######D#####D#####',
    '#7..............9#',
    '#.s............s.#',
    '#....o......B....#',
    '#................#',
    '#................#',
    '#.......r........#',
    '#.......~~.......#',
    '#.......~~.......#',
    '#.s............s.#',
    '#1......P.......3#',
    '##################',
  ],
};

/**
 * The open box with one of each trap in its floor: a plate of spikes at (5.5, 4.5), a knell at
 * (11.5, 4.5) and a thorn pipe at (3.5, 9.5).
 */
export const TRAP_ROOM: RoomTemplate = {
  id: 'test-traps',
  name: 'Trap Ground',
  zone: 'outer',
  kind: 'combat',
  map: [
    '################',
    '#..............#',
    '#.s..........s.#',
    '#..............#',
    '#....^.....K...#',
    '#..............#',
    '#..............#',
    '#......r.......#',
    '#..............#',
    '#..X...........#',
    '#..............#',
    '#.s..........s.#',
    '#......P.......#',
    '################',
  ],
};
