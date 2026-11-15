// Co-op check against a running host (npm run host), on this machine: three pages of the
// installed Chrome join through the network address (not localhost), each played by a bot, and
// fight together. Along the way one page is frozen for a while and one is reloaded. At the end
// the host must have had to repair nobody, every page must be near the front, and the delay from
// a press to its effect is reported for each.
// Usage:
//   node scripts/coop-check.mjs [--port 5180] [--seconds 40] [--dir .verify] [--headed]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const port = Number(arg('port', 5180));
const seconds = Number(arg('seconds', 40));
const dir = resolve(String(arg('dir', '.verify')));
const headed = arg('headed', false) === true;
mkdirSync(dir, { recursive: true });

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return null;
}

const address = lanAddress();
if (!address) {
  console.log('This machine has no network address; the check needs one (it must not use localhost).');
  process.exit(1);
}
const base = `http://${address}:${port}`;
const info = async () => (await fetch(`${base}/relay-info`)).json();

try {
  const i = await info();
  if (i.phase !== 'lobby' || i.seats !== 0) {
    console.log(`The host at ${base} is not waiting in an empty lobby (phase ${i.phase}, ${i.seats} seated). Restart it and run this again.`);
    process.exit(1);
  }
} catch {
  console.log(`No host answers at ${base}. Start one with:  npm run host -- --port ${port}`);
  process.exit(1);
}

async function launch() {
  const args = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'];
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, headless: !headed, args });
    } catch {
      // try the next browser
    }
  }
  throw new Error('Could not launch an installed browser.');
}

const browser = await launch();
const problems = [];
const classes = ['sword', 'bow', 'fist'];
const pages = [];
for (let i = 0; i < 3; i++) {
  // a context each: separate storage, as on separate laptops
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`page ${i + 1} error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`page ${i + 1} console.error: ${m.text()}`);
  });
  await page.goto(`${base}/?debug&class=${classes[i]}&autopilot=expert&seats=3&name=Bot${i + 1}`, { waitUntil: 'load' });
  pages.push(page);
  // seats are given in the order laptops arrive
  await page.waitForFunction('window.__resound && window.__resound.state().slot >= 0', undefined, { timeout: 15000 });
}

const state = (page) => page.evaluate('window.__resound.state()');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`Three pages joined ${base}.`);
await pages[0].screenshot({ path: resolve(dir, 'coop-lobby.png') });
for (const page of pages) await page.waitForFunction('window.__resound.state().tick > 30', undefined, { timeout: 20000 });
console.log('The game began on all three.');

const third = Math.max(4, seconds / 4);
await wait(third * 1000);
for (let i = 0; i < 3; i++) await pages[i].screenshot({ path: resolve(dir, `coop-page${i + 1}.png`) });

console.log('Freezing page 2 for 1.5 s...');
await pages[1].evaluate(() => {
  const end = performance.now() + 1500;
  while (performance.now() < end) {
    // a laptop that has stopped answering
  }
});
await wait(third * 1000);

console.log('Reloading page 3...');
await pages[2].reload({ waitUntil: 'load' });
await pages[2].waitForFunction('window.__resound && window.__resound.state().tick > 30', undefined, { timeout: 20000 });
await wait(third * 1000);

const host = await info();
const states = await Promise.all(pages.map(state));
let ok = true;
const front = Math.max(...states.map((s) => s.tick));
states.forEach((s, i) => {
  const n = s.net;
  const line = `page ${i + 1} (${classes[i]}, seat ${s.slot + 1}): tick ${s.tick}, chamber ${s.chamber}, round trip ${n.rtt.toFixed(1)} ms, press-to-effect about ${Math.round(n.delay)} ms, buffer ${n.buffer}/${n.target}, repairs ${n.resyncs}, frame ${s.frameMs.median} ms (p95 ${s.frameMs.p95})`;
  console.log(line);
  if (n.resyncs !== 0) {
    ok = false;
    console.log(`  page ${i + 1} had to be repaired ${n.resyncs} time(s)`);
  }
  if (front - s.tick > 30) {
    ok = false;
    console.log(`  page ${i + 1} is ${front - s.tick} ticks behind the front`);
  }
  if (s.slot !== i) {
    ok = false;
    console.log(`  page ${i + 1} is in seat ${s.slot + 1}, not its own`);
  }
});
console.log(`host: tick ${host.tick}, ${host.connected} connected, repairs ${host.repairs}`);
if (host.repairs !== 0) ok = false;
if (host.connected !== 3) ok = false;
// the same game on every screen: same chamber, same number of Echoes, same health
const sameGame = new Set(states.map((s) => JSON.stringify([s.chamber, s.players.map((p) => [p.slot, p.class])]))).size === 1;
if (!sameGame) {
  ok = false;
  console.log('the pages are not showing the same game');
}
for (let i = 0; i < 3; i++) await pages[i].screenshot({ path: resolve(dir, `coop-end${i + 1}.png`) });
await browser.close();
if (problems.length) {
  ok = false;
  console.log(`[problems]\n${problems.join('\n')}`);
}
console.log(ok ? '[ok] three pages stayed in one game, with no repairs' : '[failed]');
process.exit(ok ? 0 : 1);
