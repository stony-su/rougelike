// The Hachure: a fan of quills on a springy stalk. It levels its three middle quills and looses them.
// Pixi-free: a RigDef plus a pure animator, after the pattern of the Smudge.
//
// Whole-body poses are small data records (how the stalk bends, where each quill points), so one
// state can start exactly where the last one ended: the attack begins on the held aim, and the
// recovery begins on the whipped-out attack.
import { INK, RIM, WHITE, ZONES } from '../palette';
import { block, ell, flat, smooth, stroke } from './def';
import type { AnimInput, Animator, PartDef, PoseWriter, RigDef, ShapeDef } from './def';
import { ENEMY_STATES } from './states';

const palette: Record<string, number> = {
  ink: ZONES.bluefen.inkWash,
  inkDark: ZONES.bluefen.inkDark,
  rim: RIM,
  eye: WHITE,
  pupil: INK,
};

const DEG = Math.PI / 180;

/** Length of one stalk segment; four of them make the stalk. */
const SEG = 7.5;
/** The stalk stands in a lazy S, so it can straighten to stretch and fold to compress. */
const STALK_REST = [0.14, -0.3, 0.3, -0.14];

const QUILLS = ['quill0', 'quill1', 'quill2', 'quill3', 'quill4', 'quill5', 'quill6'] as const;
/** The three that are aimed and loosed. */
const MIDDLE = [2, 3, 4] as const;
const QUILL_LEN = [28, 32, 36, 38, 36, 32, 28];
/** At rest the fan stands half open, tipped a little back. Quill 0 is the foremost. */
const REST_CENTRE = -98;
const REST_GAP = 15;
const REST_ANGLE = QUILLS.map((_, i) => (REST_CENTRE + (3 - i) * REST_GAP) * DEG);

/**
 * A quill lies along +x from the hub. `lit` says which long edge catches the light from above:
 * -1 for the quills that lean forward or get levelled, +1 for the two that lean back.
 */
function quillShapes(len: number, lit: number): ShapeDef[] {
  const mid = len * 0.58;
  const end = len - 4;
  const dark = -lit;
  return [
    flat([2, -1.6, 10, -3.2, mid, -2.1, end, -0.9, len, 0, end, 0.9, mid, 2.1, 10, 3.2, 2, 1.6], 'ink'),
    // the shade runs down the unlit edge, as it does down the lower part of a rounder body
    flat([2, 1.6 * dark, 10, 3.2 * dark, mid, 2.1 * dark, end, 0.9 * dark, mid, 0.8 * dark, 10, 1.2 * dark, 2, 0.4 * dark], 'inkDark'),
    stroke([3, 1.7 * lit, 10, 3.2 * lit, mid, 2.1 * lit, end, 0.9 * lit, len, 0], 1.3, 'rim'),
  ];
}

const quill = (i: number, z: number): PartDef => ({
  name: QUILLS[i],
  parent: 'hub',
  x: 0,
  y: -4,
  rot: REST_ANGLE[i],
  z,
  shapes: quillShapes(QUILL_LEN[i], i >= 5 ? 1 : -1),
});

/** One joint of the stalk: a tapering shaft with a pale edge down its back and a knuckle at its foot. */
const segment = (n: number, parent: string, y: number, w0: number, w1: number, z: number): PartDef => ({
  name: `stalk${n}`,
  parent,
  x: 0,
  y,
  rot: STALK_REST[n - 1],
  z,
  shapes: [
    flat([-w0 / 2, 1, w0 / 2, 1, w1 / 2, -SEG - 1, -w1 / 2, -SEG - 1], 'ink'),
    flat([w0 / 2 - 1.4, 1, w0 / 2, 1, w1 / 2, -SEG - 1, w1 / 2 - 1.3, -SEG - 1], 'inkDark'),
    flat(ell(0, 0, w0 / 2 + 0.5, w0 / 2 + 0.3, 8), 'ink'),
    stroke([-w0 / 2, -0.5, -w1 / 2, -SEG], 1.1, 'rim'),
  ],
});

