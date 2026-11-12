// The Field Kit engine: turns instrument records (content) into behaviour.
//
// An instrument is data: stat mods, rule flags, Head traits, and effects bound to hooks. This
// module resolves what the player owns into rule values and per-line annotations, and runs the
// bound effects when their hooks fire. It never names a particular instrument: everything here
// is an effect kind, and instruments are made of those.
import { circleTouchesSegment, pointInPoly, pointSegDist2, segSegT } from '../core/geom';
import { damageEnemy, setCombatHooks } from './combat';
import { ranked } from './defs';
import type { ContentRegistry, EffectBinding, EffectSpec, HookName, InstrumentDef, KitFlag } from './defs';
import { MAX_STAKES, defaultRules, dischargeOn, pairIndex, plantedInOrder, refreshTopology, ripenLine, setLineHooks, setStakeCount, strikeAlongLine, sweepAgain } from './lines';
import type { Line, Stake, Sweep } from './lines';
import { resolveCircle } from './room';
import { applyBurn, applyChill, applyFreeze, applyMark, applyRoot } from './status';
import { CHAINS, DASH, LINES, PLAYER, ROD } from './tuning';
import type { ChainId } from './tuning';
import type { Enemy, World } from './types';

// ---------------------------------------------------------------- state

/** A lingering area on the ground (steam, dust). A polygon in world units. */
export interface Zone {
  id: number;
  zone: string;
  /** x0, y0, x1, y1, ... */
  pts: number[];
  t: number;
  dur: number;
  slow: number;
  lineBonus: number;
  dps: number;
  blocks: boolean;
  acc: number;
}

/** What the player owns this run, plus the kit's own timers. Carried from room to room. */
export interface KitState {
  /** Instrument id to rank. */
  owned: Record<string, number>;
  /** The Head on each stake (by stake id), or null. */
  heads: Array<string | null>;
  chain: ChainId;
  /** Seconds left on the Plot buff, and its strengths. */
  buffT: number;
  buffDamageTaken: number;
  buffSwing: number;
  shieldCd: number;
  stillT: number;
  /** 0..1 of the sustained-movement speed bonus. */
  stride: number;
  strideMax: number;
  /** Per-room counters for capped effects. */
  chalkGranted: number;
  healed: number;
  whipCounter: number;
  echoes: Array<{ sweep: Sweep; delay: number; scale: number }>;
  freezes: Array<{ enemy: number; delay: number; seconds: number }>;
  snareUntil: Record<number, number>;
  liveContact: Record<number, { touching: boolean; lockUntil: number }>;
}

/** Numbers and switches the rest of the simulation reads. Recomputed by the kit. */
export interface Mods {
  moveSpeedMul: number;
  swingSpeedMul: number;
  damageTakenMul: number;
  /** Rod bonus against enemies in the Plot or on a line. */
  rodSurveyed: number;
  plumbDrag: number;
  dashRechargeMul: number;
  whipSmallBonus: number;
  whipSmallArea: number;
  liveLineDamage: number;
  plumbSwap: boolean;
  plumbOffset: boolean;
  liveLines: boolean;
}

export function createKit(chain: ChainId = 'standard'): KitState {
  return {
    owned: {},
    heads: [null, null, null, null],
    chain,
    buffT: 0,
    buffDamageTaken: 0,
    buffSwing: 0,
    shieldCd: 0,
    stillT: 0,
    stride: 0,
    strideMax: 0,
    chalkGranted: 0,
    healed: 0,
    whipCounter: 0,
    echoes: [],
    freezes: [],
    snareUntil: {},
    liveContact: {},
  };
}

export function defaultMods(): Mods {
  return {
    moveSpeedMul: 1,
    swingSpeedMul: 1,
    damageTakenMul: 1,
    rodSurveyed: ROD.surveyedBonus,
    plumbDrag: 0,
    dashRechargeMul: 1,
    whipSmallBonus: 0,
    whipSmallArea: 0,
    liveLineDamage: 0,
    plumbSwap: false,
    plumbOffset: false,
    liveLines: false,
  };
}

// ---------------------------------------------------------------- bound effects

type Scope = { kind: 'global' } | { kind: 'stake'; stake: number } | { kind: 'pair'; pair: number; first: number; second: number };

interface Bound {
  binding: EffectBinding;
  rank: number;
  scope: Scope;
}

/** Derived from KitState by rebuildKit; not part of the saved state. */
const tables = new WeakMap<KitState, Record<HookName, Bound[]>>();

