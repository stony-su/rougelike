// What players do for each other: helping a fallen teammate up, and Duets, the bounces two
// players make between them.
import { describe, expect, it } from 'vitest';
import { pushBody } from '../src/sim/bodies';
import { damagePlayer } from '../src/sim/combat';
import { spawnProjectile, arrowSpec } from '../src/sim/projectiles';
import { BOW, DT, DUET, PLAYER, RALLY, REVIVE, SWORD } from '../src/sim/tuning';
import { PRESS, Pad, dummy, eventsOf, openWorld, place, run } from './helpers';

describe('a fallen teammate', () => {
  it('crawls, cannot fight, and is helped up by an ally who stands close for two seconds', () => {
    const w = openWorld(['sword', 'bow']);
    const [a, b] = w.players;
    place(a, 4, 6.5);
    place(b, 10, 6.5);
    damagePlayer(w, a, 999, a.x - 1, a.y, 0);
    expect(a.state).toBe('down');
    // crawling toward help, a quarter as fast as a run, and a press does nothing
    const padA = new Pad().move(1, 0);
    const padB = new Pad();
    run(w, 10, padA, padB);
    const x0 = a.x;
    run(w, 60, padA.tap(PRESS.attack), padB);
    expect(a.state).toBe('down');
    expect(a.x - x0).toBeCloseTo(PLAYER.speed * REVIVE.crawl, 0);
    expect(a.reviveT).toBe(0);
    // the ally comes over and stands by
    place(b, a.x + 1, a.y);
    padA.stop();
    const before = run(w, Math.round(REVIVE.time / DT) - 5, padA, padB);
    expect(eventsOf(before, 'revive')).toHaveLength(0);
    expect(a.reviveT).toBeGreaterThan(REVIVE.time * 0.9);
    const ev = run(w, 10, padA, padB);
    expect(eventsOf(ev, 'revive')[0]).toMatchObject({ player: a.slot, by: b.slot });
    expect(a.state).toBe('idle');
    expect(a.hp).toBe(Math.round(a.maxHp * REVIVE.hp));
    expect(a.iframes).toBeGreaterThan(0.5);
  });

  it('loses the progress if the ally walks away, and nobody gets up alone', () => {
    const w = openWorld(['sword', 'bow']);
    const [a, b] = w.players;
    place(a, 4, 6.5);
    place(b, 5, 6.5);
    damagePlayer(w, a, 999, a.x - 1, a.y, 0);
    const pads = [new Pad(), new Pad()];
    run(w, 70, ...pads);
    const had = a.reviveT;
    expect(had).toBeGreaterThan(0.8);
    place(b, 12, 6.5);
    run(w, 60, ...pads);
    expect(a.reviveT).toBeLessThan(had);
    run(w, 300, ...pads);
    expect(a.reviveT).toBe(0);
    expect(a.state).toBe('down');
  });
});