const parts: PartDef[] = [
  { name: 'base', x: 0, y: 0, shapes: [] },
  segment(1, 'base', -7, 4.6, 4.2, 0),
  {
    // the foot: a small bulb, drawn over the root of the stalk
    name: 'bulb',
    parent: 'base',
    x: 0,
    y: 0,
    z: 1,
    shapes: [
      ...block(smooth([0, -11, 3.2, -8.6, 8, -6.4, 9.6, -3, 6.8, 0, 0, 0.9, -6.8, 0, -9.6, -3, -8, -6.4, -3.2, -8.6], 2), {
        fill: 'ink',
        shade: 'inkDark',
        hatch: 'rim',
        rim: 'rim',
        shadeFrom: 0.58,
        hatchGap: 3.6,
        rimWidth: 1.8,
      }),
    ],
  },
  segment(2, 'stalk1', -SEG, 4.2, 3.8, 1),
  {
    // a thorn on the stalk; it flaps behind every hop
    name: 'barb',
    parent: 'stalk2',
    x: -1.4,
    y: -3.6,
    z: -1,
    shapes: [...block([0.6, -2.4, -8.6, -5.2, 0.4, 2.4], { fill: 'ink', rim: 'rim', rimWidth: 1.1 })],
  },
  segment(3, 'stalk2', -SEG, 3.8, 3.4, 1),
  segment(4, 'stalk3', -SEG, 3.4, 3.1, 1),
  {
    name: 'hub',
    parent: 'stalk4',
    x: 0,
    y: -SEG,
    z: 1,
    shapes: [
      ...block(smooth([0, 4.6, 4.1, 2.3, 7.8, -1.8, 8, -6.3, 5, -10.4, 0, -11.7, -5, -10.4, -8, -6.3, -7.8, -1.8, -4.1, 2.3], 2), {
        fill: 'ink',
        shade: 'inkDark',
        hatch: 'rim',
        rim: 'rim',
        shadeFrom: 0.64,
        hatchGap: 3.2,
        rimWidth: 1.9,
      }),
    ],
  },
  {
    name: 'drip',
    parent: 'hub',
    x: -4.2,
    y: 1.4,
    z: -9,
    shapes: [flat(smooth([-1.9, 0, 1.9, 0, 2.5, 5.4, 0, 8.6, -2.5, 5.4], 1), 'ink')],
  },
  // the outer four first, so the middle three lie over them when they level
  quill(6, -8),
  quill(5, -7),
  quill(0, -6),
  quill(1, -5),
  quill(4, -4),
  quill(2, -3),
  quill(3, -2),
  {
    // one bright mark for an eye, set in the hub; it widens, squeezes shut and droops
    name: 'eye',
    parent: 'hub',
    x: 2.9,
    y: -4.2,
    z: 1,
    shapes: [
      flat(ell(0, 0, 4.4, 5, 14), 'eye', 1, 'front'),
      flat(ell(1.7, 0.3, 1.9, 2.6, 10), 'pupil', 1, 'front'),
      // seen from behind: only a pale glint where the eye would be
      flat(ell(-6.4, -1.3, 1.7, 2.3, 8), 'rim', 0.35, 'back'),
    ],
  },
];

export const HACHURE_RIG: RigDef = {
  id: 'hachure',
  parts,
  palette,
  footprint: 0.36,
  height: 76,
  states: [...ENEMY_STATES, 'flee'],
};

const sin = Math.sin;
const cos = Math.cos;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Slow in, slow out. */
const ease = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
/** Fast in, slow out. */
const easeOut = (v: number): number => {
  const t = clamp01(v);
  return 1 - (1 - t) * (1 - t);
};
/** Fast in, past the mark, and back. */
const overshoot = (v: number): number => {
  const t = clamp01(v) - 1;
  return 1 + 2.7 * t * t * t + 1.7 * t * t;
};

/** A whole-body pose: the bend of the stalk, the tilt of the hub, and where each quill points. */
interface Key {
  /** Lean spread evenly along the stalk; positive is forward. */
  arc: number;
  /** Zigzag fold that shortens the stalk like a spring. */
  coil: number;
  /** Extra curl of the top two segments. */
  hook: number;
  /** Angle of the hub itself, whatever the stalk does under it. */
  tilt: number;
  /** Where each quill points: 0 is forward, negative is up. */
  q: number[];
}

const key = (arc: number, coil: number, hook: number, tilt: number, deg: number[]): Key => ({ arc, coil, hook, tilt, q: deg.map((d) => d * DEG) });
const fanned = (centre: number, gap: number): number[] => QUILLS.map((_, i) => centre + (3 - i) * gap);

