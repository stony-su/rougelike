// The Claimjumper: the Chainman's dark twin. A gaunt, stooped surveyor of ink under a tall crooked
// hat, leaning on a hostile stake taller than itself with a black pennant at its tip. Nothing else
// in the game carries a flag, so the pole and the pennant are the silhouette.
// Pixi-free: a RigDef plus a pure animator, after the pattern of the Smudge.
//
// The pole is not a child of the hand. It is placed in rig space and the hands are sent to it, so
// it can be planted and left behind, drawn back like a spear, or fall away from the body.
import { clamp, clamp01, lerp, smoothstep } from '../../core/math';
import { INK, RIM, WHITE, ZONES } from '../palette';
import { block, ell, flat, smooth, stroke } from './def';
import type { AnimInput, Animator, PartDef, PoseWriter, RigDef } from './def';
import { ENEMY_STATES } from './states';

const palette: Record<string, number> = {
  ink: ZONES.bluefen.inkWash,
  inkDark: ZONES.bluefen.inkDark,
  rim: RIM,
  eye: WHITE,
  pupil: INK,
};

/** Hip to sole. The legs are stiff, like a pair of dividers. */
const LEG = 38;
/** The torso's forward lean at rest. */
const STOOP = 0.16;
const TORSO_Y = -1;
const SHOULDER_Y = -27;
const SHOULDER_NEAR = 3;
const SHOULDER_FAR = -1.5;
/** Length of the upper arm, and of the forearm down to the palm. */
const ARM = 19;
/** Shoe of the pole to the collar under its lance head. */
const POLE = 108;
/** Where the pole stands when it is at rest: in front, clear of the eye. */
const POLE_X = 21;
/** How far up the pole the pennant is tied. */
const HOIST = 98;
/** How far up the pole the near hand holds it when standing. */
const GRIP = 46;
/** Where the far hand hangs when it has nothing to hold. */
const FREE_X = 17;
const FREE_Y = -32;
/** The pool is authored as a speck and scaled up, so it is invisible in every pose that leaves it alone. */
const POOL = 104;

const leg = (name: string, x: number, z: number): PartDef => ({
  name,
  parent: 'hips',
  x,
  y: 0,
  z,
  // a pointed shoe with a pale toe, so the long stride reads on dark ground
  shapes: [
    ...block([-2.7, -2, 2.7, -2, 1.7, LEG - 7, 7.6, LEG - 1.8, 7.6, LEG, -2, LEG], {
      fill: 'ink',
      shade: 'inkDark',
      shadeFrom: 0.72,
      rim: 'rim',
      rimWidth: 1.3,
    }),
  ],
});

const arm = (name: string, x: number, z: number): PartDef => ({
  name,
  parent: 'torso',
  x,
  y: SHOULDER_Y,
  z,
  shapes: [...block([-2.5, -2.5, 2.5, -2.5, 2, ARM + 1, -2, ARM + 1], { fill: 'ink', shade: 'inkDark', shadeFrom: 0.55, rim: 'rim', rimWidth: 1.3 })],
});

const fore = (name: string, parent: string): PartDef => ({
  name,
  parent,
  x: 0,
  y: ARM,
  z: 1,
  shapes: [
    flat([-2, -1.5, 2, -1.5, 1.5, ARM - 3, -1.5, ARM - 3], 'ink'),
    // a long-fingered hand below a pale cuff
    flat(smooth([-2.3, ARM - 3, 2.3, ARM - 3, 3, ARM + 1.5, 0.6, ARM + 5, -2.6, ARM + 2], 1), 'ink'),
    stroke([-2, ARM - 3.4, 2, ARM - 3.4], 1.3, 'rim', 0.75),
  ],
});

const coat = { fill: 'ink', shade: 'inkDark', hatch: 'rim', shadeFrom: 0.42, hatchGap: 5 } as const;

