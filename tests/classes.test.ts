// The three classes, their specials, the shots and bombs they send back, and the Echoes that
// give them something to bounce. Numbers are those of DESIGN.md sections 2, 3 and 5.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { BURR } from '../src/content/enemies/burr';
import { PIPER } from '../src/content/enemies/piper';
import { THRUM } from '../src/content/enemies/thrum';
import { PRACTICE_COURT } from '../src/content/rooms/practice-court';
import { spawnEnemy } from '../src/sim/ai';
import { EXPERT, classBot, idleBot } from '../src/sim/bots';
import type { Bot } from '../src/sim/bots';
import { throwBomb } from '../src/sim/bombs';
import { standing } from '../src/sim/combat';
import type { EnemyDef } from '../src/sim/defs';
import { createFlow } from '../src/sim/flow';
import { aimAngleOf } from '../src/sim/input';
import { previewArrow, spawnProjectile } from '../src/sim/projectiles';
import { addRally } from '../src/sim/rally';
import { buildRoom, groundAt, isClear } from '../src/sim/room';
import { laneAngle } from '../src/sim/telegraphs';
import { BODY, BOMB, BOW, BREAK, DT, FIST, HAYMAKER, PLAYER, RALLY, REFLECT, RINGSTONE, RIPOSTE, SWORD } from '../src/sim/tuning';
import { emptyInput } from '../src/sim/types';
import type { ClassId, Enemy, World } from '../src/sim/types';
import { createWorld, stepWorld } from '../src/sim/world';
import { BTN, PRESS, Pad, bounceWorld, dummy, eventsOf, openWorld, place, run } from './helpers';

const HEAVY: EnemyDef = { ...THRUM, id: 'thrum', mass: 5, radius: 0.6 };
const speed = (e: Enemy): number => Math.hypot(e.lvx, e.lvy);

/** An enemy bolt flying at a point from `dist` tiles away along +x. */
function boltAt(w: World, x: number, y: number, dist: number, owner = 99): void {
  spawnProjectile(w, { kind: 'bolt', faction: 'enemy', owner, x: x + dist, y, vx: -9, vy: 0, radius: 0.16, damage: 8, range: 12 });
}

describe('the Sword', () => {
  it('a swing sends back a shot in its arc: it changes side, flies along the aim, faster and harder', () => {
    const w = openWorld();
    const p = w.players[0];
    const target = dummy(w, 11.5, 6.5, 1000);
    const pad = new Pad();
    run(w, 1, pad);
    boltAt(w, p.x, p.y, 3);
    const ev = run(w, 60, pad.tap(PRESS.attack));
    const turned = eventsOf(ev, 'reflect')[0];
    expect(turned).toMatchObject({ player: p.slot, perfect: false });
    expect(p.hp).toBe(p.maxHp);
    const hit = eventsOf(ev, 'hit').find((h) => h.target === target.id && h.kind === 'return');
    expect(hit).toBeDefined();
    // 2.2 times its 8, which is more than the least a return does
    expect(1000 - target.hp).toBeCloseTo(Math.max(REFLECT.minDamage, 8 * REFLECT.damageMul), 6);
    expect(hit?.by).toBe(p.slot);
    expect(p.rally).toBe(RALLY.weight.sent);
  });

  it('a returned shot flies at least at the return speed, where the player is aiming at that moment', () => {
    const w = openWorld();
    const p = w.players[0];
    const pad = new Pad();
    run(w, 1, pad);
    boltAt(w, p.x, p.y, 3);
    let seen = false;
    for (let t = 0; t < 30 && !seen; t++) {
      const ev = run(w, 1, t === 0 ? pad.tap(PRESS.attack) : pad);
      if (eventsOf(ev, 'reflect').length === 0) continue;
      seen = true;
      const pr = w.projectiles[0];
      expect(pr.faction).toBe('player');
      expect(pr.owner).toBe(p.slot);
      expect(Math.hypot(pr.vx, pr.vy)).toBeCloseTo(Math.max(REFLECT.minSpeed, 9 * REFLECT.speedMul));
      expect(pr.vx).toBeGreaterThan(0);
      expect(Math.abs(pr.vy)).toBeLessThan(1e-9);
      expect(pr.bounces).toBe(REFLECT.bounces);
    }
    expect(seen).toBe(true);
  });

  it('left to the last moment it is a perfect return: half as hard again, through everything, weight 3', () => {
    const w = openWorld();
    const p = w.players[0];
    const a = dummy(w, 9.5, 6.5, 1000);
    const b = dummy(w, 11.5, 6.5, 1000);
    const pad = new Pad();
    run(w, 1, pad);
    // close enough that the blade meets it inside the perfect distance
    boltAt(w, p.x, p.y, 1.5);
    pad.tap(PRESS.attack);
    let perfect = false;
    let hits = 0;
    // watch its first pass only: it goes on to bank off the far wall and come back through them
    for (let t = 0; t < 60 && hits < 2; t++) {
      const ev = run(w, 1, pad);
      for (const r of eventsOf(ev, 'reflect')) perfect = r.perfect;
      for (const h of eventsOf(ev, 'hit')) {
        hits++;
        expect(h).toMatchObject({ kind: 'return', crit: true, by: p.slot });
      }
    }
    expect(perfect).toBe(true);
    expect(hits).toBe(2);
    expect(p.hp).toBe(p.maxHp);
    const dealt = 8 * REFLECT.damageMul * REFLECT.perfectMul;
    expect(1000 - a.hp).toBeCloseTo(dealt, 6);
    // the second was struck with the Rally the first one gave
    expect(1000 - b.hp).toBeCloseTo(dealt * (1 + RALLY.perPoint * RALLY.weight.perfect), 6);
    expect(p.rally).toBe(2 * RALLY.weight.perfect);
  });

  it('a shot outside the arc is not turned, and hurts', () => {
    const w = openWorld();
    const p = w.players[0];
    const pad = new Pad();
    run(w, 1, pad);
    // from behind
    spawnProjectile(w, { kind: 'bolt', faction: 'enemy', owner: 99, x: p.x - 2, y: p.y, vx: 9, vy: 0, radius: 0.16, damage: 8, range: 12 });
    const ev = run(w, 40, pad.tap(PRESS.attack));
    expect(eventsOf(ev, 'reflect')).toHaveLength(0);
    expect(p.hp).toBe(p.maxHp - 8);
  });

  it('a swing that lands on an Echo in its own attack bats it away along the aim', () => {
    const w = openWorld();
    const p = w.players[0];
    const e = dummy(w, p.x + 1.6, p.y, 1000);
    e.state = 'attack';
    e.move = 0;
    e.stateDur = 9;
    const pad = new Pad();
    run(w, 1, pad);
    let seen = false;
    for (let t = 0; t < 20 && !seen; t++) {
      const ev = run(w, 1, t === 0 ? pad.tap(PRESS.attack) : pad);
      const launch = eventsOf(ev, 'launch')[0];
      if (!launch) continue;
      seen = true;
      expect(launch.speed).toBeCloseTo(REFLECT.batImpulse);
      expect(launch.by).toBe(p.slot);
      expect(e.state).toBe('launched');
      // exactly along the aim, not fanned outward like an ordinary swing
      expect(e.lvy).toBeCloseTo(0, 9);
    }
    expect(seen).toBe(true);
  });

  it('the first two swings nudge, the third sends a light body flying', () => {
    const w = openWorld();
    const p = w.players[0];
    const e = dummy(w, p.x + 1.5, p.y, 1000);
    const pad = new Pad();
    run(w, 1, pad);
    const launches: number[] = [];
    let swings = 0;
    for (let i = 0; i < 120 && swings < 3; i++) {
      if (i % 6 === 0) pad.tap(PRESS.attack);
      pad.aimAt(p, e.x, e.y);
      const ev = run(w, 1, pad);
      for (const h of eventsOf(ev, 'hit')) if (h.target === e.id) swings++;
      for (const l of eventsOf(ev, 'launch')) launches.push(l.speed);
    }
    expect(swings).toBe(3);
    expect(launches).toHaveLength(1);
    expect(launches[0]).toBeGreaterThan(SWORD.impulse[2] - 0.5);
  });
});

