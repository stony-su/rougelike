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

export const CARD_W = 320;
export const CARD_H = 470;

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
const BAND = 116;
/** The sizes the rules are tried at, largest first, each with the size of the Harmony's lines under them. */
const FITS: ReadonlyArray<readonly [number, number]> = [
  [10, 8],
  [9.5, 8],
  [9, 7.5],
  [8.5, 7.5],
  [8, 7],
];

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
    medal.circle(mx, my, 44).fill({ color: UI.glass, alpha: 0.9 });
    medal.circle(mx, my, 44).stroke({ width: 2.5, color: tone.color, alpha: 0.95 });
    medal.circle(mx, my, 38).stroke({ width: 1, color: tone.pale, alpha: 0.35 });
    const emblem = new Graphics();
    drawIcon(emblem, info.icon, 26, tone.color, tone.pale);
    emblem.position.set(mx, my);
    this.addChild(medal, emblem);

    // Below the band everything flows downward from one line to the next, so that a long name or
    // a long line of rules pushes what follows instead of running over it.
    const inner = CARD_W - PAD * 2;
    let y = BAND + 22;
    // how rare, as gems and a word; and the rank on offer, at the right
    const gems = new Graphics();
    for (let i = 0; i <= info.rarity; i++) gems.poly([PAD + 5 + i * 13, y - 1, PAD + 10 + i * 13, y + 4, PAD + 5 + i * 13, y + 9, PAD + i * 13, y + 4]).fill(edge);
    const rarity = new Label(RARITY_NAMES[info.rarity] ?? '', { size: 8, color: edge, tracking: 0.25 });
    rarity.position.set(PAD + (info.rarity + 1) * 13 + 6, y);
    const rank = new Label(info.rank <= 1 ? 'New' : `Rank ${info.rank} of ${info.maxRank}`, { size: 8, color: UI.inkSoft, tracking: 0.2, align: 'right' });
    rank.position.set(CARD_W - PAD, y);
    y += 20;
    // whose it is and which build, on a line of its own: beside the rarity the two ran into each other
    const whose = new Label(`${info.owner} / ${info.build}`, { size: 8, color: tone.color, tracking: 0.15, maxWidth: inner });
    whose.position.set(PAD, y);
    y += whose.textHeight + 16;
    const name = new Label(info.name, { size: 16, color: tone.pale, bold: true, tracking: 0.12, maxWidth: inner, lineHeight: 1.45 });
    name.position.set(PAD, y);
    y += name.textHeight + 14;
    const pips = rankPips(info.rank, info.maxRank, tone.color);
    pips.position.set(PAD, y);
    y += 24;
    this.addChild(gems, rarity, rank, whose, name, pips);

    // What it does, and under it the Harmony it is half of. The lettering steps down a size at a
    // time until both fit above the foot of the card.
    const foot = CARD_H - (key > 0 ? 50 : 18);
    for (const [size, small] of FITS) {
      const text = new Label(info.text, { size, color: PAPER, maxWidth: inner, lineHeight: 1.85, tracking: 0.05 });
      text.position.set(PAD, y);
      let end = y + text.textHeight;
      let box: Graphics | null = null;
      let head: Label | null = null;
      let what: Label | null = null;
      if (info.harmony) {
        // the Harmony: bright if this card completes it
        head = new Label(info.completes ? `Completes ${info.harmony}` : info.harmony, {
          size: small + 1,
          color: info.completes ? CHIME : UI.inkSoft,
          bold: info.completes,
          tracking: 0.15,
          maxWidth: inner - 12,
          lineHeight: 1.6,
        });
        what = new Label(info.harmonyText, { size: small, color: info.completes ? PAPER : UI.inkSoft, maxWidth: inner - 12, lineHeight: 1.75 });
        const tall = 12 + head.textHeight + 10 + what.textHeight + 12;
        // at the foot of the card when there is room, and otherwise straight after the text
        const top = Math.max(end + 16, foot - tall);
        box = new Graphics().roundRect(PAD - 6, top, inner + 12, tall, 6);
        if (info.completes) box.fill({ color: CHIME, alpha: 0.12 });
        box.stroke({ width: 1, color: info.completes ? CHIME : UI.inkSoft, alpha: info.completes ? 0.9 : 0.45 });
        head.position.set(PAD + 6, top + 12);
        what.position.set(PAD + 6, top + 12 + head.textHeight + 10);
        end = top + tall;
      }
      const last = size === FITS[FITS.length - 1][0];
      if (end <= foot || last) {
        this.addChild(text);
        if (box && head && what) this.addChild(box, head, what);
        break;
      }
      text.destroy({ children: true });
      box?.destroy();
      head?.destroy({ children: true });
      what?.destroy({ children: true });
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
