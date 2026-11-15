// Playing ticks out at a steady pace from an unsteady network.
//
// The host closes sixty ticks a second and sends them as they close, but they arrive in clumps:
// Wi-Fi holds packets back and then delivers several at once. A laptop that stepped each bundle
// the moment it came would lurch. So bundles wait in a short queue and are played at sixty a
// second, with just enough of them held in hand to ride out the usual gaps. The queue is kept
// near a target depth by playing very slightly fast or slow, never by dropping a tick: every
// laptop steps every tick, in order, or the game would not be the same game.
import type { Bundle } from '../sim/session';
import { TICK_MS } from './relayCore';

/** The fewest and the most ticks held in hand. */
export const MIN_BUFFER = 2;
export const MAX_BUFFER = 8;
/** Further behind than this (a stalled tab, a frozen laptop), stop easing and run. */
const FAR_BEHIND = 20;
/** The most ticks one poll will play while running to catch up. */
const RUN = 30;
/** How many arrivals the jitter estimate looks back over. */
const WINDOW = 180;

export class Playout {
  /** Ticks held in hand: raised at once when the network gets rough, lowered slowly when it calms. */
  target = MIN_BUFFER;
  /** Ticks played in bursts while running to catch up, in total. Effects for these are best muted. */
  ran = 0;
  /** Times the queue ran dry and play had to wait. */
  starved = 0;

  private queue: Bundle[] = [];
  /** The tick expected next from the network. */
  private next = 1;
  private clock = -1;
  /** Fractions of a tick of time not yet played. */
  private credit = 0;
  /** Playing, or waiting for the queue to fill to its target. */
  private primed = false;
  private lastArrival = -1;
  private readonly gaps: number[] = [];
  private calmSince = -1;

  /** Start over, expecting the tick after `after` next (a new game, or a snapshot just loaded). */
  reset(after: number): void {
    this.queue = [];
    this.next = after + 1;
    this.clock = -1;
    this.credit = 0;
    this.primed = false;
  }

  /** Ticks received and not yet played. */
  get depth(): number {
    return this.queue.length;
  }

  /** The last tick that has arrived. */
  get arrived(): number {
    return this.next - 1;
  }

  /** Bundles from the host, in order. One that has been seen already is ignored; a gap is refused. */
  receive(bundles: readonly Bundle[], nowMs: number): boolean {
    let took = false;
    for (const b of bundles) {
      if (b.tick < this.next) continue;
      if (b.tick > this.next) return false;
      this.queue.push(b);
      this.next++;
      took = true;
    }
    if (took) this.noteArrival(nowMs);
    return true;
  }

  private noteArrival(nowMs: number): void {
    if (this.lastArrival >= 0) {
      this.gaps.push(nowMs - this.lastArrival);
      if (this.gaps.length > WINDOW) this.gaps.shift();
    }
    this.lastArrival = nowMs;
    if (this.gaps.length < 20) return;
    // Hold enough to cover all but the rarest gap between arrivals. A few ms of slack, so that a
    // steady stream measured on a coarse clock does not look like a gap of two ticks.
    const sorted = this.gaps.slice().sort((a, b) => a - b);
    const p98 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))];
    const want = Math.max(MIN_BUFFER, Math.min(MAX_BUFFER, Math.ceil(Math.max(0, p98 - 4) / TICK_MS) + 1));
    if (want > this.target) {
      this.target = want;
      this.calmSince = nowMs;
    } else if (want < this.target) {
      // only after a good while of calm, and one step at a time
      if (this.calmSince < 0) this.calmSince = nowMs;
      if (nowMs - this.calmSince > 4000) {
        this.target--;
        this.calmSince = nowMs;
      }
    } else {
      this.calmSince = nowMs;
    }
  }

  /** The bundles to step now, in order. */
  poll(nowMs: number): Bundle[] {
    if (this.clock < 0) this.clock = nowMs;
    const dt = Math.max(0, nowMs - this.clock);
    this.clock = nowMs;
    const depth = this.queue.length;
    if (!this.primed) {
      // wait for a cushion before starting, and again after running dry
      if (depth < this.target) return [];
      this.primed = true;
      this.credit = 0;
    }
    // Sixty a second; a touch faster with too much in hand, a touch slower with too little.
    let rate = 1;
    if (depth > this.target + 1) rate = 1 + Math.min(0.5, (depth - this.target) * 0.06);
    else if (depth < this.target) rate = 0.94;
    this.credit += (dt / TICK_MS) * rate;
    let n = Math.floor(this.credit);
    // Far behind: run, a bounded burst per poll so that no single frame takes for ever.
    const behind = depth - this.target;
    if (behind > FAR_BEHIND && n < behind) n = behind;
    if (n > RUN) n = RUN;
    if (n > depth) n = depth;
    if (n > 3) this.ran += n;
    this.credit -= n;
    // time that could not be played is not saved up
    if (this.credit > 1) this.credit = 1;
    if (this.credit < 0) this.credit = 0;
    if (n === 0 && depth === 0) {
      this.primed = false;
      this.starved++;
    }
    return n > 0 ? this.queue.splice(0, n) : [];
  }

  /** 0..1: how far play is toward the next tick, for drawing between ticks. */
  alpha(): number {
    return this.credit < 0 ? 0 : this.credit > 1 ? 1 : this.credit;
  }
}
