// The Shearwing: a scissor-bird shaped like a pair of draughtsman's dividers. Two long jointed
// blades hinged at its head, the eye in the hinge, a forked tail behind. It hovers; it has no legs.
// Pixi-free: a RigDef plus a pure animator, after the pattern of the Smudge.
import { INK, RIM, WHITE, ZONES } from '../palette';
import { block, ell, flat, stroke } from './def';
import type { AnimInput, Animator, PartDef, PoseWriter, RigDef, ShapeDef } from './def';
import { ENEMY_STATES } from './states';

const palette: Record<string, number> = {
  ink: ZONES.bluefen.inkWash,
  inkDark: ZONES.bluefen.inkDark,
  rim: RIM,
  eye: WHITE,
  pupil: INK,
};

const PI = Math.PI;

/** Height of the hinge above the ground point while it hovers. */
const HOVER = 58;
/** Blade angles at rest, measured from straight up, positive toward the facing direction. */
const NEAR_REST = 0.22;
const FAR_REST = -0.72;
const REST_MID = (NEAR_REST + FAR_REST) / 2;
const REST_OPEN = NEAR_REST - FAR_REST;
/** The body is drawn level, as it flies, and hangs by this much while it hovers. */
const BODY_HANG = -1.07;
/** How far each tail prong splays from the tail's axis at rest. */
const FORK = 0.32;
/** Hinge to knee along a blade. The point is another 25 px beyond the knee. */
const KNEE = 25;

// A blade is drawn lying along +x with its cutting edge up and its spine down, so the shared
// recipe shades the spine; the pale rim is the cutting edge and nothing else. The far blade is
// the same blade mirrored. Two closed blades overlap like scissors, their edges on one line.
const CUT = -4.5;
const bladeOutline = [-5, -2.5, -2, CUT - 0.6, KNEE + 1, CUT, KNEE + 2.5, 0, KNEE + 1, 4.6, 8, 8.4, -1, 7.5, -5.5, 3];
// the outer half: a needle point with a barb at its heel
const tipOutline = [-1.5, CUT, 25, CUT, 5, 3.4, 1, 4.8, -6, 9.6, -4.5, 4.2];

function bladeShapes(): ShapeDef[] {
  return [
    ...block(bladeOutline, { fill: 'ink', shade: 'inkDark', hatch: 'rim', shadeFrom: 0.66, hatchGap: 4.4, hatchAngle: 1.2 }),
    stroke([-2, CUT - 0.6, KNEE + 1, CUT], 2, 'rim'),
  ];
}

function tipShapes(): ShapeDef[] {
  return [...block(tipOutline, { fill: 'ink', shade: 'inkDark', shadeFrom: 0.62 }), stroke([-1.5, CUT, 25, CUT], 2, 'rim')];
}

/** Reflect shapes across the blade's long axis. */
function mirrored(shapes: ShapeDef[]): ShapeDef[] {
  const flip = (nums: number[]): number[] => nums.map((v, i) => (i % 2 === 1 ? -v : v));
  return shapes.map((s) => (s.kind === 'poly' ? { ...s, pts: flip(s.pts) } : { ...s, segs: flip(s.segs) }));
}

const blade = (name: string, rest: number, z: number, shapes: ShapeDef[]): PartDef => ({
  name,
  parent: 'hinge',
  x: 0,
  y: 0,
  rot: rest - PI / 2,
  z,
  shapes,
});

const tip = (name: string, parent: string, shapes: ShapeDef[]): PartDef => ({ name, parent, x: KNEE, y: 0, z: 1, shapes });

const prong = (name: string, rest: number, z: number): PartDef => ({
  name,
  parent: 'tail',
  x: -3,
  y: 0,
  rot: rest,
  z,
  shapes: [...block([2, -3, -21, 0.6, 2, 3], { fill: 'ink', rim: 'rim', rimWidth: 1.6 })],
});

