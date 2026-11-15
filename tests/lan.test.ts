// A pretend network. One host core and up to three laptop cores, each laptop in its own copy of
// the game's modules (as on a real laptop), joined by links that delay and bunch their messages
// the way Wi-Fi does. The laptops draw at different rates, one freezes for a while, one drops
// out and comes back, one has its memory corrupted. Whatever happens, every laptop must step
// every tick and arrive at exactly the same game.
import { describe, expect, it, vi } from 'vitest';
import { CONTENT } from '../src/content';
import { Rng } from '../src/core/rng';
import { ABANDON_MS, HostCore } from '../src/net/hostCore';
import type { Peer } from '../src/net/hostCore';
import { MAX_BUFFER, MIN_BUFFER, Playout } from '../src/net/playout';
import { TICK_MS } from '../src/net/relayCore';
import type { Bundle, Session } from '../src/sim/session';
import { emptyInput } from '../src/sim/types';
import type { ClassId, InputFrame } from '../src/sim/types';

/** What a laptop is made of: its own copies of everything, loaded fresh. */
interface Laptop {
  name: string;
  core: InstanceType<typeof import('../src/net/clientCore').ClientCore>;
  /** The hash after each tick this laptop has stepped. */
  hashes: Map<number, number>;
  /** Dashes each seat was seen to make, counted from this laptop's own events. */
  dashes: number[];
  /** Ticks stepped while running to catch up. */
  muted: number;
  think: (nowMs: number) => void;
  /** Milliseconds between frames, and when the next one is due. */
  frameMs: number;
  nextFrame: number;
  /** Not drawing (a frozen tab) until this time. */
  frozenUntil: number;
  link: Link | null;
  token: string;
  classId: ClassId;
}

class Link {
  private lastUp = 0;
  private lastDown = 0;
  open = true;
  constructor(
    private readonly net: Net,
    readonly latency: number,
    readonly jitter: number,
    private readonly rng: Rng,
  ) {}

  /** When a message sent now arrives: late by the latency and some jitter, but never out of order. */
  private arrival(last: number): number {
    return Math.max(last, this.net.now + this.latency + this.rng.float(0, this.jitter));
  }

  up(fn: () => void): void {
    this.lastUp = this.arrival(this.lastUp);
    this.net.at(this.lastUp, () => this.open && fn());
  }

  down(fn: () => void): void {
    this.lastDown = this.arrival(this.lastDown);
    this.net.at(this.lastDown, () => this.open && fn());
  }
}

class Net {
  now = 0;
  private readonly events: Array<{ at: number; seq: number; fn: () => void }> = [];
  private seq = 0;
  readonly rng: Rng;
  readonly host: HostCore;
  readonly laptops: Laptop[] = [];
  desyncs = 0;

  /** Where a drifted laptop's game differed from the referee's, as the host worked it out. */
  readonly diffs: string[][] = [];

  constructor(seed: number, hostSeed = 'lan', startAt?: number) {
    this.rng = new Rng(seed);
    this.host = new HostCore(CONTENT, { buildId: 'test', seed: hostSeed, startAt, onDesync: () => this.desyncs++, onDiff: (d) => this.diffs.push(d.fields) });
  }

  at(time: number, fn: () => void): void {
    this.events.push({ at: time, seq: this.seq++, fn });
  }

  /** Build a laptop from fresh copies of the game's modules, and connect it. */
  async join(name: string, classId: ClassId, latency: number, jitter: number, frameMs: number, o: { bot?: boolean } = {}): Promise<Laptop> {
    vi.resetModules();
    const { ClientCore } = await import('../src/net/clientCore');
    const content = (await import('../src/content')).CONTENT;
    const { hashSession } = await import('../src/sim/snapshot');
    const { classBot } = await import('../src/sim/bots');
    const laptop: Laptop = {
      name,
      core: null as unknown as Laptop['core'],
      hashes: new Map(),
      dashes: [0, 0, 0],
      muted: 0,
      think: () => undefined,
      frameMs,
      nextFrame: 0,
      frozenUntil: 0,
      link: null,
      token: `token-${name}-0000`,
      classId,
    };
    const wire = { send: (text: string) => laptop.link?.up(() => this.host.message(peerOf(laptop), text, this.now)) };
    const peers = this.peers;
    const peerOf = (l: Laptop): Peer => peers.get(l) as Peer;
    laptop.core = new ClientCore(
      wire,
      content,
      { build: 'test', token: laptop.token, name, classId },
      {
        onTick: (s: Session, muted: boolean) => {
          laptop.hashes.set(s.tick, hashSession(s));
          if (muted) laptop.muted++;
          for (const w of s.worlds) for (const ev of w.events) if (ev.type === 'dash') laptop.dashes[ev.player]++;
        },
      },
    );
    if (o.bot !== false) {
      const bot = classBot(classId);
      laptop.think = (nowMs) => {
        const w = laptop.core.world();
        if (w) laptop.core.input(bot.think(w, laptop.core.slot), nowMs);
      };
    }
    this.laptops.push(laptop);
    this.connect(laptop, latency, jitter);
    return laptop;
  }

