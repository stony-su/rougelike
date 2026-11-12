// The Chainman: wide-brimmed hat, long pale duster, satchel, banded ranging rod.
// Pixi-free: a RigDef plus a pure animator.
import { CHALK, HERO } from '../palette';
import { block, ell, flat, rrect, stroke } from './def';
import type { AnimInput, Animator, PartDef, PoseWriter, RigDef, ShapeDef } from './def';

const palette: Record<string, number> = {
  coat: HERO.coat,
  coatShade: HERO.coatShade,
  dark: HERO.dark,
  hat: HERO.hat,
  hatShade: HERO.hatShade,
  skin: HERO.skin,
  satchel: HERO.satchel,
  strap: HERO.strap,
  rodPale: HERO.rodPale,
  rodBand: HERO.rodBand,
  rim: HERO.rim,
  band: CHALK,
};

function rodShapes(): ShapeDef[] {
  // The rod hangs from the hand joint: 62 px above it, 30 px below, so its shoe rests near the ground. Alternating bands, a steel shoe.
  const shapes: ShapeDef[] = [];
  const top = -62;
  const bottom = 30;
  const bandH = (bottom - top) / 8;
  for (let i = 0; i < 8; i++) {
    const y0 = top + i * bandH;
    shapes.push(flat([-1.7, y0, 1.7, y0, 1.7, y0 + bandH + 0.3, -1.7, y0 + bandH + 0.3], i % 2 === 0 ? 'rodBand' : 'rodPale'));
  }
  shapes.push(flat([-1.9, bottom, 1.9, bottom, 0, bottom + 8], 'dark'));
  shapes.push(flat([-2.4, top - 3, 2.4, top - 3, 2.4, top, -2.4, top], 'dark'));
  return shapes;
}

const leg = (name: string, x: number, z: number): PartDef => ({
  name,
  parent: 'hips',
  x,
  y: 0,
  z,
  shapes: [
    flat([-4, -1, 4, -1, 3.4, 25, -3.4, 25], 'dark'),
    // boot, toe forward
    flat([-4.4, 23, 4.6, 23, 9.5, 31, 9.5, 33, -4.4, 33], 'hatShade'),
    stroke([-4.4, 23, 4.6, 23], 1.4, 'rim', 0.5),
  ],
});

const arm = (name: string, x: number, z: number): PartDef => ({
  name,
  parent: 'torso',
  x,
  y: -32,
  z,
  shapes: [
    ...block([-4.2, -2, 4.2, -2, 3.3, 21, -3.3, 21], { fill: 'coat', shade: 'coatShade', shadeFrom: 0.5, rim: 'rim' }),
    flat([-3.6, 19, 3.6, 19, 3.6, 22, -3.6, 22], 'dark'),
    flat(ell(0, 24.5, 3.1, 3.1, 10), 'skin'),
  ],
});

