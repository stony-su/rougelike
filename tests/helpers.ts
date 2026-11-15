// Shared test helpers: a world to stand in, and a "pad" that writes integer input frames the way
// a device would (held state stays, a tap bumps a counter once).
import { CONTENT } from '../src/content';
import { THRUM } from '../src/content/enemies/thrum';
import { spawnEnemy } from '../src/sim/ai';
import type { EnemyDef, RoomTemplate } from '../src/sim/defs';
import { hold, press, setAim, setMove } from '../src/sim/input';
import { buildRoom } from '../src/sim/room';
import { BTN, PRESS, emptyInput } from '../src/sim/types';
import type { ClassId, Enemy, InputFrame, Player, SimEvent, World } from '../src/sim/types';
import { createWorld, stepWorld } from '../src/sim/world';
import type { Entrant } from '../src/sim/world';
import { BOUNCE_ROOM, OPEN_ROOM } from './fixtures';

export { BTN, PRESS };

function worldOn(room: RoomTemplate, classes: ClassId[], seed: number | string): World {
  const entrants: Entrant[] = classes.map((classId, slot) => ({ slot, classId }));
  const w = createWorld(buildRoom(room), seed, CONTENT, { entrants });
  // keep the automatic waves out of rule tests
  w.flow.phase = 'cleared';
  return w;
}

/**
 * A world on the open fixture room with players standing near the middle. `players` is a count
 * of Sword players, or a list of classes.
 */
export function openWorld(players: number | ClassId[] = 1, seed: number | string = 5): World {
  const classes: ClassId[] = typeof players === 'number' ? Array.from({ length: players }, () => 'sword' as const) : players;
  const w = worldOn(OPEN_ROOM, classes, seed);
  w.players.forEach((p, i) => {
    p.x = p.px = 6.5 + i * 1.2;
    p.y = p.py = 6.5;
  });
  return w;
}

/** A world on the bounce fixture room (cut corners, a post, a bumper, a pit) with one player of a class at (3.5, 5.5). */
export function bounceWorld(classId: ClassId = 'sword', seed: number | string = 5): World {
  const w = worldOn(BOUNCE_ROOM, [classId], seed);
  place(w.players[0], 3.5, 5.5);
  return w;
}

/** Put a body somewhere without it having travelled there. */
export function place(b: { x: number; y: number; px: number; py: number }, x: number, y: number): void {
  b.x = b.px = x;
  b.y = b.py = y;
}

export class Pad {
  readonly f: InputFrame = emptyInput();

  constructor() {
    // aim along +x by default
    this.f.aimAngle = 0;
    this.f.aimDist = 80;
  }

  move(dx: number, dy: number, amount = 1): this {
    setMove(this.f, dx, dy, amount);
    return this;
  }

  stop(): this {
    setMove(this.f, 0, 0);
    return this;
  }

  aimAt(p: Player, x: number, y: number): this {
    setAim(this.f, p.x, p.y, x, y);
    return this;
  }

  tap(index: number): this {
    press(this.f, index);
    return this;
  }

  hold(bit: number, on = true): this {
    hold(this.f, bit, on);
    return this;
  }
}

/** Step a world `n` ticks with one pad per seat; returns the events of those ticks. */
export function run(w: World, n: number, ...pads: Pad[]): SimEvent[] {
  const out: SimEvent[] = [];
  const idle = emptyInput();
  const inputs = pads.map((p) => p.f);
  for (let i = 0; i < n; i++) {
    stepWorld(w, inputs, idle);
    out.push(...w.events);
    w.events.length = 0;
  }
  return out;
}

/** An Echo standing ready (spawn finished) that neither moves nor attacks. A Thrum unless told otherwise. */
export function dummy(w: World, x: number, y: number, hp = 0, def: EnemyDef = THRUM): Enemy {
  const e = spawnEnemy(w, def, x, y, { instant: true });
  e.cooldowns.fill(999);
  e.def = { ...def, speed: 0 };
  if (hp > 0) e.hp = e.maxHp = hp;
  return e;
}

/** The events of one type, narrowed. */
export function eventsOf<T extends SimEvent['type']>(events: SimEvent[], type: T): Array<Extract<SimEvent, { type: T }>> {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}
