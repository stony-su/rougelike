// The display object for the game's lettering: one string, laid out by strokeFont.ts and drawn by
// running a round pen along every stroke.
//
// The whole string is one Graphics, stroked once, in white. Colour is a tint, so recolouring is
// free, and the strokes are rebuilt only when the string itself changes.
import { Container, Graphics, GraphicsContext, type DestroyOptions } from 'pixi.js';
import { CAP_HEIGHT, layoutText, type LayoutOptions } from './strokeFont';

export interface StrokeTextOptions extends LayoutOptions {
  /** Ink colour. */
  color: number;
  /** Stroke width in pixels. Default: one grid unit, a seventh of the cap height. */
  weight?: number;
  /**
   * The object's starting alpha, default 1. Strokes that cross or meet are denser where they
   * overlap when the ink is translucent, so quiet text reads better in a quieter colour.
   */
  alpha?: number;
}

/** A polyline that ends where it began is drawn as a closed loop: one more join instead of two caps. */
function isLoop(p: readonly number[]): boolean {
  const n = p.length;
  return n >= 8 && Math.abs(p[0] - p[n - 2]) < 1e-6 && Math.abs(p[1] - p[n - 1]) < 1e-6;
}

export class StrokeText extends Container {
  private readonly options: StrokeTextOptions;
  private readonly ink: Graphics;
  private value: string;
  private blockWidth = 0;
  private blockHeight = 0;

  constructor(text: string, opts: StrokeTextOptions) {
    super();
    this.options = { ...opts };
    this.value = text;
    this.ink = new Graphics(this.draw());
    this.ink.tint = opts.color;
    this.addChild(this.ink);
    this.alpha = opts.alpha ?? 1;
  }

  get text(): string {
    return this.value;
  }

  /** Setting the same string again costs nothing; a new one rebuilds the strokes. */
  set text(value: string) {
    if (value === this.value) return;
    this.value = value;
    const spent = this.ink.context;
    this.ink.context = this.draw();
    spent.destroy();
  }

  /** Recolour the ink. A tint, so nothing is rebuilt. */
  setColor(color: number): void {
    this.ink.tint = color;
  }

  /** Width of the widest line of the current text, in pixels. */
  get textWidth(): number {
    return this.blockWidth;
  }

  /** From the first cap line to the last baseline of the current text, in pixels. */
  get textHeight(): number {
    return this.blockHeight;
  }

  /** The ink is this object's own, so it goes with it whatever the options say, and its context with it. */
  override destroy(options?: DestroyOptions): void {
    if (this.destroyed) return;
    this.ink.destroy({ context: true });
    super.destroy(options);
  }

  /** Lay the current string out and stroke it into a fresh context. */
  private draw(): GraphicsContext {
    const { size, weight = size / CAP_HEIGHT } = this.options;
    const layout = layoutText(this.value, this.options);
    this.blockWidth = layout.width;
    this.blockHeight = layout.height;
    const context = new GraphicsContext();
    for (const p of layout.polylines) {
      const loop = isLoop(p);
      const end = loop ? p.length - 2 : p.length;
      context.moveTo(p[0], p[1]);
      for (let i = 2; i < end; i += 2) context.lineTo(p[i], p[i + 1]);
      if (loop) context.closePath();
    }
    // White, so that the tint alone decides the colour. Nothing to stroke in an empty string.
    if (layout.polylines.length > 0) context.stroke({ width: weight, color: 0xffffff, cap: 'round', join: 'round' });
    return context;
  }
}