const parts: PartDef[] = [
  { name: 'hips', x: 0, y: -33, shapes: [] },
  leg('legFar', -4.5, -3),
  leg('legNear', 4.5, -2),
  {
    name: 'skirt',
    parent: 'hips',
    x: 0,
    y: -3,
    z: 1,
    shapes: [
      ...block([-13, 0, 13, 0, 18, 25, 6, 27, 1, 24, -4, 27, -17, 25], {
        fill: 'coat',
        shade: 'coatShade',
        hatch: 'dark',
        shadeFrom: 0.4,
      }),
      stroke([1, 3, 1, 23], 1.2, 'dark', 0.45),
    ],
  },
  {
    name: 'torso',
    parent: 'hips',
    x: 0,
    y: -2,
    z: 2,
    shapes: [
      ...block([-12, -36, 12, -36, 14.5, -17, 13.5, 1, -13.5, 1, -14.5, -17], {
        fill: 'coat',
        shade: 'coatShade',
        hatch: 'dark',
        rim: 'rim',
        shadeFrom: 0.62,
      }),
      // open collar
      flat([-5.5, -36, 0, -22, 5.5, -36], 'dark', 1, 'front'),
      // back seam, seen from behind
      stroke([0, -34, 0, -2], 1.2, 'coatShade', 0.9, 'back'),
      // satchel strap and belt
      stroke([-10.5, -34, 11.5, -5], 2.6, 'strap', 1, 'front'),
      stroke([10.5, -34, -11.5, -5], 2.6, 'strap', 1, 'back'),
      flat([-13.8, -4, 13.8, -4, 13.6, 0.5, -13.6, 0.5], 'strap'),
      flat([-2.2, -4.4, 2.2, -4.4, 2.2, 1, -2.2, 1], 'band', 1, 'front'),
    ],
  },
  arm('armFar', -9.5, -1),
  {
    name: 'satchel',
    parent: 'torso',
    x: 9,
    y: -3,
    z: 1,
    shapes: [
      ...block(rrect(-7, -6, 13, 13, 2.5), { fill: 'satchel', shade: 'strap', shadeFrom: 0.5, rim: 'rim', rimWidth: 1.2 }),
      flat([-7, -6, 6, -6, 5, -1, -6, -1], 'strap'),
    ],
  },
  {
    name: 'head',
    parent: 'torso',
    x: 1,
    y: -37,
    z: 2,
    shapes: [
      flat([-3, -3, 3, -3, 3.4, 2, -3.4, 2], 'skin'),
      flat(ell(1.2, -8.5, 6.6, 7.4, 14), 'skin', 1, 'front'),
      flat(ell(5.4, -9.2, 1.1, 1.5, 6), 'dark', 1, 'front'),
      flat(ell(0, -8.5, 6.8, 7.4, 14), 'dark', 1, 'back'),
      // brim underside, then the brim, then the crown
      flat(ell(1, -12.4, 20, 6.4, 22), 'hatShade'),
      ...block(ell(1, -14.4, 21, 6.2, 24), { fill: 'hat', rim: 'rim', rimWidth: 1.5 }),
      ...block([-8.6, -15.2, 10.2, -15.2, 8.2, -29, -6.6, -29], { fill: 'hat', shade: 'hatShade', shadeFrom: 0.55, rim: 'rim', rimWidth: 1.5 }),
      flat([-8.9, -18.6, 10.4, -18.6, 10.2, -15.2, -8.6, -15.2], 'band'),
    ],
  },
  { ...arm('armNear', 9.5, 3) },
  { name: 'rod', parent: 'armNear', x: 0, y: 24, z: -1, shapes: rodShapes() },
];

export const CHAINMAN_STATES = ['idle', 'run', 'dash', 'swing', 'shot', 'plant', 'whip', 'hurt', 'dead'] as const;

export const CHAINMAN: RigDef = {
  id: 'chainman',
  parts,
  palette,
  footprint: 0.36,
  height: 100,
  states: CHAINMAN_STATES,
};

const sin = Math.sin;
const cos = Math.cos;

/** Stride cycles per tile travelled. */
const STRIDE = (Math.PI * 2) / 1.85;

function idle(p: PoseWriter, a: AnimInput): void {
  const b = sin(a.time * 2.1);
  const b2 = sin(a.time * 1.3 + 1);
  p.part('hips').y = b * 0.9;
  const torso = p.part('torso');
  torso.sy = 1 + b * 0.012;
  torso.rot = b2 * 0.012;
  p.part('head').rot = b2 * 0.03 - 0.02;
  p.part('armFar').rot = 0.1 + b * 0.03;
  p.part('armNear').rot = -0.12 - b * 0.02;
  p.part('rod').rot = 0.1 + b2 * 0.015;
  const skirt = p.part('skirt');
  skirt.rot = b2 * 0.02;
  skirt.sx = 1 + b * 0.01;
}

function run(p: PoseWriter, a: AnimInput): void {
  const ph = a.stride * STRIDE;
  const s = sin(ph);
  const c = cos(ph);
  const f = a.forward;
  const amp = Math.min(1, 0.35 + a.speed * 0.65);
  p.part('hips').y = -Math.abs(c) * 2.6 * amp + 1;
  p.part('legNear').rot = s * 0.78 * amp * f;
  p.part('legFar').rot = -s * 0.78 * amp * f;
  const torso = p.part('torso');
  torso.rot = 0.13 * f * amp + s * 0.025;
  torso.y = Math.abs(s) * 0.8;
  const head = p.part('head');
  head.rot = -0.06 * f * amp;
  head.y = Math.abs(c) * 0.7;
  p.part('armFar').rot = s * 0.62 * amp * f;
  p.part('armNear').rot = -0.32 - s * 0.16 * amp;
  p.part('rod').rot = 0.42 + s * 0.05;
  const skirt = p.part('skirt');
  skirt.rot = -0.11 * f * amp + s * 0.05;
  skirt.sx = 1 + Math.abs(s) * 0.05;
  p.part('satchel').rot = -s * 0.12;
}

