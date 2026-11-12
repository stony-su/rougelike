// Rule tests for Running the Line. Each rule in DESIGN.md section 2 has a test here.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { SMUDGE } from '../src/content/enemies';
import { roomTemplate } from '../src/content/rooms';
import { Rng } from '../src/core/rng';
import { spawnEnemy } from '../src/sim/ai';
import {
  activeLines,
  addHostileChain,
  addHostileClaim,
  computeSweep,
  hammerStake,
  hostileStakeCount,
  loseStake,
  pairIndex,
  plantHostileStake,
  plantedInOrder,
  pressStake,
  previewSweep,
  relocateStake,
  returnStakes,
  severLine,
} from '../src/sim/lines';
import { buildRoom } from '../src/sim/room';
import { DASH, DT, LINES, PLAYER, ROD } from '../src/sim/tuning';
import { emptyInput } from '../src/sim/types';
import type { Enemy, InputFrame, SimEvent, World } from '../src/sim/types';
import { createWorld, stepWorld } from '../src/sim/world';

function world(seed = 5): World {
  const w = createWorld(buildRoom(roomTemplate('bluefen-reedbed')), seed, CONTENT);
  place(w, 6.5, 6.5);
  return w;
}

function place(w: World, x: number, y: number): void {
  w.player.x = w.player.px = x;
  w.player.y = w.player.py = y;
  w.player.vx = w.player.vy = 0;
}

const inp = (o: Partial<InputFrame> = {}): InputFrame => ({ ...emptyInput(), aimX: 100, aimY: 6.5, ...o });

function steps(w: World, n: number, f: InputFrame = inp()): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    stepWorld(w, i === 0 ? f : { ...f, attackPressed: false, dashPressed: false, specialPressed: false, stakePressed: false });
    out.push(...w.events);
    w.events.length = 0;
  }
  return out;
}

const secs = (s: number): number => Math.round(s / DT);

/** A motionless, immovable target that never attacks. */
function dummy(w: World, x: number, y: number, hp = 1000): Enemy {
  const e = spawnEnemy(w, { ...SMUDGE, speed: 0, mass: 60 }, x, y, { instant: true });
  e.cooldowns.fill(9999);
  e.hp = e.maxHp = hp;
  return e;
}

/** Plant a stake at a position by standing there and pressing E. */
function plantAt(w: World, x: number, y: number): SimEvent[] {
  place(w, x, y);
  return steps(w, 1, inp({ stakePressed: true }));
}

/** The standard triangle used by most tests: stakes at (4,4), (9,4), (6.5,9). */
function triangle(w: World): void {
  plantAt(w, 4, 4);
  plantAt(w, 9, 4);
  plantAt(w, 6.5, 9);
}

describe('stakes and links', () => {
  it('E plants the held stakes in order, then the fourth press whips the oldest', () => {
    const w = world();
    expect(w.lines.stakes.every((s) => s.state === 'held')).toBe(true);
    expect(plantAt(w, 4, 4).some((e) => e.type === 'stakePlant')).toBe(true);
    plantAt(w, 9, 4);
    plantAt(w, 6.5, 9);
    expect(w.lines.stakes.map((s) => s.state)).toEqual(['planted', 'planted', 'planted']);
    expect(plantedInOrder(w.lines).map((s) => s.id)).toEqual([0, 1, 2]);
    steps(w, secs(0.4));
    place(w, 6.5, 6.5);
    const ev = steps(w, 1, inp({ stakePressed: true }));
    const whip = ev.find((e) => e.type === 'whip');
    expect(whip && whip.type === 'whip' && whip.stake).toBe(0);
    expect(w.lines.stakes[0].state).toBe('flying');
    steps(w, secs(LINES.whipTime) + 1);
    expect(w.lines.stakes[0].state).toBe('planted');
    expect(w.lines.stakes[0].x).toBeCloseTo(6.5);
    // stake 0 is now the newest; stake 1 is the oldest
    expect(plantedInOrder(w.lines).map((s) => s.id)).toEqual([1, 2, 0]);
  });

  it('links two stakes with one line and three with three', () => {
    const w = world();
    plantAt(w, 4, 4);
    expect(activeLines(w.lines)).toHaveLength(0);
    plantAt(w, 9, 4);
    expect(activeLines(w.lines)).toHaveLength(1);
    plantAt(w, 6.5, 9);
    expect(activeLines(w.lines)).toHaveLength(3);
  });

  it('never stacks two stakes on one spot', () => {
    const w = world();
    plantAt(w, 6, 6);
    plantAt(w, 6, 6);
    plantAt(w, 6.1, 6);
    const [a, b, c] = w.lines.stakes;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(LINES.minSpacing - 1e-6);
    expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeGreaterThanOrEqual(LINES.minSpacing - 1e-6);
    for (const s of w.lines.stakes) expect(Number.isFinite(s.x + s.y)).toBe(true);
  });

  it('a link longer than the range is not an active line and there is no Plot', () => {
    const w = world();
    plantAt(w, 0.5, 4);
    plantAt(w, 13.4, 4.2); // about 12.9 tiles away
    plantAt(w, 6.5, 8);
    const far = w.lines.lines[pairIndex(0, 1)];
    expect(far.linked).toBe(true);
    expect(far.active).toBe(false);
    expect(activeLines(w.lines)).toHaveLength(2);
    expect(w.lines.plot).toBeNull();
    steps(w, secs(3));
    expect(far.ripe).toBe(false);
  });

  it('refuses when every stake is lost, and returns all stakes to hand on leaving', () => {
    const w = world();
    triangle(w);
    returnStakes(w);
    expect(w.lines.stakes.every((s) => s.state === 'held')).toBe(true);
    expect(activeLines(w.lines)).toHaveLength(0);
    expect(w.lines.plot).toBeNull();
    for (const s of w.lines.stakes) s.state = 'lost';
    for (const s of w.lines.stakes) s.lostT = 99;
    expect(pressStake(w)).toBe('refused');
  });
});