const emptyTables = (): Record<HookName, Bound[]> => ({
  plant: [], land: [], lineHit: [], ripen: [], discharge: [], whip: [], hammer: [], dashCross: [], tick: [], hurt: [], chalk: [],
});

interface Ctx {
  line?: Line;
  stake?: number;
  enemy?: Enemy;
  ripe?: boolean;
  cause?: 'trip' | 'sweep' | 'effect';
  sweep?: Sweep;
}

function inScope(b: Bound, ctx: Ctx): boolean {
  const s = b.scope;
  if (s.kind === 'global') return true;
  if (s.kind === 'stake') {
    if (ctx.line) return ctx.line.a === s.stake || ctx.line.b === s.stake;
    if (ctx.stake !== undefined) return ctx.stake === s.stake;
    return true;
  }
  if (ctx.line) return pairIndex(ctx.line.a, ctx.line.b) === s.pair;
  if (ctx.stake !== undefined) return ctx.stake === s.first;
  return true;
}

function whenOk(b: Bound, ctx: Ctx): boolean {
  switch (b.binding.when) {
    case 'ripe':
      return ctx.ripe === true;
    case 'unripe':
      return ctx.ripe === false;
    case 'trip':
      return ctx.cause === 'trip';
    case 'sweep':
      return ctx.cause === 'sweep';
    default:
      return true;
  }
}

/** Effects can set off other effects (a shockwave shoves an enemy over a ripe line). This bounds the chain. */
let depth = 0;
const MAX_DEPTH = 4;

function fire(w: World, hook: HookName, ctx: Ctx): boolean {
  const list = tables.get(w.kit)?.[hook];
  if (!list || list.length === 0 || depth >= MAX_DEPTH) return false;
  depth++;
  let spent = false;
  try {
    for (const b of list) {
      if (!inScope(b, ctx) || !whenOk(b, ctx)) continue;
      if (run(w, b, ctx)) spent = true;
    }
  } finally {
    depth--;
  }
  return spent;
}

// ---------------------------------------------------------------- effect kinds

function stakeOf(w: World, b: Bound, ctx: Ctx): Stake | undefined {
  if (b.scope.kind === 'stake') return w.lines.stakes[b.scope.stake];
  if (ctx.stake !== undefined) return w.lines.stakes[ctx.stake];
  return undefined;
}

function stakeWithHead(w: World, headId: string): Stake | undefined {
  for (let i = 0; i < w.lines.stakes.length; i++) {
    if (w.kit.heads[i] === headId && w.lines.stakes[i].state === 'planted') return w.lines.stakes[i];
  }
  return undefined;
}

function shockwave(w: World, x: number, y: number, radius: number, damage: number, knock: number, inward: boolean): void {
  w.events.push({ type: 'shockwave', x, y, radius });
  for (const e of w.enemies.slice()) {
    if (e.dead || e.state === 'spawn' || e.burrowed) continue;
    let dx = e.x - x;
    let dy = e.y - y;
    const d = Math.hypot(dx, dy);
    if (d > radius + e.radius) continue;
    if (d > 1e-6) {
      dx /= d;
      dy /= d;
    } else {
      dx = 1;
      dy = 0;
    }
    if (inward) {
      dx = -dx;
      dy = -dy;
    }
    damageEnemy(w, e, damage, { kind: 'burst', dx, dy, knock: inward ? Math.min(knock, d * 0.8) : knock });
  }
}

/** A thin quad around a segment, as a polygon. */
function quadAround(ax: number, ay: number, bx: number, by: number, width: number): number[] {
  const dx = bx - ax;
  const dy = by - ay;
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * (width / 2);
  const ny = (dx / l) * (width / 2);
  return [ax + nx, ay + ny, bx + nx, by + ny, bx - nx, by - ny, ax - nx, ay - ny];
}

export function addZone(w: World, zone: string, pts: number[], dur: number, o: { slow?: number; lineBonus?: number; dps?: number; blocks?: boolean }): Zone {
  // The same kind of zone laid on the same ground refreshes instead of stacking.
  for (const z of w.zones) {
    if (z.zone !== zone || z.pts.length !== pts.length) continue;
    let same = true;
    for (let i = 0; i < pts.length; i++) if (Math.abs(z.pts[i] - pts[i]) > 0.01) same = false;
    if (same) {
      z.t = 0;
      return z;
    }
  }
  const z: Zone = { id: w.nextId++, zone, pts, t: 0, dur, slow: o.slow ?? 0, lineBonus: o.lineBonus ?? 0, dps: o.dps ?? 0, blocks: !!o.blocks, acc: 0 };
  w.zones.push(z);
  w.events.push({ type: 'zone', id: z.id, zone, pts, dur });
  return z;
}

