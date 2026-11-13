// A tiny tween runner for menus and transitions.
import { ease } from '../core/ease';
import type { EaseFn } from '../core/ease';

interface Tween {
  t: number;
  dur: number;
  delay: number;
  fn: EaseFn;
  step: (k: number) => void;
  done?: () => void;
}

export class Tweens {
  private list: Tween[] = [];

  /** Run `step` with k going 0 to 1 over `dur` seconds, after an optional delay. */
  to(dur: number, step: (k: number) => void, o: { ease?: EaseFn; delay?: number; done?: () => void } = {}): void {
    const tw: Tween = { t: 0, dur: Math.max(0.0001, dur), delay: o.delay ?? 0, fn: o.ease ?? ease.outCubic, step, done: o.done };
    if (tw.delay <= 0) step(0);
    this.list.push(tw);
  }

  /** Call `done` after a delay. */
  wait(seconds: number, done: () => void): void {
    this.to(seconds, () => undefined, { done });
  }

  update(dt: number): void {
    if (this.list.length === 0) return;
    const finished: Tween[] = [];
    for (const tw of this.list) {
      if (tw.delay > 0) {
        tw.delay -= dt;
        if (tw.delay > 0) continue;
      }
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.step(tw.fn(k));
      if (k >= 1) finished.push(tw);
    }
    if (finished.length) {
      this.list = this.list.filter((tw) => !finished.includes(tw));
      for (const tw of finished) tw.done?.();
    }
  }

  clear(): void {
    this.list.length = 0;
  }

  get busy(): boolean {
    return this.list.length > 0;
  }
}
