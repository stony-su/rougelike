// `npm run itch`: everything the game's page on itch.io needs to be given, made in itch/out/.
//
//   resound-web.zip    The game as a page. Upload it as an HTML game ("This file will be played in
//                      the browser"): index.html is at the top of the zip and every path in it is
//                      relative, which is what itch.io asks for.
//   resound-coop.zip   The same game with its host program, for playing together over one's own
//                      network. A download: it needs Node.js on the laptop that hosts and nothing
//                      on the others.
//
// The page and the host are stamped with one build id, as `npm run host` does, so the laptops of
// one party are always playing the same game. itch/page.md says what to put on the page itself.
import { cpSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { build } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'itch', 'out');
const web = join(out, 'web');
const coop = join(out, 'resound-coop');

process.env.RESOUND_BUILD = Date.now().toString(36);

// ---------------------------------------------------------------- a zip, written by hand

// (No zip tool is the same on every computer, and the one Windows has writes paths itch.io
// cannot read. The format is small: each file deflated, then a list of them at the end.)
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Every file under a folder, as paths with forward slashes, in a fixed order. */
function filesUnder(dir, prefix = '') {
  const found = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...filesUnder(full, `${prefix}${name}/`));
    else found.push({ name: `${prefix}${name}`, data: readFileSync(full) });
  }
  return found;
}

function zip(files) {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const bodies = [];
  const list = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const packed = deflateRawSync(f.data, { level: 9 });
    const deflated = packed.length < f.data.length;
    const body = deflated ? packed : f.data;
    const crc = crc32(f.data);
    // what is the same in the header before each file and in the list at the end
    const common = Buffer.alloc(26);
    common.writeUInt16LE(20, 0); // the version needed to read it
    common.writeUInt16LE(0x0800, 2); // names are UTF-8
    common.writeUInt16LE(deflated ? 8 : 0, 4);
    common.writeUInt16LE(time, 6);
    common.writeUInt16LE(date, 8);
    common.writeUInt32LE(crc, 10);
    common.writeUInt32LE(body.length, 14);
    common.writeUInt32LE(f.data.length, 18);
    common.writeUInt16LE(name.length, 22);
    common.writeUInt16LE(0, 24);
    const head = Buffer.alloc(4);
    head.writeUInt32LE(0x04034b50, 0);
    bodies.push(head, common, name, body);
    const entry = Buffer.alloc(6);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(0x0314, 4); // written as on Unix, so that a script may be marked as one to run
    const rest = Buffer.alloc(14);
    rest.writeUInt32LE((((f.run ? 0o100755 : 0o100644) << 16) >>> 0) >>> 0, 6);
    rest.writeUInt32LE(offset, 10);
    list.push(entry, common, rest, name);
    offset += 4 + common.length + name.length + body.length;
  }
  const listSize = list.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(listSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...bodies, ...list, end]);
}

const kb = (n) => `${(n / 1024).toFixed(0)} kB`;

// ---------------------------------------------------------------- the page

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
console.log('Building the game...');
await build({ root, logLevel: 'warn', build: { outDir: web, emptyOutDir: true } });

const page = filesUnder(web);
const index = readFileSync(join(web, 'index.html'), 'utf8');
// itch.io serves the page from a folder of its own: a path that begins at the top of a site would miss
const rooted = [...index.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
if (rooted.length > 0) throw new Error(`index.html has paths that are not relative: ${rooted.join(', ')}`);
if (page.length > 1000) throw new Error(`itch.io takes at most 1000 files in a page; this has ${page.length}`);
const webZip = zip(page);
writeFileSync(join(out, 'resound-web.zip'), webZip);

// ---------------------------------------------------------------- the same, with its host

console.log('Building the host...');
await build({ root, logLevel: 'warn', build: { ssr: 'server/host.ts', outDir: coop, emptyOutDir: true }, ssr: { noExternal: ['ws'] } });
// .mjs, so that Node reads it as a module wherever the folder is put
renameSync(join(coop, 'host.js'), join(coop, 'host.mjs'));
cpSync(web, join(coop, 'game'), { recursive: true });
writeFileSync(
  join(coop, 'start-host.bat'),
  [
    '@echo off',
    'cd /d "%~dp0"',
    'where node >nul 2>nul',
    'if errorlevel 1 (',
    '  echo Node.js is needed to host. Get it from https://nodejs.org and run this again.',
    '  pause',
    '  exit /b 1',
    ')',
    'node host.mjs --dist game %*',
    'pause',
    '',
  ].join('\r\n'),
);
writeFileSync(
  join(coop, 'start-host.sh'),
  [
    '#!/bin/sh',
    'cd "$(dirname "$0")" || exit 1',
    'if ! command -v node >/dev/null 2>&1; then',
    '  echo "Node.js is needed to host. Get it from https://nodejs.org and run this again."',
    '  exit 1',
    'fi',
    'exec node host.mjs --dist game "$@"',
    '',
  ].join('\n'),
);
writeFileSync(
  join(coop, 'README.txt'),
  [
    'RESOUND: playing together',
    '',
    'Up to three play together, each on a laptop of their own, over your own network.',
    'One laptop hosts. It needs Node.js 20 or newer (https://nodejs.org). The others need only Chrome or Edge.',
    '',
    '1. On the laptop that hosts:',
    '     Windows        double-click start-host.bat',
    '     macOS, Linux   in a terminal, in this folder:   sh start-host.sh',
    '2. It prints two addresses. Open the first on the host laptop, and the second on each of the others.',
    '3. Everyone chooses a class in the lobby; when all are ready the run begins.',
    '',
    'Everyone must be on the same network. Home Wi-Fi or a phone hotspot works; guest and public',
    'networks often keep laptops apart. The first time, Windows asks whether Node.js may use the',
    'network: allow it on private networks.',
    '',
    'To stop hosting, close the window, or press Ctrl+C in it.',
    '',
  ].join('\r\n'),
);
const coopZip = zip(filesUnder(coop, 'resound-coop/').map((f) => ({ ...f, run: f.name.endsWith('.sh') })));
writeFileSync(join(out, 'resound-coop.zip'), coopZip);

console.log('');
console.log(`itch/out/resound-web.zip    ${kb(webZip.length)}, ${page.length} files, index.html at the top`);
console.log(`itch/out/resound-coop.zip   ${kb(coopZip.length)}, the game with its host (needs Node.js to host)`);
console.log('What to put on the page itself is in itch/page.md.');