/** Run one bound effect. Returns true only for effects that "spend" what triggered them. */
function run(w: World, b: Bound, ctx: Ctx): boolean {
  const fx: EffectSpec = b.binding.do;
  const kit = w.kit;
  const p = w.player;
  const r = b.rank;
  switch (fx.kind) {
    case 'status': {
      const e = ctx.enemy;
      if (!e || e.dead) return false;
      const power = ranked(fx.power, r);
      const dur = ranked(fx.duration, r);
      if (fx.status === 'burn') applyBurn(e, power, dur);
      else if (fx.status === 'chill') applyChill(e, power, dur);
      else if (fx.status === 'freeze') applyFreeze(w, e, dur);
      else if (fx.status === 'root') applyRoot(e, dur, fx.immunity ?? 3);
      else applyMark(e, power, dur);
      return false;
    }
    case 'shockwave': {
      let at: { x: number; y: number } | undefined;
      if (fx.from === 'player') at = p;
      else if (fx.from === 'otherStake') at = b.scope.kind === 'pair' ? w.lines.stakes[b.scope.second] : undefined;
      else at = stakeOf(w, b, ctx);
      if (!at || (at !== p && (at as Stake).state !== 'planted')) return false;
      shockwave(w, at.x, at.y, ranked(fx.radius, r), ranked(fx.damage, r), fx.knock ?? 0, !!fx.inward);
      return false;
    }
    case 'pull': {
      const st = stakeOf(w, b, ctx);
      if (!st || st.state !== 'planted') return false;
      const radius = ranked(fx.radius, r);
      const speed = ranked(fx.speed, r);
      for (const e of w.enemies) {
        if (e.dead || e.state === 'spawn' || e.burrowed || e.airborne || e.def.mass >= 5) continue;
        const dx = st.x - e.x;
        const dy = st.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d > radius || d < 0.45) continue;
        const step = Math.min(d - 0.45, (speed / e.def.mass) * (1 / 60));
        tmp.x = e.x + (dx / d) * step;
        tmp.y = e.y + (dy / d) * step;
        resolveCircle(w.room, tmp, e.radius);
        e.x = tmp.x;
        e.y = tmp.y;
      }
      return false;
    }
    case 'snare': {
      const st = stakeWithHead(w, fx.atHead);
      if (!st) return false;
      for (const e of w.enemies.slice()) {
        if (e.dead || e.state === 'spawn' || e.burrowed || e.airborne) continue;
        if (Math.hypot(e.x - st.x, e.y - st.y) > fx.radius + e.radius) continue;
        if ((kit.snareUntil[e.id] ?? 0) > w.time) continue;
        kit.snareUntil[e.id] = w.time + fx.cooldown;
        applyRoot(e, fx.root, 0);
        damageEnemy(w, e, fx.damage, { kind: 'burst', dx: 0, dy: -1 });
      }
      return false;
    }
    case 'zone': {
      const o = { slow: fx.slow, lineBonus: fx.lineBonus, dps: fx.dps, blocks: fx.blocks };
      if (fx.shape === 'line') {
        const l = ctx.line;
        if (!l) return false;
        addZone(w, fx.zone, quadAround(l.ax, l.ay, l.bx, l.by, fx.width ?? 0.5), fx.duration, o);
      } else {
        const s = ctx.sweep;
        if (!s || !s.live) return false;
        for (const t of s.tris) addZone(w, fx.zone, [t.sx, t.sy, s.fromX, s.fromY, s.toX, s.toY], fx.duration, o);
      }
      return false;
    }
    case 'beam': {
      const l = ctx.line;
      if (!l) return false;
      // extend the line both ways, far past the edge of any room
      const dx = l.bx - l.ax;
      const dy = l.by - l.ay;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const ax = l.ax - ux * 24;
      const ay = l.ay - uy * 24;
      const bx = l.bx + ux * 24;
      const by = l.by + uy * 24;
      w.events.push({ type: 'beam', ax, ay, bx, by });
      const dmg = ranked(fx.damage, r);
      for (const e of w.enemies.slice()) {
        if (e.dead || e.state === 'spawn' || e.burrowed) continue;
        if (!circleTouchesSegment(e.x, e.y, e.radius + 0.25, ax, ay, bx, by)) continue;
        if (!damageEnemy(w, e, dmg, { kind: 'burst', dx: -uy, dy: ux }) && fx.burn) applyBurn(e, fx.burn, fx.burnTime ?? 3);
      }
      return false;
    }
    case 'ripenOthers': {
      for (const l of w.lines.lines) if (l.active && l !== ctx.line) ripenLine(w, l);
      return false;
    }
    case 'lash': {
      const l = ctx.line;
      if (!l || !l.ripe) return false;
      const mx = (l.ax + l.bx) / 2;
      const my = (l.ay + l.by) / 2;
      let best: Enemy | undefined;
      let bd = fx.range;
      for (const e of w.enemies) {
        if (e.dead || e.state === 'spawn' || e.burrowed || e.status.markT <= 0) continue;
        const d = Math.sqrt(pointSegDist2(e.x, e.y, l.ax, l.ay, l.bx, l.by));
        if (d <= bd) {
          bd = d;
          best = e;
        }
      }
      if (!best) return false;
      w.events.push({ type: 'beam', ax: mx, ay: my, bx: best.x, by: best.y });
      dischargeOn(w, l, best);
      return true;
    }
    case 'burnPlot': {
      for (const e of w.enemies) if (!e.dead && e.inPlot) applyBurn(e, fx.dps, fx.duration);
      return false;
    }
    case 'haul': {
      const e = ctx.enemy;
      const st = stakeWithHead(w, fx.toHead);
      if (!e || e.dead || !st || e.def.mass >= 3) return false;
      const dx = st.x - e.x;
      const dy = st.y - e.y;
      const d = Math.hypot(dx, dy);
      const travel = Math.max(0, d - 0.55);
      if (travel > 0.1) {
        e.dragT = 0.3;
        e.dragVX = (dx / d) * (travel / 0.3);
        e.dragVY = (dy / d) * (travel / 0.3);
      }
      kit.freezes.push({ enemy: e.id, delay: 0.3, seconds: fx.freeze });
      return false;
    }
    case 'ringLines': {
      if (ctx.stake === undefined) return false;
      for (const l of w.lines.lines) {
        if (l.active && (l.a === ctx.stake || l.b === ctx.stake)) strikeAlongLine(w, l);
      }
      return false;
    }
    case 'slingshot': {
      const l = ctx.line;
      if (!l || !l.ripe || p.state !== 'dash') return false;
      const speed = DASH.distance / DASH.time;
      const remaining = Math.max(0, p.dashTimeLeft) * speed + fx.extra;
      p.dashTimeLeft += fx.extra / speed;
      p.iframes = Math.max(p.iframes, p.dashTimeLeft + 0.05);
      const ex = p.x + p.dashDirX * remaining;
      const ey = p.y + p.dashDirY * remaining;
      const targets = w.enemies.filter((e) => !e.dead && e.state !== 'spawn' && !e.burrowed && circleTouchesSegment(e.x, e.y, e.radius + 0.7, p.x, p.y, ex, ey));
      if (targets.length === 0) return false;
      // every enemy in the path takes the discharge; the line is spent once
      for (let i = 0; i < targets.length; i++) {
        if (!l.ripe) {
          l.ripe = true;
          l.clock = l.ripenTime;
        }
        dischargeOn(w, l, targets[i]);
      }
      return true;
    }
    case 'echoSweep': {
      const s = ctx.sweep;
      if (!s || !s.live) return false;
      kit.whipCounter++;
      if (kit.whipCounter % fx.every !== 0) return false;
      kit.echoes.push({ sweep: s, delay: fx.delay, scale: fx.scale });
      return false;
    }
    case 'plotBuff': {
      kit.buffT = fx.duration;
      kit.buffDamageTaken = fx.damageTaken;
      kit.buffSwing = fx.swingSpeed;
      return false;
    }
    case 'plotShield': {
      const still = p.vx * p.vx + p.vy * p.vy < 0.04 && p.state !== 'dash';
      const inside = !!w.lines.plot && pointInPoly(p.x, p.y, w.lines.plot.pts);
      kit.stillT = still && inside ? kit.stillT + 1 / 60 : 0;
      if (kit.stillT >= fx.still && kit.shieldCd <= 0 && p.shield < fx.amount) {
        p.shield = fx.amount;
        kit.shieldCd = fx.cooldown;
        kit.stillT = 0;
        w.events.push({ type: 'shield', on: true, x: p.x, y: p.y });
      }
      return false;
    }
    case 'stride': {
      kit.strideMax = fx.max;
      if (b.binding.on === 'hurt') {
        kit.stride = 0;
        return false;
      }
      const moving = p.vx * p.vx + p.vy * p.vy > (PLAYER.speed * 0.6) * (PLAYER.speed * 0.6);
      kit.stride = moving ? Math.min(1, kit.stride + 1 / 60 / fx.buildTime) : Math.max(0, kit.stride - (1 / 60 / fx.buildTime) * 3);
      return false;
    }
    case 'grantChalk': {
      if (kit.chalkGranted >= fx.cap) return false;
      kit.chalkGranted += fx.amount;
      w.chalk += fx.amount;
      w.events.push({ type: 'chalk', amount: fx.amount, x: ctx.enemy?.x ?? p.x, y: ctx.enemy?.y ?? p.y });
      return false;
    }
    case 'heal': {
      if (kit.healed >= fx.cap || p.hp >= p.maxHp || p.state === 'dead') return false;
      kit.healed += fx.amount;
      p.hp = Math.min(p.maxHp, p.hp + fx.amount);
      return false;
    }
  }
}

