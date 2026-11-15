// The host of a co-op game, without the sockets. It keeps the lobby, closes ticks by the clock
// and sends them to everyone, and runs the same simulation itself as a referee: it compares the
// hashes the laptops report with its own, and sends a laptop that has drifted (or just joined
// again) the whole session to start from.
//
// The host program wraps this in a web server and WebSockets; tests wrap it in a pretend network.
import type { ContentRegistry } from '../sim/defs';
import { MAX_PLAYERS, createSession, stepSession } from '../sim/session';
import type { Bundle, Session, SessionConfig } from '../sim/session';
import { decodeState, hashSession, loadSession, saveSession } from '../sim/snapshot';
import { emptyInput } from '../sim/types';
import { PROTOCOL_VERSION, bytesToText, packBundle, parseClientMsg, textToBytes, unpackBundle, unpackInput } from './protocol';
import type { HostMsg, LobbySeat, PackedBundle } from './protocol';
import { RelayCore, TICK_MS } from './relayCore';

/** One connection. The host program gives each socket one of these. */
export interface Peer {
  send(text: string): void;
  close(): void;
}

interface Seat {
  token: string;
  name: string;
  classId: LobbySeat['classId'];
  ready: boolean;
  peer: Peer | null;
  /** Round trip to this laptop as it last reported, in ms. */
  rtt: number;
}

export interface HostOptions {
  buildId: string;
  /** The seed of the next game; a new one is made from the clock if this is empty. */
  seed?: string;
  /** Development: keep this many enemies alive. */
  stress?: number;
  /** Called when a laptop's hash disagrees with the referee's. */
  onDesync?: (info: { tick: number; slot: number; theirs: number; ours: number }) => void;
  /** Called a moment later with where that laptop's game differed from the referee's: the first few fields, as paths. */
  onDiff?: (info: { tick: number; slot: number; fields: string[] }) => void;
  log?: (line: string) => void;
}

/** What a laptop that gives no name is called on the wire; the host calls it by its seat instead. */
const DEFAULT_NAME = 'Returner';

/** Ticks between hashes, and between whole-session snapshots. */
export const HASH_EVERY = 30;
export const SNAPSHOT_EVERY = 600;
/** A game that everyone has left is kept this long, in case they are coming back, then cleared away. */
export const ABANDON_MS = 30_000;

export class HostCore {
  phase: 'lobby' | 'game' = 'lobby';
  /** Laptops sent a whole session because theirs had drifted. Joining again does not count. */
  repairs = 0;
  session: Session | null = null;

  private readonly seats: Seat[] = [];
  private readonly peers = new Map<Peer, number>();
  private relay: RelayCore | null = null;
  private config: SessionConfig | null = null;
  /** The newest snapshot, and every bundle since it. */
  private snapTick = 0;
  private snapState = '';
  private log: PackedBundle[] = [];
  /** The snapshot before that and the bundles up to the newest, so a laptop's slightly older state can still be checked. */
  private prev: { tick: number; state: string; log: PackedBundle[] } | null = null;
  /** Seats that were just sent a repair, and so may send back what they had. */
  private readonly repaired = new Set<number>();
  /** The referee's own hash at recent ticks. */
  private readonly hashes = new Map<number, number>();
  private games = 0;
  /** When the last laptop left a game in progress, or -1. */
  private emptySince = -1;

  constructor(
    private readonly content: ContentRegistry,
    private readonly opts: HostOptions,
  ) {}

  /** The seats as the lobby shows them. */
  lobby(): LobbySeat[] {
    return this.seats.map((s, slot) => ({ slot, name: s.name, classId: s.classId, ready: s.ready, connected: s.peer !== null }));
  }

  get connected(): number {
    let n = 0;
    for (const s of this.seats) if (s.peer) n++;
    return n;
  }

  private say(peer: Peer, msg: HostMsg): void {
    peer.send(JSON.stringify(msg));
  }

