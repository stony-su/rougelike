// The heads-up display: your health, dash, special and Rally at the bottom left, the purse at
// the top right, the chamber's title at the top left, and a frame for each teammate under it.
// Everything is built once and animated by scale, tint and alpha; lettering is redrawn only when
// its words change. There is no controls legend here: controls live on their own page in the menu.
import { Container, Graphics } from 'pixi.js';
import { damp, mixColor } from '../core/math';
import { BREAK, DASH, RALLY as RALLY_RULES, RINGSTONE, RIPOSTE } from '../sim/tuning';
import type { ClassId, Player, World } from '../sim/types';
import type { NetStats } from '../game/driver';
import { CHIME, DANGER, INK, PAPER, PLAYER_COLORS, RALLY, RIM, RIPE } from '../render/palette';
import { Label } from './label';
import { stamp } from './widgets';

const BAR_W = 300;
const BAR_H = 14;
const MATE_W = 150;
/** The Rally meter: one bar per point, each a little taller than the last, like a scale being climbed. */
const NOTE_W = BAR_W / RALLY_RULES.cap;
const noteHeight = (i: number): number => 5 + i * 0.55;

/** What each class calls itself and its special, and how long that special takes to come back. */
const CLASSES: Record<ClassId, { name: string; special: string; cooldown: number }> = {
  sword: { name: 'The Edge', special: 'Riposte', cooldown: RIPOSTE.cooldown },
  bow: { name: 'The String', special: 'Ringstone', cooldown: RINGSTONE.cooldown },
  fist: { name: 'The Hand', special: 'Break', cooldown: BREAK.cooldown },
};

interface MateFrame {
  root: Container;
  fill: Graphics;
  tag: Label;
}

export class Hud {
  readonly root = new Container();

  // --- your own vitals
  private readonly vitals = new Container();
  private readonly hpFill = new Graphics();
  private readonly hpGhost = new Graphics();
  private readonly hpFlash = new Graphics();
  private readonly hpText: Label;
  private readonly pips: Array<{ frame: Graphics; fill: Graphics }> = [];
  private readonly pipPop: number[] = [];
  private ghost = 1;
  private shown = 1;
  private flash = 0;
  private lastHp = -1;
  private lastCharges = -1;

  // --- the special and the Rally
  private readonly dial = new Graphics();
  private readonly dialGlow = new Graphics();
  private readonly specialName: Label;
  private readonly className: Label;
  private dialStep = -1;
  private dialPop = 0;
  private lastClass: ClassId | '' = '';
  private readonly notes: Graphics[] = [];
  private readonly notePop: number[] = [];
  private readonly rallyHold = new Graphics();
  private readonly rallyText: Label;
  private lastRally = 0;
  private rallyDrop = 0;
  private breath = 0;

  // --- title, purse, teammates, banner, frame
  private readonly title = new Container();
  private runLength = 0;
  private readonly titleHead: Label;
  private readonly titleNote: Label;
  private readonly purse = new Container();
  private readonly purseText: Label;
  private readonly purseIcon = new Graphics();
  private readonly netText: Label;
  private netShown = '';
  private pursePop = 0;
  private lastChimes = -1;
  private readonly mates = new Container();
  private readonly mateFrames: MateFrame[] = [];
  private readonly bannerBox = new Container();
  private bannerT = -1;
  private bannerLife = 1.7;
  private readonly frame = new Graphics();
  private scale = 1;