const tmp = { x: 0, y: 0 };

// ---------------------------------------------------------------- resolving what is owned

function ownedDefs(reg: ContentRegistry, kit: KitState): Array<{ def: InstrumentDef; rank: number }> {
  const out: Array<{ def: InstrumentDef; rank: number }> = [];
  for (const id of Object.keys(kit.owned).sort()) {
    const def = reg.instruments[id];
    if (def) out.push({ def, rank: kit.owned[id] });
  }
  return out;
}

/**
 * Recompute everything derived from the kit: rule values, stake and line annotations, player
 * limits, and the table of bound effects. Call after any change to what is owned or mounted.
 */
export function rebuildKit(w: World): void {
  const kit = w.kit;
  const reg = w.content;
  const L = w.lines;
  const p = w.player;
  const rules = defaultRules();
  const chain = CHAINS[kit.chain];
  rules.linkRange = chain.linkRange;
  rules.ripenTime = chain.ripeTime;
  const mods = defaultMods();
  const flags = new Set<KitFlag>();
  const t = emptyTables();

  let ripenBonus = 0;
  let stakes = LINES.stakes;
  let dashCharges = DASH.charges + w.base.dashCharges;
  let plumbMax = 1;
  mods.dashRechargeMul = w.base.dashRechargeMul;

  for (const { def, rank } of ownedDefs(reg, kit)) {
    if (def.kind === 'head' && !kit.heads.includes(def.id)) continue; // an unmounted Head does nothing
    const m = def.mods;
    if (m) {
      if (m.ripenBonus !== undefined) ripenBonus += ranked(m.ripenBonus, rank);
      if (m.stakes !== undefined) stakes += ranked(m.stakes, rank);
      if (m.dashCharges !== undefined) dashCharges += ranked(m.dashCharges, rank);
      if (m.dashRecharge !== undefined) mods.dashRechargeMul *= ranked(m.dashRecharge, rank);
      if (m.plumbCharges !== undefined) plumbMax += ranked(m.plumbCharges, rank);
      if (m.plumbDrag !== undefined) mods.plumbDrag += ranked(m.plumbDrag, rank);
      if (m.severTime !== undefined) rules.severMul *= ranked(m.severTime, rank);
      if (m.lostTime !== undefined) rules.lostTime *= ranked(m.lostTime, rank);
      if (m.rodSurveyed !== undefined) mods.rodSurveyed = Math.max(mods.rodSurveyed, ranked(m.rodSurveyed, rank));
      if (m.whipSmallBonus !== undefined) mods.whipSmallBonus += ranked(m.whipSmallBonus, rank);
      if (m.whipSmallArea !== undefined) mods.whipSmallArea = Math.max(mods.whipSmallArea, m.whipSmallArea);
      if (m.liveLineDamage !== undefined) mods.liveLineDamage = Math.max(mods.liveLineDamage, m.liveLineDamage);
    }
    for (const f of def.flags ?? []) flags.add(f);
    if (def.kind === 'order') for (const binding of def.effects ?? []) t[binding.on].push({ binding, rank, scope: { kind: 'global' } });
  }
  mods.plumbSwap = flags.has('plumbSwap');
  mods.plumbOffset = flags.has('plumbOffset');
  mods.liveLines = flags.has('liveLines');

  // stakes
  stakes = Math.max(1, Math.min(MAX_STAKES, stakes));
  if (L.stakes.length !== stakes) setStakeCount(L, stakes);
  rules.stakeCount = stakes;
  L.rules = rules;
  for (let i = 0; i < L.stakes.length; i++) {
    const st = L.stakes[i];
    const id = kit.heads[i] ?? null;
    const def = id ? reg.instruments[id] : undefined;
    st.head = def ? def.id : null;
    st.headRank = def ? kit.owned[def.id] ?? 1 : 0;
    st.anchored = !!def?.traits?.anchored;
    if (def) for (const binding of def.effects ?? []) t[binding.on].push({ binding, rank: st.headRank, scope: { kind: 'stake', stake: i } });
  }

  // lines
  for (let a = 0; a < MAX_STAKES; a++) {
    for (let bI = a + 1; bI < MAX_STAKES; bI++) {
      const line = L.lines[pairIndex(a, bI)];
      line.bonus = 0;
      line.unseverable = false;
      line.reflect = 0;
      line.splice = null;
      let lineRipen = 1 + ripenBonus;
      const ends = [a, bI];
      const headIds: Array<string | null> = [];
      for (const s of ends) {
        const st = L.stakes[s];
        const def = st && st.head ? reg.instruments[st.head] : undefined;
        headIds.push(def ? def.id : null);
        const tr = def?.traits;
        if (!tr || !st) continue;
        if (tr.lineBonus !== undefined) line.bonus += ranked(tr.lineBonus, st.headRank);
        if (tr.unseverable) line.unseverable = true;
        if (tr.reflect !== undefined) line.reflect = Math.max(line.reflect, ranked(tr.reflect, st.headRank));
        if (tr.ripenBonus !== undefined) lineRipen *= 1 + ranked(tr.ripenBonus, st.headRank);
      }
      line.ripenTime = Math.max(LINES.ripeFloor, rules.ripenTime / lineRipen);
      if (headIds[0] && headIds[1]) {
        for (const sp of reg.splices) {
          const fwd = sp.heads[0] === headIds[0] && sp.heads[1] === headIds[1];
          const rev = sp.heads[0] === headIds[1] && sp.heads[1] === headIds[0];
          if (!fwd && !rev) continue;
          line.splice = sp.id;
          const first = fwd ? a : bI;
          const second = fwd ? bI : a;
          for (const binding of sp.effects) t[binding.on].push({ binding, rank: 1, scope: { kind: 'pair', pair: pairIndex(a, bI), first, second } });
        }
      }
    }
  }

  // player limits
  p.dashMaxCharges = dashCharges;
  if (p.dashCharges > dashCharges) p.dashCharges = dashCharges;
  p.plumbMax = plumbMax;
  if (p.plumbCharges > plumbMax) p.plumbCharges = plumbMax;

  // keep the dynamic parts of the previous mods
  mods.moveSpeedMul = w.mods.moveSpeedMul;
  mods.swingSpeedMul = w.mods.swingSpeedMul;
  mods.damageTakenMul = w.mods.damageTakenMul;
  w.mods = mods;
  tables.set(kit, t);
  refreshTopology(w);
}

