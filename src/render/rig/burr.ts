// The Burr: a round seed-pod bristling with spikes, on two stub legs, that lobs bombs.
// Geometric: the body is a star made by a loop, the bomb a disc with a smaller star for its cap.
// Wind-up: it heaves a bomb up over its head. Attack: it whips forward and lets go.
import { ECHO, RIM, ZONES } from '../palette';
import { block, ell, flat } from './def';
import type { AnimInput, Animator, PartDef, PoseWriter, RigDef } from './def';
import { capsule, star } from './solids';
import { ENEMY_STATES } from './states';

const palette: Record<string, number> = {
  ink: ZONES.outer.inkWash,
  inkDark: ZONES.outer.inkDark,
  rim: RIM,
  eye: ECHO.eye,
  pupil: ECHO.pupil,
  bomb: ECHO.bomb,
  bombShade: ECHO.bombShade,
  fuse: ECHO.fuse,
};

const SPIKES = 11;
const R = 21;

const leg = (name: string, x: number, z: number): PartDef => ({
  name,
  parent: 'hips',
  x,
  y: 0,
  z,
  shapes: [...block(capsule(0, 0, 2, 8, 3.6, 4.4), { fill: 'ink', shade: 'inkDark', shadeFrom: 0.5, rim: 'rim', rimWidth: 1.2 })],
});

const arm = (name: string, x: number, z: number): PartDef => ({
  name,
  parent: 'body',
  x,
  y: -20,
  z,
  shapes: [...block(capsule(0, 0, 0, 15, 3.4, 4.2), { fill: 'ink', shade: 'inkDark', shadeFrom: 0.55, rim: 'rim', rimWidth: 1.2 })],
});

const parts: PartDef[] = [
  { name: 'hips', x: 0, y: -8, shapes: [] },
  leg('legFar', -7, -2),
  leg('legNear', 7, -1),
  {
    name: 'body',
    parent: 'hips',
    x: 0,
    y: 2,
    z: 1,
    shapes: [
      // the spikes: one star behind, a second turned half a step, so the outline bristles
      flat(star(0, -20, R + 5, R - 5, SPIKES, 0.2), 'inkDark'),
      ...block(star(0, -20, R + 2, R - 3, SPIKES, 0.2 + Math.PI / SPIKES), { fill: 'ink', shade: 'inkDark', shadeFrom: 0.62, rim: 'rim', rimWidth: 1.6 }),
      flat(ell(0, -20, R - 6, R - 6.5, 20), 'ink'),
      // one bright eye, and from behind only a glint
      flat(ell(7, -23, 6.4, 7, 14), 'eye', 1, 'front'),
      flat(ell(9.4, -22.5, 2.7, 3.4, 10), 'pupil', 1, 'front'),
      flat(ell(-5, -25, 2.2, 3, 8), 'rim', 0.35, 'back'),
    ],
  },
  arm('armFar', -15, -1),
  arm('armNear', 15, 2),
  {
    // the bomb it is about to throw: nothing until the wind-up produces it
    name: 'bomb',
    parent: 'body',
    x: 0,
    y: -52,
    z: 3,
    shapes: [
      ...block(ell(0, 0, 9, 9, 16), { fill: 'bomb', shade: 'bombShade', shadeFrom: 0.5, rim: 'rim', rimWidth: 1.4 }),
      flat(star(0, -9.5, 4.2, 2, 5, -Math.PI / 2), 'fuse'),
    ],
  },
];

export const BURR_RIG: RigDef = {
  id: 'burr',
  parts,
  palette,
  footprint: 0.36,
  height: 50,
  states: ENEMY_STATES,
};

const sin = Math.sin;

/** Squash and stretch that keeps the pod's volume. */
function squash(p: PoseWriter, k: number): void {
  const b = p.part('body');
  b.sy = 1 - k;
  b.sx = 1 / Math.max(0.3, 1 - k * 0.7);
}

/** The bomb is gone unless a state says otherwise. */
function noBomb(p: PoseWriter): void {
  const b = p.part('bomb');
  b.sx = 0.001;
  b.sy = 0.001;
}

function arms(p: PoseWriter, near: number, far: number): void {
  p.part('armNear').rot = near;
  p.part('armFar').rot = far;
}

function idle(p: PoseWriter, a: AnimInput): void {
  // bristles rise and settle like breathing
  const br = sin(a.time * 2.4 + a.seed * 6.283);
  squash(p, br * 0.04);
  p.part('body').rot = sin(a.time * 1.3 + a.seed * 3) * 0.08;
  arms(p, -0.25 + br * 0.08, 0.25 - br * 0.08);
  p.part('hips').y = br * 0.6;
}

function move(p: PoseWriter, a: AnimInput): void {
  // a rolling waddle: the whole pod rocks from foot to foot
  const ph = a.stride * 5 + a.seed * 6.283;
  const s = sin(ph);
  p.part('legNear').rot = s * 0.7;
  p.part('legFar').rot = -s * 0.7;
  p.part('legNear').y = -Math.max(0, s) * 3;
  p.part('legFar').y = -Math.max(0, -s) * 3;
  p.part('body').rot = s * 0.2;
  p.part('hips').y = -Math.abs(Math.cos(ph)) * 2.6;
  arms(p, -0.3 - s * 0.4, 0.3 - s * 0.4);
}

