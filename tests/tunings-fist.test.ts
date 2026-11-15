// The Tunings of the Fist, one test each: the same moment played without the Tuning and with it
// comes out differently, in the way the card says.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { THRUM } from '../src/content/enemies/thrum';
import { pushBody } from '../src/sim/bodies';
import { damageEnemy, damagePlayer } from '../src/sim/combat';
import type { EnemyDef } from '../src/sim/defs';
import { grantTuning } from '../src/sim/player';
import { BODY, BREAK, FIST, HAND, SIM_HZ } from '../src/sim/tuning';
import type { Enemy, Player, SimEvent, World } from '../src/sim/types';
import { BTN, PRESS, Pad, dummy, eventsOf, openWorld, place, run } from './helpers';

const MIDDLING: EnemyDef = { ...THRUM, mass: 2.5 };
const HEAVY: EnemyDef = { ...THRUM, mass: 5, radius: 0.6 };

/** A world with a Fist holding the given Tunings at the given ranks, and the one pad that plays it. */
function held(tunings: Record<string, number> = {}): { w: World; p: Player; pad: Pad } {
  const w = openWorld(['fist']);
  const p = w.players[0];
  for (const [id, rank] of Object.entries(tunings)) for (let i = 0; i < rank; i++) grantTuning(w, p, id);
  const pad = new Pad();
  run(w, 1, pad);
  w.events.length = 0;
  return { w, p, pad };
}
const speed = (e: Enemy): number => Math.hypot(e.lvx, e.lvy);
const lost = (e: Enemy, of = 1000): number => of - e.hp;
/** Send a body flying, as the player's doing. */
const fling = (w: World, e: Enemy, dx: number, dy: number, impulse: number): boolean => pushBody(w, e, dx / Math.hypot(dx, dy), dy / Math.hypot(dx, dy), impulse, 0);