describe('the Riposte', () => {
  it('a shot that lands in the guard does no damage and goes back to whoever fired it, a perfect return', () => {
    const w = openWorld();
    const p = w.players[0];
    const piper = dummy(w, 12.5, 9.5, 1000, PIPER);
    const pad = new Pad();
    run(w, 1, pad);
    // the bolt arrives from +x, but its sender stands somewhere else: the return must find it
    boltAt(w, p.x, p.y, 2.2, piper.id);
    const ev = run(w, 90, pad.tap(PRESS.special));
    expect(eventsOf(ev, 'guard')).toHaveLength(1);
    expect(eventsOf(ev, 'riposte')).toHaveLength(1);
    expect(eventsOf(ev, 'reflect')[0]).toMatchObject({ perfect: true });
    expect(p.hp).toBe(p.maxHp);
    const hit = eventsOf(ev, 'hit').find((h) => h.target === piper.id);
    expect(hit).toMatchObject({ kind: 'return', crit: true, by: p.slot });
    expect(p.rally).toBe(RALLY.weight.perfect);
  });

  it('a blow that lands in the guard throws the attacker clear and dazes it; landing it gives back half the cooldown', () => {
    const w = openWorld();
    const p = w.players[0];
    const e = spawnEnemy(w, THRUM, p.x + 2.2, p.y, { instant: true });
    e.cooldowns.fill(0);
    const pad = new Pad().aimAt(p, e.x, e.y);
    run(w, 1, pad);
    let launched = false;
    let tapped = false;
    for (let t = 0; t < 240 && !launched; t++) {
      // raise the guard as the lunge is about to go
      const tg = w.telegraphs.find((x) => x.owner === e.id);
      if (!tapped && tg && tg.dur - tg.t < 0.1) {
        pad.tap(PRESS.special);
        tapped = true;
      }
      const ev = run(w, 1, pad);
      const launch = eventsOf(ev, 'launch').find((l) => l.id === e.id);
      if (!launch) continue;
      launched = true;
      expect(launch.speed).toBeCloseTo(RIPOSTE.impulse);
      expect(launch.by).toBe(p.slot);
      // thrown away from the player
      expect(e.lvx).toBeGreaterThan(0);
    }
    expect(launched).toBe(true);
    expect(p.hp).toBe(p.maxHp);
    expect(p.specialCd).toBeLessThanOrEqual(RIPOSTE.cooldown * (1 - RIPOSTE.refund));
    expect(p.specialCd).toBeGreaterThan(RIPOSTE.cooldown * (1 - RIPOSTE.refund) - 1);
  });

  it('a guard that catches nothing leaves the player open for a moment, and the whole cooldown to wait', () => {
    const w = openWorld();
    const p = w.players[0];
    const pad = new Pad();
    run(w, 1, pad);
    run(w, 1, pad.tap(PRESS.special));
    expect(p.state).toBe('guard');
    run(w, Math.round(RIPOSTE.guardTime / DT) + 1, pad);
    expect(p.state).toBe('special');
    run(w, Math.round(RIPOSTE.whiff / DT) + 2, pad);
    expect(p.state).toBe('idle');
    expect(p.specialCd).toBeGreaterThan(RIPOSTE.cooldown - 1);
    // and it cannot be raised again yet
    const ev = run(w, 3, pad.tap(PRESS.special));
    expect(eventsOf(ev, 'refused')).toHaveLength(1);
    expect(p.state).toBe('idle');
  });

  it('the window is wider by the delay between a press and its effect', () => {
    const alone = openWorld();
    const delayed = openWorld();
    delayed.inputDelay = 6;
    for (const w of [alone, delayed]) {
      const pad = new Pad();
      run(w, 1, pad);
      run(w, 1, pad.tap(PRESS.special));
    }
    expect(delayed.players[0].guardT - alone.players[0].guardT).toBeCloseTo(6 * DT);
  });
});

