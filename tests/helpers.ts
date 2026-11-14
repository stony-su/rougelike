// Shared test helpers: a world to stand in, and a "pad" that writes integer input frames the way
// a device would (held state stays, a tap bumps a counter once).
import { CONTENT } from '../src/content';
import { THRUM } from '../src/content/enemies';
import { spawnEnemy } from '../src/sim/ai';
import { hold, press, setAim, setMove } from '../src/sim/input';
import { buildRoom } from '../src/sim/room';
import { BTN, PRESS, emptyInput } from '../src/sim/types';
import type { Enemy, InputFrame, Player, SimEvent, World } from '../src/sim/types';
import { createWorld, stepWorld } from '../src/sim/world';
import type { Entrant } from '../src/sim/world';
import { OPEN_ROOM } from './fixtures';

export { BTN, PRESS };

/** A world on the open fixture room with `players` Sword players standing near the middle. */
export function openWorld(players = 1, seed: number | string = 5): World {
  const entrants: Entrant[] = Array.from({ length: players }, (_, slot) => ({ slot, classId: 'sword' }));
  const w = createWorld(buildRoom(OPEN_ROOM), seed, CONTENT, { entrants });
  // keep the automatic waves out of rule tests
  w.flow.phase = 'cleared';
  w.players.forEach((p, i) => {
    p.x = p.px = 6.5 + i * 1.2;
    p.y = p.py = 6.5;
  });
  return w;
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

/** A Thrum standing ready (spawn finished) that neither moves nor attacks. */
export function dummy(w: World, x: number, y: number, hp = 0): Enemy {
  const e = spawnEnemy(w, THRUM, x, y, { instant: true });
  e.cooldowns.fill(999);
  e.def = { ...THRUM, speed: 0 };
  if (hp > 0) e.hp = e.maxHp = hp;
  return e;
}
