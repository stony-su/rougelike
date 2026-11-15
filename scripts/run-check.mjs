// The last check: the whole game played in the real page, through the installed Chrome or Edge.
//
//   alone, lost      each class stands still and falls in the first chamber; the results come up;
//                    one key begins a new road at once
//   alone, won       each class is played by a bot from the first chamber to the Bell (a road the
//                    bot loses is tried again with another seed, a few times)
//   together, lost   three pages join a host through this machine's network address (not
//                    localhost), stand still, and fall; everyone says "go again" and a new road
//                    begins with the same connections
//   together, won    three pages join a fresh host, a bot at each, and walk the road to its end;
//                    the host must have had to repair nobody
//
// It builds the game and the host into .verify/run-check and serves them itself, on ports of its
// own, so nothing else has to be running and nothing that is running is disturbed. Whole roads
// are walked at the speed of the game: allow twenty minutes, more if a bot has to try again.
// Usage:
//   node scripts/run-check.mjs [--only alone-lost,alone-won,together-lost,together-won]
//                              [--tries 4] [--port 5190] [--dir .verify] [--headed]
// Exit code is 1 if any part fails, or a page threw or logged an error.
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(String(arg('dir', '.verify')));
const out = join(dir, 'run-check');
const only = String(arg('only', 'alone-lost,alone-won,together-lost,together-won')).split(',');
const tries = Number(arg('tries', 4));
const hostPort = Number(arg('port', 5190));
const headed = arg('headed', false) === true;
const CLASSES = ['sword', 'bow', 'fist'];
/** The longest a road may take, in seconds of the clock on the wall. */
const ROAD = 14 * 60;
mkdirSync(out, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (line) => console.log(line);
const failures = [];
const fail = (line) => {
  failures.push(line);
  say(`  [failed] ${line}`);
};

// ---------------------------------------------------------------- build, once, as a matching pair

const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const env = { ...process.env, RESOUND_BUILD: `check${Date.now().toString(36)}` };
function build(what, args) {
  say(`Building ${what}...`);
  const r = spawnSync(process.execPath, [vite, 'build', '--logLevel', 'warn', ...args], { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'] });
  if (r.status !== 0) {
    process.stdout.write(r.stdout ?? '');
    console.error(`Building ${what} failed.`);
    process.exit(r.status ?? 1);
  }
}
build('the game', ['--outDir', join(out, 'game'), '--emptyOutDir']);
build('the host', ['--ssr', 'server/host.ts', '--outDir', join(out, 'host'), '--emptyOutDir']);

// ---------------------------------------------------------------- the browser, and what a page tells

async function launch() {
  const args = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'];
  const errors = [];
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, headless: !headed, args });
    } catch (e) {
      errors.push(`${channel}: ${e.message.split('\n')[0]}`);
    }
  }
  throw new Error(`Could not launch an installed browser.\n${errors.join('\n')}`);
}
const browser = await launch();

/** A page of its own storage, as on a laptop of its own. What it throws or logs as an error is kept. */
async function open(url, label) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => fail(`${label}: the page threw: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') fail(`${label}: console.error: ${m.text()}`);
  });
  await page.goto(url, { waitUntil: 'load' });
  return { page, context, label };
}
const state = (p) => p.page.evaluate('window.__resound.state()');
const shot = (p, name) => p.page.screenshot({ path: resolve(dir, `${name}.png`) });
const hp = (s) => (s.players ?? []).map((q) => `${Math.round(q.hp)}/${q.maxHp}`).join(' ');

/**
 * Follow pages that are on the road until it has ended for all of them, saying now and then where
 * they are, and taking a picture of each boss as it is met. Returns each page's last state.
 */
async function follow(pages, name) {
  const began = Date.now();
  const seen = pages.map(() => new Set());
  let said = 0;
  for (;;) {
    const states = await Promise.all(pages.map(state));
    const secs = Math.round((Date.now() - began) / 1000);
    for (let i = 0; i < pages.length; i++) {
      const s = states[i];
      // the Carillon holds the sixth chamber and the Toll the twelfth: a picture a few seconds in
      for (const boss of [6, 12]) {
        if (s.phase === 'run' && s.chamber === boss && s.kind !== 'camp' && !seen[i].has(boss)) {
          seen[i].add(boss);
          setTimeout(() => shot(pages[i], `${name}-${pages[i].label}-chamber${boss}`).catch(() => undefined), 9000);
        }
      }
    }
    if (states.every((s) => s.phase !== 'run')) return states;
    if (secs - said >= 45) {
      said = secs;
      say(`  ${String(secs).padStart(4)} s  ${states.map((s, i) => `${pages[i].label}: ${s.phase === 'run' ? `chamber ${s.chamber} (${s.kind}) ${hp(s)}` : s.phase}`).join('   ')}`);
    }
    if (secs > ROAD) {
      fail(`${name}: still on the road after ${ROAD} s (${states.map((s) => `chamber ${s.chamber}`).join(', ')})`);
      return states;
    }
    await wait(1500);
  }
}
/** Wait until a page shows how its run ended. */
const results = (p) => p.page.waitForFunction('window.__resound.state().menu === "results"', undefined, { timeout: 20000 });
const onRoad = 'window.__resound && window.__resound.state && window.__resound.state().phase === "run" && window.__resound.state().tick > 30';

// ---------------------------------------------------------------- alone

const server = await preview({ root, logLevel: 'warn', build: { outDir: join(out, 'game') }, preview: { host: '127.0.0.1', port: 4190, strictPort: false } });
const address = server.httpServer.address();
const solo = `http://127.0.0.1:${address && typeof address === 'object' ? address.port : 4190}/`;

if (only.includes('alone-lost')) {
  say('\nAlone, lost: each class stands still.');
  const pages = [];
  for (const c of CLASSES) pages.push(await open(`${solo}?debug&class=${c}&seed=check-still`, c));
  for (const p of pages) await p.page.waitForFunction(onRoad, undefined, { timeout: 30000 });
  const states = await follow(pages, 'alone-lost');
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const s = states[i];
    if (s.phase !== 'lost') fail(`${p.label} stood still and the run is "${s.phase}"`);
    await results(p).catch(() => fail(`${p.label}: the results did not come up`));
    await shot(p, `alone-lost-${p.label}`);
    say(`  ${p.label}: lost in chamber ${s.chamber} after ${Math.round(s.tick / 60)} s`);
    // one key, and a new road at once
    await p.page.keyboard.press('Enter');
    await p.page
      .waitForFunction('window.__resound.state().phase === "run" && window.__resound.state().attempt === 1', undefined, { timeout: 10000 })
      .then(() => say(`  ${p.label}: Enter began a new road at once`))
      .catch(() => fail(`${p.label}: Enter on the results did not begin a new run`));
    await p.context.close();
  }
}

