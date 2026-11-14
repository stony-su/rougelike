// The Tally Tent: the shop. Three instruments on the shelves, a field ration, fresh stock for
// the asking, and a free exchange of Heads between stakes. Mouse, or digits, arrows and Enter.
// A Head bought when every stake already carries one asks which stake gives up its own.
//
// The screen never changes the run itself: every purchase goes through buy() and every exchange
// through rearrangeHeads(), and after each one the whole counter is read back from the stock.
import { Container, Graphics, Rectangle } from 'pixi.js';
import { ease } from '../core/ease';
import type { EaseFn } from '../core/ease';
import type { Input } from '../game/input';
import type { ContentRegistry, InstrumentDef } from '../sim/defs';
import { RATION_HEAL, SHEETS, buy, rearrangeHeads } from '../sim/run';
import type { DraftOffer, RunState, ShopItem } from '../sim/run';
import type { World } from '../sim/types';
import { CHALK, HEAD_TINT, INK, PAPER, UI } from '../render/palette';
import { CARD_H, CARD_W, Card } from './cards';
import { Label } from './label';
import type { Screen } from './screen';
import { uiSound } from './sfx';
import type { Tweens } from './tween';
import { Button, KEYCAP_H, keyCap, paperPanel, rankPips, scrim, stamp } from './widgets';

/** The composition is drawn for this view and scaled as one piece to fit any other. */
const VIEW_W = 1600;
const VIEW_H = 900;
/** A card is never larger here than at the draft table. */
const MAX_SCALE = 1.25;

const GAP = 34;
/** Four columns: three shelves and the counter. */
const GRID_W = 4 * CARD_W + 3 * GAP;
const LEFT = (VIEW_W - GRID_W) / 2;
const TOP = 144;
const SIDE_X = LEFT + 3 * (CARD_W + GAP);
const SIDE_GAP = 14;
const PURSE_H = 102;
const RATION_H = 166;
const RESTOCK_H = 118;
const LEAVE_H = CARD_H - PURSE_H - RATION_H - RESTOCK_H - 3 * SIDE_GAP;
const FORM_HEAD = 34;
/** Body text starts right of the ledger's margin line, as on a card. */
const TEXT_X = 46;
const TEXT_W = CARD_W - TEXT_X - 22;

const STRIP_Y = TOP + CARD_H + 46;
const STRIP_H = 132;
const STRIP_HEAD = 34;
/** The stake tiles start under the second shelf; the strip's notes sit under the first. */
const TILE_X = CARD_W + GAP;
const TILE_Y = STRIP_HEAD + 11;
const TILE_H = 76;
const TILE_GAP = 16;
const TILE_MAX_W = 336;
/** The left cell of a tile names the stake. */
const TILE_CELL = 58;
const LEGEND_Y = STRIP_Y + STRIP_H + 30;

const DIMMED = 0.3;
const ROMAN = ['I', 'II', 'III', 'IV'];
const ARROWS = ['←', '→', '↑', '↓'];
/** The heading is lettered in paper: chalk is kept for the focus mark. */
const HEADING = PAPER;

/** Chalk handed back for the Head a new one replaces (takeOffer in sim/run.ts). */
const SWAP_REFUND = 15;
/**
 * What fresh stock takes from the purse. buy() in sim/run.ts raises the restock price by this
 * much and only then charges it, so the amount that leaves the purse is the listed price plus
 * the rise. The form shows, and checks the purse against, the amount really charged.
 */
const RESTOCK_RISE = 10;
const restockCharge = (it: ShopItem): number => it.price + RESTOCK_RISE;

export interface ShopOptions {
  onClose(): void;
}

/** Something the focus can rest on. Bounds are in the composition's own pixels, for arrow-key travel. */
interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
  focus(on: boolean): void;
  act(): void;
}

/** One place on the shelves: an instrument card, its caption, and the stamp once it is sold. */
interface Shelf {
  /** Index into the stock, or -1 when the tent had nothing to put here. */
  item: number;
  inner: Container;
  card: Card | null;
  mark: Container | null;
  caption: Label;
  sig: string;
}

type Step =
  /** Looking over the counter. */
  | { kind: 'browse' }
  /** A Head is being bought and a stake must give up its own. `back` is where the focus returns. */
  | { kind: 'swap'; shelf: number; back: string }
  /** Exchanging the Heads on two stakes. `first` is the stake already picked, or -1. */
  | { kind: 'rearrange'; first: number; back: string };

const approach = (dt: number, rate: number): number => 1 - Math.exp(-rate * dt);

/**
 * A stake's number as it is cut on a boundary stone: stems between a top and a bottom bar.
 * The alphabet's plain "I" reads as a tally mark when it stands alone. Its origin is its top centre.
 */
function romanMark(n: number, h: number): Graphics {
  const g = new Graphics();
  const pitch = h * 0.42;
  let half: number;
  if (n === 4) {
    // IV: one stem, then a V
    half = pitch * 1.45;
    g.moveTo(-half + pitch * 0.35, 0).lineTo(-half + pitch * 0.35, h);
    g.moveTo(-half + pitch * 1.2, 0).lineTo(-half + pitch * 2, h).lineTo(-half + pitch * 2.8, 0);
  } else {
    const count = Math.max(1, Math.min(3, n));
    half = ((count - 1) * pitch) / 2 + pitch * 0.5;
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * pitch;
      g.moveTo(x, 0).lineTo(x, h);
    }
  }
  g.moveTo(-half, 0).lineTo(half, 0).moveTo(-half, h).lineTo(half, h);
  g.stroke({ width: Math.max(1.8, h * 0.12), color: INK, cap: 'round', join: 'round' });
  return g;
}

/** A small counter form: a service with a price, a key and, when it cannot be had, the reason. */
class Form extends Container {
  /** Everything that greys out when the service cannot be had. */
  readonly content = new Container();
  /** The paper itself; it lifts under the focus and shakes on a refusal. */
  readonly body = new Container();
  private readonly glow = new Graphics();
  private readonly price: Label;
  private readonly reason: Label;
  private lift = 0;
  private target = 0;
  onPick: (() => void) | null = null;
  onHover: (() => void) | null = null;

