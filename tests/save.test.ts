// What a player keeps between runs: it survives a reload and a damaged entry, the Attunement
// takes Resonance and gives what it says, every bonus changes a run in the stated way, and a
// save can be carried to another address as a code.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { ATTUNEMENT, RESONANCE } from '../src/content/attunement';
import { attune, bankRun, boonsFor, cleanSave, freshSave, issuable, issue, loadSave, mayIssue, offered, priceOf, rankOf, readCode, resonanceFor, storeSave, writeCode } from '../src/game/save';
import type { Save } from '../src/game/save';
import type { Store } from '../src/game/settings';
import { HostCore } from '../src/net/hostCore';
import type { Peer } from '../src/net/hostCore';
import { BOON_LIMIT, cleanBoons, noBoons } from '../src/sim/boons';
import type { Boons } from '../src/sim/boons';
import type { ContentRegistry } from '../src/sim/defs';
import { candidates } from '../src/sim/draft';
import type { TuningDef } from '../src/sim/mods';
import { createSession, stepSession } from '../src/sim/session';
import type { RunStats, Session } from '../src/sim/session';
import { DASH } from '../src/sim/tuning';
import type { ClassId } from '../src/sim/types';

function memory(initial: Record<string, string> = {}): Store & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}
const rich = (resonance = 500): Save => ({ ...freshSave(), resonance, earned: resonance });
const stats = (chambers: number, o: Partial<RunStats> = {}): RunStats => ({ chambers, kills: 0, damageDealt: 0, damageTaken: 0, returns: 0, bestRally: 0, ...o });

/** The game's content with two Tunings of the Sword's added: one anyone may be offered, one locked. */
const some = Object.values(CONTENT.tunings)[0];
const own: TuningDef = { ...some, id: 'test-own', name: 'Own', owner: 'sword', build: 'Test', locked: false };
const locked: TuningDef = { ...some, id: 'test-locked', name: 'Locked', owner: 'sword', build: 'Test', locked: true };
const WITH: ContentRegistry = { ...CONTENT, tunings: { ...CONTENT.tunings, [own.id]: own, [locked.id]: locked } };

const run = (boons: Boons | undefined, classId: ClassId = 'sword', content: ContentRegistry = CONTENT): Session =>
  createSession({ seed: 'boons', players: [{ name: 'P1', classId, boons }], buildId: 'test', inputDelay: 0, stress: 0 }, content);

describe('a save', () => {
  it('is empty on a first visit, and survives a reload', () => {
    const store = memory();
    expect(loadSave(store)).toEqual(freshSave());
    const save = rich(40);
    expect(attune(save, 'vitality')).toBe(true);
    bankRun(save, 'bow', stats(7, { bestRally: 12 }), false, 9000, 6);
    storeSave(store, save);
    expect(loadSave(store)).toEqual(save);
    // a browser with no storage to give keeps nothing, and breaks nothing
    expect(loadSave(null)).toEqual(freshSave());
    expect(() => storeSave(null, save)).not.toThrow();
  });

  it('keeps what can be read of an old or damaged one', () => {
    expect(loadSave(memory({ 'resound.save': '{{{' }))).toEqual(freshSave());
    expect(loadSave(memory({ 'resound.save': 'null' }))).toEqual(freshSave());
    const damaged = { v: 0, save: { resonance: 17.9, bought: { vitality: 99, purse: 'two', nonsense: 3 }, issued: { sword: 42 }, records: { bow: { runs: 2, wins: 5, best: 8 }, fist: 'gone' } } };
    const read = loadSave(memory({ 'resound.save': JSON.stringify(damaged) }));
    expect(read.resonance).toBe(17);
    expect(read.earned).toBe(17);
    // a rank past the last is the last; what is not an entry is dropped
    expect(read.bought).toEqual({ vitality: 3 });
    expect(read.issued).toEqual({ sword: '', bow: '', fist: '' });
    expect(read.records.bow).toEqual({ runs: 2, wins: 2, best: 8, rally: 0, fastest: 0 });
    expect(read.records.fist).toEqual(freshSave().records.fist);
    expect(cleanSave('nonsense')).toEqual(freshSave());
  });
});