describe('ripeness', () => {
  it('a line turns ripe after its ends have been still for the ripen time', () => {
    const w = world();
    plantAt(w, 4, 4);
    plantAt(w, 9, 4);
    const line = w.lines.lines[pairIndex(0, 1)];
    const ev = steps(w, secs(LINES.ripeTime) - 3);
    expect(line.ripe).toBe(false);
    expect(ev.some((e) => e.type === 'lineRipe')).toBe(false);
    const ev2 = steps(w, 6);
    expect(line.ripe).toBe(true);
    expect(ev2.filter((e) => e.type === 'lineRipe')).toHaveLength(1);
  });

  it('planting a new stake does not disturb lines between the other stakes', () => {
    const w = world();
    plantAt(w, 4, 4);
    plantAt(w, 9, 4);
    steps(w, secs(2));
    plantAt(w, 6.5, 9);
    expect(w.lines.lines[pairIndex(0, 1)].clock).toBeGreaterThan(1.9);
    expect(w.lines.lines[pairIndex(0, 2)].clock).toBeLessThan(0.1);
  });

  it('moving a stake restarts the clocks of its lines only', () => {
    const w = world();
    triangle(w);
    steps(w, secs(LINES.ripeTime + 0.2));
    expect(activeLines(w.lines).every((l) => l.ripe)).toBe(true);
    place(w, 6.5, 6.5);
    steps(w, 1, inp({ stakePressed: true })); // whips stake 0
    steps(w, secs(LINES.whipTime) + 2);
    expect(w.lines.lines[pairIndex(1, 2)].ripe).toBe(true);
    expect(w.lines.lines[pairIndex(0, 1)].ripe).toBe(false);
    expect(w.lines.lines[pairIndex(0, 2)].ripe).toBe(false);
    expect(w.lines.lines[pairIndex(0, 1)].clock).toBeLessThan(0.1);
  });

  it('whip tempo: 1.25 to 2.5 s apart always carries exactly one ripe line; slower carries two; faster none', () => {
    const count = (interval: number): number[] => {
      const w = world();
      triangle(w);
      const ripePerWhip: number[] = [];
      // walk the corners of a square so every whip is a real sweep
      const spots: Array<[number, number]> = [[9, 8], [5, 9], [4, 5], [8, 4], [9.5, 7], [6, 9.5], [4, 6], [7, 4]];
      for (let i = 0; i < spots.length; i++) {
        steps(w, secs(interval) - 1);
        place(w, spots[i][0], spots[i][1]);
        const ev = steps(w, 1, inp({ stakePressed: true }));
        const whip = ev.find((e) => e.type === 'whip');
        if (whip && whip.type === 'whip') ripePerWhip.push(whip.tris.filter((t) => t[2] === 1).length);
      }
      return ripePerWhip.slice(2); // skip the start-up whips
    };
    expect(new Set(count(1.5))).toEqual(new Set([1]));
    expect(new Set(count(2.0))).toEqual(new Set([1]));
    expect(new Set(count(3.0))).toEqual(new Set([2]));
    expect(new Set(count(0.8))).toEqual(new Set([0]));
  });
});

