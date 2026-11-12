// What happens inside one room: waves, Chalk pickups, the reward, interactable things and doors.
// The run (src/sim/run.ts) decides which room comes next; this decides when a room is done.
import type { Vec2 } from '../core/math';
import { spawnEnemy } from './ai';
import type { EnemyDef, RoomKind } from './defs';
import { kitChalkPickup } from './kit';
import { addHostileChain, returnStakes } from './lines';
import { isClear, randomFloorPoint } from './room';
import type { Enemy, World } from './types';

/** A room on the run's route. */
export interface RoomSlot {
  kind: RoomKind;
  elite: boolean;
}

export type InteractKind = 'reward' | 'shop' | 'rest' | 'event' | 'door';

export interface Interactable {
  id: number;
  kind: InteractKind;
  x: number;
  y: number;
  radius: number;
  /** For doors: which door (index into flow.doors). */
  index: number;
  /** Can be used right now. */
  active: boolean;
  /** Doors trigger by walking in; everything else needs the interact key. */
  auto: boolean;
}

export interface Pickup {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  value: number;
  age: number;
  /** Being drawn to the player. */
  homing: boolean;
}

export type FlowPhase = 'fight' | 'cleared' | 'open';

export interface RoomFlow {
  kind: RoomKind;
  elite: boolean;
  phase: FlowPhase;
  /** Waves sent so far, and in total. */
  wave: number;
  waves: number;
  waveTimer: number;
  /** Threat points each wave may spend. */
  budget: number;
  interactables: Interactable[];
  pickups: Pickup[];
  /** Where each door leads, once the doors are open. */
  doors: RoomSlot[];
  /** The interactable in reach this tick (for the prompt), or 0. */
  near: number;
  /** A one-room rule change from the risk event, or null. */
  handicap: string | null;
  /** Seconds since the room was cleared. */
  clearedFor: number;
  /** Chalk paid for clearing. */
  clearBonus: number;
}

export const MAGNET_RADIUS = 2.4;
export const COLLECT_RADIUS = 0.55;
const SPAWN_MIN_DIST = 4;

export function createFlow(slot: RoomSlot, sheet: number): RoomFlow {
  const combat = slot.kind === 'combat' || slot.kind === 'event';
  return {
    kind: slot.kind,
    elite: slot.elite,
    phase: slot.kind === 'combat' ? 'fight' : 'open',
    wave: 0,
    waves: combat ? (sheet >= 4 ? 3 : 2) : 0,
    waveTimer: 0.9,
    budget: 3 + 0.9 * sheet,
    interactables: [],
    pickups: [],
    doors: [],
    near: 0,
    handicap: null,
    clearedFor: 0,
    clearBonus: 10 + 2 * sheet,
  };
}

export function addInteractable(w: World, kind: InteractKind, x: number, y: number, o: { radius?: number; index?: number; auto?: boolean } = {}): Interactable {
  const it: Interactable = { id: w.nextId++, kind, x, y, radius: o.radius ?? 1.3, index: o.index ?? 0, active: true, auto: !!o.auto };
  w.flow.interactables.push(it);
  return it;
}

/** Open the room's doors onto the given slots. */
export function openDoors(w: World, slots: RoomSlot[]): void {
  const f = w.flow;
  f.doors = slots.slice(0, Math.max(1, w.room.doors.length));
  f.phase = 'open';
  f.interactables = f.interactables.filter((i) => i.kind !== 'door');
  f.doors.forEach((_slot, i) => {
    const d = w.room.doors[i % w.room.doors.length];
    addInteractable(w, 'door', d.x, d.y, { radius: 0.75, index: i, auto: true });
  });
  w.events.push({ type: 'doorsOpen', count: f.doors.length });
}

// ---------------------------------------------------------------- waves

