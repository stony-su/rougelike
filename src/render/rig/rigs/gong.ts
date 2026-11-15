// The Gong: a squat Echo behind a broad brass disc. Blows that meet the disc do nothing, so
// what matters to the player is where the disc is: held square in front while it is on guard,
// drawn back and then thrust out in the bash, and hanging at its side while it recovers.
// Geometric: capsules, ellipses and one ring made by a loop.
import { ECHO, RIM, ZONES } from '../../palette';
import { GONG } from '../../palette/gong';
import { block, ell, flat } from '../def';
import type { AnimInput, Animator, PartDef, PoseWriter, RigDef, RigEntry } from '../def';
import { arcBand, capsule } from '../solids';
import { ENEMY_STATES } from '../states';

const palette: Record<string, number> = {
  ink: ZONES.outer.inkWash,
  inkDark: ZONES.outer.inkDark,
  rim: RIM,
  eye: ECHO.eye,
  pupil: ECHO.pupil,
  brass: GONG.brass,
  brassShade: GONG.brassShade,
  brassHot: GONG.brassHot,
  mallet: GONG.mallet,
  malletHead: GONG.malletHead,
};

const leg = (name: string, x: number, z: number): PartDef => ({
  name,
  parent: 'hips',
  x,
  y: 0,
  z,
  shapes: [...block(capsule(0, 0, 1, 9, 4.6, 5.4), { fill: 'ink', shade: 'inkDark', shadeFrom: 0.5, rim: 'rim', rimWidth: 1.2 })],
});

const parts: PartDef[] = [
  { name: 'hips', x: 0, y: -9, shapes: [] },
  leg('legFar', -8, -2),
  leg('legNear', 8, -1),
  {
    // a barrel of a body with a low dome of a head and one wary eye over the rim of the disc
    name: 'body',
    parent: 'hips',
    x: 0,
    y: 2,
    z: 1,
    shapes: [
      ...block(capsule(0, -8, 0, -30, 17, 14, 7), { fill: 'ink', shade: 'inkDark', shadeFrom: 0.58, rim: 'rim', rimWidth: 1.6 }),
      flat(arcBand(0, -19, 16.5, 0.15, Math.PI - 0.15, 3.2, 10), 'inkDark', 0.7),
      flat(ell(6, -38, 5.6, 6, 14), 'eye', 1, 'front'),
      flat(ell(8, -37.6, 2.3, 3, 10), 'pupil', 1, 'front'),
      flat(ell(-4, -39, 2, 2.6, 8), 'rim', 0.35, 'back'),
    ],
  },
  {
    // the mallet arm, on the far side
    name: 'mallet',
    parent: 'body',
    x: -15,
    y: -26,
    z: -1,
    shapes: [
      ...block(capsule(0, 0, -3, 15, 3.6, 4.2), { fill: 'ink', shade: 'inkDark', shadeFrom: 0.55, rim: 'rim', rimWidth: 1.2 }),
      flat(capsule(-3, 15, -9, -9, 1.6, 1.6, 3), 'mallet'),
      ...block(ell(-9.5, -12, 6, 6.4, 12), { fill: 'malletHead', shade: 'mallet', shadeFrom: 0.6, rim: 'rim', rimWidth: 1.1 }),
    ],
  },
  {
    // the disc: its ring, its face, the boss at its centre. From behind only its dark back shows.
    name: 'gong',
    parent: 'body',
    x: 17,
    y: -20,
    z: 3,
    shapes: [
      ...block(ell(0, 0, 15, 21, 26), { fill: 'brass', shade: 'brassShade', shadeFrom: 0.55, rim: 'rim', rimWidth: 1.8 }),
      flat(arcBand(0, 0, 13, 0, Math.PI * 2, 2.2, 28), 'brassShade', 0.8, 'front'),
      flat(ell(0, 0, 5.4, 7.4, 14), 'brassHot', 1, 'front'),
      flat(ell(-1.4, -6, 3.4, 9, 12), 'brassHot', 0.25, 'front'),
      flat(ell(0, 0, 12, 17.5, 22), 'brassShade', 0.85, 'back'),
    ],
  },
];

export const GONG_RIG: RigDef = {
  id: 'gong',
  parts,
  palette,
  footprint: 0.45,
  height: 56,
  states: ENEMY_STATES,
};

const sin = Math.sin;

/** Where the disc is held: how far out in front, how far it hangs, and how it is turned. */
function disc(p: PoseWriter, out: number, drop: number, rot: number): void {
  const g = p.part('gong');
  g.x = out;
  g.y = drop;
  g.rot = rot;
}

function squash(p: PoseWriter, k: number): void {
  const b = p.part('body');
  b.sy = 1 - k;
  b.sx = 1 + k * 0.6;
}

function idle(p: PoseWriter, a: AnimInput): void {
  const br = sin(a.time * 2 + a.seed * 6.283);
  squash(p, br * 0.03);
  disc(p, br * 0.8, 0, br * 0.03);
  p.part('mallet').rot = 0.2 + br * 0.06;
}

function move(p: PoseWriter, a: AnimInput): void {
  // a heavy march behind the disc, which never leaves the front
  const ph = a.stride * 4.2 + a.seed * 6.283;
  const s = sin(ph);
  p.part('legNear').rot = s * 0.6;
  p.part('legFar').rot = -s * 0.6;
  p.part('legNear').y = -Math.max(0, s) * 3;
  p.part('legFar').y = -Math.max(0, -s) * 3;
  p.part('hips').y = -Math.abs(Math.cos(ph)) * 2;
  p.part('body').rot = s * 0.07;
  disc(p, 1, Math.abs(s) * 1.4, -s * 0.05);
  p.part('mallet').rot = 0.2 - s * 0.3;
}

