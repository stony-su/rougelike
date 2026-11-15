// The words the game uses for its own things, in one place: what each class is called, what its
// attack, its special and its dash do. The class cards, the heads-up display and the sheet a
// player holds Tab to read all say the same thing because they all read it here.
import type { ClassId } from '../sim/types';

export interface ClassWords {
  id: ClassId;
  /** What the class is called, and the weapon it carries. */
  name: string;
  weapon: string;
  /** Its basic attack, in a sentence or two. */
  attack: string;
  /** Its special: the name alone, and the name with what it does. */
  specialName: string;
  special: string;
  /** How it plays, in a line. */
  plays: string;
}

export const CLASS_WORDS: Readonly<Record<ClassId, ClassWords>> = {
  sword: {
    id: 'sword',
    name: 'Swordsman',
    weapon: 'Sword',
    attack: 'Every swing turns enemy shots back where you aim, and bats away an enemy caught in its own attack. Three cuts; the third launches.',
    specialName: 'Whirlwind',
    special: 'Whirlwind. Spin: all round you is cut and thrown back, shields are knocked open, and enemy shots fly home. Nothing can hurt you while you spin.',
    plays: 'Stand in the fire and aim your returns.',
  },
  bow: {
    id: 'bow',
    name: 'Archer',
    weapon: 'Bow',
    attack: 'Arrows bounce off walls and skip from one enemy to the next, harder with every bounce. The dotted line is the path the arrow will take.',
    specialName: 'Hook Shot',
    special: 'Hook Shot. Fire a line and be pulled along it, over pits and through enemies, unhurt. Your next three arrows leave at once.',
    plays: 'Read the angles of the room.',
  },
  fist: {
    id: 'fist',
    name: 'Brawler',
    weapon: 'Fist',
    attack: 'Jabs on the press; a jab knocks a shot aside. Hold the button to draw back a Heavy Punch that throws its target into walls and into its friends.',
    specialName: 'Stomp',
    special: 'Stomp. Throws everything near you outward; nothing can hurt you meanwhile. Attack right after it to fly to an enemy it struck and land three blows.',
    plays: 'Line up bodies and walls.',
  },
};

/** The classes in the order they are offered. */
export const CLASS_ORDER: readonly ClassId[] = ['sword', 'bow', 'fist'];

/** What the dash does, for every class. */
export const DASH_WORDS =
  'Dash. Four tiles in the way you are moving, and nothing can touch you on the way. Two charges that come back by themselves. An attack pressed in a dash comes straight out of it, further and harder.';