describe('the Bow', () => {
  it('looses on the press and again while held, and a plain hit is not a Return', () => {
    const w = openWorld(['bow']);
    const p = w.players[0];
    const e = dummy(w, 11.5, 6.5, 1000);
    const pad = new Pad();
    run(w, 1, pad);
    const first = run(w, 1, pad.tap(PRESS.attack).hold(BTN.attack));
    expect(eventsOf(first, 'loose')).toHaveLength(1);
    const ev = run(w, Math.round((BOW.interval * 3 + 0.05) / DT), pad);
    expect(eventsOf(ev, 'loose')).toHaveLength(3);
    run(w, 40, pad.hold(BTN.attack, false));
    // four arrows, of which the third (the full draw of the run) hits harder
    expect(1000 - e.hp).toBeCloseTo((3 + BOW.third) * BOW.damage);
    expect(p.rally).toBe(0);
    expect(w.stats.returns).toBe(0);
  });

  it('an arrow that came off a wall is a Return: forty percent more per bounce, and Rally', () => {
    const w = openWorld(['bow']);
    const p = w.players[0];
    const e = dummy(w, 11.5, 6.5, 1000);
    const pad = new Pad();
    // shoot away from it, at the left wall
    pad.aimAt(p, 1, 6.5);
    run(w, 1, pad);
    const ev = run(w, 90, pad.tap(PRESS.attack));
    const bounces = eventsOf(ev, 'ricochet');
    expect(bounces).toHaveLength(1);
    expect(bounces[0]).toMatchObject({ off: 'wall', n: 1, by: p.slot });
    const hit = eventsOf(ev, 'hit')[0];
    expect(hit).toMatchObject({ target: e.id, kind: 'return' });
    expect(1000 - e.hp).toBeCloseTo(BOW.damage * (1 + BOW.bounceBonus), 6);
    expect(p.rally).toBe(RALLY.weight.arrow);
  });

  it('bounces twice and no more, at exactly the speed it left the string', () => {
    const w = openWorld(['bow']);
    const p = w.players[0];
    const pad = new Pad();
    pad.aimAt(p, 1, 6.5);
    run(w, 1, pad);
    pad.tap(PRESS.attack);
    const speeds: number[] = [];
    let bounces = 0;
    let ended = false;
    for (let t = 0; t < 120 && !ended; t++) {
      const ev = run(w, 1, pad);
      bounces += eventsOf(ev, 'ricochet').length;
      for (const pr of w.projectiles) speeds.push(Math.hypot(pr.vx, pr.vy));
      ended = eventsOf(ev, 'projectileEnd').length > 0;
    }
    expect(bounces).toBe(BOW.bounces);
    expect(ended).toBe(true);
    // a mirror in a wall changes nothing but the direction
    expect(new Set(speeds).size).toBe(1);
    expect(speeds[0]).toBeCloseTo(BOW.speed, 9);
  });

  it('skips from the Echo it hits to another nearby, for seventy percent', () => {
    const w = openWorld(['bow']);
    const p = w.players[0];
    const a = dummy(w, 10.5, 6.5, 1000);
    const b = dummy(w, 11.5, 8.5, 1000);
    const far = dummy(w, 3.5, 11.5, 1000);
    const pad = new Pad().aimAt(p, a.x, a.y);
    run(w, 1, pad);
    const ev = run(w, 60, pad.tap(PRESS.attack));
    expect(eventsOf(ev, 'skip')).toHaveLength(1);
    expect(1000 - a.hp).toBe(BOW.damage);
    expect(1000 - b.hp).toBeCloseTo(BOW.damage * BOW.skipMul, 6);
    expect(far.hp).toBe(1000);
    const hits = eventsOf(ev, 'hit');
    expect(hits.map((h) => h.kind)).toEqual(['direct', 'return']);
    expect(p.rally).toBe(RALLY.weight.arrow);
  });

  it('the preview is the path the arrow takes, to the last bit, even while the shooter is moving', () => {
    const w = bounceWorld('bow');
    const p = w.players[0];
    const pad = new Pad();
    const path: number[] = [];
    // aims at walls, cut corners, the post and the bumper
    const aims: Array<[number, number]> = [
      [1, 1],
      [16.9, 1.2],
      [5.5, 3.5],
      [12.5, 3.4],
      [9, 11],
      [1.2, 9.8],
      [17, 8],
      [3, 1],
    ];
    let checked = 0;
    for (const [ax, ay] of aims) {
      place(p, 3.5 + checked * 0.4, 5.5);
      p.vx = p.vy = 0;
      p.fireT = 0;
      pad.move(0.3, 1).aimAt(p, ax, ay);
      run(w, 3, pad);
      // what the screen would draw now, from the aim the next input carries
      previewArrow(w, p, aimAngleOf(pad.f), 2, path);
      const flown: number[] = [p.x, p.y];
      let done = false;
      for (let t = 0; t < 200 && !done; t++) {
        const ev = run(w, 1, t === 0 ? pad.tap(PRESS.attack) : pad);
        for (const r of eventsOf(ev, 'ricochet')) flown.push(r.x, r.y);
        for (const end of eventsOf(ev, 'projectileEnd')) {
          flown.push(end.x, end.y);
          done = true;
        }
      }
      expect(done).toBe(true);
      expect(path.length).toBeGreaterThanOrEqual(6);
      // the preview stops after the third turn; an arrow that met a bumper has bounces left and flies on
      expect(flown.slice(0, path.length)).toEqual(path);
      checked++;
    }
    expect(checked).toBe(aims.length);
  });

  it('moves at three quarters speed while the string is busy', () => {
    const w = openWorld(['bow']);
    const p = w.players[0];
    place(p, 3, 6.5);
    const pad = new Pad().move(1, 0);
    run(w, 30, pad.hold(BTN.attack).tap(PRESS.attack));
    const x0 = p.x;
    run(w, 60, pad);
    expect(p.x - x0).toBeCloseTo(PLAYER.speed * BOW.moveMul, 1);
  });
});

