// The hooks bosses and special Echoes are built on: brains and phases, bodies that cannot be
// moved, chambers that hold a boss instead of waves, shields, and flyers. The Echoes here are
// made for the tests; the game's own are tested in their own files.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { THRUM } from '../src/content/enemies/thrum';
import { chooseTarget, spawnEnemy, startMove } from '../src/sim/ai';
import { pushBody } from '../src/sim/bodies';
import { phaseFor, setPhase } from '../src/sim/boss';
import type { BossBrain } from '../src/sim/boss';
import { damageEnemy, killEnemy, onGuard, outOfReach, stunEnemy } from '../src/sim/combat';
import { validateEnemyDef } from '../src/sim/defs';
import type { ContentRegistry, EnemyDef } from '../src/sim/defs';
import { createFlow } from '../src/sim/flow';
import { buildRoom } from '../src/sim/room';
import { flowFor } from '../src/sim/run';
import { createSession, stepSession } from '../src/sim/session';
import { hashSession, loadSession, saveSession } from '../src/sim/snapshot';
import { SCALING, SIM_HZ } from '../src/sim/tuning';
import { emptyInput } from '../src/sim/types';
import type { ClassId, Enemy, World } from '../src/sim/types';
import { createWorld } from '../src/sim/world';
import { OPEN_ROOM } from './fixtures';
import { Pad, eventsOf, place, run } from './helpers';

const SLAM = {
  id: 'slam',
  minRange: 0,
  maxRange: 3,
  cooldown: 2,
  windup: 0.6,
  telegraph: { shape: 'circle', radius: 2.2, at: 'self', track: 0 },
  action: { kind: 'strike', damage: 10, knock: 4 },
  recovery: 0.6,
} as const;
const BASE = { radius: 0.4, speed: 2, mass: 2.5, threat: 2, minChamber: 1, zones: ['outer', 'inner'], locomotion: { kind: 'hold' }, moves: [SLAM], rig: 'cairn', chimes: [1, 1] } as const;

/** A boss with two phases: it slams when someone is near, and remembers how often its brain was started. */
const WARDEN: EnemyDef = { ...BASE, id: 'warden', name: 'Warden', hp: 400, radius: 0.7, mass: 50, threat: 99, anchored: true, boss: true, brain: 'warden', phases: [0.5] };
const WARDEN_BRAIN: BossBrain = {
  id: 'warden',
  start(_w, e) {
    e.mem = [e.mem[0] + 1, 0, 0, 0];
  },
  always(w, e) {
    setPhase(w, e, phaseFor(e, WARDEN.phases ?? []));
    e.mem[1]++;
  },
  decide(w, e) {
    const p = chooseTarget(w, e);
    // in its second phase it never rests
    if (p && (e.cooldowns[0] <= 0 || e.phase > 0) && (p.x - e.x) * (p.x - e.x) + (p.y - e.y) * (p.y - e.y) < 9) startMove(w, e, 0, p);
  },
};
const SHIELD: EnemyDef = { ...BASE, id: 'bearer', name: 'Bearer', hp: 200, shield: { arc: 1.1, open: 1.5 } };
const FLYER: EnemyDef = { ...BASE, id: 'flyer', name: 'Flyer', hp: 60, mass: 1, flying: { grounded: 2 } };
const TEST: ContentRegistry = { ...CONTENT, enemies: { ...CONTENT.enemies, warden: WARDEN, bearer: SHIELD, flyer: FLYER }, brains: { ...CONTENT.brains, warden: WARDEN_BRAIN } };

function world(classes: ClassId[] = ['fist']): World {
  const w = createWorld(buildRoom(OPEN_ROOM), 7, TEST, { entrants: classes.map((classId, slot) => ({ slot, classId })) });
  w.flow.phase = 'cleared';
  w.players.forEach((p, i) => place(p, 3 + i, 10));
  return w;
}
/** An Echo of the test content, arrived and standing still. */
function stand(w: World, def: EnemyDef, x: number, y: number): Enemy {
  const e = spawnEnemy(w, def, x, y, { instant: true });
  e.cooldowns.fill(999);
  return e;
}
const blow = (dx: number, dy: number, more: object = {}): Parameters<typeof damageEnemy>[3] => ({ kind: 'direct', by: 0, dx, dy, ...more });

describe('the test Echoes', () => {
  it('are well formed', () => {
    for (const d of [WARDEN, SHIELD, FLYER]) expect(validateEnemyDef(d), d.id).toEqual([]);
    expect(validateEnemyDef({ ...WARDEN, threat: 3 }).length).toBe(1);
    expect(validateEnemyDef({ ...WARDEN, phases: [0.3, 0.6] }).length).toBe(1);
  });
});

