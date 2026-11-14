// What the three Returners share: the skeleton, the limbs, and the motions every one of them
// makes (walking, the dash, flinching, going down). Each class file adds its own body, head and
// weapon, and animates its own arms.
//
// THE SKELETON. Part names every hero rig uses, so the shared motions can drive them:
//   hips      the root joint, at the top of the legs
//   legFar, legNear     hang from the hips
//   torso     stands on the hips
//   head      sits on the torso
//   armFar, armNear     hang from the shoulders (children of the torso)
// "Near" is the side toward the camera when the hero faces right. Limbs are drawn hanging
// straight down from their joint, so a limb's direction is its rotation plus a quarter turn.
//
// Legs always follow the feet (speed and stride), whatever the arms are doing, so a hero can
// run and loose an arrow at once.
import { block, ell, flat, smooth } from './def';
import type { AnimInput, PartDef, PoseWriter, ShapeDef } from './def';

export const HIPS_Y = -36;
export const SHOULDER_Y = -27;
export const ARM_LENGTH = 21;
/** Rest rotation of the two arms: hanging a little apart. */
export const ARM_NEAR_REST = 0.12;
export const ARM_FAR_REST = -0.1;

const HALF_PI = Math.PI / 2;

export interface LimbRoles {
  fill: string;
  shade: string;
  rim: string;
}

/** A leg from hip to boot, drawn hanging down. */
export function legPart(name: string, x: number, z: number, cloth: LimbRoles, boot: LimbRoles): PartDef {
  return {
    name,
    parent: 'hips',
    x,
    y: 0,
    z,
    shapes: [
      ...block([-4.6, -1, 4.6, -1, 3.8, 26, -3.4, 26], { fill: cloth.fill, shade: cloth.shade, shadeFrom: 0.5 }),
      ...block(smooth([-3.8, 24, 3.8, 24, 4.4, 30, 10, 32.5, 10, 36, -4, 36], 1), { fill: boot.fill, shade: boot.shade, shadeFrom: 0.6, rim: boot.rim, rimWidth: 1.4 }),
    ],
  };
}

/** An arm from shoulder to hand, drawn hanging down. `thick` scales its width (the Hand has big arms). */
export function armPart(name: string, x: number, z: number, rest: number, sleeve: LimbRoles, hand: string, thick = 1, extra: ShapeDef[] = []): PartDef {
  const w = 3.5 * thick;
  return {
    name,
    parent: 'torso',
    x,
    y: SHOULDER_Y,
    z,
    rot: rest,
    shapes: [
      ...block(smooth([-w, -2, w, -2, w * 0.86, ARM_LENGTH - 3, -w * 0.86, ARM_LENGTH - 3], 1), { fill: sleeve.fill, shade: sleeve.shade, shadeFrom: 0.45, rim: sleeve.rim, rimWidth: 1.3 }),
      flat(ell(0, ARM_LENGTH, 3.5 * thick, 3.7 * thick, 10), hand),
      ...extra,
    ],
  };
}

/** Point an arm along `angle` (rig space: 0 forward, negative up), allowing for how far the torso leans. */
export function pointArm(p: PoseWriter, name: 'armNear' | 'armFar', angle: number): void {
  const rest = name === 'armNear' ? ARM_NEAR_REST : ARM_FAR_REST;
  p.part(name).rot = angle - HALF_PI - rest - p.part('torso').rot;
}

/** The direction an arm points this frame, as an angle in rig space. */
export function armAngle(p: PoseWriter, name: 'armNear' | 'armFar'): number {
  const rest = name === 'armNear' ? ARM_NEAR_REST : ARM_FAR_REST;
  return p.part(name).rot + rest + p.part('torso').rot + HALF_PI;
}

/** Ease in and out, 0..1. */
export const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Legs, hips and breathing for this frame, from how fast the feet are moving. Call it first;
 * the class animator then poses the arms and may add to the torso.
 */
export function locomotion(p: PoseWriter, a: AnimInput): void {
  const run = Math.min(1, a.speed);
  const ph = a.stride * 4.6 + a.seed;
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const dir = a.forward;
  const near = p.part('legNear');
  const far = p.part('legFar');
  near.rot = s * 0.78 * run * dir;
  far.rot = -s * 0.78 * run * dir;
  // the leg swinging forward lifts
  near.y = -Math.max(0, c * dir) * 4.5 * run;
  far.y = -Math.max(0, -c * dir) * 4.5 * run;
  const br = Math.sin(a.time * 2.1 + a.seed * 6.283);
  const hips = p.part('hips');
  hips.y = -Math.abs(c) * 2.4 * run + br * 0.5 * (1 - run);
  const torso = p.part('torso');
  torso.rot = 0.17 * run * dir;
  torso.sy = 1 + br * 0.014 * (1 - run);
  const head = p.part('head');
  head.rot = -0.08 * run * dir + br * 0.02 * (1 - run);
  head.y = br * 0.4 * (1 - run);
  // arms swing against the legs unless the class says otherwise
  p.part('armNear').rot = -s * 0.55 * run * dir;
  p.part('armFar').rot = s * 0.55 * run * dir;
}

/** The dash: thrown forward, low, limbs streaming behind. */
export function dashPose(p: PoseWriter, a: AnimInput): void {
  const k = Math.sin(Math.min(1, a.phase) * Math.PI);
  const torso = p.part('torso');
  torso.rot = 0.5 + 0.25 * k;
  p.part('hips').y = 5 + 2 * k;
  p.part('hips').x = 3;
  p.part('head').rot = -0.3;
  p.part('legNear').rot = -1.0 - 0.2 * k;
  p.part('legFar').rot = 0.55;
  p.part('legFar').y = -3;
  p.part('armNear').rot = -1.5;
  p.part('armFar').rot = -1.25;
}

/** A flinch away from a blow. `a.t` is seconds since it landed. */
export function hurtPose(p: PoseWriter, a: AnimInput): void {
  const k = Math.max(0, 1 - a.t / 0.22);
  const torso = p.part('torso');
  torso.rot = -0.34 * k;
  torso.x = -3 * k;
  p.part('head').rot = 0.4 * k;
  p.part('hips').y = 2.5 * k;
  p.part('armNear').rot = 0.9 * k;
  p.part('armFar').rot = -0.7 * k;
  p.part('legNear').rot = 0.25 * k;
  p.part('legFar').rot = -0.3 * k;
}

/** Going down: knees first, then onto one hand, head bowed. The hero stays there, breathing. */
export function downPose(p: PoseWriter, a: AnimInput): void {
  const t = Math.min(1, a.t / 0.55);
  const e = ease(t);
  const br = Math.sin(a.time * 1.6) * 0.5 * e;
  p.part('hips').y = 17 * e + br;
  p.part('hips').x = -2 * e;
  // kneeling: the near shin folds under, the far knee is up
  p.part('legNear').rot = 1.25 * e;
  p.part('legNear').sy = 1 - 0.3 * e;
  p.part('legFar').rot = -1.15 * e;
  p.part('legFar').sy = 1 - 0.34 * e;
  const torso = p.part('torso');
  torso.rot = 0.62 * e;
  torso.y = br * 0.4;
  p.part('head').rot = 0.5 * e;
  // one hand on the floor, the other across the body
  p.part('armNear').rot = -0.35 * e;
  p.part('armFar').rot = 0.5 * e;
}
