// Things that are thrown and then sit in the chamber: bombs and Ringstones.
// A bomb is a spiked seed with a bright belt and a burning cap. It arcs through the air, lands,
// and counts down: a ring on the floor closes on it, its glow beats faster, and it swells before
// it goes. Struck by a player it takes that player's colour. A Ringstone is a ring hanging over
// the floor in its owner's colour.
import { Container, Graphics, GraphicsContext } from 'pixi.js';
import { TILE, depthKey, projX, projY } from '../core/iso';
import { lerp, mixColor } from '../core/math';
import type { Bomb, Ringstone, World } from '../sim/types';
import type { Sortable } from './depth';
import { DANGER, DANGER_HOT, ECHO, PLAYER_COLORS, PLAYER_PALE, RIM, WHITE } from './palette';
import { star } from './rig/solids';
import type { Stage } from './stage';

const T = TILE;
/** How high a lobbed bomb rises at the top of its arc, in tiles. */
const LOB_HEIGHT = 1.9;

/** The body of a bomb, about its own middle: spikes behind, a dark ball, a pale belt, a lit shoulder. */
function bombContext(): GraphicsContext {
  return new GraphicsContext()
    .poly(star(0, 0, 15.5, 9, 9, 0.3))
    .fill(ECHO.bombShade)
    .poly(star(0, 0, 15.5, 9, 9, 0.3))
    .stroke({ width: 1.4, color: RIM, alpha: 0.55, join: 'round' })
    .circle(0, 0, 11)
    .fill(ECHO.bomb)
    .circle(2.4, 2.6, 8.4)
    .fill({ color: ECHO.bombShade, alpha: 0.75 })
    .ellipse(0, 0.5, 11, 4)
    .stroke({ width: 2.4, color: 0xffffff, alpha: 0.9 })
    .moveTo(-8.6, -5)
    .arc(0, 0, 10, Math.PI * 1.1, Math.PI * 1.62)
    .stroke({ width: 2, color: RIM, alpha: 0.9, cap: 'round' })
    .roundRect(-3, -14.5, 6, 5, 1.5)
    .fill(ECHO.bombShade);
}

/** The burning cap: a four-pointed spark. */
function sparkContext(): GraphicsContext {
  return new GraphicsContext()
    .poly(star(0, 0, 7.5, 2.4, 4, 0))
    .fill(0xffffff)
    .circle(0, 0, 2.6)
    .fill(0xffffff);
}

function stoneContext(): GraphicsContext {
  // a ring of pale stone seen from above and a little to the side, with a bright inner edge
  return new GraphicsContext().ellipse(0, 0, 21, 12.5).stroke({ width: 7, color: 0xffffff }).ellipse(0, -1.6, 21, 12.5).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
}

interface BombView {
  c: Container;
  body: Graphics;
  spark: Graphics;
  shadow: Graphics;
  /** The ring on the floor that closes on the bomb as its fuse runs down. */
  timer: Graphics;
  glow: Graphics;
  sort: Sortable;
  seen: number;
}

interface StoneView {
  c: Container;
  ring: Graphics;
  core: Graphics;
  shadow: Graphics;
  glow: Graphics;
  sort: Sortable;
  seen: number;
}

export class ObjectViews {
  private readonly bombs = new Map<number, BombView>();
  private readonly stones = new Map<number, StoneView>();
  private readonly bombCtx = bombContext();
  private readonly sparkCtx = sparkContext();
  private readonly stoneCtx = stoneContext();
  private frame = 0;

  constructor(private readonly stage: Stage) {}

  update(w: World, alpha: number, time: number): void {
    this.frame++;
    for (const b of w.bombs) if (!b.dead) this.bomb(b, alpha, time);
    for (const s of w.stones) if (!s.dead) this.stone(s, alpha, time);
    for (const [id, v] of this.bombs) {
      if (v.seen === this.frame) continue;
      this.dropBomb(v);
      this.bombs.delete(id);
    }
    for (const [id, v] of this.stones) {
      if (v.seen === this.frame) continue;
      this.stage.depth.remove(v.sort);
      v.c.destroy({ children: true });
      v.shadow.destroy();
      v.glow.destroy();
      this.stones.delete(id);
    }
  }

  /** Call for each batted bomb this frame: it trails like anything else a player has sent. */
  eachBatted(w: World, alpha: number, fn: (id: number, x: number, y: number, by: number) => void): void {
    for (const b of w.bombs) if (!b.dead && b.state === 'batted') fn(b.id, lerp(b.px, b.x, alpha), lerp(b.py, b.y, alpha), b.by);
  }

  clear(): void {
    for (const v of this.bombs.values()) this.dropBomb(v);
    for (const v of this.stones.values()) {
      this.stage.depth.remove(v.sort);
      v.c.destroy({ children: true });
      v.shadow.destroy();
      v.glow.destroy();
    }
    this.bombs.clear();
    this.stones.clear();
  }

  private dropBomb(v: BombView): void {
    this.stage.depth.remove(v.sort);
    v.c.destroy({ children: true });
    v.shadow.destroy();
    v.timer.destroy();
    v.glow.destroy();
  }

