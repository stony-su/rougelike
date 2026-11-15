// The balance of the game, as bots find it over whole runs (src/sim/autoplay.ts). Nothing here
// says how the game feels in a person's hands. It says that the road can be walked to its end by
// every class alone, that it is harder for someone slower and less careful, that standing still
// loses, that a party does not walk through the bosses, and that nothing stalls.
//
// The bots are people of three kinds (src/sim/bots.ts): EXPERT is quick, bold and overlooks one
// warning in ten; STEADY is slower and overlooks one in five; NOVICE is slower still, overlooks
// three in ten and backs away from everything. Those shares are a guess at how people play, and
// the bands below are only as good as the guess.
//
//   node scripts/balance.mjs [seeds]     the same runs over more seeds, as a table
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { autoRun, experts } from '../src/sim/autoplay';
import type { AutoRun, AutoSeat } from '../src/sim/autoplay';
import { NOVICE, STEADY } from '../src/sim/bots';
import type { BotOptions } from '../src/sim/bots';
import type { ClassId } from '../src/sim/types';

const REPORT = !!process.env.BALANCE_REPORT;
const SEEDS = Number(process.env.BALANCE_SEEDS ?? 12);
const CLASSES: ClassId[] = ['sword', 'bow', 'fist'];

interface Tally {
  runs: AutoRun[];
  wins: number;
  /** Rally earned for every minute played, over all the runs. */
  rally: number;
  /** The greatest share of any one run spent with the whole chamber frozen. */
  frozen: number;
}

const memo = new Map<string, Tally>();
/** Play a party through `n` roads, once: the same party is asked for by several tests. */
function play(name: string, seats: AutoSeat[], n = SEEDS): Tally {
  const have = memo.get(name);
  if (have) return have;
  const runs: AutoRun[] = [];
  for (let i = 0; i < n; i++) runs.push(autoRun(`balance-${i}`, seats, CONTENT));
  const secs = runs.reduce((a, r) => a + r.seconds, 0);
  const t: Tally = { runs, wins: runs.filter((r) => r.end === 'won').length, rally: (runs.reduce((a, r) => a + r.rally, 0) / secs) * 60, frozen: Math.max(...runs.map((r) => r.frozen)) };
  memo.set(name, t);
  return t;
}
const alone = (classId: ClassId, skill: BotOptions | null): AutoSeat[] => [{ classId, skill }];
const all = (skill: BotOptions | null): AutoSeat[] => CLASSES.map((classId) => ({ classId, skill }));
const solo = (classId: ClassId): Tally => play(`expert ${classId}`, experts(classId));
const novice = (classId: ClassId): Tally => play(`novice ${classId}`, alone(classId, NOVICE));
const trio = (): Tally => play('three experts', experts(...CLASSES), Math.max(4, Math.round(SEEDS / 2)));
const idle = (): Tally => play('three who stand still', all(null), 4);
/** Seconds a boss stood in the runs that got past it. */
const stood = (t: Tally, boss: 'carillon' | 'toll'): number[] => t.runs.filter((r) => (boss === 'toll' ? r.end === 'won' : r.end === 'won' || r.chamber > 6)).map((r) => r[boss]);

describe('alone', () => {
  it.each(CLASSES)('an expert with the %s reaches the end of the road more often than not', (classId) => {
    const t = solo(classId);
    expect(t.wins * 2, `${t.wins} of ${t.runs.length}`).toBeGreaterThan(t.runs.length);
  });

  it('someone new wins sometimes, and less often than an expert, with every class', () => {
    let any = 0;
    for (const classId of CLASSES) {
      const n = novice(classId);
      any += n.wins;
      expect(n.wins, classId).toBeLessThan(solo(classId).wins);
    }
    expect(any).toBeGreaterThan(0);
  });

  it('no class runs away with the Rally: each earns it within three tenths of the mean of the three', () => {
    const rates = CLASSES.map((classId) => solo(classId).rally);
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    for (const r of rates) expect(Math.abs(r - mean) / mean, rates.map((x) => x.toFixed(0)).join(' / ')).toBeLessThan(0.3);
  });
});