const K_REST = key(0, 0, 0, 0, fanned(REST_CENTRE, REST_GAP));
/** Wind-up, first beat: the fan snaps wide and the whole thing rears back. */
const K_REAR = key(-0.62, 0, -0.1, -0.24, fanned(-122, 23));
/** Wind-up, second beat: the middle three level at the target, the outer four stand up as a crest. */
const K_AIM = key(-0.8, 0.1, -0.1, 0, [-64, -90, -10, 0, 10, -118, -146]);
/** Wind-up, held to the end: drawn back and down like a bow, the crest flared wide. */
const K_DRAWN = key(-1.08, 0.3, -0.12, 0.04, [-54, -87, -9, 0, 9, -125, -160]);
/** Attack, spent: the stalk has whipped forward and the crest rakes after it. */
const K_WHIP = key(0.95, 0, 0.35, 0.25, [-14, -32, 0, 0, 0, -52, -72]);
/** Recovery: sagging, the crest hanging open, new quills budding on top. */
const K_SPENT = key(0.3, 0.25, 0.8, 0.45, [56, 28, -76, -98, -120, -2, -30]);
const K_HOP = key(0.34, 0, 0, 0.1, fanned(-124, 10));
const K_FLEE = key(1.0, 0.25, 0.25, 0.15, fanned(-172, 1.2));
const K_STUN = key(-0.1, 0.2, 0.2, 0.4, fanned(54, 2.2));
const K_BURST = key(-0.15, -0.1, 0, -0.1, fanned(-98, 27));
/** How far the levelled three stand out of the hub at the end of the wind-up. */
const NOCK = 7;

/** The pose being built this frame. Animators blend keys into it, adjust it, then apply it. */
const S: Key = key(0, 0, 0, 0, fanned(0, 0));

function blend(a: Key, b: Key, k: number): Key {
  S.arc = a.arc + (b.arc - a.arc) * k;
  S.coil = a.coil + (b.coil - a.coil) * k;
  S.hook = a.hook + (b.hook - a.hook) * k;
  S.tilt = a.tilt + (b.tilt - a.tilt) * k;
  for (let i = 0; i < QUILLS.length; i++) S.q[i] = a.q[i] + (b.q[i] - a.q[i]) * k;
  return S;
}

/** Bend the stalk. Returns the turn it puts on its tip, so the hub can be held level against it. */
function bend(p: PoseWriter, arc: number, coil: number, hook: number, stretch = 0): number {
  const q = arc * 0.25;
  p.part('stalk1').rot = q + coil;
  const s2 = p.part('stalk2');
  s2.rot = q - 2 * coil;
  s2.y = -stretch;
  const s3 = p.part('stalk3');
  s3.rot = q + 2 * coil + hook * 0.4;
  s3.y = -stretch;
  const s4 = p.part('stalk4');
  s4.rot = q - coil + hook * 0.6;
  s4.y = -stretch;
  p.part('hub').y = -stretch;
  return arc + hook;
}

function pose(p: PoseWriter, k: Key, stretch = 0): void {
  const turn = bend(p, k.arc, k.coil, k.hook, stretch);
  p.part('hub').rot = k.tilt - turn;
  for (let i = 0; i < QUILLS.length; i++) p.part(QUILLS[i]).rot = k.q[i] - REST_ANGLE[i] - k.tilt;
}

/** Slide a quill along its own length, out of the hub (positive) or back into it. */
function slide(p: PoseWriter, i: number, k: Key, d: number): void {
  const a = k.q[i] - k.tilt;
  const q = p.part(QUILLS[i]);
  q.x = cos(a) * d;
  q.y = sin(a) * d;
}

/** Squash and stretch of the bulb that keeps its volume; the root of the stalk rides its top. */
function squash(p: PoseWriter, k: number): void {
  const b = p.part('bulb');
  b.sy = 1 - k;
  b.sx = 1 / Math.max(0.4, 1 - k * 0.8);
  p.part('stalk1').y = k * 7;
}

function eyeScale(p: PoseWriter, sx: number, sy: number): void {
  const e = p.part('eye');
  e.sx = sx;
  e.sy = sy;
}