describe('Billiards', () => {
  it('Follow Through: what you send flying goes faster, and ploughs through the first Echo it meets', () => {
    for (const [rank, faster, through] of [
      [0, 1, 0],
      [1, 1.1, 1],
      [2, 1.2, 1],
      [3, 1.2, 2],
    ]) {
      const { w } = held(rank ? { 'follow-through': rank } : {});
      const e = dummy(w, 5, 6.5, 1000);
      fling(w, e, 1, 0, 10);
      expect(speed(e)).toBeCloseTo(10 * faster);
      expect(e.ploughs).toBe(through);
    }
    // three in a line: the first is thrown at the second, with the third behind it
    const line = (tunings: Record<string, number>): { pairs: string[]; hurt: number[] } => {
      const { w, pad } = held(tunings);
      const es = [dummy(w, 4, 6.5, 1000), dummy(w, 6, 6.5, 1000), dummy(w, 8.2, 6.5, 1000)];
      fling(w, es[0], 1, 0, 16);
      const ev = run(w, 60, pad);
      const name = (id: number): string => String(es.findIndex((e) => e.id === id));
      return { pairs: eventsOf(ev, 'carom').map((c) => `${name(c.a)}>${name(c.b)}`), hurt: es.map((e) => lost(e)) };
    };
    const plain = line({});
    // it stops in the second, which is thrown on into the third
    expect(plain.pairs[0]).toBe('0>1');
    expect(plain.pairs).not.toContain('0>2');
    const through = line({ 'follow-through': 1 });
    // it goes through the second, hurting it, and is itself what strikes the third
    expect(through.pairs[0]).toBe('0>1');
    expect(through.pairs).toContain('0>2');
    expect(through.hurt[1]).toBeGreaterThan(0);
    expect(through.hurt[2]).toBeGreaterThan(0);
  });

  it('Carom Master: a carom passes on more of the motion, and a chain runs longer', () => {
    /** One body thrown into another: how fast the struck one leaves, as a share of the speed they met at. */
    const passed = (tunings: Record<string, number>): number => {
      const { w, pad } = held(tunings);
      const a = dummy(w, 5, 6.5, 1000);
      const b = dummy(w, 6.6, 6.5, 1000);
      fling(w, a, 1, 0, 14);
      for (let t = 0; t < 30; t++) {
        const c = eventsOf(run(w, 1, pad), 'carom')[0];
        if (c) return speed(b) / c.speed;
      }
      return 0;
    };
    expect(passed({})).toBeCloseTo(BODY.caromPass, 1);
    expect(passed({ 'carom-master': 1 })).toBeCloseTo(0.8, 1);
    expect(passed({ 'carom-master': 2 })).toBeCloseTo(1, 1);
    // a body at the end of a plain chain passes what it meets; with a longer chain it strikes it
    const strikes = (tunings: Record<string, number>, links: number): number => {
      const { w, pad } = held(tunings);
      const a = dummy(w, 5, 6.5, 1000);
      dummy(w, 6.6, 6.5, 1000);
      fling(w, a, 1, 0, 14);
      a.links = links;
      return eventsOf(run(w, 30, pad), 'carom').length;
    };
    expect(strikes({}, BODY.maxLinks)).toBe(0);
    expect(strikes({ 'carom-master': 1 }, BODY.maxLinks)).toBeGreaterThan(0);
    expect(strikes({ 'carom-master': 1 }, BODY.maxLinks + 1)).toBe(0);
    expect(strikes({ 'carom-master': 3 }, BODY.maxLinks + 2)).toBeGreaterThan(0);
  });

  it('Break Shot: the Break throws harder, and is ready sooner when it hits three or more', () => {
    const slam = (tunings: Record<string, number>, echoes: number): { thrown: number; cd: number } => {
      const { w, p, pad } = held(tunings);
      const es: Enemy[] = [];
      for (let i = 0; i < echoes; i++) {
        const a = (i * Math.PI * 2) / Math.max(1, echoes);
        es.push(dummy(w, p.x + Math.cos(a) * 1.6, p.y + Math.sin(a) * 1.6, 1000));
      }
      const ev = run(w, Math.round(BREAK.windup * SIM_HZ) + 3, pad.tap(PRESS.special));
      const launch = eventsOf(ev, 'launch').find((l) => l.id === es[0].id);
      return { thrown: launch ? launch.speed : 0, cd: p.specialCd };
    };
    const plain = slam({}, 3);
    expect(plain.thrown).toBeCloseTo(BREAK.impulse);
    for (const [rank, harder, sooner] of [
      [1, 1.3, 1],
      [2, 1.5, 2],
      [3, 1.7, 3],
    ]) {
      const r = slam({ 'break-shot': rank }, 3);
      expect(r.thrown).toBeCloseTo(BREAK.impulse * harder);
      expect(plain.cd - r.cd).toBeCloseTo(sooner);
    }
    // two is not three: it throws harder, but waits as long
    expect(slam({ 'break-shot': 3 }, 2).cd).toBeCloseTo(slam({}, 2).cd);
  });

  it('Pool Shark (Follow Through and Carom Master): the third body of a chain bursts', () => {
    const chain = (tunings: Record<string, number>): { beside: number; bursts: SimEvent[] } => {
      const { w, pad } = held(tunings);
      const a = dummy(w, 4, 6.5, 1000);
      dummy(w, 5.7, 6.5, 1000);
      dummy(w, 7.5, 6.5, 1000);
      // beside the third, out of the line the others fly along
      const beside = dummy(w, 7.5, 8.1, 1000);
      fling(w, a, 1, 0, 18);
      const ev = run(w, 60, pad);
      return { beside: lost(beside), bursts: eventsOf(ev, 'burst') };
    };
    const master = chain({ 'carom-master': 2 });
    expect(master.beside).toBe(0);
    expect(master.bursts).toHaveLength(0);
    const shark = chain({ 'carom-master': 2, 'follow-through': 1 });
    expect(shark.bursts[0]).toMatchObject({ what: 'shark', radius: HAND.sharkRadius });
    expect(shark.beside).toBeCloseTo(HAND.sharkDamage);
  });
});

