// The Tunings anyone can take, one test each: the same moment played without the Tuning and
// with it comes out differently, in the way the card says.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { HURT_NONE, HURT_TAKEN, damageEnemy, damagePlayer, standing } from '../src/sim/combat';
import { dropChimes } from '../src/sim/flow';
import { grantTuning } from '../src/sim/player';
import { addRally } from '../src/sim/rally';
import { slowOf } from '../src/sim/status';
import { DASH, PLAYER, RALLY, REVIVE, SIM_HZ, TUNE } from '../src/sim/tuning';
import type { Enemy, Player, World } from '../src/sim/types';
import { PRESS, Pad, dummy, eventsOf, openWorld, place, run } from './helpers';

/** A world with one player holding the given Tunings at the given ranks. */
function held(tunings: Record<string, number>, players = 1): { w: World; p: Player } {
  const w = openWorld(players);
  const p = w.players[0];
  for (const [id, rank] of Object.entries(tunings)) for (let i = 0; i < rank; i++) grantTuning(w, p, id);
  w.events.length = 0;
  return { w, p };
}
/** A Return by the first player: a hit from something they sent back. */
const returnHit = (w: World, e: Enemy, amount = 10): boolean => damageEnemy(w, e, amount, { kind: 'return', by: 0, dx: 1, dy: 0 });

describe('the dash family', () => {
  it('Third Wind: one more charge, and at rank II charges come back faster', () => {
    expect(held({}).p.dashMaxCharges).toBe(DASH.charges);
    expect(held({ 'third-wind': 1 }).p.dashMaxCharges).toBe(DASH.charges + 1);
    const ticksToRecharge = (rank: number): number => {
      const { w, p } = held({ 'third-wind': rank });
      p.dashCharges = p.dashMaxCharges - 1;
      let n = 0;
      while (p.dashCharges < p.dashMaxCharges && n++ < 600) run(w, 1, new Pad());
      return n;
    };
    expect(ticksToRecharge(1)).toBe(Math.ceil(DASH.recharge * SIM_HZ));
    expect(ticksToRecharge(2)).toBeLessThan(ticksToRecharge(1) * 0.85);
  });

  it('Afterimage: a dash through an attack makes everything hit harder for three seconds', () => {
    for (const [rank, bonus] of [
      [0, 0],
      [1, 0.3],
      [3, 0.6],
    ]) {
      const { w, p } = held(rank ? { afterimage: rank } : {});
      const e = dummy(w, 9, 6.5, 500);
      p.state = 'dash';
      p.iframes = 0.2;
      expect(damagePlayer(w, p, 10, 5, 6.5, 0)).toBe(HURT_NONE);
      expect(p.afterT).toBe(rank ? TUNE.afterimageTime : 0);
      damageEnemy(w, e, 10, { kind: 'direct', by: 0, dx: 1, dy: 0 });
      expect(500 - e.hp).toBeCloseTo(10 * (1 + bonus));
    }
    // it runs out
    const { w, p } = held({ afterimage: 1 });
    p.afterT = 0.05;
    run(w, 6, new Pad());
    expect(p.afterT).toBe(0);
  });

  it('Ram: a dash knocks the Echoes it passes aside, and hurts them', () => {
    const dashThrough = (tunings: Record<string, number>): { e: Enemy; launched: number } => {
      const { w, p } = held(tunings);
      const e = dummy(w, 8.2, 6.5, 100);
      const pad = new Pad().move(1, 0).aimAt(p, 12, 6.5);
      run(w, 2, pad);
      pad.tap(PRESS.dash);
      const events = run(w, 20, pad);
      return { e, launched: eventsOf(events, 'launch').length };
    };
    const plain = dashThrough({});
    expect(plain.e.hp).toBe(100);
    expect(plain.launched).toBe(0);
    const rammed = dashThrough({ ram: 1 });
    expect(rammed.e.hp).toBe(94);
    expect(rammed.launched).toBe(1);
    expect(dashThrough({ ram: 3 }).e.hp).toBe(88);
  });
});

