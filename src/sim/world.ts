// The world step: one fixed tick of the whole simulation.
import { Rng } from '../core/rng';
import { sweepDead, stepEnemies } from './ai';
import type { ContentRegistry } from './defs';
import { createKit, defaultMods, installKit, kitRoomStart, rebuildKit, stepKit } from './kit';
import type { KitState } from './kit';
import { createLines, stepLines } from './lines';
import { bufferInput, createPlayer, stepPlayer } from './player';
import { stepProjectiles } from './projectiles';
import { stepTelegraphs } from './telegraphs';
import { DT } from './tuning';
import type { InputFrame, Room, World } from './types';

export interface WorldOptions {
  /** 1-based sheet number; scales enemy health and damage. */
  sheet?: number;
  /** The run's kit, carried between rooms. A fresh one is made if omitted. */
  kit?: KitState;
  chalk?: number;
  base?: World['base'];
}

export function createWorld(room: Room, seed: number | string, content: ContentRegistry, o: WorldOptions = {}): World {
  installKit();
  const w: World = {
    tick: 0,
    time: 0,
    rng: new Rng(seed),
    room,
    player: createPlayer(room.start.x, room.start.y),
    enemies: [],
    projectiles: [],
    telegraphs: [],
    events: [],
    hitstop: 0,
    nextId: 1,
    sheet: o.sheet ?? 1,
    lines: createLines(),
    content,
    kit: o.kit ?? createKit(),
    mods: defaultMods(),
    zones: [],
    chalk: o.chalk ?? 0,
    base: o.base ?? { dashCharges: 0, dashRechargeMul: 1, chalkMul: 1 },
    stats: { kills: 0, damageDealt: 0, damageTaken: 0, rodDamage: 0, lineDamage: 0, whips: 0, discharges: 0, trips: 0 },
  };
  rebuildKit(w);
  kitRoomStart(w);
  w.player.dashCharges = w.player.dashMaxCharges;
  w.player.plumbCharges = w.player.plumbMax;
  return w;
}

/** During a freeze nothing moves, so previous positions must equal current ones or interpolation would drift. */
function holdPositions(w: World): void {
  const p = w.player;
  p.px = p.x;
  p.py = p.y;
  for (const e of w.enemies) {
    e.px = e.x;
    e.py = e.y;
  }
  for (const pr of w.projectiles) {
    pr.px = pr.x;
    pr.py = pr.y;
  }
}

/** Advance the world by exactly one tick (DT seconds). */
export function stepWorld(w: World, inp: InputFrame): void {
  w.tick++;
  bufferInput(w.player, inp);
  if (w.hitstop > 0) {
    w.hitstop = Math.max(0, w.hitstop - DT);
    holdPositions(w);
    return;
  }
  w.time += DT;
  stepPlayer(w, inp, DT);
  stepEnemies(w, DT);
  stepProjectiles(w, DT);
  // Lines resolve after everything has moved, so trips see this tick's positions.
  stepLines(w, DT);
  stepKit(w, DT);
  stepTelegraphs(w, DT);
  sweepDead(w);
}
