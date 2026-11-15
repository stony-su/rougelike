// How Echoes get about: they surround, they cut off, they move to a new spot. Each of these is
// something a player has to read, where an Echo that only walks at its target can be led in a
// circle for ever.
import { describe, expect, it } from 'vitest';
import { PIPER } from '../src/content/enemies/piper';
import { THRUM } from '../src/content/enemies/thrum';
import { spawnEnemy } from '../src/sim/ai';
import { wrapAngle } from '../src/sim/steer';
import { SIM_HZ, STEER } from '../src/sim/tuning';
import type { Enemy, World } from '../src/sim/types';
import { Pad, eventsOf, openWorld, place, run } from './helpers';

/** An Echo that has arrived and never attacks, so only how it moves is seen. */
function walker(w: World, def = THRUM, x = 2, y = 2): Enemy {
  const e = spawnEnemy(w, def, x, y, { instant: true });
  e.cooldowns.fill(9999);
  return e;
}
const angleFrom = (w: World, e: Enemy): number => Math.atan2(e.y - w.players[0].y, e.x - w.players[0].x);

describe('wrapAngle', () => {
  it('brings any angle into the half-open turn about zero', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2);
    expect(wrapAngle(7)).toBeCloseTo(7 - Math.PI * 2);
  });
});

describe('a pack that surrounds', () => {
  it('ends up all round its target, not in a file behind one another', () => {
    const w = openWorld(1);
    const p = w.players[0];
    place(p, 8, 7);
    // they all arrive from the same corner
    const pack = [0, 1, 2, 3, 4].map((i) => walker(w, THRUM, 2 + i * 0.6, 2 + (i % 2) * 0.6));
    for (let t = 0; t < 8 * SIM_HZ; t++) {
      run(w, 1, new Pad());
      p.hp = p.maxHp;
    }
    const angles = pack.map((e) => angleFrom(w, e)).sort((a, b) => a - b);
    const gaps = angles.map((a, i) => (i + 1 < angles.length ? angles[i + 1] - a : angles[0] + Math.PI * 2 - a));
    // no half of the ring is left empty, and no two stand on top of each other
    expect(Math.max(...gaps)).toBeLessThan(Math.PI);
    expect(Math.min(...gaps)).toBeGreaterThan(0.35);
    // and each is at its distance: near enough to strike, not on top of the player
    for (const e of pack) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      expect(d).toBeGreaterThan(1.4);
      expect(d).toBeLessThan(3.6);
    }
  });

  it('comes round the ring to its place rather than through the middle', () => {
    const w = openWorld(1);
    const p = w.players[0];
    place(p, 8, 7);
    const e = walker(w, THRUM, 10.5, 7);
    // its place is on the far side of the player
    e.slot = Math.PI;
    let nearest = Infinity;
    for (let t = 0; t < 5 * SIM_HZ; t++) {
      run(w, 1, new Pad());
      p.hp = p.maxHp;
      nearest = Math.min(nearest, Math.hypot(e.x - p.x, e.y - p.y));
    }
    expect(Math.abs(wrapAngle(angleFrom(w, e) - e.slot))).toBeLessThan(0.5);
    expect(nearest).toBeGreaterThan(1.5);
  });
});

describe('cutting off', () => {
  it('an Echo heads for where its target is going, not where it is', () => {
    const w = openWorld(1);
    const p = w.players[0];
    place(p, 4, 9);
    const e = walker(w, { ...THRUM, locomotion: { kind: 'chase', range: 1 } }, 12, 9);
    // the player runs straight up the room, across the Echo's line to them
    const pad = new Pad().move(0, -1);
    run(w, 30, pad);
    const toPlayer = Math.atan2(p.y - e.y, p.x - e.x);
    const heading = Math.atan2(e.vy, e.vx);
    // it leans ahead of them: turned from the straight line toward the way they are running
    const ahead = wrapAngle(heading - toPlayer);
    expect(ahead).toBeGreaterThan(0.05);
    expect(ahead).toBeLessThan(1.2);
    expect(STEER.leadMost).toBeGreaterThan(0);
  });

  it('far from its target it hurries', () => {
    const speedAt = (x: number): number => {
      const w = openWorld(1);
      place(w.players[0], 2, 7);
      const e = walker(w, { ...THRUM, locomotion: { kind: 'chase', range: 1 } }, x, 7);
      run(w, 40, new Pad());
      return Math.hypot(e.vx, e.vy);
    };
    expect(speedAt(13.5)).toBeGreaterThan(speedAt(7) * 1.15);
  });
});

describe('a skirmisher', () => {
  it('plays from a new spot after every volley, and keeps its distance', () => {
    const w = openWorld(1);
    const p = w.players[0];
    place(p, 8, 7);
    const e = spawnEnemy(w, PIPER, 12.5, 7, { instant: true });
    const from: number[] = [];
    for (let t = 0; t < 30 * SIM_HZ; t++) {
      const events = run(w, 1, new Pad());
      p.hp = p.maxHp;
      p.iframes = 1;
      if (eventsOf(events, 'enemyAttack').length > 0) from.push(angleFrom(w, e));
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (t > 3 * SIM_HZ) expect(d).toBeGreaterThan(2.5);
    }
    expect(from.length).toBeGreaterThanOrEqual(5);
    let moved = 0;
    for (let i = 1; i < from.length; i++) if (Math.abs(wrapAngle(from[i] - from[i - 1])) > 0.3) moved++;
    // nearly every volley comes from somewhere else
    expect(moved).toBeGreaterThanOrEqual(from.length - 2);
  });

  it('moves off when its target comes close', () => {
    const w = openWorld(1);
    const p = w.players[0];
    place(p, 8, 7);
    const e = walker(w, PIPER, 9.5, 7);
    for (let t = 0; t < 3 * SIM_HZ; t++) {
      run(w, 1, new Pad());
      p.hp = p.maxHp;
    }
    expect(Math.hypot(e.x - p.x, e.y - p.y)).toBeGreaterThan(3.5);
  });
});
