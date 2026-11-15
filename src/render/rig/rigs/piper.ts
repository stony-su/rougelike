// The Piper: a tall thin wader in a hood, all neck and stilts, that plays a reed pipe. It carries
// the pipe low, raises it to its mouth and fills its chest before it plays, and sags over it
// afterwards.
// Pixi-free: a RigDef plus a pure animator, after the pattern in thrum.ts.
import { ECHO, RIM, ZONES } from '../../palette';
import { block, clipBelow, ell, flat, smooth, stroke } from '../def';
import type { AnimInput, Animator, PartDef, PartPose, PoseWriter, RigDef, RigEntry } from '../def';
import { ENEMY_STATES } from '../states';

const sin = Math.sin;
const cos = Math.cos;
const HALF_PI = Math.PI / 2;
const TURN = 6.283;

const palette: Record<string, number> = {
  ink: ZONES.outer.inkWash,
  inkDark: ZONES.outer.inkDark,
  rim: RIM,
  eye: ECHO.eye,
  pupil: ECHO.pupil,
  reed: ECHO.reed,
  reedShade: ECHO.reedShade,
};

// ---------------------------------------------------------------- the skeleton
// The animator follows the neck up to the mouth and the arms out to the pipe, so the joints are
// named here. Everything above the hips is given in the torso's space, whose origin is the hips.

/** The stilts: thigh and shin. The hips stand this high when both are straight. */
const THIGH = 9;
const SHIN = 12;
const LEG = THIGH + SHIN;
/** Where the neck leaves the body. */
const NECK_X = 1.5;
const NECK_Y = -18.5;
/** The neck is two bones: the lower leans back, the upper comes forward again, and the head sits level on it. */
const NECK_LEN = 9.5;
const NECK_REST = -0.35;
const NECK2_LEN = 9;
const NECK2_REST = 0.8;
const HEAD_REST = -0.45;
/** The mouth, in the head's own space: where the pipe goes. */
const MOUTH_X = 11.5;
const MOUTH_Y = -1.5;
/** The shoulders, and the length of an arm at rest. */
const NEAR_X = 3;
const NEAR_Y = -14;
const FAR_X = -0.5;
const FAR_Y = -14.5;
const ARM = 13;
/** Where the coat-tail hangs from. */
const TAIL_X = -7;
const TAIL_Y = -4.5;
/** The pipe at rest: carried low, pointing down and ahead. Its joint is the near hand's grip. */
const PIPE_X = 9;
const PIPE_Y = -6;
const PIPE_REST = 0.82;
/** How far the mouth end lies behind the grip, how far ahead of it the flared end is, and how far along the far hand holds. */
const PIPE_BACK = 8;
const PIPE_TIP = 35;
const FAR_GRIP = 7;
/** How close to the floor the middle of the flared end may come. */
const PIPE_CLEAR = 4;

/** A limb drawn hanging from its joint: round at both ends, r0 wide at the joint and r1 at the tip. */
function limb(len: number, r0: number, r1: number, steps = 4): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI + (i / steps) * Math.PI;
    pts.push(cos(a) * r0, sin(a) * r0);
  }
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI;
    pts.push(cos(a) * r1, len + sin(a) * r1);
  }
  return pts;
}

/** The same outline standing up from its joint instead of hanging. */
const upward = (pts: number[]): number[] => pts.map((v, i) => (i % 2 === 1 ? -v : v));

const bodyOutline = smooth([1.5, -20.5, 5, -18.5, 8, -13.5, 10, -7, 9.5, -1, 4.5, 3.5, -5, 3.5, -10, -0.5, -11, -6.5, -9, -13, -4.5, -18.5], 2);
const headOutline = smooth([-6, 1.2, 1.2, 3, 8.4, 1.8, 12.6, -3, 12.6, -8.4, 8.4, -12.6, 1.2, -13.8, -5.4, -11.4, -7.8, -5.4], 2);
const crestOutline = smooth([3, -3.6, -4.8, -6.2, -12.6, -4.4, -18.2, 1.8, -19.4, 10.2, -16, 12, -13.2, 5.4, -7.8, 2, 0.6, 3.6], 2);
const tailOutline = smooth([3.5, -5, -4, -6.5, -9.8, -0.5, -12, 10.5, -11, 19, -6.3, 12.7, -1.7, 6.3, 3.5, 4], 2);
const pipeOutline = [-PIPE_BACK, -2.1, 23, -2.8, 31, -5.4, PIPE_TIP - 1, -6.6, PIPE_TIP, -5.8, PIPE_TIP, 5.8, PIPE_TIP - 1, 6.6, 31, 5.4, 23, 2.8, -PIPE_BACK, 2.1];

