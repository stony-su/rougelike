// The Carillon: a walking frame of five bells that holds the last chamber of the Outer Ring.
//
// It never rests for long. It runs through a rotation of patterns, each warned on the floor
// before it lands, and between them only a breath:
//
//   Serve    a fan of heavy ringing orbs. Every class can send one home with a basic attack (a
//            swing, an arrow, a punch), and an orb that comes home cracks a bell.
//   Marks    a circle under every player, again and again: keep walking.
//   Peal     rings of bolts spreading from the frame, each with gaps that have moved.
//   Toll     a slam round the frame, then a ring further out: step away, then step in.
//   Cross    four long strips through the frame, then four more between them.
//   Leap     it comes down where someone stands, and peals as it lands.
//
// Every cracked bell calls Thrums and makes its orbs fly faster. Below half its health it changes
// phase: the breaths between patterns are shorter, there is more of everything, and circles fall
// while it serves.
//
// What it remembers (e.mem): [0] bells cracked, [1] where it is in its rotation, [2] seconds into
// the pattern in hand, [3] seconds of breath left, [4] an angle the pattern in hand was aimed
// along, [5] and [6] a point it was aimed at, [7] a warning it is still steering (its id), [8] how
// many times it has tolled, [9] seconds the frame is still ringing from its last cracked bell.
import { TAU, datan2, dcos, dhypot, dsin } from '../../core/dmath';
import { ddamp, ddampAngle } from '../../core/exact';
import { chooseTarget, nearestPlayer, setState, spawnEnemy } from '../ai';
import { phaseFor, setPhase } from '../boss';
import type { BossBrain } from '../boss';
import { damageEnemy, standing } from '../combat';
import { destroyProjectile, spawnProjectile } from '../projectiles';
import { addRally } from '../rally';
import { clampToFloor } from '../room';
import { strikeCircle, strikeLane } from '../strikes';
import { addTelegraph, findTelegraph, laneAngle } from '../telegraphs';
import { HITSTOP, RALLY } from '../tuning';
import type { Enemy, Player, Projectile, World } from '../types';

/** One number for each phase: before half its health, and after. */
type ByPhase = readonly [number, number];

export const CARILLON = {
  bells: 5,
  /** What an orb coming home does when it cracks a bell. */
  crackDamage: 60,
  /**
   * After a bell cracks the frame rings for this long, and an orb that comes home meanwhile only
   * knocks on it. So a fan of orbs sent back in one swing cracks one bell, not three: the bells
   * take five serves, however many hands there are.
   */
  ringing: 3,
  /** What an orb coming home does when it cracks nothing. */
  knockDamage: 22,
  /** Seconds of breath between one pattern and the next. */
  rest: [0.8, 0.4] as ByPhase,

  orbs: [3, 5] as ByPhase,
  /** The whole angle the fan of orbs is spread over. */
  orbSpread: [0.7, 1.2] as ByPhase,
  orbWarn: 0.75,
  orbSpeed: 7.5,
  /** How much faster the orbs fly for each cracked bell. */
  orbFaster: 0.7,
  orbDamage: 12,
  /** How hard an orb leans toward whoever is nearest: the share of its heading it gives up each second. */
  orbLean: 0.8,
  /** How close a returned orb must come to count as home. */
  home: 0.3,

  marks: [3, 5] as ByPhase,
  markEvery: 0.5,
  markRadius: 1.7,
  markWarn: 0.8,
  markDamage: 12,

  pealRings: [3, 4] as ByPhase,
  pealEvery: 0.55,
  pealTell: 0.5,
  /** A ring of this many places, of which this many are left empty, opposite each other. */
  pealPlaces: 16,
  pealGaps: 2,
  pealSpeed: 6.5,
  pealDamage: 7,

  tollInner: 4.2,
  tollOuter: 8,
  tollWarn: 0.85,
  tollDamage: 15,
  tollKnock: 8,

  crossLength: 15,
  crossWidth: 2.2,
  crossWarn: 0.9,
  /** How long after the first four strips the four between them are drawn. */
  crossSecond: 0.55,
  crossDamage: 13,

  leapRadius: 3.2,
  leapWarn: 1.0,
  /** For this long the circle follows whoever it is for; then it stays. */
  leapTrack: 0.5,
  leapDamage: 17,
  leapKnock: 9,

  thrums: 1,
  thrumsMost: 4,
  /** It walks after its target between patterns if they are further off than this. */
  standOff: 5,
};

const CRACKED = 0;
const AT = 1;
const TIME = 2;
const REST = 3;
const ANGLE = 4;
const AIM_X = 5;
const AIM_Y = 6;
const STEERED = 7;
const TOLLS = 8;
const RINGING = 9;