describe('the Ringstone', () => {
  it('is thrown to the aimed point, stops short of walls, and only one stands at a time', () => {
    const w = openWorld(['bow']);
    const p = w.players[0];
    const pad = new Pad().aimAt(p, 9.5, 6.5);
    run(w, 1, pad);
    const ev = run(w, 30, pad.tap(PRESS.special));
    expect(eventsOf(ev, 'stoneThrow')).toHaveLength(1);
    const planted = eventsOf(ev, 'stonePlant')[0];
    expect(planted.x).toBeCloseTo(9.5, 1);
    expect(planted.y).toBeCloseTo(6.5, 1);
    expect(p.specialCd).toBeGreaterThan(RINGSTONE.cooldown - 1);
    // a second one, thrown at the wall: the first goes, and this one stops against the wall
    p.specialCd = 0;
    pad.aimAt(p, 30, 6.5);
    const ev2 = run(w, 40, pad.tap(PRESS.special));
    expect(eventsOf(ev2, 'stoneEnd')).toHaveLength(1);
    expect(w.stones).toHaveLength(1);
    const s = w.stones[0];
    expect(s.flying).toBe(false);
    // no further than its reach, and it would have hit the wall at 15 first
    expect(s.x - p.x).toBeLessThanOrEqual(RINGSTONE.range + 1e-6);
    expect(s.x).toBeLessThanOrEqual(15 - RINGSTONE.radius);
    expect(isClear(w.room, s.x, s.y, RINGSTONE.radius * 0.98)).toBe(true);
  });

  it('sends an arrow that hits it at the nearest Echo, harder, without using up a bounce', () => {
    const w = openWorld(['bow']);
    const p = w.players[0];
    const e = dummy(w, 10.5, 2.5, 1000);
    const pad = new Pad().aimAt(p, 10.5, 6.5);
    run(w, 1, pad);
    run(w, 30, pad.tap(PRESS.special));
    expect(w.stones[0].flying).toBe(false);
    const ev = run(w, 60, pad.tap(PRESS.attack));
    const turn = eventsOf(ev, 'ricochet')[0];
    expect(turn).toMatchObject({ off: 'stone', n: 1 });
    const hit = eventsOf(ev, 'hit')[0];
    expect(hit).toMatchObject({ target: e.id, kind: 'return' });
    expect(1000 - e.hp).toBeCloseTo(BOW.damage * (1 + BOW.bounceBonus) * (1 + BODY.stoneBoost), 6);
    expect(w.stones[0].rungT).toBeLessThan(1);
  });

  it('fades after its time', () => {
    const w = openWorld(['bow']);
    const pad = new Pad().aimAt(w.players[0], 9.5, 6.5);
    run(w, 1, pad);
    run(w, 30, pad.tap(PRESS.special));
    expect(w.stones).toHaveLength(1);
    const ev = run(w, Math.round(RINGSTONE.life / DT) + 5, pad);
    expect(eventsOf(ev, 'stoneEnd')).toHaveLength(1);
    expect(w.stones).toHaveLength(0);
  });

  it('sends a launched body at the nearest other Echo', () => {
    const w = openWorld(['bow']);
    const p = w.players[0];
    place(p, 2, 12);
    const pad = new Pad().aimAt(p, 2, 4.5);
    run(w, 1, pad);
    run(w, 40, pad.tap(PRESS.special));
    const stone = w.stones[0];
    expect(stone.flying).toBe(false);
    const body = dummy(w, stone.x + 3, stone.y, 1000);
    const other = dummy(w, stone.x + 1.6, stone.y + 2.4, 1000);
    // launched at the stone, away from the other Echo
    body.lvx = -14;
    body.state = 'launched';
    body.launchBy = p.slot;
    const ev = run(w, 120, pad);
    expect(eventsOf(ev, 'wallSlam').some((s) => s.off === 'stone')).toBe(true);
    const cm = eventsOf(ev, 'carom')[0];
    expect(cm).toMatchObject({ a: body.id, b: other.id });
    // the carom it was sent into carried the boost of the stone
    expect(1000 - other.hp).toBeCloseTo(BODY.caromDamage * cm.speed * (1 + BODY.stoneBoost), 6);
  });
});

