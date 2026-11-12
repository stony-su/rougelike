import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { SMUDGE } from '../src/content/enemies';
import { roomTemplate } from '../src/content/rooms';
import { SPAWN_TIME, spawnEnemy } from '../src/sim/ai';
import { idleBot, rodBot } from '../src/sim/bots';
import type { Bot } from '../src/sim/bots';
import { damageEnemy, damagePlayer, hitStop, stunEnemy } from '../src/sim/combat';
import { validateEnemyDef } from '../src/sim/defs';
import { buildRoom, isClear } from '../src/sim/room';
import { createYard, stepYard } from '../src/sim/sandbox';
import { telegraphCovers } from '../src/sim/telegraphs';
import { DT, PLAYER, PLUMB, ROD } from '../src/sim/tuning';
import { emptyInput } from '../src/sim/types';
import type { Enemy, InputFrame, SimEvent, World } from '../src/sim/types';
import { createWorld, stepWorld } from '../src/sim/world';

function world(seed = 5): World {
  const w = createWorld(buildRoom(roomTemplate('bluefen-reedbed')), seed, CONTENT);
  w.player.x = w.player.px = 6.5;
  w.player.y = w.player.py = 6.5;
  return w;
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

/** A Smudge standing ready (spawn finished) that will not attack for a long while. */
function dummy(w: World, x: number, y: number): Enemy {
  const e = spawnEnemy(w, SMUDGE, x, y, { instant: true });
  e.cooldowns.fill(999);
  e.def = { ...SMUDGE, speed: 0 };
  return e;
}

describe('content', () => {
  it('every enemy definition is valid and can hurt the player', () => {
    for (const def of Object.values(CONTENT.enemies)) expect(validateEnemyDef(def)).toEqual([]);
  });
});

describe('Ranging Rod', () => {
  it('hits enemies in the arc after the wind-up, once per swing', () => {
    const w = world();
    const e = dummy(w, 8, 6.5);
    const before = e.hp;
    const ev = steps(w, 1, inp({ attackPressed: true }));
    expect(w.player.state).toBe('swing');
    expect(ev.some((x) => x.type === 'swing')).toBe(true);
    // nothing lands during the wind-up
    expect(e.hp).toBe(before);
    const more = steps(w, 30);
    expect(more.filter((x) => x.type === 'hit')).toHaveLength(1);
    expect(e.hp).toBe(before - ROD.damage[0]);
  });

  it('misses enemies behind the player and out of reach', () => {
    const w = world();
    const behind = dummy(w, 5, 6.5);
    const far = dummy(w, 6.5 + ROD.reach[0] + 1.2, 6.5);
    steps(w, 30, inp({ attackPressed: true }));
    expect(behind.hp).toBe(behind.maxHp);
    expect(far.hp).toBe(far.maxHp);
  });

  it('chains three swings, the third heavier and with knockback', () => {
    const w = world();
    const e = dummy(w, 8, 6.5);
    e.hp = e.maxHp = 1000;
    const hits: number[] = [];
    const x0 = e.x;
    for (let i = 0; i < 90; i++) {
      // tap attack every few ticks, like a player mashing
      stepWorld(w, inp({ attackPressed: i % 6 === 0, aimX: e.x, aimY: e.y }));
      for (const ev of w.events) if (ev.type === 'hit') hits.push(ev.amount);
      w.events.length = 0;
      if (hits.length === 3) break;
    }
    expect(hits).toEqual([ROD.damage[0], ROD.damage[1], ROD.damage[2]]);
    steps(w, 40);
    expect(e.x - x0).toBeGreaterThan(ROD.knockback[2] * 0.6);
  });

  it('a full combo takes about as long as its three swings', () => {
    const w = world();
    const e = dummy(w, 8, 6.5);
    e.hp = e.maxHp = 1000;
    let third = -1;
    let n = 0;
    for (let i = 0; i < 120 && third < 0; i++) {
      stepWorld(w, inp({ attackPressed: i % 3 === 0, aimX: e.x, aimY: e.y }));
      for (const ev of w.events) if (ev.type === 'hit' && ++n === 3) third = w.time;
      w.events.length = 0;
    }
    expect(third).toBeGreaterThan(0.3);
    expect(third).toBeLessThan(1.0);
  });

  it('freezes the world briefly on a hit', () => {
    const w = world();
    dummy(w, 8, 6.5);
    stepWorld(w, inp({ attackPressed: true }));
    let froze = false;
    for (let i = 0; i < 20; i++) {
      stepWorld(w, inp());
      if (w.hitstop > 0) froze = true;
    }
    expect(froze).toBe(true);
  });

  it('a dash cancels a swing at once', () => {
    const w = world();
    stepWorld(w, inp({ attackPressed: true }));
    stepWorld(w, inp());
    stepWorld(w, inp({ dashPressed: true, moveX: 1 }));
    expect(w.player.state).toBe('dash');
  });

  it('destroys light enemy projectiles in its arc', () => {
    const w = world();
    w.projectiles.push({
      id: w.nextId++, kind: 'quill', faction: 'enemy', owner: 0,
      x: 7.6, y: 6.5, px: 7.6, py: 6.5, vx: 0, vy: 0, radius: 0.14, damage: 8, life: 5, range: 50, light: true, dead: false,
    });
    const ev = steps(w, 12, inp({ attackPressed: true }));
    expect(ev.some((x) => x.type === 'deflect')).toBe(true);
    expect(w.projectiles).toHaveLength(0);
  });
});

describe('damage rules', () => {
  it('kills, counts and removes an enemy, and reports it', () => {
    const w = world();
    const e = dummy(w, 9, 6.5);
    damageEnemy(w, e, 999, { kind: 'rod', dx: 1, dy: 0 });
    expect(e.dead).toBe(true);
    expect(w.events.some((x) => x.type === 'enemyDeath')).toBe(true);
    // the kill's hit-stop holds the world for a few ticks; the body is swept on the next live tick
    steps(w, 8);
    expect(w.enemies).toHaveLength(0);
    expect(w.stats.kills).toBe(1);
  });

  it('cannot hurt an enemy that is still spawning', () => {
    const w = world();
    const e = spawnEnemy(w, SMUDGE, 9, 6.5);
    damageEnemy(w, e, 10, { kind: 'rod', dx: 1, dy: 0 });
    expect(e.hp).toBe(e.maxHp);
    steps(w, Math.ceil(SPAWN_TIME / DT) + 1);
    expect(e.state).not.toBe('spawn');
  });

  it('hit-stop requests do not add up', () => {
    const w = world();
    hitStop(w, 0.05);
    hitStop(w, 0.03);
    hitStop(w, 0.05);
    expect(w.hitstop).toBeCloseTo(0.05);
    hitStop(w, 5);
    expect(w.hitstop).toBeLessThan(0.2);
  });

  it('the player is invulnerable for a moment after being hurt, and can die', () => {
    const w = world();
    expect(damagePlayer(w, 10, 0, 6.5, 2)).toBe(true);
    expect(w.player.hp).toBe(PLAYER.maxHp - 10);
    expect(damagePlayer(w, 10, 0, 6.5, 2)).toBe(false);
    w.player.iframes = 0;
    damagePlayer(w, 9999, 0, 6.5, 0);
    expect(w.player.state).toBe('dead');
    expect(w.events.some((x) => x.type === 'playerDeath')).toBe(true);
    const x = w.player.x;
    steps(w, 30, inp({ moveX: 1 }));
    expect(w.player.x).toBe(x);
  });

  it('a stun cancels a wind-up and grants immunity afterwards', () => {
    const w = world();
    const e = spawnEnemy(w, SMUDGE, 8.5, 6.5, { instant: true });
    e.cooldowns.fill(0);
    let wound = false;
    for (let i = 0; i < 60 && !wound; i++) {
      steps(w, 1);
      wound = e.state === 'windup';
    }
    expect(wound).toBe(true);
    expect(w.telegraphs.length).toBe(1);
    expect(stunEnemy(w, e, 0.5)).toBe(true);
    expect(e.state).toBe('stun');
    steps(w, 1);
    expect(w.telegraphs.filter((t) => !t.dead && t.owner === e.id)).toHaveLength(0);
    expect(stunEnemy(w, e, 0.5)).toBe(false);
  });
});

describe('the Smudge', () => {
  it('telegraphs its lunge for the full wind-up before anything can hit', () => {
    const w = world();
    const e = spawnEnemy(w, SMUDGE, 8.6, 6.5, { instant: true });
    e.cooldowns.fill(0);
    let windupAt = -1;
    let hurtAt = -1;
    for (let i = 0; i < 200 && hurtAt < 0; i++) {
      stepWorld(w, inp());
      for (const ev of w.events) {
        if (ev.type === 'enemyWindup' && windupAt < 0) windupAt = w.time;
        if (ev.type === 'playerHurt') hurtAt = w.time;
      }
      w.events.length = 0;
    }
    expect(windupAt).toBeGreaterThanOrEqual(0);
    expect(hurtAt).toBeGreaterThan(0);
    expect(hurtAt - windupAt).toBeGreaterThanOrEqual(SMUDGE.moves[0].windup - 1e-6);
    expect(w.player.hp).toBe(PLAYER.maxHp - 10);
  });

  it('the telegraph covers the path the lunge takes', () => {
    const w = world();
    const e = spawnEnemy(w, SMUDGE, 8.6, 6.5, { instant: true });
    e.cooldowns.fill(0);
    let lane = null as null | { x: number; y: number; angle: number; length: number; width: number };
    const path: Array<[number, number]> = [];
    w.player.iframes = 99;
    for (let i = 0; i < 160; i++) {
      stepWorld(w, inp());
      const t = w.telegraphs.find((tg) => tg.owner === e.id);
      if (e.state === 'windup' && t) lane = { x: t.x, y: t.y, angle: t.angle, length: t.length, width: t.width };
      if (e.state === 'attack') path.push([e.x, e.y]);
      if (e.state === 'recover') break;
      w.events.length = 0;
    }
    expect(lane).not.toBeNull();
    expect(path.length).toBeGreaterThan(3);
    const tg = { ...(lane as NonNullable<typeof lane>), id: 0, owner: 0, shape: 'lane' as const, radius: 0, halfArc: 0, t: 0, dur: 1, trackUntil: 0, dead: false };
    for (const [x, y] of path) expect(telegraphCovers(tg, x, y, 0.05)).toBe(true);
  });

  it('can be dodged by dashing sideways late in the wind-up', () => {
    const w = world();
    const e = spawnEnemy(w, SMUDGE, 8.6, 6.5, { instant: true });
    e.cooldowns.fill(0);
    let dashed = false;
    for (let i = 0; i < 200; i++) {
      const late = e.state === 'windup' && e.stateTime > e.stateDur - 0.1;
      const f = inp({ moveY: late ? 1 : 0, dashPressed: late && !dashed });
      if (late) dashed = true;
      stepWorld(w, f);
      w.events.length = 0;
      if (e.state === 'recover') break;
    }
    expect(dashed).toBe(true);
    expect(w.player.hp).toBe(PLAYER.maxHp);
  });

  it('stays on the floor through lunges and knockback', () => {
    const w = world(11);
    const yard = createYard();
    const bot = rodBot();
    for (let i = 0; i < 6000; i++) {
      stepYard(w, yard, SMUDGE, DT);
      stepWorld(w, bot.think(w));
      w.events.length = 0;
      w.player.hp = w.player.maxHp;
      if (w.player.state === 'dead') break;
      for (const e of w.enemies) {
        if (!isClear(w.room, e.x, e.y, e.radius * 0.9)) throw new Error(`enemy left the floor at tick ${i}: (${e.x}, ${e.y}) ${e.state}`);
        expect(Number.isFinite(e.x + e.y)).toBe(true);
      }
    }
  });
});

describe('Plumb Shot', () => {
  it('hooks the first enemy on its path, damages it and drags it toward the player', () => {
    const w = world();
    const near = dummy(w, 11, 6.5);
    const far = dummy(w, 12.5, 6.5);
    near.hp = near.maxHp = 500;
    const ev = steps(w, 40, inp({ specialPressed: true, aimX: 20, aimY: 6.5 }));
    expect(ev.some((x) => x.type === 'plumbFire')).toBe(true);
    expect(ev.some((x) => x.type === 'plumbHook')).toBe(true);
    expect(near.hp).toBe(500 - PLUMB.damage);
    expect(far.hp).toBe(far.maxHp);
    expect(11 - near.x).toBeGreaterThan(PLUMB.drag * 0.8);
    expect(11 - near.x).toBeLessThan(PLUMB.drag * 1.1);
  });

  it('goes on cooldown and refuses a second cast', () => {
    const w = world();
    steps(w, 30, inp({ specialPressed: true }));
    expect(w.player.plumbCooldown).toBeGreaterThan(PLUMB.cooldown - 1);
    const ev = steps(w, 3, inp({ specialPressed: true }));
    expect(ev.some((x) => x.type === 'refused')).toBe(true);
    expect(ev.some((x) => x.type === 'plumbFire')).toBe(false);
    steps(w, Math.ceil(PLUMB.cooldown / DT));
    expect(w.player.plumbCooldown).toBe(0);
  });

  it('expires at its range when it hits nothing', () => {
    const w = world();
    const ev = steps(w, 40, inp({ specialPressed: true, aimX: 6.5, aimY: 0 }));
    expect(ev.some((x) => x.type === 'plumbMiss')).toBe(true);
    expect(w.projectiles).toHaveLength(0);
  });
});

function fight(bot: Bot, seed: number, waves: number, maxTicks: number): { won: boolean; dead: boolean; kills: number; ticks: number; hp: number } {
  const w = createWorld(buildRoom(roomTemplate('bluefen-reedbed')), seed, CONTENT);
  const yard = createYard(waves);
  let t = 0;
  for (; t < maxTicks; t++) {
    stepYard(w, yard, SMUDGE, DT);
    stepWorld(w, bot.think(w));
    w.events.length = 0;
    if (w.player.state === 'dead' || yard.done) break;
  }
  return { won: yard.done && w.player.state !== 'dead', dead: w.player.state === 'dead', kills: w.stats.kills, ticks: t, hp: w.player.hp };
}

describe('bots in the yard', () => {
  it('an idle player loses to Smudges', () => {
    const r = fight(idleBot(), 3, 6, 60 * 240);
    expect(r.dead).toBe(true);
  });

  it('a rod-swinging bot that dodges clears three waves on several seeds', () => {
    let wins = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = fight(rodBot({ reaction: 0.2, dashes: true }), seed, 3, 60 * 180);
      if (r.won) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(4);
  });

  it('fights are deterministic for a seed', () => {
    const a = fight(rodBot(), 9, 2, 60 * 120);
    const b = fight(rodBot(), 9, 2, 60 * 120);
    expect(a).toEqual(b);
  });
});
