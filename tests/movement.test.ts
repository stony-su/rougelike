import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { roomTemplate } from '../src/content/rooms';
import { screenDirToWorld } from '../src/core/iso';
import { Rng } from '../src/core/rng';
import { buildRoom, isClear, resolveCircle } from '../src/sim/room';
import { DASH, DT, PLAYER } from '../src/sim/tuning';
import { emptyInput } from '../src/sim/types';
import type { InputFrame, World } from '../src/sim/types';
import { createWorld, stepWorld } from '../src/sim/world';

function world(): World {
  const w = createWorld(buildRoom(roomTemplate('bluefen-reedbed')), 1, CONTENT);
  // an open spot with plenty of room in every direction
  w.player.x = w.player.px = 6.5;
  w.player.y = w.player.py = 6.5;
  return w;
}

function input(over: Partial<InputFrame> = {}): InputFrame {
  return { ...emptyInput(), aimX: 100, aimY: 6.5, ...over };
}

function run(w: World, ticks: number, inp: InputFrame): void {
  for (let i = 0; i < ticks; i++) stepWorld(w, i === 0 ? inp : { ...inp, dashPressed: false, attackPressed: false, stakePressed: false, specialPressed: false });
}

describe('walking', () => {
  it('reaches run speed almost at once and holds it', () => {
    const w = world();
    run(w, 6, input({ moveX: 1 }));
    const early = Math.hypot(w.player.vx, w.player.vy);
    expect(early).toBeGreaterThan(PLAYER.speed * 0.9); // 0.1 s after the press
    const x0 = w.player.x;
    run(w, 30, input({ moveX: 1 }));
    expect((w.player.x - x0) / (30 * DT)).toBeCloseTo(PLAYER.speed, 0);
    expect(w.player.state).toBe('run');
  });

  it('stops quickly when the key is released', () => {
    const w = world();
    run(w, 30, input({ moveX: 1 }));
    const x0 = w.player.x;
    run(w, 30, input());
    expect(w.player.x - x0).toBeLessThan(0.3);
    expect(w.player.vx).toBe(0);
    expect(w.player.state).toBe('idle');
  });

  it('moves at the same world speed in every pressed direction', () => {
    const dirs: Array<[number, number]> = [[1, 0], [0, 1], [1, 1], [-1, 1]];
    const speeds = dirs.map(([ix, iy]) => {
      const w = world();
      const d = screenDirToWorld(ix, iy, { x: 0, y: 0 });
      run(w, 20, input({ moveX: d.x, moveY: d.y }));
      const x0 = w.player.x;
      const y0 = w.player.y;
      run(w, 20, input({ moveX: d.x, moveY: d.y }));
      return Math.hypot(w.player.x - x0, w.player.y - y0) / (20 * DT);
    });
    for (const s of speeds) expect(s).toBeCloseTo(PLAYER.speed, 1);
  });
});

