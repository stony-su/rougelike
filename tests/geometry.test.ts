// The collision shape of a chamber and the one cast everything shares: what the walls are, that
// nothing ends up inside them, that nothing passes through them, and that a bounce off a wall is
// an exact mirror.
import { describe, expect, it } from 'vitest';
import { PRACTICE_COURT } from '../src/content/rooms/practice-court';
import { Rng } from '../src/core/rng';
import { HIT_BUMPER, HIT_POST, HIT_WALL, castCircle, isOpen, newHit, slideCircle } from '../src/sim/cast';
import type { RoomTemplate } from '../src/sim/defs';
import { NORMALS, TILE, reflectFixed, reflectFree } from '../src/sim/geo';
import { NAV_FAR, buildNav, navStep } from '../src/sim/nav';
import { buildRoom, groundAt, isClear, nearestFloor, validateRoomTemplate } from '../src/sim/room';
import { BOUNCE_ROOM, OPEN_ROOM } from './fixtures';

const box = (map: string[]): RoomTemplate => ({ id: 'test-box', name: 'Box', zone: 'outer', kind: 'combat', map });

describe('room templates', () => {
  it('the practice court and the fixtures are closed, connected and fair', () => {
    for (const t of [PRACTICE_COURT, OPEN_ROOM, BOUNCE_ROOM]) expect(validateRoomTemplate(t), t.id).toEqual([]);
  });

  it('the validator notices an arena open to the void, an island, and too few spawn marks', () => {
    const open = validateRoomTemplate(box(['#####', '#.P.r', '#####']));
    expect(open.some((m) => m.includes('open to the void'))).toBe(true);
    const island = validateRoomTemplate(box(['#######', '#P.#.r#', '#######']));
    expect(island.some((m) => m.includes('cannot be reached'))).toBe(true);
    expect(island.some((m) => m.includes('spawn marks'))).toBe(true);
  });
});

describe('the collision shape', () => {
  it('a plain box is four long walls facing inward', () => {
    const room = buildRoom(box(['######', '#P..r#', '#....#', '#....#', '######']));
    expect(room.geo.fly).toHaveLength(4);
    const byNormal = [...room.geo.fly].sort((a, b) => a.ntype - b.ntype);
    // +x faces the room from the left wall, -x from the right, +y from the top, -y from the bottom
    expect(byNormal.map((s) => s.ntype)).toEqual([0, 1, 2, 3]);
    expect(byNormal[0]).toMatchObject({ ax: 1, bx: 1 });
    expect(byNormal[1]).toMatchObject({ ax: 5, bx: 5 });
    expect(byNormal[2]).toMatchObject({ ay: 1, by: 1 });
    expect(byNormal[3]).toMatchObject({ ay: 4, by: 4 });
    for (const s of room.geo.fly) expect(Math.hypot(s.bx - s.ax, s.by - s.ay)).toBeGreaterThanOrEqual(3);
    // with no pits, walking and flying meet the same walls
    expect(room.geo.walk).toHaveLength(4);
  });

  it('a cut corner is one slanted wall, joined across tiles', () => {
    const room = buildRoom(box(['######', '##7.r#', '#7...#', '#P...#', '######']));
    const slanted = room.geo.fly.filter((s) => s.ntype >= 4);
    expect(slanted).toHaveLength(1);
    const s = slanted[0];
    expect(s.ntype).toBe(4);
    expect([s.ax, s.ay, s.bx, s.by]).toEqual([3, 1, 1, 3]);
    expect(s.nx).toBeCloseTo(Math.SQRT1_2);
    expect(s.ny).toBeCloseTo(Math.SQRT1_2);
    // the floor half of a cut tile is floor, the wall half is solid
    expect(groundAt(room, 2.8, 1.8)).toBe('floor');
    expect(groundAt(room, 2.2, 1.2)).toBe('solid');
  });

  it('a pit stops walkers and lets things in flight over', () => {
    const room = buildRoom(BOUNCE_ROOM);
    expect(room.geo.walk.length).toBeGreaterThan(room.geo.fly.length);
    const hit = newHit();
    // straight across the pit, at walking height and in the air
    expect(castCircle(room.geo, true, 5.5, 7.5, 6, 0, 0.3, hit)).toBe(true);
    expect(hit.kind).toBe(HIT_WALL);
    expect(5.5 + 6 * hit.t).toBeCloseTo(8 - 0.3);
    expect(castCircle(room.geo, false, 5.5, 7.5, 6, 0, 0.3, hit)).toBe(false);
    expect(groundAt(room, 8.5, 7.5)).toBe('pit');
    expect(isClear(room, 8.5, 7.5, 0.1)).toBe(false);
  });

  it('posts and bumpers are circles, told apart', () => {
    const room = buildRoom(BOUNCE_ROOM);
    const hit = newHit();
    expect(castCircle(room.geo, false, 2.5, 3.5, 6, 0, 0.2, hit)).toBe(true);
    expect(hit.kind).toBe(HIT_POST);
    expect(hit.nx).toBeCloseTo(-1);
    expect(castCircle(room.geo, false, 16.5, 3.5, -6, 0, 0.2, hit)).toBe(true);
    expect(hit.kind).toBe(HIT_BUMPER);
    expect(hit.nx).toBeCloseTo(1);
  });
});

