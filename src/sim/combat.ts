// Damage, knockback, stun and hit-stop: the rules every attack goes through.
import { FEEL, LINES, PLAYER } from './tuning';
import { removeTelegraph } from './telegraphs';
import type { Enemy, HitKind, World } from './types';

/** Hooks the upgrade kit installs. Behaviour, not state, so they live at module level. */
export interface CombatHooks {
  onPlayerHurt?(w: World): void;
}
let combatHooks: CombatHooks = {};
export function setCombatHooks(h: CombatHooks): void {
  combatHooks = h;
}

/** Longest freeze any single impact may request. */
const HITSTOP_CAP = 0.11;

/** Request a freeze. Requests never add up: the longest one wins. */
export function hitStop(w: World, seconds: number): void {
  w.hitstop = Math.min(HITSTOP_CAP, Math.max(w.hitstop, seconds));
}

export interface HitSource {
  kind: HitKind;
  /** Unit direction the blow travels in. */
  dx: number;
  dy: number;
  /** Knockback distance in tiles for a mass-1 enemy. */
  knock?: number;
  heavy?: boolean;
  crit?: boolean;
}

/** Knockback is applied as a velocity that decays at this exponential rate. */
export const KNOCK_DECAY = 9;

/** Deal damage to an enemy. Returns true if it died. */
export function damageEnemy(w: World, e: Enemy, amount: number, src: HitSource): boolean {
  if (e.dead || e.state === 'spawn') return false;
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
  w.stats.damageDealt += dealt;
  if (src.kind === 'rod') w.stats.rodDamage += dealt;
  else if (src.kind === 'line' || src.kind === 'discharge') w.stats.lineDamage += dealt;
  const killed = e.hp <= 0;
  w.events.push({
    type: 'hit',
    target: e.id,
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
  hitStop(w, FEEL.hitstopKill);
  w.events.push({ type: 'enemyDeath', id: e.id, kind: e.def.id, x: e.x, y: e.y, dx: e.lastHitX, dy: e.lastHitY, elite: e.elite });
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
  e.stunImmune = seconds + LINES.stunImmunity;
  w.events.push({ type: 'enemyStun', id: e.id, x: e.x, y: e.y });
  return true;
}

/** Hurt the player from a source at (sx, sy). Returns true if damage was taken. */
export function damagePlayer(w: World, amount: number, sx: number, sy: number, knock: number): boolean {
  const p = w.player;
  if (p.state === 'dead' || p.iframes > 0) return false;
  let dx = p.x - sx;
  let dy = p.y - sy;
  const d = Math.hypot(dx, dy);
  if (d > 1e-6) {
    dx /= d;
    dy /= d;
  } else {
    dx = 1;
    dy = 0;
  }
  amount *= w.mods.damageTakenMul;
  if (p.shield > 0) {
    // A shield soaks what it can; a hit that breaks it still grants the usual mercy frames.
    const soaked = Math.min(p.shield, amount);
    p.shield -= soaked;
    amount -= soaked;
    if (p.shield <= 0) w.events.push({ type: 'shield', on: false, x: p.x, y: p.y });
  }
  p.hp = Math.max(0, p.hp - amount);
  p.iframes = PLAYER.hurtIframes;
  p.hurtT = 0;
  p.kx += dx * knock * KNOCK_DECAY;
  p.ky += dy * knock * KNOCK_DECAY;
  w.stats.damageTaken += amount;
  hitStop(w, FEEL.hitstopHurt);
  w.events.push({ type: 'playerHurt', amount: Math.round(amount), x: p.x, y: p.y, dx, dy });
  combatHooks.onPlayerHurt?.(w);
  if (p.hp <= 0) {
    p.state = 'dead';
    p.stateTime = 0;
    p.vx = 0;
    p.vy = 0;
    w.events.push({ type: 'playerDeath', x: p.x, y: p.y });
  }
  return true;
}
