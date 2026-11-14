// The Pixi side of a rig: builds one container per part from a RigDef and applies poses to it.
// Shapes are built once as white GraphicsContexts shared by every instance of the rig; colour is a
// per-leaf tint, so hit flashes, status tints and palette swaps never rebuild geometry.
import { Container, Graphics, GraphicsContext } from 'pixi.js';
import { damp, dampAngle, mixColor } from '../../core/math';
import { restPose } from './def';
import type { PartPose, PoseWriter, RigDef, ShapeDef } from './def';

const contexts = new Map<string, GraphicsContext>();

function contextFor(key: string, s: ShapeDef): GraphicsContext {
  const cached = contexts.get(key);
  if (cached) return cached;
  const ctx = new GraphicsContext();
  if (s.kind === 'poly') {
    ctx.poly(s.pts).fill(0xffffff);
  } else {
    for (let i = 0; i + 3 < s.segs.length; i += 4) {
      ctx.moveTo(s.segs[i], s.segs[i + 1]).lineTo(s.segs[i + 2], s.segs[i + 3]);
    }
    ctx.stroke({ width: s.width, color: 0xffffff, cap: 'round', join: 'round' });
  }
  contexts.set(key, ctx);
  return ctx;
}

interface Leaf {
  g: Graphics;
  role: string;
  base: number;
  view?: 'front' | 'back';
}

interface PartNode {
  name: string;
  c: Container;
  parent: PartNode | null;
  kids: PartNode[];
  restX: number;
  restY: number;
  restRot: number;
  /** Draw order among siblings at rest, and as last arranged. */
  restZ: number;
  appliedZ: number;
  target: PartPose;
  cur: PartPose;
  leaves: Leaf[];
}

export class RigView implements PoseWriter {
  /** Place this at the rig's projected foot point. */
  readonly root = new Container();
  readonly def: RigDef;
  /**
   * One drawing per rig that its owner redraws each frame, over the body and in the same space
   * as `point` reports: a bowstring between two hands, the glow of a drawn-back fist.
   */
  readonly over = new Graphics();
  private readonly body = new Container();
  private readonly tops: PartNode[] = [];
  private readonly nodes = new Map<string, PartNode>();
  private readonly order: PartNode[] = [];
  private readonly scratch = restPose();
  private palette: Record<string, number>;
  private flashAmount = 0;
  private flashColor = 0xffffff;
  private appliedFlash = -1;
  private appliedFlashColor = -1;
  private facing = 1;
  private away = false;
  private first = true;

  constructor(def: RigDef, paletteOverride?: Record<string, number>) {
    this.def = def;
    this.palette = paletteOverride ? { ...def.palette, ...paletteOverride } : def.palette;
    this.root.addChild(this.body, this.over);

    for (const p of def.parts) {
      const node: PartNode = {
        name: p.name,
        c: new Container(),
        parent: null,
        kids: [],
        restX: p.x,
        restY: p.y,
        restRot: p.rot ?? 0,
        restZ: p.z ?? 0,
        appliedZ: p.z ?? 0,
        target: restPose(),
        cur: restPose(),
        leaves: [],
      };
      node.c.position.set(p.x, p.y);
      node.c.rotation = node.restRot;
      this.nodes.set(p.name, node);
      this.order.push(node);
    }
    for (const p of def.parts) {
      const node = this.nodes.get(p.name) as PartNode;
      const parent = p.parent ? (this.nodes.get(p.parent) ?? null) : null;
      node.parent = parent;
      if (parent) parent.kids.push(node);
      else this.tops.push(node);
      p.shapes.forEach((s, i) => {
        const g = new Graphics(contextFor(`${def.id}/${p.name}/${i}`, s));
        const base = this.palette[s.role] ?? 0xffffff;
        g.tint = base;
        if (s.alpha !== undefined) g.alpha = s.alpha;
        node.leaves.push({ g, role: s.role, base, view: s.view });
      });
    }
    for (const node of this.order) this.arrange(node);
    this.arrange(null);
    this.applyView();
  }

  /**
   * Put a part's children and its own shapes in drawing order: children behind it (order below
   * zero), then its own shapes, then children in front. Children of the rig itself are simply
   * ordered. Ties keep the order the rig lists them in.
   */
  private arrange(node: PartNode | null): void {
    const c = node ? node.c : this.body;
    const kids = (node ? node.kids : this.tops).slice().sort((a, b) => a.appliedZ - b.appliedZ);
    c.removeChildren();
    for (const k of kids) if (k.appliedZ < 0 || !node) c.addChild(k.c);
    if (node) {
      for (const l of node.leaves) c.addChild(l.g);
      for (const k of kids) if (k.appliedZ >= 0) c.addChild(k.c);
    }
  }

  /** PoseWriter: offsets for a part this frame. Call beginPose() first. */
  part(name: string): PartPose {
    const n = this.nodes.get(name);
    if (n) return n.target;
    const s = this.scratch;
    s.x = 0;
    s.y = 0;
    s.rot = 0;
    s.sx = 1;
    s.sy = 1;
    return s;
  }

  /** Reset every part's target to its rest pose, ready for an animator to write. */
  beginPose(): void {
    for (const n of this.order) {
      const t = n.target;
      t.x = 0;
      t.y = 0;
      t.rot = 0;
      t.sx = 1;
      t.sy = 1;
      t.z = 0;
    }
  }

