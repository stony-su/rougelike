// What a player has built, as a row of small emblems along the bottom of the screen: each
// Tuning's own picture in its family's colour, with a pip for each rank. The Harmonies that are
// switched on are joined by a bright bar under the two emblems that make them.
import { Container, Graphics } from 'pixi.js';
import { CHIME, UI } from '../render/palette';
import { TONES } from '../render/palette/tones';
import type { ToneId } from '../sim/mods';
import { drawIcon } from './icons';

export interface HeldTuning {
  id: string;
  icon: string;
  tone: ToneId;
  rank: number;
}

const SIZE = 30;
const GAP = 6;

export class TuningRow {
  readonly root = new Container();
  private shown = '';
  /** The ids shown, in the order they stand. */
  private ids: string[] = [];

  /** Show these Tunings, in this order. `joined` lists pairs of ids that make a Harmony. */
  set(held: readonly HeldTuning[], joined: ReadonlyArray<readonly [string, string]>): void {
    const key = `${held.map((h) => `${h.id}${h.rank}`).join(',')}|${joined.length}`;
    if (key === this.shown) return;
    this.shown = key;
    this.ids = held.map((h) => h.id);
    for (const c of this.root.removeChildren()) c.destroy({ children: true });
    const at = new Map<string, number>();
    held.forEach((h, i) => {
      const tone = TONES[h.tone];
      const x = i * (SIZE + GAP) + SIZE / 2;
      at.set(h.id, x);
      const chip = new Graphics();
      chip.circle(x, SIZE / 2, SIZE / 2).fill({ color: tone.deep, alpha: 0.92 });
      chip.circle(x, SIZE / 2, SIZE / 2).stroke({ width: 1.5, color: tone.color, alpha: 0.9 });
      // a pip for each rank, under the emblem
      for (let r = 0; r < h.rank; r++) chip.circle(x + (r - (h.rank - 1) / 2) * 6, SIZE + 5, 2).fill(tone.pale);
      const emblem = new Graphics();
      drawIcon(emblem, h.icon, SIZE * 0.3, tone.color, tone.pale);
      emblem.position.set(x, SIZE / 2);
      this.root.addChild(chip, emblem);
    });
    const bars = new Graphics();
    for (const [a, b] of joined) {
      const xa = at.get(a);
      const xb = at.get(b);
      if (xa === undefined || xb === undefined) continue;
      bars
        .moveTo(xa, SIZE + 11)
        .lineTo(xa, SIZE + 15)
        .lineTo(xb, SIZE + 15)
        .lineTo(xb, SIZE + 11);
    }
    bars.stroke({ width: 1.5, color: CHIME, alpha: 0.9 });
    this.root.addChild(bars);
    // a quiet ground behind the row so it reads over any floor
    if (held.length > 0) {
      const ground = new Graphics().roundRect(-8, -6, held.length * (SIZE + GAP) - GAP + 16, SIZE + 28, 8).fill({ color: UI.glass, alpha: 0.55 });
      this.root.addChildAt(ground, 0);
    }
  }

  /**
   * The emblem under a point of the screen, as its id and the middle of its top edge (where a box
   * of words about it should stand), or null. The row is taken to be drawn unscaled.
   */
  hit(x: number, y: number, out: { x: number; y: number }): string | null {
    const lx = x - this.root.x;
    const ly = y - this.root.y;
    if (ly < -6 || ly > SIZE + 22) return null;
    const i = Math.floor((lx + GAP / 2) / (SIZE + GAP));
    if (i < 0 || i >= this.ids.length) return null;
    out.x = this.root.x + i * (SIZE + GAP) + SIZE / 2;
    out.y = this.root.y - 6;
    return this.ids[i];
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