  constructor() {
    this.root.eventMode = 'none';
    this.root.addChild(this.frame, this.title, this.mates, this.purse, this.vitals, this.bannerBox);

    // ---------------------------------------------------------- vitals
    const panel = new Graphics();
    panel
      .roundRect(-14, -30, BAR_W + 28, 86, 4)
      .fill({ color: INK, alpha: 0.72 })
      .roundRect(-14, -30, BAR_W + 28, 86, 4)
      .stroke({ width: 1.5, color: RIM, alpha: 0.35 });
    panel.rect(0, 0, BAR_W, BAR_H).fill({ color: 0x000000, alpha: 0.55 });
    this.vitals.addChild(panel);
    this.hpGhost.rect(0, 0, BAR_W, BAR_H).fill(0xffffff);
    this.hpGhost.tint = DANGER;
    this.hpFill.rect(0, 0, BAR_W, BAR_H).fill(0xffffff);
    this.hpFill.tint = PAPER;
    this.hpFlash.rect(0, 0, BAR_W, BAR_H).fill(0xffffff);
    this.hpFlash.alpha = 0;
    const edge = new Graphics().rect(0, 0, BAR_W, BAR_H).stroke({ width: 1.5, color: RIM, alpha: 0.9 });
    this.vitals.addChild(this.hpGhost, this.hpFill, this.hpFlash, edge);
    this.hpText = new Label('', { size: 8, color: PAPER, bold: true, tracking: 0.08, align: 'right' });
    this.hpText.position.set(BAR_W, -21);
    const hpName = new Label('Health', { size: 7, color: PAPER, tracking: 0.3, alpha: 0.7 });
    hpName.position.set(0, -20);
    this.vitals.addChild(this.hpText, hpName);

    // dash pips
    for (let i = 0; i < 4; i++) {
      const frame = new Graphics().poly([0, -9, 9, 0, 0, 9, -9, 0]).stroke({ width: 1.8, color: 0xffffff, join: 'round' });
      frame.tint = RIM;
      const fill = new Graphics().poly([0, -6.5, 6.5, 0, 0, 6.5, -6.5, 0]).fill(0xffffff);
      frame.position.set(12 + i * 26, 36);
      fill.position.copyFrom(frame.position);
      this.vitals.addChild(frame, fill);
      this.pips.push({ frame, fill });
      this.pipPop.push(0);
    }

    // the special: a dial that fills as it comes back, and its name
    this.dialGlow.circle(0, 0, 15).fill({ color: 0xffffff, alpha: 0.35 });
    this.dialGlow.position.set(BAR_W - 14, 36);
    this.dial.position.set(BAR_W - 14, 36);
    this.specialName = new Label('', { size: 7, color: PAPER, tracking: 0.25, align: 'right', alpha: 0.85 });
    this.specialName.position.set(BAR_W - 34, 32.5);
    this.className = new Label('', { size: 7, color: PAPER, bold: true, tracking: 0.3, align: 'center' });
    this.className.position.set(BAR_W / 2, -20);
    this.vitals.addChild(this.dialGlow, this.dial, this.specialName, this.className);

    // the Rally: twenty notes above the panel, and a thin line for how long it will hold
    const rally = new Container();
    rally.position.set(0, -44);
    const rallyBack = new Graphics().roundRect(-14, -30, BAR_W + 28, 40, 4).fill({ color: INK, alpha: 0.6 });
    rally.addChild(rallyBack);
    for (let i = 0; i < RALLY_RULES.cap; i++) {
      const h = noteHeight(i);
      const slot = new Graphics().roundRect(1, -h, NOTE_W - 2.5, h, 1.5).fill({ color: 0xffffff, alpha: 0.14 });
      slot.position.set(i * NOTE_W, 0);
      const note = new Graphics().roundRect(1, -h, NOTE_W - 2.5, h, 1.5).fill(0xffffff);
      note.position.set(i * NOTE_W, 0);
      note.tint = mixColor(RALLY.low, RALLY.high, i / (RALLY_RULES.cap - 1));
      note.visible = false;
      rally.addChild(slot, note);
      this.notes.push(note);
      this.notePop.push(0);
    }
    this.rallyHold.rect(0, 0, BAR_W, 2).fill(0xffffff);
    this.rallyHold.position.set(0, 3.5);
    this.rallyHold.tint = RALLY.low;
    this.rallyText = new Label('', { size: 7, color: PAPER, bold: true, tracking: 0.3 });
    this.rallyText.position.set(0, -27);
    rally.addChild(this.rallyHold, this.rallyText);
    this.vitals.addChild(rally);

    // ---------------------------------------------------------- title block
    const block = new Graphics();
    block.rect(0, 0, 286, 56).fill({ color: INK, alpha: 0.72 }).rect(0, 0, 286, 56).stroke({ width: 1.5, color: RIM, alpha: 0.35 });
    block.moveTo(0, 30).lineTo(286, 30).stroke({ width: 1, color: RIM, alpha: 0.3 });
    this.titleHead = new Label('', { size: 12, color: PAPER, bold: true, tracking: 0.2 });
    this.titleHead.position.set(12, 9);
    this.titleNote = new Label('', { size: 8, color: PAPER, tracking: 0.2, alpha: 0.85 });
    this.titleNote.position.set(12, 38);
    this.title.addChild(block, this.titleHead, this.titleNote);

    // ---------------------------------------------------------- purse
    const purseBack = new Graphics().rect(-150, 0, 150, 34).fill({ color: INK, alpha: 0.72 }).rect(-150, 0, 150, 34).stroke({ width: 1.5, color: RIM, alpha: 0.35 });
    // a chime: a small bright lozenge
    this.purseIcon.poly([0, -8, 6, 0, 0, 8, -6, 0]).fill(0xffffff);
    this.purseIcon.tint = CHIME;
    this.purseIcon.position.set(-130, 17);
    this.purseText = new Label('0', { size: 11, color: PAPER, bold: true, tracking: 0.1, align: 'right' });
    this.purseText.position.set(-12, 11.5);
    const purseName = new Label('Chimes', { size: 7, color: PAPER, tracking: 0.3, alpha: 0.7 });
    purseName.position.set(-114, 13.5);
    this.purse.addChild(purseBack, this.purseIcon, purseName, this.purseText);
    // under the purse, in co-op: how long a press takes to show
    this.netText = new Label('', { size: 7, color: PAPER, tracking: 0.25, align: 'right', alpha: 0.75 });
    this.netText.position.set(-2, 44);
    this.purse.addChild(this.netText);
  }

