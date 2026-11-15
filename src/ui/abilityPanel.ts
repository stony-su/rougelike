// What a player's kit does, in words, without leaving the fight. Pointing at an emblem in the row
// along the bottom of the screen shows what that one does, in a small box above it; holding Tab
// (the View button on a controller) shows all of it at once: the class's attack, special and
// dash, and every upgrade held with the rank it is at. The game goes on underneath.
import { Container, Graphics } from 'pixi.js';
import { CHIME, PAPER, UI } from '../render/palette';
import { TONES } from '../render/palette/tones';
import type { ToneId } from '../sim/mods';
import { drawIcon } from './icons';
import { Label } from './label';
import { rankPips } from './widgets';

export interface AbilityLine {
  id: string;
  name: string;
  /** What it does at the rank held. */
  text: string;
  rank: number;
  maxRank: number;
  icon: string;
  tone: ToneId;
}

/** The lines every class has, whatever it has picked up: name and words. */
export interface KitLine {
  name: string;
  text: string;
}

const TIP_W = 330;
const SHEET_W = 1120;
const COLS = 3;
const PAD = 26;
const COL_GAP = 28;
const CELL_W = (SHEET_W - PAD * 2 - COL_GAP * (COLS - 1)) / COLS;

export class AbilityPanel {
  readonly root = new Container();
  private readonly tipBox = new Container();
  private readonly sheetBox = new Container();
  private tipFor = '';
  private sheetFor = '';
  private viewW = 1;
  private viewH = 1;
  private sheetH = 0;

  constructor() {
    this.root.addChild(this.sheetBox, this.tipBox);
    this.tipBox.visible = false;
    this.sheetBox.visible = false;
    this.root.eventMode = 'none';
  }

  layout(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.placeSheet();
  }

  /** Show what one upgrade does, in a box whose foot is at (x, y); `null` puts the box away. */
  tip(line: AbilityLine | null, x: number, y: number): void {
    if (!line) {
      this.tipBox.visible = false;
      return;
    }
    const key = `${line.id}/${line.rank}`;
    if (key !== this.tipFor) {
      this.tipFor = key;
      for (const c of this.tipBox.removeChildren()) c.destroy({ children: true });
      const tone = TONES[line.tone];
      const name = new Label(line.name, { size: 12, color: tone.pale, bold: true, tracking: 0.14, maxWidth: TIP_W - 40 });
      name.position.set(18, 16);
      const pips = rankPips(line.rank, line.maxRank, tone.color);
      pips.position.set(18, 16 + name.textHeight + 12);
      const text = new Label(line.text, { size: 9, color: PAPER, tracking: 0.05, maxWidth: TIP_W - 36, lineHeight: 1.8 });
      text.position.set(18, 16 + name.textHeight + 34);
      const tall = 16 + name.textHeight + 34 + text.textHeight + 18;
      const glass = new Graphics().roundRect(0, 0, TIP_W, tall, 8).fill({ color: UI.glass, alpha: 0.97 }).roundRect(0, 0, TIP_W, tall, 8).stroke({ width: 1.5, color: tone.color, alpha: 0.9 });
      this.tipBox.addChild(glass, name, pips, text);
      this.tipBox.pivot.set(TIP_W / 2, tall + 12);
    }
    // above what it speaks of, and never off the screen
    this.tipBox.position.set(Math.max(TIP_W / 2 + 8, Math.min(this.viewW - TIP_W / 2 - 8, x)), Math.max(this.tipBox.pivot.y + 8, y));
    this.tipBox.visible = true;
  }

