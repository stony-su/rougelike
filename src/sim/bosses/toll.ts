// The Toll: the Bell itself, at the middle of the Crater, and the end of the road. It does not
// move. The floor round it is never quiet: it runs through a rotation of warned patterns, with a
// breath between them that gets shorter as the fight goes on, and it has three phases.
//
//   The Peal (to two thirds of its health). Rings of bolts with gaps that walk round, hammers
//   under every player, spokes through the bell and then the spokes between them, a fan of heavy
//   orbs that any basic attack sends home, and a strip that sweeps round the bell like the hand
//   of a clock. Thrums are called every so often.
//
//   The Echo (to one third). Everything comes back: a hammer leaves a ring that spreads from
//   where it fell, the spokes strike a third time, the sweep has a second hand, there are more
//   orbs and more rings. Returns hurt it more.
//
//   The Silence (to the end). A wall of sound closes in from the rim, and whoever stands outside
//   it is struck again and again. Blows that are not Returns do less than half; anything sent
//   back, bounced or thrown into it does half as much again. Its orbs come one for each player.
//
// Every phase gives every class something to send back: orbs for any basic attack, bolts for the
// Sword, the walls and bumpers for the Bow, Thrums for the Fist.
//
// What it remembers (e.mem): [0] unused, [1] where it is in its rotation, [2] seconds into the
// pattern in hand, [3] seconds of breath left, [4] an angle the pattern in hand was aimed along,
// [5] seconds until Thrums are next called, [6] how far out the wall of the Silence stands,
// [7] seconds until the wall next strikes.
import { TAU, datan2, dcos, dsin, dhypot } from '../../core/dmath';
import { chooseTarget, setState } from '../ai';
import { phaseFor, setPhase } from '../boss';
import type { BossBrain } from '../boss';
import { damageEnemy, standing } from '../combat';
import { destroyProjectile, spawnProjectile } from '../projectiles';
import { addRally } from '../rally';
import { strikeCircle, strikeLane } from '../strikes';
import { addTelegraph, laneAngle } from '../telegraphs';
import { HITSTOP, RALLY } from '../tuning';
import type { Enemy, World } from '../types';
import { callThrums, leanOrb, passes, ringOfBolts } from './patterns';
import type { RingSpec } from './patterns';

/** One number for each phase: the Peal, the Echo, the Silence. */
type ByPhase = readonly [number, number, number];

export const TOLL = {
  /** Seconds of breath between one pattern and the next. */
  rest: [0.9, 0.6, 0.5] as ByPhase,

  rings: [3, 4, 3] as ByPhase,
  ringEvery: 0.6,
  ringTell: 0.5,
  ringPlaces: [20, 20, 24] as ByPhase,
  ringGaps: [2, 2, 1] as ByPhase,
  ringSpeed: 6,
  ringDamage: 8,

  hammers: [4, 5, 3] as ByPhase,
  hammerEvery: 0.5,
  hammerRadius: 2,
  hammerWarn: 0.9,
  hammerDamage: 15,
  /** In the Echo a hammer leaves a ring that spreads this far past where it fell, this long after. */
  echoReach: 1.7,
  echoAfter: 0.55,

  spokes: 6,
  spokeLength: 15,
  spokeWidth: 1.8,
  spokeWarn: 0.9,
  spokeSecond: 0.55,
  spokeDamage: 14,

  orbs: [3, 5, 0] as ByPhase,
  orbSpread: [0.8, 1.4, 0] as ByPhase,
  orbWarn: 0.75,
  orbSpeed: [7, 8, 5.5] as ByPhase,
  orbLean: [0.8, 0.8, 1.3] as ByPhase,
  orbDamage: 14,
  /** What an orb that comes home does to it. */
  orbHome: 55,
  home: 0.35,

  /** The sweep: a strip that goes round the bell, laid as a run of strips each a step on from the last. */
  sweepSteps: 14,
  sweepEvery: 0.16,
  sweepTurn: TAU / 14,
  sweepWarn: 0.6,
  sweepLength: 15,
  sweepWidth: 2,
  sweepDamage: 13,

  /** Thrums: how many are called, how often, and the most alive at once (plus one for each player). */
  thrums: [3, 3, 1] as ByPhase,
  thrumsEvery: [12, 10, 6] as ByPhase,
  thrumsMost: [4, 5, 3] as ByPhase,

  /** The Echo: how much more a Return does. The Silence: what a plain blow does, and what a Return does. */
  echoReturn: 1.25,
  silenceDirect: 0.4,
  silenceReturn: 1.5,
  /** The wall of the Silence: where it starts, where it stops, how long it takes, how often it strikes, and how hard. */
  wallFrom: 11,
  wallTo: 6,
  wallSeconds: 40,
  wallEvery: 0.8,
  wallWarn: 0.7,
  wallDamage: 6,
};