const parts: PartDef[] = [
  // the pivot everything hangs from; moving it moves the whole bird
  { name: 'hinge', x: 0, y: -HOVER, shapes: [] },
  blade('bladeFar', FAR_REST, -3, mirrored(bladeShapes())),
  tip('tipFar', 'bladeFar', mirrored(tipShapes())),
  {
    // a keeled wedge, drawn level with its back up; it trails from the hinge
    name: 'body',
    parent: 'hinge',
    x: -1.5,
    y: 3.5,
    rot: BODY_HANG,
    z: -2,
    shapes: [
      ...block([5, -4, -3, -7.5, -14, -5.5, -25, -2, -27, 0.5, -25, 2.6, -13, 6.8, -3, 8.6, 5, 4.5], {
        fill: 'ink',
        shade: 'inkDark',
        hatch: 'rim',
        rim: 'rim',
        shadeFrom: 0.62,
        hatchGap: 4.5,
        rimWidth: 2,
      }),
    ],
  },
  {
    // the tail's own little pivot: the dividers again, in miniature
    name: 'tail',
    parent: 'body',
    x: -25,
    y: 0.3,
    z: -1,
    shapes: [flat([2, 0, -2, -2.8, -5, 0, -2, 2.8], 'ink')],
  },
  prong('prongUp', FORK, -2),
  prong('prongLow', -FORK, -1),
  blade('bladeNear', NEAR_REST, -1, bladeShapes()),
  tip('tipNear', 'bladeNear', tipShapes()),
  {
    // the hinge housing, sharpened into a beak; the pivot screw is the eye
    name: 'head',
    parent: 'hinge',
    x: 0,
    y: 0,
    z: 1,
    shapes: [
      ...block([-8, -8.5, 3.5, -10, 10.5, -5, 20, 3, 9, 7.5, 1.5, 10.5, -7.5, 8, -10.5, 0], {
        fill: 'ink',
        shade: 'inkDark',
        shadeFrom: 0.66,
        rim: 'rim',
        rimWidth: 2.1,
      }),
      flat([10.5, -5, 20, 3, 9, 7.5, 10.5, 1], 'inkDark'),
      stroke([10.5, -5, 20, 3], 1.7, 'rim'),
      flat(ell(0.5, -0.5, 6.3, 6.3, 14), 'eye', 1, 'front'),
      flat(ell(2.9, -0.3, 2.7, 3.5, 10), 'pupil', 1, 'front'),
      // seen from behind: the slotted back of the pivot screw
      flat(ell(-0.5, -0.5, 4, 4, 8), 'inkDark', 1, 'back'),
      stroke([-3.1, -2.6, 2.1, 1.6], 1.5, 'rim', 0.5, 'back'),
    ],
  },
];

export const SHEARWING_RIG: RigDef = {
  id: 'shearwing',
  parts,
  palette,
  footprint: 0.4,
  height: 104,
  states: ENEMY_STATES,
};

const sin = Math.sin;
const cos = Math.cos;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: number, b: number, k: number): number => a + (b - a) * k;
const easeOut = (k: number): number => 1 - (1 - k) * (1 - k);
const smoothstep = (k: number): number => k * k * (3 - 2 * k);
/** A narrow pulse once per cycle: nothing most of the time, 1 at the peak. */
const pulse = (ph: number): number => Math.pow(Math.max(0, sin(ph)), 8);

/** Point the blades. Angles are from straight up, positive toward the facing direction. */
function setBlades(p: PoseWriter, near: number, far: number): void {
  p.part('bladeNear').rot = near - NEAR_REST;
  p.part('bladeFar').rot = far - FAR_REST;
}

/** Bend the knees. Same sense as the blade angles. */
function setTips(p: PoseWriter, near: number, far: number): void {
  p.part('tipNear').rot = near;
  p.part('tipFar').rot = far;
}

/** Pitch the body: 0 hangs as at rest, 1 is level flight, below 0 tucks it under the hinge. */
function setBody(p: PoseWriter, level: number): void {
  p.part('body').rot = -BODY_HANG * level;
}

/** Splay of each tail prong from the tail's axis. */
function setFork(p: PoseWriter, up: number, low: number): void {
  p.part('prongUp').rot = up - FORK;
  p.part('prongLow').rot = FORK - low;
}

/** Stretch the whole bird along x about the hinge, keeping its volume. Negative squashes. */
function stretch(p: PoseWriter, k: number): void {
  const h = p.part('hinge');
  h.sx = 1 + k;
  h.sy = 1 / (1 + k);
}

