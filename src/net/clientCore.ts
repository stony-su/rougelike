// A laptop's end of a co-op game, without the socket. It says hello, follows the lobby, builds
// the session the host describes, plays the host's ticks out through the playout buffer, and
// tells the host its hash now and then. If the host sends a whole session (because this laptop
// joined again or drifted), it starts from that and runs to catch up.
//
// The page wraps this round a WebSocket; tests wrap it round a pretend network.
import { noBoons } from '../sim/boons';
import type { Boons } from '../sim/boons';
import type { ContentRegistry } from '../sim/defs';
import { createSession, stepSession } from '../sim/session';
import type { CommandKind, Session, SessionConfig } from '../sim/session';
import { hashSession, loadSession, saveSession } from '../sim/snapshot';
import type { ClassId, InputFrame, World } from '../sim/types';
import { HASH_EVERY } from './hostCore';
import { Playout } from './playout';
import { PROTOCOL_VERSION, bytesToText, packInput, parseHostMsg, textToBytes, unpackBundle } from './protocol';
import type { ClientMsg, LobbySeat } from './protocol';
import { TICK_MS } from './relayCore';

export interface Wire {
  send(text: string): void;
}

export interface Hello {
  build: string;
  /** A per-browser id, so this laptop can take its seat back after dropping out. */
  token: string;
  name: string;
  classId: ClassId;
  /** What this player brings from their Attunement as that class. */
  boons?: Boons;
}

export interface ClientHooks {
  /** Called after each tick is stepped, before its events are cleared. `muted` while running to catch up. */
  onTick?: (session: Session, muted: boolean) => void;
  /** The session object has been replaced (a game began, or a whole session arrived from the host). */
  onSession?: (session: Session, config: SessionConfig) => void;
  onLobby?: (seats: LobbySeat[], slot: number) => void;
  onRefused?: (why: string) => void;
  onBye?: (why: string) => void;
}

export type ClientPhase = 'connecting' | 'lobby' | 'game' | 'refused' | 'closed';

/** How often the round trip is measured, in ms. */
const PING_EVERY = 500;

export class ClientCore {
  phase: ClientPhase = 'connecting';
  slot = -1;
  seats: LobbySeat[] = [];
  session: Session | null = null;
  config: SessionConfig | null = null;
  readonly playout = new Playout();
  /** Round trip to the host, smoothed, in ms. */
  rtt = 0;
  /** Whole sessions received because this laptop had drifted (not counting joining). */
  resyncs = 0;
  /** Why the host turned this laptop away, or closed. */
  reason = '';

  private seq = 0;
  private lastSent = '';
  private lastSentAt = -1e9;
  private pingId = 0;
  private pingAt = -1e9;
  private readonly pings = new Map<number, number>();
  private expectSnap = true;

  constructor(
    private readonly wire: Wire,
    private readonly content: ContentRegistry,
    private readonly me: Hello,
    private readonly hooks: ClientHooks = {},
  ) {}

  private say(m: ClientMsg): void {
    this.wire.send(JSON.stringify(m));
  }

  /** The connection is open: introduce this laptop. */
  open(): void {
    this.expectSnap = true;
    this.say({ t: 'hello', v: PROTOCOL_VERSION, build: this.me.build, token: this.me.token, name: this.me.name, classId: this.me.classId, boons: this.me.boons ?? noBoons() });
  }

  /** The connection closed without a word. */
  closed(): void {
    if (this.phase !== 'refused') this.phase = 'closed';
  }

  /** In the lobby: choose a class, say ready. `boons` is what this player brings as that class; left out, what was last said stands. */
  seat(classId: ClassId, ready: boolean, boons?: Boons): void {
    this.me.classId = classId;
    if (boons) this.me.boons = boons;
    this.say({ t: 'seat', classId, ready, boons: this.me.boons ?? noBoons() });
  }

  /** In the lobby: ask the host to begin. It does if everyone is ready. */
  start(): void {
    this.say({ t: 'start' });
  }

  /**
   * This laptop's input. Sent when it changes, and otherwise a few times a second so the host
   * knows the laptop is still there.
   */
  input(frame: InputFrame, nowMs: number): void {
    if (this.phase !== 'game') return;
    const packed = packInput(frame);
    const text = packed.join(',');
    if (text === this.lastSent && nowMs - this.lastSentAt < 100) return;
    this.lastSent = text;
    this.lastSentAt = nowMs;
    this.say({ t: 'in', f: packed });
  }