describe('the Attunement', () => {
  it('takes Resonance for each rank, and sells nothing that is not paid for', () => {
    const save = rich(20);
    const vitality = ATTUNEMENT.find((d) => d.id === 'vitality');
    if (!vitality) throw new Error('no Vitality');
    expect(priceOf(save, vitality)).toBe(5);
    expect(attune(save, 'vitality')).toBe(true);
    expect([save.resonance, rankOf(save, 'vitality'), priceOf(save, vitality)]).toEqual([15, 1, 10]);
    expect(attune(save, 'vitality')).toBe(true);
    // 5 left, and the third rank costs 18
    expect(attune(save, 'vitality')).toBe(false);
    expect([save.resonance, rankOf(save, 'vitality')]).toEqual([5, 2]);
    save.resonance = 100;
    expect(attune(save, 'vitality')).toBe(true);
    // every rank is held: there is nothing more to buy
    expect(priceOf(save, vitality)).toBe(-1);
    expect(attune(save, 'vitality')).toBe(false);
    expect(save.resonance).toBe(82);
    expect(attune(save, 'no-such-thing')).toBe(false);
  });

  it('gives what each entry says', () => {
    const save = rich();
    expect(boonsFor(save, 'sword', CONTENT)).toEqual(noBoons());
    for (const id of ['vitality', 'vitality', 'vitality', 'purse', 'purse', 'second-opinion', 'second-opinion', 'quick-step', 'fortune']) expect(attune(save, id)).toBe(true);
    const b = boonsFor(save, 'bow', CONTENT);
    expect(b).toEqual({ health: 30, chimes: 60, rerolls: 2, dash: 0.15, fortune: 0.2, unlocked: [], issued: '' });
    // and never more than the session will honour
    expect(b.health).toBeLessThanOrEqual(BOON_LIMIT.health);
    expect(cleanBoons(b, 'bow', CONTENT)).toEqual(b);
  });

  it('shows only what can be had: an entry that names a Tuning waits for that Tuning', () => {
    const ids = offered(CONTENT).map((d) => d.id);
    for (const d of ATTUNEMENT) {
      if (d.gives.unlock) expect(ids.includes(d.id)).toBe(!!CONTENT.tunings[d.gives.unlock]);
      else if (!d.gives.issue) expect(ids).toContain(d.id);
    }
    // the Sword has Tunings of its own in this content, so it can be issued one
    expect(
      offered(WITH)
        .filter((d) => d.gives.issue)
        .map((d) => d.gives.issue),
    ).toContain('sword');
  });

  it('issues a class one of its own Tunings, once the right is bought', () => {
    const save = rich();
    expect(issuable('sword', save, WITH)).toContain('test-own');
    expect(issuable('sword', save, WITH)).not.toContain('test-locked');
    expect(issuable('bow', save, WITH)).not.toContain('test-own');
    // not before it is bought
    expect(issue(save, 'sword', 'test-own', WITH)).toBe(false);
    expect(attune(save, 'issue-sword')).toBe(true);
    expect(mayIssue(save, 'sword')).toBe(true);
    expect(mayIssue(save, 'bow')).toBe(false);
    // not somebody else's, and not a locked one
    expect(issue(save, 'sword', 'stout-heart', WITH)).toBe(false);
    expect(issue(save, 'sword', 'test-locked', WITH)).toBe(false);
    expect(issue(save, 'sword', 'test-own', WITH)).toBe(true);
    expect(boonsFor(save, 'sword', WITH).issued).toBe('test-own');
    expect(boonsFor(save, 'bow', WITH).issued).toBe('');
    // and it can be put down again
    expect(issue(save, 'sword', '', WITH)).toBe(true);
    expect(boonsFor(save, 'sword', WITH).issued).toBe('');
  });
});

