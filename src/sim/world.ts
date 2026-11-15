// One chamber's simulation: creation, and the step that advances it by exactly one tick.
import { Rng } from '../core/rng';
import { stepEnemies, sweepDead } from './ai';
import type { ContentRegistry } from './defs';
import { stepBombs } from './bombs';
import { createFlow, stepFlow } from './flow';
import type { RoomFlow } from './flow';
import { createPlayer, equip, readPresses, stepPlayer } from './player';
import { stepProjectiles } from './projectiles';
import { clampToFloor } from './room';
import { stepStones } from './stones';
import { stepStrikes } from './strikes';
import { stepTelegraphs } from './telegraphs';
import { standing } from './combat';
import { DT, PLAYER, REVIVE } from './tuning';
import type { ClassId, InputFrame, Player, Room, World } from './types';

/** Who walks into a chamber: the seat, the class, and what they carry in from the run. */
export interface Entrant {
  slot: number;
  classId: ClassId;
  hp?: number;
  maxHp?: number;
  chimes?: number;
  /** The Tunings they hold, id to rank. */
  tunings?: Readonly<Record<string, number>>;
}

export interface WorldOptions {
  /** 1-based chamber number; scales enemy health and damage. */
  chamber?: number;
  entrants?: Entrant[];
  /** How the chamber runs. Omitted, an ordinary fight for this chamber number. */
  flow?: RoomFlow;
  /** Ticks between a press and its effect in this session (0 alone). */
  inputDelay?: number;
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
    // what they have built so far comes in with them; charges and wards are full again in a new chamber
    p.tunings = { ...(en.tunings ?? {}) };
    equip(p, content);
    p.dashCharges = p.dashMaxCharges;
    p.wardLeft = p.mods.ward;
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
    bombs: [],
    stones: [],
    telegraphs: [],
    events: [],
    freeze: 0,
    freezeAllowedAt: 0,
    nextId: 1,
    chamber,
    inputDelay: o.inputDelay ?? 0,
    content,
    flow: o.flow ?? createFlow(chamber, players.length),
    nav: [],
    deaths: [],
    stats: { kills: 0, damageDealt: 0, damageTaken: 0, returns: 0, bestRally: 0 },
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
  for (const b of w.bombs) {
    b.px = b.x;
    b.py = b.y;
  }
  for (const s of w.stones) {
    s.px = s.x;
    s.py = s.y;
  }
  for (const c of w.flow.pickups) {
    c.px = c.x;
    c.py = c.y;
  }
}

/** A downed player gets up when an ally has stood close for long enough. */
function stepRevives(w: World, dt: number): void {
  for (const p of w.players) {
    if (p.state !== 'down') continue;
    let helper = -1;
    let speed = 1;
    for (const q of w.players) {
      if (q === p || !standing(q)) continue;
      if ((q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y) <= REVIVE.radius * REVIVE.radius) {
        helper = q.slot;
        // an Echo Ward at its higher ranks helps allies up faster
        speed = q.mods.reviveSpeed;
        break;
      }
    }
    if (helper < 0) {
      p.reviveT = Math.max(0, p.reviveT - REVIVE.decay * dt);
      continue;
    }
    p.reviveT += dt * speed;
    if (p.reviveT < REVIVE.time) continue;
    p.reviveT = 0;
    p.state = 'idle';
    p.stateTime = 0;
    p.hp = Math.max(1, Math.round(p.maxHp * REVIVE.hp));
    p.iframes = REVIVE.iframes;
    w.events.push({ type: 'revive', player: p.slot, by: helper, x: p.x, y: p.y });
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
  stepRevives(w, DT);
  stepEnemies(w, DT);
  stepProjectiles(w, DT);
  stepBombs(w, DT);
  stepStones(w, DT);
  stepFlow(w, DT);
  stepStrikes(w, DT);
  stepTelegraphs(w, DT);
  sweepDead(w);
}