describe('the Fist', () => {
  it('jabs on the press: three of them, the third heavier, slapping a light body away', () => {
    const w = openWorld(['fist']);
    const p = w.players[0];
    const e = dummy(w, p.x + 1.2, p.y, 1000);
    const pad = new Pad();
    run(w, 1, pad);
    const hits: number[] = [];
    const launches: number[] = [];
    for (let i = 0; i < 120 && hits.length < 3; i++) {
      if (i % 5 === 0) pad.tap(PRESS.attack);
      pad.aimAt(p, e.x, e.y);
      const ev = run(w, 1, pad);
      for (const h of eventsOf(ev, 'hit')) hits.push(h.amount);
      for (const l of eventsOf(ev, 'launch')) launches.push(l.speed);
    }
    expect(hits).toEqual([FIST.damage[0], FIST.damage[1], FIST.damage[2]]);
    expect(launches).toHaveLength(1);
    expect(launches[0]).toBeGreaterThan(FIST.impulse[2] - 0.5);
    run(w, 60, pad);
    expect(p.state).toBe('idle');
  });

  it('held, the hand draws back; let go at full for a Haymaker that launches, and counts as a Return of weight 3', () => {
    const w = openWorld(['fist']);
    const p = w.players[0];
    const e = dummy(w, p.x + 2.4, p.y, 1000);
    const pad = new Pad();
    run(w, 1, pad);
    pad.tap(PRESS.attack).hold(BTN.attack);
    let full = false;
    for (let t = 0; t < 120 && !full; t++) full = eventsOf(run(w, 1, pad), 'chargeFull').length > 0;
    expect(full).toBe(true);
    expect(p.state).toBe('charge');
    // from the press to full, the jab included, is about a second
    expect(p.hp).toBe(p.maxHp);
    pad.hold(BTN.attack, false);
    let landed = false;
    let thrown = false;
    for (let t = 0; t < 40 && !landed; t++) {
      const ev = run(w, 1, pad);
      if (eventsOf(ev, 'haymaker').length) {
        thrown = true;
        expect(eventsOf(ev, 'haymaker')[0]).toMatchObject({ charge: 1 });
      }
      const hit = eventsOf(ev, 'hit')[0];
      if (!hit) continue;
      landed = true;
      // the punch itself, before the wall the body is on its way to
      expect(hit).toMatchObject({ target: e.id, kind: 'return', crit: true });
      expect(1000 - e.hp).toBeCloseTo(HAYMAKER.damage + HAYMAKER.damagePerCharge, 6);
      expect(eventsOf(ev, 'launch')[0].speed).toBeCloseTo(HAYMAKER.impulse + HAYMAKER.impulsePerCharge);
      expect(p.rally).toBe(RALLY.weight.perfect);
    }
    expect(thrown).toBe(true);
    expect(landed).toBe(true);
    // and the wall it flew into was a Return of its own
    const after = run(w, 60, pad);
    expect(eventsOf(after, 'hit').some((h) => h.kind === 'slam')).toBe(true);
    expect(p.rally).toBe(RALLY.weight.perfect + RALLY.weight.sent);
    expect(p.state).toBe('idle');
  });

  it('a part-drawn punch is weaker, and is not a Return; let go too soon and there is no punch', () => {
    const w = openWorld(['fist']);
    const p = w.players[0];
    const e = dummy(w, p.x + 2.4, p.y, 1000);
    const pad = new Pad();
    run(w, 1, pad);
    pad.tap(PRESS.attack).hold(BTN.attack);
    for (let t = 0; t < 120 && !(p.state === 'charge' && p.charge >= 0.5); t++) run(w, 1, pad);
    // the tick on which the button is let go still counts
    const held = p.charge + DT;
    const f = (held - HAYMAKER.min) / (HAYMAKER.full - HAYMAKER.min);
    pad.hold(BTN.attack, false);
    let landed = false;
    for (let t = 0; t < 40 && !landed; t++) {
      const ev = run(w, 1, pad);
      if (eventsOf(ev, 'haymaker').length) expect(eventsOf(ev, 'haymaker')[0].charge).toBeCloseTo(f, 6);
      const hit = eventsOf(ev, 'hit')[0];
      if (!hit) continue;
      landed = true;
      expect(hit).toMatchObject({ kind: 'direct', crit: false });
      expect(1000 - e.hp).toBeCloseTo(HAYMAKER.damage + HAYMAKER.damagePerCharge * f, 6);
      expect(p.rally).toBe(0);
    }
    expect(landed).toBe(true);
    // let the body fly, land and be still, and stand next to it again
    run(w, 120, pad);
    place(p, e.x - 2.4, e.y);
    p.rally = 0;

    // too soon
    run(w, 30, pad);
    pad.tap(PRESS.attack).hold(BTN.attack);
    for (let t = 0; t < 60 && p.state !== 'charge'; t++) run(w, 1, pad);
    expect(p.charge).toBeLessThan(HAYMAKER.min);
    const none = run(w, 30, pad.hold(BTN.attack, false));
    expect(eventsOf(none, 'haymaker')).toHaveLength(0);
    expect(p.state).toBe('idle');
    expect(p.charge).toBe(0);
  });

  it('lunges into the punch, and moves at a slower pace while the hand is drawn back', () => {
    const w = openWorld(['fist']);
    const p = w.players[0];
    place(p, 3, 6.5);
    const pad = new Pad().move(1, 0);
    run(w, 1, pad);
    pad.tap(PRESS.attack).hold(BTN.attack);
    for (let t = 0; t < 60 && p.state !== 'charge'; t++) run(w, 1, pad);
    run(w, 20, pad);
    const x0 = p.x;
    run(w, 30, pad);
    expect(p.x - x0).toBeCloseTo(PLAYER.speed * HAYMAKER.moveMul * 0.5, 1);
    const x1 = p.x;
    run(w, Math.round(HAYMAKER.lungeTime / DT) + 2, pad.stop().hold(BTN.attack, false));
    expect(p.x - x1).toBeGreaterThan(HAYMAKER.lunge * 0.85);
    expect(p.x - x1).toBeLessThan(HAYMAKER.lunge * 1.2);
  });

  it('three jabs stagger a heavy body, and then it flies like a wrecking ball', () => {
    const w = openWorld(['fist']);
    const p = w.players[0];
    const e = dummy(w, p.x + 1.3, p.y, 1000, HEAVY);
    const pad = new Pad();
    run(w, 1, pad);
    let staggered = false;
    for (let i = 0; i < 120 && !staggered; i++) {
      if (i % 5 === 0) pad.tap(PRESS.attack);
      pad.aimAt(p, e.x, e.y);
      staggered = eventsOf(run(w, 1, pad), 'stagger').length > 0;
    }
    expect(staggered).toBe(true);
    // the jab that tipped it over already launched it: 8.5 over 5 would be 1.7, three times that is not
    expect(e.state).toBe('launched');
    expect(speed(e)).toBeGreaterThan(BODY.launchSpeed);
  });

  it('the Break pops everything near outward, staggers the heavy, and slaps shots away as its own', () => {
    const w = openWorld(['fist']);
    const p = w.players[0];
    const right = dummy(w, p.x + 1.6, p.y, 1000);
    const up = dummy(w, p.x, p.y - 1.6, 1000);
    const big = dummy(w, p.x - 1.9, p.y, 1000, HEAVY);
    const far = dummy(w, p.x + 5, p.y + 4, 1000);
    const pad = new Pad();
    run(w, 1, pad);
    run(w, 1, pad.tap(PRESS.special));
    expect(p.state).toBe('special');
    // a bolt that will be inside the radius when the slam lands
    spawnProjectile(w, { kind: 'bolt', faction: 'enemy', owner: 99, x: p.x + 2.2, y: p.y + 1.5, vx: -2, vy: -2, radius: 0.16, damage: 8, range: 12 });
    const ev = run(w, Math.round(BREAK.windup / DT) + 2, pad);
    expect(eventsOf(ev, 'breakSlam')).toHaveLength(1);
    expect(1000 - right.hp).toBe(BREAK.damage);
    expect(1000 - up.hp).toBe(BREAK.damage);
    expect(1000 - big.hp).toBe(BREAK.damage);
    expect(far.hp).toBe(1000);
    expect(right.state).toBe('launched');
    expect(right.lvx).toBeGreaterThan(8);
    expect(up.lvy).toBeLessThan(-8);
    expect(big.state).not.toBe('launched');
    expect(big.stagger).toBe(BREAK.stagger);
    const shot = w.projectiles[0];
    expect(shot.faction).toBe('player');
    expect(shot.damage).toBeCloseTo(8 * BREAK.shotMul);
    expect(shot.vx).toBeGreaterThan(0);
    expect(p.specialCd).toBeGreaterThan(BREAK.cooldown - 1);
  });
});