/** How far down the body its shade begins, and the height that comes to. */
const BODY_SHADE = 0.62;
const bodyYs = bodyOutline.filter((_, i) => i % 2 === 1);
const BODY_TOP = Math.min(...bodyYs);
const SHADE_Y = BODY_TOP + (Math.max(...bodyYs) - BODY_TOP) * BODY_SHADE;
/**
 * The chest swells from a joint on the body's shade line, so that however full it is its own
 * shade meets the body's. Its outline is given from that joint.
 */
const CHEST_X = 1.5;
const CHEST_Y = SHADE_Y;
const chestOutline = ell(3.5, -5, 6, 6, 18);
/** The top of the breast, from the throat round to the front: the only edge of it that shows a rim. */
const chestRim: number[] = [];
for (let i = 0; i <= 6; i++) {
  const ang = -1.95 + (i / 6) * 1.8;
  chestRim.push(3.5 + cos(ang) * 6, -5 + sin(ang) * 6);
}

const thigh = (name: string, x: number, z: number): PartDef => ({
  name,
  parent: 'hips',
  x,
  y: 0,
  z,
  shapes: [flat(limb(THIGH, 2.9, 2.5), 'ink')],
});

/** A shin with a small pointed foot whose pale top edge shows the step on dark ground. It is drawn under the thigh's knee. */
const shin = (name: string, parent: string): PartDef => ({
  name,
  parent,
  x: 0,
  y: THIGH,
  z: -1,
  shapes: [
    flat([-2.2, -1, 2.2, -1, 1.9, SHIN - 4, 9, SHIN - 1.8, 9, SHIN, -2.7, SHIN, -1.9, SHIN - 4.6], 'ink'),
    flat([-2.7, SHIN - 1.4, 9, SHIN - 1.4, 9, SHIN, -2.7, SHIN], 'inkDark'),
    stroke([2, SHIN - 4, 8.8, SHIN - 1.9], 1.4, 'rim'),
  ],
});

/** An arm: a pull of the body's own stuff, thick at the shoulder and thin at the hand, that stretches to wherever the pipe is. */
const arm = (name: string, x: number, y: number, z: number, lit: boolean): PartDef => ({
  name,
  parent: 'torso',
  x,
  y,
  z,
  shapes: lit ? [flat(limb(ARM, 3.7, 2.5), 'ink'), stroke([3.5, 1, 2.5, ARM - 1], 1.2, 'rim', 0.8)] : [flat(limb(ARM, 3.7, 2.5), 'ink')],
});

