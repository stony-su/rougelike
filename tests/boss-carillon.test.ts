// The Carillon: orbs that every class sends home, bells that crack when they arrive, and a
// fight that speeds up with the bells and not with the party.
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
import { flowFor, planRoute } from '../src/sim/run';
import { SIM_HZ } from '../src/sim/tuning';
import { emptyInput } from '../src/sim/types';
import type { ClassId, Enemy, Projectile, SimEvent, World } from '../src/sim/types';
import { createWorld, stepWorld } from '../src/sim/world';
import { PRESS, Pad, eventsOf, openWorld, place, run } from './helpers';

/** The Carillon arrived in the open test room, with its brain started, far from the players. */
function arrive(w: World, x = 12, y = 3): Enemy {
  const boss = spawnEnemy(w, DEF, x, y);
  run(w, 50, ...w.players.map(() => new Pad()));
  expect(boss.state).not.toBe('spawn');
  return boss;
}
/** An orb of the boss's, a little way in front of a player and flying at them. */
function orbAt(w: World, boss: Enemy, slot = 0): Projectile {
  const p = w.players[slot];
  return spawnProjectile(w, { kind: 'orb', faction: 'enemy', owner: boss.id, x: p.x + 4, y: p.y, vx: -3, vy: 0, radius: 0.45, damage: 14, range: 70, bounces: 3 });
}