  command(kind: CommandKind, a = 0): void {
    if (this.phase === 'game') this.say({ t: 'cmd', seq: ++this.seq, kind, a });
  }

  /** A message arrived from the host. */
  receive(text: string, nowMs: number): void {
    const m = parseHostMsg(text);
    if (!m) return;
    switch (m.t) {
      case 'welcome':
        this.slot = m.slot;
        this.seats = m.seats;
        if (this.phase === 'connecting' || this.phase === 'closed') this.phase = 'lobby';
        this.hooks.onLobby?.(this.seats, this.slot);
        break;
      case 'lobby':
        this.seats = m.seats;
        if (this.phase === 'game' && this.session === null) this.phase = 'lobby';
        this.hooks.onLobby?.(this.seats, this.slot);
        break;
      case 'refused':
        this.phase = 'refused';
        this.reason = m.why;
        this.hooks.onRefused?.(m.why);
        break;
      case 'start':
        this.config = m.config;
        this.session = createSession(m.config, this.content);
        this.playout.reset(0);
        this.seq = 0;
        this.phase = 'game';
        this.expectSnap = false;
        this.hooks.onSession?.(this.session, m.config);
        break;
      case 'snap': {
        const bytes = textToBytes(m.state);
        if (!bytes) return;
        if (!this.expectSnap) {
          // This laptop had drifted. Before it is put right, it sends what it had, so the host can find where.
          this.resyncs++;
          if (this.session) this.say({ t: 'state', tick: this.session.tick, state: bytesToText(saveSession(this.session)) });
        }
        this.expectSnap = false;
        this.config = m.config;
        this.session = loadSession(bytes, this.content);
        this.playout.reset(m.tick);
        this.phase = 'game';
        this.take(m.b, nowMs);
        this.hooks.onSession?.(this.session, m.config);
        break;
      }
      case 'b':
        if (this.phase === 'game') this.take(m.b, nowMs);
        break;
      case 'pong': {
        const sent = this.pings.get(m.id);
        if (sent === undefined) return;
        this.pings.delete(m.id);
        const sample = nowMs - sent;
        this.rtt = this.rtt === 0 ? sample : this.rtt * 0.8 + sample * 0.2;
        this.say({ t: 'rtt', ms: Math.round(this.rtt) });
        break;
      }
      case 'bye':
        this.phase = 'closed';
        this.reason = m.why;
        this.hooks.onBye?.(m.why);
        break;
    }
  }

  private take(packed: readonly unknown[], nowMs: number): void {
    const list = [];
    for (const p of packed) {
      const b = unpackBundle(p);
      if (b) list.push(b);
    }
    this.playout.receive(list, nowMs);
  }

  /**
   * Step the session by whatever the playout buffer releases now. Returns how many ticks were
   * stepped. Call once per rendered frame (and from a timer while the tab is hidden).
   */
  step(nowMs: number): number {
    if (nowMs - this.pingAt >= PING_EVERY && this.phase !== 'refused' && this.phase !== 'closed') {
      this.pingAt = nowMs;
      this.pings.set(++this.pingId, nowMs);
      if (this.pings.size > 8) this.pings.delete(this.pingId - 8);
      this.say({ t: 'ping', id: this.pingId });
    }
    const s = this.session;
    if (this.phase !== 'game' || !s) return 0;
    const bundles = this.playout.poll(nowMs);
    // more than a few at once is a run to catch up: what happens in it is old news
    const muted = bundles.length > 3;
    for (const b of bundles) {
      stepSession(s, b, this.content);
      this.hooks.onTick?.(s, muted);
      for (const w of s.worlds) w.events.length = 0;
      if (b.tick % HASH_EVERY === 0) this.say({ t: 'hash', tick: b.tick, h: hashSession(s) });
    }
    return bundles.length;
  }

  /** 0..1: how far play is toward the next tick, for drawing between ticks. */
  alpha(): number {
    return this.playout.alpha();
  }

  /** The world this laptop's player is in, if a game is on. */
  world(): World | null {
    const s = this.session;
    if (!s || this.slot < 0) return null;
    return s.worlds[s.where[this.slot] ?? 0] ?? null;
  }

  /** From a press here to its effect on this screen, roughly, in ms: up, the wait for the clock, down, and the buffer. */
  delayMs(): number {
    return this.rtt + TICK_MS * (0.5 + this.playout.target);
  }
}
