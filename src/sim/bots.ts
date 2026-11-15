// Scripted players. A bot reads the world and writes the same integer input frame a keyboard,
// mouse or controller produces, so tests, balance sweeps and the in-browser autopilot all
// exercise the real game. Bots get no hidden powers: they see the telegraphs and shots a player
// sees, and may be given a human-like reaction delay.
import { TAU, dcos, dhypot, dsin } from '../core/dmath';
import type { Vec2 } from '../core/exact';
import { BUY_RATION, CAMP, REST_HEAL, atCamp, priceOf, raisable } from './camp';
import type { CampSeat } from './camp';
import { castCircle, newHit } from './cast';
import type { Hit } from './cast';
import { hittable, onGuard, standing } from './combat';
import type { ContentRegistry } from './defs';
import { DRAFT_TICKS, completes } from './draft';
import { hold, moveInto, press, setAim, setMove } from './input';
import { buildNav, navStep } from './nav';
import type { NavField } from './nav';
import { isClear } from './room';
import type { Command, Session } from './session';
import { VOTE_NONE, VOTE_TAKE, VOTE_WALK, WAGER, onTable } from './wager';
import { previewArrow } from './projectiles';
import { telegraphCovers } from './telegraphs';
import { BOW, BREAK, DASH, FIST, HAYMAKER, PLAYER, SIM_HZ, SWORD } from './tuning';
import { BTN, PRESS, emptyInput } from './types';
import type { ClassId, Enemy, InputFrame, Player, Projectile, Room, Telegraph, World } from './types';

export interface Bot {
  name: string;
  /** Decide this tick's input for the player in `slot`. The returned frame is reused between calls. */
  think(w: World, slot: number): InputFrame;
}

export interface BotOptions {
  /** Seconds a threat must be visible before the bot reacts to it. */
  reaction: number;
  /** Dash out of telegraphs, and across a long gap. */
  dashes: boolean;
  /** Use the class special. */
  special: boolean;
  /**
   * Under a warning, a practised player goes on fighting until they must move to be out in time,
   * with this many seconds to spare. Infinity moves the moment the warning is seen.
   */
  nerve: number;
  /**
   * The share of warnings and shots it never notices at all. Nobody sees everything: a bot that
   * did won nearly every run, and said nothing about how the game is for a person.
   */
  lapse: number;
}

/** Someone who knows the game well: quick, bold, and seldom caught out. */
export const EXPERT: BotOptions = { reaction: 0.2, dashes: true, special: true, nerve: 0.25, lapse: 0.1 };
/** Someone who knows what everything does, and is neither quick nor bold. */
export const STEADY: BotOptions = { reaction: 0.3, dashes: true, special: true, nerve: 0.6, lapse: 0.2 };
/** Someone new: slow to see things, missing a good many of them, and backing away from a warning the moment they do see it. */
export const NOVICE: BotOptions = { reaction: 0.35, dashes: true, special: true, nerve: Infinity, lapse: 0.3 };

const playerOf = (w: World, slot: number): Player | null => {
  for (const p of w.players) if (p.slot === slot) return p;
  return null;
};

/** Does nothing. Must lose. */
export function idleBot(): Bot {
  const f = emptyInput();
  return { name: 'idle', think: () => f };
}

function nearestEnemy(w: World, p: Player): Enemy | null {
  let best: Enemy | null = null;
  let bd = Infinity;
  for (const e of w.enemies) {
    if (e.dead || e.state === 'pit') continue;
    const d = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
    if (d < bd || (d === bd && best !== null && e.id < best.id)) {
      bd = d;
      best = e;
    }
  }
  return best;
}

function countNear(w: World, p: Player, range: number): number {
  let n = 0;
  for (const e of w.enemies) {
    if (!hittable(e)) continue;
    const rr = range + e.radius;
    if ((e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y) <= rr * rr) n++;
  }
  return n;
}

/**
 * Remembers when each threat was first seen, so a bot can react late like a person. Warnings
 * are remembered under their ids and shots under the negatives of theirs. Ids and the clock both
 * start again in every chamber, so what was seen in one chamber is forgotten in the next: a bot
 * that kept it took a new warning for one it had first seen in the future, and never reacted.
 */
interface Notice {
  /** The chamber being looked at, and its clock when it was last looked at. */
  where: string;
  at: number;
  ids: number[];
  since: number[];
}

const newNotice = (): Notice => ({ where: '', at: 0, ids: [], since: [] });

/**
 * Begin looking at a chamber: whatever was noticed in another one is dropped. A chamber is known
 * by what it is and by its clock never running backwards, not by the object that holds it: the
 * same chamber read back from a snapshot is still the same chamber, and a bot's memory of it
 * must carry over, or two laptops' bots would part ways at every repair.
 */
function lookAt(seen: Notice, w: World): void {
  const where = `${w.room.id}#${w.chamber}`;
  if (seen.where === where && w.time >= seen.at) {
    seen.at = w.time;
    return;
  }
  seen.where = where;
  seen.at = w.time;
  seen.ids.length = 0;
  seen.since.length = 0;
}

/**
 * Seconds since this id was first noticed (0 the first time). One that is overlooked is never
 * noticed, however long it is there.
 */
