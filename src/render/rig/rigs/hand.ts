// The Hand, the Fist Returner: the broadest and most grounded of the three. Bare shoulders and
// thick bare arms over a rust chest wrap, short legs set wide, a topknot, and two gauntlets like
// drumheads that are most of the silhouette.
// Pixi-free: a RigDef plus a pure animator, on the shared hero skeleton.
//
// HOW IT MOVES. Every pose is built the same way: the body first (hips, lean, head), then each
// fist is put at a point and its arm turns and stretches to reach it, and last the feet are
// planted under the hips. So a fist can be sent along the aim, held on the chest or set down on
// the floor, and the feet never slide while the weight moves over them.
import { HERO, PLAYER_COLORS, RIM } from '../../palette';
import { block, clipBelow, ell, flat, smooth, stroke } from '../def';
import type { AnimInput, Animator, PartDef, PartPose, PoseWriter, RigDef, RigEntry, ShapeDef } from '../def';
import { ARM_FAR_REST, ARM_LENGTH, ARM_NEAR_REST, SHOULDER_Y, armAngle, armPart, dashPose, downPose, ease, hurtPose, lerp, locomotion, pointArm } from '../hero';
import { FIST_STATES } from '../states';

const HALF_PI = Math.PI / 2;
const TURN = Math.PI * 2;

const palette: Record<string, number> = {
  skin: HERO.skin,
  skinShade: HERO.skinShade,
  dark: HERO.dark,
  darkShade: HERO.darkShade,
  wrap: HERO.wrap,
  wrapShade: HERO.wrapShade,
  hide: HERO.hide,
  hideShade: HERO.hideShade,
  rim: RIM,
  // the seat colour: the view replaces it per player
  accent: PLAYER_COLORS[0],
};

const skin = { fill: 'skin', shade: 'skinShade', rim: 'rim' };

/** Leg length. Shorter than the other two heroes. */
const LEG = 28;
/** How far each hip is from the middle: the legs are set wide. */
const HIP_X = 7.5;
/** How far out from the spine each shoulder sits. */
const SHOULDER_X = 13;
/** How much thicker than the others' the arms are. */
const ARM_THICK = 1.7;
/** Where the sole meets the floor, ahead of the ankle and behind it. */
const SOLE_TOE = 9;
const SOLE_HEEL = 3;

/** A short thick leg: a baggy trouser gathered into a wrapped shin and foot. Drawn hanging down. */
function leg(name: string, x: number, z: number): PartDef {
  return {
    name,
    parent: 'hips',
    x,
    y: 0,
    z,
    shapes: [
      ...block(smooth([-5.6, -2, 6, -2, 7, 8, 5, 18.5, -4.4, 18.5, -6.6, 8], 1), { fill: 'dark', shade: 'darkShade', shadeFrom: 0.5 }),
      ...block(smooth([-4.3, 16.5, 4.7, 16.5, 5.2, 22.4, 11.5, 24.4, 11.5, LEG, -4.8, LEG], 1), { fill: 'wrap', shade: 'wrapShade', shadeFrom: 0.6, rim: 'rim', rimWidth: 1.4 }),
    ],
  };
}

/** The binding round each wrist, where the gauntlet is tied on. */
const binding: ShapeDef[] = [flat([-5.5, 10.5, 5.5, 10.5, 5.2, 18.2, -5.2, 18.2], 'wrap'), stroke([-5.3, 12.3, 5.3, 13.3], 1, 'wrapShade', 0.9)];

/** The round of a shoulder. It sits on the chest over the top of its arm and does not turn with it. */
function cap(name: string, x: number, z: number): PartDef {
  return {
    name,
    parent: 'torso',
    x,
    y: SHOULDER_Y,
    z,
    shapes: [...block(ell(0, -0.5, 6.8, 6.6, 14), { fill: 'skin', shade: 'skinShade', shadeFrom: 0.68, rim: 'rim', rimWidth: 1.4 })],
  };
}

/**
 * A gauntlet, at the end of an arm: a small drum bound over the fist. The laced shell is toward
 * the wrist, the hoop carries the seat colour, and the pale head is the end that lands.
 */
function gauntlet(name: string, arm: string): PartDef {
  const shell = smooth([-6, -6.8, 6, -6.8, 7.4, -3.2, 7.4, 1, -7.4, 1, -7.4, -3.2], 1);
  const head = smooth([-7.4, 0.2, 7.4, 0.2, 7.1, 4.2, 4.3, 7.3, 0, 8, -4.3, 7.3, -7.1, 4.2], 1);
  return {
    name,
    parent: arm,
    x: 0,
    y: ARM_LENGTH,
    z: 1,
    shapes: [
      flat(shell, 'hideShade'),
      stroke([-6.4, -0.8, -4.3, -5.6, -2.1, -0.8, 0, -6.1, 2.1, -0.8, 4.3, -5.6, 6.4, -0.8], 1.1, 'wrapShade'),
      flat(head, 'hide'),
      flat([-7.9, -1.7, 7.9, -1.7, 8.1, 1.5, -8.1, 1.5], 'accent'),
    ],
  };
}

