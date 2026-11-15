// The Gong: a shield you cannot hit through, and the ways each class gets round it.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { GONG } from '../src/content/enemies/gong';
import { THRUM } from '../src/content/enemies/thrum';
import { spawnEnemy } from '../src/sim/ai';
import { classBot } from '../src/sim/bots';
import { onGuard, standing } from '../src/sim/combat';
import { validateEnemyDef } from '../src/sim/defs';
import { enemyPool } from '../src/sim/flow';
import { SIM_HZ } from '../src/sim/tuning';
import { emptyInput } from '../src/sim/types';
import type { ClassId } from '../src/sim/types';
import { stepWorld } from '../src/sim/world';
import { BTN, PRESS, Pad, dummy, eventsOf, openWorld, place, run } from './helpers';

describe('the Gong', () => {
  it('is a well-formed Echo that joins the waves from the third chamber', () => {
    expect(validateEnemyDef(GONG)).toEqual([]);
    expect(CONTENT.enemies.gong).toBe(GONG);
    const w = openWorld();
    w.chamber = 2;
    expect(enemyPool(w).map((d) => d.id)).not.toContain('gong');
    w.chamber = 3;
    expect(enemyPool(w).map((d) => d.id)).toContain('gong');
  });

  it('an arrow to its front rings off; one banked off the wall behind it lands', () => {
    // straight at it
    const a = openWorld(['bow']);
    const front = dummy(a, 10.5, 6.5, 0, GONG);
    const padA = new Pad().aimAt(a.players[0], front.x, front.y);
    run(a, 20, padA);
    padA.tap(PRESS.attack);
    const first = run(a, 40, padA);
    expect(front.hp).toBe(front.maxHp);
    expect(eventsOf(first, 'clang').length).toBe(1);

    // off the far wall (its face is at x = 15), aimed at the Gong's mirror image
    const b = openWorld(['bow']);
    place(b.players[0], 6.5, 9.5);
    const behind = dummy(b, 10.5, 6.5, 0, GONG);
    const padB = new Pad().aimAt(b.players[0], 2 * 14.9 - behind.x, behind.y);
    run(b, 20, padB);
    padB.tap(PRESS.attack);
    const second = run(b, 80, padB);
    expect(eventsOf(second, 'ricochet').length).toBeGreaterThanOrEqual(1);
    expect(eventsOf(second, 'clang').length).toBe(0);
    expect(behind.hp).toBeLessThan(behind.maxHp);
  });

  it('a jab to its front does nothing; a full Haymaker opens the guard and lands', () => {
    const punch = (ticksHeld: number): { hp: number; clangs: number; open: number } => {
      const w = openWorld(['fist']);
      const p = w.players[0];
      const e = dummy(w, p.x + 1.3, p.y, 0, GONG);
      const pad = new Pad().aimAt(p, e.x, e.y);
      run(w, 20, pad);
      pad.tap(PRESS.attack).hold(BTN.attack, true);
      const events = run(w, ticksHeld, pad);
      pad.hold(BTN.attack, false);
      events.push(...run(w, 30, pad));
      return { hp: e.hp, clangs: eventsOf(events, 'clang').length, open: e.guardOpen };
    };
    const jab = punch(2);
    expect(jab.hp).toBe(GONG.hp);
    expect(jab.clangs).toBeGreaterThanOrEqual(1);
    const full = punch(70);
    expect(full.hp).toBeLessThan(GONG.hp);
    expect(full.open).toBeGreaterThan(0);
  });

  it('bashes whoever stands in its cone, and its guard is down while it recovers', () => {
    const w = openWorld(['sword']);
    const p = w.players[0];
    const e = spawnEnemy(w, GONG, p.x + 1.6, p.y, { instant: true });
    e.cooldowns.fill(0);
    let recovering = 0;
    let hurt = 0;
    const idle = emptyInput();
    for (let i = 0; i < 4 * SIM_HZ; i++) {
      stepWorld(w, [new Pad().f], idle);
      hurt += eventsOf(w.events, 'playerHurt').length;
      w.events.length = 0;
      if (e.state === 'recover') {
        recovering++;
        expect(onGuard(e)).toBe(false);
      }
    }
    expect(hurt).toBeGreaterThanOrEqual(1);
    expect(recovering).toBeGreaterThan(20);
  });

  it('every class can beat a Gong and its company', () => {
    for (const classId of ['sword', 'bow', 'fist'] as ClassId[]) {
      const w = openWorld([classId], `gong-${classId}`);
      w.chamber = 3;
      spawnEnemy(w, GONG, 11, 4);
      spawnEnemy(w, THRUM, 12, 9);
      spawnEnemy(w, THRUM, 4, 3);
      const bot = classBot(classId);
      const idle = emptyInput();
      let t = 0;
      for (; t < 150 * SIM_HZ && w.enemies.length > 0 && w.players.some(standing); t++) {
        stepWorld(w, [bot.think(w, 0)], idle);
        w.events.length = 0;
      }
      expect(w.enemies.length, `${classId} after ${Math.round(t / SIM_HZ)} s`).toBe(0);
      expect(standing(w.players[0]), classId).toBe(true);
    }
  });
});
