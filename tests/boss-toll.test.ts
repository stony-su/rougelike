// The Toll: the Bell at the end of the road. It never moves, the floor round it is never quiet,
// and it has three phases, each asking something different.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { TOLL as DEF } from '../src/content/enemies/toll';
import { TOLL } from '../src/sim/bosses/toll';
import { classBot } from '../src/sim/bots';
import { damageEnemy, standing } from '../src/sim/combat';
import { validateEnemyDef } from '../src/sim/defs';
import { spawnProjectile } from '../src/sim/projectiles';
import { buildRoom } from '../src/sim/room';
import { generateRoom } from '../src/sim/roomgen';
import { flowFor, planRoute, roomSpec } from '../src/sim/run';
import { SIM_HZ } from '../src/sim/tuning';
import { emptyInput } from '../src/sim/types';
import type { ClassId, Enemy, World } from '../src/sim/types';
import { createWorld, stepWorld } from '../src/sim/world';
import { eventsOf, place } from './helpers';

/** The chamber the route gives the Toll, with a party in it. */
function arena(classes: ClassId[], seed: string): World {
  const stop = planRoute(seed)[11];
  const room = buildRoom(generateRoom(seed, roomSpec(stop)));
  return createWorld(room, seed, CONTENT, { entrants: classes.map((classId, slot) => ({ slot, classId })), chamber: 12, flow: flowFor(stop, classes.length, CONTENT) });
}
const none = emptyInput();
/** Step with nobody at the controls and nobody able to be hurt, until the Bell has arrived. */
function wake(w: World): Enemy {
  for (let t = 0; t < 4 * SIM_HZ; t++) {
    stepWorld(w, [], none);
    w.events.length = 0;
    for (const p of w.players) p.iframes = 1;
  }
  const boss = w.enemies.find((e) => e.def.boss);
  if (!boss) throw new Error('the Toll never arrived');
  return boss;
}
/** What it has laid on the floor and thrown, by kind, over some seconds of a phase. */
function watch(w: World, seconds: number): { kinds: Set<string>; busy: number; walls: number[] } {
  const seen = new Set<number>();
  const kinds = new Set<string>();
  const walls: number[] = [];
  let busy = 0;
  const ticks = seconds * SIM_HZ;
  for (let t = 0; t < ticks; t++) {
    stepWorld(w, [], none);
    for (const p of w.players) {
      p.hp = p.maxHp;
      p.iframes = 1;
    }
    const spawned = eventsOf(w.events, 'projectileSpawn');
    if (spawned.filter((e) => e.kind === 'bolt').length >= 12) kinds.add('ring of bolts');
    if (spawned.some((e) => e.kind === 'orb')) kinds.add('orbs');
    for (const tg of w.telegraphs) {
      if (seen.has(tg.id)) continue;
      seen.add(tg.id);
      if (tg.damage <= 0) continue;
      if (tg.shape === 'lane') kinds.add('strips');
      else if (tg.radius >= 30) {
        kinds.add('wall');
        walls.push(tg.inner);
      } else if (tg.inner > 0) kinds.add('echo ring');
      else kinds.add('hammer');
    }
    if (w.telegraphs.some((tg) => tg.t < tg.dur) || w.projectiles.some((pr) => pr.faction === 'enemy')) busy++;
    w.events.length = 0;
  }
  return { kinds, busy: busy / ticks, walls };
}
const wound = (w: World, boss: Enemy, share: number): void => {
  damageEnemy(w, boss, boss.hp - boss.maxHp * share, { kind: 'other', by: -1, dx: 1, dy: 0 });
};