const chest = smooth([-9.6, 3.5, 10, 3.5, 11.2, -5, 14.6, -14, 16.4, -22, 15.6, -28, 8, -33.5, -6.5, -33.5, -14.6, -28, -15.8, -22, -14.2, -14, -11, -5], 1);
const sashTail = smooth([-3, 0, 0.5, 1, -3.5, 10, -9, 12, -8, 7], 1);

const parts: PartDef[] = [
  {
    // the root, at the top of the legs; its own shape is the seat of the trousers, over the hip joints
    name: 'hips',
    x: 0,
    y: -LEG,
    shapes: [flat(smooth([-12.8, -3, 13.2, -3, 12.4, 5.5, 3, 10, -2.5, 10, -12, 5.5], 1), 'dark')],
  },
  {
    // the knot of the sash at the back of the waist and the top of its tails; they trail every movement
    name: 'sash',
    parent: 'hips',
    x: -10,
    y: -3.5,
    z: -3,
    shapes: [flat(sashTail, 'accent'), flat(sashTail, 'dark', 0.28), flat(smooth([-2.4, 0.5, 2.6, 0.5, 1.4, 11.5, -4.4, 11], 1), 'accent'), flat(ell(0, 0, 3.4, 3, 10), 'accent')],
  },
  {
    // the loose end of the longer tail: it follows the sash, later still
    name: 'sashTip',
    parent: 'sash',
    x: -1.5,
    y: 10.5,
    z: -1,
    shapes: [flat(smooth([-3, -1, 2.8, -0.5, 1.2, 10, -2.6, 14, -5.4, 10.5], 1), 'accent')],
  },
  leg('legFar', -HIP_X, -2),
  leg('legNear', HIP_X, -1),
  {
    name: 'torso',
    parent: 'hips',
    x: 0,
    y: 0,
    z: 2,
    shapes: [
      // bare shoulders over a wrapped chest
      ...block(chest, { fill: 'skin', rim: 'rim', rimWidth: 1.8 }),
      ...block(clipBelow(chest, -18.5), { fill: 'wrap', shade: 'wrapShade', shadeFrom: 0.34 }),
      stroke([-14.4, -15.5, 15, -16.6], 1.2, 'wrapShade', 0.9),
      stroke([4.5, -32, 3, -25.5, 11.5, -22.2], 1.3, 'skinShade', 0.9, 'front'),
      stroke([-7, -30.5, 0, -24.5, 7, -30.5], 1.3, 'skinShade', 0.9, 'back'),
      // the sash carries the seat colour
      flat([-11.6, -6.5, 12, -6.5, 10.8, 3.5, -10.4, 3.5], 'accent'),
      flat([-10.9, -0.5, 11.3, -0.5, 10.8, 3.5, -10.4, 3.5], 'dark', 0.22),
    ],
  },
  {
    name: 'head',
    parent: 'torso',
    x: 2,
    y: -31,
    z: 3,
    shapes: [
      // a bare head: heavy brow and a short beard toward the camera, nothing but skull from behind
      ...block(ell(0.5, -8.4, 8.2, 8.6, 18), { fill: 'skin', shade: 'skinShade', shadeFrom: 0.66, rim: 'rim', rimWidth: 1.4, view: 'front' }),
      flat(smooth([-2.6, -4.6, 2.5, -3.2, 8.9, -5.6, 9, -1.8, 5.2, 1.4, -0.6, 0.6, -3.8, -2], 1), 'dark', 1, 'front'),
      stroke([1.6, -11.3, 8.6, -10.1], 1.9, 'dark', 1, 'front'),
      flat(ell(5.6, -8, 1.3, 1.6, 8), 'dark', 1, 'front'),
      ...block(ell(-0.3, -8.6, 8.4, 8.8, 18), { fill: 'skin', shade: 'skinShade', shadeFrom: 0.64, rim: 'rim', rimWidth: 1.4, view: 'back' }),
    ],
  },
  {
    // the topknot, tied in the seat colour; it nods a moment after the head does
    name: 'knot',
    parent: 'head',
    x: -1,
    y: -16.4,
    z: 1,
    shapes: [
      flat(smooth([-1.5, -5.5, -7.5, -11.5, -11.5, -8.5, -6, -2.6], 1), 'dark'),
      ...block(smooth([-4.4, 0.6, -5.2, -4.6, -1.6, -8.8, 3.6, -8, 5.2, -3.2, 4, 0.9], 1), { fill: 'dark', rim: 'rim', rimWidth: 1.3 }),
      flat([-4.1, -1.3, 3.9, -1.3, 4.2, 1.4, -4.4, 1.4], 'accent'),
    ],
  },
  armPart('armFar', -SHOULDER_X, -1, ARM_FAR_REST, skin, 'wrap', ARM_THICK, binding),
  cap('capFar', -SHOULDER_X, -0.9),
  gauntlet('fistFar', 'armFar'),
  armPart('armNear', SHOULDER_X, 4, ARM_NEAR_REST, skin, 'wrap', ARM_THICK, binding),
  cap('capNear', SHOULDER_X, 4.1),
  gauntlet('fistNear', 'armNear'),
];

