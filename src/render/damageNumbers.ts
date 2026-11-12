// Damage numbers: small figures that pop out of a hit, rise and fade. Pooled.
import { BitmapFont, BitmapText } from 'pixi.js';
import { projX, projY } from '../core/iso';
import { ease } from '../core/ease';
import type { Stage } from './stage';

const FONT = 'snapline-numbers';
const POOL = 28;
const LIFE = 0.75;

interface Num {
  t: BitmapText;
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  age: number;
  big: boolean;
}

let installed = false;

export class DamageNumbers {
  private readonly pool: Num[] = [];
  private cursor = 0;

  constructor(stage: Stage) {
    if (!installed) {
      BitmapFont.install({
        name: FONT,
        style: { fontFamily: 'Consolas, "Cascadia Mono", Menlo, "DejaVu Sans Mono", monospace', fontSize: 40, fontWeight: '700', fill: '#ffffff' },
        chars: [['0', '9']],
        resolution: 2,
        padding: 4,
      });
      installed = true;
    }
    for (let i = 0; i < POOL; i++) {
      const t = new BitmapText({ text: '0', style: { fontFamily: FONT, fontSize: 40 } });
      t.anchor.set(0.5, 1);
      t.visible = false;
      stage.fxCrisp.addChild(t);
      this.pool.push({ t, active: false, x: 0, y: 0, z: 0, vx: 0, age: 0, big: false });
    }
  }

  spawn(x: number, y: number, amount: number, color: number, big: boolean): void {
    if (amount <= 0) return;
    const n = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    n.active = true;
    n.x = x + (Math.random() - 0.5) * 0.35;
    n.y = y + (Math.random() - 0.5) * 0.35;
    n.z = 1.0;
    n.vx = (Math.random() - 0.5) * 0.5;
    n.age = 0;
    n.big = big;
    n.t.text = String(amount);
    n.t.tint = color;
    n.t.visible = true;
  }

  update(dt: number): void {
    for (const n of this.pool) {
      if (!n.active) continue;
      n.age += dt;
      const k = n.age / LIFE;
      if (k >= 1) {
        n.active = false;
        n.t.visible = false;
        continue;
      }
      // Rise fast, then hang.
      n.z = 1.0 + ease.outCubic(k) * 0.85;
      n.x += n.vx * dt;
      n.t.position.set(projX(n.x, n.y), projY(n.x, n.y, n.z));
      const base = n.big ? 0.82 : 0.56;
      const pop = k < 0.16 ? ease.outBack(k / 0.16) : 1;
      n.t.scale.set(base * pop);
      n.t.alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    }
  }

  clear(): void {
    for (const n of this.pool) {
      n.active = false;
      n.t.visible = false;
    }
  }

  destroy(): void {
    for (const n of this.pool) n.t.destroy();
    this.pool.length = 0;
  }
}
