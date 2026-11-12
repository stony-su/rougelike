// The heads-up display: the corner of the sheet where a drawing's title block would be.
// Health is a graduated levelling staff, dash charges are survey diamonds, the Plumb Shot is a bob.
// Everything is built once and animated by scale, tint and alpha.
import { Container, Graphics } from 'pixi.js';
import { damp } from '../core/math';
import { DASH, PLUMB } from '../sim/tuning';
import type { World } from '../sim/types';
import { CHALK, DANGER, HERO, INK, PAPER, RIM } from '../render/palette';

const STAFF_W = 300;
const STAFF_H = 14;

export class Hud {
  readonly root = new Container();
  private readonly hpFill = new Graphics();
  private readonly hpGhost = new Graphics();
  private readonly hpFlash = new Graphics();
  private readonly pips: Array<{ frame: Graphics; fill: Graphics }> = [];
  private readonly plumbFill = new Graphics();
  private readonly plumbIcon = new Graphics();
  private ghost = 1;
  private shown = 1;
  private flash = 0;
  private plumbPop = 0;
  private lastHp = -1;
  private lastCharges = -1;
  private pipPop: number[] = [];

  constructor() {
    const panel = new Graphics();
    // backing plate
    panel.roundRect(-14, -30, STAFF_W + 28, 86, 4).fill({ color: INK, alpha: 0.72 }).roundRect(-14, -30, STAFF_W + 28, 86, 4).stroke({ width: 1.5, color: RIM, alpha: 0.35 });
    // staff body
    panel.rect(0, 0, STAFF_W, STAFF_H).fill({ color: 0x000000, alpha: 0.55 });
    this.root.addChild(panel);

    this.hpGhost.rect(0, 0, STAFF_W, STAFF_H).fill(0xffffff);
    this.hpGhost.tint = DANGER;
    this.hpFill.rect(0, 0, STAFF_W, STAFF_H).fill(0xffffff);
    this.hpFill.tint = PAPER;
    this.hpFlash.rect(0, 0, STAFF_W, STAFF_H).fill(0xffffff);
    this.hpFlash.alpha = 0;
    this.root.addChild(this.hpGhost, this.hpFill, this.hpFlash);

    // graduations: a tick every tenth, a long one every half, drawn over the fill like a real staff
    const ticks = new Graphics();
    for (let i = 0; i <= 20; i++) {
      const x = (i / 20) * STAFF_W;
      const long = i % 10 === 0;
      const mid = i % 2 === 0;
      ticks.moveTo(x, STAFF_H).lineTo(x, STAFF_H - (long ? STAFF_H : mid ? 8 : 4));
    }
    ticks.stroke({ width: 1.5, color: INK, alpha: 0.75 });
    ticks.rect(0, 0, STAFF_W, STAFF_H).stroke({ width: 1.5, color: RIM, alpha: 0.9 });
    // alternating blocks along the top edge, as on a levelling staff
    for (let i = 0; i < 10; i += 2) ticks.rect((i / 10) * STAFF_W, -5, STAFF_W / 10, 3).fill({ color: RIM, alpha: 0.7 });
    this.root.addChild(ticks);

    // dash pips: survey diamonds
    for (let i = 0; i < 4; i++) {
      const frame = new Graphics().poly([0, -9, 9, 0, 0, 9, -9, 0]).stroke({ width: 1.8, color: 0xffffff, join: 'round' });
      frame.tint = RIM;
      const fill = new Graphics().poly([0, -6.5, 6.5, 0, 0, 6.5, -6.5, 0]).fill(0xffffff);
      fill.tint = HERO.rim;
      frame.position.set(12 + i * 26, 36);
      fill.position.copyFrom(frame.position);
      this.root.addChild(frame, fill);
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
    this.root.addChild(this.plumbFill, this.plumbIcon);
  }

  /** Anchor to the bottom-left corner. */
  layout(viewW: number, viewH: number): void {
    const s = Math.max(0.8, Math.min(1.5, viewH / 900));
    this.root.scale.set(s);
    this.root.position.set(34 * s, viewH - 76 * s);
    void viewW;
  }

  update(w: World, dt: number): void {
    const p = w.player;
    const frac = Math.max(0, p.hp / p.maxHp);
    if (this.lastHp >= 0 && p.hp < this.lastHp) this.flash = 1;
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

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
