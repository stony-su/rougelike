// Room templates. A room is an ASCII tile map: row index is world y, column index is world x.
// World (0, 0) is the far (top) corner on screen; x runs down-right, y runs down-left.
//
// Legend:
//   .  floor
//   o  round post (blocks movement, stands in the tile's centre)
//   b  a flat mark on the floor, decoration only
//   s  spawn mark: enemies may appear here
//   P  where the party starts (near the bottom corner)
//   D  door slot. Doors stand on the far edges: row 0 or column 0.
//   r  the room's focus: where a reward or a boss stands
//   (space) or #  void
//
// The validator (src/sim/room.ts, checked by tests) requires exactly one P and one r, at least
// one D on row 0 or column 0, every floor tile reachable from P, and at least four spawn marks
// well away from P and not tucked behind a post.
import type { RoomTemplate } from '../sim/defs';

export const PRACTICE_COURT: RoomTemplate = {
  id: 'practice-court',
  name: 'Practice Court',
  zone: 'bluefen',
  kind: 'arena',
  map: [
    '......D....D......',
    '.s..............s.',
    '..................',
    '....o........o....',
    '..................',
    '..................',
    '.s......b.......s.',
    '........r.........',
    '..................',
    '..................',
    '....o........o....',
    '..................',
    '.s..............s.',
    '........P.........',
  ],
};

export const ROOM_TEMPLATES: readonly RoomTemplate[] = [PRACTICE_COURT];

export function roomTemplate(id: string): RoomTemplate {
  const t = ROOM_TEMPLATES.find((r) => r.id === id);
  if (!t) throw new Error(`Unknown room template: ${id}`);
  return t;
}