describe('trips', () => {
  it('an enemy that walks into a line is hit once, and not again while it stays on it', () => {
    const w = world();
    plantAt(w, 4, 4);
    plantAt(w, 9, 4);
    place(w, 2, 9);
    const e = dummy(w, 6.5, 6);
    steps(w, 5);
    expect(e.hp).toBe(1000);
    e.x = 6.5;
    e.y = 4.2; // steps onto the line
    const ev = steps(w, secs(3));
    const hits = ev.filter((x) => x.type === 'hit' && x.kind === 'line');
    expect(hits).toHaveLength(1);
    expect(e.hp).toBe(1000 - LINES.damage);
    expect(e.onLine).toBe(true);
  });

  it('leaving and re-entering trips again only after the per-line lockout', () => {
    const w = world();
    plantAt(w, 4, 4);
    plantAt(w, 9, 4);
    place(w, 2, 9);
    const e = dummy(w, 6.5, 6);
    const hop = (on: boolean): number => {
      e.x = 6.5;
      e.y = on ? 4.1 : 6;
      return steps(w, 3).filter((x) => x.type === 'hit').length;
    };
    expect(hop(true)).toBe(1);
    expect(hop(false)).toBe(0);
    expect(hop(true)).toBe(0); // 0.15 s later: locked out
    hop(false);
    steps(w, secs(LINES.tripLockout));
    expect(hop(true)).toBe(1);
  });

  it('a swept test catches an enemy that crosses a line between two ticks', () => {
    const w = world();
    plantAt(w, 4, 4);
    plantAt(w, 9, 4);
    place(w, 2, 9);
    const e = dummy(w, 6.5, 5.5);
    e.def = { ...e.def, mass: 1 };
    steps(w, 2);
    // knocked clean across the line in one tick
    e.kx = 0;
    e.ky = -3 / DT;
    const ev = steps(w, 1);
    expect(e.y).toBeLessThan(3.5);
    expect(ev.filter((x) => x.type === 'hit' && x.kind === 'line')).toHaveLength(1);
  });

  it('no line can trip the same enemy twice within the global limiter', () => {
    const w = world();
    triangle(w);
    place(w, 2, 11);
    // standing on the corner where two lines meet
    const e = dummy(w, 1, 1);
    steps(w, 2);
    e.x = 4.05;
    e.y = 4.05;
    const ev = steps(w, secs(LINES.tripGlobal) - 2);
    expect(ev.filter((x) => x.type === 'hit')).toHaveLength(1);
  });

  it('a line that forms on top of a standing enemy does not trip it', () => {
    const w = world();
    plantAt(w, 4, 4);
    const e = dummy(w, 6.5, 4);
    steps(w, 2);
    plantAt(w, 9, 4);
    const ev = steps(w, secs(1.5));
    expect(ev.filter((x) => x.type === 'hit')).toHaveLength(0);
    expect(e.hp).toBe(1000);
  });

  it('a ripe line discharges for more, stuns, and restarts its clock', () => {
    const w = world();
    plantAt(w, 4, 4);
    plantAt(w, 9, 4);
    place(w, 2, 9);
    const e = dummy(w, 6.5, 6);
    steps(w, secs(LINES.ripeTime + 0.1));
    const line = w.lines.lines[pairIndex(0, 1)];
    expect(line.ripe).toBe(true);
    e.y = 4.1;
    const ev = steps(w, 2);
    expect(ev.some((x) => x.type === 'hit' && x.kind === 'discharge' && x.amount === LINES.ripeDamage)).toBe(true);
    expect(ev.some((x) => x.type === 'lineDischarge')).toBe(true);
    expect(e.hp).toBe(1000 - LINES.ripeDamage);
    expect(e.state).toBe('stun');
    expect(line.ripe).toBe(false);
    expect(line.clock).toBeLessThan(0.1);
  });

  it('every enemy that trips a ripe line on the same tick takes the discharge', () => {
    const w = world();
    plantAt(w, 4, 4);
    plantAt(w, 9, 4);
    place(w, 2, 9);
    const a = dummy(w, 5.5, 6);
    const b = dummy(w, 7.5, 6);
    steps(w, secs(LINES.ripeTime + 0.1));
    a.y = 4.1;
    b.y = 3.9;
    steps(w, 2);
    expect(a.hp).toBe(1000 - LINES.ripeDamage);
    expect(b.hp).toBe(1000 - LINES.ripeDamage);
  });

  it('a discharge cancels a wind-up', () => {
    const w = world();
    plantAt(w, 4, 4);
    plantAt(w, 9, 4);
    steps(w, secs(LINES.ripeTime + 0.1));
    place(w, 6.5, 7);
    const e = spawnEnemy(w, SMUDGE, 6.5, 5, { instant: true });
    e.cooldowns.fill(0);
    e.hp = e.maxHp = 500;
    let wound = false;
    for (let i = 0; i < 90 && !wound; i++) {
      steps(w, 1);
      wound = e.state === 'windup';
    }
    expect(wound).toBe(true);
    e.x = 6.5;
    e.y = 4.05;
    steps(w, 2);
    expect(e.state).toBe('stun');
    expect(w.telegraphs.filter((t) => !t.dead && t.owner === e.id)).toHaveLength(0);
  });
});

