// A controller's numbers become the game's actions, and its aim leans toward what it is nearly
// pointing at. Both are pure, so they are checked here; the real game is driven by a scripted
// fake controller in the browser (scripts/shot.mjs --pad).
import { describe, expect, it } from 'vitest';
import { ASSIST, PadReader, STICK_DEAD, TRIGGER_ON, assistAim, emptyPad, padAimDistance, readPad } from '../src/game/gamepad';
import type { PadState } from '../src/game/gamepad';

function pad(axes: number[], buttons: Record<number, number> = {}): PadState {
  const list = Array.from({ length: 17 }, (_, i) => ({ pressed: (buttons[i] ?? 0) > 0.5, value: buttons[i] ?? 0 }));
  return { axes, buttons: list };
}

describe('reading a controller', () => {
  it('a stick near the middle reads as centred, and the rest of its travel is stretched back to full', () => {
    const out = emptyPad();
    readPad(pad([STICK_DEAD * 0.9, 0, 0, 0]), out);
    expect([out.moveX, out.moveY]).toEqual([0, 0]);
    expect(out.active).toBe(false);
    readPad(pad([1, 0, 0, 0]), out);
    expect(out.moveX).toBeCloseTo(1);
    readPad(pad([0, -0.61, 0, 0]), out);
    expect(out.moveX).toBe(0);
    expect(out.moveY).toBeCloseTo(-(0.61 - STICK_DEAD) / (1 - STICK_DEAD));
    // a diagonal keeps its direction and never exceeds full
    readPad(pad([0.9, 0.9, 0, 0]), out);
    expect(Math.hypot(out.moveX, out.moveY)).toBeCloseTo(1);
    expect(out.moveX).toBeCloseTo(out.moveY);
    expect(out.active).toBe(true);
  });

  it('the right stick aims, and says when it is in use', () => {
    const out = emptyPad();
    readPad(pad([0, 0, 0.05, -0.1]), out);
    expect(out.aiming).toBe(false);
    readPad(pad([0, 0, 0, -1]), out);
    expect(out.aiming).toBe(true);
    expect([out.aimX, out.aimY]).toEqual([0, -1]);
  });

  it('View, held, asks for the words: what the kit does', () => {
    const out = emptyPad();
    readPad(pad([0, 0, 0, 0]), out);
    expect(out.info).toBe(false);
    readPad(pad([0, 0, 0, 0], { 8: 1 }), out);
    expect(out.info).toBe(true);
    // and it is nothing else
    expect([out.attack, out.special, out.dash, out.pause, out.confirm, out.back]).toEqual([false, false, false, false, false, false]);
  });

  it('triggers and shoulder buttons attack and use the special; A dashes, X interacts, Start pauses', () => {
    const out = emptyPad();
    readPad(pad([0, 0, 0, 0], { 7: TRIGGER_ON + 0.05 }), out);
    expect(out.attack).toBe(true);
    readPad(pad([0, 0, 0, 0], { 7: TRIGGER_ON - 0.05 }), out);
    expect(out.attack).toBe(false);
    readPad(pad([0, 0, 0, 0], { 5: 1 }), out);
    expect(out.attack).toBe(true);
    readPad(pad([0, 0, 0, 0], { 6: 1 }), out);
    expect([out.special, out.attack]).toEqual([true, false]);
    readPad(pad([0, 0, 0, 0], { 4: 1 }), out);
    expect(out.special).toBe(true);
    readPad(pad([0, 0, 0, 0], { 0: 1, 2: 1, 9: 1 }), out);
    expect([out.dash, out.interact, out.pause, out.confirm]).toEqual([true, true, true, true]);
    readPad(pad([0, 0, 0, 0], { 1: 1 }), out);
    expect(out.back).toBe(true);
  });

  it('menus move by the d-pad or a firm push of the stick', () => {
    const out = emptyPad();
    readPad(pad([0, 0, 0, 0], { 13: 1, 14: 1 }), out);
    expect([out.menuX, out.menuY]).toEqual([-1, 1]);
    readPad(pad([0.95, 0, 0, 0]), out);
    expect(out.menuX).toBe(1);
    readPad(pad([0.4, 0, 0, 0]), out);
    expect(out.menuX).toBe(0);
  });

  it('a controller with missing axes or buttons reads as nothing, not as an error', () => {
    const out = emptyPad();
    readPad({ axes: [], buttons: [] }, out);
    expect(out.active).toBe(false);
    readPad({ axes: [Number.NaN, 0], buttons: [] }, out);
    expect([out.moveX, out.moveY]).toEqual([0, 0]);
  });

  it('a light push aims close and a full push at the edge of a throw', () => {
    expect(padAimDistance(0)).toBe(2);
    expect(padAimDistance(1)).toBe(9);
    expect(padAimDistance(0.5)).toBeGreaterThan(padAimDistance(0.2));
  });
});