  private everyone(msg: HostMsg): void {
    const text = JSON.stringify(msg);
    for (const s of this.seats) s.peer?.send(text);
  }

  private note(line: string): void {
    this.opts.log?.(line);
  }

  /** A message arrived on a connection. */
  message(peer: Peer, text: string, nowMs: number): void {
    const m = parseClientMsg(text);
    if (!m) return;
    const slot = this.peers.get(peer);
    if (m.t === 'hello') {
      if (slot === undefined) this.hello(peer, m, nowMs);
      return;
    }
    if (slot === undefined) return;
    const seat = this.seats[slot];
    switch (m.t) {
      case 'seat':
        if (this.phase !== 'lobby') return;
        seat.classId = m.classId;
        seat.ready = m.ready;
        this.everyone({ t: 'lobby', seats: this.lobby() });
        break;
      case 'start':
        if (this.phase === 'lobby' && this.seats.length > 0 && this.seats.every((s) => s.peer === null || s.ready)) this.start(nowMs);
        break;
      case 'in': {
        if (!this.relay) return;
        const f = emptyInput();
        if (unpackInput(m.f, f)) this.relay.input(slot, f, nowMs);
        break;
      }
      case 'cmd':
        this.relay?.command({ slot, seq: m.seq, kind: m.kind, a: m.a });
        break;
      case 'hash':
        this.checkHash(peer, slot, m.tick, m.h);
        break;
      case 'ping':
        this.say(peer, { t: 'pong', id: m.id });
        break;
      case 'rtt':
        seat.rtt = m.ms;
        break;
      case 'state':
        if (this.repaired.delete(slot)) this.compare(slot, m.tick, m.state);
        break;
    }
  }

  /** The referee's own session as it stood after `tick`, rebuilt from a snapshot and the ticks after it. */
  private sessionAt(tick: number): Session | null {
    const from = tick >= this.snapTick ? { tick: this.snapTick, state: this.snapState, log: this.log } : this.prev;
    if (!from || tick < from.tick) return null;
    const bytes = textToBytes(from.state);
    if (!bytes) return null;
    const s = loadSession(bytes, this.content);
    for (const packed of from.log) {
      if (s.tick >= tick) break;
      const b = unpackBundle(packed);
      if (!b) return null;
      stepSession(s, b, this.content);
    }
    return s.tick === tick ? s : null;
  }

  /** A repaired laptop has sent what it had: find the fields where it differed from the referee. */
  private compare(slot: number, tick: number, state: string): void {
    const bytes = textToBytes(state);
    const ours = this.sessionAt(tick);
    if (!bytes || !ours) return;
    let theirs: unknown;
    try {
      theirs = decodeState(bytes);
    } catch {
      return;
    }
    const fields: string[] = [];
    diffStates(decodeState(saveSession(ours)), theirs, 'session', fields, 12);
    this.opts.onDiff?.({ tick, slot, fields });
    this.note(`seat ${slot + 1} differed at tick ${tick} in: ${fields.length ? fields.join('; ') : '(nothing found: it had already been put right)'}`);
  }