describe('Duets', () => {
  it("bank off the blade: an arrow through a teammate's swing goes where the blade points, harder, and counts for both", () => {
    const w = openWorld(['sword', 'bow']);
    const [sword, bow] = w.players;
    place(sword, 6.5, 6.5);
    place(bow, 6.5, 12);
    const target = dummy(w, 12.5, 6.5, 1000);
    // the swordsman aims along +x; the arrow comes up from below, across the swing
    const padS = new Pad().aimAt(sword, 12.5, 6.5);
    const padB = new Pad();
    run(w, 1, padS, padB);
    padS.tap(PRESS.attack);
    run(w, 5, padS, padB);
    const arrow = spawnProjectile(w, { ...arrowSpec(bow, 0), x: 7.6, y: 8.4, vx: 0, vy: -BOW.speed });
    const ev: ReturnType<typeof run> = [];
    for (let t = 0; t < 40; t++) {
      const now = run(w, 1, padS, padB);
      ev.push(...now);
      // the moment it is banked, stand the target squarely in its new path
      if (eventsOf(now, 'duet').length) {
        expect(arrow.vy).toBeCloseTo(0, 9);
        expect(arrow.vx).toBeCloseTo(BOW.speed, 9);
        place(target, arrow.x + 4, arrow.y);
      }
    }
    expect(eventsOf(ev, 'duet')[0]).toMatchObject({ kind: 'bank', a: sword.slot, b: bow.slot });
    expect(arrow.assist).toBe(sword.slot);
    const hit = eventsOf(ev, 'hit').find((h) => h.target === target.id);
    expect(hit).toMatchObject({ kind: 'return', by: bow.slot });
    // its first pass (it goes on through, and may come back off the wall)
    expect(hit?.amount).toBe(Math.round(BOW.damage * DUET.bankDamage));
    // a Return for the archer and for the blade, every time it lands
    expect(bow.rally).toBeGreaterThanOrEqual(RALLY.weight.arrow);
    expect(sword.rally).toBe(bow.rally);
  });

  it("alley-oop: a body in flight struck by a teammate's sword flies on faster, is hurt more, and what it hits counts for both", () => {
    const w = openWorld(['sword', 'fist']);
    const [sword, fist] = w.players;
    place(sword, 6.5, 6.5);
    place(fist, 3, 12);
    const e = dummy(w, 7.8, 5.6, 1000);
    const padS = new Pad().aimAt(sword, 12, 6.5);
    const padF = new Pad();
    run(w, 1, padS, padF);
    padS.tap(PRESS.attack);
    run(w, 3, padS, padF);
    // the Fist's punch, as it were: the body flies across in front of the swordsman
    pushBody(w, e, 0, 1, 20, fist.slot);
    const before = Math.hypot(e.lvx, e.lvy);
    let seen = false;
    let slams = 0;
    for (let t = 0; t < 60; t++) {
      const ev = run(w, 1, padS, padF);
      const duet = eventsOf(ev, 'duet')[0];
      if (duet && !seen) {
        seen = true;
        expect(duet).toMatchObject({ kind: 'alleyoop', a: fist.slot, b: sword.slot });
        expect(eventsOf(ev, 'hit')[0]).toMatchObject({ kind: 'return', by: sword.slot });
        expect(1000 - e.hp).toBeCloseTo(SWORD.damage[0] * DUET.oopDamage, 6);
        expect(e.launchBy).toBe(sword.slot);
        expect(e.assistBy).toBe(fist.slot);
        expect(Math.hypot(e.lvx, e.lvy)).toBeGreaterThan(before);
        expect(e.lvy).toBeCloseTo(0, 9);
      }
      slams += eventsOf(ev, 'hit').filter((h) => h.kind === 'slam').length;
    }
    expect(seen).toBe(true);
    expect(slams).toBeGreaterThan(0);
    // the swing and the slam for the swordsman; the Duet and the slam for the one who launched it
    expect(sword.rally).toBe(2 * RALLY.weight.sent);
    expect(fist.rally).toBe(2 * RALLY.weight.sent);
  });

  it('carom shot: an arrow that catches a body in flight shoves it on, glances off, and keeps flying', () => {
    const w = openWorld(['bow', 'fist']);
    const [bow, fist] = w.players;
    place(bow, 3, 6.5);
    place(fist, 3, 12);
    const e = dummy(w, 6, 6.5, 1000);
    pushBody(w, e, 1, 0, 16, fist.slot);
    const pad = new Pad().aimAt(bow, 12, 6.5);
    run(w, 1, pad, new Pad());
    const ev = run(w, 30, pad.tap(PRESS.attack), new Pad());
    expect(eventsOf(ev, 'duet')[0]).toMatchObject({ kind: 'alleyoop', a: fist.slot, b: bow.slot });
    const hit = eventsOf(ev, 'hit').find((h) => h.by === bow.slot);
    expect(hit).toMatchObject({ kind: 'return' });
    expect(hit?.amount).toBe(Math.round(BOW.damage * DUET.oopDamage));
    // the arrow did not stop on the body: it glanced off, a bounce to the good
    expect(eventsOf(ev, 'ricochet').length).toBeGreaterThan(0);
    expect(bow.rally).toBeGreaterThanOrEqual(RALLY.weight.arrow);
    expect(fist.rally).toBeGreaterThanOrEqual(RALLY.weight.arrow);
  });

  it('alone, striking your own launched body again is no Duet, but still a Return', () => {
    const w = openWorld(['sword']);
    const sword = w.players[0];
    const e = dummy(w, 7.8, 5.6, 1000);
    const pad = new Pad().aimAt(sword, 12, 6.5);
    run(w, 1, pad);
    pad.tap(PRESS.attack);
    run(w, 3, pad);
    pushBody(w, e, 0, 1, 12, sword.slot);
    const ev = run(w, 30, pad);
    expect(eventsOf(ev, 'duet')).toHaveLength(0);
    expect(eventsOf(ev, 'hit').some((h) => h.kind === 'return')).toBe(true);
    expect(e.assistBy).toBe(-1);
  });
});
