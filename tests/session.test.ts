// The session is the unit of co-op: identical bundles must give identical sessions, a saved
// session must continue exactly as the original would have, and commands must apply once.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { RelayCore, SILENCE_MS, TICK_MS } from '../src/net/relayCore';
import { Loopback } from '../src/net/transport';
import { swordBot } from '../src/sim/bots';
import type { Bot } from '../src/sim/bots';
import { standing } from '../src/sim/combat';
import { angleOf, moveInto, press, quantAngle, setAim, setMove } from '../src/sim/input';
import { createSession, stepSession, worldOf } from '../src/sim/session';
import type { Bundle, Session, SessionConfig } from '../src/sim/session';
import { decodeState, encodeState, hashSession, loadSession, saveSession } from '../src/sim/snapshot';
import { AIM_STEPS, BTN, MOVE_STEPS, PRESS, emptyInput } from '../src/sim/types';

const config = (players: number, seed = 'test', stress = 0): SessionConfig => ({
  seed,
  players: Array.from({ length: players }, (_, i) => ({ name: `P${i + 1}`, classId: 'sword' })),
  buildId: 'test',
  inputDelay: 0,
  stress,
});

/** Drive a session with bots through a relay core, exactly as the game does, recording every bundle. */
function play(s: Session, bots: Bot[], ticks: number, log: Bundle[] = []): number[] {
  const core = new RelayCore(bots.length);
  core.tick = s.tick;
  const hashes: number[] = [];
  for (let i = 0; i < ticks; i++) {
    bots.forEach((b, slot) => core.input(slot, b.think(worldOf(s, slot), slot), i * TICK_MS));
    const bundle = core.close(i * TICK_MS);
    log.push(bundle);
    stepSession(s, bundle, CONTENT);
    for (const w of s.worlds) w.events.length = 0;
    hashes.push(hashSession(s));
  }
  return hashes;
}

describe('determinism', () => {
  it('three players: the same bundles give the same hash at every tick', () => {
    const log: Bundle[] = [];
    const a = createSession(config(3), CONTENT);
    const ha = play(a, [swordBot(), swordBot(), swordBot()], 1500, log);
    // a second session fed only the recorded bundles, with no bots of its own
    const b = createSession(config(3), CONTENT);
    const hb = log.map((bundle) => {
      stepSession(b, bundle, CONTENT);
      for (const w of b.worlds) w.events.length = 0;
      return hashSession(b);
    });
    expect(hb).toEqual(ha);
    expect(a.worlds[0].stats.kills).toBeGreaterThan(0);
  });

  it('a different seed gives a different game', () => {
    const a = createSession(config(1, 'one'), CONTENT);
    const b = createSession(config(1, 'two'), CONTENT);
    const ha = play(a, [swordBot()], 400);
    const hb = play(b, [swordBot()], 400);
    expect(ha[399]).not.toBe(hb[399]);
  });

  it('one changed input changes the hash (the hash sees the state)', () => {
    const log: Bundle[] = [];
    const a = createSession(config(1), CONTENT);
    const ha = play(a, [swordBot()], 300, log);
    const b = createSession(config(1), CONTENT);
    let last = 0;
    log.forEach((bundle, i) => {
      if (i === 120) {
        const f = bundle.inputs[0];
        if (f) setMove(f, 1, 1);
      }
      stepSession(b, bundle, CONTENT);
      last = hashSession(b);
    });
    expect(last).not.toBe(ha[299]);
  });
});

