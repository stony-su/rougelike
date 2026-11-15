// The Drift Cairn: three stacked stones, a walking survey cairn with an eye in a crack and a few
// pebbles circling it. It has no legs: it rocks its base from edge to edge and the upper stones
// lag behind. Two moves: the slam (variant 0) lifts the upper stones and drops them; the lob
// (variant 1) cocks the top stone back and throws it.
// Pixi-free: a RigDef plus a pure animator.
import { INK, RIM, WHITE, ZONES } from '../../palette';
import { block, clipBelow, flat, stroke, topEdges } from '../def';
import type { AnimInput, Animator, PartDef, PartPose, PoseWriter, RigDef, RigEntry, ShapeDef } from '../def';
import { ENEMY_STATES } from '../states';

const sin = Math.sin;
const cos = Math.cos;

const palette: Record<string, number> = {
  ink: ZONES.outer.inkWash,
  inkDark: ZONES.outer.inkDark,
  rim: RIM,
  eye: WHITE,
  pupil: INK,
};

// ---------------------------------------------------------------- the stones

/** An outline turned about a point. */
function turn(pts: readonly number[], ang: number, ox: number, oy: number): number[] {
  const c = cos(ang);
  const s = sin(ang);
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] - ox;
    const y = pts[i + 1] - oy;
    out.push(ox + x * c - y * s, oy + x * s + y * c);
  }
  return out;
}

/** A cut across a stone: the line through (x, y) at `slant`. What lies on its lower side is one facet. */
interface Cut {
  x: number;
  y: number;
  slant: number;
}

function under(pts: readonly number[], c: Cut): number[] {
  return turn(clipBelow(turn(pts, -c.slant, c.x, c.y), c.y), c.slant, c.x, c.y);
}

/** Signed distance from a cut; positive on its lower side. */
const below = (c: Cut, x: number, y: number): number => -(x - c.x) * sin(c.slant) + (y - c.y) * cos(c.slant);

/** The edge where the side plane meets the lit face: the side cut's chord across the outline, stopped where it runs into the shade. */
function ridge(outline: readonly number[], side: Cut, shade: Cut): number[] {
  const hits: number[] = [];
  const n = outline.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const da = below(side, outline[i * 2], outline[i * 2 + 1]);
    const db = below(side, outline[j * 2], outline[j * 2 + 1]);
    if (da < 0 === db < 0) continue;
    const t = da / (da - db);
    hits.push(outline[i * 2] + (outline[j * 2] - outline[i * 2]) * t, outline[i * 2 + 1] + (outline[j * 2 + 1] - outline[i * 2 + 1]) * t);
  }
  if (hits.length < 4) return [];
  const upper = hits[1] <= hits[3] ? 0 : 2;
  const ax = hits[upper];
  const ay = hits[upper + 1];
  let bx = hits[2 - upper];
  let by = hits[3 - upper];
  const da = below(shade, ax, ay);
  const db = below(shade, bx, by);
  if (da < 0 && db > 0) {
    const t = da / (da - db);
    bx = ax + (bx - ax) * t;
    by = ay + (by - ay) * t;
  }
  return [ax, ay, bx, by];
}

/**
 * One hewn stone. The shared recipe (fill, shade, pale top rim) with the shade cut on a slant,
 * plus a dimmer side plane and the ridge where it meets the lit face.
 */
function stone(outline: number[], shade: Cut, side: Cut, rimWidth: number): ShapeDef[] {
  const low = under(outline, shade);
  const shapes: ShapeDef[] = [flat(outline, 'ink'), flat(under(outline, side), 'inkDark', 0.3), flat(low, 'inkDark')];
  const edge = ridge(outline, side, shade);
  if (edge.length) shapes.push(stroke(edge, 1.2, 'rim', 0.4));
  shapes.push({ kind: 'lines', segs: topEdges(outline), width: rimWidth, role: 'rim' });
  return shapes;
}