function spawn(p: PoseWriter, a: AnimInput): void {
  // Sprouts: the bulb swells, the stalk pushes up curled like a fern and unrolls, then the fan unfolds.
  const t = a.phase;
  const b = p.part('bulb');
  b.sx = b.sy = Math.max(0.02, overshoot(t / 0.3));
  const curl = 1 - ease((t - 0.28) / 0.42);
  bend(p, -0.3 * curl, 0, 2.6 * curl);
  const grow = ease((t - 0.14) / 0.46);
  const s1 = p.part('stalk1');
  s1.sx = s1.sy = 0.02 + 0.98 * grow;
  const hub = p.part('hub');
  hub.sx = hub.sy = 0.55 + 0.45 * ease((t - 0.4) / 0.3);
  const u = clamp01((t - 0.62) / 0.38);
  const gap = 1.2 + (REST_GAP - 1.2) * overshoot(u);
  for (let i = 0; i < QUILLS.length; i++) {
    const q = p.part(QUILLS[i]);
    q.rot = (3 - i) * (gap - REST_GAP) * DEG;
    q.sx = 0.5 + 0.5 * easeOut(u);
  }
  eyeScale(p, 1, clamp01((t - 0.7) / 0.16));
  p.part('drip').sy = clamp01((t - 0.8) / 0.2);
  p.part('barb').rot = 1.2 * curl;
}

function idle(p: PoseWriter, a: AnimInput): void {
  // Sways on its stalk; the fan breathes open and shut, the outer quills a beat behind the inner.
  const ph = a.time * 1.9 + a.seed * 6.283;
  const sway = sin(ph * 0.55 + 0.5);
  const late = sin(ph * 0.55);
  const breath = sin(ph);
  const k = blend(K_REST, K_REST, 0);
  k.arc = sway * 0.2;
  k.coil = breath * 0.04;
  k.tilt = sway * 0.05;
  for (let i = 0; i < QUILLS.length; i++) {
    const gap = 13.5 + 4 * sin(ph - Math.abs(i - 3) * 0.3);
    k.q[i] = (REST_CENTRE + late * 6 + (3 - i) * gap) * DEG;
  }
  pose(p, k);
  squash(p, breath * 0.03);
  p.part('drip').rot = sin(ph * 1.3) * 0.25;
  p.part('barb').rot = late * 0.14;
  // a blink now and then
  const blink = (a.time * 0.31 + a.seed) % 1;
  if (blink < 0.035) eyeScale(p, 1.05, 0.12);
}

/** Hops per tile travelled, as a phase rate. */
const HOP = (Math.PI * 2) / 0.9;

function move(p: PoseWriter, a: AnimInput): void {
  // A springy hop: the stalk folds on the ground and snaps straight in the air, the fan trailing
  // shut on the way up and floating open on the way down.
  const ph = a.stride * HOP + a.seed * 6.283;
  const s = sin(ph);
  const c = cos(ph);
  const air = Math.max(0, s);
  const sit = Math.max(0, -s);
  const k = blend(K_HOP, K_HOP, 0);
  k.arc += 0.2 * c;
  k.coil = sit * 0.62 - air * 0.1;
  k.tilt += 0.1 * c;
  for (let i = 0; i < QUILLS.length; i++) {
    const drag = cos(ph - 0.7 - Math.abs(i - 3) * 0.25);
    k.q[i] = (-122 - 16 * drag + (3 - i) * (11 - 4.5 * drag)) * DEG;
  }
  pose(p, k, air * 1.2);
  p.part('base').y = -air * 8;
  squash(p, sit * 0.28 - air * 0.14);
  p.part('drip').rot = 0.5 + 0.4 * cos(ph - 1);
  p.part('barb').rot = -0.35 * cos(ph - 0.7);
}

function flee(p: PoseWriter, a: AnimInput): void {
  // Bolting: bent low, the fan clamped shut and swept straight back, a short frantic hop at twice the pace.
  const ph = a.stride * HOP * 2 + a.seed * 6.283;
  const s = sin(ph);
  const c = cos(ph);
  const air = Math.max(0, s);
  const sit = Math.max(0, -s);
  const jit = sin(a.stride * 53 + a.seed * 9);
  const k = blend(K_FLEE, K_FLEE, 0);
  k.arc += 0.12 * c;
  k.coil += sit * 0.3;
  for (let i = 0; i < QUILLS.length; i++) k.q[i] += (6 * cos(ph - 0.8) + 1.5 * sin(a.stride * 61 + i * 2.1)) * DEG;
  pose(p, k);
  p.part('base').y = -air * 4.5;
  p.part('hub').x = jit * 0.8;
  squash(p, sit * 0.3 - air * 0.1);
  eyeScale(p, 1.3, 1.3);
  p.part('drip').rot = 1.2 + 0.3 * c;
  p.part('barb').rot = -0.6 + jit * 0.2;
}