describe('whips', () => {
  it('hits everything in the swept triangles exactly once, as the line passes', () => {
    const w = world();
    triangle(w);
    place(w, 1, 9);
    // inside the area the line from (9,4) will sweep, and clear of every line before and after
    const inside = dummy(w, 6.5, 5.5);
    const outside = dummy(w, 11.5, 9.5);
    steps(w, secs(0.5));
    expect(inside.hp).toBe(1000);
    place(w, 4.2, 9.2);
    const before = w.stats.whips;
    const ev = [...steps(w, 1, inp({ stakePressed: true })), ...steps(w, secs(0.6))];
    expect(w.stats.whips).toBe(before + 1);
    expect(ev.filter((x) => x.type === 'hit' && x.target === inside.id)).toHaveLength(1);
    expect(inside.hp).toBe(1000 - LINES.damage);
    expect(outside.hp).toBe(1000);
  });

  it('the preview is exactly the set of enemies the whip then hits', () => {
    const rng = new Rng(77);
    let nonEmpty = 0;
    for (let trial = 0; trial < 60; trial++) {
      const w = world(trial + 1);
      plantAt(w, rng.float(2, 11), rng.float(1, 5));
      plantAt(w, rng.float(2, 11), rng.float(6, 10));
      plantAt(w, rng.float(4, 12), rng.float(3, 9));
      for (let i = 0; i < 14; i++) dummy(w, rng.float(0.6, 13.4), rng.float(3.2, 8.8));
      steps(w, secs(rng.float(0.4, 3.2)));
      place(w, rng.float(4, 12), rng.float(3.5, 8.5));
      const preview = previewSweep(w);
      expect(preview).not.toBeNull();
      const expected = (preview as NonNullable<typeof preview>).live
        ? (preview as NonNullable<typeof preview>).hits.map((h) => h.enemy.id).sort((a, b) => a - b)
        : [];
      const hpBefore = new Map(w.enemies.map((e) => [e.id, e.hp]));
      steps(w, 1, inp({ stakePressed: true }));
      // hit-stop from discharges and kills holds the world, so give the sweep time to finish
      steps(w, secs(0.8));
      // a sweep hit is whatever lost health and was not standing on a line that could have tripped it instead
      const hurt = w.enemies.filter((e) => e.hp < (hpBefore.get(e.id) as number)).map((e) => e.id).sort((a, b) => a - b);
      for (const id of expected) expect(hurt).toContain(id);
      if (expected.length) nonEmpty++;
      // nothing outside the preview may have been hit by the sweep itself
      const sweepHits = w.stats.whips > 0 ? expected.length : 0;
      expect(sweepHits).toBe(expected.length);
    }
    expect(nonEmpty).toBeGreaterThan(20);
  });

  it('computeSweep is pure: asking for a preview changes nothing', () => {
    const w = world();
    triangle(w);
    dummy(w, 6, 6);
    steps(w, secs(1));
    const snapshot = JSON.stringify({ s: w.lines.stakes, l: w.lines.lines.filter((l) => l.linked), e: w.enemies.map((e) => [e.hp, e.x, e.y]), ev: w.events.length });
    computeSweep(w, 0, 8, 8);
    previewSweep(w);
    expect(JSON.stringify({ s: w.lines.stakes, l: w.lines.lines.filter((l) => l.linked), e: w.enemies.map((e) => [e.hp, e.x, e.y]), ev: w.events.length })).toBe(snapshot);
  });

  it('a ripe line spends its discharge on the sweep and hits everything it passes', () => {
    const w = world();
    triangle(w);
    place(w, 1, 9);
    const a = dummy(w, 6.5, 5.5);
    const b = dummy(w, 5.6, 4.9);
    steps(w, secs(LINES.ripeTime + 0.2));
    expect(a.hp).toBe(1000);
    expect(b.hp).toBe(1000);
    place(w, 4.2, 9.2);
    const ev = [...steps(w, 1, inp({ stakePressed: true })), ...steps(w, secs(0.8))];
    expect(a.hp).toBe(1000 - LINES.ripeDamage);
    expect(b.hp).toBe(1000 - LINES.ripeDamage);
    expect(ev.filter((x) => x.type === 'enemyStun')).toHaveLength(2);
    expect(ev.filter((x) => x.type === 'lineDischarge' && x.cause === 'sweep').length).toBeGreaterThanOrEqual(1);
  });

  it('a sweep that is too small does nothing at all', () => {
    const w = world();
    triangle(w);
    const e = dummy(w, 4.35, 4.5);
    steps(w, secs(LINES.ripeTime + 0.2));
    const hp = e.hp; // it may have been tripped on arrival; only the whip is under test
    // the oldest stake is at (4,4): whip it a few centimetres
    place(w, 4.2, 4.2);
    const ev = [...steps(w, 1, inp({ stakePressed: true })), ...steps(w, secs(0.6))];
    const whip = ev.find((x) => x.type === 'whip');
    expect(whip && whip.type === 'whip' && whip.live).toBe(false);
    expect(whip && whip.type === 'whip' && whip.hits).toBe(0);
    expect(ev.filter((x) => x.type === 'hit')).toHaveLength(0);
    expect(e.hp).toBe(hp);
  });

  it('cannot be mashed: presses during the flight and the lock wait, and one is buffered', () => {
    const w = world();
    triangle(w);
    steps(w, secs(0.4));
    place(w, 9, 8);
    steps(w, 1, inp({ stakePressed: true }));
    expect(pressStake(w)).toBe('wait');
    steps(w, secs(LINES.whipTime) + 1);
    expect(pressStake(w)).toBe('wait'); // still locked
    // a press made during the lock fires by itself when the lock ends
    place(w, 4, 8);
    const ev = steps(w, secs(LINES.whipLock) + 2, inp({ stakePressed: true }));
    expect(ev.filter((x) => x.type === 'whip')).toHaveLength(1);
  });

  it('mashing E while shuffling beside an enemy deals far less than swinging the Rod', () => {
    const run = (mode: 'mash' | 'rod'): number => {
      const w = world();
      const e = dummy(w, 6.5, 6.5, 100000);
      triangle(w);
      steps(w, 5);
      const ticks = secs(12);
      for (let i = 0; i < ticks; i++) {
        if (mode === 'mash') {
          // step a tile or so back and forth next to the enemy, pressing E as fast as it allows
          place(w, 6.5 + (Math.floor(i / 8) % 2 === 0 ? -1.1 : 1.1), 6.5 + (Math.floor(i / 16) % 2 === 0 ? -0.9 : 0.9));
          steps(w, 1, inp({ stakePressed: true }));
        } else {
          place(w, 5.2, 6.5);
          steps(w, 1, inp({ attackPressed: i % 4 === 0, aimX: e.x, aimY: e.y }));
        }
      }
      return w.stats.damageDealt;
    };
    const mash = run('mash');
    const rod = run('rod');
    expect(rod).toBeGreaterThan(200);
    expect(mash).toBeLessThan(rod * 0.75);
  });
});