/** Knock the corners off an outline: each corner becomes a bevel up to `r` long, so the faces stay flat. */
function bevel(pts: readonly number[], r: number): number[] {
  const n = pts.length / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const h = (i + n - 1) % n;
    const j = (i + 1) % n;
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    const ax = pts[h * 2] - x;
    const ay = pts[h * 2 + 1] - y;
    const bx = pts[j * 2] - x;
    const by = pts[j * 2 + 1] - y;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    const ka = Math.min(r, la * 0.4) / la;
    const kb = Math.min(r, lb * 0.4) / lb;
    out.push(x + ax * ka, y + ay * ka, x + bx * kb, y + by * kb);
  }
  return out;
}

/** A hewn outline: flat faces, corners knocked off and then eased. */
const hewn = (pts: readonly number[], r: number): number[] => bevel(bevel(pts, r), r * 0.3);

// Each stone's joint is the middle of its underside, so it squashes onto its seat and rides the stone below.
const MID_X = 5;
const MID_Y = -35;
const TOP_X = -1;
const TOP_Y = -64;
const EYE_X = 12;
const EYE_Y = -17;

const baseStone = hewn([-30, -38, 14, -39, 34, -29, 41, -12, 33, 1, -34, 1, -42, -14], 5);
const midStone = hewn([-18, -29, 15, -32, 29, -20, 27, -2, 16, 2, -22, 2, -31, -12], 4);
const topStone = hewn([-15, -17, -4, -26, 12, -22, 19, -9, 14, 2, -12, 2, -19, -6], 3.5);

const pebble = (name: string, x: number, y: number, z: number, pts: number[]): PartDef => ({
  name,
  x,
  y,
  z,
  shapes: [...block(hewn(pts, 1.6), { fill: 'ink', shade: 'inkDark', shadeFrom: 0.55, rim: 'rim', rimWidth: 1.3 })],
});

const roundPebble = [-6, -2, -1, -5.5, 5, -3.5, 6.5, 1.5, 2, 5, -5, 4];
const longPebble = [-7, -1.5, -2, -5, 5, -4, 7.5, 0.5, 4, 4.5, -5.5, 4];

/** A circling pebble. Two parts play it: the near one shows on the front half of the circle, the far one (drawn behind the stack) on the back half. */
interface Orbiter {
  near: string;
  far: string;
  /** Rest joints of the two parts. */
  nx: number;
  ny: number;
  fx: number;
  fy: number;
  /** The circle: radii, height of its middle, speed and head start. */
  rx: number;
  ry: number;
  h: number;
  rate: number;
  lead: number;
  /** Where it lies once it has been shaken out of the air. */
  gx: number;
  gy: number;
}

const ORBITERS: Orbiter[] = [
  { near: 'orbA', far: 'orbAFar', nx: 48, ny: -8, fx: -48, fy: -16, rx: 51, ry: 9, h: -12, rate: 1, lead: 0.4, gx: 60, gy: 6 },
  { near: 'orbB', far: 'orbBFar', nx: -40, ny: -16, fx: 40, fy: -26, rx: 45, ry: 7, h: -22, rate: 1.3, lead: 3.3, gx: -60, gy: -2 },
];