  /** Anchor every cluster to its corner of the screen. */
  layout(viewW: number, viewH: number): void {
    const s = Math.max(0.8, Math.min(1.5, viewH / 900));
    this.scale = s;
    this.vitals.scale.set(s);
    this.vitals.position.set(36 * s, viewH - 82 * s);
    this.title.scale.set(s);
    this.title.position.set(22 * s, 22 * s);
    this.mates.scale.set(s);
    this.mates.position.set(22 * s, 88 * s);
    this.purse.scale.set(s);
    this.purse.position.set(viewW - 22 * s, 22 * s);
    this.bannerBox.position.set(viewW / 2, 150 * s);

    const g = this.frame;
    const m = 10 * s;
    g.clear();
    g.rect(m, m, viewW - 2 * m, viewH - 2 * m).stroke({ width: 1, color: RIM, alpha: 0.18 });
  }

  /** In co-op, a small line about the connection: the delay from a press to its effect, or that the link is down. */
  setNet(net: NetStats | null): void {
    let text = '';
    let color = PAPER;
    if (net) {
      // rounded to tens, so it does not flicker
      const ms = Math.round(net.delay / 10) * 10;
      text = net.online ? `Delay ${ms} ms` : 'Reconnecting';
      color = !net.online || ms > 140 ? DANGER : ms > 100 ? RIPE : PAPER;
    }
    if (text === this.netShown) return;
    this.netShown = text;
    this.netText.text = text;
    this.netText.setColor(color);
  }

  /** Stamp a short message across the top of the screen for a moment. */
  /** How many chambers the run has (0 on the practice ladder, which has no end). */
  setRun(length: number): void {
    this.runLength = length;
  }

  banner(text: string, color: number, seconds = 1.7): void {
    this.bannerBox.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.bannerBox.addChild(stamp(text, color, 16));
    this.bannerT = 0;
    this.bannerLife = seconds;
  }

