// The Wager, put to the party: two answers side by side, what each of the party has said so far,
// and the count running down. It shows only what it is told; an answer is a command the game
// shell sends, so every laptop counts the same votes.
import { Container, Graphics } from 'pixi.js';
import { CHIME, DANGER, PAPER, PLAYER_COLORS, RIM, UI } from '../render/palette';
import { Label } from './label';
import { uiSound } from './sfx';
import { scrim } from './widgets';

const W = 820;
const H = 470;
const PAD = 36;
const BOX_W = (W - PAD * 2 - 28) / 2;
const BOX_H = 196;
const BOX_Y = 138;

export interface WagerSeat {
  name: string;
  /** 1 take it, 0 walk on, -1 has not said. */
  vote: number;
}

export interface WagerWords {
  /** What the Discord does, and what winning under it pays. */
  risk: string;
  prize: string;
}

class Choice extends Container {
  private readonly edge = new Graphics();
  private readonly mine = new Label('Your answer', { size: 8, color: CHIME, bold: true, tracking: 0.3, align: 'right' });

  constructor(title: string, lines: ReadonlyArray<readonly [string, number]>, color: number, key: string) {
    super();
    const back = new Graphics().roundRect(0, 0, BOX_W, BOX_H, 8).fill({ color: UI.scrim, alpha: 0.8 }).roundRect(0, 0, BOX_W, BOX_H, 8).stroke({ width: 1.5, color, alpha: 0.55 });
    this.edge.roundRect(-3, -3, BOX_W + 6, BOX_H + 6, 10).stroke({ width: 3, color, alpha: 1 });
    this.edge.visible = false;
    const head = new Label(title, { size: 16, color, bold: true, tracking: 0.18 });
    head.position.set(22, 22);
    this.addChild(this.edge, back, head);
    let y = 60;
    for (const [text, ink] of lines) {
      const line = new Label(text, { size: 10, color: ink, tracking: 0.06, maxWidth: BOX_W - 44, lineHeight: 1.9 });
      line.position.set(22, y);
      this.addChild(line);
      y += line.textHeight + 20;
    }
    const cap = new Graphics().roundRect(BOX_W - 48, 16, 28, 24, 4).stroke({ width: 1.5, color: UI.brass, alpha: 0.8 });
    const digit = new Label(key, { size: 10, color: UI.brass, bold: true, align: 'center' });
    digit.position.set(BOX_W - 34, 23);
    this.mine.position.set(BOX_W - 20, BOX_H - 24);
    this.mine.visible = false;
    this.addChild(cap, digit, this.mine);
  }

  set(focused: boolean, answered: boolean): void {
    this.edge.visible = focused;
    this.mine.visible = answered;
  }
}

export class WagerScreen {
  readonly root = new Container();
  private readonly shade = new Container();
  private readonly panel = new Container();
  private readonly bar = new Graphics();
  private readonly chips = new Container();
  private readonly hint: Label;
  private choices: Choice[] = [];
  private chipsKey = '';
  private selected = 0;
  private viewW = 1;
  private viewH = 1;
  private scale = 1;
  private shown = 0;

  constructor() {
    const glass = new Graphics()
      .roundRect(0, 0, W, H, 12)
      .fill({ color: UI.glass, alpha: 0.95 })
      .roundRect(0, 0, W, H, 12)
      .stroke({ width: 2, color: UI.brass, alpha: 0.9 })
      .moveTo(PAD, 74)
      .lineTo(W - PAD, 74)
      .stroke({ width: 1, color: UI.brass, alpha: 0.45 });
    const title = new Label('The Wager', { size: 24, color: PAPER, bold: true, tracking: 0.3 });
    title.position.set(PAD, 30);
    const ask = new Label('An elite holds the next chamber. Will the party carry a Discord into it?', { size: 10, color: UI.text, tracking: 0.08, maxWidth: W - PAD * 2 });
    ask.position.set(PAD, 96);
    this.hint = new Label('', { size: 9, color: UI.inkSoft, tracking: 0.2 });
    this.hint.position.set(PAD, H - 34);
    this.chips.position.set(PAD, BOX_Y + BOX_H + 26);
    this.panel.addChild(glass, title, ask, this.chips, this.bar, this.hint);
    this.root.addChild(this.shade, this.panel);
    this.root.visible = false;
  }

