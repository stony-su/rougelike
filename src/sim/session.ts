// The session: everything that is shared between the laptops of one game, and the only thing
// that changes it. A session is advanced by `stepSession(session, bundle, content)`, one tick
// per bundle. A bundle holds every player's input for that tick and any commands (pause,
// restart); it is the same on every laptop, so the sessions stay identical.
//
// The session owns the run: the route of twelve chambers planned from the seed (run.ts), the
// chamber the party is in, and what each player carries from one chamber into the next. It
// holds one world per place the players are. When the last chamber is cleared the run is won;
// when the whole party is down it is lost; either way it waits for someone to start again.
import { spawnEnemy } from './ai';
import { standing } from './combat';
import type { ContentRegistry } from './defs';
import { buildRoom, randomFloorPoint } from './room';
import { generateRoom } from './roomgen';
import { CAMP_HEAL, flowFor, planRoute, roomSpec } from './run';
import type { Stop } from './run';
import { REVIVE, SIM_HZ } from './tuning';
import { emptyInput } from './types';
import type { ClassId, InputFrame, World } from './types';
import { createWorld, stepWorld } from './world';
import type { Entrant } from './world';

export const MAX_PLAYERS = 3;

export interface PlayerSetup {
  name: string;
  classId: ClassId;
}

/** Fixed when the session is created; never changes during it. */
export interface SessionConfig {
  seed: string;
  players: PlayerSetup[];
  /** Identifies the build of the game; laptops running different builds must not play together. */
  buildId: string;
  /** Ticks between a press and its effect, as measured in the lobby (0 alone). Widens timing windows. */
  inputDelay: number;
  /** Development: keep this many enemies alive and nobody can be hurt. 0 = off. */
  stress: number;
  /**
   * The practice ladder instead of a run: waves without end in the hand-built rooms, deeper each
   * time, and the party simply starts over when it goes down.
   */
  practice?: boolean;
}

export type CommandKind = 'pause' | 'restart';

/** Something a player decided, outside moment-to-moment input. Applied in the order the bundle lists them. */
export interface Command {
  slot: number;
  /** Per-player counter, so a command delivered twice is applied once. */
  seq: number;
  kind: CommandKind;
  a: number;
}

export interface Bundle {
  tick: number;
  /** Indexed by slot. A missing entry means that seat stands idle this tick. */
  inputs: Array<InputFrame | undefined>;
  cmds: Command[];
}

/** 'run': being played. 'won': the last chamber was cleared. 'lost': the whole party went down. */
export type RunPhase = 'run' | 'won' | 'lost';

/** What a run added up to, for the results and the records. */
export interface RunStats {
  /** Chambers cleared. */
  chambers: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  /** Returns landed, and the highest Rally anyone reached. */
  returns: number;
  bestRally: number;
}

export interface Session {
  config: SessionConfig;
  /** Ticks stepped since the session began, pauses included. */
  tick: number;
  /** The slot that paused the game for everyone, or -1. */
  pausedBy: number;
  /** How many times the party has started over. */
  attempt: number;
  /** The chambers of this attempt, in order. Empty on the practice ladder. */
  route: Stop[];
  /** Index into `route` of the chamber the party is in. */
  stop: number;
  phase: RunPhase;
  /** Ticks since the run was won or lost. */
  endedFor: number;
  /** What the chambers already left added up to. The chamber being played is added when it is left. */
  totals: RunStats;
  /** One world per place the players are. */
  worlds: World[];
  /** For each slot, the index into `worlds` of the world that player is in. */
  where: number[];
  /** The highest command sequence number applied for each slot. */
  lastSeq: number[];
  /** Ticks since every player went down, or -1. The run is lost when it runs out. */
  downFor: number;
  /** Ticks since the current chamber was cleared, or -1. */
  clearFor: number;
}

/** Ticks the world plays on after the whole party is down, before the run is called lost. */
const DOWN_BEAT = Math.round(2.4 * SIM_HZ);
/** Ticks of quiet after a chamber is cleared before the party walks on. */
const CLEAR_BEAT = Math.round(3 * SIM_HZ);

const noStats = (): RunStats => ({ chambers: 0, kills: 0, damageDealt: 0, damageTaken: 0, returns: 0, bestRally: 0 });

/** Everyone as they are at the start of a run. */
const fresh = (s: Session): Entrant[] => s.config.players.map((p, slot) => ({ slot, classId: p.classId }));

/** The chamber of the stop the party is at, built by the generator from the seed. */
function openStop(s: Session, content: ContentRegistry, entrants: Entrant[]): World {
  const stop = s.route[s.stop];
  const seed = `${s.config.seed}/${s.attempt}/${stop.n}`;
  const room = buildRoom(generateRoom(seed, roomSpec(stop)));
  return createWorld(room, seed, content, { chamber: stop.n, entrants, flow: flowFor(stop, entrants.length), inputDelay: s.config.inputDelay });
}

/** A chamber of the practice ladder: the hand-built rooms, taken in turn. */
function openPractice(s: Session, content: ContentRegistry, chamber: number, entrants: Entrant[]): World {
  const template = content.rooms[(Math.max(1, chamber) - 1) % Math.max(1, content.rooms.length)];
  if (!template) throw new Error('The content has no rooms');
  return createWorld(buildRoom(template), `${s.config.seed}/${s.attempt}/${chamber}`, content, { chamber, entrants, inputDelay: s.config.inputDelay });
}

/** Begin an attempt: plan its route and put fresh characters in its first chamber. */
function begin(s: Session, content: ContentRegistry): void {
  s.route = s.config.practice ? [] : planRoute(`${s.config.seed}/${s.attempt}`);
  s.stop = 0;
  s.phase = 'run';
  s.endedFor = 0;
  s.totals = noStats();
  s.downFor = -1;
  s.clearFor = -1;
  s.pausedBy = -1;
  s.worlds = [s.config.practice ? openPractice(s, content, 1, fresh(s)) : openStop(s, content, fresh(s))];
  s.where = s.config.players.map(() => 0);
}