const parts: PartDef[] = [
  { name: 'hips', x: 0, y: -LEG, shapes: [] },
  thigh('thighFar', -2.5, -4),
  shin('shinFar', 'thighFar'),
  thigh('thighNear', 3, -2),
  shin('shinNear', 'thighNear'),
  // everything above the legs leans as one; it has no shape of its own
  { name: 'torso', parent: 'hips', x: 0, y: 0, z: 1, shapes: [] },
  {
    // a coat-tail at the back; it follows every movement late
    name: 'tail',
    parent: 'torso',
    x: TAIL_X,
    y: TAIL_Y,
    z: -3,
    shapes: [...block(tailOutline, { fill: 'ink', shade: 'inkDark', shadeFrom: 0.6, rim: 'rim', rimWidth: 1.5 })],
  },
  arm('armFar', FAR_X, FAR_Y, -2, false),
  {
    // the body: a narrow pear, like a cloak hanging from the neck
    name: 'body',
    parent: 'torso',
    x: 0,
    y: 0,
    z: 0,
    shapes: [...block(bodyOutline, { fill: 'ink', shade: 'inkDark', shadeFrom: BODY_SHADE, rim: 'rim', rimWidth: 2 })],
  },
  {
    // the chest: it fills like a bellows before the Piper plays, and empties in one go
    name: 'chest',
    parent: 'torso',
    x: CHEST_X,
    y: CHEST_Y,
    z: 1,
    shapes: [flat(chestOutline, 'ink'), flat(clipBelow(chestOutline, 0), 'inkDark'), stroke(chestRim, 1.8, 'rim')],
  },
  {
    // the reed pipe, drawn pointing along +x from the grip, with a flared end
    name: 'pipe',
    parent: 'torso',
    x: PIPE_X,
    y: PIPE_Y,
    z: 2,
    rot: PIPE_REST,
    shapes: [
      ...block(pipeOutline, { fill: 'reed', shade: 'reedShade', shadeFrom: 0.6, rim: 'rim', rimWidth: 1.2 }),
      // the reed it blows through, and the joints of the cane
      flat([-PIPE_BACK, -2.1, -PIPE_BACK + 3, -2.15, -PIPE_BACK + 3, 2.15, -PIPE_BACK, 2.1], 'reedShade'),
      flat([9.5, -2.4, 11.2, -2.45, 11.2, 2.45, 9.5, 2.4], 'reedShade'),
      flat([19, -2.65, 20.7, -2.7, 20.7, 2.7, 19, 2.65], 'reedShade'),
    ],
  },
  {
    name: 'neck',
    parent: 'torso',
    x: NECK_X,
    y: NECK_Y,
    z: 3,
    rot: NECK_REST,
    shapes: [flat(upward(limb(NECK_LEN, 4.1, 3.5)), 'ink'), stroke([-3.9, -1, -3.4, -NECK_LEN + 1], 1.3, 'rim', 0.85)],
  },
  {
    name: 'neck2',
    parent: 'neck',
    x: 0,
    y: -NECK_LEN,
    z: 0,
    rot: NECK2_REST,
    // the back of the neck faces the light
    shapes: [flat(upward(limb(NECK2_LEN, 3.5, 3.1)), 'ink'), stroke([-3.4, -1, -3, -NECK2_LEN + 1], 1.3, 'rim', 0.85)],
  },
  {
    name: 'head',
    parent: 'neck2',
    x: 0,
    y: -NECK2_LEN,
    z: 1,
    rot: HEAD_REST,
    shapes: [
      ...block(headOutline, { fill: 'ink', shade: 'inkDark', shadeFrom: 0.76, rim: 'rim', rimWidth: 2 }),
      // one bright eye that fills the face, its pupil leading the way it looks
      flat(ell(5.9, -6, 5.6, 6.2, 16), 'eye', 1, 'front'),
      flat(ell(8.4, -5.6, 2.5, 3.3, 10), 'pupil', 1, 'front'),
      // seen from behind: only a pale glint on the hood
      flat(ell(-2.4, -7.8, 2, 2.8, 8), 'rim', 0.35, 'back'),
    ],
  },
  {
    // the point of the hood, hanging down the back of the head; it lags behind everything
    name: 'crest',
    parent: 'head',
    x: -4.2,
    y: -11.4,
    z: -1,
    shapes: [...block(crestOutline, { fill: 'ink', rim: 'rim', rimWidth: 1.7 })],
  },
  arm('armNear', NEAR_X, NEAR_Y, 4, true),
];

export const PIPER_RIG: RigDef = {
  id: 'piper',
  parts,
  palette,
  footprint: 0.36,
  height: 70,
  states: ENEMY_STATES,
};

// ---------------------------------------------------------------- animation helpers

/** Scale of a part that is not there yet. */
const GONE = 0.01;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Progress 0..1 of t through the window from a to b. */
const span = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const ease = (t: number): number => t * t * (3 - 2 * t);

