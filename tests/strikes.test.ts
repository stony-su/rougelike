// Strikes: warnings that land by themselves. What is drawn is what lands, when the drawing says.
import { describe, expect, it } from 'vitest';
import { THRUM } from '../src/content/enemies/thrum';
import { damageEnemy } from '../src/sim/combat';
import { strikeCircle, strikeCone, strikeLane } from '../src/sim/strikes';
import { telegraphCovers } from '../src/sim/telegraphs';
import { SIM_HZ } from '../src/sim/tuning';
import { Pad, dummy, eventsOf, openWorld, place, run } from './helpers';

describe('a strike', () => {
  it('lands when its warning runs out, on whoever it covers, and not a tick sooner', () => {
    const w = openWorld(2);
    const [inside, outside] = w.players;
    place(inside, 6, 6);
    place(outside, 11, 6);
    strikeCircle(w, 6.5, 6, 2, { warn: 0.5, damage: 12, knock: 4 });
    const early = run(w, Math.round(0.5 * SIM_HZ) - 2, new Pad(), new Pad());
    expect(eventsOf(early, 'playerHurt').length).toBe(0);
    const late = run(w, 4, new Pad(), new Pad());
    expect(eventsOf(late, 'strike').length).toBe(1);
    expect(eventsOf(late, 'playerHurt').map((h) => [h.player, h.amount])).toEqual([[inside.slot, 12]]);
    // shoved away from its middle
    expect(inside.kx).toBeLessThan(0);
    // and only once
    expect(eventsOf(run(w, 30, new Pad(), new Pad()), 'playerHurt').length).toBe(0);
  });

  it('as a ring, spares whoever stands in its middle', () => {
    const w = openWorld(3);
    const [middle, band, beyond] = w.players;
    place(middle, 8, 6);
    place(band, 8 + 4, 6);
    place(beyond, 8, 6 + 5.5);
    const ring = strikeCircle(w, 8, 6, 5, { warn: 0.3, damage: 9 }, 3);
    expect(telegraphCovers(ring, middle.x, middle.y, middle.radius)).toBe(false);
    expect(telegraphCovers(ring, band.x, band.y, band.radius)).toBe(true);
    const events = run(w, 30, new Pad(), new Pad(), new Pad());
    expect(eventsOf(events, 'playerHurt').map((h) => h.player)).toEqual([band.slot]);
    expect(eventsOf(events, 'strike')[0].inner).toBe(3);
  });

  it('as a lane and as a cone, covers its own shape', () => {
    const w = openWorld(2);
    const [a, b] = w.players;
    place(a, 9, 6);
    place(b, 6, 9);
    strikeLane(w, 4, 6, 0, 8, 1.2, { warn: 0.2, damage: 7 });
    strikeCone(w, 6, 6, Math.PI / 2, 4, 0.5, { warn: 0.4, damage: 5 });
    const events = run(w, 40, new Pad(), new Pad());
    expect(
      eventsOf(events, 'playerHurt')
        .map((h) => `${h.player}:${h.amount}`)
        .sort(),
    ).toEqual([`${a.slot}:7`, `${b.slot}:5`]);
  });

  it('a dash carries a player through one', () => {
    const w = openWorld(1);
    const p = w.players[0];
    place(p, 6, 6);
    strikeCircle(w, 6, 6, 1.5, { warn: 0.3, damage: 12 });
    p.iframes = 1;
    expect(eventsOf(run(w, 30, new Pad()), 'playerHurt').length).toBe(0);
  });

  it('is cancelled when the Echo it belongs to dies first', () => {
    const w = openWorld(1);
    const p = w.players[0];
    place(p, 6, 6);
    const e = dummy(w, 12, 3, 0, THRUM);
    strikeCircle(w, 6, 6, 2, { warn: 0.5, damage: 12, owner: e.id });
    run(w, 10, new Pad());
    damageEnemy(w, e, 9999, { kind: 'other', by: 0, dx: 1, dy: 0 });
    const events = run(w, 60, new Pad());
    expect(eventsOf(events, 'strike').length).toBe(0);
    expect(p.hp).toBe(p.maxHp);
  });
});