describe('the Toll', () => {
  it('is a well-formed boss that towers, and holds the last chamber, in the Crater', () => {
    expect(validateEnemyDef(DEF)).toEqual([]);
    expect(CONTENT.enemies.toll).toBe(DEF);
    expect(CONTENT.brains.toll).toBeDefined();
    expect(DEF.scale ?? 1).toBeGreaterThanOrEqual(2);
    const stop = planRoute('any')[11];
    expect([stop.kind, stop.zone]).toEqual(['boss', 'crater']);
    expect(flowFor(stop, 1, CONTENT).boss).toBe('toll');
    const t = generateRoom('crater-floor', roomSpec(stop));
    expect(t.map.join('').includes('~')).toBe(false);
    expect(t.map.join('').split('B').length - 1).toBe(4);
  });

  it('never moves, and is seldom doing nothing', () => {
    const w = arena(['sword'], 'still');
    const boss = wake(w);
    const at = [boss.x, boss.y];
    const seen = watch(w, 30);
    expect([boss.x, boss.y]).toEqual(at);
    expect(seen.busy).toBeGreaterThan(0.7);
  });

  it('the Peal: rings of bolts, hammers, strips and orbs', () => {
    const w = arena(['sword'], 'peal');
    const boss = wake(w);
    const seen = watch(w, 40);
    expect(boss.phase).toBe(0);
    expect([...seen.kinds].sort()).toEqual(['hammer', 'orbs', 'ring of bolts', 'strips']);
  });

  it('the Echo: everything comes back, and Returns hurt it more', () => {
    const w = arena(['sword'], 'echo');
    const boss = wake(w);
    wound(w, boss, 0.6);
    const seen = watch(w, 45);
    expect(boss.phase).toBe(1);
    expect(seen.kinds.has('echo ring')).toBe(true);
    expect(boss.takeReturn).toBe(TOLL.echoReturn);
    expect(boss.takeDirect).toBe(1);
  });

  it('the Silence: a wall closes in, plain blows do less than half, and Returns half as much again', () => {
    const w = arena(['sword'], 'silence');
    const boss = wake(w);
    wound(w, boss, 0.3);
    const seen = watch(w, 30);
    expect(boss.phase).toBe(2);
    expect(seen.kinds.has('wall')).toBe(true);
    // the wall has come in, and is still coming
    expect(seen.walls[0]).toBeGreaterThan(seen.walls[seen.walls.length - 1]);
    expect(seen.walls[seen.walls.length - 1]).toBeGreaterThanOrEqual(TOLL.wallTo);
    // no stagger in the way of the sums
    boss.stunImmune = 99;
    boss.staggered = 0;
    let hp = boss.hp;
    damageEnemy(w, boss, 100, { kind: 'direct', by: 0, dx: 1, dy: 0 });
    expect(hp - boss.hp).toBeCloseTo(100 * TOLL.silenceDirect);
    hp = boss.hp;
    damageEnemy(w, boss, 100, { kind: 'return', by: 0, dx: 1, dy: 0 });
    expect(hp - boss.hp).toBeCloseTo(100 * TOLL.silenceReturn);
  });

  it('whoever stands outside the wall of the Silence is struck, and whoever stands inside is not', () => {
    const w = arena(['sword', 'bow'], 'wall');
    const boss = wake(w);
    wound(w, boss, 0.3);
    const [inside, outside] = w.players;
    let hurtIn = 0;
    let hurtOut = 0;
    for (let t = 0; t < 12 * SIM_HZ; t++) {
      // nothing else on the floor counts here: only where each of them stands
      place(inside, boss.x + boss.radius + 1.2, boss.y);
      place(outside, boss.x - 10.4, boss.y);
      inside.hp = inside.maxHp;
      outside.hp = outside.maxHp;
      stepWorld(w, [], none);
      for (const s of eventsOf(w.events, 'strike')) {
        if (s.radius < 30) continue;
        if (Math.hypot(inside.x - s.x, inside.y - s.y) >= s.inner) hurtIn++;
        if (Math.hypot(outside.x - s.x, outside.y - s.y) >= s.inner) hurtOut++;
      }
      w.events.length = 0;
    }
    expect(hurtIn).toBe(0);
    expect(hurtOut).toBeGreaterThan(3);
  });

  it('an orb sent home hurts it', () => {
    const w = arena(['sword'], 'home');
    const boss = wake(w);
    boss.mem[3] = 9999;
    boss.stunImmune = 99;
    const hp = boss.hp;
    spawnProjectile(w, { kind: 'orb', faction: 'player', owner: 0, x: boss.x + boss.radius + 0.6, y: boss.y, vx: -8, vy: 0, radius: 0.45, damage: 14, range: 20 });
    for (let t = 0; t < 10; t++) stepWorld(w, [], none);
    expect(hp - boss.hp).toBe(TOLL.orbHome);
    expect(w.projectiles.filter((pr) => pr.kind === 'orb').length).toBe(0);
  });
});

describe('fighting the Toll', () => {
  const fight = (w: World, seconds: number, idle = false): { t: number; phase: number; left: number } => {
    const bots = w.players.map((p) => classBot(p.classId));
    let t = 0;
    let phase = 0;
    let left = 1;
    for (; t < seconds * SIM_HZ && w.flow.phase === 'fight' && w.players.some(standing); t++) {
      stepWorld(w, idle ? [] : bots.map((b, slot) => b.think(w, slot)), none);
      w.events.length = 0;
      const boss = w.enemies.find((e) => e.def.boss);
      if (boss) {
        phase = Math.max(phase, boss.phase);
        left = boss.hp / boss.maxHp;
      }
    }
    return { t: t / SIM_HZ, phase, left: w.flow.phase === 'cleared' ? 0 : left };
  };

  it('three together can still it', () => {
    const w = arena(['sword', 'bow', 'fist'], 'toll-trio');
    const r = fight(w, 500);
    expect(w.flow.phase, `after ${Math.round(r.t)} s, phase ${r.phase}, ${Math.round(r.left * 100)}% left`).toBe('cleared');
    expect(r.t).toBeGreaterThan(30);
  });

  it.each(['sword', 'bow'] as ClassId[])('the %s alone, with nothing but what they walked in with, takes it into the Silence', (classId) => {
    // These bots carry no Tunings and are no great players; a run arrives here with nine picks.
    const w = arena([classId], `toll-${classId}`);
    const r = fight(w, 500);
    expect(r.phase, `after ${Math.round(r.t)} s, ${Math.round(r.left * 100)}% left`).toBe(2);
    expect(r.left).toBeLessThan(0.33);
  });

  it('a party that stands still loses to it, quickly', () => {
    const w = arena(['sword', 'bow'], 'toll-idle');
    const r = fight(w, 120, true);
    expect(w.players.some(standing)).toBe(false);
    expect(r.t).toBeLessThan(60);
  });
});
