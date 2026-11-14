// One chamber's simulation: creation, and the step that advances it by exactly one tick.
import { Rng } from '../core/rng';
import { stepEnemies, sweepDead } from './ai';
import type { ContentRegistry } from './defs';
import { createFlow, stepFlow } from './flow';
import type { RoomFlow } from './flow';
import { createPlayer, readPresses, stepPlayer } from './player';
import { stepProjectiles } from './projectiles';
import { clampToFloor } from './room';
import { stepTelegraphs } from './telegraphs';
import { DT, PLAYER } from './tuning';
import type { InputFrame, Player, Room, World } from './types';

/** Who walks into a chamber: the seat, the class, and what they carry in from the run. */
export interface Entrant {
  slot: number;
  classId: string;
  hp?: number;
  maxHp?: number;
  chimes?: number;
}

export interface WorldOptions {
  /** 1-based chamber number; scales enemy health and damage. */
  chamber?: number;
  entrants?: Entrant[];
  /** How the chamber runs. Omitted, an ordinary fight for this chamber number. */
  flow?: RoomFlow;
}

/** Where each seat stands when a chamber begins, relative to the room's start mark. */
const START_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-0.95, 0.55],
  [0.95, 0.55],
];

export function createWorld(room: Room, seed: number | string, content: ContentRegistry, o: WorldOptions = {}): World {
  const entrants = o.entrants ?? [{ slot: 0, classId: 'sword' }];
  const chamber = o.chamber ?? 1;
  const players: Player[] = entrants.map((en, i) => {
    const off = START_OFFSETS[i % START_OFFSETS.length];
    const at = clampToFloor(room, room.start.x + off[0], room.start.y + off[1], PLAYER.radius, { x: 0, y: 0 });
    const p = createPlayer(en.slot, en.classId, at.x, at.y);
    if (en.maxHp !== undefined) p.maxHp = en.maxHp;
    p.hp = Math.min(p.maxHp, en.hp ?? p.maxHp);
    p.chimes = en.chimes ?? 0;
    return p;
  });
  return {
    tick: 0,
    time: 0,
    rng: new Rng(seed),
    room,
    players,
    enemies: [],
    projectiles: [],
    telegraphs: [],
    events: [],
    freeze: 0,
    freezeAllowedAt: 0,
    nextId: 1,
    chamber,
    content,
    flow: o.flow ?? createFlow(chamber, players.length),
    deaths: [],
    stats: { kills: 0, damageDealt: 0, damageTaken: 0 },
  };
}

/** During a whole-chamber freeze nothing moves, so previous positions must equal current ones or interpolation would drift. */
function holdPositions(w: World): void {
  for (const p of w.players) {
    p.px = p.x;
    p.py = p.y;
  }
  for (const e of w.enemies) {
    e.px = e.x;
    e.py = e.y;
  }
  for (const pr of w.projectiles) {
    pr.px = pr.x;
    pr.py = pr.y;
  }
  for (const c of w.flow.pickups) {
    c.px = c.x;
    c.py = c.y;
  }
}

/**
 * Advance the world by exactly one tick. `inputs` is indexed by seat (slot); a seat with no
 * input this tick stands idle.
 */
export function stepWorld(w: World, inputs: ReadonlyArray<InputFrame | undefined>, idle: InputFrame): void {
  w.tick++;
  if (w.freeze > 0) {
    w.freeze--;
    // presses made during the freeze are buffered, not lost
    for (const p of w.players) readPresses(p, inputs[p.slot] ?? idle);
    holdPositions(w);
    return;
  }
  w.time += DT;
  for (const p of w.players) stepPlayer(w, p, inputs[p.slot] ?? idle, DT);
  stepEnemies(w, DT);
  stepProjectiles(w, DT);
  stepFlow(w, DT);
  stepTelegraphs(w, DT);
  sweepDead(w);
}