  constructor(
    title: string,
    readonly w: number,
    readonly h: number,
    hotkey: string,
    tag: string,
  ) {
    super();
    this.glow.rect(-6, -6, w + 12, h + 12).fill(0xffffff);
    this.glow.tint = CHALK;
    this.glow.alpha = 0;
    this.addChild(this.glow, this.body);
    this.body.addChild(paperPanel(w, h, { header: FORM_HEAD }));

    const name = new Label(title, { size: 11, color: INK, bold: true, tracking: 0.28 });
    name.position.set(18, (FORM_HEAD - 11) / 2);
    const mark = stamp(tag, UI.inkSoft, 8);
    mark.position.set(w - 16 - mark.width / 2, FORM_HEAD / 2);

    const footY = h - 14 - KEYCAP_H;
    const cap = keyCap(hotkey);
    cap.position.set(TEXT_X, footY);
    this.price = new Label('', { size: 10, color: UI.good, bold: true, tracking: 0.1 });
    this.price.position.set(TEXT_X + cap.width + 10, footY + (KEYCAP_H - 10) / 2);
    this.reason = new Label('', { size: 9, color: UI.inkSoft, bold: true, tracking: 0.08, align: 'right' });
    this.reason.position.set(w - 22, footY + (KEYCAP_H - 9) / 2);
    this.body.addChild(name, mark, this.content, cap, this.price, this.reason);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(0, -8, w, h + 8);
    this.on('pointerover', () => this.onHover?.());
    this.on('pointertap', () => this.onPick?.());
  }

  /** `price` is what it costs; `reason` says why it cannot be had (empty when it can). */
  setState(price: string, reason: string): void {
    const ok = reason === '';
    this.price.text = price;
    this.price.setColor(ok ? UI.good : UI.inkSoft);
    this.reason.text = reason;
    this.content.alpha = ok ? 1 : 0.45;
    this.cursor = ok ? 'pointer' : 'default';
  }

  setFocus(on: boolean): void {
    this.target = on ? 1 : 0;
  }

  update(dt: number): void {
    this.lift += (this.target - this.lift) * approach(dt, 18);
    this.body.y = -8 * this.lift;
    this.glow.y = this.body.y;
    this.glow.alpha = this.lift * 0.9;
  }
}

/** Health as a short levelling staff: what is there now in ink, what the ration would add in green. */
class Gauge extends Container {
  private readonly now = new Graphics();
  private readonly gain = new Graphics();
  private shownNow = 0;
  private shownAfter = 0;
  private targetNow = 0;
  private targetAfter = 0;

  constructor(
    private readonly w: number,
    h: number,
  ) {
    super();
    const track = new Graphics().rect(0, 0, w, h).fill({ color: INK, alpha: 0.1 });
    this.now.rect(0, 0, w, h).fill(0xffffff);
    this.now.tint = INK;
    this.gain.rect(0, 0, w, h).fill(0xffffff);
    this.gain.tint = UI.good;
    // graduations hang below the staff: a tick every tenth, a long one at each end and the middle
    const ticks = new Graphics();
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * w;
      ticks.moveTo(x, h).lineTo(x, h + (i % 5 === 0 ? 6 : 3));
    }
    ticks.stroke({ width: 1.5, color: INK, alpha: 0.7 });
    ticks.rect(0, 0, w, h).stroke({ width: 1.5, color: INK, alpha: 0.9 });
    this.addChild(track, this.now, this.gain, ticks);
  }

  /** Fractions of the whole staff. `snap` skips the animation. */
  set(now: number, after: number, snap: boolean): void {
    this.targetNow = Math.max(0, Math.min(1, now));
    this.targetAfter = Math.max(this.targetNow, Math.min(1, after));
    if (snap) {
      this.shownNow = this.targetNow;
      this.shownAfter = this.targetAfter;
    }
    this.draw();
  }

  update(dt: number): void {
    if (this.shownNow === this.targetNow && this.shownAfter === this.targetAfter) return;
    const k = approach(dt, 9);
    this.shownNow += (this.targetNow - this.shownNow) * k;
    this.shownAfter += (this.targetAfter - this.shownAfter) * k;
    if (Math.abs(this.targetNow - this.shownNow) < 0.002) this.shownNow = this.targetNow;
    if (Math.abs(this.targetAfter - this.shownAfter) < 0.002) this.shownAfter = this.targetAfter;
    this.draw();
  }

  private draw(): void {
    this.now.scale.x = Math.max(0.0001, this.shownNow);
    this.gain.x = this.shownNow * this.w;
    this.gain.scale.x = Math.max(0.0001, this.shownAfter - this.shownNow);
    this.gain.visible = this.shownAfter - this.shownNow > 0.001;
  }
}

/** The purse: the Chalk in hand, in large figures over an accountant's double rule. */
class Purse extends Container {
  private readonly figure: Label;
  private readonly outlook = new Container();
  private readonly outlookWord: Label;
  private readonly outlookFigure: Label;
  private outlookOn = false;
  private shown = 0;
  private target = 0;

  constructor(w: number, h: number) {
    super();
    this.addChild(paperPanel(w, h, { ruled: false }));
    const title = new Label('Chalk in hand', { size: 10, color: UI.inkSoft, bold: true, tracking: 0.24 });
    title.position.set(22, 18);
    this.figure = new Label('0', { size: 32, color: INK, bold: true, tracking: 0.04 });
    this.figure.position.set(22, 42);
    const rule = new Graphics();
    rule.moveTo(22, 84).lineTo(w - 22, 84).moveTo(22, 88).lineTo(w - 22, 88).stroke({ width: 1.5, color: INK, alpha: 0.7 });
    // beside the balance: what the thing under the focus would leave of it
    this.outlookWord = new Label('', { size: 8, color: UI.inkSoft, bold: true, tracking: 0.2, align: 'right' });
    this.outlookWord.position.set(w - 22, 44);
    this.outlookFigure = new Label('', { size: 17, color: UI.good, bold: true, align: 'right' });
    this.outlookFigure.position.set(w - 22, 59);
    this.outlook.addChild(this.outlookWord, this.outlookFigure);
    this.outlook.alpha = 0;
    this.addChild(title, rule, this.figure, this.outlook);
  }

