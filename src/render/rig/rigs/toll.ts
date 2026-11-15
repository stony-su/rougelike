// The Toll: the Bell itself. A great dark bell banded with gold, hanging from nothing, with a
// clapper that swings in its mouth and an eye that opens in its waist. It never walks: all of
// its movement is the swing of a bell. Two sets of poses (the variant): 0 it swings back and
// rings forward, for what it throws; 1 it rises and drops, for what it brings down on the floor.
// Geometric: a trapezoid and ellipses for the bell, bands made by a loop, a capsule and a ball.
import { ECHO, RIM } from '../../palette';
import { TOLL } from '../../palette/toll';
import { block, ell, flat } from '../def';
import type { AnimInput, Animator, PartDef, PoseWriter, RigDef, RigEntry } from '../def';
import { arcBand, capsule, trapezoid } from '../solids';
import { ENEMY_STATES } from '../states';

const palette: Record<string, number> = {
  bronze: TOLL.bronze,
  bronzeShade: TOLL.bronzeShade,
  gold: TOLL.gold,
  goldShade: TOLL.goldShade,
  goldHot: TOLL.goldHot,
  mouth: TOLL.mouth,
  rim: RIM,
  eye: ECHO.eye,
  pupil: ECHO.pupil,
};

/** The bell's size, in pixels: its height, and its half-widths at the shoulder and at the lip. */
const H = 96;
const TOP = 26;
const LIP = 50;

/** A band of gold round the bell at a height, as wide as the bell is there. */
function band(y: number, thick: number): ReturnType<typeof flat> {
  const k = (y + H) / H;
  const w = TOP + (LIP - TOP) * k;
  return flat([-w, y, w, y, w + (thick * (LIP - TOP)) / H, y + thick, -w - (thick * (LIP - TOP)) / H, y + thick], 'gold');
}

const parts: PartDef[] = [
  { name: 'hips', x: 0, y: -14, shapes: [] },
  {
    name: 'bell',
    parent: 'hips',
    x: 0,
    y: 0,
    z: 1,
    shapes: [
      // the dark mouth behind the lip, then the body, the shoulder and the bands
      flat(ell(0, 0, LIP, 13, 24), 'mouth'),
      ...block(trapezoid(0, -H, 0, TOP, LIP), { fill: 'bronze', shade: 'bronzeShade', shadeFrom: 0.56, rim: 'rim', rimWidth: 2 }),
      ...block(ell(0, -H, TOP, 12, 20), { fill: 'bronze', shade: 'bronzeShade', shadeFrom: 0.5, rim: 'rim', rimWidth: 1.6 }),
      band(-H + 14, 5),
      band(-30, 7),
      band(-10, 4),
      flat(arcBand(0, 0, LIP - 1, 0.1, Math.PI - 0.1, 5, 18), 'goldHot', 0.9),
    ],
  },
  {
    // the clapper, seen in the mouth of the bell: it swings against everything the bell does
    name: 'clapper',
    parent: 'bell',
    x: 0,
    y: -6,
    z: -1,
    shapes: [flat(capsule(0, 0, 0, 16, 3, 3, 3), 'goldShade'), ...block(ell(0, 22, 9, 9, 16), { fill: 'gold', shade: 'goldShade', shadeFrom: 0.55, rim: 'rim', rimWidth: 1.4 })],
  },
  {
    // the crown it hangs by
    name: 'crown',
    parent: 'bell',
    x: 0,
    y: -H,
    z: 2,
    shapes: [flat(capsule(0, -12, 0, -2, 4, 4, 3), 'goldShade'), ...block(capsule(-9, -16, 9, -16, 6, 6, 4), { fill: 'gold', shade: 'goldShade', shadeFrom: 0.5, rim: 'rim', rimWidth: 1.4 })],
  },
  {
    // the eye in its waist; from behind, a seam of light where it would be
    name: 'eye',
    parent: 'bell',
    x: 0,
    y: -56,
    z: 3,
    shapes: [flat(ell(0, 0, 13, 9, 18), 'eye', 1, 'front'), flat(ell(2, 0.6, 5, 7, 12), 'pupil', 1, 'front'), flat(ell(0, 0, 9, 2.4, 10), 'goldHot', 0.5, 'back')],
  },
];

export const TOLL_RIG: RigDef = {
  id: 'toll',
  parts,
  palette,
  footprint: 0.9,
  height: 124,
  states: ENEMY_STATES,
};

const sin = Math.sin;

/** Swing the bell by `rot`, with the clapper lagging behind it by `lag` of the swing. */
function swing(p: PoseWriter, rot: number, lag: number): void {
  p.part('bell').rot = rot;
  p.part('clapper').rot = -rot * lag;
}

function idle(p: PoseWriter, a: AnimInput): void {
  const s = sin(a.time * 1.1 + a.seed * 6.283);
  swing(p, s * 0.05, 2.2);
  p.part('hips').y = sin(a.time * 0.8) * 2.5;
  // a slow blink
  p.part('eye').sy = sin(a.time * 0.9 + a.seed * 6.283) > 0.96 ? 0.15 : 1;
}