function noticed(seen: Notice, id: number, now: number, overlooked: boolean): number {
  const i = seen.ids.indexOf(id);
  if (i >= 0) return now - seen.since[i];
  if (seen.ids.length > 48) {
    seen.ids.length = 0;
    seen.since.length = 0;
  }
  seen.ids.push(id);
  seen.since.push(overlooked ? Infinity : now);
  return overlooked ? -Infinity : 0;
}

/**
 * Does this player overlook this warning or shot? A coin tossed once for each: the same thing in
 * the same chamber is always seen by the same player, or never, so a run plays the same every time.
 */
function overlooks(w: World, p: Player, id: number, lapse: number): boolean {
  if (lapse <= 0) return false;
  let h = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(w.chamber + 1, 0xc2b2ae35) ^ Math.imul(p.slot + 1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296 < lapse;
}

function forget(seen: Notice, id: number): void {
  const i = seen.ids.indexOf(id);
  if (i < 0) return;
  seen.ids.splice(i, 1);
  seen.since.splice(i, 1);
}

/**
 * How wide a berth a bot gives a warning. Being under one, the ground that is free of it and the
 * edge it will not step over are all measured with this same margin: measured with different
 * ones, a bot stepped out to where it no longer counted as under the warning, turned round at
 * once to walk back to its target, and was struck at the rim.
 */
const BERTH = 0.2;

/** The most urgent telegraph that covers the player and has been visible for `reaction` seconds. */
function threatTo(w: World, p: Player, seen: Notice, o: BotOptions): Telegraph | null {
  const reaction = o.reaction;
  lookAt(seen, w);
  let threat: Telegraph | null = null;
  for (const t of w.telegraphs) {
    if (t.t >= t.dur) continue;
    if (!telegraphCovers(t, p.x, p.y, p.radius + BERTH)) {
      forget(seen, t.id);
      continue;
    }
    if (noticed(seen, t.id, w.time, overlooks(w, p, t.id, o.lapse)) >= reaction && (!threat || t.dur - t.t < threat.dur - threat.t)) threat = t;
  }
  return threat;
}

/** An enemy shot on its way to the player, with the seconds until it arrives. Only shots noticed long enough ago count. */
interface Incoming {
  shot: Projectile | null;
  eta: number;
}

function incoming(w: World, p: Player, seen: Notice, o: BotOptions, out: Incoming): void {
  const reaction = o.reaction;
  lookAt(seen, w);
  out.shot = null;
  out.eta = Infinity;
  for (const pr of w.projectiles) {
    if (pr.dead || pr.faction !== 'enemy') continue;
    const sp = dhypot(pr.vx, pr.vy);
    if (sp < 1e-6) continue;
    const ux = pr.vx / sp;
    const uy = pr.vy / sp;
    const along = (p.x - pr.x) * ux + (p.y - pr.y) * uy;
    const across = Math.abs(-(p.x - pr.x) * uy + (p.y - pr.y) * ux);
    if (along < 0 || across > p.radius + pr.radius + 0.2) continue;
    const eta = along / sp;
    if (eta > 0.9) continue;
    if (noticed(seen, -pr.id - 1, w.time, overlooks(w, p, -pr.id - 1, o.lapse)) < reaction) continue;
    if (eta < out.eta) {
      out.eta = eta;
      out.shot = pr;
    }
  }
}

/** The plain way out of a telegraph, as a direction: sideways out of a lane, straight out of a circle or cone, inward out of a ring if that is nearer. */
function wayOut(p: Player, t: Telegraph, out: Vec2): void {
  if (t.shape === 'lane') {
    const c = dcos(t.angle);
    const s = dsin(t.angle);
    const across = -(p.x - t.x) * s + (p.y - t.y) * c;
    const side = across >= 0 ? 1 : -1;
    out.x = -s * side;
    out.y = c * side;
    return;
  }
  const ex = p.x - t.x;
  const ey = p.y - t.y;
  const d = dhypot(ex, ey);
  if (d <= 1e-6) {
    out.x = 1;
    out.y = 0;
    return;
  }
  const inward = t.shape === 'circle' && t.inner > 0 && d - t.inner < t.radius - d;
  out.x = (inward ? -ex : ex) / d;
  out.y = (inward ? -ey : ey) / d;
}

/** How a bot looks for somewhere safe: this many directions, at each of these distances, nearest first. */
const FLEE_DIRS = 16;
const FLEE_STEPS: readonly number[] = [0.9, 1.8, 3, 4.2];

/** Seconds until the first warning that covers a place lands; Infinity where none does. */
function landsAt(w: World, x: number, y: number, r: number): number {
  let soonest = Infinity;
  for (const t of w.telegraphs) {
    if (t.t >= t.dur || !telegraphCovers(t, x, y, r)) continue;
    if (t.dur - t.t < soonest) soonest = t.dur - t.t;
  }
  return soonest;
}

/**
 * The way out from under a warning, as a direction into `out`; returns how far off the free
 * ground is. Where warnings lie thick (a boss's patterns), the plain way out of one can lead into
 * the next, so the bot looks at the places it could reach and goes to the nearest one that no
 * warning covers, preferring the plain way out when that is one of them.
 *
 * Where every place in reach is under one warning or another it returns -1: then `out` leads to
 * the ground that is struck last (or nowhere, if that is where it stands), so that it can move on
 * once the earlier blows have landed; and under one warning too wide to look across, `out` is
 * simply the plain way out of it.
 */
function wayClear(w: World, p: Player, threat: Telegraph, out: Vec2): number {
  const plain: Vec2 = { x: 0, y: 0 };
  wayOut(p, threat, plain);
  const r = p.radius + BERTH;
  const here = landsAt(w, p.x, p.y, r);
  let late = here;
  let lx = 0;
  let ly = 0;
  /** Somewhere in reach is struck sooner than here: this is a pocket between blows, worth standing in. */
  let pocket = false;
  for (const dist of FLEE_STEPS) {
    let best = -Infinity;
    let bx = 0;
    let by = 0;
    for (let i = 0; i < FLEE_DIRS; i++) {
      const a = (i / FLEE_DIRS) * TAU;
      const ux = dcos(a);
      const uy = dsin(a);
      const x = p.x + ux * dist;
      const y = p.y + uy * dist;
      if (!isClear(w.room, x, y, p.radius)) continue;
      const lands = landsAt(w, x, y, r);
      if (lands < Infinity) {
        if (lands < here - 0.1) pocket = true;
        // not free, but struck later than where it stands, and it can be there in time
        if (lands > late + 0.1 && dist / PLAYER.speed < lands - 0.1) {
          late = lands;
          lx = ux;
          ly = uy;
        }
        continue;
      }
      const along = ux * plain.x + uy * plain.y;
      if (along > best) {
        best = along;
        bx = ux;
        by = uy;
      }
    }
    if (best > -Infinity) {
      out.x = bx;
      out.y = by;
      return dist;
    }
  }
  const stay = lx === 0 && ly === 0 && !pocket;
  out.x = stay ? plain.x : lx;
  out.y = stay ? plain.y : ly;
  return -1;
}

/** Get out from under a warning, now. */
function flee(w: World, p: Player, f: InputFrame, threat: Telegraph): void {
  const out: Vec2 = { x: 0, y: 0 };
  wayClear(w, p, threat, out);
  setMove(f, out.x, out.y);
}

/**
 * Is it time to go? A practised player stays under a warning and goes on fighting until they
 * must move to be out in time: the walk to free ground `far` away, what is left of the blow they
 * are in the middle of, one more blow of `swing` seconds, and their nerve to spare. Where there
 * is no free ground to walk to (`far` below 0) there is nothing to wait for.
 */
function mustGo(p: Player, threat: Telegraph, far: number, o: BotOptions, swing: number): boolean {
  if (far < 0) return true;
  const busy = p.state === 'attack' || p.state === 'release' || p.state === 'special' ? Math.max(0, p.actDur - p.stateTime) : 0;
  // with the hand drawn back the feet are slower
  const speed = p.state === 'charge' ? PLAYER.speed * HAYMAKER.moveMul : PLAYER.speed;
  return threat.dur - threat.t <= far / speed + busy + swing + o.nerve;
}

/** The Echo a warning belongs to, if it is one that a blow can throw off its feet (and its own blow with it). */
function thrown(w: World, t: Telegraph): Enemy | null {
  // a strike lands whatever becomes of whoever called it
  if (t.damage > 0) return null;
  for (const e of w.enemies) if (e.id === t.owner) return !e.dead && !e.def.anchored && e.def.mass < 4 ? e : null;
  return null;
}

/** The nearest orb still on its way to someone, within `range` of the player, or null. */
function nearestOrb(w: World, p: Player, range: number): Projectile | null {
  let best: Projectile | null = null;
  let bd = range * range;
  for (const pr of w.projectiles) {
    if (pr.dead || pr.faction !== 'enemy' || pr.kind !== 'orb') continue;
    const d = (pr.x - p.x) * (pr.x - p.x) + (pr.y - p.y) * (pr.y - p.y);
    if (d < bd) {
      bd = d;
      best = pr;
    }
  }
  return best;
}

/** How many orbs still on their way to someone are within `range` of the player. */
function orbsNear(w: World, p: Player, range: number): number {
  let n = 0;
  for (const pr of w.projectiles) {
    if (pr.dead || pr.faction !== 'enemy' || pr.kind !== 'orb') continue;
    if ((pr.x - p.x) * (pr.x - p.x) + (pr.y - p.y) * (pr.y - p.y) <= range * range) n++;
  }
  return n;
}

/** Step sideways out of the line of a shot. */
function sidestep(f: InputFrame, p: Player, pr: Projectile): void {
  const side = -(p.x - pr.x) * pr.vy + (p.y - pr.y) * pr.vx >= 0 ? 1 : -1;
  setMove(f, -pr.vy * side, pr.vx * side);
}

/** How a bot finds its way: the walking field to the last place it had to go round something to reach. */
interface Way {
  room: Room | null;
  field: NavField | null;
  hit: Hit;
  dir: Vec2;
}

const newWay = (): Way => ({ room: null, field: null, hit: newHit(), dir: { x: 0, y: 0 } });

/**
 * Walk to (x, y): straight at it when nothing is in the way, and otherwise round the pit or the
 * wall, along a walking field to its tile, as an Echo does (nav.ts). A person sees the way round;
 * a bot that only walked at things stood for ever against the rim of a pit.
 */
function walkTo(w: World, p: Player, f: InputFrame, x: number, y: number, way: Way, rush = -1): void {
  const amount = 1;
  const dx = x - p.x;
  const dy = y - p.y;
  if (castCircle(w.room.geo, true, p.x, p.y, dx, dy, p.radius * 0.9, way.hit)) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (way.room !== w.room || !way.field || way.field.tx !== tx || way.field.ty !== ty) {
      way.room = w.room;
      way.field = buildNav(w.room, tx, ty);
    }
    if (navStep(w.room, way.field, p.x, p.y, way.dir)) {
      setMove(f, way.dir.x, way.dir.y, amount);
      return;
    }
  }
  setMove(f, dx, dy, amount);
  // A long way off with nothing between: one dash of the two closes it. The other is kept for
  // getting out of trouble. (`rush` is how near the dash should end; below 0, it walks.)
  if (rush < 0 || p.dashCharges < p.dashMaxCharges || p.state === 'dash' || p.bufDash > 0) return;
  const d = dhypot(dx, dy);
  if (d < rush + DASH.distance + 0.3) return;
  if (landsAt(w, p.x + (dx / d) * DASH.distance, p.y + (dy / d) * DASH.distance, p.radius + BERTH) === Infinity) press(f, PRESS.dash);
}