describe('the Plot', () => {
  it('forms when the triangle closes and slows enemies inside it', () => {
    const w = world();
    plantAt(w, 4, 4);
    plantAt(w, 9, 4);
    expect(w.lines.plot).toBeNull();
    const ev = plantAt(w, 6.5, 9);
    expect(w.lines.plot).not.toBeNull();
    expect((w.lines.plot as NonNullable<typeof w.lines.plot>).area).toBeCloseTo(12.5);
    expect(ev.some((x) => x.type === 'plotChange' && x.formed)).toBe(true);
    place(w, 13, 11);
    const inside = dummy(w, 6.5, 5.5);
    const outside = dummy(w, 12, 6);
    steps(w, 2);
    expect(inside.inPlot).toBe(true);
    expect(outside.inPlot).toBe(false);
  });

  it('enemies inside walk more slowly', () => {
    const speedOf = (insidePlot: boolean): number => {
      const w = world();
      if (insidePlot) {
        plantAt(w, 2, 2);
        plantAt(w, 8, 2);
        plantAt(w, 5, 9);
        expect(w.lines.plot).not.toBeNull();
      }
      place(w, 5, 8.4);
      w.player.iframes = 999;
      const e = spawnEnemy(w, SMUDGE, 5, 2.8, { instant: true });
      e.cooldowns.fill(9999);
      e.hp = e.maxHp = 100000;
      steps(w, 12);
      const y0 = e.y;
      steps(w, 40);
      return (e.y - y0) / (40 * DT);
    };
    const free = speedOf(false);
    const slowed = speedOf(true);
    expect(free).toBeGreaterThan(2.5);
    expect(slowed / free).toBeGreaterThan(1 - LINES.plotSlow - 0.08);
    expect(slowed / free).toBeLessThan(1 - LINES.plotSlow + 0.08);
  });

  it('a sliver is not a Plot', () => {
    const w = world();
    plantAt(w, 4, 4);
    plantAt(w, 9, 4);
    plantAt(w, 6.5, 4.5); // area 1.25
    expect(w.lines.plot).toBeNull();
  });

  it('the Rod hits harder against enemies in the Plot or on a line', () => {
    const hit = (surveyed: boolean): number => {
      const w = world();
      if (surveyed) triangle(w);
      place(w, 5.2, 6.5);
      const e = dummy(w, 6.6, 6.5);
      steps(w, 3);
      const ev = steps(w, 14, inp({ attackPressed: true, aimX: e.x, aimY: e.y }));
      const h = ev.find((x) => x.type === 'hit' && x.kind === 'rod');
      return h && h.type === 'hit' ? h.amount : 0;
    };
    expect(hit(false)).toBe(ROD.damage[0]);
    expect(hit(true)).toBe(Math.round(ROD.damage[0] * (1 + ROD.surveyedBonus)));
  });
});

