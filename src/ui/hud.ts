// The heads-up display: the margins of the map sheet. Top left is the sheet's title block; the
// purse sits top right; health (a graduated levelling staff), dash diamonds and the Plumb bob
// are bottom left; the stakes and what E will do with them are bottom centre; the controls are
// bottom right. Everything is built once and animated by scale, tint and alpha; lettering is
// redrawn only when its words change.
import { Container, Graphics } from 'pixi.js';
import { damp } from '../core/math';
import { anyFlying, heldStake, oldestPlanted } from '../sim/lines';
import { DASH, PLUMB } from '../sim/tuning';
import type { World } from '../sim/types';
import { CHALK, DANGER, HEAD_TINT, HERO, INK, PAPER, RIM, RIPE } from '../render/palette';
import { Label } from './label';
import { keyCap, stamp } from './widgets';

const STAFF_W = 300;
const STAFF_H = 14;
const ROMAN = ['I', 'II', 'III', 'IV'];
const SLOT_GAP = 46;

/** The controls, as shown along the bottom edge. */
const LEGEND: ReadonlyArray<readonly [string, string]> = [
  ['WASD', 'Move'],
  ['LMB', 'Rod'],
  ['RMB', 'Plumb'],
  ['Space', 'Dash'],
  ['E', 'Stake'],
  ['F', 'Use'],
  ['Esc', 'Pause'],
];

interface StakeSlot {
  root: Container;
  body: Container;
  stake: Graphics;
  cap: Graphics;
  ground: Graphics;
  next: Graphics;
  lost: Graphics;
}

function stakeSlot(index: number): StakeSlot {
  const root = new Container();
  const ground = new Graphics().ellipse(0, 15, 15, 5).stroke({ width: 1.8, color: 0xffffff });
  const body = new Container();
  const stake = new Graphics().poly([-3.2, -20, 3.2, -20, 2.6, 9, 0, 16, -2.6, 9]).fill(0xffffff);
  const cap = new Graphics().circle(0, -23, 5.5).fill(0xffffff).poly([3, -27, 19, -22.5, 3, -18]).fill(0xffffff);
  body.addChild(stake, cap);
  // a chevron over the stake that E will move next
  const next = new Graphics().poly([-6, -42, 6, -42, 0, -34]).fill(0xffffff);
  next.tint = CHALK;
  // a stake that has been taken: a ring that closes as it comes back
  const lost = new Graphics().circle(0, -4, 17).stroke({ width: 2.5, color: 0xffffff });
  lost.tint = DANGER;
  const num = new Label(ROMAN[index], { size: 7, color: PAPER, bold: true, align: 'center', alpha: 0.8 });
  num.position.set(0, 25);
  root.addChild(ground, body, next, lost, num);
  return { root, body, stake, cap, ground, next, lost };
}

export class Hud {
  readonly root = new Container();

  // --- vitals
  private readonly vitals = new Container();
  private readonly hpFill = new Graphics();
  private readonly hpGhost = new Graphics();
  private readonly hpFlash = new Graphics();
  private readonly hpText: Label;
  private readonly pips: Array<{ frame: Graphics; fill: Graphics }> = [];
  private readonly plumbFill = new Graphics();
  private readonly plumbIcon = new Graphics();
  private ghost = 1;
  private shown = 1;
  private flash = 0;
  private plumbPop = 0;
  private lastHp = -1;
  private lastCharges = -1;
  private readonly pipPop: number[] = [];

  // --- stakes
  private readonly stakes = new Container();
  private readonly slots: StakeSlot[] = [];
  private readonly verb = new Container();
  private verbText = '';
  private readonly plate = new Graphics();
  private plateCount = 0;

  // --- title block, purse, legend, banner, frame
  private readonly title = new Container();
  private readonly titleHead: Label;
  private readonly titleSub: Label;
  private readonly titleNote: Label;
  private readonly purse = new Container();
  private readonly purseText: Label;
  private readonly purseIcon = new Graphics();
  private pursePop = 0;
  private lastChalk = -1;
  private readonly legend = new Container();
  private readonly bannerBox = new Container();
  private bannerT = -1;
  private bannerLife = 1.7;
  private readonly frame = new Graphics();
  private scale = 1;

