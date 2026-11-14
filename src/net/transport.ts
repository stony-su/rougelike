// How a game reaches its relay. Alone, the relay core runs in the page (Loopback): no network,
// no delay, and the same code path a co-op game takes through the host program.
import type { Bundle, CommandKind } from '../sim/session';
import type { InputFrame } from '../sim/types';
import { RelayCore } from './relayCore';

export interface Transport {
  /** Send a seat's newest input. */
  input(slot: number, frame: InputFrame, nowMs: number): void;
  /** Send a command (pause, restart, a choice). */
  command(slot: number, kind: CommandKind, a?: number): void;
  /** Bundles that are ready to be stepped, in order. */
  poll(nowMs: number): Bundle[];
  /** 0..1: how far the clock is into the next tick, for drawing between ticks. */
  alpha(nowMs: number): number;
}

/** Ticks a page may catch up after a stall when nobody else is waiting on it. */
const SOLO_CATCH_UP = 6;

export class Loopback implements Transport {
  readonly core: RelayCore;
  private readonly seq: number[];

  constructor(slots: number) {
    this.core = new RelayCore(slots);
    this.seq = new Array<number>(slots).fill(0);
  }

  input(slot: number, frame: InputFrame, nowMs: number): void {
    this.core.input(slot, frame, nowMs);
  }

  command(slot: number, kind: CommandKind, a = 0): void {
    this.core.command({ slot, seq: ++this.seq[slot], kind, a });
  }

  poll(nowMs: number): Bundle[] {
    return this.core.due(nowMs, SOLO_CATCH_UP);
  }

  alpha(nowMs: number): number {
    return this.core.phase(nowMs);
  }
}