const parts: PartDef[] = [
  pebble('orbAFar', ORBITERS[0].fx, ORBITERS[0].fy, -3, roundPebble),
  pebble('orbBFar', ORBITERS[1].fx, ORBITERS[1].fy, -2, longPebble),
  pebble('pebFar', -47, -4, -1, [-6.5, -1, -2.5, -5.5, 4, -4.5, 7, 0, 4.5, 5, -5, 5]),
  // the whole stack: squashed as one when it slams
  { name: 'stack', x: 0, y: 0, z: 0, shapes: [] },
  {
    // the cap stone, drawn behind the middle one so it can rise out of it
    name: 'top',
    parent: 'stack',
    x: TOP_X,
    y: TOP_Y,
    z: 0,
    shapes: [...stone(topStone, { x: 0, y: -6, slant: -0.1 }, { x: 11.5, y: -15, slant: -1.488 }, 2)],
  },
  {
    name: 'mid',
    parent: 'stack',
    x: MID_X,
    y: MID_Y,
    z: 1,
    shapes: [
      ...stone(midStone, { x: 0, y: -8, slant: 0.08 }, { x: -17.5, y: -22, slant: 1.47 }, 2.2),
      // the crack the eye looks out of, with a little of its light leaking along it
      stroke([EYE_X - 9, EYE_Y, -2, -21, 0, -25, -6, -30], 1.8, 'inkDark', 1, 'front'),
      stroke([EYE_X + 9, EYE_Y, 24.5, -13, 23, -10], 1.6, 'inkDark', 1, 'front'),
      stroke([EYE_X - 9, EYE_Y, -2, -21, 0, -25], 0.9, 'eye', 0.5, 'front'),
      // seen from behind: the crack comes through as a hairline with a pale glint
      stroke([-3, -30, -8, -24, -5, -20, -10, -13], 1.6, 'inkDark', 1, 'back'),
      flat([-8.6, -22, -6.2, -19.6, -8, -17, -10.2, -20], 'rim', 0.35, 'back'),
    ],
  },
  {
    // the eye: the crack gapes around one bright lozenge. Scaled to blink, squint and stare.
    name: 'eye',
    parent: 'mid',
    x: EYE_X,
    y: EYE_Y,
    z: 1,
    shapes: [
      flat([-10.5, 0.4, -3.5, -5.8, 5.5, -5.4, 10.5, 0, 5, 5.4, -4, 5], 'inkDark', 1, 'front'),
      flat([-8.2, 0.3, -2.8, -4.2, 4.6, -3.9, 8.3, 0, 4, 3.9, -3.2, 3.6], 'eye', 1, 'front'),
      flat([3.6, -3.5, 5.6, 0, 3.6, 3.5, 1.8, 0], 'pupil', 1, 'front'),
    ],
  },
  {
    name: 'base',
    parent: 'stack',
    x: 0,
    y: 0,
    z: 2,
    shapes: [
      ...stone(baseStone, { x: 0, y: -13, slant: -0.1 }, { x: 16, y: -30, slant: -1.825 }, 2.2),
      // a surveyor's bench mark cut into the face: a bar over a broad arrow
      stroke([-23, -30.5, -9, -30.5], 1.5, 'inkDark', 0.9),
      { kind: 'lines', segs: [-16, -30, -21.5, -20.5, -16, -30, -16, -19.5, -16, -30, -10.5, -20.5], width: 1.3, role: 'inkDark', alpha: 0.9 },
    ],
  },
  pebble('orbB', ORBITERS[1].nx, ORBITERS[1].ny, 1, longPebble),
  pebble('orbA', ORBITERS[0].nx, ORBITERS[0].ny, 2, roundPebble),
  pebble('pebNear', 31, 2, 3, [-7.5, -1, -3, -6, 4, -5, 8, 0, 5, 5, -6, 5]),
];

export const CAIRN_RIG: RigDef = {
  id: 'cairn',
  parts,
  palette,
  footprint: 0.62,
  height: 88,
  states: ENEMY_STATES,
};

// ---------------------------------------------------------------- animation helpers

/** Scale of a part that is not there: the thrown stone, a pebble on the far side of its circle. */
const GONE = 0.01;
/** Half the width of the flat the base stands on: it rocks about (+ROCK, 0) and (-ROCK, 0). */
const ROCK = 24;
/** How deep a stone must drop to hide behind the one below: the middle behind the base, the top behind the middle. */
const MID_TUCK = 34;
const TOP_TUCK = 27;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Progress 0..1 of t through the window from a to b. */
const span = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const ease = (t: number): number => t * t * (3 - 2 * t);
/** Eases past the mark and settles back onto it: a stone landing on its seat with a hop. */
const hop = (t: number): number => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

