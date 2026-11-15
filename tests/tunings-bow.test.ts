// The Tunings of the Bow, one test each: the same moment played without the Tuning and with it
// comes out differently, in the way the card says.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { grantTuning } from '../src/sim/player';
import { arrowSpec, spawnProjectile } from '../src/sim/projectiles';
import { BOW, HOOK, SIM_HZ, STRING } from '../src/sim/tuning';
import type { Enemy, Player, Projectile, SimEvent, World } from '../src/sim/types';
import { BTN, PRESS, Pad, dummy, eventsOf, openWorld, place, run } from './helpers';

/** A world with a Bow holding the given Tunings at the given ranks, and the one pad that plays it. */
function held(tunings: Record<string, number> = {}): { w: World; p: Player; pad: Pad } {
  const w = openWorld(['bow']);
  const p = w.players[0];
  for (const [id, rank] of Object.entries(tunings)) for (let i = 0; i < rank; i++) grantTuning(w, p, id);
  const pad = new Pad();
  run(w, 1, pad);
  w.events.length = 0;
  return { w, p, pad };
}
const speedOf = (pr: Projectile): number => Math.hypot(pr.vx, pr.vy);

/**
 * One of the player's arrows, already on its way: from a point, flying at another, with whatever
 * it is said to have done so far. It skips to nobody unless told to.
 */
function arrow(w: World, p: Player, from: [number, number], at: [number, number], so: Partial<Projectile> = {}): Projectile {
  const spec = arrowSpec(p, Math.atan2(at[1] - from[1], at[0] - from[0]));
  const pr = spawnProjectile(w, { ...spec, x: from[0], y: from[1], skips: so.skips ?? 0 });
  Object.assign(pr, so);
  return pr;
}
const lost = (e: Enemy, of = 1000): number => of - e.hp;

describe('Pinball', () => {
  it('Skipping Stone: more ricochets, and quicker off every wall', () => {
    for (const rank of [0, 1, 2, 3]) {
      const { p } = held(rank ? { 'skipping-stone': rank } : {});
      const spec = arrowSpec(p, 0);
      expect(spec.bounces).toBe(BOW.bounces + rank);
      expect(spec.quick).toBe(rank ? 1.08 : 1);
    }
    // into a corner, where the walls come quickly one after another
    const flight = (tunings: Record<string, number>): { bounces: number; speeds: number[] } => {
      const { w, p, pad } = held(tunings);
      place(p, 2.2, 2.2);
      pad.aimAt(p, 1, 1.7);
      run(w, 1, pad);
      pad.tap(PRESS.attack);
      const speeds: number[] = [];
      let bounces = 0;
      for (let t = 0; t < 150; t++) {
        const ev = run(w, 1, pad);
        for (const r of eventsOf(ev, 'ricochet')) {
          bounces = r.n;
          speeds.push(speedOf(w.projectiles[0] ?? ({ vx: 0, vy: 0 } as Projectile)));
        }
        if (eventsOf(ev, 'projectileEnd').length > 0) break;
      }
      return { bounces, speeds };
    };
    const plain = flight({});
    expect(plain.bounces).toBe(BOW.bounces);
    expect(plain.speeds[0]).toBeCloseTo(BOW.speed);
    const more = flight({ 'skipping-stone': 1 });
    expect(more.bounces).toBe(BOW.bounces + 1);
    expect(more.speeds[0]).toBeCloseTo(BOW.speed * 1.08);
    expect(more.speeds[1]).toBeCloseTo(BOW.speed * 1.08 * 1.08);
  });

  it('Crescendo: an arrow that has bounced twice bursts where it lands', () => {
    const lands = (tunings: Record<string, number>, bounced: number): { target: Enemy; beside: Enemy; ev: SimEvent[] } => {
      const { w, p, pad } = held(tunings);
      const target = dummy(w, 10.5, 6.5, 1000);
      const beside = dummy(w, 10.5, 7.5, 1000);
      arrow(w, p, [8.5, 6.5], [10.5, 6.5], { bounced });
      return { target, beside, ev: run(w, 20, pad) };
    };
    const plain = lands({}, 2);
    expect(lost(plain.beside)).toBe(0);
    expect(lost(plain.target)).toBeCloseTo(BOW.damage * (1 + BOW.bounceBonus * 2));
    for (const [rank, burst] of [
      [1, 6],
      [2, 9],
      [3, 12],
    ]) {
      const r = lands({ crescendo: rank }, 2);
      expect(lost(r.beside)).toBeCloseTo(burst);
      expect(lost(r.target)).toBeCloseTo(BOW.damage * (1 + BOW.bounceBonus * 2) + burst);
      expect(eventsOf(r.ev, 'burst')[0]).toMatchObject({ what: 'crescendo', radius: STRING.crescendoRadius });
    }
    // not before its second bounce
    expect(lost(lands({ crescendo: 3 }, 1).beside)).toBe(0);
  });

  it('Seeking Echo: once it has bounced, an arrow comes round to the nearest Echo', () => {
    const finds = (tunings: Record<string, number>, bounced: number): boolean => {
      const { w, p, pad } = held(tunings);
      // it will pass two tiles to one side of the Echo
      const e = dummy(w, 9.5, 8.6, 1000);
      // with no bounce left in it, so that what is seen is this flight and not the one back off the far wall
      arrow(w, p, [3, 6.5], [14, 6.5], { bounced, bounces: 0 });
      run(w, 60, pad);
      return e.hp < 1000;
    };
    expect(finds({}, 1)).toBe(false);
    expect(finds({ 'seeking-echo': 1 }, 0)).toBe(false);
    expect(finds({ 'seeking-echo': 3 }, 1)).toBe(true);
    for (const [rank, rate] of [
      [1, 1.5],
      [2, 2.5],
      [3, 3.5],
    ]) {
      expect(arrowSpec(held({ 'seeking-echo': rank }).p, 0).seek).toBe(rate);
    }
  });

  it('Trick Shot (Skipping Stone and Seeking Echo): from its third bounce an arrow always crits', () => {
    const blow = (tunings: Record<string, number>, bounced: number): { amount: number; crit: boolean } => {
      const { w, p, pad } = held(tunings);
      const e = dummy(w, 10.5, 6.5, 1000);
      arrow(w, p, [9, 6.5], [10.5, 6.5], { bounced, seek: 0 });
      const hit = eventsOf(run(w, 20, pad), 'hit')[0];
      return { amount: lost(e), crit: hit.crit };
    };
    const both = { 'skipping-stone': 1, 'seeking-echo': 1 };
    const plain = blow({ 'skipping-stone': 1 }, 3);
    expect(plain.crit).toBe(false);
    const trick = blow(both, 3);
    expect(trick.crit).toBe(true);
    expect(trick.amount).toBeCloseTo(plain.amount * STRING.trickMul);
    // the second bounce is not yet the third
    expect(blow(both, 2).crit).toBe(false);
  });
});