/** How far below the hip a leg reaches: to its foot, or to its knee if that is lower. */
function drop(hip: number, knee: number): number {
  const toKnee = THIGH * cos(hip);
  return Math.max(toKnee, toKnee + SHIN * cos(hip + knee));
}

/**
 * Pose both legs: swing each thigh from the hip and fold each shin at the knee (positive is
 * toward the back), then stand the hips on whichever leg reaches lower, `lift` above the floor.
 */
function legs(p: PoseWriter, hipNear: number, kneeNear: number, hipFar: number, kneeFar: number, lift = 0): void {
  p.part('thighNear').rot = hipNear;
  p.part('shinNear').rot = kneeNear;
  p.part('thighFar').rot = hipFar;
  p.part('shinFar').rot = kneeFar;
  p.part('hips').y = LEG - Math.max(drop(hipNear, kneeNear), drop(hipFar, kneeFar)) - lift;
}

/** Put one thing that grows out of the body where the body has it this frame, whatever size the body is. */
function seat(q: PartPose, body: PartPose, x: number, y: number): void {
  q.x = x * (body.sx - 1) + body.x;
  q.y = y * (body.sy - 1) + body.y;
}

/** Seat the neck, the chest, the shoulders and the tail on the body. Size the body first. */
function ride(p: PoseWriter): void {
  const body = p.part('body');
  seat(p.part('neck'), body, NECK_X, NECK_Y);
  seat(p.part('chest'), body, CHEST_X, CHEST_Y);
  seat(p.part('armNear'), body, NEAR_X, NEAR_Y);
  seat(p.part('armFar'), body, FAR_X, FAR_Y);
  seat(p.part('tail'), body, TAIL_X, TAIL_Y);
}

/**
 * Fill the chest (k above 0, up to 1 for a full breath): it balloons out to the front and up
 * to the throat. Below 0 the breath is all out, and the body itself draws in.
 */
function breathe(p: PoseWriter, k: number): void {
  const full = Math.max(0, k);
  const chest = p.part('chest');
  chest.sx = 1 + 0.95 * full;
  chest.sy = 1 + 0.5 * full;
  p.part('body').sx = 1 + 0.07 * k;
  ride(p);
}

/** Bend the neck: its lower bone, its upper bone, and the nod of the head. Positive leans forward. */
function curl(p: PoseWriter, low: number, high: number, nod: number): void {
  p.part('neck').rot = low;
  p.part('neck2').rot = high;
  p.part('head').rot = nod;
}

/** Stretch an arm from its shoulder to a point, both in the torso's space. */
function reach(q: PartPose, sx: number, sy: number, tx: number, ty: number): void {
  const dx = tx - sx;
  const dy = ty - sy;
  q.rot = Math.atan2(dy, dx) - HALF_PI;
  q.sy = Math.min(3, Math.max(0.3, Math.hypot(dx, dy) / ARM));
}

const mouth = { x: 0, y: 0 };

/** Where the mouth is this frame, in the torso's space: follow the neck up from the body. Pose the neck first. */
function findMouth(p: PoseWriter): void {
  const n = p.part('neck');
  const a1 = NECK_REST + n.rot;
  const a2 = a1 + NECK2_REST + p.part('neck2').rot;
  const a3 = a2 + HEAD_REST + p.part('head').rot;
  mouth.x = NECK_X + n.x + NECK_LEN * sin(a1) + NECK2_LEN * sin(a2) + MOUTH_X * cos(a3) - MOUTH_Y * sin(a3);
  mouth.y = NECK_Y + n.y - NECK_LEN * cos(a1) - NECK2_LEN * cos(a2) + MOUTH_X * sin(a3) + MOUTH_Y * cos(a3);
}

/**
 * Put the pipe in the hands. Carried low, its grip is at (lx, ly) off its rest place and it
 * points `lang` off its rest angle. `raise` (0..1) brings it from there to the mouth, pointing
 * along `aim` (rig space: 0 is the way it faces, negative is up) and pushed out by `slide`.
 * With `both` the far hand holds it too. Pose the legs, the torso, the body and the neck first.
 */
