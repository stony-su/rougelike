// The transition between rooms: a band of ink drawn across the sheet behind a snapped chalk
// line. The band is wider than the screen, so one continuous motion first covers everything
// (the room is swapped while nothing can be seen) and then uncovers the new room. While the
// sheet is covered it carries the title of the sheet being turned to.
import { Container, Graphics } from 'pixi.js';
import { ease } from '../core/ease';
import { CHALK, PAPER, UI } from '../render/palette';
import { Label } from './label';

const COVER_TIME = 0.34;
const HOLD_TIME = 0.42;
const REVEAL_TIME = 0.4;
/** The band leans like a line snapped by hand. */
const TILT = -0.2;

export class Wipe {
  readonly root = new Container();
  private readonly band = new Container();
  private readonly ink = new Graphics();
  private readonly title = new Container();
  private t = -1;
  private covered = false;
  private onCovered: (() => void) | null = null;
  private onDone: (() => void) | null = null;
  private viewW = 1;
  private viewH = 1;
  private bandW = 1;

  constructor() {
    this.root.visible = false;
    this.root.eventMode = 'none';
    this.band.rotation = TILT;
    this.band.addChild(this.ink);
    this.root.addChild(this.band, this.title);
  }

  get active(): boolean {
    return this.t >= 0;
  }

  /** True while the screen is fully hidden. */
  get hidden(): boolean {
    return this.covered && this.t >= 0 && this.t < COVER_TIME + HOLD_TIME;
  }

  layout(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    const diag = Math.hypot(w, h);
    // wide enough to cover the screen with room for both ragged edges
    this.bandW = diag * 1.25;
    const len = diag * 1.6;
    const g = this.ink;
    g.clear();
    // the body of the band, with torn edges like a loaded brush
    const teeth = 26;
    const pts: number[] = [];
    for (let i = 0; i <= teeth; i++) {
      const y = -len / 2 + (len * i) / teeth;
      pts.push(this.bandW / 2 + (i % 2 === 0 ? 0 : -14 - ((i * 37) % 23)), y);
    }
    for (let i = teeth; i >= 0; i--) {
      const y = -len / 2 + (len * i) / teeth;
      pts.push(-this.bandW / 2 + (i % 2 === 0 ? 0 : 14 + ((i * 53) % 23)), y);
    }
    g.poly(pts).fill(UI.scrim);
    // a chalk line along each edge: the leading one is the line being snapped
    g.rect(this.bandW / 2 - 2, -len / 2, 4, len).fill(CHALK);
    g.rect(-this.bandW / 2 - 2, -len / 2, 4, len).fill({ color: CHALK, alpha: 0.55 });
    this.title.position.set(w / 2, h / 2);
    this.place();
  }

  /**
   * Begin a wipe. `onCovered` runs once, at the moment the screen is fully hidden: swap the room
   * there. `onDone` runs when the new room is fully visible.
   */
  start(heading: string, sub: string, onCovered: () => void, onDone?: () => void): void {
    this.t = 0;
    this.covered = false;
    this.onCovered = onCovered;
    this.onDone = onDone ?? null;
    this.setTitle(heading, sub);
    this.root.visible = true;
    this.place();
  }

  /** Replace the words shown while the sheet is covered (the next sheet is only known once the room is swapped). */
  setTitle(heading: string, sub: string): void {
    this.title.removeChildren().forEach((c) => c.destroy({ children: true }));
    const a = new Label(heading, { size: 26, color: PAPER, bold: true, tracking: 0.3, align: 'center' });
    const b = new Label(sub, { size: 11, color: CHALK, tracking: 0.34, align: 'center' });
    a.position.set(0, -30);
    b.position.set(0, 26);
    const rule = new Graphics().rect(-170, 11, 340, 2).fill({ color: PAPER, alpha: 0.5 });
    this.title.addChild(a, rule, b);
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    if (!this.covered && this.t >= COVER_TIME) {
      this.covered = true;
      const fn = this.onCovered;
      this.onCovered = null;
      fn?.();
    }
    if (this.t >= COVER_TIME + HOLD_TIME + REVEAL_TIME) {
      this.t = -1;
      this.root.visible = false;
      const fn = this.onDone;
      this.onDone = null;
      fn?.();
      return;
    }
    this.place();
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }

  private place(): void {
    const t = Math.max(0, this.t);
    // u = -1: the band waits off the left edge; 0: it covers the screen; +1: it has left on the right
    let u: number;
    if (t < COVER_TIME) u = -1 + ease.outCubic(t / COVER_TIME);
    else if (t < COVER_TIME + HOLD_TIME) u = 0;
    else u = ease.inCubic(Math.min(1, (t - COVER_TIME - HOLD_TIME) / REVEAL_TIME));
    const travel = this.bandW / 2 + Math.hypot(this.viewW, this.viewH) * 0.62;
    const nx = Math.cos(TILT);
    const ny = Math.sin(TILT);
    this.band.position.set(this.viewW / 2 + nx * travel * u, this.viewH / 2 + ny * travel * u);
    // the title is lettered while the sheet is covered, and goes with the ink
    const hold = t < COVER_TIME ? 0 : t < COVER_TIME + HOLD_TIME ? Math.min(1, (t - COVER_TIME) / 0.12) : Math.max(0, 1 - (t - COVER_TIME - HOLD_TIME) / 0.14);
    this.title.alpha = hold;
    this.title.scale.set(0.96 + 0.04 * hold);
  }
}