describe('what a player brings to a run', () => {
  it('nothing, without the Attunement', () => {
    const p = run(undefined).worlds[0].players[0];
    expect([p.maxHp, p.hp, p.chimes, Object.keys(p.tunings).length]).toEqual([100, 100, 0, 0]);
    expect(p.boons).toEqual(noBoons());
  });

  it('more health, Chimes to begin with, and the right to ask for other cards', () => {
    const s = run({ ...noBoons(), health: 20, chimes: 30, rerolls: 2 });
    const p = s.worlds[0].players[0];
    expect([p.maxHp, p.hp, p.chimes]).toEqual([120, 120, 30]);
    expect(s.drafts[0].rerolls).toBe(2);
    // and again in every run after the first
    stepSession(s, { tick: 1, inputs: [], cmds: [{ slot: 0, seq: 1, kind: 'restart', a: 0 }] }, CONTENT);
    const q = s.worlds[0].players[0];
    expect([s.attempt, q.maxHp, q.chimes, s.drafts[0].rerolls]).toEqual([1, 120, 30, 2]);
  });

  it('a dash that comes back sooner, and more Chimes', () => {
    const plain = run(undefined).worlds[0].players[0];
    const quick = run({ ...noBoons(), dash: 0.15, fortune: 0.2 }).worlds[0].players[0];
    expect(quick.mods.dashRecharge).toBeCloseTo(plain.mods.dashRecharge * 0.85);
    expect(quick.mods.chimeMul).toBeCloseTo(plain.mods.chimeMul * 1.2);
    // spend a charge on each and see whose comes back first
    const comesBack = (boons: Boons | undefined): number => {
      const s = run(boons);
      const p = s.worlds[0].players[0];
      p.dashCharges = p.dashMaxCharges - 1;
      let ticks = 0;
      while (s.worlds[0].players[0].dashCharges < p.dashMaxCharges && ticks < 2000) {
        stepSession(s, { tick: s.tick + 1, inputs: [], cmds: [] }, CONTENT);
        ticks++;
      }
      return ticks;
    };
    const slow = comesBack(undefined);
    const fast = comesBack({ ...noBoons(), dash: 0.15 });
    expect(slow).toBeGreaterThanOrEqual(Math.floor(DASH.recharge * 60));
    expect(fast).toBeLessThan(slow);
    expect(fast / slow).toBeCloseTo(0.85, 1);
  });

  it('a Tuning to begin with, and a locked one they may now be offered', () => {
    const s = run({ ...noBoons(), issued: 'test-own', unlocked: ['test-locked'] }, 'sword', WITH);
    const p = s.worlds[0].players[0];
    expect(p.tunings).toEqual({ 'test-own': 1 });
    const pool = (unlocked: readonly string[]): string[] => candidates('sword', p.tunings, WITH, unlocked).map((t) => t.id);
    expect(pool(p.boons.unlocked)).toContain('test-locked');
    expect(pool([])).not.toContain('test-locked');
  });

  it('is held to what the Attunement can give, whatever a laptop claims', () => {
    const greedy = { health: 9999, chimes: 1e9, rerolls: 50, dash: 0.99, fortune: 12, unlocked: ['test-locked', 'stout-heart', 'no-such', 7], issued: 'stout-heart' };
    const b = cleanBoons(greedy, 'sword', WITH);
    expect(b).toEqual({ health: 30, chimes: 60, rerolls: 2, dash: 0.15, fortune: 0.2, unlocked: ['test-locked'], issued: '' });
    // a Tuning of another class cannot be unlocked or issued
    expect(cleanBoons({ unlocked: ['test-locked'], issued: 'test-own' }, 'bow', WITH)).toEqual(noBoons());
    // a locked Tuning can be issued only to someone who has unlocked it
    expect(cleanBoons({ issued: 'test-locked' }, 'sword', WITH).issued).toBe('');
    expect(cleanBoons({ issued: 'test-locked', unlocked: ['test-locked'] }, 'sword', WITH).issued).toBe('test-locked');
    expect(cleanBoons('nonsense', 'sword', WITH)).toEqual(noBoons());
    const p = run(greedy as unknown as Boons, 'sword', WITH).worlds[0].players[0];
    expect([p.maxHp, p.chimes]).toEqual([130, 60]);
  });

  it('travels through the lobby: the host builds the game with what each laptop said', () => {
    const host = new HostCore(CONTENT, { buildId: 'test', seed: 'lobby' });
    const heard: string[] = [];
    const peer: Peer = { send: (text) => heard.push(text), close: () => undefined };
    const boons = { ...noBoons(), health: 20, chimes: 30, rerolls: 1, dash: 0.15 };
    host.message(peer, JSON.stringify({ t: 'hello', v: 1, build: 'test', token: 'token-aaaa-0001', name: 'Ada', classId: 'bow', boons: { ...boons, health: 5000 } }), 0);
    // changing class says the boons again, as that class has them
    host.message(peer, JSON.stringify({ t: 'seat', classId: 'fist', ready: true, boons }), 10);
    host.message(peer, JSON.stringify({ t: 'start' }), 20);
    expect(host.phase).toBe('game');
    const s = host.session;
    if (!s) throw new Error('the host began no game');
    expect(s.config.players[0].boons).toEqual(boons);
    const p = s.worlds[0].players[0];
    expect([p.classId, p.maxHp, p.chimes, s.drafts[0].rerolls]).toEqual(['fist', 120, 30, 1]);
    // and the laptop is sent the same description, so it builds the same game
    const start = heard.map((t) => JSON.parse(t) as { t: string; config?: { players: Array<{ boons: Boons }> } }).find((m) => m.t === 'start');
    expect(start?.config?.players[0].boons).toEqual(boons);
  });
});