/** Turn a part about a point of its own (the edge it rocks on, its middle when it tumbles) instead of about its joint. */
function pivot(q: PartPose, px: number, py: number, ang: number): void {
  const c = cos(ang);
  const s = sin(ang);
  q.x += px - (px * c - py * s);
  q.y += py - (px * s + py * c);
  q.rot += ang;
}

/** Rock the base onto its front edge (positive lean) or its rear edge (negative). */
function rock(p: PoseWriter, lean: number): void {
  pivot(p.part('base'), lean >= 0 ? ROCK : -ROCK, 0, lean);
}

/** Seat a stone on the one below: follow that stone's joint, turn and squash, then slide along the seat and lift off it. */
function ride(lower: PartPose, ux: number, uy: number, q: PartPose, qx: number, qy: number, slide: number, lift: number, lean: number): void {
  const lx = (qx - ux + slide) * lower.sx;
  const ly = (qy - uy) * lower.sy - lift;
  const c = cos(lower.rot);
  const s = sin(lower.rot);
  q.x = ux + lower.x + lx * c - ly * s - qx;
  q.y = uy + lower.y + lx * s + ly * c - qy;
  q.rot = lower.rot + lean;
}

/**
 * Stack the middle stone on the base and the top stone on the middle one. Pose the base and set
 * any scales first. Slides run along the seat (forward is positive), lifts rise off it, and each
 * lean is against the stone below.
 */
function seat(p: PoseWriter, midSlide: number, midLift: number, midLean: number, topSlide: number, topLift: number, topLean: number): void {
  const mid = p.part('mid');
  ride(p.part('base'), 0, 0, mid, MID_X, MID_Y, midSlide, midLift, midLean);
  ride(mid, MID_X, MID_Y, p.part('top'), TOP_X, TOP_Y, topSlide, topLift, topLean);
}

/** Squash (k > 0) or stretch one part, keeping its volume. */
function squash(q: PartPose, k: number): void {
  q.sy = 1 - k;
  q.sx = 1 / Math.max(0.3, 1 - k * 0.8);
}

function size(q: PartPose, k: number): void {
  q.sx = k;
  q.sy = k;
}

/**
 * The circling pebbles. `extra` is added to how far round they have gone, (cx, cy) moves the
 * middle of the circle, `reach` scales it, `fall` (0..1) drops them out of the air to lie where
 * they were flung, `toss` lifts them on the way and `scale` sizes them.
 */
function pebbles(p: PoseWriter, a: AnimInput, extra = 0, cx = 0, cy = 0, reach = 1, fall = 0, toss = 0, scale = 1): void {
  const round = a.time * 1.5 + a.seed * 6.283;
  for (const o of ORBITERS) {
    const turnAt = round * o.rate + o.lead;
    const th = turnAt + extra;
    const s = sin(th);
    const ox = cx + cos(th) * o.rx * reach;
    const oy = o.h + cy + s * o.ry * reach;
    const x = ox + (o.gx - ox) * fall;
    const y = oy + (o.gy - oy) * fall - toss;
    const depth = s + ((o.gy >= 0 ? 1 : -1) - s) * fall;
    const k = Math.max(GONE, scale * (0.94 + 0.1 * depth));
    const rot = turnAt * 1.4 * (1 - fall);
    const near = p.part(o.near);
    const far = p.part(o.far);
    near.x = x - o.nx;
    near.y = y - o.ny;
    near.rot = rot;
    far.x = x - o.fx;
    far.y = y - o.fy;
    far.rot = rot;
    size(near, depth >= 0 ? k : GONE);
    size(far, depth >= 0 ? GONE : k);
  }
}

/** Open (above 1) or close (toward 0) the eye in its crack. */
function lid(p: PoseWriter, open: number, wide = 1): void {
  const eye = p.part('eye');
  eye.sy = Math.max(GONE, open);
  eye.sx = wide;
}

// ---------------------------------------------------------------- states

