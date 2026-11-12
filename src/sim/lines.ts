// Running the Line: stakes, the lines between them, ripeness, trips, whip sweeps, the Plot,
// and hostile geometry. This is the game's signature mechanic and every rule in it is tested.
//
// THE RULES (frozen; DESIGN.md section 2 says the same in prose)
//
// Stakes   Each is held, planted, flying or lost. E plants a held stake at the player's feet;
//          with none held, E relocates the OLDEST planted stake to the player (a whip).
// Links    Planted stakes link as a ring in plant order (three stakes: every pair). A link is an
//          active line while both ends are planted, at most `linkRange` apart, and not severed.
// Clock    A line's clock runs while it is active. It restarts whenever either end is planted or
//          relocated, when the line discharges, when it is severed, and while it is out of range.
//          At `ripenTime` the line turns ripe.
// Trip     An enemy that comes into contact with an active line is hit. Trips are edge-triggered
//          (staying on a line does not re-trip), locked out per enemy per line for 1 s, and
//          limited per enemy across all lines to one per 0.3 s. A ripe line discharges into every
//          enemy that trips it on that tick, then restarts its clock.
// Relocate One primitive moves a stake (whip, yank, shove, offset, swap). Its sweep resolves at
//          take-off: for every active line attached to the stake, the triangle (far end, old
//          position, destination). Each enemy touching the swept area is hit once, by a ripe line
//          if one covers it. Sweeps smaller than `minSweepArea` in total hit nothing. The flight
//          is presentation; each hit lands when the moving line would pass over its target.
// Plot     Exists when the ring is closed (three or more stakes, every link active, not
//          self-crossing) with area of at least `minPlotArea`.
// Hammer   Makes every active line attached to one stake ripe at once; per-stake cooldown.
// Refund   Dashing across the interior of an own line that existed when the dash began refunds
//          the charge: once per dash, once per `refundCooldown`.
// Hostile  Enemy geometry lives in explicit groups, never linked to the player's stakes. The
//          player is hurt on crossing a hostile line; sweeps destroy hostile stakes they cover.
//
// The preview the player sees is `previewSweep`, which calls the same `computeSweep` that
// `relocateStake` resolves hits with, so the preview can never disagree with the outcome.
import { circleTouchesSegment, circleTouchesTri, pointInPoly, pointInTri, polyArea, segSegT, triArea } from '../core/geom';
import type { Vec2 } from '../core/math';
import { damageEnemy, damagePlayer, stunEnemy } from './combat';
import { clampToFloor } from './room';
import { DASH, FEEL, LINES } from './tuning';
import type { Enemy, RelocateCause, World } from './types';

// ---------------------------------------------------------------- state

export type StakeState = 'held' | 'planted' | 'flying' | 'lost';

export interface Stake {
  id: number;
  state: StakeState;
  x: number;
  y: number;
  /** Tick at which it was last planted or landed; orders the ring and decides which stake is oldest. */
  plantTick: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  flightT: number;
  flightDur: number;
  flightCause: RelocateCause;
  /** Seconds until a lost stake returns to hand. */
  lostT: number;
  /** Seconds until this stake may be hammered again. */
  hammerT: number;
  /** 0..1: how close an enemy is to taking this stake. Presentation reads it. */
  threat: number;
  /** The Head mounted on this stake and its rank, or null. Set by the kit. */
  head: string | null;
  headRank: number;
  /** Cannot be eaten or shoved. Set by the kit. */
  anchored: boolean;
}

export interface Line {
  /** Stake ids, a < b. */
  a: number;
  b: number;
  /** Part of the ring right now. */
  linked: boolean;
  /** Linked, in range and not severed: this line can hit things. */
  active: boolean;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Seconds of ripening so far. */
  clock: number;
  ripe: boolean;
  /** Seconds left of being severed. */
  severedT: number;
  // --- annotations written by the kit whenever heads change
  /** Seconds this line needs to ripen. */
  ripenTime: number;
  /** Added to the line's damage. */
  bonus: number;
  /** Cannot be severed. */
  unseverable: boolean;
  /** Reflects enemy projectiles, dealing this much (0 = does not reflect). */
  reflect: number;
  /** Splice on this edge, or null. */
  splice: string | null;
}

export interface Plot {
  /** x0, y0, x1, y1, ... in ring order. */
  pts: number[];
  area: number;
  cx: number;
  cy: number;
}

interface PendingHit {
  enemy: number;
  delay: number;
  ripe: boolean;
  pair: number;
  dx: number;
  dy: number;
  scale: number;
}

export interface HostileStake {
  id: number;
  x: number;
  y: number;
  plantTick: number;
}

export interface HostileGroup {
  id: number;
  /** Enemy id that owns the group; the group dies with it. 0 = owned by nobody (bosses manage their own). */
  owner: number;
  /** 'claim': planted stakes linked as a ring. 'chain': one line between two enemies. */
  kind: 'claim' | 'chain';
  stakes: HostileStake[];
  /** For a chain: the two enemy ids. */
  a: number;
  b: number;
  damage: number;
  /** Severs the player's unripe lines where it crosses them. */
  severs: boolean;
  /** The player cannot be hurt by this group again before this time. */
  lockUntil: number;
  dead: boolean;
}