describe('Wall Combo', () => {
  /** A body thrown hard at the wall beside it. */
  const slammed = (tunings: Record<string, number>, impulse = 16): { e: Enemy; ev: SimEvent[]; w: World; pad: Pad } => {
    const { w, pad } = held(tunings);
    const e = dummy(w, 13, 6.5, 1000);
    fling(w, e, 1, 0, impulse);
    const ev: SimEvent[] = [];
    for (let t = 0; t < 30 && eventsOf(ev, 'wallSlam').length === 0; t++) ev.push(...run(w, 1, pad));
    return { e, ev, w, pad };
  };

  it('Wall Hammer: a harder slam, and a hard one leaves the body stunned where it lands', () => {
    const plain = slammed({});
    // nothing else has touched it: what it has lost is what the slam took
    const base = lost(plain.e);
    expect(base).toBeGreaterThan(0);
    run(plain.w, 60, plain.pad);
    expect(plain.e.state).not.toBe('stun');
    for (const [rank, harder, stun] of [
      [1, 1.5, 0.5],
      [2, 1.9, 0.8],
      [3, 2.3, 1.1],
    ]) {
      const r = slammed({ 'wall-hammer': rank });
      expect(lost(r.e)).toBeCloseTo(base * harder);
      expect(r.e.slamStun).toBe(stun);
      const ev: SimEvent[] = [];
      for (let t = 0; t < 90 && eventsOf(ev, 'land').length === 0; t++) ev.push(...run(r.w, 1, r.pad));
      expect(r.e.state).toBe('stun');
      expect(r.e.stateDur).toBeCloseTo(stun);
    }
    // a soft slam hurts more, but does not stun
    const soft = slammed({ 'wall-hammer': 3 }, 10);
    expect(lost(soft.e)).toBeGreaterThan(0);
    expect(soft.e.slamStun).toBe(0);
  });

  /** A body is in flight across the player's reach, and they jab at it. */
  const jabbed = (tunings: Record<string, number>, rejabs = 0): { e: Enemy; ev: SimEvent[]; p: Player; before: number } => {
    const { w, p, pad } = held(tunings);
    const e = dummy(w, p.x + 1.1, p.y - 0.4, 1000);
    fling(w, e, 0, 1, 6);
    e.rejabs = rejabs;
    const before = speed(e);
    pad.aimAt(p, p.x + 5, p.y);
    const ev: SimEvent[] = [];
    for (let t = 0; t < 12 && eventsOf(ev, 'hit').length === 0; t++) ev.push(...run(w, 1, pad.tap(PRESS.attack)));
    return { e, ev, p, before };
  };

  it('Rebound Jab: a jab sends a body in flight on again, harder and faster, as a Return', () => {
    const plain = jabbed({});
    expect(eventsOf(plain.ev, 'hit')[0]).toMatchObject({ kind: 'direct', amount: FIST.damage[0] });
    expect(plain.e.rejabs).toBe(0);
    for (const [rank, harder] of [
      [1, 1.5],
      [2, 1.75],
      [3, 2],
    ]) {
      const r = jabbed({ 'rebound-jab': rank });
      expect(eventsOf(r.ev, 'hit')[0].kind).toBe('return');
      expect(lost(r.e)).toBeCloseTo(FIST.damage[0] * harder);
      expect(r.e.rejabs).toBe(1);
      // sent on where the player is aiming, faster than it came
      expect(r.e.lvx).toBeGreaterThan(0);
      expect(Math.abs(r.e.lvy)).toBeLessThan(1e-6);
      expect(speed(r.e)).toBeGreaterThan(r.before);
      expect(r.p.rally).toBeGreaterThan(0);
    }
    // three times for each body, and then a jab is a jab
    const spent = jabbed({ 'rebound-jab': 3 }, HAND.rejabMost);
    expect(eventsOf(spent.ev, 'hit')[0]).toMatchObject({ kind: 'direct', amount: FIST.damage[0] });
  });

  it('Glass Jaw: a body you have sent flying takes more from everyone until it lands', () => {
    const takes = (tunings: Record<string, number>): { flying: number; landed: number } => {
      const { w, pad } = held(tunings);
      const e = dummy(w, 5, 6.5, 1000);
      fling(w, e, 1, 0, 9);
      let hp = e.hp;
      damageEnemy(w, e, 20, { kind: 'direct', by: -1, dx: 1, dy: 0 });
      const flying = hp - e.hp;
      for (let t = 0; t < 120 && e.state === 'launched'; t++) run(w, 1, pad);
      hp = e.hp;
      damageEnemy(w, e, 20, { kind: 'direct', by: -1, dx: 1, dy: 0 });
      return { flying, landed: hp - e.hp };
    };
    expect(takes({})).toEqual({ flying: 20, landed: 20 });
    for (const [rank, more] of [
      [1, 0.15],
      [2, 0.25],
      [3, 0.35],
    ]) {
      const r = takes({ 'glass-jaw': rank });
      expect(r.flying).toBeCloseTo(20 * (1 + more));
      expect(r.landed).toBe(20);
    }
  });

  it('Corner Pocket (Wall Hammer and Rebound Jab): a slam straight after the punch brings the body back', () => {
    const off = (tunings: Record<string, number>): Enemy => {
      const { w, p, pad } = held(tunings);
      place(p, 11.5, 6.5);
      const e = dummy(w, 13.4, 7.2, 1000);
      // thrown at the wall and along it: a plain bounce carries on down the wall
      fling(w, e, 1, 0.8, 16);
      for (let t = 0; t < 30 && eventsOf(run(w, 1, pad), 'wallSlam').length === 0; t++);
      return e;
    };
    const plain = off({ 'wall-hammer': 1 });
    expect(plain.lvx).toBeLessThan(0);
    expect(plain.lvy).toBeGreaterThan(0);
    expect(plain.pocketed).toBe(false);
    const pocket = off({ 'wall-hammer': 1, 'rebound-jab': 1 });
    // straight back at whoever threw it, who stands up the wall from where it struck
    expect(pocket.pocketed).toBe(true);
    expect(pocket.lvx).toBeLessThan(0);
    expect(pocket.lvy).toBeLessThan(0);
    expect(Math.atan2(pocket.lvy, pocket.lvx)).toBeCloseTo(Math.atan2(6.5 - pocket.y, 11.5 - pocket.x), 1);
  });
});

