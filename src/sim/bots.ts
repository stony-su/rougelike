// Scripted players. A bot reads the world and produces the same InputFrame a human's keyboard
// and mouse produce, so tests, balance sweeps and the in-browser autopilot all exercise the real
// game. Bots get no hidden powers: they see the telegraphs a player sees, and may be given a
// human-like reaction delay.
import { heldStake, previewSweep } from './lines';
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

/** The nearest hostile telegraph that covers the player and has been visible for `reaction` seconds. */
function threatTo(w: World, noticed: Map<number, number>, reaction: number): World['telegraphs'][number] | null {
  const p = w.player;
  let threat: World['telegraphs'][number] | null = null;
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
    if (w.time - since >= reaction && (!threat || t.dur - t.t < threat.dur - threat.t)) threat = t;
  }
  if (noticed.size > 32) noticed.clear();
  return threat;
}

/** The direction that leaves a telegraph fastest: sideways out of a lane, straight out of a circle or cone. */
function escapeFrom(w: World, t: World['telegraphs'][number], out: { x: number; y: number }): void {
  const p = w.player;
  if (t.shape === 'lane') {
    const c = Math.cos(t.angle);
    const s = Math.sin(t.angle);
    const across = -(p.x - t.x) * s + (p.y - t.y) * c;
    const side = across >= 0 ? 1 : -1;
    out.x = -s * side;
    out.y = c * side;
  } else {
    let ex = p.x - t.x;
    let ey = p.y - t.y;
    const l = Math.hypot(ex, ey) || 1;
    ex /= l;
    ey /= l;
    out.x = ex;
    out.y = ey;
  }
}

export interface LineBotOptions {
  /** Seconds a threat must be visible before the bot reacts to it. */
  reaction: number;
  /** 'active': plant, orbit and whip. 'camp': plant once and stand in the Plot. 'mash': press E whenever allowed. */
  style: 'active' | 'camp' | 'mash';
  /** Wait for a ripe line when no enemy is about to attack. */
  patient: boolean;
}

/**
 * Plays Running the Line the way it is meant to be played: circles the pack so its old positions
 * surround them, plants three stakes spread apart, and whips when the preview says the sweep
 * will catch something, preferring ripe lines. Uses the Rod on anything stunned or skidding.
 */
export function lineBot(opts: LineBotOptions = { reaction: 0.2, style: 'active', patient: true }): Bot {
  const f = emptyInput();
  const noticed = new Map<number, number>();
  const esc = { x: 0, y: 0 };
  let swingLatch = 0;
  let stakeLatch = 0;
  let orbitSign = 1;
  let lastWhipAt = -9;
  return {
    name: `line-${opts.style}`,
    think(w: World): InputFrame {
      const p = w.player;
      const L = w.lines;
      f.moveX = 0;
      f.moveY = 0;
      f.attackPressed = false;
      f.attackHeld = false;
      f.dashPressed = false;
      f.specialPressed = false;
      f.stakePressed = false;
      f.interactPressed = false;
      if (stakeLatch > 0) stakeLatch--;

      const target = nearestEnemy(w);
      if (target) {
        f.aimX = target.x;
        f.aimY = target.y;
      }

      // centre of the pack
      let cx = 0;
      let cy = 0;
      let n = 0;
      for (const e of w.enemies) {
        if (e.dead) continue;
        cx += e.x;
        cy += e.y;
        n++;
      }
      if (n > 0) {
        cx /= n;
        cy /= n;
      }

      // ---- stakes
      const held = heldStake(L);
      if (opts.style === 'mash') {
        if (stakeLatch === 0) {
          f.stakePressed = true;
          stakeLatch = 3;
        }
      } else if (held && n > 0 && stakeLatch === 0) {
        // plant where it widens the triangle: away from the stakes already down
        let far = true;
        for (const s of L.stakes) {
          if (s.state === 'planted' && Math.hypot(s.x - p.x, s.y - p.y) < 3.2) far = false;
        }
        if (far && Math.hypot(cx - p.x, cy - p.y) < 7) {
          f.stakePressed = true;
          stakeLatch = 6;
        }
      } else if (!held && opts.style === 'active' && stakeLatch === 0) {
        const pv = previewSweep(w);
        if (pv && pv.live && pv.hits.length > 0) {
          const ripe = pv.tris.some((t) => t.ripe);
          let danger = false;
          for (const e of w.enemies) if (!e.dead && e.state === 'windup') danger = true;
          const waited = w.time - lastWhipAt > 2.7;
          if (ripe || danger || waited || !opts.patient) {
            f.stakePressed = true;
            stakeLatch = 8;
            lastWhipAt = w.time;
          }
        }
      }

      // ---- threats come first for the feet
      const threat = threatTo(w, noticed, opts.reaction);
      if (threat) {
        escapeFrom(w, threat, esc);
        f.moveX = esc.x;
        f.moveY = esc.y;
        if (threat.dur - threat.t < 0.16 && p.dashCharges > 0 && p.state !== 'dash') f.dashPressed = true;
        return f;
      }
      if (!target) return f;

      // ---- the Rod, on anything that cannot hit back right now
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const open = target.state === 'stun' || target.state === 'recover';
      if (d <= ROD.reach[0] + target.radius - 0.2 && (open || opts.style !== 'active')) {
        swingLatch = (swingLatch + 1) % 4;
        if (swingLatch === 0) f.attackPressed = true;
        f.attackHeld = true;
        return f;
      }

      // ---- the feet
      if (opts.style === 'camp' && L.plot) {
        // stand in the middle of the Plot and let the lines work
        const mx = L.plot.cx - p.x;
        const my = L.plot.cy - p.y;
        const ml = Math.hypot(mx, my);
        if (ml > 0.4) {
          f.moveX = mx / ml;
          f.moveY = my / ml;
        }
        return f;
      }
      if (open && d > ROD.reach[0] * 0.8) {
        f.moveX = dx / d;
        f.moveY = dy / d;
        return f;
      }
      // orbit the pack at a comfortable radius; turn around when the room runs out
      const ox = p.x - cx;
      const oy = p.y - cy;
      const od = Math.hypot(ox, oy) || 1;
      const want = 3.4;
      const radial = (want - od) * 0.9;
      let mx = (-oy / od) * orbitSign + (ox / od) * radial;
      let my = (ox / od) * orbitSign + (oy / od) * radial;
      const ml = Math.hypot(mx, my) || 1;
      mx /= ml;
      my /= ml;
      const ahead = { x: p.x + mx * 1.2, y: p.y + my * 1.2 };
      const tx = Math.floor(ahead.x);
      const ty = Math.floor(ahead.y);
      const blocked = tx < 0 || ty < 0 || tx >= w.room.w || ty >= w.room.h || w.room.floor[ty * w.room.w + tx] !== 1;
      if (blocked) orbitSign = -orbitSign;
      f.moveX = mx;
      f.moveY = my;
      return f;
    },
  };
}