function windup(p: PoseWriter, a: AnimInput): void {
  // The warning, in three beats. The fan snaps wide and rears back; the middle three swing down and
  // level at the target while the outer four stand up as a crest; then it draws back and down like
  // a bow behind the levelled points, shaking harder and harder.
  const t = a.phase;
  const rear = easeOut(t / 0.22);
  const level = ease((t - 0.18) / 0.3);
  const draw = easeOut((t - 0.44) / 0.56);
  const k = blend(blend(blend(K_REST, K_REAR, rear), K_AIM, level), K_DRAWN, draw);
  const shake = t * t;
  for (let i = 0; i < QUILLS.length; i++) k.q[i] += sin(a.t * 61 + i * 1.9) * 0.08 * shake;
  // the aimed three shiver far less than the crest: the aim itself must stay readable
  for (const i of MIDDLE) k.q[i] -= sin(a.t * 61 + i * 1.9) * 0.055 * shake;
  pose(p, k);
  // the points stay on the target while the hub pulls away behind them
  for (const i of MIDDLE) slide(p, i, k, NOCK * draw);
  p.part('hub').x = sin(a.t * 72) * 1.1 * shake;
  squash(p, 0.1 * rear + 0.14 * draw);
  const wide = 1 + 0.3 * t;
  eyeScale(p, wide, wide);
  p.part('drip').rot = -0.5 * rear - 0.4 * draw + sin(a.t * 50) * 0.25 * shake;
  p.part('barb').rot = 0.4 * rear + 0.3 * draw + sin(a.t * 55) * 0.2 * shake;
}

function attack(p: PoseWriter, a: AnimInput): void {
  // Release: the three levelled quills are gone and the stalk whips forward after them, the crest
  // raking over, overshooting and swinging back.
  const t = a.phase;
  const whip = easeOut(t / 0.3);
  const after = clamp01((t - 0.3) / 0.7);
  const swing = sin(after * 7.5) * (1 - after);
  const k = blend(K_DRAWN, K_WHIP, whip);
  k.arc += 0.22 * swing - 0.12 * after;
  k.hook += 0.3 * swing;
  // the back of the crest arrives late
  const late = easeOut((t - 0.1) / 0.36);
  k.q[5] = K_DRAWN.q[5] + (K_WHIP.q[5] - K_DRAWN.q[5]) * late;
  k.q[6] = K_DRAWN.q[6] + (K_WHIP.q[6] - K_DRAWN.q[6]) * late;
  for (let i = 0; i < QUILLS.length; i++) k.q[i] += swing * (0.2 + Math.abs(i - 3) * 0.05);
  pose(p, k);
  const fly = clamp01(t / 0.2);
  for (const i of MIDDLE) {
    const q = p.part(QUILLS[i]);
    slide(p, i, k, NOCK + 70 * fly);
    q.sx = 1 - fly;
    q.sy = 1 - 0.7 * fly;
  }
  squash(p, 0.24 * (1 - whip) - 0.14 * whip * (1 - after));
  const wide = 1.3 - 0.2 * after;
  eyeScale(p, wide, wide);
  p.part('drip').rot = -0.9 + 2 * whip - swing * 0.6;
  p.part('barb').rot = 0.7 - 1.4 * whip + swing * 0.4;
}

function recover(p: PoseWriter, a: AnimInput): void {
  // Spent: it sags forward with the crest hanging open, and three new quills bud and lengthen.
  const t = a.phase;
  const sag = easeOut(t / 0.2);
  const lift = ease((t - 0.55) / 0.45);
  const wob = sin(a.t * 13) * Math.exp(-a.t * 3.5);
  const k = blend(blend(K_WHIP, K_SPENT, sag), K_REST, lift);
  k.arc += wob * 0.22 - 0.12 * (1 - sag);
  k.hook += wob * 0.3;
  for (let i = 0; i < QUILLS.length; i++) k.q[i] += wob * (0.25 + Math.abs(i - 3) * 0.08);
  pose(p, k);
  const grow = ease((t - 0.12) / 0.8);
  for (const i of MIDDLE) {
    const q = p.part(QUILLS[i]);
    q.sx = grow;
    q.sy = 0.3 + 0.7 * grow;
  }
  squash(p, 0.1 * sag * (1 - lift) + wob * 0.06);
  const lid = 1 - 0.45 * sag * (1 - lift);
  eyeScale(p, 1.1 - 0.1 * sag, lid);
  p.part('drip').rot = (1.1 - 1.4 * sag) * (1 - lift) + wob * 0.8;
  p.part('barb').rot = (-0.7 + 1.1 * sag) * (1 - lift) + wob * 0.5;
}