describe('Chain', () => {
  it('Glance: more skips, from further off', () => {
    for (const rank of [0, 1, 2, 3]) expect(arrowSpec(held(rank ? { glance: rank } : {}).p, 0).skips).toBe(BOW.skips + rank);
    // three Echoes in a row: an arrow strikes one more of them for each skip it has
    const row = (tunings: Record<string, number>, gap: number): number => {
      const { w, p, pad } = held(tunings);
      const es = [0, 1, 2].map((i) => dummy(w, 8.5 + i * gap, 6.5 + (i % 2) * 0.01, 1000));
      pad.aimAt(p, es[0].x, es[0].y);
      run(w, 60, pad.tap(PRESS.attack));
      return es.filter((e) => e.hp < 1000).length;
    };
    expect(row({}, 2)).toBe(2);
    expect(row({ glance: 1 }, 2)).toBe(3);
    // too far apart to skip between without it: the reach is a tile longer
    const reach = (tunings: Record<string, number>): number => {
      const { w, p, pad } = held(tunings);
      const a = dummy(w, 8.5, 6.5, 1000);
      const b = dummy(w, 8.5 + BOW.skipRange + 0.7, 6.5, 1000);
      // aim so that the arrow stops in the first rather than flying on into the second
      pad.aimAt(p, a.x, a.y);
      const ev = run(w, 60, pad.tap(PRESS.attack));
      void b;
      return eventsOf(ev, 'skip').length;
    };
    expect(reach({})).toBe(0);
    expect(reach({ glance: 1 })).toBe(1);
  });

  /** An arrow kills a weak Echo with others standing round it. */
  const kills = (tunings: Record<string, number>, so: Partial<Projectile> = {}): { w: World; others: Enemy[]; pieces: Projectile[]; ev: SimEvent[]; pad: Pad } => {
    const { w, p, pad } = held(tunings);
    const weak = dummy(w, 9.5, 6.5, 1);
    const others = [dummy(w, 11.5, 5), dummy(w, 11.5, 8), dummy(w, 12.5, 6.5), dummy(w, 9.5, 10)];
    for (const o of others) o.hp = o.maxHp = 1000;
    const shot = arrow(w, p, [8, 6.5], [9.5, 6.5], so);
    const ev: SimEvent[] = [];
    for (let t = 0; t < 10 && !weak.dead; t++) ev.push(...run(w, 1, pad));
    return { w, others, pieces: w.projectiles.filter((pr) => pr !== shot && pr.kind === 'arrow'), ev, pad };
  };

  it('Splinter: an arrow that kills breaks into pieces that fly at the others', () => {
    expect(kills({}).pieces).toHaveLength(0);
    for (const [rank, count] of [
      [1, 2],
      [2, 3],
      [3, 4],
    ]) {
      const r = kills({ splinter: rank });
      expect(r.pieces).toHaveLength(count);
      for (const pc of r.pieces) {
        expect(pc.damage).toBeCloseTo(BOW.damage * STRING.splinterShare);
        expect(pc.shard).toBe(true);
        expect([pc.skips, pc.bounces]).toEqual([0, 0]);
      }
      run(r.w, 40, r.pad);
      // the nearest of them are the ones struck, each for its share
      expect(r.others.filter((o) => o.hp < 1000)).toHaveLength(count);
      for (const o of r.others.filter((x) => x.hp < 1000)) expect(lost(o)).toBeCloseTo(BOW.damage * STRING.splinterShare);
    }
    // a piece that kills does not break again
    const { w, p, pad } = held({ splinter: 3 });
    const a = dummy(w, 9.5, 6.5, 1);
    const b = dummy(w, 11, 6.5, 1);
    const c = dummy(w, 12.5, 6.5, 1000);
    arrow(w, p, [8, 6.5], [9.5, 6.5]);
    w.events.length = 0;
    const ev = run(w, 60, pad);
    expect([a.dead, b.dead]).toEqual([true, true]);
    // two pieces from the first kill (at the two that were left); the piece that killed the second made none
    expect(eventsOf(ev, 'projectileSpawn').filter((s) => s.kind === 'arrow')).toHaveLength(2);
    expect(lost(c)).toBeCloseTo(BOW.damage * STRING.splinterShare);
  });

  it('Chain Reaction (Glance and Splinter): the pieces keep the skips and bounces the arrow had left', () => {
    const plain = kills({ splinter: 1 }, { skips: 2, bounces: 2 });
    expect(plain.pieces.map((pc) => [pc.skips, pc.bounces])).toEqual([
      [0, 0],
      [0, 0],
    ]);
    const chain = kills({ splinter: 1, glance: 1 }, { skips: 2, bounces: 2 });
    expect(chain.pieces).toHaveLength(2);
    // the kill ended the arrow before it could skip: both skips are still in hand
    expect(chain.pieces.map((pc) => [pc.skips, pc.bounces])).toEqual([
      [2, 2],
      [2, 2],
    ]);
  });

  it('Pinning Note: an arrow that has skipped roots what it strikes, once in a while', () => {
    const strikes = (tunings: Record<string, number>, skipped: number): Enemy => {
      const { w, p, pad } = held(tunings);
      const e = dummy(w, 10.5, 6.5, 1000);
      arrow(w, p, [9, 6.5], [10.5, 6.5], { skipped });
      run(w, 10, pad);
      return e;
    };
    expect(strikes({}, 1).status.rootT).toBe(0);
    expect(strikes({ 'pinning-note': 1 }, 0).status.rootT).toBe(0);
    for (const [rank, seconds] of [
      [1, 0.5],
      [2, 0.8],
      [3, 1.1],
    ]) {
      const e = strikes({ 'pinning-note': rank }, 1);
      expect(e.status.rootT).toBeGreaterThan(seconds - 0.2);
      expect(e.status.rootT).toBeLessThanOrEqual(seconds);
    }
    // the same Echo is not held again straight away
    const { w, p, pad } = held({ 'pinning-note': 1 });
    const e = dummy(w, 10.5, 6.5, 1000);
    arrow(w, p, [9, 6.5], [10.5, 6.5], { skipped: 1 });
    run(w, 45, pad);
    expect(e.status.rootT).toBe(0);
    arrow(w, p, [9, 6.5], [10.5, 6.5], { skipped: 1 });
    run(w, 10, pad);
    expect(e.status.rootT).toBe(0);
  });
});