describe('snapshots', () => {
  it('encode every kind of value and read it back exactly', () => {
    const value = { z: -0, a: [1.5, 'two', true, false, null], bytes: new Uint8Array([1, 2, 250]), nested: { n: 1e-300, s: 'é✓' } };
    const back = decodeState(encodeState(value)) as typeof value;
    expect(Object.is(back.z, -0)).toBe(true);
    expect(back.a).toEqual(value.a);
    expect(Array.from(back.bytes)).toEqual([1, 2, 250]);
    expect(back.nested).toEqual(value.nested);
    // key order does not matter, values do
    expect(encodeState({ b: 1, a: 2 })).toEqual(encodeState({ a: 2, b: 1 }));
    expect(encodeState({ a: 0 })).not.toEqual(encodeState({ a: -0 }));
  });

  it('refuse state that is not plain data', () => {
    expect(() => encodeState({ m: new Map() })).toThrow(/not plain data/);
    expect(() => encodeState({ n: NaN })).toThrow(/NaN/);
  });

  it('a loaded session hashes the same and continues exactly as the original', () => {
    const log: Bundle[] = [];
    const a = createSession(config(2), CONTENT);
    play(a, [swordBot(), swordBot()], 700, log);
    const saved = saveSession(a);
    const b = loadSession(saved, CONTENT);
    expect(hashSession(b)).toBe(hashSession(a));
    // continue both with the same new bundles
    const more: Bundle[] = [];
    const ha = play(a, [swordBot(), swordBot()], 600, more);
    const hb = more.map((bundle) => {
      stepSession(b, bundle, CONTENT);
      for (const w of b.worlds) w.events.length = 0;
      return hashSession(b);
    });
    expect(hb).toEqual(ha);
  });

  it('events waiting for presentation are not part of the state', () => {
    const a = createSession(config(1), CONTENT);
    const before = hashSession(a);
    a.worlds[0].events.push({ type: 'waveStart', wave: 9 });
    expect(hashSession(a)).toBe(before);
  });
});

describe('commands', () => {
  const bundle = (tick: number, cmds: Bundle['cmds'] = []): Bundle => ({ tick, inputs: [emptyInput()], cmds });

  it('pause stops the world for everyone until anyone lifts it', () => {
    const s = createSession(config(1), CONTENT);
    for (let i = 0; i < 10; i++) stepSession(s, bundle(i), CONTENT);
    const t0 = s.worlds[0].tick;
    stepSession(s, bundle(10, [{ slot: 0, seq: 1, kind: 'pause', a: 0 }]), CONTENT);
    for (let i = 0; i < 20; i++) stepSession(s, bundle(11 + i), CONTENT);
    expect(s.pausedBy).toBe(0);
    expect(s.worlds[0].tick).toBe(t0);
    stepSession(s, bundle(40, [{ slot: 0, seq: 2, kind: 'pause', a: 0 }]), CONTENT);
    expect(s.pausedBy).toBe(-1);
    expect(s.worlds[0].tick).toBe(t0 + 1);
  });

  it('a command delivered twice is applied once', () => {
    const s = createSession(config(1), CONTENT);
    const cmd = { slot: 0, seq: 1, kind: 'pause' as const, a: 0 };
    stepSession(s, bundle(1, [cmd]), CONTENT);
    stepSession(s, bundle(2, [cmd]), CONTENT);
    expect(s.pausedBy).toBe(0);
  });

  it('restart begins again from the first chamber with fresh characters', () => {
    const s = createSession(config(2), CONTENT);
    play(s, [swordBot(), swordBot()], 900);
    const w0 = s.worlds[0];
    stepSession(s, { tick: s.tick + 1, inputs: [emptyInput(), emptyInput()], cmds: [{ slot: 1, seq: 1, kind: 'restart', a: 0 }] }, CONTENT);
    expect(s.attempt).toBe(1);
    expect(s.worlds[0]).not.toBe(w0);
    expect(s.worlds[0].chamber).toBe(1);
    expect(s.worlds[0].players.every((p) => p.hp === p.maxHp)).toBe(true);
  });
});

describe('the practice ladder', () => {
  it('goes deeper after each cleared chamber, and starts over when everyone is down', () => {
    const s = createSession(config(2, 'ladder'), CONTENT);
    let deepest = 1;
    let restarted = false;
    const bots = [swordBot(), swordBot()];
    const core = new RelayCore(2);
    for (let i = 0; i < 60 * 240 && !(deepest >= 3 && restarted); i++) {
      // once the ladder has been seen to climb, the bots let go so that the party goes down
      if (deepest < 3) bots.forEach((b, slot) => core.input(slot, b.think(worldOf(s, slot), slot), i * TICK_MS));
      else for (let slot = 0; slot < 2; slot++) core.input(slot, emptyInput(), i * TICK_MS);
      const attempt = s.attempt;
      stepSession(s, core.close(i * TICK_MS), CONTENT);
      for (const w of s.worlds) w.events.length = 0;
      deepest = Math.max(deepest, s.worlds[0].chamber);
      if (s.attempt > attempt) restarted = true;
    }
    expect(deepest).toBeGreaterThanOrEqual(3);
    expect(restarted).toBe(true);
    expect(s.worlds[0].players.some(standing)).toBe(true);
  });

  it('the stress scene keeps its crowd and nobody is hurt', () => {
    const s = createSession(config(1, 'stress', 12), CONTENT);
    play(s, [swordBot()], 600);
    expect(s.worlds[0].enemies.length).toBeGreaterThanOrEqual(8);
    expect(s.worlds[0].enemies.length).toBeLessThanOrEqual(12);
    expect(s.worlds[0].players[0].hp).toBe(s.worlds[0].players[0].maxHp);
  });
});