  /** Say what a purchase would leave in the purse, or how far short the purse is. Null clears it. */
  setOutlook(o: { word: string; figure: number; good: boolean } | null): void {
    this.outlookOn = o !== null;
    if (!o) return;
    this.outlookWord.text = o.word;
    this.outlookFigure.text = String(o.figure);
    this.outlookFigure.setColor(o.good ? UI.good : UI.inkSoft);
  }

  set(value: number, snap: boolean): void {
    this.target = value;
    if (snap) {
      this.shown = value;
      this.figure.text = String(Math.round(value));
    }
  }

  /** Where a note about the last entry (a spend or a refund) should appear. */
  get noteX(): number {
    return this.figure.x + this.figure.textWidth + 16;
  }

  update(dt: number): void {
    this.outlook.alpha += ((this.outlookOn ? 1 : 0) - this.outlook.alpha) * approach(dt, 16);
    if (this.shown === this.target) return;
    // the figure ticks through the numbers between, fast when far and never slower than a crawl
    const gap = this.target - this.shown;
    const step = Math.max(50, Math.abs(gap) * 7) * dt;
    this.shown = Math.abs(gap) <= step ? this.target : this.shown + Math.sign(gap) * step;
    this.figure.text = String(Math.round(this.shown));
  }
}

/** One stake on the rearranging strip: its number, and the Head it carries as a pennant in the Head's tint. */
class StakeTile extends Container {
  readonly body = new Container();
  private readonly glow = new Graphics();
  private readonly key: Container;
  private plate = new Container();
  private sig = '?';
  private focused = false;
  private held = false;
  private lift = 0;
  private lit = 0;
  onPick: (() => void) | null = null;
  onHover: (() => void) | null = null;

  constructor(
    readonly index: number,
    readonly w: number,
  ) {
    super();
    this.glow.rect(-5, -5, w + 10, TILE_H + 10).fill(0xffffff);
    this.glow.tint = CHALK;
    this.glow.alpha = 0;
    const frame = new Graphics().rect(0, 0, w, TILE_H).fill(UI.paperDark).rect(0, 0, w, TILE_H).stroke({ width: 2, color: INK, alpha: 0.9 });
    frame.moveTo(TILE_CELL, 0).lineTo(TILE_CELL, TILE_H).stroke({ width: 1.5, color: INK, alpha: 0.6 });
    const word = new Label('Stake', { size: 8, color: UI.inkSoft, bold: true, tracking: 0.2, align: 'center' });
    word.position.set(TILE_CELL / 2, 15);
    const numeral = romanMark(index + 1, 19);
    numeral.position.set(TILE_CELL / 2, 37);
    this.key = keyCap(String(index + 1));
    this.key.position.set(-10, -12);
    this.key.visible = false;
    this.body.addChild(frame, word, numeral, this.plate, this.key);
    this.addChild(this.glow, this.body);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(0, -10, w, TILE_H + 10);
    this.on('pointerover', () => this.onHover?.());
    this.on('pointertap', () => this.onPick?.());
  }

  /** The pennant that carries the Head. It is what moves when two stakes exchange. */
  get head(): Container {
    return this.plate;
  }

  get plateX(): number {
    return TILE_CELL + 9;
  }

  /** Show the Head mounted here, or none. Returns true if what is shown changed. */
  setHead(def: InstrumentDef | null, rank: number): boolean {
    const sig = def ? `${def.id}:${rank}` : '';
    if (sig === this.sig) return false;
    this.sig = sig;
    this.plate.destroy({ children: true });
    this.plate = new Container();
    this.plate.position.set(this.plateX, 9);
    const pw = this.w - TILE_CELL - 18;
    const ph = TILE_H - 18;
    const shape = [0, 0, pw, 0, pw - 13, ph / 2, pw, ph, 0, ph];
    const g = new Graphics();
    if (def) {
      g.poly(shape).fill(HEAD_TINT[def.tint ?? ''] ?? UI.paperDark).poly(shape).stroke({ width: 2, color: INK, alpha: 0.9, join: 'round' });
      const name = new Label(def.name, { size: 10, color: INK, bold: true, tracking: 0.08 });
      name.position.set(13, 13);
      const pips = rankPips(rank, def.maxRank, INK);
      pips.position.set(13, 33);
      this.plate.addChild(g, name, pips);
    } else {
      g.poly(shape).stroke({ width: 1.5, color: UI.inkSoft, alpha: 0.55, join: 'round' });
      const bare = new Label('Bare', { size: 10, color: UI.inkSoft, bold: true, tracking: 0.2 });
      bare.position.set(13, (ph - 10) / 2);
      this.plate.addChild(g, bare);
    }
    this.body.addChildAt(this.plate, this.body.getChildIndex(this.key));
    return true;
  }

  /** Show the digit that picks this stake (only while a stake is being asked for). */
  setKey(on: boolean): void {
    this.key.visible = on;
  }

  setFocus(on: boolean): void {
    this.focused = on;
  }

  /** The first stake of an exchange stays lifted until the second is picked. */
  setHeld(on: boolean): void {
    this.held = on;
  }

  update(dt: number): void {
    const k = approach(dt, 18);
    this.lift += ((this.held ? 1 : 0) - this.lift) * k;
    this.lit += ((this.focused || this.held ? 1 : 0) - this.lit) * k;
    this.body.y = -10 * this.lift;
    this.glow.y = this.body.y;
    this.glow.alpha = this.lit * 0.9;
  }
}

export class ShopScreen implements Screen {
  readonly root = new Container();
  private readonly dim = new Container();
  /** Scaled and centred by layout(); nothing else touches it. */
  private readonly stage = new Container();
  /** Everything drawn, in the composition's own pixels. Fades on closing. */
  private readonly sheet = new Container();
  private readonly shelves: Shelf[] = [];
  private readonly side = new Container();
  private readonly purse: Purse;
  private readonly ration: Form;
  private readonly restock: Form;
  private readonly gauge: Gauge;
  private readonly healthNow: Label;
  private readonly healthGain: Label;
  private readonly healthMax: Label;
  private readonly leaveButton: Button;
  private readonly strip = new Container();
  private readonly stripTitle: Label;
  private readonly stripKey: Container;
  private readonly stripNote: Label;
  private tiles: StakeTile[] = [];
  private readonly legend = new Container();
  private legendSig = '';
  private readonly spots = new Map<string, Spot>();
  private focus = '';
  private step: Step = { kind: 'browse' };
  private readonly rationAt: number;
  private readonly restockAt: number;
  private closing = false;
  private dead = false;

