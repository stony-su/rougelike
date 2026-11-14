// Rig definitions and the shared part recipe. Nothing in this file imports pixi, so rigs and
// their animators can be checked headless (every state exists, every pose is finite) and reused
// by the animation gallery.
//
// THE PART RECIPE (one look for every character)
//   Light comes from above. A part is: a flat fill, a darker shade over its lower portion, and a
//   pale rim along its top-facing edges. Because the light is vertical, mirroring a rig
//   left/right never flips the lighting.
//
// Units: pixels at camera zoom 1 (64 px per tile), y down, origin at the rig's feet.

export type RigViewSide = 'front' | 'back';

export interface PolyShape {
  kind: 'poly';
  pts: number[];
  role: string;
  alpha?: number;
  view?: RigViewSide;
}

export interface LinesShape {
  kind: 'lines';
  /** x0, y0, x1, y1 per segment. */
  segs: number[];
  width: number;
  role: string;
  alpha?: number;
  view?: RigViewSide;
}

export type ShapeDef = PolyShape | LinesShape;

export interface PartDef {
  name: string;
  /** Parent part; omitted means the rig root. */
  parent?: string;
  /** Joint position relative to the parent's joint. */
  x: number;
  y: number;
  rot?: number;
  /** Draw order among siblings; the parent's own shapes sit at 0. Lower draws first (behind). */
  z?: number;
  shapes: ShapeDef[];
}

export interface RigDef {
  id: string;
  parts: PartDef[];
  /** Colour roles used by the shapes. Views may override entries (elites, zones). */
  palette: Record<string, number>;
  /** Radius in tiles of the ground mark under the rig. */
  footprint: number;
  /** Height in pixels, for placing hit sparks and damage numbers. */
  height: number;
  /** Animation states this rig's animator handles. Checked by tests. */
  states: readonly string[];
}

/** A part's animated offset from its rest pose. */
export interface PartPose {
  /** Added to the rest position. */
  x: number;
  y: number;
  /** Added to the rest rotation. */
  rot: number;
  /** Multiplies scale. */
  sx: number;
  sy: number;
  /**
   * Added to the part's draw order among its siblings, for this frame. A sword arm can pass
   * behind the body on the back-swing and in front of it on the cut.
   */
  z: number;
}

export const restPose = (): PartPose => ({ x: 0, y: 0, rot: 0, sx: 1, sy: 1, z: 0 });

/** What an animator reads. All angles are in the rig's own mirrored space: 0 = facing direction, negative = up. */
export interface AnimInput {
  state: string;
  /** Seconds in the current state. */
  t: number;
  /** Progress through the state, 0..1, when the state has a known duration; otherwise 0. */
  phase: number;
  /** Free-running seconds, for idle cycles. */
  time: number;
  /** Ground speed relative to normal run speed. */
  speed: number;
  /** Distance travelled on foot, tiles. Drives walk cycles. */
  stride: number;
  /** Movement along the facing direction: 1 forward, -1 backward. */
  forward: number;
  /** Aim angle in rig space. */
  aim: number;
  /** Facing away from the camera. */
  away: boolean;
  /** State-specific variant, e.g. which swing of a combo. */
  variant: number;
  /** A stable per-entity number in [0, 1) so crowds do not move in unison. */
  seed: number;
}

export const animInput = (): AnimInput => ({
  state: 'idle',
  t: 0,
  phase: 0,
  time: 0,
  speed: 0,
  stride: 0,
  forward: 1,
  aim: 0,
  away: false,
  variant: 0,
  seed: 0,
});

/** Lets an animator write part offsets by name. Unknown names return a scratch pose, so animators never throw. */
export interface PoseWriter {
  part(name: string): PartPose;
}

/** How snappily the view follows the pose this frame (exponential rate). */
export type Animator = (pose: PoseWriter, a: AnimInput) => number;

// ---------------------------------------------------------------- geometry helpers

/** An ellipse as a polygon, so the recipe can shade and rim it like any other outline. */
export function ell(cx: number, cy: number, rx: number, ry: number, n = 20): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return pts;
}

/** A rounded rectangle as a polygon. */
export function rrect(x: number, y: number, w: number, h: number, r: number, steps = 4): number[] {
  const pts: number[] = [];
  const corners: Array<[number, number, number]> = [
    [x + w - r, y + r, -Math.PI / 2],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, Math.PI / 2],
    [x + r, y + r, Math.PI],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (i / steps) * (Math.PI / 2);
      pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  }
  return pts;
}

/**
 * Round off a closed outline by corner cutting (Chaikin). A handful of control points becomes
 * a smooth organic shape, built once.
 */
