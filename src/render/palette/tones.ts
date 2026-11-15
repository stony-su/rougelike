// The colour of each family of Tunings. A card, its emblem and what the Tuning does in play all
// wear the same tone, so a build can be read by its colours: cold blue streaks for the dash,
// gold for Rally, orange for fire, pale ice for frost, violet for lightning, green for the body,
// and one for each class.
import type { ToneId } from '../../sim/mods';

export interface Tone {
  /** What the family is called on a card. */
  name: string;
  /** The tone itself, a pale version for highlights and lettering, and a deep one for the ground behind them. */
  color: number;
  pale: number;
  deep: number;
}

export const TONES: Readonly<Record<ToneId, Tone>> = {
  dash: { name: 'Dash', color: 0x49c6f0, pale: 0xd3f3ff, deep: 0x0d3144 },
  rally: { name: 'Rally', color: 0xffc94d, pale: 0xfff1c9, deep: 0x47340c },
  fire: { name: 'Fire', color: 0xff6f3a, pale: 0xffd2b0, deep: 0x4a170a },
  frost: { name: 'Frost', color: 0xa8bdff, pale: 0xe6ecff, deep: 0x1a2756 },
  storm: { name: 'Lightning', color: 0xc07cff, pale: 0xf1e0ff, deep: 0x2d1452 },
  body: { name: 'Body', color: 0x6fdc97, pale: 0xd6f8e1, deep: 0x0f3d27 },
  sword: { name: 'The Edge', color: 0xdde6f5, pale: 0xffffff, deep: 0x2a3140 },
  bow: { name: 'The String', color: 0x5fd2c0, pale: 0xd2f6ef, deep: 0x0d3a36 },
  fist: { name: 'The Hand', color: 0xff9b78, pale: 0xffe0d2, deep: 0x4a2014 },
};

/** The gold of a rare card's frame, and the brass of an uncommon one. */
export const RARITY = {
  gold: 0xffd766,
  goldPale: 0xfff4c4,
  brass: 0xc9a45a,
  plain: 0x7d879a,
};
