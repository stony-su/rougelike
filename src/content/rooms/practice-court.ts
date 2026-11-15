// A hand-built chamber. The legend of the map is in README.md, next to this file.
import type { RoomTemplate } from '../../sim/defs';

/** The practice court: bank walls, cut corners, four posts, two bumpers and a pit to knock things into. */
export const PRACTICE_COURT: RoomTemplate = {
  id: 'practice-court',
  name: 'Practice Court',
  zone: 'outer',
  kind: 'arena',
  map: [
    '########################',
    '##7..................9##',
    '#7.s................s.9#',
    '#......................#',
    '#....o.....B.....o.....#',
    '#......................#',
    '#......................#',
    '#.s.......~~.........s.#',
    '#.........~~...........#',
    '#......................#',
    '#.....o..........o.....#',
    '#......................#',
    '#..........r...........#',
    '#..s......B.........s..#',
    '#......................#',
    '#1..........P.........3#',
    '##1..................3##',
    '########################',
  ],
};

export default PRACTICE_COURT;