function spawn(p: PoseWriter, a: AnimInput): void {
  const t = a.phase;
  const rise = t < 0.75 ? t / 0.75 : 1;
  const b = p.part('body');
  b.sy = 0.1 + 0.9 * rise * rise;
  b.sx = 1.4 - 0.4 * rise;
  const g = p.part('gong');
  g.sx = g.sy = 0.2 + 0.8 * rise;
  disc(p, -8 * (1 - rise), 10 * (1 - rise), 1.2 * (1 - rise));
  const legs = t < 0.5 ? 0.01 : Math.min(1, (t - 0.5) / 0.3);
  p.part('legNear').sy = legs;
  p.part('legFar').sy = legs;
}

function windup(p: PoseWriter, a: AnimInput): void {
  // the disc is drawn back against the chest and the mallet goes up: it is about to strike with the lot
  const t = a.phase;
  const e = 1 - (1 - t) * (1 - t);
  disc(p, -9 * e, -4 * e, -0.25 * e + sin(a.t * 50) * 0.03 * t);
  p.part('mallet').rot = -2.2 * e;
  const b = p.part('body');
  b.rot = -0.22 * e;
  b.x = -4 * e;
  squash(p, 0.08 * e);
  p.part('legNear').rot = -0.3 * e;
  p.part('legFar').rot = 0.3 * e;
}

function attack(p: PoseWriter, a: AnimInput): void {
  // the bash: everything goes forward at once
  const t = a.phase;
  const out = t < 0.35 ? t / 0.35 : 1 - ((t - 0.35) / 0.65) * 0.4;
  disc(p, -9 + 27 * out, -4 + 2 * out, 0.12 * out);
  p.part('mallet').rot = -2.2 + 3.4 * Math.min(1, t / 0.35);
  const b = p.part('body');
  b.rot = 0.3 * out;
  b.x = 8 * out;
  squash(p, -0.08 * out);
  p.part('legNear').rot = 0.5 * out;
  p.part('hips').y = -2 * out;
}

function recover(p: PoseWriter, a: AnimInput): void {
  // spent: the disc hangs at its side, turned away. This is the opening.
  const t = a.phase;
  const hang = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
  const wob = sin(a.t * 9) * Math.exp(-a.t * 3);
  disc(p, 6 * hang, 15 * hang, 1.25 * hang + wob * 0.2);
  p.part('mallet').rot = 0.9 * hang + wob * 0.3;
  p.part('body').rot = 0.18 * hang + wob * 0.06;
  squash(p, 0.07 * hang);
}

function hurt(p: PoseWriter, a: AnimInput): void {
  const k = Math.max(0, 1 - a.t / 0.2);
  const b = p.part('body');
  b.x = -5 * k;
  b.rot = -0.35 * k;
  squash(p, -0.1 * k);
  disc(p, 2 * k, 4 * k, 0.5 * k);
}

function stun(p: PoseWriter, a: AnimInput): void {
  // guard gone: the disc swings loose and the eye rolls
  const s = sin(a.t * 6);
  squash(p, 0.1 + s * 0.02);
  p.part('body').rot = s * 0.16;
  disc(p, 4, 16, 1.3 + s * 0.25);
  p.part('mallet').rot = 1.0 + s * 0.3;
}

function launched(p: PoseWriter, a: AnimInput): void {
  const w = sin(a.t * 24 + a.seed * 6.283);
  squash(p, -0.05 + w * 0.04);
  p.part('body').rot = w * 0.14;
  disc(p, 5, 9, 0.9 + w * 0.4);
  p.part('mallet').rot = -1.4 + w * 0.5;
  p.part('legNear').rot = 0.9 + w * 0.3;
  p.part('legFar').rot = -0.9 - w * 0.3;
}

function dead(p: PoseWriter, a: AnimInput): void {
  // it folds, and the disc rolls flat with a last wobble
  const t = Math.min(1, a.t / 0.5);
  const e = 1 - (1 - t) * (1 - t);
  const b = p.part('body');
  b.sy = 1 - 0.85 * e;
  b.sx = 1 + 0.5 * e;
  b.rot = 0.4 * e;
  disc(p, 10 * e, 24 * e, 1.5 * e + sin(a.t * 18) * 0.12 * (1 - t));
  const g = p.part('gong');
  g.sy = 1 - 0.55 * e;
  p.part('mallet').rot = 1.6 * e;
  p.part('legNear').rot = 1.2 * e;
  p.part('legFar').rot = -1.2 * e;
  p.part('hips').y = 6 * e;
}

export const gongAnimator: Animator = (p, a) => {
  switch (a.state) {
    case 'spawn':
      spawn(p, a);
      return 60;
    case 'move':
      move(p, a);
      return 22;
    case 'windup':
      windup(p, a);
      return 50;
    case 'attack':
      attack(p, a);
      return 70;
    case 'recover':
      recover(p, a);
      return 30;
    case 'hurt':
      hurt(p, a);
      return 60;
    case 'stun':
      stun(p, a);
      return 30;
    case 'launched':
      launched(p, a);
      return 40;
    case 'dead':
      dead(p, a);
      return 50;
    default:
      idle(p, a);
      return 18;
  }
};

/** What the registry gathers: this file is the whole of the rig, and nothing else lists it. */
const ENTRY: RigEntry = { def: GONG_RIG, animator: gongAnimator, required: ENEMY_STATES, variants: {} };
export default ENTRY;