function hold(p: PoseWriter, lx: number, ly: number, lang: number, raise = 0, aim = 0, slide = 0, both = true): void {
  findMouth(p);
  const torso = p.part('torso');
  const up = aim - torso.rot;
  const out = PIPE_BACK + slide;
  const lowX = PIPE_X + lx;
  const lowY = PIPE_Y + ly;
  const lowAng = PIPE_REST + lang;
  const gx = lowX + (mouth.x + cos(up) * out - lowX) * raise;
  const gy = lowY + (mouth.y + sin(up) * out - lowY) * raise;
  let ang = lowAng + (up - lowAng) * raise;
  // The flared end rests on the floor rather than going through it: find how high the grip is
  // and how steeply the pipe can point down from there.
  const gripHeight = LEG - p.part('hips').y - torso.y - gx * sin(torso.rot) - gy * cos(torso.rot);
  const dip = (gripHeight - PIPE_CLEAR) / PIPE_TIP;
  if (dip < 1) ang = Math.min(ang, Math.asin(Math.max(-1, dip)) - torso.rot);
  const pipe = p.part('pipe');
  pipe.x = gx - PIPE_X;
  pipe.y = gy - PIPE_Y;
  pipe.rot = ang - PIPE_REST;
  const near = p.part('armNear');
  reach(near, NEAR_X + near.x, NEAR_Y + near.y, gx, gy);
  if (both) {
    const far = p.part('armFar');
    reach(far, FAR_X + far.x, FAR_Y + far.y, gx + cos(ang) * FAR_GRIP, gy + sin(ang) * FAR_GRIP);
  }
}

/**
 * Facing away it shows its back: the chest, the pipe and both hands are on the far side of the
 * body, the coat-tail and the point of the hood on the near side.
 */
function turnAway(p: PoseWriter): void {
  p.part('chest').z = -2.5;
  p.part('pipe').z = -4.5;
  p.part('armNear').z = -6;
  p.part('armFar').z = -1.5;
  p.part('tail').z = 4;
  p.part('crest').z = 2;
}

// ---------------------------------------------------------------- states

function spawn(p: PoseWriter, a: AnimInput): void {
  // Wells up out of a puddle: the body first, flat and wide; then the legs lift it, the neck
  // uncoils out of it, and last of all it draws the pipe out.
  const t = a.phase;
  const rise = span(t, 0, 0.6);
  const over = sin(span(t, 0.6, 1) * Math.PI) * 0.1;
  const body = p.part('body');
  body.sy = 0.08 + 0.92 * rise * rise + over;
  body.sx = 1.9 - 0.9 * rise - over * 0.6;
  p.part('chest').sy = body.sy;
  ride(p);
  const up = Math.max(GONE, ease(span(t, 0.4, 0.74)));
  const stiltNear = p.part('thighNear');
  const stiltFar = p.part('thighFar');
  stiltNear.sy = up;
  stiltFar.sy = up;
  stiltNear.sx = Math.min(1, up * 4);
  stiltFar.sx = stiltNear.sx;
  p.part('hips').y = LEG * (1 - up);
  const tail = p.part('tail');
  tail.sy = Math.max(GONE, span(t, 0.3, 0.6));
  tail.sx = tail.sy;
  tail.rot = 0.9 * (1 - span(t, 0.3, 0.85));
  const out = span(t, 0.34, 0.86);
  const neck = p.part('neck');
  const grown = out <= 0 ? GONE : 0.2 + 0.8 * easeOut(out) + sin(out * Math.PI) * 0.14;
  neck.sx = grown;
  neck.sy = grown;
  const coil = 1 - ease(out);
  curl(p, 1.3 * coil, 0.9 * coil, 0.5 * coil);
  p.part('crest').rot = -0.9 * coil + sin(span(t, 0.7, 1) * Math.PI) * 0.5;
  hold(p, 0, 0, 0.25 * (1 - span(t, 0.6, 1)));
  const reed = Math.max(GONE, easeOut(span(t, 0.58, 0.95)));
  const pipe = p.part('pipe');
  pipe.sx = reed;
  pipe.sy = reed;
  const arms = span(t, 0.5, 0.7);
  const near = p.part('armNear');
  const far = p.part('armFar');
  near.sy = Math.max(GONE, near.sy * arms);
  far.sy = Math.max(GONE, far.sy * arms);
  near.sx = Math.max(GONE, arms);
  far.sx = Math.max(GONE, arms);
}

