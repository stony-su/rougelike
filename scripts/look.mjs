// See a change in the real page with one command: build the game, serve that build for as long
// as the check takes, and drive it in your installed Chrome through scripts/shot.mjs. It needs no
// dev server and picks a free port, so several sessions on one computer can each run it.
//
//   npm run look -- --query "debug&class=bow&seed=7" --out bow
//   npm run look -- --query "debug&team=sword,bow,fist&autopilot=expert" --steps steps.json --out trio
//   npm run look -- --no-build --query "gallery=all" --out rigs      (reuse the last build)
//
// Everything except --query and --no-build is passed on to scripts/shot.mjs (see its header for
// the steps a script can take). Screenshots land in .verify/.
import { spawn } from 'node:child_process';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
function take(name) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return null;
  const value = args[i + 1];
  args.splice(i, 2);
  return value ?? '';
}
function flag(name) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
}

const query = take('query') ?? '';
const outDir = '.verify/snap';
if (!flag('no-build')) await build({ logLevel: 'warn', build: { outDir, emptyOutDir: true } });

const server = await preview({ logLevel: 'warn', build: { outDir }, preview: { host: '127.0.0.1', port: 4180, strictPort: false } });
const address = server.httpServer.address();
const port = address && typeof address === 'object' ? address.port : 4180;
const url = `http://127.0.0.1:${port}/${query ? `?${query}` : ''}`;
console.log(`Looking at ${url}`);

// the server lives in this process, so the check must not block it: wait for it without stopping the world
const status = await new Promise((done) => {
  const child = spawn(process.execPath, ['scripts/shot.mjs', '--url', url, ...args], { stdio: 'inherit' });
  child.on('exit', (code) => done(code ?? 1));
  child.on('error', () => done(1));
});

server.httpServer.closeAllConnections?.();
await new Promise((done) => server.httpServer.close(() => done()));
process.exit(status);
