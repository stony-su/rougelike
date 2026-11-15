// The render scale that looks after itself (src/game/quality.ts): fewer pixels while the frames
// run long, and a careful step back up when they have been short for a while.
import { describe, expect, it } from 'vitest';
import { QUALITY, Quality } from '../src/game/quality';

/** A Quality that writes down every scale it asks for. */
function make(): { q: Quality; asked: number[] } {
  const asked: number[] = [];
  return { q: new Quality((s) => asked.push(s)), asked };
}
/** Feed it whole spans of frames all of one length. */
const spans = (q: Quality, n: number, ms: number): void => {
  for (let i = 0; i < n * QUALITY.span; i++) q.frame(ms);
};
const FAST = 16.7;
const SLOW = 30;

describe('the render scale', () => {
  it('stays at full sharpness while the frames are short', () => {
    const { q, asked } = make();
    spans(q, 40, FAST);
    expect(q.scale).toBe(1);
    expect(asked).toEqual([]);
  });

  it('steps down while the frames run long, one step for each span it judges, and no lower than its floor', () => {
    const { q, asked } = make();
    // the first spans after a beginning are passed over: a chamber is being built
    spans(q, QUALITY.arrive, SLOW);
    expect(q.scale).toBe(1);
    spans(q, 1, SLOW);
    expect(q.scale).toBeCloseTo(QUALITY.step);
    // and so is the first span after every change
    spans(q, 1, SLOW);
    expect(q.scale).toBeCloseTo(QUALITY.step);
    spans(q, 1, SLOW);
    expect(q.scale).toBeCloseTo(QUALITY.step * QUALITY.step);
    spans(q, 60, SLOW);
    expect(q.scale).toBe(QUALITY.floor);
    expect(asked[asked.length - 1]).toBe(QUALITY.floor);
    // every scale it asked for was lower than the last
    for (let i = 1; i < asked.length; i++) expect(asked[i]).toBeLessThan(asked[i - 1]);
  });

  it('judges a span by how many of its frames ran long: a few do not count, every second one does', () => {
    const few = make();
    for (let i = 0; i < 10 * QUALITY.span; i++) few.q.frame(i % 10 === 0 ? 33 : FAST);
    expect(few.q.scale).toBe(1);
    // behind a display's own timing a scene a little too heavy shows as every second frame a refresh late
    const half = make();
    for (let i = 0; i < (QUALITY.arrive + 2) * QUALITY.span; i++) half.q.frame(i % 2 === 0 ? 33.3 : FAST);
    expect(half.q.scale).toBeLessThan(1);
  });

  it('does not judge a span in which the page stood still', () => {
    const { q } = make();
    spans(q, QUALITY.arrive, FAST);
    for (let n = 0; n < 6; n++) {
      // a hidden tab: one frame a second, and long ones all round it
      for (let i = 0; i < QUALITY.span; i++) q.frame(i === 3 ? 1000 : SLOW);
    }
    expect(q.scale).toBe(1);
  });

  it('tries a step back up after a good while, keeps it if it holds, and waits twice as long if it does not', () => {
    const { q } = make();
    spans(q, QUALITY.arrive + 1, SLOW);
    const low = q.scale;
    expect(low).toBeCloseTo(QUALITY.step);
    // one span to settle, then `patience` good ones: up again, to exactly 1
    spans(q, 1 + QUALITY.patience - 1, FAST);
    expect(q.scale).toBe(low);
    spans(q, 1, FAST);
    expect(q.scale).toBe(1);
    // it holds
    spans(q, 20, FAST);
    expect(q.scale).toBe(1);

    // down again; this time the step up does not hold
    spans(q, 2, SLOW);
    expect(q.scale).toBeCloseTo(QUALITY.step);
    spans(q, 1 + QUALITY.patience, FAST);
    expect(q.scale).toBe(1);
    spans(q, 2, SLOW);
    expect(q.scale).toBeCloseTo(QUALITY.step);
    // the same wait is not enough now
    spans(q, 1 + QUALITY.patience, FAST);
    expect(q.scale).toBeCloseTo(QUALITY.step);
    // twice the wait is
    spans(q, QUALITY.patience, FAST);
    expect(q.scale).toBe(1);
  });

  it('begins again at full sharpness when asked', () => {
    const { q, asked } = make();
    spans(q, QUALITY.arrive + 4, SLOW);
    expect(q.scale).toBeLessThan(1);
    q.reset();
    expect(q.scale).toBe(1);
    expect(asked[asked.length - 1]).toBe(1);
    // and asks for nothing when there is nothing to change
    const n = asked.length;
    q.reset();
    expect(asked.length).toBe(n);
  });

  it('passes over the frames in which a chamber is built', () => {
    const { q } = make();
    spans(q, QUALITY.arrive + 3, FAST);
    q.arrived();
    spans(q, QUALITY.arrive, SLOW);
    expect(q.scale).toBe(1);
    spans(q, 1, SLOW);
    expect(q.scale).toBeLessThan(1);
  });
});
