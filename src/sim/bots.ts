// Scripted players. A bot reads the world and produces the same InputFrame a human's keyboard
// and mouse produce, so tests, balance sweeps and the in-browser autopilot all exercise the real
// game. Bots get no hidden powers: they see the telegraphs a player sees, and may be given a
// human-like reaction delay.
import { telegraphCovers } from './telegraphs';
import { ROD } from './tuning';
import { emptyInput } from './types';
import type { Enemy, InputFrame, World } from './types';

export interface Bot {
  name: string;
  think(w: World): InputFrame;
}

/** Does nothing. Must lose. */
export function idleBot(): Bot {
  const f = emptyInput();
  return {
    name: 'idle',
    think: (w) => {
      f.aimX = w.player.x + 1;
      f.aimY = w.player.y;
      return f;
    },
  };
}

function nearestEnemy(w: World): Enemy | null {
  let best: Enemy | null = null;
  let bd = Infinity;
  const p = w.player;
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

export interface RodBotOptions {
  /** Seconds a threat must be visible before the bot reacts to it. */
  reaction: number;
  /** Dash out of telegraphs. A novice only walks. */
  dashes: boolean;
}

/**
 * Walks up to the nearest enemy and swings the Rod; steps or dashes out of warned areas.
 * Never uses stakes. This is the "novice" baseline the line mechanic has to beat.
 */
export function rodBot(opts: RodBotOptions = { reaction: 0.2, dashes: true }): Bot {
  const f = emptyInput();
  /** telegraph id -> first time the bot noticed it covering the player */
  const noticed = new Map<number, number>();
  let swingLatch = 0;
  return {
    name: opts.dashes ? 'rod' : 'novice',
    think(w: World): InputFrame {
      const p = w.player;
      f.moveX = 0;
      f.moveY = 0;
      f.attackPressed = false;
      f.attackHeld = false;
      f.dashPressed = false;
      f.specialPressed = false;
      f.stakePressed = false;
      f.interactPressed = false;

      const target = nearestEnemy(w);
      if (target) {
        f.aimX = target.x;
        f.aimY = target.y;
      }

      // Threats: any telegraph that covers us and has been visible longer than our reaction time.
      let threat = null as (typeof w.telegraphs)[number] | null;
      for (const t of w.telegraphs) {
        if (t.t >= t.dur) continue;
        if (!telegraphCovers(t, p.x, p.y, p.radius + 0.15)) {
          noticed.delete(t.id);
          continue;
        }
        let since = noticed.get(t.id);
        if (since === undefined) {
          since = w.time;
          noticed.set(t.id, since);
        }
        if (w.time - since >= opts.reaction && (!threat || t.dur - t.t < threat.dur - threat.t)) threat = t;
      }
      if (noticed.size > 32) noticed.clear();

      if (threat) {
        // Leave sideways across a lane; straight out of a circle or cone.
        let ex: number;
        let ey: number;
        if (threat.shape === 'lane') {
          const c = Math.cos(threat.angle);
          const s = Math.sin(threat.angle);
          const across = -(p.x - threat.x) * s + (p.y - threat.y) * c;
          const side = across >= 0 ? 1 : -1;
          ex = -s * side;
          ey = c * side;
        } else {
          ex = p.x - threat.x;
          ey = p.y - threat.y;
          const l = Math.hypot(ex, ey) || 1;
          ex /= l;
          ey /= l;
        }
        f.moveX = ex;
        f.moveY = ey;
        const timeLeft = threat.dur - threat.t;
        if (opts.dashes && timeLeft < 0.16 && p.dashCharges > 0 && p.state !== 'dash') f.dashPressed = true;
        return f;
      }

      if (!target) return f;
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const reach = ROD.reach[0] + target.radius - 0.25;
      if (d > reach) {
        f.moveX = dx / d;
        f.moveY = dy / d;
      } else if (target.state !== 'spawn') {
        // Press, release, press: one press per swing, like a finger.
        swingLatch = (swingLatch + 1) % 4;
        if (swingLatch === 0) f.attackPressed = true;
        f.attackHeld = true;
      }
      return f;
    },
  };
}