  constructor(
    private readonly content: ContentRegistry,
    private readonly run: RunState,
    private readonly world: World,
    private readonly items: ShopItem[],
    private readonly tweens: Tweens,
    private readonly o: ShopOptions,
  ) {
    this.root.addChild(this.dim, this.stage);
    this.stage.addChild(this.sheet);
    this.rationAt = items.findIndex((it) => it.kind === 'ration');
    this.restockAt = items.findIndex((it) => it.kind === 'reroll');

    // the heading
    const head = stamp('The Tally Tent', HEADING, 17);
    head.position.set(VIEW_W / 2, 58);
    const sub = new Label(`Sheet ${run.sheet} of ${SHEETS}  -  goods against Chalk, no credit`, { size: 10, color: PAPER, tracking: 0.2, align: 'center' });
    sub.position.set(VIEW_W / 2, 98);
    this.sheet.addChild(head, sub);

    // the shelves
    const stock = items.map((it, i) => (it.kind === 'instrument' ? i : -1)).filter((i) => i >= 0);
    for (let i = 0; i < 3; i++) {
      const holder = new Container();
      holder.position.set(LEFT + i * (CARD_W + GAP), TOP);
      const inner = new Container();
      const caption = new Label('', { size: 9, color: PAPER, tracking: 0.14, align: 'center' });
      caption.position.set(CARD_W / 2, CARD_H + 18);
      inner.addChild(caption);
      holder.addChild(inner);
      this.sheet.addChild(holder);
      const shelf: Shelf = { item: stock[i] ?? -1, inner, card: null, mark: null, caption, sig: '' };
      this.shelves.push(shelf);
      if (shelf.item < 0) {
        // the tent had nothing left for this shelf
        const empty = new Graphics().rect(0, 0, CARD_W, CARD_H).stroke({ width: 1.5, color: PAPER, alpha: 0.28 });
        const none = new Label('Nothing on this shelf', { size: 10, color: PAPER, tracking: 0.16, align: 'center', alpha: 0.55 });
        none.position.set(CARD_W / 2, CARD_H / 2 - 5);
        inner.addChild(empty, none);
        continue;
      }
      this.spots.set(`c${i}`, {
        x: holder.x,
        y: holder.y,
        w: CARD_W,
        h: CARD_H,
        focus: (on) => shelf.card?.setFocus(on),
        act: () => this.pickShelf(i),
      });
    }

    // the counter: purse, ration, fresh stock, the way out
    this.side.position.set(SIDE_X, TOP);
    this.sheet.addChild(this.side);
    this.purse = new Purse(CARD_W, PURSE_H);

    this.ration = new Form('Field ration', CARD_W, RATION_H, '4', 'One per visit');
    this.ration.y = PURSE_H + SIDE_GAP;
    const heals = new Label(`Restores ${RATION_HEAL} health.`, { size: 9, color: INK, maxWidth: TEXT_W });
    heals.position.set(TEXT_X, FORM_HEAD + 14);
    this.gauge = new Gauge(TEXT_W, 11);
    this.gauge.position.set(TEXT_X, FORM_HEAD + 35);
    const healthY = FORM_HEAD + 60;
    this.healthNow = new Label('', { size: 9, color: INK, bold: true, tracking: 0.08 });
    this.healthGain = new Label('', { size: 9, color: UI.good, bold: true, tracking: 0.08 });
    this.healthMax = new Label('', { size: 9, color: UI.inkSoft, bold: true, tracking: 0.08 });
    for (const l of [this.healthNow, this.healthGain, this.healthMax]) l.y = healthY;
    this.ration.content.addChild(heals, this.gauge, this.healthNow, this.healthGain, this.healthMax);
    this.ration.onPick = () => this.pickRation();
    this.ration.onHover = () => this.hover('ration');

    this.restock = new Form('Fresh stock', CARD_W, RESTOCK_H, 'R', `+${RESTOCK_RISE} each time`);
    this.restock.y = this.ration.y + RATION_H + SIDE_GAP;
    const clears = new Label('Restocks the unsold shelves.', { size: 9, color: INK, maxWidth: TEXT_W, lineHeight: 1.75 });
    clears.position.set(TEXT_X, FORM_HEAD + 14);
    this.restock.content.addChild(clears);
    this.restock.onPick = () => this.pickRestock();
    this.restock.onHover = () => this.hover('restock');

    this.leaveButton = new Button('Leave the tent', { width: CARD_W, height: LEAVE_H, hotkey: 'Esc', onClick: () => this.back() });
    this.leaveButton.y = this.restock.y + RESTOCK_H + SIDE_GAP;
    this.leaveButton.on('pointerover', () => this.hover('leave'));
    this.side.addChild(this.purse, this.ration, this.restock, this.leaveButton);

    this.spots.set('ration', { x: SIDE_X, y: TOP + this.ration.y, w: CARD_W, h: RATION_H, focus: (on) => this.ration.setFocus(on), act: () => this.pickRation() });
    this.spots.set('restock', { x: SIDE_X, y: TOP + this.restock.y, w: CARD_W, h: RESTOCK_H, focus: (on) => this.restock.setFocus(on), act: () => this.pickRestock() });
    this.spots.set('leave', { x: SIDE_X, y: TOP + this.leaveButton.y, w: CARD_W, h: LEAVE_H, focus: (on) => this.leaveButton.setFocused(on), act: () => this.back() });

    // the strip of stakes
    this.strip.position.set(LEFT, STRIP_Y);
    this.strip.addChild(paperPanel(GRID_W, STRIP_H, { header: STRIP_HEAD, ruled: false }));
    this.stripTitle = new Label('Rearrange Heads', { size: 11, color: INK, bold: true, tracking: 0.28 });
    this.stripTitle.position.set(18, (STRIP_HEAD - 11) / 2);
    this.stripKey = keyCap('H');
    this.stripKey.position.set(18 + this.stripTitle.textWidth + 16, (STRIP_HEAD - KEYCAP_H) / 2);
    const free = stamp('No charge', UI.good, 8);
    free.position.set(GRID_W - 16 - free.width / 2, STRIP_HEAD / 2);
    this.stripNote = new Label('', { size: 9, color: INK, maxWidth: TILE_X - 20 - 30, lineHeight: 1.75 });
    this.stripNote.position.set(20, STRIP_HEAD + 16);
    this.strip.addChild(this.stripTitle, this.stripKey, free, this.stripNote);
    this.sheet.addChild(this.strip);

    this.legend.position.set(VIEW_W / 2, LEGEND_Y);
    this.sheet.addChild(this.legend);

    this.refresh('first');
    const open = this.shelves.findIndex((s) => this.buyable(s));
    const any = this.shelves.findIndex((s) => s.item >= 0);
    this.setFocus(open >= 0 ? `c${open}` : any >= 0 ? `c${any}` : 'leave', true);

    // open: the map dims, the heading is stamped, the cards are dealt, the counter and the strip slide in
    this.dim.alpha = 0;
    this.tween(0.3, (k) => {
      this.dim.alpha = k;
    });
    this.tween(0.22, (k) => {
      head.alpha = k;
      head.scale.set(1.3 - 0.3 * k);
    });
    this.enter(sub, 0, 0, 0.08);
    this.shelves.forEach((s, i) => this.enter(s.inner, 0, 60, 0.04 + i * 0.06));
    this.enter(this.side, 50, 0, 0.16);
    this.enter(this.strip, 0, 40, 0.2);
    this.enter(this.legend, 0, 0, 0.26);
  }

