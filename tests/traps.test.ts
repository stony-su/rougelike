// Traps in the floor: each warns before it strikes, strikes what its warning covered, and hurts
// whatever is there, Echoes included.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { pushBody } from '../src/sim/bodies';
import { buildRoom, validateRoomTemplate } from '../src/sim/room';
import { generateRoom } from '../src/sim/roomgen';
import { planRoute, roomSpec, trapsFor } from '../src/sim/run';
import { SIM_HZ, TRAP } from '../src/sim/tuning';
import type { ClassId, SimEvent, World } from '../src/sim/types';
import { createWorld } from '../src/sim/world';
import { TRAP_ROOM } from './fixtures';
import { Pad, dummy, eventsOf, place, run } from './helpers';

/** The trap room with a party in it, in the middle of a fight whose waves never come. */
function world(classes: ClassId[] = ['sword']): World {
  const w = createWorld(buildRoom(TRAP_ROOM), 11, CONTENT, { entrants: classes.map((classId, slot) => ({ slot, classId })) });
  w.flow.waveTimer = 99999;
  w.players.forEach((p, i) => place(p, 8 + i, 11));
  return w;
}
const pads = (w: World): Pad[] => w.players.map(() => new Pad());
/** Keep every trap but one kind asleep, so a test sees only the one it is about. */
const only = (w: World, kind: string): void => {
  for (const t of w.traps) if (t.kind !== kind) t.t = 99999;
};
const SPIKES = { x: 5.5, y: 4.5 };
const KNELL = { x: 11.5, y: 4.5 };
const THORN = { x: 3.5, y: 9.5 };

describe('a room with traps', () => {
  it('reads them from its map: plates lie in the floor, knells and pipes stand on posts', () => {
    expect(validateRoomTemplate(TRAP_ROOM)).toEqual([]);
    const room = buildRoom(TRAP_ROOM);
    expect(room.traps).toEqual([
      { kind: 'spikes', ...SPIKES },
      { kind: 'knell', ...KNELL },
      { kind: 'thorn', ...THORN },
    ]);
    expect(room.geo.circles.length).toBe(2);
    const w = world();
    expect(w.traps.map((t) => t.kind)).toEqual(['spikes', 'knell', 'thorn']);
  });
});

describe('a plate of spikes', () => {
  it('rises a moment after someone steps on it: whoever is still there is hurt, whoever stepped off is not', () => {
    for (const stays of [true, false]) {
      const w = world();
      const p = w.players[0];
      place(p, SPIKES.x, SPIKES.y);
      const first = run(w, 3, ...pads(w));
      expect(eventsOf(first, 'trapWarn').map((e) => e.kind)).toEqual(['spikes']);
      expect(eventsOf(first, 'playerHurt').length).toBe(0);
      if (!stays) place(p, SPIKES.x + 2, SPIKES.y);
      const then = run(w, Math.round(TRAP.spikeWarn * SIM_HZ) + 3, ...pads(w));
      expect(eventsOf(then, 'trapStrike').length).toBe(1);
      expect(eventsOf(then, 'playerHurt').map((h) => h.amount)).toEqual(stays ? [TRAP.spikeDamage] : []);
    }
  });

  it('stays spent for a while, then is ready again', () => {
    const w = world();
    const p = w.players[0];
    place(p, SPIKES.x, SPIKES.y);
    const events = run(w, Math.round((TRAP.spikeWarn + TRAP.spikeRest + TRAP.spikeWarn + 0.4) * SIM_HZ), ...pads(w));
    expect(eventsOf(events, 'trapWarn').length).toBe(2);
    expect(eventsOf(events, 'trapStrike').length).toBe(2);
  });

  it('hurts an Echo that stands on it, and spikes at once a body thrown onto it, for whoever threw it', () => {
    const w = world();
    const stander = dummy(w, SPIKES.x, SPIKES.y, 100);
    run(w, Math.round(TRAP.spikeWarn * SIM_HZ) + 4, ...pads(w));
    expect(100 - stander.hp).toBe(TRAP.spikeEcho);

    const v = world();
    const thrown = dummy(v, SPIKES.x - 2.2, SPIKES.y, 100);
    expect(pushBody(v, thrown, 1, 0, 9, 0)).toBe(true);
    const events: SimEvent[] = run(v, 30, ...pads(v));
    const spiked = eventsOf(events, 'hit').filter((h) => h.kind === 'slam' && h.amount === TRAP.spikeBody);
    expect(spiked.length).toBe(1);
    expect(spiked[0].by).toBe(0);
    expect(v.players[0].rally).toBeGreaterThan(0);
    expect(eventsOf(events, 'trapWarn').length).toBe(0);
  });

  it('sleeps once the chamber is cleared', () => {
    const w = world();
    w.flow.phase = 'cleared';
    place(w.players[0], SPIKES.x, SPIKES.y);
    const events = run(w, 2 * SIM_HZ, ...pads(w));
    expect(eventsOf(events, 'trapWarn').length).toBe(0);
    expect(w.players[0].hp).toBe(w.players[0].maxHp);
  });
});