const parts: PartDef[] = [
  {
    // the ink it rises from and falls back into
    name: 'pool',
    x: 8,
    y: 0,
    z: -1,
    shapes: [flat(ell(0, 0, 0.25, 0.112, 24), 'rim', 0.5), flat(ell(0, 0, 0.233, 0.096, 24), 'inkDark')],
  },
  { name: 'hips', x: 0, y: -LEG, shapes: [] },
  leg('legFar', -2.5, -3),
  leg('legNear', 2.5, -2),
  {
    // the long ragged tail at the back of the coat; it lags behind every movement
    name: 'tailBack',
    parent: 'hips',
    x: -3.5,
    y: -3,
    z: 1,
    shapes: [...block([-4.5, 0, 5, 0, 5.5, 12, 4, 25, 1.5, 21, -1, 31, -4, 23, -7.5, 33, -10.5, 20, -9, 9], coat)],
  },
  {
    name: 'tailFront',
    parent: 'hips',
    x: 3.5,
    y: -3,
    z: 2,
    shapes: [...block([-5, 0, 4.5, 0, 6.5, 11, 7.5, 22, 5, 18.5, 3.5, 27, 0.5, 20, -2, 26, -3.5, 12], coat)],
  },
  {
    // narrow chest, a hunch behind the neck and a collar turned up over it
    name: 'torso',
    parent: 'hips',
    x: 0,
    y: TORSO_Y,
    rot: STOOP,
    z: 3,
    shapes: [
      ...block(smooth([-6, 2, 6.5, 2, 7.5, -9, 7.8, -20, 6.8, -28, 4, -31.5, -1, -32, -4.5, -37, -8.8, -33, -10.8, -24, -10, -13, -8, -4], 1), {
        fill: 'ink',
        shade: 'inkDark',
        hatch: 'rim',
        rim: 'rim',
        shadeFrom: 0.58,
        hatchGap: 4.5,
        rimWidth: 2,
      }),
      // the coat's opening, and its back seam seen from behind
      stroke([4.8, -29, 2.6, -15, 3.4, 1], 1.2, 'inkDark', 0.9, 'front'),
      stroke([-2.5, -31, -1.6, 1], 1.2, 'inkDark', 0.8, 'back'),
    ],
  },
  arm('armFar', SHOULDER_FAR, -1),
  fore('foreFar', 'armFar'),
  arm('armNear', SHOULDER_NEAR, 1),
  fore('foreNear', 'armNear'),
  {
    name: 'head',
    parent: 'torso',
    x: 2.5,
    y: -31,
    z: 2,
    shapes: [
      flat([-2.8, -3, 2.8, -3, 3.2, 3, -3.2, 3], 'inkDark'),
      // a narrow hooded head with one bright eye in a dark socket, under the brim
      ...block(ell(1, -7.8, 6.8, 7.2, 14), { fill: 'ink', shade: 'inkDark', shadeFrom: 0.62 }),
      flat(ell(3, -8, 4.8, 5.4, 12), 'inkDark', 1, 'front'),
      flat(ell(3.9, -8.1, 3.6, 4.2, 12), 'eye', 1, 'front'),
      flat(ell(5.3, -7.9, 1.6, 2.2, 8), 'pupil', 1, 'front'),
      // seen from behind: only a pale glint where the eye would be
      flat(ell(-2.6, -8.6, 1.6, 2.4, 8), 'rim', 0.35, 'back'),
      // brim underside, the brim, then the crown: the Chainman's hat, pinched tall and narrow
      flat(ell(1.4, -12.6, 9.6, 3, 16), 'inkDark'),
      ...block(ell(1.4, -13.8, 10, 2.8, 16), { fill: 'ink', rim: 'rim', rimWidth: 1.5 }),
      ...block([-4.4, -14, 7, -14, 5.2, -22, 3.6, -27.5, -1.2, -27.5, -3, -22], { fill: 'ink', shade: 'inkDark', shadeFrom: 0.5, rim: 'rim', rimWidth: 1.5 }),
      flat([-4.5, -17, 7.1, -17, 7, -14, -4.4, -14], 'inkDark'),
    ],
  },
  {
    // the crooked point of the hat; like the Smudge's curl, it lags behind every movement
    name: 'hatTip',
    parent: 'head',
    x: 1.2,
    y: -27,
    z: 1,
    shapes: [...block(smooth([-2.5, 1.5, 2.5, 1.5, 2, -4.5, 0, -9, -4.5, -11.5, -7.5, -10, -4, -8, -2.6, -4], 1), { fill: 'ink', rim: 'rim', rimWidth: 1.5 })],
  },
  {
    // the hostile stake: a black shaft with a pale glint, an iron shoe and a lance head
    name: 'pole',
    x: POLE_X,
    y: 0,
    z: 1,
    shapes: [
      flat([-1.7, -7, 1.7, -7, 1.7, -POLE, -1.7, -POLE], 'inkDark'),
      stroke([-0.8, -9, -0.8, -POLE + 2], 1.1, 'rim', 0.7),
      flat([-2.1, -8, 2.1, -8, 0, 0.5], 'ink'),
      flat([-3.2, -POLE - 1.5, 3.2, -POLE - 1.5, 3.2, -POLE + 0.5, -3.2, -POLE + 0.5], 'ink'),
      ...block([0, -POLE - 10, 2.8, -POLE - 3.5, 0, -POLE - 1, -2.8, -POLE - 3.5], { fill: 'ink', rim: 'rim', rimWidth: 1.2 }),
    ],
  },
  {
    // the black pennant, outlined pale all round so it reads on dark ground
    name: 'pennant',
    parent: 'pole',
    x: -1.2,
    y: -HOIST,
    z: -1,
    shapes: [flat([0.6, -6.5, 0.6, 6.5, -13.5, 5.2, -13.5, -4.6], 'inkDark'), stroke([-13.5, -4.6, 0.6, -6.5, 0.6, 6.5, -13.5, 5.2], 1.4, 'rim')],
  },
  {
    // its swallowtail, which trails the wave a beat behind
    name: 'pennantTip',
    parent: 'pennant',
    x: -13,
    y: 0.3,
    z: 1,
    shapes: [flat([0.5, -4.9, 0.5, 4.9, -15, 6.4, -9.5, 0.8, -16, -3.6], 'inkDark'), stroke([0.5, -4.9, -16, -3.6, -9.5, 0.8, -15, 6.4, 0.5, 4.9], 1.4, 'rim')],
  },
];

