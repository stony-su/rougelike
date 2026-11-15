// Camera. A chamber that fits on the screen is framed whole; a bigger one is followed: the view
// stays on this laptop's player, leads a little toward where they aim, and stops at the chamber's
// edges. When following, every screen shows the same height of world whatever its size, so no
// laptop of a co-op game sees further than another.
import { clamp, damp } from '../core/math';
import type { Vec2 } from '../core/math';
import { ISO_COS, ISO_SIN, TILE, projX, projY, unproject } from '../core/iso';
import type { Room } from '../sim/types';

/** The height of world on screen while following, measured in tiles of art. */
export const VIEW_TILES = 17.5;
/** A chamber is framed whole if that takes no more zooming out than this, compared with following. */
const FIT_SLACK = 0.68;
/** How far past the chamber's edge the view may look, in tiles of art: enough to show the walls whole. */
const EDGE = 2.2;
/** The view leads toward the aim by this share of the way to the aimed point, up to LEAD_MAX tiles. */
const LEAD = 0.28;
const LEAD_MAX = 1.6;

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

/** Keep a view of half-width `half` inside [lo, hi]; if the span is narrower than the view, sit in its middle. */
function bound(v: number, lo: number, hi: number, half: number): number {
  if (hi - lo <= half * 2) return (lo + hi) / 2;
  return clamp(v, lo + half, hi - half);
}

export class Camera {
  /** World-space focus point. */
  x = 0;
  y = 0;
  zoom = 1;
  /** Pixels added to every camera-space layer's position (includes shake). */
  offsetX = 0;
  offsetY = 0;
  /** True while the chamber is too big for the screen and the view follows the player. */
  following = false;

  private viewW = 1;
  private viewH = 1;
  private baseZoom = 1;
  private punch = 0;
  private trauma = 0;
  private time = 0;
  private shakeScale = 1;
  private anchorX = 0;
  private anchorY = 0;
  /** The chamber's extent on the drawing plane, in art pixels. */
  private minX = 0;
  private maxX = 0;
  private maxY = 0;
  /** Jump to the target at the next update instead of gliding there (a new chamber). */
  private snapPending = true;
  private readonly tmp: Vec2 = { x: 0, y: 0 };

  setViewport(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  setShakeScale(s: number): void {
    this.shakeScale = s;
  }

  /** Decide how this chamber is shown: whole if it fits, followed if it does not. */
  frameRoom(room: Room, snap = true): void {
    // Projected extents of the room's bounding diamond.
    const spanX = (room.w + room.h) * ISO_COS * TILE;
    const spanY = (room.w + room.h) * ISO_SIN * TILE + TILE * 1.6;
    const fit = Math.min((this.viewW * 0.94) / spanX, (this.viewH * 0.9) / spanY);
    const followZoom = this.viewH / (VIEW_TILES * TILE);
    this.following = fit < followZoom * FIT_SLACK;
    // a small chamber is not blown up to fill the screen: its people stay the size they are elsewhere
    this.baseZoom = this.following ? followZoom : clamp(fit, 0.45, Math.max(0.45, followZoom * 1.15));
    this.anchorX = room.w / 2;
    this.anchorY = room.h / 2;
    this.minX = projX(0, room.h);
    this.maxX = projX(room.w, 0);
    this.maxY = projY(room.w, room.h);
    if (snap) {
      this.snapPending = true;
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
    let tx: number;
    let ty: number;
    if (this.following) {
      // on the player, leading toward the aim, and never further out than the chamber's edge
      const wx = focusX + clamp((aimX - focusX) * LEAD, -LEAD_MAX, LEAD_MAX);
      const wy = focusY + clamp((aimY - focusY) * LEAD, -LEAD_MAX, LEAD_MAX);
      const pad = EDGE * TILE;
      const px = bound(projX(wx, wy), this.minX - pad, this.maxX + pad, this.viewW / (2 * this.baseZoom));
      const py = bound(projY(wx, wy), -pad, this.maxY + pad, this.viewH / (2 * this.baseZoom));
      unproject(px, py, this.tmp);
      tx = this.tmp.x;
      ty = this.tmp.y;
    } else {
      // the chamber fits, so the camera only leans: mostly its centre, partly the player, slightly the aim
      tx = this.anchorX + (focusX - this.anchorX) * 0.3 + clamp(aimX - focusX, -6, 6) * 0.035;
      ty = this.anchorY + (focusY - this.anchorY) * 0.3 + clamp(aimY - focusY, -6, 6) * 0.035;
    }
    if (this.snapPending) {
      this.snapPending = false;
      this.x = tx;
      this.y = ty;
      this.zoom = this.baseZoom;
    }
    const pace = this.following ? 6.5 : 5;
    this.x = damp(this.x, tx, pace, dt);
    this.y = damp(this.y, ty, pace, dt);
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
