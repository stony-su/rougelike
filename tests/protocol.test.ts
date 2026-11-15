// The wire format between a laptop and the host program: it round-trips exactly, and nothing
// malformed gets through it.
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { MAX_NAME, bytesToText, cleanName, packBundle, packInput, parseClientMsg, parseHostMsg, textToBytes, unpackBundle, unpackInput } from '../src/net/protocol';
import type { ClientMsg, HostMsg } from '../src/net/protocol';
import { noBoons } from '../src/sim/boons';
import type { Bundle } from '../src/sim/session';
import { emptyInput } from '../src/sim/types';
import type { InputFrame } from '../src/sim/types';

const frame = (rng: Rng): InputFrame => ({
  moveAngle: rng.int(0, 255),
  moveMag: rng.int(0, 15),
  aimAngle: rng.int(0, 65535),
  aimDist: rng.int(0, 255),
  held: rng.int(0, 15),
  presses: [rng.int(0, 255), rng.int(0, 255), rng.int(0, 255), rng.int(0, 255)],
});

describe('inputs and bundles', () => {
  it('an input frame goes out as nine integers and comes back the same', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 500; i++) {
      const f = frame(rng);
      const out = emptyInput();
      expect(unpackInput(JSON.parse(JSON.stringify(packInput(f))), out)).toBe(true);
      expect(out).toEqual(f);
    }
  });

  it('every number in an input is forced into its range, so no laptop can send what the game cannot hold', () => {
    const out = emptyInput();
    expect(unpackInput([9999, -4, 70000, 300, 255, 256, -1, 3.5, Number.NaN], out)).toBe(true);
    expect(out).toEqual({ moveAngle: 255, moveMag: 0, aimAngle: 65535, aimDist: 255, held: 15, presses: [255, 0, 0, 0] });
    expect(unpackInput([1, 2, 3], out)).toBe(false);
    expect(unpackInput('nine numbers', out)).toBe(false);
    expect(unpackInput(null, out)).toBe(false);
  });

  it('a bundle round-trips, with an idle seat and commands', () => {
    const rng = new Rng(8);
    const b: Bundle = {
      tick: 4821,
      inputs: [frame(rng), undefined, frame(rng)],
      cmds: [
        { slot: 0, seq: 3, kind: 'pause', a: 0 },
        { slot: 2, seq: 1, kind: 'restart', a: 7 },
      ],
    };
    expect(unpackBundle(JSON.parse(JSON.stringify(packBundle(b))))).toEqual(b);
    expect(unpackBundle([1, [], [[0, 1, 'explode', 0]]])).toBeNull();
    expect(unpackBundle([1.5, [], []])).toBeNull();
    expect(unpackBundle([1, [[1, 2, 3]], []])).toBeNull();
    expect(unpackBundle({ tick: 1 })).toBeNull();
  });
});

