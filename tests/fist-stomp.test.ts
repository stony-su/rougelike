// The Fist's stomp: nothing hurts it through the slam, and an attack right after it sends the
// Fist flying to one of the Echoes it struck, to land three blows there without another press.
import { describe, expect, it } from 'vitest';
import { HURT_NONE, HURT_TAKEN, damagePlayer } from '../src/sim/combat';
import { BREAK, SIM_HZ } from '../src/sim/tuning';
import { PRESS, Pad, dummy, eventsOf, openWorld, run } from './helpers';

describe('the stomp', () => {
  it('nothing hurts the Fist while it slams, or for a moment after', () => {
    const w = openWorld(['fist']);
    const p = w.players[0];
    const pad = new Pad();
    run(w, 2, pad);
    pad.tap(PRESS.special);
    run(w, 1, pad);
    expect(p.state).toBe('special');
    const safe = Math.round((BREAK.windup + BREAK.recovery + BREAK.safe) * SIM_HZ) - 3;
    for (let t = 0; t < safe; t++) {
      expect(damagePlayer(w, p, 10, p.x + 1, p.y, 0), `tick ${t}`).toBe(HURT_NONE);
      run(w, 1, pad);
    }
    expect(p.hp).toBe(p.maxHp);
    // and then it can be hurt again
    run(w, 8, pad);
    expect(damagePlayer(w, p, 10, p.x + 1, p.y, 0)).toBe(HURT_TAKEN);
    expect(p.hp).toBe(p.maxHp - 10);
  });

  it('an attack after it flies the Fist to an Echo it struck, and three blows land without another press', () => {
    const w = openWorld(['fist']);
    const p = w.players[0];
    const e = dummy(w, p.x + 1.8, p.y, 400);
    const pad = new Pad().aimAt(p, e.x, e.y);
    run(w, 2, pad);
    pad.tap(PRESS.special);
    const slam = run(w, Math.round(BREAK.windup * SIM_HZ) + 3, pad);
    expect(eventsOf(slam, 'breakSlam').length).toBe(1);
    expect(p.stomped).toEqual([e.id]);
    expect(p.stompT).toBeGreaterThan(BREAK.follow - 0.2);
    // the stomp threw it clear
    expect(e.state).toBe('launched');
    const before = e.hp;
    const charges = p.dashCharges;

    pad.aimAt(p, e.x, e.y).tap(PRESS.attack);
    const after = run(w, 75, pad);
    // one flight, which is a dash in every way but its cost
    expect(eventsOf(after, 'dash').length).toBe(1);
    expect(p.dashCharges).toBe(charges);
    // three blows of its own on that Echo: two that hold it, and a third that is a Return
    const blows = eventsOf(after, 'hit').filter((h) => h.target === e.id && h.by === 0 && (h.kind === 'direct' || h.kind === 'return'));
    expect(blows.map((h) => h.kind)).toEqual(['direct', 'direct', 'return']);
    expect(eventsOf(after, 'jab').length).toBe(3);
    expect(before - e.hp).toBeGreaterThanOrEqual(BREAK.flurry[0] + BREAK.flurry[1] + BREAK.flurry[2]);
    expect(eventsOf(after, 'rally').length).toBeGreaterThanOrEqual(1);
    // the third threw it: it was in flight again after being held
    expect(eventsOf(after, 'launch').some((l) => l.id === e.id)).toBe(true);
    // and the run is over: the next press is an ordinary jab
    expect([p.flurry, p.chase]).toEqual([0, 0]);
  });

  it('the Fist cannot be hurt on the way there', () => {
    const w = openWorld(['fist']);
    const p = w.players[0];
    const e = dummy(w, p.x + 2, p.y, 400);
    const pad = new Pad().aimAt(p, e.x, e.y);
    run(w, 2, pad);
    pad.tap(PRESS.special);
    run(w, Math.round((BREAK.windup + BREAK.recovery + BREAK.safe) * SIM_HZ) + 6, pad);
    // the slam's own safety has run out by now
    expect(p.iframes).toBe(0);
    pad.aimAt(p, e.x, e.y).tap(PRESS.attack);
    run(w, 2, pad);
    expect(p.state).toBe('dash');
    expect(damagePlayer(w, p, 10, p.x + 1, p.y, 0)).toBe(HURT_NONE);
  });

  it('with nothing struck, or too late, an attack is an ordinary jab', () => {
    const none = openWorld(['fist']);
    const padA = new Pad();
    run(none, 2, padA);
    padA.tap(PRESS.special);
    run(none, Math.round((BREAK.windup + BREAK.recovery) * SIM_HZ) + 3, padA);
    expect(none.players[0].stompT).toBe(0);
    padA.tap(PRESS.attack);
    const a = run(none, 20, padA);
    expect(eventsOf(a, 'dash').length).toBe(0);
    expect(eventsOf(a, 'jab').length).toBe(1);

    const late = openWorld(['fist']);
    const p = late.players[0];
    const e = dummy(late, p.x + 1.8, p.y, 400);
    const padB = new Pad().aimAt(p, e.x, e.y);
    run(late, 2, padB);
    padB.tap(PRESS.special);
    run(late, Math.round((BREAK.windup + BREAK.follow) * SIM_HZ) + 12, padB);
    expect(p.stompT).toBe(0);
    padB.tap(PRESS.attack);
    const b = run(late, 20, padB);
    expect(eventsOf(b, 'dash').length).toBe(0);
  });

  it('goes after the Echo nearest the aim, of those it struck', () => {
    const w = openWorld(['fist']);
    const p = w.players[0];
    const east = dummy(w, p.x + 1.8, p.y, 400);
    const north = dummy(w, p.x, p.y - 1.8, 400);
    const pad = new Pad();
    run(w, 2, pad);
    pad.tap(PRESS.special);
    run(w, Math.round(BREAK.windup * SIM_HZ) + 3, pad);
    expect(p.stomped.slice().sort()).toEqual([east.id, north.id].sort());
    pad.aimAt(p, north.x, north.y).tap(PRESS.attack);
    run(w, 2, pad);
    expect(p.chase).toBe(north.id);
  });
});