describe('a knell', () => {
  it('tolls on a clock: a warned ring that hurts and throws outward whatever stands in it', () => {
    const w = world(['sword', 'bow']);
    only(w, 'knell');
    const [near, far] = w.players;
    place(near, KNELL.x - 1.5, KNELL.y);
    place(far, KNELL.x - 4, KNELL.y);
    const echo = dummy(w, KNELL.x, KNELL.y + 1.4, 100);
    const events = run(w, Math.round((TRAP.knellEvery + 3) * SIM_HZ), ...pads(w));
    const tolls = eventsOf(events, 'trapStrike').filter((e) => e.kind === 'knell');
    expect(tolls.length).toBe(1);
    expect(eventsOf(events, 'trapWarn').filter((e) => e.kind === 'knell').length).toBeGreaterThanOrEqual(1);
    const hurt = eventsOf(events, 'playerHurt');
    expect(hurt.map((h) => [h.player, h.amount])).toEqual([[near.slot, TRAP.knellDamage]]);
    // thrown away from the post
    expect(hurt[0].dx).toBeLessThan(0);
    expect(100 - echo.hp).toBeGreaterThanOrEqual(TRAP.knellEcho);
    expect(echo.y).toBeGreaterThan(KNELL.y + 1.6);
  });
});

describe('a thorn pipe', () => {
  it('turns toward the nearest player and spits a bolt down the line it drew', () => {
    const w = world();
    only(w, 'thorn');
    const p = w.players[0];
    place(p, THORN.x + 6, THORN.y);
    const events = run(w, Math.round((TRAP.thornEvery + 2.5) * SIM_HZ), ...pads(w));
    expect(eventsOf(events, 'trapWarn').some((e) => e.kind === 'thorn')).toBe(true);
    const bolts = eventsOf(events, 'projectileSpawn').filter((e) => e.kind === 'bolt');
    expect(bolts.length).toBe(1);
    // it left along the row the player stands in, and reached them
    expect(Math.abs(bolts[0].y - THORN.y)).toBeLessThan(0.05);
    expect(eventsOf(events, 'playerHurt').map((h) => h.amount)).toEqual([TRAP.thornDamage]);
  });

  it('holds its fire when nobody is in reach', () => {
    const w = world();
    only(w, 'thorn');
    place(w.players[0], 14.5, 1.5);
    const events = run(w, Math.round((TRAP.thornEvery + 2) * SIM_HZ), ...pads(w));
    expect(eventsOf(events, 'projectileSpawn').length).toBe(0);
  });
});

describe('where traps are laid', () => {
  it('a generated chamber gets what it is asked for, never near where the party walks in', () => {
    let laid = 0;
    for (let i = 0; i < 60; i++) {
      const t = generateRoom(`traps-${i}`, { zone: 'inner', kind: 'combat', look: 'court', size: 28, traps: 3 });
      expect(validateRoomTemplate(t), t.id).toEqual([]);
      const room = buildRoom(t);
      laid += room.traps.length;
      for (const trap of room.traps) expect(Math.hypot(trap.x - room.start.x, trap.y - room.start.y), t.id).toBeGreaterThan(4);
      const none = generateRoom(`traps-${i}`, { zone: 'inner', kind: 'combat', look: 'court', size: 28 });
      expect(buildRoom(none).traps.length).toBe(0);
    }
    // three features each, most of them mirrored or in rows: well over three traps a room
    expect(laid / 60).toBeGreaterThan(5);
  });

  it('the road has none in its first chamber, in a camp or under a boss, and more the deeper it goes', () => {
    for (let i = 0; i < 20; i++) {
      const route = planRoute(`road-${i}`);
      for (const stop of route) {
        const room = buildRoom(generateRoom(`road-${i}/${stop.n}`, roomSpec(stop)));
        const quiet = stop.n === 1 || stop.kind === 'camp' || stop.kind === 'miniboss' || stop.kind === 'boss';
        expect(trapsFor(stop) === 0).toBe(quiet);
        if (quiet) expect(room.traps.length, `${stop.n} ${stop.kind}`).toBe(0);
      }
      const fights = route.filter((s) => s.kind === 'fight' || s.kind === 'elite' || s.kind === 'wager');
      expect(trapsFor(fights[fights.length - 1])).toBeGreaterThan(trapsFor(fights[0]));
    }
  });
});