// ---------------------------------------------------------------- owning and mounting

export type GrantResult = 'granted' | 'ranked' | 'needsSwap' | 'maxed' | 'unknown';

/** Add an instrument, or rank it up. A new Head mounts on the first bare stake; with none bare it needs a swap. */
export function grantInstrument(w: World, id: string): GrantResult {
  const def = w.content.instruments[id];
  if (!def) return 'unknown';
  const kit = w.kit;
  const have = kit.owned[id] ?? 0;
  if (have >= def.maxRank) return 'maxed';
  if (have > 0) {
    kit.owned[id] = have + 1;
    rebuildKit(w);
    return 'ranked';
  }
  if (def.kind === 'head') {
    const count = w.lines.stakes.length;
    let slot = -1;
    for (let i = 0; i < count; i++) {
      if (!kit.heads[i]) {
        slot = i;
        break;
      }
    }
    if (slot < 0) return 'needsSwap';
    kit.heads[slot] = id;
  }
  kit.owned[id] = 1;
  rebuildKit(w);
  // an Order that adds a stake may have opened a slot for nothing yet; nothing more to do
  return 'granted';
}

/** Replace the Head on a stake with a new one. The old Head is forgotten. Returns the id removed, if any. */
export function swapHead(w: World, stakeId: number, newHead: string): string | null {
  const kit = w.kit;
  const def = w.content.instruments[newHead];
  if (!def || def.kind !== 'head' || stakeId < 0 || stakeId >= w.lines.stakes.length) return null;
  const old = kit.heads[stakeId];
  if (old) delete kit.owned[old];
  kit.heads[stakeId] = newHead;
  kit.owned[newHead] = Math.max(1, kit.owned[newHead] ?? 0);
  rebuildKit(w);
  return old;
}

