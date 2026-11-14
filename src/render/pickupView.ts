// Chimes on the floor: small bright shards that hop where they fall and fly home when called.
import { Sprite } from 'pixi.js';
import { projX, projY } from '../core/iso';
import { lerp } from '../core/math';
import type { World } from '../sim/types';
import { CHIME, RIPE } from './palette';
import type { Stage } from './stage';
import type { Textures } from './textures';

export class PickupView {
  private readonly pool: Array<{ s: Sprite; g: Sprite }> = [];

  constructor(
    private readonly stage: Stage,
    private readonly textures: Textures,
  ) {}

  update(w: World, alpha: number, time: number): void {
    let n = 0;
    for (const c of w.flow.pickups) {
      let pv = this.pool[n];
      if (!pv) {
        const s = new Sprite(this.textures.shard);
        s.anchor.set(0.5);
        s.tint = CHIME;
        this.stage.fxCrisp.addChild(s);
        const g = new Sprite(this.textures.soft);
        g.anchor.set(0.5);
        g.tint = RIPE;
        this.stage.fxGlow.addChild(g);
        pv = { s, g };
        this.pool.push(pv);
      }
      n++;
      const x = lerp(c.px, c.x, alpha);
      const y = lerp(c.py, c.y, alpha);
      // a small hop as it lands, then it lies on the floor until it flies home
      const flying = c.homing >= 0;
      const hop = flying ? 0.35 : Math.max(0, Math.sin(Math.min(1, c.age / 0.4) * Math.PI)) * 0.5;
      const sx = projX(x, y);
      const sy = projY(x, y, hop + 0.08);
      pv.s.visible = true;
      pv.s.position.set(sx, sy);
      pv.s.rotation = c.id * 1.7 + (flying ? time * 9 : 0);
      pv.s.scale.set(c.value >= 5 ? 1.25 : 0.85);
      pv.g.visible = true;
      pv.g.position.set(sx, sy);
      pv.g.scale.set(c.value >= 5 ? 0.5 : 0.34);
      pv.g.alpha = 0.55 + 0.2 * Math.sin(time * 6 + c.id);
    }
    for (let i = n; i < this.pool.length; i++) {
      this.pool[i].s.visible = false;
      this.pool[i].g.visible = false;
    }
  }

  clear(): void {
    for (const p of this.pool) {
      p.s.visible = false;
      p.g.visible = false;
    }
  }

  destroy(): void {
    for (const p of this.pool) {
      p.s.destroy();
      p.g.destroy();
    }
    this.pool.length = 0;
  }
}