function move(p: PoseWriter, a: AnimInput): void {
  // it does not walk, but the definition of an Echo has a walk: the same slow swing, wider
  const s = sin(a.stride * 2.2 + a.time * 1.4 + a.seed * 6.283);
  swing(p, s * 0.09, 2);
  p.part('hips').y = sin(a.time * 1.2) * 3;
}

function spawn(p: PoseWriter, a: AnimInput): void {
  // it comes down out of the dark and stops with a jolt
  const t = a.phase;
  const fall = 1 - (1 - t) * (1 - t);
  const jolt = t > 0.8 ? sin(((t - 0.8) / 0.2) * Math.PI) : 0;
  p.part('hips').y = -180 * (1 - fall) + 8 * jolt;
  const bell = p.part('bell');
  bell.sx = 0.6 + 0.4 * fall + 0.06 * jolt;
  bell.sy = 0.6 + 0.4 * fall - 0.08 * jolt;
  swing(p, sin(t * 9) * 0.16 * (1 - fall), 2);
}

function windup(p: PoseWriter, a: AnimInput): void {
  const t = a.phase;
  const e = 1 - (1 - t) * (1 - t);
  // the eye narrows on what it is about to do
  p.part('eye').sy = 1 - 0.55 * e;
  if (a.variant === 0) {
    // swung right back, and trembling there
    swing(p, -0.32 * e + sin(a.t * 44) * 0.02 * t, 1.6);
  } else {
    // lifted, gathering
    p.part('hips').y = -22 * e;
    const bell = p.part('bell');
    bell.sy = 1 + 0.08 * e;
    bell.sx = 1 - 0.05 * e;
    swing(p, sin(a.t * 40) * 0.025 * t, 1.5);
  }
}

function attack(p: PoseWriter, a: AnimInput): void {
  const t = a.phase;
  if (a.variant === 0) {
    // it rings: through and past, the clapper striking the far lip
    const through = t < 0.3 ? t / 0.3 : 1 - ((t - 0.3) / 0.7) * 0.5;
    swing(p, -0.32 + 0.7 * through, t < 0.3 ? 1.6 : -2.6);
  } else {
    // it drops, and flattens a little where it lands
    const down = t < 0.25 ? t / 0.25 : 1;
    const land = t < 0.25 ? 0 : sin(Math.min(1, (t - 0.25) / 0.4) * Math.PI);
    p.part('hips').y = -22 + 34 * down - 8 * land;
    const bell = p.part('bell');
    bell.sy = 1.08 - 0.2 * land;
    bell.sx = 0.95 + 0.14 * land;
    swing(p, sin(a.t * 30) * 0.05 * (1 - t), 2.4);
  }
}

function recover(p: PoseWriter, a: AnimInput): void {
  // the swing dies away
  const k = 1 - a.phase;
  swing(p, sin(a.t * 7) * 0.2 * k * k + (a.variant === 0 ? 0.18 * k : 0), 2);
  p.part('hips').y = (a.variant === 0 ? 0 : 12) * k;
}

function hurt(p: PoseWriter, a: AnimInput): void {
  const k = Math.max(0, 1 - a.t / 0.25);
  swing(p, -0.12 * k + sin(a.t * 60) * 0.03 * k, 3);
  p.part('bell').sx = 1 + 0.04 * k;
}

function stun(p: PoseWriter, a: AnimInput): void {
  // staggered: a wide, slow, helpless swing
  swing(p, sin(a.t * 3.4) * 0.28, 1.8);
  p.part('hips').y = 10;
}

function launched(p: PoseWriter, a: AnimInput): void {
  swing(p, 0.2 + sin(a.t * 20 + a.seed * 6.283) * 0.08, 2.4);
}

function dead(p: PoseWriter, a: AnimInput): void {
  // it stops ringing: one last swing, and it settles onto the floor, silent
  const t = Math.min(1, a.t / 1.1);
  const e = 1 - (1 - t) * (1 - t);
  swing(p, sin(t * 6) * 0.3 * (1 - t) + 0.22 * e, 1 - e);
  p.part('hips').y = 16 * e;
  const bell = p.part('bell');
  bell.sy = 1 - 0.12 * e;
  bell.sx = 1 + 0.06 * e;
}

export const tollAnimator: Animator = (p, a) => {
  switch (a.state) {
    case 'spawn':
      spawn(p, a);
      return 60;
    case 'move':
      move(p, a);
      return 14;
    case 'windup':
      windup(p, a);
      return 40;
    case 'attack':
      attack(p, a);
      return 60;
    case 'recover':
      recover(p, a);
      return 24;
    case 'hurt':
      hurt(p, a);
      return 60;
    case 'stun':
      stun(p, a);
      return 20;
    case 'launched':
      launched(p, a);
      return 40;
    case 'dead':
      dead(p, a);
      return 30;
    default:
      idle(p, a);
      return 12;
  }
};

/** What the registry gathers: this file is the whole of the rig, and nothing else lists it. */
const ENTRY: RigEntry = { def: TOLL_RIG, animator: tollAnimator, required: ENEMY_STATES, variants: { windup: [0, 1], attack: [0, 1], recover: [0, 1] } };
export default ENTRY;