function hurt(p: PoseWriter, a: AnimInput): void {
  // Struck like a reed: the stalk whips back, the head and fan thrown the other way, and it rings out.
  const k0 = Math.max(0, 1 - a.t / 0.2);
  const ring = k0 * cos(a.t * 24);
  const late = k0 * cos(a.t * 24 - 1.1);
  const k = blend(K_REST, K_REST, 0);
  k.arc = -1.15 * ring;
  k.hook = 0.6 * late;
  k.tilt = 0.3 * late;
  for (let i = 0; i < QUILLS.length; i++) k.q[i] = (REST_CENTRE + 42 * late + (3 - i) * (REST_GAP + 8 * k0)) * DEG;
  pose(p, k);
  p.part('base').y = -2 * k0;
  p.part('bulb').rot = -0.25 * ring;
  eyeScale(p, 1 + 0.15 * k0, 1 - 0.8 * k0);
  p.part('drip').rot = -1.3 * late;
  p.part('barb').rot = 0.9 * late;
}

function stun(p: PoseWriter, a: AnimInput): void {
  // Dazed: the fan folded shut and hanging off the hub, swinging, while the stalk rocks under it.
  const s = sin(a.t * 5);
  const late = sin(a.t * 5 - 1.2);
  const k = blend(K_STUN, K_STUN, 0);
  k.arc += s * 0.26;
  k.tilt += late * 0.12;
  for (let i = 0; i < QUILLS.length; i++) k.q[i] += late * 0.22;
  pose(p, k);
  squash(p, 0.08 + s * 0.02);
  eyeScale(p, 1, 0.4 + 0.08 * late);
  p.part('drip').rot = late * 0.7;
  p.part('barb').rot = 0.5 + s * 0.3;
}

function dead(p: PoseWriter, a: AnimInput): void {
  // A last flare of the fan, then every quill is shed outward as the stalk folds onto its bulb.
  const t = Math.min(1, a.t / 0.42);
  const burst = t < 0.18 ? t / 0.18 : 1;
  const fall = t < 0.18 ? 0 : (t - 0.18) / 0.82;
  const e = 1 - (1 - fall) * (1 - fall);
  const k = blend(K_REST, K_BURST, burst);
  k.tilt = 0.5 * e - 0.1 * burst;
  pose(p, k);
  // the stalk folds flat, joint over joint
  p.part('stalk1').rot += 1.2 * e;
  p.part('stalk2').rot -= 2.5 * e;
  p.part('stalk3').rot += 2.6 * e;
  p.part('stalk4').rot -= 2.2 * e;
  const hub = p.part('hub');
  hub.rot += 0.9 * e;
  hub.sx = hub.sy = 1 - 0.25 * e;
  const ct = cos(k.tilt);
  const st = sin(k.tilt);
  for (let i = 0; i < QUILLS.length; i++) {
    const q = p.part(QUILLS[i]);
    const d = 48 * e * (0.75 + 0.25 * sin(i * 2.4 + 1));
    // outward in the world, with the hub's fall taken back out so the quills hang in the air a moment
    const wx = cos(k.q[i]) * d;
    const wy = sin(k.q[i]) * d - 12 * e;
    q.x = wx * ct + wy * st;
    q.y = -wx * st + wy * ct;
    q.rot += (i - 3) * 0.3 * e + sin(i * 4.1) * 0.7 * e;
    q.sx = 1 - 0.3 * e;
  }
  const b = p.part('bulb');
  b.sy = 1 + 0.12 * burst - 0.62 * e;
  b.sx = 1 + 0.06 * burst + 0.55 * e;
  p.part('stalk1').y = 5 * e;
  eyeScale(p, 1 + 0.2 * burst - 0.4 * e, Math.max(0.06, 1 + 0.2 * burst - 1.14 * e));
  p.part('drip').y = 9 * e;
  p.part('barb').rot = 1.6 * e;
}

export const hachureAnimator: Animator = (p, a) => {
  switch (a.state) {
    case 'spawn':
      spawn(p, a);
      return 60;
    case 'move':
      move(p, a);
      return 24;
    case 'flee':
      flee(p, a);
      return 34;
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
