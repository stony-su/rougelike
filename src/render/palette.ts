// The palette, and the colour law.
//
// COLOUR LAW
//   - CHALK and RIPE belong to the player's geometry (stakes, lines, the Plot) and the hero's own accents.
//   - DANGER belongs to threats: telegraphs, hostile lines, damage taken.
//   - The environment never draws thin lines in either hue.
// Anything that needs a colour imports it from here; nothing else hard-codes a hex value.
import type { ZoneId } from '../sim/defs';

export const CHALK = 0xffd75e;
export const RIPE = 0xfff6d8;
export const DANGER = 0xff3b5c;
export const DANGER_HOT = 0xffc2cc;

/** Each seat's own colour: their ring, their trails, whatever they have sent back. Never used for danger. */
export const PLAYER_COLORS: readonly number[] = [0xffc24a, 0x4ad8ff, 0xb6f25a];
/** Run currency on the floor and in the purse. */
export const CHIME = 0xffe9a8;

export const PAPER = 0xe9e2d0;
export const INK = 0x1b2033;
export const RIM = 0xe8e4d8;
export const WHITE = 0xffffff;

/** Interface colours: ledger paper, its rulings, and the ink on it. */
export const UI = {
  paperDark: 0xd6cdb6,
  /** Pale blue ledger rulings. */
  rule: 0x7fa3c4,
  /** The ledger's margin line. Sepia, not red: red belongs to danger. */
  margin: 0xb08a64,
  scrim: 0x050d18,
  inkSoft: 0x4a5670,
  /** Marks something good on a paper form (affordable, complete). */
  good: 0x2f7a5a,
};

/** What a condition looks like on a body. */
export const STATUS = {
  frost: 0x9fe3ff,
  burn: 0xffb35c,
  root: 0xc9a27a,
  mark: 0xa8b8ff,
};

export const HERO = {
  coat: 0xd9cdb4,
  coatShade: 0x9c8f78,
  dark: 0x26303c,
  hat: 0x34424f,
  hatShade: 0x222c36,
  skin: 0xe6c7a4,
  satchel: 0x8a6b4f,
  strap: 0x5d4a3a,
  rodPale: 0xf4f1e8,
  rodBand: CHALK,
  rim: 0xfbf6e6,
};

export interface ZoneTheme {
  id: ZoneId;
  name: string;
  /** Screen clear colour: the unmeasured void. */
  voidColor: number;
  ground: number;
  groundDark: number;
  /** Slab side faces. */
  sideLeft: number;
  sideRight: number;
  contour: number;
  contourBright: number;
  highlight: number;
  /** Errata body wash in this zone. */
  inkWash: number;
  inkDark: number;
  /** Warm or cool accent used for props and ambient glow. */
  accent: number;
  /** Stone props. */
  stoneTop: number;
  stoneLeft: number;
  stoneRight: number;
}

export const ZONES: Record<ZoneId, ZoneTheme> = {
  bluefen: {
    id: 'bluefen',
    name: 'The Bluefen',
    voidColor: 0x061426,
    ground: 0x0e2a47,
    groundDark: 0x0a1f36,
    sideLeft: 0x0b233d,
    sideRight: 0x081a2e,
    contour: 0x2f6f9f,
    contourBright: 0x6fb4e0,
    highlight: 0xbfe9ff,
    inkWash: 0x4b5a8c,
    inkDark: 0x1b2033,
    accent: 0x6fb4e0,
    stoneTop: 0x5d89ab,
    stoneLeft: 0x35607f,
    stoneRight: 0x1f3f5a,
  },
  unruled: {
    id: 'unruled',
    name: 'The Unruled',
    voidColor: 0x0d0b0c,
    ground: 0x1e1a1c,
    groundDark: 0x151214,
    sideLeft: 0x191617,
    sideRight: 0x100e0f,
    contour: 0x5a5458,
    contourBright: 0x8a6b4f,
    highlight: 0xe9e2d0,
    inkWash: 0x6a5670,
    inkDark: 0x1d1820,
    accent: 0xf2a65a,
    stoneTop: 0x8c8079,
    stoneLeft: 0x5f5651,
    stoneRight: 0x3a3431,
  },
};

/** '#rrggbb' for Pixi options that want a CSS string. */
export const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