/** Exchange the Heads on two stakes (free in the shop). */
export function exchangeHeads(w: World, a: number, b: number): void {
  const kit = w.kit;
  const t = kit.heads[a];
  kit.heads[a] = kit.heads[b];
  kit.heads[b] = t;
  rebuildKit(w);
}

/** Splices active right now, by id. */
export function activeSplices(w: World): string[] {
  const out: string[] = [];
  for (const l of w.lines.lines) if (l.splice && !out.includes(l.splice)) out.push(l.splice);
  return out;
}

/** The Splice a Head would complete with the Heads already mounted, or null. */
export function spliceWith(w: World, headId: string): string | null {
  for (const sp of w.content.splices) {
    const other = sp.heads[0] === headId ? sp.heads[1] : sp.heads[1] === headId ? sp.heads[0] : null;
    if (other && w.kit.heads.includes(other) && !w.kit.heads.includes(headId)) return sp.id;
  }
  return null;
}

/** Reset per-room counters and timers. Call when a room begins. */
export function kitRoomStart(w: World): void {
  const kit = w.kit;
  kit.chalkGranted = 0;
  kit.healed = 0;
  kit.buffT = 0;
  kit.shieldCd = 0;
  kit.stillT = 0;
  kit.stride = 0;
  kit.echoes.length = 0;
  kit.freezes.length = 0;
  kit.snareUntil = {};
  kit.liveContact = {};
  w.zones.length = 0;
}

