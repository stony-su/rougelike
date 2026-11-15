// The line a player sees when their own side-chamber is done and the others are still in
// theirs: who the road is waiting for, and, once only one is left, how long they have.
import { Container, Graphics } from 'pixi.js';
import { CHIME, PAPER, UI } from '../render/palette';
import { Label } from './label';

const W = 420;

export class Waiting {
  readonly root = new Container();
  private readonly back = new Graphics();
  private readonly bar = new Graphics();
  private readonly head: Label;
  private readonly who: Label;
  private shown = '';

  constructor() {
    this.back
      .roundRect(-W / 2, 0, W, 62, 8)
      .fill({ color: UI.glass, alpha: 0.82 })
      .roundRect(-W / 2, 0, W, 62, 8)
      .stroke({ width: 1.5, color: UI.brass, alpha: 0.7 });
    this.head = new Label('Your way is done', { size: 9, color: UI.brass, bold: true, tracking: 0.3, align: 'center' });
    this.head.position.set(0, 12);
    this.who = new Label('', { size: 11, color: PAPER, tracking: 0.14, align: 'center' });
    this.who.position.set(0, 32);
    this.root.addChild(this.back, this.head, this.who, this.bar);
    this.root.visible = false;
  }

  /** `names` are those still in their own chambers (none hides the line); `left` is the share of the last one's time that remains, or -1. */
  set(names: readonly string[], left: number): void {
    this.root.visible = names.length > 0;
    if (!this.root.visible) return;
    const text = `Waiting for ${names.join(', ')}`;
    if (text !== this.shown) {
      this.shown = text;
      this.who.text = text;
    }
    this.bar.clear();
    if (left >= 0) {
      const half = ((W - 40) * Math.max(0, Math.min(1, left))) / 2;
      this.bar
        .moveTo(-half, 55)
        .lineTo(half, 55)
        .stroke({ width: 2, color: left < 0.3 ? CHIME : UI.brass, alpha: 0.9 });
    }
  }

  layout(viewW: number): void {
    this.root.position.set(viewW / 2, 96);
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