const AT = 1;
const TIME = 2;
const REST = 3;
const ANGLE = 4;
const THRUMS = 5;
const WALL = 6;
const WALL_T = 7;

type Pattern = 'rings' | 'hammers' | 'spokes' | 'orbs' | 'sweep';
const ROTATION: ReadonlyArray<readonly Pattern[]> = [
  ['rings', 'hammers', 'spokes', 'orbs', 'sweep', 'hammers'],
  ['orbs', 'spokes', 'rings', 'sweep', 'hammers', 'orbs', 'rings'],
  ['orbs', 'rings', 'hammers'],
];
/** Which set of poses the rig plays for each pattern: 0 swings and rings, 1 rises and drops. */
const POSE: Readonly<Record<Pattern, number>> = { rings: 0, orbs: 0, sweep: 0, hammers: 1, spokes: 1 };

const phaseOf = (e: Enemy): number => Math.max(0, Math.min(2, e.phase));

/** Run the pattern in hand for one tick. `t` is how long it has been running, this tick included. Returns true when it is over. */
function run(w: World, e: Enemy, what: Pattern, t: number, dt: number): boolean {
  const ph = phaseOf(e);
  const first = t <= dt;
  const mul = e.damageMul;
  switch (what) {
    case 'rings': {
      if (first) {
        addTelegraph(w, 'circle', e.id, e.x, e.y, TOLL.ringTell, { radius: e.radius + 1, trackUntil: TOLL.ringTell });
        e.mem[ANGLE] = w.rng.int(0, TOLL.ringPlaces[ph] - 1);
        setState(e, 'windup', TOLL.ringTell);
      }
      const spec: RingSpec = { places: TOLL.ringPlaces[ph], gaps: TOLL.ringGaps[ph], gapWidth: ph === 2 ? 3 : 2, speed: TOLL.ringSpeed, damage: TOLL.ringDamage, range: 20 };
      for (let k = 0; k < TOLL.rings[ph]; k++) {
        if (!passes(t, dt, TOLL.ringTell + k * TOLL.ringEvery)) continue;
        // the gaps walk round from one ring to the next
        ringOfBolts(w, e, spec, e.mem[ANGLE] + k * 3);
        setState(e, 'attack', 0.3);
      }
      return t >= TOLL.ringTell + (TOLL.rings[ph] - 1) * TOLL.ringEvery + 0.3;
    }
    case 'hammers': {
      if (first) setState(e, 'windup', TOLL.hammerWarn);
      const strike = { warn: TOLL.hammerWarn, damage: TOLL.hammerDamage * mul, knock: 4, owner: e.id };
      for (let k = 0; k < TOLL.hammers[ph]; k++) {
        if (!passes(t, dt, k * TOLL.hammerEvery + dt)) continue;
        for (const p of w.players) {
          if (!standing(p)) continue;
          strikeCircle(w, p.x, p.y, TOLL.hammerRadius, strike);
          // the Echo: a ring spreads from where the hammer fell
          if (ph === 1) strikeCircle(w, p.x, p.y, TOLL.hammerRadius + TOLL.echoReach, { ...strike, warn: TOLL.hammerWarn + TOLL.echoAfter, damage: TOLL.hammerDamage * mul * 0.7 }, TOLL.hammerRadius);
        }
      }
      if (passes(t, dt, TOLL.hammerWarn)) setState(e, 'attack', 0.3);
      return t >= (TOLL.hammers[ph] - 1) * TOLL.hammerEvery + TOLL.hammerWarn + (ph === 1 ? TOLL.echoAfter : 0);
    }
    case 'spokes': {
      const strike = { warn: TOLL.spokeWarn, damage: TOLL.spokeDamage * mul, knock: 5, owner: e.id };
      const lay = (turn: number): void => {
        for (let k = 0; k < TOLL.spokes; k++) strikeLane(w, e.x, e.y, e.mem[ANGLE] + turn + (k * TAU) / TOLL.spokes, TOLL.spokeLength, TOLL.spokeWidth, strike);
      };
      if (first) {
        const p = chooseTarget(w, e);
        e.mem[ANGLE] = p ? datan2(p.y - e.y, p.x - e.x) : 0;
        lay(0);
        setState(e, 'windup', TOLL.spokeWarn);
      }
      const sets = ph === 1 ? 3 : 2;
      // the spokes between the first ones, and in the Echo the first ones again
      for (let n = 1; n < sets; n++) if (passes(t, dt, n * TOLL.spokeSecond)) lay(n % 2 === 1 ? TAU / (TOLL.spokes * 2) : 0);
      if (passes(t, dt, TOLL.spokeWarn)) setState(e, 'attack', 0.35);
      return t >= (sets - 1) * TOLL.spokeSecond + TOLL.spokeWarn + 0.2;
    }
    case 'orbs': {
      // in the Silence its orbs come one for each player, slowly, straight at them
      const count = ph === 2 ? w.players.filter(standing).length : TOLL.orbs[ph];
      if (first) {
        const p = chooseTarget(w, e);
        e.mem[ANGLE] = p ? datan2(p.y - e.y, p.x - e.x) : 0;
        if (ph < 2) addTelegraph(w, 'lane', e.id, e.x, e.y, TOLL.orbWarn, { angle: e.mem[ANGLE], length: 13, width: 0.9, count, spread: TOLL.orbSpread[ph] });
        else for (const q of w.players) if (standing(q)) addTelegraph(w, 'lane', e.id, e.x, e.y, TOLL.orbWarn, { angle: datan2(q.y - e.y, q.x - e.x), length: 13, width: 0.9 });
        setState(e, 'windup', TOLL.orbWarn);
      }
      if (passes(t, dt, TOLL.orbWarn)) {
        const serve = (a: number): void => {
          spawnProjectile(w, {
            kind: 'orb',
            faction: 'enemy',
            owner: e.id,
            x: e.x + dcos(a) * e.radius,
            y: e.y + dsin(a) * e.radius,
            vx: dcos(a) * TOLL.orbSpeed[ph],
            vy: dsin(a) * TOLL.orbSpeed[ph],
            radius: 0.45,
            damage: TOLL.orbDamage * mul,
            range: 70,
            bounces: 3,
          });
        };
        if (ph < 2) for (let i = 0; i < count; i++) serve(laneAngle({ angle: e.mem[ANGLE], count, spread: TOLL.orbSpread[ph] }, i));
        else for (const q of w.players) if (standing(q)) serve(datan2(q.y - e.y, q.x - e.x));
        w.events.push({ type: 'enemyAttack', id: e.id, kind: e.defId, move: 'orbs', x: e.x, y: e.y });
        setState(e, 'attack', 0.3);
      }
      return t >= TOLL.orbWarn + 0.5;
    }
    case 'sweep': {
      if (first) {
        const p = chooseTarget(w, e);
        // it starts a little behind whoever it is watching, and comes round to them
        e.mem[ANGLE] = (p ? datan2(p.y - e.y, p.x - e.x) : 0) - TOLL.sweepTurn * 3;
        setState(e, 'windup', TOLL.sweepWarn);
      }
      const strike = { warn: TOLL.sweepWarn, damage: TOLL.sweepDamage * mul, knock: 5, owner: e.id };
      for (let k = 0; k < TOLL.sweepSteps; k++) {
        if (!passes(t, dt, k * TOLL.sweepEvery + dt)) continue;
        const a = e.mem[ANGLE] + k * TOLL.sweepTurn;
        strikeLane(w, e.x, e.y, a, TOLL.sweepLength, TOLL.sweepWidth, strike);
        // the Echo has a second hand, opposite the first
        if (ph === 1) strikeLane(w, e.x, e.y, a + TAU / 2, TOLL.sweepLength, TOLL.sweepWidth, strike);
      }
      if (passes(t, dt, TOLL.sweepWarn)) setState(e, 'attack', TOLL.sweepSteps * TOLL.sweepEvery);
      return t >= (TOLL.sweepSteps - 1) * TOLL.sweepEvery + TOLL.sweepWarn + 0.2;
    }
  }
}