describe('a boss', () => {
  it('is run by its brain: started once, and moved through its phases as its health falls', () => {
    const w = world();
    const boss = spawnEnemy(w, WARDEN, 8, 6);
    const events = run(w, 60, new Pad());
    expect(boss.state).toBe('idle');
    expect(boss.mem[0]).toBe(1);
    expect(boss.mem[1]).toBeGreaterThan(5);
    expect(boss.phase).toBe(0);
    expect(eventsOf(events, 'bossPhase').length).toBe(0);
    damageEnemy(w, boss, boss.maxHp * 0.55, blow(1, 0));
    const after = run(w, 30, new Pad());
    expect(boss.phase).toBe(1);
    expect(eventsOf(after, 'bossPhase').map((e) => e.phase)).toEqual([1]);
    expect(boss.mem[0]).toBe(1);
  });

  it('uses the moves of its definition when its brain says so, with the same warning as any Echo', () => {
    const w = world();
    const boss = spawnEnemy(w, WARDEN, 4, 9);
    const events = run(w, 3 * SIM_HZ, new Pad());
    expect(eventsOf(events, 'enemyWindup').some((e) => e.id === boss.id)).toBe(true);
    expect(eventsOf(events, 'playerHurt').length).toBeGreaterThan(0);
  });

  it('cannot be launched, shoved, staggered or stunned, but a body launched into it hurts it', () => {
    const w = world();
    const boss = stand(w, WARDEN, 9, 6);
    expect(pushBody(w, boss, 1, 0, 60, 0)).toBe(false);
    expect(stunEnemy(w, boss, 1, true)).toBe(false);
    const ball = stand(w, THRUM, 6, 6);
    expect(pushBody(w, ball, 1, 0, 20, 0)).toBe(true);
    const events = run(w, 40, new Pad());
    expect(eventsOf(events, 'carom').length).toBe(1);
    expect(boss.hp).toBeLessThan(boss.maxHp);
    expect([boss.x, boss.y]).toEqual([9, 6]);
    expect(boss.state).not.toBe('launched');
    // the ball came back off it
    expect(ball.x).toBeLessThan(9 - boss.radius);
  });

  it('holds its chamber instead of waves: it arrives alone, and its fall clears the chamber', () => {
    const flow = createFlow(6, 1);
    flow.boss = 'warden';
    flow.waves = 1;
    const w = createWorld(buildRoom(OPEN_ROOM), 3, TEST, { entrants: [{ slot: 0, classId: 'bow' }], chamber: 6, flow });
    run(w, 2 * SIM_HZ, new Pad());
    expect(w.enemies.map((e) => e.defId)).toEqual(['warden']);
    expect([w.enemies[0].x, w.enemies[0].y]).toEqual([w.room.rewardSpot.x, w.room.rewardSpot.y]);
    run(w, 5 * SIM_HZ, new Pad());
    expect(w.enemies.length).toBe(1);
    expect(w.flow.phase).toBe('fight');
    killEnemy(w, w.enemies[0]);
    const events = run(w, 5, new Pad());
    expect(w.flow.phase).toBe('cleared');
    expect(eventsOf(events, 'roomClear').length).toBe(1);
  });

  it('has more health for a bigger party, and none for a deeper chamber', () => {
    const hpWith = (players: number, chamber: number): number => {
      const w = createWorld(buildRoom(OPEN_ROOM), 3, TEST, { entrants: Array.from({ length: players }, (_, slot) => ({ slot, classId: 'sword' as const })), chamber });
      return spawnEnemy(w, WARDEN, 8, 6).maxHp;
    };
    expect(hpWith(1, 1)).toBe(400);
    expect(hpWith(1, 12)).toBe(400);
    expect(hpWith(3, 6)).toBe(Math.round(400 * (1 + 2 * SCALING.coopBossHp)));
  });

  it('takes the last chamber of a zone only once it exists in the game', () => {
    const stop = { n: 6, kind: 'miniboss', zone: 'outer', look: 'court', shape: 'court', size: 28, name: '' } as const;
    expect(flowFor(stop, 1, { ...CONTENT, enemies: {} }).boss).toBe('');
    expect(flowFor(stop, 1, { ...CONTENT, enemies: {} }).waves).toBe(3);
    const withBoss = flowFor(stop, 1, { ...CONTENT, enemies: { carillon: { ...WARDEN, id: 'carillon' } } });
    expect([withBoss.boss, withBoss.waves]).toEqual(['carillon', 1]);
  });

  it('a snapshot taken in the middle of the fight carries on exactly', () => {
    const config = { seed: 'boss-snap', players: [{ name: 'A', classId: 'sword' as const }], buildId: 't', inputDelay: 0, stress: 0 };
    const a = createSession(config, TEST);
    const flow = createFlow(6, 1);
    flow.boss = 'warden';
    flow.waves = 1;
    a.worlds[0] = createWorld(buildRoom(OPEN_ROOM), 9, TEST, { entrants: [{ slot: 0, classId: 'sword' }], chamber: 6, flow });
    const step = (s: typeof a): void => {
      stepSession(s, { tick: s.tick + 1, inputs: [emptyInput()], cmds: [] }, TEST);
      for (const w of s.worlds) w.events.length = 0;
    };
    for (let i = 0; i < 150; i++) step(a);
    const boss = a.worlds[0].enemies[0];
    damageEnemy(a.worlds[0], boss, boss.maxHp * 0.6, blow(1, 0));
    for (let i = 0; i < 20; i++) step(a);
    expect(boss.phase).toBe(1);
    const b = loadSession(saveSession(a), TEST);
    expect(hashSession(b)).toBe(hashSession(a));
    for (let i = 0; i < 400; i++) {
      step(a);
      step(b);
    }
    expect(hashSession(b)).toBe(hashSession(a));
    expect(b.worlds[0].enemies[0].phase).toBe(1);
  });
});

