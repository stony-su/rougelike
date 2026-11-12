// Draws Running the Line: stakes, the lines between them, the Plot, the sweep preview, the
// flash of a whip, and hostile geometry.
//
// Nothing here is re-tessellated per frame. Lines are stretched sprites between projected end
// points, at a constant pixel thickness (so "thick" always means ripe, whatever the direction).
// Triangles (the Plot, the preview, whip flashes) are one shared unit triangle placed with an
// affine matrix on the ground plane.
import { Container, Graphics, GraphicsContext, Matrix, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import { TILE, depthKey, projX, projY } from '../core/iso';
import { damp, lerp, mixColor } from '../core/math';
import { MAX_STAKES, hostileSegments, oldestPlanted, plantedInOrder } from '../sim/lines';
import type { Stake, Sweep } from '../sim/lines';
import type { SimEvent, World } from '../sim/types';
import type { Sortable } from './depth';
import { CHALK, DANGER, DANGER_HOT, HERO, INK, RIPE } from './palette';
import type { Stage } from './stage';
import type { Textures } from './textures';

const T = TILE;

// ---------------------------------------------------------------- shared shapes

let unitTri: GraphicsContext | null = null;
/** The triangle (0,0) (1,0) (0,1); an affine matrix maps it onto any triangle. */
function triContext(): GraphicsContext {
  if (!unitTri) unitTri = new GraphicsContext().poly([0, 0, 1, 0, 0, 1]).fill(0xffffff);
  return unitTri;
}

const tmpM = new Matrix();
/** Place a unit triangle so its corners land on three ground points (world units). */
function fitTriangle(g: Container, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void {
  tmpM.set((bx - ax) * T, (by - ay) * T, (cx - ax) * T, (cy - ay) * T, ax * T, ay * T);
  g.setFromMatrix(tmpM);
}

interface StakeArt {
  peg: GraphicsContext;
  pennant: GraphicsContext;
  pips: GraphicsContext[];
  ring: GraphicsContext;
  hostilePeg: GraphicsContext;
  hostilePennant: GraphicsContext;
}

let art: StakeArt | null = null;
function stakeArt(): StakeArt {
  if (art) return art;
  const peg = new GraphicsContext()
    // a turned wooden peg with a pointed foot and a banded collar
    .poly([-2.6, -34, 2.6, -34, 2.2, -4, 0, 3, -2.2, -4])
    .fill(0xffffff);
  const pennant = new GraphicsContext().poly([2.4, -34, 19, -29.5, 2.4, -23]).fill(0xffffff);
  const pips: GraphicsContext[] = [];
  for (let n = 1; n <= MAX_STAKES; n++) {
    const c = new GraphicsContext();
    // tally strokes on the pennant: I, II, III, IIII
    for (let i = 0; i < n; i++) c.rect(5 + i * 2.7, -31.4, 1.4, 5.4).fill(0xffffff);
    pips.push(c);
  }
  const ring = new GraphicsContext().circle(0, 0, 0.3 * T).stroke({ width: 2.5, color: 0xffffff });
  const hostilePeg = new GraphicsContext().poly([-2.4, -30, 2.4, -30, 2, -4, 0, 3, -2, -4]).fill(0xffffff);
  const hostilePennant = new GraphicsContext().poly([2.4, -30, 16, -30, 11, -25.5, 16, -21, 2.4, -21]).fill(0xffffff);
  art = { peg, pennant, pips, ring, hostilePeg, hostilePennant };
  return art;
}

// ---------------------------------------------------------------- views

interface StakeView {
  c: Container;
  peg: Graphics;
  pennant: Graphics;
  pips: Graphics;
  ring: Graphics;
  sort: Sortable;
  pop: number;
  shownPips: number;
}

interface LineView {
  core: Sprite;
  glow: Sprite;
  flash: number;
  shown: number;
  spark: Sprite;
}

interface TriFlash {
  g: Graphics;
  t: number;
  life: number;
  active: boolean;
}

interface HostileLineView {
  s: TilingSprite;
  glow: Sprite;
}

export class LinesView {
  private readonly stakes: StakeView[] = [];
  private readonly lines: LineView[] = [];
  private readonly previewLines: Sprite[] = [];
  private readonly previewTris: Graphics[] = [];
  private readonly plotTris: Graphics[] = [];
  private readonly flashes: TriFlash[] = [];
  private readonly hostileLines: HostileLineView[] = [];
  private readonly hostileStakes: Array<{ c: Container; sort: Sortable }> = [];
  private readonly dashTex: Texture;
  private readonly segs: number[][] = [];
  private plotAlpha = 0;
  private time = 0;
  /** Ids of enemies the pending whip would hit; the enemy views read this for their rim highlight. */
  readonly previewTargets = new Set<number>();

  constructor(
    private readonly stage: Stage,
    textures: Textures,
    renderer: Renderer,
  ) {
    const a = stakeArt();
    for (let i = 0; i < MAX_STAKES; i++) {
      const c = new Container();
      const peg = new Graphics(a.peg);
      peg.tint = HERO.rodPale;
      const pennant = new Graphics(a.pennant);
      pennant.tint = CHALK;
      const pips = new Graphics(a.pips[i]);
      pips.tint = INK;
      c.addChild(peg, pennant, pips);
      c.visible = false;
      const ring = new Graphics(a.ring);
      ring.tint = CHALK;
      ring.visible = false;
      stage.decals.addChild(ring);
      // stakes sort just behind whoever stands on the same spot
      const sort = stage.depth.add(c, 0, -0.05);
      this.stakes.push({ c, peg, pennant, pips, ring, sort, pop: 0, shownPips: i });
    }

    for (let i = 0; i < MAX_STAKES * MAX_STAKES; i++) {
      const core = new Sprite(Texture.WHITE);
      core.anchor.set(0, 0.5);
      core.visible = false;
      const glow = new Sprite(Texture.WHITE);
      glow.anchor.set(0, 0.5);
      glow.visible = false;
      const spark = new Sprite(textures.soft);
      spark.anchor.set(0.5);
      spark.visible = false;
      stage.lines.addChild(core);
      stage.linesGlow.addChild(glow, spark);
      this.lines.push({ core, glow, flash: 0, shown: 0, spark });
    }

    for (let i = 0; i < 2; i++) {
      const tri = new Graphics(triContext());
      tri.tint = CHALK;
      tri.alpha = 0;
      stage.decals.addChild(tri);
      this.plotTris.push(tri);
    }
    for (let i = 0; i < 3; i++) {
      const tri = new Graphics(triContext());
      tri.tint = CHALK;
      tri.visible = false;
      stage.decals.addChild(tri);
      this.previewTris.push(tri);
      const edge = new Sprite(Texture.WHITE);
      edge.anchor.set(0, 0.5);
      edge.tint = CHALK;
      edge.visible = false;
      stage.lines.addChild(edge);
      this.previewLines.push(edge);
    }
    for (let i = 0; i < 6; i++) {
      const g = new Graphics(triContext());
      g.visible = false;
      stage.decals.addChild(g);
      this.flashes.push({ g, t: 0, life: 0.2, active: false });
    }

    // a dash for hostile lines: they march, the player's never do
    const dash = new Graphics().rect(0, 0, 12, 4).fill(0xffffff);
    this.dashTex = renderer.generateTexture({ target: dash, resolution: 2, frame: new Rectangle(0, 0, 20, 4) });
    dash.destroy();
  }

  handle(ev: SimEvent, w: World): void {
    if (ev.type === 'lineRipe' || ev.type === 'lineDischarge') {
      const i = (ev.a < ev.b ? ev.a : ev.b) * MAX_STAKES + (ev.a < ev.b ? ev.b : ev.a);
      this.lines[i].flash = 1;
    } else if (ev.type === 'stakePlant' || ev.type === 'stakeLand') {
      this.stakes[ev.stake].pop = 1;
    } else if (ev.type === 'whip') {
      // the swept ground flashes, so the player learns what a whip covers
      for (const t of ev.tris) {
        const f = this.flashes.find((x) => !x.active) ?? this.flashes[0];
        fitTriangle(f.g, t[0], t[1], ev.fromX, ev.fromY, ev.toX, ev.toY);
        f.g.tint = t[2] === 1 ? RIPE : CHALK;
        f.g.visible = true;
        f.t = 0;
        f.life = ev.live ? (t[2] === 1 ? 0.3 : 0.22) : 0.1;
        f.active = true;
      }
    }
    void w;
  }

  update(w: World, alpha: number, dt: number, preview: Sweep | null): void {
    this.time += dt;
    const L = w.lines;
    const oldest = L.stakes.every((s) => s.state !== 'held') ? oldestPlanted(L) : undefined;
    const order = plantedInOrder(L);

    // ---- stakes
    for (let i = 0; i < this.stakes.length; i++) {
      const v = this.stakes[i];
      const s: Stake | undefined = L.stakes[i];
      if (!s || s.state === 'held' || s.state === 'lost') {
        v.c.visible = false;
        v.ring.visible = false;
        continue;
      }
      v.c.visible = true;
      v.ring.visible = s.state === 'planted';
      let x = s.x;
      let y = s.y;
      let z = 0;
      if (s.state === 'flying') {
        const k = Math.min(1, (s.flightT + alpha * (1 / 60)) / s.flightDur);
        x = lerp(s.fromX, s.toX, k);
        y = lerp(s.fromY, s.toY, k);
        z = Math.sin(k * Math.PI) * 0.55;
        v.c.rotation = (k - 0.5) * 1.6;
      } else {
        // an enemy working at the stake makes it shake
        v.c.rotation = s.threat > 0 ? Math.sin(this.time * 60) * 0.12 * s.threat : 0;
      }
      v.pop = damp(v.pop, 0, 9, dt);
      const pulse = oldest && oldest.id === s.id ? 0.5 + 0.5 * Math.sin(this.time * 7) : 0;
      v.c.position.set(projX(x, y), projY(x, y, z));
      v.c.scale.set(1 + v.pop * 0.35, 1 - v.pop * 0.25 + pulse * 0.06);
      v.sort.depth = depthKey(x, y);
      // the pennant shows the stake's place in the queue: one stroke moves next
      const place = order.findIndex((o) => o.id === s.id);
      const pipCount = place < 0 ? 0 : place;
      if (pipCount !== v.shownPips) {
        v.pips.context = stakeArt().pips[Math.min(MAX_STAKES - 1, pipCount)];
        v.shownPips = pipCount;
      }
      v.pennant.tint = s.threat > 0 ? mixColor(CHALK, DANGER, s.threat) : pulse > 0 ? mixColor(CHALK, RIPE, pulse) : CHALK;
      v.ring.position.set(x * T, y * T);
      v.ring.alpha = 0.35 + pulse * 0.5;
      v.ring.scale.set(1 + pulse * 0.35 + v.pop * 0.8);
      v.ring.tint = s.threat > 0 ? DANGER : CHALK;
    }

    // ---- lines
    for (let i = 0; i < this.lines.length; i++) {
      const v = this.lines[i];
      const l = L.lines[i];
      if (!l.linked) {
        v.core.visible = false;
        v.glow.visible = false;
        v.spark.visible = false;
        v.shown = 0;
        continue;
      }
      const ax = projX(l.ax, l.ay);
      const ay = projY(l.ax, l.ay);
      const bx = projX(l.bx, l.by);
      const by = projY(l.bx, l.by);
      const len = Math.hypot(bx - ax, by - ay);
      const rot = Math.atan2(by - ay, bx - ax);
      v.flash = damp(v.flash, 0, 7, dt);
      v.shown = damp(v.shown, 1, 14, dt);
      const ripening = l.active ? Math.min(1, l.clock / l.ripenTime) : 0;
      let width: number;
      let color: number;
      let a: number;
      let glowW: number;
      let glowA: number;
      if (!l.active) {
        // severed, or stretched past the link range: a faint thread that does nothing
        width = 1.2;
        color = l.severedT > 0 ? DANGER : CHALK;
        a = l.severedT > 0 ? 0.3 + 0.2 * Math.sin(this.time * 18) : 0.18;
        glowW = 0;
        glowA = 0;
      } else if (l.ripe) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 9 + i);
        width = 4 + pulse * 0.9 + v.flash * 5;
        color = RIPE;
        a = 1;
        glowW = 11 + pulse * 3 + v.flash * 16;
        glowA = 0.8;
      } else {
        width = 1.8 + ripening * 0.9 + v.flash * 4;
        color = mixColor(CHALK, RIPE, ripening * ripening * 0.35);
        a = 0.78 + ripening * 0.14;
        glowW = 5 + ripening * 3 + v.flash * 12;
        glowA = 0.45 + ripening * 0.2;
      }
      for (const sp of [v.core, v.glow]) {
        sp.visible = true;
        sp.position.set(ax, ay);
        sp.rotation = rot;
        sp.width = len * v.shown;
        sp.tint = color;
      }
      v.core.height = width;
      v.core.alpha = a;
      v.glow.visible = glowW > 0;
      v.glow.height = glowW;
      v.glow.alpha = glowA;
      // a bead of light runs along a ripe line
      if (l.active && l.ripe) {
        const k = (this.time * 0.9 + i * 0.37) % 1;
        v.spark.visible = true;
        v.spark.position.set(ax + (bx - ax) * k, ay + (by - ay) * k);
        v.spark.tint = RIPE;
        v.spark.scale.set(0.9);
        v.spark.alpha = Math.sin(k * Math.PI);
      } else {
        v.spark.visible = false;
      }
    }

    // ---- the Plot: surveyed land reads brighter
    const plot = L.plot;
    this.plotAlpha = damp(this.plotAlpha, plot ? 1 : 0, 10, dt);
    for (let i = 0; i < this.plotTris.length; i++) {
      const g = this.plotTris[i];
      if (plot) {
        const p = plot.pts;
        const n = p.length / 2;
        if (i === 0) fitTriangle(g, p[0], p[1], p[2], p[3], p[4], p[5]);
        else if (n >= 4) fitTriangle(g, p[0], p[1], p[4], p[5], p[6], p[7]);
        g.visible = i === 0 || n >= 4;
      }
      g.alpha = this.plotAlpha * 0.1;
      if (this.plotAlpha < 0.01) g.visible = false;
    }

    // ---- the sweep preview: exactly what E would cover
    this.previewTargets.clear();
    for (let i = 0; i < this.previewTris.length; i++) {
      const tri = this.previewTris[i];
      const edge = this.previewLines[i];
      const t = preview ? preview.tris[i] : undefined;
      if (!preview || !t) {
        tri.visible = false;
        edge.visible = false;
        continue;
      }
      fitTriangle(tri, t.sx, t.sy, preview.fromX, preview.fromY, preview.toX, preview.toY);
      tri.visible = true;
      tri.tint = t.ripe ? RIPE : CHALK;
      tri.alpha = preview.live ? (t.ripe ? 0.13 : 0.07) + 0.02 * Math.sin(this.time * 5) : 0.02;
      // where the line would lie after the whip
      const ax = projX(t.sx, t.sy);
      const ay = projY(t.sx, t.sy);
      const bx = projX(preview.toX, preview.toY);
      const by = projY(preview.toX, preview.toY);
      edge.visible = true;
      edge.position.set(ax, ay);
      edge.rotation = Math.atan2(by - ay, bx - ax);
      edge.width = Math.hypot(bx - ax, by - ay);
      edge.height = 1.3;
      edge.tint = t.ripe ? RIPE : CHALK;
      edge.alpha = preview.live ? 0.32 : 0.1;
    }
    if (preview && preview.live) for (const h of preview.hits) this.previewTargets.add(h.enemy.id);

    // ---- whip flashes
    for (const f of this.flashes) {
      if (!f.active) continue;
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        f.active = false;
        f.g.visible = false;
        continue;
      }
      f.g.alpha = (1 - k) * (1 - k) * 0.32;
    }

    this.updateHostile(w);
  }

  clear(): void {
    for (const f of this.flashes) {
      f.active = false;
      f.g.visible = false;
    }
    for (const v of this.lines) {
      v.flash = 0;
      v.shown = 0;
    }
    this.plotAlpha = 0;
  }

  destroy(): void {
    for (const v of this.stakes) {
      this.stage.depth.remove(v.sort);
      v.c.destroy({ children: true });
      v.ring.destroy();
    }
    for (const v of this.lines) {
      v.core.destroy();
      v.glow.destroy();
      v.spark.destroy();
    }
    for (const g of [...this.plotTris, ...this.previewTris]) g.destroy();
    for (const s of this.previewLines) s.destroy();
    for (const f of this.flashes) f.g.destroy();
    for (const h of this.hostileLines) {
      h.s.destroy();
      h.glow.destroy();
    }
    for (const h of this.hostileStakes) {
      this.stage.depth.remove(h.sort);
      h.c.destroy({ children: true });
    }
    this.dashTex.destroy(true);
  }

  private updateHostile(w: World): void {
    let li = 0;
    let si = 0;
    for (const g of w.lines.hostile) {
      if (g.dead) continue;
      for (const s of hostileSegments(w, g, this.segs)) {
        let v = this.hostileLines[li];
        if (!v) {
          const ts = new TilingSprite({ texture: this.dashTex, width: 10, height: 3 });
          ts.anchor.set(0, 0.5);
          ts.tint = DANGER_HOT;
          const glow = new Sprite(Texture.WHITE);
          glow.anchor.set(0, 0.5);
          glow.tint = DANGER;
          this.stage.lines.addChild(ts);
          this.stage.linesGlow.addChild(glow);
          v = { s: ts, glow };
          this.hostileLines.push(v);
        }
        li++;
        const ax = projX(s[0], s[1]);
        const ay = projY(s[0], s[1]);
        const bx = projX(s[2], s[3]);
        const by = projY(s[2], s[3]);
        const len = Math.hypot(bx - ax, by - ay);
        const rot = Math.atan2(by - ay, bx - ax);
        v.s.visible = true;
        v.s.position.set(ax, ay);
        v.s.rotation = rot;
        v.s.width = len;
        v.s.height = 3.2;
        // hostile lines march; the player's lines are always solid
        v.s.tilePosition.x = -this.time * 34;
        v.glow.visible = true;
        v.glow.position.set(ax, ay);
        v.glow.rotation = rot;
        v.glow.width = len;
        v.glow.height = 10;
        v.glow.alpha = 0.55;
      }
      if (g.kind !== 'claim') continue;
      for (const hs of g.stakes) {
        let v = this.hostileStakes[si];
        if (!v) {
          const a = stakeArt();
          const c = new Container();
          const peg = new Graphics(a.hostilePeg);
          peg.tint = INK;
          const pennant = new Graphics(a.hostilePennant);
          pennant.tint = DANGER;
          c.addChild(peg, pennant);
          v = { c, sort: this.stage.depth.add(c, 0, -0.05) };
          this.hostileStakes.push(v);
        }
        si++;
        v.c.visible = true;
        v.c.position.set(projX(hs.x, hs.y), projY(hs.x, hs.y));
        v.sort.depth = depthKey(hs.x, hs.y);
      }
    }
    for (let i = li; i < this.hostileLines.length; i++) {
      this.hostileLines[i].s.visible = false;
      this.hostileLines[i].glow.visible = false;
    }
    for (let i = si; i < this.hostileStakes.length; i++) this.hostileStakes[i].c.visible = false;
  }
}