  constructor() {
    this.root.eventMode = 'none';
    this.root.addChild(this.frame, this.title, this.purse, this.vitals, this.stakes, this.legend, this.bannerBox);

    // ---------------------------------------------------------- vitals
    const panel = new Graphics();
    panel.roundRect(-14, -30, STAFF_W + 28, 86, 4).fill({ color: INK, alpha: 0.72 }).roundRect(-14, -30, STAFF_W + 28, 86, 4).stroke({ width: 1.5, color: RIM, alpha: 0.35 });
    panel.rect(0, 0, STAFF_W, STAFF_H).fill({ color: 0x000000, alpha: 0.55 });
    this.vitals.addChild(panel);

    this.hpGhost.rect(0, 0, STAFF_W, STAFF_H).fill(0xffffff);
    this.hpGhost.tint = DANGER;
    this.hpFill.rect(0, 0, STAFF_W, STAFF_H).fill(0xffffff);
    this.hpFill.tint = PAPER;
    this.hpFlash.rect(0, 0, STAFF_W, STAFF_H).fill(0xffffff);
    this.hpFlash.alpha = 0;
    this.vitals.addChild(this.hpGhost, this.hpFill, this.hpFlash);

    // graduations: a tick every twentieth, a long one every half, drawn over the fill like a real staff
    const ticks = new Graphics();
    for (let i = 0; i <= 20; i++) {
      const x = (i / 20) * STAFF_W;
      const long = i % 10 === 0;
      const mid = i % 2 === 0;
      ticks.moveTo(x, STAFF_H).lineTo(x, STAFF_H - (long ? STAFF_H : mid ? 8 : 4));
    }
    ticks.stroke({ width: 1.5, color: INK, alpha: 0.75 });
    ticks.rect(0, 0, STAFF_W, STAFF_H).stroke({ width: 1.5, color: RIM, alpha: 0.9 });
    for (let i = 0; i < 10; i += 2) ticks.rect((i / 10) * STAFF_W, -5, STAFF_W / 10, 3).fill({ color: RIM, alpha: 0.7 });
    this.vitals.addChild(ticks);

    this.hpText = new Label('', { size: 8, color: PAPER, bold: true, tracking: 0.08, align: 'right' });
    this.hpText.position.set(STAFF_W, -21);
    const hpName = new Label('Health', { size: 7, color: PAPER, tracking: 0.3, alpha: 0.7 });
    hpName.position.set(0, -20);
    this.vitals.addChild(this.hpText, hpName);

    // dash pips: survey diamonds
    for (let i = 0; i < 4; i++) {
      const frame = new Graphics().poly([0, -9, 9, 0, 0, 9, -9, 0]).stroke({ width: 1.8, color: 0xffffff, join: 'round' });
      frame.tint = RIM;
      const fill = new Graphics().poly([0, -6.5, 6.5, 0, 0, 6.5, -6.5, 0]).fill(0xffffff);
      fill.tint = HERO.rim;
      frame.position.set(12 + i * 26, 36);
      fill.position.copyFrom(frame.position);
      this.vitals.addChild(frame, fill);
      this.pips.push({ frame, fill });
      this.pipPop.push(0);
    }

    // Plumb Shot: a bob that fills from the tip as it comes ready
    const px = STAFF_W - 14;
    const py = 36;
    const bobShape = [0, 13, -8, -1, -6.5, -9, 6.5, -9, 8, -1];
    this.plumbIcon.poly(bobShape).stroke({ width: 1.8, color: 0xffffff, join: 'round' }).rect(-3, -14, 6, 5).stroke({ width: 1.6, color: 0xffffff });
    this.plumbIcon.tint = RIM;
    this.plumbIcon.position.set(px, py);
    this.plumbFill.poly(bobShape).fill(0xffffff);
    this.plumbFill.tint = CHALK;
    this.plumbFill.position.set(px, py);
    this.vitals.addChild(this.plumbFill, this.plumbIcon);

    // ---------------------------------------------------------- stakes
    this.stakes.addChild(this.plate, this.verb);
    for (let i = 0; i < 4; i++) {
      const slot = stakeSlot(i);
      this.slots.push(slot);
      this.stakes.addChild(slot.root);
    }

    // ---------------------------------------------------------- title block
    const block = new Graphics();
    block.rect(0, 0, 286, 74).fill({ color: INK, alpha: 0.72 }).rect(0, 0, 286, 74).stroke({ width: 1.5, color: RIM, alpha: 0.35 });
    block.moveTo(0, 30).lineTo(286, 30).stroke({ width: 1, color: RIM, alpha: 0.3 });
    this.titleHead = new Label('', { size: 12, color: PAPER, bold: true, tracking: 0.2 });
    this.titleHead.position.set(12, 9);
    this.titleSub = new Label('', { size: 8, color: PAPER, tracking: 0.2, alpha: 0.8 });
    this.titleSub.position.set(12, 38);
    this.titleNote = new Label('', { size: 8, color: PAPER, bold: true, tracking: 0.2 });
    this.titleNote.position.set(12, 56);
    this.title.addChild(block, this.titleHead, this.titleSub, this.titleNote);

    // ---------------------------------------------------------- purse
    const purseBack = new Graphics().rect(-150, 0, 150, 34).fill({ color: INK, alpha: 0.72 }).rect(-150, 0, 150, 34).stroke({ width: 1.5, color: RIM, alpha: 0.35 });
    // a stick of chalk
    this.purseIcon.poly([-9, -3.5, 7, -3.5, 9, 0, 7, 3.5, -9, 3.5]).fill(0xffffff);
    this.purseIcon.tint = RIPE;
    this.purseIcon.rotation = -0.5;
    this.purseIcon.position.set(-128, 17);
    this.purseText = new Label('0', { size: 11, color: PAPER, bold: true, tracking: 0.1, align: 'right' });
    this.purseText.position.set(-12, 11.5);
    const purseName = new Label('Chalk', { size: 7, color: PAPER, tracking: 0.3, alpha: 0.7 });
    purseName.position.set(-110, 13.5);
    this.purse.addChild(purseBack, this.purseIcon, purseName, this.purseText);

    // ---------------------------------------------------------- legend
    let x = 0;
    for (let i = LEGEND.length - 1; i >= 0; i--) {
      const [key, what] = LEGEND[i];
      const label = new Label(what, { size: 7, color: PAPER, tracking: 0.16, alpha: 0.85 });
      x -= label.textWidth;
      label.position.set(x, 6.5);
      const cap = keyCap(key, true);
      cap.scale.set(0.82);
      x -= cap.width + 6;
      cap.position.set(x, 0);
      x -= 16;
      this.legend.addChild(cap, label);
    }
    this.legend.alpha = 0.8;
  }