export const CLAIMJUMPER_RIG: RigDef = {
  id: 'claimjumper',
  parts,
  palette,
  footprint: 0.4,
  height: 96,
  states: ENEMY_STATES,
};

const sin = Math.sin;
const cos = Math.cos;

/** Stride cycles per tile travelled: a long lope. */
const STRIDE = 3.5;

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

// Scratch for toTorso: the animator runs for every enemy every frame, so it makes no garbage.
let qx = 0;
let qy = 0;

/** A point in rig space, expressed in the torso's own space under the pose written so far. */
function toTorso(p: PoseWriter, x: number, y: number): void {
  const hips = p.part('hips');
  const torso = p.part('torso');
  let dx = x - hips.x;
  let dy = y - (hips.y - LEG);
  let c = cos(hips.rot);
  let s = sin(hips.rot);
  const hx = (dx * c + dy * s) / hips.sx;
  const hy = (dy * c - dx * s) / hips.sy;
  dx = hx - torso.x;
  dy = hy - (TORSO_Y + torso.y);
  c = cos(STOOP + torso.rot);
  s = sin(STOOP + torso.rot);
  qx = (dx * c + dy * s) / torso.sx;
  qy = (dy * c - dx * s) / torso.sy;
}

/** Send a hand to a point in rig space: shoulder and elbow are solved, the elbow folding behind. Pose the hips and torso first. */
function reach(p: PoseWriter, near: boolean, x: number, y: number): void {
  toTorso(p, x, y);
  const sx = near ? SHOULDER_NEAR : SHOULDER_FAR;
  const dx = qx - sx;
  const dy = qy - SHOULDER_Y;
  const d = clamp(Math.hypot(dx, dy), 4, ARM * 2 - 0.3);
  const upper = Math.atan2(-dx, dy) + Math.acos(d / (ARM * 2));
  const ex = sx - sin(upper) * ARM;
  const ey = SHOULDER_Y + cos(upper) * ARM;
  p.part(near ? 'armNear' : 'armFar').rot = upper;
  p.part(near ? 'foreNear' : 'foreFar').rot = Math.atan2(ex - qx, qy - ey) - upper;
}

/** Let an arm swing loose from the shoulder. `swing` is measured from straight down, whatever the torso is doing. */
function hang(p: PoseWriter, near: boolean, swing: number, bend: number): void {
  p.part(near ? 'armNear' : 'armFar').rot = swing - STOOP - p.part('torso').rot;
  p.part(near ? 'foreNear' : 'foreFar').rot = bend;
}

/** Sink the hips by `drop` px (negative: up on its toes) over legs `spread` apart, near leg leading, feet kept on the ground. */
function stance(p: PoseWriter, drop: number, spread: number): void {
  p.part('hips').y = drop;
  const k = clamp((LEG - drop) / (LEG * cos(spread)), 0.45, 1.25);
  const near = p.part('legNear');
  const far = p.part('legFar');
  near.rot = -spread;
  far.rot = spread;
  near.sy = k;
  far.sy = k;
}