function spawn(p: PoseWriter, a: AnimInput): void {
  // The stones come up one after another: the base out of the floor, the middle stone out from
  // behind the base, the cap out from behind the middle, each landing on its seat with a hop.
  const t = a.phase;
  const r0 = span(t, 0, 0.34);
  const r1 = span(t, 0.28, 0.62);
  const r2 = span(t, 0.54, 0.88);
  const base = p.part('base');
  base.sy = GONE + (1 - GONE) * hop(r0);
  base.sx = 1.3 - 0.3 * easeOut(r0);
  seat(p, 0, -MID_TUCK * (1 - hop(r1)), 0.1 * (1 - r1), 0, -TOP_TUCK * (1 - hop(r2)), -0.16 * (1 - r2));
  if (r1 <= 0) size(p.part('mid'), GONE);
  if (r2 <= 0) size(p.part('top'), GONE);
  lid(p, span(t, 0.84, 1));
  const out = span(t, 0.7, 1);
  pebbles(p, a, 0, 0, 12 * (1 - out), 0.4 + 0.6 * out, 0, 0, out);
  size(p.part('pebNear'), Math.max(GONE, span(t, 0.36, 0.5)));
  size(p.part('pebFar'), Math.max(GONE, span(t, 0.42, 0.56)));
}

function idle(p: PoseWriter, a: AnimInput): void {
  // Breathes very slowly; the stones drift a few pixels against each other and the pebbles circle.
  const ph = a.time * 1.15 + a.seed * 6.283;
  const b = sin(ph);
  const base = p.part('base');
  base.sy = 1 + b * 0.018;
  base.sx = 1 - b * 0.012;
  seat(p, sin(ph * 0.63 + 1.3) * 2.4, 0.8 + b * 0.8, sin(ph * 0.5 + 2) * 0.03, sin(ph * 0.81 + 3.1) * 3, 1 + sin(ph + 0.9), sin(ph * 0.7 + 0.4) * 0.05);
  const blink = (a.time * 0.23 + a.seed) % 1;
  lid(p, blink > 0.95 ? 0.12 : 1);
  pebbles(p, a, 0, 0, sin(ph * 1.3) * 1.5);
  p.part('pebNear').rot = sin(ph * 0.9) * 0.1;
  p.part('pebFar').rot = sin(ph * 0.7 + 2) * 0.1;
}

function move(p: PoseWriter, a: AnimInput): void {
  // Shuffles by rocking: forward onto the front edge, back onto the rear edge, with a thud as it
  // passes flat. The upper stones keep the lean they had a moment ago and slide after it.
  const ph = a.stride * 3.1 + a.seed * 6.283;
  const s = sin(ph);
  const lean = 0.13 * s;
  const thud = (1 - Math.abs(s)) ** 3;
  squash(p.part('base'), 0.05 * thud);
  rock(p, lean);
  const midLean = 0.115 * sin(ph - 0.7);
  const topLean = 0.115 * sin(ph - 1.5);
  seat(p, 3.4 * sin(ph - 0.9), thud * 1.2, midLean - lean, 4.6 * sin(ph - 1.7), thud * 2.2, topLean - midLean);
  p.part('stack').rot = 0.03;
  lid(p, 0.9);
  pebbles(p, a, 0, -7, -thud * 2, 1.04);
  const near = p.part('pebNear');
  near.rot = a.stride * 3;
  near.y = -thud * 3;
  near.x = -3 + cos(ph) * 2;
  const far = p.part('pebFar');
  far.rot = a.stride * 3 + 1;
  far.y = -(1 - thud) * 2;
  far.x = -4 - cos(ph) * 2;
}