  layout(w: number, h: number): void {
    this.dim.removeChildren().forEach((c) => c.destroy());
    this.dim.addChild(scrim(w, h));
    const s = Math.max(0.05, Math.min(MAX_SCALE, w / VIEW_W, h / VIEW_H));
    this.stage.scale.set(s);
    this.stage.position.set((w - VIEW_W * s) / 2, (h - VIEW_H * s) / 2);
  }

  update(dt: number, input: Input): void {
    for (const s of this.shelves) s.card?.update(dt);
    for (const t of this.tiles) t.update(dt);
    this.ration.update(dt);
    this.restock.update(dt);
    this.gauge.update(dt);
    this.purse.update(dt);
    if (this.closing) return;

    if (this.step.kind !== 'browse') {
      // a stake is being asked for: the digits name stakes
      for (let i = 0; i < this.tiles.length; i++) if (input.takeCode(`Digit${i + 1}`) || input.takeCode(`Numpad${i + 1}`)) this.pickTile(i);
    } else {
      for (let i = 0; i < this.shelves.length; i++) {
        if (this.shelves[i].item >= 0 && (input.takeCode(`Digit${i + 1}`) || input.takeCode(`Numpad${i + 1}`))) this.pickShelf(i);
      }
      if (input.takeCode('Digit4') || input.takeCode('Numpad4')) this.pickRation();
      if (input.takeCode('KeyR')) this.pickRestock();
      if (input.takeCode('KeyH')) this.beginRearrange(-1);
    }
    if (input.takeCode('ArrowLeft')) this.travel(-1, 0);
    if (input.takeCode('ArrowRight')) this.travel(1, 0);
    if (input.takeCode('ArrowUp')) this.travel(0, -1);
    if (input.takeCode('ArrowDown')) this.travel(0, 1);
    if (input.takeCode('Enter') || input.takeCode('Space') || input.takeCode('KeyF')) this.spots.get(this.focus)?.act();
    if (input.takeCode('Escape') || input.takeCode('Backspace')) this.back();
  }

  destroy(): void {
    this.dead = true;
    this.root.destroy({ children: true });
  }

  // ---------------------------------------------------------------- reading the stock

  private get chalk(): number {
    return this.world.chalk;
  }

  private get stakeCount(): number {
    return this.world.lines.stakes.length;
  }

  private headOn(stake: number): InstrumentDef | null {
    const id = this.world.kit.heads[stake];
    return id ? this.content.instruments[id] ?? null : null;
  }

  private buyable(s: Shelf): boolean {
    const it = this.items[s.item];
    return !!it && !it.sold && this.chalk >= it.price;
  }

  /** A new Head with no bare stake to go on: one stake must give up its own. */
  private needsStake(offer: DraftOffer): boolean {
    if (offer.how === 'swap') return true;
    const def = this.content.instruments[offer.id];
    if (def.kind !== 'head' || (this.world.kit.owned[offer.id] ?? 0) > 0) return false;
    for (let i = 0; i < this.stakeCount; i++) if (!this.world.kit.heads[i]) return false;
    return true;
  }

  private canRearrange(): boolean {
    if (this.stakeCount < 2) return false;
    for (let i = 0; i < this.stakeCount; i++) if (this.world.kit.heads[i]) return true;
    return false;
  }

  /** The line under a card: why it cannot be had, or what taking it would do. */
  private captionFor(it: ShopItem, offer: DraftOffer): string {
    if (it.sold) return 'Entered in your kit';
    if (this.chalk < it.price) return `Short by ${it.price - this.chalk} Chalk`;
    const def = this.content.instruments[offer.id];
    if (this.needsStake(offer)) return `Replaces a Head: ${SWAP_REFUND} Chalk back`;
    if (offer.how === 'rank') return `Raises it from rank ${ROMAN[offer.rank - 2] ?? offer.rank - 1} to ${ROMAN[offer.rank - 1] ?? offer.rank}`;
    const splice = offer.completes ? this.content.splices.find((s) => s.id === offer.completes) : undefined;
    if (splice) return `Completes ${splice.name}`;
    if (def.kind === 'head') {
      let bare = 0;
      while (bare < this.stakeCount && this.world.kit.heads[bare]) bare++;
      return `Mounts on stake ${ROMAN[bare] ?? bare + 1}`;
    }
    return 'Standing order';
  }