function spawn(p: PoseWriter, a: AnimInput): void {
  // A closed sliver pushes up through the sheet like a needle, then unfolds into the open dividers.
  const t = a.phase;
  const rise = easeOut(clamp01(t / 0.6));
  const unfold = smoothstep(clamp01((t - 0.38) / 0.44));
  const over = t < 0.8 ? 0 : sin(((t - 0.8) / 0.2) * PI);
  const h = p.part('hinge');
  h.y = 50 * (1 - rise);
  h.sx = (0.35 + 0.65 * rise) * (0.6 + 0.4 * unfold);
  h.sy = 0.35 + 0.65 * rise + 0.1 * rise * (1 - unfold);
  const open = REST_OPEN * unfold + 0.34 * over;
  const mid = REST_MID * unfold;
  setBlades(p, mid + open / 2, mid - open / 2);
  // the points are the last to straighten
  const fold = sin(unfold * PI) * 0.5 - over * 0.2;
  setTips(p, -fold, fold);
  setBody(p, -0.42 * (1 - unfold) + over * 0.1);
  const fork = FORK * unfold + over * 0.16;
  setFork(p, fork, fork);
  p.part('tail').rot = over * 0.2;
  // the beak is tucked up between the blades until they part
  p.part('head').rot = -1.45 * (1 - unfold);
}

function idle(p: PoseWriter, a: AnimInput): void {
  // Hovers upright with a lazy bob; every so often the blades go snip-snip.
  const ph = a.time * 3.4 + a.seed * 6.283;
  const snip = pulse(ph) + pulse(ph - 1.3);
  const late = pulse(ph - 0.4) + pulse(ph - 1.7);
  const bobPh = a.time * 2.1 + a.seed * 6.283;
  p.part('hinge').y = sin(bobPh) * 3 - late * 2;
  const open = REST_OPEN - 0.62 * snip;
  setBlades(p, REST_MID + open / 2, REST_MID - open / 2);
  // the points trail each snip and whip in after it
  const trail = (snip - late) * 0.3;
  setTips(p, trail, -trail);
  setBody(p, sin(bobPh - 0.8) * 0.07 + late * 0.06);
  p.part('tail').rot = sin(bobPh - 1.6) * 0.14;
  const fork = FORK - late * 0.2 + sin(bobPh - 2.2) * 0.05;
  setFork(p, fork, fork);
  p.part('head').rot = sin(bobPh * 0.5 + 1) * 0.07 - 0.02;
}

function move(p: PoseWriter, a: AnimInput): void {
  // Level flight: blades swept back over the body, beating in quick shallow scissor strokes.
  const ph = a.stride * 8.5 + a.seed * 6.283;
  const s = sin(ph);
  const c = cos(ph);
  const lean = Math.min(1, 0.45 + a.speed * 0.55);
  const h = p.part('hinge');
  h.y = -2 - s * 1.8;
  h.rot = 0.06 * lean + c * 0.02;
  const open = mix(REST_OPEN, 0.52, lean) + 0.3 * s;
  const mid = mix(REST_MID, -0.84, lean) - 0.05 * s;
  setBlades(p, mid + open / 2, mid - open / 2);
  setTips(p, -c * 0.24, c * 0.24);
  setBody(p, 0.84 * lean + c * 0.05);
  p.part('tail').rot = -c * 0.12 - 0.05;
  const flick = sin(ph * 2 + 1) * 0.07;
  setFork(p, 0.12 + flick, 0.12 - flick);
  p.part('head').rot = 0.08 - s * 0.03;
}