  get open(): boolean {
    return this.root.visible;
  }

  /** The answer pointed at: 0 take it, 1 walk on. */
  get choice(): number {
    return this.selected;
  }

  show(words: WagerWords, pad: boolean): void {
    if (this.root.visible) return;
    for (const c of this.choices) c.destroy({ children: true });
    this.choices = [
      new Choice(
        'Take it',
        [
          [words.risk, DANGER],
          [words.prize, CHIME],
        ],
        DANGER,
        '1',
      ),
      new Choice('Walk on', [['Nothing is risked, and nothing more is won. The elite is fought as it stands.', UI.text]], RIM, '2'),
    ];
    this.choices[0].position.set(PAD, BOX_Y);
    this.choices[1].position.set(PAD + BOX_W + 28, BOX_Y);
    this.panel.addChild(...this.choices);
    this.hint.text = pad ? 'Left and right, then A      More than half must say yes' : '1 or 2, or A D and Enter      More than half must say yes';
    this.selected = 1;
    this.chipsKey = '';
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
    this.scale = Math.min(1, (this.viewW * 0.96) / W, (this.viewH * 0.9) / H);
    this.panel.scale.set(this.scale);
    this.panel.position.set((this.viewW - W * this.scale) / 2, (this.viewH - H * this.scale) / 2);
  }

  move(dir: number): void {
    const next = Math.max(0, Math.min(1, this.selected + dir));
    if (next !== this.selected) uiSound('move');
    this.selected = next;
  }

  /** Point at the answer under the mouse. Returns 0 or 1, or -1 if the mouse is over neither. */
  pointAt(x: number, y: number): number {
    const lx = (x - this.panel.x) / this.scale;
    const ly = (y - this.panel.y) / this.scale;
    for (let i = 0; i < this.choices.length; i++) {
      const c = this.choices[i];
      if (lx >= c.x && lx <= c.x + BOX_W && ly >= c.y && ly <= c.y + BOX_H) {
        if (i !== this.selected) uiSound('move');
        this.selected = i;
        return i;
      }
    }
    return -1;
  }

  /** `mine` is what this laptop's player has said (1, 0 or -1), `left` the share of the count that remains. */
  update(dt: number, seats: readonly WagerSeat[], mine: number, left: number): void {
    if (!this.root.visible) return;
    this.shown = Math.min(1, this.shown + dt * 5);
    this.root.alpha = this.shown;
    this.choices.forEach((c, i) => c.set(i === this.selected, (i === 0 && mine === 1) || (i === 1 && mine === 0)));
    const key = seats.map((s) => `${s.name}:${s.vote}`).join('|');
    if (key !== this.chipsKey) {
      this.chipsKey = key;
      this.chips.removeChildren().forEach((c) => c.destroy({ children: true }));
      let x = 0;
      seats.forEach((s, i) => {
        const color = PLAYER_COLORS[i] ?? RIM;
        const dot = new Graphics().circle(x + 7, 7, 6).fill(color);
        const said = s.vote === 1 ? 'takes it' : s.vote === 0 ? 'walks on' : 'is thinking';
        const text = new Label(`${s.name} ${said}`, { size: 9, color: s.vote < 0 ? UI.inkSoft : PAPER, tracking: 0.14 });
        text.position.set(x + 20, 2);
        this.chips.addChild(dot, text);
        x += 20 + text.textWidth + 34;
      });
    }
    const half = ((W - PAD * 2) * Math.max(0, Math.min(1, left))) / 2;
    this.bar
      .clear()
      .moveTo(W / 2 - half, H - 14)
      .lineTo(W / 2 + half, H - 14)
      .stroke({ width: 2, color: left < 0.3 ? CHIME : UI.brass, alpha: 0.85 });
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
