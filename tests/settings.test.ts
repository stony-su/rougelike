// What a player has set is kept between visits and survives anything the browser hands back; and
// a controller rumbles for what happens to its own player, harder for a heavier blow.
import { describe, expect, it } from 'vitest';
import { Rumble, buzzFor } from '../src/game/rumble';
import { DEFAULT_SETTINGS, cleanSettings, loadSettings, saveSettings } from '../src/game/settings';
import type { Store } from '../src/game/settings';
import type { SimEvent } from '../src/sim/types';

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

describe('settings', () => {
  it('survive a visit: what is saved is what is read back', () => {
    const store = memory();
    const mine = { volume: 0.3, muted: true, shake: 0.5, picture: 0, rumble: false };
    saveSettings(store, mine);
    expect(loadSettings(store)).toEqual(mine);
    // and a browser with no storage to give is simply the defaults, every visit
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(null, mine)).not.toThrow();
  });

  it('are the defaults on a first visit', () => {
    expect(loadSettings(memory())).toEqual(DEFAULT_SETTINGS);
  });

  it('keep what can be read of a damaged entry and nothing else', () => {
    expect(loadSettings(memory({ 'resound.settings': '{not json' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memory({ 'resound.settings': '"a string"' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memory({ 'resound.settings': JSON.stringify({ v: 1, settings: { volume: 0.4, shake: 'lots', picture: 99, rumble: 'yes' } }) }))).toEqual({
      ...DEFAULT_SETTINGS,
      volume: 0.4,
      picture: 2,
    });
  });

  it('are always something the game can use', () => {
    expect(cleanSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(cleanSettings({ volume: 7, shake: 0.4, picture: -3 })).toEqual({ ...DEFAULT_SETTINGS, volume: 1, shake: 0.5, picture: 0 });
    expect(cleanSettings({ volume: Number.NaN, muted: 1 })).toEqual(DEFAULT_SETTINGS);
    expect(cleanSettings({ volume: 0.26 }).volume).toBe(0.3);
  });

  it('a store that refuses to be written to costs nothing', () => {
    const full: Store = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => saveSettings(full, { ...DEFAULT_SETTINGS })).not.toThrow();
  });
});

describe('rumble', () => {
  const hurt = (player: number, amount: number): SimEvent => ({ type: 'playerHurt', player, amount, x: 0, y: 0, dx: 1, dy: 0 });

  it('is for what happens to this player, and to nobody else', () => {
    expect(buzzFor(hurt(0, 12), 0)).not.toBeNull();
    expect(buzzFor(hurt(1, 12), 0)).toBeNull();
    const landed: SimEvent = { type: 'hit', target: 9, by: 2, x: 0, y: 0, amount: 10, kind: 'return', heavy: false, crit: false, dx: 1, dy: 0, killed: false };
    expect(buzzFor(landed, 2)).not.toBeNull();
    expect(buzzFor(landed, 0)).toBeNull();
    // most of what goes on in a chamber is felt by nobody
    expect(buzzFor({ type: 'waveStart', wave: 2 }, 0)).toBeNull();
    // a boss changing is felt by everyone
    expect(buzzFor({ type: 'bossPhase', id: 1, kind: 'toll', phase: 1, x: 0, y: 0 }, 2)).not.toBeNull();
  });

  it('is harder and longer for a heavier blow, and never more than a motor can give', () => {
    const light = buzzFor(hurt(0, 4), 0);
    const heavy = buzzFor(hurt(0, 22), 0);
    const absurd = buzzFor(hurt(0, 500), 0);
    if (!light || !heavy || !absurd) throw new Error('a blow was not felt');
    expect(heavy.strong).toBeGreaterThan(light.strong);
    expect(heavy.ms).toBeGreaterThan(light.ms);
    expect([absurd.weak, absurd.strong]).toEqual([1, 1]);
  });

  /** A controller that writes down what it is asked to play. */
  function pad(): { played: Array<{ duration: number; weakMagnitude: number; strongMagnitude: number }>; gamepad: Gamepad } {
    const played: Array<{ duration: number; weakMagnitude: number; strongMagnitude: number }> = [];
    const gamepad = {
      vibrationActuator: {
        playEffect: (_type: string, p: { duration: number; weakMagnitude: number; strongMagnitude: number }) => {
          played.push(p);
          return Promise.resolve('complete');
        },
      },
    } as unknown as Gamepad;
    return { played, gamepad };
  }

  it('asks the controller on a hit, and does not when it is switched off', () => {
    const on = pad();
    const r = new Rumble();
    r.handle(hurt(0, 15), 0, on.gamepad, 1000);
    expect(on.played.length).toBe(1);
    expect(on.played[0].strongMagnitude).toBeGreaterThan(0);

    const off = pad();
    const quiet = new Rumble();
    quiet.enabled = false;
    quiet.handle(hurt(0, 15), 0, off.gamepad, 1000);
    expect(off.played.length).toBe(0);
    // no controller, or one that cannot rumble, is no error
    expect(() => r.handle(hurt(0, 15), 0, null, 2000)).not.toThrow();
    expect(() => r.handle(hurt(0, 15), 0, {} as unknown as Gamepad, 3000)).not.toThrow();
  });

  it('does not let a light knock cut a heavy blow short', () => {
    const p = pad();
    const r = new Rumble();
    r.handle(hurt(0, 25), 0, p.gamepad, 1000);
    const tap: SimEvent = { type: 'hit', target: 9, by: 0, x: 0, y: 0, amount: 5, kind: 'direct', heavy: false, crit: false, dx: 1, dy: 0, killed: false };
    r.handle(tap, 0, p.gamepad, 1040);
    expect(p.played.length).toBe(1);
    // once the blow has died away, the knock is felt
    r.handle(tap, 0, p.gamepad, 1000 + p.played[0].duration + 10);
    expect(p.played.length).toBe(2);
  });
});
