// The rules that playing whole runs with bots changed (tests/balance.test.ts holds the bands they
// were changed for). Each of these was a wall or a hole that the runs found: a class with no
// answer to something, a boss that fell before it had been seen, an Echo that never struck, a bot
// that could not see. One test each, so that none of them comes back unnoticed.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { CAIRN } from '../src/content/enemies/cairn';
import { GONG } from '../src/content/enemies/gong';
import { THRUM } from '../src/content/enemies/thrum';
import { spawnEnemy } from '../src/sim/ai';
import { autoRun, experts } from '../src/sim/autoplay';
import { RING_BACK, ringOfBolts } from '../src/sim/bosses/patterns';
import { EXPERT, NOVICE, STEADY, classBot } from '../src/sim/bots';
import { damageEnemy, onGuard, standing } from '../src/sim/combat';
import type { RoomTemplate } from '../src/sim/defs';
import { returnShot, spawnProjectile } from '../src/sim/projectiles';
import { buildRoom } from '../src/sim/room';
import { strikeCircle } from '../src/sim/strikes';
import { BOSS, BREAK, CLASS_HP, REFLECT, SIM_HZ } from '../src/sim/tuning';
import { emptyInput } from '../src/sim/types';
import type { Enemy, World } from '../src/sim/types';
import { createWorld, stepWorld } from '../src/sim/world';
import { PRESS, Pad, bounceWorld, dummy, eventsOf, openWorld, place, run } from './helpers';

const none = emptyInput();
/** A bot that overlooks nothing, so that a test of what it does is not a test of its luck. */
const SHARP = { ...EXPERT, lapse: 0 };

describe('every class has its answer', () => {
  it('the Whirlwind meets a gong in its bash: the Sword is not hurt, the shield is open, and the blade goes in from the front', () => {
    const w = openWorld(['sword']);
    const p = w.players[0];
    const e = dummy(w, p.x + 1.6, p.y, 0, GONG);
    e.cooldowns.fill(0);
    const pad = new Pad().aimAt(p, e.x, e.y);
    // it winds up its bash; the blade goes round as the blow comes
    let events = run(w, 1, pad);
    for (let t = 0; t < 3 * SIM_HZ && !(e.state === 'windup' && e.stateTime >= 0.45); t++) events = events.concat(run(w, 1, pad));
    expect(e.state).toBe('windup');
    pad.tap(PRESS.special);
    events = events.concat(run(w, 30, pad));
    expect(eventsOf(events, 'whirl').length).toBe(1);
    expect(eventsOf(events, 'armorBreak').length).toBe(1);
    expect(p.hp).toBe(p.maxHp);
    expect(e.guardOpen).toBeGreaterThan(1);
    // back on its feet with the gong still hanging: a blow to its front lands
    e.state = 'idle';
    e.staggered = 0;
    expect(onGuard(e)).toBe(false);
    const hp = e.hp;
    damageEnemy(w, e, 10, { kind: 'direct', by: 0, dx: 1, dy: 0 });
    expect(e.hp).toBe(hp - 10);
  });

  it('a jab knocks a shot aside: it flies off along the punch as the player’s own, and weaker', () => {
    const w = openWorld(['fist']);
    const p = w.players[0];
    const pad = new Pad().aimAt(p, p.x + 3, p.y);
    run(w, 5, pad);
    const bolt = spawnProjectile(w, { kind: 'bolt', faction: 'enemy', owner: 99, x: p.x + 1.2, y: p.y, vx: -1, vy: 0, radius: 0.16, damage: 10, range: 12 });
    pad.tap(PRESS.attack);
    run(w, 6, pad);
    expect([bolt.faction, bolt.returned]).toEqual(['player', true]);
    expect(bolt.vx).toBeGreaterThan(0);
    expect(bolt.damage).toBeCloseTo(10 * BREAK.shotMul);
    expect(p.hp).toBe(p.maxHp);
    // a blade makes more of it than a hand does
    expect(bolt.damage).toBeLessThan(10 * REFLECT.damageMul);
  });

  it('the Break sends an orb home, and slaps anything lighter away', () => {
    const w = openWorld(['fist']);
    const p = w.players[0];
    const server = dummy(w, p.x + 6, p.y - 3);
    const orb = spawnProjectile(w, { kind: 'orb', faction: 'enemy', owner: server.id, x: p.x + 1.8, y: p.y + 0.4, vx: -0.5, vy: 0, radius: 0.3, damage: 12, range: 30 });
    const bolt = spawnProjectile(w, { kind: 'bolt', faction: 'enemy', owner: server.id, x: p.x - 1.8, y: p.y, vx: 0.5, vy: 0, radius: 0.16, damage: 10, range: 30 });
    const pad = new Pad();
    run(w, 5, pad);
    pad.tap(PRESS.special);
    run(w, Math.round((BREAK.windup + 0.1) * SIM_HZ), pad);
    // the orb flies for whoever served it; the bolt is simply the player's now, and flies outward
    expect([orb.faction, orb.homing]).toEqual(['player', server.id]);
    expect([bolt.faction, bolt.homing]).toEqual(['player', 0]);
    expect(bolt.vx).toBeLessThan(0);
  });

  it('the Fist is the sturdiest and the Bow the frailest', () => {
    const w = openWorld(['sword', 'bow', 'fist']);
    expect(w.players.map((p) => [p.maxHp, p.hp])).toEqual([
      [CLASS_HP.sword, CLASS_HP.sword],
      [CLASS_HP.bow, CLASS_HP.bow],
      [CLASS_HP.fist, CLASS_HP.fist],
    ]);
    expect(CLASS_HP.bow).toBeLessThan(CLASS_HP.sword);
    expect(CLASS_HP.fist).toBeGreaterThan(CLASS_HP.sword);
  });
});

