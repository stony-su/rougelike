// The String, the Bow Returner: hooded, slim, a recurve bow with a bright string.
// Built from geometric solids on the shared hero skeleton. The far arm holds the bow along the
// aim; the near arm draws. The string itself is drawn by the view (it joins two moving parts),
// from the anchors and the draw amount exported here.
import { HERO, PLAYER_COLORS, RIM } from '../palette';
import { block, ell, flat, stroke } from './def';
import type { AnimInput, Animator, PartDef, PoseWriter, RigDef } from './def';
import { ARM_FAR_REST, ARM_LENGTH, ARM_NEAR_REST, HIPS_Y, armPart, dashPose, downPose, ease, hurtPose, legPart, lerp, locomotion, pointArm } from './hero';
import { arcBand, capsule, trapezoid } from './solids';
import { HERO_STATES } from './states';

const palette: Record<string, number> = {
  hood: HERO.hood,
  hoodShade: HERO.hoodShade,
  dark: HERO.dark,
  darkShade: HERO.darkShade,
  skin: HERO.skin,
  skinShade: HERO.skinShade,
  wood: HERO.wood,
  woodShade: HERO.woodShade,
  rim: RIM,
  accent: PLAYER_COLORS[1],
};

const hood = { fill: 'hood', shade: 'hoodShade', rim: 'rim' };
const dark = { fill: 'dark', shade: 'darkShade', rim: 'rim' };

/** The bow is an arc about a point behind the grip; its tips are where the string ties on. */
const BOW_R = 30;
const BOW_SPAN = 0.92;
const TIP_X = Math.sin(BOW_SPAN) * BOW_R;
const TIP_Y = BOW_R - Math.cos(BOW_SPAN) * BOW_R;

/** Where the string is tied, in the bow part's own coordinates, for the view. */
export const STRING_ANCHORS = { part: 'bow', top: [-TIP_X, -TIP_Y], bottom: [TIP_X, -TIP_Y] } as const;

/** Seconds after an arrow leaves before the hand is back on the string, and before it is fully drawn again. */
const NOCK_AT = 0.12;
const DRAWN_AT = 0.32;

/** How far the string is pulled to the drawing hand, 0 to 1. Only while loosing arrows. */
export function stringDraw(a: AnimInput): number {
  if (a.state !== 'attack') return 0;
  return ease((a.t - NOCK_AT) / (DRAWN_AT - NOCK_AT));
}

const parts: PartDef[] = [
  { name: 'hips', x: 0, y: HIPS_Y, shapes: [] },
  {
    // a short cloak; it trails behind every movement
    name: 'cloak',
    parent: 'hips',
    x: -2,
    y: -28,
    z: -3,
    shapes: [...block([-7, 0, 6, 0, 2, 30, -15, 26], { fill: 'hoodShade', rim: 'rim', rimWidth: 1.2 })],
  },
  legPart('legFar', -3.5, -2, dark, dark),
  legPart('legNear', 3.5, -1, dark, dark),
  {
    name: 'torso',
    parent: 'hips',
    x: 0,
    y: 0,
    z: 2,
    shapes: [
      ...block(trapezoid(0, -31, 4, 7.5, 6.5), { fill: 'hood', shade: 'hoodShade', shadeFrom: 0.6, rim: 'rim', rimWidth: 1.6 }),
      flat([-7, -5, 7, -5, 6.8, 0, -6.8, 0], 'accent'),
      // a quiver across the back, its arrows showing over the shoulder
      flat(capsule(-9, -6, -4, -30, 3.4), 'wood', 1, 'back'),
      stroke([-4.5, -31, -3, -39], 1.6, 'rim', 0.9),
      stroke([-2.5, -30, 0, -38], 1.6, 'rim', 0.9),
    ],
  },
  {
    name: 'head',
    parent: 'torso',
    x: 0.5,
    y: -31,
    z: 3,
    shapes: [
      ...block(ell(1, -8.5, 7.6, 8.4, 16), { fill: 'skin', shade: 'skinShade', shadeFrom: 0.62, view: 'front' }),
      // the hood: a cowl over the head, peaked at the back
      ...block([-9, -3, -9.5, -13, -3, -20, 6, -19, 9.5, -12, 4.5, -13.5, -2, -12, -5, -2], { fill: 'hood', rim: 'rim', rimWidth: 1.5, view: 'front' }),
      flat([-9.5, -13, -15, -17, -8, -18.5], 'hoodShade'),
      flat(ell(5.6, -7.4, 1.2, 1.6, 8), 'dark', 1, 'front'),
      ...block(ell(0, -9.5, 9.4, 9.8, 16), { fill: 'hood', shade: 'hoodShade', shadeFrom: 0.6, rim: 'rim', rimWidth: 1.5, view: 'back' }),
      // a trim in the seat colour along the edge of the hood
      stroke([-5, -2, -2, -12, 4.5, -13.5, 9.5, -12], 1.8, 'accent', 1, 'front'),
      stroke([-8, -3, 0, 0.5, 8, -3], 1.8, 'accent', 1, 'back'),
    ],
  },
  armPart('armFar', -6, -1, ARM_FAR_REST, hood, 'skin', 0.9),
  armPart('armNear', 6, 4, ARM_NEAR_REST, hood, 'skin', 0.9),
  {
    // the bow, held at its grip in the far hand: limbs to either side, belly forward
    name: 'bow',
    parent: 'armFar',
    x: 0,
    y: ARM_LENGTH,
    z: 1,
    shapes: [
      ...block(arcBand(0, -BOW_R, BOW_R, Math.PI / 2 - BOW_SPAN, Math.PI / 2 + BOW_SPAN, 4.4, 14, 0.55), { fill: 'wood', shade: 'woodShade', shadeFrom: 0.5 }),
      flat([-3.2, -2.6, 3.2, -2.6, 3.2, 2.8, -3.2, 2.8], 'accent'),
      flat(ell(-TIP_X, -TIP_Y, 2, 2, 8), 'accent'),
      flat(ell(TIP_X, -TIP_Y, 2, 2, 8), 'accent'),
    ],
  },
];