describe('Shockwave', () => {
  /** A full Haymaker on an Echo with another standing beside it. */
  const haymaker = (tunings: Record<string, number>, besideDef: EnemyDef = THRUM): { beside: Enemy; ev: SimEvent[]; ticks: number } => {
    const { w, p, pad } = held(tunings);
    const target = dummy(w, p.x + 2.4, p.y, 1000);
    const beside = dummy(w, target.x + 0.3, target.y + 1.3, 1000, besideDef);
    pad.aimAt(p, target.x, target.y).tap(PRESS.attack).hold(BTN.attack);
    let ticks = 0;
    for (let t = 0; t < 160 && eventsOf(run(w, 1, pad), 'chargeFull').length === 0; t++) ticks++;
    const ev = run(w, 30, pad.hold(BTN.attack, false));
    return { beside, ev, ticks };
  };

  it('Thunderclap: a full Haymaker bursts where it lands, and pops what is light', () => {
    const plain = haymaker({});
    expect(lost(plain.beside)).toBe(0);
    for (const [rank, burst] of [
      [1, 10],
      [2, 15],
      [3, 20],
    ]) {
      const r = haymaker({ thunderclap: rank });
      expect(lost(r.beside)).toBeGreaterThanOrEqual(burst);
      expect(eventsOf(r.ev, 'burst')[0]).toMatchObject({ what: 'thunderclap', radius: HAND.clapRadius });
      expect(eventsOf(r.ev, 'launch').some((l) => l.id === r.beside.id)).toBe(true);
    }
    // something heavy takes the burst, and stands
    const heavy = haymaker({ thunderclap: 1 }, HEAVY);
    expect(lost(heavy.beside)).toBeCloseTo(10);
    expect(eventsOf(heavy.ev, 'launch').some((l) => l.id === heavy.beside.id)).toBe(false);
  });

  it('Iron Stance: with the hand drawn back, less gets through and nothing moves you', () => {
    const struck = (tunings: Record<string, number>, charging: boolean): { taken: number; knocked: boolean } => {
      const { w, p, pad } = held(tunings);
      if (charging) {
        pad.tap(PRESS.attack).hold(BTN.attack);
        for (let t = 0; t < 60 && p.state !== 'charge'; t++) run(w, 1, pad);
        expect(p.state).toBe('charge');
      }
      p.kx = 0;
      p.ky = 0;
      damagePlayer(w, p, 20, p.x - 2, p.y, 6);
      return { taken: p.maxHp - p.hp, knocked: p.kx !== 0 || p.ky !== 0 };
    };
    expect(struck({}, true)).toEqual({ taken: 20, knocked: true });
    expect(struck({ 'iron-stance': 2 }, false)).toEqual({ taken: 20, knocked: true });
    for (const [rank, less] of [
      [1, 0.3],
      [2, 0.45],
      [3, 0.6],
    ]) {
      const r = struck({ 'iron-stance': rank }, true);
      expect(r.taken).toBeCloseTo(20 * (1 - less));
      expect(r.knocked).toBe(false);
    }
    // and at its last rank the hand draws back faster
    const slow = haymaker({ 'iron-stance': 2 }).ticks;
    const fast = haymaker({ 'iron-stance': 3 }).ticks;
    expect(slow).toBe(haymaker({}).ticks);
    expect(fast).toBeLessThan(slow);
    expect(fast / slow).toBeCloseTo(1 / 1.15, 1);
  });

  /** A body thrown at the wall, with another standing where it will strike. */
  const bounce = (tunings: Record<string, number>): { beside: Enemy; ev: SimEvent[] } => {
    const { w, pad } = held(tunings);
    const e = dummy(w, 12.6, 6.5, 1000);
    const beside = dummy(w, 14.2, 7.6, 1000);
    fling(w, e, 1, 0, 14);
    return { beside, ev: run(w, 20, pad) };
  };

  it('Tremor: a body you have sent flying bursts at every bounce', () => {
    const plain = bounce({});
    expect(lost(plain.beside)).toBe(0);
    for (const [rank, burst] of [
      [1, 5],
      [2, 8],
      [3, 11],
    ]) {
      const r = bounce({ tremor: rank });
      expect(lost(r.beside)).toBeCloseTo(burst);
      expect(eventsOf(r.ev, 'burst')[0]).toMatchObject({ what: 'tremor', radius: HAND.tremorRadius });
      // it shakes what is near, and leaves it standing
      expect(eventsOf(r.ev, 'launch').some((l) => l.id === r.beside.id)).toBe(false);
    }
  });

  it('Earthquake (Thunderclap and Tremor): their bursts throw back everything they hit', () => {
    const quake = bounce({ tremor: 1, thunderclap: 1 });
    expect(lost(quake.beside)).toBeGreaterThanOrEqual(5);
    expect(eventsOf(quake.ev, 'launch').some((l) => l.id === quake.beside.id)).toBe(true);
    // and a Thunderclap now shoulders aside what is too heavy for it to pop
    const moved = (r: { beside: Enemy }): number => Math.hypot(r.beside.x - r.beside.px, r.beside.y - r.beside.py) + Math.abs(r.beside.y - (6.5 + 1.3));
    expect(moved(haymaker({ thunderclap: 1 }, MIDDLING))).toBe(0);
    expect(moved(haymaker({ thunderclap: 1, tremor: 1 }, MIDDLING))).toBeGreaterThan(0.05);
  });
});