export const HAND_RIG: RigDef = {
  id: 'hand',
  parts,
  palette,
  footprint: 0.38,
  height: 88,
  states: FIST_STATES,
};

// ---------------------------------------------------------------- arms and fists

type Arm = 'armNear' | 'armFar';
const FIST: Record<Arm, string> = { armNear: 'fistNear', armFar: 'fistFar' };
const CAP: Record<Arm, string> = { armNear: 'capNear', armFar: 'capFar' };
const SIDE: Record<Arm, number> = { armNear: 1, armFar: -1 };

/** How short an arm may fold and how long it may stretch, as a share of its length. */
const MIN_REACH = 0.35;
const MAX_REACH = 1.65;

/** An angle brought to within half a turn of zero. */
const wrap = (angle: number): number => angle - TURN * Math.round(angle / TURN);

/** Where a fist is from its own shoulder this frame, in rig axes: x the way the hero faces, y down. */
const fistX = (p: PoseWriter, arm: Arm): number => Math.cos(armAngle(p, arm)) * p.part(arm).sy * ARM_LENGTH;
const fistY = (p: PoseWriter, arm: Arm): number => Math.sin(armAngle(p, arm)) * p.part(arm).sy * ARM_LENGTH;

/**
 * Put a fist at (dx, dy) from its shoulder, in rig axes. The arm turns to point at it and
 * stretches or folds to reach; the gauntlet keeps its size. Lean the torso first: the arm
 * allows for the lean it finds.
 */
function put(p: PoseWriter, arm: Arm, dx: number, dy: number): void {
  const reach = Math.max(MIN_REACH, Math.min(MAX_REACH, Math.hypot(dx, dy) / ARM_LENGTH));
  pointArm(p, arm, Math.atan2(dy, dx));
  p.part(arm).sy = reach;
  const fist = p.part(FIST[arm]);
  fist.rot = 0;
  fist.sx = 1;
  fist.sy = 1 / reach;
}

/** Where a shoulder is this frame, measured from the hero's feet. */
function shoulderX(p: PoseWriter, arm: Arm): number {
  const torso = p.part('torso');
  const lx = SIDE[arm] * SHOULDER_X + p.part(arm).x;
  const ly = SHOULDER_Y + p.part(arm).y;
  return p.part('hips').x + torso.x + lx * Math.cos(torso.rot) - ly * Math.sin(torso.rot);
}
function shoulderY(p: PoseWriter, arm: Arm): number {
  const torso = p.part('torso');
  const lx = SIDE[arm] * SHOULDER_X + p.part(arm).x;
  const ly = SHOULDER_Y + p.part(arm).y;
  return -LEG + p.part('hips').y + torso.y + lx * Math.sin(torso.rot) + ly * Math.cos(torso.rot);
}

/**
 * Turn a gauntlet on its wrist, by an angle from the line of its arm, so the drumhead can face
 * the target while the arm points somewhere else. Call it after put().
 */
function twist(p: PoseWriter, arm: Arm, angle: number): void {
  const reach = p.part(arm).sy;
  const fist = p.part(FIST[arm]);
  const across = Math.sin(angle) * Math.sin(angle);
  fist.rot = angle;
  // the arm's stretch has to be undone along whichever of the gauntlet's axes now lies along it
  fist.sx = Math.pow(reach, -across);
  fist.sy = Math.pow(reach, across - 1);
}

/** The turn that brings a gauntlet round to face `angle`, the same way round whatever the arm is doing. */
function wristTurn(p: PoseWriter, arm: Arm, angle: number): number {
  let r = (angle - armAngle(p, arm)) % TURN;
  if (r <= -HALF_PI) r += TURN;
  else if (r > 3 * HALF_PI) r -= TURN;
  return r;
}

/** Widen and lengthen a gauntlet: across its drumhead by `wide`, along its arm by `long`. */
function squash(p: PoseWriter, arm: Arm, wide: number, long: number): void {
  const fist = p.part(FIST[arm]);
  fist.sx *= wide;
  fist.sy *= long;
}

/** A gauntlet swells as it lands, or as force gathers in it. */
function swell(p: PoseWriter, arm: Arm, k: number): void {
  squash(p, arm, k, k);
}

/** Slide a shoulder across the chest, as the torso turns: the arm and the round of the shoulder go together. */
function turn(p: PoseWriter, arm: Arm, dx: number): void {
  p.part(arm).x += dx;
  p.part(CAP[arm]).x += dx;
}

/**
 * Draw order for the far arm. Toward the camera it works in front of the chest, but the head is
 * nearer still; seen from behind it is on the other side of the body, where the rig rests it.
 */
function farArmForward(p: PoseWriter, a: AnimInput): void {
  if (a.away) return;
  p.part('armFar').z = 3.5;
  p.part('capFar').z = 3.5;
}

/** Draw order for a near arm drawn back past the head: toward the camera the face stays in front of it. */
function nearArmBehindHead(p: PoseWriter, a: AnimInput): void {
  if (a.away) return;
  p.part('armNear').z = -1.5;
  p.part('capNear').z = -1.5;
}

