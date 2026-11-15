// The draft: three Tunings laid over the chamber after a fight. It only shows what the session
// says is on offer and reports which card the player points at; taking a card is a command the
// game shell sends, so every laptop agrees on what was taken.
import { Container, Graphics } from 'pixi.js';
import { CHIME, PAPER, UI } from '../render/palette';
import { CARD_H, CARD_W, Card } from './cards';
import type { CardInfo } from './cards';
import { Label } from './label';
import { uiSound } from './sfx';
import { scrim } from './widgets';

const GAP = 34;

export class DraftScreen {
  readonly root = new Container();
  private readonly shade = new Container();
  private readonly row = new Container();
  private readonly bar = new Graphics();
  private readonly title: Label;
  private readonly hint: Label;
  private cards: Card[] = [];
  private selected = 0;
  private viewW = 1;
  private viewH = 1;
  private scale = 1;
  private shown = 0;

  constructor() {
    this.title = new Label('Choose a Tuning', { size: 20, color: PAPER, bold: true, tracking: 0.3, align: 'center' });
    this.hint = new Label('', { size: 9, color: UI.inkSoft, tracking: 0.2, align: 'center' });
    this.root.addChild(this.shade, this.title, this.row, this.bar, this.hint);
    this.root.visible = false;
  }

  get open(): boolean {
    return this.root.visible;
  }

  /** The card the player is pointing at. */
  get choice(): number {
    return this.selected;
  }

  /** Lay out a new offer. `pad` chooses which prompts the hint shows. */
  show(infos: readonly CardInfo[], pad: boolean, rerolls: number): void {
    for (const c of this.cards) c.destroy({ children: true });
    this.cards = infos.map((info, i) => new Card(info, i + 1));
    this.row.removeChildren();
    for (const c of this.cards) this.row.addChild(c);
    this.selected = Math.min(1, this.cards.length - 1);
    this.hint.text = `${pad ? 'Left and right, then A' : '1, 2 or 3, or point and click'}${rerolls > 0 ? `      ${pad ? 'X' : 'R'}: other cards (${rerolls} left)` : ''}`;
    this.shown = 0;
    this.root.visible = true;
    this.place();
  }

  hide(): void {
    this.root.visible = false;
  }

  layout(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.shade.removeChildren().forEach((c) => c.destroy());
    this.shade.addChild(scrim(w, h, 0.5));
    this.place();
  }

  private place(): void {
    const n = Math.max(1, this.cards.length);
    const wide = n * CARD_W + (n - 1) * GAP;
    // the row always fits, with room for the title above and the hint below
    this.scale = Math.min(1, (this.viewW * 0.92) / wide, (this.viewH * 0.66) / CARD_H);
    const cy = this.viewH * 0.52;
    this.cards.forEach((c, i) => {
      c.position.set((i - (n - 1) / 2) * (CARD_W + GAP), 0);
    });
    this.row.position.set(this.viewW / 2, cy);
    this.row.scale.set(this.scale);
    this.title.position.set(this.viewW / 2, cy - (CARD_H / 2) * this.scale - 62);
    this.hint.position.set(this.viewW / 2, cy + (CARD_H / 2) * this.scale + 44);
  }

  /** Move the highlight one card left (-1) or right (1). */
  move(dir: number): void {
    if (this.cards.length === 0) return;
    const next = Math.max(0, Math.min(this.cards.length - 1, this.selected + dir));
    if (next !== this.selected) uiSound('move');
    this.selected = next;
  }

  /** Point at the card under the mouse. Returns its index, or -1 if the mouse is over none. */
  pointAt(x: number, y: number): number {
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i];
      const cx = this.row.x + c.x * this.scale;
      const cy = this.row.y + c.y * this.scale;
      if (Math.abs(x - cx) <= (CARD_W / 2) * this.scale && Math.abs(y - cy) <= (CARD_H / 2) * this.scale) {
        if (i !== this.selected) uiSound('move');
        this.selected = i;
        return i;
      }
    }
    return -1;
  }

  /** `left` is the share of the choosing time that remains, 0..1. */
  update(dt: number, left: number): void {
    if (!this.root.visible) return;
    this.shown = Math.min(1, this.shown + dt * 4);
    this.root.alpha = this.shown;
    this.cards.forEach((c, i) => {
      c.setSelected(i === this.selected);
      c.update(dt);
    });
    // the time left to choose, as a line that shortens toward its middle
    const half = (Math.min(this.viewW * 0.4, 420) * Math.max(0, Math.min(1, left))) / 2;
    const y = this.hint.y + 26;
    this.bar
      .clear()
      .moveTo(this.viewW / 2 - half, y)
      .lineTo(this.viewW / 2 + half, y)
      .stroke({ width: 2, color: left < 0.25 ? CHIME : UI.brass, alpha: 0.85 });
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
