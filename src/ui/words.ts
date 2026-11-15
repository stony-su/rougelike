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
    name: 'The Edge',
    weapon: 'Sword',
    attack: 'Every swing turns enemy shots back where you aim, and bats away an Echo caught in its own attack. Three cuts; the third launches.',
    specialName: 'Whirlwind',
    special:
      'Whirlwind. One turn of the blade: everything round you is cut and thrown back, shields are knocked open, and every enemy shot in the circle flies home to whoever fired it. Nothing can hurt you while you turn.',
    plays: 'Stand in the fire and aim your returns.',
  },
  bow: {
    id: 'bow',
    name: 'The String',
    weapon: 'Bow',
    attack: 'Arrows bounce off walls and skip from one Echo to the next, harder with every bounce. The dotted line is the path the arrow will take.',
    specialName: 'Ringstone',
    special: 'Ringstone. A stone that sends shots and flung bodies on to the nearest Echo.',
    plays: 'Read the angles of the room.',
  },
  fist: {
    id: 'fist',
    name: 'The Hand',
    weapon: 'Fist',
    attack:
      'Jabs on the press, and a jab knocks a shot aside. Keep the button held to draw back a Haymaker that throws its target into walls and into its friends; held through a dash, the hand is part drawn when you land.',
    specialName: 'Break',
    special:
      'Break. A slam that pops everything near you outward and sends an orb home; nothing can hurt you while you slam. Attack right after it to fly to one of the Echoes it struck and land three blows.',
    plays: 'Line up bodies and walls.',
  },
};

/** The classes in the order they are offered. */
export const CLASS_ORDER: readonly ClassId[] = ['sword', 'bow', 'fist'];

/** What the dash does, for every class. */
export const DASH_WORDS =
  'Dash. Four tiles in the way you are moving, and nothing can touch you on the way. Two charges that come back by themselves. An attack pressed in a dash comes straight out of it, further and harder.';
