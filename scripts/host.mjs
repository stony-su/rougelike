// `npm run host`: build the game and the host program as one matching pair, then start the host.
// Both are stamped with the same build id, so a laptop still showing a page from an older build
// is told to reload instead of quietly playing a different game.
// Anything after `--` is passed to the host:  npm run host -- --port 5200
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const env = { ...process.env, RESOUND_BUILD: Date.now().toString(36) };

function build(what, args) {
  console.log(`Building ${what}...`);
  const r = spawnSync(process.execPath, [vite, 'build', ...args], { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'] });
  if (r.status !== 0) {
    process.stdout.write(r.stdout ?? '');
    console.error(`Building ${what} failed.`);
    process.exit(r.status ?? 1);
  }
}

build('the game', []);
build('the host', ['--ssr', 'server/host.ts', '--outDir', 'dist-host', '--emptyOutDir']);

const host = spawn(process.execPath, [join(root, 'dist-host', 'host.js'), ...process.argv.slice(2)], { cwd: root, env, stdio: 'inherit' });
host.on('exit', (code) => process.exit(code ?? 0));
// Ctrl+C reaches the host directly (same console); wait for it to say goodbye to the laptops.
process.on('SIGINT', () => undefined);
