// The run: a route of twelve chambers planned from the seed, walked one generated chamber at a
// time, won at the end of the last and lost when the whole party is down.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { botCommands, classBot, idleBot } from '../src/sim/bots';
import type { Bot } from '../src/sim/bots';
import { standing } from '../src/sim/combat';
import { RUN_LENGTH, flowFor, planRoute } from '../src/sim/run';
import type { Stop } from '../src/sim/run';
import { createSession, runSoFar, stepSession, stopOf, worldOf } from '../src/sim/session';
import type { Session, SessionConfig } from '../src/sim/session';
import { hashSession, loadSession, saveSession } from '../src/sim/snapshot';
import { emptyInput } from '../src/sim/types';
import type { ClassId } from '../src/sim/types';

const CLASSES: ClassId[] = ['sword', 'bow', 'fist'];
const config = (players: number, seed: string): SessionConfig => ({
  seed,
  players: Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}`, classId: CLASSES[i % 3] })),
  buildId: 'test',
  inputDelay: 0,
  stress: 0,
});

/** One tick with a bot in every seat. `unhurt` keeps the party on its feet, to walk the whole road. */
function tick(s: Session, bots: Bot[], unhurt = false): void {
  const inputs = bots.map((b, slot) => ({ ...b.think(worldOf(s, slot), slot) }));
  // the bots take their cards, as a person would
  stepSession(s, { tick: s.tick + 1, inputs, cmds: botCommands(s, CONTENT) }, CONTENT);
  for (const w of s.worlds) {
    w.events.length = 0;
    if (unhurt) for (const p of w.players) if (standing(p)) p.hp = p.maxHp;
  }
}

describe('the route', () => {
  it('is twelve chambers over two zones, within the limits of the design, for every seed', () => {
    const orders = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const r = planRoute(`route-${i}`);
      const kinds = r.map((s) => s.kind);
      orders.add(kinds.join(' '));
      expect(r.length).toBe(RUN_LENGTH);
      expect(r.map((s) => s.n)).toEqual(Array.from({ length: RUN_LENGTH }, (_, n) => n + 1));
      expect(r.slice(0, 6).every((s) => s.zone === 'outer')).toBe(true);
      expect(r.slice(6).every((s) => s.zone === 'inner')).toBe(true);
      // it opens with a fight, each zone ends with a camp and then its boss
      expect(kinds[0]).toBe('fight');
      expect([kinds[4], kinds[5]]).toEqual(['camp', 'miniboss']);
      expect([kinds[10], kinds[11]]).toEqual(['camp', 'boss']);
      expect(kinds.filter((k) => k === 'solo').length).toBe(3);
      // a side-chamber is never next to another and never right before a boss; the Wager stands before an elite
      kinds.forEach((k, n) => {
        if (k === 'solo') {
          expect(kinds[n + 1]).not.toBe('solo');
          expect(kinds[n + 1]).not.toBe('boss');
          expect(kinds[n + 1]).not.toBe('miniboss');
        }
        if (k === 'wager') expect(kinds[n + 1]).toBe('elite');
      });
      // never the same look three times running, never the same shape for two fights running
      for (let n = 2; n < r.length; n++) expect(r[n].look === r[n - 1].look && r[n].look === r[n - 2].look).toBe(false);
      const fights = r.filter((s) => s.kind === 'fight' || s.kind === 'elite' || s.kind === 'wager');
      for (let n = 1; n < fights.length; n++) expect(fights[n].shape).not.toBe(fights[n - 1].shape);
    }
    // the road really differs from seed to seed
    expect(orders.size).toBeGreaterThan(3);
  });

  it('is the same for the same seed and different for another', () => {
    expect(planRoute('same')).toEqual(planRoute('same'));
    expect(planRoute('same')).not.toEqual(planRoute('other'));
  });

  it('asks more of the party where the design says so', () => {
    const at = (kind: Stop['kind'], n: number): Stop => ({ n, kind, zone: 'outer', look: 'court', shape: 'court', size: 24, name: '' });
    const fight = flowFor(at('fight', 4), 1, CONTENT);
    expect(flowFor(at('elite', 4), 1, CONTENT).budget).toBeGreaterThan(fight.budget);
    expect(flowFor(at('boss', 4), 1, CONTENT).budget).toBeGreaterThan(flowFor(at('elite', 4), 1, CONTENT).budget);
    expect(flowFor(at('solo', 4), 1, CONTENT).waves).toBe(1);
    expect(flowFor(at('camp', 4), 1, CONTENT).waves).toBe(0);
    // three players face more than one
    expect(flowFor(at('fight', 4), 3, CONTENT).budget).toBeGreaterThan(fight.budget);
  });
});

describe('a run', () => {
  it('begins in a generated chamber of the Outer Ring, and each attempt is a new road', () => {
    const s = createSession(config(2, 'begin'), CONTENT);
    expect(s.phase).toBe('run');
    expect(s.route.length).toBe(RUN_LENGTH);
    expect(stopOf(s)?.n).toBe(1);
    expect(s.worlds[0].room.id.startsWith('gen-')).toBe(true);
    expect(s.worlds[0].room.zone).toBe('outer');
    const first = s.worlds[0].room.id;
    stepSession(s, { tick: 1, inputs: [], cmds: [{ slot: 0, seq: 1, kind: 'restart', a: 0 }] }, CONTENT);
    expect(s.attempt).toBe(1);
    expect(s.worlds[0].room.id).not.toBe(first);
  });

  it('is won by clearing all twelve chambers, carrying health and Chimes along the road', () => {
    const s = createSession(config(3, 'whole'), CONTENT);
    const bots = CLASSES.map((c) => classBot(c));
    const seen: string[] = [];
    const shapes = new Set<string>();
    let chimesAtCamp = -1;
    let hurtBeforeCamp = -1;
    let last = 0;
    for (let i = 0; i < 60 * 60 * 30 && s.phase === 'run'; i++) {
      const stop = stopOf(s) as Stop;
      if (stop.n !== last) {
        last = stop.n;
        seen.push(stop.kind);
        shapes.add(s.worlds[0].room.id.split('-')[1]);
        expect(s.worlds[0].room.zone).toBe(stop.zone);
        expect(s.worlds[0].chamber).toBe(stop.n);
        if (stop.kind === 'camp' && chimesAtCamp < 0) chimesAtCamp = s.worlds[0].players[0].chimes;
      }
      // leave the party hurt as it walks into the first camp, to see the camp heal it
      const next = s.route[s.stop + 1];
      if (hurtBeforeCamp < 0 && next && next.kind === 'camp' && s.worlds[0].flow.phase === 'cleared') {
        for (const p of s.worlds[0].players) p.hp = Math.round(p.maxHp * 0.4);
        hurtBeforeCamp = 0.4;
      }
      tick(s, bots, hurtBeforeCamp !== 0.4);
      if (hurtBeforeCamp === 0.4 && stopOf(s)?.kind === 'camp') {
        // 40% carried in, 35% given back by the camp
        const p = s.worlds[0].players[0];
        expect(p.hp).toBe(Math.round(p.maxHp * 0.4) + Math.round(p.maxHp * 0.35));
        hurtBeforeCamp = 1;
      }
    }
    expect(s.phase).toBe('won');
    expect(seen).toEqual(s.route.map((r) => r.kind));
    expect(shapes.size).toBeGreaterThanOrEqual(3);
    expect(chimesAtCamp).toBeGreaterThan(0);
    expect(hurtBeforeCamp).toBe(1);
    const t = runSoFar(s);
    expect(t.chambers).toBe(RUN_LENGTH);
    expect(t.kills).toBeGreaterThan(40);
    expect(t.returns).toBeGreaterThan(0);
    // a run that is over stands still, and its numbers do not move
    const hash = hashSession({ ...s, tick: 0, endedFor: 0 });
    for (let i = 0; i < 120; i++) tick(s, bots);
    expect(hashSession({ ...s, tick: 0, endedFor: 0 })).toBe(hash);
    expect(runSoFar(s)).toEqual(t);
  });

  it('is lost when the whole party goes down, and anyone can start the next', () => {
    const s = createSession(config(2, 'idle'), CONTENT);
    const bots = [idleBot(), idleBot()];
    for (let i = 0; i < 60 * 240 && s.phase === 'run'; i++) tick(s, bots);
    expect(s.phase).toBe('lost');
    expect(runSoFar(s).chambers).toBe(0);
    expect(runSoFar(s).damageTaken).toBeGreaterThan(0);
    stepSession(s, { tick: s.tick + 1, inputs: [emptyInput(), emptyInput()], cmds: [{ slot: 1, seq: 1, kind: 'restart', a: 0 }] }, CONTENT);
    expect(s.phase).toBe('run');
    expect(s.attempt).toBe(1);
    expect(stopOf(s)?.n).toBe(1);
    expect(runSoFar(s).damageTaken).toBe(0);
    expect(s.worlds[0].players.every((p) => p.hp === p.maxHp)).toBe(true);
  });

  it('a snapshot taken on the road continues exactly, through the next change of chamber', () => {
    const a = createSession(config(2, 'snap'), CONTENT);
    const botsA = [classBot('sword'), classBot('bow')];
    const botsB = [classBot('sword'), classBot('bow')];
    // play both sets of bots through the same ticks so their own memories match
    const b0 = createSession(config(2, 'snap'), CONTENT);
    for (let i = 0; i < 400; i++) {
      tick(a, botsA, true);
      tick(b0, botsB, true);
    }
    const b = loadSession(saveSession(a), CONTENT);
    expect(hashSession(b)).toBe(hashSession(a));
    const from = stopOf(a)?.n ?? 0;
    for (let i = 0; i < 60 * 240 && (stopOf(a)?.n ?? 0) < from + 2; i++) {
      tick(a, botsA, true);
      tick(b, botsB, true);
      if (i % 97 === 0) expect(hashSession(b)).toBe(hashSession(a));
    }
    expect(stopOf(a)?.n).toBe(from + 2);
    expect(hashSession(b)).toBe(hashSession(a));
    expect(b.worlds[0].room.id).toBe(a.worlds[0].room.id);
  });
});
