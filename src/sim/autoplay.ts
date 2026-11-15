// Whole runs played with nobody watching: a bot in every seat, taking its own cards, voting at
// the Wager and shopping at the camps, from the first chamber to the Toll or to the floor. It is
// what the balance of the game is measured with (tests/balance.test.ts, scripts/balance.mjs):
// who wins, where the others fall, how long the bosses stand, how much of a run is spent frozen
// and how many Returns are landed.
import type { Boons } from './boons';
import { EXPERT, botCommands, classBot, idleBot } from './bots';
import type { Bot, BotOptions } from './bots';
import type { ContentRegistry } from './defs';
import { copyInput } from './input';
import type { StopKind } from './run';
import { createSession, runSoFar, stepSession, stopOf, worldOf } from './session';
import type { Bundle, RunStats, Session } from './session';
import { SIM_HZ } from './tuning';
import { emptyInput } from './types';
import type { ClassId, InputFrame } from './types';

export interface AutoSeat {
  classId: ClassId;
  /** How the seat plays (bots.ts: EXPERT, NOVICE). `null` stands still and takes nothing. */
  skill: BotOptions | null;
  /** What this player's Attunement gives them. */
  boons?: Boons;
}

export interface AutoOptions {
  /** The run is given up as `long` after this many seconds of play. */
  most?: number;
  /** The run is given up as `stuck` when nothing has been hurt and no chamber left for this many seconds. */
  patience?: number;
  /** Begin at this chamber of the route (1..12) instead of the first. */
  startAt?: number;
  /** Called after every tick, before the tick's events are thrown away, with what each seat's hands did in it. */
  watch?: (s: Session, inputs: readonly InputFrame[]) => void;
}

export interface AutoRun {
  /**
   * How it ended: won, lost, `stuck` (a long while with nothing hurt and nothing left behind: a bot
   * that cannot find its way, or an Echo nobody can reach), or `long` (still going at the limit).
   */
  end: 'won' | 'lost' | 'stuck' | 'long';
  /** The chamber it ended in, 1..12, and what kind of stop that was. */
  chamber: number;
  kind: StopKind;
  /** Seconds played. */
  seconds: number;
  /** The share of the run in which the whole chamber stood frozen. */
  frozen: number;
  /** Seconds the Carillon and the Toll stood once the party had walked in; -1 for one never met. */
  carillon: number;
  toll: number;
  /** Rally earned by the whole party: every Return counted by its weight (rally.ts). */
  rally: number;
  stats: RunStats;
}

/** A seat of each class named, played by experts. */
export const experts = (...classes: ClassId[]): AutoSeat[] => classes.map((classId) => ({ classId, skill: EXPERT }));

/** Play one whole run. The same seed and seats always give the same run. */
export function autoRun(seed: string, seats: readonly AutoSeat[], content: ContentRegistry, o: AutoOptions = {}): AutoRun {
  const most = (o.most ?? 30 * 60) * SIM_HZ;
  const patience = (o.patience ?? 60) * SIM_HZ;
  const s = createSession(
    {
      seed,
      players: seats.map((seat, i) => ({ name: `P${i + 1}`, classId: seat.classId, boons: seat.boons })),
      buildId: 'autoplay',
      inputDelay: 0,
      stress: 0,
      startAt: o.startAt,
    },
    content,
  );
  const bots: Bot[] = seats.map((seat) => (seat.skill ? classBot(seat.classId, seat.skill) : idleBot()));
  const thinking = seats.map((seat, slot) => (seat.skill ? slot : -1)).filter((slot) => slot >= 0);
  const frames: InputFrame[] = seats.map(() => emptyInput());
  let frozen = 0;
  let carillon = -1;
  let toll = -1;
  let rally = 0;
  let mark = -1;
  let still = 0;
  let end: AutoRun['end'] = 'long';

  for (let t = 0; t < most; t++) {
    const bundle: Bundle = { tick: s.tick + 1, inputs: frames, cmds: botCommands(s, content, thinking) };
    bots.forEach((b, slot) => copyInput(b.think(worldOf(s, slot), slot), frames[slot]));
    stepSession(s, bundle, content);
    o.watch?.(s, frames);
    for (const w of s.worlds) {
      for (const ev of w.events) if (ev.type === 'rally') rally += ev.weight;
      w.events.length = 0;
    }
    if (s.phase !== 'run') {
      end = s.phase === 'won' ? 'won' : 'lost';
      break;
    }
    const w = s.worlds[0];
    if (w.freeze > 0) frozen++;
    const kind = stopOf(s)?.kind;
    if (w.flow.phase !== 'cleared') {
      if (kind === 'miniboss') carillon = Math.max(0, carillon) + 1;
      else if (kind === 'boss') toll = Math.max(0, toll) + 1;
    }
    // Is anything happening? Blows landing, Echoes falling, chambers left behind.
    let now = s.stop * 1e9;
    for (const world of s.worlds) now += world.stats.kills * 1e5 + world.stats.damageDealt;
    if (now !== mark) {
      mark = now;
      still = 0;
    } else if (++still >= patience) {
      end = 'stuck';
      break;
    }
  }

  const at = stopOf(s);
  return {
    end,
    chamber: at?.n ?? 0,
    kind: at?.kind ?? 'fight',
    seconds: s.played / SIM_HZ,
    frozen: s.played > 0 ? frozen / s.played : 0,
    carillon: carillon < 0 ? -1 : carillon / SIM_HZ,
    toll: toll < 0 ? -1 : toll / SIM_HZ,
    rally,
    stats: runSoFar(s),
  };
}
