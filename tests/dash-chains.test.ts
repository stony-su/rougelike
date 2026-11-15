// A dash runs on into a blow. An attack asked for during a dash begins on the tick the dash
// ends, carries further and lands harder; and for the Fist a dash goes straight into the heavy
// punch, and the heavy punch into a jab, with nothing between them.
import { describe, expect, it } from 'vitest';
import { BOW, DASH, HAYMAKER, SWORD } from '../src/sim/tuning';
import type { ClassId, World } from '../src/sim/types';
import { BTN, PRESS, Pad, dummy, eventsOf, openWorld, run } from './helpers';

const CLASSES: ClassId[] = ['sword', 'bow', 'fist'];

/** Dash along +x with an attack asked for at the dash's very beginning; returns each tick's state from then on. */
function dashThenAttack(w: World, pad: Pad, ticks = 30): string[] {
  const p = w.players[0];
  pad.move(1, 0).aimAt(p, p.x + 5, p.y);
  run(w, 2, pad);
  pad.tap(PRESS.dash);
  run(w, 1, pad);
  expect(p.state).toBe('dash');
  // long before the dash is over: a press that only waited its own short while would be forgotten by then
  pad.tap(PRESS.attack);
  const states: string[] = [];
  for (let t = 0; t < ticks; t++) {
    run(w, 1, pad);
    states.push(p.state);
  }
  return states;
}

describe('out of a dash', () => {
  it.each(CLASSES)('the %s: an attack asked for in the dash begins on the tick the dash ends', (classId) => {
    const w = openWorld([classId]);
    const states = dashThenAttack(w, new Pad());
    const end = states.findIndex((s) => s !== 'dash');
    expect(end).toBeGreaterThan(5);
    // not a tick of standing between the two
    expect(states[end]).toBe('attack');
    expect(w.players[0].dashIn).toBe(true);
  });

  it('a cut out of a dash lands harder than the same cut from standing, and the next one is ordinary again', () => {
    const w = openWorld(['sword']);
    const p = w.players[0];
    // where the dash will end, a blade's length on
    const e = dummy(w, p.x + DASH.distance + 1.6, p.y, 500);
    const pad = new Pad();
    dashThenAttack(w, pad, 14);
    expect(500 - e.hp).toBeCloseTo(SWORD.damage[0] * DASH.strike);
    const hp = e.hp;
    pad.stop().aimAt(p, e.x, e.y);
    run(w, 40, pad);
    pad.tap(PRESS.attack);
    run(w, 14, pad);
    expect(p.dashIn).toBe(false);
    expect(hp - e.hp).toBeCloseTo(SWORD.damage[0]);
  });

  it('a cut out of a dash carries further', () => {
    const reach = (dashed: boolean): number => {
      const w = openWorld(['sword']);
      const p = w.players[0];
      const pad = new Pad().aimAt(p, p.x + 5, p.y);
      run(w, 2, pad);
      if (dashed) {
        pad.move(1, 0).tap(PRESS.dash);
        run(w, 1, pad);
        pad.stop().tap(PRESS.attack);
        while (p.state === 'dash') run(w, 1, pad);
      } else {
        pad.tap(PRESS.attack);
        run(w, 1, pad);
      }
      const from = p.x;
      expect(p.state).toBe('attack');
      run(w, 12, pad);
      return p.x - from;
    };
    expect(reach(true)).toBeGreaterThan(reach(false) * 1.6);
  });

  it('an arrow out of a dash is loosed at once, faster and harder', () => {
    const w = openWorld(['bow']);
    const p = w.players[0];
    const pad = new Pad().move(1, 0).aimAt(p, p.x + 5, p.y);
    run(w, 2, pad);
    // the string has just been used: left to itself it would rest a third of a second
    pad.tap(PRESS.attack);
    run(w, 2, pad);
    expect(p.fireT).toBeGreaterThan(0.2);
    w.projectiles.length = 0;
    pad.tap(PRESS.dash);
    run(w, 1, pad);
    pad.tap(PRESS.attack);
    while (p.state === 'dash') run(w, 1, pad);
    expect(w.projectiles.length).toBe(1);
    const arrow = w.projectiles[0];
    expect(Math.hypot(arrow.vx, arrow.vy)).toBeCloseTo(BOW.speed * DASH.strike);
    expect(arrow.damage).toBeCloseTo(BOW.damage * DASH.strike);
  });
});

describe('the Fist: dash, heavy, jab', () => {
  it('with the button held through a dash the hand is part drawn on landing, and letting go is a punch at once', () => {
    const w = openWorld(['fist']);
    const p = w.players[0];
    const pad = new Pad().move(1, 0).aimAt(p, p.x + 5, p.y);
    run(w, 2, pad);
    pad.tap(PRESS.dash).hold(BTN.attack, true);
    run(w, 1, pad);
    expect(p.state).toBe('dash');
    while (p.state === 'dash') run(w, 1, pad);
    // the tick the dash ended: already drawing back, with more than the least a punch needs
    expect(p.state).toBe('charge');
    expect(p.charge).toBeGreaterThanOrEqual(HAYMAKER.dashCharge);
    expect(p.charge).toBeGreaterThan(HAYMAKER.min);
    pad.hold(BTN.attack, false);
    const ev = run(w, 2, pad);
    expect(p.state).toBe('release');
    expect(eventsOf(ev, 'haymaker').length).toBe(1);
  });

  it('a jab asked for as the heavy punch lands follows it with nothing between', () => {
    const w = openWorld(['fist']);
    const p = w.players[0];
    dummy(w, p.x + DASH.distance + 1.6, p.y, 500);
    const pad = new Pad().move(1, 0).aimAt(p, p.x + 8, p.y);
    run(w, 2, pad);
    pad.tap(PRESS.dash).hold(BTN.attack, true);
    run(w, 1, pad);
    while (p.state === 'dash') run(w, 1, pad);
    pad.stop().hold(BTN.attack, false);
    run(w, 1, pad);
    expect(p.state).toBe('release');
    pad.tap(PRESS.attack);
    const states: string[] = [];
    const events = [];
    for (let t = 0; t < 30; t++) {
      events.push(...run(w, 1, pad));
      states.push(p.state);
    }
    const jab = states.indexOf('attack');
    expect(jab).toBeGreaterThan(0);
    // from the punch straight into the jab: never standing between them
    expect(states.slice(0, jab).every((s) => s === 'release')).toBe(true);
    // and sooner than the punch's own recovery would have ended
    expect(jab / 60).toBeLessThan(HAYMAKER.lungeTime + HAYMAKER.recovery);
    expect(eventsOf(events, 'jab').length).toBeGreaterThanOrEqual(1);
  });
});
