// Elites: more health, a harder hit, and one trait each. One test for each trait, then the
// chambers that carry them.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { THRUM } from '../src/content/enemies/thrum';
import { pushBody } from '../src/sim/bodies';
import { classBot } from '../src/sim/bots';
import { damageEnemy, standing } from '../src/sim/combat';
import { ELITE_NOTES, ELITE_TRAITS, spawnElite } from '../src/sim/elites';
import { createFlow } from '../src/sim/flow';
import { buildRoom } from '../src/sim/room';
import { generateRoom } from '../src/sim/roomgen';
import { ELITE, SIM_HZ } from '../src/sim/tuning';
import { emptyInput } from '../src/sim/types';
import type { ClassId, Enemy, World } from '../src/sim/types';
import { createWorld, stepWorld } from '../src/sim/world';
import { Pad, eventsOf, openWorld, place, run } from './helpers';

/** An elite of the open test room, arrived and standing still. */
function elite(w: World, trait: (typeof ELITE_TRAITS)[number], x: number, y: number): Enemy[] {
  const out = spawnElite(w, THRUM, x, y, trait);
  for (const e of out) {
    e.state = 'idle';
    e.stateTime = 0;
    e.cooldowns.fill(999);
    e.def = { ...THRUM, speed: 0 };
  }
  return out;
}

describe('an elite', () => {
  it('has more health and hits harder, and every trait has a name and a note', () => {
    const w = openWorld();
    const [e] = elite(w, 'hasty', 10, 6);
    expect(e.maxHp).toBe(Math.round(THRUM.hp * ELITE.hp));
    expect(e.damageMul).toBeCloseTo(ELITE.damage);
    expect(e.elite).toBe('hasty');
    for (const t of ELITE_TRAITS) expect(ELITE_NOTES[t].name.length).toBeGreaterThan(3);
  });

  it('Hasty: quicker to strike and faster on its feet', () => {
    const w = openWorld();
    const [e] = elite(w, 'hasty', 10, 6);
    expect(e.windupMul).toBeCloseTo(ELITE.hastyWindup);
    expect(e.speedMul).toBeCloseTo(ELITE.hastySpeed);
  });

  it('Plated: takes a quarter of every blow until it is bounced off something', () => {
    const w = openWorld();
    const [e] = elite(w, 'plated', 10, 6);
    const full = e.maxHp;
    damageEnemy(w, e, 20, { kind: 'direct', by: 0, dx: 1, dy: 0 });
    expect(full - e.hp).toBe(5);
    damageEnemy(w, e, 8, { kind: 'slam', by: 0, dx: 1, dy: 0 });
    expect(full - e.hp).toBe(13);
    expect(eventsOf(w.events, 'armorBreak').length).toBe(1);
    damageEnemy(w, e, 20, { kind: 'direct', by: 0, dx: 1, dy: 0 });
    expect(full - e.hp).toBe(33);
  });

  it('Resonant: rings where it was bounced, after a warning, for whoever stands in the ring', () => {
    const w = openWorld(2);
    const [near, far] = w.players;
    const [e] = elite(w, 'resonant', 13.5, 6.5);
    place(near, 13.2, 7.6);
    place(far, 4, 6.5);
    // into the wall at x = 15
    expect(pushBody(w, e, 1, 0, 16, 0)).toBe(true);
    const events = run(w, Math.round(1.5 * SIM_HZ), new Pad(), new Pad());
    expect(eventsOf(events, 'wallSlam').length).toBeGreaterThanOrEqual(1);
    const rings = eventsOf(events, 'slam');
    expect(rings.length).toBe(1);
    expect(rings[0].radius).toBe(ELITE.ringRadius);
    const hurt = eventsOf(events, 'playerHurt');
    expect(hurt.map((h) => h.player)).toEqual([near.slot]);
    expect(hurt[0].amount).toBe(Math.round(ELITE.ringDamage * ELITE.damage));
  });

  it('Tethered: two on a tether; launch one and the other is dragged, and the survivor is enraged', () => {
    const w = openWorld();
    const [a, b] = elite(w, 'tethered', 8, 6.5);
    expect([a.mate, b.mate]).toEqual([b.id, a.id]);
    expect(a.maxHp).toBe(Math.round(THRUM.hp * ELITE.tetherHp));
    pushBody(w, a, 0, 1, 12, 0);
    expect(eventsOf(w.events, 'launch').map((l) => l.id)).toEqual([a.id, b.id]);
    expect(b.lvy).toBeCloseTo(a.lvy * ELITE.tetherDrag);
    // the tether holds them together when one is carried off
    run(w, 90, new Pad());
    place(b, a.x + 9, a.y);
    run(w, 3, new Pad());
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThanOrEqual(ELITE.tetherLength + 0.01);
    const speed = b.speedMul;
    damageEnemy(w, a, 9999, { kind: 'other', by: 0, dx: 1, dy: 0 });
    run(w, 2, new Pad());
    expect(b.mate).toBe(0);
    expect(b.speedMul).toBeCloseTo(speed * ELITE.tetherRage);
  });

  it('Splitting: falls into two smaller Echoes with part of its health', () => {
    const w = openWorld();
    const [e] = elite(w, 'splitting', 8, 6.5);
    const health = e.maxHp;
    damageEnemy(w, e, 9999, { kind: 'other', by: 0, dx: 1, dy: 0 });
    run(w, 2, new Pad());
    expect(w.enemies.length).toBe(2);
    for (const half of w.enemies) {
      expect(half.elite).toBeNull();
      expect(half.maxHp).toBe(Math.round(health * ELITE.splitHp));
      expect(half.radius).toBeCloseTo(THRUM.radius * ELITE.splitSize);
    }
    // they are ordinary Echoes: killing them leaves nothing
    for (const half of w.enemies) damageEnemy(w, half, 9999, { kind: 'other', by: 0, dx: 1, dy: 0 });
    run(w, 2, new Pad());
    expect(w.enemies.length).toBe(0);
  });
});

