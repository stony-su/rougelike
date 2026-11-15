// Pin the hashes of the fixed game again (tests/golden.json). Run it after a deliberate change
// to the rules of the game or to its numbers, and say in the commit why the game changed.
import { spawnSync } from 'node:child_process';

const run = spawnSync('npx', ['vitest', 'run', 'tests/golden.test.ts'], { stdio: 'inherit', shell: true, env: { ...process.env, UPDATE_GOLDEN: '1' } });
process.exit(run.status ?? 1);
