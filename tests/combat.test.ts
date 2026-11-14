import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { THRUM } from '../src/content/enemies';
import { SPAWN_TIME, spawnEnemy } from '../src/sim/ai';
import { idleBot, swordBot } from '../src/sim/bots';
import type { Bot } from '../src/sim/bots';
import { HURT_NONE, HURT_TAKEN, damageEnemy, damagePlayer, standing, stunEnemy } from '../src/sim/combat';
import { validateEnemyDef } from '../src/sim/defs';
import { createFlow, dropChimes } from '../src/sim/flow';
import { spawnProjectile } from '../src/sim/projectiles';
import { buildRoom, isClear } from '../src/sim/room';
import { telegraphCovers } from '../src/sim/telegraphs';
import { DT, FREEZE, PLAYER, SCALING, SWORD } from '../src/sim/tuning';
import { emptyInput } from '../src/sim/types';
import type { SimEvent, World } from '../src/sim/types';
import { createWorld, stepWorld } from '../src/sim/world';
import { OPEN_ROOM } from './fixtures';
import { PRESS, Pad, dummy, openWorld, run } from './helpers';

describe('content', () => {
  it('every enemy definition is valid and can hurt a player', () => {
    for (const def of Object.values(CONTENT.enemies)) expect(validateEnemyDef(def)).toEqual([]);
  });
});

describe('the swing combo', () => {
  it('hits enemies in the arc after the wind-up, once per swing', () => {
    const w = openWorld();
    const p = w.players[0];
    const e = dummy(w, p.x + 1.5, p.y);
    const pad = new Pad();
    run(w, 1, pad);
    const ev = run(w, 1, pad.tap(PRESS.attack));
    expect(p.state).toBe('attack');
    expect(ev.some((x) => x.type === 'swing' && x.player === 0)).toBe(true);
    // nothing lands during the wind-up
    expect(e.hp).toBe(e.maxHp);
    const more = run(w, 30, pad);
    const hits = more.filter((x) => x.type === 'hit');
    expect(hits).toHaveLength(1);
    expect(hits[0].type === 'hit' && hits[0].by).toBe(0);
    expect(e.hp).toBe(e.maxHp - SWORD.damage[0]);
  });

  it('misses enemies behind the player and out of reach', () => {
    const w = openWorld();
    const p = w.players[0];
    const behind = dummy(w, p.x - 1.5, p.y);
    const far = dummy(w, p.x + SWORD.reach[0] + 1.2, p.y);
    const pad = new Pad();
    run(w, 1, pad);
    run(w, 30, pad.tap(PRESS.attack));
    expect(behind.hp).toBe(behind.maxHp);
    expect(far.hp).toBe(far.maxHp);
  });

  it('chains three swings, the third heavier and with knockback', () => {
    const w = openWorld();
    const p = w.players[0];
    const e = dummy(w, p.x + 1.5, p.y, 1000);
    const pad = new Pad();
    run(w, 1, pad);
    const hits: number[] = [];
    const x0 = e.x;
    for (let i = 0; i < 120 && hits.length < 3; i++) {
      // tap attack every few ticks, like a player mashing
      if (i % 6 === 0) pad.tap(PRESS.attack);
      pad.aimAt(p, e.x, e.y);
      for (const ev of run(w, 1, pad)) if (ev.type === 'hit') hits.push(ev.amount);
    }
    expect(hits).toEqual([SWORD.damage[0], SWORD.damage[1], SWORD.damage[2]]);
    run(w, 40, pad);
    // the first two only nudge; the third sends a light body about two tiles
    expect(e.x - x0).toBeGreaterThan(1.4);
    expect(e.x - x0).toBeLessThan(3.2);
  });

  it('freezes the striker and the struck for a moment, and nobody else', () => {
    const w = openWorld(2);
    const [a, b] = w.players;
    b.x = b.px = 2;
    b.y = b.py = 2;
    const e = dummy(w, a.x + 1.5, a.y);
    const bystander = dummy(w, 11, 10);
    const padA = new Pad();
    const padB = new Pad().move(1, 0);
    run(w, 1, padA, padB);
    padA.tap(PRESS.attack);
    let frozenTogether = false;
    for (let i = 0; i < 20; i++) {
      const bx = b.x;
      run(w, 1, padA, padB);
      if (a.freeze > 0 && e.freeze > 0) {
        frozenTogether = true;
        expect(bystander.freeze).toBe(0);
        expect(b.freeze).toBe(0);
      }
      // the other player never stops walking
      expect(b.x).toBeGreaterThan(bx);
    }
    expect(frozenTogether).toBe(true);
    expect(w.freeze).toBe(0);
  });

});