/** The player picked up Chalk. */
export function kitChalkPickup(w: World): void {
  fire(w, 'chalk', {});
}

// ---------------------------------------------------------------- hooks

let installed = false;

/** Connect the kit to the line step and to combat. Safe to call more than once. */
export function installKit(): void {
  if (installed) return;
  installed = true;
  setLineHooks({
    onLineHit: (w, e, line, ripe, cause) => void fire(w, 'lineHit', { line, enemy: e, ripe, cause }),
    onRipen: (w, line) => void fire(w, 'ripen', { line, ripe: true }),
    onDischarge: (w, line, cause) => void fire(w, 'discharge', { line, ripe: true, cause }),
    onPlant: (w, stake) => void fire(w, 'plant', { stake: stake.id }),
    onLand: (w, stake) => void fire(w, 'land', { stake: stake.id }),
    onWhip: (w, sweep) => void fire(w, 'whip', { stake: sweep.stake, sweep }),
    onHammer: (w, stake) => void fire(w, 'hammer', { stake: stake.id }),
    onDashCross: (w, line) => fire(w, 'dashCross', { line, ripe: line.ripe }),
  });
  setCombatHooks({ onPlayerHurt: (w) => void fire(w, 'hurt', {}) });
}

/** Disconnect (tests that want the bare rules). */
export function uninstallKit(): void {
  installed = false;
  setLineHooks({});
  setCombatHooks({});
}

// ---------------------------------------------------------------- step

function stepZones(w: World, dt: number): void {
  for (const e of w.enemies) {
    e.status.zoneSlow = 0;
    e.status.zoneLineBonus = 0;
  }
  if (w.zones.length === 0) return;
  let expired = false;
  for (const z of w.zones) {
    z.t += dt;
    if (z.t >= z.dur) {
      expired = true;
      continue;
    }
    z.acc += dt;
    const bite = z.dps > 0 && z.acc >= 0.5;
    if (bite) z.acc -= 0.5;
    for (const e of w.enemies.slice()) {
      if (e.dead || e.state === 'spawn' || e.burrowed || e.airborne) continue;
      if (!pointInPoly(e.x, e.y, z.pts)) continue;
      if (z.slow > e.status.zoneSlow) e.status.zoneSlow = z.slow;
      if (z.lineBonus > e.status.zoneLineBonus) e.status.zoneLineBonus = z.lineBonus;
      if (bite) damageEnemy(w, e, z.dps * 0.5, { kind: 'burn', dx: 0, dy: -1 });
    }
    if (z.blocks) {
      const n = z.pts.length / 2;
      for (const pr of w.projectiles) {
        if (pr.dead || pr.faction !== 'enemy') continue;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          if (segSegT(z.pts[i * 2], z.pts[i * 2 + 1], z.pts[j * 2], z.pts[j * 2 + 1], pr.px, pr.py, pr.x, pr.y) >= 0) {
            pr.dead = true;
            w.events.push({ type: 'projectileEnd', id: pr.id, kind: pr.kind, x: pr.x, y: pr.y, hit: true });
            break;
          }
        }
      }
    }
  }
  if (expired) w.zones = w.zones.filter((z) => z.t < z.dur);
}