  /** Move parts toward their targets. `rate` is an exponential approach rate; Infinity snaps. */
  applyPose(dt: number, rate: number): void {
    const snap = this.first || !Number.isFinite(rate);
    this.first = false;
    for (const n of this.order) {
      const c = n.cur;
      const t = n.target;
      if (snap) {
        c.x = t.x;
        c.y = t.y;
        c.rot = t.rot;
        c.sx = t.sx;
        c.sy = t.sy;
      } else {
        c.x = damp(c.x, t.x, rate, dt);
        c.y = damp(c.y, t.y, rate, dt);
        c.rot = dampAngle(c.rot, t.rot, rate, dt);
        c.sx = damp(c.sx, t.sx, rate, dt);
        c.sy = damp(c.sy, t.sy, rate, dt);
      }
      n.c.position.set(n.restX + c.x, n.restY + c.y);
      n.c.rotation = n.restRot + c.rot;
      n.c.scale.set(c.sx, c.sy);
      // Draw order is not eased: a part is in front or it is behind.
      c.z = t.z;
    }
    this.reorder();
  }

  /** Re-arrange the children of any part whose draw order changed this frame. */
  private reorder(): void {
    let dirtyTop = false;
    for (const n of this.order) {
      const z = n.restZ + n.cur.z;
      if (z === n.appliedZ) continue;
      n.appliedZ = z;
      if (n.parent) this.arrange(n.parent);
      else dirtyTop = true;
    }
    if (dirtyTop) this.arrange(null);
  }

  /**
   * Where a point given in a part's own space is this frame, in the space of `root` (pixels,
   * y down, already mirrored for facing). Returns false for an unknown part.
   */
  point(name: string, lx: number, ly: number, out: { x: number; y: number }): boolean {
    let n: PartNode | null = this.nodes.get(name) ?? null;
    if (!n) return false;
    let x = lx;
    let y = ly;
    while (n) {
      const c = n.cur;
      x *= c.sx;
      y *= c.sy;
      const r = n.restRot + c.rot;
      const cs = Math.cos(r);
      const sn = Math.sin(r);
      const rx = x * cs - y * sn;
      const ry = x * sn + y * cs;
      x = rx + n.restX + c.x;
      y = ry + n.restY + c.y;
      n = n.parent;
    }
    out.x = x * this.body.scale.x;
    out.y = y * this.body.scale.y;
    return true;
  }

  /** Mirror for left/right and choose the toward/away leaves. */
  setFacing(sign: number, away: boolean): void {
    const f = sign < 0 ? -1 : 1;
    if (f !== this.facing) {
      this.facing = f;
      this.body.scale.x = f;
    }
    if (away !== this.away) {
      this.away = away;
      this.applyView();
    }
  }

  get facingSign(): number {
    return this.facing;
  }

  /** Whole-body squash and stretch (volume-preserving when sx * sy is about 1). */
  setSquash(sx: number, sy: number): void {
    this.body.scale.set(this.facing * sx, sy);
  }

  /** Blend every leaf toward a flash colour. 0 = normal, 1 = solid flash colour. */
  setFlash(amount: number, color = 0xffffff): void {
    this.flashAmount = amount < 0 ? 0 : amount > 1 ? 1 : amount;
    this.flashColor = color;
    const q = Math.round(this.flashAmount * 16);
    if (q === this.appliedFlash && color === this.appliedFlashColor) return;
    this.appliedFlash = q;
    this.appliedFlashColor = color;
    const k = q / 16;
    for (const n of this.order) for (const l of n.leaves) l.g.tint = k > 0 ? mixColor(l.base, color, k) : l.base;
  }

  /** Multiply the whole rig by a colour (status effects). White = none. */
  setWash(color: number): void {
    this.root.tint = color;
  }

  /** Replace palette roles (elite recolours, zone inks). */
  setPalette(override: Record<string, number>): void {
    this.palette = { ...this.def.palette, ...override };
    for (const n of this.order) {
      for (const l of n.leaves) {
        l.base = this.palette[l.role] ?? l.base;
      }
    }
    this.appliedFlash = -1;
    this.setFlash(this.flashAmount, this.flashColor);
  }

  /** Recolour only the leaves that use one role (rim highlights). */
  setRole(role: string, color: number): void {
    let changed = false;
    for (const n of this.order) {
      for (const l of n.leaves) {
        if (l.role === role && l.base !== color) {
          l.base = color;
          changed = true;
        }
      }
    }
    if (changed) {
      this.appliedFlash = -1;
      this.setFlash(this.flashAmount, this.flashColor);
    }
  }

  /** Take another view's current pose, facing and squash (afterimages). Both views must share a RigDef. */
  copyPose(from: RigView): void {
    this.setFacing(from.facing, from.away);
    this.body.scale.set(from.body.scale.x, from.body.scale.y);
    for (const n of this.order) {
      const o = from.nodes.get(n.name);
      if (!o) continue;
      n.cur.x = o.cur.x;
      n.cur.y = o.cur.y;
      n.cur.rot = o.cur.rot;
      n.cur.sx = o.cur.sx;
      n.cur.sy = o.cur.sy;
      n.cur.z = o.cur.z;
      n.c.position.set(n.restX + n.cur.x, n.restY + n.cur.y);
      n.c.rotation = n.restRot + n.cur.rot;
      n.c.scale.set(n.cur.sx, n.cur.sy);
    }
    this.reorder();
    this.first = false;
  }

  /** The container of a part, for attaching effects or reading its world position. */
  node(name: string): Container | undefined {
    return this.nodes.get(name)?.c;
  }

  partNames(): string[] {
    return this.order.map((n) => n.name);
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }

  private applyView(): void {
    for (const n of this.order) {
      for (const l of n.leaves) {
        if (l.view) l.g.visible = l.view === 'back' ? this.away : !this.away;
      }
    }
  }
}