  /** Anchor every cluster to its corner of the sheet. */
  layout(viewW: number, viewH: number): void {
    const s = Math.max(0.8, Math.min(1.5, viewH / 900));
    this.scale = s;
    this.vitals.scale.set(s);
    this.vitals.position.set(36 * s, viewH - 82 * s);
    this.stakes.scale.set(s);
    this.stakes.position.set(viewW / 2, viewH - 58 * s);
    this.title.scale.set(s);
    this.title.position.set(22 * s, 22 * s);
    this.purse.scale.set(s);
    this.purse.position.set(viewW - 22 * s, 22 * s);
    this.legend.scale.set(s);
    this.legend.position.set(viewW - 26 * s, viewH - 44 * s);
    // on a narrow window the legend would run into the stakes: it yields
    this.legend.visible = viewW / s >= 1500;
    this.bannerBox.position.set(viewW / 2, 150 * s);

    // the neatline: the border every map sheet has, with registration marks in the corners
    const g = this.frame;
    const m = 10 * s;
    g.clear();
    g.rect(m, m, viewW - 2 * m, viewH - 2 * m).stroke({ width: 1, color: RIM, alpha: 0.22 });
    for (const [cx, cy] of [[m, m], [viewW - m, m], [m, viewH - m], [viewW - m, viewH - m]] as const) {
      g.moveTo(cx - 7, cy).lineTo(cx + 7, cy).moveTo(cx, cy - 7).lineTo(cx, cy + 7);
    }
    g.stroke({ width: 1.5, color: RIM, alpha: 0.5 });
  }

  /** The title block: which sheet this is, and where. */
  setSheet(heading: string, sub: string): void {
    this.titleHead.text = heading;
    this.titleSub.text = sub;
  }

