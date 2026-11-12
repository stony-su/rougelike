// Room templates. A room is an ASCII tile map: row index is world y, column index is world x.
// World (0, 0) is the far (top) corner on screen; x runs down-right, y runs down-left.
//
// Legend:
//   .  floor
//   o  round pillar (blocks movement, stands in the tile's centre)
//   b  boundary stone: a flat mark on the floor, decoration only
//   s  spawn mark: enemies may appear here
//   P  player start
//   D  door slot (exit). Doors stand on the far edges (row 0 or column 0).
//   r  reward / interactable spot
//   (space) or #  void
//
// Rules the validator enforces: at most 16 x 16 tiles, exactly one P, at least one D,
// every floor tile reachable from P, at least four spawn marks in combat rooms.

export type ZoneId = 'bluefen' | 'unruled';
export type RoomKind = 'combat' | 'tutorial' | 'shop' | 'rest' | 'event' | 'miniboss' | 'boss';

export interface RoomTemplate {
  id: string;
  name: string;
  zone: ZoneId;
  kind: RoomKind;
  map: readonly string[];
}

export const ROOM_TEMPLATES: readonly RoomTemplate[] = [
  {
    id: 'bluefen-reedbed',
    name: 'Reedbed Traverse',
    zone: 'bluefen',
    kind: 'combat',
    map: [
      '.....D...D.   ',
      '...........   ',
      '..s.....s..   ',
      '...o..........',
      '..........o...',
      '.....b........',
      '......r.......',
      '........b.....',
      '...o..........',
      '   .......o...',
      '   ..s.....s..',
      '   ......P....',
    ],
  },
];

export function roomTemplate(id: string): RoomTemplate {
  const t = ROOM_TEMPLATES.find((r) => r.id === id);
  if (!t) throw new Error(`Unknown room template: ${id}`);
  return t;
}