  /** Rebuild whatever changed, from the stock and the run as they stand. */
  private refresh(how: 'first' | 'quiet' | 'live' = 'live'): void {
    const first = how === 'first';
    this.shelves.forEach((s, i) => this.refreshShelf(s, i, first));

    // the ration
    const p = this.world.player;
    const hp = Math.round(p.hp);
    const maxHp = Math.round(p.maxHp);
    const ration = this.items[this.rationAt];
    const after = Math.min(maxHp, hp + RATION_HEAL);
    const mends = !!ration && !ration.sold && hp < maxHp;
    this.healthNow.text = `Health ${hp}`;
    this.healthGain.text = mends ? `→ ${after}` : '';
    this.healthMax.text = `of ${maxHp}`;
    this.healthNow.x = TEXT_X;
    this.healthGain.x = this.healthNow.x + this.healthNow.textWidth + 9;
    this.healthMax.x = mends ? this.healthGain.x + this.healthGain.textWidth + 9 : this.healthGain.x;
    this.gauge.set(hp / Math.max(1, maxHp), (mends ? after : hp) / Math.max(1, maxHp), first);
    this.ration.setState(ration ? `${ration.price} Chalk` : '', this.rationRefusal());

    // fresh stock
    const restock = this.items[this.restockAt];
    this.restock.setState(restock ? `${restockCharge(restock)} Chalk` : '', this.restockRefusal());

    // the stakes
    if (this.tiles.length !== this.stakeCount) this.buildTiles();
    for (const t of this.tiles) {
      const def = this.headOn(t.index);
      const changed = t.setHead(def, def ? this.world.kit.owned[def.id] ?? 1 : 0);
      if (changed && how === 'live') this.pop(t.head);
    }

    this.purse.set(this.chalk, first);
    this.applyStep();
  }

  private refreshShelf(shelf: Shelf, i: number, first: boolean): void {
    const it = this.items[shelf.item];
    if (!it || !it.offer) return;
    const offer = it.offer;
    const affordable = !it.sold && this.chalk >= it.price;
    const sig = [offer.id, offer.rank, offer.how, offer.completes ?? '', it.price, it.sold ? 'sold' : affordable ? 'can' : 'cannot'].join('|');
    if (sig !== shelf.sig) {
      // a different instrument on the shelf is fresh stock; anything else is the same card re-described
      const fresh = shelf.sig !== '' && !shelf.sig.startsWith(`${offer.id}|`);
      shelf.sig = sig;
      shelf.card?.destroy({ children: true });
      const card = new Card(this.content, offer, { hotkey: it.sold ? undefined : String(i + 1), price: it.price, affordable, sold: it.sold });
      card.onPick = () => this.pickShelf(i);
      card.onHover = () => this.hover(`c${i}`);
      shelf.inner.addChildAt(card, 0);
      shelf.card = card;
      if (this.focus === `c${i}` || (this.step.kind === 'swap' && this.step.shelf === i)) {
        // the new card takes the old one's place already lifted
        card.setFocus(true);
        card.update(10);
      }
      if (fresh) this.deal(shelf.inner, i * 0.07);
    }
    shelf.caption.text = this.captionFor(it, offer);
    shelf.caption.alpha = it.sold ? 0.5 : 0.85;

    if (it.sold && !shelf.mark) {
      const mark = stamp('Sold', INK, 24);
      mark.position.set(CARD_W / 2, CARD_H * 0.47);
      mark.rotation = -0.2;
      shelf.inner.addChild(mark);
      shelf.mark = mark;
      if (!first) {
        // the stamp comes down hard, and is heard when it lands
        mark.alpha = 0;
        this.tween(0.16, (k) => {
          if (mark.destroyed) return;
          mark.alpha = k;
          mark.scale.set(1.8 - 0.8 * k);
        }, { ease: ease.inCubic, delay: 0.05, done: () => uiSound('stamp') });
      }
    } else if (!it.sold && shelf.mark) {
      shelf.mark.destroy({ children: true });
      shelf.mark = null;
    }
  }

  private rationRefusal(): string {
    const it = this.items[this.rationAt];
    if (!it) return 'None in stock';
    if (it.sold) return 'Sold';
    if (this.world.player.hp >= this.world.player.maxHp) return 'At full health';
    if (this.chalk < it.price) return `Short by ${it.price - this.chalk}`;
    return '';
  }

  private restockRefusal(): string {
    const it = this.items[this.restockAt];
    if (!it) return 'None to be had';
    if (!this.items.some((x) => x.kind === 'instrument' && !x.sold)) return 'Shelves are bare';
    if (this.chalk < restockCharge(it)) return `Short by ${restockCharge(it) - this.chalk}`;
    return '';
  }

  private buildTiles(): void {
    for (const t of this.tiles) {
      this.spots.delete(`t${t.index}`);
      t.destroy({ children: true });
    }
    const n = this.stakeCount;
    const room = GRID_W - TILE_X - 20;
    const w = Math.min(TILE_MAX_W, (room - (n - 1) * TILE_GAP) / Math.max(1, n));
    this.tiles = [];
    for (let i = 0; i < n; i++) {
      const tile = new StakeTile(i, w);
      tile.position.set(TILE_X + i * (w + TILE_GAP), TILE_Y);
      tile.onPick = () => this.pickTile(i);
      tile.onHover = () => this.hover(`t${i}`);
      this.strip.addChild(tile);
      this.tiles.push(tile);
      this.spots.set(`t${i}`, { x: LEFT + tile.x, y: STRIP_Y + tile.y, w, h: TILE_H, focus: (on) => tile.setFocus(on), act: () => this.pickTile(i) });
    }
    if (this.focus.startsWith('t')) {
      const keep = this.spots.has(this.focus) ? this.focus : 't0';
      this.focus = '';
      this.setFocus(keep, true);
    }
  }

