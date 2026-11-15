// The camp: the Tuner sells for Chimes, the Still Pool gives one thing to each player, and the
// party leaves when everyone is ready.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { botCommands, classBot } from '../src/sim/bots';
import { BUY_RATION, BUY_RESTOCK, CAMP, REST_HEAL, atCamp, buy, openCamp, priceOf, raisable, rest, restockPrice } from '../src/sim/camp';
import type { CampSeat } from '../src/sim/camp';
import { grantTuning } from '../src/sim/player';
import { generateRoom } from '../src/sim/roomgen';
import { planRoute, roomSpec } from '../src/sim/run';
import { createSession, stepSession, stopOf, worldOf } from '../src/sim/session';
import type { Command, Session, SessionConfig } from '../src/sim/session';
import { hashSession } from '../src/sim/snapshot';
import { SIM_HZ } from '../src/sim/tuning';
import type { ClassId, Player, World } from '../src/sim/types';
import { eventsOf, openWorld } from './helpers';

const CLASSES: ClassId[] = ['sword', 'bow', 'fist'];
/** A session that begins at the camp of the Outer Ring (always the fifth chamber). */
const atTheCamp = (players: number, seed: string): Session => {
  const config: SessionConfig = { seed, players: Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}`, classId: CLASSES[i % 3] })), buildId: 'test', inputDelay: 0, stress: 0, startAt: 5 };
  return createSession(config, CONTENT);
};
const step = (s: Session, cmds: Command[] = []): void => {
  stepSession(s, { tick: s.tick + 1, inputs: [], cmds }, CONTENT);
  for (const w of s.worlds) w.events.length = 0;
};
const run = (s: Session, seconds: number): void => {
  for (let t = 0; t < seconds * SIM_HZ; t++) step(s);
};
const ask = (s: Session, slot: number, kind: Command['kind'], a: number): Command => ({ slot, seq: s.lastSeq[slot] + 1, kind, a });

/** A player standing at a camp of their own, outside any session, with a full purse. */
function stall(classId: ClassId = 'sword'): { w: World; p: Player; seat: CampSeat } {
  const w = openWorld([classId]);
  const p = w.players[0];
  p.chimes = 500;
  return { w, p, seat: openCamp('stall', p, CONTENT) };
}

describe('the Tuner', () => {
  it('sets out three different Tunings from the player’s own pools, one of them better than common', () => {
    for (const classId of CLASSES) {
      for (let i = 0; i < 40; i++) {
        const w = openWorld([classId]);
        const seat = openCamp(`shelf-${i}`, w.players[0], CONTENT);
        expect(seat.shelf.length).toBe(3);
        expect(new Set(seat.shelf).size).toBe(3);
        const defs = seat.shelf.map((id) => CONTENT.tunings[id]);
        expect(defs.every((t) => t.owner === classId || t.owner === 'common')).toBe(true);
        expect(defs.some((t) => t.rarity >= 1)).toBe(true);
        expect(seat.ration).toBe(true);
      }
    }
  });

  it('takes the Chimes and gives the Tuning, once', () => {
    const { w, p, seat } = stall();
    const id = seat.shelf[1];
    const price = priceOf(CONTENT.tunings[id]);
    expect(CAMP.price).toContain(price);
    expect(buy(w, p, seat, 1, 'stall')).toBe(true);
    expect(p.chimes).toBe(500 - price);
    expect(p.tunings[id]).toBe(1);
    expect(seat.shelf[1]).toBe('');
    expect(eventsOf(w.events, 'tuning').map((e) => e.id)).toEqual([id]);
    // that place on the shelf is empty now
    expect(buy(w, p, seat, 1, 'stall')).toBe(false);
    expect(p.chimes).toBe(500 - price);
  });

  it('sells nothing to a purse that is short, and takes nothing from it', () => {
    const { w, p, seat } = stall();
    p.hp = 20;
    for (const a of [0, 1, 2, BUY_RATION, BUY_RESTOCK]) {
      const cost = a === BUY_RATION ? CAMP.ration : a === BUY_RESTOCK ? restockPrice(seat) : priceOf(CONTENT.tunings[seat.shelf[a]]);
      p.chimes = cost - 1;
      const before = JSON.stringify([seat, p.tunings, p.hp]);
      expect(buy(w, p, seat, a, 'stall')).toBe(false);
      expect(p.chimes).toBe(cost - 1);
      expect(JSON.stringify([seat, p.tunings, p.hp])).toBe(before);
    }
  });

  it('sells one ration to each player, and none to somebody who is not hurt', () => {
    const { w, p, seat } = stall();
    expect(buy(w, p, seat, BUY_RATION, 'stall')).toBe(false);
    p.hp = 50;
    expect(buy(w, p, seat, BUY_RATION, 'stall')).toBe(true);
    expect([p.hp, p.chimes]).toEqual([50 + CAMP.rationHeal, 500 - CAMP.ration]);
    expect(buy(w, p, seat, BUY_RATION, 'stall')).toBe(false);
    // it never heals past full
    const other = stall();
    other.p.hp = other.p.maxHp - 5;
    buy(other.w, other.p, other.seat, BUY_RATION, 'stall');
    expect(other.p.hp).toBe(other.p.maxHp);
  });

  it('sets out a fresh shelf for a price that rises, the same on every laptop', () => {
    const a = stall();
    const b = stall();
    const first = a.seat.shelf.slice();
    expect(restockPrice(a.seat)).toBe(CAMP.restock);
    expect(buy(a.w, a.p, a.seat, BUY_RESTOCK, 'stall')).toBe(true);
    buy(b.w, b.p, b.seat, BUY_RESTOCK, 'stall');
    expect(a.p.chimes).toBe(500 - CAMP.restock);
    expect(a.seat.shelf.length).toBe(3);
    expect(a.seat.shelf).not.toEqual(first);
    expect(a.seat.shelf).toEqual(b.seat.shelf);
    expect(restockPrice(a.seat)).toBe(CAMP.restock + CAMP.restockStep);
  });
});

describe('the Still Pool', () => {
  it('gives back a share of health, once', () => {
    const { w, p, seat } = stall();
    p.hp = 30;
    expect(rest(w, p, seat, REST_HEAL)).toBe(true);
    expect(p.hp).toBe(30 + Math.round(p.maxHp * CAMP.heal));
    expect(p.chimes).toBe(500);
    p.hp = 30;
    expect(rest(w, p, seat, REST_HEAL)).toBe(false);
    expect(p.hp).toBe(30);
  });

  it('does not let its one thing be wasted on somebody who is not hurt', () => {
    const { w, p, seat } = stall();
    expect(rest(w, p, seat, REST_HEAL)).toBe(false);
    expect(seat.rested).toBe(false);
  });

  it('raises a Tuning the player holds by a rank, instead', () => {
    const { w, p, seat } = stall();
    const many = Object.values(CONTENT.tunings).filter((t) => t.owner === 'common' && t.maxRank >= 2);
    grantTuning(w, p, many[0].id);
    grantTuning(w, p, many[1].id);
    const ids = raisable(p, CONTENT);
    expect(ids).toEqual([many[0].id, many[1].id].sort());
    expect(rest(w, p, seat, 2)).toBe(true);
    expect(p.tunings[ids[1]]).toBe(2);
    expect(p.tunings[ids[0]]).toBe(1);
    // and that was its one thing
    p.hp = 10;
    expect(rest(w, p, seat, REST_HEAL)).toBe(false);
    expect(rest(w, p, seat, 1)).toBe(false);
  });

  it('with nothing to raise, gives a little health for good', () => {
    const { w, p, seat } = stall();
    const max = p.maxHp;
    expect(raisable(p, CONTENT)).toEqual([]);
    expect(rest(w, p, seat, 2)).toBe(false);
    expect(rest(w, p, seat, 1)).toBe(true);
    expect([p.maxHp, p.hp]).toEqual([max + CAMP.gift, max + CAMP.gift]);
  });
});

describe('a camp on the road', () => {
  it('is a bare floor with one post for the stall, and no traps', () => {
    for (let i = 0; i < 60; i++) {
      const stop = planRoute(`camp-${i}`)[4];
      expect(stop.kind).toBe('camp');
      const map = generateRoom(`camp-${i}`, roomSpec(stop)).map.join('');
      expect(map.split('o').length - 1).toBe(1);
      expect(/[~B^KX]/.test(map)).toBe(false);
    }
  });

  it('opens for everyone who walks in, and no longer heals by itself', () => {
    const s = atTheCamp(3, 'arrive');
    expect(stopOf(s)?.kind).toBe('camp');
    expect(s.camps.length).toBe(3);
    expect(s.camps.every(atCamp)).toBe(true);
    for (const p of s.worlds[0].players) p.hp = 40;
    run(s, 2);
    expect(s.worlds[0].players.map((p) => p.hp)).toEqual([40, 40, 40]);
    expect(s.worlds[0].enemies.length).toBe(0);
  });

  it('means nothing anywhere else', () => {
    const s = createSession({ seed: 'elsewhere', players: [{ name: 'P1', classId: 'sword' }], buildId: 'test', inputDelay: 0, stress: 0 }, CONTENT);
    const p = s.worlds[0].players[0];
    p.chimes = 500;
    p.hp = 20;
    step(s, [ask(s, 0, 'buy', 0)]);
    step(s, [ask(s, 0, 'rest', REST_HEAL)]);
    step(s, [ask(s, 0, 'ready', 1)]);
    expect([p.chimes, p.hp, Object.keys(p.tunings).length]).toEqual([500, 20, 0]);
    expect(s.camps.some((c) => c.ready)).toBe(false);
  });

  it('two players buying in the same tick each get their own, the same on every laptop', () => {
    const a = atTheCamp(2, 'same-tick');
    const b = atTheCamp(2, 'same-tick');
    for (const s of [a, b]) for (const p of s.worlds[0].players) p.chimes = 300;
    const wanted = [a.camps[0].shelf[0], a.camps[1].shelf[2]];
    const cmds = (s: Session): Command[] => [ask(s, 1, 'buy', 2), ask(s, 0, 'buy', 0)];
    step(a, cmds(a));
    step(b, cmds(b));
    expect(a.worlds[0].players.map((p) => Object.keys(p.tunings))).toEqual([[wanted[0]], [wanted[1]]]);
    expect(hashSession(a)).toBe(hashSession(b));
    // a command that arrives twice is applied once
    const again: Command = { slot: 0, seq: a.lastSeq[0], kind: 'buy', a: 1 };
    const chimes = a.worlds[0].players[0].chimes;
    step(a, [again]);
    expect(a.worlds[0].players[0].chimes).toBe(chimes);
  });

  it('alone, is left as soon as the player says so', () => {
    const s = atTheCamp(1, 'alone');
    run(s, 8);
    expect(stopOf(s)?.n).toBe(5);
    step(s, [ask(s, 0, 'ready', 1)]);
    run(s, 1);
    expect(stopOf(s)?.n).toBe(6);
    expect(s.camps.some(atCamp)).toBe(false);
  });

  it('together, is left when everyone is ready, and the first to be ready starts a count for the rest', () => {
    const s = atTheCamp(3, 'together');
    run(s, 4);
    step(s, [ask(s, 0, 'ready', 1)]);
    run(s, 5);
    // one is ready, two are not: still here, and the count is running
    expect(stopOf(s)?.n).toBe(5);
    expect(s.campFor).toBeGreaterThan(0);
    step(s, [ask(s, 1, 'ready', 1), ask(s, 2, 'ready', 1)]);
    run(s, 1);
    expect(stopOf(s)?.n).toBe(6);

    // nobody else ever says so: the road goes on anyway when the count runs out
    const t = atTheCamp(3, 'afk');
    run(t, 4);
    step(t, [ask(t, 2, 'ready', 1)]);
    run(t, CAMP.wait / SIM_HZ - 1);
    expect(stopOf(t)?.n).toBe(5);
    run(t, 2);
    expect(stopOf(t)?.n).toBe(6);
    // and a camp nobody is ready to leave is never left
    const u = atTheCamp(2, 'staying');
    run(u, 90);
    expect(stopOf(u)?.n).toBe(5);
  });

  it('what was bought and what the Pool gave go on down the road', () => {
    const s = atTheCamp(1, 'carry');
    const p = worldOf(s, 0).players[0];
    p.chimes = 300;
    p.hp = 40;
    const id = s.camps[0].shelf[0];
    const price = priceOf(CONTENT.tunings[id]);
    step(s, [ask(s, 0, 'buy', 0)]);
    step(s, [ask(s, 0, 'rest', REST_HEAL)]);
    step(s, [ask(s, 0, 'ready', 1)]);
    run(s, 4);
    expect(stopOf(s)?.n).toBe(6);
    const q = worldOf(s, 0).players[0];
    expect(q.tunings[id]).toBe(1);
    expect(q.chimes).toBe(300 - price);
    expect(q.hp).toBeGreaterThanOrEqual(40 + Math.round(100 * CAMP.heal));
  });

  it('bots rest, buy what they can pay for, and walk on', () => {
    const s = atTheCamp(3, 'bots');
    for (const p of s.worlds[0].players) {
      p.chimes = 150;
      p.hp = 45;
    }
    const bots = CLASSES.map((c) => classBot(c));
    for (let t = 0; t < 30 * SIM_HZ && stopOf(s)?.n === 5; t++) {
      const inputs = bots.map((b, slot) => ({ ...b.think(worldOf(s, slot), slot) }));
      stepSession(s, { tick: s.tick + 1, inputs, cmds: botCommands(s, CONTENT) }, CONTENT);
      for (const w of s.worlds) w.events.length = 0;
    }
    expect(stopOf(s)?.n).toBe(6);
    for (const p of s.worlds[0].players) {
      expect(p.hp).toBeGreaterThan(45);
      expect(Object.keys(p.tunings).length).toBeGreaterThanOrEqual(1);
      expect(p.chimes).toBeLessThan(150);
      expect(p.chimes).toBeGreaterThanOrEqual(0);
    }
  });
});