/**
 * A fist on its way out: from where it was held (hx, hy), drawn in to (cx, cy) by `coil`, then
 * straight out to full stretch along `angle` by `out`. Above 1, `out` carries it past.
 */
function thrust(p: PoseWriter, arm: Arm, hx: number, hy: number, cx: number, cy: number, coil: number, angle: number, length: number, out: number): void {
  const tx = Math.cos(angle) * length;
  const ty = Math.sin(angle) * length;
  put(p, arm, hx + (cx - hx) * coil + (tx - hx) * out, hy + (cy - hy) * coil + (ty - hy) * out);
}

// ---------------------------------------------------------------- hips and feet

/** Where the feet stand in the fighting stance, from the middle of the body: the near foot leads. */
const NEAR_FOOT = 13;
const FAR_FOOT = -13.5;

/** Lower the hips with the knees bent: the legs shorten so the feet do not go through the floor. */
function sink(p: PoseWriter, d: number): void {
  p.part('hips').y += d;
  const k = 1 - d / LEG;
  p.part('legNear').sy *= k;
  p.part('legFar').sy *= k;
}

/** Turn and stretch one leg so its foot stands at `footX` on the floor, as far as `k` says. */
function plant(leg: PartPose, hipX: number, drop: number, footX: number, k: number): void {
  const h = Math.max(8, LEG - drop);
  const dx = hipX - footX;
  const lean = Math.atan2(dx, h);
  // the sole turns with the leg, so a leg behind stands on its toe and a leg in front on its heel
  const lift = lean > 0 ? SOLE_TOE * Math.sin(lean) : -SOLE_HEEL * Math.sin(lean);
  leg.rot = lerp(leg.rot, Math.atan2(dx, h - lift), k);
  leg.sy = lerp(leg.sy, Math.max(0.4, Math.min(1.3, Math.hypot(dx, h - lift) / LEG)), k);
  leg.y = lerp(leg.y, 0, k);
}

/**
 * Plant both feet under wherever the hips have got to. Standing, the feet stay exactly where
 * they were put however the weight moves; on the move the stride takes over. Each foot may be
 * stepped out from its place in the stance (near forward, far back). Call it once, when the
 * hips are final.
 */
function stand(p: PoseWriter, a: AnimInput, nearStep: number, farStep: number): void {
  const still = 1 - Math.min(1, a.speed);
  if (still <= 0) return;
  const hips = p.part('hips');
  plant(p.part('legNear'), hips.x + HIP_X, hips.y, NEAR_FOOT + nearStep, still);
  plant(p.part('legFar'), hips.x - HIP_X, hips.y, FAR_FOOT - farStep, still);
}

// ---------------------------------------------------------------- the stance

/** The guard the fists come back to, each from its own shoulder: the near one out in front of the face, the far one on the chest. */
const LEAD_X = 16;
const LEAD_Y = -8.5;
const REAR_X = 17;
const REAR_Y = 7;
/** How fast the weight goes from foot to foot, standing. */
const SHIFT = 4.4;

/**
 * A fighter's stance, on top of the legs locomotion has already posed: standing, the weight
 * goes from foot to foot; on the move the fists pump like pistons, each against its own leg.
 */
function stance(p: PoseWriter, a: AnimInput): void {
  const run = Math.min(1, a.speed);
  const still = 1 - run;
  const beat = a.time * SHIFT + a.seed * 6.283;
  const sway = Math.sin(beat);
  // settling a little as the weight arrives on each foot; a run stays low
  p.part('hips').x += sway * 2.4 * still;
  sink(p, (1.8 + 1.4 * sway * sway) * still + 1.5 * run);
  p.part('torso').rot += (0.07 - 0.03 * sway) * still;
  p.part('head').rot += (-0.05 + 0.03 * sway) * still;

  // the guard turns a little toward the aim, and the fists ride the shift of the weight
  const tilt = Math.max(-1, Math.min(1, a.aim)) * 0.3;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const bob = Math.cos(beat * 2 + 0.5) * 0.9 * still;
  const pump = Math.sin(a.stride * 4.6 + a.seed) * run * a.forward;
  put(p, 'armNear', lerp(LEAD_X * ct - LEAD_Y * st, 8.5, run) + 9 * pump, lerp(LEAD_X * st + LEAD_Y * ct, 0, run) - 10 * pump + bob);
  put(p, 'armFar', lerp(REAR_X * ct - REAR_Y * st, 10, run) - 8 * pump, lerp(REAR_X * st + REAR_Y * ct, 7, run) + 3 * pump - bob);
  farArmForward(p, a);
}

/**
 * What follows late. The sash tails stream behind a run, swing a beat after the stride and
 * lag the shift of the weight, and the topknot nods against them. `kick` is how hard the body
 * has just been thrown forward (negative: pulled back); `lateKick` is the same, a moment
 * earlier, for the loose end.
 */
