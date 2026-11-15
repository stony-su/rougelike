// A Tuning as a card: its name, whose it is and which build it belongs to, what the rank on
// offer does, and the Harmony it would complete. Dark glass with a brass edge, drawn in code.
import { Container, Graphics } from 'pixi.js';
import { CHIME, PAPER, UI } from '../render/palette';
import { Label } from './label';
import { rankPips } from './widgets';

export const CARD_W = 300;
export const CARD_H = 392;

export interface CardInfo {
  name: string;
  /** Whose it is, in words ('The Edge', 'Anyone'), and the build it belongs to ('Dash', 'Mirror Guard'). */
  owner: string;
  build: string;
  /** 0 common, 1 uncommon, 2 rare. */
  rarity: number;
  /** The rank taking this card gives, and the most it can reach. */
  rank: number;
  maxRank: number;
  /** What that rank does. */
  text: string;
  /** The Harmony this card is half of: its name, what it does, and whether taking the card switches it on. */
  harmony: string;
  harmonyText: string;
  completes: boolean;
  /** The colour of the card's stripe: the player's own for a card of their class. */
  color: number;
}

const RARITY_NAMES = ['Common', 'Uncommon', 'Rare'];
const PAD = 22;

export class Card extends Container {
  private readonly glow = new Graphics();
  private lift = 0;
  private target = 0;

  constructor(
    info: CardInfo,
    /** The number key that takes this card. */
    key: number,
  ) {
    super();
    const edge = info.rarity >= 2 ? CHIME : info.rarity === 1 ? UI.brass : UI.inkSoft;
    const body = new Graphics();
    // a hard shadow, then the glass, then its edge; a rare card has a second line inside the first
    body.roundRect(5, 8, CARD_W, CARD_H, 10).fill({ color: 0x000000, alpha: 0.4 });
    body.roundRect(0, 0, CARD_W, CARD_H, 10).fill({ color: UI.glass, alpha: 0.96 });
    body.roundRect(0, 0, CARD_W, CARD_H, 10).stroke({ width: 2, color: edge, alpha: 0.9 });
    if (info.rarity >= 2) body.roundRect(6, 6, CARD_W - 12, CARD_H - 12, 6).stroke({ width: 1, color: edge, alpha: 0.5 });
    // whose card it is
    body.roundRect(PAD, 16, CARD_W - PAD * 2, 5, 2).fill(info.color);
    this.glow.roundRect(-4, -4, CARD_W + 8, CARD_H + 8, 13).stroke({ width: 3, color: info.color, alpha: 1 });
    this.glow.alpha = 0;
    this.addChild(this.glow, body);

    const rarity = new Label(RARITY_NAMES[info.rarity] ?? '', { size: 8, color: edge, tracking: 0.25 });
    rarity.position.set(PAD, 36);
    const whose = new Label(`${info.owner} / ${info.build}`, { size: 8, color: UI.inkSoft, tracking: 0.15, align: 'right' });
    whose.position.set(CARD_W - PAD, 36);
    const name = new Label(info.name, { size: 16, color: PAPER, bold: true, tracking: 0.12, maxWidth: CARD_W - PAD * 2, lineHeight: 1.5 });
    name.position.set(PAD, 64);
    const pips = rankPips(info.rank, info.maxRank, info.color);
    pips.position.set(PAD, 124);
    const rank = new Label(info.rank <= 1 ? 'New' : `Rank ${info.rank} of ${info.maxRank}`, { size: 8, color: UI.inkSoft, tracking: 0.2 });
    rank.position.set(PAD + info.maxRank * 16 + 8, 126);
    const text = new Label(info.text, { size: 10, color: PAPER, maxWidth: CARD_W - PAD * 2, lineHeight: 1.9, tracking: 0.05 });
    text.position.set(PAD, 158);
    this.addChild(rarity, whose, name, pips, rank, text);

    if (info.harmony) {
      // the Harmony it is half of: bright if this card completes it
      const y = CARD_H - 132;
      const box = new Graphics().roundRect(PAD - 8, y, CARD_W - (PAD - 8) * 2, 84, 6);
      if (info.completes) box.fill({ color: CHIME, alpha: 0.12 });
      box.stroke({ width: 1, color: info.completes ? CHIME : UI.inkSoft, alpha: info.completes ? 0.9 : 0.45 });
      const head = new Label(info.completes ? `Completes ${info.harmony}` : info.harmony, {
        size: 9,
        color: info.completes ? CHIME : UI.inkSoft,
        bold: info.completes,
        tracking: 0.15,
        maxWidth: CARD_W - PAD * 2,
      });
      head.position.set(PAD, y + 12);
      const what = new Label(info.harmonyText, { size: 8, color: info.completes ? PAPER : UI.inkSoft, maxWidth: CARD_W - PAD * 2, lineHeight: 1.8 });
      what.position.set(PAD, y + 34);
      this.addChild(box, head, what);
    }

    // the key that takes it
    const cap = new Graphics().roundRect(CARD_W / 2 - 15, CARD_H - 38, 30, 24, 4).stroke({ width: 1.5, color: UI.brass, alpha: 0.8 });
    const digit = new Label(String(key), { size: 10, color: UI.brass, bold: true, align: 'center' });
    digit.position.set(CARD_W / 2, CARD_H - 31);
    this.addChild(cap, digit);
    this.pivot.set(CARD_W / 2, CARD_H / 2);
  }

  setSelected(on: boolean): void {
    this.target = on ? 1 : 0;
  }

  update(dt: number): void {
    this.lift += (this.target - this.lift) * Math.min(1, dt * 16);
    this.glow.alpha = this.lift;
    this.scale.set(1 + this.lift * 0.05);
  }
}
