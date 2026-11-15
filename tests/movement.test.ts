import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { PRACTICE_COURT } from '../src/content/rooms/practice-court';
import { Rng } from '../src/core/rng';
import { freezeBody, freezeWorld } from '../src/sim/combat';
import { pushOut } from '../src/sim/cast';
import { buildRoom, isClear } from '../src/sim/room';
import { DASH, DT, PLAYER } from '../src/sim/tuning';
import { createWorld } from '../src/sim/world';
import { PRESS, Pad, openWorld, run } from './helpers';

describe('walking', () => {
  it('reaches run speed almost at once and holds it', () => {
    const w = openWorld();
    const p = w.players[0];
    const pad = new Pad().move(1, 0);
    run(w, 6, pad);
    expect(Math.hypot(p.vx, p.vy)).toBeGreaterThan(PLAYER.speed * 0.9); // 0.1 s after the press
    const x0 = p.x;
    run(w, 30, pad);
    expect((p.x - x0) / (30 * DT)).toBeCloseTo(PLAYER.speed, 0);
    expect(p.state).toBe('run');
  });

  it('stops quickly when the key is released', () => {
    const w = openWorld();
    const p = w.players[0];
    const pad = new Pad().move(1, 0);
    run(w, 30, pad);
    const x0 = p.x;
    run(w, 30, pad.stop());
    expect(p.x - x0).toBeLessThan(0.3);
    expect(p.vx).toBe(0);
    expect(p.state).toBe('idle');
  });

  it('moves at the same speed in every direction, and exactly along the axes', () => {
    const dirs: Array<[number, number]> = [
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 1],
      [-3, 1],
    ];
    for (const [dx, dy] of dirs) {
      const w = openWorld();
      const p = w.players[0];
      const pad = new Pad().move(dx, dy);
      run(w, 20, pad);
      const x0 = p.x;
      const y0 = p.y;
      run(w, 20, pad);
      expect(Math.hypot(p.x - x0, p.y - y0) / (20 * DT)).toBeCloseTo(PLAYER.speed, 1);
      if (dy === 0) expect(p.y).toBe(y0);
    }
  });

  it('walks slower when the stick is only part-way over', () => {
    const w = openWorld();
    const p = w.players[0];
    const pad = new Pad().move(1, 0, 0.5);
    run(w, 40, pad);
    const x0 = p.x;
    run(w, 30, pad);
    const speed = (p.x - x0) / (30 * DT);
    expect(speed).toBeGreaterThan(PLAYER.speed * 0.4);
    expect(speed).toBeLessThan(PLAYER.speed * 0.6);
  });
});

describe('dash', () => {
  it('covers its distance in its time, with invulnerability', () => {
    const w = openWorld();
    const p = w.players[0];
    const pad = new Pad().move(1, 0);
    run(w, 1, pad); // a new character ignores whatever the counters held
    const x0 = p.x;
    run(w, 1, pad.tap(PRESS.dash));
    expect(p.state).toBe('dash');
    expect(p.iframes).toBeGreaterThan(0);
    run(w, Math.round(DASH.time / DT), pad);
    expect(p.x - x0).toBeGreaterThan(DASH.distance * 0.97);
    expect(p.x - x0).toBeLessThan(DASH.distance * 1.15);
    expect(p.state).not.toBe('dash');
  });

  it('spends charges and refills them one at a time', () => {
    const w = openWorld();
    const p = w.players[0];
    const pad = new Pad();
    run(w, 1, pad);
    expect(p.dashCharges).toBe(DASH.charges);
    run(w, 15, pad.move(1, 0).tap(PRESS.dash));
    run(w, 15, pad.move(-1, 0).tap(PRESS.dash));
    expect(p.dashCharges).toBe(0);
    // a third press with no charge does nothing
    run(w, 1, pad.move(1, 0).tap(PRESS.dash));
    expect(p.state).not.toBe('dash');
    run(w, 12, pad.stop()); // let the unused press expire
    run(w, Math.ceil(DASH.recharge / DT), pad);
    expect(p.dashCharges).toBeGreaterThanOrEqual(1);
    run(w, Math.ceil(DASH.recharge / DT) + 2, pad);
    expect(p.dashCharges).toBe(DASH.charges);
  });

  it('goes where the player aims when standing still', () => {
    const w = openWorld();
    const p = w.players[0];
    const pad = new Pad();
    run(w, 1, pad);
    pad.aimAt(p, p.x, p.y - 5).tap(PRESS.dash);
    const y0 = p.y;
    run(w, 13, pad);
    expect(y0 - p.y).toBeGreaterThan(DASH.distance * 0.9);
    expect(Math.abs(p.x - 6.5)).toBeLessThan(0.05);
  });

  it('fires a buffered press on the first tick a charge is available', () => {
    const w = openWorld();
    const p = w.players[0];
    const pad = new Pad().move(1, 0);
    run(w, 1, pad);
    p.dashCharges = 0;
    p.dashRecharge = DASH.recharge - 3 * DT;
    run(w, 1, pad.tap(PRESS.dash));
    expect(p.state).not.toBe('dash');
    run(w, 5, pad);
    expect(p.state).toBe('dash');
  });

  it('counts a press once however many ticks carry the same counter', () => {
    const w = openWorld();
    const p = w.players[0];
    const pad = new Pad().move(1, 0);
    run(w, 1, pad);
    const ev = run(w, 60, pad.tap(PRESS.dash));
    expect(ev.filter((e) => e.type === 'dash')).toHaveLength(1);
    expect(p.dashCharges).toBeLessThan(DASH.charges + 1);
  });
});