  private hello(peer: Peer, m: { v: number; build: string; token: string; name: string; classId: LobbySeat['classId'] }, nowMs: number): void {
    if (m.v !== PROTOCOL_VERSION || m.build !== this.opts.buildId) {
      this.say(peer, { t: 'refused', why: 'This page is from a different build of the game than the host. Reload it.' });
      peer.close();
      return;
    }
    let slot = this.seats.findIndex((s) => s.token === m.token);
    if (slot >= 0) {
      // the same laptop, back again: it takes its seat, and the old connection (if any) goes
      const old = this.seats[slot].peer;
      if (old && old !== peer) {
        this.peers.delete(old);
        old.close();
      }
    } else if (this.phase === 'lobby' && this.seats.length < MAX_PLAYERS) {
      slot = this.seats.length;
      this.seats.push({ token: m.token, name: m.name === DEFAULT_NAME ? `Player ${slot + 1}` : m.name, classId: m.classId, ready: false, peer: null, rtt: 0 });
    } else if (this.phase === 'game' && this.seats.some((s) => s.peer === null)) {
      // A game is on, but a seat stands empty (its laptop closed the page, or never came back):
      // whoever arrives takes it over as it is, class and all.
      slot = this.seats.findIndex((s) => s.peer === null);
      this.seats[slot].token = m.token;
    } else {
      this.say(peer, { t: 'refused', why: this.phase === 'lobby' ? 'The game is full: three players at most.' : 'A game is already under way. Join when it is over.' });
      peer.close();
      return;
    }
    const seat = this.seats[slot];
    const back = seat.peer === null && this.phase === 'game';
    seat.peer = peer;
    if (this.phase === 'lobby') {
      seat.name = m.name === DEFAULT_NAME ? `Player ${slot + 1}` : m.name;
      seat.classId = m.classId;
    }
    this.peers.set(peer, slot);
    this.say(peer, { t: 'welcome', v: PROTOCOL_VERSION, build: this.opts.buildId, slot, seats: this.lobby() });
    this.everyone({ t: 'lobby', seats: this.lobby() });
    this.note(`${seat.name} ${back ? 'is back in' : 'took'} seat ${slot + 1}`);
    if (this.phase === 'game') this.sendSession(peer);
    // the clock stood still while nobody was here: it carries on from now
    if (back && this.relay && this.connected === 1) this.relay.resume(nowMs);
  }

  /** A connection closed. Its seat is kept, so the same laptop can come back to it. */
  disconnect(peer: Peer): void {
    const slot = this.peers.get(peer);
    if (slot === undefined) return;
    this.peers.delete(peer);
    const seat = this.seats[slot];
    if (seat.peer === peer) seat.peer = null;
    this.note(`${seat.name} left seat ${slot + 1}`);
    if (this.phase === 'lobby') {
      // an empty seat in the lobby is given up, so someone else can sit down
      this.seats.splice(slot, 1);
      this.peers.clear();
      this.seats.forEach((s, i) => {
        if (s.peer) this.peers.set(s.peer, i);
      });
      for (const s of this.seats) if (s.peer) this.say(s.peer, { t: 'welcome', v: PROTOCOL_VERSION, build: this.opts.buildId, slot: this.peers.get(s.peer) ?? 0, seats: this.lobby() });
    }
    this.everyone({ t: 'lobby', seats: this.lobby() });
  }

  /** Begin the game: everyone builds the same session from one description. */
  private start(nowMs: number): void {
    this.games++;
    // Half a round trip up, a tick of waiting for the clock, half a round trip down, and the buffer.
    const rtt = this.seats.reduce((m, s) => Math.max(m, s.rtt), 0);
    const inputDelay = Math.max(2, Math.min(10, Math.round((rtt + TICK_MS) / TICK_MS) + 2));
    this.config = {
      seed: this.opts.seed && this.opts.seed.length > 0 ? `${this.opts.seed}/${this.games}` : `${Math.floor(nowMs)}-${this.games}`,
      players: this.seats.map((s) => ({ name: s.name, classId: s.classId })),
      buildId: this.opts.buildId,
      inputDelay,
      stress: this.opts.stress ?? 0,
    };
    this.session = createSession(this.config, this.content);
    this.relay = new RelayCore(this.seats.length);
    this.phase = 'game';
    this.log = [];
    this.prev = null;
    this.repaired.clear();
    this.hashes.clear();
    this.snapTick = 0;
    this.snapState = bytesToText(saveSession(this.session));
    for (const s of this.seats) s.ready = false;
    this.everyone({ t: 'start', config: this.config });
    this.note(`game ${this.games} begins: ${this.seats.map((s) => `${s.name} (${s.classId})`).join(', ')}; input delay ${inputDelay} ticks`);
  }

  /** Send a laptop the whole session: the newest snapshot and every tick since. */
  private sendSession(peer: Peer): void {
    if (!this.config) return;
    this.say(peer, { t: 'snap', tick: this.snapTick, config: this.config, state: this.snapState, b: this.log });
  }

