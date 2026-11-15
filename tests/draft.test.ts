// The upgrade engine: what Tunings add up to, what a draft offers, and how a pick travels
// through the session so that every laptop agrees on it.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import type { ContentRegistry } from '../src/sim/defs';
import { DRAFT_TICKS, OFFERS, candidates, completes, rollOffers } from '../src/sim/draft';
import { baseMods, computeMods, validateTunings } from '../src/sim/mods';
import type { TuningDef } from '../src/sim/mods';
import { createSession, stepSession, stopOf, worldOf } from '../src/sim/session';
import type { Command, Session, SessionConfig } from '../src/sim/session';
import { hashSession, loadSession, saveSession } from '../src/sim/snapshot';
import { emptyInput } from '../src/sim/types';
import type { ClassId } from '../src/sim/types';

/** Sword Tunings made for these tests: three builds, a wildcard and a locked one, so the rules about classes can be seen. */
const blade = (id: string, build: string, rarity = 0, extra: Partial<TuningDef> = {}): TuningDef => ({
  id,
  name: id,
  owner: 'sword',
  build,
  rarity,
  maxRank: 3,
  text: ['one', 'two', 'three'],
  effects: [{ mod: 'arc', op: 'add', v: [0.1, 0.2, 0.3] }],
  ...extra,
});
const BLADES: TuningDef[] = [
  blade('a1', 'Alpha'),
  blade('a2', 'Alpha', 1),
  blade('b1', 'Beta'),
  blade('b2', 'Beta', 2),
  blade('c1', 'Gamma'),
  blade('w1', 'Wildcard', 1),
  blade('locked', 'Gamma', 2, { locked: true }),
];
const WITH_BLADES: ContentRegistry = {
  ...CONTENT,
  tunings: { ...CONTENT.tunings, ...Object.fromEntries(BLADES.map((t) => [t.id, t])) },
  harmonies: [...CONTENT.harmonies, { id: 'ab', name: 'AB', parents: ['a1', 'b1'], text: 'both', effects: [{ mod: 'hallOfMirrors', op: 'set', v: [1] }] }],
};
const ownerOf = (id: string): string => WITH_BLADES.tunings[id].owner;

describe('what Tunings add up to', () => {
  it('nothing held is the base, and each rank reads its own value', () => {
    expect(computeMods({}, CONTENT.tunings, CONTENT.harmonies)).toEqual(baseMods());
    expect(computeMods({ 'stout-heart': 1 }, CONTENT.tunings, CONTENT.harmonies).maxHp).toBe(15);
    expect(computeMods({ 'stout-heart': 3 }, CONTENT.tunings, CONTENT.harmonies).maxHp).toBe(45);
    // a rank beyond the last listed reads the last
    expect(computeMods({ 'stout-heart': 9 }, CONTENT.tunings, CONTENT.harmonies).maxHp).toBe(45);
    const wind = computeMods({ 'third-wind': 2 }, CONTENT.tunings, CONTENT.harmonies);
    expect(wind.dashCharges).toBe(1);
    expect(wind.dashRecharge).toBeCloseTo(0.8);
  });

  it('a Harmony switches on only while both parents are held', () => {
    const one = computeMods({ 'ember-return': 2 }, CONTENT.tunings, CONTENT.harmonies);
    const both = computeMods({ 'ember-return': 2, 'frost-return': 1 }, CONTENT.tunings, CONTENT.harmonies);
    expect(one.steam).toBe(0);
    expect(both.steam).toBe(1);
    expect(both.ember).toBe(6);
  });

  it('is the same whatever order the Tunings were taken in, and ignores ids it does not know', () => {
    const a = computeMods({ tithe: 1, 'stout-heart': 2, 'third-wind': 1 }, CONTENT.tunings, CONTENT.harmonies);
    const b = computeMods({ 'third-wind': 1, gone: 3, 'stout-heart': 2, tithe: 1 }, CONTENT.tunings, CONTENT.harmonies);
    expect(b).toEqual(a);
  });

  it('every Tuning and Harmony in the game is well formed, and a fresh save has twelve that anyone can take', () => {
    expect(validateTunings(CONTENT.tunings, CONTENT.harmonies)).toEqual([]);
    expect(Object.values(CONTENT.tunings).filter((t) => t.owner === 'common' && !t.locked).length).toBe(12);
  });
});

