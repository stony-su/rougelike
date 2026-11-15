// The balance table: whole runs played by bots, many roads each, alone with every class at three
// levels of skill and in parties (tests/balance.test.ts holds the bands; this prints the numbers
// behind them). Run it after changing a number in src/sim/tuning.ts or an Echo, before and after.
// Usage:
//   node scripts/balance.mjs [seeds]      seeds: roads for each party (default 40; parties play half)
import { spawnSync } from 'node:child_process';

const seeds = Number(process.argv[2] ?? 40);
if (!Number.isFinite(seeds) || seeds < 4) {
  console.error('usage: node scripts/balance.mjs [seeds]   (4 or more)');
  process.exit(2);
}
console.log(`Playing ${seeds} roads for each party. A road takes a bot about a quarter of a second; a party of three, about a second.`);
const run = spawnSync('npx', ['vitest', 'run', 'tests/balance.test.ts', '-t', 'the table', '--disable-console-intercept'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, BALANCE_REPORT: '1', BALANCE_SEEDS: String(seeds) },
});
process.exit(run.status ?? 1);