describe('the Rally family', () => {
  it('Sustain: Rally steps down a point at a time instead of falling to nothing', () => {
    const after = (tunings: Record<string, number>, seconds: number): number => {
      const { w, p } = held(tunings);
      p.rally = 5;
      p.rallyT = 0;
      run(w, Math.round(seconds * SIM_HZ), new Pad());
      return p.rally;
    };
    expect(after({}, RALLY.hold + 0.1)).toBe(0);
    expect(after({ sustain: 1 }, RALLY.hold + 0.1)).toBe(5);
    expect(after({ sustain: 1 }, RALLY.hold + 0.6)).toBe(4);
    expect(after({ sustain: 1 }, RALLY.hold + 1.1)).toBe(3);
    // rank II holds each point longer
    expect(after({ sustain: 2 }, RALLY.hold + 1.1)).toBe(4);
  });

  it('Overtone: every so many Rally gained, a ring bursts round the player and heals a little', () => {
    const { w, p } = held({ overtone: 1 });
    const near = dummy(w, p.x + 2, p.y, 200);
    const far = dummy(w, p.x + 6, p.y, 200);
    p.hp = 50;
    const events = [];
    for (let i = 0; i < 4; i++) {
      addRally(w, 0, 3, p.x, p.y);
      events.push(...w.events);
      w.events.length = 0;
      if (i < 3) expect(near.hp).toBe(200);
    }
    expect(eventsOf(events, 'burst').map((b) => b.what)).toEqual(['overtone']);
    expect(near.hp).toBe(200 - TUNE.overtoneDamage);
    expect(far.hp).toBe(200);
    expect(p.hp).toBe(52);
    // rank III needs fewer points and heals more
    const three = held({ overtone: 3 });
    three.p.hp = 50;
    for (let i = 0; i < 3; i++) addRally(three.w, 0, 3, three.p.x, three.p.y);
    expect(three.p.hp).toBe(54);
  });

  it('Opening Note: the first Return of a chamber hits double and starts Rally high', () => {
    const { w, p } = held({ 'opening-note': 2 });
    const e = dummy(w, 9, 6.5, 500);
    returnHit(w, e);
    expect(500 - e.hp).toBe(20);
    expect(eventsOf(w.events, 'hit')[0].crit).toBe(true);
    addRally(w, 0, 1, e.x, e.y);
    expect(p.rally).toBe(7);
    // only the first
    returnHit(w, e);
    expect(500 - e.hp).toBe(30);
    // and without the Tuning the first Return is an ordinary one
    const plain = held({});
    const d = dummy(plain.w, 9, 6.5, 500);
    returnHit(plain.w, d);
    addRally(plain.w, 0, 1, d.x, d.y);
    expect(500 - d.hp).toBe(10);
    expect(plain.p.rally).toBe(1);
  });
});

