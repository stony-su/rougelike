import { describe, expect, it } from 'vitest';
import { ddamp, ddampAngle, normInto } from '../src/core/exact';
import { circleTouchesSegment, pointInSector, segSegT } from '../src/core/geom';
import { ISO_COS, ISO_SIN, TILE, project, projectAngle, screenDirToWorld, unproject } from '../src/core/iso';
import { angleDiff, damp, mixColor, wrapAngle } from '../src/core/math';
import { Rng } from '../src/core/rng';

describe('isometric projection', () => {
  it('uses true 30 degree axes', () => {
    const p = project(1, 0, 0, { x: 0, y: 0 });
    expect(p.x).toBeCloseTo(ISO_COS * TILE);
    expect(p.y).toBeCloseTo(ISO_SIN * TILE);
    expect(Math.atan2(p.y, p.x)).toBeCloseTo(Math.PI / 6);
    const q = project(0, 1, 0, { x: 0, y: 0 });
    expect(Math.atan2(q.y, -q.x)).toBeCloseTo(Math.PI / 6);
  });

  it('raises height straight up the screen', () => {
    const a = project(3, 4, 0, { x: 0, y: 0 });
    const b = project(3, 4, 2, { x: 0, y: 0 });
    expect(b.x).toBeCloseTo(a.x);
    expect(a.y - b.y).toBeCloseTo(2 * TILE);
  });

  it('round-trips ground points through unproject', () => {
    for (const [x, y] of [
      [0, 0],
      [5.25, 1.5],
      [-3, 7.75],
      [12, 12],
    ] as const) {
      const s = project(x, y, 0, { x: 0, y: 0 });
      const w = unproject(s.x, s.y, { x: 0, y: 0 });
      expect(w.x).toBeCloseTo(x, 9);
      expect(w.y).toBeCloseTo(y, 9);
    }
  });

  it('maps a pressed screen direction to a unit world direction that moves that way on screen', () => {
    const cases: Array<[number, number]> = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];
    for (const [ix, iy] of cases) {
      const w = screenDirToWorld(ix, iy, { x: 0, y: 0 });
      expect(Math.hypot(w.x, w.y)).toBeCloseTo(1);
      const s = project(w.x, w.y, 0, { x: 0, y: 0 });
      const want = Math.atan2(iy, ix);
      expect(Math.abs(angleDiff(Math.atan2(s.y, s.x), want))).toBeLessThan(1e-9);
    }
    const zero = screenDirToWorld(0, 0, { x: 9, y: 9 });
    expect(zero).toEqual({ x: 0, y: 0 });
  });

  it('projects angles consistently with points', () => {
    for (const a of [0, 0.7, 1.9, -2.4, Math.PI]) {
      const s = project(Math.cos(a), Math.sin(a), 0, { x: 0, y: 0 });
      expect(Math.abs(angleDiff(projectAngle(a), Math.atan2(s.y, s.x)))).toBeLessThan(1e-9);
    }
  });
});