function dash(p: PoseWriter, a: AnimInput): void {
  // A low lunge: launch off the back leg, legs scissor through the travel, front leg reaches to land.
  const t = a.phase;
  const into = Math.min(1, t / 0.18);
  const out = t > 0.7 ? (t - 0.7) / 0.3 : 0;
  const lean = into * (1 - out * 0.6);
  const scissor = -1 + 2 * t * t * (3 - 2 * t); // -1 at launch to +1 at landing
  p.part('hips').y = 5.5 * lean;
  p.part('torso').rot = 0.66 * lean;
  p.part('head').rot = -0.34 * lean;
  p.part('legNear').rot = scissor * 0.95;
  p.part('legFar').rot = -scissor * 0.8;
  p.part('armFar').rot = -1.15 * lean + 0.35 * out;
  p.part('armNear').rot = -1.5 * lean + 0.5 * out;
  p.part('rod').rot = 0.2 + 0.25 * out;
  const skirt = p.part('skirt');
  skirt.rot = -0.52 * lean;
  skirt.sx = 1 + 0.2 * lean;
  p.part('satchel').rot = -0.65 * lean;
}

/** Rotation that points the near arm (which hangs straight down at rest) along a rig-space angle. */
const armTo = (angle: number): number => angle - Math.PI / 2;

function swing(p: PoseWriter, a: AnimInput): void {
  // phase: 0..windupEnd wind-up, ..activeEnd strike, ..1 recovery. The sim supplies phase over the whole swing.
  const third = a.variant === 2;
  const wEnd = third ? 0.28 : 0.24;
  const aEnd = third ? 0.5 : 0.52;
  const dir = a.variant === 1 ? -1 : 1; // second swing comes back the other way
  const reachBack = third ? 2.1 : 1.6;
  const reachThrough = third ? 1.5 : 1.25;
  let armAngle: number;
  let twist: number;
  let lunge: number;
  if (a.phase < wEnd) {
    const t = a.phase / wEnd;
    const e = 1 - (1 - t) * (1 - t);
    armAngle = a.aim - dir * reachBack * e;
    twist = -0.22 * dir * e;
    lunge = -2.5 * e;
  } else if (a.phase < aEnd) {
    const t = (a.phase - wEnd) / (aEnd - wEnd);
    armAngle = a.aim - dir * reachBack + dir * (reachBack + reachThrough) * t;
    twist = -0.22 * dir + 0.5 * dir * t;
    lunge = -2.5 + 9 * t;
  } else {
    const t = (a.phase - aEnd) / (1 - aEnd);
    const e = t * t * (3 - 2 * t);
    armAngle = a.aim + dir * reachThrough * (1 - e * 0.75);
    twist = 0.28 * dir * (1 - e);
    lunge = 6.5 * (1 - e);
  }
  if (third && a.phase < wEnd) {
    // the hammer blow is raised overhead first
    armAngle = a.aim - 1.9 * (a.phase / wEnd);
  }
  const torso = p.part('torso');
  torso.rot = 0.1 + twist * 0.55;
  torso.x = lunge * 0.5;
  p.part('hips').y = 2.2;
  p.part('hips').x = lunge * 0.4;
  p.part('head').rot = -0.05 - twist * 0.3;
  p.part('armNear').rot = armTo(armAngle) - torso.rot;
  // The rod extends from the hand along the arm during a swing.
  p.part('rod').rot = Math.PI;
  p.part('rod').y = -6;
  p.part('armFar').rot = 0.5 - twist * 1.2;
  p.part('legNear').rot = -0.34;
  p.part('legFar').rot = 0.42;
  const skirt = p.part('skirt');
  skirt.rot = -twist * 0.5;
  skirt.sx = 1.08;
}

