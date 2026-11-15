// Damage, stun and hit-stop: the rules every attack goes through. Blows that move a body are in
// bodies.ts; this file only takes health away and says what happened.
import { dhypot } from '../core/dmath';
import { removeTelegraph } from './telegraphs';
import { FREEZE, KNOCK_DECAY, PLAYER, RIPOSTE, STUN_IMMUNITY } from './tuning';
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

/** True while an enemy can be struck: it has arrived, it is alive, and it is not down a pit. */
export const hittable = (e: Enemy): boolean => !e.dead && e.state !== 'spawn' && e.state !== 'pit';

export interface HitSource {
  kind: HitKind;
  /** The player slot that dealt it, or -1. */
  by: number;
  /** Unit direction the blow travels in. */
  dx: number;
  dy: number;
  heavy?: boolean;
  crit?: boolean;
  /** Ticks the struck body freezes. */
  freeze?: number;
}

/** Deal damage to an enemy. Returns true if it died. */
export function damageEnemy(w: World, e: Enemy, amount: number, src: HitSource): boolean {
  if (!hittable(e)) return false;
  if (e.status.markT > 0) amount *= 1 + e.status.markBonus;
  if (e.armor < 1) {
    // Armour holds until the body is bounced off something; the breaking blow lands in full.
    if (src.kind === 'slam' || src.kind === 'carom' || src.kind === 'ringout') {
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

/** Cut short whatever an enemy was doing: its warning goes, and the move it was making goes on a short cooldown. */
export function interruptEnemy(w: World, e: Enemy): void {
  removeTelegraph(w, e.telegraph);
  e.telegraph = 0;
  if (e.move >= 0) e.cooldowns[e.move] = Math.max(e.cooldowns[e.move], 0.7);
  e.move = -1;
  e.vx = 0;
  e.vy = 0;
}

/**
 * Stun an enemy, cancelling whatever it was doing. Returns false if it is immune right now.
 * `force` ignores the immunity (a stagger, a climb out of a pit).
 */
export function stunEnemy(w: World, e: Enemy, seconds: number, force = false): boolean {
  if (!hittable(e) || e.state === 'launched') return false;
  if (!force && e.stunImmune > 0) return false;
  interruptEnemy(w, e);
  e.state = 'stun';
  e.stateTime = 0;
  e.stateDur = seconds;
  e.stunImmune = seconds + STUN_IMMUNITY;
  w.events.push({ type: 'enemyStun', id: e.id, x: e.x, y: e.y });
  return true;
}

/** True while a player can be targeted, hit and counted as standing. */
export const standing = (p: Player): boolean => p.state !== 'down';

/** What became of a blow aimed at a player. */
export const HURT_NONE = 0;
export const HURT_TAKEN = 1;
/** It landed in a Riposte: no damage was done, and whoever struck should answer for it. */
export const HURT_GUARDED = 2;

/**
 * Hurt a player from a source at (sx, sy). Returns HURT_TAKEN if damage was done, HURT_GUARDED if
 * it landed in a Riposte (the caller sends the blow back), HURT_NONE if it passed harmlessly.
 */
export function damagePlayer(w: World, p: Player, amount: number, sx: number, sy: number, knock: number): number {
  if (p.state === 'down') return HURT_NONE;
  if (p.guardT > 0) {
    if (!p.guardHit) {
      p.guardHit = true;
      p.specialCd *= 1 - RIPOSTE.refund;
    }
    p.iframes = Math.max(p.iframes, p.guardT + RIPOSTE.iframes);
    w.events.push({ type: 'riposte', player: p.slot, x: p.x, y: p.y });
    return HURT_GUARDED;
  }
  if (p.iframes > 0) return HURT_NONE;
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
    p.charge = 0;
    p.guardT = 0;
    p.reviveT = 0;
    freezeWorld(w, FREEZE.playerDown);
    w.events.push({ type: 'playerDown', player: p.slot, x: p.x, y: p.y });
  }
  return HURT_TAKEN;
}