function follow(p: PoseWriter, a: AnimInput, kick: number, lateKick: number): void {
  const run = Math.min(1, a.speed);
  const still = 1 - run;
  const ph = a.stride * 4.6 + a.seed;
  const air = a.time * 1.9 + a.seed * 6.283;
  const beat = a.time * SHIFT + a.seed * 6.283;
  const sash = p.part('sash');
  sash.rot = (0.7 * run + Math.sin(ph - 0.9) * 0.16 * run) * a.forward + Math.sin(air) * 0.05 + Math.cos(beat - 0.9) * 0.08 * still + 0.6 * kick;
  p.part('sashTip').rot = (0.3 * run + Math.sin(ph - 1.9) * 0.3 * run) * a.forward + Math.sin(air - 1.1) * 0.09 + Math.cos(beat - 1.8) * 0.1 * still + 0.7 * lateKick;
  p.part('knot').rot = (-0.3 * run + Math.sin(ph * 2 - 0.8) * 0.1 * run) * a.forward - Math.sin(air) * 0.04 - Math.cos(beat - 0.7) * 0.05 * still - 0.45 * kick;
  // seen from behind, the knot of the sash is on this side of the body
  if (a.away) sash.z = 6;
}

// ---------------------------------------------------------------- the three jabs

/** Seconds: the wind-up of each jab, how long the blow holds, and its recovery. */
const JAB_WIND: readonly number[] = [0.04, 0.04, 0.07];
const JAB_HOLD = 0.07;
const JAB_BACK: readonly number[] = [0.1, 0.1, 0.18];
/** How far each jab draws in before it goes: a flick for the first two, a real coil for the third. */
const JAB_COIL: readonly number[] = [0.35, 0.35, 0.7];
/** How far from the shoulder each blow lands. */
const JAB_REACH = ARM_LENGTH * 1.36;
const CROSS_REACH = ARM_LENGTH * 1.42;
const PALM_REACH = ARM_LENGTH * 1.32;

/** Where the fist is `t` seconds into jab `v`: 0 in the guard, negative drawn back, 1 at full reach. */
function jabReach(v: number, t: number): number {
  if (t <= 0) return 0;
  const wind = JAB_WIND[v];
  const heavy = v === 2;
  if (t < wind) {
    // a short coil, then out: it arrives before the blow lands, and a little past where it will rest
    const u = t / wind;
    const coiled = heavy ? 0.35 : 0.2;
    const driven = heavy ? 0.72 : 0.55;
    if (u < coiled) return -JAB_COIL[v] * (u / coiled);
    if (u < driven) {
      const d = (u - coiled) / (driven - coiled);
      return lerp(-JAB_COIL[v], 1.2, d * d);
    }
    return 1.2;
  }
  if (t < wind + JAB_HOLD) return lerp(1.2, 1, ease((t - wind) / JAB_HOLD));
  // the snap back: home in half the recovery, a touch past the guard, then settled
  const r = Math.min(1, (t - wind - JAB_HOLD) / JAB_BACK[v]);
  if (r < 0.5) return lerp(1, -0.14, ease(r / 0.5));
  return -0.14 * (1 - ease((r - 0.5) / 0.5));
}

/** The three jabs: the near fist, the far fist, then both palms with the whole body behind them. */
function jab(p: PoseWriter, a: AnimInput): void {
  const v = a.variant === 1 || a.variant === 2 ? a.variant : 0;
  const t = a.phase * (JAB_WIND[v] + JAB_HOLD + JAB_BACK[v]);
  const e = jabReach(v, t);
  const out = Math.max(0, e);
  const full = Math.min(1, out);
  const coil = Math.min(1, Math.max(0, -e) / JAB_COIL[v]);
  // the guard the fists leave from and come back to, read before the body moves
  const nx = fistX(p, 'armNear');
  const ny = fistY(p, 'armNear');
  const fx = fistX(p, 'armFar');
  const fy = fistY(p, 'armFar');
  const torso = p.part('torso');
  const hips = p.part('hips');
  const head = p.part('head');
  if (v === 2) {
    torso.rot += 0.3 * e;
    hips.x += 6 * e;
    sink(p, 3 * out + 2.5 * coil);
    head.rot -= 0.17 * e;
    // the chest turns square to the blow, so both palms land side by side
    turn(p, 'armFar', 17 * out - 2 * coil);
    turn(p, 'armNear', -2 * out - 3 * coil);
    thrust(p, 'armNear', nx, ny, 4, 6, coil, a.aim - 0.26, PALM_REACH, out);
    thrust(p, 'armFar', fx, fy, 9, 7, coil, a.aim + 0.3, PALM_REACH + 1.2, out);
    swell(p, 'armNear', 1 + 0.22 * full);
    swell(p, 'armFar', 1 + 0.22 * full);
    stand(p, a, 6 * out - coil, 1.5 * out);
  } else if (v === 1) {
    torso.rot += 0.17 * e;
    hips.x += 4 * e;
    sink(p, 1.6 * out);
    head.rot -= 0.09 * e;
    // the far shoulder comes right through; the near one opens to let it
    turn(p, 'armFar', 13 * e);
    turn(p, 'armNear', -6 * out);
    thrust(p, 'armFar', fx, fy, fx * 0.5, fy * 0.5 + 1, coil, a.aim, CROSS_REACH, out);
    // the near fist drops back to the ribs
    put(p, 'armNear', lerp(nx, 5, full), lerp(ny, 5, full));
    swell(p, 'armFar', 1 + 0.16 * full);
    stand(p, a, 2 * out, out);
  } else {
    torso.rot += 0.12 * e;
    hips.x += 3 * e;
    sink(p, 1.2 * out);
    head.rot -= 0.06 * e;
    turn(p, 'armNear', 2.5 * e);
    turn(p, 'armFar', -2 * out);
    thrust(p, 'armNear', nx, ny, nx * 0.5, ny * 0.5 + 3, coil, a.aim, JAB_REACH, out);
    // the other fist tightens against the chest
    put(p, 'armFar', lerp(fx, 13, full), lerp(fy, 5, full));
    swell(p, 'armNear', 1 + 0.16 * full);
    stand(p, a, 3 * out, 0);
  }
  const before = jabReach(v, t - 0.04);
  follow(p, a, e - before, before - jabReach(v, t - 0.09));
}

