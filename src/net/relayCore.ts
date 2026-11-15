// The relay's core: it turns whatever inputs have arrived into exactly one bundle per tick, in
// one order, for everyone. The host program runs it for a co-op game; alone, the page runs the
// very same code with no network in between. It runs no simulation and waits for nobody: a seat
// whose input is late simply keeps its last held state, and one that falls silent lets go.
import { copyInput } from '../sim/input';
import type { Bundle, Command } from '../sim/session';
import { emptyInput } from '../sim/types';
import type { InputFrame } from '../sim/types';

export const TICK_MS = 1000 / 60;
/** A seat that has sent nothing for this long is treated as having let go of the controls. */
export const SILENCE_MS = 250;

export class RelayCore {
  /** The number of the last tick closed. */
  tick = 0;
  private readonly latest: InputFrame[];
  private readonly seenAt: number[];
  private readonly lastSeq: number[];
  private queued: Command[] = [];
  private startMs = -1;

  constructor(readonly slots: number) {
    this.latest = Array.from({ length: slots }, () => emptyInput());
    this.seenAt = new Array<number>(slots).fill(-1);
    this.lastSeq = new Array<number>(slots).fill(0);
  }

  /** Record a seat's newest input. Press counters only ever move forward, so the newest frame is all that matters. */
  input(slot: number, frame: InputFrame, nowMs: number): void {
    if (slot < 0 || slot >= this.slots) return;
    copyInput(frame, this.latest[slot]);
    this.seenAt[slot] = nowMs;
  }

  /** Queue a command for the next tick. A command delivered twice is queued once. */
  command(cmd: Command): void {
    if (cmd.slot < 0 || cmd.slot >= this.slots || cmd.seq <= this.lastSeq[cmd.slot]) return;
    this.lastSeq[cmd.slot] = cmd.seq;
    this.queued.push(cmd);
  }

  /**
   * Close every tick that is due by the clock and return their bundles. Ticks are counted from
   * the first call, sixty to the second, however unevenly this is called. `maxTicks` bounds a
   * catch-up: time beyond it is dropped (right for a game played alone, where nobody else is
   * waiting on the clock).
   */
  due(nowMs: number, maxTicks = Infinity): Bundle[] {
    if (this.startMs < 0) this.startMs = nowMs - this.tick * TICK_MS;
    let n = Math.floor((nowMs - this.startMs) / TICK_MS) - this.tick;
    if (n > maxTicks) {
      this.startMs += (n - maxTicks) * TICK_MS;
      n = maxTicks;
    }
    const out: Bundle[] = [];
    for (let i = 0; i < n; i++) out.push(this.close(nowMs));
    return out;
  }

  /** Close exactly one tick with what is known now. */
  close(nowMs: number): Bundle {
    this.tick++;
    const inputs: InputFrame[] = [];
    for (let slot = 0; slot < this.slots; slot++) {
      const f = this.latest[slot];
      if (this.seenAt[slot] >= 0 && nowMs - this.seenAt[slot] > SILENCE_MS) {
        f.held = 0;
        f.moveMag = 0;
      }
      const copy = emptyInput();
      copyInput(f, copy);
      inputs.push(copy);
    }
    const cmds = this.queued;
    this.queued = [];
    return { tick: this.tick, inputs, cmds };
  }

  /** Carry on from now: time that passed while the clock was stopped is forgotten, not made up. */
  resume(nowMs: number): void {
    this.startMs = nowMs - this.tick * TICK_MS;
  }

  /** How far the clock is into the tick after the last one closed, 0..1, for drawing between ticks. */
  phase(nowMs: number): number {
    if (this.startMs < 0) return 0;
    const f = (nowMs - this.startMs) / TICK_MS - this.tick;
    return f < 0 ? 0 : f > 1 ? 1 : f;
  }
}