export function smooth(pts: readonly number[], iterations = 2): number[] {
  let cur = pts.slice();
  for (let it = 0; it < iterations; it++) {
    const n = cur.length / 2;
    const next: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = cur[i * 2];
      const ay = cur[i * 2 + 1];
      const bx = cur[j * 2];
      const by = cur[j * 2 + 1];
      next.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25, ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75);
    }
    cur = next;
  }
  return cur;
}

function signedArea(pts: readonly number[]): number {
  let a = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
  }
  return a / 2;
}

/** Keep the part of a polygon with y >= cutY (Sutherland-Hodgman against one edge). */
export function clipBelow(pts: readonly number[], cutY: number): number[] {
  const out: number[] = [];
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const ax = pts[i * 2];
    const ay = pts[i * 2 + 1];
    const j = (i + 1) % n;
    const bx = pts[j * 2];
    const by = pts[j * 2 + 1];
    const aIn = ay >= cutY;
    const bIn = by >= cutY;
    if (aIn) out.push(ax, ay);
    if (aIn !== bIn) {
      const t = (cutY - ay) / (by - ay);
      out.push(ax + (bx - ax) * t, cutY);
    }
  }
  return out;
}

/** Segments along the polygon's top-facing edges. */
export function topEdges(pts: readonly number[], minUp = 0.3): number[] {
  const n = pts.length / 2;
  const segs: number[] = [];
  const orient = signedArea(pts) >= 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = pts[i * 2];
    const ay = pts[i * 2 + 1];
    const bx = pts[j * 2];
    const by = pts[j * 2 + 1];
    const ex = bx - ax;
    const ey = by - ay;
    const l = Math.hypot(ex, ey);
    if (l < 0.5) continue;
    // outward normal for this winding (y down)
    const ny = (-ex / l) * orient;
    if (ny < -minUp) segs.push(ax, ay, bx, by);
  }
  return segs;
}

export interface BlockOptions {
  fill: string;
  /** Role of the shade wash; omit for no shade. */
  shade?: string;
  /** Role of the top rim; omit for no rim. */
  rim?: string;
  /** Where the shade starts, as a fraction of the part's height from its top. */
  shadeFrom?: number;
  rimWidth?: number;
  view?: RigViewSide;
}

/** Expand one outline into the recipe's leaves: fill, shade, rim. */
export function block(pts: number[], o: BlockOptions): ShapeDef[] {
  const shapes: ShapeDef[] = [{ kind: 'poly', pts, role: o.fill, view: o.view }];
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < pts.length; i += 2) {
    if (pts[i] < minY) minY = pts[i];
    if (pts[i] > maxY) maxY = pts[i];
  }
  if (o.shade) {
    const cut = minY + (maxY - minY) * (o.shadeFrom ?? 0.55);
    const lower = clipBelow(pts, cut);
    if (lower.length >= 6) shapes.push({ kind: 'poly', pts: lower, role: o.shade, view: o.view });
  }
  if (o.rim) {
    const segs = topEdges(pts);
    if (segs.length) shapes.push({ kind: 'lines', segs, width: o.rimWidth ?? 1.8, role: o.rim, view: o.view });
  }
  return shapes;
}

/** A plain filled outline with no recipe. */
export const flat = (pts: number[], role: string, alpha?: number, view?: RigViewSide): ShapeDef => ({
  kind: 'poly',
  pts,
  role,
  alpha,
  view,
});

/** A stroked polyline given as points x0, y0, x1, y1, x2, y2... */
export function stroke(points: number[], width: number, role: string, alpha?: number, view?: RigViewSide): ShapeDef {
  const segs: number[] = [];
  for (let i = 0; i + 3 < points.length; i += 2) segs.push(points[i], points[i + 1], points[i + 2], points[i + 3]);
  return { kind: 'lines', segs, width, role, alpha, view };
}

/** Sanity checks used by tests: every part has a known parent, names are unique, numbers are finite. */
export function validateRig(def: RigDef): string[] {
  const problems: string[] = [];
  const names = new Set<string>();
  for (const p of def.parts) {
    if (names.has(p.name)) problems.push(`${def.id}: duplicate part ${p.name}`);
    names.add(p.name);
  }
  for (const p of def.parts) {
    if (p.parent && !names.has(p.parent)) problems.push(`${def.id}: part ${p.name} has unknown parent ${p.parent}`);
    for (const s of p.shapes) {
      const nums = s.kind === 'poly' ? s.pts : s.segs;
      if (nums.some((v) => !Number.isFinite(v))) problems.push(`${def.id}: part ${p.name} has a non-finite coordinate`);
      if (!(s.role in def.palette)) problems.push(`${def.id}: part ${p.name} uses unknown colour role ${s.role}`);
      if (s.kind === 'poly' && s.pts.length < 6) problems.push(`${def.id}: part ${p.name} has a polygon with fewer than 3 points`);
    }
  }
  return problems;
}