// ---------------------------------------------------------------- the Haymaker

/** How far behind the shoulder the fist is drawn as the punch begins to fill, and when it is full. */
const COCK_NEAR = 14;
const COCK_FAR = 26;
/** How far above the line of the aim the drawn-back fist is carried. */
const COCK_LIFT = 5;
/** The share of the charge in which the pose is taken up; the rest only tightens it. */
const COCK_SET = 0.3;
/** How far from the shoulder the Haymaker lands: the longest reach the rig makes. */
const HAY_REACH = ARM_LENGTH * 1.58;

/** The hand draws back: the near fist behind the shoulder, the body coiled and sunk, the far hand a sight along the aim. */
function drawBack(p: PoseWriter, a: AnimInput): void {
  const k = Math.max(0, Math.min(1, a.phase));
  const set = ease(Math.min(1, k / COCK_SET));
  // held force: once the punch is nearly full the whole frame trembles
  const held = Math.max(0, (k - 0.85) / 0.15);
  const shake = Math.sin(a.time * 61) * held;
  const shudder = Math.sin(a.time * 43 + 1.3) * held;
  const nx = fistX(p, 'armNear');
  const ny = fistY(p, 'armNear');
  const fx = fistX(p, 'armFar');
  const fy = fistY(p, 'armFar');
  p.part('torso').rot += -0.1 * set - 0.2 * k + 0.014 * shake;
  p.part('hips').x += -2 * set - 3.5 * k + 0.5 * shudder;
  sink(p, 1.5 * set + 5 * k);
  p.part('head').rot += 0.08 * set + 0.16 * k;
  turn(p, 'armNear', -3 * set - 4 * k);
  turn(p, 'armFar', 5 * set + 5 * k);

  // the fist swings back round the shoulder to the far end of the line of the aim, then draws further down it
  const back = lerp(COCK_NEAR, COCK_FAR, k);
  const cx = -Math.cos(a.aim) * back;
  const cy = -Math.sin(a.aim) * back - COCK_LIFT;
  const from = Math.atan2(ny, nx);
  const angle = from + wrap(Math.atan2(cy, cx) - from) * set;
  const length = lerp(Math.hypot(nx, ny), Math.hypot(cx, cy), set);
  put(p, 'armNear', Math.cos(angle) * length + 0.9 * shake, Math.sin(angle) * length + 0.7 * shudder);
  // the drumhead keeps facing the target while the arm goes back
  twist(p, 'armNear', wristTurn(p, 'armNear', a.aim) * set);
  swell(p, 'armNear', 1 + 0.1 * set + 0.2 * k + 0.05 * shudder);
  if (set > 0.5) nearArmBehindHead(p, a);

  const sight = ARM_LENGTH * (0.9 + 0.25 * k);
  put(p, 'armFar', lerp(fx, Math.cos(a.aim) * sight, set), lerp(fy, Math.sin(a.aim) * sight, set));
  stand(p, a, 1.5 * k, 2 * k);
  follow(p, a, -0.3 * set - 0.1 * k + 0.1 * shudder, -0.2 * set - 0.1 * k - 0.1 * shake);
}

const LUNGE = 0.09;
const RECOVER = 0.22;

/** How far through the Haymaker the body is, `t` seconds in: 1 from the moment the fist is out until the follow-through is spent. */
function thrown(t: number): number {
  if (t <= 0) return 0;
  if (t < LUNGE) return ease(Math.min(1, t / (LUNGE * 0.4)));
  const r = Math.min(1, (t - LUNGE) / RECOVER);
  return r < 0.3 ? 1 : 1 - ease((r - 0.3) / 0.7);
}

