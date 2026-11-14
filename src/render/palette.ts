// The palette, and the colour law.
//
// COLOUR LAW
//   - The three PLAYER_COLORS belong to players and to whatever they have sent back: their ring,
//     their trails, their returned shots, their damage numbers.
//   - DANGER belongs to threats only: telegraphs, enemy shots, damage taken.
//   - Chambers never use either as a thin bright line.
// Anything that needs a colour imports it from here; nothing else hard-codes a hex value.
import type { ZoneId } from '../sim/defs';

export const DANGER = 0xff3b5c;
export const DANGER_HOT = 0xffc2cc;

/** Each seat's own colour. Never used for danger. */
export const PLAYER_COLORS: readonly number[] = [0xffc24a, 0x4ad8ff, 0xb6f25a];
/** A paler twin of each seat's colour, for the bright core of a trail or a ring. */
export const PLAYER_PALE: readonly number[] = [0xffe9b8, 0xc2f1ff, 0xe4fbbf];
/** Run currency on the floor and in the purse. */
export const CHIME = 0xffe9a8;
/** Rally: the colour of a Return, from the first note to a full meter. */
export const RALLY = { low: 0xffe9a8, high: 0xffffff };

export const INK = 0x10131c;
export const RIM = 0xf1ecdd;
export const WHITE = 0xffffff;
export const PAPER = 0xf2ead8;

/** Earlier accents still used by the lettering and the oldest effects. */
export const CHALK = 0xffd75e;
export const RIPE = 0xfff6d8;

/** Interface colours: dark glass, brass edges, pale lettering. */
export const UI = {
  glass: 0x0e1420,
  brass: 0xc9a45a,
  text: 0xf2ead8,
  inkSoft: 0x9aa3b5,
  good: 0x7fe0a0,
  scrim: 0x05080e,
  /** Kept for the panels that have not been restyled yet. */
  paperDark: 0xd6cdb6,
  rule: 0x7fa3c4,
  margin: 0xb08a64,
};

/** What a condition looks like on a body. */
export const STATUS = {
  frost: 0x9fe3ff,
  burn: 0xffb35c,
  root: 0xc9a27a,
  mark: 0xa8b8ff,
  stagger: 0xfff0b0,
};

/** The three Returners. Each also wears their seat's colour as a sash and on the weapon. */
export const HERO = {
  skin: 0xe6c7a4,
  skinShade: 0xb8946f,
  dark: 0x232a38,
  darkShade: 0x151a24,
  /** The Edge: a long slate coat. */
  coat: 0x7d8aa6,
  coatShade: 0x4f5a75,
  steel: 0xe8eef5,
  steelShade: 0x9aa6b8,
  /** The String: a moss hood. */
  hood: 0x6f9a6a,
  hoodShade: 0x466b47,
  wood: 0xa8774a,
  woodShade: 0x6e4a2c,
  /** The Hand: bare arms, a rust wrap, drumhead gauntlets. */
  wrap: 0xb5563c,
  wrapShade: 0x7a3526,
  hide: 0xe9dcc0,
  hideShade: 0xb7a783,
  rim: RIM,
};

/** Echoes are mid-value washes with one bright eye; the wash comes from the chamber they haunt. */
export const ECHO = {
  eye: 0xffffff,
  pupil: 0x10131c,
  /** A Piper carries a reed, a Burr its bombs. */
  reed: 0xe7d9a8,
  reedShade: 0xa5925a,
  bomb: 0x2a2f3d,
  bombShade: 0x151821,
  fuse: 0xffb35c,
};

export interface ZoneTheme {
  id: ZoneId;
  name: string;
  /** Screen clear colour: what lies under and around the floating chamber. */
  voidColor: number;
  /** Two floor tones, laid as a quiet checker. */
  ground: number;
  groundDark: number;
  /** Walls: the top, the face that looks down-left, the face that looks down-right. */
  wallTop: number;
  wallLeft: number;
  wallRight: number;
  /** The slab under the floor, seen where the chamber ends. */
  sideLeft: number;
  sideRight: number;
  /** Pits: the rim wall and the depths. */
  pitWall: number;
  pitDeep: number;
  /** Quiet lines and marks on the floor. */
  contour: number;
  accent: number;
  highlight: number;
  /** Echo body wash in this zone. */
  inkWash: number;
  inkDark: number;
  /** Bumpers: the drum and its lit face. */
  bumper: number;
  bumperHot: number;
}

export const ZONES: Record<ZoneId, ZoneTheme> = {
  // Reedwater: jade wetland
  outer: {
    id: 'outer',
    name: 'The Outer Ring',
    voidColor: 0x06202a,
    ground: 0x1d4a3f,
    groundDark: 0x183f36,
    wallTop: 0x5f9a7a,
    wallLeft: 0x3a7560,
    wallRight: 0x2f6654,
    sideLeft: 0x143830,
    sideRight: 0x0f2c27,
    pitWall: 0x0f2f2c,
    pitDeep: 0x04161d,
    contour: 0x2d6657,
    accent: 0x9be3b0,
    highlight: 0xe6fff0,
    inkWash: 0x6a5fb0,
    inkDark: 0x2a2450,
    bumper: 0x3f8f8a,
    bumperHot: 0xbff7e6,
  },
  // Cinder Terraces: basalt over lava
  inner: {
    id: 'inner',
    name: 'The Inner Ring',
    voidColor: 0x1a0a06,
    ground: 0x2a2422,
    groundDark: 0x231e1c,
    wallTop: 0x6a5a52,
    wallLeft: 0x463a35,
    wallRight: 0x3a302c,
    sideLeft: 0x1c1817,
    sideRight: 0x141110,
    pitWall: 0x2a1410,
    pitDeep: 0x120604,
    contour: 0x3d3431,
    accent: 0xffb35c,
    highlight: 0xffe9c9,
    inkWash: 0x7f9fc0,
    inkDark: 0x2c3d52,
    bumper: 0x8a5a3a,
    bumperHot: 0xffd9a8,
  },
};

/** '#rrggbb' for Pixi options that want a CSS string. */
export const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