export const TOLL_BRAIN: BossBrain = {
  id: 'toll',

  start(_w, e) {
    e.mem = [0, 0, 0, 1.6, 0, TOLL.thrumsEvery[0], TOLL.wallFrom, 0];
  },

  always(w, e, dt) {
    const before = e.phase;
    setPhase(w, e, phaseFor(e, e.def.phases ?? []));
    const ph = phaseOf(e);
    if (e.phase !== before) {
      // a new phase begins its own rotation, after a breath
      e.mem[AT] = 0;
      e.mem[TIME] = 0;
      e.mem[REST] = 1.4;
      e.mem[THRUMS] = Math.min(e.mem[THRUMS], 3);
      e.takeReturn = ph === 1 ? TOLL.echoReturn : ph === 2 ? TOLL.silenceReturn : 1;
      e.takeDirect = ph === 2 ? TOLL.silenceDirect : 1;
    }
    // its orbs lean toward whoever is nearest; one that a player sent back and that has come home hurts it
    const reach = e.radius + TOLL.home;
    for (const pr of w.projectiles) {
      if (pr.dead || pr.kind !== 'orb') continue;
      if (pr.faction === 'enemy') {
        if (pr.owner === e.id) leanOrb(w, pr, TOLL.orbSpeed[ph], TOLL.orbLean[ph], dt);
      } else if ((pr.x - e.x) * (pr.x - e.x) + (pr.y - e.y) * (pr.y - e.y) <= (reach + pr.radius) * (reach + pr.radius)) {
        const by = pr.owner;
        const l = dhypot(pr.vx, pr.vy) || 1;
        const dx = pr.vx / l;
        const dy = pr.vy / l;
        destroyProjectile(w, pr);
        damageEnemy(w, e, TOLL.orbHome, { kind: 'return', by, dx, dy, heavy: true, crit: true, freeze: HITSTOP.perfect });
        addRally(w, by, RALLY.weight.perfect, e.x, e.y);
        if (e.dead) return;
      }
    }
    // Thrums, on a clock of their own
    e.mem[THRUMS] -= dt;
    if (e.mem[THRUMS] <= 0) {
      e.mem[THRUMS] = TOLL.thrumsEvery[ph];
      callThrums(w, TOLL.thrums[ph], TOLL.thrumsMost[ph] + w.players.length);
    }
    if (ph === 2) {
      // the Silence: the wall closes, and strikes whoever is outside it
      e.mem[WALL] = Math.max(TOLL.wallTo, e.mem[WALL] - ((TOLL.wallFrom - TOLL.wallTo) / TOLL.wallSeconds) * dt);
      e.mem[WALL_T] -= dt;
      if (e.mem[WALL_T] <= 0) {
        e.mem[WALL_T] = TOLL.wallEvery;
        strikeCircle(w, e.x, e.y, 40, { warn: TOLL.wallWarn, damage: TOLL.wallDamage * e.damageMul, owner: e.id }, e.mem[WALL]);
      }
    }
  },

  decide(w, e, dt) {
    const ph = phaseOf(e);
    const rotation = ROTATION[ph];
    // it watches whoever it is after, but it never moves
    const p = chooseTarget(w, e);
    if (p) e.facing = datan2(p.y - e.y, p.x - e.x);
    e.vx = 0;
    e.vy = 0;
    if (e.mem[REST] > 0) {
      e.mem[REST] -= dt;
      return;
    }
    const what = rotation[e.mem[AT] % rotation.length];
    e.move = POSE[what];
    e.mem[TIME] += dt;
    if (run(w, e, what, e.mem[TIME], dt)) {
      e.mem[AT] = (e.mem[AT] + 1) % rotation.length;
      e.mem[TIME] = 0;
      e.mem[REST] = TOLL.rest[ph];
      setState(e, 'recover', e.mem[REST]);
    }
  },
};
