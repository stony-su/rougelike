// The UI's building blocks: paper panels ruled like a survey ledger, stamps, key caps and
// buttons. Every screen composes these, so the whole interface reads as one set of forms.
import { Container, Graphics, Rectangle } from 'pixi.js';
import { CHALK, INK, PAPER, UI } from '../render/palette';
import { Label } from './label';
import { uiSound } from './sfx';

/** A sheet of ledger paper: ruled lines, a double border and registration ticks in the corners. */
export function paperPanel(w: number, h: number, o: { ruled?: boolean; header?: number } = {}): Graphics {
  const g = new Graphics();
  // a hard drop shadow, as if the form lies on the map
  g.rect(6, 8, w, h).fill({ color: 0x000000, alpha: 0.35 });
  g.rect(0, 0, w, h).fill(PAPER);
  if (o.ruled !== false) {
    for (let y = (o.header ?? 0) + 26; y < h - 10; y += 22) g.moveTo(12, y).lineTo(w - 12, y);
    g.stroke({ width: 1, color: UI.rule, alpha: 0.5 });
    // the ledger's margin line
    g.moveTo(34, (o.header ?? 0) + 6).lineTo(34, h - 8).stroke({ width: 1, color: UI.margin, alpha: 0.45 });
  }
  if (o.header) {
    g.rect(0, 0, w, o.header).fill(UI.paperDark);
    g.moveTo(0, o.header).lineTo(w, o.header).stroke({ width: 2, color: INK, alpha: 0.85 });
  }
  g.rect(0, 0, w, h).stroke({ width: 2.5, color: INK, alpha: 0.9 });
  g.rect(5, 5, w - 10, h - 10).stroke({ width: 1, color: INK, alpha: 0.45 });
  // registration ticks
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]] as const) {
    g.moveTo(cx + sx * 12, cy + sy * 5).lineTo(cx + sx * 12, cy + sy * 16).moveTo(cx + sx * 5, cy + sy * 12).lineTo(cx + sx * 16, cy + sy * 12);
  }
  g.stroke({ width: 1.5, color: INK, alpha: 0.7 });
  return g;
}

/** A rubber stamp: heavy capitals in a slightly crooked box. Its origin is its centre. */
export function stamp(text: string, color: number, size = 11): Container {
  const c = new Container();
  const label = new Label(text, { size, color, bold: true, tracking: 0.16 });
  const w = label.textWidth + size * 1.8;
  const h = size * 2.3;
  const box = new Graphics().roundRect(0, 0, w, h, 3).stroke({ width: Math.max(1.5, size / 6), color, alpha: 0.9 });
  label.position.set(size * 0.9, (h - size) / 2);
  c.addChild(box, label);
  c.pivot.set(w / 2, h / 2);
  c.rotation = -0.035;
  return c;
}

export const KEYCAP_H = 24;

/** A key cap, for prompts: a small bordered box with a letter. */
export function keyCap(text: string, dark = false): Container {
  const c = new Container();
  const label = new Label(text, { size: 10, color: dark ? PAPER : INK, bold: true });
  const w = Math.max(KEYCAP_H, label.textWidth + 14);
  const g = new Graphics()
    .roundRect(0, 2, w, KEYCAP_H, 4)
    .fill({ color: 0x000000, alpha: 0.35 })
    .roundRect(0, 0, w, KEYCAP_H, 4)
    .fill(dark ? INK : PAPER)
    .roundRect(0, 0, w, KEYCAP_H, 4)
    .stroke({ width: 1.5, color: dark ? PAPER : INK, alpha: 0.9 });
  label.position.set((w - label.textWidth) / 2, (KEYCAP_H - 10) / 2);
  c.addChild(g, label);
  return c;
}

export interface ButtonOptions {
  width: number;
  height?: number;
  hotkey?: string;
  onClick: () => void;
}

/** A button on a paper form. Hover and focus share one look: a chalk underline and a lighter face. */
export class Button extends Container {
  private readonly face = new Graphics();
  private readonly mark = new Graphics();
  private readonly caption: Label;
  private cap: Container | null = null;
  private hovered = false;
  private focused = false;
  private isOff = false;
  readonly w: number;
  readonly h: number;

  constructor(text: string, private readonly o: ButtonOptions) {
    super();
    this.w = o.width;
    this.h = o.height ?? 40;
    this.face.rect(0, 0, this.w, this.h).fill(0xffffff).rect(0, 0, this.w, this.h).stroke({ width: 2, color: INK, alpha: 0.9 });
    this.face.tint = UI.paperDark;
    this.mark.rect(0, this.h - 5, this.w, 5).fill(CHALK);
    this.mark.visible = false;
    this.caption = new Label(text, { size: 11, color: INK, bold: true, tracking: 0.1 });
    this.addChild(this.face, this.mark, this.caption);
    if (o.hotkey) {
      this.cap = keyCap(o.hotkey, true);
      this.cap.position.set(8, (this.h - KEYCAP_H) / 2);
      this.addChild(this.cap);
    }
    this.layoutCaption();
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(0, 0, this.w, this.h);
    this.on('pointerover', () => {
      this.hovered = true;
      this.refresh();
    });
    this.on('pointerout', () => {
      this.hovered = false;
      this.refresh();
    });
    this.on('pointertap', () => this.press());
  }

  setText(text: string): void {
    this.caption.text = text;
    this.layoutCaption();
  }

  setFocused(f: boolean): void {
    this.focused = f;
    this.refresh();
  }

  setDisabled(d: boolean): void {
    this.isOff = d;
    this.alpha = d ? 0.45 : 1;
    this.cursor = d ? 'default' : 'pointer';
    this.refresh();
  }

  get disabled(): boolean {
    return this.isOff;
  }

  /** Activate the button, as a click or its hotkey would. A disabled button answers with the error sound. */
  press(): void {
    if (this.isOff) uiSound('error');
    else this.o.onClick();
  }

  private layoutCaption(): void {
    const left = this.cap ? 8 + this.cap.width + 10 : 0;
    // centred in the space the key cap leaves
    const x = left + (this.w - left - this.caption.textWidth) / 2;
    this.caption.position.set(Math.max(left, x), (this.h - 11) / 2);
  }

  private refresh(): void {
    const lit = (this.hovered || this.focused) && !this.isOff;
    this.face.tint = lit ? PAPER : UI.paperDark;
    this.mark.visible = lit;
  }
}

/** Rank pips: filled for ranks held, hollow for ranks to come. */
export function rankPips(rank: number, max: number, color: number): Graphics {
  const g = new Graphics();
  for (let i = 0; i < max; i++) {
    const x = i * 16;
    g.poly([x + 6, 0, x + 12, 6, x + 6, 12, x, 6]);
    if (i < rank) g.fill(color);
    else g.stroke({ width: 1.5, color, alpha: 0.7 });
  }
  return g;
}

/** A dim backdrop behind a modal screen: the map goes out of focus, the form comes forward. */
export function scrim(w: number, h: number, alpha = 0.62): Graphics {
  return new Graphics().rect(0, 0, w, h).fill({ color: UI.scrim, alpha });
}