/**
 * Stand the pole with its shoe at (x, y) in rig space, leaning `rot` (0 upright, positive tips the
 * pennant forward), and send the hands to hold it `nearAt` and `farAt` px up the shaft. A negative
 * distance leaves that hand alone. Pose the hips and torso first.
 */
function pole(p: PoseWriter, x: number, y: number, rot: number, nearAt: number, farAt: number): void {
  const pl = p.part('pole');
  pl.x = x - POLE_X;
  pl.y = y;
  pl.rot = rot;
  if (nearAt >= 0) reach(p, true, x + sin(rot) * nearAt, y - cos(rot) * nearAt);
  if (farAt >= 0) reach(p, false, x + sin(rot) * farAt, y - cos(rot) * farAt);
}

/** Grow or shrink the pole from its shoe; at 0 it has left the rig. */
function poleSize(p: PoseWriter, k: number): void {
  const pl = p.part('pole');
  pl.sy = Math.max(0.01, k);
  pl.sx = clamp(k * 3, 0.01, 1);
}

/**
 * Fly the pennant at an angle in rig space, whatever the pole is doing: 0 streams straight back,
 * positive lifts it, negative lets it droop. `wave` bends the swallowtail. Place the pole first.
 */
function fly(p: PoseWriter, angle: number, wave: number, stretch: number): void {
  const pn = p.part('pennant');
  pn.rot = angle - p.part('pole').rot;
  pn.sx = stretch;
  p.part('pennantTip').rot = wave;
}

function spawn(p: PoseWriter, a: AnimInput): void {
  // Pole-first: a pool spreads, the stake stands up out of it, then a hand finds the shaft and the
  // rest of it climbs out, overshooting onto its toes before it settles.
  const t = a.phase;
  const spread = smoothstep(t / 0.18) * (1 - smoothstep((t - 0.78) / 0.22));
  const up = easeOut(clamp01((t - 0.03) / 0.42));
  const rise = clamp01((t - 0.36) / 0.46);
  const over = t < 0.82 ? 0 : sin(((t - 0.82) / 0.18) * Math.PI) * 0.06;
  const pool = p.part('pool');
  pool.sx = 1 + (POOL - 1) * spread;
  pool.sy = pool.sx;
  const hips = p.part('hips');
  hips.sy = 0.02 + 0.98 * rise * rise + over;
  hips.sx = 1.35 - 0.35 * rise - over * 0.6;
  hips.y = LEG * (1 - hips.sy);
  p.part('head').rot = 0.35 * (1 - rise);
  p.part('hatTip').rot = -1.0 * (1 - rise) + over * 4;
  p.part('tailBack').rot = 0.75 * (1 - rise) - over * 2;
  p.part('tailFront').rot = -0.6 * (1 - rise) + over * 2;
  reach(p, false, FREE_X, FREE_Y);
  pole(p, POLE_X, 0, 0.02 + sin(t * 40) * 0.05 * (1 - up), GRIP, -1);
  poleSize(p, up);
  const unfurl = smoothstep((t - 0.25) / 0.45);
  fly(p, lerp(-1.4, -0.5, unfurl) + over * 3, sin(t * 22) * 0.4 * unfurl, 0.25 + 0.75 * unfurl);
}

function idle(p: PoseWriter, a: AnimInput): void {
  // Stands tall and still on its stake. Only the pennant, the hat and the coat tails move.
  const ph = a.time * 1.9 + a.seed * 6.283;
  const b = sin(ph);
  const slow = sin(ph * 0.45 + 1);
  p.part('hips').y = b * 0.7;
  const torso = p.part('torso');
  torso.rot = slow * 0.014 - 0.02;
  torso.sy = 1 + b * 0.012;
  p.part('head').rot = sin(ph * 0.45 + 2.2) * 0.07;
  p.part('hatTip').rot = sin(ph * 0.9 + 0.4) * 0.16;
  p.part('tailBack').rot = 0.05 + sin(ph * 0.8) * 0.09;
  p.part('tailFront').rot = -0.03 + sin(ph * 0.8 + 1.3) * 0.07;
  reach(p, false, FREE_X + slow * 0.8, FREE_Y + b * 0.7);
  pole(p, POLE_X, 0, 0.02 + slow * 0.012, GRIP, -1);
  fly(p, -0.5 + sin(ph * 2.7) * 0.24 + sin(ph * 4.3 + 1) * 0.07, sin(ph * 2.7 - 1.3) * 0.55, 1 + sin(ph * 2.7 + 0.6) * 0.05);
}