describe('bombs', () => {
  const spec = { damage: 14, radius: 1.6, flight: 0.7, fuse: 1.3 };

  it('fly to the warned circle, sit on the fuse, and hurt whoever is still standing in it', () => {
    const w = openWorld();
    const p = w.players[0];
    const burr = dummy(w, 12.5, 6.5, 0, BURR);
    throwBomb(w, burr, p.x + 1, p.y, spec);
    const tg = w.telegraphs[0];
    expect(tg.shape).toBe('circle');
    expect(tg.radius).toBe(spec.radius);
    let landed = -1;
    let burst = -1;
    for (let t = 0; t < 200 && burst < 0; t++) {
      const ev = run(w, 1);
      if (landed < 0 && eventsOf(ev, 'bombLand').length) landed = t;
      if (eventsOf(ev, 'bombBurst').length) burst = t;
    }
    expect(landed * DT).toBeCloseTo(spec.flight, 1);
    expect((burst - landed) * DT).toBeCloseTo(spec.fuse, 1);
    expect(p.hp).toBe(p.maxHp - spec.damage);
    // the blast of an Echo does not hurt Echoes
    expect(burr.hp).toBe(burr.maxHp);
    expect(w.bombs).toHaveLength(0);
    expect(w.telegraphs.filter((t) => !t.dead)).toHaveLength(0);
  });

  it("a swing sends a bomb on the floor flying; it is the player's now, and its blast hurts Echoes only", () => {
    const w = openWorld();
    const p = w.players[0];
    const burr = dummy(w, 2.5, 2.5, 0, BURR);
    const target = dummy(w, p.x + 5, p.y, 1000);
    const near = dummy(w, p.x + 5.8, p.y + 0.9, 1000);
    throwBomb(w, burr, p.x + 1.2, p.y, spec);
    const pad = new Pad();
    run(w, Math.round(spec.flight / DT) + 3, pad);
    expect(w.bombs[0].state).toBe('fuse');
    const ev = run(w, 60, pad.tap(PRESS.attack));
    expect(eventsOf(ev, 'bombBat')[0]).toMatchObject({ player: p.slot });
    const burst = eventsOf(ev, 'bombBurst')[0];
    expect(burst.by).toBe(p.slot);
    // it burst on the Echo it flew into, not on its old fuse
    expect(burst.x).toBeGreaterThan(p.x + 3.5);
    expect(1000 - target.hp).toBe(BOMB.damage);
    expect(1000 - near.hp).toBe(BOMB.damage);
    expect(p.hp).toBe(p.maxHp);
    // one Return for the blast, however many it caught
    expect(p.rally).toBe(RALLY.weight.sent);
    expect(eventsOf(ev, 'hit').every((h) => h.kind === 'return')).toBe(true);
  });

  it("an arrow sets a bomb off where it sits, as the archer's", () => {
    const w = openWorld(['bow']);
    const p = w.players[0];
    const burr = dummy(w, 2.5, 2.5, 0, BURR);
    const beside = dummy(w, p.x + 4, p.y + 1, 1000);
    throwBomb(w, burr, p.x + 4, p.y, spec);
    const pad = new Pad();
    run(w, Math.round(spec.flight / DT) + 3, pad);
    const ev = run(w, 30, pad.tap(PRESS.attack));
    const burst = eventsOf(ev, 'bombBurst')[0];
    expect(burst).toMatchObject({ by: p.slot });
    expect(burst.x).toBeCloseTo(p.x + 4, 6);
    expect(1000 - beside.hp).toBe(BOMB.damage);
    expect(p.hp).toBe(p.maxHp);
  });

  it('a punch sends one flying faster than a sword does, and a bomb in the air cannot be struck', () => {
    const w = openWorld(['fist']);
    const p = w.players[0];
    const burr = dummy(w, 2.5, 2.5, 0, BURR);
    throwBomb(w, burr, p.x + 1.1, p.y, spec);
    const pad = new Pad();
    run(w, 1, pad);
    // still in its arc: the jab passes under it
    const early = run(w, 12, pad.tap(PRESS.attack));
    expect(eventsOf(early, 'bombBat')).toHaveLength(0);
    run(w, Math.round(spec.flight / DT), pad);
    let seen = false;
    pad.tap(PRESS.attack);
    for (let t = 0; t < 20 && !seen; t++) {
      const ev = run(w, 1, pad);
      if (!eventsOf(ev, 'bombBat').length) continue;
      seen = true;
      expect(Math.hypot(w.bombs[0].vx, w.bombs[0].vy)).toBeCloseTo(BOMB.fistSpeed);
    }
    expect(seen).toBe(true);
  });
});

