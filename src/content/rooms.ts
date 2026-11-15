// Room templates. A room is an ASCII tile map: row index is world y, column index is world x.
// World (0, 0) is the far (top) corner on screen; x runs down-right, y runs down-left.
//
// Legend:
//   #        wall: shots and launched bodies bounce off it
//   7 9 1 3  a wall cut at 45 degrees. The digit says which corner of the tile is solid, as on a
//            numeric keypad (7 top-left, 9 top-right, 1 bottom-left, 3 bottom-right)
//   ~        pit: nobody walks in, shots fly over, a launched body falls in
//   .        floor
//   o        round post (stands in the middle of the tile)
//   B        bumper: a post that kicks back harder
//   b        a flat mark on the floor, decoration only
//   s        spawn mark: enemies may appear here
//   P        where the party starts (near the bottom corner)
//   D        door slot, in a far wall: row 0 or column 0
//   r        the focus of the room: where a reward or a boss stands
//   (space)  nothing
//
// The validator (src/sim/room.ts, checked by tests) requires a closed arena, exactly one P and
// one r, every floor tile reachable from P on foot, and at least four spawn marks well away from
// P and not tucked behind a post.
import type { RoomTemplate } from '../sim/defs';

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

/** The survey ground: long cut walls for bank shots, four hexagon pillars, two bumpers and a pair of pits. */
export const SURVEY_GROUND: RoomTemplate = {
  id: 'survey-ground',
  name: 'Survey Ground',
  zone: 'inner',
  kind: 'arena',
  look: 'survey',
  map: [
    '######################',
    '####7............9####',
    '###7..............9###',
    '##7....s......s....9##',
    '#7..................9#',
    '#.....o........o.....#',
    '#....................#',
    '#..s....~~..~~....s..#',
    '#.......~~..~~.......#',
    '#....B.....r....B....#',
    '#....................#',
    '#.....o........o.....#',
    '#1..................3#',
    '##1...s........s...3##',
    '###1..............3###',
    '####1.....P......3####',
    '######################',
  ],
};

export const ROOM_TEMPLATES: readonly RoomTemplate[] = [PRACTICE_COURT, SURVEY_GROUND];

export function roomTemplate(id: string): RoomTemplate {
  const t = ROOM_TEMPLATES.find((r) => r.id === id);
  if (!t) throw new Error(`Unknown room template: ${id}`);
  return t;
}