  /** `me` is this laptop's own player; the others in the world get small frames. */
  update(w: World, me: Player | undefined, dt: number): void {
    if (me) this.updateVitals(me, dt);
    this.vitals.visible = me !== undefined;

    const chimes = me ? me.chimes : 0;
    if (chimes !== this.lastChimes) {
      if (this.lastChimes >= 0 && chimes > this.lastChimes) this.pursePop = 1;
      this.lastChimes = chimes;
      this.purseText.text = String(chimes);
    }
    this.pursePop = damp(this.pursePop, 0, 10, dt);
    this.purseIcon.scale.set(1 + this.pursePop * 0.5);
    this.purseText.setColor(this.pursePop > 0.2 ? RIPE : PAPER);

    // what is happening in this chamber
    const f = w.flow;
    this.titleHead.text = this.runLength > 0 ? `Chamber ${w.chamber} of ${this.runLength}` : `Chamber ${w.chamber}`;
    this.titleNote.text = f.kind === 'camp' ? 'Camp' : f.phase === 'fight' ? `Wave ${Math.max(1, f.wave)} of ${f.waves}` : 'Cleared';

    // teammates
    let n = 0;
    for (const p of w.players) {
      if (me && p.slot === me.slot) continue;
      let mf = this.mateFrames[n];
      if (!mf) {
        mf = this.makeMate();
        this.mateFrames.push(mf);
        this.mates.addChild(mf.root);
      }
      mf.root.visible = true;
      mf.root.position.set(0, n * 30);
      const color = PLAYER_COLORS[p.slot] ?? RIM;
      mf.fill.tint = p.state === 'down' ? DANGER : color;
      mf.fill.scale.x = Math.max(0.0001, p.hp / p.maxHp);
      mf.tag.text = p.state === 'down' ? `P${p.slot + 1}  down` : `P${p.slot + 1}`;
      mf.tag.setColor(color);
      n++;
    }
    for (let i = n; i < this.mateFrames.length; i++) this.mateFrames[i].root.visible = false;

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

  private makeMate(): MateFrame {
    const root = new Container();
    const back = new Graphics().rect(0, 0, MATE_W, 24).fill({ color: INK, alpha: 0.72 }).rect(0, 0, MATE_W, 24).stroke({ width: 1.2, color: RIM, alpha: 0.35 });
    const fill = new Graphics().rect(0, 0, MATE_W - 8, 4).fill(0xffffff);
    fill.position.set(4, 17);
    const tag = new Label('', { size: 7, color: PAPER, bold: true, tracking: 0.16 });
    tag.position.set(6, 5);
    root.addChild(back, fill, tag);
    return { root, fill, tag };
  }

  private updateVitals(p: Player, dt: number): void {
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
    this.hpFill.tint = frac < 0.3 ? DANGER : (PLAYER_COLORS[p.slot] ?? PAPER);

    this.updateSpecial(p, dt);
    this.updateRally(p, dt);

    if (this.lastCharges >= 0 && p.dashCharges > this.lastCharges) this.pipPop[p.dashCharges - 1] = 1;
    this.lastCharges = p.dashCharges;
    for (let i = 0; i < this.pips.length; i++) {
      const pip = this.pips[i];
      const exists = i < p.dashMaxCharges;
      pip.frame.visible = exists;
      pip.fill.visible = exists;
      if (!exists) continue;
      pip.fill.tint = PLAYER_COLORS[p.slot] ?? RIM;
      this.pipPop[i] = damp(this.pipPop[i], 0, 10, dt);
      if (i < p.dashCharges) {
        pip.fill.alpha = 1;
        pip.fill.scale.set(1 + this.pipPop[i] * 0.6);
      } else if (i === p.dashCharges) {
        // the next charge grows as it recharges
        pip.fill.alpha = 0.45;
        pip.fill.scale.set(Math.max(0.0001, p.dashRecharge / DASH.recharge));
      } else {
        pip.fill.alpha = 0;
      }
    }
  }

  /** The special: a dial that fills as it comes back, bright and breathing when it is ready. */
  private updateSpecial(p: Player, dt: number): void {
    const c = CLASSES[p.classId];
    if (this.lastClass !== p.classId) {
      this.lastClass = p.classId;
      this.specialName.text = c.special;
      this.className.text = c.name;
      this.className.setColor(PLAYER_COLORS[p.slot] ?? PAPER);
      this.dialStep = -1;
    }
    const ready = p.specialCd <= 0;
    const k = ready ? 1 : Math.max(0, Math.min(1, 1 - p.specialCd / c.cooldown));
    // redrawn only when it has visibly moved
    const step = Math.round(k * 48);
    if (step !== this.dialStep) {
      if (this.dialStep >= 0 && step === 48) this.dialPop = 1;
      this.dialStep = step;
      const g = this.dial;
      g.clear();
      g.circle(0, 0, 11).fill({ color: 0x000000, alpha: 0.55 });
      if (step > 0) {
        if (step >= 48) g.circle(0, 0, 11).fill(0xffffff);
        else
          g.moveTo(0, 0)
            .arc(0, 0, 11, -Math.PI / 2, -Math.PI / 2 + (step / 48) * Math.PI * 2)
            .closePath()
            .fill({ color: 0xffffff, alpha: 0.55 });
      }
      g.circle(0, 0, 11).stroke({ width: 1.8, color: 0xffffff, alpha: 0.9 });
    }
    const color = PLAYER_COLORS[p.slot] ?? RIM;
    this.dialPop = damp(this.dialPop, 0, 8, dt);
    this.dial.tint = ready ? color : mixColor(color, INK, 0.35);
    this.dial.scale.set(1 + this.dialPop * 0.5);
    this.dialGlow.tint = color;
    this.dialGlow.alpha = ready ? 0.5 + 0.3 * Math.sin(this.breath) + this.dialPop : 0;
    this.specialName.alpha = ready ? 1 : 0.55;
    this.breath += dt * 4;
  }

  /** Rally: a note lights for every point, the newest ones pop, and a line shows how long it will hold. */
  private updateRally(p: Player, dt: number): void {
    const n = Math.max(0, Math.min(RALLY_RULES.cap, Math.round(p.rally)));
    if (n > this.lastRally) for (let i = this.lastRally; i < n; i++) this.notePop[i] = 1;
    // when it breaks, the notes fall away together instead of vanishing
    if (n === 0 && this.lastRally > 0) this.rallyDrop = 1;
    if (n !== this.lastRally) this.rallyText.text = n > 0 ? `Rally ${n}` : 'Rally';
    this.lastRally = n;
    this.rallyDrop = damp(this.rallyDrop, 0, 6, dt);
    for (let i = 0; i < this.notes.length; i++) {
      const note = this.notes[i];
      this.notePop[i] = damp(this.notePop[i], 0, 9, dt);
      const lit = i < n;
      note.visible = lit || this.rallyDrop > 0.05;
      if (lit) {
        note.alpha = 1;
        note.scale.y = 1 + this.notePop[i] * 0.9;
        note.y = 0;
      } else {
        note.alpha = this.rallyDrop * 0.6;
        note.scale.y = 1;
        note.y = (1 - this.rallyDrop) * 8;
      }
    }
    const left = n > 0 ? Math.max(0, 1 - p.rallyT / RALLY_RULES.hold) : 0;
    this.rallyHold.scale.x = Math.max(0.0001, left);
    this.rallyHold.alpha = n > 0 ? (left < 0.3 ? 0.5 + 0.5 * Math.abs(Math.sin(this.breath * 2.5)) : 0.8) : 0;
    this.rallyHold.tint = left < 0.3 ? DANGER : RALLY.low;
    this.rallyText.alpha = n > 0 ? 1 : 0.45;
    this.rallyText.setColor(n >= RALLY_RULES.cap ? RALLY.high : n > 0 ? RALLY.low : PAPER);
  }
}
