// The Edge, the Sword Returner: a long slate coat and a tuning-fork blade held low.
// Pixi-free: a RigDef plus a pure animator, on the shared hero skeleton. This file is the
// pattern the other two heroes follow.
import { HERO, PLAYER_COLORS, RIM } from '../palette';
import { block, ell, flat, smooth, stroke } from './def';
import type { AnimInput, Animator, PartDef, PoseWriter, RigDef } from './def';
import { ARM_FAR_REST, ARM_LENGTH, ARM_NEAR_REST, HIPS_Y, armAngle, armPart, dashPose, downPose, ease, hurtPose, legPart, lerp, locomotion, pointArm } from './hero';
import { SWORD_STATES } from './states';

const palette: Record<string, number> = {
  coat: HERO.coat,
  coatShade: HERO.coatShade,
  dark: HERO.dark,
  darkShade: HERO.darkShade,
  skin: HERO.skin,
  skinShade: HERO.skinShade,
  steel: HERO.steel,
  steelShade: HERO.steelShade,
  rim: RIM,
  // the seat colour: the view replaces it per player
  accent: PLAYER_COLORS[0],
};

const coat = { fill: 'coat', shade: 'coatShade', rim: 'rim' };
const dark = { fill: 'dark', shade: 'darkShade', rim: 'rim' };

/** Rest rotation of the blade on the hand: with the arm hanging, the fork points forward and a little down. */
const BLADE_REST = -1.25;

const parts: PartDef[] = [
  { name: 'hips', x: 0, y: HIPS_Y, shapes: [] },
  {
    // the back of the long coat; it trails behind every movement
    name: 'tail',
    parent: 'hips',
    x: -3,
    y: -2,
    z: -3,
    shapes: [...block(smooth([-6, 0, 5, 0, 3, 23, -11, 21], 1), { fill: 'coatShade', rim: 'rim', rimWidth: 1.2 })],
  },
  legPart('legFar', -4, -2, dark, dark),
  legPart('legNear', 4, -1, dark, dark),
  {
    // the front of the coat, over the thighs
    name: 'skirt',
    parent: 'hips',
    x: 0,
    y: -2,
    z: 1,
    shapes: [...block(smooth([-9, 0, 9.5, 0, 12, 19, 3, 21, -10.5, 18], 1), { fill: 'coat', shade: 'coatShade', shadeFrom: 0.5 })],
  },
  {
    name: 'torso',
    parent: 'hips',
    x: 0,
    y: 0,
    z: 2,
    shapes: [
      ...block(smooth([-8.6, 3, 8.8, 3, 10.4, -12, 9.2, -26, 4.5, -31.5, -4.5, -31.5, -9.2, -26, -10.4, -12], 1), { fill: 'coat', shade: 'coatShade', shadeFrom: 0.58, rim: 'rim', rimWidth: 1.8 }),
      // the sash carries the seat colour
      flat([-9.2, -4.5, 9.6, -4.5, 9.4, 1.5, -8.9, 1.5], 'accent'),
      flat([4, 1.5, 9, 1.5, 8, 11, 5, 9], 'accent', 1, 'front'),
      stroke([2, -30, 5.5, -18, 3.5, -5], 1.6, 'dark', 0.8, 'front'),
      stroke([-5, -29, 0, -24, 5, -29], 1.4, 'dark', 0.6, 'back'),
    ],
  },
  {
    name: 'head',
    parent: 'torso',
    x: 1,
    y: -31,
    z: 3,
    shapes: [
      ...block(ell(0.5, -9, 8.4, 9.2, 18), { fill: 'skin', shade: 'skinShade', shadeFrom: 0.62, view: 'front' }),
      // hair swept back, and a band in the seat colour
      ...block(smooth([-9.4, -7, -8.4, -16, -1, -20.5, 7.2, -18, 9.8, -11.5, 4, -14.2, -3, -12.5, -6.5, -5], 1), { fill: 'dark', rim: 'rim', rimWidth: 1.4, view: 'front' }),
      flat([-7.6, -12.4, 9.6, -11.6, 9.6, -9.6, -7.2, -10.2], 'accent', 1, 'front'),
      flat(ell(5.2, -7.6, 1.3, 1.7, 8), 'dark', 1, 'front'),
      ...block(ell(-0.3, -9.6, 9, 9.8, 18), { fill: 'dark', shade: 'darkShade', shadeFrom: 0.6, rim: 'rim', rimWidth: 1.4, view: 'back' }),
      flat([-9, -12.4, 8.4, -12.4, 8.4, -10.2, -9, -10.2], 'accent', 1, 'back'),
      flat(smooth([-9, -10.5, -15, -7, -17, -1, -12, -5], 1), 'accent', 1),
    ],
  },
  armPart('armFar', -6.8, -1, ARM_FAR_REST, coat, 'skin'),
  armPart('armNear', 7, 4, ARM_NEAR_REST, coat, 'skin'),
  {
    // a tuning fork for a blade: a grip, a crosspiece in the seat colour, two long tines
    name: 'blade',
    parent: 'armNear',
    x: 0,
    y: ARM_LENGTH,
    z: -1,
    rot: BLADE_REST,
    shapes: [
      flat([-1.7, -6, 1.7, -6, 1.7, 5, -1.7, 5], 'dark'),
      flat([-5.8, 4, 5.8, 4, 5.2, 7.4, -5.2, 7.4], 'accent'),
      ...block([-3.8, 7, 3.8, 7, 3.8, 14, -3.8, 14], { fill: 'steel', shade: 'steelShade', shadeFrom: 0.5 }),
      ...block([-3.8, 13, -1.2, 13, -1.2, 51, -2.5, 55, -3.8, 51], { fill: 'steel', rim: 'rim', rimWidth: 1.2 }),
      ...block([1.2, 13, 3.8, 13, 3.8, 51, 2.5, 55, 1.2, 51], { fill: 'steelShade', rim: 'rim', rimWidth: 1.2 }),
    ],
  },
];

