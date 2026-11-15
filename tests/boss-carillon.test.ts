// The Carillon: a boss that fills its floor. It runs through a rotation of warned patterns with
// only a breath between them, its orbs can be sent home by every class, and it stands as tall as
// a boss should.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { CARILLON as DEF } from '../src/content/enemies/carillon';
import { spawnEnemy } from '../src/sim/ai';
import { CARILLON } from '../src/sim/bosses/carillon';
import { classBot } from '../src/sim/bots';
import { damageEnemy, standing } from '../src/sim/combat';
import { validateEnemyDef } from '../src/sim/defs';
import { spawnProjectile } from '../src/sim/projectiles';
import { buildRoom } from '../src/sim/room';
import { generateRoom } from '../src/sim/roomgen';
import { flowFor, planRoute, roomSpec } from '../src/sim/run';
import { SIM_HZ } from '../src/sim/tuning';
import { emptyInput } from '../src/sim/types';
import type { ClassId, Enemy, Projectile, SimEvent, World } from '../src/sim/types';
import { createWorld, stepWorld } from '../src/sim/world';
import { PRESS, Pad, eventsOf, openWorld, place, run } from './helpers';

/** Where in its memory the Carillon keeps its breath between patterns (see the top of its brain). */
const REST = 3;

/** The Carillon arrived in the open test room, with its brain started, far from the players. */
function arrive(w: World, x = 12, y = 3): Enemy {
  const boss = spawnEnemy(w, DEF, x, y);
  run(w, 50, ...w.players.map(() => new Pad()));
  expect(boss.state).not.toBe('spawn');
  return boss;
}
/** Hold it still: it stays in its breath, and does nothing. */
const quiet = (boss: Enemy): void => {
  boss.mem[REST] = 9999;
};
/** An orb of the boss's, a little way in front of a player and flying at them. */
function orbAt(w: World, boss: Enemy, slot = 0): Projectile {
  const p = w.players[slot];
  return spawnProjectile(w, { kind: 'orb', faction: 'enemy', owner: boss.id, x: p.x + 4, y: p.y, vx: -3, vy: 0, radius: 0.45, damage: 14, range: 70, bounces: 3 });
}
/** The chamber the route gives the Carillon, with a party in it. */
function arena(classes: ClassId[], seed: string): World {
  const stop = planRoute(seed)[5];
  const room = buildRoom(generateRoom(seed, roomSpec(stop)));
  return createWorld(room, seed, CONTENT, { entrants: classes.map((classId, slot) => ({ slot, classId })), chamber: 6, flow: flowFor(stop, classes.length, CONTENT) });
}