describe('together', () => {
  it('three experts win, and neither boss is walked through', () => {
    const t = trio();
    expect(t.wins * 4, `${t.wins} of ${t.runs.length}`).toBeGreaterThanOrEqual(t.runs.length * 3);
    const carillon = stood(t, 'carillon');
    const toll = stood(t, 'toll');
    expect(carillon.length).toBeGreaterThan(0);
    expect(toll.length).toBeGreaterThan(0);
    expect(Math.min(...carillon), `the Carillon stood ${carillon.map((x) => x.toFixed(0)).join(' ')} s`).toBeGreaterThan(15);
    expect(Math.min(...toll), `the Toll stood ${toll.map((x) => x.toFixed(0)).join(' ')} s`).toBeGreaterThan(20);
  });

  it('a party that stands still always loses, in the first chamber', () => {
    const t = idle();
    expect(t.wins).toBe(0);
    for (const r of t.runs) expect([r.end, r.chamber]).toEqual(['lost', 1]);
  });
});

describe('every run', () => {
  const everyone = (): Tally[] => [...CLASSES.map(solo), ...CLASSES.map(novice), trio(), idle()];

  it('comes to an end: nothing stalls with an Echo out of reach, or a bot against a wall', () => {
    for (const t of everyone()) for (const r of t.runs) expect(['won', 'lost'], `${r.end} in chamber ${r.chamber} (${r.kind})`).toContain(r.end);
  });

  it('spends less than a twentieth of itself with the whole chamber frozen', () => {
    for (const t of everyone()) expect(t.frozen).toBeLessThan(0.05);
  });
});

// The fuller table, for whoever is changing the numbers: BALANCE_REPORT=1 (scripts/balance.mjs).
describe.runIf(REPORT)('the table', () => {
  it('prints it', () => {
    const parties: Array<[string, AutoSeat[], number]> = [
      ...CLASSES.map((c): [string, AutoSeat[], number] => [`expert ${c}`, experts(c), SEEDS]),
      ...CLASSES.map((c): [string, AutoSeat[], number] => [`steady ${c}`, alone(c, STEADY), SEEDS]),
      ...CLASSES.map((c): [string, AutoSeat[], number] => [`novice ${c}`, alone(c, NOVICE), SEEDS]),
      ['three experts', experts(...CLASSES), Math.max(4, Math.round(SEEDS / 2))],
      ['sword and fist', experts('sword', 'fist'), Math.max(4, Math.round(SEEDS / 2))],
      ['three novices', all(NOVICE), Math.max(4, Math.round(SEEDS / 2))],
      ['three who stand still', all(null), 4],
    ];
    const mid = (xs: number[]): string => (xs.length ? `${Math.round(Math.min(...xs))}-${Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)}-${Math.round(Math.max(...xs))}` : '-');
    const lines = ['party                    wins     fell in (chamber: runs)              Carillon s   Toll s      Rally/min  frozen'];
    for (const [name, seats, n] of parties) {
      const t = play(name, seats, n);
      const fell = new Map<number, number>();
      for (const r of t.runs) if (r.end !== 'won') fell.set(r.chamber, (fell.get(r.chamber) ?? 0) + 1);
      const where = [...fell.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([c, k]) => `${c}:${k}`)
        .join(' ');
      const odd = t.runs.filter((r) => r.end !== 'won' && r.end !== 'lost').length;
      lines.push(
        `${name.padEnd(24)} ${`${t.wins}/${t.runs.length}`.padEnd(8)} ${(where + (odd ? `  (${odd} stalled)` : '')).padEnd(36)} ${mid(stood(t, 'carillon')).padEnd(12)} ${mid(stood(t, 'toll')).padEnd(11)} ${t.rally.toFixed(0).padEnd(10)} ${(t.frozen * 100).toFixed(1)}%`,
      );
    }
    console.log(`\n${lines.join('\n')}\n(boss times: least-mean-most, over the runs that got past it)\n`);
  });
});