function move(p: PoseWriter, a: AnimInput): void {
  // A long stiff-legged lope, the stake sloped back over its shoulder, coat and pennant streaming.
  const ph = a.stride * STRIDE + a.seed * 6.283;
  const s = sin(ph);
  const c = cos(ph);
  const lag = sin(ph * 2 - 0.9);
  const swing = s * 0.6;
  const hips = p.part('hips');
  hips.y = LEG * (1 - cos(swing)) - 1.5;
  const near = p.part('legNear');
  const far = p.part('legFar');
  near.rot = -swing;
  far.rot = swing;
  // the leg swinging through is drawn up clear of the ground
  near.sy = 1 - Math.max(0, c) * 0.1;
  far.sy = 1 - Math.max(0, -c) * 0.1;
  p.part('torso').rot = 0.13 + lag * 0.03;
  p.part('head').rot = -0.12 + sin(ph * 2 - 1.4) * 0.04;
  p.part('hatTip').rot = -0.45 + sin(ph * 2 - 1.8) * 0.22;
  p.part('tailBack').rot = 0.5 + lag * 0.2;
  p.part('tailFront').rot = 0.3 + sin(ph * 2 - 1.5) * 0.16;
  hang(p, false, -0.1 - s * 0.55, -0.35 - Math.max(0, s) * 0.3);
  const rot = -0.4 + lag * 0.05;
  const hx = 14;
  const hy = -50 + hips.y * 0.9;
  pole(p, hx - sin(rot) * 40, hy + cos(rot) * 40, rot, 40, -1);
  fly(p, 0.1 + sin(ph * 2 - 2) * 0.2, sin(ph * 2 - 3.1) * 0.5, 1.1);
}

function windupPlant(p: PoseWriter, a: AnimInput): void {
  // Raises the stake overhead in both hands, stretched up on its toes, coat flaring, pennant
  // streaming, trembling harder as the moment comes.
  const t = a.phase;
  const e = easeOut(t);
  const shake = sin(a.t * 70) * t;
  stance(p, -4.5 * e, 0.05 * e);
  const torso = p.part('torso');
  torso.rot = -0.3 * e;
  torso.sy = 1 + 0.07 * e;
  torso.sx = 1 - 0.05 * e;
  torso.x = shake * 0.8;
  p.part('head').rot = 0.12 * e;
  p.part('hatTip').rot = -0.55 * e + sin(a.t * 55) * 0.1 * t;
  p.part('tailBack').rot = 0.45 * e;
  p.part('tailFront').rot = -0.4 * e;
  const x = lerp(POLE_X, 11, e) + shake * 0.9;
  const y = lerp(0, -56, e);
  const rot = lerp(0.02, -0.14, e) + shake * 0.012;
  pole(p, x, y, rot, lerp(GRIP, 44, e), -1);
  const join = smoothstep(t / 0.3);
  reach(p, false, lerp(FREE_X, x + sin(rot) * 24, join), lerp(FREE_Y, y - cos(rot) * 24, join));
  fly(p, lerp(-0.5, 0.35, e) + sin(a.t * 38) * 0.25 * (0.3 + t), sin(a.t * 38 - 1.2) * 0.6, 1 + 0.18 * e);
}

function attackPlant(p: PoseWriter, a: AnimInput): void {
  // Drives the stake into the ground in front and folds down over it. The pennant streams up on
  // the way down, then whips past as the shaft stops dead and rings.
  const t = a.phase;
  const k = t < 0.3 ? (t / 0.3) * (t / 0.3) : 1;
  const after = t < 0.3 ? 0 : (t - 0.3) / 0.7;
  const ring = t < 0.3 ? 0 : sin(after * 16) * (1 - after);
  stance(p, lerp(-4.5, 10, k), lerp(0.05, 0.5, k));
  p.part('hips').x = 5 * k;
  const torso = p.part('torso');
  torso.rot = lerp(-0.3, 0.42, k) + ring * 0.03;
  torso.sy = lerp(1.07, 0.94, k);
  torso.sx = lerp(0.95, 1.05, k);
  p.part('head').rot = lerp(0.12, -0.2, k);
  p.part('hatTip').rot = lerp(-0.55, 0.9, k) + ring * 0.5;
  p.part('tailBack').rot = lerp(0.45, 1.0, k) - 0.5 * after + ring * 0.2;
  p.part('tailFront').rot = lerp(-0.4, 0.55, k) - 0.3 * after;
  pole(p, lerp(11, 38, k), lerp(-56, 2, k), lerp(-0.14, 0.05, k) + ring * 0.05, lerp(44, 38, k), lerp(24, 26, k));
  const lash = t < 0.3 ? lerp(0.35, 1.25, k) : 1.25 - 2 * (1 - Math.exp(-after * 6)) + sin(after * 14) * 0.35 * (1 - after);
  fly(p, lash, -lash * 0.5, 1.15);
}