/** The Haymaker: out of the drawn-back pose and straight along the aim, hips and shoulder behind it. */
function haymaker(p: PoseWriter, a: AnimInput): void {
  const t = a.phase * (LUNGE + RECOVER);
  const b = thrown(t);
  const lunging = t < LUNGE;
  // still coiled, at the very start
  const q = lunging ? 1 - b : 0;
  // the follow-through: a swell that carries the fist on past the line and the body after it
  const carry = lunging ? 0 : Math.sin(Math.PI * Math.min(1, (t - LUNGE) / RECOVER / 0.7));
  const nx = fistX(p, 'armNear');
  const ny = fistY(p, 'armNear');
  const fx = fistX(p, 'armFar');
  const fy = fistY(p, 'armFar');
  p.part('torso').rot += 0.42 * b - 0.3 * q + 0.1 * carry;
  p.part('hips').x += 9 * b - 5.5 * q + 2 * carry;
  sink(p, 3.5 * b + 6.5 * q);
  p.part('head').rot += -0.27 * b + 0.24 * q - 0.05 * carry;
  turn(p, 'armNear', 2.5 * b - 7 * q);
  turn(p, 'armFar', -1.5 * b + 10 * q);

  const line = a.aim + 0.4 * carry;
  const ex = Math.cos(line) * HAY_REACH;
  const ey = Math.sin(line) * HAY_REACH;
  // the far arm is thrown down and back as the other goes out
  const bx = Math.cos(a.aim + Math.PI - 0.55) * ARM_LENGTH * 0.95;
  const by = Math.sin(a.aim + Math.PI - 0.55) * ARM_LENGTH * 0.95;
  if (lunging) {
    put(p, 'armNear', lerp(-Math.cos(a.aim) * COCK_FAR, ex, b), lerp(-Math.sin(a.aim) * COCK_FAR - COCK_LIFT, ey, b));
    twist(p, 'armNear', wristTurn(p, 'armNear', a.aim) * q);
    if (q > 0.5) nearArmBehindHead(p, a);
    const sight = ARM_LENGTH * 1.15;
    put(p, 'armFar', lerp(Math.cos(a.aim) * sight, bx, b), lerp(Math.sin(a.aim) * sight, by, b));
  } else {
    put(p, 'armNear', lerp(nx, ex, b), lerp(ny, ey, b));
    put(p, 'armFar', lerp(fx, bx, b), lerp(fy, by, b));
  }
  swell(p, 'armNear', 1 + 0.2 * q + 0.35 * b);
  if (b > 0.4) {
    // thrown back, the far arm is behind the body from either side
    p.part('armFar').z = 0;
    p.part('capFar').z = 0;
  }
  stand(p, a, 8 * b - q, 1.5 * b + 2 * q);
  const before = thrown(t - 0.05);
  follow(p, a, b - before, before - thrown(t - 0.1));
}

// ---------------------------------------------------------------- the Break

const BREAK_TIME = 0.45;
/** Seconds into the Break: the fists are overhead, they start down, they land, the body starts to rise. */
const BREAK_UP = 0.1;
const BREAK_FALL = 0.115;
const BREAK_LAND = 0.145;
const BREAK_RISE = 0.31;
/** How high above the floor the middle of a gauntlet is when it is planted there. */
const FLOOR = 6.6;

/** How far over the fists the body is crouched, `t` seconds into the Break. */
function crouched(t: number): number {
  if (t < BREAK_FALL) return 0;
  const down = Math.min(1, (t - BREAK_FALL) / (BREAK_LAND - BREAK_FALL));
  const rise = t < BREAK_RISE ? 0 : ease(Math.min(1, (t - BREAK_RISE) / (BREAK_TIME - 0.02 - BREAK_RISE)));
  return down * (1 - rise);
}

/** The Break: both fists overhead, then down onto the floor; the body stays crouched over them, then rises. */
function slam(p: PoseWriter, a: AnimInput): void {
  const t = a.phase * BREAK_TIME;
  const up = ease(Math.min(1, t / BREAK_UP));
  const down = t < BREAK_FALL ? 0 : Math.min(1, (t - BREAK_FALL) / (BREAK_LAND - BREAK_FALL));
  const rise = t < BREAK_RISE ? 0 : ease(Math.min(1, (t - BREAK_RISE) / (BREAK_TIME - 0.02 - BREAK_RISE)));
  const over = up * (1 - down);
  const d = down * (1 - rise);
  // the jolt of the floor, dying away
  const jolt = t > BREAK_LAND ? Math.exp(-(t - BREAK_LAND) / 0.05) : 0;
  const nx = fistX(p, 'armNear');
  const ny = fistY(p, 'armNear');
  const fx = fistX(p, 'armFar');
  const fy = fistY(p, 'armFar');
  const hips = p.part('hips');
  p.part('torso').rot += -0.2 * over + 0.82 * d;
  hips.x += -1.5 * over + 4 * d;
  sink(p, -3 * over + (12.5 + 1.5 * jolt) * d);
  p.part('head').rot += -0.12 * over - 0.38 * d;
  turn(p, 'armFar', 4 * over + 12 * d);
  turn(p, 'armNear', -over);

  // up from the guard to full stretch overhead, straight down to the floor, and back to the guard
  const nearX = lerp(lerp(lerp(nx, -1, up), 29 - shoulderX(p, 'armNear'), down), nx, rise);
  const nearY = lerp(lerp(lerp(ny, -29, up), -FLOOR - shoulderY(p, 'armNear'), down), ny, rise);
  const farX = lerp(lerp(lerp(fx, 5, up), 15 - shoulderX(p, 'armFar'), down), fx, rise);
  const farY = lerp(lerp(lerp(fy, -29, up), -FLOOR - shoulderY(p, 'armFar'), down), fy, rise);
  put(p, 'armNear', nearX, nearY);
  put(p, 'armFar', farX, farY);
  // the gauntlets swell as they go up and flatten against the floor
  const press = jolt * d;
  squash(p, 'armNear', 1 + 0.14 * over + 0.3 * press, 1 + 0.14 * over - 0.22 * press);
  squash(p, 'armFar', 1 + 0.14 * over + 0.3 * press, 1 + 0.14 * over - 0.22 * press);
  stand(p, a, 2 * d, -2 * d);
  const before = crouched(t - 0.05);
  follow(p, a, d - before + 0.3 * over, before - crouched(t - 0.1));
}