describe('the Line', () => {
  /** Fire the line at a point and play on until the Bow has landed (or `most` ticks have gone); returns what happened. */
  const hook = (w: World, p: Player, pad: Pad, x: number, y: number, most = 60): SimEvent[] => {
    pad.aimAt(p, x, y).tap(PRESS.special);
    const ev: SimEvent[] = [];
    for (let t = 0; t < most; t++) {
      ev.push(...run(w, 1, pad));
      if (t > 1 && p.state !== 'special') break;
    }
    return ev;
  };

  it('Long Line: the line reaches further, and is ready sooner', () => {
    for (const [rank, further, sooner] of [
      [0, 0, 0],
      [1, 2, 0.1],
      [2, 3, 0.2],
      [3, 4, 0.3],
    ]) {
      const { w, p, pad } = held(rank ? { 'long-line': rank } : {});
      // from one end of the room, at a point far beyond the other
      place(p, 1.6, 6.5);
      const ev = hook(w, p, pad, 40, 6.5);
      expect(eventsOf(ev, 'hookLand')).toHaveLength(1);
      expect(p.x).toBeCloseTo(1.6 + HOOK.range + further, 6);
      expect(p.specialCd).toBeLessThanOrEqual(HOOK.cooldown * (1 - sooner));
      expect(p.specialCd).toBeGreaterThan(HOOK.cooldown * (1 - sooner) - 1);
    }
  });

  it('Barbed Line: what the line passes takes more, and is thrown harder', () => {
    const passed = (tunings: Record<string, number>): { hurt: number; speed: number } => {
      const { w, p, pad } = held(tunings);
      const e = dummy(w, 9, 6.5 + 0.3, 1000);
      const ev = hook(w, p, pad, 12.5, 6.5);
      return { hurt: lost(e), speed: eventsOf(ev, 'launch').find((l) => l.id === e.id)?.speed ?? 0 };
    };
    const plain = passed({});
    expect(plain.hurt).toBe(HOOK.damage);
    expect(plain.speed).toBeCloseTo(HOOK.impulse);
    for (const [rank, damage, harder] of [
      [1, 14, 1.3],
      [2, 20, 1.6],
      [3, 26, 1.9],
    ]) {
      const r = passed({ 'barbed-line': rank });
      expect(r.hurt).toBe(damage);
      expect(r.speed).toBeCloseTo(HOOK.impulse * harder);
    }
  });

  it('Full Quiver: more arrows leave at once after the line, and each of them has a ricochet more', () => {
    for (const [rank, arrows] of [
      [0, 3],
      [1, 4],
      [3, 6],
    ]) {
      const { w, p, pad } = held(rank ? { 'full-quiver': rank } : {});
      hook(w, p, pad, 10.5, 6.5);
      expect(p.quiver).toBe(arrows);
      // hold the string: the ones that were ready go one on the heels of another, the next after a rest
      pad.aimAt(p, 2, 6.5).hold(BTN.attack, true);
      const at: number[] = [];
      const bounces: number[] = [];
      for (let t = 0; t < 120 && at.length < arrows + 1; t++) {
        const before = w.projectiles.length;
        if (eventsOf(run(w, 1, pad), 'loose').length === 0) continue;
        at.push(t);
        bounces.push(w.projectiles[before].bounces);
      }
      const quick = Math.ceil(HOOK.quick * SIM_HZ);
      for (let i = 1; i < arrows; i++) expect(at[i] - at[i - 1], `rank ${rank}, arrow ${i}`).toBeLessThanOrEqual(quick);
      expect(at[arrows] - at[arrows - 1]).toBeGreaterThanOrEqual(Math.round(BOW.interval * SIM_HZ) - 1);
      expect(bounces.slice(0, arrows)).toEqual(Array.from({ length: arrows }, () => BOW.bounces + (rank ? 1 : 0)));
      expect(bounces[arrows]).toBe(BOW.bounces);
    }
  });

  it('Slingshot (Long Line and Barbed Line): for a moment after landing the line can be fired once more for nothing', () => {
    const { w, p, pad } = held({ 'long-line': 1, 'barbed-line': 1 });
    expect(p.mods.slingshot).toBe(1);
    hook(w, p, pad, 10.5, 6.5);
    expect(p.hookFree).toBeCloseTo(HOOK.again, 1);
    const wait = p.specialCd;
    expect(wait).toBeGreaterThan(1);
    // again, though the wait has hardly begun: it goes, and the wait is neither spent again nor forgiven
    const second = hook(w, p, pad, 10.5, 10.5);
    expect(eventsOf(second, 'hook')).toHaveLength(1);
    expect(eventsOf(second, 'refused')).toHaveLength(0);
    expect(p.y).toBeCloseTo(10.5, 6);
    expect(p.specialCd).toBeLessThan(wait);
    expect(p.specialCd).toBeGreaterThan(wait - 1);
    // the one that was for nothing gives no other
    expect(p.hookFree).toBe(0);
    const third = hook(w, p, pad, 6.5, 10.5, 5);
    expect(eventsOf(third, 'hook')).toHaveLength(0);
    expect(eventsOf(third, 'refused')).toHaveLength(1);

    // left too long, the moment is gone
    const late = held({ 'long-line': 1, 'barbed-line': 1 });
    hook(late.w, late.p, late.pad, 10.5, 6.5);
    run(late.w, Math.round(HOOK.again * SIM_HZ) + 3, late.pad);
    expect(eventsOf(hook(late.w, late.p, late.pad, 10.5, 10.5, 5), 'refused')).toHaveLength(1);

    // and without the Harmony there is no second line at all
    const plain = held({ 'long-line': 1 });
    hook(plain.w, plain.p, plain.pad, 10.5, 6.5);
    expect(plain.p.hookFree).toBe(0);
    expect(eventsOf(hook(plain.w, plain.p, plain.pad, 10.5, 10.5, 5), 'refused')).toHaveLength(1);
  });
});