describe('the Carillon', () => {
  it('is a well-formed boss that towers, and holds the last chamber of the Outer Ring', () => {
    expect(validateEnemyDef(DEF)).toEqual([]);
    expect(CONTENT.enemies.carillon).toBe(DEF);
    expect(CONTENT.brains.carillon).toBeDefined();
    expect(DEF.radius).toBeGreaterThanOrEqual(1.4);
    expect(DEF.scale ?? 1).toBeGreaterThanOrEqual(1.8);
    const stop = planRoute('any')[5];
    expect(stop.kind).toBe('miniboss');
    expect(flowFor(stop, 1, CONTENT).boss).toBe('carillon');
  });

  it('fights on a floor it can fill: small, open, with a bumper toward each corner', () => {
    for (let i = 0; i < 20; i++) {
      const stop = planRoute(`floor-${i}`)[5];
      const t = generateRoom(`floor-${i}`, roomSpec(stop));
      const text = t.map.join('');
      expect(t.id.startsWith('gen-plain'), t.id).toBe(false);
      expect(text.includes('~'), 'no pits').toBe(false);
      expect(text.includes('o'), 'no posts').toBe(false);
      expect(text.split('B').length - 1).toBe(4);
      expect(Math.max(...t.map.map((r) => r.length))).toBeLessThanOrEqual(30);
    }
  });

  it('runs through every pattern of its rotation, and is seldom doing nothing', () => {
    const w = arena(['sword'], 'rotation');
    const p = w.players[0];
    const seen = new Set<number>();
    const kinds = new Set<string>();
    let busy = 0;
    let ticks = 0;
    let boss: Enemy | undefined;
    let leaps = 0;
    const none = emptyInput();
    for (let t = 0; t < 40 * SIM_HZ; t++) {
      const was = boss ? { x: boss.x, y: boss.y } : null;
      stepWorld(w, [], none);
      p.hp = p.maxHp;
      p.iframes = 1;
      boss = w.enemies.find((e) => e.def.boss);
      if (!boss) continue;
      ticks++;
      if (was && Math.hypot(boss.x - was.x, boss.y - was.y) > 1.5) leaps++;
      const orbs = eventsOf(w.events, 'projectileSpawn').filter((e) => e.kind === 'orb').length;
      const bolts = eventsOf(w.events, 'projectileSpawn').filter((e) => e.kind === 'bolt').length;
      if (orbs >= 3) kinds.add('serve');
      if (bolts >= 10) kinds.add('peal');
      for (const tg of w.telegraphs) {
        if (seen.has(tg.id)) continue;
        seen.add(tg.id);
        if (tg.damage <= 0) continue;
        if (tg.shape === 'lane') kinds.add('cross');
        else if (tg.inner > 0) kinds.add('toll');
        else if (tg.radius === CARILLON.markRadius) kinds.add('marks');
        else if (tg.radius === CARILLON.leapRadius) kinds.add('leap');
      }
      if (w.telegraphs.some((tg) => tg.t < tg.dur) || w.projectiles.some((pr) => pr.faction === 'enemy')) busy++;
      w.events.length = 0;
    }
    expect([...kinds].sort()).toEqual(['cross', 'leap', 'marks', 'peal', 'serve', 'toll']);
    expect(leaps).toBeGreaterThanOrEqual(1);
    // something is warned of or in the air for most of the fight
    expect(busy / ticks).toBeGreaterThan(0.7);
  });

  it.each(['sword', 'bow', 'fist'] as ClassId[])('the %s sends an orb home with a basic attack, and a bell cracks', (classId) => {
    const w = openWorld([classId]);
    const p = w.players[0];
    place(p, 4, 9);
    const boss = arrive(w);
    quiet(boss);
    const orb = orbAt(w, boss);
    const pad = new Pad().aimAt(p, orb.x, orb.y);
    // each strikes when the orb is where their attack reaches: a swing a little early, an arrow at once, a punch late
    const strikeAt = { sword: 2.7, bow: 9, fist: 1.9 }[classId];
    const events: SimEvent[] = [];
    let struck = false;
    for (let i = 0; i < 5 * SIM_HZ && eventsOf(events, 'bellCrack').length === 0; i++) {
      if (!struck && i >= 2 && orb.x - p.x <= strikeAt) {
        struck = true;
        pad.tap(PRESS.attack);
      }
      events.push(...run(w, 1, pad));
    }
    expect(p.hp).toBe(p.maxHp);
    expect(eventsOf(events, 'reflect').length).toBeGreaterThanOrEqual(1);
    expect(eventsOf(events, 'bellCrack').map((b) => b.n)).toEqual([1]);
    expect(boss.maxHp - boss.hp).toBeGreaterThanOrEqual(CARILLON.crackDamage);
    expect(boss.mem[0]).toBe(1);
    expect(p.rally).toBeGreaterThan(0);
  });

  it('a cracked bell calls Thrums, and once every bell is cracked an orb only hurts', () => {
    const w = openWorld(['sword']);
    place(w.players[0], 4, 11);
    const boss = arrive(w);
    quiet(boss);
    const home = (): SimEvent[] => {
      const orb = orbAt(w, boss);
      orb.faction = 'player';
      orb.owner = 0;
      place(orb, boss.x + boss.radius + 0.5, boss.y);
      return run(w, 5, new Pad());
    };
    const first = home();
    expect(eventsOf(first, 'bellCrack').length).toBe(1);
    expect(w.enemies.filter((e) => e.defId === 'thrum').length).toBe(CARILLON.thrums + 1);
    boss.mem[0] = CARILLON.bells;
    const hp = boss.hp;
    const last = home();
    expect(eventsOf(last, 'bellCrack').length).toBe(0);
    expect(boss.hp).toBeLessThan(hp);
    expect(boss.mem[0]).toBe(CARILLON.bells);
  });

  it('its orbs fly faster for every cracked bell', () => {
    const w = openWorld(['sword']);
    place(w.players[0], 3, 11);
    const boss = arrive(w);
    quiet(boss);
    const orb = orbAt(w, boss);
    run(w, 2, new Pad());
    expect(Math.hypot(orb.vx, orb.vy)).toBeCloseTo(CARILLON.orbSpeed);
    boss.mem[0] = 3;
    run(w, 2, new Pad());
    expect(Math.hypot(orb.vx, orb.vy)).toBeCloseTo(CARILLON.orbSpeed + 3 * CARILLON.orbFaster);
  });

  it('below half its health it changes phase: more of everything, and less breath', () => {
    const w = arena(['bow'], 'second-phase');
    const p = w.players[0];
    const none = emptyInput();
    let boss: Enemy | undefined;
    const most = [0, 0];
    const phases: number[] = [];
    for (let t = 0; t < 50 * SIM_HZ; t++) {
      stepWorld(w, [], none);
      p.hp = p.maxHp;
      p.iframes = 1;
      boss = w.enemies.find((e) => e.def.boss);
      if (boss && t === 20 * SIM_HZ) damageEnemy(w, boss, boss.maxHp * 0.55, { kind: 'other', by: 0, dx: 1, dy: 0 });
      for (const ev of eventsOf(w.events, 'bossPhase')) phases.push(ev.phase);
      const orbs = eventsOf(w.events, 'projectileSpawn').filter((e) => e.kind === 'orb').length;
      if (boss) most[boss.phase] = Math.max(most[boss.phase], orbs);
      w.events.length = 0;
    }
    expect(phases).toEqual([1]);
    expect(most).toEqual([CARILLON.orbs[0], CARILLON.orbs[1]]);
    expect(CARILLON.rest[1]).toBeLessThan(CARILLON.rest[0]);
  });

  it('when it falls, whatever it had warned of never lands', () => {
    const w = arena(['sword'], 'falls');
    const p = w.players[0];
    const none = emptyInput();
    for (let t = 0; t < 30 * SIM_HZ; t++) {
      stepWorld(w, [], none);
      w.events.length = 0;
      p.hp = p.maxHp;
      const boss = w.enemies.find((e) => e.def.boss);
      if (boss && w.telegraphs.some((tg) => tg.damage > 0 && tg.t < tg.dur * 0.5)) {
        damageEnemy(w, boss, 99999, { kind: 'other', by: 0, dx: 1, dy: 0 });
        break;
      }
    }
    const hp = p.hp;
    p.iframes = 0;
    const events: SimEvent[] = [];
    for (let t = 0; t < 3 * SIM_HZ; t++) {
      stepWorld(w, [], none);
      events.push(...w.events);
      w.events.length = 0;
    }
    expect(eventsOf(events, 'strike').length).toBe(0);
    expect(p.hp).toBe(hp);
    expect(w.flow.phase).toBe('cleared');
  });
});

