// The Edge, the Sword Returner: a long slate coat and a tuning-fork blade held low.
// Pixi-free: a RigDef plus a pure animator, on the shared hero skeleton. This file is the
// pattern the other two heroes follow.
import { HERO, PLAYER_COLORS, RIM } from '../../palette';
import { block, ell, flat, smooth, stroke } from '../def';
import type { AnimInput, Animator, PartDef, PoseWriter, RigDef, RigEntry } from '../def';
import { ARM_FAR_REST, ARM_LENGTH, ARM_NEAR_REST, HIPS_Y, armAngle, armPart, dashPose, downPose, ease, hurtPose, legPart, lerp, locomotion, pointArm } from '../hero';
import { HERO_STATES } from '../states';

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
  states: HERO_STATES,
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

/**
 * The three cuts of the combo. Each is a different move, so a run of them reads as one, two,
 * three: a rising cut from the hip, its answer coming down through the same line with the body
 * folding over it, and a leap that ends with the fork driven at the floor.
 */
interface Cut {
  /** Where the blade starts and ends, as angles either side of the aim (negative is up). */
  from: number;
  to: number;
  /** How far the body throws itself into it, in radians of the torso. */
  lean: number;
  /** How far the hips sink in the wind-up and on landing, and how high they rise through the cut, in pixels. */
  sink: number;
  hop: number;
  /** How far the step carries, in pixels. */
  step: number;
  /** The share of the move spent winding up, and the point at which the blade has passed. */
  wind: number;
  passed: number;
  /** Both hands on the hilt. */
  twoHands: boolean;
}
const CUTS: readonly Cut[] = [
  { from: 1.9, to: -1.25, lean: 0.22, sink: 2, hop: 0, step: 4, wind: 0.22, passed: 0.5, twoHands: false },
  { from: -1.75, to: 1.6, lean: 0.36, sink: 5, hop: 0, step: 6.5, wind: 0.22, passed: 0.5, twoHands: false },
  { from: -2.75, to: 1.75, lean: 0.55, sink: 8, hop: 15, step: 10, wind: 0.36, passed: 0.6, twoHands: true },
];

function swing(p: PoseWriter, a: AnimInput): void {
  const c = CUTS[a.variant >= 0 && a.variant < CUTS.length ? a.variant : 0];
  const from = a.aim + c.from;
  const to = a.aim + c.to;
  const t = a.phase;
  const dirSign = c.to > c.from ? 1 : -1;
  let angle: number;
  /** 0 before the cut, 0 to 1 through it, 1 after. */
  let through: number;
  /** -1 coiled back, +1 thrown forward. */
  let lean: number;
  /** How low the hips are, in pixels: positive is down. */
  let drop: number;
  if (t < c.wind) {
    const u = ease(t / c.wind);
    angle = lerp(1.2, from, u);
    through = 0;
    lean = -u;
    drop = c.sink * u;
  } else if (t < c.passed) {
    through = (t - c.wind) / (c.passed - c.wind);
    angle = lerp(from, to, through);
    lean = -1 + 2 * through;
    // up off the floor through the cut, and down hard at its end
    drop = c.sink * (1 - through) - c.hop * Math.sin(through * Math.PI) + c.sink * through * through;
  } else {
    const r = ease((t - c.passed) / (1 - c.passed));
    // the blade carries past the end and rings there, then comes back to the carry
    const ring = Math.sin((t - c.passed) * 70) * 0.05 * (1 - r);
    angle = lerp(to + (to - from) * 0.1 * (1 - r) + ring, 1.2, r * r);
    through = 1;
    lean = 1 - r;
    drop = c.sink * (1 - r);
  }
  const airborne = c.hop > 0 ? Math.sin(through * Math.PI) : 0;
  const torso = p.part('torso');
  torso.rot += c.lean * lean * dirSign + 0.05;
  pointArm(p, 'armNear', angle);
  // the fork runs on from the arm, leading it a little through the cut
  pointBlade(p, angle + dirSign * (through > 0 && through < 1 ? 0.22 : 0.05));
  // behind the body on a back-swing, in front for the cut
  const behind = Math.cos(angle) < -0.25;
  p.part('armNear').z = behind ? -6 : 0;
  if (c.twoHands) {
    // both hands on the hilt for the big one
    pointArm(p, 'armFar', angle + 0.14);
    p.part('armFar').z = behind ? -7 : 5;
  } else {
    // the off hand balances
    pointArm(p, 'armFar', a.aim + Math.PI - 0.7 * lean * dirSign);
  }
  // a committed step, unless the feet are already running
  const still = 1 - Math.min(1, a.speed);
  const step = t < c.passed ? ease(t / c.passed) : 1 - ease((t - c.passed) / (1 - c.passed));
  p.part('hips').x += c.step * step;
  p.part('hips').y += drop;
  p.part('legNear').rot += (-0.5 * step - 0.5 * airborne) * still;
  p.part('legFar').rot += (0.42 * step + 0.6 * airborne) * still;
  p.part('head').rot -= 0.1 * lean * dirSign;
  p.part('tail').rot += 0.5 * step + 0.6 * airborne;
}

/**
 * The Whirlwind. The view turns the whole figure (it shows each side of the Sword in turn as the
 * blade goes round); this is the shape the Sword holds while it does. The move is told in three
 * parts of its phase: coiled with the blade drawn back across the body, flung wide with the fork
 * level at arm's length and the coat flying, and settling back to the carry.
 */
export const WHIRL_COILED = 0.2;
export const WHIRL_ROUND = 0.8;

function whirl(p: PoseWriter, a: AnimInput): void {
  const t = a.phase;
  const coil = t < WHIRL_COILED ? ease(t / WHIRL_COILED) : 0;
  const wide = t < WHIRL_COILED ? 0 : t < WHIRL_ROUND ? 1 : 1 - ease((t - WHIRL_ROUND) / (1 - WHIRL_ROUND));
  // the steel sings while it is out
  const ring = Math.sin(a.t * 70) * 0.03 * wide;
  p.part('hips').y += 4 * coil + 2.5 * wide;
  p.part('torso').rot += -0.3 * coil + 0.2 * wide;
  p.part('head').rot += 0.12 * coil - 0.08 * wide;
  pointArm(p, 'armNear', lerp(lerp(1.2, 2.6, coil), 0.06, wide));
  pointBlade(p, lerp(lerp(0.42, 2.9, coil), 0.02 + ring, wide));
  p.part('armNear').z = coil > 0.5 ? -6 : 0;
  // the off arm thrown out behind for balance
  pointArm(p, 'armFar', lerp(lerp(1.6, 0.9, coil), Math.PI - 0.15, wide));
  // one foot planted and the other trailing round, unless the feet are already running
  const still = 1 - 0.5 * Math.min(1, a.speed);
  p.part('legNear').rot += (-0.25 * coil - 0.42 * wide) * still;
  p.part('legFar').rot += (0.2 * coil + 0.5 * wide) * still;
  p.part('tail').rot += 0.3 * coil + 1.1 * wide;
  p.part('skirt').rot += 0.35 * wide;
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
    case 'special':
      whirl(p, a);
      return 60;
    case 'hurt':
      hurtPose(p, a);
      pointBlade(p, 1.0);
      return 60;
    default:
      return a.state === 'run' ? 26 : 16;
  }
};

/** What the registry gathers: this file is the whole of the rig, and nothing else lists it. */
const ENTRY: RigEntry = { def: EDGE_RIG, animator: edgeAnimator, required: HERO_STATES, variants: { attack: [0, 1, 2] } };
export default ENTRY;
