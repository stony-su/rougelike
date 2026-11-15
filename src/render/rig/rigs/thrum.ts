// The Thrum: a squat teardrop on two stub legs. It squashes flat before it lunges.
// Pixi-free: a RigDef plus a pure animator. This file is the pattern every Echo rig follows.
import { INK, RIM, WHITE, ZONES } from '../../palette';
import { block, ell, flat, smooth } from '../def';
import type { AnimInput, Animator, PartDef, PoseWriter, RigDef, RigEntry } from '../def';
import { ENEMY_STATES } from '../states';

const palette: Record<string, number> = {
  ink: ZONES.outer.inkWash,
  inkDark: ZONES.outer.inkDark,
  rim: RIM,
  eye: WHITE,
  pupil: INK,
};

const body = smooth([5, -53, 10, -43, 15, -33, 18, -22, 17, -11, 11, -4, 0, -2, -11, -4, -17, -11, -18, -22, -15, -32, -9, -40, -2, -46], 2);

const foot = (name: string, x: number, z: number): PartDef => ({
  name,
  parent: 'hips',
  x,
  y: 0,
  z,
  // feet in the body colour with a pale top edge, so the waddle reads on dark ground
  shapes: [...block([-3.4, -2, 3.4, -2, 3.6, 6.5, 9, 9, 9, 11, -3.8, 11], { fill: 'ink', shade: 'inkDark', shadeFrom: 0.6, rim: 'rim', rimWidth: 1.4 })],
});

const parts: PartDef[] = [
  { name: 'hips', x: 0, y: -10, shapes: [] },
  foot('footFar', -6, -2),
  foot('footNear', 6, -1),
  {
    name: 'body',
    parent: 'hips',
    x: 0,
    y: 8,
    z: 1,
    shapes: [
      ...block(body, { fill: 'ink', shade: 'inkDark', rim: 'rim', shadeFrom: 0.66, rimWidth: 2.2 }),
      // one bright mark for an eye: white, with a pupil that leads the way it faces
      flat(ell(6, -25, 6.2, 7, 14), 'eye', 1, 'front'),
      flat(ell(8.4, -24.5, 2.6, 3.4, 10), 'pupil', 1, 'front'),
      // seen from behind: only a pale glint where the eye would be
      flat(ell(-4, -27, 2.2, 3, 8), 'rim', 0.35, 'back'),
    ],
  },
  {
    // the curl at the top of the teardrop; it lags behind every movement
    name: 'tip',
    parent: 'body',
    x: 3,
    y: -47,
    z: 1,
    shapes: [...block(smooth([-5, 3, 0, -9, 7, -15, 9, -10, 5, -3, 4, 4], 2), { fill: 'ink', rim: 'rim', rimWidth: 1.8 })],
  },
  {
    name: 'dripFar',
    parent: 'body',
    x: -15,
    y: -12,
    z: -1,
    shapes: [flat(smooth([-2.4, 0, 2.4, 0, 3, 6, 0, 10, -3, 6], 1), 'inkDark')],
  },
  {
    name: 'dripNear',
    parent: 'body',
    x: 14,
    y: -9,
    z: 2,
    shapes: [flat(smooth([-2, 0, 2, 0, 2.6, 5, 0, 8.5, -2.6, 5], 1), 'inkDark')],
  },
];

export const THRUM_RIG: RigDef = {
  id: 'thrum',
  parts,
  palette,
  footprint: 0.38,
  height: 58,
  states: ENEMY_STATES,
};

const sin = Math.sin;
const cos = Math.cos;

/** Squash and stretch that keeps the body's volume. */
function squash(p: PoseWriter, k: number): void {
  const b = p.part('body');
  b.sy = 1 - k;
  b.sx = 1 / Math.max(0.3, 1 - k * 0.72);
}