function windupSlam(p: PoseWriter, a: AnimInput): void {
  // The upper stones lift off the base and climb, hovering apart and trembling harder; the base
  // hunkers wide to take the blow.
  const t = a.phase;
  const e = easeOut(t);
  const shake = t * t;
  const j1 = sin(a.t * 61) * shake;
  const j2 = sin(a.t * 47 + 1.7) * shake;
  squash(p.part('base'), 0.1 * e);
  seat(p, -1.5 * e + j1 * 1.5, 18 * e + sin(a.t * 9) * 1.2 * e, -0.05 * e + j2 * 0.03, 2 * e + j2 * 1.9, 15 * e + sin(a.t * 9 + 2) * 1.5 * e, 0.09 * e + j1 * 0.05);
  lid(p, 1 + 0.7 * e, 1 + 0.25 * e);
  // the pebbles are drawn up with the stones and whirl once round, faster and tighter
  pebbles(p, a, 6.283 * t * t, 0, -30 * e, 1 - 0.2 * e);
  const near = p.part('pebNear');
  near.y = -5 * e + j1;
  near.rot = j2 * 0.2;
  const far = p.part('pebFar');
  far.y = -7 * e + j2;
  far.rot = j1 * 0.2;
}

/** The share of the slam spent falling. */
const DROP = 0.22;

function slam(p: PoseWriter, a: AnimInput): void {
  // Everything comes down at once: the lifted stones fall, the whole stack squashes hard on the
  // impact, and the stones are knocked out of line.
  const t = a.phase;
  const fell = span(t, 0, DROP);
  const held = 1 - fell * fell;
  const hit = span(t, DROP, DROP + 0.12);
  const k = t < DROP ? 0 : Math.exp(-span(t, DROP, 1) * 1.1);
  const stack = p.part('stack');
  stack.sy = 1 - 0.3 * k;
  stack.sx = 1 + 0.38 * k;
  squash(p.part('base'), 0.1 * (1 - hit));
  seat(p, -1.5 * held + 9 * hit, 18 * held, -0.05 * held + 0.11 * hit, 2 * held - 12 * hit, 15 * held, 0.09 * held - 0.2 * hit);
  lid(p, 1.7 - 1.3 * hit, 1.25 - 0.25 * hit);
  // the pebbles are thrown wide and land on the floor
  const flung = span(t, DROP, DROP + 0.45);
  pebbles(p, a, 0, 0, -30 * held, 1 - 0.2 * held, easeOut(flung), sin(flung * Math.PI) * 16);
  const jump = sin(flung * Math.PI);
  const near = p.part('pebNear');
  near.y = -5 * held - jump * 10;
  near.x = 5 * hit;
  near.rot = 0.6 * hit;
  const far = p.part('pebFar');
  far.y = -7 * held - jump * 8;
  far.x = -5 * hit;
  far.rot = -0.6 * hit;
}

function recoverSlam(p: PoseWriter, a: AnimInput): void {
  // Spent: the stones sit skewed out of line and grind back into place in four shoves, the
  // pebbles lying where they fell until the last of it.
  const t = a.phase;
  const ground = t - sin(t * Math.PI * 8) / (Math.PI * 8);
  const k = 1 - ground;
  const grit = sin(a.t * 43) * 0.7 * k * (0.5 - 0.5 * cos(t * Math.PI * 8));
  const stack = p.part('stack');
  stack.sy = 1 - 0.1 * k;
  stack.sx = 1 + 0.125 * k;
  seat(p, 9 * k + grit, 0, 0.11 * k, -12 * k - grit, 0, -0.2 * k);
  lid(p, 0.4 + 0.6 * ease(span(t, 0.6, 1)));
  pebbles(p, a, 0, 0, 0, 1, 1 - ease(span(t, 0.4, 1)));
  const near = p.part('pebNear');
  near.x = 5 * k;
  near.rot = 0.6 * k;
  const far = p.part('pebFar');
  far.x = -5 * k;
  far.rot = -0.6 * k;
}

