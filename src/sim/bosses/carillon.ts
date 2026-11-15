// The Carillon: a walking frame of five bells, at the end of the Outer Ring.
//
// It serves heavy ringing orbs. Every class can send one back with a basic attack (a swing, an
// arrow, a punch), and an orb that comes home cracks a bell: that is the fast way through its
// health. Each cracked bell makes it serve sooner and its orbs fly faster, and sets off a peal:
// Thrums are called and a ring of slow bolts spreads from it, with gaps to stand in. Anyone who
// comes close is slammed. Below two fifths of its health it serves in pairs and slams wider.
//
// What it remembers (e.mem): [0] bells cracked, [1] seconds until the next serve, [2] seconds
// until a peal lands (0 when none is coming), [3] orbs it still owes of the serve in hand.
import { TAU, datan2, dcos, dhypot, dsin } from '../../core/dmath';
import { ddamp, ddampAngle } from '../../core/exact';
import { chooseTarget, nearestPlayer, spawnEnemy, startMove } from '../ai';
import { phaseFor, setPhase } from '../boss';
import type { BossBrain } from '../boss';
import { damageEnemy } from '../combat';
import { destroyProjectile, spawnProjectile } from '../projectiles';
import { addRally } from '../rally';
import { addTelegraph } from '../telegraphs';
import { HITSTOP, RALLY } from '../tuning';
import type { Enemy, Projectile, World } from '../types';

export const CARILLON = {
  bells: 5,
  /** What an orb coming home does while there is a bell left to crack. */
  crackDamage: 70,
  /** Seconds between serves with every bell whole, how much sooner for each one cracked, and the soonest. */
  serveEvery: 6,
  serveSooner: 1,
  serveSoonest: 2.5,
  orbSpeed: 7,
  orbFaster: 1,
  /** How hard an orb leans toward whoever is nearest: the share of its heading it gives up each second. */
  orbLean: 0.9,
  /** A player this close is slammed. */
  slamRange: 3,
  /** It keeps this far from its target, walking. */
  standOff: 4.5,
  pealWarn: 0.8,
  pealThrums: 2,
  pealThrumsMost: 5,
  /** A ring of this many places, of which this many are left empty, opposite each other. */
  pealPlaces: 12,
  pealGaps: 2,
  pealSpeed: 5,
  pealDamage: 8,
  /** How close a returned orb must come to count as home. */
  home: 0.3,
};

const CRACKED = 0;
const SERVE = 1;
const PEAL = 2;
const OWED = 3;
/** The moves of its definition, by where they stand in the list. */
const MOVE_SERVE = 0;
const MOVE_SLAM = 1;
const MOVE_SLAM_WIDE = 2;

/** An orb of its own, still on its way to a player: it leans toward the nearest one, at the speed the cracked bells set. */
function conduct(w: World, e: Enemy, pr: Projectile, dt: number): void {
  const speed = CARILLON.orbSpeed + CARILLON.orbFaster * e.mem[CRACKED];
  let ux = pr.vx;
  let uy = pr.vy;
  const l = dhypot(ux, uy) || 1;
  ux /= l;
  uy /= l;
  const p = nearestPlayer(w, pr.x, pr.y);
  if (p) {
    const tx = p.x - pr.x;
    const ty = p.y - pr.y;
    const tl = dhypot(tx, ty);
    if (tl > 1e-6) {
      const k = CARILLON.orbLean * dt;
      ux += (tx / tl) * k;
      uy += (ty / tl) * k;
      const nl = dhypot(ux, uy) || 1;
      ux /= nl;
      uy /= nl;
    }
  }
  pr.vx = ux * speed;
  pr.vy = uy * speed;
}

/** An orb a player sent back has come home. */
function crack(w: World, e: Enemy, pr: Projectile): void {
  const by = pr.owner;
  const l = dhypot(pr.vx, pr.vy) || 1;
  const dx = pr.vx / l;
  const dy = pr.vy / l;
  const whole = e.mem[CRACKED] < CARILLON.bells;
  const amount = whole ? CARILLON.crackDamage : pr.damage;
  destroyProjectile(w, pr);
  if (whole) {
    e.mem[CRACKED]++;
    w.events.push({ type: 'bellCrack', id: e.id, n: e.mem[CRACKED], x: e.x, y: e.y });
  }
  damageEnemy(w, e, amount, { kind: 'return', by, dx, dy, heavy: true, crit: whole, freeze: HITSTOP.perfect });
  addRally(w, by, whole ? RALLY.weight.perfect : RALLY.weight.sent, e.x, e.y);
  if (whole && !e.dead && e.mem[PEAL] <= 0) {
    // the frame shakes, and then it peals
    e.mem[PEAL] = CARILLON.pealWarn;
    addTelegraph(w, 'circle', e.id, e.x, e.y, CARILLON.pealWarn, { radius: e.radius + 0.9, trackUntil: CARILLON.pealWarn });
  }
}

