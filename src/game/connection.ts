// This laptop's connection to the host: a WebSocket round the client core. It introduces the
// laptop, follows the lobby, and once a game is on it is the game shell's driver. If the
// connection drops it keeps trying; the host keeps the seat, and sends the whole game when the
// laptop is back.
import { BUILD_ID } from '../buildId';
import { CONTENT } from '../content';
import { ClientCore } from '../net/clientCore';
import type { ClientHooks } from '../net/clientCore';
import { RELAY_PATH } from '../net/protocol';
import type { CommandKind, Session } from '../sim/session';
import type { ClassId, InputFrame } from '../sim/types';
import type { Driver, NetStats, OnTick } from './driver';

/** The longest a single frame spends running to catch up after a stall, in ms. */
const CATCH_UP_BUDGET = 8;
const RETRY_MS = 1000;
const TOKEN_KEY = 'resound.seat';

/** A per-browser id, so the host can give this laptop its seat back after a drop-out. */
function seatToken(): string {
  const fresh = (): string => {
    let t = '';
    for (let i = 0; i < 20; i++) t += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)];
    return t;
  };
  try {
    // one seat per tab: two tabs on one laptop (handy for trying co-op alone) are two players
    const have = window.sessionStorage.getItem(TOKEN_KEY);
    if (have && have.length >= 8) return have;
    const made = fresh();
    window.sessionStorage.setItem(TOKEN_KEY, made);
    return made;
  } catch {
    return fresh();
  }
}

export class CoopDriver implements Driver {
  readonly coop = true;
  readonly core: ClientCore;
  private ws: WebSocket | null = null;
  private onTick: OnTick | null = null;
  private retry = 0;
  private gone = false;

  constructor(name: string, classId: ClassId, hooks: ClientHooks = {}) {
    this.core = new ClientCore(
      { send: (text) => this.ws?.readyState === WebSocket.OPEN && this.ws.send(text) },
      CONTENT,
      { build: BUILD_ID, token: seatToken(), name, classId },
      { ...hooks, onTick: (s, muted) => this.onTick?.(s, muted) },
    );
    this.connect();
  }

  get session(): Session | null {
    return this.core.session;
  }

  get localSlot(): number {
    return Math.max(0, this.core.slot);
  }

  /** True while the socket is open. */
  get online(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private connect(): void {
    if (this.gone) return;
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${window.location.host}${RELAY_PATH}`);
    this.ws = ws;
    ws.onopen = () => this.core.open();
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') this.core.receive(e.data, performance.now());
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.core.closed();
      // turned away, or the host has gone: there is nothing to come back to
      if (this.gone || this.core.phase === 'refused' || this.core.reason !== '') return;
      this.retry = window.setTimeout(() => this.connect(), RETRY_MS);
    };
  }

  input(frame: InputFrame, nowMs: number): void {
    this.core.input(frame, nowMs);
  }

  command(kind: CommandKind, a = 0): void {
    this.core.command(kind, a);
  }

  step(nowMs: number, onTick: OnTick): void {
    this.onTick = onTick;
    this.core.step(nowMs);
    // Far behind (the tab was hidden, the laptop hitched): run, but never for longer than a frame can spare.
    const p = this.core.playout;
    const started = performance.now();
    while (p.depth > p.target + 20 && performance.now() - started < CATCH_UP_BUDGET) {
      if (this.core.step(nowMs) === 0) break;
    }
  }

  alpha(): number {
    return this.core.alpha();
  }

  net(): NetStats {
    const p = this.core.playout;
    return { rtt: this.core.rtt, delay: this.core.delayMs(), buffer: p.depth, target: p.target, resyncs: this.core.resyncs, online: this.online };
  }

  /** Leave for good. */
  close(): void {
    this.gone = true;
    window.clearTimeout(this.retry);
    this.ws?.close();
    this.ws = null;
  }
}

export interface HostInfo {
  build: string;
  phase: string;
  seats: number;
  /** Where other laptops on the network can open the game. */
  addresses: string[];
}

/** Ask whoever served this page whether it is a host. Null alone (the dev server, a plain preview). */
export async function findHost(): Promise<HostInfo | null> {
  try {
    const ctl = new AbortController();
    const timer = window.setTimeout(() => ctl.abort(), 1500);
    const res = await fetch('relay-info', { signal: ctl.signal, cache: 'no-store' });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    const info: unknown = await res.json();
    if (typeof info !== 'object' || info === null) return null;
    const r = info as Record<string, unknown>;
    if (r.game !== 'resound' || typeof r.build !== 'string') return null;
    const addresses = Array.isArray(r.addresses) ? r.addresses.filter((a): a is string => typeof a === 'string') : [];
    return { build: r.build, phase: String(r.phase), seats: Number(r.seats) || 0, addresses };
  } catch {
    return null;
  }
}
