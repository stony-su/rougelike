// What happens inside one chamber: waves arrive, the fallen drop Chimes, and the chamber is
// cleared when the last wave is beaten. The session decides what comes after.
import { dexp, dhypot } from '../core/dmath';
import type { Vec2 } from '../core/exact';
import { nearestPlayer, spawnEnemy } from './ai';
import { standing } from './combat';
import type { EnemyDef } from './defs';
import { isClear, randomFloorPoint } from './room';
import type { StopKind } from './run';
import { SCALING } from './tuning';
import type { Enemy, World } from './types';

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
  /** The slot of the player it is flying to, or -1 while it lies on the floor. */
  homing: number;
}

export type FlowPhase = 'fight' | 'cleared';

export interface RoomFlow {
  /** What the chamber is for (run.ts). An ordinary fight unless the route says otherwise. */
  kind: StopKind;
  phase: FlowPhase;
  /** Waves sent so far, and in total. */
  wave: number;
  waves: number;
  waveTimer: number;
  /** Threat points each wave may spend. */
  budget: number;
  pickups: Pickup[];
  /** Seconds since the chamber was cleared. */
  clearedFor: number;
  /** Chimes paid for clearing. */
  clearBonus: number;
}

export const MAGNET_RADIUS = 2.4;
export const COLLECT_RADIUS = 0.55;
const SPAWN_MIN_DIST = 4;

export function createFlow(chamber: number, players: number): RoomFlow {
  return {
    kind: 'fight',
    phase: 'fight',
    wave: 0,
    waves: chamber >= 5 ? 3 : 2,
    waveTimer: 0.9,
    budget: (3 + 0.9 * chamber) * (1 + SCALING.coopBudget * Math.max(0, players - 1)),
    pickups: [],
    clearedFor: 0,
    clearBonus: 10 + 2 * chamber,
  };
}

// ---------------------------------------------------------------- waves

/** Enemies that may appear in this chamber, in a fixed order. */
export function enemyPool(w: World): EnemyDef[] {
  return Object.values(w.content.enemies)
    .filter((d) => d.zones.includes(w.room.zone) && d.minChamber <= Math.max(1, w.chamber) && d.threat < 50)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Choose what a wave contains by spending the threat budget. Deterministic for the world's generator. */
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

/** Composition rules that keep early chambers fair. Driven by threat and counts, never by a particular enemy id. */
function allowed(w: World, d: EnemyDef, soFar: EnemyDef[]): boolean {
  const same = soFar.filter((x) => x.id === d.id).length;
  // heavy things come one at a time until late in the run
  if (d.threat >= 3 && w.chamber < 8 && same >= 1) return false;
  return same < 6;
}

/** Distance from a point to the nearest standing player (large when nobody stands). */
function playerDistance(w: World, x: number, y: number): number {
  const p = nearestPlayer(w, x, y);
  return p ? dhypot(p.x - x, p.y - y) : 99;
}

/** Spawn marks ordered farthest-first from the players, with fallbacks. */
function spawnSpots(w: World, n: number): Vec2[] {
  const marks = w.room.spawnMarks
    .map((m, i) => ({ m, i, d: playerDistance(w, m.x, m.y) }))
    .filter((s) => s.d >= SPAWN_MIN_DIST)
    .sort((a, b) => (b.d !== a.d ? b.d - a.d : a.i - b.i));
  const anchor = nearestPlayer(w, w.room.cx, w.room.cy);
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const s = marks.length ? marks[i % marks.length] : null;
    if (s) {
      const j = i >= marks.length ? 0.8 : 0.3;
      let x = s.m.x + w.rng.float(-j, j);
      let y = s.m.y + w.rng.float(-j, j);
      if (!isClear(w.room, x, y, 0.5)) {
        x = s.m.x;
        y = s.m.y;
      }
      out.push({ x, y });
    } else {
      out.push(randomFloorPoint(w.room, w.rng, 0.5, anchor ?? undefined, SPAWN_MIN_DIST));
    }
  }
  return out;
}

