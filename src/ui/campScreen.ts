// The camp, as a list laid over the chamber: what the Tuner sells, what the Still Pool gives, and
// the way on. Beside the list stands the card of whatever is pointed at. It shows only what it is
// told and reports which row the player points at; buying and resting are commands the game
// shell sends, so every laptop agrees on what was taken.
import { Container, Graphics } from 'pixi.js';
import { CHIME, PAPER, UI } from '../render/palette';
import { TONES } from '../render/palette/tones';
import type { ToneId } from '../sim/mods';
import { CARD_H, CARD_W, Card } from './cards';
import type { CardInfo } from './cards';
import { drawIcon } from './icons';
import { Label } from './label';
import { uiSound } from './sfx';
import { scrim } from './widgets';

/** What a row is, which decides the mark it wears. */
export type CampMark = 'tuning' | 'ration' | 'restock' | 'heal' | 'gift' | 'leave';

export interface CampRow {
  mark: CampMark;
  title: string;
  sub: string;
  /** Chimes it costs, or -1 for a thing that is not paid for. */
  price: number;
  /** Why it cannot be taken now, or '' when it can. */
  off: string;
  /** The card that stands beside the list while this row is pointed at, or null: then `note` stands there. */
  card: CardInfo | null;
  note: string;
  /** A Tuning's emblem and family. */
  icon: string;
  tone: ToneId | '';
  /** A heading above this row, or ''. */
  head: string;
}

const PAD = 36;
const LIST_W = 500;
const GAP = 44;
const ROW_H = 46;
const ROW_GAP = 6;
const HEAD_H = 36;
const TOP = 92;
const FOOT = 74;
const PANEL_W = PAD + LIST_W + GAP + CARD_W + PAD;

/** The small sign a row wears when it is not a Tuning, drawn about the origin. */
function drawMark(g: Graphics, mark: CampMark, color: number): void {
  const line = { width: 2, color, alpha: 0.95 };
  if (mark === 'ration') {
    g.circle(0, 0, 11).stroke(line);
    g.moveTo(-6, 0).lineTo(6, 0).moveTo(0, -6).lineTo(0, 6).stroke(line);
  } else if (mark === 'restock') {
    for (const x of [-9, 0, 9]) g.poly([x, -5, x + 4, 0, x, 5, x - 4, 0]).fill(color);
  } else if (mark === 'heal' || mark === 'gift') {
    // the pool: rings on still water
    g.ellipse(0, 0, 12, 7).stroke(line);
    g.ellipse(0, 0, 6, 3.5).stroke({ ...line, alpha: 0.6 });
    if (mark === 'gift') g.circle(0, 0, 1.6).fill(color);
  } else {
    // the way on
    g.moveTo(-7, -7).lineTo(1, 0).lineTo(-7, 7).moveTo(1, -7).lineTo(9, 0).lineTo(1, 7).stroke(line);
  }
}

class RowView extends Container {
  private readonly back = new Graphics();
  private readonly edge = new Graphics();

  constructor(readonly row: CampRow) {
    super();
    const off = row.off !== '';
    this.back.roundRect(0, 0, LIST_W, ROW_H, 6).fill({ color: UI.scrim, alpha: 1 });
    this.back.alpha = 0.72;
    this.edge.roundRect(0, 0, LIST_W, ROW_H, 6).stroke({ width: 2, color: UI.brass, alpha: 0.95 });
    this.edge.roundRect(0, 6, 4, ROW_H - 12, 2).fill(UI.brass);
    this.edge.visible = false;
    this.addChild(this.back, this.edge);

    const sign = new Graphics();
    sign.position.set(28, ROW_H / 2);
    const tone = row.tone ? TONES[row.tone] : null;
    if (tone) {
      sign.circle(0, 0, 15).fill({ color: tone.deep, alpha: 1 });
      sign.circle(0, 0, 15).stroke({ width: 1.5, color: tone.color, alpha: 0.9 });
      const emblem = new Graphics();
      drawIcon(emblem, row.icon, 9, tone.color, tone.pale);
      emblem.position.set(28, ROW_H / 2);
      this.addChild(sign, emblem);
    } else {
      drawMark(sign, row.mark, UI.brass);
      this.addChild(sign);
    }
    sign.alpha = off ? 0.5 : 1;

    const title = new Label(row.title, { size: 11, color: off ? UI.inkSoft : tone ? tone.pale : PAPER, bold: true, tracking: 0.12 });
    title.position.set(56, 9);
    const sub = new Label(off ? row.off : row.sub, { size: 8, color: UI.inkSoft, tracking: 0.14 });
    sub.position.set(56, 28);
    this.addChild(title, sub);

    if (row.price >= 0) {
      const price = new Label(String(row.price), { size: 12, color: off ? UI.inkSoft : CHIME, bold: true, tracking: 0.1, align: 'right' });
      price.position.set(LIST_W - 18, ROW_H / 2 - 6);
      const x = LIST_W - 18 - price.textWidth - 14;
      const gem = new Graphics().poly([x, ROW_H / 2 - 7, x + 6, ROW_H / 2, x, ROW_H / 2 + 7, x - 6, ROW_H / 2]).fill({ color: CHIME, alpha: off ? 0.4 : 1 });
      this.addChild(gem, price);
    }
  }

