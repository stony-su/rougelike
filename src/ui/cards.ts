// Requisition cards: one instrument each. Used by the draft screen and the shop.
import { Container, Graphics, Rectangle } from 'pixi.js';
import { describe } from '../sim/defs';
import type { ContentRegistry, InstrumentDef } from '../sim/defs';
import type { DraftOffer } from '../sim/run';
import { CHALK, HEAD_TINT, INK, PAPER, UI } from '../render/palette';
import { Label } from './label';
import { KEYCAP_H, keyCap, paperPanel, rankPips, stamp } from './widgets';

export const CARD_W = 330;
export const CARD_H = 470;

const HEADER = 44;
/** Body text starts right of the ledger's margin line. */
const TEXT_X = 46;
const TEXT_W = CARD_W - TEXT_X - 22;
const ROMAN = ['', 'I', 'II', 'III', 'IV'];

/** A small drawing for the top of a card: a stake with its Head, or a ledger sheet for an Order. */
export function pictogram(def: InstrumentDef): Container {
  const c = new Container();
  const g = new Graphics();
  if (def.kind === 'head') {
    const tint = HEAD_TINT[def.tint ?? ''] ?? CHALK;
    // two lines leaving the stake, the stake, and its coloured cap
    g.moveTo(0, 20).lineTo(-70, 44).moveTo(0, 20).lineTo(70, 40).stroke({ width: 3, color: tint, alpha: 0.9, cap: 'round' });
    g.poly([-5, -46, 5, -46, 4, 14, 0, 26, -4, 14]).fill(INK);
    g.poly([5, -46, 40, -37, 5, -26]).fill(tint).poly([5, -46, 40, -37, 5, -26]).stroke({ width: 2, color: INK, join: 'round' });
    g.circle(0, -50, 7).fill(tint).circle(0, -50, 7).stroke({ width: 2, color: INK });
    g.ellipse(0, 26, 22, 7).stroke({ width: 2, color: INK, alpha: 0.5 });
  } else {
    // a standing order: a sheet with ruled lines and a tick
    g.rect(-30, -44, 60, 76).fill(UI.paperDark).rect(-30, -44, 60, 76).stroke({ width: 2.5, color: INK });
    for (let i = 0; i < 4; i++) g.moveTo(-20, -28 + i * 14).lineTo(i === 3 ? 0 : 20, -28 + i * 14);
    g.stroke({ width: 2, color: INK, alpha: 0.55 });
    g.moveTo(4, 14).lineTo(12, 22).lineTo(26, 2).stroke({ width: 4, color: UI.good, cap: 'round', join: 'round' });
  }
  c.addChild(g);
  return c;
}

export interface CardOptions {
  hotkey?: string;
  /** Shown instead of the usual note line (the shop shows a price). */
  price?: number;
  affordable?: boolean;
  sold?: boolean;
}

/** One instrument as a paper form. `setFocus` lifts it; `onPick` fires on click. */
export class Card extends Container {
  readonly offer: DraftOffer;
  readonly def: InstrumentDef;
  private readonly body = new Container();
  private readonly glow = new Graphics();
  private lift = 0;
  private target = 0;
  onPick: (() => void) | null = null;
  onHover: (() => void) | null = null;