describe('the elements', () => {
  it('Ember Return: Returns burn, and only Returns', () => {
    const { w } = held({ 'ember-return': 1 });
    const e = dummy(w, 9, 6.5, 500);
    damageEnemy(w, e, 10, { kind: 'direct', by: 0, dx: 1, dy: 0 });
    expect(e.status.burnT).toBe(0);
    returnHit(w, e);
    expect(e.status.burnDps).toBe(4);
    run(w, Math.round(3.5 * SIM_HZ), new Pad());
    // twenty from the two hits, then four a second for three seconds
    expect(500 - e.hp).toBeGreaterThanOrEqual(31);
    expect(500 - e.hp).toBeLessThanOrEqual(32);
    expect(held({ 'ember-return': 3 }).p.mods.ember).toBe(8);
  });

  it('Frost Return: Returns chill', () => {
    const { w } = held({ 'frost-return': 3 });
    const e = dummy(w, 9, 6.5, 500);
    expect(slowOf(e)).toBe(0);
    returnHit(w, e);
    expect(slowOf(e)).toBe(0.45);
    run(w, Math.round(3.2 * SIM_HZ), new Pad());
    expect(slowOf(e)).toBe(0);
  });

  it('Storm Return: every so many Rally gained, lightning jumps from Echo to Echo', () => {
    const { w } = held({ 'storm-return': 1 });
    const a = dummy(w, 8, 6.5, 100);
    const b = dummy(w, 10, 6.5, 100);
    const c = dummy(w, 12, 6.5, 100);
    addRally(w, 0, 3, a.x, a.y);
    addRally(w, 0, 3, a.x, a.y);
    expect(eventsOf(w.events, 'bolt').length).toBe(0);
    addRally(w, 0, 3, a.x, a.y);
    expect(eventsOf(w.events, 'bolt').length).toBe(2);
    expect([a.hp, b.hp, c.hp]).toEqual([92, 92, 100]);
    // rank III reaches further down the line and hits harder
    const three = held({ 'storm-return': 3 });
    const line = [8, 10, 12, 14].map((x) => dummy(three.w, x, 6.5, 100));
    addRally(three.w, 0, 3, 8, 6.5);
    addRally(three.w, 0, 3, 8, 6.5);
    expect(line.map((e) => e.hp)).toEqual([88, 88, 88, 88]);
  });
});

describe('body, purse and team', () => {
  it('Stout Heart: more health, healed at once', () => {
    const { w, p } = held({});
    p.hp = 60;
    grantTuning(w, p, 'stout-heart');
    expect([p.maxHp, p.hp]).toEqual([PLAYER.maxHp + 15, 75]);
    grantTuning(w, p, 'stout-heart');
    expect([p.maxHp, p.hp]).toEqual([PLAYER.maxHp + 30, 90]);
    expect(eventsOf(w.events, 'tuning').map((t) => t.rank)).toEqual([1, 2]);
  });

  it('Tithe: a bigger share of every Chime, down to the fraction', () => {
    const gathered = (tunings: Record<string, number>): number => {
      const { w, p } = held(tunings);
      dropChimes(w, p.x + 0.4, p.y, 10);
      run(w, 180, new Pad());
      expect(w.flow.pickups.length).toBe(0);
      return p.chimes;
    };
    expect(gathered({})).toBe(10);
    expect(gathered({ tithe: 1 })).toBe(12);
    expect(gathered({ tithe: 2 })).toBe(13);
    expect(gathered({ tithe: 3 })).toBe(15);
  });

  it('Echo Ward: once a chamber, a downing blow leaves you standing and answers with a burst', () => {
    const { w, p } = held({ 'echo-ward': 1 });
    const e = dummy(w, p.x + 1.5, p.y, 100);
    p.hp = 5;
    expect(damagePlayer(w, p, 50, e.x, e.y, 0)).toBe(HURT_TAKEN);
    expect(p.hp).toBe(1);
    expect(standing(p)).toBe(true);
    expect(eventsOf(w.events, 'ward').length).toBe(1);
    expect(e.hp).toBe(100 - TUNE.wardDamage);
    // only once
    p.iframes = 0;
    damagePlayer(w, p, 50, e.x, e.y, 0);
    expect(standing(p)).toBe(false);
    // without it, the first blow downs
    const plain = held({});
    plain.p.hp = 5;
    damagePlayer(plain.w, plain.p, 50, 0, 0, 0);
    expect(standing(plain.p)).toBe(false);
  });

  it('Echo Ward at its higher ranks helps a fallen ally up faster', () => {
    const ticksToRevive = (tunings: Record<string, number>): number => {
      const { w, p } = held(tunings, 2);
      const mate = w.players[1];
      place(mate, p.x + 1, p.y);
      mate.hp = 1;
      damagePlayer(w, mate, 50, 0, 0, 0);
      expect(standing(mate)).toBe(false);
      let n = 0;
      while (!standing(mate) && n++ < 600) run(w, 1, new Pad(), new Pad());
      return n;
    };
    const plain = ticksToRevive({});
    expect(plain).toBeGreaterThanOrEqual(Math.floor(REVIVE.time * SIM_HZ));
    expect(ticksToRevive({ 'echo-ward': 1 })).toBe(plain);
    expect(ticksToRevive({ 'echo-ward': 3 })).toBeLessThan(plain * 0.7);
  });
});

