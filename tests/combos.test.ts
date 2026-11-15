// Every class's basic attack is a run of three. The Sword's and the Fist's are tested with
// their kits (classes.test.ts); this is the Bow's, which counts its arrows.
import { describe, expect, it } from 'vitest';
import { BOW, SIM_HZ } from '../src/sim/tuning';
import { BTN, PRESS, Pad, eventsOf, openWorld, run } from './helpers';

describe("the Bow's run of three", () => {
  it('counts one, two, three while the arrows keep coming, and the third hits harder', () => {
    const w = openWorld(['bow']);
    const pad = new Pad();
    run(w, 2, pad);
    pad.tap(PRESS.attack).hold(BTN.attack, true);
    const counts: number[] = [];
    const damage: number[] = [];
    for (let t = 0; t < Math.round(BOW.interval * 6.5 * SIM_HZ); t++) {
      const before = w.projectiles.length;
      const events = run(w, 1, pad);
      for (const e of eventsOf(events, 'loose')) counts.push(e.n);
      if (w.projectiles.length > before) damage.push(w.projectiles[w.projectiles.length - 1].damage);
    }
    expect(counts.slice(0, 6)).toEqual([0, 1, 2, 0, 1, 2]);
    expect(damage.slice(0, 3)).toEqual([BOW.damage, BOW.damage, BOW.damage * BOW.third]);
    expect(BOW.third).toBeGreaterThan(1);
  });

  it('starts again after a pause', () => {
    const w = openWorld(['bow']);
    const pad = new Pad();
    run(w, 2, pad);
    pad.tap(PRESS.attack);
    const first = run(w, Math.round((BOW.interval + 0.05) * SIM_HZ), pad);
    pad.tap(PRESS.attack);
    const second = run(w, 5, pad);
    // a breath longer than the run allows
    run(w, Math.round((BOW.comboWindow + 0.2) * SIM_HZ), pad);
    pad.tap(PRESS.attack);
    const third = run(w, 5, pad);
    expect([...eventsOf(first, 'loose'), ...eventsOf(second, 'loose'), ...eventsOf(third, 'loose')].map((e) => e.n)).toEqual([0, 1, 0]);
  });
});