type Pattern = 'serve' | 'marks' | 'peal' | 'toll' | 'cross' | 'leap';
/** The rotation of each phase. */
const ROTATION: ReadonlyArray<readonly Pattern[]> = [
  ['serve', 'marks', 'peal', 'toll', 'serve', 'cross', 'leap'],
  ['serve', 'cross', 'peal', 'leap', 'marks', 'toll'],
];
/** Which set of poses the rig plays for each pattern: 0 rears back and rings a bell, 1 rises and drops. */
const POSE: Readonly<Record<Pattern, number>> = { serve: 0, marks: 0, peal: 0, toll: 1, cross: 1, leap: 1 };

const phaseOf = (e: Enemy): number => (e.phase > 0 ? 1 : 0);

/** A ring of bolts from the frame, with its gaps starting at place `gap`. */
function ringOfBolts(w: World, e: Enemy, gap: number): void {
  const apart = Math.floor(CARILLON.pealPlaces / CARILLON.pealGaps);
  for (let i = 0; i < CARILLON.pealPlaces; i++) {
    const from = (((i - gap) % apart) + apart) % apart;
    // each gap is two places wide: room to stand in, not just to slip through
    if (from === 0 || from === 1) continue;
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
      range: 18,
    });
  }
  w.events.push({ type: 'shockwave', x: e.x, y: e.y, radius: e.radius + 1.2 });
}

