// Who steps the game. Alone, the page runs the relay itself and plays any other seats with bots
// (SoloDriver). In co-op the host sets the clock and this laptop follows it (CoopDriver, in
// connection.ts). The game shell talks to either through this one shape, so it never knows or
// cares which it has.
import { CONTENT } from '../content';
import { Loopback } from '../net/transport';
import { EXPERT, botCommands, classBot } from '../sim/bots';
import type { Bot } from '../sim/bots';
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
  /** The seats bots play, and for each seat the tick before which its bot sends no further command. */
  private readonly botSeats: number[];
  private readonly quietUntil: number[] = [];

  constructor(config: SessionConfig) {
    this.session = createSession(config, CONTENT);
    this.loop = new Loopback(config.players.length);
    this.bots = config.players.map((p, slot) => (slot === this.localSlot ? null : classBot(p.classId, EXPERT)));
    this.botSeats = config.players.map((_, slot) => slot).filter((slot) => slot !== this.localSlot);
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
      if (bot) this.loop.input(slot, bot.think(worldOf(s, slot), slot), nowMs);
    });
    // What the bot companions decide outside their hands: a card, and what to do at a camp. One
    // thing at a time, with a moment between, so that each is asked for once and nobody waits long.
    for (const c of botCommands(s, CONTENT, this.botSeats)) {
      if (s.tick < (this.quietUntil[c.slot] ?? 0)) continue;
      this.quietUntil[c.slot] = s.tick + 20;
      this.loop.command(c.slot, c.kind, c.a);
    }
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
