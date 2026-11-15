// The fork: at a side-chamber every player walks into a chamber of their own, at the same moment,
// and the party meets again in the next chamber it shares.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { damageEnemy, damagePlayer, standing } from '../src/sim/combat';
import { FORK, forkDone } from '../src/sim/fork';
import { setMove } from '../src/sim/input';
import { planRoute } from '../src/sim/run';
import { createSession, stepSession, stopOf, worldOf } from '../src/sim/session';
import type { Command, Session } from '../src/sim/session';
import { hashSession, loadSession, saveSession } from '../src/sim/snapshot';
import { REVIVE, SIM_HZ } from '../src/sim/tuning';
import { emptyInput } from '../src/sim/types';
import type { ClassId, InputFrame, World } from '../src/sim/types';

const CLASSES: ClassId[] = ['sword', 'bow', 'fist'];
/** The Inner Ring always opens with a side-chamber: the seventh chamber. */
const AT = 7;
const begin = (players: number, seed: string): Session =>
  createSession({ seed, players: Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}`, classId: CLASSES[i % 3] })), buildId: 'test', inputDelay: 0, stress: 0, startAt: AT }, CONTENT);
const step = (s: Session, cmds: Command[] = [], inputs: Array<InputFrame | undefined> = []): void => {
  stepSession(s, { tick: s.tick + 1, inputs, cmds }, CONTENT);
  for (const w of s.worlds) w.events.length = 0;
};
/** Strike down everything in a chamber as it arrives, until the chamber is cleared; nobody in it is hurt. */
function clear(s: Session, w: World): void {
  for (let t = 0; t < 60 * SIM_HZ && w.flow.phase !== 'cleared'; t++) {
    for (const e of w.enemies) if (!e.dead) damageEnemy(w, e, 99999, { kind: 'other', by: -1, dx: 1, dy: 0 });
    for (const p of w.players) p.iframes = 1;
    step(s);
  }
  expect(w.flow.phase).toBe('cleared');
}
/** Everyone who is offered cards takes the first. */
function draft(s: Session): void {
  for (let t = 0; t < 400; t++) {
    const cmds: Command[] = [];
    s.drafts.forEach((d, slot) => {
      if (d.offers.length > 0) cmds.push({ slot, seq: s.lastSeq[slot] + 1, kind: 'pick', a: 0 });
    });
    if (cmds.length === 0 && t > 4) break;
    step(s, cmds);
  }
}
const until = (s: Session, done: () => boolean, seconds: number): number => {
  let t = 0;
  while (!done() && t < seconds * SIM_HZ) {
    step(s);
    t++;
  }
  return t;
};

describe('where the party splits', () => {
  it('at every side-chamber, when there is more than one of them', () => {
    for (let i = 0; i < 40; i++) expect(planRoute(`fork-${i}`).filter((r) => r.kind === 'solo')).toHaveLength(3);
    expect(planRoute('fork')[AT - 1].kind).toBe('solo');
    // alone there is nothing to split
    const one = begin(1, 'alone');
    expect(one.worlds).toHaveLength(1);
    expect(one.apartFor).toBe(-1);
    for (const n of [2, 3]) {
      const s = begin(n, 'apart');
      expect(s.worlds).toHaveLength(n);
      expect(s.where).toEqual(Array.from({ length: n }, (_, i) => i));
      // a chamber of their own each, and no two of them the same chamber
      s.worlds.forEach((w, i) => {
        expect(w.players.map((p) => p.slot)).toEqual([i]);
        expect(worldOf(s, i)).toBe(w);
        expect(w.chamber).toBe(AT);
        expect(w.flow.kind).toBe('solo');
      });
      expect(new Set(s.worlds.map((w) => w.room.id)).size).toBe(n);
      expect(new Set(s.worlds.map((w) => w.room.tiles.join(''))).size).toBe(n);
    }
  });

  it('a chamber of one’s own is a fight sized for one', () => {
    const three = begin(3, 'sized');
    const one = begin(1, 'sized');
    for (const w of three.worlds) {
      expect(w.flow.waves).toBe(one.worlds[0].flow.waves);
      expect(w.flow.budget).toBeCloseTo(one.worlds[0].flow.budget);
    }
  });

  it('every hand moves its own player, in its own chamber', () => {
    const s = begin(3, 'hands');
    const inputs: InputFrame[] = [emptyInput(), emptyInput(), emptyInput()];
    setMove(inputs[1], 1, 0);
    const at = s.worlds.map((w) => [w.players[0].x, w.players[0].y]);
    for (let t = 0; t < 30; t++) {
      for (const w of s.worlds) for (const p of w.players) p.iframes = 1;
      step(s, [], inputs);
    }
    expect([s.worlds[0].players[0].x, s.worlds[0].players[0].y]).toEqual(at[0]);
    expect(s.worlds[1].players[0].x).not.toBe(at[1][0]);
    expect([s.worlds[2].players[0].x, s.worlds[2].players[0].y]).toEqual(at[2]);
  });
});

describe('together again', () => {
  it('everyone arrives in the same next chamber, with what they earned on their own', () => {
    for (const n of [2, 3]) {
      const s = begin(n, `meet-${n}`);
      // one finishes early: the road waits
      clear(s, s.worlds[0]);
      draft(s);
      until(s, () => false, 4);
      expect(stopOf(s)?.n).toBe(AT);
      expect(s.worlds).toHaveLength(n);
      for (let i = 1; i < n; i++) clear(s, s.worlds[i]);
      draft(s);
      until(s, () => stopOf(s)?.n !== AT, 6);
      expect(stopOf(s)?.n).toBe(AT + 1);
      expect(s.worlds).toHaveLength(1);
      expect(s.where).toEqual(Array.from({ length: n }, () => 0));
      expect(s.worlds[0].players.map((p) => p.slot)).toEqual(Array.from({ length: n }, (_, i) => i));
      // each took a card in their own chamber and carries it on
      for (const p of s.worlds[0].players) expect(Object.keys(p.tunings)).toHaveLength(1);
      expect(s.apartFor).toBe(-1);
    }
  });

  it('each is paid for their own chamber when they clear it, not before and not for another’s', () => {
    const s = begin(3, 'paid');
    clear(s, s.worlds[1]);
    step(s);
    expect(s.drafts.map((d) => d.offers.length > 0)).toEqual([false, true, false]);
    expect(s.paid).toEqual([false, true, false]);
  });

  it('going down alone costs the prize, not the run', () => {
    const s = begin(3, 'down');
    const fallen = s.worlds[2].players[0];
    damagePlayer(s.worlds[2], fallen, 9999, fallen.x + 1, fallen.y, 0);
    expect(standing(fallen)).toBe(false);
    expect(forkDone(s.worlds[2])).toBe(true);
    // the run goes on, and the others are not held up
    until(s, () => false, 5);
    expect(s.phase).toBe('run');
    clear(s, s.worlds[0]);
    clear(s, s.worlds[1]);
    draft(s);
    until(s, () => stopOf(s)?.n !== AT, 6);
    expect(stopOf(s)?.n).toBe(AT + 1);
    const back = s.worlds[0].players[2];
    expect(standing(back)).toBe(true);
    expect(back.hp).toBe(Math.max(1, Math.round(back.maxHp * REVIVE.hp)));
    expect(Object.keys(back.tunings)).toHaveLength(0);
    expect(s.worlds[0].players.slice(0, 2).every((p) => Object.keys(p.tunings).length === 1)).toBe(true);
  });

  it('once all but one are done, the last has a while and is then fetched as they stand', () => {
    const s = begin(3, 'last');
    clear(s, s.worlds[0]);
    clear(s, s.worlds[1]);
    draft(s);
    // the third never finishes; keep them alive in there
    const slow = s.worlds[2];
    let ticks = 0;
    while (stopOf(s)?.n === AT && ticks < 40 * SIM_HZ) {
      for (const p of slow.players) p.iframes = 1;
      step(s);
      ticks++;
    }
    expect(stopOf(s)?.n).toBe(AT + 1);
    // not before the wait was up, and not long after
    expect(ticks).toBeGreaterThanOrEqual(FORK.wait - 3 * SIM_HZ);
    expect(ticks).toBeLessThan(FORK.wait + 6 * SIM_HZ);
    expect(s.worlds[0].players).toHaveLength(3);
    // fetched without a prize
    expect(Object.keys(s.worlds[0].players[2].tunings)).toHaveLength(0);
  });

  it('nobody is apart for ever', () => {
    const s = begin(2, 'ever');
    let ticks = 0;
    while (stopOf(s)?.n === AT && ticks < FORK.most + 10 * SIM_HZ) {
      for (const w of s.worlds) for (const p of w.players) p.iframes = 1;
      step(s);
      ticks++;
    }
    expect(stopOf(s)?.n).toBe(AT + 1);
    expect(ticks).toBeGreaterThanOrEqual(FORK.most);
    expect(s.worlds[0].players).toHaveLength(2);
  });

  it('the run is lost only when everyone is down, wherever they are', () => {
    const s = begin(2, 'lost');
    for (const w of s.worlds) for (const p of w.players) damagePlayer(w, p, 9999, p.x + 1, p.y, 0);
    until(s, () => s.phase !== 'run', 10);
    expect(s.phase).toBe('lost');
  });
});

describe('apart, every laptop still sees the same game', () => {
  it('the same bundles give the same hashes through the split and the meeting, and a snapshot taken apart continues exactly', () => {
    const a = begin(3, 'same');
    const b = begin(3, 'same');
    const inputs: InputFrame[] = [emptyInput(), emptyInput(), emptyInput()];
    setMove(inputs[0], 0, 1);
    setMove(inputs[2], -1, 0);
    for (let t = 0; t < 200; t++) {
      for (const s of [a, b]) {
        for (const w of s.worlds) for (const p of w.players) p.iframes = 1;
        step(s, [], inputs);
      }
      if (t % 40 === 0) expect(hashSession(b)).toBe(hashSession(a));
    }
    // a laptop that joins late is sent the whole game: three worlds and all
    const c = loadSession(saveSession(a), CONTENT);
    expect(c.worlds).toHaveLength(3);
    expect(hashSession(c)).toBe(hashSession(a));
    for (const s of [a, b, c]) {
      for (const w of s.worlds.slice()) clear(s, w);
      draft(s);
      until(s, () => stopOf(s)?.n !== AT, 6);
      expect(stopOf(s)?.n).toBe(AT + 1);
    }
    expect(hashSession(b)).toBe(hashSession(a));
    expect(hashSession(c)).toBe(hashSession(a));
  });
});