describe('an elite chamber', () => {
  const chamber = (classes: ClassId[], seed: string): World => {
    const flow = createFlow(4, classes.length);
    flow.kind = 'elite';
    flow.budget *= 1.4;
    const room = buildRoom(generateRoom(seed, { zone: 'outer', kind: 'combat', look: 'court', size: 26 }));
    return createWorld(room, seed, CONTENT, { entrants: classes.map((classId, slot) => ({ slot, classId })), chamber: 4, flow });
  };

  it('carries its elites in the last wave, and one more with company', () => {
    for (const [players, want] of [
      [1, 1],
      [3, 2],
    ]) {
      const w = chamber(
        Array.from({ length: players }, () => 'sword' as const),
        `elite-${players}`,
      );
      const idle = emptyInput();
      const elitesIn: number[] = [];
      for (let t = 0; t < 400 * SIM_HZ && w.flow.phase === 'fight'; t++) {
        const wave = w.flow.wave;
        stepWorld(w, [], idle);
        w.events.length = 0;
        if (w.flow.wave !== wave) {
          // a tethered pair is one elite in two bodies
          const bodies = w.enemies.filter((e) => e.elite !== null);
          elitesIn[w.flow.wave] = bodies.filter((e) => e.mate === 0 || e.mate > e.id).length;
        }
        // nobody fights back here: sweep the chamber so the next wave comes
        if (w.enemies.length > 0 && w.enemies.every((e) => e.state !== 'spawn')) for (const e of w.enemies) damageEnemy(w, e, 99999, { kind: 'other', by: 0, dx: 1, dy: 0 });
        for (const p of w.players) p.hp = p.maxHp;
      }
      expect(w.flow.phase).toBe('cleared');
      expect(elitesIn[w.flow.waves]).toBe(want);
      for (let n = 1; n < w.flow.waves; n++) expect(elitesIn[n]).toBe(0);
    }
  });

  it('every class can clear one', () => {
    for (const classId of ['sword', 'bow', 'fist'] as ClassId[]) {
      const w = chamber([classId], `elite-clear-${classId}`);
      const bot = classBot(classId);
      const idle = emptyInput();
      let t = 0;
      for (; t < 240 * SIM_HZ && w.flow.phase === 'fight' && w.players.some(standing); t++) {
        stepWorld(w, [bot.think(w, 0)], idle);
        w.events.length = 0;
      }
      expect(w.flow.phase, `${classId} after ${Math.round(t / SIM_HZ)} s, health ${w.players[0].hp}`).toBe('cleared');
    }
  });
});
