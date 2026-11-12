import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { Rng } from '../src/core/rng';
import { playRoom, playRun, steadyPolicy } from '../src/sim/autoplay';
import { lineBot, rodBot } from '../src/sim/bots';
import type { RoomKind } from '../src/sim/defs';
import { composeWave, createFlow } from '../src/sim/flow';
import { grantInstrument } from '../src/sim/kit';
import { activeLines } from '../src/sim/lines';
import { buildRoom, validateRoomTemplate } from '../src/sim/room';
import {
  MINIBOSS_SHEET,
  REST_HEAL,
  SHEETS,
  acceptClaim,
  buy,
  chooseDoor,
  createRun,
  doorOptions,
  enterRoom,
  leaveRoom,
  restChoices,
  rollDraft,
  rollShop,
  takeOffer,
  takeRest,
} from '../src/sim/run';
import { DT, LINES } from '../src/sim/tuning';
import { emptyInput } from '../src/sim/types';
import { createWorld, stepWorld } from '../src/sim/world';

describe('room templates', () => {
  for (const t of CONTENT.rooms) {
    it(`${t.id} is a valid room`, () => {
      expect(validateRoomTemplate(t)).toEqual([]);
      const room = buildRoom(t);
      expect(room.doors.length).toBeGreaterThanOrEqual(1);
    });
  }

  it('offers more layouts than a run uses, in both zones, and one of every special room', () => {
    const count = (zone: string, kind: RoomKind): number => CONTENT.rooms.filter((r) => r.zone === zone && r.kind === kind).length;
    expect(count('bluefen', 'combat')).toBeGreaterThanOrEqual(6);
    expect(count('unruled', 'combat')).toBeGreaterThanOrEqual(5);
    for (const kind of ['tutorial', 'shop', 'rest', 'event', 'miniboss', 'boss'] as const) {
      expect(CONTENT.rooms.filter((r) => r.kind === kind).length).toBeGreaterThanOrEqual(1);
    }
    expect(new Set(CONTENT.rooms.map((r) => r.id)).size).toBe(CONTENT.rooms.length);
  });
});

/** Walk a run's route without fighting, taking random doors. Returns the room kind at each sheet. */
function route(seed: string, pick: Rng): Array<{ kind: RoomKind; elite: boolean; sheet: number; options: number }> {
  const run = createRun(seed);
  const out = [{ kind: run.slot.kind, elite: run.slot.elite, sheet: run.sheet, options: 0 }];
  for (let i = 0; i < 30; i++) {
    const options = doorOptions(run);
    if (options.length === 0) break;
    chooseDoor(run, pick.int(0, options.length - 1));
    out.push({ kind: run.slot.kind, elite: run.slot.elite, sheet: run.sheet, options: options.length });
  }
  return out;
}

