// Camera: frames the room, leans toward the player and the cursor, and shakes.
import { clamp, damp } from '../core/math';
import type { Vec2 } from '../core/math';
import { ISO_COS, ISO_SIN, TILE, projX, projY, unproject } from '../core/iso';
import type { Room } from '../sim/types';

/** Smooth 1D value noise for shake, so the camera rolls rather than jitters. */
function noise1(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const h = (n: number): number => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

export class Camera {
  /** World-space focus point. */
  x = 0;
  y = 0;
  zoom = 1;
  /** Pixels added to every camera-space layer's position (includes shake). */
  offsetX = 0;
  offsetY = 0;

  private viewW = 1;
  private viewH = 1;
  private baseZoom = 1;
  private punch = 0;
  private trauma = 0;
  private time = 0;
  private shakeScale = 1;
  private anchorX = 0;
  private anchorY = 0;

  setViewport(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  setShakeScale(s: number): void {
    this.shakeScale = s;
  }

  /** Choose a zoom that fits the whole room on screen and centre on it. */
  frameRoom(room: Room, snap = true): void {
    // Projected extents of the room's bounding diamond.
    const spanX = (room.w + room.h) * ISO_COS * TILE;
    const spanY = (room.w + room.h) * ISO_SIN * TILE + TILE * 1.6;
    const zx = (this.viewW * 0.94) / spanX;
    const zy = (this.viewH * 0.9) / spanY;
    this.baseZoom = clamp(Math.min(zx, zy), 0.45, 1.35);
    this.anchorX = room.w / 2;
    this.anchorY = room.h / 2;
    if (snap) {
      this.x = this.anchorX;
      this.y = this.anchorY;
      this.zoom = this.baseZoom;
    }
  }

  /** Add shake. amount is 0..1; it accumulates and decays. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** A brief zoom-in kick. */
  kick(amount: number): void {
    this.punch = Math.min(0.12, this.punch + amount);
  }

  update(dt: number, focusX: number, focusY: number, aimX: number, aimY: number): void {
    this.time += dt;
    // Rooms fit on screen, so the camera only leans: mostly room centre, partly player, slightly cursor.
    const tx = this.anchorX + (focusX - this.anchorX) * 0.3 + clamp(aimX - focusX, -6, 6) * 0.035;
    const ty = this.anchorY + (focusY - this.anchorY) * 0.3 + clamp(aimY - focusY, -6, 6) * 0.035;
    this.x = damp(this.x, tx, 5, dt);
    this.y = damp(this.y, ty, 5, dt);
    this.punch = damp(this.punch, 0, 9, dt);
    this.zoom = damp(this.zoom, this.baseZoom * (1 + this.punch), 10, dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.9);

    const s = this.trauma * this.trauma * 15 * this.shakeScale;
    const shx = noise1(this.time * 31, 1) * s;
    const shy = noise1(this.time * 31, 2) * s;
    this.offsetX = this.viewW / 2 - projX(this.x, this.y) * this.zoom + shx;
    this.offsetY = this.viewH / 2 - projY(this.x, this.y) * this.zoom + shy + TILE * 0.3 * this.zoom;
  }

  /** Screen pixels to a point on the ground plane. */
  screenToWorld(sx: number, sy: number, out: Vec2): Vec2 {
    return unproject((sx - this.offsetX) / this.zoom, (sy - this.offsetY) / this.zoom, out);
  }

  worldToScreen(x: number, y: number, z: number, out: Vec2): Vec2 {
    out.x = projX(x, y) * this.zoom + this.offsetX;
    out.y = projY(x, y, z) * this.zoom + this.offsetY;
    return out;
  }
}