describe('geometry', () => {
  it('finds segment crossings and rejects misses', () => {
    expect(segSegT(0, 0, 4, 0, 2, -1, 2, 1)).toBeCloseTo(0.5);
    expect(segSegT(0, 0, 4, 0, 5, -1, 5, 1)).toBe(-1);
    expect(segSegT(0, 0, 4, 0, 0, 1, 4, 1)).toBe(-1); // parallel
    expect(segSegT(0, 0, 4, 4, 0, 4, 4, 0)).toBeCloseTo(0.5);
  });

  it('tests circles against segments and sectors', () => {
    expect(circleTouchesSegment(2, 0.4, 0.5, 0, 0, 4, 0)).toBe(true);
    expect(circleTouchesSegment(2, 0.6, 0.5, 0, 0, 4, 0)).toBe(false);
    expect(circleTouchesSegment(4.4, 0, 0.5, 0, 0, 4, 0)).toBe(true);
    expect(pointInSector(1, 0.2, 0, 0, 0, 0.5, 2)).toBe(true);
    expect(pointInSector(-1, 0, 0, 0, 0, 0.5, 2)).toBe(false);
    expect(pointInSector(3, 0, 0, 0, 0, 0.5, 2)).toBe(false);
    // a sector across the +-PI seam
    expect(pointInSector(-1, -0.1, 0, 0, Math.PI, 0.5, 2)).toBe(true);
  });

  it('lets a body just outside a sector edge be touched, by exactly its own radius', () => {
    // a point 30 degrees off the facing, at distance 1.5, against a 20 degree half-arc
    const a = (30 * Math.PI) / 180;
    const x = Math.cos(a) * 1.5;
    const y = Math.sin(a) * 1.5;
    const off = 1.5 * Math.sin(a - (20 * Math.PI) / 180); // distance from the point to the sector's edge ray
    expect(pointInSector(x, y, 0, 0, 0, (20 * Math.PI) / 180, 3, 0)).toBe(false);
    expect(pointInSector(x, y, 0, 0, 0, (20 * Math.PI) / 180, 3, off * 0.98)).toBe(false);
    expect(pointInSector(x, y, 0, 0, 0, (20 * Math.PI) / 180, 3, off * 1.02)).toBe(true);
    // the pad extends the reach too, and a body over the apex always counts
    expect(pointInSector(3.2, 0, 0, 0, 0, 0.3, 3, 0.25)).toBe(true);
    expect(pointInSector(-0.1, 0, 0, 0, 0, 0.3, 3, 0.25)).toBe(true);
  });
});

describe('exact helpers for the simulation', () => {
  it('ddamp is frame-rate independent and agrees with the damp the renderer uses', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = ddamp(a, 1, 8, 1 / 60);
    let b = 0;
    for (let i = 0; i < 240; i++) b = ddamp(b, 1, 8, 1 / 240);
    expect(a).toBeCloseTo(b, 6);
    expect(ddamp(0.2, 1, 8, 1 / 60)).toBeCloseTo(damp(0.2, 1, 8, 1 / 60), 12);
  });

  it('turns by the shortest way and normalises vectors', () => {
    expect(ddampAngle(3, -3, 1000, 1)).toBeCloseTo(-3 + Math.PI * 2, 6);
    const out = { x: 0, y: 0 };
    expect(normInto(3, 4, out)).toBe(5);
    expect(out.x).toBeCloseTo(0.6);
    expect(out.y).toBeCloseTo(0.8);
    expect(normInto(0, 0, out)).toBe(0);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe('math helpers', () => {
  it('damp is frame-rate independent', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 8, 1 / 60);
    let b = 0;
    for (let i = 0; i < 240; i++) b = damp(b, 1, 8, 1 / 240);
    expect(a).toBeCloseTo(b, 6);
  });

  it('wraps angles and mixes colours', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI);
    expect(angleDiff(3, -3)).toBeCloseTo(Math.PI * 2 - 6);
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixColor(0x102030, 0x405060, 0)).toBe(0x102030);
  });
});

describe('seeded rng', () => {
  it('reproduces a sequence for a seed and differs across seeds', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const sa = Array.from({ length: 20 }, () => a.next());
    const sb = Array.from({ length: 20 }, () => b.next());
    const sc = Array.from({ length: 20 }, () => c.next());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    expect(sa.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('forks independent, repeatable streams without advancing the parent', () => {
    const a = new Rng('run');
    const before = a.state;
    const f1 = a.fork('drafts').next();
    const f2 = a.fork('drafts').next();
    const f3 = a.fork('rooms').next();
    expect(a.state).toBe(before);
    expect(f1).toBe(f2);
    expect(f1).not.toBe(f3);
  });

  it('shuffles and picks within bounds', () => {
    const r = new Rng(7);
    const items = [1, 2, 3, 4, 5, 6];
    const shuffled = r.shuffle(items.slice());
    expect(shuffled.slice().sort()).toEqual(items);
    for (let i = 0; i < 100; i++) {
      const n = r.int(2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
    expect(r.weighted(['a', 'b'], (v) => (v === 'b' ? 1 : 0))).toBe('b');
  });
});