  private bomb(b: Bomb, alpha: number, time: number): void {
    let v = this.bombs.get(b.id);
    if (!v) {
      const c = new Container();
      const body = new Graphics(this.bombCtx);
      body.position.set(0, -13);
      const spark = new Graphics(this.sparkCtx);
      spark.position.set(0, -30);
      c.addChild(body, spark);
      const shadow = new Graphics().circle(0, 0, 0.3 * T).fill({ color: 0x000000, alpha: 0.38 });
      const timer = new Graphics();
      this.stage.decals.addChild(shadow, timer);
      const glow = new Graphics().circle(0, 0, 26).fill({ color: 0xffffff, alpha: 0.55 });
      this.stage.fxGlow.addChild(glow);
      v = { c, body, spark, shadow, timer, glow, sort: this.stage.depth.add(c, depthKey(b.x, b.y), 0.1), seen: 0 };
      this.bombs.set(b.id, v);
    }
    v.seen = this.frame;
    const x = lerp(b.px, b.x, alpha);
    const y = lerp(b.py, b.y, alpha);
    // In its arc it rises and falls; on the floor it sits; batted, it skims.
    const k = b.state === 'fly' ? Math.min(1, b.t / b.dur) : 1;
    const z = b.state === 'fly' ? Math.sin(k * Math.PI) * LOB_HEIGHT : b.state === 'batted' ? 0.35 : 0;
    const sx = projX(x, y);
    const sy = projY(x, y, z);
    v.c.position.set(sx, sy);
    v.sort.depth = depthKey(x, y);
    v.shadow.position.set(x * T, y * T);
    v.shadow.scale.set(1 - 0.5 * Math.min(1, z / LOB_HEIGHT));
    // it tumbles in the air and spins when struck; on the floor it rocks as the fuse burns down
    const mine = b.by >= 0;
    const left = b.state === 'fuse' ? 1 - Math.min(1, b.t / b.dur) : 1;
    const rate = b.state === 'fuse' ? 5 + (1 - left) * 24 : 16;
    const beat = 0.5 + 0.5 * Math.sin(time * rate);
    v.body.rotation = b.state === 'fly' ? k * 7 : b.state === 'batted' ? time * 16 : Math.sin(time * rate * 0.5) * 0.12 * (1 - left);
    const color = mine ? (PLAYER_COLORS[b.by] ?? RIM) : DANGER;
    const pale = mine ? (PLAYER_PALE[b.by] ?? WHITE) : DANGER_HOT;
    // the belt and the cap tell whose it is; the whole body flushes as it is about to go
    v.body.tint = mixColor(WHITE, color, mine ? 0.5 : (1 - left) * (0.25 + 0.5 * beat));
    v.body.scale.set(b.state === 'fuse' ? 1 + (1 - left) * (0.1 + 0.14 * beat) : 1);
    v.spark.tint = mixColor(ECHO.fuse, pale, beat);
    v.spark.rotation = time * 9;
    v.spark.scale.set(0.7 + beat * 0.6);
    v.glow.position.set(sx, sy - 13);
    v.glow.tint = color;
    v.glow.alpha = 0.2 + 0.5 * beat * (b.state === 'fuse' ? 1 - left * 0.7 : 0.6);
    v.glow.scale.set(0.8 + (1 - left) * 0.7 + beat * 0.2);
    // On the floor: a ring that closes on the bomb, gone exactly when it bursts.
    const t = v.timer;
    t.clear();
    if (b.state === 'fuse') {
      t.position.set(x * T, y * T);
      const r = (0.34 + (b.radius - 0.34) * left) * T;
      t.circle(0, 0, r).stroke({ width: 3, color, alpha: 0.5 + 0.4 * beat });
      t.moveTo(0, -r)
        .arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left)
        .stroke({ width: 5, color: pale, alpha: 0.9, cap: 'round' });
    }
  }

  private stone(s: Ringstone, alpha: number, time: number): void {
    let v = this.stones.get(s.id);
    const color = PLAYER_COLORS[s.owner] ?? RIM;
    if (!v) {
      const c = new Container();
      const ring = new Graphics(this.stoneCtx);
      ring.tint = mixColor(RIM, color, 0.35);
      const core = new Graphics().ellipse(0, 0, 21, 12.5).stroke({ width: 2.5, color: 0xffffff });
      core.tint = PLAYER_PALE[s.owner] ?? RIM;
      c.addChild(ring, core);
      const shadow = new Graphics().circle(0, 0, 0.4 * T).fill({ color: 0x000000, alpha: 0.3 });
      this.stage.decals.addChild(shadow);
      const glow = new Graphics().ellipse(0, 0, 30, 18).fill({ color: 0xffffff, alpha: 0.5 });
      glow.tint = color;
      this.stage.fxGlow.addChild(glow);
      v = { c, ring, core, shadow, glow, sort: this.stage.depth.add(c, depthKey(s.x, s.y), 0.1), seen: 0 };
      this.stones.set(s.id, v);
    }
    v.seen = this.frame;
    const x = lerp(s.px, s.x, alpha);
    const y = lerp(s.py, s.y, alpha);
    // it hangs over the floor, bobbing; struck, it rings: a quick swell that dies away
    const rung = Math.max(0, 1 - s.rungT / 0.35);
    const z = s.flying ? 0.7 : 0.42 + Math.sin(time * 2.2 + s.id) * 0.05;
    const sx = projX(x, y);
    const sy = projY(x, y, z);
    v.c.position.set(sx, sy);
    v.c.rotation = s.flying ? time * 12 : 0;
    v.c.scale.set(1 + rung * 0.35);
    v.sort.depth = depthKey(x, y);
    v.shadow.position.set(x * T, y * T);
    v.glow.position.set(sx, sy);
    v.glow.alpha = 0.28 + 0.1 * Math.sin(time * 3 + s.id) + rung * 0.6;
    v.glow.scale.set(1 + rung * 0.6);
    // in its last second it flickers, so nobody plans a shot off a stone that is about to go
    const fading = !s.flying && s.life < 1;
    v.c.alpha = fading ? 0.45 + 0.45 * Math.abs(Math.sin(time * 16)) : 1;
    v.core.alpha = 0.6 + rung * 0.4;
  }
}