/** Enemies that may appear in this room. */
export function enemyPool(w: World): EnemyDef[] {
  return Object.values(w.content.enemies)
    .filter((d) => d.zones.includes(w.room.zone) && d.minSheet <= Math.max(1, w.sheet) && d.threat < 50)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Choose what a wave contains by spending the threat budget. Deterministic for the world's rng. */
export function composeWave(w: World, budget: number): EnemyDef[] {
  const pool = enemyPool(w);
  const out: EnemyDef[] = [];
  if (pool.length === 0) return out;
  let left = budget;
  const cheapest = pool.reduce((m, d) => Math.min(m, d.threat), Infinity);
  let guard = 0;
  while (left >= cheapest && guard++ < 40) {
    const affordable = pool.filter((d) => d.threat <= left && allowed(w, d, out));
    if (affordable.length === 0) break;
    // lean toward the bigger things the budget can afford, but keep variety
    const pick = w.rng.weighted(affordable, (d) => 1 + d.threat * 0.5);
    out.push(pick);
    left -= pick.threat;
  }
  if (out.length === 0) out.push(pool[0]);
  return out;
}

/** Composition rules that keep early rooms fair. Driven by threat and counts, never by a particular enemy id. */
function allowed(w: World, d: EnemyDef, soFar: EnemyDef[]): boolean {
  const same = soFar.filter((x) => x.id === d.id).length;
  // heavy things come one at a time until late in the run
  if (d.threat >= 3 && w.sheet < 8 && same >= 1) return false;
  // things that take the player's tools away do not stack early
  if (d.disruptor && w.sheet < 5 && soFar.some((x) => x.disruptor)) return false;
  return same < 5;
}

/** Spawn marks ordered farthest-first from the player, with fallbacks. */
function spawnSpots(w: World, n: number): Vec2[] {
  const p = w.player;
  const marks = w.room.spawnMarks
    .filter((m) => Math.hypot(m.x - p.x, m.y - p.y) >= SPAWN_MIN_DIST)
    .sort((a, b) => Math.hypot(b.x - p.x, b.y - p.y) - Math.hypot(a.x - p.x, a.y - p.y));
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const m = marks.length ? marks[i % marks.length] : null;
    if (m) {
      const j = i >= marks.length ? 0.8 : 0.3;
      let x = m.x + w.rng.float(-j, j);
      let y = m.y + w.rng.float(-j, j);
      if (!isClear(w.room, x, y, 0.5)) {
        x = m.x;
        y = m.y;
      }
      out.push({ x, y });
    } else {
      out.push(randomFloorPoint(w.room, w.rng, 0.5, p, SPAWN_MIN_DIST));
    }
  }
  return out;
}

export const ELITE_TRAITS = ['hasty', 'sealed', 'covetous', 'inked'] as const;
export type EliteTrait = (typeof ELITE_TRAITS)[number];

/** Turn a freshly spawned enemy into a single-trait elite. */
export function makeElite(e: Enemy, trait: EliteTrait): void {
  e.elite = trait;
  e.maxHp = Math.round(e.maxHp * 1.6);
  e.hp = e.maxHp;
  e.damageMul *= 1.15;
  if (trait === 'hasty') {
    e.windupMul *= 0.7;
    e.speedMul *= 1.25;
  } else if (trait === 'inked') {
    e.armor = 0.25;
  }
}

function sendWave(w: World): void {
  const f = w.flow;
  f.wave++;
  const defs = composeWave(w, f.budget * (f.elite ? 0.8 : 1));
  const spots = spawnSpots(w, defs.length + 2);
  const spawned: Enemy[] = [];
  defs.forEach((d, i) => spawned.push(spawnEnemy(w, d, spots[i].x, spots[i].y)));
  // An elite room's last wave carries the elites.
  if (f.elite && f.wave === f.waves && spawned.length > 0) {
    if (w.rng.chance(0.5) && spawned.length >= 1) {
      // a chained pair: two of a kind, joined
      const def = spawned[0].def;
      const twin = spawnEnemy(w, def, spots[defs.length].x, spots[defs.length].y);
      for (const e of [spawned[0], twin]) {
        e.elite = 'chained';
        e.maxHp = Math.round(e.maxHp * 1.8);
        e.hp = e.maxHp;
      }
      addHostileChain(w, spawned[0].id, twin.id);
    } else {
      makeElite(spawned[0], w.rng.pick(ELITE_TRAITS));
    }
  }
  w.events.push({ type: 'waveStart', wave: f.wave });
}

// ---------------------------------------------------------------- pickups