function spawn(p: PoseWriter, a: AnimInput): void {
  // Wells up out of a puddle: flat and wide, then pops to full height with an overshoot.
  const t = a.phase;
  const rise = t < 0.7 ? t / 0.7 : 1;
  const over = t < 0.7 ? 0 : sin(((t - 0.7) / 0.3) * Math.PI) * 0.12;
  const b = p.part('body');
  b.sy = 0.08 + 0.92 * rise * rise + over;
  b.sx = 1.5 - 0.5 * rise - over * 0.6;
  const legs = t < 0.55 ? 0.01 : Math.min(1, (t - 0.55) / 0.25);
  p.part('footFar').sy = legs;
  p.part('footNear').sy = legs;
  p.part('tip').rot = -1.2 * (1 - rise) + over * 2;
  p.part('hips').y = 9 * (1 - rise);
}

function idle(p: PoseWriter, a: AnimInput): void {
  const ph = a.time * 2.3 + a.seed * 6.283;
  const b = sin(ph);
  squash(p, b * 0.035);
  p.part('tip').rot = sin(ph * 0.7 + 1) * 0.16;
  p.part('dripFar').rot = sin(ph * 1.3) * 0.25;
  p.part('dripNear').rot = sin(ph * 1.1 + 2) * 0.25;
  p.part('hips').y = b * 0.6;
}

function move(p: PoseWriter, a: AnimInput): void {
  const ph = a.stride * 5.2 + a.seed * 6.283;
  const s = sin(ph);
  const c = cos(ph);
  p.part('footNear').rot = s * 0.7;
  p.part('footFar').rot = -s * 0.7;
  p.part('footNear').y = -Math.max(0, s) * 3;
  p.part('footFar').y = -Math.max(0, -s) * 3;
  p.part('hips').y = -Math.abs(c) * 3.2;
  const b = p.part('body');
  b.rot = s * 0.075 + 0.06;
  squash(p, -Math.abs(c) * 0.05 + 0.02);
  p.part('tip').rot = -0.3 - s * 0.22;
  p.part('dripFar').rot = -s * 0.5;
  p.part('dripNear').rot = -s * 0.5 - 0.2;
}

function windup(p: PoseWriter, a: AnimInput): void {
  // Squash flatter and flatter, drawing back, trembling harder as the moment comes.
  const t = a.phase;
  const e = 1 - (1 - t) * (1 - t);
  squash(p, 0.46 * e);
  const b = p.part('body');
  b.x = -5 * e + sin(a.t * 70) * 0.9 * t;
  b.rot = -0.1 * e;
  p.part('tip').rot = -1.0 * e + sin(a.t * 55) * 0.1 * t;
  p.part('footNear').rot = -0.55 * e;
  p.part('footFar').rot = 0.5 * e;
  p.part('hips').y = 3 * e;
  p.part('dripFar').rot = 0.5 * e;
  p.part('dripNear').rot = 0.6 * e;
}

function attack(p: PoseWriter, a: AnimInput): void {
  // The lunge: a long low smear, legs and tip streaming behind.
  const t = a.phase;
  const b = p.part('body');
  const stretch = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.75) / 0.25) * 0.5;
  b.sx = 1 + 0.5 * stretch;
  b.sy = 1 - 0.32 * stretch;
  b.rot = 0.3 * stretch;
  b.x = 5 * stretch;
  p.part('tip').rot = -1.35 * stretch;
  p.part('footNear').rot = -1.1 * stretch;
  p.part('footFar').rot = -0.8 * stretch;
  p.part('hips').y = 2 - 4 * sin(t * Math.PI);
  p.part('dripFar').rot = -1.2 * stretch;
  p.part('dripNear').rot = -1.2 * stretch;
}

function recover(p: PoseWriter, a: AnimInput): void {
  // Skids to a stop and wobbles like jelly; this is when it can be punished.
  const t = a.phase;
  const wob = sin(a.t * 17) * Math.exp(-a.t * 5);
  squash(p, 0.16 * (1 - t) + wob * 0.14);
  const b = p.part('body');
  b.rot = -0.2 * (1 - t) + wob * 0.12;
  b.x = 4 * (1 - t);
  p.part('tip').rot = 0.9 * (1 - t) + wob * 0.5;
  p.part('footNear').rot = 0.5 * (1 - t);
  p.part('footFar').rot = 0.3 * (1 - t);
  p.part('dripFar').rot = wob * 1.2;
  p.part('dripNear').rot = wob * 1.2;
}