if (only.includes('alone-won')) {
  say('\nAlone, won: a bot walks each class to the Bell.');
  let left = CLASSES.slice();
  for (let attempt = 0; attempt < tries && left.length > 0; attempt++) {
    const pages = [];
    for (const c of left) pages.push(await open(`${solo}?debug&class=${c}&autopilot=expert&seed=check-${attempt}`, c));
    for (const p of pages) await p.page.waitForFunction(onRoad, undefined, { timeout: 30000 });
    const states = await follow(pages, 'alone-won');
    const again = [];
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const s = states[i];
      await results(p).catch(() => fail(`${p.label}: the results did not come up`));
      const how = `${Math.round(s.tick / 60)} s on the road, ${s.run.chambers} of ${s.stops} chambers, ${s.run.kills} Echoes, ${s.run.returns} Returns, best Rally ${s.run.bestRally}`;
      if (s.phase === 'won') {
        await shot(p, `alone-won-${p.label}`);
        say(`  ${p.label}: WON with seed check-${attempt} (${how}; frame ${s.frameMs.median} ms, 95th ${s.frameMs.p95})`);
        if (s.run.chambers !== s.stops) fail(`${p.label}: won, but with ${s.run.chambers} of ${s.stops} chambers cleared`);
      } else {
        await shot(p, `alone-won-${p.label}-fell-${attempt}`);
        say(`  ${p.label}: fell in chamber ${s.chamber} with seed check-${attempt} (${how})`);
        again.push(p.label);
      }
      await p.context.close();
    }
    left = again;
  }
  for (const c of left) fail(`the bot did not win with the ${c} in ${tries} tries`);
}
await server.close();

// ---------------------------------------------------------------- together

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return null;
}
const lan = lanAddress();
const base = `http://${lan}:${hostPort}`;
const info = async () => (await fetch(`${base}/relay-info`)).json();
const answers = async () => {
  try {
    await info();
    return true;
  } catch {
    return false;
  }
};

