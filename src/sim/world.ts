// The world step: one fixed tick of the whole simulation.
import { Rng } from '../core/rng';
import { bufferInput, createPlayer, stepPlayer } from './player';
import { DT } from './tuning';
import type { InputFrame, Room, World } from './types';

export function createWorld(room: Room, seed: number | string): World {
  return {
    tick: 0,
    time: 0,
    rng: new Rng(seed),
    room,
    player: createPlayer(room.start.x, room.start.y),
    events: [],
    hitstop: 0,
  };
}

/** Advance the world by exactly one tick (DT seconds). */
export function stepWorld(w: World, inp: InputFrame): void {
  w.tick++;
  bufferInput(w.player, inp);
  if (w.hitstop > 0) {
    // Frozen: positions hold, so interpolation must not drift.
    w.hitstop = Math.max(0, w.hitstop - DT);
    w.player.px = w.player.x;
    w.player.py = w.player.y;
    return;
  }
  w.time += DT;
  stepPlayer(w, inp, DT);
}
