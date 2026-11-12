// True isometric projection (30 degree axes).
//
// World space: x and y lie on the ground plane in tile units, z is height in tile units.
// Screen space (before the camera): pixels, with TILE pixels per world unit along each axis.
//
//   sx = (x - y) * cos30 * TILE
//   sy = (x + y) * sin30 * TILE - z * TILE
//
// The projection is affine, so straight lines on the floor stay straight on screen and
// "inside the triangle" on the floor is exactly what the player sees.
import type { Vec2 } from './math';

export const ISO_COS = Math.cos(Math.PI / 6);
export const ISO_SIN = 0.5;
/** Pixels per world unit at camera zoom 1. */
export const TILE = 64;

export const projX = (x: number, y: number): number => (x - y) * ISO_COS * TILE;
export const projY = (x: number, y: number, z = 0): number => (x + y) * ISO_SIN * TILE - z * TILE;

export function project(x: number, y: number, z: number, out: Vec2): Vec2 {
  out.x = (x - y) * ISO_COS * TILE;
  out.y = (x + y) * ISO_SIN * TILE - z * TILE;
  return out;
}

/** Inverse projection onto the ground plane (z = 0). */
export function unproject(sx: number, sy: number, out: Vec2): Vec2 {
  const a = sx / (ISO_COS * TILE);
  const b = sy / (ISO_SIN * TILE);
  out.x = (a + b) * 0.5;
  out.y = (b - a) * 0.5;
  return out;
}

/** Painter's order for upright things standing on the ground: larger draws later (in front). */
export const depthKey = (x: number, y: number): number => x + y;

/**
 * A container holding ground-plane art needs this transform: an outer scale and an inner
 * 45 degree rotation reproduce the projection exactly.
 *
 * Ground art is authored in ART PIXELS: world units multiplied by TILE. Pixi tessellates curves
 * with a pixel-sized tolerance in local units, so drawing a 0.2-unit circle in raw tile units
 * would come out as a coarse polygon. Multiply by TILE (see `gp`) and curves stay smooth.
 */
export const GROUND_SCALE_X = Math.SQRT2 * ISO_COS;
export const GROUND_SCALE_Y = Math.SQRT2 * ISO_SIN;
export const GROUND_ROTATION = Math.PI / 4;
/** World units to ground art pixels. */
export const gp = (worldUnits: number): number => worldUnits * TILE;

/** Screen-space angle (radians, as drawn) of a world-space ground direction given as an angle. */
export function projectAngle(worldAngle: number): number {
  const wx = Math.cos(worldAngle);
  const wy = Math.sin(worldAngle);
  return Math.atan2((wx + wy) * ISO_SIN, (wx - wy) * ISO_COS);
}

/** On-screen length (pixels at zoom 1) of a world-space ground vector. */
export function projectedLength(wx: number, wy: number): number {
  return Math.hypot((wx - wy) * ISO_COS * TILE, (wx + wy) * ISO_SIN * TILE);
}

/**
 * Convert a screen-space direction (right = +x, down = +y) to a unit world-space direction,
 * so that pressing a direction moves the character that way on screen.
 */
export function screenDirToWorld(ix: number, iy: number, out: Vec2): Vec2 {
  if (ix === 0 && iy === 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const a = ix / ISO_COS;
  const b = iy / ISO_SIN;
  const wx = (a + b) * 0.5;
  const wy = (b - a) * 0.5;
  const l = Math.hypot(wx, wy);
  out.x = wx / l;
  out.y = wy / l;
  return out;
}

/** Angle on screen (radians, 0 = right, clockwise positive as on screen) of a world-space direction. */
export function screenAngleOf(wx: number, wy: number): number {
  return Math.atan2((wx + wy) * ISO_SIN, (wx - wy) * ISO_COS);
}
