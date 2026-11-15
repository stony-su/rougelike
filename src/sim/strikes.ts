// Strikes: warnings that land by themselves. A telegraph that carries damage hurts every player
// it covers at the moment its warning runs out, with no body behind it. Bosses lay their
// patterns out of these (a disc, a ring with a safe middle, a lane, a cone), and so do the traps
// in the floor. What is drawn is what lands, as with every other warning.
import { damagePlayer, standing } from './combat';
import { addTelegraph, telegraphCovers } from './telegraphs';
import type { Telegraph, World } from './types';

export interface StrikeSpec {
  /** Seconds of warning before it lands. */
  warn: number;
  damage: number;
  /** How hard those it hits are shoved away from its middle. */
  knock?: number;
  /** Whose it is: an enemy's id (it is cancelled if that enemy dies), or 0. */
  owner?: number;
}

/** A disc. With `inner`, a ring: everyone closer to the middle than that is safe. */
export function strikeCircle(w: World, x: number, y: number, radius: number, s: StrikeSpec, inner = 0): Telegraph {
  return addTelegraph(w, 'circle', s.owner ?? 0, x, y, s.warn, { radius, inner, damage: s.damage, knock: s.knock ?? 0 });
}

/** A strip from a point along an angle. */
export function strikeLane(w: World, x: number, y: number, angle: number, length: number, width: number, s: StrikeSpec): Telegraph {
  return addTelegraph(w, 'lane', s.owner ?? 0, x, y, s.warn, { angle, length, width, damage: s.damage, knock: s.knock ?? 0 });
}

/** A wedge from a point along an angle. */
export function strikeCone(w: World, x: number, y: number, angle: number, radius: number, halfArc: number, s: StrikeSpec): Telegraph {
  return addTelegraph(w, 'cone', s.owner ?? 0, x, y, s.warn, { angle, radius, halfArc, damage: s.damage, knock: s.knock ?? 0 });
}

/** Land every strike whose warning runs out this tick. Called once a tick, before the warnings are aged. */
export function stepStrikes(w: World, dt: number): void {
  // only the warnings that exist now: anything a strike sets off belongs to a later tick
  const n = w.telegraphs.length;
  for (let i = 0; i < n; i++) {
    const t = w.telegraphs[i];
    if (t.dead || t.struck || t.damage <= 0 || t.t + dt < t.dur) continue;
    t.struck = true;
    for (const p of w.players) {
      if (!standing(p) || !telegraphCovers(t, p.x, p.y, p.radius)) continue;
      damagePlayer(w, p, t.damage, t.x, t.y, t.knock);
    }
    w.events.push({ type: 'strike', shape: t.shape, x: t.x, y: t.y, angle: t.angle, radius: t.radius, inner: t.inner, length: t.length, width: t.width });
  }
}