describe('the relay core', () => {
  it('closes sixty ticks a second by the clock, however unevenly it is asked', () => {
    const core = new RelayCore(1);
    let total = 0;
    let t = 1000;
    total += core.due(t).length;
    for (const step of [3, 40, 0.5, 16.7, 100, 1, 250, 9.3]) {
      t += step;
      total += core.due(t).length;
    }
    expect(total).toBe(Math.floor((t - 1000) / TICK_MS));
    expect(core.tick).toBe(total);
  });

  it('never loses or doubles a press, whatever happens to the messages', () => {
    const core = new RelayCore(1);
    const pad = emptyInput();
    const s = createSession(config(1), CONTENT);
    let dashes = 0;
    const step = (now: number): void => {
      stepSession(s, core.close(now), CONTENT);
      for (const e of s.worlds[0].events) if (e.type === 'dash') dashes++;
      s.worlds[0].events.length = 0;
    };
    core.input(0, pad, 0);
    step(0);
    // two messages arrive inside one tick: the press in the first must survive the second
    press(pad, PRESS.dash);
    core.input(0, pad, 5);
    setAim(pad, 0, 0, 1, 1);
    core.input(0, pad, 9);
    step(16);
    // then nothing arrives for several ticks: the press must not fire again
    for (let i = 2; i < 12; i++) step(i * 16);
    expect(dashes).toBe(1);
  });

  it('lets go of the controls for a seat that falls silent', () => {
    const core = new RelayCore(2);
    const f = emptyInput();
    setMove(f, 1, 0);
    f.held = BTN.attack;
    core.input(0, f, 0);
    core.input(1, f, 0);
    core.input(1, f, SILENCE_MS + 50);
    const b = core.close(SILENCE_MS + 60);
    expect(b.inputs[0]?.moveMag).toBe(0);
    expect(b.inputs[0]?.held).toBe(0);
    expect(b.inputs[1]?.moveMag).toBeGreaterThan(0);
  });

  it('queues a command once and hands it to exactly one tick', () => {
    const core = new RelayCore(1);
    core.command({ slot: 0, seq: 1, kind: 'pause', a: 0 });
    core.command({ slot: 0, seq: 1, kind: 'pause', a: 0 });
    expect(core.close(0).cmds).toHaveLength(1);
    expect(core.close(16).cmds).toHaveLength(0);
  });

  it('alone, drops time lost to a stall instead of racing to catch up', () => {
    const net = new Loopback(1);
    net.poll(0);
    expect(net.poll(5000).length).toBeLessThanOrEqual(6);
    expect(net.poll(5017).length).toBeLessThanOrEqual(2);
    expect(net.alpha(5017)).toBeGreaterThanOrEqual(0);
    expect(net.alpha(5017)).toBeLessThanOrEqual(1);
  });
});

describe('input frames', () => {
  it('quantise angles to whole steps and back', () => {
    for (let k = 0; k < MOVE_STEPS; k++) expect(quantAngle(angleOf(k, MOVE_STEPS), MOVE_STEPS)).toBe(k);
    for (const k of [0, 1, 12345, 32768, 65535]) expect(quantAngle(angleOf(k, AIM_STEPS), AIM_STEPS)).toBe(k);
    expect(quantAngle(-0.0000001, MOVE_STEPS)).toBe(0);
  });

  it('give exact unit vectors along the four axes', () => {
    const f = emptyInput();
    const out = { x: 9, y: 9 };
    setMove(f, 1, 0);
    moveInto(f, out);
    expect(out).toEqual({ x: 1, y: 0 });
    setMove(f, 0, -3);
    moveInto(f, out);
    expect(out).toEqual({ x: 0, y: -1 });
    setMove(f, 0, 0);
    moveInto(f, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});