describe('the route through a run', () => {
  it('is always twelve sheets with the mini-boss sixth and the final boss last, whatever doors are taken', () => {
    const pick = new Rng(4242);
    let twoDoorMoments = 0;
    const orders = new Set<string>();
    for (let s = 0; s < 600; s++) {
      const r = route(`seed-${s}`, pick);
      expect(r).toHaveLength(SHEETS);
      expect(r.map((x) => x.sheet)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      expect(r[0]).toMatchObject({ kind: 'combat', elite: false });
      expect(r[MINIBOSS_SHEET - 1].kind).toBe('miniboss');
      expect(r[SHEETS - 1].kind).toBe('boss');

      const z1 = r.slice(0, 5).map((x) => x.kind);
      const z2 = r.slice(6, 11).map((x) => x.kind);
      expect(z1.filter((k) => k === 'combat')).toHaveLength(4);
      expect(z2.filter((k) => k === 'combat')).toHaveLength(3);
      expect(z2.filter((k) => k === 'rest')).toHaveLength(1);
      // the shop and the event both appear, one in each zone
      const quiet = [...z1, ...z2].filter((k) => k === 'shop' || k === 'event').sort();
      expect(quiet).toEqual(['event', 'shop']);
      expect(z1.filter((k) => k === 'shop' || k === 'event')).toHaveLength(1);
      // one elite fight per zone, never the first sheet
      expect(r.slice(0, 5).filter((x) => x.elite)).toHaveLength(1);
      expect(r.slice(6, 11).filter((x) => x.elite)).toHaveLength(1);
      // the rest stop is not the first room of its zone
      expect(r[6].kind).not.toBe('rest');
      // two quiet rooms never come back to back while a fight was still available
      for (let i = 1; i < r.length; i++) {
        const q = (k: RoomKind): boolean => k === 'shop' || k === 'rest' || k === 'event';
        if (q(r[i].kind) && q(r[i - 1].kind)) {
          const fightsLeft = r.slice(i, i < 6 ? 5 : 11).some((x) => x.kind === 'combat');
          expect(fightsLeft).toBe(false);
        }
      }
      twoDoorMoments += r.filter((x) => x.options === 2).length;
      orders.add(r.map((x) => x.kind[0] + (x.elite ? '!' : '')).join(''));
    }
    // the player really does get choices, and runs really do differ
    expect(twoDoorMoments / 600).toBeGreaterThan(3);
    expect(orders.size).toBeGreaterThan(40);
  });

  it('is the same for the same seed and choices', () => {
    const a = route('abc', new Rng(1));
    const b = route('abc', new Rng(1));
    expect(a).toEqual(b);
  });
});

describe('drafting', () => {
  it('the first reward includes a Head, and every offer includes an Order', () => {
    for (let s = 0; s < 80; s++) {
      const run = createRun(`d${s}`);
      const w = enterRoom(run, CONTENT);
      const offers = rollDraft(run, w);
      expect(offers).toHaveLength(3);
      expect(new Set(offers.map((o) => o.id)).size).toBe(3);
      const kinds = offers.map((o) => CONTENT.instruments[o.id].kind);
      expect(kinds).toContain('head');
      expect(kinds).toContain('order');
      for (const o of offers) expect(CONTENT.instruments[o.id].locked).toBeFalsy();
    }
  });

  it('never offers locked instruments unless unlocked, never offers maxed ones', () => {
    const run = createRun('locked', { unlocked: ['fourth_stake'] });
    const w = enterRoom(run, CONTENT);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) for (const o of rollDraft(run, w)) seen.add(o.id);
    expect(seen.has('fourth_stake')).toBe(true);
    expect(seen.has('backsight')).toBe(false);
    // max something out and it disappears
    for (let i = 0; i < 3; i++) grantInstrument(w, 'signal_lamp');
    for (let i = 0; i < 100; i++) for (const o of rollDraft(run, w)) expect(o.id).not.toBe('signal_lamp');
  });

  it('once every stake has a Head, at most one new Head appears, as a swap', () => {
    const run = createRun('full');
    const w = enterRoom(run, CONTENT);
    for (const h of ['signal_lamp', 'vernier', 'anchor_pin']) grantInstrument(w, h);
    run.drafts = 3;
    for (let i = 0; i < 120; i++) {
      const offers = rollDraft(run, w);
      const fresh = offers.filter((o) => CONTENT.instruments[o.id].kind === 'head' && o.how !== 'rank');
      expect(fresh.length).toBeLessThanOrEqual(1);
      for (const o of fresh) expect(o.how).toBe('swap');
    }
  });

  it('flags and favours a Head that completes a Splice', () => {
    const run = createRun('splice');
    const w = enterRoom(run, CONTENT);
    grantInstrument(w, 'signal_lamp');
    run.drafts = 1;
    let frost = 0;
    let flagged = 0;
    let barbed = 0;
    for (let i = 0; i < 400; i++) {
      for (const o of rollDraft(run, w)) {
        if (o.id === 'frost_gauge') {
          frost++;
          if (o.completes === 'steamline') flagged++;
        }
        if (o.id === 'barbed_chain') barbed++;
      }
    }
    expect(frost).toBeGreaterThan(0);
    expect(flagged).toBe(frost);
    expect(frost).toBeGreaterThan(barbed * 1.4);
  });

  it('a guaranteed rare includes the best thing available', () => {
    const run = createRun('rare', { unlocked: ['fourth_stake', 'backsight', 'foresight', 'offset'] });
    const w = enterRoom(run, CONTENT);
    run.drafts = 2;
    for (let i = 0; i < 40; i++) {
      const offers = rollDraft(run, w, true);
      expect(offers.some((o) => CONTENT.instruments[o.id].rarity === 'rare')).toBe(true);
    }
  });

  it('taking offers mounts Heads, ranks up, and refunds Chalk on a swap', () => {
    const run = createRun('take');
    const w = enterRoom(run, CONTENT);
    takeOffer(run, w, { id: 'signal_lamp', rank: 1, how: 'new', completes: null, rare: false });
    takeOffer(run, w, { id: 'signal_lamp', rank: 2, how: 'rank', completes: null, rare: false });
    expect(w.lines.stakes[0].head).toBe('signal_lamp');
    expect(run.kit.owned.signal_lamp).toBe(2);
    grantInstrument(w, 'vernier');
    grantInstrument(w, 'anchor_pin');
    const chalk = w.chalk;
    const refund = takeOffer(run, w, { id: 'lodestone', rank: 1, how: 'swap', completes: null, rare: false }, 1);
    expect(refund).toBe(15);
    expect(w.chalk).toBe(chalk + 15);
    expect(run.kit.heads[1]).toBe('lodestone');
    expect(run.kit.owned.vernier).toBeUndefined();
    expect(run.drafts).toBe(3);
  });
});