describe('what a draft offers', () => {
  it('is the same for the same seed, and three different cards', () => {
    for (let i = 0; i < 50; i++) {
      const a = rollOffers(`s${i}`, 'sword', {}, WITH_BLADES, 1, false);
      expect(rollOffers(`s${i}`, 'sword', {}, WITH_BLADES, 1, false)).toEqual(a);
      expect(a.length).toBe(OFFERS);
      expect(new Set(a).size).toBe(OFFERS);
    }
    expect(rollOffers('x', 'sword', {}, WITH_BLADES, 1, false)).not.toEqual(rollOffers('y', 'sword', {}, WITH_BLADES, 1, false));
  });

  it('the first draft of a run shows one card from each build of the class', () => {
    for (let i = 0; i < 80; i++) {
      const offer = rollOffers(`first${i}`, 'sword', {}, WITH_BLADES, 0, false);
      expect(offer.map((id) => WITH_BLADES.tunings[id].build).sort()).toEqual(['Alpha', 'Beta', 'Gamma']);
    }
  });

  it('later drafts hold at least one card of the class and one anyone can take', () => {
    for (let i = 0; i < 200; i++) {
      const owners = rollOffers(`later${i}`, 'sword', { a1: 1 }, WITH_BLADES, 2, false).map(ownerOf);
      expect(owners).toContain('sword');
      expect(owners).toContain('common');
    }
  });

  it('never offers another class, a locked Tuning, or one already at its top rank', () => {
    const held = { a1: 3, 'stout-heart': 3 };
    for (let i = 0; i < 200; i++) {
      for (const id of rollOffers(`never${i}`, 'bow', held, WITH_BLADES, 3, false)) expect(ownerOf(id)).toBe('common');
      const offer = rollOffers(`never${i}`, 'sword', held, WITH_BLADES, 3, i % 2 === 0);
      expect(offer).not.toContain('locked');
      expect(offer).not.toContain('a1');
      expect(offer).not.toContain('stout-heart');
    }
    // once unlocked, it can come up
    const ids = candidates('sword', {}, WITH_BLADES, ['locked']).map((t) => t.id);
    expect(ids).toContain('locked');
  });

  it('after an elite, promises something better than common', () => {
    for (let i = 0; i < 100; i++) {
      const offer = rollOffers(`rare${i}`, 'sword', {}, WITH_BLADES, 2, true);
      expect(offer.some((id) => WITH_BLADES.tunings[id].rarity >= 1)).toBe(true);
    }
  });

  it('leans toward the missing half of a Harmony', () => {
    expect(completes('b1', { a1: 1 }, WITH_BLADES)?.id).toBe('ab');
    expect(completes('b1', {}, WITH_BLADES)).toBeNull();
    let withHalf = 0;
    let without = 0;
    for (let i = 0; i < 400; i++) {
      if (rollOffers(`lean${i}`, 'sword', { a1: 1 }, WITH_BLADES, 2, false).includes('b1')) withHalf++;
      if (rollOffers(`lean${i}`, 'sword', { c1: 1 }, WITH_BLADES, 2, false).includes('b1')) without++;
    }
    expect(withHalf).toBeGreaterThan(without * 1.3);
  });

  it('offers what is left when less than three remain, and nothing when nothing does', () => {
    const all = Object.fromEntries(Object.values(CONTENT.tunings).map((t) => [t.id, t.maxRank]));
    expect(rollOffers('none', 'bow', all, CONTENT, 4, false)).toEqual([]);
    const butOne = { ...all, tithe: 1 };
    expect(rollOffers('one', 'bow', butOne, CONTENT, 4, false)).toEqual(['tithe']);
  });
});

