// One canonical encoding of session state, used for two things: the hash that proves every
// laptop holds the same state, and the snapshot a laptop loads to rejoin or to be repaired.
//
// The encoding walks plain data in a fixed order (object keys sorted) and writes every number as
// its raw 64 bits, so two states are equal exactly when their bytes are equal: -0 is not 0, and
// nothing is rounded through text. State may contain numbers, strings, booleans, null, arrays,
// plain objects, Uint8Arrays and the seeded generator; anything else is a bug and throws.
//
// Three keys are never written, because they are not state: `events` (already handed to
// presentation), and the pointers `def` and `content`, which are looked up again from ids by
// `relink` after a snapshot is loaded.
import { Rng } from '../core/rng';
import type { ContentRegistry } from './defs';
import type { Session } from './session';

const T_NULL = 0;
const T_FALSE = 1;
const T_TRUE = 2;
const T_NUM = 3;
const T_STR = 4;
const T_ARR = 5;
const T_OBJ = 6;
const T_BYTES = 7;
const T_RNG = 8;

const SKIP: Readonly<Record<string, true>> = { events: true, def: true, content: true };

class Writer {
  private buf = new Uint8Array(1 << 14);
  private view = new DataView(this.buf.buffer);
  private n = 0;

  private room(k: number): void {
    if (this.n + k <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.n + k) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.n));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number): void {
    this.room(1);
    this.buf[this.n++] = v;
  }

  u32(v: number): void {
    this.room(4);
    this.view.setUint32(this.n, v >>> 0);
    this.n += 4;
  }

  f64(v: number): void {
    this.room(8);
    this.view.setFloat64(this.n, v);
    this.n += 8;
  }

  /** Strings go out as their UTF-16 code units, which is the same on every engine. */
  str(s: string): void {
    this.u32(s.length);
    this.room(s.length * 2);
    for (let i = 0; i < s.length; i++) {
      this.view.setUint16(this.n, s.charCodeAt(i));
      this.n += 2;
    }
  }

  bytes(b: Uint8Array): void {
    this.u32(b.length);
    this.room(b.length);
    this.buf.set(b, this.n);
    this.n += b.length;
  }

  done(): Uint8Array {
    return this.buf.slice(0, this.n);
  }
}

function write(w: Writer, v: unknown, path: string): void {
  if (v === null || v === undefined) {
    w.u8(T_NULL);
  } else if (typeof v === 'number') {
    if (v !== v) throw new Error(`NaN in state at ${path}`);
    w.u8(T_NUM);
    w.f64(v);
  } else if (typeof v === 'boolean') {
    w.u8(v ? T_TRUE : T_FALSE);
  } else if (typeof v === 'string') {
    w.u8(T_STR);
    w.str(v);
  } else if (Array.isArray(v)) {
    w.u8(T_ARR);
    w.u32(v.length);
    for (let i = 0; i < v.length; i++) write(w, v[i], `${path}[${i}]`);
  } else if (v instanceof Uint8Array) {
    w.u8(T_BYTES);
    w.bytes(v);
  } else if (v instanceof Rng) {
    w.u8(T_RNG);
    w.u32(v.state);
  } else if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o)
      .filter((k) => !SKIP[k] && o[k] !== undefined)
      .sort();
    w.u8(T_OBJ);
    w.u32(keys.length);
    for (const k of keys) {
      w.str(k);
      write(w, o[k], `${path}.${k}`);
    }
  } else {
    throw new Error(`State at ${path} is not plain data`);
  }
}

/** The canonical bytes of a piece of state. */
export function encodeState(root: unknown): Uint8Array {
  const w = new Writer();
  write(w, root, '$');
  return w.done();
}

class Reader {
  private readonly view: DataView;
  private n = 0;

  constructor(private readonly buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  u8(): number {
    return this.buf[this.n++];
  }

  u32(): number {
    const v = this.view.getUint32(this.n);
    this.n += 4;
    return v;
  }

  f64(): number {
    const v = this.view.getFloat64(this.n);
    this.n += 8;
    return v;
  }

  str(): string {
    const len = this.u32();
    let s = '';
    for (let i = 0; i < len; i++) {
      s += String.fromCharCode(this.view.getUint16(this.n));
      this.n += 2;
    }
    return s;
  }

  bytes(): Uint8Array {
    const len = this.u32();
    const out = this.buf.slice(this.n, this.n + len);
    this.n += len;
    return out;
  }
}

function read(r: Reader): unknown {
  const tag = r.u8();
  switch (tag) {
    case T_NULL:
      return null;
    case T_FALSE:
      return false;
    case T_TRUE:
      return true;
    case T_NUM:
      return r.f64();
    case T_STR:
      return r.str();
    case T_ARR: {
      const n = r.u32();
      const a: unknown[] = new Array(n);
      for (let i = 0; i < n; i++) a[i] = read(r);
      return a;
    }
    case T_OBJ: {
      const n = r.u32();
      const o: Record<string, unknown> = {};
      for (let i = 0; i < n; i++) {
        const k = r.str();
        o[k] = read(r);
      }
      return o;
    }
    case T_BYTES:
      return r.bytes();
    case T_RNG:
      return Rng.fromState(r.u32());
    default:
      throw new Error(`Snapshot is damaged (unknown tag ${tag})`);
  }
}

export function decodeState(bytes: Uint8Array): unknown {
  return read(new Reader(bytes));
}

/** FNV-1a over bytes, as an unsigned 32-bit number. */
export function hashBytes(bytes: Uint8Array): number {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A number that is the same on every laptop exactly when their sessions are the same. */
export const hashSession = (s: Session): number => hashBytes(encodeState(s));

/** Look the derived pointers up again from their ids. Call after loading a snapshot. */
export function relink(s: Session, content: ContentRegistry): void {
  for (const w of s.worlds) {
    w.content = content;
    w.events = [];
    for (const e of w.enemies) {
      const def = content.enemies[e.defId];
      if (!def) throw new Error(`Snapshot names an enemy this build does not have: ${e.defId}`);
      e.def = def;
    }
  }
}

export const saveSession = (s: Session): Uint8Array => encodeState(s);

export function loadSession(bytes: Uint8Array, content: ContentRegistry): Session {
  const s = decodeState(bytes) as Session;
  relink(s, content);
  return s;
}