describe('belonging to no build', () => {
  it('Heavy Hands: the heavier the body thrown, the harder it hits what it caroms into', () => {
    /** A body of some weight thrown into a light one: what the light one takes. */
    const carom = (tunings: Record<string, number>, def: EnemyDef): number => {
      const { w, pad } = held(tunings);
      const a = dummy(w, 5, 6.5, 1000, def);
      const b = dummy(w, 5 + a.radius + 0.4 + 0.6, 6.5, 1000);
      fling(w, a, 1, 0, 14 * def.mass);
      for (let t = 0; t < 20 && eventsOf(run(w, 1, pad), 'carom').length === 0; t++);
      return lost(b);
    };
    for (const [rank, k] of [
      [1, 1.25],
      [2, 1.5],
      [3, 1.75],
    ]) {
      // a light body hits as it ever did; a middling one that much harder; a heavy one that much twice over, and double
      expect(carom({ 'heavy-hands': rank }, THRUM)).toBeCloseTo(carom({}, THRUM));
      expect(carom({ 'heavy-hands': rank }, MIDDLING) / carom({}, MIDDLING)).toBeCloseTo(k);
      expect(carom({ 'heavy-hands': rank }, HEAVY) / carom({}, HEAVY)).toBeCloseTo(k * k * 2);
    }
  });
});

describe('the Fist’s Tunings as a set', () => {
  it('ten of them in three builds and a wildcard, one locked, and three Harmonies between them', () => {
    const own = Object.values(CONTENT.tunings).filter((t) => t.owner === 'fist');
    expect(own).toHaveLength(10);
    const builds = new Map<string, number>();
    for (const t of own) builds.set(t.build, (builds.get(t.build) ?? 0) + 1);
    expect([...builds.entries()].sort()).toEqual([
      ['Billiards', 3],
      ['Shockwave', 3],
      ['Wall Combo', 3],
      ['Wildcard', 1],
    ]);
    expect(own.filter((t) => t.locked).map((t) => t.id)).toEqual(['tremor']);
    const ids = new Set(own.map((t) => t.id));
    expect(
      CONTENT.harmonies
        .filter((h) => h.parents.every((id) => ids.has(id)))
        .map((h) => h.id)
        .sort(),
    ).toEqual(['corner-pocket', 'earthquake', 'pool-shark']);
    for (const t of own) expect(t.text.length).toBe(t.maxRank);
  });

  it('with all three classes in, a fresh save drafts from more than twenty, and the game holds forty-two', () => {
    const all = Object.values(CONTENT.tunings);
    expect(all).toHaveLength(42);
    for (const c of ['sword', 'bow', 'fist']) expect(all.filter((t) => !t.locked && (t.owner === c || t.owner === 'common')).length).toBe(21);
    expect(CONTENT.harmonies).toHaveLength(12);
  });
});