  /** Stamp a short message across the top of the sheet for a moment. */
  banner(text: string, color: number, seconds = 1.7): void {
    this.bannerBox.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.bannerBox.addChild(stamp(text, color, 16));
    this.bannerT = 0;
    this.bannerLife = seconds;
  }

  update(w: World, dt: number, time: number): void {
    this.updateVitals(w, dt);
    this.updateStakes(w, time);

    // the purse pops when Chalk comes in
    if (w.chalk !== this.lastChalk) {
      if (this.lastChalk >= 0 && w.chalk > this.lastChalk) this.pursePop = 1;
      this.lastChalk = w.chalk;
      this.purseText.text = String(w.chalk);
    }
    this.pursePop = damp(this.pursePop, 0, 10, dt);
    this.purseIcon.scale.set(1 + this.pursePop * 0.5);
    this.purseText.setColor(this.pursePop > 0.2 ? RIPE : PAPER);

    // what is happening in this room
    const f = w.flow;
    let note = '';
    let noteColor = PAPER;
    if (f.handicap) {
      note = `Wager: ${f.handicap === 'shortChain' ? 'Short Chain' : f.handicap === 'slackLine' ? 'Slack Line' : 'Two Stakes'}`;
      noteColor = DANGER;
    } else if (f.phase === 'fight' && f.waves > 0) {
      note = `${f.elite ? 'Elite  -  ' : ''}Wave ${Math.max(1, f.wave)} of ${f.waves}`;
      noteColor = f.elite ? DANGER : PAPER;
    } else if (f.phase === 'cleared') note = 'Surveyed: take the requisition';
    else if (f.kind === 'combat' || f.kind === 'miniboss' || f.kind === 'boss') note = 'The way is open';
    this.titleNote.text = note;
    this.titleNote.setColor(noteColor);

    // banner: stamped down, held, lifted away
    if (this.bannerT >= 0) {
      this.bannerT += dt;
      const t = this.bannerT;
      const life = this.bannerLife;
      const b = this.bannerBox;
      if (t >= life) {
        this.bannerT = -1;
        b.removeChildren().forEach((c) => c.destroy({ children: true }));
      } else {
        const inK = Math.min(1, t / 0.14);
        const outK = Math.max(0, (t - (life - 0.3)) / 0.3);
        b.alpha = inK * (1 - outK);
        b.scale.set(this.scale * (1.7 - 0.7 * inK * (2 - inK)) * (1 + outK * 0.08));
      }
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }

  private updateVitals(w: World, dt: number): void {
    const p = w.player;
    const frac = Math.max(0, p.hp / p.maxHp);
    if (this.lastHp >= 0 && p.hp < this.lastHp) this.flash = 1;
    if (p.hp !== this.lastHp) this.hpText.text = `${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`;
    this.lastHp = p.hp;
    this.shown = damp(this.shown, frac, 22, dt);
    // The red ghost lingers, then drains: you see what the hit cost.
    if (this.ghost < this.shown) this.ghost = this.shown;
    else this.ghost = damp(this.ghost, this.shown, 2.6, dt);
    this.hpFill.scale.x = Math.max(0.0001, this.shown);
    this.hpGhost.scale.x = Math.max(0.0001, this.ghost);
    this.flash = damp(this.flash, 0, 9, dt);
    this.hpFlash.alpha = this.flash * 0.8;
    this.hpFlash.scale.x = Math.max(0.0001, this.shown);
    this.hpFill.tint = frac < 0.3 ? DANGER : PAPER;

    // dash
    if (this.lastCharges >= 0 && p.dashCharges > this.lastCharges) this.pipPop[p.dashCharges - 1] = 1;
    this.lastCharges = p.dashCharges;
    for (let i = 0; i < this.pips.length; i++) {
      const pip = this.pips[i];
      const exists = i < p.dashMaxCharges;
      pip.frame.visible = exists;
      pip.fill.visible = exists;
      if (!exists) continue;
      this.pipPop[i] = damp(this.pipPop[i], 0, 10, dt);
      if (i < p.dashCharges) {
        pip.fill.alpha = 1;
        pip.fill.scale.set(1 + this.pipPop[i] * 0.6);
      } else if (i === p.dashCharges) {
        // the next charge grows as it recharges
        const k = p.dashRecharge / DASH.recharge;
        pip.fill.alpha = 0.45;
        pip.fill.scale.set(Math.max(0.0001, k));
      } else {
        pip.fill.alpha = 0;
      }
    }

    // plumb
    const ready = p.plumbCooldown <= 0;
    const k = 1 - p.plumbCooldown / PLUMB.cooldown;
    if (ready && this.plumbFill.alpha < 1) this.plumbPop = 1;
    this.plumbPop = damp(this.plumbPop, 0, 9, dt);
    this.plumbFill.alpha = ready ? 1 : 0.4;
    this.plumbFill.scale.set(ready ? 1 + this.plumbPop * 0.5 : Math.max(0.0001, k));
    this.plumbIcon.alpha = ready ? 1 : 0.6;
  }

  private updateStakes(w: World, time: number): void {
    const L = w.lines;
    const n = L.stakes.length;
    if (n !== this.plateCount) {
      // the backing plate fits the number of stakes carried
      this.plateCount = n;
      const half = ((n - 1) * SLOT_GAP) / 2;
      this.plate.clear();
      this.plate.roundRect(-half - 128, -50, half * 2 + 162, 92, 4).fill({ color: INK, alpha: 0.72 }).roundRect(-half - 128, -50, half * 2 + 162, 92, 4).stroke({ width: 1.5, color: RIM, alpha: 0.35 });
      this.slots.forEach((slot, i) => {
        slot.root.visible = i < n;
        slot.root.position.set(-half + i * SLOT_GAP, 0);
      });
      this.verb.position.set(-half - 114, -12);
    }

    const held = heldStake(L);
    const flying = anyFlying(L);
    const oldest = held ? undefined : oldestPlanted(L);
    const pulse = 0.5 + 0.5 * Math.sin(time * 7);
    for (let i = 0; i < n; i++) {
      const s = L.stakes[i];
      const slot = this.slots[i];
      const tintId = s.head ? w.content.instruments[s.head]?.tint : undefined;
      const headTint = tintId ? HEAD_TINT[tintId] ?? CHALK : null;
      const isNext = (held !== undefined && s === held) || (oldest !== undefined && s === oldest && !flying && L.whipLock <= 0);
      slot.next.visible = isNext;
      slot.next.y = isNext ? -2 * pulse : 0;
      slot.lost.visible = s.state === 'lost';
      slot.body.rotation = 0;
      slot.body.y = 0;
      slot.body.alpha = 1;
      if (s.state === 'held') {
        // in hand: lifted off the ground, pale like the rod
        slot.body.y = -5;
        slot.stake.tint = HERO.rodPale;
        slot.ground.tint = RIM;
        slot.ground.alpha = 0.25;
      } else if (s.state === 'planted') {
        slot.stake.tint = CHALK;
        slot.ground.tint = CHALK;
        slot.ground.alpha = 0.9;
      } else if (s.state === 'flying') {
        slot.body.rotation = 0.7;
        slot.body.y = -8;
        slot.stake.tint = RIPE;
        slot.ground.tint = RIM;
        slot.ground.alpha = 0.25;
      } else {
        slot.body.alpha = 0.25;
        slot.stake.tint = RIM;
        slot.ground.tint = DANGER;
        slot.ground.alpha = 0.6;
        // the ring closes as the stake comes back
        slot.lost.scale.set(0.45 + 0.55 * Math.min(1, s.lostT / Math.max(0.1, L.rules.lostTime)));
        slot.lost.alpha = 0.5 + 0.4 * pulse;
      }
      slot.cap.visible = headTint !== null;
      if (headTint !== null) slot.cap.tint = headTint;
    }

    // what E does right now, in a word
    const verb = held ? 'Plant' : oldest && !flying && L.whipLock <= 0 ? 'Whip' : oldest || flying ? 'Wait' : 'None';
    if (verb !== this.verbText) {
      this.verbText = verb;
      this.verb.removeChildren().forEach((c) => c.destroy({ children: true }));
      const cap = keyCap('E', true);
      const label = new Label(verb, { size: 10, color: verb === 'Plant' || verb === 'Whip' ? CHALK : PAPER, bold: true, tracking: 0.16, alpha: verb === 'Wait' || verb === 'None' ? 0.5 : 1 });
      label.position.set(cap.width + 10, 7);
      this.verb.addChild(cap, label);
    }
  }
}