describe('enemies', () => {
  it('cannot act or be hurt while they are appearing', () => {
    const w = openWorld();
    const e = spawnEnemy(w, THRUM, 10, 6.5);
    expect(damageEnemy(w, e, 20, { kind: 'direct', by: 0, dx: 1, dy: 0 })).toBe(false);
    expect(e.hp).toBe(e.maxHp);
    run(w, Math.ceil(SPAWN_TIME / DT) + 2, new Pad());
    expect(e.state).not.toBe('spawn');
  });

  it('warn with a lane that covers where the lunge will hit, then hurt whoever stands in it', () => {
    const w = openWorld();
    const p = w.players[0];
    const e = spawnEnemy(w, THRUM, p.x + 2.4, p.y, { instant: true });
    e.cooldowns.fill(0);
    const pad = new Pad();
    let sawTelegraph = false;
    let hurt = false;
    for (let i = 0; i < 240 && !hurt; i++) {
      const ev = run(w, 1, pad);
      for (const t of w.telegraphs) {
        if (t.owner === e.id && t.t < t.dur && telegraphCovers(t, p.x, p.y, p.radius)) sawTelegraph = true;
      }
      if (ev.some((x) => x.type === 'playerHurt' && x.player === 0)) hurt = true;
    }
    expect(sawTelegraph).toBe(true);
    expect(hurt).toBe(true);
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  it('are cancelled by a stun, and cannot be stunned again at once', () => {
    const w = openWorld();
    const p = w.players[0];
    const e = spawnEnemy(w, THRUM, p.x + 2.4, p.y, { instant: true });
    e.cooldowns.fill(0);
    const pad = new Pad();
    for (let i = 0; i < 120 && e.state !== 'windup'; i++) run(w, 1, pad);
    expect(e.state).toBe('windup');
    expect(stunEnemy(w, e, 0.5)).toBe(true);
    expect(e.state).toBe('stun');
    expect(w.telegraphs.every((t) => t.owner !== e.id || t.dead)).toBe(true);
    run(w, 40, pad);
    expect(stunEnemy(w, e, 0.5)).toBe(false);
  });

  it('go for the nearest player, and for another when that one is down', () => {
    const w = openWorld(2);
    const [a, b] = w.players;
    a.x = a.px = 3;
    b.x = b.px = 11;
    const e = spawnEnemy(w, THRUM, 9.5, 6.5, { instant: true });
    e.cooldowns.fill(999);
    run(w, 20, new Pad(), new Pad());
    expect(e.target).toBe(1);
    damagePlayer(w, b, 999, e.x, e.y, 0);
    expect(standing(b)).toBe(false);
    run(w, 30, new Pad(), new Pad());
    expect(e.target).toBe(0);
  });

  it('are tougher when more players are present', () => {
    const solo = spawnEnemy(openWorld(1), THRUM, 10, 6.5);
    const trio = spawnEnemy(openWorld(3), THRUM, 10, 6.5);
    expect(trio.maxHp).toBe(Math.round(THRUM.hp * (1 + SCALING.coopHp * 2)));
    expect(trio.maxHp).toBeGreaterThan(solo.maxHp);
  });
});

describe('getting hurt', () => {
  it('grants a moment of invulnerability and knocks the player back', () => {
    const w = openWorld();
    const p = w.players[0];
    expect(damagePlayer(w, p, 10, p.x - 1, p.y, 2)).toBe(HURT_TAKEN);
    expect(damagePlayer(w, p, 10, p.x - 1, p.y, 2)).toBe(HURT_NONE);
    expect(p.hp).toBe(PLAYER.maxHp - 10);
    const x0 = p.x;
    run(w, 30, new Pad());
    expect(p.x).toBeGreaterThan(x0 + 0.5);
  });

  it('puts a player down at zero health and freezes the chamber for a beat', () => {
    const w = openWorld(2);
    const [a] = w.players;
    const ev: SimEvent[] = [];
    damagePlayer(w, a, 999, a.x - 1, a.y, 0);
    ev.push(...w.events);
    expect(a.state).toBe('down');
    expect(ev.some((x) => x.type === 'playerDown' && x.player === 0)).toBe(true);
    expect(w.freeze).toBe(FREEZE.playerDown);
    // a downed player does not act
    const pad = new Pad().move(1, 0);
    const x0 = a.x;
    run(w, 30, pad, new Pad());
    expect(a.x).toBe(x0);
  });

  it('hurts a player caught by an enemy shot, once', () => {
    const w = openWorld();
    const p = w.players[0];
    spawnProjectile(w, { kind: 'bolt', faction: 'enemy', owner: 99, x: p.x + 3, y: p.y, vx: -9, vy: 0, radius: 0.16, damage: 8, range: 12 });
    run(w, 40, new Pad());
    expect(p.hp).toBe(p.maxHp - 8);
    expect(w.projectiles).toHaveLength(0);
  });
});

describe('Chimes', () => {
  it('are paid to every player when anyone picks them up', () => {
    const w = openWorld(3);
    const [a] = w.players;
    dropChimes(w, a.x + 0.5, a.y, 7);
    run(w, 120, new Pad(), new Pad(), new Pad());
    for (const p of w.players) expect(p.chimes).toBe(7);
    expect(w.flow.pickups).toHaveLength(0);
  });
});

/** Play one chamber of waves with a bot in every seat. */
function playChamber(players: number, makeBot: () => Bot, seed: number, maxSeconds = 120): { w: World; cleared: boolean; ticks: number } {
  const entrants = Array.from({ length: players }, (_, slot) => ({ slot, classId: 'sword' as const }));
  const w = createWorld(buildRoom(OPEN_ROOM), seed, CONTENT, { entrants, flow: createFlow(1, players) });
  const bots = entrants.map(() => makeBot());
  const idle = emptyInput();
  let ticks = 0;
  for (; ticks < maxSeconds * 60; ticks++) {
    stepWorld(w, bots.map((b, slot) => b.think(w, slot)), idle);
    w.events.length = 0;
    for (const p of w.players) {
      if (!isClear(w.room, p.x, p.y, p.radius * 0.9)) throw new Error('a player left the floor');
    }
    if (w.flow.phase === 'cleared' || !w.players.some(standing)) break;
  }
  return { w, cleared: w.flow.phase === 'cleared', ticks };
}

describe('bots', () => {
  it('an idle player loses', () => {
    const r = playChamber(1, idleBot, 11);
    expect(r.cleared).toBe(false);
    expect(r.w.players[0].state).toBe('down');
  });

  it('a sword bot clears a chamber of waves alone', () => {
    let cleared = 0;
    for (const seed of [1, 2, 3, 4, 5]) if (playChamber(1, () => swordBot(), seed).cleared) cleared++;
    expect(cleared).toBeGreaterThanOrEqual(4);
  });

  it('three sword bots clear a chamber together, against a bigger wave', () => {
    const solo = playChamber(1, () => swordBot(), 7);
    const trio = playChamber(3, () => swordBot(), 7);
    expect(trio.cleared).toBe(true);
    expect(trio.w.stats.kills).toBeGreaterThan(solo.w.stats.kills);
  });
});