export function createSession(config: SessionConfig, content: ContentRegistry): Session {
  if (config.players.length < 1 || config.players.length > MAX_PLAYERS) throw new Error(`A session has 1 to ${MAX_PLAYERS} players`);
  const s: Session = {
    config,
    tick: 0,
    pausedBy: -1,
    attempt: 0,
    route: [],
    stop: 0,
    phase: 'run',
    endedFor: 0,
    totals: noStats(),
    worlds: [],
    where: [],
    lastSeq: config.players.map(() => 0),
    downFor: -1,
    clearFor: -1,
  };
  begin(s, content);
  return s;
}

/** The world a player is in. */
export const worldOf = (s: Session, slot: number): World => s.worlds[s.where[slot] ?? 0];

/** The stop the party is at, or null on the practice ladder. */
export const stopOf = (s: Session): Stop | null => s.route[s.stop] ?? null;

/** What the run adds up to at this moment: the chambers left behind, and the one being played. */
export function runSoFar(s: Session): RunStats {
  const t = { ...s.totals };
  // once the run has ended, its last chamber is already in the totals
  if (s.phase === 'run') for (const w of s.worlds) bank(t, w, false);
  return t;
}

function bank(t: RunStats, w: World, cleared: boolean): void {
  if (cleared) t.chambers++;
  t.kills += w.stats.kills;
  t.damageDealt += w.stats.damageDealt;
  t.damageTaken += w.stats.damageTaken;
  t.returns += w.stats.returns;
  t.bestRally = Math.max(t.bestRally, w.stats.bestRally);
}

function applyCommand(s: Session, c: Command, content: ContentRegistry): void {
  if (c.slot < 0 || c.slot >= s.config.players.length) return;
  if (c.seq <= s.lastSeq[c.slot]) return;
  s.lastSeq[c.slot] = c.seq;
  if (c.kind === 'pause') {
    // anyone can pause for everyone, and anyone can lift it
    s.pausedBy = s.pausedBy >= 0 ? -1 : c.slot;
  } else if (c.kind === 'restart') {
    restart(s, content);
  }
}

/** Start over: a new route, the first chamber, fresh characters. */
function restart(s: Session, content: ContentRegistry): void {
  s.attempt++;
  begin(s, content);
}

/**
 * What everyone walks into the next chamber with. The fallen stand up again, Chimes still lying
 * on the floor come along, and `heal` is the share of their health a camp gives back.
 */
function carry(w: World, heal: number): Entrant[] {
  const lying = w.flow.pickups.reduce((sum, c) => sum + c.value, 0);
  return w.players.map((p) => {
    const hp = standing(p) ? p.hp : Math.max(1, Math.round(p.maxHp * REVIVE.hp));
    return { slot: p.slot, classId: p.classId, maxHp: p.maxHp, hp: Math.min(p.maxHp, hp + Math.round(p.maxHp * heal)), chimes: p.chimes + lying };
  });
}

/** The chamber is cleared and the quiet after it is over: on to the next stop, or the run is won. */
function advance(s: Session, content: ContentRegistry): void {
  const w = s.worlds[0];
  bank(s.totals, w, true);
  if (s.stop >= s.route.length - 1) {
    s.phase = 'won';
    s.endedFor = 0;
    return;
  }
  s.stop++;
  s.worlds[0] = openStop(s, content, carry(w, s.route[s.stop].kind === 'camp' ? CAMP_HEAL : 0));
}

/** Advance the whole session by exactly one tick. */
export function stepSession(s: Session, bundle: Bundle, content: ContentRegistry): void {
  s.tick++;
  for (const c of bundle.cmds) applyCommand(s, c, content);
  if (s.pausedBy >= 0) return;
  // a run that has ended stands still until someone starts again
  if (s.phase !== 'run') {
    s.endedFor++;
    return;
  }

  const idle = emptyInput();
  for (const w of s.worlds) {
    if (s.config.stress > 0) {
      // Stress scene: a constant crowd, and nobody can be hurt.
      for (const p of w.players) p.hp = p.maxHp;
      const kinds = Object.keys(content.enemies).sort();
      while (w.enemies.length < s.config.stress) {
        // one of each kind in turn
        const def = content.enemies[kinds[w.enemies.length % kinds.length]];
        const at = randomFloorPoint(w.room, w.rng, 0.5, w.players[0], 3);
        spawnEnemy(w, def, at.x, at.y);
      }
    }
    stepWorld(w, bundle.inputs, idle);
  }

  const w = s.worlds[0];
  if (s.config.stress === 0 && w.flow.phase === 'cleared') {
    s.clearFor = s.clearFor < 0 ? 0 : s.clearFor + 1;
    if (s.clearFor >= CLEAR_BEAT) {
      s.clearFor = -1;
      // Everyone walks on with what they have, and the fallen stand up again.
      if (s.config.practice) s.worlds[0] = openPractice(s, content, w.chamber + 1, carry(w, 0));
      else advance(s, content);
    }
  }

  // Everyone down: the world plays on for a beat, then the run is lost (the practice ladder just starts over).
  if (s.phase === 'run' && s.worlds.every((world) => !world.players.some(standing))) {
    s.downFor = s.downFor < 0 ? 0 : s.downFor + 1;
    if (s.downFor >= DOWN_BEAT) {
      if (s.config.practice) restart(s, content);
      else {
        bank(s.totals, s.worlds[0], false);
        s.phase = 'lost';
        s.endedFor = 0;
      }
    }
  } else {
    s.downFor = -1;
  }
}