  constructor(content: ContentRegistry, offer: DraftOffer, o: CardOptions = {}) {
    super();
    this.offer = offer;
    this.def = content.instruments[offer.id];
    const def = this.def;
    const splice = offer.completes ? content.splices.find((s) => s.id === offer.completes) : undefined;

    this.glow.rect(-6, -6, CARD_W + 12, CARD_H + 12).fill({ color: 0xffffff, alpha: 1 });
    this.glow.tint = CHALK;
    this.glow.alpha = 0;
    this.addChild(this.glow, this.body);

    this.body.addChild(paperPanel(CARD_W, CARD_H, { header: HEADER }));

    const kind = new Label(def.kind === 'head' ? 'Head' : 'Order', { size: 11, color: INK, bold: true, tracking: 0.28 });
    kind.position.set(18, (HEADER - 11) / 2);
    this.body.addChild(kind);
    if (def.rarity !== 'common') {
      const r = stamp(def.rarity, def.rarity === 'rare' ? UI.good : UI.inkSoft, 8);
      r.position.set(CARD_W - 16 - r.width / 2, HEADER / 2);
      this.body.addChild(r);
    }

    const pic = pictogram(def);
    pic.position.set(CARD_W / 2, 116);
    this.body.addChild(pic);

    const name = new Label(def.name, { size: 14, color: INK, bold: true, tracking: 0.1, maxWidth: CARD_W - 36, align: 'center', lineHeight: 1.5 });
    name.position.set(CARD_W / 2, 176);
    this.body.addChild(name);
    let y = 176 + name.textHeight + 12;

    if (def.maxRank > 1) {
      const pips = rankPips(offer.rank, def.maxRank, INK);
      pips.position.set(CARD_W / 2 - (def.maxRank * 16 - 4) / 2, y);
      this.body.addChild(pips);
      y += 24;
    }

    const text = new Label(describe(def, offer.rank), { size: 9, color: INK, maxWidth: TEXT_W, lineHeight: 1.75 });
    text.position.set(TEXT_X, y);
    this.body.addChild(text);
    y += text.textHeight + 14;

    // what taking it means, right now
    let note = '';
    let noteColor: number = UI.inkSoft;
    if (o.price !== undefined) {
      note = o.sold ? 'Sold' : `${o.price} Chalk`;
      noteColor = o.sold ? UI.inkSoft : o.affordable ? UI.good : UI.inkSoft;
    } else if (offer.how === 'swap') note = 'Replaces a Head: 15 Chalk back';
    else if (splice) {
      note = `Completes ${splice.name}`;
      noteColor = UI.good;
    } else if (offer.how === 'rank') note = `Rank ${ROMAN[offer.rank - 1]} to ${ROMAN[offer.rank]}`;
    else note = def.kind === 'head' ? 'Mounts on a bare stake' : 'Standing order';
    const footY = CARD_H - 34 - KEYCAP_H / 2;
    const noteLabel = new Label(note, { size: 9, color: noteColor, bold: true, tracking: 0.1, maxWidth: CARD_W - 36, align: 'center' });
    noteLabel.position.set(CARD_W / 2, footY - 34);
    this.body.addChild(noteLabel);

    // what the completed Splice does, when the form has room for it
    if (splice) {
      const sp = new Label(`${splice.name}: ${describe(splice, 1)}`, { size: 8, color: UI.good, maxWidth: TEXT_W, lineHeight: 1.7 });
      if (y + sp.textHeight < noteLabel.y - 10) {
        sp.position.set(TEXT_X, y);
        this.body.addChild(sp);
      } else sp.destroy();
    }

    if (o.hotkey) {
      const cap = keyCap(o.hotkey);
      cap.position.set(CARD_W / 2 - cap.width / 2, footY);
      this.body.addChild(cap);
    }
    if (o.sold) this.body.alpha = 0.45;

    this.eventMode = 'static';
    this.cursor = o.sold ? 'default' : 'pointer';
    this.hitArea = new Rectangle(0, -20, CARD_W, CARD_H + 20);
    this.on('pointerover', () => this.onHover?.());
    this.on('pointertap', () => this.onPick?.());
  }

  setFocus(on: boolean): void {
    this.target = on ? 1 : 0;
  }

  /** Dim a card that is not the one being acted on. */
  setDimmed(d: boolean): void {
    this.body.alpha = d ? 0.35 : 1;
  }

  update(dt: number): void {
    this.lift += (this.target - this.lift) * (1 - Math.exp(-18 * dt));
    this.body.y = -16 * this.lift;
    this.glow.y = this.body.y;
    this.glow.alpha = this.lift * 0.9;
  }
}

/** Dark text chip used on the map (prompts over objects, door names). Its origin is its centre. */
export function mapChip(text: string): Container {
  const c = new Container();
  const label = new Label(text, { size: 9, color: PAPER, bold: true, tracking: 0.12 });
  const w = label.textWidth + 22;
  const h = 26;
  const g = new Graphics().roundRect(0, 0, w, h, 3).fill({ color: INK, alpha: 0.86 }).roundRect(0, 0, w, h, 3).stroke({ width: 1.2, color: PAPER, alpha: 0.5 });
  label.position.set(11, (h - 9) / 2);
  c.addChild(g, label);
  c.pivot.set(w / 2, h / 2);
  return c;
}
