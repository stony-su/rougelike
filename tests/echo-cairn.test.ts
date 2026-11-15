// The Cairn: heavy, slow, a slam for whoever is close and a thrown stone for whoever is not.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { CAIRN } from '../src/content/enemies/cairn';
import { THRUM } from '../src/content/enemies/thrum';
import { spawnEnemy } from '../src/sim/ai';
import { addStagger, pushBody } from '../src/sim/bodies';
import { classBot } from '../src/sim/bots';
import { standing } from '../src/sim/combat';
import { validateEnemyDef } from '../src/sim/defs';
import { enemyPool } from '../src/sim/flow';
import { BODY, SIM_HZ } from '../src/sim/tuning';
import { emptyInput } from '../src/sim/types';
import type { ClassId } from '../src/sim/types';
import { stepWorld } from '../src/sim/world';
import { Pad, dummy, eventsOf, openWorld, place, run } from './helpers';

describe('the Cairn', () => {
  it('is a well-formed Echo that joins the waves from the third chamber', () => {
    expect(validateEnemyDef(CAIRN)).toEqual([]);
    expect(CONTENT.enemies.cairn).toBe(CAIRN);
    const w = openWorld();
    w.chamber = 2;
    expect(enemyPool(w).map((d) => d.id)).not.toContain('cairn');
    w.chamber = 3;
    expect(enemyPool(w).map((d) => d.id)).toContain('cairn');
  });

  it('its slam strikes everyone inside the ring that was drawn, and nobody outside it', () => {
    const w = openWorld(2);
    const [near, far] = w.players;
    const e = spawnEnemy(w, CAIRN, 8, 6.5, { instant: true });
    place(near, e.x - 1.6, e.y);
    place(far, e.x + 4.5, e.y);
    e.cooldowns = [0, 999];
    const events = run(w, Math.round(2.4 * SIM_HZ), new Pad(), new Pad());
    const rings = eventsOf(events, 'enemyWindup').filter((ev) => ev.move === 'slam');
    expect(rings.length).toBe(1);
    const hurt = eventsOf(events, 'playerHurt');
    expect(hurt.map((h) => h.player)).toEqual([near.slot]);
    expect(hurt[0].amount).toBe(16);
  });

  it('from a distance it throws its stone at a marked circle, and the stone bursts there', () => {
    const w = openWorld(1);
    const p = w.players[0];
    place(p, 3, 6.5);
    const e = spawnEnemy(w, CAIRN, 9.5, 6.5, { instant: true });
    e.def = { ...CAIRN, speed: 0 };
    e.cooldowns = [999, 0];
    const events = run(w, Math.round(3.6 * SIM_HZ), new Pad());
    expect(eventsOf(events, 'bombThrow').length).toBe(1);
    const burst = eventsOf(events, 'bombBurst');
    expect(burst.length).toBe(1);
    expect(Math.hypot(burst[0].x - 3, burst[0].y - 6.5)).toBeLessThan(0.2);
    expect(eventsOf(events, 'playerHurt').length).toBe(1);
  });

  it('is too heavy to launch as it stands, and flies once it is staggered', () => {
    const w = openWorld();
    const plain = dummy(w, 10, 4, 0, CAIRN);
    const push = BODY.launchSpeed * CAIRN.mass * 0.8;
    expect(pushBody(w, plain, 1, 0, push, 0)).toBe(false);
    const struck = dummy(w, 10, 9, 0, CAIRN);
    for (let i = 0; i < BODY.staggerAt; i++) addStagger(w, struck, 1);
    expect(struck.staggered).toBeGreaterThan(0);
    expect(pushBody(w, struck, 1, 0, push, 0)).toBe(true);
    expect(struck.state).toBe('launched');
  });

  it('every class can beat a Cairn and its company', () => {
    for (const classId of ['sword', 'bow', 'fist'] as ClassId[]) {
      const w = openWorld([classId], `cairn-${classId}`);
      w.chamber = 3;
      spawnEnemy(w, CAIRN, 11, 4);
      spawnEnemy(w, THRUM, 12, 9);
      spawnEnemy(w, THRUM, 4, 3);
      const bot = classBot(classId);
      const idle = emptyInput();
      let t = 0;
      for (; t < 180 * SIM_HZ && w.enemies.length > 0 && w.players.some(standing); t++) {
        stepWorld(w, [bot.think(w, 0)], idle);
        w.events.length = 0;
      }
      expect(w.enemies.length, `${classId} after ${Math.round(t / SIM_HZ)} s`).toBe(0);
      expect(standing(w.players[0]), classId).toBe(true);
    }
  });
});