function hurt(p: PoseWriter, a: AnimInput): void {
  const k = Math.max(0, 1 - a.t / 0.2);
  const b = p.part('body');
  b.x = -6 * k;
  b.rot = -0.3 * k;
  squash(p, -0.16 * k);
  p.part('tip').rot = 1.1 * k;
  p.part('footNear').rot = 0.6 * k;
  p.part('footFar').rot = -0.2 * k;
  p.part('dripFar').rot = 1.2 * k;
  p.part('dripNear').rot = 1.2 * k;
  p.part('hips').y = -3 * k;
}

function launched(p: PoseWriter, a: AnimInput): void {
  // Sent flying: balled up, legs and tip whipping about as it tumbles.
  const w = Math.sin(a.t * 26 + a.seed * 6.283);
  squash(p, -0.1 + w * 0.05);
  p.part('tip').rot = -0.9 + w * 0.5;
  p.part('footNear').rot = 1.0 + w * 0.4;
  p.part('footFar').rot = -0.9 - w * 0.4;
  p.part('footNear').y = -3;
  p.part('footFar').y = -3;
  p.part('dripFar').rot = w * 1.1;
  p.part('dripNear').rot = -w * 1.1;
}

function stun(p: PoseWriter, a: AnimInput): void {
  // Dazed: slumped, swaying, the tip flopped forward.
  const s = sin(a.t * 8);
  squash(p, 0.14 + s * 0.02);
  const b = p.part('body');
  b.rot = s * 0.13;
  b.x = s * 2;
  p.part('tip').rot = 1.0 + sin(a.t * 8 + 1) * 0.3;
  p.part('dripFar').rot = s * 0.7;
  p.part('dripNear').rot = -s * 0.7;
  p.part('footNear').rot = 0.2;
  p.part('footFar').rot = -0.2;
}

function dead(p: PoseWriter, a: AnimInput): void {
  // Bursts: a last swell, then it collapses into a spreading blot.
  const t = Math.min(1, a.t / 0.42);
  const swell = t < 0.2 ? t / 0.2 : 1;
  const fall = t < 0.2 ? 0 : (t - 0.2) / 0.8;
  const e = 1 - (1 - fall) * (1 - fall);
  const b = p.part('body');
  b.sy = 1 + 0.18 * swell - 1.06 * e;
  b.sx = 1 + 0.1 * swell + 0.85 * e;
  b.rot = 0.1 * e;
  p.part('tip').rot = 1.6 * e;
  p.part('footNear').rot = 1.3 * e;
  p.part('footFar').rot = -1.3 * e;
  p.part('footNear').x = 6 * e;
  p.part('footFar').x = -6 * e;
  p.part('dripFar').y = 8 * e;
  p.part('dripNear').y = 8 * e;
  p.part('hips').y = 6 * e;
}

export const thrumAnimator: Animator = (p, a) => {
  switch (a.state) {
    case 'spawn':
      spawn(p, a);
      return 60;
    case 'move':
      move(p, a);
      return 24;
    case 'windup':
      windup(p, a);
      return 55;
    case 'attack':
      attack(p, a);
      return 70;
    case 'recover':
      recover(p, a);
      return 40;
    case 'hurt':
      hurt(p, a);
      return 60;
    case 'stun':
      stun(p, a);
      return 30;
    case 'launched':
      launched(p, a);
      return 50;
    case 'dead':
      dead(p, a);
      return 60;
    default:
      idle(p, a);
      return 14;
  }
};

/** What the registry gathers: this file is the whole of the rig, and nothing else lists it. */
const ENTRY: RigEntry = { def: THRUM_RIG, animator: thrumAnimator, required: ENEMY_STATES, variants: {} };
export default ENTRY;
