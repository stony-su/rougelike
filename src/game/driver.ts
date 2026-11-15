// Who steps the game. Alone, the page runs the relay itself and plays any other seats with bots
// (SoloDriver). In co-op the host sets the clock and this laptop follows it (CoopDriver, in
// connection.ts). The game shell talks to either through this one shape, so it never knows or
// cares which it has.
import { CONTENT } from '../content';
import { Loopback } from '../net/transport';
import { BOT_THINKS, EXPERT, botPick, classBot } from '../sim/bots';
import type { Bot } from '../sim/bots';
import { DRAFT_TICKS } from '../sim/draft';
import { createSession, stepSession, worldOf } from '../sim/session';
import type { CommandKind, Session, SessionConfig } from '../sim/session';
import type { InputFrame } from '../sim/types';

/** How the connection to the host is doing, for the overlay. */
export interface NetStats {
  /** Round trip to the host, ms. */
  rtt: number;
  /** From a press to its effect on this screen, roughly, ms. */
  delay: number;
  /** Ticks waiting to be played, and how many the buffer aims to hold. */
  buffer: number;
  target: number;
  /** Times this laptop had to be sent the whole game again because it had drifted. */
  resyncs: number;
  /** False while the connection is down and being retried. */
  online: boolean;
}

/** Called after each tick is stepped, before its events are cleared. `muted` while running to catch up. */
export type OnTick = (session: Session, muted: boolean) => void;

export interface Driver {
  /** The session being played. In co-op it is replaced when the host sends the whole game again. */
  readonly session: Session | null;
  /** The seat this laptop plays. */
  readonly localSlot: number;
  readonly coop: boolean;
  /** Send this laptop's input for its own seat. */
  input(frame: InputFrame, nowMs: number): void;
  command(kind: CommandKind, a?: number): void;
  /** Step every tick that is due. */
  step(nowMs: number, onTick: OnTick): void;
  /** 0..1: how far the clock is toward the next tick, for drawing between ticks. */
  alpha(nowMs: number): number;
  net(): NetStats | null;
}

export class SoloDriver implements Driver {
  readonly session: Session;
  readonly localSlot = 0;
  readonly coop = false;
  private readonly loop: Loopback;
  /** One entry per seat: a bot for every seat but this laptop's own. */
  private readonly bots: Array<Bot | null>;
  /** For each bot seat, the draft it has already answered. */
  private readonly answered: string[] = [];

  constructor(config: SessionConfig) {
    this.session = createSession(config, CONTENT);
    this.loop = new Loopback(config.players.length);
    this.bots = config.players.map((p, slot) => (slot === this.localSlot ? null : classBot(p.classId, EXPERT)));
  }

  input(frame: InputFrame, nowMs: number): void {
    this.loop.input(this.localSlot, frame, nowMs);
  }

  command(kind: CommandKind, a = 0): void {
    this.loop.command(this.localSlot, kind, a);
  }

  step(nowMs: number, onTick: OnTick): void {
    const s = this.session;
    this.bots.forEach((bot, slot) => {
      if (!bot) return;
      const w = worldOf(s, slot);
      this.loop.input(slot, bot.think(w, slot), nowMs);
      // a bot companion takes its card after a moment, so nobody waits on it
      const d = s.drafts[slot];
      const me = w.players.find((p) => p.slot === slot);
      if (!d || !me || d.offers.length === 0 || d.timer > DRAFT_TICKS - BOT_THINKS) return;
      const key = `${s.attempt}/${s.stop}/${d.rolled}`;
      if (this.answered[slot] === key) return;
      this.answered[slot] = key;
      this.loop.command(slot, 'pick', botPick(d.offers, me.tunings, CONTENT));
    });
    for (const bundle of this.loop.poll(nowMs)) {
      stepSession(s, bundle, CONTENT);
      onTick(s, false);
      for (const w of s.worlds) w.events.length = 0;
    }
  }

  alpha(nowMs: number): number {
    return this.loop.alpha(nowMs);
  }

  net(): NetStats | null {
    return null;
  }
}
