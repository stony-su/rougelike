// Traps in the floor. They are there so that nobody can win a fight by walking backwards in a
// circle: the ground itself has to be read. Every trap warns before it strikes, strikes exactly
// what its warning covered, and hurts whatever is there, Echoes included, so a trap is also a
// thing to throw an Echo into.
//
//   spikes   a plate that rises a moment after anything steps on it. A body in flight that comes
//            down on it is spiked at once, and that is a Return for whoever launched it.
//   knell    a post that tolls every few seconds: a ring round it that hurts and shoves outward.
//   thorn    a pipe that turns toward the nearest player and spits a bolt down a warned line.
//            The bolt is a shot like any other: a sword sends it back.
//
// Traps sleep once the chamber is cleared, so nobody is spiked while choosing a card.
import { datan2, dcos, dhypot, dsin } from '../core/dmath';
import { nearestPlayer } from './ai';
import { pushBody } from './bodies';
import { castCircle, newHit } from './cast';
import { damageEnemy, hittable, outOfReach, standing } from './combat';
import { spawnProjectile } from './projectiles';
import { addRally } from './rally';
import { POST_RADIUS } from './room';
import { strikeCircle, strikeLane } from './strikes';
import { addTelegraph, findTelegraph } from './telegraphs';
import { RALLY, SCALING, TRAP } from './tuning';
import type { Trap, World } from './types';

/** How far from the middle of its post a thorn pipe's bolt starts. */
const MUZZLE = POST_RADIUS + 0.3;

/** The traps of a chamber, as its room lays them out. Each tolls or spits out of step with the next. */
export function createTraps(w: World): Trap[] {
  return w.room.traps.map((spot, i) => ({
    id: w.nextId++,
    kind: spot.kind,
    x: spot.x,
    y: spot.y,
    state: 'idle',
    t: spot.kind === 'knell' ? 2 + ((i * 1.7) % TRAP.knellEvery) : spot.kind === 'thorn' ? 1.5 + ((i * 1.1) % TRAP.thornEvery) : 0,
    angle: 0,
    tele: 0,
  }));
}

/** True when a point is on a plate: plates are one tile square. */
const onPlate = (t: Trap, x: number, y: number): boolean => Math.abs(x - t.x) <= 0.5 && Math.abs(y - t.y) <= 0.5;

function stepSpikes(w: World, t: Trap, dt: number, mul: number): void {
  if (t.state !== 'rest') {
    // a body in flight that comes down on the plate is spiked at once, for whoever launched it
    let caught = false;
    for (const e of w.enemies) {
      if (e.state !== 'launched' || !hittable(e) || !onPlate(t, e.x, e.y)) continue;
      caught = true;
      const by = e.launchBy;
      damageEnemy(w, e, TRAP.spikeBody, { kind: 'slam', by, dx: 0, dy: -1, heavy: true });
      if (by >= 0) addRally(w, by, RALLY.weight.sent, t.x, t.y);
    }
    if (caught) {
      t.state = 'rest';
      t.t = TRAP.spikeRest;
      w.events.push({ type: 'trapStrike', kind: t.kind, id: t.id, x: t.x, y: t.y });
      return;
    }
  }
  if (t.state === 'idle') {
    let trodden = false;
    for (const p of w.players) if (standing(p) && onPlate(t, p.x, p.y)) trodden = true;
    for (const e of w.enemies) if (hittable(e) && !outOfReach(e) && e.state !== 'launched' && onPlate(t, e.x, e.y)) trodden = true;
    if (!trodden) return;
    t.state = 'warn';
    t.t = TRAP.spikeWarn;
    // the warning is the plate itself, and it carries the blow for whoever of the party is still on it
    strikeLane(w, t.x - 0.5, t.y, 0, 1, 1, { warn: TRAP.spikeWarn, damage: TRAP.spikeDamage * mul });
    w.events.push({ type: 'trapWarn', kind: t.kind, id: t.id, x: t.x, y: t.y });
    return;
  }
  t.t -= dt;
  if (t.t > 0) return;
  if (t.state === 'warn') {
    for (const e of w.enemies) if (hittable(e) && !outOfReach(e) && onPlate(t, e.x, e.y)) damageEnemy(w, e, TRAP.spikeEcho, { kind: 'other', by: -1, dx: 0, dy: -1 });
    w.events.push({ type: 'trapStrike', kind: t.kind, id: t.id, x: t.x, y: t.y });
    t.state = 'rest';
    t.t = TRAP.spikeRest;
  } else {
    t.state = 'idle';
  }
}