describe('fighting the Carillon', () => {
  const fight = (w: World, seconds: number, idle = false): { t: number; cracked: number } => {
    const bots = w.players.map((p) => classBot(p.classId));
    const none = emptyInput();
    let t = 0;
    let cracked = 0;
    for (; t < seconds * SIM_HZ && w.flow.phase === 'fight' && w.players.some(standing); t++) {
      stepWorld(w, idle ? [] : bots.map((b, slot) => b.think(w, slot)), none);
      cracked += eventsOf(w.events, 'bellCrack').length;
      w.events.length = 0;
    }
    return { t: t / SIM_HZ, cracked };
  };

  it.each(['sword', 'bow'] as ClassId[])('the %s can beat it alone', (classId) => {
    const w = arena([classId], `carillon-${classId}`);
    const r = fight(w, 400);
    expect(w.flow.phase, `after ${Math.round(r.t)} s with ${r.cracked} bells cracked, health ${w.players[0].hp}, boss ${w.enemies.find((e) => e.def.boss)?.hp}`).toBe('cleared');
    // it is a fight, not a formality
    expect(r.t).toBeGreaterThan(15);
  });

  it('the fist punches its orbs home and wears it well down alone', () => {
    // The bot that plays the Fist is a poor boxer against something it cannot launch: it spends
    // the fight getting out of the way. It wins about one fight in three. What it must always
    // manage is the part that is the Fist's own: punching the orbs home. Evening the classes out
    // against bosses is the work of the balance task (T70).
    for (const n of [0, 1, 2]) {
      const w = arena(['fist'], `carillon-fist-${n}`);
      const r = fight(w, 400);
      const boss = w.enemies.find((e) => e.def.boss);
      expect(r.cracked, `fight ${n}`).toBeGreaterThanOrEqual(CARILLON.bells - 1);
      expect(boss ? boss.hp / boss.maxHp : 0, `fight ${n}`).toBeLessThan(0.7);
    }
  });

  it('a party that stands still loses to it, quickly', () => {
    const w = arena(['sword', 'bow'], 'carillon-idle');
    const r = fight(w, 120, true);
    expect(w.players.some(standing)).toBe(false);
    expect(r.t).toBeLessThan(60);
  });

  it('three together do not end it in a few seconds', () => {
    const w = arena(['sword', 'bow', 'fist'], 'carillon-trio');
    const r = fight(w, 400);
    expect(w.flow.phase).toBe('cleared');
    expect(r.t).toBeGreaterThan(25);
  });
});