function spawn(p: PoseWriter, a: AnimInput): void {
  const t = a.phase;
  const rise = t < 0.7 ? t / 0.7 : 1;
  const over = t < 0.7 ? 0 : sin(((t - 0.7) / 0.3) * Math.PI) * 0.14;
  const b = p.part('body');
  b.sy = 0.08 + 0.92 * rise * rise + over;
  b.sx = 1.5 - 0.5 * rise - over * 0.6;
  b.rot = (1 - rise) * 1.6;
  const legs = t < 0.55 ? 0.01 : Math.min(1, (t - 0.55) / 0.25);
  p.part('legNear').sy = legs;
  p.part('legFar').sy = legs;
  arms(p, -1.2 * (1 - rise), 1.2 * (1 - rise));
}

function windup(p: PoseWriter, a: AnimInput): void {
  // Heaves a bomb up over its head, leaning back; the bomb swells out of nothing in its hands.
  const t = a.phase;
  const e = 1 - (1 - t) * (1 - t);
  const grow = Math.min(1, t / 0.33);
  const bomb = p.part('bomb');
  bomb.sx = bomb.sy = 0.001 + 0.999 * grow * (1 + 0.08 * sin(a.t * 40) * t);
  bomb.y = 10 * (1 - e);
  bomb.rot = sin(a.t * 30) * 0.1 * t;
  arms(p, -2.6 * e - 0.3, 2.6 * e + 0.3);
  const b = p.part('body');
  b.rot = -0.3 * e + sin(a.t * 60) * 0.03 * t;
  b.x = -3 * e;
  squash(p, 0.1 * e);
  p.part('hips').y = 2 * e;
  p.part('legNear').rot = -0.3 * e;
  p.part('legFar').rot = 0.25 * e;
}

function attack(p: PoseWriter, a: AnimInput): void {
  // The throw: the whole pod whips forward. The bomb in the air is the game's now.
  const t = a.phase;
  const whip = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
  const b = p.part('body');
  b.rot = 0.55 * whip - 0.1;
  b.x = 7 * whip;
  squash(p, -0.12 * whip);
  arms(p, -2.6 + 3.6 * Math.min(1, t / 0.4), 2.6 - 2.2 * Math.min(1, t / 0.4));
  p.part('legNear').rot = 0.5 * whip;
  p.part('hips').y = -3 * whip;
}

function recover(p: PoseWriter, a: AnimInput): void {
  // arms hanging, wobbling: open
  const t = a.phase;
  const wob = sin(a.t * 15) * Math.exp(-a.t * 4);
  squash(p, 0.12 * (1 - t) + wob * 0.1);
  p.part('body').rot = 0.25 * (1 - t) + wob * 0.15;
  arms(p, 0.5 * (1 - t) + wob * 0.6, 0.2 * (1 - t) + wob * 0.6);
  p.part('hips').y = 2 * (1 - t);
}

function hurt(p: PoseWriter, a: AnimInput): void {
  const k = Math.max(0, 1 - a.t / 0.2);
  const b = p.part('body');
  b.x = -6 * k;
  b.rot = -0.5 * k;
  squash(p, -0.16 * k);
  arms(p, 1.1 * k, -1.1 * k);
  p.part('hips').y = -3 * k;
}

function stun(p: PoseWriter, a: AnimInput): void {
  const s = sin(a.t * 7);
  squash(p, 0.14 + s * 0.02);
  p.part('body').rot = s * 0.22;
  arms(p, 0.3 + s * 0.3, -0.3 + s * 0.3);
  p.part('legNear').rot = 0.2;
  p.part('legFar').rot = -0.2;
}

function launched(p: PoseWriter, a: AnimInput): void {
  // a ball that has lost its footing: limbs splayed, spikes shivering
  const w = sin(a.t * 28 + a.seed * 6.283);
  squash(p, -0.06 + w * 0.05);
  p.part('body').rot = w * 0.12;
  arms(p, -1.5 + w * 0.5, 1.5 + w * 0.5);
  p.part('legNear').rot = 1.0 + w * 0.4;
  p.part('legFar').rot = -1.0 - w * 0.4;
  p.part('legNear').y = -2;
  p.part('legFar').y = -2;
}

function dead(p: PoseWriter, a: AnimInput): void {
  // swells, then bursts flat
  const t = Math.min(1, a.t / 0.42);
  const swell = t < 0.25 ? t / 0.25 : 1;
  const fall = t < 0.25 ? 0 : (t - 0.25) / 0.75;
  const e = 1 - (1 - fall) * (1 - fall);
  const b = p.part('body');
  b.sy = 1 + 0.22 * swell - 1.1 * e;
  b.sx = 1 + 0.12 * swell + 0.8 * e;
  b.rot = 0.3 * e;
  arms(p, 1.4 * e, -1.4 * e);
  p.part('legNear').rot = 1.3 * e;
  p.part('legFar').rot = -1.3 * e;
  p.part('hips').y = 5 * e;
}

export const burrAnimator: Animator = (p, a) => {
  if (a.state !== 'windup') noBomb(p);
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