  /** Show the step the screen is in: what is dimmed, what the strip asks, which keys are live. */
  private applyStep(): void {
    const st = this.step;
    const asking = st.kind !== 'browse';
    this.shelves.forEach((s, i) => {
      const subject = st.kind === 'swap' && st.shelf === i;
      if (s.card) s.card.alpha = asking && !subject ? DIMMED : 1;
      if (s.mark) s.mark.alpha = asking ? DIMMED : 1;
      s.caption.visible = !asking || subject;
      if (subject) s.card?.setFocus(true);
      else if (this.focus !== `c${i}`) s.card?.setFocus(false);
    });
    this.ration.alpha = asking ? DIMMED : 1;
    this.restock.alpha = asking ? DIMMED : 1;
    for (const t of this.tiles) {
      t.setKey(asking);
      t.setHeld(st.kind === 'rearrange' && st.first === t.index);
    }
    this.leaveButton.setText(asking ? 'Back' : 'Leave the tent');
    this.stripKey.visible = !asking;

    if (st.kind === 'swap') {
      const offer = this.items[this.shelves[st.shelf].item]?.offer;
      const name = offer ? this.content.instruments[offer.id].name : 'The new Head';
      this.stripTitle.text = 'Which stake gives up its Head?';
      this.stripNote.text = `${name} takes its place. The old Head is handed in for ${SWAP_REFUND} Chalk.`;
    } else if (st.kind === 'rearrange') {
      this.stripTitle.text = 'Rearrange Heads';
      this.stripNote.text = st.first < 0 ? 'Pick the first stake.' : `Stake ${ROMAN[st.first] ?? st.first + 1} is lifted. Pick the stake it changes places with.`;
    } else {
      this.stripTitle.text = 'Rearrange Heads';
      this.stripNote.text = this.canRearrange()
        ? 'Pick two stakes and their Heads change places. Its lines follow the Head.'
        : this.stakeCount < 2
          ? 'One stake only. Nothing to rearrange.'
          : 'No Head is mounted yet. Nothing to rearrange.';
    }
    this.drawLegend();
    this.showOutlook();
  }

  /** Beside the purse: what buying the thing under the focus would leave, or how far short the purse is. */
  private showOutlook(): void {
    const st = this.step;
    const key = st.kind === 'swap' ? `c${st.shelf}` : st.kind === 'browse' ? this.focus : '';
    let cost = -1;
    let back = 0;
    if (key.startsWith('c')) {
      const it = this.items[this.shelves[Number(key.slice(1))]?.item ?? -1];
      if (it && it.offer && !it.sold) {
        cost = it.price;
        if (this.needsStake(it.offer)) back = SWAP_REFUND;
      }
    } else if (key === 'ration') {
      const it = this.items[this.rationAt];
      if (it && !it.sold && this.world.player.hp < this.world.player.maxHp) cost = it.price;
    } else if (key === 'restock') {
      const it = this.items[this.restockAt];
      if (it && this.items.some((x) => x.kind === 'instrument' && !x.sold)) cost = restockCharge(it);
    }
    if (cost < 0) this.purse.setOutlook(null);
    else if (this.chalk < cost) this.purse.setOutlook({ word: 'Short by', figure: cost - this.chalk, good: false });
    else this.purse.setOutlook({ word: 'This leaves', figure: this.chalk - cost + back, good: true });
  }

  private drawLegend(): void {
    const asking = this.step.kind !== 'browse';
    const sig = `${asking}:${this.tiles.length}`;
    if (sig === this.legendSig) return;
    this.legendSig = sig;
    this.legend.removeChildren().forEach((c) => c.destroy({ children: true }));
    const groups: Array<[string[], string]> = asking
      ? [[this.tiles.map((t) => String(t.index + 1)), 'Stake'], [ARROWS, 'Move'], [['Enter'], 'Choose'], [['Esc'], 'Back']]
      : [[ARROWS, 'Move'], [['Enter'], 'Choose'], [['Esc'], 'Leave']];
    let x = 0;
    for (const [keys, text] of groups) {
      for (const k of keys) {
        const cap = keyCap(k, true);
        cap.position.set(x, 0);
        this.legend.addChild(cap);
        x += cap.width + 5;
      }
      const l = new Label(text, { size: 9, color: PAPER, tracking: 0.16, alpha: 0.8 });
      l.position.set(x + 5, (KEYCAP_H - 9) / 2);
      this.legend.addChild(l);
      x += 5 + l.textWidth + 36;
    }
    this.legend.pivot.x = (x - 36) / 2;
  }

  // ---------------------------------------------------------------- focus

  /** While a stake is being asked for, only the stakes and the way back can be reached. */
  private reachable(key: string): boolean {
    if (!this.spots.has(key)) return false;
    return this.step.kind === 'browse' || key.startsWith('t') || key === 'leave';
  }

  private hover(key: string): void {
    if (!this.closing && this.reachable(key)) this.setFocus(key);
  }

  private setFocus(key: string, quiet = false): void {
    if (key === this.focus || !this.spots.has(key)) return;
    this.spots.get(this.focus)?.focus(false);
    this.focus = key;
    this.spots.get(key)?.focus(true);
    // the card being bought stays lit while its stake is chosen
    if (this.step.kind === 'swap') this.shelves[this.step.shelf].card?.setFocus(true);
    this.showOutlook();
    if (!quiet) uiSound('move');
  }

  /** Move the focus to the nearest thing in a direction. Things in line with the current one come first. */
  private travel(dx: number, dy: number): void {
    const from = this.spots.get(this.focus);
    if (!from) return;
    let best = '';
    let bestScore = Infinity;
    for (const [key, s] of this.spots) {
      if (key === this.focus || !this.reachable(key)) continue;
      const cx = s.x + s.w / 2 - (from.x + from.w / 2);
      const cy = s.y + s.h / 2 - (from.y + from.h / 2);
      const along = cx * dx + cy * dy;
      if (along <= 1) continue;
      // how far apart the two are across the direction of travel: nothing if they overlap
      const gap = dx !== 0 ? Math.max(0, s.y - (from.y + from.h), from.y - (s.y + s.h)) : Math.max(0, s.x - (from.x + from.w), from.x - (s.x + s.w));
      const off = dx !== 0 ? Math.abs(cy) : Math.abs(cx);
      const score = along + gap * 3 + off * 0.1;
      if (score < bestScore) {
        bestScore = score;
        best = key;
      }
    }
    if (best) this.setFocus(best);
  }

  // ---------------------------------------------------------------- actions

  private pickShelf(i: number): void {
    const shelf = this.shelves[i];
    const it = this.items[shelf.item];
    if (this.closing || this.step.kind !== 'browse' || !it || !it.offer) return;
    this.setFocus(`c${i}`, true);
    if (it.sold || this.chalk < it.price) {
      this.refuse(shelf.inner);
      return;
    }
    if (this.needsStake(it.offer)) {
      this.step = { kind: 'swap', shelf: i, back: `c${i}` };
      uiSound('confirm');
      this.applyStep();
      this.setFocus('t0', true);
      return;
    }
    this.purchase(shelf.item, 0, shelf.inner);
  }