/** Lines with a Heliograph send enemy shots back. */
function stepReflect(w: World): void {
  for (const pr of w.projectiles) {
    if (pr.dead || pr.faction !== 'enemy') continue;
    for (const l of w.lines.lines) {
      if (!l.active || l.reflect <= 0) continue;
      if (segSegT(l.ax, l.ay, l.bx, l.by, pr.px, pr.py, pr.x, pr.y) < 0) continue;
      pr.faction = 'player';
      pr.vx = -pr.vx;
      pr.vy = -pr.vy;
      pr.x = pr.px;
      pr.y = pr.py;
      pr.damage = l.reflect;
      pr.light = false;
      pr.range = Math.max(pr.range, 10);
      pr.life = Math.max(pr.life, 1.5);
      w.events.push({ type: 'deflect', x: pr.x, y: pr.y });
      break;
    }
  }
}

/** With the liveLines flag, the cords from the player to the two newest stakes trip enemies. */
function stepLiveLines(w: World): void {
  const kit = w.kit;
  const p = w.player;
  const order = plantedInOrder(w.lines);
  const newest = order.slice(-2);
  for (const st of newest) {
    for (const e of w.enemies.slice()) {
      if (e.dead || e.state === 'spawn' || e.burrowed || e.airborne) continue;
      const key = e.id * 4 + st.id;
      const touching = circleTouchesSegment(e.x, e.y, e.radius, p.x, p.y, st.x, st.y);
      let rec = kit.liveContact[key];
      if (!rec) {
        if (!touching) continue;
        rec = { touching: false, lockUntil: 0 };
        kit.liveContact[key] = rec;
      }
      if (touching && !rec.touching && w.time >= rec.lockUntil && w.time >= e.tripUntil) {
        rec.lockUntil = w.time + LINES.tripLockout;
        e.tripUntil = w.time + LINES.tripGlobal;
        const nx = -(st.y - p.y);
        const ny = st.x - p.x;
        const nl = Math.hypot(nx, ny) || 1;
        damageEnemy(w, e, w.mods.liveLineDamage, { kind: 'line', dx: nx / nl, dy: ny / nl, knock: 0.2 });
      }
      rec.touching = touching;
    }
  }
}

export function stepKit(w: World, dt: number): void {
  const kit = w.kit;
  const p = w.player;
  if (kit.buffT > 0) kit.buffT = Math.max(0, kit.buffT - dt);
  if (kit.shieldCd > 0) kit.shieldCd = Math.max(0, kit.shieldCd - dt);

  // delayed second sweeps
  if (kit.echoes.length) {
    for (const ec of kit.echoes) ec.delay -= dt;
    const due = kit.echoes.filter((ec) => ec.delay <= 0);
    if (due.length) {
      kit.echoes = kit.echoes.filter((ec) => ec.delay > 0);
      for (const ec of due) sweepAgain(w, ec.sweep, ec.scale);
    }
  }
  // freezes that land when a haul arrives
  if (kit.freezes.length) {
    for (const fr of kit.freezes) fr.delay -= dt;
    const due = kit.freezes.filter((fr) => fr.delay <= 0);
    if (due.length) {
      kit.freezes = kit.freezes.filter((fr) => fr.delay > 0);
      for (const fr of due) {
        const e = w.enemies.find((x) => x.id === fr.enemy);
        if (e && !e.dead) {
          e.stunImmune = 0;
          applyFreeze(w, e, fr.seconds);
        }
      }
    }
  }

  fire(w, 'tick', {});
  if (w.mods.liveLines && p.state !== 'dead') stepLiveLines(w);
  stepReflect(w);
  stepZones(w, dt);

  // dynamic mods
  const plot = w.lines.plot;
  const inside = !!plot && pointInPoly(p.x, p.y, plot.pts);
  const buffed = kit.buffT > 0 && inside;
  w.mods.damageTakenMul = buffed ? 1 - kit.buffDamageTaken : 1;
  w.mods.swingSpeedMul = buffed ? 1 + kit.buffSwing : 1;
  w.mods.moveSpeedMul = 1 + kit.stride * kit.strideMax;
  w.lines.rules.whipMul = plot && w.mods.whipSmallBonus > 0 && plot.area < w.mods.whipSmallArea ? 1 + w.mods.whipSmallBonus : 1;
}