describe('messages', () => {
  it('every message a laptop sends parses back to itself', () => {
    const msgs: ClientMsg[] = [
      { t: 'hello', v: 1, build: 'abc', token: 'k3j4h5g6f7d8', name: 'Ada', classId: 'bow', boons: noBoons() },
      { t: 'seat', classId: 'fist', ready: true, boons: { ...noBoons(), health: 20, dash: 0.15, unlocked: ['chorus'], issued: 'chorus' } },
      { t: 'start' },
      { t: 'in', f: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
      { t: 'cmd', seq: 2, kind: 'pause', a: 0 },
      { t: 'hash', tick: 600, h: 3989513312 },
      { t: 'ping', id: 41 },
    ];
    for (const m of msgs) expect(parseClientMsg(JSON.stringify(m))).toEqual(m);
  });

  it('every message the host sends parses back to itself', () => {
    const cfg = {
      seed: 's',
      players: [
        { name: 'Ada', classId: 'sword' as const, boons: noBoons() },
        { name: 'Bo', classId: 'bow' as const, boons: { ...noBoons(), chimes: 30, rerolls: 1 } },
      ],
      buildId: 'abc',
      inputDelay: 3,
      stress: 0,
    };
    const seat = { slot: 0, name: 'Ada', classId: 'sword' as const, ready: true, connected: true };
    const msgs: HostMsg[] = [
      { t: 'welcome', v: 1, build: 'abc', slot: 1, seats: [seat] },
      { t: 'refused', why: 'full' },
      { t: 'lobby', seats: [seat, { ...seat, slot: 1, name: 'Bo', ready: false }] },
      { t: 'start', config: cfg },
      { t: 'b', b: [[5, [[1, 2, 3, 4, 5, 6, 7, 8, 9], null], [[1, 4, 'pause', 0]]]] },
      { t: 'snap', tick: 600, config: cfg, state: 'AAEC', b: [] },
      { t: 'pong', id: 41 },
      { t: 'bye', why: 'The host has closed the game.' },
    ];
    for (const m of msgs) expect(parseHostMsg(JSON.stringify(m))).toEqual(m);
  });

  it('nothing malformed gets through', () => {
    const bad = [
      '',
      'not json',
      '[]',
      'null',
      '{"t":"in"}',
      '{"t":"in","f":[1,2,3]}',
      '{"t":"hello","v":1,"build":"x","token":"short","name":"A","classId":"bow"}',
      '{"t":"hello","v":1,"build":"x","token":"longenoughtoken","name":"A","classId":"wizard"}',
      '{"t":"seat","classId":"bow"}',
      '{"t":"cmd","seq":0,"kind":"pause","a":0}',
      '{"t":"cmd","seq":1,"kind":"win","a":0}',
      '{"t":"hash","tick":"1","h":2}',
      '{"t":"launchTheMissiles"}',
    ];
    for (const text of bad) expect(parseClientMsg(text), text).toBeNull();
    expect(parseHostMsg('{"t":"start","config":{"seed":"s","players":[],"buildId":"b","inputDelay":0,"stress":0}}')).toBeNull();
    expect(parseHostMsg('{"t":"b","b":[[1,[[1,2]],[]]]}')).toBeNull();
    expect(parseHostMsg('{"t":"lobby","seats":[{"slot":0}]}')).toBeNull();
  });

  it('names are made fit to show: printable, trimmed, short, never empty', () => {
    expect(cleanName('  Ada  ', 'x')).toBe('Ada');
    expect(cleanName('a\u0000b\u0007c', 'x')).toBe('abc');
    expect(cleanName('x'.repeat(80), 'x')).toHaveLength(MAX_NAME);
    expect(cleanName('   ', 'Returner')).toBe('Returner');
    expect(cleanName(42, 'Returner')).toBe('Returner');
    // a hello with a hostile name still parses, with the name cleaned
    const m = parseClientMsg(JSON.stringify({ t: 'hello', v: 1, build: 'b', token: 'longenoughtoken', name: '\u0001\u0002', classId: 'bow' }));
    expect(m).toMatchObject({ t: 'hello', name: 'Returner' });
  });
});

describe('bytes as text', () => {
  it('round-trips every length and every byte value', () => {
    const rng = new Rng(21);
    for (let n = 0; n < 70; n++) {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = rng.int(0, 255);
      const text = bytesToText(bytes);
      expect(text.length % 4).toBe(0);
      expect(textToBytes(text)).toEqual(bytes);
    }
    const all = new Uint8Array(256).map((_, i) => i);
    expect(textToBytes(bytesToText(all))).toEqual(all);
  });

  it('agrees with the standard encoding, and refuses what is not', () => {
    expect(bytesToText(new Uint8Array([72, 105]))).toBe('SGk=');
    expect(bytesToText(new Uint8Array([72, 105, 33]))).toBe('SGkh');
    expect(textToBytes('SGk')).toBeNull();
    expect(textToBytes('S$k=')).toBeNull();
  });
});