  private readonly peers = new Map<Laptop, Peer>();

  /** Open a connection from a laptop to the host. */
  connect(laptop: Laptop, latency: number, jitter: number): void {
    const link = new Link(this, latency, jitter, this.rng.fork(laptop.name));
    laptop.link = link;
    const peer: Peer = {
      send: (text) => link.down(() => laptop.core.receive(text, this.now)),
      // like a real socket, closing lets what was already sent arrive first
      close: () =>
        link.down(() => {
          link.open = false;
          laptop.core.closed();
        }),
    };
    this.peers.set(laptop, peer);
    laptop.core.open();
  }

  /** Cut a laptop off without a word, as when its Wi-Fi drops. */
  drop(laptop: Laptop): void {
    const peer = this.peers.get(laptop);
    if (laptop.link) laptop.link.open = false;
    laptop.link = null;
    if (peer) this.host.disconnect(peer);
    laptop.core.closed();
  }

  /** Let time pass, a millisecond at a time: messages arrive, the host pumps, laptops draw frames. */
  run(ms: number): void {
    const end = this.now + ms;
    while (this.now < end) {
      this.now += 1;
      // deliver what is due, in the order it was sent
      const due = this.events.filter((e) => e.at <= this.now).sort((a, b) => a.at - b.at || a.seq - b.seq);
      if (due.length) {
        for (const e of due) this.events.splice(this.events.indexOf(e), 1);
        for (const e of due) e.fn();
      }
      // the host wakes every few ms, not quite evenly
      if (this.now % 4 === 0 || this.rng.chance(0.05)) this.host.pump(this.now);
      for (const l of this.laptops) {
        if (this.now < l.nextFrame || this.now < l.frozenUntil || !l.link) continue;
        l.nextFrame = this.now + l.frameMs;
        l.think(this.now);
        l.core.step(this.now);
      }
    }
  }
}

/** Every tick that all the given laptops have stepped has the same hash on each. Returns how many ticks were compared. */
function agree(laptops: Laptop[], from = 1): number {
  let compared = 0;
  const first = laptops[0];
  for (const [tick, h] of first.hashes) {
    if (tick < from) continue;
    let all = true;
    for (const l of laptops) {
      const other = l.hashes.get(tick);
      if (other === undefined) {
        all = false;
        break;
      }
      if (other !== h) throw new Error(`${first.name} and ${l.name} disagree at tick ${tick}`);
    }
    if (all) compared++;
  }
  return compared;
}

async function party(net: Net): Promise<Laptop[]> {
  const a = await net.join('Ada', 'sword', 4, 4, 16.7);
  const b = await net.join('Bo', 'bow', 18, 22, 13.3);
  const c = await net.join('Cy', 'fist', 45, 60, 6.9);
  net.run(400);
  for (const l of [a, b, c]) l.core.seat(l.classId, true);
  net.run(300);
  a.core.start();
  net.run(300);
  return [a, b, c];
}

