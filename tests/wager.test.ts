// The Wager: the party is asked whether it will carry a Discord into the elite's chamber. More
// than half must say yes. Taken, the chamber is fought Brittle and pays double.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { botCommands } from '../src/sim/bots';
import { damageEnemy } from '../src/sim/combat';
import { dropChimes } from '../src/sim/flow';
import { planRoute } from '../src/sim/run';
import { createSession, stepSession, stopOf } from '../src/sim/session';
import type { Command, Session } from '../src/sim/session';
import { hashSession } from '../src/sim/snapshot';
import { SIM_HZ } from '../src/sim/tuning';
import type { ClassId } from '../src/sim/types';
import { VOTE_NONE, VOTE_TAKE, VOTE_WALK, WAGER, carried, noWager, offer, onTable, stepTable, vote } from '../src/sim/wager';
import { openWorld } from './helpers';

const CLASSES: ClassId[] = ['sword', 'bow', 'fist'];
/** The chamber the Wager is offered in is always the eighth, and the elite it is a wager on the ninth. */
const AT = 8;
const begin = (players: number, seed: string): Session =>
  createSession({ seed, players: Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}`, classId: CLASSES[i % 3] })), buildId: 'test', inputDelay: 0, stress: 0, startAt: AT }, CONTENT);
const step = (s: Session, cmds: Command[] = []): void => {
  stepSession(s, { tick: s.tick + 1, inputs: [], cmds }, CONTENT);
  for (const w of s.worlds) w.events.length = 0;
};
const ask = (s: Session, slot: number, kind: Command['kind'], a: number): Command => ({ slot, seq: s.lastSeq[slot] + 1, kind, a });

/** Beat the chamber the party is in: whatever arrives is struck down at once, and nobody is hurt. */
function clear(s: Session): void {
  for (let t = 0; t < 120 * SIM_HZ; t++) {
    const w = s.worlds[0];
    if (w.flow.phase === 'cleared') return;
    for (const e of w.enemies) if (!e.dead) damageEnemy(w, e, 99999, { kind: 'other', by: -1, dx: 1, dy: 0 });
    for (const p of w.players) p.iframes = 1;
    step(s);
  }
  throw new Error('the chamber was never cleared');
}
/** Everyone takes the first card they are offered, for as long as cards are offered. Returns how many each took. */
function draft(s: Session): number[] {
  const took = s.drafts.map(() => 0);
  for (let t = 0; t < 400; t++) {
    const cmds: Command[] = [];
    s.drafts.forEach((d, slot) => {
      if (d.offers.length === 0) return;
      cmds.push(ask(s, slot, 'pick', 0));
      took[slot]++;
    });
    if (cmds.length === 0 && t > 4) break;
    step(s, cmds);
  }
  return took;
}
/** Play to the moment the Wager is on the table. */
function toTheTable(s: Session): void {
  clear(s);
  draft(s);
  for (let t = 0; t < 10 * SIM_HZ && !onTable(s.wager); t++) step(s);
  expect(onTable(s.wager)).toBe(true);
}
const answer = (s: Session, votes: number[]): void => {
  step(
    s,
    votes.map((a, slot) => ask(s, slot, 'wager', a)),
  );
  for (let t = 0; t < 2 * SIM_HZ && stopOf(s)?.n === AT; t++) step(s);
};

describe('the vote', () => {
  it('is carried only when more than half say yes: a tie walks on, and so does silence', () => {
    const said = (votes: number[]): boolean => carried({ ...noWager(votes.length), votes });
    expect(said([VOTE_TAKE])).toBe(true);
    expect(said([VOTE_WALK])).toBe(false);
    expect(said([VOTE_NONE])).toBe(false);
    expect(said([VOTE_TAKE, VOTE_WALK])).toBe(false);
    expect(said([VOTE_TAKE, VOTE_TAKE])).toBe(true);
    expect(said([VOTE_TAKE, VOTE_NONE])).toBe(false);
    expect(said([VOTE_TAKE, VOTE_TAKE, VOTE_WALK])).toBe(true);
    expect(said([VOTE_TAKE, VOTE_WALK, VOTE_NONE])).toBe(false);
  });

  it('closes when everyone has answered, or when the count runs out', () => {
    const wg = noWager(2);
    // nothing to answer until it is put to the party
    vote(wg, 0, VOTE_TAKE);
    expect(wg.votes).toEqual([VOTE_NONE, VOTE_NONE]);
    offer(wg);
    vote(wg, 0, VOTE_TAKE);
    expect(stepTable(wg)).toBe(false);
    // a mind may be changed while the table is open
    vote(wg, 0, VOTE_WALK);
    vote(wg, 0, VOTE_TAKE);
    vote(wg, 1, VOTE_TAKE);
    expect(stepTable(wg)).toBe(true);
    expect([wg.decided, wg.on, onTable(wg)]).toEqual([true, true, false]);
    // and not after
    vote(wg, 1, VOTE_WALK);
    expect(wg.votes[1]).toBe(VOTE_TAKE);

    const quiet = noWager(3);
    offer(quiet);
    vote(quiet, 2, VOTE_TAKE);
    let ticks = 0;
    while (!stepTable(quiet)) ticks++;
    expect(ticks).toBe(WAGER.count - 1);
    expect([quiet.decided, quiet.on]).toEqual([true, false]);
  });
});

describe('the Wager on the road', () => {
  it('stands before an elite on every road, and is put to the party once the cards are taken', () => {
    for (let i = 0; i < 100; i++) {
      const r = planRoute(`wager-${i}`);
      expect([r[AT - 1].kind, r[AT].kind]).toEqual(['wager', 'elite']);
    }
    const s = begin(2, 'offered');
    clear(s);
    // not while anyone is still choosing a card
    for (let t = 0; t < 6 * SIM_HZ; t++) step(s);
    expect(onTable(s.wager)).toBe(false);
    expect(stopOf(s)?.n).toBe(AT);
    draft(s);
    for (let t = 0; t < 2 * SIM_HZ && !onTable(s.wager); t++) step(s);
    expect(onTable(s.wager)).toBe(true);
    // and the road waits for the answer
    for (let t = 0; t < 5 * SIM_HZ; t++) step(s);
    expect(stopOf(s)?.n).toBe(AT);
  });

  it('taken, makes the elite’s chamber Brittle and pays double Chimes and a second, rare card', () => {
    const took = begin(1, 'stakes');
    const walked = begin(1, 'stakes');
    toTheTable(took);
    toTheTable(walked);
    const before = took.worlds[0].players[0].chimes;
    answer(took, [VOTE_TAKE]);
    answer(walked, [VOTE_WALK]);
    for (const s of [took, walked]) expect(stopOf(s)?.kind).toBe('elite');

    const p = took.worlds[0].players[0];
    const q = walked.worlds[0].players[0];
    expect([took.worlds[0].flow.discord, took.worlds[0].flow.chimeMul]).toEqual(['brittle', WAGER.chimes]);
    expect([walked.worlds[0].flow.discord, walked.worlds[0].flow.chimeMul]).toEqual(['', 1]);
    expect(p.maxHp).toBe(Math.round(q.maxHp * (1 - WAGER.brittle)));
    expect(p.hp).toBeLessThanOrEqual(p.maxHp);
    expect(q.hp).toBe(q.maxHp);

    clear(took);
    clear(walked);
    // the Discord lifts with the last blow: the health it took can be had again, but is not handed back
    expect(took.worlds[0].players[0].maxHp).toBe(q.maxHp);
    expect(took.worlds[0].players[0].hp).toBeLessThanOrEqual(Math.round(q.maxHp * (1 - WAGER.brittle)));
    expect(took.wager.on).toBe(false);
    // the second card is a rare deal
    const first = took.drafts[0].offers.slice();
    expect(first.length).toBe(3);
    step(took, [ask(took, 0, 'pick', 0)]);
    const second = took.drafts[0].offers;
    expect(second.length).toBe(3);
    expect(second.some((id) => CONTENT.tunings[id].rarity >= 1)).toBe(true);
    expect(draft(took)).toEqual([1]);
    expect(draft(walked)).toEqual([1]);
    for (const s of [took, walked]) for (let t = 0; t < 8 * SIM_HZ && stopOf(s)?.n === AT + 1; t++) step(s);
    for (const s of [took, walked]) expect(stopOf(s)?.n).toBe(AT + 2);
    // Every drop is doubled exactly (below); the two chambers scatter their Chimes differently
    // from then on, so the sums of a whole fight are only close to double.
    const gained = took.worlds[0].players[0].chimes - before;
    const plain = walked.worlds[0].players[0].chimes - before;
    expect(plain).toBeGreaterThan(0);
    expect(gained / plain).toBeGreaterThan(1.7);
    expect(gained / plain).toBeLessThan(2.3);
    // one more Tuning than the road that walked on
    const ranks = (s: Session): number => Object.values(s.worlds[0].players[0].tunings).reduce((n, r) => n + r, 0);
    expect(ranks(took)).toBe(ranks(walked) + 1);
    // and the next chamber is an ordinary one again
    expect([took.worlds[0].flow.discord, took.worlds[0].flow.chimeMul]).toEqual(['', 1]);
  });

  it('doubles every Chime the wagered chamber drops', () => {
    const w = openWorld();
    dropChimes(w, 5, 5, 17);
    expect(w.flow.pickups.reduce((n, c) => n + c.value, 0)).toBe(17);
    w.flow.pickups.length = 0;
    w.flow.chimeMul = WAGER.chimes;
    dropChimes(w, 5, 5, 17);
    expect(w.flow.pickups.reduce((n, c) => n + c.value, 0)).toBe(17 * WAGER.chimes);
  });

  it('walked on, changes nothing', () => {
    const s = begin(3, 'walk');
    toTheTable(s);
    const health = s.worlds[0].players.map((p) => p.maxHp);
    answer(s, [VOTE_WALK, VOTE_WALK, VOTE_TAKE]);
    expect(stopOf(s)?.kind).toBe('elite');
    expect(s.wager.on).toBe(false);
    expect(s.worlds[0].players.map((p) => p.maxHp)).toEqual(health);
    expect(s.worlds[0].flow.discord).toBe('');
  });

  it('a tie walks on, two of three carry it, and silence walks on when the count runs out', () => {
    const tie = begin(2, 'tie');
    toTheTable(tie);
    answer(tie, [VOTE_TAKE, VOTE_WALK]);
    expect([stopOf(tie)?.n, tie.worlds[0].flow.discord]).toEqual([AT + 1, '']);

    const two = begin(3, 'two-of-three');
    toTheTable(two);
    answer(two, [VOTE_TAKE, VOTE_WALK, VOTE_TAKE]);
    expect([stopOf(two)?.n, two.worlds[0].flow.discord]).toEqual([AT + 1, 'brittle']);
    expect(two.worlds[0].players.every((p) => p.maxHp === 70)).toBe(true);

    const silent = begin(2, 'silent');
    toTheTable(silent);
    step(silent, [ask(silent, 0, 'wager', VOTE_TAKE)]);
    for (let t = 0; t < WAGER.count - 3 * SIM_HZ; t++) step(silent);
    expect(stopOf(silent)?.n).toBe(AT);
    for (let t = 0; t < 4 * SIM_HZ && stopOf(silent)?.n === AT; t++) step(silent);
    expect([stopOf(silent)?.n, silent.worlds[0].flow.discord]).toEqual([AT + 1, '']);
  });

  it('the same answers give the same game on every laptop', () => {
    const a = begin(3, 'agree');
    const b = begin(3, 'agree');
    for (const s of [a, b]) {
      toTheTable(s);
      answer(s, [VOTE_TAKE, VOTE_TAKE, VOTE_WALK]);
    }
    expect(hashSession(a)).toBe(hashSession(b));
    // an answer outside a Wager is nothing
    const hash = hashSession(a);
    const tick = a.tick;
    step(a, [ask(a, 0, 'wager', VOTE_WALK)]);
    step(b);
    expect(a.tick).toBe(tick + 1);
    expect(a.wager.votes).toEqual(b.wager.votes);
    expect(hash).not.toBe('');
  });

  it('bots in good health take it, and bots that are hurt walk on', () => {
    const well = begin(3, 'bots-well');
    toTheTable(well);
    for (let t = 0; t < 3 * SIM_HZ && stopOf(well)?.n === AT; t++) step(well, botCommands(well, CONTENT));
    expect([stopOf(well)?.n, well.worlds[0].flow.discord]).toEqual([AT + 1, 'brittle']);

    const hurt = begin(3, 'bots-hurt');
    toTheTable(hurt);
    for (const p of hurt.worlds[0].players) p.hp = 30;
    for (let t = 0; t < 3 * SIM_HZ && stopOf(hurt)?.n === AT; t++) step(hurt, botCommands(hurt, CONTENT));
    expect([stopOf(hurt)?.n, hurt.worlds[0].flow.discord]).toEqual([AT + 1, '']);
  });
});