describe('the Tally Tent', () => {
  it('sells three instruments, a ration and a reroll at fixed prices', () => {
    const run = createRun('shop');
    const w = enterRoom(run, CONTENT);
    const items = rollShop(run, w);
    expect(items.filter((i) => i.kind === 'instrument')).toHaveLength(3);
    for (const it of items) {
      if (it.kind !== 'instrument' || !it.offer) continue;
      const rarity = CONTENT.instruments[it.offer.id].rarity;
      expect(it.price).toBe(rarity === 'common' ? 40 : rarity === 'uncommon' ? 60 : 90);
    }
    // cannot afford anything with empty pockets
    expect(buy(run, w, items, 0)).toBe(false);
    w.chalk = 500;
    const first = items[0];
    expect(buy(run, w, items, 0)).toBe(true);
    expect(w.chalk).toBe(500 - first.price);
    expect(run.kit.owned[(first.offer as NonNullable<typeof first.offer>).id]).toBeGreaterThanOrEqual(1);
    expect(buy(run, w, items, 0)).toBe(false); // sold

    const ration = items.findIndex((i) => i.kind === 'ration');
    expect(buy(run, w, items, ration)).toBe(false); // at full health
    w.player.hp = 40;
    expect(buy(run, w, items, ration)).toBe(true);
    expect(w.player.hp).toBe(70);

    const reroll = items.findIndex((i) => i.kind === 'reroll');
    const before = items.filter((i) => i.kind === 'instrument' && !i.sold).map((i) => i.offer?.id);
    const price = items[reroll].price;
    expect(buy(run, w, items, reroll)).toBe(true);
    const after = items.filter((i) => i.kind === 'instrument' && !i.sold).map((i) => i.offer?.id);
    expect(after).toHaveLength(before.length);
    expect(items[reroll].price).toBeGreaterThan(price);
  });
});

describe('the Trig Pillar', () => {
  it('heals, ranks up a Head, or raises maximum health when there is no Head to rank', () => {
    const run = createRun('rest');
    const w = enterRoom(run, CONTENT);
    expect(restChoices(run, w).map((c) => c.kind)).toEqual(['heal', 'maxHp']);
    w.player.hp = 30;
    takeRest(run, w, { kind: 'heal' });
    expect(w.player.hp).toBe(30 + Math.round(100 * REST_HEAL));
    takeRest(run, w, { kind: 'maxHp' });
    expect(w.player.maxHp).toBe(110);

    grantInstrument(w, 'vernier');
    const choices = restChoices(run, w);
    expect(choices).toContainEqual({ kind: 'rank', head: 'vernier' });
    expect(choices.some((c) => c.kind === 'maxHp')).toBe(false);
    takeRest(run, w, { kind: 'rank', head: 'vernier' });
    expect(run.kit.owned.vernier).toBe(2);
  });
});