/** The peal: Thrums are called, and a ring of slow bolts spreads from the frame with two gaps in it. */
function peal(w: World, e: Enemy): void {
  const thrum = w.content.enemies.thrum;
  if (thrum) {
    let alive = 0;
    for (const o of w.enemies) if (!o.dead && o.defId === thrum.id) alive++;
    const call = Math.min(CARILLON.pealThrums + w.players.length, CARILLON.pealThrumsMost - alive);
    const marks = w.room.spawnMarks;
    const first = marks.length > 0 ? w.rng.int(0, marks.length - 1) : 0;
    for (let i = 0; i < call && marks.length > 0; i++) {
      const m = marks[(first + i) % marks.length];
      spawnEnemy(w, thrum, m.x, m.y);
    }
  }
  const gap = w.rng.int(0, CARILLON.pealPlaces - 1);
  const apart = Math.floor(CARILLON.pealPlaces / CARILLON.pealGaps);
  for (let i = 0; i < CARILLON.pealPlaces; i++) {
    if ((i - gap + CARILLON.pealPlaces) % apart === 0) continue;
    const a = (i / CARILLON.pealPlaces) * TAU;
    spawnProjectile(w, {
      kind: 'bolt',
      faction: 'enemy',
      owner: e.id,
      x: e.x,
      y: e.y,
      vx: dcos(a) * CARILLON.pealSpeed,
      vy: dsin(a) * CARILLON.pealSpeed,
      radius: 0.16,
      damage: CARILLON.pealDamage * e.damageMul,
      range: 16,
    });
  }
  w.events.push({ type: 'shockwave', x: e.x, y: e.y, radius: 3 });
}

export const CARILLON_BRAIN: BossBrain = {
  id: 'carillon',

  start(_w, e) {
    e.mem = [0, 2.2, 0, 0];
  },

  always(w, e, dt) {
    setPhase(w, e, phaseFor(e, e.def.phases ?? []));
    const reach = e.radius + CARILLON.home;
    for (const pr of w.projectiles) {
      if (pr.dead || pr.kind !== 'orb') continue;
      if (pr.faction === 'enemy') {
        if (pr.owner === e.id) conduct(w, e, pr, dt);
      } else if ((pr.x - e.x) * (pr.x - e.x) + (pr.y - e.y) * (pr.y - e.y) <= (reach + pr.radius) * (reach + pr.radius)) {
        crack(w, e, pr);
        if (e.dead) return;
      }
    }
    if (e.mem[SERVE] > 0) e.mem[SERVE] -= dt;
    if (e.mem[PEAL] > 0) {
      e.mem[PEAL] -= dt;
      if (e.mem[PEAL] <= 0) {
        e.mem[PEAL] = 0;
        peal(w, e);
      }
    }
  },

  decide(w, e, dt) {
    const p = chooseTarget(w, e);
    if (!p) {
      e.vx = ddamp(e.vx, 0, 10, dt);
      e.vy = ddamp(e.vy, 0, 10, dt);
      return;
    }
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = dhypot(dx, dy) || 1e-6;
    e.facing = ddampAngle(e.facing, datan2(dy, dx), 6, dt);
    // it walks after its target, and stops a little way off: it has no need to come closer
    const go = dist > CARILLON.standOff ? e.def.speed * e.speedMul : 0;
    e.vx = ddamp(e.vx, (dx / dist) * go, 8, dt);
    e.vy = ddamp(e.vy, (dy / dist) * go, 8, dt);
    e.state = go > 0 ? 'move' : 'idle';

    // whoever comes close is slammed
    const slam = e.phase > 0 ? MOVE_SLAM_WIDE : MOVE_SLAM;
    let near = false;
    for (const q of w.players) if (q.state !== 'down' && (q.x - e.x) * (q.x - e.x) + (q.y - e.y) * (q.y - e.y) < CARILLON.slamRange * CARILLON.slamRange) near = true;
    if (near && e.cooldowns[slam] <= 0) {
      startMove(w, e, slam, p);
      return;
    }
    if (e.mem[OWED] > 0) {
      e.mem[OWED]--;
      startMove(w, e, MOVE_SERVE, p);
      return;
    }
    if (e.mem[SERVE] <= 0) {
      // in pairs for a party, and for anyone once it is hurt enough
      e.mem[OWED] = w.players.length > 1 || e.phase > 0 ? 1 : 0;
      e.mem[SERVE] = Math.max(CARILLON.serveSoonest, CARILLON.serveEvery - CARILLON.serveSooner * e.mem[CRACKED]);
      startMove(w, e, MOVE_SERVE, p);
    }
  },
};