export const EDGE_RIG: RigDef = {
  id: 'edge',
  parts,
  palette,
  footprint: 0.34,
  height: 96,
  states: SWORD_STATES,
};

/** Point the fork along `angle` in rig space, whatever the arm is doing. */
function pointBlade(p: PoseWriter, angle: number): void {
  p.part('blade').rot = angle - armAngle(p, 'armNear') - BLADE_REST;
}

/** The coat follows late: tail and skirt swing against the stride and stream behind a run. */
function coatFollow(p: PoseWriter, a: AnimInput): void {
  const run = Math.min(1, a.speed);
  const s = Math.sin(a.stride * 4.6 + a.seed - 0.9);
  p.part('tail').rot = (0.5 * run + s * 0.14 * run) * a.forward + Math.sin(a.time * 1.7) * 0.03;
  p.part('skirt').rot = (0.12 * run - s * 0.08 * run) * a.forward;
}

/** At ease: the fork held low and forward, humming very slightly. */
function carry(p: PoseWriter, a: AnimInput): void {
  const run = Math.min(1, a.speed);
  const sway = Math.sin(a.time * 2.1 + a.seed * 6.283) * 0.04;
  pointArm(p, 'armNear', 1.2 + sway - 0.25 * run);
  pointBlade(p, 0.42 + sway * 2 - 0.2 * run);
}

/** Where each swing starts and ends, as angles either side of the aim. */
const SWINGS: ReadonlyArray<readonly [number, number]> = [
  [1.35, -1.3],
  [-1.35, 1.3],
  [-2.0, 1.75],
];
/** Share of a swing spent winding up, and the point at which the blade has passed. */
const WIND = 0.24;
const PASSED = 0.52;

