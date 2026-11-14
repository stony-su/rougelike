// Cross-engine check: plays the pinned game in the installed browsers and compares the hashes
// with the ones the tests pin in Node (tests/golden.json). Laptops in a co-op game only stay in
// step if every engine computes exactly these numbers.
// Usage:
//   node scripts/selftest.mjs [--url http://localhost:4173/]
// The URL must serve a build of the game (npm run build, then npm run preview).
// Exit code is 1 if any browser disagrees with the pinned values.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, '..', 'tests', 'golden.json'), 'utf8'));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const base = arg('url', 'http://localhost:4173/');
const url = `${base}${base.includes('?') ? '&' : '?'}selftest`;
let failed = false;
let ran = 0;

for (const channel of ['chrome', 'msedge']) {
  let browser;
  try {
    browser = await chromium.launch({ channel, headless: true });
  } catch (e) {
    console.log(`[${channel}] not installed, skipped (${e.message.split('\n')[0]})`);
    continue;
  }
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction('window.__resound && window.__resound.selftest', undefined, { timeout: 120000 });
    const got = await page.evaluate('window.__resound.selftest');
    const version = await page.evaluate('navigator.userAgent');
    const same = got.math === golden.math && JSON.stringify(got.hashes) === JSON.stringify(golden.hashes);
    ran++;
    console.log(`[${channel}] ${same ? 'matches the pinned game' : 'DIFFERS'} (${got.ms} ms)  ${version}`);
    if (!same) {
      failed = true;
      console.log(`  math   got ${got.math}  want ${golden.math}`);
      console.log(`  hashes got ${JSON.stringify(got.hashes)}`);
      console.log(`         want ${JSON.stringify(golden.hashes)}`);
    }
    if (errors.length) {
      failed = true;
      console.log(`  page errors: ${errors.join(' | ')}`);
    }
  } finally {
    await browser.close();
  }
}

if (ran === 0) {
  console.log('No installed browser could be launched.');
  process.exit(1);
}
process.exit(failed ? 1 : 0);