function windupLob(p: PoseWriter, a: AnimInput): void {
  // The stack rocks back onto its rear edge and the top stone lifts and cocks back behind it.
  const t = a.phase;
  const e = easeOut(t);
  const shake = t * t;
  const j1 = sin(a.t * 61) * shake;
  const j2 = sin(a.t * 47 + 1.7) * shake;
  rock(p, -0.17 * e);
  seat(p, -4 * e, 0, -0.1 * e + j2 * 0.012, -20 * e + j1 * 1.6, 13 * e + j2 * 1.4, -0.7 * e + j1 * 0.06);
  lid(p, 1 + 0.6 * e, 1 + 0.2 * e);
  // the pebbles close in round the cocked stone
  pebbles(p, a, 6.283 * t * t, -20 * e, -44 * e, 1 - 0.5 * e);
  p.part('pebNear').x = j1 * 0.8;
  p.part('pebFar').x = j2 * 0.8;
}

/** The share of the lob in which the stone leaves. */
const THROW = 1 / 3;

function lob(p: PoseWriter, a: AnimInput): void {
  // The throw: the stack whips forward onto its front edge and the top stone is flung forward
  // and up, out of the rig. Then it sags, a stone short.
  const t = a.phase;
  const u = span(t, 0, THROW);
  const whip = easeOut(span(t, 0, 0.2));
  const sag = ease(span(t, 0.4, 1));
  rock(p, -0.17 + 0.34 * whip - 0.1 * sag);
  seat(p, -4 + 10 * whip - sag, 0, -0.1 + 0.22 * whip - 0.04 * sag, -20 + 96 * u, 13 + 52 * sin(u * Math.PI * 0.5), -0.7 + 3 * u);
  size(p.part('top'), Math.max(GONE, 1 - u * u));
  lid(p, 1.6 - 0.8 * sag, 1.2 - 0.2 * sag);
  pebbles(p, a, 0, -20 * (1 - whip), -44 * (1 - whip), 0.5 + 0.5 * whip);
  p.part('pebNear').y = -sin(span(t, 0.1, 0.5) * Math.PI) * 5;
  p.part('pebFar').y = -sin(span(t, 0.16, 0.56) * Math.PI) * 4;
}

function recoverLob(p: PoseWriter, a: AnimInput): void {
  // Stands short and bare. The pebbles gather over the empty seat and a new cap stone rises out
  // of the middle one.
  const t = a.phase;
  const k = 1 - ease(span(t, 0, 0.4));
  const wob = sin(a.t * 11) * Math.exp(-a.t * 4);
  rock(p, 0.07 * k + wob * 0.03);
  const grow = span(t, 0.3, 0.9);
  seat(p, 5 * k, 0, 0.08 * k + wob * 0.03, 0, -TOP_TUCK * (1 - hop(grow)), 0.25 * (1 - grow) * sin(grow * 9));
  size(p.part('top'), grow <= 0 ? GONE : 0.6 + 0.4 * easeOut(grow));
  lid(p, 0.45 + 0.55 * ease(span(t, 0.8, 1)));
  const gather = sin(span(t, 0.05, 0.95) * Math.PI);
  pebbles(p, a, 6.283 * ease(t), 0, -46 * gather, 1 - 0.55 * gather);
}

function hurt(p: PoseWriter, a: AnimInput): void {
  // Too heavy to flinch: only a jolt. The stones jostle back and settle.
  const k = Math.max(0, 1 - a.t / 0.2);
  rock(p, -0.035 * k);
  seat(p, -4.5 * k, 1.5 * k, -0.06 * k, -6 * k, 3 * k, 0.14 * k);
  lid(p, 1 - 0.7 * k);
  pebbles(p, a, 0, -3 * k, -5 * k, 1 + 0.12 * k);
  p.part('pebNear').y = -4 * k;
  p.part('pebFar').y = -3 * k;
}

function stun(p: PoseWriter, a: AnimInput): void {
  // Dazed: slumped forward out of line, the cap stone teetering on the edge, pebbles on the floor.
  const s = sin(a.t * 4.2);
  const s2 = sin(a.t * 6.3 + 1);
  squash(p.part('base'), 0.04);
  rock(p, 0.07 + s * 0.012);
  seat(p, 8 + s, 0, 0.13 + s * 0.025, 19 + s2 * 2, 0, 0.38 + s2 * 0.1);
  lid(p, 0.22 + 0.12 * Math.max(0, sin(a.t * 9)));
  pebbles(p, a, 0, 0, 0, 1, 1);
  p.part('orbA').rot = s2 * 0.3;
  p.part('orbBFar').rot = -s * 0.3;
  p.part('pebNear').rot = s * 0.25;
  p.part('pebFar').rot = s2 * 0.25;
}