function idle(p: PoseWriter, a: AnimInput): void {
  // Sways and breathes, the pipe low at its side, the neck slowly curling up and letting go.
  const ph = a.time * 2.1 + a.seed * TURN;
  const b = sin(ph);
  const c = sin(ph * 0.7 + 1.3);
  // its weight shifts over its feet, which stay where they are
  const sway = sin(ph * 0.5) * 1.3;
  legs(p, sway / LEG, 0, sway / LEG, 0);
  p.part('hips').x = sway;
  p.part('torso').rot = sin(ph * 0.5 + 0.5) * 0.04;
  breathe(p, 0.07 + b * 0.07);
  curl(p, -0.2 * c, 0.42 * c, -0.22 * c + sin(ph * 0.5 + 2.6) * 0.06);
  p.part('crest').rot = sin(ph * 0.7 + 0.2) * 0.24;
  p.part('tail').rot = sin(ph * 0.5 - 0.9) * 0.14;
  hold(p, sin(ph * 0.5) * 0.6, -b * 0.7, sin(ph * 0.5 + 2) * 0.07);
}

function move(p: PoseWriter, a: AnimInput): void {
  // A light, prissy prance: each knee picked up high under a body that glides, chest out, the
  // head held up and leading each step the way a wading bird's does. It steps the same whether
  // it is closing in, backing off or sidling.
  const ph = a.stride * 7 + a.seed * TURN;
  const s = sin(ph);
  const c = cos(ph);
  const liftNear = Math.max(0, c);
  const liftFar = Math.max(0, -c);
  legs(p, -0.28 * s - 0.5 * liftNear, 1.5 * liftNear, 0.28 * s - 0.5 * liftFar, 1.5 * liftFar);
  p.part('torso').rot = -0.06 + sin(ph * 2) * 0.015;
  breathe(p, 0.22);
  const lead = sin(ph * 2 + 0.6);
  curl(p, 0.12 + 0.1 * lead, -0.28 - 0.2 * lead, 0.08 + 0.1 * lead);
  p.part('crest').rot = 0.3 + sin(ph * 2 - 0.9) * 0.3;
  p.part('tail').rot = 0.3 + sin(ph * 2 - 1.4) * 0.25;
  hold(p, 0.5, -1.5 + sin(ph * 2 - 0.5) * 0.8, -0.12 + sin(ph * 2 - 1.1) * 0.07);
}

function windup(p: PoseWriter, a: AnimInput): void {
  // The warning: the pipe comes up to the mouth and points the way it faces, and it breathes
  // in. The chest fills, the neck draws back, and it all trembles harder as the moment comes.
  const t = a.phase;
  const e = easeOut(t);
  const up = ease(span(t, 0, 0.3));
  const shake = t * t;
  const j1 = sin(a.t * 68) * shake;
  const j2 = sin(a.t * 53 + 1.4) * shake;
  legs(p, -0.2 * e, 0.12 * e, 0.24 * e, 0);
  const torso = p.part('torso');
  torso.rot = -0.17 * e;
  torso.x = -2 * e + j1 * 0.8;
  breathe(p, e + j2 * 0.07);
  // the neck folds back on itself like a heron's before it strikes, the head tipped up along the pipe
  curl(p, -0.6 * e, 0.75 * e + j1 * 0.04, -0.4 * e + j2 * 0.05);
  p.part('crest').rot = 0.75 * e + j1 * 0.2;
  p.part('tail').rot = -0.35 * e + j2 * 0.14;
  hold(p, 0, 0, 0, up, -0.22 * e + j1 * 0.07);
}

