// A fixed game played by one bot of each class, reduced to a handful of hashes. Every engine that runs the
// simulation must produce exactly these numbers: the tests check them in Node, and the page
// opened with ?selftest checks them in the browser. A mismatch means two laptops running that
// engine could not stay in step.
import { dcos, dexp, dsin, datan2 } from '../core/dmath';
import { EXPERT, NOVICE, classBot } from './bots';
import type { ContentRegistry } from './defs';
import { copyInput } from './input';
import { createSession, stepSession, worldOf } from './session';
import type { Bundle } from './session';
import { hashSession } from './snapshot';
import { emptyInput } from './types';

export const SELFTEST_TICKS = 2400;
export const SELFTEST_EVERY = 300;

/** Play the fixed game and return its hash every SELFTEST_EVERY ticks. */
export function selftestHashes(content: ContentRegistry): number[] {
  const s = createSession(
    {
      seed: 'selftest',
      players: [
        { name: 'A', classId: 'sword' },
        { name: 'B', classId: 'bow' },
        { name: 'C', classId: 'fist' },
      ],
      buildId: 'selftest',
      inputDelay: 0,
      stress: 0,
    },
    content,
  );
  const bots = [classBot('sword', EXPERT), classBot('bow', { ...EXPERT, reaction: 0.3 }), classBot('fist', NOVICE)];
  const out: number[] = [];
  for (let tick = 1; tick <= SELFTEST_TICKS; tick++) {
    const bundle: Bundle = { tick, inputs: [], cmds: [] };
    bots.forEach((b, slot) => {
      const f = emptyInput();
      copyInput(b.think(worldOf(s, slot), slot), f);
      bundle.inputs.push(f);
    });
    stepSession(s, bundle, content);
    for (const w of s.worlds) w.events.length = 0;
    if (tick % SELFTEST_EVERY === 0) out.push(hashSession(s));
  }
  return out;
}

/** A spread of the deterministic math functions, summed; one wrong bit anywhere changes the sum's bits. */
export function selftestMath(): number {
  let acc = 0;
  for (let i = 1; i <= 4000; i++) {
    const x = i * 0.37 - 700.25;
    acc += dsin(x) * 0.5 + dcos(x * 1.3) * 0.25 + datan2(x, 17 - i * 0.01) * 0.125 + dexp(-((i % 60) * 0.19)) * 0.0625;
  }
  return acc;
}
