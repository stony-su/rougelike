// A Tuning as a card. It can be told at a glance before a word of it is read: the emblem says
// what it is, the colour of its band says which family it belongs to (the dash, Rally, fire,
// frost, lightning, the body, or a class), and the frame says how rare it is: plain, brass with
// studs, or gold that glints. Below that, in words: its name, the rank on offer, what that rank
// does, and the Harmony it is half of. All of it drawn in code.
import { Container, Graphics } from 'pixi.js';
import { CHIME, PAPER, UI } from '../render/palette';
import { RARITY, TONES } from '../render/palette/tones';
import type { ToneId } from '../sim/mods';
import { drawIcon, drawPattern } from './icons';
import { Label } from './label';
import { rankPips } from './widgets';

export const CARD_W = 300;
export const CARD_H = 430;

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
  /** Its emblem (icons.ts) and its family's tone (palette/tones.ts). */
  icon: string;
  tone: ToneId;
}

const RARITY_NAMES = ['Common', 'Uncommon', 'Rare'];
const PAD = 22;
/** The height of the coloured band the emblem sits in. */
const BAND = 124;

export class Card extends Container {
  private readonly glow = new Graphics();
  private readonly glints: Graphics[] = [];
  private readonly shine = new Graphics();
  private readonly rare: boolean;
  private lift = 0;
  private target = 0;
  private time = 0;