/** Start a host of our own on the port, wait until it answers, and return the way to stop it. */
async function startHost(seed) {
  if (await answers()) throw new Error(`Something already answers at ${base}. Give this check a free port: --port ${hostPort + 1}`);
  const child = spawn(process.execPath, [join(out, 'host', 'host.js'), '--port', String(hostPort), '--dist', join(out, 'game'), '--seed', seed, '--notes', join(out, 'notes')], {
    cwd: root,
    env,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const gone = new Promise((r) => child.on('exit', r));
  for (let t = 0; t < 60 && !(await answers()); t++) await wait(250);
  if (!(await answers())) {
    child.kill();
    throw new Error(`The host did not come up at ${base}.`);
  }
  return async () => {
    child.kill();
    await gone;
    for (let t = 0; t < 20 && (await answers()); t++) await wait(250);
    if (await answers()) fail(`the host at ${base} is still answering after it was stopped`);
  };
}

/** Three pages through the network address, seated in the order they arrive. */
async function seat(query) {
  const pages = [];
  for (let i = 0; i < 3; i++) {
    const p = await open(`${base}/?debug&class=${CLASSES[i]}&seats=3&name=${CLASSES[i]}${query}`, CLASSES[i]);
    await p.page.waitForFunction('window.__resound && window.__resound.state().slot >= 0', undefined, { timeout: 20000 });
    pages.push(p);
  }
  for (const p of pages) await p.page.waitForFunction(onRoad, undefined, { timeout: 30000 });
  return pages;
}
/** Every page's own count of repairs, and the host's, must be nothing; and everyone must be showing the same run. */
async function sameGame(pages, states, name) {
  const host = await info();
  if (host.repairs !== 0) fail(`${name}: the host had to repair someone ${host.repairs} time(s)`);
  if (host.connected !== 3) fail(`${name}: ${host.connected} of 3 are still connected`);
  states.forEach((s, i) => {
    if (s.net.resyncs !== 0) fail(`${name}: ${pages[i].label} was repaired ${s.net.resyncs} time(s)`);
    if (s.slot !== i) fail(`${name}: ${pages[i].label} is in seat ${s.slot + 1}, not its own`);
  });
  const runs = new Set(states.map((s) => JSON.stringify([s.phase, s.attempt, s.run])));
  if (runs.size !== 1) fail(`${name}: the three pages do not show the same run: ${[...runs].join(' | ')}`);
  say(
    `  host: ${host.connected} connected, repairs ${host.repairs};  ${states.map((s, i) => `${pages[i].label} round trip ${s.net.rtt.toFixed(0)} ms, press to effect about ${Math.round(s.net.delay)} ms, frame ${s.frameMs.median} ms`).join(';  ')}`,
  );
}

if (only.includes('together-lost') || only.includes('together-won')) {
  if (!lan) {
    fail('this machine has no network address, and the check must not use localhost: the two parts played together were not run');
  } else {
    if (only.includes('together-lost')) {
      say(`\nTogether, lost: three pages at ${base} stand still.`);
      const stop = await startHost('check-still');
      try {
        const pages = await seat('');
        const states = await follow(pages, 'together-lost');
        for (const p of pages) await results(p).catch(() => fail(`${p.label}: the results did not come up`));
        if (states.some((s) => s.phase !== 'lost')) fail(`three who stood still: ${states.map((s) => s.phase).join(', ')}`);
        await sameGame(pages, await Promise.all(pages.map(state)), 'together-lost');
        for (const p of pages) await shot(p, `together-lost-${p.label}`);
        say(`  lost in chamber ${states[0].chamber} after ${Math.round(states[0].tick / 60)} s`);
        // everyone says "go again": the next road begins with the same connections
        for (const p of pages) await p.page.keyboard.press('Enter');
        let began = true;
        for (const p of pages) {
          await p.page.waitForFunction('window.__resound.state().phase === "run" && window.__resound.state().attempt === 1', undefined, { timeout: 15000 }).catch(() => {
            began = false;
            fail(`${p.label}: the next run did not begin when everyone was ready`);
          });
        }
        if (began) say('  everyone said "go again", and a new road began with the same three connected');
        const after = await info();
        if (after.connected !== 3) fail(`after going again ${after.connected} of 3 are connected`);
        for (const p of pages) await p.context.close();
      } finally {
        await stop();
      }
    }

    if (only.includes('together-won')) {
      say(`\nTogether, won: three pages at ${base}, a bot at each.`);
      const stop = await startHost('check');
      try {
        const pages = await seat('&autopilot=expert');
        let won = false;
        for (let attempt = 0; attempt < tries && !won; attempt++) {
          const states = await follow(pages, 'together-won');
          for (const p of pages) await results(p).catch(() => fail(`${p.label}: the results did not come up`));
          const s = states[0];
          const how = `${Math.round(s.tick / 60)} s on the road, ${s.run.chambers} of ${s.stops} chambers, ${s.run.kills} Echoes, ${s.run.returns} Returns, best Rally ${s.run.bestRally}`;
          await sameGame(pages, await Promise.all(pages.map(state)), 'together-won');
          if (states.every((x) => x.phase === 'won')) {
            won = true;
            for (const p of pages) await shot(p, `together-won-${p.label}`);
            say(`  WON together (${how})`);
          } else {
            for (const p of pages) await shot(p, `together-won-${p.label}-fell-${attempt}`);
            say(`  fell together in chamber ${s.chamber} (${how}); going again`);
            for (const p of pages) await p.page.keyboard.press('Enter');
            for (const p of pages)
              await p.page
                .waitForFunction(`window.__resound.state().phase === "run" && window.__resound.state().attempt === ${attempt + 1}`, undefined, { timeout: 15000 })
                .catch(() => fail(`${p.label}: the next run did not begin`));
          }
        }
        if (!won) fail(`three bots together did not win in ${tries} tries`);
        for (const p of pages) await p.context.close();
      } finally {
        await stop();
      }
    }
  }
}

await browser.close();
say(failures.length === 0 ? `\n[ok] every part passed. The pictures are in ${dir}.` : `\n[failed] ${failures.length} thing(s):\n${failures.map((f) => `  - ${f}`).join('\n')}`);
process.exit(failures.length === 0 ? 0 : 1);