  setFocused(on: boolean): void {
    this.edge.visible = on;
    this.back.alpha = on ? 1 : 0.72;
  }
}

export class CampScreen {
  readonly root = new Container();
  private readonly shade = new Container();
  private readonly panel = new Container();
  private readonly glass = new Graphics();
  private readonly list = new Container();
  private readonly side = new Container();
  private readonly bar = new Graphics();
  private readonly title: Label;
  private readonly purse: Label;
  private readonly gem = new Graphics();
  private readonly hint: Label;
  private readonly status: Label;
  private rows: RowView[] = [];
  private signature = '';
  private shownSide = '';
  private card: Card | null = null;
  private selected = 0;
  private viewW = 1;
  private viewH = 1;
  private scale = 1;
  private height = TOP + CARD_H + FOOT;
  private shown = 0;

  constructor() {
    this.title = new Label('Camp', { size: 24, color: PAPER, bold: true, tracking: 0.3 });
    this.title.position.set(PAD, 30);
    this.purse = new Label('0', { size: 14, color: CHIME, bold: true, tracking: 0.1, align: 'right' });
    this.purse.position.set(PANEL_W - PAD, 34);
    this.hint = new Label('', { size: 9, color: UI.inkSoft, tracking: 0.2 });
    this.status = new Label('', { size: 9, color: CHIME, tracking: 0.2, align: 'right' });
    this.panel.addChild(this.glass, this.title, this.gem, this.purse, this.list, this.side, this.bar, this.hint, this.status);
    this.root.addChild(this.shade, this.panel);
    this.root.visible = false;
  }

  get open(): boolean {
    return this.root.visible;
  }

  /** The row the player is pointing at. */
  get choice(): number {
    return this.selected;
  }

  show(): void {
    if (this.root.visible) return;
    this.root.visible = true;
    this.shown = 0;
  }

  hide(): void {
    this.root.visible = false;
  }

  /** Lay the rows out. Nothing is rebuilt unless something about them has changed. */
  set(rows: readonly CampRow[], pad: boolean): void {
    const signature = `${pad}|${rows.map((r) => `${r.mark}/${r.title}/${r.sub}/${r.price}/${r.off}/${r.head}`).join('|')}`;
    if (signature === this.signature) return;
    this.signature = signature;
    for (const r of this.rows) r.destroy({ children: true });
    this.list.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.rows = [];
    let y = 0;
    for (const row of rows) {
      if (row.head) {
        const head = new Label(row.head, { size: 10, color: UI.brass, bold: true, tracking: 0.34 });
        head.position.set(4, y + (y > 0 ? 16 : 4));
        this.list.addChild(head);
        y += HEAD_H + (y > 0 ? 12 : 0);
      } else if (row.mark === 'leave') {
        y += 14;
      }
      const view = new RowView(row);
      view.position.set(0, y);
      this.list.addChild(view);
      this.rows.push(view);
      y += ROW_H + ROW_GAP;
    }
    this.list.position.set(PAD, TOP);
    this.height = Math.max(TOP + y + FOOT, TOP + CARD_H + FOOT);
    this.selected = Math.max(0, Math.min(this.rows.length - 1, this.selected));
    this.hint.text = pad ? 'Up and down      A  take      B  look round' : 'W S  choose      Enter  take      Esc  look round';
    this.glass
      .clear()
      .roundRect(0, 0, PANEL_W, this.height, 12)
      .fill({ color: UI.glass, alpha: 0.94 })
      .roundRect(0, 0, PANEL_W, this.height, 12)
      .stroke({ width: 2, color: UI.brass, alpha: 0.9 })
      .moveTo(PAD, 74)
      .lineTo(PANEL_W - PAD, 74)
      .stroke({ width: 1, color: UI.brass, alpha: 0.45 });
    this.hint.position.set(PAD, this.height - 34);
    this.status.position.set(PANEL_W - PAD, this.height - 34);
    this.shownSide = '';
    this.place();
  }

