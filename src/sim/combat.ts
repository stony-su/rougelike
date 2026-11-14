// Damage, knockback, stun and hit-stop: the rules every attack goes through.
import { dhypot } from '../core/dmath';
import { removeTelegraph } from './telegraphs';
import { FREEZE, KNOCK_DECAY, PLAYER, STUN_IMMUNITY } from './tuning';
import type { Enemy, HitKind, Player, World } from './types';

/**
 * Hit-stop is per body: the striker and the struck freeze for a few ticks while the rest of the
 * chamber keeps moving, so one player's hits never stall another's timing. Requests never add
 * up: the longest one wins.
 */
export function freezeBody(body: { freeze: number }, ticks: number): void {
  if (ticks > body.freeze) body.freeze = ticks;
}

/** A whole-chamber freeze, for moments the party shares. Rate-limited. */
export function freezeWorld(w: World, ticks: number): void {
  if (w.tick < w.freezeAllowedAt) return;
  w.freeze = Math.max(w.freeze, ticks);
  w.freezeAllowedAt = w.tick + FREEZE.spacing;
}

export interface HitSource {
  kind: HitKind;
  /** The player slot that dealt it, or -1. */
  by: number;
  /** Unit direction the blow travels in. */
  dx: number;
  dy: number;
  /** Knockback distance in tiles for a mass-1 enemy. */
  knock?: number;
  heavy?: boolean;
  crit?: boolean;
  /** Ticks the struck body freezes. */
  freeze?: number;
}

/** Deal damage to an enemy. Returns true if it died. */
export function damageEnemy(w: World, e: Enemy, amount: number, src: HitSource): boolean {
  if (e.dead || e.state === 'spawn') return false;
  if (e.status.markT > 0) amount *= 1 + e.status.markBonus;
  if (e.armor < 1) {
    // Armour holds until something slams it; the breaking blow lands in full.
    if (src.kind === 'slam' || src.kind === 'carom') {
      e.armor = 1;
      w.events.push({ type: 'armorBreak', id: e.id, x: e.x, y: e.y });
    } else {
      amount *= e.armor;
    }
  }
  const dealt = Math.max(0, Math.min(e.hp, amount));
  e.hp -= amount;
  e.hurtT = 0;
  e.lastHitX = src.dx;
  e.lastHitY = src.dy;
  if (src.knock) {
    // An impulse v0 that decays at rate k travels v0 / k in total.
    const v0 = (src.knock * KNOCK_DECAY) / e.def.mass;
    e.kx += src.dx * v0;
    e.ky += src.dy * v0;
  }
  if (src.freeze) freezeBody(e, src.freeze);
  w.stats.damageDealt += dealt;
  const killed = e.hp <= 0;
  w.events.push({
    type: 'hit',
    target: e.id,
    by: src.by,
    x: e.x,
    y: e.y,
    amount: Math.round(amount),
    kind: src.kind,
    heavy: !!src.heavy,
    crit: !!src.crit,
    dx: src.dx,
    dy: src.dy,
    killed,
  });
  if (killed) killEnemy(w, e);
  return killed;
}

export function killEnemy(w: World, e: Enemy): void {
  if (e.dead) return;
  e.dead = true;
  e.hp = 0;
  e.state = 'dead';
  e.stateTime = 0;
  removeTelegraph(w, e.telegraph);
  e.telegraph = 0;
  w.stats.kills++;
  w.deaths.push({ x: e.x, y: e.y, defId: e.defId, elite: e.elite });
  w.events.push({ type: 'enemyDeath', id: e.id, kind: e.defId, x: e.x, y: e.y, dx: e.lastHitX, dy: e.lastHitY, elite: e.elite });
}

/** Stun an enemy, cancelling whatever it was doing. Returns false if it is immune right now. */
export function stunEnemy(w: World, e: Enemy, seconds: number): boolean {
  if (e.dead || e.state === 'spawn' || e.stunImmune > 0) return false;
  removeTelegraph(w, e.telegraph);
  e.telegraph = 0;
  if (e.move >= 0) e.cooldowns[e.move] = Math.max(e.cooldowns[e.move], 0.7);
  e.move = -1;
  e.state = 'stun';
  e.stateTime = 0;
  e.stateDur = seconds;
  e.vx = 0;
  e.vy = 0;
  e.stunImmune = seconds + STUN_IMMUNITY;
  w.events.push({ type: 'enemyStun', id: e.id, x: e.x, y: e.y });
  return true;
}

/** True while a player can be targeted, hit and counted as standing. */
export const standing = (p: Player): boolean => p.state !== 'down';

/** Hurt a player from a source at (sx, sy). Returns true if damage was taken. */
export function damagePlayer(w: World, p: Player, amount: number, sx: number, sy: number, knock: number): boolean {
  if (p.state === 'down' || p.iframes > 0) return false;
  let dx = p.x - sx;
  let dy = p.y - sy;
  const d = dhypot(dx, dy);
  if (d > 1e-6) {
    dx /= d;
    dy /= d;
  } else {
    dx = 1;
    dy = 0;
  }
  p.hp = Math.max(0, p.hp - amount);
  p.iframes = PLAYER.hurtIframes;
  p.hurtT = 0;
  p.kx += dx * knock * KNOCK_DECAY;
  p.ky += dy * knock * KNOCK_DECAY;
  w.stats.damageTaken += amount;
  freezeBody(p, FREEZE.hurt);
  w.events.push({ type: 'playerHurt', player: p.slot, amount: Math.round(amount), x: p.x, y: p.y, dx, dy });
  if (p.hp <= 0) {
    p.state = 'down';
    p.stateTime = 0;
    p.vx = 0;
    p.vy = 0;
    freezeWorld(w, FREEZE.playerDown);
    w.events.push({ type: 'playerDown', player: p.slot, x: p.x, y: p.y });
  }
  return true;
}
