// Drives the locally installed Chrome (or Edge) through playwright-core: no browser download.
// Usage:
//   node scripts/shot.mjs --url http://localhost:5173/ --out name [--wait 1500] [--size 1600x900]
//                         [--steps steps.json] [--headed] [--dir .verify]
// A steps file is a JSON array of steps, run in order:
//   {"wait": 500}                          pause (ms)
//   {"down": "KeyW"} / {"up": "KeyW"}       hold / release a key (KeyboardEvent.code names)
//   {"press": "KeyE"}                      tap a key
//   {"hold": "KeyD", "ms": 400}             hold a key for a duration
//   {"mouse": [800, 450]}                   move the mouse (viewport pixels)
//   {"click": "left"} / {"click": "right"}  click at the current mouse position
//   {"mdown": "left"} / {"mup": "left"}     press / release a mouse button
//   {"eval": "window.__snapline.debug()"}  run script in the page; the result is printed
//   {"shot": "name"}                        save a screenshot as <dir>/<name>.png
// Exit code is 1 if the page threw an uncaught error or logged console.error.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const url = arg('url', 'http://localhost:5173/');
const out = arg('out', 'shot');
const wait = Number(arg('wait', 1500));
const [w, h] = String(arg('size', '1600x900')).split('x').map(Number);
const dir = resolve(String(arg('dir', '.verify')));
const headed = arg('headed', false) === true;
const stepsPath = arg('steps', null);
mkdirSync(dir, { recursive: true });

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
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => {
  const type = m.type();
  if (type === 'error') problems.push(`console.error: ${m.text()}`);
  if (type === 'error' || type === 'warning' || m.text().startsWith('[')) console.log(`[page ${type}] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(String(url), { waitUntil: 'load' });
await page.waitForTimeout(wait);

async function shot(name) {
  const file = resolve(dir, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`[shot] ${file}`);
}

if (stepsPath && stepsPath !== true) {
  const steps = JSON.parse(readFileSync(String(stepsPath), 'utf8'));
  for (const s of steps) {
    if (s.wait !== undefined) await page.waitForTimeout(s.wait);
    else if (s.down) await page.keyboard.down(s.down);
    else if (s.up) await page.keyboard.up(s.up);
    else if (s.press) await page.keyboard.press(s.press);
    else if (s.hold) {
      await page.keyboard.down(s.hold);
      await page.waitForTimeout(s.ms ?? 200);
      await page.keyboard.up(s.hold);
    } else if (s.mouse) await page.mouse.move(s.mouse[0], s.mouse[1]);
    else if (s.click) await page.mouse.click(...(await mousePos()), { button: s.click });
    else if (s.mdown) await page.mouse.down({ button: s.mdown });
    else if (s.mup) await page.mouse.up({ button: s.mup });
    else if (s.eval) console.log(`[eval] ${JSON.stringify(await page.evaluate(s.eval))}`);
    else if (s.shot) await shot(s.shot);
  }
} else {
  await shot(out);
}

async function mousePos() {
  return page.evaluate(() => [window.__mouseX ?? window.innerWidth / 2, window.__mouseY ?? window.innerHeight / 2]);
}

await browser.close();
if (problems.length) {
  console.log(`[problems]\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('[ok] no page errors');