describe('the lobby', () => {
  it('seats laptops in the order they arrive, shows everyone the same seats, and begins when all are ready', async () => {
    const net = new Net(1);
    const a = await net.join('Ada', 'sword', 5, 3, 16.7);
    const b = await net.join('Bo', 'bow', 20, 10, 16.7);
    net.run(300);
    expect([a.core.phase, b.core.phase]).toEqual(['lobby', 'lobby']);
    expect([a.core.slot, b.core.slot]).toEqual([0, 1]);
    expect(b.core.seats.map((s) => [s.name, s.classId, s.ready])).toEqual([
      ['Ada', 'sword', false],
      ['Bo', 'bow', false],
    ]);
    // not everyone is ready: nothing begins
    a.core.seat('fist', true);
    a.core.start();
    net.run(300);
    expect(net.host.phase).toBe('lobby');
    expect(b.core.seats[0]).toMatchObject({ classId: 'fist', ready: true });
    b.core.seat('bow', true);
    net.run(200);
    b.core.start();
    net.run(400);
    expect(net.host.phase).toBe('game');
    expect([a.core.phase, b.core.phase]).toEqual(['game', 'game']);
    // everyone built the same game from the same description
    expect(a.core.config).toEqual(b.core.config);
    expect(a.core.config?.players.map((p) => p.classId)).toEqual(['fist', 'bow']);
    expect(a.core.config?.inputDelay).toBeGreaterThanOrEqual(2);
  });

  it('turns away a fourth laptop, a different build, and anyone new once a game is on', async () => {
    const net = new Net(2);
    const [a] = await party(net);
    expect(net.host.phase).toBe('game');
    const late = await net.join('Dee', 'sword', 5, 2, 16.7);
    net.run(300);
    expect(late.core.phase).toBe('refused');
    expect(late.core.reason).toMatch(/under way/);
    expect(a.core.phase).toBe('game');
    // but when a seat stands empty, whoever arrives takes it over as it is
    net.drop(net.laptops[2]);
    net.run(500);
    const sub = await net.join('Eve', 'sword', 5, 2, 16.7);
    net.run(2500);
    expect(sub.core.phase).toBe('game');
    expect(sub.core.slot).toBe(2);
    expect(sub.core.config?.players[2].classId).toBe('fist');
    expect(net.host.repairs).toBe(0);
    expect(agree([a, sub], Math.max(...sub.hashes.keys()) - 30)).toBeGreaterThan(10);

    const other = new Net(3);
    for (const n of ['A', 'B', 'C']) {
      await other.join(n, 'sword', 3, 1, 16.7);
      other.run(20);
    }
    const fourth = await other.join('D', 'bow', 3, 1, 16.7);
    other.run(200);
    expect(fourth.core.phase).toBe('refused');
    expect(fourth.core.reason).toMatch(/full/);
  });

  it('gives up the seat of a laptop that leaves the lobby', async () => {
    const net = new Net(4);
    const a = await net.join('Ada', 'sword', 5, 3, 16.7);
    const b = await net.join('Bo', 'bow', 5, 3, 16.7);
    net.run(200);
    net.drop(a);
    net.run(200);
    expect(b.core.slot).toBe(0);
    expect(b.core.seats).toHaveLength(1);
  });
});