/**
 * A teammate is down: go and stand by them. Returns true if the bot is on its way (it writes the
 * movement); false if nobody needs help or it is already close enough to be helping.
 */
function rescue(w: World, p: Player, f: InputFrame, way: Way): boolean {
  let best: Player | null = null;
  let bd = Infinity;
  for (const q of w.players) {
    if (q === p || q.state !== 'down') continue;
    const d = (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  if (!best || bd < 0.9 * 0.9) return false;
  walkTo(w, p, f, best.x, best.y, way);
  return true;
}

/** A finger on a button: one press every few ticks, held in between. */
function tap(f: InputFrame, latch: number): number {
  const next = (latch + 1) % 4;
  if (next === 0) press(f, PRESS.attack);
  hold(f, BTN.attack, next < 2);
  return next;
}

/**
 * A fist's finger: down and up again at once. A jab that ends with the button still down turns
 * into a hand drawn back, which a bot that only meant to jab would then stand and wait on.
 */
function flick(f: InputFrame, latch: number): number {
  const next = (latch + 1) % 4;
  if (next === 0) press(f, PRESS.attack);
  return next;
}

/** How far ahead a bot looks along its own step for a warning it would walk under. */
const LOOK_AHEAD: readonly number[] = [0.45, 0.9];

/**
 * Whatever a bot has decided, it does not walk under a warning it is clear of: it waits at the
 * edge for the blow to land. (A bot that had just stepped out from under a slam used to turn round
 * and walk back in to reach its target, and take the slam.)
 */
function careful(bot: Bot): Bot {
  const v: Vec2 = { x: 0, y: 0 };
  return {
    name: bot.name,
    think(w: World, slot: number): InputFrame {
      const f = bot.think(w, slot);
      const p = f.moveMag > 0 ? playerOf(w, slot) : null;
      if (!p || !standing(p)) return f;
      const r = p.radius + BERTH;
      // already under one: getting out is the business of whoever decided the step
      if (landsAt(w, p.x, p.y, r) < Infinity) return f;
      moveInto(f, v);
      const l = dhypot(v.x, v.y) || 1;
      for (const ahead of LOOK_AHEAD) {
        if (landsAt(w, p.x + (v.x / l) * ahead, p.y + (v.y / l) * ahead, r) === Infinity) continue;
        setMove(f, 0, 0);
        break;
      }
      return f;
    },
  };
}

/** Common to every bot: get out of warned ground. Returns true if the bot is busy escaping. */
function evade(w: World, p: Player, f: InputFrame, seen: Notice, o: BotOptions): boolean {
  const threat = threatTo(w, p, seen, o);
  if (!threat) return false;
  flee(w, p, f, threat);
  const left = threat.dur - threat.t;
  if (o.dashes && left < 0.16 && p.dashCharges > 0 && p.state !== 'dash' && p.bufDash <= 0) press(f, PRESS.dash);
  return true;
}

/** Walks up to the nearest enemy and swings; sends shots back; steps or dashes out of warned areas. */
export function swordBot(o: BotOptions = EXPERT): Bot {
  const f = emptyInput();
  const seen = newNotice();
  const inc: Incoming = { shot: null, eta: 0 };
  const way = newWay();
  const esc: Vec2 = { x: 0, y: 0 };
  let latch = 0;
  return careful({
    name: o.dashes ? 'sword' : 'sword-novice',
    think(w: World, slot: number): InputFrame {
      const p = playerOf(w, slot);
      setMove(f, 0, 0);
      hold(f, BTN.attack, false);
      if (!p || !standing(p)) return f;

      // The nearest Echo, but not one behind a raised shield while anything else is about: a blade does nothing to a gong.
      let target = nearestEnemy(w, p);
      if (target && onGuard(target)) {
        let open: Enemy | null = null;
        let bd = Infinity;
        for (const e of w.enemies) {
          if (!hittable(e) || onGuard(e)) continue;
          const d = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
          if (d < bd) {
            bd = d;
            open = e;
          }
        }
        if (open) target = open;
      }
      if (target) setAim(f, p.x, p.y, target.x, target.y);

      // A shot on its way: face it and swing, so it goes back where it came from.
      incoming(w, p, seen, o, inc);
      if (inc.shot && inc.eta < 0.3) {
        setAim(f, p.x, p.y, inc.shot.x, inc.shot.y);
        if (p.state !== 'attack') latch = tap(f, 3);
        return f;
      }

      const threat = threatTo(w, p, seen, o);
      if (threat) {
        if (p.state === 'guard') return f;
        // A lunge or a bash can be answered with a Riposte instead of a dodge. With one to hand it
        // stands its ground and goes on fighting, and guards as the blow comes.
        const left = threat.dur - threat.t;
        const answerable = (threat.shape === 'lane' && threat.count === 1) || threat.shape === 'cone';
        if (o.special && answerable && p.specialCd <= Math.max(0, left - 0.25)) {
          if (left < 0.2) {
            press(f, PRESS.special);
            return f;
          }
        } else if (mustGo(p, threat, wayClear(w, p, threat, esc), o, SWORD.windup[0] + SWORD.active[0] + SWORD.recovery[0])) {
          setMove(f, esc.x, esc.y);
          if (o.dashes && left < 0.16 && p.dashCharges > 0 && p.state !== 'dash' && p.bufDash <= 0) press(f, PRESS.dash);
          return f;
        }
      }

      if (rescue(w, p, f, way)) return f;
      if (!target) return f;
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = dhypot(dx, dy) || 1;
      const reach = SWORD.reach[0] + target.radius - 0.25;
      if (onGuard(target)) {
        // Only shields are left. With the Riposte to hand, step in close enough to draw the bash and
        // answer it; the gong is thrown down, and the blade goes in. While the Riposte is coming
        // back, keep out of reach. Someone who never uses it has no answer but to draw the bash,
        // step out of it, and strike while the gong hangs at its side.
        if (!o.special || p.specialCd <= 0.3) {
          if (d > 1.5 + target.radius) walkTo(w, p, f, target.x, target.y, way);
        } else if (d < 3.2) setMove(f, -dx, -dy);
      } else if (d > reach) walkTo(w, p, f, target.x, target.y, way, o.dashes ? reach : -1);
      else if (target.state !== 'spawn') latch = tap(f, latch);
      return f;
    },
  });
}

/** Keeps its distance and keeps the string busy; throws a Ringstone into a crowd. */
/** How many directions a bot tries when it looks for a shot off the walls, and how often it looks again (ticks). */
const BANK_TRIES = 48;
const BANK_EVERY = 15;

/**
 * An aim that sends an arrow off the chamber and then into a target, or -1 if none of the
 * directions tried does: round a shield, into it from where the shield is not; and at whatever
 * shrugs off a plain blow (the Toll in its Silence), so that the arrow arrives as a Return. It
 * reads the same path the arrow will fly (the aim preview's), as a person reading the room's
 * angles would.
 */
function bankShot(w: World, p: Player, e: Enemy, pts: number[]): number {
  const sh = e.def.shield;
  const fx = dcos(e.facing);
  const fy = dsin(e.facing);
  // with no shield nothing stops it: a cosine is never above 1
  const stops = sh ? dcos(sh.arc) : 2;
  let best = -1;
  let bestD = e.radius + 0.1;
  for (let i = 0; i < BANK_TRIES; i++) {
    const angle = (i / BANK_TRIES) * TAU;
    previewArrow(w, p, angle, 2, pts);
    for (let k = 0; k + 3 < pts.length; k += 2) {
      const lx = pts[k + 2] - pts[k];
      const ly = pts[k + 3] - pts[k + 1];
      const len = dhypot(lx, ly);
      if (len < 1e-6) continue;
      const ux = lx / len;
      const uy = ly / len;
      const along = Math.max(0, Math.min(len, (e.x - pts[k]) * ux + (e.y - pts[k + 1]) * uy));
      const d = dhypot(pts[k] + ux * along - e.x, pts[k + 1] + uy * along - e.y);
      if (d >= e.radius + 0.1) continue;
      // this leg reaches it: from the front it would only ring off, and the arrow would be spent
      if (-(ux * fx + uy * fy) > stops) break;
      if (k > 0 && d < bestD) {
        bestD = d;
        best = angle;
      }
      break;
    }
  }
  return best;
}

export function bowBot(o: BotOptions = EXPERT): Bot {
  const f = emptyInput();
  const seen = newNotice();
  const inc: Incoming = { shot: null, eta: 0 };
  const bank = { angle: -1, at: -BANK_EVERY, target: 0 };
  const path: number[] = [];
  const way = newWay();
  return careful({
    name: o.dashes ? 'bow' : 'bow-novice',
    think(w: World, slot: number): InputFrame {
      const p = playerOf(w, slot);
      setMove(f, 0, 0);
      hold(f, BTN.attack, false);
      if (!p || !standing(p)) return f;

      const target = nearestEnemy(w, p);
      if (target) setAim(f, p.x, p.y, target.x, target.y);
      // an orb on its way: an arrow sends it home, so that comes first
      const orb = nearestOrb(w, p, 7);
      if (orb) {
        const lead = dhypot(orb.x - p.x, orb.y - p.y) / BOW.speed;
        setAim(f, p.x, p.y, orb.x + orb.vx * lead, orb.y + orb.vy * lead);
      } else if (target && o.special && (onGuard(target) || target.takeDirect < 1)) {
        // behind a shield, or deaf to a plain blow: look for a way in off the walls, and look again every so often
        if (w.tick - bank.at >= BANK_EVERY || bank.target !== target.id) {
          bank.at = w.tick;
          bank.target = target.id;
          bank.angle = bankShot(w, p, target, path);
        }
        if (bank.angle >= 0) setAim(f, p.x, p.y, p.x + dcos(bank.angle) * 6, p.y + dsin(bank.angle) * 6);
      }
      // the string stays busy whatever the feet are doing
      if (orb || (target && target.state !== 'spawn')) hold(f, BTN.attack, true);

      if (evade(w, p, f, seen, o)) return f;
      incoming(w, p, seen, o, inc);
      if (inc.shot && inc.shot.kind !== 'orb') {
        sidestep(f, p, inc.shot);
        if (o.dashes && inc.eta < 0.16 && p.dashCharges > 0 && p.state !== 'dash' && p.bufDash <= 0) press(f, PRESS.dash);
        return f;
      }
      if (rescue(w, p, f, way)) return f;
      if (!target) return f;

      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = dhypot(dx, dy) || 1;
      if (o.special && p.specialCd <= 0 && target.state !== 'spawn' && countNear(w, p, 9) >= 2) press(f, PRESS.special);
      // No shot at it from here (a wall between, and no way in off another): go and find one.
      if (castCircle(w.room.geo, false, p.x, p.y, dx, dy, BOW.radius, way.hit) && bank.angle < 0) {
        walkTo(w, p, f, target.x, target.y, way);
        return f;
      }
      // Only shields are left, and there is no way round this one off the walls: kept at a distance
      // it would never strike, and never open. So it is let come. Its bash is stepped out of, and
      // it is shot while the gong hangs at its side.
      if (onGuard(target) && (!o.special || bank.angle < 0) && !w.enemies.some((e) => hittable(e) && !onGuard(e))) return f;
      if (d < 4.2) {
        // too close: back off, drifting toward the middle of the room so as not to be cornered
        const cx = w.room.cx - p.x;
        const cy = w.room.cy - p.y;
        const cl = dhypot(cx, cy) || 1;
        if (isClear(w.room, p.x - (dx / d) * 0.9, p.y - (dy / d) * 0.9, p.radius)) {
          setMove(f, -dx / d + (cx / cl) * 0.6, -dy / d + (cy / cl) * 0.6);
        } else {
          // cornered: there is no more backing off, so out past it toward the middle, with a dash if there is one
          setMove(f, cx, cy);
          if (o.dashes && p.dashCharges > 0 && p.state !== 'dash' && p.bufDash <= 0) press(f, PRESS.dash);
        }
      } else if (d > 8) {
        walkTo(w, p, f, target.x, target.y, way);
      } else {
        // in the band: circle
        setMove(f, -dy, dx, 0.6);
      }
      return f;
    },
  });
}

/** Closes in and jabs; draws the hand back for a Haymaker when there is room; Breaks a crowd. */
export function fistBot(o: BotOptions = EXPERT): Bot {
  const f = emptyInput();
  const seen = newNotice();
  const inc: Incoming = { shot: null, eta: 0 };
  const way = newWay();
  const esc: Vec2 = { x: 0, y: 0 };
  let latch = 0;
  /** Jabs thrown since the last big punch. */
  let jabs = 0;
  let wasAttacking = false;
  return careful({
    name: o.dashes ? 'fist' : 'fist-novice',
    think(w: World, slot: number): InputFrame {
      const p = playerOf(w, slot);
      setMove(f, 0, 0);
      const wasHolding = (f.held & BTN.attack) !== 0;
      hold(f, BTN.attack, false);
      if (!p || !standing(p)) return f;
      if (p.state === 'attack' && !wasAttacking) jabs++;
      wasAttacking = p.state === 'attack';

      // Against a boss the big punch is for the boss, which cannot be thrown and so takes all of it;
      // what the boss calls is dealt with when it comes close.
      const near = nearestEnemy(w, p);
      let boss: Enemy | null = null;
      for (const e of w.enemies) if (!e.dead && e.def.boss && e.state !== 'spawn') boss = e;
      const crowded = !!near && near !== boss && dhypot(near.x - p.x, near.y - p.y) <= 2.2;
      const target = boss && !crowded ? boss : near;
      if (target) setAim(f, p.x, p.y, target.x, target.y);
      const charging = p.state === 'charge';

      // An orb on its way is punched home rather than stepped round, whatever else is going on: the
      // hand sees to it while the feet do what they must. Face it early, and strike as it arrives.
      let orb = nearestOrb(w, p, 5);
      if (orb) {
        const od = dhypot(orb.x - p.x, orb.y - p.y);
        const osp = dhypot(orb.vx, orb.vy);
        // A fan of them is more than a fist can meet one at a time: the Break sends home every one in
        // reach. It is begun while the first is still far enough off not to arrive before the slam.
        const slamIn = osp * (BREAK.windup + 2 / SIM_HZ);
        if (o.special && p.specialCd <= 0 && p.state !== 'special' && !charging && od > slamIn + 0.9 && od <= BREAK.radius + slamIn - 0.3 && orbsNear(w, p, BREAK.radius + slamIn - 0.3) >= 2) {
          setAim(f, p.x, p.y, orb.x, orb.y);
          press(f, PRESS.special);
          return f;
        }
        // one that is still a while off, or is flying past, is no reason to stop what the hand is doing
        const closing = -((orb.x - p.x) * orb.vx + (orb.y - p.y) * orb.vy) / (od || 1);
        if (closing <= 0 || od - FIST.reach - orb.radius > closing * 0.3) orb = null;
      }
      if (orb) {
        const od = dhypot(orb.x - p.x, orb.y - p.y);
        const osp = dhypot(orb.vx, orb.vy);
        setAim(f, p.x, p.y, orb.x, orb.y);
        if (charging) {
          // a hand already drawn back is let go at it as it comes into reach
          if (od > HAYMAKER.reach + HAYMAKER.lunge + orb.radius) hold(f, BTN.attack, true);
        } else {
          // The punch is thrown so that it lands with the orb well inside its reach: thrown early it
          // meets nothing, and the orb arrives while the hand is still coming back.
          const lands = od - osp * (FIST.windup[0] + 1 / SIM_HZ);
          if (lands <= FIST.reach + orb.radius - 0.35 && p.state !== 'attack') latch = flick(f, 3);
        }
      }

      // A stomp has just struck something: an attack now flies to it, untouchable, and lands three
      // blows there. That is worth more than whatever else the hand had in mind.
      if (!orb && p.stompT > 0 && p.stomped.length > 0 && p.state !== 'attack' && p.state !== 'dash') {
        latch = flick(f, 3);
        return f;
      }

      const threat = threatTo(w, p, seen, o);
      if (threat) {
        const left = threat.dur - threat.t;
        // A blow about to land from an Echo close by is thrown off, Echo and all, with a Break. With
        // one to hand it stands its ground and goes on fighting, and slams as the blow comes.
        const from = !orb && o.special && p.specialCd <= Math.max(0, left - 0.4) ? thrown(w, threat) : null;
        if (from && dhypot(from.x - p.x, from.y - p.y) <= BREAK.radius + from.radius - 0.4) {
          if (left < 0.3 && p.state !== 'special') {
            press(f, PRESS.special);
            return f;
          }
        } else if (mustGo(p, threat, wayClear(w, p, threat, esc), o, FIST.windup[0] + FIST.active + FIST.recovery[0])) {
          setMove(f, esc.x, esc.y);
          // keep the hand drawn back while stepping aside
          if (charging && !orb) hold(f, BTN.attack, true);
          if (o.dashes && left < 0.16 && p.dashCharges > 0 && p.state !== 'dash' && p.bufDash <= 0) press(f, PRESS.dash);
          return f;
        }
      }
      // nothing to get out from under: it stands and waits for the orb
      if (orb && p.state !== 'release') return f;
      incoming(w, p, seen, o, inc);
      if (inc.shot && inc.shot.kind !== 'orb') {
        if (charging) {
          // the hand stays drawn back while the feet step aside
          sidestep(f, p, inc.shot);
          hold(f, BTN.attack, true);
          return f;
        }
        // a shot about to arrive is knocked aside with a jab: faced early, struck as it comes into reach
        setAim(f, p.x, p.y, inc.shot.x, inc.shot.y);
        const sd = dhypot(inc.shot.x - p.x, inc.shot.y - p.y);
        const ssp = dhypot(inc.shot.vx, inc.shot.vy);
        if (sd - ssp * (FIST.windup[0] + 1 / SIM_HZ) <= FIST.reach + inc.shot.radius - 0.35) {
          if (p.state !== 'attack') latch = flick(f, 3);
          // the hand is still coming back from the last one: through it instead
          else if (o.dashes && inc.eta < 0.12 && p.dashCharges > 0 && p.bufDash <= 0) press(f, PRESS.dash);
        }
        return f;
      }
      if (!charging && rescue(w, p, f, way)) return f;
      if (!target) return f;

      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = dhypot(dx, dy) || 1;
      const ready = target.state !== 'spawn';
      if (o.special && ready && p.specialCd <= 0 && countNear(w, p, BREAK.radius - 0.3) >= 2) {
        press(f, PRESS.special);
        return f;
      }

      if (charging) {
        // Close to punching distance with the hand held back, then let go.
        const full = p.charge >= HAYMAKER.full;
        const inRange = d <= HAYMAKER.reach + HAYMAKER.lunge + target.radius - 0.35;
        if (!inRange) walkTo(w, p, f, target.x, target.y, way);
        if (!(full && inRange && ready)) hold(f, BTN.attack, true);
        else jabs = 0;
        return f;
      }
      if (p.state === 'release') return f;

      const reach = FIST.reach + target.radius - 0.2;
      // A boss gives no time to stand and draw the hand back: within reach of it, it is jabbed. The
      // big punch is drawn back on the way in, so that every return to it begins with one; and it
      // is used on a boss that reels and cannot answer, and on one that has gone deaf to plain
      // blows (a full one is a Return, and gets through).
      if (target.def.boss) jabs = d > reach || target.state === 'stun' || target.takeDirect < 1 ? 3 : 0;
      if (d > reach) {
        walkTo(w, p, f, target.x, target.y, way, o.dashes ? reach : -1);
        // on the way in, with a few jabs behind it, wind up a big one
        if (jabs >= 3 && d < 6 && ready) {
          if (!wasHolding) press(f, PRESS.attack);
          hold(f, BTN.attack, true);
        }
      } else if (ready) {
        if (jabs >= 3) {
          // already in reach: hold through the jab into a charge
          if (!wasHolding) press(f, PRESS.attack);
          hold(f, BTN.attack, true);
        } else {
          latch = flick(f, latch);
        }
      }
      return f;
    },
  });
}

/** The standard bot for a class. */
/** What a Tuning is worth to a bot: the missing half of a Harmony first, then a rank of something held, then the rarest. */
function worth(id: string, held: Readonly<Record<string, number>>, content: ContentRegistry): number {
  const t = content.tunings[id];
  return t ? (completes(id, held, content) ? 100 : 0) + ((held[id] ?? 0) > 0 ? 10 : 0) + t.rarity : -1;
}

/** Which of the cards on offer a bot takes. */
export function botPick(offers: readonly string[], held: Readonly<Record<string, number>>, content: ContentRegistry): number {
  let best = 0;
  let bestScore = -1;
  offers.forEach((id, i) => {
    const score = worth(id, held, content);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/**
 * What a bot at a camp asks for next, or null when it has nothing left to ask. It takes the
 * Pool's one thing (health if it is hurt, else a rank), eats if it is still hurt, buys the best
 * Tuning it can pay for, and then says it is ready.
 */
export function botCamp(seat: CampSeat | undefined, me: Player, content: ContentRegistry): { kind: 'buy' | 'rest' | 'ready'; a: number } | null {
  if (!atCamp(seat) || seat.ready) return null;
  if (!seat.rested) {
    const ids = raisable(me, content);
    if (me.hp < me.maxHp * 0.65 || (ids.length === 0 && me.hp < me.maxHp)) return { kind: 'rest', a: REST_HEAL };
    let best = 0;
    ids.forEach((id, i) => {
      if (worth(id, me.tunings, content) > worth(ids[best], me.tunings, content)) best = i;
    });
    return { kind: 'rest', a: 1 + best };
  }
  if (seat.ration && me.chimes >= CAMP.ration && me.hp < me.maxHp * 0.6) return { kind: 'buy', a: BUY_RATION };
  let pick = -1;
  seat.shelf.forEach((id, i) => {
    const t = content.tunings[id];
    if (!t || priceOf(t) > me.chimes || (me.tunings[id] ?? 0) >= t.maxRank) return;
    if (pick < 0 || worth(id, me.tunings, content) > worth(seat.shelf[pick], me.tunings, content)) pick = i;
  });
  if (pick >= 0) return { kind: 'buy', a: pick };
  return { kind: 'ready', a: 1 };
}

/**
 * What a bot says to the Wager: it takes it when it is in good health and has company, and alone
 * it walks on (a third less health in the hardest chamber of the road is a great deal to give up
 * with nobody to pick you up).
 */
export function botWager(me: Player, players: number): number {
  return players > 1 && me.hp >= me.maxHp * 0.6 ? VOTE_TAKE : VOTE_WALK;
}

/** How long a bot looks at its cards before taking one, in ticks. */
export const BOT_THINKS = 40;

/**
 * The commands bots in the given seats send this tick (every seat, if none are named): at most
 * one from each. Bots decide three things outside their hands: which card to take, whether to
 * take a Wager, and what to do at a camp.
 */
export function botCommands(s: Session, content: ContentRegistry, seats?: readonly number[]): Command[] {
  const out: Command[] = [];
  s.config.players.forEach((_, slot) => {
    if (seats && !seats.includes(slot)) return;
    const me = s.worlds[s.where[slot] ?? 0]?.players.find((p) => p.slot === slot);
    if (!me) return;
    const d = s.drafts[slot];
    if (d && d.offers.length > 0) {
      if (d.timer <= DRAFT_TICKS - BOT_THINKS) out.push({ slot, seq: s.lastSeq[slot] + 1, kind: 'pick', a: botPick(d.offers, me.tunings, content) });
      return;
    }
    if (onTable(s.wager)) {
      // after a moment's thought
      if (s.wager.votes[slot] === VOTE_NONE && s.wager.timer <= WAGER.count - BOT_THINKS) out.push({ slot, seq: s.lastSeq[slot] + 1, kind: 'wager', a: botWager(me, s.config.players.length) });
      return;
    }
    // a bot looks round a camp for a moment before it does anything there
    const c = s.clearFor >= BOT_THINKS ? botCamp(s.camps[slot], me, content) : null;
    if (c) out.push({ slot, seq: s.lastSeq[slot] + 1, kind: c.kind, a: c.a });
  });
  return out;
}

export function classBot(classId: ClassId, o: BotOptions = EXPERT): Bot {
  return classId === 'bow' ? bowBot(o) : classId === 'fist' ? fistBot(o) : swordBot(o);
}
