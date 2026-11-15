// The host program. One laptop runs it (`npm run host`); it serves the built game to every laptop
// on the network, keeps the lobby, sets the clock of the game, and referees it. The players on
// the host laptop open it in a browser like everyone else.
//
// It holds no game logic of its own: everything it decides is in src/net/hostCore.ts, which the
// tests drive through a pretend network. This file is the web server and the sockets round it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { BUILD_ID } from '../src/buildId';
import { CONTENT } from '../src/content';
import { HostCore } from '../src/net/hostCore';
import type { Peer } from '../src/net/hostCore';
import { PROTOCOL_VERSION, RELAY_PATH } from '../src/net/protocol';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v !== undefined && !v.startsWith('--') ? v : fallback;
}

const port = Number(arg('port', '5180')) || 5180;
const dist = resolve(arg('dist', 'dist'));
const stress = Number(arg('stress', '0')) || 0;
const notes = resolve(arg('notes', '.resound'));

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

const say = (line: string): void => {
  console.log(line);
};

let desyncs = 0;

function keepNote(name: string, what: unknown): void {
  try {
    mkdirSync(notes, { recursive: true });
    writeFileSync(join(notes, name), JSON.stringify(what, null, 2));
  } catch (e) {
    say(`  could not write a note: ${String(e)}`);
  }
}

const core = new HostCore(CONTENT, {
  buildId: BUILD_ID,
  seed: arg('seed', ''),
  stress,
  log: (line) => say(`  ${new Date().toLocaleTimeString()}  ${line}`),
  // A laptop that drifts is repaired at once, but a drift is a bug worth finding: keep a note of
  // when it happened and, once the laptop has sent what it had, of the fields that differed.
  onDesync: (info) => {
    desyncs++;
    keepNote(`desync-${desyncs}-tick${info.tick}.json`, { ...info, build: BUILD_ID, at: new Date().toISOString() });
  },
  onDiff: (info) => keepNote(`desync-${desyncs}-fields.json`, { ...info, build: BUILD_ID }),
});

/** Serve one file of the built game. Nothing outside the build folder can be asked for. */
async function serveFile(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://host');
  if (url.pathname === '/relay-info') {
    // how a page finds out that it is being served by a host, and by which build
    res.writeHead(200, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' });
    res.end(
      JSON.stringify({
        game: 'resound',
        protocol: PROTOCOL_VERSION,
        build: BUILD_ID,
        phase: core.phase,
        seats: core.lobby().length,
        connected: core.connected,
        tick: core.session ? core.session.tick : 0,
        repairs: core.repairs,
        // where the other laptops can reach this one
        addresses: addresses().map((a) => `http://${a}:${port}`),
      }),
    );
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(dist, rel));
  if (file !== dist && !file.startsWith(dist + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
    // the page itself is never cached, so a new build is picked up by a reload; its files carry a hash in their names
    res.writeHead(200, { 'content-type': type, 'cache-control': file.endsWith('index.html') ? 'no-store' : 'public, max-age=3600' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  serveFile(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

// Inputs are tiny; the one large message is a laptop sending back its whole game after a drift.
const sockets = new WebSocketServer({ server, path: RELAY_PATH, maxPayload: 2 * 1024 * 1024 });
const alive = new WeakMap<WebSocket, boolean>();

sockets.on('connection', (ws) => {
  alive.set(ws, true);
  const peer: Peer = {
    send: (text) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(text);
    },
    close: () => ws.close(),
  };
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    core.message(peer, data.toString(), performance.now());
  });
  ws.on('pong', () => alive.set(ws, true));
  ws.on('close', () => core.disconnect(peer));
  ws.on('error', () => ws.terminate());
});

// The clock of the game: wake often, close every tick that has come due, send them.
const pump = setInterval(() => core.pump(performance.now()), 4);
// A laptop that has gone without a word (asleep, out of range) is let go, so its seat reads as empty.
const heartbeat = setInterval(() => {
  for (const ws of sockets.clients) {
    if (alive.get(ws) === false) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
}, 4000);

function addresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') say(`Port ${port} is already in use. Close the other host, or start this one with:  npm run host -- --port ${port + 1}`);
  else say(`The host could not start: ${e.message}`);
  process.exit(1);
});

server.listen(port, '0.0.0.0', () => {
  const others = addresses();
  say('');
  say('  RESOUND host is running.');
  say('');
  say(`  On this laptop, open:        http://localhost:${port}`);
  if (others.length === 0) {
    say('  This laptop is not on a network, so nobody else can join yet.');
  } else {
    for (const a of others) say(`  On the other laptops, open:  http://${a}:${port}`);
    say('');
    say('  Everyone must be on the same Wi-Fi or cable network. If the other laptops cannot connect:');
    say('  Windows will have asked whether to allow Node.js on your network: say yes (private networks).');
    say('  Guest and public Wi-Fi often keep laptops apart; a home network or a phone hotspot does not.');
  }
  say('');
  say('  Leave this window open while you play. Ctrl+C ends the game for everyone.');
  say('');
});

function shutdown(): void {
  clearInterval(pump);
  clearInterval(heartbeat);
  core.shutdown('The host has closed the game.');
  sockets.close();
  server.close(() => process.exit(0));
  // do not wait for ever on a socket that will not close
  setTimeout(() => process.exit(0), 500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
