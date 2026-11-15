// The session: everything that is shared between the laptops of one game, and the only thing
// that changes it. A session is advanced by `stepSession(session, bundle, content)`, one tick
// per bundle. A bundle holds every player's input for that tick and any commands (pause,
// restart); it is the same on every laptop, so the sessions stay identical.
//
// The session owns one world per place the players are. For now that is a single practice court
// in which waves keep coming, deeper each time; the run with its route arrives later and will
// live here too.
import { spawnEnemy } from './ai';
import { standing } from './combat';
import type { ContentRegistry } from './defs';
import { buildRoom, randomFloorPoint } from './room';
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

export interface Session {
  config: SessionConfig;
  /** Ticks stepped since the session began, pauses included. */
  tick: number;
  /** The slot that paused the game for everyone, or -1. */
  pausedBy: number;
  /** How many times the party has started over. */
  attempt: number;
  /** One world per place the players are. */
  worlds: World[];
  /** For each slot, the index into `worlds` of the world that player is in. */
  where: number[];
  /** The highest command sequence number applied for each slot. */
  lastSeq: number[];
  /** Ticks since every player went down, or -1. The party starts over when it runs out. */
  downFor: number;
  /** Ticks since the current chamber was cleared, or -1. */
  clearFor: number;
}

/** Ticks the world plays on after the whole party is down, before it starts over. */
const DOWN_BEAT = Math.round(2.4 * SIM_HZ);
/** Ticks of quiet after a chamber is cleared before the next waves come. */
const CLEAR_BEAT = Math.round(3 * SIM_HZ);

function startWorld(s: Session, content: ContentRegistry, chamber: number, entrants: Entrant[]): World {
  // the rooms are taken in turn, so each chamber looks unlike the last
  const template = content.rooms[(Math.max(1, chamber) - 1) % Math.max(1, content.rooms.length)];
  if (!template) throw new Error('The content has no rooms');
  return createWorld(buildRoom(template), `${s.config.seed}/${s.attempt}/${chamber}`, content, { chamber, entrants, inputDelay: s.config.inputDelay });
}

export function createSession(config: SessionConfig, content: ContentRegistry): Session {
  if (config.players.length < 1 || config.players.length > MAX_PLAYERS) throw new Error(`A session has 1 to ${MAX_PLAYERS} players`);
  const s: Session = {
    config,
    tick: 0,
    pausedBy: -1,
    attempt: 0,
    worlds: [],
    where: config.players.map(() => 0),
    lastSeq: config.players.map(() => 0),
    downFor: -1,
    clearFor: -1,
  };
  s.worlds.push(
    startWorld(
      s,
      content,
      1,
      config.players.map((p, slot) => ({ slot, classId: p.classId })),
    ),
  );
  return s;
}

/** The world a player is in. */
export const worldOf = (s: Session, slot: number): World => s.worlds[s.where[slot] ?? 0];

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

/** Start over from the first chamber with fresh characters. */
function restart(s: Session, content: ContentRegistry): void {
  s.attempt++;
  s.downFor = -1;
  s.clearFor = -1;
  s.pausedBy = -1;
  const w = startWorld(
    s,
    content,
    1,
    s.config.players.map((p, slot) => ({ slot, classId: p.classId })),
  );
  s.worlds = [w];
  s.where = s.config.players.map(() => 0);
}

/** Advance the whole session by exactly one tick. */
export function stepSession(s: Session, bundle: Bundle, content: ContentRegistry): void {
  s.tick++;
  for (const c of bundle.cmds) applyCommand(s, c, content);
  if (s.pausedBy >= 0) return;

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

  // The practice ladder: when a chamber is cleared the next one begins in the same court, a little deeper.
  const w = s.worlds[0];
  if (s.config.stress === 0 && w.flow.phase === 'cleared') {
    s.clearFor = s.clearFor < 0 ? 0 : s.clearFor + 1;
    if (s.clearFor >= CLEAR_BEAT) {
      s.clearFor = -1;
      // On to the next chamber: everyone walks in with what they have, and the fallen stand up again.
      const entrants: Entrant[] = w.players.map((p) => ({
        slot: p.slot,
        classId: p.classId,
        maxHp: p.maxHp,
        hp: standing(p) ? p.hp : Math.max(1, Math.round(p.maxHp * REVIVE.hp)),
        chimes: p.chimes + w.flow.pickups.reduce((sum, c) => sum + c.value, 0),
      }));
      s.worlds[0] = startWorld(s, content, w.chamber + 1, entrants);
    }
  }

  // Everyone down: the world plays on for a beat, then the party starts over.
  if (s.worlds.every((world) => !world.players.some(standing))) {
    s.downFor = s.downFor < 0 ? 0 : s.downFor + 1;
    if (s.downFor >= DOWN_BEAT) restart(s, content);
  } else {
    s.downFor = -1;
  }
}