  layout(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.shade.removeChildren().forEach((c) => c.destroy());
    this.shade.addChild(scrim(w, h, 0.45));
    this.place();
  }

  private place(): void {
    this.scale = Math.min(1, (this.viewW * 0.96) / PANEL_W, (this.viewH * 0.94) / this.height);
    this.panel.scale.set(this.scale);
    this.panel.position.set((this.viewW - PANEL_W * this.scale) / 2, (this.viewH - this.height * this.scale) / 2);
  }

  /** Move the highlight one row up (-1) or down (1). */
  move(dir: number): void {
    if (this.rows.length === 0) return;
    const next = Math.max(0, Math.min(this.rows.length - 1, this.selected + dir));
    if (next !== this.selected) uiSound('move');
    this.selected = next;
  }

  /** Point at the row under the mouse. Returns its place in the list, or -1 if the mouse is over none. */
  pointAt(x: number, y: number): number {
    const lx = (x - this.panel.x) / this.scale - this.list.x;
    const ly = (y - this.panel.y) / this.scale - this.list.y;
    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i];
      if (lx >= 0 && lx <= LIST_W && ly >= r.y && ly <= r.y + ROW_H) {
        if (i !== this.selected) uiSound('move');
        this.selected = i;
        return i;
      }
    }
    return -1;
  }

  /** What stands beside the list: the card of the row pointed at, or a few words about it. */
  private showSide(): void {
    const view = this.rows[this.selected];
    const row = view ? view.row : null;
    const key = row ? `${row.title}/${row.sub}/${row.card ? row.card.rank : ''}` : '';
    if (key === this.shownSide) return;
    this.shownSide = key;
    this.side.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.card = null;
    if (!row) return;
    const x = PAD + LIST_W + GAP;
    if (row.card) {
      this.card = new Card(row.card, 0);
      this.card.position.set(x + CARD_W / 2, TOP + CARD_H / 2);
      this.side.addChild(this.card);
      return;
    }
    const box = new Graphics().roundRect(x, TOP, CARD_W, CARD_H, 12).stroke({ width: 1, color: UI.brass, alpha: 0.4 });
    const sign = new Graphics();
    drawMark(sign, row.mark, UI.brass);
    sign.position.set(x + CARD_W / 2, TOP + 96);
    sign.scale.set(3);
    const name = new Label(row.title, { size: 15, color: PAPER, bold: true, tracking: 0.14, align: 'center', maxWidth: CARD_W - 44, lineHeight: 1.6 });
    name.position.set(x + CARD_W / 2, TOP + 176);
    const words = new Label(row.note, { size: 10, color: UI.text, tracking: 0.06, align: 'center', maxWidth: CARD_W - 52, lineHeight: 2 });
    words.position.set(x + CARD_W / 2, TOP + 176 + name.textHeight + 26);
    this.side.addChild(box, sign, name, words);
  }

  /**
   * `chimes` is what the player has to spend, `status` a line about the others (who is being
   * waited for), and `left` the share of the wait that remains, 0..1, or -1 when nobody is waiting.
   */
  update(dt: number, chimes: number, status: string, left: number): void {
    if (!this.root.visible) return;
    this.shown = Math.min(1, this.shown + dt * 5);
    this.root.alpha = this.shown;
    this.rows.forEach((r, i) => r.setFocused(i === this.selected));
    this.showSide();
    this.card?.update(dt);
    this.purse.text = String(chimes);
    const gx = PANEL_W - PAD - this.purse.textWidth - 18;
    this.gem
      .clear()
      .poly([gx, 33, gx + 8, 42, gx, 51, gx - 8, 42])
      .fill(CHIME);
    this.status.text = status;
    this.bar.clear();
    if (left >= 0) {
      // the time the others have left, as a line that shortens toward its middle
      const half = ((PANEL_W - PAD * 2) * Math.max(0, Math.min(1, left))) / 2;
      this.bar
        .moveTo(PANEL_W / 2 - half, this.height - 14)
        .lineTo(PANEL_W / 2 + half, this.height - 14)
        .stroke({ width: 2, color: left < 0.25 ? CHIME : UI.brass, alpha: 0.85 });
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
