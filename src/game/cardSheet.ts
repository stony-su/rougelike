// The card sheet (?cards=sword, bow, fist, common or all): every upgrade's card side by side, at
// the rank asked for (?rank=1..3, the last by default: its lines are the longest), each as it
// looks when it would complete its pair. One screenshot shows whether any card's words run into
// its lines or off its foot. A development and verification tool, like the gallery.
import { Container } from 'pixi.js';
import type { Application } from 'pixi.js';
import { CONTENT } from '../content';
import { ZONES } from '../render/palette';
import { CARD_H, CARD_W, Card } from '../ui/cards';
import { cardInfo } from './cardInfo';

const GAP = 18;

export class CardSheet {
  private readonly root = new Container();

  constructor(
    private readonly app: Application,
    which: string,
    rank: number,
  ) {
    app.renderer.background.color = ZONES.crater.voidColor;
    app.stage.addChild(this.root);
    const ids = Object.keys(CONTENT.tunings)
      .filter((id) => which === 'all' || CONTENT.tunings[id].owner === which)
      .sort((a, b) => (CONTENT.tunings[a].owner + CONTENT.tunings[a].build + a < CONTENT.tunings[b].owner + CONTENT.tunings[b].build + b ? -1 : 1));
    for (const id of ids) {
      const t = CONTENT.tunings[id];
      // held one rank below the one shown, and holding the other half of its pair: the fullest card it can be
      const held: Record<string, number> = { [id]: Math.max(0, Math.min(t.maxRank, rank > 0 ? rank : t.maxRank) - 1) };
      const pair = CONTENT.harmonies.find((h) => h.parents.includes(id));
      if (pair) held[pair.parents[0] === id ? pair.parents[1] : pair.parents[0]] = 1;
      this.root.addChild(new Card(cardInfo(id, held, CONTENT), 1));
    }
    app.ticker.add(this.layout, this);
  }

  private layout(): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const n = this.root.children.length;
    if (n === 0) return;
    // the grid, of as many columns as makes the cards largest
    let best = { cols: 1, scale: 0 };
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const scale = Math.min((w - GAP) / (cols * (CARD_W + GAP)), (h - GAP) / (rows * (CARD_H + GAP)));
      if (scale > best.scale) best = { cols, scale };
    }
    const rows = Math.ceil(n / best.cols);
    this.root.scale.set(best.scale);
    const left = (w / best.scale - best.cols * (CARD_W + GAP) + GAP) / 2;
    const top = (h / best.scale - rows * (CARD_H + GAP) + GAP) / 2;
    this.root.children.forEach((c, i) => {
      c.position.set(left + (i % best.cols) * (CARD_W + GAP) + CARD_W / 2, top + Math.floor(i / best.cols) * (CARD_H + GAP) + CARD_H / 2);
    });
  }
}
