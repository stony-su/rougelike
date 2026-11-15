// The boss's health across the top of the screen: its name, a bar that drains, a paler bar that
// follows more slowly so a big hit can be read, and a notch at each health mark where the fight
// changes.
import { Container, Graphics } from 'pixi.js';
import { DANGER, DANGER_HOT, PAPER, UI } from '../render/palette';
import type { World } from '../sim/types';
import { Label } from './label';

const H = 12;

export class BossBar {
  readonly root = new Container();
  private readonly frame = new Graphics();
  private readonly fill = new Graphics();
  private readonly name: Label;
  private width = 520;
  private shown = 0;
  /** The share the pale bar shows; it follows the real one down. */
  private ghost = 1;
  private bossId = 0;
  private marks = '';

  constructor() {
    this.name = new Label('', { size: 11, color: PAPER, bold: true, tracking: 0.3, align: 'center' });
    this.root.addChild(this.frame, this.fill, this.name);
    this.root.visible = false;
  }

  layout(viewW: number): void {
    this.width = Math.max(260, Math.min(560, viewW * 0.42));
    this.root.position.set(viewW / 2, 58);
    this.name.position.set(0, -26);
    this.marks = '';
  }

  update(w: World, dt: number): void {
    let boss = null;
    for (const e of w.enemies) {
      if (e.def.boss && !e.dead) {
        boss = e;
        break;
      }
    }
    this.shown += ((boss ? 1 : 0) - this.shown) * Math.min(1, dt * 6);
    this.root.visible = this.shown > 0.02;
    this.root.alpha = this.shown;
    if (!boss) return;
    if (boss.id !== this.bossId) {
      this.bossId = boss.id;
      this.ghost = 1;
      this.marks = '';
      this.name.text = boss.def.name;
    }
    const share = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
    this.ghost = Math.max(share, this.ghost - dt * 0.35);
    const left = -this.width / 2;
    // the frame and its notches are drawn once for each boss and width
    const pips = boss.def.pips ?? 0;
    const broken = pips > 0 ? Math.min(pips, boss.mem[0] ?? 0) : 0;
    const key = `${boss.id}/${this.width}/${broken}`;
    if (key !== this.marks) {
      this.marks = key;
      this.frame.clear();
      this.frame.roundRect(left - 3, -3, this.width + 6, H + 6, 4).fill({ color: UI.glass, alpha: 0.9 });
      this.frame.roundRect(left - 3, -3, this.width + 6, H + 6, 4).stroke({ width: 1.5, color: UI.brass, alpha: 0.9 });
      for (const m of boss.def.phases ?? []) {
        const x = left + this.width * m;
        this.frame.moveTo(x, -6).lineTo(x, H + 6);
      }
      this.frame.stroke({ width: 2, color: UI.brass, alpha: 0.95 });
      // what can be broken on it: whole ones bright, broken ones hollow
      for (let i = 0; i < pips; i++) {
        const x = (i - (pips - 1) / 2) * 18;
        this.frame.poly([x, H + 12, x + 6, H + 18, x, H + 24, x - 6, H + 18]);
        if (i < pips - broken) this.frame.fill(UI.brass);
        else this.frame.stroke({ width: 1.5, color: UI.brass, alpha: 0.6 });
      }
    }
    this.fill
      .clear()
      .rect(left, 0, this.width * this.ghost, H)
      .fill({ color: DANGER_HOT, alpha: 0.75 })
      .rect(left, 0, this.width * share, H)
      .fill(DANGER);
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
