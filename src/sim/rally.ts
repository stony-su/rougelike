// Rally: the meter that Returns build. Every hit delivered by something sent back adds to the
// Rally of the player who sent it, and every point makes that player's Returns hit harder. The
// Tunings that ride on Rally live here too: it can step down instead of breaking (Sustain), throw
// a healing ring every so many points (Overtone), and call lightning (Storm Return).
import { dhypot } from '../core/dmath';
import { burstAt, damageEnemy, hittable } from './combat';
import { RALLY, TUNE } from './tuning';
import type { Enemy, Player, World } from './types';

export const playerBySlot = (w: World, slot: number): Player | null => {
  for (const p of w.players) if (p.slot === slot) return p;
  return null;
};

/** What a Return by this player is multiplied by right now. A hit nobody sent (slot -1) is not multiplied. */
export function rallyMul(w: World, slot: number): number {
  const p = playerBySlot(w, slot);
  return p ? 1 + RALLY.perPoint * p.rally : 1;
}

/** Lightning from a point to the nearest Echo, and on from each Echo to the next, `links` times. */
export function chainLightning(w: World, by: number, x: number, y: number, links: number, damage: number): void {
  const struck: number[] = [];
  let fx = x;
  let fy = y;
  for (let i = 0; i < links; i++) {
    let best: Enemy | null = null;
    let bestD = TUNE.stormReach * TUNE.stormReach;
    for (const e of w.enemies) {
      if (!hittable(e) || struck.includes(e.id)) continue;
      const d = (e.x - fx) * (e.x - fx) + (e.y - fy) * (e.y - fy);
      // the first one found wins a tie, and enemies are always walked in the same order
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) return;
    struck.push(best.id);
    const dx = best.x - fx;
    const dy = best.y - fy;
    const d = dhypot(dx, dy) || 1;
    w.events.push({ type: 'bolt', by, fromX: fx, fromY: fy, toX: best.x, toY: best.y });
    fx = best.x;
    fy = best.y;
    damageEnemy(w, best, damage, { kind: 'other', by, dx: dx / d, dy: dy / d });
  }
}

/** Overtone: a ring round the player that hurts what it touches and gives a little health back. */
function overtone(w: World, p: Player): void {
  const m = p.mods;
  if (m.cascade > 0) {
    // Cascade: the ring also strikes everything it touches with Storm lightning
    for (const e of w.enemies) {
      if (!hittable(e)) continue;
      const reach = TUNE.overtoneRadius + e.radius;
      if ((e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y) > reach * reach) continue;
      w.events.push({ type: 'bolt', by: p.slot, fromX: p.x, fromY: p.y, toX: e.x, toY: e.y });
      damageEnemy(w, e, m.stormDamage, { kind: 'other', by: p.slot, dx: 0, dy: -1 });
    }
  }
  burstAt(w, p.x, p.y, TUNE.overtoneRadius, TUNE.overtoneDamage, p.slot, 'overtone');
  if (p.state !== 'down' && p.hp < p.maxHp) {
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + m.overtoneHeal);
    w.events.push({ type: 'heal', player: p.slot, amount: p.hp - before, x: p.x, y: p.y });
  }
}

/** Count a Return of the given weight for a player. Call it after the hit, so the hit used the Rally before it. */
export function addRally(w: World, slot: number, weight: number, x: number, y: number): void {
  const p = playerBySlot(w, slot);
  if (!p) return;
  const m = p.mods;
  // Opening Note: the first Return of a chamber starts Rally high (the hit itself was doubled in combat.ts)
  if (p.opening) {
    p.opening = false;
    if (m.openingRally > p.rally) p.rally = m.openingRally;
  }
  p.rally = Math.min(RALLY.cap, p.rally + weight);
  p.rallyT = 0;
  p.sustainT = 0;
  w.stats.returns++;
  if (p.rally > w.stats.bestRally) w.stats.bestRally = p.rally;
  w.events.push({ type: 'rally', player: slot, value: p.rally, weight, x, y });
  if (m.overtoneEvery > 0) {
    p.overtoneAcc += weight;
    if (p.overtoneAcc >= m.overtoneEvery) {
      p.overtoneAcc -= m.overtoneEvery;
      overtone(w, p);
    }
  }
  if (m.stormEvery > 0) {
    p.stormAcc += weight;
    if (p.stormAcc >= m.stormEvery) {
      p.stormAcc -= m.stormEvery;
      chainLightning(w, slot, x, y, m.stormChain, m.stormDamage);
    }
  }
}

/** Rally falls to nothing after a while without a Return, or, with Sustain, steps down a point at a time. */
export function stepRally(w: World, p: Player, dt: number): void {
  if (p.rally <= 0) return;
  p.rallyT += dt;
  if (p.rallyT < RALLY.hold) return;
  if (p.mods.sustain > 0) {
    p.sustainT += dt;
    if (p.sustainT < p.mods.sustain) return;
    p.sustainT = 0;
    p.rally -= 1;
    if (p.rally <= 0) {
      p.rally = 0;
      w.events.push({ type: 'rallyBreak', player: p.slot, value: 1 });
    }
    return;
  }
  w.events.push({ type: 'rallyBreak', player: p.slot, value: p.rally });
  p.rally = 0;
}