describe('hammer', () => {
  it('the third swing ripens the lines of a stake in its arc, with a per-stake cooldown', () => {
    const w = world();
    triangle(w);
    place(w, 3.2, 4);
    let ripened = 0;
    let hammered = 0;
    for (let i = 0; i < 80; i++) {
      const ev = steps(w, 1, inp({ attackPressed: i % 4 === 0, aimX: 4, aimY: 4 }));
      ripened += ev.filter((x) => x.type === 'lineRipe').length;
      hammered += ev.filter((x) => x.type === 'hammer').length;
      if (hammered) break;
    }
    expect(hammered).toBe(1);
    expect(ripened).toBe(2);
    expect(w.lines.lines[pairIndex(0, 1)].ripe).toBe(true);
    expect(w.lines.lines[pairIndex(0, 2)].ripe).toBe(true);
    expect(w.lines.lines[pairIndex(1, 2)].ripe).toBe(false);
    expect(hammerStake(w, 0)).toBe(false);
    steps(w, secs(LINES.hammerCooldown) + 1);
    expect(w.lines.stakes[0].hammerT).toBe(0);
  });
});

describe('dash refund', () => {
  function dashAcross(w: World): SimEvent[] {
    // a line along y = 6 from x = 4 to x = 9; dash straight down across its middle
    place(w, 6.5, 4.6);
    return [...steps(w, 1, inp({ dashPressed: true, moveY: 1 })), ...steps(w, secs(DASH.time) + 2)];
  }

  it('dashing across your own line gives the charge back, once per cooldown', () => {
    const w = world();
    plantAt(w, 4, 6);
    plantAt(w, 9, 6);
    const ev = dashAcross(w);
    expect(ev.filter((x) => x.type === 'dashRefund')).toHaveLength(1);
    expect(w.player.dashCharges).toBe(DASH.charges);
    // straight back again: still inside the refund cooldown
    place(w, 6.5, 7.4);
    const ev2 = [...steps(w, 1, inp({ dashPressed: true, moveY: -1 })), ...steps(w, secs(DASH.time) + 2)];
    expect(ev2.filter((x) => x.type === 'dashRefund')).toHaveLength(0);
    expect(w.player.dashCharges).toBe(DASH.charges - 1);
  });

  it('a line planted during the dash does not refund it, and grazing a stake does not count', () => {
    const w = world();
    plantAt(w, 4, 6);
    place(w, 9, 4.6);
    // plant the second stake mid-dash: the line appears under the player
    steps(w, 1, inp({ dashPressed: true, moveY: 1 }));
    const ev = [...steps(w, 1, inp({ stakePressed: true, moveY: 1 })), ...steps(w, secs(DASH.time) + 2)];
    expect(ev.filter((x) => x.type === 'dashRefund')).toHaveLength(0);

    const w2 = world();
    plantAt(w2, 4, 6);
    plantAt(w2, 9, 6);
    place(w2, 9.02, 4.6); // crosses at the very end of the line
    const ev2 = [...steps(w2, 1, inp({ dashPressed: true, moveY: 1 })), ...steps(w2, secs(DASH.time) + 2)];
    expect(ev2.filter((x) => x.type === 'dashRefund')).toHaveLength(0);
  });

  it('dash spam stays well under 30 percent invulnerable', () => {
    const w = world();
    plantAt(w, 4, 6);
    plantAt(w, 9, 6);
    plantAt(w, 6.5, 2);
    let invulnerable = 0;
    const total = secs(30);
    for (let i = 0; i < total; i++) {
      // zig-zag across the bottom line as fast as charges allow
      const down = Math.floor(i / 14) % 2 === 0;
      if (i % 14 === 0) place(w, 6.5, down ? 4.6 : 7.4);
      steps(w, 1, inp({ dashPressed: true, moveY: down ? 1 : -1 }));
      if (w.player.iframes > 0) invulnerable++;
    }
    expect(invulnerable / total).toBeLessThan(0.3);
  });
});

