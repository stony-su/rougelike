// Scripted players. A bot reads the world and writes the same integer input frame a human's
// keyboard, mouse or controller produces, so tests, balance sweeps and the in-browser autopilot
// all exercise the real game. Bots get no hidden powers: they see the telegraphs a player sees,
// and may be given a human-like reaction delay.
import { dcos, dhypot, dsin } from '../core/dmath';
import { standing } from './combat';
import { hold, press, setAim, setMove } from './input';
import { telegraphCovers } from './telegraphs';
import { SWORD } from './tuning';
import { BTN, PRESS, emptyInput } from './types';
import type { Enemy, InputFrame, Player, Telegraph, World } from './types';

export interface Bot {
  name: string;
  /** Decide this tick's input for the player in `slot`. The returned frame is reused between calls. */
  think(w: World, slot: number): InputFrame;
}

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
    if (e.dead) continue;
    const d = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/** Remembers when each telegraph was first seen covering the player, so a bot can react late like a person. */
interface Notice {
  ids: number[];
  since: number[];
}

/** The most urgent telegraph that covers the player and has been visible for `reaction` seconds. */
function threatTo(w: World, p: Player, seen: Notice, reaction: number): Telegraph | null {
  let threat: Telegraph | null = null;
  for (const t of w.telegraphs) {
    if (t.t >= t.dur) continue;
    const i = seen.ids.indexOf(t.id);
    if (!telegraphCovers(t, p.x, p.y, p.radius + 0.15)) {
      if (i >= 0) {
        seen.ids.splice(i, 1);
        seen.since.splice(i, 1);
      }
      continue;
    }
    let since: number;
    if (i >= 0) since = seen.since[i];
    else {
      since = w.time;
      seen.ids.push(t.id);
      seen.since.push(since);
    }
    if (w.time - since >= reaction && (!threat || t.dur - t.t < threat.dur - threat.t)) threat = t;
  }
  if (seen.ids.length > 32) {
    seen.ids.length = 0;
    seen.since.length = 0;
  }
  return threat;
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

export interface SwordBotOptions {
  /** Seconds a threat must be visible before the bot reacts to it. */
  reaction: number;
  /** Dash out of telegraphs. A novice only walks. */
  dashes: boolean;
}

/** Walks up to the nearest enemy and swings; steps or dashes out of warned areas. */
export function swordBot(opts: SwordBotOptions = { reaction: 0.2, dashes: true }): Bot {
  const f = emptyInput();
  const seen: Notice = { ids: [], since: [] };
  let swingLatch = 0;
  return {
    name: opts.dashes ? 'sword' : 'novice',
    think(w: World, slot: number): InputFrame {
      const p = playerOf(w, slot);
      setMove(f, 0, 0);
      hold(f, BTN.attack, false);
      if (!p || !standing(p)) return f;

      const target = nearestEnemy(w, p);
      if (target) setAim(f, p.x, p.y, target.x, target.y);

      const threat = threatTo(w, p, seen, opts.reaction);
      if (threat) {
        escapeFrom(f, p, threat);
        const timeLeft = threat.dur - threat.t;
        if (opts.dashes && timeLeft < 0.16 && p.dashCharges > 0 && p.state !== 'dash' && p.bufDash <= 0) press(f, PRESS.dash);
        return f;
      }

      if (!target) return f;
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = dhypot(dx, dy) || 1;
      const reach = SWORD.reach[0] + target.radius - 0.25;
      if (d > reach) {
        setMove(f, dx, dy);
      } else if (target.state !== 'spawn') {
        // Press, release, press: one press per swing, like a finger.
        swingLatch = (swingLatch + 1) % 4;
        if (swingLatch === 0) press(f, PRESS.attack);
        hold(f, BTN.attack, true);
      }
      return f;
    },
  };
}