describe('the Echoes', () => {
  it('a Piper draws three lines and plays three bolts exactly along them', () => {
    const w = openWorld();
    const p = w.players[0];
    place(p, 3.5, 6.5);
    const e = spawnEnemy(w, PIPER, 9.5, 6.5, { instant: true });
    e.cooldowns.fill(0);
    let lanes: number[] = [];
    const shots: number[] = [];
    for (let t = 0; t < 240 && shots.length < 3; t++) {
      const tg = w.telegraphs.find((x) => x.owner === e.id && !x.dead);
      if (tg && tg.t < tg.dur) {
        expect(tg.count).toBe(3);
        lanes = [0, 1, 2].map((i) => laneAngle(tg, i));
      }
      const ev = run(w, 1);
      if (eventsOf(ev, 'projectileSpawn').length) for (const pr of w.projectiles) shots.push(Math.atan2(pr.vy, pr.vx));
    }
    expect(shots).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(Math.cos(shots[i])).toBeCloseTo(Math.cos(lanes[i]), 9);
      expect(Math.sin(shots[i])).toBeCloseTo(Math.sin(lanes[i]), 9);
    }
    // a fan of fourteen degrees
    expect(Math.abs(lanes[2] - lanes[0])).toBeCloseTo((14 * Math.PI) / 180, 9);
    for (const pr of w.projectiles) expect(Math.hypot(pr.vx, pr.vy)).toBeCloseTo(9);
  });

  it('a Burr warns, then lobs a bomb at the circle it drew', () => {
    const w = openWorld();
    const p = w.players[0];
    place(p, 3.5, 6.5);
    const e = spawnEnemy(w, BURR, 9, 6.5, { instant: true });
    e.cooldowns.fill(0);
    let warnedAt = -1;
    let thrownAt = -1;
    for (let t = 0; t < 300 && thrownAt < 0; t++) {
      const ev = run(w, 1);
      if (warnedAt < 0 && eventsOf(ev, 'enemyWindup').some((x) => x.move === 'lob')) warnedAt = t;
      if (eventsOf(ev, 'bombThrow').length) thrownAt = t;
    }
    expect(warnedAt).toBeGreaterThanOrEqual(0);
    expect((thrownAt - warnedAt) * DT).toBeCloseTo(0.6, 1);
    const b = w.bombs[0];
    // the player stood still, so that is where it is going
    expect(Math.hypot(b.toX - p.x, b.toY - p.y)).toBeLessThan(0.05);
  });

  it('a Thrum finds its way round a pit instead of walking at it for ever', () => {
    const w = bounceWorld();
    const p = w.players[0];
    place(p, 12.5, 7.9);
    const e = spawnEnemy(w, THRUM, 6.5, 8.1, { instant: true });
    e.cooldowns.fill(999);
    let reached = false;
    for (let t = 0; t < 600 && !reached; t++) {
      run(w, 1);
      expect(groundAt(w.room, e.x, e.y)).toBe('floor');
      reached = Math.hypot(e.x - p.x, e.y - p.y) < 2.6;
    }
    expect(reached).toBe(true);
  });
});