function stepKnell(w: World, t: Trap, dt: number, mul: number): void {
  t.t -= dt;
  if (t.t > 0) return;
  if (t.state === 'idle') {
    t.state = 'warn';
    t.t = TRAP.knellWarn;
    strikeCircle(w, t.x, t.y, TRAP.knellRadius, { warn: TRAP.knellWarn, damage: TRAP.knellDamage * mul, knock: TRAP.knellKnock });
    w.events.push({ type: 'trapWarn', kind: t.kind, id: t.id, x: t.x, y: t.y });
    return;
  }
  // it tolls: Echoes in the ring are hurt and thrown outward, like anything else there
  for (const e of w.enemies) {
    if (!hittable(e) || outOfReach(e)) continue;
    const dx = e.x - t.x;
    const dy = e.y - t.y;
    const reach = TRAP.knellRadius + e.radius;
    if (dx * dx + dy * dy > reach * reach) continue;
    const d = dhypot(dx, dy) || 1;
    damageEnemy(w, e, TRAP.knellEcho, { kind: 'other', by: -1, dx: dx / d, dy: dy / d });
    if (!e.dead) pushBody(w, e, dx / d, dy / d, TRAP.knellShove, -1);
  }
  w.events.push({ type: 'trapStrike', kind: t.kind, id: t.id, x: t.x, y: t.y });
  t.state = 'idle';
  t.t = TRAP.knellEvery - TRAP.knellWarn;
}

function stepThorn(w: World, t: Trap, dt: number, mul: number): void {
  t.t -= dt;
  const hit = newHit();
  if (t.state === 'idle') {
    if (t.t > 0) return;
    const p = nearestPlayer(w, t.x, t.y);
    const dx = p ? p.x - t.x : 0;
    const dy = p ? p.y - t.y : 0;
    // nobody in reach, or nobody it can see: it looks again in a moment
    if (
      !p ||
      dx * dx + dy * dy > TRAP.thornReach * TRAP.thornReach ||
      castCircle(w.room.geo, false, t.x + (dx / (dhypot(dx, dy) || 1)) * MUZZLE, t.y + (dy / (dhypot(dx, dy) || 1)) * MUZZLE, dx, dy, 0.16, hit)
    ) {
      t.t = 0.5;
      return;
    }
    t.state = 'warn';
    t.t = TRAP.thornWarn;
    t.angle = datan2(dy, dx);
    t.tele = addTelegraph(w, 'lane', 0, t.x, t.y, TRAP.thornWarn, { angle: t.angle, length: TRAP.thornReach, width: 0.3 }).id;
    w.events.push({ type: 'trapWarn', kind: t.kind, id: t.id, x: t.x, y: t.y });
    return;
  }
  // it follows whoever it is aiming at for a while, then holds its aim
  if (t.t > TRAP.thornWarn - TRAP.thornTrack) {
    const p = nearestPlayer(w, t.x, t.y);
    if (p) t.angle = datan2(p.y - t.y, p.x - t.x);
    const line = findTelegraph(w, t.tele);
    if (line) line.angle = t.angle;
  }
  if (t.t > 0) return;
  const c = dcos(t.angle);
  const s = dsin(t.angle);
  // it leaves from the lip of the pipe, clear of the post it stands on
  spawnProjectile(w, {
    kind: 'bolt',
    faction: 'enemy',
    owner: 0,
    x: t.x + c * MUZZLE,
    y: t.y + s * MUZZLE,
    vx: c * TRAP.thornSpeed,
    vy: s * TRAP.thornSpeed,
    radius: 0.16,
    damage: TRAP.thornDamage * mul,
    range: TRAP.thornReach + 1,
  });
  w.events.push({ type: 'trapStrike', kind: t.kind, id: t.id, x: t.x, y: t.y });
  t.state = 'idle';
  t.t = TRAP.thornEvery - TRAP.thornWarn;
}

export function stepTraps(w: World, dt: number): void {
  if (w.traps.length === 0 || w.flow.phase !== 'fight') return;
  // traps bite harder deeper into the run, as everything does
  const mul = 1 + SCALING.damagePerChamber * Math.max(0, w.chamber - 1);
  for (const t of w.traps) {
    if (t.kind === 'spikes') stepSpikes(w, t, dt, mul);
    else if (t.kind === 'knell') stepKnell(w, t, dt, mul);
    else stepThorn(w, t, dt, mul);
  }
}
