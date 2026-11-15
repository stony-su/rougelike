// Damage, stun and hit-stop: the rules every attack goes through. Blows that move a body are in
// bodies.ts; this file only takes health away and says what happened.
import { dcos, dhypot, dsin } from '../core/dmath';
import { applyBurn, applyChill, clearElements } from './conditions';
import { removeTelegraph } from './telegraphs';
import { BOSS, FREEZE, KNOCK_DECAY, PLAYER, RALLY, RIPOSTE, STUN_IMMUNITY, TRAIT, TUNE } from './tuning';
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
  /** Heavy enough to open a shield and land anyway (a full Haymaker). */
  breaks?: boolean;
  /** It flew here: an arrow, or a shot sent back. Such a thing knocks a flyer out of the air. */
  shot?: boolean;
}

/** In the air and out of reach of ground blows. A flyer comes within reach while it swoops in its own attack. */
export const outOfReach = (e: Enemy): boolean => e.airborne && e.state !== 'attack';

/** True while an Echo that carries a shield has it up: it is on guard, not in the middle of its own blow or paying for one. */
export const onGuard = (e: Enemy): boolean => !!e.def.shield && e.guardOpen <= 0 && e.staggered <= 0 && (e.state === 'idle' || e.state === 'move' || e.state === 'windup');

/** A Return is a hit delivered by something sent back: a returned shot, a slam, a carom, a ring-out. */
export const isReturn = (kind: HitKind): boolean => kind === 'return' || kind === 'slam' || kind === 'carom' || kind === 'ringout';

function bySlot(w: World, slot: number): Player | null {
  for (const p of w.players) if (p.slot === slot) return p;
  return null;
}

/** A ring of force from a Tuning: everything within `radius` of the point is hurt once. Returns how many were struck. */
export function burstAt(w: World, x: number, y: number, radius: number, damage: number, by: number, what: string): number {
  w.events.push({ type: 'burst', by, x, y, radius, what });
  let struck = 0;
  for (const e of w.enemies) {
    if (!hittable(e)) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const reach = radius + e.radius;
    if (dx * dx + dy * dy > reach * reach) continue;
    const d = dhypot(dx, dy) || 1;
    damageEnemy(w, e, damage, { kind: 'burst', by, dx: dx / d, dy: dy / d });
    struck++;
  }
  return struck;
}

/** What a player's Tunings leave on an Echo that one of their Returns has just struck. */
function riders(w: World, e: Enemy, p: Player): void {
  const m = p.mods;
  if (m.ember > 0) applyBurn(e, m.ember, TUNE.elementTime);
  if (m.frost > 0) applyChill(e, m.frost, TUNE.elementTime);
  // Steam: fire and frost on one body burst, and both are spent
  if (m.steam > 0 && e.status.steamT <= 0 && e.status.burnT > 0 && e.status.chillT > 0) {
    clearElements(e);
    e.status.steamT = TUNE.steamRest;
    burstAt(w, e.x, e.y, TUNE.steamRadius, TUNE.steamDamage, p.slot, 'steam');
    if (!e.dead) stunEnemy(w, e, TUNE.steamStun, true);
  }
}