describe('the common Harmonies', () => {
  it('Steam (Ember + Frost): fire and frost on one Echo burst, stagger it, and are spent', () => {
    expect(held({ 'ember-return': 1 }).p.mods.steam).toBe(0);
    const { w } = held({ 'ember-return': 1, 'frost-return': 1 });
    const e = dummy(w, 9, 6.5, 500);
    const beside = dummy(w, 10, 6.5, 500);
    const away = dummy(w, 13, 6.5, 500);
    returnHit(w, e);
    expect(eventsOf(w.events, 'burst').map((b) => b.what)).toEqual(['steam']);
    expect(500 - e.hp).toBe(10 + TUNE.steamDamage);
    expect(500 - beside.hp).toBe(TUNE.steamDamage);
    expect(away.hp).toBe(500);
    expect([e.status.burnT, e.status.chillT]).toEqual([0, 0]);
    expect(e.state).toBe('stun');
    // the same Echo does not burst again at once
    w.events.length = 0;
    returnHit(w, e);
    expect(eventsOf(w.events, 'burst').length).toBe(0);
    expect(e.status.burnT).toBeGreaterThan(0);
  });

  it('Perfect Pitch (Sustain + Opening Note): at full Rally every Return hits half as hard again', () => {
    const { w, p } = held({ sustain: 1, 'opening-note': 1 });
    expect(p.mods.perfectPitch).toBe(1);
    const e = dummy(w, 9, 6.5, 500);
    p.opening = false;
    p.rally = RALLY.cap - 1;
    returnHit(w, e);
    expect(500 - e.hp).toBe(10);
    p.rally = RALLY.cap;
    returnHit(w, e);
    expect(500 - e.hp).toBe(25);
  });

  it('Cascade (Overtone + Storm Return): the Overtone ring strikes what it touches with lightning', () => {
    const ring = (tunings: Record<string, number>): { hp: number; bolts: number } => {
      const { w, p } = held(tunings);
      const e = dummy(w, p.x + 2, p.y, 200);
      // keep the Storm's own lightning out of the count
      p.stormAcc = -100;
      for (let i = 0; i < 4; i++) addRally(w, 0, 3, p.x + 20, p.y);
      return { hp: e.hp, bolts: eventsOf(w.events, 'bolt').length };
    };
    expect(ring({ overtone: 1 })).toEqual({ hp: 200 - TUNE.overtoneDamage, bolts: 0 });
    expect(ring({ overtone: 1, 'storm-return': 1 })).toEqual({ hp: 200 - TUNE.overtoneDamage - 8, bolts: 1 });
  });
});

describe('every common Tuning', () => {
  it('has a test above, and words for every rank', () => {
    const tested = ['third-wind', 'afterimage', 'ram', 'sustain', 'overtone', 'opening-note', 'ember-return', 'frost-return', 'storm-return', 'stout-heart', 'tithe', 'echo-ward'];
    const common = Object.values(CONTENT.tunings).filter((t) => t.owner === 'common');
    expect(common.map((t) => t.id).sort()).toEqual(tested.slice().sort());
    for (const t of common)
      expect(
        t.text.every((line) => line.length > 10 && line.length < 110),
        t.id,
      ).toBe(true);
    expect(CONTENT.harmonies.filter((h) => CONTENT.tunings[h.parents[0]].owner === 'common' && CONTENT.tunings[h.parents[1]].owner === 'common').map((h) => h.id)).toEqual([
      'steam',
      'perfect-pitch',
      'cascade',
    ]);
  });
});
