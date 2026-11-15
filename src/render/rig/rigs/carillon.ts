// The Carillon: a walking frame of five bells. Two long legs carry a beam, the bells hang from
// the beam and swing with everything it does, and a single eye looks out from the middle of it.
// Three moves (the variant is the move): 0 the serve, when the frame rears back and the middle
// bell rings; 1 and 2 the slam, when it rises on its legs and drops.
// Geometric: capsules for the frame, a trapezoid and two ellipses for every bell, made by a loop.
import { ECHO, RIM } from '../../palette';
import { CARILLON } from '../../palette/carillon';
import { block, ell, flat } from '../def';
import type { AnimInput, Animator, PartDef, PoseWriter, RigDef, RigEntry } from '../def';
import { capsule, trapezoid } from '../solids';
import { ENEMY_STATES } from '../states';

const palette: Record<string, number> = {
  frame: CARILLON.frame,
  frameShade: CARILLON.frameShade,
  bronze: CARILLON.bronze,
  bronzeShade: CARILLON.bronzeShade,
  bronzeHot: CARILLON.bronzeHot,
  rim: RIM,
  eye: ECHO.eye,
  pupil: ECHO.pupil,
};

const BELLS = 5;
const SPAN = 74;
const BEAM_Y = -104;

const leg = (name: string, x: number, lean: number, z: number): PartDef => ({
  name,
  parent: 'hips',
  x,
  y: BEAM_Y + 4,
  z,
  shapes: [
    ...block(capsule(0, 0, lean, -BEAM_Y - 6, 5.5, 7.5, 5), { fill: 'frame', shade: 'frameShade', shadeFrom: 0.5, rim: 'rim', rimWidth: 1.5 }),
    flat(ell(lean, -BEAM_Y - 4, 11, 5, 12), 'frameShade'),
  ],
});

/** One bell on its rope, hanging from the beam. The middle one is the biggest. */
function bell(i: number): PartDef {
  const k = Math.abs(i - (BELLS - 1) / 2);
  const s = 1.25 - k * 0.16;
  const w = 13 * s;
  const h = 20 * s;
  return {
    name: `bell${i}`,
    parent: 'beam',
    x: (i - (BELLS - 1) / 2) * (SPAN / (BELLS - 1)) * 1.05,
    y: 6,
    z: 2 + i * 0.1,
    shapes: [
      flat(capsule(0, 0, 0, 8, 1, 1, 2), 'frameShade'),
      ...block(trapezoid(0, 8, 8 + h, w * 0.5, w), { fill: 'bronze', shade: 'bronzeShade', shadeFrom: 0.55, rim: 'rim', rimWidth: 1.3 }),
      flat(ell(0, 8 + h, w * 0.56, 3.2 * s, 12), 'bronzeShade'),
      flat(ell(-w * 0.18, 8 + h * 0.45, w * 0.12, h * 0.3, 8), 'bronzeHot', 0.5, 'front'),
      flat(ell(0, 8 + h + 3 * s, 2.6 * s, 2.6 * s, 8), 'bronzeHot'),
    ],
  };
}

const parts: PartDef[] = [
  { name: 'hips', x: 0, y: 0, shapes: [] },
  leg('legFar', -SPAN / 2, -12, -2),
  leg('legNear', SPAN / 2, 12, -1),
  {
    name: 'beam',
    parent: 'hips',
    x: 0,
    y: BEAM_Y,
    z: 1,
    shapes: [
      ...block(capsule(-SPAN / 2 - 8, 0, SPAN / 2 + 8, 0, 7, 7, 5), { fill: 'frame', shade: 'frameShade', shadeFrom: 0.5, rim: 'rim', rimWidth: 1.6 }),
      // the eye in the middle of the beam, and from behind a glint where it would be
      flat(ell(0, -1, 7.5, 6.2, 16), 'eye', 1, 'front'),
      flat(ell(1.5, -0.6, 3.2, 3.8, 10), 'pupil', 1, 'front'),
      flat(ell(0, -1, 3, 2.4, 8), 'rim', 0.3, 'back'),
    ],
  },
  ...Array.from({ length: BELLS }, (_, i) => bell(i)),
];

export const CARILLON_RIG: RigDef = {
  id: 'carillon',
  parts,
  palette,
  footprint: 0.9,
  height: 112,
  states: ENEMY_STATES,
};

const sin = Math.sin;

/** Swing every bell: `swing` radians at the widest, each a little out of step with the next. */
function ring(p: PoseWriter, a: AnimInput, swing: number, rate: number, middle = 0): void {
  for (let i = 0; i < BELLS; i++) {
    const b = p.part(`bell${i}`);
    b.rot = sin(a.time * rate + i * 1.3 + a.seed * 6.283) * swing + (i === 2 ? middle : 0);
  }
}

function legs(p: PoseWriter, near: number, far: number): void {
  p.part('legNear').rot = near;
  p.part('legFar').rot = far;
}

function idle(p: PoseWriter, a: AnimInput): void {
  ring(p, a, 0.1, 1.6);
  p.part('beam').y = sin(a.time * 1.6 + a.seed * 6.283) * 1.5;
}

