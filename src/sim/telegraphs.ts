// Floor warnings. A telegraph is both what the renderer draws and the exact shape the attack
// tests when its wind-up ends, so what you see is what hits.
import { dcos, dsin } from '../core/dmath';
import { pointInSector } from '../core/geom';
import type { Telegraph, TelegraphShape, World } from './types';

export function addTelegraph(
  w: World,
  shape: TelegraphShape,
  owner: number,
  x: number,
  y: number,
  dur: number,
  o: { angle?: number; radius?: number; length?: number; width?: number; halfArc?: number; trackUntil?: number; count?: number; spread?: number; inner?: number; damage?: number; knock?: number },
): Telegraph {
  const t: Telegraph = {
    id: w.nextId++,
    owner,
    shape,
    x,
    y,
    angle: o.angle ?? 0,
    radius: o.radius ?? 0,
    length: o.length ?? 0,
    width: o.width ?? 0,
    halfArc: o.halfArc ?? 0,
    count: o.count ?? 1,
    spread: o.spread ?? 0,
    inner: o.inner ?? 0,
    damage: o.damage ?? 0,
    knock: o.knock ?? 0,
    struck: false,
    t: 0,
    dur,
    trackUntil: o.trackUntil ?? 0,
    dead: false,
  };
  w.telegraphs.push(t);
  return t;
}

export function findTelegraph(w: World, id: number): Telegraph | undefined {
  if (id === 0) return undefined;
  for (const t of w.telegraphs) if (t.id === id && !t.dead) return t;
  return undefined;
}

export function removeTelegraph(w: World, id: number): void {
  const t = findTelegraph(w, id);
  if (t) t.dead = true;
}

/** The direction of the i-th lane of a fan. The same arithmetic aims the shots, so the lanes drawn are the lanes flown. */
export function laneAngle(t: { angle: number; count: number; spread: number }, i: number): number {
  return t.count <= 1 ? t.angle : t.angle + (i / (t.count - 1) - 0.5) * t.spread;
}

/** True when a circle of radius r at (x, y) is inside the warned area. */
export function telegraphCovers(t: Telegraph, x: number, y: number, r: number): boolean {
  switch (t.shape) {
    case 'circle': {
      const dx = x - t.x;
      const dy = y - t.y;
      const rr = t.radius + r;
      const d2 = dx * dx + dy * dy;
      if (d2 > rr * rr) return false;
      // a ring: whoever stands wholly inside its middle is safe
      const safe = t.inner - r;
      return !(safe > 0 && d2 < safe * safe);
    }
    case 'lane': {
      const dx = x - t.x;
      const dy = y - t.y;
      for (let i = 0; i < t.count; i++) {
        const a = laneAngle(t, i);
        const c = dcos(a);
        const s = dsin(a);
        const along = dx * c + dy * s;
        const across = -dx * s + dy * c;
        if (along >= -r && along <= t.length + r && Math.abs(across) <= t.width / 2 + r) return true;
      }
      return false;
    }
    case 'cone':
      return pointInSector(x, y, t.x, t.y, t.angle, t.halfArc, t.radius, r);
  }
}

export function stepTelegraphs(w: World, dt: number): void {
  let anyDead = false;
  for (const t of w.telegraphs) {
    t.t += dt;
    // A telegraph lingers a few ticks past its end so the flash of the hit can be drawn on it.
    if (t.t > t.dur + 0.12) t.dead = true;
    if (t.dead) anyDead = true;
  }
  if (anyDead) w.telegraphs = w.telegraphs.filter((t) => !t.dead);
}