describe('which controller is in use', () => {
  it('a stick that has never been at rest is not trusted: a controller lying on its stick does nothing', () => {
    const r = new PadReader();
    // pushed fully left from the first moment the page sees it, and for ever after
    for (let i = 0; i < 300; i++) {
      expect(r.poll([pad([-1, -0.25, 0, 0])])).toBeNull();
      expect(r.touched).toBe(false);
      expect(r.stepX).toBe(0);
    }
    expect(r.current).toBe(-1);
    // once it has been let go, it is a stick like any other
    r.poll([pad([0, 0, 0, 0])]);
    const read = r.poll([pad([-1, 0, 0, 0])]);
    expect(r.current).toBe(0);
    expect(r.touched).toBe(true);
    expect(read?.moveX).toBeCloseTo(-1);
    expect(r.stepX).toBe(-1);
  });

  it('a button held since before the page opened is ignored until it is let go', () => {
    const r = new PadReader();
    for (let i = 0; i < 5; i++) r.poll([pad([0, 0, 0, 0], { 0: 1 })]);
    expect(r.current).toBe(-1);
    expect(r.pressed.size).toBe(0);
    r.poll([pad([0, 0, 0, 0])]);
    r.poll([pad([0, 0, 0, 0], { 0: 1 })]);
    expect(r.pressed.has('dash')).toBe(true);
    expect(r.pressed.has('confirm')).toBe(true);
    // a press is reported once, however long it is held
    r.poll([pad([0, 0, 0, 0], { 0: 1 })]);
    expect(r.pressed.size).toBe(0);
  });

  it('the controller in use is the one something last changed on, not the first in the list', () => {
    const r = new PadReader();
    const stuck = pad([-1, 0, 0, 0]);
    const idle = pad([0, 0, 0, 0]);
    r.poll([stuck, idle]);
    r.poll([stuck, idle]);
    expect(r.current).toBe(-1);
    // the second controller is picked up and its trigger pulled
    const read = r.poll([stuck, pad([0, 0, 0, 0], { 7: 1 })]);
    expect(r.current).toBe(1);
    expect(read?.attack).toBe(true);
    expect(r.pressed.has('attack')).toBe(true);
    // and it stays the one in use while it is held still
    r.poll([stuck, pad([0, 0, 0, 0], { 7: 1 })]);
    expect(r.current).toBe(1);
    expect(r.touched).toBe(false);
    // unplugged, there is none
    expect(r.poll([stuck, null])).toBeNull();
    expect(r.current).toBe(-1);
  });

  it('a menu step is taken once per push', () => {
    const r = new PadReader();
    r.poll([pad([0, 0, 0, 0])]);
    r.poll([pad([0, 0, 0, 0], { 15: 1 })]);
    expect(r.stepX).toBe(1);
    r.poll([pad([0, 0, 0, 0], { 15: 1 })]);
    expect(r.stepX).toBe(0);
    r.poll([pad([0, 0, 0, 0])]);
    r.poll([pad([0, 0, 0, 0], { 15: 1 })]);
    expect(r.stepX).toBe(1);
  });
});

describe('aim assist', () => {
  it('leans toward a target near the line, most of the way but never past it', () => {
    // a target 5 tiles out, a little off the aim
    const off = 0.08;
    const target = [5 * Math.cos(off), 5 * Math.sin(off)];
    const a = assistAim(0, 0, 0, target);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(off);
    expect(a / off).toBeGreaterThan(0.4);
  });

  it('leaves the aim alone when nothing is near the line, or within reach', () => {
    expect(assistAim(0, 0, 0, [0, 5])).toBe(0);
    expect(assistAim(0, 0, 0, [ASSIST.range + 2, 0.1])).toBe(0);
    expect(assistAim(1.3, 2, 2, [])).toBe(1.3);
    // dead on already: nothing to add
    expect(assistAim(0, 0, 0, [5, 0])).toBeCloseTo(0, 12);
  });

  it('fades out toward the edge of its cone, so the aim never jumps as a target drifts in', () => {
    const at = (off: number): number => assistAim(0, 0, 0, [5 * Math.cos(off), 5 * Math.sin(off)]);
    expect(at(ASSIST.cone * 0.999)).toBeLessThan(0.001);
    expect(at(ASSIST.cone * 1.01)).toBe(0);
    // and it is continuous in between
    let last = 0;
    for (let off = 0; off < ASSIST.cone; off += 0.005) {
      const a = at(off);
      expect(Math.abs(a - last)).toBeLessThan(0.01);
      last = a;
    }
  });

  it('between two targets, the stick still chooses: the one nearer the line wins', () => {
    const left = [5 * Math.cos(-0.2), 5 * Math.sin(-0.2)];
    const right = [5 * Math.cos(0.06), 5 * Math.sin(0.06)];
    expect(assistAim(0, 0, 0, [...left, ...right])).toBeGreaterThan(0);
    expect(assistAim(-0.15, 0, 0, [...left, ...right])).toBeLessThan(-0.15);
  });

  it('works across the wrap of the angle', () => {
    const a = assistAim(Math.PI - 0.02, 0, 0, [-5, -0.3]);
    // the target is just past the wrap; the aim moves toward it the short way
    expect(a).toBeGreaterThan(Math.PI - 0.02);
    expect(a).toBeLessThan(Math.PI + 0.1);
  });
});