function attack(p: PoseWriter, a: AnimInput): void {
  // Three sharp notes at once: the chest snaps flat, the head darts and the pipe kicks forward.
  const t = a.phase;
  const k = easeOut(span(t, 0, 0.3)) - 0.3 * span(t, 0.5, 1);
  legs(p, -0.2 - 0.25 * k, 0.12 + 0.3 * k, 0.24 + 0.2 * k, 0);
  const torso = p.part('torso');
  torso.rot = -0.17 + 0.45 * k;
  torso.x = -2 + 5 * k;
  breathe(p, 1 - 2 * k);
  curl(p, -0.6 + 0.85 * k, 0.75 - 1.1 * k, -0.4 + 0.6 * k);
  const crest = p.part('crest');
  crest.rot = 0.75 - 0.3 * k;
  crest.sx = 1 + 0.3 * k;
  p.part('tail').rot = -0.35 + 1.0 * k;
  hold(p, 0, 0, 0, 1, -0.22 + 0.28 * k, 7 * k);
  // the note goes down the pipe: it swells for an instant
  const blast = sin(span(t, 0, 0.6) * Math.PI);
  p.part('pipe').sy = 1 + 0.6 * blast;
}

function recover(p: PoseWriter, a: AnimInput): void {
  // Out of breath: the pipe drops, the body sags over it and pants. This is when it can be punished.
  const t = a.phase;
  const drop = easeOut(span(t, 0, 0.22));
  const k = drop * (1 - ease(span(t, 0.72, 1)));
  const pant = sin(a.t * 19) * k;
  legs(p, -0.42 * k, 0.8 * k, -0.3 * k, 0.62 * k);
  const torso = p.part('torso');
  torso.rot = 0.3 * k + pant * 0.025;
  torso.x = 2 * k;
  breathe(p, 0.22 * k + pant * 0.22);
  curl(p, 0.45 * k, 0.4 * k, 0.35 * k + pant * 0.07);
  p.part('crest').rot = -0.7 * k + pant * 0.12;
  p.part('tail').rot = -0.25 * k + pant * 0.06;
  hold(p, 1.5 * k, 2.5 * k, 0.1 * k, 1 - drop, 0.06, 7 * (1 - drop));
}

function hurt(p: PoseWriter, a: AnimInput): void {
  // A flinch: the body is knocked back, the head is left behind on its long neck, the pipe flies up.
  const k = Math.max(0, 1 - a.t / 0.2);
  legs(p, -0.5 * k, 0.3 * k, 0.25 * k, 0, 2.5 * k);
  const torso = p.part('torso');
  torso.rot = -0.32 * k;
  torso.x = -4 * k;
  breathe(p, -0.5 * k);
  curl(p, 0.42 * k, 0.36 * k, 0.3 * k);
  p.part('crest').rot = 1.3 * k;
  p.part('tail').rot = -0.7 * k;
  hold(p, 3 * k, -9 * k, -1.0 * k);
}

function stun(p: PoseWriter, a: AnimInput): void {
  // Dazed: tottering on its stilts, the head tipped back and lolling round on the end of its
  // neck, the pipe hanging from one hand with its end dragging on the floor.
  const w = a.t * 6.5;
  const s = sin(w);
  const s2 = sin(w + 1.3);
  // the feet stay put while the hips go round over them
  const totter = s * 2.6;
  legs(p, totter / LEG - 0.12, 0.24, totter / LEG + 0.14, 0.2);
  p.part('hips').x = totter;
  const torso = p.part('torso');
  torso.rot = -0.04 + s2 * 0.2;
  breathe(p, 0.12 + s2 * 0.1);
  curl(p, -0.12 + sin(w + 2.1) * 0.3, -0.15 + sin(w + 3.3) * 0.36, -0.15 + sin(w + 4.5) * 0.3);
  p.part('crest').rot = 0.5 + sin(w + 4.7) * 0.6;
  p.part('tail').rot = -0.1 + sin(w + 2.4) * 0.35;
  hold(p, -2.5 + s * 1.5, 1.5, 0.5, 0, 0, 0, false);
  const loose = p.part('armFar');
  loose.rot = 0.15 + sin(w + 2.6) * 0.45;
  loose.sy = 0.9;
}

