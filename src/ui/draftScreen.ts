// The draft: three requisition cards, choose one. Mouse, number keys, or arrows and Enter.
// A Head offered when every stake already carries one asks which stake to replace.
import { Container } from 'pixi.js';
import type { Input } from '../game/input';
import type { ContentRegistry } from '../sim/defs';
import type { KitState } from '../sim/kit';
import type { DraftOffer } from '../sim/run';
import { CHALK, PAPER } from '../render/palette';
import { CARD_H, CARD_W, Card } from './cards';
import { Label } from './label';
import type { Screen } from './screen';
import type { Tweens } from './tween';
import { uiSound } from './sfx';
import { Button, scrim, stamp } from './widgets';

const GAP = 34;
const ROMAN = ['I', 'II', 'III', 'IV'];

export interface DraftOptions {
  title: string;
  subtitle: string;
  rerolls: number;
  onChoose(offer: DraftOffer, stake: number): void;
  /** Returns fresh offers, or null if no reroll is left. */
  onReroll?(): DraftOffer[] | null;
}

export class DraftScreen implements Screen {
  readonly root = new Container();
  private readonly dim = new Container();
  private readonly row = new Container();
  private cards: Card[] = [];
  private readonly head: Container;
  private readonly sub: Label;
  private readonly hint: Label;
  private rerollButton: Button | null = null;
  private swapButtons: Button[] = [];
  private swapFor = -1;
  private focus = 0;
  private closing = false;
  private rerolls: number;
  private viewW = 1600;
  private viewH = 900;

  constructor(
    private readonly content: ContentRegistry,
    private readonly kit: KitState,
    private readonly stakeCount: number,
    private readonly tweens: Tweens,
    offers: DraftOffer[],
    private readonly o: DraftOptions,
  ) {
    this.rerolls = o.rerolls;
    this.root.addChild(this.dim, this.row);
    this.head = stamp(o.title, CHALK, 17);
    this.sub = new Label(o.subtitle, { size: 10, color: PAPER, tracking: 0.2, align: 'center' });
    this.hint = new Label('', { size: 9, color: PAPER, tracking: 0.16, align: 'center', alpha: 0.75 });
    this.root.addChild(this.head, this.sub, this.hint);
    this.setOffers(offers, true);
  }

  layout(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.dim.removeChildren().forEach((c) => c.destroy());
    this.dim.addChild(scrim(w, h));
    const n = Math.max(1, this.cards.length);
    const total = n * CARD_W + (n - 1) * GAP;
    const s = Math.min(1.25, (w * 0.92) / (3 * CARD_W + 2 * GAP), (h * 0.62) / CARD_H);
    this.row.scale.set(s);
    this.row.position.set(w / 2 - (total * s) / 2, h * 0.5 - (CARD_H * s) / 2 + 20 * s);
    this.cards.forEach((c, i) => {
      c.x = i * (CARD_W + GAP);
    });
    this.head.scale.set(s);
    this.head.position.set(w / 2, this.row.y - 74 * s);
    this.sub.scale.set(s);
    this.sub.position.set(w / 2, this.row.y - 40 * s);
    this.hint.scale.set(s);
    this.hint.position.set(w / 2, this.row.y + CARD_H * s + 26 * s);
    if (this.rerollButton) {
      this.rerollButton.scale.set(s);
      this.rerollButton.position.set(w / 2 - (this.rerollButton.w * s) / 2, this.row.y + CARD_H * s + 58 * s);
    }
    this.layoutSwap();
  }

  update(dt: number, input: Input): void {
    for (const c of this.cards) c.update(dt);
    if (this.closing) return;

    if (this.swapFor >= 0) {
      // choosing which stake's Head to replace
      for (let i = 0; i < this.swapButtons.length; i++) if (input.takeCode(`Digit${i + 1}`)) this.swapButtons[i].press();
      if (input.takeCode('Escape') || input.takeCode('Backspace')) this.cancelSwap();
      return;
    }

    for (let i = 0; i < this.cards.length; i++) if (input.takeCode(`Digit${i + 1}`) || input.takeCode(`Numpad${i + 1}`)) this.pick(i);
    if (input.takeCode('ArrowLeft') || input.takeCode('KeyA')) this.setFocus(this.focus - 1);
    if (input.takeCode('ArrowRight') || input.takeCode('KeyD')) this.setFocus(this.focus + 1);
    if (input.takeCode('Enter') || input.takeCode('Space') || input.takeCode('KeyF')) this.pick(this.focus);
    if (this.rerollButton && input.takeCode('KeyR')) this.rerollButton.press();
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }

  private setOffers(offers: DraftOffer[], first: boolean): void {
    for (const c of this.cards) c.destroy({ children: true });
    this.cards = offers.map((offer, i) => {
      const card = new Card(this.content, offer, { hotkey: String(i + 1) });
      card.onPick = () => this.pick(i);
      card.onHover = () => {
        if (this.swapFor < 0) this.setFocus(i);
      };
      this.row.addChild(card);
      // dealt in from below, one after another
      card.alpha = 0;
      card.y = 60;
      this.tweens.to(0.32, (k) => {
        card.alpha = k;
        card.y = 60 * (1 - k);
      }, { delay: (first ? 0.12 : 0) + i * 0.07 });
      return card;
    });
    this.focus = Math.min(this.focus, Math.max(0, this.cards.length - 1));
    this.setFocus(this.focus);

    if (this.rerollButton) {
      this.rerollButton.destroy({ children: true });
      this.rerollButton = null;
    }
    if (this.o.onReroll && this.rerolls > 0) {
      this.rerollButton = new Button(`Second opinion (${this.rerolls})`, { width: 300, hotkey: 'R', onClick: () => this.reroll() });
      this.root.addChild(this.rerollButton);
    }
    this.hint.text = 'Choose with 1  2  3, or the mouse';
    this.layout(this.viewW, this.viewH);
  }

  private setFocus(i: number): void {
    const n = this.cards.length;
    if (n === 0) return;
    const next = ((i % n) + n) % n;
    if (next !== this.focus) uiSound('move');
    this.focus = next;
    this.cards.forEach((c, k) => c.setFocus(k === this.focus));
  }

  private pick(i: number): void {
    const card = this.cards[i];
    if (!card || this.closing) return;
    this.setFocus(i);
    if (card.offer.how === 'swap') {
      this.beginSwap(i);
      return;
    }
    this.finish(card.offer, 0);
  }

  private beginSwap(i: number): void {
    this.swapFor = i;
    uiSound('confirm');
    this.cards.forEach((c, k) => c.setDimmed(k !== i));
    this.hint.text = 'Which stake gives up its Head?   Esc to go back';
    for (let s = 0; s < this.stakeCount; s++) {
      const id = this.kit.heads[s];
      const name = id ? this.content.instruments[id]?.name ?? id : 'bare';
      const b = new Button(`Stake ${ROMAN[s]}: ${name}`, { width: 300, hotkey: String(s + 1), onClick: () => this.finish(this.cards[i].offer, s) });
      this.swapButtons.push(b);
      this.root.addChild(b);
    }
    this.layoutSwap();
  }

  private cancelSwap(): void {
    for (const b of this.swapButtons) b.destroy({ children: true });
    this.swapButtons = [];
    this.swapFor = -1;
    uiSound('back');
    this.cards.forEach((c) => c.setDimmed(false));
    this.hint.text = 'Choose with 1  2  3, or the mouse';
  }

  private layoutSwap(): void {
    if (this.swapButtons.length === 0) return;
    const s = this.row.scale.x;
    const total = this.swapButtons.length * 300 + (this.swapButtons.length - 1) * 16;
    this.swapButtons.forEach((b, i) => {
      b.scale.set(s);
      b.position.set(this.viewW / 2 - (total * s) / 2 + i * 316 * s, this.row.y + CARD_H * s + 58 * s);
    });
  }

  private reroll(): void {
    if (!this.o.onReroll || this.rerolls <= 0 || this.swapFor >= 0) return;
    const fresh = this.o.onReroll();
    if (!fresh) return;
    this.rerolls--;
    uiSound('confirm');
    this.setOffers(fresh, false);
  }

  private finish(offer: DraftOffer, stake: number): void {
    if (this.closing) return;
    this.closing = true;
    uiSound('stamp');
    // the chosen card is stamped; the others fall away
    this.cards.forEach((c) => {
      const chosen = c.offer === offer;
      this.tweens.to(chosen ? 0.34 : 0.2, (k) => {
        c.alpha = chosen ? 1 : 1 - k;
        if (chosen) c.scale.set(1 + 0.06 * Math.sin(k * Math.PI));
      });
    });
    this.tweens.wait(0.36, () => this.o.onChoose(offer, stake));
  }
}