describe('what a run earns', () => {
  it('Resonance for each chamber, more for the Carillon, and more again for the Toll', () => {
    expect(resonanceFor(stats(0), false, 6)).toBe(0);
    expect(resonanceFor(stats(5), false, 6)).toBe(5 * RESONANCE.chamber);
    expect(resonanceFor(stats(6), false, 6)).toBe(6 * RESONANCE.chamber + RESONANCE.miniboss);
    expect(resonanceFor(stats(11), false, 6)).toBe(11 + RESONANCE.miniboss);
    expect(resonanceFor(stats(12), true, 6)).toBe(12 + RESONANCE.miniboss + RESONANCE.boss);
  });

  it('is written into the save: the Resonance, and the records of the class that walked', () => {
    const save = freshSave();
    expect(bankRun(save, 'fist', stats(4, { bestRally: 9 }), false, 5000, 6)).toBe(4);
    expect(bankRun(save, 'fist', stats(12, { bestRally: 14 }), true, 30000, 6)).toBe(27);
    expect(bankRun(save, 'fist', stats(12, { bestRally: 3 }), true, 41000, 6)).toBe(27);
    expect([save.resonance, save.earned]).toEqual([58, 58]);
    expect(save.records.fist).toEqual({ runs: 3, wins: 2, best: 12, rally: 14, fastest: 30000 });
    expect(save.records.sword).toEqual(freshSave().records.sword);
    // spending does not undo what was earned
    attune(save, 'vitality');
    expect([save.resonance, save.earned]).toEqual([53, 58]);
  });
});

describe('a save as a code', () => {
  it('written on one address restores the save on another', () => {
    const save = rich(33);
    attune(save, 'purse');
    attune(save, 'quick-step');
    bankRun(save, 'sword', stats(12, { bestRally: 20 }), true, 28000, 6);
    const code = writeCode(save);
    expect(code).toMatch(/^RS1\.[A-Za-z0-9_-]+\.[a-z0-9]+$/);
    // another address: its own empty storage
    const elsewhere = memory();
    const read = readCode(`  ${code}\n`);
    if (!read) throw new Error('the code did not read back');
    storeSave(elsewhere, read);
    expect(loadSave(elsewhere)).toEqual(save);
  });

  it('is refused whole if it is not a sound code', () => {
    const code = writeCode(rich(12));
    expect(readCode('')).toBeNull();
    expect(readCode('hello there')).toBeNull();
    expect(readCode(code.slice(0, -3))).toBeNull();
    expect(readCode(code.replace('RS1', 'RS9'))).toBeNull();
    // one letter wrong in the middle
    const at = Math.floor(code.length / 2);
    const wrong = code.slice(0, at) + (code[at] === 'A' ? 'B' : 'A') + code.slice(at + 1);
    expect(readCode(wrong)).toBeNull();
  });
});
