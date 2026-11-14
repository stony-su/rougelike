// Scripted players. A bot reads the world and writes the same integer input frame a keyboard,
// mouse or controller produces, so tests, balance sweeps and the in-browser autopilot all
// exercise the real game. Bots get no hidden powers: they see the telegraphs and shots a player
// sees, and may be given a human-like reaction delay.
import { dcos, dhypot, dsin } from '../core/dmath';
import { hittable, standing } from './combat';
import { hold, press, setAim, setMove } from './input';
import { telegraphCovers } from './telegraphs';
import { BREAK, FIST, HAYMAKER, SWORD } from './tuning';
import { BTN, PRESS, emptyInput } from './types';
import type { ClassId, Enemy, InputFrame, Player, Projectile, Telegraph, World } from './types';

export interface Bot {
  name: string;
  /** Decide this tick's input for the player in `slot`. The returned frame is reused between calls. */
  think(w: World, slot: number): InputFrame;
}

export interface BotOptions {
  /** Seconds a threat must be visible before the bot reacts to it. */
  reaction: number;
  /** Dash out of telegraphs. A novice only walks. */
  dashes: boolean;
  /** Use the class special. */
  special: boolean;
}

export const EXPERT: BotOptions = { reaction: 0.2, dashes: true, special: true };
export const NOVICE: BotOptions = { reaction: 0.35, dashes: false, special: false };

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

/** Remembers when each threat was first seen, so a bot can react late like a person. */
interface Notice {
  ids: number[];
  since: number[];
}

const newNotice = (): Notice => ({ ids: [], since: [] });

/** Seconds since this id was first noticed (0 the first time). */
function noticed(seen: Notice, id: number, now: number): number {
  const i = seen.ids.indexOf(id);
  if (i >= 0) return now - seen.since[i];
  if (seen.ids.length > 48) {
    seen.ids.length = 0;
    seen.since.length = 0;
  }
  seen.ids.push(id);
  seen.since.push(now);
  return 0;
}

function forget(seen: Notice, id: number): void {
  const i = seen.ids.indexOf(id);
  if (i < 0) return;
  seen.ids.splice(i, 1);
  seen.since.splice(i, 1);
}

/** The most urgent telegraph that covers the player and has been visible for `reaction` seconds. */
function threatTo(w: World, p: Player, seen: Notice, reaction: number): Telegraph | null {
  let threat: Telegraph | null = null;
  for (const t of w.telegraphs) {
    if (t.t >= t.dur) continue;
    if (!telegraphCovers(t, p.x, p.y, p.radius + 0.15)) {
      forget(seen, t.id);
      continue;
    }
    if (noticed(seen, t.id, w.time) >= reaction && (!threat || t.dur - t.t < threat.dur - threat.t)) threat = t;
  }
  return threat;
}

/** An enemy shot on its way to the player, with the seconds until it arrives. Only shots noticed long enough ago count. */
interface Incoming {
  shot: Projectile | null;
  eta: number;
}

function incoming(w: World, p: Player, seen: Notice, reaction: number, out: Incoming): void {
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
    if (noticed(seen, pr.id, w.time) < reaction) continue;
    if (eta < out.eta) {
      out.eta = eta;
      out.shot = pr;
    }
  }
}

/** Steer out of a telegraph the fastest way: sideways out of a lane, straight out of a circle or cone. */
function escapeFrom(f: InputFrame, p: Player, t: Telegraph): void {
  if (t.shape === 'lane') {
    const c = dcos(t.angle);
    const s = dsin(t.angle);
    const across = -(p.x - t.x) * s + (p.y - t.y) * c;
    const side = across >= 0 ? 1 : -1;
    setMove(f, -s * side, c * side);
  } else {
    const ex = p.x - t.x;
    const ey = p.y - t.y;
    if (dhypot(ex, ey) > 1e-6) setMove(f, ex, ey);
    else setMove(f, 1, 0);
  }
}

/** Step sideways out of the line of a shot. */
function sidestep(f: InputFrame, p: Player, pr: Projectile): void {
  const side = -(p.x - pr.x) * pr.vy + (p.y - pr.y) * pr.vx >= 0 ? 1 : -1;
  setMove(f, -pr.vy * side, pr.vx * side);
}

/** A finger on a button: one press every few ticks, held in between. */
function tap(f: InputFrame, latch: number): number {
  const next = (latch + 1) % 4;
  if (next === 0) press(f, PRESS.attack);
  hold(f, BTN.attack, next < 2);
  return next;
}

/** Common to every bot: get out of warned ground. Returns true if the bot is busy escaping. */
function evade(w: World, p: Player, f: InputFrame, seen: Notice, o: BotOptions): boolean {
  const threat = threatTo(w, p, seen, o.reaction);
  if (!threat) return false;
  escapeFrom(f, p, threat);
  const left = threat.dur - threat.t;
  if (o.dashes && left < 0.16 && p.dashCharges > 0 && p.state !== 'dash' && p.bufDash <= 0) press(f, PRESS.dash);
  return true;
}