describe('a shield', () => {
  it('stops blows and shots that meet it from the front, and lets in what comes from behind', () => {
    const w = world();
    const e = stand(w, SHIELD, 8, 6);
    e.facing = 0;
    expect(onGuard(e)).toBe(true);
    // travelling toward -x: straight into the shield
    damageEnemy(w, e, 20, blow(-1, 0));
    damageEnemy(w, e, 20, { kind: 'return', by: 0, dx: -1, dy: 0, shot: true });
    expect(e.hp).toBe(200);
    expect(eventsOf(w.events, 'clang').length).toBe(2);
    // from behind, and from the side beyond its arc
    damageEnemy(w, e, 20, blow(1, 0));
    damageEnemy(w, e, 20, blow(0, 1));
    expect(e.hp).toBe(160);
  });

  it('does nothing against a slam, a carom or a burst', () => {
    const w = world();
    const e = stand(w, SHIELD, 8, 6);
    e.facing = 0;
    for (const kind of ['slam', 'carom', 'burst'] as const) damageEnemy(w, e, 10, { kind, by: 0, dx: -1, dy: 0 });
    expect(e.hp).toBe(170);
  });

  it('is opened by a blow that breaks guards, and is down while its bearer attacks, recovers or is stunned', () => {
    const w = world();
    const e = stand(w, SHIELD, 8, 6);
    e.facing = 0;
    damageEnemy(w, e, 30, blow(-1, 0, { breaks: true }));
    expect(e.hp).toBe(170);
    expect(e.guardOpen).toBeGreaterThan(1);
    damageEnemy(w, e, 10, blow(-1, 0));
    expect(e.hp).toBe(160);
    // it closes again
    run(w, Math.round(1.6 * SIM_HZ), new Pad());
    expect(onGuard(e)).toBe(true);
    // (it has turned to watch the player meanwhile: face it the old way again)
    e.facing = 0;
    damageEnemy(w, e, 10, blow(-1, 0));
    expect(e.hp).toBe(160);
    for (const state of ['attack', 'recover', 'stun'] as const) {
      e.state = state;
      expect(onGuard(e), state).toBe(false);
    }
  });

  it('a full Haymaker to the front opens it; a jab does not', () => {
    const punch = (hold: number): Enemy => {
      const w = world();
      const p = w.players[0];
      const e = stand(w, SHIELD, p.x + 1.3, p.y);
      e.facing = Math.PI;
      const pad = new Pad().aimAt(p, e.x, e.y);
      run(w, 2, pad);
      pad.tap(0).hold(1, true);
      run(w, hold, pad);
      pad.hold(1, false);
      run(w, 40, pad);
      return e;
    };
    expect(punch(2).hp).toBe(200);
    expect(punch(70).hp).toBeLessThan(200);
  });
});

describe('a flyer', () => {
  it('is out of reach of ground blows until something shot at it knocks it down, and takes off again', () => {
    const w = world(['sword']);
    const e = stand(w, FLYER, 8, 6);
    expect(e.airborne).toBe(true);
    expect(outOfReach(e)).toBe(true);
    // a swooping flyer can be struck
    e.state = 'attack';
    expect(outOfReach(e)).toBe(false);
    e.state = 'idle';
    damageEnemy(w, e, 5, { kind: 'direct', by: 0, dx: 1, dy: 0, shot: true });
    expect(e.airborne).toBe(false);
    expect(e.state).toBe('stun');
    expect(eventsOf(w.events, 'grounded').length).toBe(1);
    expect(pushBody(w, e, 1, 0, 0.5, 0)).toBe(false);
    const events = run(w, 4 * SIM_HZ, new Pad());
    expect(eventsOf(events, 'takeoff').length).toBe(1);
    expect(e.airborne).toBe(true);
  });

  it('a sword swing passes under it in the air and lands once it is down', () => {
    const swingAt = (down: boolean): Enemy => {
      const w = world(['sword']);
      const p = w.players[0];
      const e = stand(w, FLYER, p.x + 1.2, p.y);
      if (down) {
        e.airborne = false;
        e.groundedT = 9;
      }
      const pad = new Pad().aimAt(p, e.x, e.y);
      // a character who has just walked in ignores what the buttons already hold
      run(w, 2, pad);
      pad.tap(0);
      run(w, 30, pad);
      return e;
    };
    expect(swingAt(false).hp).toBe(60);
    expect(swingAt(true).hp).toBeLessThan(60);
  });
});