function windup(p: PoseWriter, a: AnimInput): void {
  // Rises, throws the blades open to their widest and draws back; then the far blade comes over
  // the top and both point down the flight line like open jaws, shivering harder and harder.
  const t = a.phase;
  const spread = easeOut(clamp01(t / 0.42));
  const swing = smoothstep(clamp01((t - 0.42) / 0.48));
  const shiver = sin(a.t * 68) * t;
  const near = mix(mix(NEAR_REST, 1.32, spread), 1.92, swing) + shiver * 0.05;
  const far = mix(mix(FAR_REST, -1.45, spread), 1.22, swing) - shiver * 0.06;
  setBlades(p, near, far);
  const whip = sin(spread * PI) * (1 - swing) * 0.4;
  setTips(p, -whip + sin(a.t * 83) * 0.07 * t, whip - sin(swing * PI) * 0.6 - sin(a.t * 77) * 0.07 * t);
  const h = p.part('hinge');
  h.y = -9 * spread + 2 * swing;
  h.x = -3 * spread - 6 * swing + sin(a.t * 70) * 1.1 * t;
  setBody(p, mix(-0.3 * spread, 0.95, swing));
  p.part('tail').rot = -0.25 * swing + sin(a.t * 57) * 0.06 * t;
  const fork = FORK + 0.45 * t + sin(a.t * 61) * 0.08 * t;
  setFork(p, fork, fork);
  p.part('head').rot = -0.22 * spread * (1 - swing) + 0.1 * swing;
}

function attack(p: PoseWriter, a: AnimInput): void {
  // The pass: the jaws snap almost shut into a spearhead and the whole bird goes flat and long.
  const t = a.phase;
  const snap = easeOut(clamp01(t / 0.1));
  const brake = smoothstep(clamp01((t - 0.86) / 0.14));
  const gape = mix(0.7, 0.19, snap) + 0.75 * brake;
  const mid = PI / 2 - 0.25 * brake;
  setBlades(p, mid + gape / 2, mid - gape / 2);
  const buzz = sin(a.t * 80) * 0.03;
  setTips(p, buzz + 0.3 * brake, -buzz - 0.3 * brake);
  const long = snap * (1 - brake * 0.7);
  stretch(p, 0.2 * long);
  const h = p.part('hinge');
  h.x = mix(-9, -8, snap) + 6 * brake;
  h.y = mix(-7, 7, snap) - 5 * brake;
  h.rot = 0.04 * long - 0.2 * brake;
  setBody(p, 1 + sin(a.t * 40) * 0.03);
  p.part('body').sx = 1 + 0.08 * long;
  p.part('tail').rot = sin(a.t * 46) * 0.07;
  const flutter = sin(a.t * 63) * 0.05;
  setFork(p, 0.06 + flutter + 0.3 * brake, 0.06 - flutter + 0.3 * brake);
  p.part('head').rot = 0.02;
}

function recover(p: PoseWriter, a: AnimInput): void {
  // Spent: the blades fall and dangle open and uneven, points hanging, the body heaving.
  const t = a.phase;
  const drop = 1 - Math.exp(-a.t * 9);
  const gather = smoothstep(clamp01((t - 0.85) / 0.15)) * 0.5;
  const breath = sin(a.t * 8.4);
  const late = sin(a.t * 8.4 - 0.9);
  const later = sin(a.t * 8.4 - 1.8);
  // the far blade keeps turning the way it fell (through straight down), so its angle runs past PI
  const near = mix(mix(1.79, 2.0 + late * 0.07, drop), NEAR_REST, gather);
  const far = mix(mix(0.85, 3.75 - late * 0.06, drop), FAR_REST + 2 * PI, gather);
  setBlades(p, near, far);
  const limp = drop * (1 - gather * 2) * 0.9;
  setTips(p, (PI - near) * limp + later * 0.1 * drop, (PI - far) * limp - later * 0.12 * drop);
  const h = p.part('hinge');
  h.x = -2 * (1 - drop);
  h.y = mix(2, 5, drop) + breath * 3.5 * drop;
  h.sx = 1 - 0.03 * breath * drop;
  h.sy = 1 + 0.035 * breath * drop;
  setBody(p, mix(mix(1, -0.38 + late * 0.04, drop), 0, gather));
  p.part('tail').rot = late * 0.15 * drop;
  setFork(p, mix(0.36, 0.1, drop) + later * 0.06, mix(0.36, 0.55, drop) - later * 0.06);
  p.part('head').rot = (0.4 + late * 0.1) * drop * (1 - gather * 2);
}