export const STRING_RIG: RigDef = {
  id: 'string',
  parts,
  palette,
  footprint: 0.32,
  height: 94,
  states: HERO_STATES,
};

function cloakFollow(p: PoseWriter, a: AnimInput): void {
  const run = Math.min(1, a.speed);
  const s = Math.sin(a.stride * 4.6 + a.seed - 0.9);
  p.part('cloak').rot = (0.55 * run + s * 0.14 * run) * a.forward + Math.sin(a.time * 1.9) * 0.04;
}

/** At ease: the bow low at the side, the string hand loose. */
function carry(p: PoseWriter, a: AnimInput): void {
  const run = Math.min(1, a.speed);
  const sway = Math.sin(a.time * 2 + a.seed * 6.283) * 0.04;
  pointArm(p, 'armFar', 1.05 + sway - 0.2 * run);
  p.part('bow').rot = -0.5 + sway;
}

/** Loosing. The arrow has just left at t = 0; the hand comes back to the string, then draws again. */
function loose(p: PoseWriter, a: AnimInput): void {
  const d = stringDraw(a);
  const kick = Math.max(0, 1 - a.t / 0.08);
  pointArm(p, 'armFar', a.aim);
  // the bow stands across the aim, and rocks forward as the string is let go
  p.part('bow').rot = 0.18 * kick;
  p.part('armFar').z = 5;
  // The drawing arm lies along the aim. Its hand goes out to the string, then comes back to the cheek.
  pointArm(p, 'armNear', a.aim - 0.06);
  const reach = a.t < NOCK_AT ? lerp(0.22, 1, ease(a.t / NOCK_AT)) : lerp(1, 0.3, d);
  p.part('armNear').sy = reach;
  const torso = p.part('torso');
  torso.rot += -0.06 - 0.1 * d + 0.12 * kick;
  p.part('head').rot += 0.05 * d;
  p.part('cloak').rot += 0.25 * kick;
}

/** Throwing the Ringstone: a quick overhand throw with the string hand. */
function throwStone(p: PoseWriter, a: AnimInput): void {
  const t = ease(a.phase);
  pointArm(p, 'armNear', lerp(a.aim - 2.3, a.aim + 0.5, t));
  p.part('armNear').z = t < 0.4 ? -6 : 0;
  pointArm(p, 'armFar', 1.5);
  p.part('bow').rot = -0.9;
  p.part('torso').rot += lerp(-0.2, 0.26, t);
  p.part('hips').x += 3 * t;
}

export const stringAnimator: Animator = (p, a) => {
  if (a.state === 'down') {
    downPose(p, a);
    // the bow planted like a staff
    pointArm(p, 'armFar', 0.9);
    p.part('bow').rot = -1.3;
    p.part('cloak').rot = 0.5;
    return 16;
  }
  if (a.state === 'dash') {
    dashPose(p, a);
    p.part('bow').rot = -1.1;
    p.part('cloak').rot = 1.1;
    return 50;
  }
  locomotion(p, a);
  cloakFollow(p, a);
  carry(p, a);
  switch (a.state) {
    case 'attack':
      loose(p, a);
      return 60;
    case 'special':
      throwStone(p, a);
      return 60;
    case 'hurt':
      hurtPose(p, a);
      return 60;
    default:
      return a.state === 'run' ? 26 : 16;
  }
};