describe('a draft in the session', () => {
  const CLASSES: ClassId[] = ['sword', 'bow', 'fist'];
  const config = (players: number, seed: string): SessionConfig => ({
    seed,
    players: Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}`, classId: CLASSES[i % 3] })),
    buildId: 'test',
    inputDelay: 0,
    stress: 0,
  });
  const step = (s: Session, cmds: Command[] = []): void => {
    stepSession(s, { tick: s.tick + 1, inputs: s.config.players.map(() => emptyInput()), cmds }, CONTENT);
    for (const w of s.worlds) w.events.length = 0;
  };
  /** Clear the chamber the party is in without fighting it. */
  const clear = (s: Session): void => {
    const w = s.worlds[0];
    w.enemies.length = 0;
    w.flow.wave = w.flow.waves;
    for (let i = 0; i < 4 && w.flow.phase !== 'cleared'; i++) step(s);
    expect(w.flow.phase).toBe('cleared');
    step(s);
  };
  const pick = (slot: number, a: number, seq: number): Command => ({ slot, seq, kind: 'pick', a });

  it('opens for every player when a fight is cleared, and the party waits until everyone has chosen', () => {
    const s = createSession(config(2, 'wait'), CONTENT);
    expect(s.drafts.every((d) => d.offers.length === 0)).toBe(true);
    clear(s);
    expect(s.drafts.map((d) => d.offers.length)).toEqual([3, 3]);
    const stop = stopOf(s)?.n;
    for (let i = 0; i < 400; i++) step(s);
    // well past the quiet after a clear, and still here: one player has not chosen
    expect(stopOf(s)?.n).toBe(stop);
    step(s, [pick(0, 1, 1)]);
    for (let i = 0; i < 10; i++) step(s);
    expect(stopOf(s)?.n).toBe(stop);
    step(s, [pick(1, 0, 1)]);
    step(s);
    expect(stopOf(s)?.n).toBe((stop ?? 0) + 1);
  });

  it('a pick gives that Tuning, a rank at a time, and it comes along to the next chamber', () => {
    const s = createSession(config(1, 'take'), CONTENT);
    clear(s);
    const offer = s.drafts[0].offers.slice();
    const before = { ...worldOf(s, 0).players[0].mods };
    step(s, [pick(0, 2, 1)]);
    const p = worldOf(s, 0).players[0];
    expect(p.tunings).toEqual({ [offer[2]]: 1 });
    expect(p.mods).not.toEqual(before);
    expect(s.drafts[0].offers).toEqual([]);
    expect(s.drafts[0].made).toBe(1);
    for (let i = 0; i < 200 && stopOf(s)?.n === 1; i++) step(s);
    expect(stopOf(s)?.n).toBe(2);
    expect(worldOf(s, 0).players[0].tunings).toEqual({ [offer[2]]: 1 });
    expect(worldOf(s, 0).players[0].mods).toEqual(computeMods({ [offer[2]]: 1 }, CONTENT.tunings, CONTENT.harmonies));
  });

  it('a card that is not on the table, or a second pick, changes nothing', () => {
    const s = createSession(config(1, 'twice'), CONTENT);
    step(s, [pick(0, 0, 1)]);
    expect(worldOf(s, 0).players[0].tunings).toEqual({});
    clear(s);
    step(s, [pick(0, 7, 2)]);
    expect(s.drafts[0].offers.length).toBe(3);
    step(s, [pick(0, 0, 3)]);
    const held = { ...worldOf(s, 0).players[0].tunings };
    step(s, [pick(0, 1, 4)]);
    expect(worldOf(s, 0).players[0].tunings).toEqual(held);
    expect(Object.values(held)).toEqual([1]);
  });

  it('whoever has not chosen when the time is up is given the first card', () => {
    const s = createSession(config(1, 'slow'), CONTENT);
    clear(s);
    const first = s.drafts[0].offers[0];
    for (let i = 0; i < DRAFT_TICKS + 5 && s.drafts[0].offers.length > 0; i++) step(s);
    expect(s.drafts[0].offers).toEqual([]);
    expect(Object.keys(worldOf(s, 0).players[0].tunings)).toEqual([first]);
  });

  it('a camp deals no cards, and a new run starts with none held', () => {
    const s = createSession(config(1, 'camp'), CONTENT);
    let seq = 0;
    for (let guard = 0; guard < 12 && stopOf(s)?.kind !== 'camp'; guard++) {
      const n = stopOf(s)?.n;
      clear(s);
      if (s.drafts[0].offers.length > 0) step(s, [pick(0, 0, ++seq)]);
      for (let i = 0; i < 400 && stopOf(s)?.n === n; i++) step(s);
    }
    expect(stopOf(s)?.kind).toBe('camp');
    for (let i = 0; i < 30; i++) step(s);
    expect(s.drafts[0].offers).toEqual([]);
    // four fights lie before the first camp, each paying one rank of something
    expect(Object.values(worldOf(s, 0).players[0].tunings).reduce((sum, r) => sum + r, 0)).toBe(4);
    step(s, [{ slot: 0, seq: ++seq, kind: 'restart', a: 0 }]);
    expect(worldOf(s, 0).players[0].tunings).toEqual({});
    expect(s.drafts[0].made).toBe(0);
  });

  it('two laptops fed the same bundles deal the same cards, and a snapshot taken in the middle of a draft carries on exactly', () => {
    const a = createSession(config(3, 'pair'), CONTENT);
    const b = createSession(config(3, 'pair'), CONTENT);
    clear(a);
    clear(b);
    expect(b.drafts).toEqual(a.drafts);
    expect(hashSession(b)).toBe(hashSession(a));
    step(a, [pick(1, 2, 1)]);
    const c = loadSession(saveSession(a), CONTENT);
    expect(hashSession(c)).toBe(hashSession(a));
    expect(c.drafts).toEqual(a.drafts);
    for (const s of [a, c]) {
      step(s, [pick(0, 0, 1), pick(2, 1, 1)]);
      for (let i = 0; i < 240; i++) step(s);
    }
    expect(hashSession(c)).toBe(hashSession(a));
    expect(stopOf(c)?.n).toBe(2);
    expect(worldOf(c, 1).players.map((p) => p.tunings)).toEqual(worldOf(a, 1).players.map((p) => p.tunings));
  });
});