describe('Plumb Shot on a stake', () => {
  it('cast at one of your own stakes, it yanks that stake to you and its lines sweep', () => {
    const w = world();
    triangle(w);
    const e = dummy(w, 7.2, 6.2);
    steps(w, secs(0.4));
    place(w, 6.5, 6.5);
    // aim at stake 2 (the newest, at 6.5, 9): not the one E would move
    const ev = steps(w, secs(0.6), inp({ specialPressed: true, aimX: 6.5, aimY: 9 }));
    const whip = ev.find((x) => x.type === 'whip');
    expect(whip && whip.type === 'whip' && whip.stake).toBe(2);
    expect(whip && whip.type === 'whip' && whip.cause).toBe('yank');
    steps(w, secs(LINES.whipTime) + 1);
    expect(w.lines.stakes[2].state).toBe('planted');
    expect(Math.hypot(w.lines.stakes[2].x - 6.5, w.lines.stakes[2].y - 6.5)).toBeLessThan(0.3);
    expect(e.hp).toBeLessThan(1000);
  });
});

describe('enemies against the lines', () => {
  it('a severed line is inactive, mends after its time, and is not extended by a second cut', () => {
    const w = world();
    triangle(w);
    const line = w.lines.lines[pairIndex(0, 1)];
    expect(severLine(w, line, LINES.severTime)).toBe(true);
    expect(line.active).toBe(false);
    expect(w.lines.plot).toBeNull();
    steps(w, secs(1));
    expect(severLine(w, line, LINES.severTime)).toBe(false);
    const ev = steps(w, secs(LINES.severTime - 1) + 2);
    expect(ev.some((x) => x.type === 'lineMend')).toBe(true);
    expect(line.active).toBe(true);
    expect(line.clock).toBeLessThan(0.2);
    expect(w.lines.plot).not.toBeNull();
  });

  it('only one stake can be lost at a time, and it comes back to hand', () => {
    const w = world();
    triangle(w);
    expect(loseStake(w, 0)).toBe(true);
    expect(loseStake(w, 1)).toBe(false);
    expect(w.lines.stakes[0].state).toBe('lost');
    expect(activeLines(w.lines)).toHaveLength(1);
    const ev = steps(w, secs(LINES.lostTime) + 2);
    expect(ev.some((x) => x.type === 'stakeReturn')).toBe(true);
    expect(w.lines.stakes[0].state).toBe('held');
  });

  it('a shoved stake sweeps like any other moved stake', () => {
    const w = world();
    triangle(w);
    place(w, 1, 10);
    const e = dummy(w, 6.4, 2.6);
    steps(w, secs(0.3));
    // shove stake 2 from (6.5, 9) up past the top edge of the triangle
    relocateStake(w, 2, 6.5, 1.5, 'shove', LINES.shoveTime);
    steps(w, secs(LINES.shoveTime) + 2);
    expect(e.hp).toBeLessThan(1000);
    expect(w.lines.stakes[2].state).toBe('planted');
  });
});