/** The player furthest from the frame, so that nobody is ever simply out of its reach. */
function furthest(w: World, e: Enemy): Player | null {
  let best: Player | null = null;
  let bd = -1;
  for (const p of w.players) {
    if (!standing(p)) continue;
    const d = (p.x - e.x) * (p.x - e.x) + (p.y - e.y) * (p.y - e.y);
    if (d > bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** True on the one tick the pattern's clock passes `at`. */
const passes = (t: number, dt: number, at: number): boolean => t - dt < at && t >= at;

/**
 * Run the pattern in hand for one tick. `t` is how long it has been running, this tick included
 * (so the tick it begins on has `t === dt`). Returns true when it is over.
 */
function run(w: World, e: Enemy, what: Pattern, t: number, dt: number): boolean {
  const ph = phaseOf(e);
  const first = t <= dt;
  const mul = e.damageMul;
  switch (what) {
    case 'serve': {
      if (first) {
        const p = chooseTarget(w, e);
        e.mem[ANGLE] = p ? datan2(p.y - e.y, p.x - e.x) : e.facing;
        // the lines the orbs will fly: they follow the target for a while, then stay
        const fan = addTelegraph(w, 'lane', e.id, e.x, e.y, CARILLON.orbWarn, { angle: e.mem[ANGLE], length: 13, width: 0.9, count: CARILLON.orbs[ph], spread: CARILLON.orbSpread[ph] });
        e.mem[STEERED] = fan.id;
        setState(e, 'windup', CARILLON.orbWarn);
      }
      const fan = findTelegraph(w, e.mem[STEERED]);
      if (fan && t < CARILLON.orbWarn * 0.6) {
        const p = chooseTarget(w, e);
        if (p) e.mem[ANGLE] = datan2(p.y - e.y, p.x - e.x);
        fan.angle = e.mem[ANGLE];
        fan.x = e.x;
        fan.y = e.y;
      }
      if (passes(t, dt, CARILLON.orbWarn)) {
        const count = CARILLON.orbs[ph];
        const shape = { angle: e.mem[ANGLE], count, spread: CARILLON.orbSpread[ph] };
        for (let i = 0; i < count; i++) {
          const a = laneAngle(shape, i);
          spawnProjectile(w, {
            kind: 'orb',
            faction: 'enemy',
            owner: e.id,
            x: e.x,
            y: e.y,
            vx: dcos(a) * CARILLON.orbSpeed,
            vy: dsin(a) * CARILLON.orbSpeed,
            radius: 0.45,
            damage: CARILLON.orbDamage * mul,
            range: 70,
            bounces: 3,
          });
        }
        w.events.push({ type: 'enemyAttack', id: e.id, kind: e.defId, move: 'serve', x: e.x, y: e.y });
        setState(e, 'attack', 0.3);
      }
      // in its second phase circles fall while the orbs are in the air
      if (ph > 0 && passes(t, dt, CARILLON.orbWarn + 0.35))
        for (const p of w.players) if (standing(p)) strikeCircle(w, p.x, p.y, CARILLON.markRadius, { warn: CARILLON.markWarn, damage: CARILLON.markDamage * mul, knock: 3, owner: e.id });
      return t >= CARILLON.orbWarn + 0.5;
    }
    case 'marks': {
      if (first) setState(e, 'windup', CARILLON.markWarn);
      const count = CARILLON.marks[ph];
      for (let k = 0; k < count; k++) {
        if (!passes(t, dt, k * CARILLON.markEvery + dt)) continue;
        for (const p of w.players) if (standing(p)) strikeCircle(w, p.x, p.y, CARILLON.markRadius, { warn: CARILLON.markWarn, damage: CARILLON.markDamage * mul, knock: 3, owner: e.id });
      }
      if (passes(t, dt, CARILLON.markWarn)) setState(e, 'attack', 0.3);
      return t >= (count - 1) * CARILLON.markEvery + CARILLON.markWarn;
    }
    case 'peal': {
      if (first) {
        addTelegraph(w, 'circle', e.id, e.x, e.y, CARILLON.pealTell, { radius: e.radius + 1, trackUntil: CARILLON.pealTell });
        e.mem[ANGLE] = w.rng.int(0, CARILLON.pealPlaces - 1);
        setState(e, 'windup', CARILLON.pealTell);
      }
      const rings = CARILLON.pealRings[ph];
      for (let k = 0; k < rings; k++) {
        if (!passes(t, dt, CARILLON.pealTell + k * CARILLON.pealEvery)) continue;
        // the gaps walk round the ring from one to the next
        ringOfBolts(w, e, e.mem[ANGLE] + k * 3);
        setState(e, 'attack', 0.3);
      }
      return t >= CARILLON.pealTell + (rings - 1) * CARILLON.pealEvery + 0.3;
    }
    case 'toll': {
      const strike = { warn: CARILLON.tollWarn, damage: CARILLON.tollDamage * mul, knock: CARILLON.tollKnock, owner: e.id };
      // every other time it is the other way about: the ring first, then the middle
      const ringFirst = e.mem[TOLLS] % 2 === 1;
      if (first) {
        if (ringFirst) strikeCircle(w, e.x, e.y, CARILLON.tollOuter, strike, CARILLON.tollInner);
        else strikeCircle(w, e.x, e.y, CARILLON.tollInner, strike);
        setState(e, 'windup', CARILLON.tollWarn);
      }
      if (passes(t, dt, CARILLON.tollWarn)) {
        if (ringFirst) strikeCircle(w, e.x, e.y, CARILLON.tollInner, strike);
        else strikeCircle(w, e.x, e.y, CARILLON.tollOuter, strike, CARILLON.tollInner);
        setState(e, 'attack', 0.35);
      }
      if (passes(t, dt, CARILLON.tollWarn * 2)) setState(e, 'attack', 0.35);
      if (t >= CARILLON.tollWarn * 2 + 0.2) {
        e.mem[TOLLS]++;
        return true;
      }
      return false;
    }
    case 'cross': {
      const strike = { warn: CARILLON.crossWarn, damage: CARILLON.crossDamage * mul, knock: 5, owner: e.id };
      const strips = (turn: number): void => {
        for (let k = 0; k < 4; k++) strikeLane(w, e.x, e.y, e.mem[ANGLE] + turn + (k * TAU) / 4, CARILLON.crossLength, CARILLON.crossWidth, strike);
      };
      if (first) {
        const p = chooseTarget(w, e);
        e.mem[ANGLE] = p ? datan2(p.y - e.y, p.x - e.x) : e.facing;
        strips(0);
        setState(e, 'windup', CARILLON.crossWarn);
      }
      if (passes(t, dt, CARILLON.crossSecond)) strips(TAU / 8);
      if (passes(t, dt, CARILLON.crossWarn)) setState(e, 'attack', 0.35);
      // in its second phase a third set follows, back where the first was
      if (ph > 0 && passes(t, dt, CARILLON.crossSecond * 2)) strips(0);
      return t >= CARILLON.crossSecond * (ph > 0 ? 2 : 1) + CARILLON.crossWarn + 0.2;
    }
    case 'leap': {
      if (first) {
        const p = furthest(w, e);
        e.mem[AIM_X] = p ? p.x : e.x;
        e.mem[AIM_Y] = p ? p.y : e.y;
        const mark = strikeCircle(w, e.mem[AIM_X], e.mem[AIM_Y], CARILLON.leapRadius, { warn: CARILLON.leapWarn, damage: CARILLON.leapDamage * mul, knock: CARILLON.leapKnock, owner: e.id });
        e.mem[STEERED] = mark.id;
        e.target = p ? p.slot : e.target;
        setState(e, 'windup', CARILLON.leapWarn);
      }
      const mark = findTelegraph(w, e.mem[STEERED]);
      if (mark && t < CARILLON.leapTrack) {
        const p = chooseTarget(w, e);
        if (p) {
          e.mem[AIM_X] = p.x;
          e.mem[AIM_Y] = p.y;
        }
        mark.x = e.mem[AIM_X];
        mark.y = e.mem[AIM_Y];
      }
      // it is in the air for the second half of the warning: nothing on the ground reaches it
      if (passes(t, dt, CARILLON.leapWarn * 0.5)) e.airborne = true;
      if (passes(t, dt, CARILLON.leapWarn)) {
        const at = clampToFloor(w.room, e.mem[AIM_X], e.mem[AIM_Y], e.radius, { x: 0, y: 0 });
        e.x = at.x;
        e.y = at.y;
        e.px = at.x;
        e.py = at.y;
        e.airborne = false;
        ringOfBolts(w, e, w.rng.int(0, CARILLON.pealPlaces - 1));
        setState(e, 'attack', 0.4);
      }
      return t >= CARILLON.leapWarn + 0.4;
    }
  }
}

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

/** Thrums answer a cracked bell: two and one for each player, never more than a handful alive. */
function callThrums(w: World): void {
  const thrum = w.content.enemies.thrum;
  const marks = w.room.spawnMarks;
  if (!thrum || marks.length === 0) return;
  let alive = 0;
  for (const o of w.enemies) if (!o.dead && o.defId === thrum.id) alive++;
  const call = Math.min(CARILLON.thrums + w.players.length, CARILLON.thrumsMost - alive);
  const from = w.rng.int(0, marks.length - 1);
  for (let i = 0; i < call; i++) {
    const m = marks[(from + i) % marks.length];
    spawnEnemy(w, thrum, m.x, m.y);
  }
}

/** An orb a player sent back has come home. */
function crack(w: World, e: Enemy, pr: Projectile): void {
  const by = pr.owner;
  const l = dhypot(pr.vx, pr.vy) || 1;
  const dx = pr.vx / l;
  const dy = pr.vy / l;
  const whole = e.mem[CRACKED] < CARILLON.bells && e.mem[RINGING] <= 0;
  const amount = whole ? CARILLON.crackDamage : CARILLON.knockDamage;
  destroyProjectile(w, pr);
  if (whole) {
    e.mem[CRACKED]++;
    e.mem[RINGING] = CARILLON.ringing;
    w.events.push({ type: 'bellCrack', id: e.id, n: e.mem[CRACKED], x: e.x, y: e.y });
  }
  damageEnemy(w, e, amount, { kind: 'return', by, dx, dy, heavy: true, crit: whole, freeze: HITSTOP.perfect });
  addRally(w, by, whole ? RALLY.weight.perfect : RALLY.weight.sent, e.x, e.y);
  if (whole && !e.dead) callThrums(w);
}

export const CARILLON_BRAIN: BossBrain = {
  id: 'carillon',

  start(_w, e) {
    // a first breath before the first pattern, so nobody walks in under an orb
    e.mem = [0, 0, 0, 1.4, 0, 0, 0, 0, 0, 0];
  },

  always(w, e, dt) {
    const before = e.phase;
    setPhase(w, e, phaseFor(e, e.def.phases ?? []));
    if (e.phase !== before) {
      // a new phase begins its own rotation, after a breath
      e.mem[AT] = 0;
      e.mem[TIME] = 0;
      e.mem[REST] = 1.2;
      e.airborne = false;
    }
    if (e.mem[RINGING] > 0) e.mem[RINGING] -= dt;
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
  },

  decide(w, e, dt) {
    const rotation = ROTATION[phaseOf(e)];
    if (e.mem[REST] > 0) {
      // between patterns it walks after whoever it is watching, if they have got away from it
      e.mem[REST] -= dt;
      const p = chooseTarget(w, e);
      let tx = 0;
      let ty = 0;
      if (p) {
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = dhypot(dx, dy) || 1e-6;
        e.facing = ddampAngle(e.facing, datan2(dy, dx), 6, dt);
        if (dist > CARILLON.standOff) {
          tx = (dx / dist) * e.def.speed * e.speedMul;
          ty = (dy / dist) * e.def.speed * e.speedMul;
        }
      }
      e.vx = ddamp(e.vx, tx, 8, dt);
      e.vy = ddamp(e.vy, ty, 8, dt);
      // it gets its breath where it stands (the pose of recovering), unless it has to walk
      if (tx !== 0 || ty !== 0) {
        if (e.state !== 'move') setState(e, 'move');
      } else if (e.state === 'move') {
        setState(e, 'idle');
      }
      return;
    }
    // a pattern: it stands where it is and carries it out
    e.vx = ddamp(e.vx, 0, 12, dt);
    e.vy = ddamp(e.vy, 0, 12, dt);
    const what = rotation[e.mem[AT] % rotation.length];
    e.move = POSE[what];
    e.mem[TIME] += dt;
    if (run(w, e, what, e.mem[TIME], dt)) {
      e.mem[AT] = (e.mem[AT] + 1) % rotation.length;
      e.mem[TIME] = 0;
      e.mem[REST] = CARILLON.rest[phaseOf(e)];
      setState(e, 'recover', e.mem[REST]);
    }
  },
};