describe('dash', () => {
  it('covers its distance in its time, with invulnerability', () => {
    const w = world();
    const x0 = w.player.x;
    stepWorld(w, input({ moveX: 1, dashPressed: true }));
    expect(w.player.state).toBe('dash');
    expect(w.player.iframes).toBeGreaterThan(0);
    const ticks = Math.round(DASH.time / DT);
    run(w, ticks, input({ moveX: 1 }));
    expect(w.player.x - x0).toBeGreaterThan(DASH.distance * 0.97);
    expect(w.player.x - x0).toBeLessThan(DASH.distance * 1.15);
    expect(w.player.state).not.toBe('dash');
  });

  it('spends charges and refills them one at a time', () => {
    const w = world();
    expect(w.player.dashCharges).toBe(DASH.charges);
    stepWorld(w, input({ moveX: 1, dashPressed: true }));
    run(w, 14, input());
    stepWorld(w, input({ moveX: -1, dashPressed: true }));
    run(w, 14, input());
    expect(w.player.dashCharges).toBe(0);
    // a third press with no charge does nothing
    stepWorld(w, input({ moveX: 1, dashPressed: true }));
    expect(w.player.state).not.toBe('dash');
    run(w, Math.ceil(DASH.recharge / DT), input());
    expect(w.player.dashCharges).toBeGreaterThanOrEqual(1);
    run(w, Math.ceil(DASH.recharge / DT) + 2, input());
    expect(w.player.dashCharges).toBe(DASH.charges);
  });

  it('goes toward the cursor when standing still', () => {
    const w = world();
    stepWorld(w, input({ aimX: 6.5, aimY: 20, dashPressed: true }));
    run(w, 12, input({ aimX: 6.5, aimY: 20 }));
    expect(w.player.y).toBeGreaterThan(6.5 + DASH.distance * 0.9);
    expect(Math.abs(w.player.x - 6.5)).toBeLessThan(0.05);
  });

  it('fires a buffered press on the first tick a charge is available', () => {
    const w = world();
    w.player.dashCharges = 0;
    w.player.dashRecharge = DASH.recharge - 3 * DT;
    stepWorld(w, input({ moveX: 1, dashPressed: true }));
    expect(w.player.state).not.toBe('dash');
    run(w, 5, input({ moveX: 1 }));
    expect(w.player.state).toBe('dash');
  });

  it('emits dash events for the renderer', () => {
    const w = world();
    stepWorld(w, input({ moveX: 1, dashPressed: true }));
    expect(w.events.some((e) => e.type === 'dash')).toBe(true);
    run(w, 14, input());
    expect(w.events.some((e) => e.type === 'dashEnd')).toBe(true);
  });
});

describe('collision', () => {
  it('pushes a circle out of the void and out of pillars', () => {
    const room = buildRoom(roomTemplate('bluefen-reedbed'));
    const pos = { x: -0.2, y: 5 };
    resolveCircle(room, pos, PLAYER.radius);
    expect(isClear(room, pos.x, pos.y, PLAYER.radius * 0.99)).toBe(true);
    const pillar = room.pillars[0];
    const q = { x: pillar.x + 0.05, y: pillar.y };
    resolveCircle(room, q, PLAYER.radius);
    expect(Math.hypot(q.x - pillar.x, q.y - pillar.y)).toBeGreaterThanOrEqual(pillar.r + PLAYER.radius - 1e-6);
  });

  it('never lets the player leave the floor, whatever the input', () => {
    const w = world();
    const rng = new Rng(2024);
    const dir = { x: 0, y: 0 };
    let inp = input();
    for (let t = 0; t < 12000; t++) {
      if (t % 17 === 0) {
        screenDirToWorld(rng.int(-1, 1), rng.int(-1, 1), dir);
        inp = input({ moveX: dir.x, moveY: dir.y, aimX: rng.float(-5, 20), aimY: rng.float(-5, 20), dashPressed: rng.chance(0.5) });
      } else {
        inp = { ...inp, dashPressed: false };
      }
      stepWorld(w, inp);
      const p = w.player;
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      if (!isClear(w.room, p.x, p.y, p.radius * 0.97)) {
        throw new Error(`player left the floor at tick ${t}: (${p.x.toFixed(3)}, ${p.y.toFixed(3)}) state ${p.state}`);
      }
    }
  });
});

describe('hit-stop', () => {
  it('freezes the world but still buffers presses', () => {
    const w = world();
    w.hitstop = 5 * DT;
    const t0 = w.time;
    const x0 = w.player.x;
    stepWorld(w, input({ moveX: 1, dashPressed: true }));
    run(w, 3, input({ moveX: 1 }));
    expect(w.time).toBe(t0);
    expect(w.player.x).toBe(x0);
    run(w, 3, input({ moveX: 1 }));
    expect(w.player.state).toBe('dash');
  });
});

describe('determinism', () => {
  it('replays identically for the same seed and inputs', () => {
    const play = (): string => {
      const w = world();
      const rng = new Rng(99);
      const dir = { x: 0, y: 0 };
      for (let t = 0; t < 1500; t++) {
        screenDirToWorld(rng.int(-1, 1), rng.int(-1, 1), dir);
        stepWorld(w, input({ moveX: dir.x, moveY: dir.y, dashPressed: rng.chance(0.03) }));
      }
      return `${w.player.x},${w.player.y},${w.player.dashCharges},${w.tick}`;
    };
    expect(play()).toBe(play());
  });
});