  private pickRation(): void {
    if (this.closing || this.step.kind !== 'browse') return;
    this.setFocus('ration', true);
    if (this.rationRefusal() !== '') this.refuse(this.ration.body);
    else this.purchase(this.rationAt, 0, this.ration.body);
  }

  private pickRestock(): void {
    if (this.closing || this.step.kind !== 'browse') return;
    this.setFocus('restock', true);
    if (this.restockRefusal() !== '') this.refuse(this.restock.body);
    else this.purchase(this.restockAt, 0, this.restock.body);
  }

  /** Pay for an item through the rules, then read the counter back. `from` shakes if the rules say no. */
  private purchase(index: number, stake: number, from: Container): void {
    const before = this.chalk;
    if (!buy(this.run, this.world, this.items, index, stake)) {
      this.refuse(from);
      this.refresh();
      return;
    }
    uiSound('buy');
    this.entry(this.chalk - before);
    this.refresh();
  }

  private beginRearrange(first: number): void {
    if (this.closing || this.step.kind !== 'browse') return;
    if (!this.canRearrange()) {
      this.refuse(this.stripNote, this.stripNote.x);
      return;
    }
    const at = first >= 0 ? `t${first}` : 't0';
    this.step = { kind: 'rearrange', first, back: this.focus.startsWith('t') ? at : this.focus };
    uiSound('confirm');
    this.applyStep();
    this.setFocus(at, true);
  }

  private pickTile(i: number): void {
    const tile = this.tiles[i];
    if (this.closing || !tile) return;
    const st = this.step;
    if (st.kind === 'browse') {
      this.setFocus(`t${i}`, true);
      this.beginRearrange(i);
      return;
    }
    this.setFocus(`t${i}`, true);
    if (st.kind === 'swap') {
      const shelf = this.shelves[st.shelf];
      this.step = { kind: 'browse' };
      this.setFocus(st.back, true);
      this.purchase(shelf.item, i, shelf.inner);
      return;
    }
    if (st.first < 0) {
      st.first = i;
      uiSound('confirm');
      this.applyStep();
      return;
    }
    if (st.first === i) {
      // put it back down
      st.first = -1;
      uiSound('back');
      this.applyStep();
      return;
    }
    const other = this.tiles[st.first];
    if (!this.headOn(i) && !this.headOn(st.first)) {
      // two bare stakes have nothing to exchange
      this.refuse(tile.body);
      this.refuse(other.body);
      return;
    }
    rearrangeHeads(this.world, st.first, i);
    uiSound('confirm');
    this.step = { kind: 'browse' };
    this.refresh('quiet');
    // the two pennants cross over
    const span = other.x - tile.x;
    this.slide(tile.head, tile.plateX, span);
    this.slide(other.head, other.plateX, -span);
  }

  /** Escape: out of a sub-step, or out of the tent. */
  private back(): void {
    if (this.closing) return;
    if (this.step.kind !== 'browse') {
      const to = this.step.back;
      this.step = { kind: 'browse' };
      uiSound('back');
      this.applyStep();
      this.setFocus(to, true);
      return;
    }
    this.closing = true;
    uiSound('back');
    this.tween(0.24, (k) => {
      this.sheet.alpha = 1 - k;
      this.sheet.y = 18 * k;
      this.dim.alpha = 1 - 0.5 * k;
    }, { ease: ease.inQuad });
    this.tweens.wait(0.28, () => {
      if (!this.dead) this.o.onClose();
    });
  }

  // ---------------------------------------------------------------- motion

  /** A tween that stops touching the screen once it is destroyed. */
  private tween(dur: number, step: (k: number) => void, o: { ease?: EaseFn; delay?: number; done?: () => void } = {}): void {
    const done = o.done;
    this.tweens.to(dur, (k) => {
      if (!this.dead) step(k);
    }, { ease: o.ease, delay: o.delay, done: done ? () => { if (!this.dead) done(); } : undefined });
  }

  /** Bring a part of the form in from an offset. */
  private enter(obj: Container, dx: number, dy: number, delay: number): void {
    const x = obj.x;
    const y = obj.y;
    obj.alpha = 0;
    this.tween(0.3, (k) => {
      if (obj.destroyed) return;
      obj.alpha = k;
      obj.position.set(x + dx * (1 - k), y + dy * (1 - k));
    }, { delay });
  }

  /** Fresh stock is dealt onto its shelf from below. */
  private deal(inner: Container, delay: number): void {
    inner.alpha = 0;
    this.tween(0.3, (k) => {
      if (inner.destroyed) return;
      inner.alpha = k;
      inner.y = 60 * (1 - k);
    }, { delay });
  }

  /** A Head newly on a stake arrives with a small bounce. */
  private pop(plate: Container): void {
    const y = plate.y;
    this.tween(0.28, (k) => {
      if (plate.destroyed) return;
      plate.alpha = Math.min(1, k * 2);
      plate.y = y - 14 * (1 - k);
    }, { ease: ease.outBack });
  }

  private slide(plate: Container, home: number, from: number): void {
    this.tween(0.3, (k) => {
      if (!plate.destroyed) plate.x = home + from * (1 - k);
    }, { ease: ease.inOutCubic });
  }

  /** The answer to something that cannot be done: the error sound and a shake of the head. */
  private refuse(target: Container, home = 0): void {
    uiSound('error');
    this.tween(0.28, (k) => {
      if (!target.destroyed) target.x = home + Math.sin(k * Math.PI * 4) * 7 * (1 - k);
    }, { ease: ease.linear });
  }

  /** A ledger entry beside the purse: what just left it, or came back. */
  private entry(delta: number): void {
    if (delta === 0) return;
    const note = new Label(`${delta > 0 ? '+' : '–'}${Math.abs(delta)}`, { size: 14, color: delta > 0 ? UI.good : UI.inkSoft, bold: true });
    note.position.set(this.purse.noteX, 56);
    this.purse.addChild(note);
    this.tween(0.9, (k) => {
      if (note.destroyed) return;
      note.y = 56 - 20 * k;
      note.alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    }, { ease: ease.outQuad, done: () => note.destroy({ children: true }) });
  }
}