describe('a boss is met in every phase', () => {
  const carillon = (w: World): Enemy => {
    const e = spawnEnemy(w, CONTENT.enemies.carillon, 8, 4, { instant: true });
    // it stands and does nothing here: only what a blow does to it is in question
    e.def = { ...e.def, brain: undefined };
    return e;
  };

  it('however hard the blow, it stops at the mark where its voice changes, and for a moment nothing reaches it', () => {
    const w = openWorld(['sword']);
    const e = carillon(w);
    const mark = (e.def.phases ?? [])[0];
    expect(mark).toBeGreaterThan(0);
    expect(damageEnemy(w, e, 99999, { kind: 'direct', by: 0, dx: 1, dy: 0 })).toBe(false);
    expect(e.dead).toBe(false);
    expect(e.hp / e.maxHp).toBeLessThanOrEqual(mark);
    expect(e.hp / e.maxHp).toBeGreaterThan(mark - 0.001);
    expect(e.turning).toBe(BOSS.turn);
    // what meets it meanwhile rings off
    const hp = e.hp;
    w.events.length = 0;
    damageEnemy(w, e, 50, { kind: 'return', by: 0, dx: 1, dy: 0 });
    expect(e.hp).toBe(hp);
    expect(eventsOf(w.events, 'clang').length).toBe(1);
    // and then it can be hurt again; past its last mark there is nothing to stop a blow
    e.phase = 1;
    for (let t = 0; t < (BOSS.turn + 0.1) * SIM_HZ; t++) {
      for (const p of w.players) p.iframes = 1;
      stepWorld(w, [], none);
    }
    expect(e.turning).toBe(0);
    expect(damageEnemy(w, e, 99999, { kind: 'direct', by: 0, dx: 1, dy: 0 })).toBe(true);
  });

  it('its blows are its own: they do not grow with the depth of its chamber, as an Echo’s do', () => {
    const w = createWorld(buildRoom(BOX), 3, CONTENT, { entrants: [{ slot: 0, classId: 'sword' }], chamber: 12 });
    w.flow.phase = 'cleared';
    expect(spawnEnemy(w, CONTENT.enemies.toll, 4, 3, { instant: true }).damageMul).toBe(1);
    expect(spawnEnemy(w, THRUM, 2, 3, { instant: true }).damageMul).toBeGreaterThan(1.3);
  });

  it('a bolt of a ring is light when it is sent back: a blade turns a dozen of them at a stroke', () => {
    const w = openWorld(['sword']);
    const p = w.players[0];
    const e = dummy(w, 8, 4);
    ringOfBolts(w, e, { places: 8, gaps: 0, gapWidth: 0, speed: 6, damage: 8, range: 18 }, 0);
    const ring = w.projectiles[0];
    const plain = spawnProjectile(w, { kind: 'bolt', faction: 'enemy', owner: e.id, x: 8, y: 4, vx: 6, vy: 0, radius: 0.16, damage: 8, range: 18 });
    returnShot(w, ring, p, 0, false, 0);
    returnShot(w, plain, p, 0, false, 0);
    expect(plain.damage).toBeCloseTo(8 * REFLECT.damageMul);
    expect(ring.damage).toBeCloseTo(plain.damage * RING_BACK);
    expect(RING_BACK).toBeLessThan(0.5);
  });
});

/** A box cut in two by a wall with a gap one tile wide, at (5, 3). */
const BOX: RoomTemplate = {
  id: 'test-gap',
  name: 'Gap',
  zone: 'outer',
  kind: 'combat',
  map: ['##D########', '#....#....#', '#.s..#..s.#', '#.........#', '#....#....#', '#..P.#..r.#', '###########'],
};