// ---------------------------------------------------------------- hurt, down, dash

/** A flinch: the shared recoil on top of the stance, with the guard knocked open. */
function flinch(p: PoseWriter, a: AnimInput): void {
  const k = Math.max(0, 1 - a.t / 0.22);
  const nx = fistX(p, 'armNear');
  const ny = fistY(p, 'armNear');
  const fx = fistX(p, 'armFar');
  const fy = fistY(p, 'armFar');
  // hurtPose writes its recoil outright, so the stance underneath is kept and put back
  const torso = p.part('torso');
  const head = p.part('head');
  const hips = p.part('hips');
  const lean = torso.rot;
  const nod = head.rot;
  const drop = hips.y;
  hurtPose(p, a);
  torso.rot += lean;
  head.rot += nod;
  hips.y += drop;
  put(p, 'armNear', lerp(nx, 6, k), lerp(ny, -19, k));
  put(p, 'armFar', lerp(fx, -4, k), lerp(fy, 16, k));
  if (k > 0.4) {
    p.part('armFar').z = 0;
    p.part('capFar').z = 0;
  }
  stand(p, a, -2 * k, -3 * k);
  follow(p, a, -0.8 * k, -0.5 * k);
}

/** Down: onto the knees with both fists on the floor, taking the weight. */
function fall(p: PoseWriter, a: AnimInput): void {
  downPose(p, a);
  const e = ease(Math.min(1, a.t / 0.55));
  // shorter legs reach the floor sooner; until they do, the feet are still apart
  const hips = p.part('hips');
  hips.y += -6 * e + 2 * (1 - e);
  p.part('legNear').rot += -0.2 * (1 - e);
  p.part('legFar').rot += 0.22 * (1 - e);
  p.part('torso').rot += 0.12 * e;
  turn(p, 'armFar', 9 * e);
  put(p, 'armNear', lerp(LEAD_X, hips.x + 24 - shoulderX(p, 'armNear'), e), lerp(LEAD_Y, -FLOOR - shoulderY(p, 'armNear'), e));
  put(p, 'armFar', lerp(REAR_X, hips.x + 11 - shoulderX(p, 'armFar'), e), lerp(REAR_Y, -FLOOR - shoulderY(p, 'armFar'), e));
  farArmForward(p, a);
  p.part('sash').rot = 0.35 * e;
  p.part('sashTip').rot = 0.5 * e;
  p.part('knot').rot = 0.55 * e + Math.sin(a.time * 1.6) * 0.04;
  if (a.away) p.part('sash').z = 6;
}

/** The dash: shoulder first, fists tucked under the chin, the sash straight out behind. */
function rush(p: PoseWriter, a: AnimInput): void {
  dashPose(p, a);
  put(p, 'armNear', 10, -7);
  put(p, 'armFar', 14, 5);
  farArmForward(p, a);
  p.part('sash').rot = 1.25;
  p.part('sashTip').rot = 0.25 + Math.sin(a.phase * 9) * 0.2;
  p.part('knot').rot = -0.6;
  if (a.away) p.part('sash').z = 6;
}

export const handAnimator: Animator = (p, a) => {
  if (a.state === 'down') {
    fall(p, a);
    return 16;
  }
  if (a.state === 'dash') {
    rush(p, a);
    return 50;
  }
  locomotion(p, a);
  stance(p, a);
  switch (a.state) {
    case 'attack':
      jab(p, a);
      return 70;
    case 'charge':
      drawBack(p, a);
      return 40;
    case 'release':
      haymaker(p, a);
      return 70;
    case 'special':
      slam(p, a);
      return 60;
    case 'hurt':
      flinch(p, a);
      return 60;
    default:
      stand(p, a, 0, 0);
      follow(p, a, 0, 0);
      return a.state === 'run' ? 26 : 16;
  }
};

/** What the registry gathers: this file is the whole of the rig, and nothing else lists it. */
const ENTRY: RigEntry = { def: HAND_RIG, animator: handAnimator, required: FIST_STATES, variants: { attack: [0, 1, 2] } };
export default ENTRY;