describe('collision', () => {
  it('pushes a circle out of a wall it overlaps and out of posts', () => {
    const room = buildRoom(PRACTICE_COURT);
    const pos = { x: 1.1, y: 5.5 };
    expect(isClear(room, pos.x, pos.y, PLAYER.radius)).toBe(false);
    expect(pushOut(room.geo, true, pos, PLAYER.radius)).toBe(true);
    expect(isClear(room, pos.x, pos.y, PLAYER.radius * 0.99)).toBe(true);
    const post = room.geo.circles[0];
    const q = { x: post.x + 0.05, y: post.y };
    pushOut(room.geo, true, q, PLAYER.radius);
    expect(Math.hypot(q.x - post.x, q.y - post.y)).toBeGreaterThanOrEqual(post.r + PLAYER.radius - 1e-6);
  });

  it('never lets a player leave the floor, whatever the input', () => {
    const w = createWorld(buildRoom(PRACTICE_COURT), 3, CONTENT);
    w.flow.phase = 'cleared';
    const p = w.players[0];
    const rng = new Rng(2024);
    const pad = new Pad();
    for (let t = 0; t < 12000; t++) {
      if (t % 17 === 0) {
        pad.move(rng.int(-1, 1), rng.int(-1, 1));
        pad.aimAt(p, rng.float(-5, 25), rng.float(-5, 25));
        if (rng.chance(0.5)) pad.tap(PRESS.dash);
      }
      run(w, 1, pad);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      if (!isClear(w.room, p.x, p.y, p.radius * 0.97)) {
        throw new Error(`player left the floor at tick ${t}: (${p.x.toFixed(3)}, ${p.y.toFixed(3)}) state ${p.state}`);
      }
    }
  });
});

describe('hit-stop', () => {
  it('freezes one body while everything else keeps moving, and still buffers presses', () => {
    const w = openWorld(2);
    const [a, b] = w.players;
    const padA = new Pad().move(1, 0);
    const padB = new Pad().move(1, 0);
    run(w, 1, padA, padB);
    freezeBody(a, 5);
    const ax = a.x;
    const bx = b.x;
    run(w, 4, padA.tap(PRESS.dash), padB);
    expect(a.x).toBe(ax);
    expect(b.x).toBeGreaterThan(bx);
    // the dash pressed during the freeze fires when it ends
    run(w, 3, padA, padB);
    expect(a.state).toBe('dash');
  });

  it('a whole-chamber freeze stops time for everyone, and cannot be repeated at once', () => {
    const w = openWorld();
    const p = w.players[0];
    const pad = new Pad().move(1, 0);
    run(w, 10, pad);
    freezeWorld(w, 6);
    const t0 = w.time;
    const x0 = p.x;
    run(w, 6, pad);
    expect(w.time).toBe(t0);
    expect(p.x).toBe(x0);
    run(w, 2, pad);
    expect(p.x).toBeGreaterThan(x0);
    freezeWorld(w, 6);
    expect(w.freeze).toBe(0);
  });
});