export function dropChalk(w: World, x: number, y: number, total: number): void {
  let left = Math.max(0, Math.round(total));
  while (left > 0) {
    const value = left >= 5 ? 5 : 1;
    left -= value;
    const a = w.rng.float(0, Math.PI * 2);
    const sp = w.rng.float(1.5, 4);
    w.flow.pickups.push({ id: w.nextId++, x, y, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, value, age: 0, homing: false });
  }
}

function stepPickups(w: World, dt: number): void {
  const f = w.flow;
  const p = w.player;
  if (f.pickups.length === 0) return;
  let any = false;
  // once the room is clear, everything flies home
  const all = f.phase !== 'fight';
  for (const c of f.pickups) {
    c.px = c.x;
    c.py = c.y;
    c.age += dt;
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    if (p.state !== 'dead' && c.age > 0.35 && (d < MAGNET_RADIUS || all)) c.homing = true;
    if (c.homing && p.state !== 'dead') {
      const sp = 9 + c.age * 10;
      c.vx = (dx / d) * sp;
      c.vy = (dy / d) * sp;
    } else {
      const k = Math.exp(-5 * dt);
      c.vx *= k;
      c.vy *= k;
    }
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    if (c.homing && d < COLLECT_RADIUS) {
      const gain = Math.max(1, Math.round(c.value * w.base.chalkMul));
      w.chalk += gain;
      w.events.push({ type: 'chalk', amount: gain, x: p.x, y: p.y });
      kitChalkPickup(w);
      c.value = 0;
      any = true;
    }
  }
  if (any) f.pickups = f.pickups.filter((c) => c.value > 0);
}

// ---------------------------------------------------------------- step

export function stepFlow(w: World, dt: number, interactPressed: boolean): void {
  const f = w.flow;
  const p = w.player;

  // Chalk from the fallen.
  if (w.deaths.length) {
    for (const d of w.deaths) {
      const [lo, hi] = d.def.chalk;
      dropChalk(w, d.x, d.y, w.rng.int(lo, hi) * (d.elite ? 3 : 1));
    }
    w.deaths.length = 0;
  }
  stepPickups(w, dt);

  if (f.phase === 'fight' && p.state !== 'dead') {
    const alive = w.enemies.some((e) => !e.dead);
    if (!alive) {
      if (f.wave >= f.waves) {
        f.phase = 'cleared';
        f.clearedFor = 0;
        returnStakes(w);
        dropChalk(w, w.room.rewardSpot.x, w.room.rewardSpot.y, f.clearBonus * (f.elite ? 2 : 1));
        addInteractable(w, 'reward', w.room.rewardSpot.x, w.room.rewardSpot.y, { radius: 1.25 });
        w.events.push({ type: 'roomClear', x: w.room.rewardSpot.x, y: w.room.rewardSpot.y });
      } else {
        f.waveTimer -= dt;
        if (f.waveTimer <= 0) {
          sendWave(w);
          f.waveTimer = 1.1;
        }
      }
    }
  } else if (f.phase === 'cleared') {
    f.clearedFor += dt;
  }

  // What is in reach, and what gets used.
  f.near = 0;
  if (p.state === 'dead') return;
  let best: Interactable | null = null;
  let bd = Infinity;
  for (const it of f.interactables) {
    if (!it.active) continue;
    const d = Math.hypot(it.x - p.x, it.y - p.y);
    if (d > it.radius) continue;
    if (it.auto) {
      it.active = false;
      w.events.push({ type: 'interact', id: it.id, kind: it.kind, index: it.index });
      return;
    }
    if (d < bd) {
      bd = d;
      best = it;
    }
  }
  if (best) {
    f.near = best.id;
    if (interactPressed) w.events.push({ type: 'interact', id: best.id, kind: best.kind, index: best.index });
  }
}

/** Start the fight in a room that began peaceful (the risk event, once accepted). */
export function startFight(w: World, waves: number, elite: boolean): void {
  const f = w.flow;
  f.phase = 'fight';
  f.wave = 0;
  f.waves = waves;
  f.elite = elite;
  f.waveTimer = 0.8;
  f.interactables = f.interactables.filter((i) => i.kind !== 'door' && i.kind !== 'event');
  f.doors = [];
}