/** Deal damage to an enemy. Returns true if it died. */
export function damageEnemy(w: World, e: Enemy, amount: number, src: HitSource): boolean {
  if (!hittable(e)) return false;
  // A shield: a blow or a shot that meets it from the front does nothing, unless it is heavy enough to open it.
  const sh = e.def.shield;
  if (sh && onGuard(e) && (src.kind === 'direct' || src.kind === 'return') && -(src.dx * dcos(e.facing) + src.dy * dsin(e.facing)) > dcos(sh.arc)) {
    if (!src.breaks) {
      w.events.push({ type: 'clang', id: e.id, by: src.by, x: e.x, y: e.y });
      return false;
    }
    e.guardOpen = sh.open;
    w.events.push({ type: 'armorBreak', id: e.id, x: e.x, y: e.y });
  }
  // A flyer: anything shot at it, or a blow that catches it in its swoop, knocks it out of the air.
  let felled = false;
  if (e.def.flying && e.airborne && (src.shot || e.state === 'attack')) {
    e.airborne = false;
    e.groundedT = e.def.flying.grounded;
    felled = true;
    w.events.push({ type: 'grounded', id: e.id, x: e.x, y: e.y });
  }
  let crit = !!src.crit;
  const p = src.by >= 0 ? bySlot(w, src.by) : null;
  const returned = isReturn(src.kind);
  if (p) {
    // Afterimage: for a while after a dash through an attack, everything this player does hits harder
    if (p.afterT > 0) amount *= 1 + p.mods.afterimage;
    if (returned) {
      if (p.opening && p.mods.openingRally > 0) {
        // Opening Note: the first Return of a chamber
        amount *= TUNE.openingCrit;
        crit = true;
      } else if (p.mods.perfectPitch > 0 && p.rally >= RALLY.cap) {
        amount *= TUNE.perfectPitch;
        crit = true;
      }
    }
  }
  // what it takes of this kind of blow (a boss's phases change it; for nearly everything it is all of it)
  amount *= returned ? e.takeReturn : src.kind === 'direct' ? e.takeDirect : 1;
  if (e.def.boss) {
    // A boss is never stunned, but Returns landed one after another stagger it: it stops, and takes more.
    if (e.staggered > 0) {
      amount *= BOSS.staggerBonus;
    } else if (returned && src.by >= 0 && e.stunImmune <= 0) {
      e.stagger++;
      e.staggerT = BOSS.staggerFade;
      if (e.stagger >= BOSS.staggerAt) {
        e.stagger = 0;
        e.staggerT = 0;
        e.staggered = BOSS.staggerTime;
        e.stunImmune = BOSS.staggerTime + BOSS.staggerRest;
        e.vx = 0;
        e.vy = 0;
        e.state = 'stun';
        e.stateTime = 0;
        e.stateDur = BOSS.staggerTime;
        w.events.push({ type: 'stagger', id: e.id, x: e.x, y: e.y });
      }
    }
  }
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
    crit,
    dx: src.dx,
    dy: src.dy,
    killed,
  });
  if (killed) killEnemy(w, e);
  else {
    if (felled) stunEnemy(w, e, TRAIT.groundStun, true);
    if (p && returned) riders(w, e, p);
  }
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
  // whatever it had warned of dies with it: no strike lands for a boss that has fallen
  for (const t of w.telegraphs) if (t.owner === e.id && !t.struck) t.dead = true;
  w.stats.kills++;
  w.deaths.push({ x: e.x, y: e.y, defId: e.defId, elite: e.elite, mate: e.mate, maxHp: e.maxHp });
  w.events.push({ type: 'enemyDeath', id: e.id, kind: e.defId, x: e.x, y: e.y, dx: e.lastHitX, dy: e.lastHitY, elite: e.elite });
}

/** Cut short whatever an enemy was doing: its warning goes, and the move it was making goes on a short cooldown. */
export function interruptEnemy(w: World, e: Enemy): void {
  removeTelegraph(w, e.telegraph);
  e.telegraph = 0;
  if (e.move >= 0 && e.move < e.cooldowns.length) e.cooldowns[e.move] = Math.max(e.cooldowns[e.move], 0.7);
  e.move = -1;
  e.vx = 0;
  e.vy = 0;
}

/**
 * Stun an enemy, cancelling whatever it was doing. Returns false if it is immune right now.
 * `force` ignores the immunity (a stagger, a climb out of a pit).
 */
export function stunEnemy(w: World, e: Enemy, seconds: number, force = false): boolean {
  // a boss is never stunned: nothing may take its turns away
  if (!hittable(e) || e.state === 'launched' || e.def.boss) return false;
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
  if (p.iframes > 0) {
    // Afterimage: a dash that carries the player through an attack
    if (p.state === 'dash' && p.mods.afterimage > 0 && !p.dodged) {
      p.dodged = true;
      p.afterT = TUNE.afterimageTime;
      w.events.push({ type: 'afterimage', player: p.slot, x: p.x, y: p.y });
    }
    return HURT_NONE;
  }
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
  if (p.hp <= 0 && p.wardLeft > 0) {
    // Echo Ward: the blow that would have downed them leaves them standing, and answers
    p.wardLeft--;
    p.hp = 1;
    p.iframes = TUNE.wardIframes;
    w.events.push({ type: 'ward', player: p.slot, x: p.x, y: p.y });
    burstAt(w, p.x, p.y, TUNE.wardRadius, TUNE.wardDamage, p.slot, 'ward');
  }
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