describe('belonging to no build', () => {
  it('Heavy Fourth: every fourth arrow of a held volley is a heavy one', () => {
    const volley = (tunings: Record<string, number>): Array<[number, number, number]> => {
      const { w, pad } = held(tunings);
      pad.aimAt(w.players[0], 14, 6.5);
      const seen = new Set<number>();
      const out: Array<[number, number, number]> = [];
      pad.tap(PRESS.attack).hold(BTN.attack);
      for (let t = 0; t < 200 && out.length < 8; t++) {
        run(w, 1, pad);
        for (const pr of w.projectiles) {
          if (seen.has(pr.id)) continue;
          seen.add(pr.id);
          out.push([pr.damage, pr.pierce, pr.bounces]);
        }
      }
      return out;
    };
    const plain = volley({});
    // the run of three as ever: every third arrow of it hits harder
    expect(plain.map((a) => a[0])).toEqual([8, 8, 8 * BOW.third, 8, 8, 8 * BOW.third, 8, 8]);
    expect(plain.every((a) => a[1] === 0 && a[2] === BOW.bounces)).toBe(true);
    for (const [rank, mul] of [
      [1, 2],
      [2, 2.5],
      [3, 3],
    ]) {
      const heavy = volley({ 'heavy-fourth': rank });
      expect(heavy.map((a) => a[0])).toEqual([8, 8, 8 * BOW.third, 8 * mul, 8, 8 * BOW.third, 8, 8 * mul]);
      expect(heavy[3].slice(1)).toEqual([rank, BOW.bounces + STRING.heavyBounces]);
      expect(heavy[7].slice(1)).toEqual([rank, BOW.bounces + STRING.heavyBounces]);
      expect(heavy[0].slice(1)).toEqual([0, BOW.bounces]);
    }
    // the count starts again when the string has rested
    const { w, pad } = held({ 'heavy-fourth': 1 });
    pad.aimAt(w.players[0], 14, 6.5);
    const damages: number[] = [];
    for (let i = 0; i < 5; i++) {
      const before = new Set(w.projectiles.map((pr) => pr.id));
      run(w, 2, pad.tap(PRESS.attack));
      damages.push(...w.projectiles.filter((pr) => !before.has(pr.id)).map((pr) => pr.damage));
      run(w, 80, pad);
    }
    expect(damages).toEqual([8, 8, 8, 8, 8]);
  });
});

describe('the Bow’s Tunings as a set', () => {
  it('ten of them in three builds and a wildcard, one locked, and three Harmonies between them', () => {
    const own = Object.values(CONTENT.tunings).filter((t) => t.owner === 'bow');
    expect(own).toHaveLength(10);
    const builds = new Map<string, number>();
    for (const t of own) builds.set(t.build, (builds.get(t.build) ?? 0) + 1);
    expect([...builds.entries()].sort()).toEqual([
      ['Chain', 3],
      ['Line', 3],
      ['Pinball', 3],
      ['Wildcard', 1],
    ]);
    expect(own.filter((t) => t.locked).map((t) => t.id)).toEqual(['full-quiver']);
    const ids = new Set(own.map((t) => t.id));
    expect(
      CONTENT.harmonies
        .filter((h) => h.parents.every((id) => ids.has(id)))
        .map((h) => h.id)
        .sort(),
    ).toEqual(['chain-reaction', 'slingshot', 'trick-shot']);
    for (const t of own) expect(t.text.length).toBe(t.maxRank);
    // no two of them wear the same emblem
    expect(new Set(own.map((t) => t.icon)).size).toBe(own.length);
  });
});