function sendWave(w: World): void {
  const f = w.flow;
  f.wave++;
  const defs = composeWave(w, f.budget);
  const spots = spawnSpots(w, defs.length);
  const spawned: Enemy[] = [];
  defs.forEach((d, i) => spawned.push(spawnEnemy(w, d, spots[i].x, spots[i].y)));
  w.events.push({ type: 'waveStart', wave: f.wave });
}

// ---------------------------------------------------------------- pickups

export function dropChimes(w: World, x: number, y: number, total: number): void {
  let left = Math.max(0, Math.round(total));
  while (left > 0) {
    const value = left >= 5 ? 5 : 1;
    left -= value;
    const a = w.rng.float(0, 1);
    const sp = w.rng.float(1.5, 4);
    // a direction from two exact components, so no trigonometry is needed for the scatter
    const dx = a < 0.5 ? 4 * a - 1 : 3 - 4 * a;
    const dy = a < 0.25 ? -4 * a : a < 0.75 ? 4 * a - 2 : 4 - 4 * a;
    const l = dhypot(dx, dy) || 1;
    w.flow.pickups.push({ id: w.nextId++, x, y, px: x, py: y, vx: (dx / l) * sp, vy: (dy / l) * sp, value, age: 0, homing: -1 });
  }
}

function stepPickups(w: World, dt: number): void {
  const f = w.flow;
  if (f.pickups.length === 0) return;
  let any = false;
  // once the chamber is clear, everything flies home
  const all = f.phase !== 'fight';
  for (const c of f.pickups) {
    c.px = c.x;
    c.py = c.y;
    c.age += dt;
    const p = nearestPlayer(w, c.x, c.y);
    if (!p) {
      const k = dexp(-5 * dt);
      c.vx *= k;
      c.vy *= k;
      c.homing = -1;
    } else {
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const d = dhypot(dx, dy) || 1e-6;
      if (c.age > 0.35 && (d < MAGNET_RADIUS || all)) c.homing = p.slot;
      if (c.homing >= 0) {
        const sp = 9 + c.age * 10;
        c.vx = (dx / d) * sp;
        c.vy = (dy / d) * sp;
      } else {
        const k = dexp(-5 * dt);
        c.vx *= k;
        c.vy *= k;
      }
      if (c.homing >= 0 && d < COLLECT_RADIUS) {
        // Chimes picked up by anyone are paid to every player's own purse.
        for (const q of w.players) {
          // Tithe makes a player's share bigger; the part of a Chime left over waits for the next
          q.purseFrac += c.value * q.mods.chimeMul;
          const whole = Math.floor(q.purseFrac);
          q.chimes += whole;
          q.purseFrac -= whole;
        }
        w.events.push({ type: 'chime', amount: c.value, x: p.x, y: p.y });
        c.value = 0;
        any = true;
        continue;
      }
    }
    c.x += c.vx * dt;
    c.y += c.vy * dt;
  }
  if (any) f.pickups = f.pickups.filter((c) => c.value > 0);
}

// ---------------------------------------------------------------- step

export function stepFlow(w: World, dt: number): void {
  const f = w.flow;

  // Chimes from the fallen.
  if (w.deaths.length) {
    for (const d of w.deaths) {
      const def = w.content.enemies[d.defId];
      if (def) dropChimes(w, d.x, d.y, w.rng.int(def.chimes[0], def.chimes[1]) * (d.elite ? 3 : 1));
    }
    w.deaths.length = 0;
  }
  stepPickups(w, dt);

  if (f.phase === 'fight') {
    if (!w.players.some(standing)) return;
    const alive = w.enemies.some((e) => !e.dead);
    if (alive) return;
    if (f.wave >= f.waves) {
      f.phase = 'cleared';
      f.clearedFor = 0;
      dropChimes(w, w.room.rewardSpot.x, w.room.rewardSpot.y, f.clearBonus);
      // a chamber with no waves (a camp) was never a fight, so there is nothing to announce
      if (f.waves > 0) w.events.push({ type: 'roomClear', x: w.room.rewardSpot.x, y: w.room.rewardSpot.y });
    } else {
      f.waveTimer -= dt;
      if (f.waveTimer <= 0) {
        sendWave(w);
        f.waveTimer = 1.1;
      }
    }
  } else {
    f.clearedFor += dt;
  }
}