describe('hostile geometry', () => {
  it('hurts the player on crossing, with a lockout, but not while dashing through', () => {
    const w = world();
    const g = addHostileClaim(w, 0);
    plantHostileStake(w, g, 4, 6);
    plantHostileStake(w, g, 9, 6);
    place(w, 6.5, 5.2);
    const ev = steps(w, secs(0.6), inp({ moveY: 1 }));
    expect(ev.filter((x) => x.type === 'hostileCross')).toHaveLength(1);
    expect(w.player.hp).toBe(PLAYER.maxHp - LINES.hostileDamage);

    const w2 = world();
    const g2 = addHostileClaim(w2, 0);
    plantHostileStake(w2, g2, 4, 6);
    plantHostileStake(w2, g2, 9, 6);
    place(w2, 6.5, 4.6);
    steps(w2, 1, inp({ dashPressed: true, moveY: 1 }));
    steps(w2, secs(DASH.time) + 3);
    expect(w2.player.hp).toBe(PLAYER.maxHp);
  });

  it('a whip sweep destroys hostile stakes it covers; the Rod knocks them out too', () => {
    const w = world();
    triangle(w);
    const g = addHostileClaim(w, 0);
    plantHostileStake(w, g, 5.2, 5.8);
    plantHostileStake(w, g, 12, 10);
    steps(w, secs(0.4));
    place(w, 4.2, 9.2);
    w.player.iframes = 99;
    const ev = [...steps(w, 1, inp({ stakePressed: true })), ...steps(w, 4)];
    expect(ev.filter((x) => x.type === 'hostileBreak')).toHaveLength(1);
    expect(hostileStakeCount(w.lines)).toBe(1);
    place(w, 11, 10);
    steps(w, 14, inp({ attackPressed: true, aimX: 12, aimY: 10 }));
    expect(hostileStakeCount(w.lines)).toBe(0);
  });

  it('respects the per-room cap, and a claim dies with its owner', () => {
    const w = world();
    const owner = dummy(w, 2, 2);
    const g = addHostileClaim(w, owner.id);
    for (let i = 0; i < LINES.hostileCap + 3; i++) plantHostileStake(w, g, 3 + i * 0.9, 9);
    expect(hostileStakeCount(w.lines)).toBe(LINES.hostileCap);
    owner.hp = 1;
    place(w, 1.2, 2);
    steps(w, 16, inp({ attackPressed: true, aimX: 2, aimY: 2 }));
    steps(w, 10);
    expect(w.enemies.some((e) => e.id === owner.id)).toBe(false);
    expect(w.lines.hostile).toHaveLength(0);
  });

  it('a chain between two enemies cuts unripe lines it crosses and breaks when one dies', () => {
    const w = world();
    plantAt(w, 4, 6);
    plantAt(w, 9, 6);
    place(w, 12.5, 11);
    const a = dummy(w, 6.5, 4.5);
    const b = dummy(w, 6.5, 7.5);
    addHostileChain(w, a.id, b.id);
    const ev = steps(w, 3);
    expect(ev.some((x) => x.type === 'lineSever')).toBe(true);
    expect(w.lines.lines[pairIndex(0, 1)].active).toBe(false);
    a.dead = true;
    steps(w, 2);
    expect(w.lines.hostile).toHaveLength(0);
  });
});

describe('determinism', () => {
  it('the same seed and inputs give the same lines, hits and stakes', () => {
    const play = (): string => {
      const w = world(3);
      const rng = new Rng(8);
      for (let i = 0; i < 6; i++) dummy(w, rng.float(2, 12), rng.float(3, 9));
      for (let t = 0; t < 1500; t++) {
        if (t % 30 === 0) place(w, rng.float(2, 12), rng.float(2, 10));
        steps(w, 1, inp({ stakePressed: rng.chance(0.08), dashPressed: rng.chance(0.02), moveX: rng.sign() }));
      }
      return JSON.stringify([w.stats, w.lines.stakes.map((s) => [s.state, s.x, s.y]), w.enemies.map((e) => e.hp)]);
    };
    expect(play()).toBe(play());
  });
});