/** Rule values the kit can change. */
export interface LineRules {
  stakeCount: number;
  linkRange: number;
  ripenTime: number;
  lineDamage: number;
  ripeDamage: number;
  stun: number;
  lostTime: number;
  severMul: number;
  /** Multiplier on whip damage. May depend on the Plot; the kit recomputes it. */
  whipMul: number;
}

export interface LinesState {
  stakes: Stake[];
  /** Every pair of stakes, indexed by pairIndex. Unused pairs stay unlinked. */
  lines: Line[];
  plot: Plot | null;
  whipLock: number;
  pending: PendingHit[];
  /** key: enemy id * 16 + pair index */
  contact: Map<number, { touching: boolean; lockUntil: number }>;
  /** Lines (by pair index) that were active when the current dash began. */
  dashLines: number[];
  dashRefunded: boolean;
  lastRefundAt: number;
  whipCount: number;
  hostile: HostileGroup[];
  rules: LineRules;
}

/** Things the line step reports to the upgrade kit. The kit installs these; with none installed the base rules apply. */
export interface LineHooks {
  /** A line hit an enemy (trip or sweep). Called after the damage. */
  onLineHit?(w: World, e: Enemy, line: Line, ripe: boolean, cause: 'trip' | 'sweep'): void;
  onRipen?(w: World, line: Line): void;
  onDischarge?(w: World, line: Line, cause: 'trip' | 'sweep' | 'effect'): void;
  onPlant?(w: World, stake: Stake): void;
  onLand?(w: World, stake: Stake, cause: RelocateCause): void;
  onWhip?(w: World, sweep: Sweep): void;
  onHammer?(w: World, stake: Stake): void;
  /** The player dashed across one of their own lines. Return true if the hook spent the line. */
  onDashCross?(w: World, line: Line): boolean;
}

let hooks: LineHooks = {};

/** Install (or clear) the kit's hooks. Module-level because hooks are behaviour, not state. */
export function setLineHooks(h: LineHooks): void {
  hooks = h;
}

export const MAX_STAKES = 4;
export const pairIndex = (a: number, b: number): number => (a < b ? a * MAX_STAKES + b : b * MAX_STAKES + a);

export function defaultRules(): LineRules {
  return {
    stakeCount: LINES.stakes,
    linkRange: LINES.linkRange,
    ripenTime: LINES.ripeTime,
    lineDamage: LINES.damage,
    ripeDamage: LINES.ripeDamage,
    stun: LINES.stun,
    lostTime: LINES.lostTime,
    severMul: 1,
    whipMul: 1,
  };
}

function newStake(id: number): Stake {
  return {
    id, state: 'held', x: 0, y: 0, plantTick: -1,
    fromX: 0, fromY: 0, toX: 0, toY: 0, flightT: 0, flightDur: 0, flightCause: 'whip',
    lostT: 0, hammerT: 0, threat: 0, head: null, headRank: 0, anchored: false,
  };
}

function newLine(a: number, b: number, rules: LineRules): Line {
  return {
    a, b, linked: false, active: false, ax: 0, ay: 0, bx: 0, by: 0, clock: 0, ripe: false, severedT: 0,
    ripenTime: rules.ripenTime, bonus: 0, unseverable: false, reflect: 0, splice: null,
  };
}

export function createLines(rules: LineRules = defaultRules()): LinesState {
  const stakes: Stake[] = [];
  for (let i = 0; i < rules.stakeCount; i++) stakes.push(newStake(i));
  const lines: Line[] = [];
  for (let i = 0; i < MAX_STAKES * MAX_STAKES; i++) lines.push(newLine(Math.floor(i / MAX_STAKES), i % MAX_STAKES, rules));
  return {
    stakes, lines, plot: null, whipLock: 0, pending: [], contact: new Map(), dashLines: [], dashRefunded: false,
    lastRefundAt: -99, whipCount: 0, hostile: [], rules,
  };
}

/** Change the number of stakes carried (Fourth Stake). New stakes arrive in hand. */
export function setStakeCount(L: LinesState, n: number): void {
  const count = Math.max(1, Math.min(MAX_STAKES, n));
  while (L.stakes.length < count) L.stakes.push(newStake(L.stakes.length));
  if (L.stakes.length > count) L.stakes.length = count;
  L.rules.stakeCount = count;
}

// ---------------------------------------------------------------- queries

export function plantedInOrder(L: LinesState): Stake[] {
  return L.stakes.filter((s) => s.state === 'planted').sort((p, q) => p.plantTick - q.plantTick || p.id - q.id);
}

export const heldStake = (L: LinesState): Stake | undefined => L.stakes.find((s) => s.state === 'held');
export const anyFlying = (L: LinesState): boolean => L.stakes.some((s) => s.state === 'flying');
export const oldestPlanted = (L: LinesState): Stake | undefined => plantedInOrder(L)[0];
export const activeLines = (L: LinesState): Line[] => L.lines.filter((l) => l.active);

export function linesOfStake(L: LinesState, id: number): Line[] {
  return L.lines.filter((l) => l.linked && (l.a === id || l.b === id));
}

export function inPlot(L: LinesState, x: number, y: number): boolean {
  return !!L.plot && pointInPoly(x, y, L.plot.pts);
}