function dead(p: PoseWriter, a: AnimInput): void {
  // Topples: the cap rolls off the front, the middle stone off the back, the base is jolted and
  // settles. Then the whole heap sinks into the floor.
  const t = Math.min(1, a.t / 0.42);
  const sink = ease(span(t, 0.62, 1));
  const stack = p.part('stack');
  stack.sy = 1 - 0.5 * sink;
  stack.sx = 1 + 0.05 * sink;
  // cap stone: tips off the front, drops to the floor, bounces and rolls on
  const u = span(t, 0, 0.6);
  const ub = span(t, 0.6, 1);
  const top = p.part('top');
  pivot(top, 0, -12, 1.5 * u + 0.45 * easeOut(ub));
  top.x += 46 * u + 13 * easeOut(ub);
  top.y += 63 * u * u - 14 * sin(u * Math.PI) * (1 - u) - 6 * sin(ub * Math.PI);
  // middle stone: shoved off the back, lands on its rear face and rocks to rest
  const v = span(t, 0.05, 0.7);
  const vb = span(t, 0.7, 1);
  const mid = p.part('mid');
  pivot(mid, 0, -15, -1.25 * v - 0.3 * easeOut(vb));
  mid.x += -50 * easeOut(v) - 9 * easeOut(vb);
  mid.y += 33 * v * v - 6 * sin(v * Math.PI) * (1 - v) - 4 * sin(vb * Math.PI);
  // base: jolted up onto its front edge, drops back and stays a little askew
  rock(p, 0.15 * sin(span(t, 0, 0.5) * Math.PI) - 0.05 * span(t, 0.5, 0.8));
  lid(p, 1 - span(t, 0, 0.2));
  // the pebbles are thrown out, land and are swallowed
  const out = easeOut(span(t, 0, 0.6));
  const left = 1 - 0.7 * sink;
  pebbles(p, a, 0, 0, 0, 1 + 0.3 * out, out, sin(span(t, 0, 0.6) * Math.PI) * 9, left);
  const jump = sin(span(t, 0, 0.5) * Math.PI);
  const near = p.part('pebNear');
  near.x = 17 * out;
  near.rot = 2 * out;
  near.y = -jump * 7 + 4 * sink;
  size(near, left);
  const far = p.part('pebFar');
  far.x = -15 * out;
  far.rot = -2 * out;
  far.y = -jump * 6 + 3 * sink;
  size(far, left);
}

export const cairnAnimator: Animator = (p, a) => {
  switch (a.state) {
    case 'spawn':
      spawn(p, a);
      return 60;
    case 'move':
      move(p, a);
      return 24;
    case 'windup':
      if (a.variant === 1) windupLob(p, a);
      else windupSlam(p, a);
      return 55;
    case 'attack':
      if (a.variant === 1) lob(p, a);
      else slam(p, a);
      return 70;
    case 'recover':
      if (a.variant === 1) recoverLob(p, a);
      else recoverSlam(p, a);
      return 40;
    case 'hurt':
      hurt(p, a);
      return 60;
    case 'stun':
      stun(p, a);
      return 30;
    case 'launched':
      // a stack of stones does not flail: it goes over in one piece, loose and rattling
      stun(p, a);
      return 45;
    case 'dead':
      dead(p, a);
      return 60;
    default:
      idle(p, a);
      return 14;
  }
};

/** What the registry gathers: this file is the whole of the rig, and nothing else lists it. */
const ENTRY: RigEntry = { def: CAIRN_RIG, animator: cairnAnimator, required: ENEMY_STATES, variants: { windup: [0, 1], attack: [0, 1], recover: [0, 1] } };
export default ENTRY;
