// Text in the UI. Every piece of UI text goes through Label, so the lettering of the whole game
// is decided in this one file: the single-stroke drafting alphabet of src/ui/strokeFont.ts, in
// capitals, the way a survey sheet is lettered. The game ships no font files.
import { Container } from 'pixi.js';
import { CAP_HEIGHT } from './strokeFont';
import { StrokeText } from './strokeText';

export interface LabelOptions {
  /** Cap height in pixels. A line of text is exactly this tall. */
  size: number;
  color: number;
  /** Wrap to this width in pixels. */
  maxWidth?: number;
  /** 'center' and 'right' also move the origin: the label's x is then its centre line or its right edge. */
  align?: 'left' | 'center' | 'right';
  /** A heavier pen, for headings and stamps. */
  bold?: boolean;
  /** Extra space between letters, as a fraction of the size, on top of the alphabet's own spacing. */
  tracking?: number;
  /** Baseline to baseline, as a multiple of the size. Default 1.7. */
  lineHeight?: number;
  alpha?: number;
}

/** The pen never gets thinner than this many pixels, or small text breaks up. */
const MIN_PEN = 1.15;

export class Label extends Container {
  private readonly ink: StrokeText;
  private readonly align: 'left' | 'center' | 'right';

  constructor(text: string, o: LabelOptions) {
    super();
    this.align = o.align ?? 'left';
    const pen = (o.size / CAP_HEIGHT) * (o.bold ? 1.5 : 1.05);
    this.ink = new StrokeText(text, {
      size: o.size,
      color: o.color,
      tracking: 1.2 + (o.tracking ?? 0) * CAP_HEIGHT,
      weight: Math.max(MIN_PEN, pen),
      maxWidth: o.maxWidth,
      align: this.align,
      lineHeight: o.lineHeight,
      alpha: o.alpha,
    });
    this.addChild(this.ink);
    this.place();
  }

  get text(): string {
    return this.ink.text;
  }

  set text(value: string) {
    if (value === this.ink.text) return;
    this.ink.text = value;
    this.place();
  }

  setColor(color: number): void {
    this.ink.setColor(color);
  }

  /** Width of the widest line, in pixels. */
  get textWidth(): number {
    return this.ink.textWidth;
  }

  /** From the first cap line to the last baseline, in pixels. */
  get textHeight(): number {
    return this.ink.textHeight;
  }

  private place(): void {
    this.ink.x = this.align === 'center' ? -this.ink.textWidth / 2 : this.align === 'right' ? -this.ink.textWidth : 0;
  }
}
