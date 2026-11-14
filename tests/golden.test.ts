// Pinned results of a fixed game. The same numbers are checked in the browser by
// scripts/selftest.mjs (Chrome and Edge), so a change here that is not a deliberate change to
// the rules means the simulation has stopped being reproducible.
//
// After a deliberate change to the simulation or its numbers, regenerate the file with
//   UPDATE_GOLDEN=1 npx vitest run tests/golden.test.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { selftestHashes, selftestMath } from '../src/sim/selftest';

const FILE = join(__dirname, 'golden.json');

function bits(v: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, v);
  return view.getUint32(0).toString(16).padStart(8, '0') + view.getUint32(4).toString(16).padStart(8, '0');
}

describe('the pinned game', () => {
  it('plays out to the committed hashes, and the math sums to the committed bits', () => {
    const now = { hashes: selftestHashes(CONTENT), math: bits(selftestMath()) };
    if (process.env.UPDATE_GOLDEN === '1' || !existsSync(FILE)) {
      writeFileSync(FILE, `${JSON.stringify(now, null, 2)}\n`);
    }
    const golden = JSON.parse(readFileSync(FILE, 'utf8')) as typeof now;
    expect(now.math).toBe(golden.math);
    expect(now.hashes).toEqual(golden.hashes);
    // the game really happened: the hashes differ from each other
    expect(new Set(now.hashes).size).toBe(now.hashes.length);
  });

  it('gives the same answer twice in one process', () => {
    expect(selftestHashes(CONTENT)).toEqual(selftestHashes(CONTENT));
  });
});