describe('a game over a rough network', () => {
  it('three laptops with different lag and frame rates stay in step, tick for tick, with no repairs', async () => {
    const net = new Net(11);
    const laptops = await party(net);
    net.run(20_000);
    const compared = agree(laptops);
    expect(compared).toBeGreaterThan(1000);
    expect(net.host.repairs).toBe(0);
    expect(net.desyncs).toBe(0);
    for (const l of laptops) {
      expect(l.core.resyncs).toBe(0);
      // nobody fell far behind the host
      expect((net.host.session?.tick ?? 0) - Math.max(...l.hashes.keys())).toBeLessThan(40);
    }
    // it was a real fight, not three people standing still
    const w = laptops[0].core.world();
    expect(w?.stats.kills).toBeGreaterThan(3);
    expect(w?.stats.returns).toBeGreaterThan(0);
  });

  it('stay in step through a fork, each in a chamber of their own, and through the meeting after it', async () => {
    // the seventh chamber is always a side-chamber: the game begins there, already apart
    const net = new Net(31, 'fork', 7);
    const laptops = await party(net);
    const apart = laptops[0].core.session;
    expect(apart?.worlds.length).toBe(3);
    // each laptop draws the chamber its own player is in
    expect(new Set(laptops.map((l) => l.core.world()?.room.id)).size).toBe(3);
    let together = false;
    for (let t = 0; t < 110 && !together; t++) {
      net.run(1000);
      together = laptops.every((l) => (l.core.session?.stop ?? 0) >= 7);
    }
    expect(together).toBe(true);
    net.run(1500);
    for (const l of laptops) expect(l.core.session?.worlds.length).toBe(1);
    expect(new Set(laptops.map((l) => l.core.world()?.room.id)).size).toBe(1);
    expect(agree(laptops)).toBeGreaterThan(600);
    expect(net.desyncs).toBe(0);
  });

  it('a laptop that freezes for a while runs to catch up and is still in step', async () => {
    const net = new Net(12);
    const laptops = await party(net);
    net.run(4000);
    laptops[1].frozenUntil = net.now + 900;
    net.run(6000);
    expect(laptops[1].muted).toBeGreaterThan(20);
    expect(agree(laptops)).toBeGreaterThan(400);
    expect(net.host.repairs).toBe(0);
    for (const l of laptops) expect(l.core.resyncs).toBe(0);
    // and it is back near the front
    expect((net.host.session?.tick ?? 0) - Math.max(...laptops[1].hashes.keys())).toBeLessThan(40);
  });

  it('a laptop that drops out keeps its seat, and comes back to exactly the same game', async () => {
    const net = new Net(13);
    const laptops = await party(net);
    net.run(3000);
    const gone = laptops[2];
    net.drop(gone);
    net.run(2500);
    expect(net.host.lobby()[2]).toMatchObject({ connected: false });
    const before = Math.max(...gone.hashes.keys());
    net.connect(gone, 30, 20);
    net.run(5000);
    expect(gone.core.phase).toBe('game');
    expect(gone.core.slot).toBe(2);
    // it was sent the whole session: that is joining, not a repair
    expect(gone.core.resyncs).toBe(0);
    expect(net.host.repairs).toBe(0);
    expect(Math.max(...gone.hashes.keys())).toBeGreaterThan(before + 200);
    expect(agree(laptops, before + 200)).toBeGreaterThan(100);
  });

  it('a laptop whose game has gone wrong is noticed and put right within a second', async () => {
    const net = new Net(14);
    const laptops = await party(net);
    net.run(3000);
    const bad = laptops[1];
    const world = bad.core.world();
    if (!world) throw new Error('no world');
    world.players[0].hp -= 1;
    const brokenAt = Math.max(...bad.hashes.keys());
    net.run(1200);
    expect(net.host.repairs).toBe(1);
    expect(net.desyncs).toBe(1);
    expect(bad.core.resyncs).toBe(1);
    // and the host worked out exactly what had gone wrong: that player's health, off by one
    expect(net.diffs).toHaveLength(1);
    expect(net.diffs[0].some((f) => /^session\.worlds\[0\]\.players\[0\]\.hp \(/.test(f))).toBe(true);
    // forget what it thought while it was wrong, then compare from the repair on
    net.run(3000);
    const repairedBy = brokenAt + 90;
    expect(agree(laptops, repairedBy)).toBeGreaterThan(100);
    expect(net.host.repairs).toBe(1);
  });

  it('a press is never lost and never counted twice, however the messages are bunched', async () => {
    const net = new Net(15);
    const a = await net.join('Ada', 'sword', 5, 4, 16.7);
    // this laptop is played by a script, over a link that bunches badly
    const b = await net.join('Bo', 'sword', 40, 120, 16.7, { bot: false });
    net.run(400);
    a.core.seat('sword', true);
    b.core.seat('sword', true);
    net.run(300);
    a.core.start();
    net.run(1500);
    const f: InputFrame = emptyInput();
    let pressed = 0;
    for (let i = 0; i < 12; i++) {
      // a dash every 1.6 seconds: both charges are always back by then
      f.presses[2] = (f.presses[2] + 1) & 255;
      pressed++;
      for (let t = 0; t < 1600; t += 20) {
        b.core.input(f, net.now);
        net.run(20);
      }
    }
    net.run(1500);
    expect(a.dashes[1]).toBe(pressed);
    expect(b.dashes[1]).toBe(pressed);
    expect(agree([a, b])).toBeGreaterThan(500);
    expect(net.host.repairs).toBe(0);
  });

  it('two commands sent at the same moment are applied the same way everywhere', async () => {
    const net = new Net(16);
    const laptops = await party(net);
    net.run(1500);
    laptops[0].core.command('pause');
    laptops[2].core.command('pause');
    net.run(1500);
    const paused = laptops.map((l) => l.core.session?.pausedBy);
    expect(new Set(paused).size).toBe(1);
    expect(agree(laptops)).toBeGreaterThan(100);
    expect(net.host.repairs).toBe(0);
  });

  it('the clock stands still while nobody is connected', async () => {
    const net = new Net(17);
    const a = await net.join('Ada', 'sword', 5, 3, 16.7);
    net.run(200);
    a.core.seat('sword', true);
    net.run(100);
    a.core.start();
    net.run(2000);
    net.drop(a);
    const tick = net.host.session?.tick ?? 0;
    net.run(3000);
    expect(net.host.session?.tick).toBe(tick);
    net.connect(a, 5, 3);
    net.run(2000);
    // about two more seconds of game, not five
    const now = net.host.session?.tick ?? 0;
    expect(now - tick).toBeGreaterThan(90);
    expect(now - tick).toBeLessThan(140);
    expect(a.core.resyncs).toBe(0);
  });
});

describe('an abandoned game', () => {
  it('is kept a while for people coming back, then cleared away so the next party finds an empty lobby', async () => {
    const net = new Net(18);
    const a = await net.join('Ada', 'sword', 5, 3, 16.7);
    net.run(200);
    a.core.seat('sword', true);
    net.run(100);
    a.core.start();
    net.run(1500);
    net.drop(a);
    net.run(ABANDON_MS - 5000);
    expect(net.host.phase).toBe('game');
    net.run(6000);
    expect(net.host.phase).toBe('lobby');
    expect(net.host.lobby()).toHaveLength(0);
    // someone new sits down in seat 1 of a fresh lobby
    const b = await net.join('Bo', 'fist', 5, 3, 16.7);
    net.run(300);
    expect(b.core.phase).toBe('lobby');
    expect(b.core.slot).toBe(0);
  });
});

describe('the playout buffer', () => {
  const bundle = (tick: number): Bundle => ({ tick, inputs: [], cmds: [] });

  it('plays a steady stream at sixty a second, holding a small cushion', () => {
    const p = new Playout();
    const played: number[] = [];
    let sent = 0;
    for (let ms = 0; ms < 5000; ms++) {
      while (sent < Math.floor(ms / TICK_MS)) p.receive([bundle(++sent)], ms);
      if (ms % 7 === 0) for (const b of p.poll(ms)) played.push(b.tick);
    }
    // every tick once, in order
    expect(played).toEqual(played.map((_, i) => i + 1));
    expect(played.length).toBeGreaterThan(sent - 6);
    expect(p.target).toBe(MIN_BUFFER);
    expect(p.starved).toBe(0);
    expect(p.ran).toBe(0);
  });

  it('holds more in hand when ticks arrive in clumps, and then never runs dry', () => {
    const p = new Playout();
    const played: number[] = [];
    let sent = 0;
    let starvedEarly = 0;
    for (let ms = 0; ms < 20_000; ms++) {
      // five ticks at once, every 83 ms
      if (ms % 83 === 0) {
        const clump: Bundle[] = [];
        while (sent < Math.floor(ms / TICK_MS)) clump.push(bundle(++sent));
        p.receive(clump, ms);
      }
      if (ms % 16 === 0) for (const b of p.poll(ms)) played.push(b.tick);
      if (ms === 6000) starvedEarly = p.starved;
    }
    expect(played).toEqual(played.map((_, i) => i + 1));
    expect(p.target).toBeGreaterThan(MIN_BUFFER + 2);
    expect(p.target).toBeLessThanOrEqual(MAX_BUFFER);
    // once it has learned the network, it does not stall again
    expect(p.starved).toBe(starvedEarly);
    expect(played.length).toBeGreaterThan(sent - 12);
  });

  it('after a long stall it runs to catch up, without skipping a tick', () => {
    const p = new Playout();
    const played: number[] = [];
    let sent = 0;
    for (let ms = 0; ms < 6000; ms++) {
      while (sent < Math.floor(ms / TICK_MS)) p.receive([bundle(++sent)], ms);
      // nothing is drawn between 2 s and 3.5 s
      if (ms % 16 === 0 && (ms < 2000 || ms > 3500)) for (const b of p.poll(ms)) played.push(b.tick);
    }
    expect(played).toEqual(played.map((_, i) => i + 1));
    expect(p.ran).toBeGreaterThan(50);
    expect(played.length).toBeGreaterThan(sent - 8);
  });

  it('ignores a tick it has had, and refuses a gap', () => {
    const p = new Playout();
    expect(p.receive([bundle(1), bundle(2)], 0)).toBe(true);
    expect(p.receive([bundle(2), bundle(3)], 5)).toBe(true);
    expect(p.depth).toBe(3);
    expect(p.receive([bundle(6)], 9)).toBe(false);
    expect(p.depth).toBe(3);
    p.reset(40);
    expect(p.depth).toBe(0);
    expect(p.receive([bundle(41)], 12)).toBe(true);
    expect(p.arrived).toBe(41);
  });
});