  constructor(
    info: CardInfo,
    /** The number key that takes this card, or 0 for a card that is only shown. */
    key: number,
  ) {
    super();
    const tone = TONES[info.tone];
    this.rare = info.rarity >= 2;
    const edge = this.rare ? RARITY.gold : info.rarity === 1 ? RARITY.brass : RARITY.plain;

    const body = new Graphics();
    // a hard shadow, then the glass
    body.roundRect(5, 8, CARD_W, CARD_H, 12).fill({ color: 0x000000, alpha: 0.42 });
    body.roundRect(0, 0, CARD_W, CARD_H, 12).fill({ color: UI.glass, alpha: 0.97 });
    // the band of the family's colour, and its pattern
    body.roundRect(8, 8, CARD_W - 16, BAND, 7).fill({ color: tone.deep, alpha: 1 });
    const pattern = new Graphics();
    drawPattern(pattern, info.tone, CARD_W - 16, BAND, tone.color);
    pattern.position.set(8, 8);
    const clip = new Graphics().roundRect(8, 8, CARD_W - 16, BAND, 7).fill(0xffffff);
    pattern.mask = clip;
    // the frame, by rarity
    body.roundRect(0, 0, CARD_W, CARD_H, 12).stroke({ width: this.rare ? 3 : 2, color: edge, alpha: 0.95 });
    if (info.rarity >= 1) {
      body.roundRect(5, 5, CARD_W - 10, CARD_H - 10, 8).stroke({ width: 1, color: edge, alpha: 0.6 });
      // a stud at each corner
      for (const [x, y] of [
        [13, 13],
        [CARD_W - 13, 13],
        [13, CARD_H - 13],
        [CARD_W - 13, CARD_H - 13],
      ]) {
        body.poly([x, y - 5, x + 5, y, x, y + 5, x - 5, y]).fill(edge);
      }
    }
    this.glow.roundRect(-5, -5, CARD_W + 10, CARD_H + 10, 15).stroke({ width: 4, color: tone.color, alpha: 1 });
    this.glow.alpha = 0;
    // a rare card's frame has a second, brighter line that comes and goes
    this.shine.roundRect(-1, -1, CARD_W + 2, CARD_H + 2, 13).stroke({ width: 2, color: RARITY.goldPale, alpha: 1 });
    this.shine.alpha = 0;
    this.addChild(this.glow, body, clip, pattern, this.shine);

    // the emblem, in a medallion
    const medal = new Graphics();
    const mx = CARD_W / 2;
    const my = 8 + BAND / 2;
    medal.circle(mx, my, 46).fill({ color: UI.glass, alpha: 0.9 });
    medal.circle(mx, my, 46).stroke({ width: 2.5, color: tone.color, alpha: 0.95 });
    medal.circle(mx, my, 40).stroke({ width: 1, color: tone.pale, alpha: 0.35 });
    const emblem = new Graphics();
    drawIcon(emblem, info.icon, 27, tone.color, tone.pale);
    emblem.position.set(mx, my);
    this.addChild(medal, emblem);

    // how rare, as gems and a word; whose and which build
    const gems = new Graphics();
    for (let i = 0; i <= info.rarity; i++) gems.poly([PAD + 5 + i * 13, BAND + 20, PAD + 10 + i * 13, BAND + 25, PAD + 5 + i * 13, BAND + 30, PAD + i * 13, BAND + 25]).fill(edge);
    const rarity = new Label(RARITY_NAMES[info.rarity] ?? '', { size: 8, color: edge, tracking: 0.25 });
    rarity.position.set(PAD + (info.rarity + 1) * 13 + 6, BAND + 21);
    const whose = new Label(`${info.owner} / ${info.build}`, { size: 8, color: tone.color, tracking: 0.15, align: 'right' });
    whose.position.set(CARD_W - PAD, BAND + 21);
    const name = new Label(info.name, { size: 16, color: tone.pale, bold: true, tracking: 0.12, maxWidth: CARD_W - PAD * 2, lineHeight: 1.5 });
    name.position.set(PAD, BAND + 46);
    const pips = rankPips(info.rank, info.maxRank, tone.color);
    pips.position.set(PAD, BAND + 82);
    const rank = new Label(info.rank <= 1 ? 'New' : `Rank ${info.rank} of ${info.maxRank}`, { size: 8, color: UI.inkSoft, tracking: 0.2 });
    rank.position.set(PAD + info.maxRank * 16 + 8, BAND + 84);
    const text = new Label(info.text, { size: 10, color: PAPER, maxWidth: CARD_W - PAD * 2, lineHeight: 1.9, tracking: 0.05 });
    text.position.set(PAD, BAND + 112);
    this.addChild(gems, rarity, whose, name, pips, rank, text);

    if (info.harmony) {
      // the Harmony it is half of: bright if this card completes it
      const y = CARD_H - 126;
      const box = new Graphics().roundRect(PAD - 8, y, CARD_W - (PAD - 8) * 2, 80, 6);
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

    if (key > 0) {
      // the key that takes it
      const cap = new Graphics().roundRect(CARD_W / 2 - 15, CARD_H - 38, 30, 24, 4).stroke({ width: 1.5, color: UI.brass, alpha: 0.8 });
      const digit = new Label(String(key), { size: 10, color: UI.brass, bold: true, align: 'center' });
      digit.position.set(CARD_W / 2, CARD_H - 31);
      this.addChild(cap, digit);
    }

    if (this.rare) {
      // glints that come and go along the frame
      for (const [x, y] of [
        [CARD_W * 0.22, 0],
        [CARD_W, CARD_H * 0.3],
        [CARD_W * 0.7, CARD_H],
        [0, CARD_H * 0.64],
      ]) {
        const glint = new Graphics().star(0, 0, 4, 9, 2.4).fill(RARITY.goldPale);
        glint.position.set(x, y);
        this.glints.push(glint);
        this.addChild(glint);
      }
    }
    this.pivot.set(CARD_W / 2, CARD_H / 2);
  }

  setSelected(on: boolean): void {
    this.target = on ? 1 : 0;
  }

  update(dt: number): void {
    this.time += dt;
    this.lift += (this.target - this.lift) * Math.min(1, dt * 16);
    this.glow.alpha = this.lift;
    this.scale.set(1 + this.lift * 0.05);
    if (!this.rare) return;
    this.shine.alpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(this.time * 2.6));
    this.glints.forEach((glint, i) => {
      const k = 0.5 + 0.5 * Math.sin(this.time * 3.1 + i * 1.7);
      glint.scale.set(0.3 + 0.9 * k * k);
      glint.alpha = k;
      glint.rotation = this.time * 0.6 + i;
    });
  }
}