function hurt(p: PoseWriter, a: AnimInput): void {
  // Knocked askew: the whole bird tips back and the points fold across each other.
  const k = Math.max(0, 1 - a.t / 0.2);
  const h = p.part('hinge');
  h.x = -8 * k;
  h.y = -4 * k;
  h.rot = -0.45 * k;
  h.sx = 1 + 0.1 * k;
  h.sy = 1 / (1 + 0.1 * k);
  setBlades(p, NEAR_REST - 0.12 * k, FAR_REST + 0.37 * k);
  setTips(p, -1.0 * k, 1.0 * k);
  setBody(p, -0.5 * k);
  p.part('tail').rot = 0.6 * k;
  setFork(p, FORK + 0.5 * k, FORK - 0.2 * k);
  p.part('head').rot = -0.3 * k;
}

function stun(p: PoseWriter, a: AnimInput): void {
  // Grounded: it drops like a stone, slaps down with the blades splayed flat along the floor,
  // and lies there face down, rump in the air, twitching.
  const fall = clamp01(a.t / 0.14);
  const down = fall * fall;
  const since = Math.max(0, a.t - 0.14);
  const slap = a.t < 0.14 ? 0 : Math.exp(-since * 13);
  const twitchA = Math.pow(Math.max(0, sin(a.t * 12.5)), 6);
  const twitchB = Math.pow(Math.max(0, sin(a.t * 8.3 + 2.2)), 6);
  const sway = sin(a.t * 5.2);
  const h = p.part('hinge');
  h.y = (HOVER - 8) * down - 6 * Math.abs(sin(since * 21)) * slap;
  h.sx = 1 + 0.16 * slap;
  h.sy = 1 - 0.2 * slap;
  setBlades(p, mix(0.55, PI / 2 + 0.13, down) - 0.1 * twitchA, mix(-1.0, -PI / 2 - 0.13, down) + 0.07 * twitchB);
  setTips(p, -(0.3 + 0.55 * twitchA) * down, (0.62 + 0.4 * twitchB) * down);
  setBody(p, mix(0.2, 1.9, down) + sway * 0.1 - slap * 0.3);
  p.part('tail').rot = sin(a.t * 5.2 - 1) * 0.2 + twitchB * 0.3;
  const quiver = sin(a.t * 31) * 0.12 * twitchB;
  setFork(p, FORK + 0.35 + quiver, FORK + 0.25 - quiver + twitchA * 0.2);
  p.part('head').rot = 0.5 * down + sway * 0.06;
}

function dead(p: PoseWriter, a: AnimInput): void {
  // The hinge gives way. The blades spin apart: one lands point first and sticks in the floor,
  // the other clatters down flat behind; the head and body drop where they were.
  const t = Math.min(1, a.t / 0.42);
  const pop = t < 0.14 ? t / 0.14 : 1;
  const fly = t < 0.14 ? 0 : (t - 0.14) / 0.86;
  const fall = fly * fly;
  const after = Math.max(0, a.t - 0.42);
  const quiver = t < 1 ? 0 : sin(after * 44) * Math.exp(-after * 9);

  const near = p.part('bladeNear');
  near.x = 6 * pop + 20 * fly;
  near.y = -5 * pop * (1 - fly) - 22 * fly + 34 * fall;
  near.rot = mix(0.5 * pop, 2 * PI + PI - 0.4 - NEAR_REST, fly) + quiver * 0.1;

  const far = p.part('bladeFar');
  far.x = -5 * pop - 31 * fly;
  far.y = -3 * pop * (1 - fly) - 28 * fly + 79 * fall;
  far.rot = mix(-0.5 * pop, -2 * PI - PI / 2 - 0.1 - FAR_REST, easeOut(fly));
  p.part('tipFar').rot = 0.8 * clamp01((fly - 0.85) / 0.15);

  const head = p.part('head');
  head.x = 11 * fly;
  head.y = -8 * sin((pop * PI) / 2) * (1 - fly) - 22 * fly + 71 * fall;
  head.rot = 1.9 * fly;

  const body = p.part('body');
  body.x = 2 * fly;
  body.y = -13 * fly + 58 * fall;
  setBody(p, 1.04 * fly);
  p.part('tail').rot = 0.4 * fall;
  setFork(p, FORK + 0.5 * fly, FORK + 0.2 * fly);
}

export const shearwingAnimator: Animator = (p, a) => {
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
    case 'dead':
      dead(p, a);
      return 60;
    default:
      idle(p, a);
      return 14;
  }
};