/** Walks up to the nearest enemy and swings; sends shots back; steps or dashes out of warned areas. */
export function swordBot(o: BotOptions = EXPERT): Bot {
  const f = emptyInput();
  const seen = newNotice();
  const inc: Incoming = { shot: null, eta: 0 };
  let latch = 0;
  return {
    name: o.dashes ? 'sword' : 'sword-novice',
    think(w: World, slot: number): InputFrame {
      const p = playerOf(w, slot);
      setMove(f, 0, 0);
      hold(f, BTN.attack, false);
      if (!p || !standing(p)) return f;

      const target = nearestEnemy(w, p);
      if (target) setAim(f, p.x, p.y, target.x, target.y);

      // A shot on its way: face it and swing, so it goes back where it came from.
      incoming(w, p, seen, o.reaction, inc);
      if (inc.shot && inc.eta < 0.3) {
        setAim(f, p.x, p.y, inc.shot.x, inc.shot.y);
        if (p.state !== 'attack') latch = tap(f, 3);
        return f;
      }

      const threat = threatTo(w, p, seen, o.reaction);
      if (threat) {
        // A lunge about to land can be answered with a Riposte instead of a dodge.
        const left = threat.dur - threat.t;
        if (o.special && threat.shape === 'lane' && threat.count === 1 && left < 0.2 && p.specialCd <= 0 && p.state !== 'guard') {
          press(f, PRESS.special);
          return f;
        }
        if (p.state === 'guard') return f;
        escapeFrom(f, p, threat);
        if (o.dashes && left < 0.16 && p.dashCharges > 0 && p.state !== 'dash' && p.bufDash <= 0) press(f, PRESS.dash);
        return f;
      }

      if (!target) return f;
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = dhypot(dx, dy) || 1;
      const reach = SWORD.reach[0] + target.radius - 0.25;
      if (d > reach) setMove(f, dx, dy);
      else if (target.state !== 'spawn') latch = tap(f, latch);
      return f;
    },
  };
}

/** Keeps its distance and keeps the string busy; throws a Ringstone into a crowd. */
export function bowBot(o: BotOptions = EXPERT): Bot {
  const f = emptyInput();
  const seen = newNotice();
  const inc: Incoming = { shot: null, eta: 0 };
  return {
    name: o.dashes ? 'bow' : 'bow-novice',
    think(w: World, slot: number): InputFrame {
      const p = playerOf(w, slot);
      setMove(f, 0, 0);
      hold(f, BTN.attack, false);
      if (!p || !standing(p)) return f;

      const target = nearestEnemy(w, p);
      if (target) setAim(f, p.x, p.y, target.x, target.y);
      // the string stays busy whatever the feet are doing
      if (target && target.state !== 'spawn') hold(f, BTN.attack, true);

      if (evade(w, p, f, seen, o)) return f;
      incoming(w, p, seen, o.reaction, inc);
      if (inc.shot) {
        sidestep(f, p, inc.shot);
        return f;
      }
      if (!target) return f;

      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = dhypot(dx, dy) || 1;
      if (o.special && p.specialCd <= 0 && target.state !== 'spawn' && countNear(w, p, 9) >= 2) press(f, PRESS.special);
      if (d < 4.2) {
        // too close: back off, drifting toward the middle of the room so as not to be cornered
        const cx = w.room.cx - p.x;
        const cy = w.room.cy - p.y;
        const cl = dhypot(cx, cy) || 1;
        setMove(f, -dx / d + (cx / cl) * 0.6, -dy / d + (cy / cl) * 0.6);
      } else if (d > 8) {
        setMove(f, dx, dy);
      } else {
        // in the band: circle
        setMove(f, -dy, dx, 0.6);
      }
      return f;
    },
  };
}

/** Closes in and jabs; draws the hand back for a Haymaker when there is room; Breaks a crowd. */
export function fistBot(o: BotOptions = EXPERT): Bot {
  const f = emptyInput();
  const seen = newNotice();
  const inc: Incoming = { shot: null, eta: 0 };
  let latch = 0;
  /** Jabs thrown since the last big punch. */
  let jabs = 0;
  let wasAttacking = false;
  return {
    name: o.dashes ? 'fist' : 'fist-novice',
    think(w: World, slot: number): InputFrame {
      const p = playerOf(w, slot);
      setMove(f, 0, 0);
      const wasHolding = (f.held & BTN.attack) !== 0;
      hold(f, BTN.attack, false);
      if (!p || !standing(p)) return f;
      if (p.state === 'attack' && !wasAttacking) jabs++;
      wasAttacking = p.state === 'attack';

      const target = nearestEnemy(w, p);
      if (target) setAim(f, p.x, p.y, target.x, target.y);
      const charging = p.state === 'charge';

      const threat = threatTo(w, p, seen, o.reaction);
      if (threat) {
        escapeFrom(f, p, threat);
        // keep the hand drawn back while stepping aside
        if (charging) hold(f, BTN.attack, true);
        const left = threat.dur - threat.t;
        if (o.dashes && left < 0.16 && p.dashCharges > 0 && p.state !== 'dash' && p.bufDash <= 0) press(f, PRESS.dash);
        return f;
      }
      incoming(w, p, seen, o.reaction, inc);
      if (inc.shot && !charging) {
        sidestep(f, p, inc.shot);
        return f;
      }
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
        if (!inRange) setMove(f, dx, dy);
        if (!(full && inRange && ready)) hold(f, BTN.attack, true);
        else jabs = 0;
        return f;
      }
      if (p.state === 'release') return f;

      const reach = FIST.reach + target.radius - 0.2;
      if (d > reach) {
        setMove(f, dx, dy);
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
          latch = tap(f, latch);
        }
      }
      return f;
    },
  };
}

/** The standard bot for a class. */
export function classBot(classId: ClassId, o: BotOptions = EXPERT): Bot {
  return classId === 'bow' ? bowBot(o) : classId === 'fist' ? fistBot(o) : swordBot(o);
}