function launched(p: PoseWriter, a: AnimInput): void {
  // Sent flying: all neck and legs, kicking, the pipe waved about in one hand as it tumbles.
  const w = a.t * 24 + a.seed * TURN;
  const s = sin(w);
  const c = cos(w);
  legs(p, -0.9 + s * 0.55, 0.9 + c * 0.5, 0.8 - s * 0.55, 0.7 - c * 0.5);
  p.part('hips').y = 0;
  p.part('torso').rot = s * 0.08;
  breathe(p, 0.3 + s * 0.12);
  curl(p, c * 0.5, -0.3 + s * 0.6, -c * 0.4);
  p.part('crest').rot = 0.4 + c * 0.9;
  p.part('tail').rot = 0.3 - s * 0.9;
  hold(p, 2.5 + c * 2, -9 + s * 3, -1.5 + s * 1.2, 0, 0, 0, false);
  const flung = p.part('armFar');
  flung.rot = 1.9 + c * 0.7;
  flung.sy = 1.2;
}

function dead(p: PoseWriter, a: AnimInput): void {
  // Bursts: a last swell, then the legs go from under it and it pours out flat, the neck last,
  // the pipe clattering down beside it.
  const t = Math.min(1, a.t / 0.42);
  const swell = span(t, 0, 0.2);
  const fall = span(t, 0.2, 1);
  const e = easeOut(fall);
  const body = p.part('body');
  body.sy = 1 + 0.16 * swell - 1.06 * e;
  body.sx = 1 + 0.12 * swell + 0.9 * e;
  const chest = p.part('chest');
  chest.sx = 1 + 0.9 * swell - 0.5 * e;
  chest.sy = Math.max(GONE, (1 + 0.5 * swell) * (1 - e));
  ride(p);
  // the stilts slide apart, one forward and one back, until it is sitting on the floor with
  // both toes turned up
  legs(p, -1.5 * e, 0.07 * e, 1.5 * e, -0.07 * e);
  p.part('shinFar').sx = 1 - 2 * ease(span(fall, 0, 0.45));
  const hips = p.part('hips');
  const neck = p.part('neck');
  neck.sx = 1 - 0.3 * e;
  curl(p, 1.75 * e, -0.55 * e, 0.15 * e);
  const head = p.part('head');
  head.sx = 1 - 0.5 * e;
  head.sy = 1 + 0.25 * e;
  p.part('crest').rot = 0.5 * e;
  p.part('tail').rot = 1.3 * e;
  // the pipe drops out of its hands and comes to rest on the floor ahead
  hold(p, 9 * e, (LEG - 2.5 - PIPE_Y - hips.y) * e - sin(fall * Math.PI) * 5, -PIPE_REST * e, 0, 0, 0, false);
  const near = p.part('armNear');
  near.sy = 1 - 0.4 * e;
  near.rot = -1.3 * e;
  const far = p.part('armFar');
  far.sy = 1 - 0.4 * e;
  far.rot = 1.3 * e;
}

function pose(p: PoseWriter, a: AnimInput): number {
  switch (a.state) {
    case 'spawn':
      spawn(p, a);
      return 60;
    case 'move':
      move(p, a);
      return 24;
    case 'windup':
      windup(p, a);
      return 50;
    case 'attack':
      attack(p, a);
      return 70;
    case 'recover':
      recover(p, a);
      return 34;
    case 'hurt':
      hurt(p, a);
      return 60;
    case 'stun':
      stun(p, a);
      return 26;
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
}

export const piperAnimator: Animator = (p, a) => {
  const rate = pose(p, a);
  if (a.away) turnAway(p);
  return rate;
};

/** What the registry gathers: this file is the whole of the rig, and nothing else lists it. */
const ENTRY: RigEntry = { def: PIPER_RIG, animator: piperAnimator, required: ENEMY_STATES, variants: {} };
export default ENTRY;