  private checkHash(peer: Peer, slot: number, tick: number, theirs: number): void {
    const ours = this.hashes.get(tick);
    if (ours === undefined || ours === theirs) return;
    this.repairs++;
    this.repaired.add(slot);
    this.opts.onDesync?.({ tick, slot, theirs, ours });
    this.note(`seat ${slot + 1} drifted at tick ${tick}: sending it the session again`);
    this.sendSession(peer);
  }

  /**
   * Called often (every few ms) by a timer: closes every tick that is due, steps the referee, and
   * sends the ticks to everyone. With nobody connected the clock stands still.
   */
  pump(nowMs: number): void {
    if (this.phase !== 'game' || !this.relay || !this.session) return;
    if (this.connected === 0) {
      // Nobody is here. Keep the game a while in case they come back; after that it is over,
      // and the next laptops to arrive find an empty lobby rather than somebody else's game.
      if (this.emptySince < 0) this.emptySince = nowMs;
      else if (nowMs - this.emptySince > ABANDON_MS) {
        this.note('everyone has left: the game is over, and the lobby is open again');
        this.seats.length = 0;
        this.peers.clear();
        this.endGame();
      }
      return;
    }
    this.emptySince = -1;
    const due: Bundle[] = this.relay.due(nowMs, 120);
    if (due.length === 0) return;
    const packed: PackedBundle[] = [];
    for (const b of due) {
      stepSession(this.session, b, this.content);
      for (const w of this.session.worlds) w.events.length = 0;
      const p = packBundle(b);
      packed.push(p);
      this.log.push(p);
      if (b.tick % HASH_EVERY === 0) {
        this.hashes.set(b.tick, hashSession(this.session));
        this.hashes.delete(b.tick - HASH_EVERY * 40);
      }
      if (b.tick % SNAPSHOT_EVERY === 0) {
        this.prev = { tick: this.snapTick, state: this.snapState, log: this.log };
        this.snapTick = b.tick;
        this.snapState = bytesToText(saveSession(this.session));
        this.log = [];
      }
    }
    this.everyone({ t: 'b', b: packed });
  }

  /** The game is over for everyone: back to the lobby with the same seats. */
  endGame(): void {
    this.phase = 'lobby';
    this.session = null;
    this.relay = null;
    this.config = null;
    this.log = [];
    this.everyone({ t: 'lobby', seats: this.lobby() });
  }

  /** The host program is closing. */
  shutdown(why: string): void {
    this.everyone({ t: 'bye', why });
    for (const s of this.seats) s.peer?.close();
  }
}

/**
 * Where two states differ, as paths like `session.worlds[0].players[1].hp (12 / 11)`. Both are
 * plain data as the snapshot decoder returns it. Stops after `limit` differences.
 */
export function diffStates(a: unknown, b: unknown, path: string, out: string[], limit: number): void {
  if (out.length >= limit) return;
  if (a instanceof Uint8Array || b instanceof Uint8Array) {
    if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) {
      out.push(`${path} (bytes differ in length)`);
      return;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        out.push(`${path}[${i}] (${a[i]} / ${b[i]})`);
        return;
      }
    }
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      out.push(`${path} (one is a list, one is not)`);
      return;
    }
    if (a.length !== b.length) out.push(`${path}.length (${a.length} / ${b.length})`);
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n && out.length < limit; i++) diffStates(a[i], b[i], `${path}[${i}]`, out, limit);
    return;
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(ra), ...Object.keys(rb)])).sort();
    for (const k of keys) {
      if (out.length >= limit) return;
      if (!(k in ra) || !(k in rb)) out.push(`${path}.${k} (only on one side)`);
      else diffStates(ra[k], rb[k], `${path}.${k}`, out, limit);
    }
    return;
  }
  if (!Object.is(a, b)) out.push(`${path} (${String(a)} / ${String(b)})`);
}