function swing(p: PoseWriter, a: AnimInput): void {
  const v = a.variant >= 0 && a.variant < SWINGS.length ? a.variant : 0;
  const from = a.aim + SWINGS[v][0];
  const to = a.aim + SWINGS[v][1];
  const big = v === 2;
  const t = a.phase;
  let angle: number;
  let through: number;
  if (t < WIND) {
    const u = ease(t / WIND);
    angle = lerp(1.2, from, u);
    through = 0;
  } else if (t < PASSED) {
    through = (t - WIND) / (PASSED - WIND);
    angle = lerp(from, to, through);
  } else {
    const r = ease((t - PASSED) / (1 - PASSED));
    // carries past the end, then comes back to the carry
    angle = lerp(to + (to - from) * 0.12 * (1 - r), 1.2, r * r);
    through = 1;
  }
  const dirSign = to > from ? 1 : -1;
  const torso = p.part('torso');
  const lean = t < WIND ? -ease(t / WIND) : t < PASSED ? -1 + 2 * through : 1 - ease((t - PASSED) / (1 - PASSED));
  torso.rot += 0.2 * lean * dirSign + (big ? 0.12 : 0.05);
  pointArm(p, 'armNear', angle);
  // the fork runs on from the arm, leading it a little through the cut
  pointBlade(p, angle + dirSign * (t >= WIND && t < PASSED ? 0.22 : 0.05));
  // behind the body on a back-swing, in front for the cut
  const behind = Math.cos(angle) < -0.25;
  p.part('armNear').z = behind ? -6 : 0;
  // the off hand balances
  pointArm(p, 'armFar', a.aim + Math.PI - 0.7 * lean * dirSign);
  // a committed step, unless the feet are already running
  const still = 1 - Math.min(1, a.speed);
  const step = t < PASSED ? ease(t / PASSED) : 1 - ease((t - PASSED) / (1 - PASSED));
  p.part('hips').x += 3.5 * step;
  p.part('hips').y += (big ? -4 * Math.sin(Math.min(1, t / PASSED) * Math.PI) : 0) + 2 * step;
  p.part('legNear').rot += -0.5 * step * still;
  p.part('legFar').rot += 0.42 * step * still;
  p.part('head').rot -= 0.1 * lean * dirSign;
  p.part('tail').rot += 0.5 * step;
}

/** The Riposte: the fork upright in both hands, weight low, ringing. */
function guard(p: PoseWriter, a: AnimInput): void {
  const set = ease(Math.min(1, a.t / 0.06));
  const ring = Math.sin(a.t * 60) * 0.02;
  p.part('hips').y += 3 * set;
  p.part('torso').rot += -0.1 * set;
  pointArm(p, 'armNear', lerp(1.2, a.aim - 0.45, set));
  pointBlade(p, lerp(0.42, -Math.PI / 2 + 0.12 + ring, set));
  pointArm(p, 'armFar', lerp(1.6, a.aim - 0.15, set));
  p.part('armFar').z = 6 * set;
  p.part('legNear').rot += -0.3 * set;
  p.part('legFar').rot += 0.3 * set;
}

/** A guard that caught nothing: the fork drops, the shoulders with it. */
function open(p: PoseWriter, a: AnimInput): void {
  const k = 1 - ease(a.phase);
  p.part('torso').rot += 0.22 * k;
  p.part('head').rot += 0.2 * k;
  pointArm(p, 'armNear', lerp(1.2, 1.45, k));
  pointBlade(p, lerp(0.42, 1.2, k));
  p.part('hips').y += 2 * k;
}

export const edgeAnimator: Animator = (p, a) => {
  if (a.state === 'down') {
    downPose(p, a);
    // leaning on the fork, its tines on the floor
    pointArm(p, 'armNear', 0.85);
    pointBlade(p, 1.45);
    p.part('tail').rot = 0.6;
    return 16;
  }
  if (a.state === 'dash') {
    dashPose(p, a);
    pointBlade(p, 2.9);
    p.part('tail').rot = 1.0;
    p.part('skirt').rot = 0.3;
    return 50;
  }
  locomotion(p, a);
  coatFollow(p, a);
  carry(p, a);
  switch (a.state) {
    case 'attack':
      swing(p, a);
      return 70;
    case 'guard':
      guard(p, a);
      return 60;
    case 'special':
      open(p, a);
      return 30;
    case 'hurt':
      hurtPose(p, a);
      pointBlade(p, 1.0);
      return 60;
    default:
      return a.state === 'run' ? 26 : 16;
  }
};