describe('the Carillon', () => {
  it('is a well-formed boss, and holds the last chamber of the Outer Ring', () => {
    expect(validateEnemyDef(DEF)).toEqual([]);
    expect(CONTENT.enemies.carillon).toBe(DEF);
    expect(CONTENT.brains.carillon).toBeDefined();
    const stop = planRoute('any')[5];
    expect(stop.kind).toBe('miniboss');
    expect(flowFor(stop, 1, CONTENT).boss).toBe('carillon');
  });

  it('serves an orb down a drawn line, and the orb leans toward whoever is nearest', () => {
    const w = openWorld(['sword']);
    place(w.players[0], 3, 11);
    const boss = arrive(w);
    const events = run(w, 4 * SIM_HZ, new Pad());
    expect(eventsOf(events, 'enemyWindup').some((e) => e.id === boss.id && e.move === 'serve')).toBe(true);
    const orb = w.projectiles.find((pr) => pr.kind === 'orb');
    expect(orb).toBeDefined();
    if (!orb) return;
    expect(Math.hypot(orb.vx, orb.vy)).toBeCloseTo(CARILLON.orbSpeed);
    // moved aside, the player is still where it is heading a second later
    place(w.players[0], 6, 11);
    const before = Math.atan2(orb.vy, orb.vx);
    run(w, 40, new Pad());
    expect(Math.atan2(orb.vy, orb.vx)).not.toBeCloseTo(before, 3);
  });

  it.each(['sword', 'bow', 'fist'] as ClassId[])('the %s sends an orb home with a basic attack, and a bell cracks', (classId) => {
    const w = openWorld([classId]);
    const p = w.players[0];
    place(p, 4, 9);
    const boss = arrive(w);
    boss.cooldowns.fill(999);
    boss.mem[1] = 999;
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

  it('a cracked bell sets off a peal: Thrums are called, and a ring of bolts with gaps', () => {
    const w = openWorld(['sword']);
    place(w.players[0], 4, 11);
    const boss = arrive(w);
    boss.cooldowns.fill(999);
    boss.mem[1] = 999;
    const orb = orbAt(w, boss);
    orb.faction = 'player';
    orb.owner = 0;
    place(orb, boss.x + 1, boss.y);
    const events = run(w, Math.round((CARILLON.pealWarn + 0.3) * SIM_HZ), new Pad());
    expect(eventsOf(events, 'bellCrack').length).toBe(1);
    expect(w.enemies.filter((e) => e.defId === 'thrum').length).toBe(CARILLON.pealThrums + 1);
    expect(eventsOf(events, 'projectileSpawn').filter((e) => e.kind === 'bolt').length).toBe(CARILLON.pealPlaces - CARILLON.pealGaps);
  });

  it('serves sooner for every cracked bell, and nothing but a bell changes its pace', () => {
    const w = openWorld(['sword']);
    place(w.players[0], 4, 11);
    const boss = arrive(w);
    const gaps: number[] = [];
    for (const cracked of [0, 2, 5]) {
      boss.mem[0] = cracked;
      boss.mem[1] = 0;
      boss.cooldowns.fill(999);
      boss.state = 'idle';
      run(w, 1, new Pad());
      gaps.push(boss.mem[1]);
      for (const pr of w.projectiles) pr.dead = true;
      run(w, 3 * SIM_HZ, new Pad());
      boss.move = -1;
    }
    expect(gaps[0]).toBeCloseTo(CARILLON.serveEvery, 1);
    expect(gaps[1]).toBeCloseTo(CARILLON.serveEvery - 2 * CARILLON.serveSooner, 1);
    expect(gaps[2]).toBeCloseTo(CARILLON.serveSoonest, 1);
    // an orb that comes home when every bell is cracked hurts it, and cracks nothing
    boss.mem[0] = CARILLON.bells;
    const orb = orbAt(w, boss);
    orb.faction = 'player';
    orb.owner = 0;
    place(orb, boss.x + 1, boss.y);
    const hp = boss.hp;
    const events = run(w, 5, new Pad());
    expect(eventsOf(events, 'bellCrack').length).toBe(0);
    expect(boss.hp).toBeLessThan(hp);
    expect(boss.mem[0]).toBe(CARILLON.bells);
  });

  it('slams whoever comes close; below two fifths of its health it serves in pairs and slams wider', () => {
    const w = openWorld(['fist']);
    const p = w.players[0];
    const boss = arrive(w, 8, 6);
    boss.mem[1] = 999;
    place(p, boss.x + 2.2, boss.y);
    const first = run(w, 3 * SIM_HZ, new Pad());
    expect(eventsOf(first, 'enemyWindup').some((e) => e.move === 'slam')).toBe(true);
    expect(eventsOf(first, 'playerHurt')[0].amount).toBe(18);
    damageEnemy(w, boss, boss.maxHp * 0.65, { kind: 'other', by: 0, dx: 1, dy: 0 });
    p.hp = p.maxHp;
    // (the first slam threw them clear: walk back in)
    place(p, boss.x + 2.2, boss.y);
    const second = run(w, 5 * SIM_HZ, new Pad());
    expect(eventsOf(second, 'bossPhase').map((e) => e.phase)).toEqual([1]);
    expect(eventsOf(second, 'enemyWindup').some((e) => e.move === 'slam-wide')).toBe(true);
    // a serve now brings a second right behind it
    place(p, 2, 12);
    p.hp = p.maxHp;
    boss.mem[1] = 0;
    boss.cooldowns.fill(999);
    const third = run(w, 4 * SIM_HZ, new Pad());
    expect(eventsOf(third, 'projectileSpawn').filter((e) => e.kind === 'orb').length).toBe(2);
  });
});

describe('fighting the Carillon', () => {
  const arena = (classes: ClassId[], seed: string): World => {
    const stop = planRoute(seed)[5];
    const room = buildRoom(generateRoom(seed, { zone: 'outer', kind: 'arena', look: stop.look, size: stop.size, shape: 'court' }));
    return createWorld(room, seed, CONTENT, { entrants: classes.map((classId, slot) => ({ slot, classId })), chamber: 6, flow: flowFor(stop, classes.length, CONTENT) });
  };
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

  it.each(['sword', 'bow', 'fist'] as ClassId[])('the %s can beat it alone', (classId) => {
    const w = arena([classId], `carillon-${classId}`);
    const r = fight(w, 300);
    expect(w.flow.phase, `after ${Math.round(r.t)} s with ${r.cracked} bells cracked, health ${w.players[0].hp}, boss ${w.enemies.find((e) => e.def.boss)?.hp}`).toBe('cleared');
  });

  it('a party that stands still loses to it', () => {
    const w = arena(['sword', 'bow'], 'carillon-idle');
    fight(w, 240, true);
    expect(w.players.some(standing)).toBe(false);
  });

  it('three together do not end it in a few seconds', () => {
    const w = arena(['sword', 'bow', 'fist'], 'carillon-trio');
    const r = fight(w, 300);
    expect(w.flow.phase).toBe('cleared');
    expect(r.t).toBeGreaterThan(20);
  });
});