function move(p: PoseWriter, a: AnimInput): void {
  // a stalking walk: one leg forward, then the other, and the bells clatter
  const s = sin(a.stride * 3.2 + a.seed * 6.283);
  legs(p, s * 0.16, -s * 0.16);
  p.part('legNear').y = -Math.max(0, s) * 5;
  p.part('legFar').y = -Math.max(0, -s) * 5;
  const beam = p.part('beam');
  beam.rot = s * 0.05;
  beam.y = -Math.abs(s) * 2.5;
  ring(p, a, 0.28, 5);
}

function spawn(p: PoseWriter, a: AnimInput): void {
  // it unfolds from the floor
  const t = a.phase;
  const rise = 1 - (1 - t) * (1 - t);
  const beam = p.part('beam');
  beam.y = (1 - rise) * 96;
  for (const name of ['legNear', 'legFar']) {
    const l = p.part(name);
    l.y = (1 - rise) * 96;
    l.sy = 0.05 + 0.95 * rise;
  }
  ring(p, a, 0.5 * (1 - rise), 9);
}

function windup(p: PoseWriter, a: AnimInput): void {
  const t = a.phase;
  const e = 1 - (1 - t) * (1 - t);
  const beam = p.part('beam');
  if (a.variant === 0) {
    // the serve: it rears back and the middle bell swings out to ring
    beam.rot = -0.16 * e;
    beam.x = -6 * e;
    legs(p, -0.08 * e, -0.05 * e);
    ring(p, a, 0.08, 3, -0.9 * e + sin(a.t * 26) * 0.12 * t);
  } else {
    // the slam: up on its legs, bells drawn in tight and shivering
    beam.y = -16 * e;
    legs(p, -0.07 * e, 0.07 * e);
    for (let i = 0; i < BELLS; i++) p.part(`bell${i}`).rot = sin(a.t * 40 + i) * 0.06 * t;
  }
}

function attack(p: PoseWriter, a: AnimInput): void {
  const t = a.phase;
  const beam = p.part('beam');
  if (a.variant === 0) {
    // the bell swings through and the frame follows it forward
    const out = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
    beam.rot = 0.2 * out;
    beam.x = 8 * out;
    ring(p, a, 0.1, 3, 1.1 * out);
  } else {
    // it drops, and everything rings at once
    const down = t < 0.3 ? t / 0.3 : 1;
    beam.y = -16 + 30 * down;
    legs(p, 0.14 * down, -0.14 * down);
    ring(p, a, 0.6 * (1 - t), 30);
  }
}

function recover(p: PoseWriter, a: AnimInput): void {
  const t = a.phase;
  const beam = p.part('beam');
  if (a.variant === 0) {
    ring(p, a, 0.3 * (1 - t), 7);
    beam.rot = 0.06 * (1 - t);
  } else {
    beam.y = 14 * (1 - t);
    legs(p, 0.14 * (1 - t), -0.14 * (1 - t));
    ring(p, a, 0.35 * (1 - t), 9);
  }
}

function hurt(p: PoseWriter, a: AnimInput): void {
  const k = Math.max(0, 1 - a.t / 0.22);
  const beam = p.part('beam');
  beam.x = -5 * k;
  beam.rot = -0.1 * k;
  ring(p, a, 0.12 + 0.5 * k, 14);
}

function stun(p: PoseWriter, a: AnimInput): void {
  const s = sin(a.t * 5);
  p.part('beam').rot = s * 0.09;
  p.part('beam').y = 8;
  legs(p, 0.1, -0.1);
  ring(p, a, 0.4, 5);
}

function launched(p: PoseWriter, a: AnimInput): void {
  const s = sin(a.t * 20 + a.seed * 6.283);
  p.part('beam').rot = 0.2 + s * 0.06;
  legs(p, 0.3 + s * 0.1, -0.3 - s * 0.1);
  ring(p, a, 0.7, 16);
}

function dead(p: PoseWriter, a: AnimInput): void {
  // the legs give, the beam comes down, and the bells roll out flat
  const t = Math.min(1, a.t / 0.7);
  const e = 1 - (1 - t) * (1 - t);
  const beam = p.part('beam');
  beam.y = 88 * e;
  beam.rot = 0.2 * e;
  legs(p, 1.25 * e, -1.25 * e);
  p.part('legNear').sy = 1 - 0.5 * e;
  p.part('legFar').sy = 1 - 0.5 * e;
  for (let i = 0; i < BELLS; i++) {
    const b = p.part(`bell${i}`);
    b.rot = (i - 2) * 0.5 * e + sin(a.t * 18 + i) * 0.2 * (1 - t);
    b.sy = 1 - 0.3 * e;
  }
}

export const carillonAnimator: Animator = (p, a) => {
  switch (a.state) {
    case 'spawn':
      spawn(p, a);
      return 60;
    case 'move':
      move(p, a);
      return 18;
    case 'windup':
      windup(p, a);
      return 45;
    case 'attack':
      attack(p, a);
      return 70;
    case 'recover':
      recover(p, a);
      return 28;
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
      return 40;
    default:
      idle(p, a);
      return 16;
  }
};

/** What the registry gathers: this file is the whole of the rig, and nothing else lists it. */
const ENTRY: RigEntry = { def: CARILLON_RIG, animator: carillonAnimator, required: ENEMY_STATES, variants: { windup: [0, 1], attack: [0, 1], recover: [0, 1] } };
export default ENTRY;