/** The planted stake nearest to a point within `maxDist`, or undefined. */
export function nearestPlanted(L: LinesState, x: number, y: number, maxDist = Infinity): Stake | undefined {
  let best: Stake | undefined;
  let bd = maxDist;
  for (const s of L.stakes) {
    if (s.state !== 'planted') continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

export const lostCount = (L: LinesState): number => L.stakes.filter((s) => s.state === 'lost').length;

// ---------------------------------------------------------------- topology

function simpleQuad(p: Stake[]): boolean {
  // A four-stake ring is a Plot only if its opposite edges do not cross.
  return (
    segSegT(p[0].x, p[0].y, p[1].x, p[1].y, p[2].x, p[2].y, p[3].x, p[3].y) < 0 &&
    segSegT(p[1].x, p[1].y, p[2].x, p[2].y, p[3].x, p[3].y, p[0].x, p[0].y) < 0
  );
}

/** Recompute which pairs are linked, endpoint positions, activity and the Plot. Never touches clocks of lines that stay linked. */
export function refreshTopology(w: World): void {
  const L = w.lines;
  const planted = plantedInOrder(L);
  const linkedNow = new Set<number>();
  if (planted.length === 2) linkedNow.add(pairIndex(planted[0].id, planted[1].id));
  else if (planted.length >= 3) {
    for (let i = 0; i < planted.length; i++) linkedNow.add(pairIndex(planted[i].id, planted[(i + 1) % planted.length].id));
  }
  for (let i = 0; i < L.lines.length; i++) {
    const l = L.lines[i];
    const was = l.linked;
    l.linked = linkedNow.has(i);
    if (!l.linked) {
      if (was && l.ripe) l.ripe = false;
      l.active = false;
      l.clock = 0;
      l.ripe = false;
      continue;
    }
    const sa = L.stakes[l.a];
    const sb = L.stakes[l.b];
    l.ax = sa.x;
    l.ay = sa.y;
    l.bx = sb.x;
    l.by = sb.y;
    const inRange = Math.hypot(sb.x - sa.x, sb.y - sa.y) <= L.rules.linkRange;
    const active = inRange && l.severedT <= 0;
    if (!inRange) {
      l.clock = 0;
      l.ripe = false;
    }
    l.active = active;
  }

  const hadPlot = !!L.plot;
  L.plot = null;
  if (planted.length >= 3) {
    let closed = true;
    for (let i = 0; i < planted.length; i++) {
      if (!L.lines[pairIndex(planted[i].id, planted[(i + 1) % planted.length].id)].active) closed = false;
    }
    if (closed && (planted.length < 4 || simpleQuad(planted))) {
      const pts: number[] = [];
      let cx = 0;
      let cy = 0;
      for (const s of planted) {
        pts.push(s.x, s.y);
        cx += s.x;
        cy += s.y;
      }
      const area = polyArea(pts);
      if (area >= LINES.minPlotArea) L.plot = { pts, area, cx: cx / planted.length, cy: cy / planted.length };
    }
  }
  if (hadPlot !== !!L.plot) w.events.push({ type: 'plotChange', formed: !!L.plot });
}

/** After a stake arrives, enemies already standing on its new lines count as touching, so the lines do not trip them on arrival. */
function primeContacts(w: World, stakeId: number): void {
  const L = w.lines;
  for (let i = 0; i < L.lines.length; i++) {
    const l = L.lines[i];
    if (!l.linked || (l.a !== stakeId && l.b !== stakeId)) continue;
    l.clock = 0;
    l.ripe = false;
    for (const e of w.enemies) {
      if (e.dead) continue;
      const key = e.id * 16 + i;
      const touching = l.active && circleTouchesSegment(e.x, e.y, e.radius, l.ax, l.ay, l.bx, l.by);
      const rec = L.contact.get(key);
      if (rec) rec.touching = touching;
      else if (touching) L.contact.set(key, { touching: true, lockUntil: 0 });
    }
  }
}

// ---------------------------------------------------------------- hits

function lineDamage(w: World, line: Line, ripe: boolean, e: Enemy): number {
  const r = w.lines.rules;
  const base = (ripe ? r.ripeDamage : r.lineDamage) + line.bonus;
  return base * (1 + e.status.zoneLineBonus);
}

/** Apply one line hit to an enemy, with stun and hooks. `scale` multiplies the damage (whips, second sweeps). */
function applyLineHit(w: World, e: Enemy, line: Line, ripe: boolean, cause: 'trip' | 'sweep', dx: number, dy: number, scale: number): void {
  if (e.dead) return;
  // Sealed things shrug off unripe lines entirely.
  if (!ripe && e.elite === 'sealed') return;
  const dmg = lineDamage(w, line, ripe, e) * scale;
  const killed = damageEnemy(w, e, dmg, { kind: ripe ? 'discharge' : 'line', dx, dy, knock: ripe ? 0.8 : 0.25, heavy: ripe });
  if (ripe) {
    w.stats.discharges++;
    if (!killed) stunEnemy(w, e, w.lines.rules.stun);
    w.hitstop = Math.max(w.hitstop, FEEL.hitstopDischarge);
  }
  if (cause === 'trip') w.stats.trips++;
  hooks.onLineHit?.(w, e, line, ripe, cause);
}

function discharge(w: World, line: Line, cause: 'trip' | 'sweep' | 'effect'): void {
  line.clock = 0;
  line.ripe = false;
  w.events.push({ type: 'lineDischarge', a: line.a, b: line.b, ax: line.ax, ay: line.ay, bx: line.bx, by: line.by, cause });
  hooks.onDischarge?.(w, line, cause);
}

/** Make a line ripe now (hammer, Resonance). */
export function ripenLine(w: World, line: Line): void {
  if (!line.active || line.ripe) return;
  line.clock = line.ripenTime;
  line.ripe = true;
  w.events.push({ type: 'lineRipe', a: line.a, b: line.b, ax: line.ax, ay: line.ay, bx: line.bx, by: line.by });
  hooks.onRipen?.(w, line);
}

/** Every enemy touching a line takes a hit from it now (a ripe line discharges). */
export function strikeAlongLine(w: World, line: Line): void {
  if (!line.active) return;
  const ripe = line.ripe;
  const nx = -(line.by - line.ay);
  const ny = line.bx - line.ax;
  const nl = Math.hypot(nx, ny) || 1;
  let any = false;
  for (const e of w.enemies.slice()) {
    if (e.dead || e.state === 'spawn' || e.burrowed || e.airborne) continue;
    if (!circleTouchesSegment(e.x, e.y, e.radius, line.ax, line.ay, line.bx, line.by)) continue;
    const side = (e.x - line.ax) * nx + (e.y - line.ay) * ny >= 0 ? 1 : -1;
    applyLineHit(w, e, line, ripe, 'sweep', (nx / nl) * side, (ny / nl) * side, 1);
    any = true;
  }
  if (ripe && any) discharge(w, line, 'effect');
}

/** Hit whatever stands in an earlier sweep's triangles again, at reduced strength, as unripe hits. */
export function sweepAgain(w: World, sweep: Sweep, scale: number): void {
  const mx = sweep.toX - sweep.fromX;
  const my = sweep.toY - sweep.fromY;
  const ml = Math.hypot(mx, my) || 1;
  for (const e of w.enemies.slice()) {
    if (e.dead || e.state === 'spawn' || e.burrowed || e.airborne) continue;
    for (const t of sweep.tris) {
      if (!circleTouchesTri(e.x, e.y, e.radius, t.sx, t.sy, sweep.fromX, sweep.fromY, sweep.toX, sweep.toY)) continue;
      applyLineHit(w, e, w.lines.lines[t.pair], false, 'sweep', mx / ml, my / ml, scale);
      break;
    }
  }
  w.events.push({
    type: 'whip', stake: sweep.stake, cause: 'whip', fromX: sweep.fromX, fromY: sweep.fromY, toX: sweep.toX, toY: sweep.toY, dur: 0,
    tris: sweep.tris.map((t) => [t.sx, t.sy, 0]), live: true, hits: 0,
  });
}

/** Spend a ripe line on one enemy, wherever it stands (Dead Reckoning, Slingshot). */
export function dischargeOn(w: World, line: Line, e: Enemy): void {
  if (!line.ripe) return;
  const dx = e.x - (line.ax + line.bx) / 2;
  const dy = e.y - (line.ay + line.by) / 2;
  const d = Math.hypot(dx, dy) || 1;
  applyLineHit(w, e, line, true, 'sweep', dx / d, dy / d, 1);
  discharge(w, line, 'effect');
}

// ---------------------------------------------------------------- sweeps

export interface SweepTri {
  pair: number;
  /** The line's far end: the triangle is (far, from, to). */
  sx: number;
  sy: number;
  ripe: boolean;
}

export interface SweepHit {
  enemy: Enemy;
  ripe: boolean;
  pair: number;
  /** 0..1: when during the flight the line passes over the enemy. */
  u: number;
}

export interface Sweep {
  stake: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  tris: SweepTri[];
  area: number;
  /** False when the total area is under the minimum: nothing is hit. */
  live: boolean;
  hits: SweepHit[];
  /** Burrowed enemies under the sweep: they are surfaced, not hit. */
  surfaced: Enemy[];
  /** Hostile stakes inside the sweep, as [group id, stake id]. */
  hostile: Array<[number, number]>;
}

/**
 * What relocating a stake to (toX, toY) would sweep and hit, right now. Pure: changes nothing.
 * The preview and the real resolution both call this.
 */
export function computeSweep(w: World, stakeId: number, toX: number, toY: number): Sweep {
  const L = w.lines;
  const st = L.stakes[stakeId];
  const sweep: Sweep = { stake: stakeId, fromX: st.x, fromY: st.y, toX, toY, tris: [], area: 0, live: false, hits: [], surfaced: [], hostile: [] };
  if (st.state !== 'planted') return sweep;
  for (let i = 0; i < L.lines.length; i++) {
    const l = L.lines[i];
    if (!l.active || (l.a !== stakeId && l.b !== stakeId)) continue;
    const far = L.stakes[l.a === stakeId ? l.b : l.a];
    sweep.tris.push({ pair: i, sx: far.x, sy: far.y, ripe: l.ripe });
    sweep.area += triArea(far.x, far.y, st.x, st.y, toX, toY);
  }
  sweep.live = sweep.tris.length > 0 && sweep.area >= LINES.minSweepArea;
  if (!sweep.live) return sweep;

  const mx = toX - st.x;
  const my = toY - st.y;
  for (const e of w.enemies) {
    if (e.dead || e.state === 'spawn' || e.airborne) continue;
    let best: SweepTri | null = null;
    for (const t of sweep.tris) {
      if (!circleTouchesTri(e.x, e.y, e.radius, t.sx, t.sy, st.x, st.y, toX, toY)) continue;
      if (!best || (t.ripe && !best.ripe)) best = t;
    }
    if (!best) continue;
    if (e.burrowed) {
      sweep.surfaced.push(e);
      continue;
    }
    // Fraction of the flight at which the line (far -> moving stake) passes over the enemy's centre.
    const ex = e.x - best.sx;
    const ey = e.y - best.sy;
    const den = mx * ey - my * ex;
    let u = Math.abs(den) < 1e-9 ? 0.5 : -((st.x - best.sx) * ey - (st.y - best.sy) * ex) / den;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    sweep.hits.push({ enemy: e, ripe: best.ripe, pair: best.pair, u });
  }
  for (const g of L.hostile) {
    if (g.dead || g.kind !== 'claim') continue;
    for (const hs of g.stakes) {
      for (const t of sweep.tris) {
        if (pointInTri(hs.x, hs.y, t.sx, t.sy, st.x, st.y, toX, toY)) {
          sweep.hostile.push([g.id, hs.id]);
          break;
        }
      }
    }
  }
  return sweep;
}

/** Where a stake may stand: on the floor, and not on top of another stake. */
function legalSpot(w: World, x: number, y: number, self: number, out: Vec2): Vec2 {
  clampToFloor(w.room, x, y, 0.12, out);
  for (const s of w.lines.stakes) {
    if (s.id === self || s.state !== 'planted') continue;
    let dx = out.x - s.x;
    let dy = out.y - s.y;
    const d = Math.hypot(dx, dy);
    if (d >= LINES.minSpacing) continue;
    if (d < 1e-6) {
      dx = 1;
      dy = 0;
    } else {
      dx /= d;
      dy /= d;
    }
    clampToFloor(w.room, s.x + dx * LINES.minSpacing, s.y + dy * LINES.minSpacing, 0.12, out);
  }
  return out;
}

const spot: Vec2 = { x: 0, y: 0 };

/**
 * Move a planted stake to a new place. The sweep resolves now; the stake flies for `dur`
 * seconds and then lands as the newest stake. Returns the sweep (empty if the stake could not move).
 */
export function relocateStake(w: World, stakeId: number, toX: number, toY: number, cause: RelocateCause, dur = LINES.whipTime, damageScale = 1): Sweep {
  const L = w.lines;
  const st = L.stakes[stakeId];
  legalSpot(w, toX, toY, stakeId, spot);
  const sweep = computeSweep(w, stakeId, spot.x, spot.y);
  if (st.state !== 'planted') return sweep;

  const scale = damageScale * (cause === 'whip' || cause === 'yank' || cause === 'offset' || cause === 'swap' ? L.rules.whipMul : 1);
  const mx = sweep.toX - sweep.fromX;
  const my = sweep.toY - sweep.fromY;
  const ml = Math.hypot(mx, my) || 1;
  if (sweep.live) {
    const spent = new Set<number>();
    for (const h of sweep.hits) {
      L.pending.push({ enemy: h.enemy.id, delay: h.u * dur, ripe: h.ripe, pair: h.pair, dx: mx / ml, dy: my / ml, scale });
      if (h.ripe) spent.add(h.pair);
    }
    // A ripe line that swept is spent whether or not it caught anything: holding ripeness means not moving.
    for (const t of sweep.tris) if (t.ripe) spent.add(t.pair);
    for (const pair of spent) discharge(w, L.lines[pair], 'sweep');
    for (const e of sweep.surfaced) surfaceEnemy(w, e);
    for (const [gid, sid] of sweep.hostile) breakHostileStake(w, gid, sid);
  }

  st.state = 'flying';
  st.fromX = st.x;
  st.fromY = st.y;
  st.toX = sweep.toX;
  st.toY = sweep.toY;
  st.flightT = 0;
  st.flightDur = Math.max(0.0001, dur);
  st.flightCause = cause;
  st.threat = 0;
  if (cause === 'whip' || cause === 'yank' || cause === 'offset' || cause === 'swap') {
    L.whipCount++;
    w.stats.whips++;
  }
  w.events.push({
    type: 'whip', stake: stakeId, cause, fromX: sweep.fromX, fromY: sweep.fromY, toX: sweep.toX, toY: sweep.toY, dur,
    tris: sweep.tris.map((t) => [t.sx, t.sy, t.ripe ? 1 : 0]), live: sweep.live, hits: sweep.live ? sweep.hits.length : 0,
  });
  refreshTopology(w);
  hooks.onWhip?.(w, sweep);
  return sweep;
}

/** Pull a burrowed enemy out of the ground, stunned. */
export function surfaceEnemy(w: World, e: Enemy): void {
  if (!e.burrowed || e.dead) return;
  e.burrowed = false;
  w.events.push({ type: 'enemySurface', id: e.id, x: e.x, y: e.y });
  e.stunImmune = 0;
  stunEnemy(w, e, 1.5);
}

// ---------------------------------------------------------------- the stake key

export type StakePress = 'planted' | 'whipped' | 'wait' | 'refused';

/** What pressing E does right now. `wait` means "keep the press buffered". */
export function pressStake(w: World): StakePress {
  const L = w.lines;
  const p = w.player;
  if (anyFlying(L) || L.whipLock > 0) return 'wait';
  const held = heldStake(L);
  if (held) {
    legalSpot(w, p.x, p.y, held.id, spot);
    held.state = 'planted';
    held.x = spot.x;
    held.y = spot.y;
    held.plantTick = w.tick;
    held.threat = 0;
    refreshTopology(w);
    primeContacts(w, held.id);
    w.events.push({ type: 'stakePlant', stake: held.id, x: held.x, y: held.y });
    hooks.onPlant?.(w, held);
    return 'planted';
  }
  const oldest = oldestPlanted(L);
  if (!oldest) return 'refused';
  relocateStake(w, oldest.id, p.x, p.y, 'whip');
  return 'whipped';
}

/** What E would sweep if pressed now, or null when E would plant (or do nothing). */
export function previewSweep(w: World): Sweep | null {
  const L = w.lines;
  if (heldStake(L) || anyFlying(L)) return null;
  const oldest = oldestPlanted(L);
  if (!oldest) return null;
  legalSpot(w, w.player.x, w.player.y, oldest.id, spot);
  return computeSweep(w, oldest.id, spot.x, spot.y);
}

/** The Rod's third swing struck this stake: its active lines turn ripe. Returns false if it is on cooldown. */
export function hammerStake(w: World, stakeId: number): boolean {
  const L = w.lines;
  const st = L.stakes[stakeId];
  if (st.state !== 'planted' || st.hammerT > 0) return false;
  st.hammerT = LINES.hammerCooldown;
  for (const l of linesOfStake(L, stakeId)) ripenLine(w, l);
  w.events.push({ type: 'hammer', stake: stakeId, x: st.x, y: st.y });
  hooks.onHammer?.(w, st);
  return true;
}

/** Sever a line for a while (already-severed lines are not extended). Returns true if it was cut. */
export function severLine(w: World, line: Line, seconds: number): boolean {
  if (!line.active || line.unseverable || line.severedT > 0) return false;
  line.severedT = seconds * w.lines.rules.severMul;
  line.clock = 0;
  line.ripe = false;
  line.active = false;
  w.events.push({ type: 'lineSever', a: line.a, b: line.b, x: (line.ax + line.bx) / 2, y: (line.ay + line.by) / 2, seconds: line.severedT });
  refreshTopology(w);
  return true;
}

/** An enemy takes a stake away for a while. Only one stake may be lost at a time. Returns true if it was taken. */
export function loseStake(w: World, stakeId: number): boolean {
  const L = w.lines;
  const st = L.stakes[stakeId];
  if (st.state !== 'planted' || st.anchored || lostCount(L) > 0) return false;
  st.state = 'lost';
  st.lostT = L.rules.lostTime;
  st.threat = 0;
  w.events.push({ type: 'stakeLost', stake: stakeId, x: st.x, y: st.y, seconds: st.lostT });
  refreshTopology(w);
  return true;
}

/** Bring every stake back to hand (leaving a room). */
export function returnStakes(w: World): void {
  const L = w.lines;
  for (const s of L.stakes) {
    s.state = 'held';
    s.plantTick = -1;
    s.threat = 0;
    s.hammerT = 0;
  }
  L.pending.length = 0;
  L.contact.clear();
  L.whipLock = 0;
  for (const l of L.lines) {
    l.severedT = 0;
    l.clock = 0;
    l.ripe = false;
  }
  refreshTopology(w);
}

// ---------------------------------------------------------------- dash refund

/** Call when a dash begins: remembers which lines exist, so only those can refund it. */
export function beginDash(w: World): void {
  const L = w.lines;
  L.dashLines.length = 0;
  L.dashRefunded = false;
  for (let i = 0; i < L.lines.length; i++) if (L.lines[i].active) L.dashLines.push(i);
}

/** Call each dash tick with the segment just travelled. Refunds a charge on a clean crossing of an own line. */
export function dashCrossing(w: World, x0: number, y0: number, x1: number, y1: number): void {
  const L = w.lines;
  const p = w.player;
  for (const i of L.dashLines) {
    const l = L.lines[i];
    if (!l.active) continue;
    // A proper crossing: through the interior of the line, not grazing an end.
    const t = segSegT(l.ax, l.ay, l.bx, l.by, x0, y0, x1, y1);
    if (t < 0.04 || t > 0.96) continue;
    const spent = hooks.onDashCross?.(w, l) ?? false;
    if (spent) continue;
    if (L.dashRefunded || w.time - L.lastRefundAt < DASH.refundCooldown || p.dashCharges >= p.dashMaxCharges) continue;
    L.dashRefunded = true;
    L.lastRefundAt = w.time;
    p.dashCharges += 1;
    w.events.push({ type: 'dashRefund', x: p.x, y: p.y });
  }
}

// ---------------------------------------------------------------- hostile geometry

export function hostileStakeCount(L: LinesState): number {
  let n = 0;
  for (const g of L.hostile) if (!g.dead && g.kind === 'claim') n += g.stakes.length;
  return n;
}

export function addHostileClaim(w: World, owner: number, damage = LINES.hostileDamage): HostileGroup {
  const g: HostileGroup = { id: w.nextId++, owner, kind: 'claim', stakes: [], a: 0, b: 0, damage, severs: false, lockUntil: 0, dead: false };
  w.lines.hostile.push(g);
  return g;
}

/** A chain between two enemies: hurts on crossing, and cuts the player's unripe lines. */
export function addHostileChain(w: World, a: number, b: number, damage = LINES.hostileDamage): HostileGroup {
  const g: HostileGroup = { id: w.nextId++, owner: 0, kind: 'chain', stakes: [], a, b, damage, severs: true, lockUntil: 0, dead: false };
  w.lines.hostile.push(g);
  return g;
}

/** Plant a hostile stake in a claim. Returns null when the room's cap is reached (bosses pass ignoreCap). */
export function plantHostileStake(w: World, g: HostileGroup, x: number, y: number, ignoreCap = false): HostileStake | null {
  if (g.dead || g.kind !== 'claim') return null;
  if (!ignoreCap && hostileStakeCount(w.lines) >= LINES.hostileCap) return null;
  clampToFloor(w.room, x, y, 0.12, spot);
  const hs: HostileStake = { id: w.nextId++, x: spot.x, y: spot.y, plantTick: w.tick };
  g.stakes.push(hs);
  w.events.push({ type: 'hostilePlant', group: g.id, x: hs.x, y: hs.y });
  return hs;
}

export function breakHostileStake(w: World, groupId: number, stakeId: number): boolean {
  const g = w.lines.hostile.find((h) => h.id === groupId);
  if (!g) return false;
  const i = g.stakes.findIndex((s) => s.id === stakeId);
  if (i < 0) return false;
  const hs = g.stakes[i];
  g.stakes.splice(i, 1);
  w.events.push({ type: 'hostileBreak', group: g.id, x: hs.x, y: hs.y });
  return true;
}

/** Destroy hostile stakes within r of a point (the Rod, the Plumb Shot). Returns how many broke. */
export function breakHostileNear(w: World, x: number, y: number, r: number): number {
  let n = 0;
  for (const g of w.lines.hostile) {
    if (g.dead || g.kind !== 'claim') continue;
    for (let i = g.stakes.length - 1; i >= 0; i--) {
      const hs = g.stakes[i];
      if (Math.hypot(hs.x - x, hs.y - y) <= r) {
        g.stakes.splice(i, 1);
        w.events.push({ type: 'hostileBreak', group: g.id, x: hs.x, y: hs.y });
        n++;
      }
    }
  }
  return n;
}

/** The segments of a hostile group right now, as [ax, ay, bx, by] each. */
export function hostileSegments(w: World, g: HostileGroup, out: number[][] = []): number[][] {
  out.length = 0;
  if (g.dead) return out;
  if (g.kind === 'chain') {
    const ea = w.enemies.find((e) => e.id === g.a && !e.dead);
    const eb = w.enemies.find((e) => e.id === g.b && !e.dead);
    if (ea && eb) out.push([ea.x, ea.y, eb.x, eb.y]);
    return out;
  }
  const s = g.stakes;
  if (s.length === 2) out.push([s[0].x, s[0].y, s[1].x, s[1].y]);
  else if (s.length >= 3) for (let i = 0; i < s.length; i++) out.push([s[i].x, s[i].y, s[(i + 1) % s.length].x, s[(i + 1) % s.length].y]);
  return out;
}

const segs: number[][] = [];

function stepHostile(w: World): void {
  const L = w.lines;
  const p = w.player;
  let anyDead = false;
  for (const g of L.hostile) {
    if (g.dead) {
      anyDead = true;
      continue;
    }
    if (g.kind === 'chain') {
      const alive = w.enemies.filter((e) => !e.dead && (e.id === g.a || e.id === g.b)).length;
      if (alive < 2) g.dead = true;
    } else if (g.owner !== 0 && !w.enemies.some((e) => e.id === g.owner && !e.dead)) {
      g.dead = true;
    }
    if (g.dead) {
      for (const hs of g.stakes) w.events.push({ type: 'hostileBreak', group: g.id, x: hs.x, y: hs.y });
      g.stakes.length = 0;
      anyDead = true;
      continue;
    }
    hostileSegments(w, g, segs);
    for (const s of segs) {
      // The player is hurt on crossing, unless dashing through.
      if (p.state !== 'dead' && p.iframes <= 0 && w.time >= g.lockUntil && (p.px !== p.x || p.py !== p.y)) {
        if (segSegT(s[0], s[1], s[2], s[3], p.px, p.py, p.x, p.y) >= 0) {
          g.lockUntil = w.time + LINES.hostileLockout;
          const mx = (s[0] + s[2]) / 2;
          const my = (s[1] + s[3]) / 2;
          w.events.push({ type: 'hostileCross', group: g.id, x: p.x, y: p.y });
          damagePlayer(w, g.damage, mx, my, 1.5);
        }
      }
      if (g.severs) {
        for (const l of L.lines) {
          if (!l.active || l.ripe) continue;
          if (segSegT(s[0], s[1], s[2], s[3], l.ax, l.ay, l.bx, l.by) >= 0) severLine(w, l, 2);
        }
      }
    }
  }
  if (anyDead) L.hostile = L.hostile.filter((g) => !g.dead);
}

// ---------------------------------------------------------------- step

export function stepLines(w: World, dt: number): void {
  const L = w.lines;
  if (L.whipLock > 0) L.whipLock = Math.max(0, L.whipLock - dt);

  // Stakes: flights, cooldowns, returns.
  let landed = false;
  for (const s of L.stakes) {
    if (s.hammerT > 0) s.hammerT = Math.max(0, s.hammerT - dt);
    if (s.state === 'flying') {
      s.flightT += dt;
      const k = Math.min(1, s.flightT / s.flightDur);
      s.x = s.fromX + (s.toX - s.fromX) * k;
      s.y = s.fromY + (s.toY - s.fromY) * k;
      if (k >= 1) {
        s.state = 'planted';
        s.plantTick = w.tick;
        landed = true;
        refreshTopology(w);
        primeContacts(w, s.id);
        if (s.flightCause !== 'shove') L.whipLock = LINES.whipLock;
        w.events.push({ type: 'stakeLand', stake: s.id, x: s.x, y: s.y, cause: s.flightCause });
        hooks.onLand?.(w, s, s.flightCause);
      }
    } else if (s.state === 'lost') {
      s.lostT -= dt;
      if (s.lostT <= 0) {
        s.state = 'held';
        s.plantTick = -1;
        w.events.push({ type: 'stakeReturn', stake: s.id });
      }
    }
  }
  if (!landed) refreshTopology(w);

  // Sweep hits arrive as the moving line passes.
  if (L.pending.length) {
    for (const h of L.pending) h.delay -= dt;
    const due = L.pending.filter((h) => h.delay <= 0);
    if (due.length) {
      L.pending = L.pending.filter((h) => h.delay > 0);
      due.sort((p, q) => p.enemy - q.enemy);
      for (const h of due) {
        const e = w.enemies.find((x) => x.id === h.enemy);
        if (e && !e.dead) applyLineHit(w, e, L.lines[h.pair], h.ripe, 'sweep', h.dx, h.dy, h.scale);
      }
    }
  }

  // Clocks and mends.
  for (const l of L.lines) {
    if (l.severedT > 0) {
      l.severedT -= dt;
      if (l.severedT <= 0) {
        l.severedT = 0;
        l.clock = 0;
        if (l.linked) w.events.push({ type: 'lineMend', a: l.a, b: l.b });
        refreshTopology(w);
      }
    }
    if (!l.active) continue;
    l.clock += dt;
    if (!l.ripe && l.clock >= l.ripenTime) {
      l.ripe = true;
      w.events.push({ type: 'lineRipe', a: l.a, b: l.b, ax: l.ax, ay: l.ay, bx: l.bx, by: l.by });
      hooks.onRipen?.(w, l);
    }
  }

  // Trips, and the per-enemy flags the rest of the simulation reads.
  const trips: Array<{ e: Enemy; pair: number }> = [];
  for (const e of w.enemies) {
    e.onLine = false;
    e.inPlot = false;
    if (e.dead || e.state === 'spawn') continue;
    if (L.plot && !e.burrowed && pointInPoly(e.x, e.y, L.plot.pts)) e.inPlot = true;
    if (e.burrowed || e.airborne) continue;
    for (let i = 0; i < L.lines.length; i++) {
      const l = L.lines[i];
      const key = e.id * 16 + i;
      if (!l.active) {
        const rec = L.contact.get(key);
        if (rec) rec.touching = false;
        continue;
      }
      const touching =
        circleTouchesSegment(e.x, e.y, e.radius, l.ax, l.ay, l.bx, l.by) ||
        // swept, so a lunge, a drag or a knockback cannot skip over a line between ticks
        ((e.px !== e.x || e.py !== e.y) && segSegT(l.ax, l.ay, l.bx, l.by, e.px, e.py, e.x, e.y) >= 0);
      let rec = L.contact.get(key);
      if (!rec) {
        if (!touching) continue;
        rec = { touching: false, lockUntil: 0 };
        L.contact.set(key, rec);
      }
      if (touching) {
        e.onLine = true;
        if (!rec.touching && w.time >= rec.lockUntil && w.time >= e.tripUntil) {
          rec.lockUntil = w.time + LINES.tripLockout;
          e.tripUntil = w.time + LINES.tripGlobal;
          trips.push({ e, pair: i });
        }
      }
      rec.touching = touching;
    }
  }
  if (trips.length) {
    // Every enemy that tripped a ripe line on this tick takes the discharge; then the line resets.
    const spent = new Set<number>();
    for (const t of trips) {
      const l = L.lines[t.pair];
      const ripe = l.ripe;
      // push across the line, away from the side the enemy came from
      const nx = -(l.by - l.ay);
      const ny = l.bx - l.ax;
      const nl = Math.hypot(nx, ny) || 1;
      const side = (t.e.x - l.ax) * nx + (t.e.y - l.ay) * ny >= 0 ? 1 : -1;
      applyLineHit(w, t.e, l, ripe, 'trip', (nx / nl) * side, (ny / nl) * side, 1);
      if (ripe) spent.add(t.pair);
    }
    for (const pair of spent) discharge(w, L.lines[pair], 'trip');
  }

  stepHostile(w);

  // Forget contact records of enemies that are gone.
  if (w.tick % 120 === 0 && L.contact.size > 64) {
    const alive = new Set<number>();
    for (const e of w.enemies) if (!e.dead) alive.add(e.id);
    for (const key of L.contact.keys()) if (!alive.has(Math.floor(key / 16))) L.contact.delete(key);
  }
}