describe('no Echo is out of the game', () => {
  it('one with a post between it and its target still strikes: a blow where it stands needs no clear walk', () => {
    // the post of the bounce room is at (5.5, 3.5)
    const w = bounceWorld('sword');
    const p = w.players[0];
    place(p, 6.5, 3.5);
    const e = spawnEnemy(w, { ...GONG, speed: 0 }, 4.5, 3.5, { instant: true });
    e.cooldowns.fill(0);
    let wound = 0;
    for (let t = 0; t < 2 * SIM_HZ; t++) {
      p.iframes = 1;
      stepWorld(w, [], none);
      wound += eventsOf(w.events, 'enemyWindup').length;
      w.events.length = 0;
    }
    expect(wound).toBeGreaterThanOrEqual(1);
  });

  it('a wide one walks through a gap one tile across to reach its target', () => {
    const w = createWorld(buildRoom(BOX), 3, CONTENT, { entrants: [{ slot: 0, classId: 'sword' }] });
    w.flow.phase = 'cleared';
    const p = w.players[0];
    place(p, 8.5, 3.5);
    const e = spawnEnemy(w, CAIRN, 2.5, 1.5, { instant: true });
    e.cooldowns.fill(999);
    expect(e.radius).toBeGreaterThan(0.5);
    for (let t = 0; t < 10 * SIM_HZ; t++) {
      p.iframes = 1;
      stepWorld(w, [], none);
      w.events.length = 0;
    }
    // through the wall at x = 5, and up to where it would slam
    expect(e.x).toBeGreaterThan(6);
  });
});

describe('the bots that play the runs', () => {
  it('are three kinds of player, each slower and less watchful than the last', () => {
    expect(EXPERT.reaction).toBeLessThan(STEADY.reaction);
    expect(STEADY.reaction).toBeLessThan(NOVICE.reaction);
    expect(EXPERT.lapse).toBeLessThan(STEADY.lapse);
    expect(STEADY.lapse).toBeLessThan(NOVICE.lapse);
    expect(EXPERT.lapse).toBeGreaterThan(0);
  });

  it('see a warning in their second chamber as well as in their first', () => {
    // Ids and the clock start again in every chamber. A bot that kept what it had noticed in the
    // last one took a new warning for an old one seen in the future, and stood under it.
    const bot = classBot('bow', SHARP);
    const first = openWorld(['bow']);
    for (let t = 0; t < 3 * SIM_HZ; t++) stepWorld(first, [bot.think(first, 0)], none);
    // late in a long chamber, a warning too wide to get out from under: it is still over the bot when it lands
    const wide = strikeCircle(first, first.players[0].x, first.players[0].y, 40, { warn: 0.6, damage: 1 });
    for (let t = 0; t < 0.7 * SIM_HZ; t++) stepWorld(first, [bot.think(first, 0)], none);

    // the next chamber: a warning with the same id, early
    const second = openWorld(['bow']);
    const p = second.players[0];
    for (let t = 0; t < 5; t++) stepWorld(second, [bot.think(second, 0)], none);
    const next = strikeCircle(second, p.x, p.y, 2, { warn: 1.2, damage: 10 });
    expect(next.id).toBe(wide.id);
    let went = false;
    for (let t = 0; t < 1.3 * SIM_HZ; t++) {
      const f = bot.think(second, 0);
      went = went || f.moveMag > 0;
      stepWorld(second, [f], none);
    }
    expect(went).toBe(true);
    expect(p.hp).toBe(p.maxHp);
  });

  it('do not walk back under a warning they have stepped out of', () => {
    const w = openWorld(['fist']);
    const p = w.players[0];
    const e = dummy(w, p.x + 1.8, p.y, 500);
    const bot = classBot('fist', SHARP);
    for (let t = 0; t < 20; t++) stepWorld(w, [bot.think(w, 0)], none);
    // a slam round the Echo it is fighting, as a Cairn's is
    strikeCircle(w, e.x, e.y, 2.5, { warn: 1, damage: 16 });
    for (let t = 0; t < 1.3 * SIM_HZ; t++) stepWorld(w, [bot.think(w, 0)], none);
    expect(p.hp).toBe(p.maxHp);
    // and when it has landed, back in
    for (let t = 0; t < 3 * SIM_HZ; t++) stepWorld(w, [bot.think(w, 0)], none);
    expect(e.hp).toBeLessThan(500 - 20);
  });

  it('find their way round a pit to what is on the other side', () => {
    // the pit of the bounce room covers x 8..10, y 7..9
    const w = bounceWorld('fist');
    const p = w.players[0];
    place(p, 7.3, 8);
    const e = dummy(w, 10.7, 8, 300);
    const bot = classBot('fist', SHARP);
    for (let t = 0; t < 8 * SIM_HZ; t++) stepWorld(w, [bot.think(w, 0)], none);
    expect(standing(p)).toBe(true);
    expect(e.hp).toBeLessThan(300);
  });

  it('play the same run from the same seed, every time', () => {
    const a = autoRun('twice', experts('bow'), CONTENT, { most: 40 });
    const b = autoRun('twice', experts('bow'), CONTENT, { most: 40 });
    expect(b).toEqual(a);
    expect(a.seconds).toBeGreaterThan(20);
  });
});