/** Play one chamber of waves on the practice court with a bot in every seat. */
function playChamber(classes: ClassId[], makeBot: (c: ClassId) => Bot, seed: number, chamber = 1, maxSeconds = 150): { w: World; cleared: boolean; seconds: number } {
  const entrants = classes.map((classId, slot) => ({ slot, classId }));
  const w = createWorld(buildRoom(PRACTICE_COURT), seed, CONTENT, { entrants, chamber, flow: createFlow(chamber, classes.length) });
  const bots = classes.map((c) => makeBot(c));
  const idle = emptyInput();
  let ticks = 0;
  for (; ticks < maxSeconds * 60; ticks++) {
    stepWorld(
      w,
      bots.map((b, slot) => b.think(w, slot)),
      idle,
    );
    w.events.length = 0;
    for (const p of w.players) {
      if (groundAt(w.room, p.x, p.y) !== 'floor' || !isClear(w.room, p.x, p.y, p.radius * 0.9)) throw new Error(`a ${p.classId} player left the floor at tick ${ticks}`);
    }
    for (const e of w.enemies) {
      if (e.dead || e.state === 'pit' || e.state === 'launched') continue;
      if (groundAt(w.room, e.x, e.y) !== 'floor') throw new Error(`a ${e.defId} left the floor at tick ${ticks} in state ${e.state}`);
    }
    if (w.flow.phase === 'cleared' || !w.players.some(standing)) break;
  }
  return { w, cleared: w.flow.phase === 'cleared', seconds: ticks / 60 };
}

describe('bots on the practice court', () => {
  const expert = (c: ClassId): Bot => classBot(c, EXPERT);

  it('an idle player loses', () => {
    const r = playChamber(['sword'], () => idleBot(), 11);
    expect(r.cleared).toBe(false);
    expect(r.w.players[0].state).toBe('down');
  });

  for (const classId of ['sword', 'bow', 'fist'] as const) {
    it(`a ${classId} bot clears a chamber alone, using what the class is for`, () => {
      let cleared = 0;
      let returns = 0;
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const r = playChamber([classId], expert, seed, 2);
        if (r.cleared) cleared++;
        returns += r.w.stats.returns;
      }
      expect(cleared).toBeGreaterThanOrEqual(5);
      expect(returns).toBeGreaterThan(0);
    });
  }

  it('one of each clears a deeper chamber together, against a bigger wave', () => {
    const solo = playChamber(['sword'], expert, 7, 3);
    const trio = playChamber(['sword', 'bow', 'fist'], expert, 7, 3);
    expect(trio.cleared).toBe(true);
    expect(trio.w.stats.kills).toBeGreaterThan(solo.w.stats.kills);
    // Chimes went to every purse alike
    const purses = trio.w.players.map((p) => p.chimes);
    expect(new Set(purses).size).toBe(1);
  });
});

describe('Returns and Rally together', () => {
  it('Rally multiplies Returns and leaves plain hits alone', () => {
    const w = openWorld(['bow']);
    const p = w.players[0];
    const e = dummy(w, 11.5, 6.5, 1000);
    const pad = new Pad();
    run(w, 1, pad);
    for (let i = 0; i < 5; i++) addRally(w, p.slot, 2, 0, 0);
    expect(p.rally).toBe(10);
    // a plain arrow
    run(w, 30, pad.tap(PRESS.attack));
    expect(1000 - e.hp).toBe(BOW.damage);
    // one off the wall
    const before = e.hp;
    pad.aimAt(p, 1, 6.5);
    run(w, 90, pad.tap(PRESS.attack));
    expect(before - e.hp).toBeCloseTo(BOW.damage * (1 + BOW.bounceBonus) * (1 + 10 * RALLY.perPoint), 6);
    expect(p.rally).toBe(11);
  });
});