function shot(p: PoseWriter, a: AnimInput): void {
  // Underarm cast of the plumb bob with the far hand; the rod is planted like a staff.
  const t = a.phase;
  const wind = t < 0.35 ? t / 0.35 : 1;
  const rel = t < 0.35 ? 0 : Math.min(1, (t - 0.35) / 0.25);
  const settle = t < 0.6 ? 0 : (t - 0.6) / 0.4;
  const torso = p.part('torso');
  torso.rot = -0.12 * wind + 0.3 * rel - 0.18 * settle * rel;
  p.part('armFar').rot = armTo(a.aim) + 1.6 * (1 - rel) * wind - torso.rot + (1 - wind) * 1.3;
  p.part('armNear').rot = -0.35;
  p.part('rod').rot = 0.3;
  p.part('hips').y = 2 * wind - 1.5 * rel;
  p.part('legNear').rot = -0.25 * rel;
  p.part('legFar').rot = 0.3 * rel;
  p.part('head').rot = -0.06 * rel;
}

function plant(p: PoseWriter, a: AnimInput): void {
  // A quick stoop: one knee dips, the far hand goes to the ground.
  const k = sin(Math.min(1, a.phase) * Math.PI);
  p.part('hips').y = 7 * k;
  p.part('torso').rot = 0.35 * k;
  p.part('head').rot = -0.2 * k;
  p.part('armFar').rot = -0.5 * k;
  p.part('armNear').rot = -0.3;
  p.part('legNear').rot = -0.5 * k;
  p.part('legFar').rot = 0.35 * k;
  p.part('skirt').sx = 1 + 0.12 * k;
}

function whip(p: PoseWriter, a: AnimInput): void {
  // Haul on the chain: the far arm snaps from reaching out to pulled in tight.
  const t = Math.min(1, a.phase);
  const pull = t < 0.3 ? t / 0.3 : 1;
  const settle = t < 0.3 ? 0 : (t - 0.3) / 0.7;
  const torso = p.part('torso');
  torso.rot = 0.22 * (1 - pull) - 0.2 * pull * (1 - settle);
  p.part('armFar').rot = armTo(a.aim) * (1 - pull) + 0.9 * pull * (1 - settle) - torso.rot;
  p.part('armNear').rot = -0.3;
  p.part('hips').y = 2.5 * pull * (1 - settle);
  p.part('legNear').rot = 0.25 * pull * (1 - settle);
  p.part('legFar').rot = -0.3 * pull * (1 - settle);
  p.part('head').rot = 0.1 * pull * (1 - settle);
}

function hurt(p: PoseWriter, a: AnimInput): void {
  const k = Math.max(0, 1 - a.t / 0.28);
  const torso = p.part('torso');
  torso.rot = -0.42 * k;
  p.part('head').rot = 0.3 * k;
  p.part('hips').y = 3 * k;
  p.part('armFar').rot = 1.0 * k;
  p.part('armNear').rot = 0.7 * k - 0.2;
  p.part('legNear').rot = 0.3 * k;
  p.part('legFar').rot = -0.2 * k;
  p.part('skirt').rot = 0.3 * k;
}

function dead(p: PoseWriter, a: AnimInput): void {
  // Knees give, the body folds forward and settles; the hat tips off.
  const t = Math.min(1, a.t / 0.7);
  const e = 1 - (1 - t) * (1 - t);
  p.part('hips').y = 22 * e;
  const torso = p.part('torso');
  torso.rot = 1.35 * e;
  torso.y = 4 * e;
  const head = p.part('head');
  head.rot = 0.5 * e;
  head.x = 6 * e;
  p.part('armFar').rot = 1.9 * e;
  p.part('armNear').rot = 1.5 * e;
  p.part('rod').rot = 1.2 * e;
  p.part('legNear').rot = -1.3 * e;
  p.part('legFar').rot = -1.0 * e;
  p.part('skirt').rot = 0.6 * e;
  p.part('satchel').rot = 0.8 * e;
}

export const chainmanAnimator: Animator = (p, a) => {
  switch (a.state) {
    case 'run':
      run(p, a);
      return 26;
    case 'dash':
      dash(p, a);
      return 50;
    case 'swing':
      swing(p, a);
      return 70;
    case 'shot':
      shot(p, a);
      return 45;
    case 'plant':
      plant(p, a);
      return 40;
    case 'whip':
      whip(p, a);
      return 45;
    case 'hurt':
      hurt(p, a);
      return 40;
    case 'dead':
      dead(p, a);
      return 30;
    default:
      idle(p, a);
      return 16;
  }
};