  /**
   * Show the whole kit: the class's own lines, then every upgrade, then the pairs that are
   * switched on. `null` puts it away. It is laid out again only when something in it has changed.
   */
  sheet(title: string | null, kit: readonly KitLine[], lines: readonly AbilityLine[], pairs: readonly KitLine[]): void {
    if (title === null) {
      this.sheetBox.visible = false;
      return;
    }
    const key = `${title}|${kit.map((k) => k.name).join(',')}|${lines.map((l) => `${l.id}${l.rank}`).join(',')}|${pairs.map((p) => p.name).join(',')}`;
    if (key !== this.sheetFor) {
      this.sheetFor = key;
      for (const c of this.sheetBox.removeChildren()) c.destroy({ children: true });
      const body = new Container();
      const head = new Label(title, { size: 16, color: PAPER, bold: true, tracking: 0.24 });
      head.position.set(PAD, 22);
      body.addChild(head);

      // the class's own lines, side by side
      let y = 64;
      let rowTall = 0;
      kit.forEach((k, i) => {
        const x = PAD + (i % COLS) * (CELL_W + COL_GAP);
        const name = new Label(k.name, { size: 9, color: UI.brass, bold: true, tracking: 0.3 });
        name.position.set(x, y);
        const text = new Label(k.text, { size: 9, color: PAPER, tracking: 0.05, maxWidth: CELL_W, lineHeight: 1.8 });
        text.position.set(x, y + 20);
        body.addChild(name, text);
        rowTall = Math.max(rowTall, 20 + text.textHeight);
        if (i % COLS === COLS - 1 || i === kit.length - 1) {
          y += rowTall + 22;
          rowTall = 0;
        }
      });

      const rule = new Graphics();
      if (lines.length > 0) {
        rule
          .moveTo(PAD, y)
          .lineTo(SHEET_W - PAD, y)
          .stroke({ width: 1, color: UI.brass, alpha: 0.45 });
        y += 18;
      }
      body.addChild(rule);

      // every upgrade held: its emblem, its name, its rank, and what that rank does
      rowTall = 0;
      lines.forEach((l, i) => {
        const tone = TONES[l.tone];
        const x = PAD + (i % COLS) * (CELL_W + COL_GAP);
        const chip = new Graphics()
          .circle(x + 15, y + 15, 15)
          .fill({ color: tone.deep, alpha: 0.95 })
          .circle(x + 15, y + 15, 15)
          .stroke({ width: 1.5, color: tone.color, alpha: 0.9 });
        const emblem = new Graphics();
        drawIcon(emblem, l.icon, 9, tone.color, tone.pale);
        emblem.position.set(x + 15, y + 15);
        const name = new Label(l.name, { size: 10, color: tone.pale, bold: true, tracking: 0.14, maxWidth: CELL_W - 44 });
        name.position.set(x + 40, y + 3);
        const pips = rankPips(l.rank, l.maxRank, tone.color);
        pips.position.set(x + 40, y + 3 + name.textHeight + 9);
        const text = new Label(l.text, { size: 8.5, color: PAPER, tracking: 0.05, maxWidth: CELL_W - 44, lineHeight: 1.75 });
        text.position.set(x + 40, y + 3 + name.textHeight + 28);
        body.addChild(chip, emblem, name, pips, text);
        rowTall = Math.max(rowTall, 3 + name.textHeight + 28 + text.textHeight);
        if (i % COLS === COLS - 1 || i === lines.length - 1) {
          y += rowTall + 20;
          rowTall = 0;
        }
      });

      // the pairs that are switched on
      for (const p of pairs) {
        const name = new Label(p.name, { size: 9, color: CHIME, bold: true, tracking: 0.2 });
        name.position.set(PAD, y);
        const text = new Label(p.text, { size: 8.5, color: PAPER, tracking: 0.05, maxWidth: SHEET_W - PAD * 2 - name.textWidth - 18 });
        text.position.set(PAD + name.textWidth + 18, y);
        body.addChild(name, text);
        y += Math.max(12, text.textHeight) + 12;
      }

      this.sheetH = y + 12;
      const glass = new Graphics()
        .roundRect(0, 0, SHEET_W, this.sheetH, 12)
        .fill({ color: UI.glass, alpha: 0.9 })
        .roundRect(0, 0, SHEET_W, this.sheetH, 12)
        .stroke({ width: 2, color: UI.brass, alpha: 0.85 });
      this.sheetBox.addChild(glass, body);
      this.placeSheet();
    }
    this.sheetBox.visible = true;
  }

  private placeSheet(): void {
    if (this.sheetH <= 0) return;
    // as large as fits above the vitals, in the middle of the screen
    const scale = Math.min(1, (this.viewW - 40) / SHEET_W, (this.viewH - 60) / this.sheetH);
    this.sheetBox.scale.set(scale);
    this.sheetBox.position.set((this.viewW - SHEET_W * scale) / 2, Math.max(20, (this.viewH - this.sheetH * scale) / 2 - 20));
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
