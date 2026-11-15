// A hand-built chamber. The legend of the map is in README.md, next to this file.
import type { RoomTemplate } from '../../sim/defs';

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

export default SURVEY_GROUND;