describe('the Disputed Claim', () => {
  it('each handicap bends the mechanic for one room and starts an elite fight', () => {
    const fresh = (): ReturnType<typeof enterRoom> => {
      const run = createRun('claim');
      run.slot = { kind: 'event', elite: false };
      return enterRoom(run, CONTENT);
    };
    const run = createRun('claim');
    run.slot = { kind: 'event', elite: false };

    let w = enterRoom(run, CONTENT);
    expect(w.flow.phase).toBe('open');
    acceptClaim(run, w, 'shortChain');
    expect(w.lines.rules.linkRange).toBeCloseTo(LINES.linkRange / 2);
    expect(w.flow.phase).toBe('fight');
    expect(w.flow.elite).toBe(true);
    expect(w.flow.interactables.some((i) => i.kind === 'door')).toBe(false);
    leaveRoom(run, w);
    expect(w.lines.rules.linkRange).toBeCloseTo(LINES.linkRange);

    w = fresh();
    acceptClaim(run, w, 'twoStakes');
    expect(w.lines.stakes).toHaveLength(2);
    leaveRoom(run, w);
    expect(w.lines.stakes).toHaveLength(3);

    w = fresh();
    acceptClaim(run, w, 'slackLine');
    for (const [x, y] of [[4, 4], [8, 4]] as const) {
      w.player.x = w.player.px = x;
      w.player.y = w.player.py = y;
      stepWorld(w, { ...emptyInput(), stakePressed: true });
    }
    for (let i = 0; i < Math.round(6 / DT); i++) stepWorld(w, emptyInput());
    expect(activeLines(w.lines)).toHaveLength(1);
    expect(activeLines(w.lines)[0].ripe).toBe(false);
  });
});

describe('waves', () => {
  it('spend no more than the budget and are the same for the same seed', () => {
    const make = (): ReturnType<typeof createWorld> =>
      createWorld(buildRoom(CONTENT.rooms[0]), 'waves', CONTENT, { sheet: 5, flow: createFlow({ kind: 'combat', elite: false }, 5) });
    const a = make();
    const b = make();
    for (const budget of [1, 3, 5.5, 9]) {
      const wave = composeWave(a, budget);
      expect(wave.length).toBeGreaterThan(0);
      expect(wave.reduce((s, d) => s + d.threat, 0)).toBeLessThanOrEqual(Math.max(budget, 1));
      expect(composeWave(b, budget).map((d) => d.id)).toEqual(wave.map((d) => d.id));
    }
  });
});

describe('a room from start to door', () => {
  it('sends its waves, pays Chalk, offers a reward, opens the doors and moves the run on', () => {
    const run = createRun('loop-1');
    const w = enterRoom(run, CONTENT);
    expect(w.flow.phase).toBe('fight');
    expect(w.flow.waves).toBe(2);
    const r = playRoom(run, w, rodBot(), steadyPolicy);
    expect(r.outcome).toBe('cleared');
    expect(w.stats.kills).toBeGreaterThanOrEqual(4);
    expect(run.chalk).toBeGreaterThan(10);
    expect(Object.keys(run.kit.owned)).toHaveLength(1);
    expect(run.sheet).toBe(2);
    expect(run.totals.sheetsCleared).toBe(1);
    // every stake came back to hand when the room was cleared
    expect(w.lines.stakes.every((s) => s.state === 'held')).toBe(true);
  });

  it('carries health, Chalk and the kit into the next room', () => {
    const run = createRun('loop-2');
    let w = enterRoom(run, CONTENT);
    playRoom(run, w, rodBot(), steadyPolicy);
    const hp = run.hp;
    const chalk = run.chalk;
    const owned = { ...run.kit.owned };
    w = enterRoom(run, CONTENT);
    expect(w.player.hp).toBe(hp);
    expect(w.chalk).toBe(chalk);
    expect(run.kit.owned).toEqual(owned);
    expect(run.used).toHaveLength(2);
    expect(new Set(run.used).size).toBe(2);
  });
});

describe('the first zone, played by bots', () => {
  it('a line-playing bot reaches the mini-boss sheet on most seeds', () => {
    let reached = 0;
    const seeds = ['z1-a', 'z1-b', 'z1-c', 'z1-d', 'z1-e', 'z1-f'];
    for (const seed of seeds) {
      const r = playRun(createRun(seed), CONTENT, () => lineBot(), steadyPolicy, MINIBOSS_SHEET);
      if (r.outcome === 'stopped') reached++;
      expect(r.outcome).not.toBe('timeout');
    }
    expect(reached).toBeGreaterThanOrEqual(4);
  });

  it('is deterministic', () => {
    const play = (): string => {
      const r = playRun(createRun('det'), CONTENT, () => lineBot(), steadyPolicy, 4);
      return JSON.stringify([r.outcome, r.sheet, r.ticks, r.run.hp, r.run.chalk, r.run.kit.owned, r.run.totals]);
    };
    expect(play()).toBe(play());
  });
});