function recoverPlant(p: PoseWriter, a: AnimInput): void {
  // Lets go: the planted stake leaves the rig. It straightens with empty hands, head hanging, and
  // only then draws a fresh pole out of its palm. Open the whole time.
  const t = a.phase;
  const gone = smoothstep(t / 0.16);
  const up = smoothstep((t - 0.12) / 0.55);
  const grow = smoothstep((t - 0.5) / 0.45);
  const spent = sin(clamp01(t / 0.8) * Math.PI);
  const sag = sin(a.t * 9) * Math.exp(-a.t * 3.5);
  stance(p, lerp(10, 0, up), lerp(0.5, 0, up));
  p.part('hips').x = 5 * (1 - up);
  const torso = p.part('torso');
  torso.rot = lerp(0.42, 0, up) + sag * 0.05;
  torso.sy = lerp(0.94, 1, up);
  torso.sx = lerp(1.05, 1, up);
  p.part('head').rot = -0.2 * (1 - up) + 0.4 * spent;
  p.part('hatTip').rot = 0.9 * (1 - up) + 0.5 * spent + sag * 0.5;
  p.part('tailBack').rot = 0.5 * (1 - up) + sag * 0.3;
  p.part('tailFront').rot = 0.25 * (1 - up) - sag * 0.25;
  // the far hand drops back to its side; the near hand opens, hangs, then rises to take the new pole
  reach(p, false, lerp(38.3, FREE_X, up) + sag * 2, lerp(-24, FREE_Y, up));
  const openX = lerp(40, 27, gone);
  const openY = lerp(-36, -26, gone);
  reach(p, true, lerp(openX, POLE_X + 1, grow) + sag * 2, lerp(openY, -GRIP, grow));
  if (t < 0.5) {
    pole(p, 38, 2, 0.05, -1, -1);
    poleSize(p, 1 - gone);
    fly(p, -0.75 - 0.6 * gone, 0.4 * (1 - gone), 1);
  } else {
    // the new pole grows both ways out of the hand
    pole(p, POLE_X, -GRIP * (1 - grow), 0.02, -1, -1);
    poleSize(p, grow);
    const unfurl = smoothstep((t - 0.68) / 0.32);
    fly(p, lerp(-1.4, -0.5, unfurl), sin(a.t * 20) * 0.3 * unfurl, 0.2 + 0.8 * unfurl);
  }
}

function windupJab(p: PoseWriter, a: AnimInput): void {
  // Coils low and draws the stake back level like a spear, the pennant hanging limp under its point.
  const t = a.phase;
  const e = easeOut(t);
  const shake = sin(a.t * 70) * t;
  stance(p, 8 * e, 0.42 * e);
  p.part('hips').x = -6 * e + shake * 0.8;
  p.part('torso').rot = 0.14 * e;
  p.part('head').rot = -0.2 * e;
  p.part('hatTip').rot = 0.5 * e + sin(a.t * 55) * 0.1 * t;
  p.part('tailBack').rot = -0.3 * e;
  p.part('tailFront').rot = -0.5 * e;
  // the shaft swings down level and slides back through the near hand
  const rot = lerp(0.02, 1.52, e) + shake * 0.01;
  const at = lerp(GRIP, 56, e);
  const hx = lerp(POLE_X + 1, -13, e) + shake * 0.9;
  const hy = lerp(-GRIP, -50, e);
  const x = hx - sin(rot) * at;
  const y = hy + cos(rot) * at;
  pole(p, x, y, rot, at, -1);
  const join = smoothstep(t / 0.35);
  reach(p, false, lerp(FREE_X, x + sin(rot) * 82, join), lerp(FREE_Y, y - cos(rot) * 82, join));
  fly(p, lerp(-0.5, -1.45, e) + sin(a.t * 40) * 0.12 * t, sin(a.t * 40 - 1) * 0.3 * t, 1);
}