describe('bounces', () => {
  it('a mirror in any of the eight walls keeps the speed to the last bit', () => {
    const rng = new Rng(7);
    const out = { x: 0, y: 0 };
    for (let i = 0; i < 4000; i++) {
      const vx = rng.float(-40, 40);
      const vy = rng.float(-40, 40);
      for (let n = 0; n < NORMALS.length; n++) {
        reflectFixed(vx, vy, n, out);
        expect(Math.sqrt(out.x * out.x + out.y * out.y)).toBe(Math.sqrt(vx * vx + vy * vy));
        // and it is the mirror image: the part along the normal is turned round, the rest kept
        const [nx, ny] = NORMALS[n];
        expect(out.x * nx + out.y * ny).toBeCloseTo(-(vx * nx + vy * ny), 9);
        expect(-out.x * ny + out.y * nx).toBeCloseTo(-vx * ny + vy * nx, 9);
      }
    }
  });

  it('a mirror in a round thing turns the velocity about its normal', () => {
    const out = { x: 0, y: 0 };
    reflectFree(3, -4, 0, 1, out);
    expect(out).toEqual({ x: 3, y: 4 });
    reflectFree(5, 0, -Math.SQRT1_2, Math.SQRT1_2, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(5);
  });
});

describe('the cast', () => {
  const rooms = [buildRoom(PRACTICE_COURT), buildRoom(BOUNCE_ROOM)];

  it('never reports a contact inside something solid', () => {
    const rng = new Rng(11);
    const hit = newHit();
    let contacts = 0;
    for (const room of rooms) {
      for (let i = 0; i < 6000; i++) {
        const r = rng.float(0.1, 0.6);
        const x = rng.float(1, room.w - 1);
        const y = rng.float(1, room.h - 1);
        const walk = rng.chance(0.5);
        if (groundAt(room, x, y) !== 'floor' || !isOpen(room.geo, walk, x, y, r)) continue;
        const dx = rng.float(-14, 14);
        const dy = rng.float(-14, 14);
        if (!castCircle(room.geo, walk, x, y, dx, dy, r, hit)) {
          // a clear way really is clear: the far end touches nothing
          expect(isOpen(room.geo, walk, x + dx, y + dy, r - 1e-6)).toBe(true);
          continue;
        }
        contacts++;
        expect(hit.t).toBeGreaterThanOrEqual(0);
        expect(hit.t).toBeLessThanOrEqual(1);
        expect(isOpen(room.geo, walk, x + dx * hit.t, y + dy * hit.t, r - 1e-6)).toBe(true);
        // the normal faces back at the mover
        expect(hit.nx * dx + hit.ny * dy).toBeLessThan(1e-9);
      }
    }
    expect(contacts).toBeGreaterThan(3000);
  });

  it('gives the same answer whatever order the walls are stored in', () => {
    const rng = new Rng(5);
    const room = rooms[0];
    const shuffled = { ...room.geo, fly: [...room.geo.fly].reverse(), walk: [...room.geo.walk].reverse(), circles: [...room.geo.circles].reverse() };
    const a = newHit();
    const b = newHit();
    for (let i = 0; i < 3000; i++) {
      const x = rng.float(2, room.w - 2);
      const y = rng.float(2, room.h - 2);
      if (!isClear(room, x, y, 0.3)) continue;
      const dx = rng.float(-20, 20);
      const dy = rng.float(-20, 20);
      const ha = castCircle(room.geo, true, x, y, dx, dy, 0.3, a);
      const hb = castCircle(shuffled, true, x, y, dx, dy, 0.3, b);
      expect(hb).toBe(ha);
      if (ha) {
        expect(b.t).toBe(a.t);
        expect(b.nx).toBe(a.nx);
        expect(b.ny).toBe(a.ny);
      }
    }
  });

  it('sliding never leaves a walker inside a wall, a post or a pit', () => {
    const rng = new Rng(23);
    const hit = newHit();
    for (const room of rooms) {
      const pos = { x: room.start.x, y: room.start.y };
      const r = 0.32;
      for (let i = 0; i < 20000; i++) {
        // long, fast, erratic steps: far harsher than any player or Echo
        const dx = rng.float(-1.2, 1.2);
        const dy = rng.float(-1.2, 1.2);
        slideCircle(room.geo, true, pos, r, dx, dy, hit);
        if (groundAt(room, pos.x, pos.y) !== 'floor' || !isOpen(room.geo, true, pos.x, pos.y, r * 0.98)) {
          throw new Error(`${room.id}: slid into something at step ${i}: (${pos.x}, ${pos.y})`);
        }
      }
    }
  });

  it('sliding along a wall keeps the motion along it', () => {
    const room = buildRoom(OPEN_ROOM);
    const pos = { x: 5, y: 12.5 };
    // pressing down and right into the bottom wall: the rightward half survives
    for (let i = 0; i < 30; i++) slideCircle(room.geo, true, pos, 0.32, 0.1, 0.1, newHit());
    expect(pos.y).toBeCloseTo(13 - 0.32, 2);
    expect(pos.x).toBeGreaterThan(7.5);
  });
});

describe('finding a way round', () => {
  it('counts steps round a pit, and knows where there is no way', () => {
    const room = buildRoom(BOUNCE_ROOM);
    // a target just right of the pit
    const f = buildNav(room, 11, 7);
    const at = (x: number, y: number): number => f.dist[y * room.w + x];
    expect(at(11, 7)).toBe(0);
    expect(at(12, 7)).toBe(1);
    // a step may be diagonal, so passing the pit on its open side costs nothing extra
    expect(at(6, 7)).toBe(5);
    // but no step cuts the corner of a pit: from the row below, the way round is longer than the 3 across
    const g = buildNav(room, 10, 8);
    expect(g.dist[8 * room.w + 7]).toBe(5);
    // pits, walls and the tile a post stands on are no place to walk
    expect(at(8, 7)).toBe(NAV_FAR);
    expect(at(0, 0)).toBe(NAV_FAR);
    expect(at(5, 3)).toBe(NAV_FAR);
    expect(room.tiles[7 * room.w + 8]).toBe(TILE.pit);
  });

  it('following the field downhill reaches the target without touching the pit', () => {
    const room = buildRoom(BOUNCE_ROOM);
    const f = buildNav(room, 11, 7);
    const pos = { x: 6.5, y: 7.5 };
    const dir = { x: 0, y: 0 };
    const hit = newHit();
    let steps = 0;
    while ((Math.floor(pos.x) !== 11 || Math.floor(pos.y) !== 7) && steps++ < 600) {
      expect(navStep(room, f, pos.x, pos.y, dir)).toBe(true);
      slideCircle(room.geo, true, pos, 0.38, dir.x * 0.06, dir.y * 0.06, hit);
      expect(groundAt(room, pos.x, pos.y)).toBe('floor');
    }
    expect(steps).toBeLessThan(600);
  });

  it('finds the floor nearest a point in a pit', () => {
    const room = buildRoom(BOUNCE_ROOM);
    const out = { x: 0, y: 0 };
    nearestFloor(room, 8.2, 7.5, 0.4, out);
    expect(isClear(room, out.x, out.y, 0.4)).toBe(true);
    // it came out on the near side
    expect(out.x).toBeLessThan(8);
    expect(Math.hypot(out.x - 8.2, out.y - 7.5)).toBeLessThan(1.5);
  });
});