function attackJab(p: PoseWriter, a: AnimInput): void {
  // A long straight thrust off the back leg, one-handed, the far arm thrown out behind.
  const t = a.phase;
  const k = easeOut(clamp01(t / 0.22));
  const hold = t < 0.22 ? 0 : (t - 0.22) / 0.78;
  stance(p, lerp(8, 11, k), lerp(0.42, 0.78, k));
  p.part('hips').x = lerp(-6, 12, k) - 2 * hold;
  p.part('torso').rot = lerp(0.14, 0.52, k);
  p.part('head').rot = lerp(-0.2, -0.42, k);
  p.part('hatTip').rot = lerp(0.5, -1.0, k) + 0.3 * hold;
  p.part('tailBack').rot = lerp(-0.3, 1.0, k) - 0.3 * hold;
  p.part('tailFront').rot = lerp(-0.5, 0.7, k) - 0.25 * hold;
  const rot = lerp(1.52, 1.6, k);
  const hx = lerp(-13, 60, k) - 2 * hold;
  const hy = lerp(-50, -47, k);
  const x = hx - sin(rot) * 56;
  const y = hy + cos(rot) * 56;
  pole(p, x, y, rot, 56, -1);
  reach(p, false, lerp(x + sin(rot) * 82, -16, k), lerp(y - cos(rot) * 82, -42, k));
  fly(p, lerp(-1.45, 0.3, k) + sin(a.t * 45) * 0.15, sin(a.t * 45 - 1) * 0.4, 1 + 0.25 * k);
}

function recoverJab(p: PoseWriter, a: AnimInput): void {
  // Overreached: the point sags to the dirt and its head hangs before it hauls the stake upright again.
  const t = a.phase;
  const droop = smoothstep(t / 0.35);
  const back = smoothstep((t - 0.3) / 0.7);
  const sag = sin(a.t * 9) * Math.exp(-a.t * 3.5);
  stance(p, lerp(11, 0, back), lerp(0.78, 0, back));
  p.part('hips').x = lerp(10, 0, back);
  p.part('torso').rot = lerp(0.52 + 0.1 * droop, 0, back) + sag * 0.04;
  p.part('head').rot = lerp(-0.42 + 0.8 * droop, 0, back);
  p.part('hatTip').rot = lerp(-0.7 + 1.6 * droop, 0, back) + sag * 0.5;
  p.part('tailBack').rot = lerp(0.7, 0, back) + sag * 0.3;
  p.part('tailFront').rot = lerp(0.45, 0, back) - sag * 0.25;
  const rot = lerp(1.6 + 0.38 * droop, 0.02, back);
  const at = lerp(56, GRIP, back);
  const hx = lerp(58 - 4 * droop, POLE_X + 1, back);
  const hy = lerp(-47 + 8 * droop, -GRIP, back);
  pole(p, hx - sin(rot) * at, hy + cos(rot) * at, rot, at, -1);
  reach(p, false, lerp(-16, FREE_X, back) + sag * 2, lerp(-42, FREE_Y, back));
  fly(p, lerp(lerp(0.3, -1.5, droop), -0.5, back), sag * 0.6, 1);
}

function hurt(p: PoseWriter, a: AnimInput): void {
  // Folds at the waist over its own grip on the stake; hat, tails and pennant are thrown the other way.
  const k = Math.max(0, 1 - a.t / 0.2);
  const hips = p.part('hips');
  hips.x = -6 * k;
  hips.y = 2.5 * k;
  p.part('legNear').rot = -0.22 * k;
  p.part('legFar').rot = -0.1 * k;
  const torso = p.part('torso');
  torso.rot = 0.8 * k;
  torso.sy = 1 - 0.06 * k;
  p.part('head').rot = 0.45 * k;
  p.part('hatTip').rot = 1.2 * k;
  p.part('tailBack').rot = -0.45 * k;
  p.part('tailFront').rot = -0.7 * k;
  reach(p, false, lerp(FREE_X, 28, k), lerp(FREE_Y, -58, k));
  pole(p, POLE_X + 5 * k, -5 * k, 0.02 - 0.3 * k, GRIP, -1);
  fly(p, -0.5 + 1.3 * k, -0.8 * k, 1);
}

function stun(p: PoseWriter, a: AnimInput): void {
  // Staggers on the spot: the stake droops until its shoe drags, the head lolls after the body,
  // the pennant hangs straight down.
  const w = a.t * 6.5;
  const s = sin(w);
  const hips = p.part('hips');
  hips.x = s * 4.5;
  hips.y = 3;
  const near = p.part('legNear');
  const far = p.part('legFar');
  near.rot = -0.22 + s * 0.12;
  far.rot = 0.24 + s * 0.12;
  near.sy = 0.95;
  far.sy = 0.95;
  p.part('torso').rot = 0.2 + sin(w - 0.5) * 0.17;
  p.part('head').rot = 0.5 + sin(w - 1.3) * 0.38;
  p.part('hatTip').rot = 0.8 + sin(w - 2.1) * 0.55;
  p.part('tailBack').rot = sin(w - 0.9) * 0.32;
  p.part('tailFront').rot = sin(w - 1.4) * 0.26;
  hang(p, false, 0.1 + sin(w - 1.1) * 0.4, -0.15);
  pole(p, -6 + hips.x * 0.4, 0, 0.85 + sin(w - 0.7) * 0.09, 46, -1);
  fly(p, -1.5 + sin(w - 1.8) * 0.25, sin(w - 2.6) * 0.3, 1);
}

function dead(p: PoseWriter, a: AnimInput): void {
  // A last stiffening, then it collapses into its own coat: legs fold flat like dropped dividers,
  // the hat's point comes off, ink pools under the heap, and the stake topples the other way.
  const t = Math.min(1, a.t / 0.42);
  const jolt = t < 0.18 ? t / 0.18 : 1;
  const fall = t < 0.18 ? 0 : (t - 0.18) / 0.82;
  const e = easeOut(fall);
  const g = fall * fall;
  const pool = p.part('pool');
  pool.sx = 1 + (POOL * 0.85 - 1) * e;
  pool.sy = pool.sx;
  p.part('hips').y = -3 * jolt * (1 - e) + (LEG - 5) * e;
  const near = p.part('legNear');
  const far = p.part('legFar');
  near.rot = -1.38 * e;
  far.rot = 1.3 * e;
  near.sy = 1 + 0.08 * jolt * (1 - e) - 0.1 * e;
  far.sy = near.sy;
  const torso = p.part('torso');
  torso.sy = 1 + 0.06 * jolt * (1 - e) - 0.74 * e;
  torso.sx = 1 - 0.04 * jolt * (1 - e) + 0.5 * e;
  torso.rot = 0.3 * e;
  p.part('head').rot = 0.8 * e;
  const tip = p.part('hatTip');
  tip.rot = 2.4 * e;
  tip.x = 12 * e;
  tip.y = -40 * sin(Math.min(1, fall * 1.1) * Math.PI);
  p.part('tailBack').rot = 1.2 * e;
  p.part('tailFront').rot = -1.05 * e;
  reach(p, true, lerp(POLE_X + 1, 26, e), lerp(-GRIP, -4, e));
  reach(p, false, lerp(FREE_X, -18, e), lerp(FREE_Y, -4, e));
  const bounce = fall > 0.88 ? sin(((fall - 0.88) / 0.12) * Math.PI) * 0.05 : 0;
  pole(p, POLE_X - 7 * g, -g, 0.02 + 0.06 * jolt * (1 - g) - 1.55 * g + bounce, -1, -1);
  fly(p, lerp(-0.5, 2.3, smoothstep(fall * 1.3)), sin(fall * 9) * 0.6, 1);
}

export const claimjumperAnimator: Animator = (p, a) => {
  switch (a.state) {
    case 'spawn':
      spawn(p, a);
      return 60;
    case 'move':
      move(p, a);
      return 24;
    case 'windup':
      if (a.variant === 1) windupJab(p, a);
      else windupPlant(p, a);
      return 55;
    case 'attack':
      if (a.variant === 1) attackJab(p, a);
      else attackPlant(p, a);
      return 70;
    case 'recover':
      if (a.variant === 1) recoverJab(p, a);
      else recoverPlant(p, a);
      return 40;
    case 'hurt':
      hurt(p, a);
      return 60;
    case 'stun':
      stun(p, a);
      return 30;
    case 'dead':
      dead(p, a);
      return 60;
    default:
      idle(p, a);
      return 14;
  }
};
