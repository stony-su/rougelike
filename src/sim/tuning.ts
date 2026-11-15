// Every gameplay number lives here so balance passes touch one file.
// Distances are in tiles, times in seconds, speeds in tiles per second. DESIGN.md has the prose.
import { PI } from '../core/dmath';

export const SIM_HZ = 60;
export const DT = 1 / SIM_HZ;

const deg = (d: number): number => (d * PI) / 180;

export const PLAYER = {
  radius: 0.32,
  maxHp: 100,
  speed: 5.4,
  /** Exponential approach rates for velocity: starting to move, and stopping. */
  accel: 34,
  decel: 26,
  hurtIframes: 0.6,
  /** Input presses made slightly too early still count for this long. */
  buffer: 0.15,
};

/**
 * Health by class. The Fist fights at arm's length, where everything lands, and has no blade to
 * turn a shot with: it is the sturdiest. The Bow stands a bowshot off and sees everything coming
 * across the floor: it is the frailest. (Bots playing whole runs set these: with a hundred each,
 * the Bow hardly ever fell and the Fist hardly ever arrived.)
 */
export const CLASS_HP: Readonly<Record<'sword' | 'bow' | 'fist', number>> = { sword: PLAYER.maxHp, bow: 85, fist: 125 };

export const DASH = {
  distance: 4,
  time: 0.18,
  iframes: 0.22,
  charges: 2,
  recharge: 1.2,
  /** Fraction of run speed kept when the dash ends, so it flows back into movement. */
  exitSpeed: 0.85,
  /**
   * A dash runs on into a blow. An attack asked for during a dash, or within `chain` seconds of
   * its end, comes out of it: it begins on the tick the dash ends with half its wind-up already
   * behind it, its step forward is `lunge` times as long, and its first blow lands `strike`
   * times as hard (an arrow flies that much faster too).
   */
  chain: 0.22,
  lunge: 2.2,
  strike: 1.3,
};

// ---------------------------------------------------------------- the Rebound

/** Launched bodies: Echoes sent flying by a blow. */
export const BODY = {
  /**
   * On its own feet no Echo but a boss is wider than this against the chamber, whatever its size
   * to a blow. The walking field leads through gaps one tile wide, and a body wider than the gap
   * stood at it for good, out of everyone's reach.
   */
  foot: 0.46,
  /** Faster than this, a body is launched: helpless, and able to slam and carom. */
  launchSpeed: 3,
  /** Tiles per second lost every second. */
  friction: 18,
  /** Nothing is ever launched faster than this. */
  maxSpeed: 34,
  /** A wall or post hit harder than this hurts: damage is `slamDamage` times the impact speed. */
  slamSpeed: 5,
  slamDamage: 0.9,
  wallRestitution: 0.7,
  /** A body-to-body hit harder than this is a carom: both take `caromDamage` times the closing speed. */
  caromSpeed: 5,
  caromDamage: 0.6,
  /** Share of the closing speed (weighted by mass) passed to the struck body, and kept by the striker. */
  caromPass: 0.6,
  caromKeep: 0.4,
  /** The struck body never leaves faster than this many times the closing speed. */
  caromMaxGain: 1.5,
  maxLinks: 4,
  pairLock: 0.3,
  /** Seconds a body lies where it landed, and seconds after that before it can be launched again. */
  landRecover: 0.35,
  launchImmune: 0.5,
  bumperRestitution: 1.15,
  bumperMinExit: 9,
  /** Extra damage on the next hit after touching a bumper. */
  bumperBoost: 0.25,
  /** Ring-out: share of maximum health lost by a body too heavy to die of it, seconds in the pit, seconds stunned after. */
  ringOutShare: 0.25,
  pitTime: 0.8,
  pitStun: 1.0,
  /** Stagger: points needed, seconds until points fade, seconds staggered, and how much harder a staggered body launches. */
  staggerAt: 3,
  staggerFade: 2,
  staggerTime: 2.5,
  staggerLaunchMul: 3,
};

/** How hard a body hits what it caroms into, by its own weight class. */
export const massFactor = (mass: number): number => (mass >= 4 ? 2 : mass >= 2 ? 1.3 : 1);
/** Light bodies die of a ring-out; nothing heavier does. */
export const isLight = (mass: number): boolean => mass < 2;

export const RALLY = {
  cap: 20,
  /** Seconds without a Return before Rally falls to nothing. */
  hold: 4,
  /** Extra Return damage per point. */
  perPoint: 0.05,
  /** How much each kind of Return adds. */
  weight: { arrow: 1, sent: 2, perfect: 3 },
};

/** Hit-stop on the striker and the struck, in ticks. */
export const HITSTOP = { light: 2, heavy: 4, perfect: 5, caromBig: 15 };

/** Sending an enemy shot back with a swing. */
export const REFLECT = {
  speedMul: 1.3,
  minSpeed: 16,
  damageMul: 2.2,
  minDamage: 14,
  bounces: 1,
  range: 14,
  /** A shot turned when this close to the player is a perfect return. Each tick of input delay adds `perDelayTick`. */
  perfectDist: 0.9,
  perDelayTick: 0.15,
  perfectMul: 1.5,
  /** Impulse on what a returned shot strikes. */
  impulse: 4,
  /** A swing that lands on an Echo in its own attack frames launches it this hard. */
  batImpulse: 14,
};

// ---------------------------------------------------------------- classes

/** The Sword: a three-swing combo. Every swing reflects. */
export const SWORD = {
  damage: [9, 9, 14] as const,
  /** Half-angle of each swing, radians. */
  halfArc: [deg(60), deg(60), deg(75)] as const,
  reach: [2.0, 2.0, 2.3] as const,
  windup: [0.07, 0.07, 0.12] as const,
  active: [0.09, 0.09, 0.11] as const,
  recovery: [0.14, 0.14, 0.24] as const,
  /** After the active frames of a swing, how long the next press still continues the combo. */
  comboWindow: 0.45,
  step: [0.35, 0.35, 0.55] as const,
  moveMul: 0.35,
  /** Light hits nudge (the next swing must still reach); the third sends a light body about two tiles. */
  impulse: [3, 3, 9] as const,
  freeze: [2, 2, 4] as const,
};

/**
 * The Sword special: the Whirlwind. One turn on the spot: everything within `radius` is cut for
 * `damage` and thrown outward with `impulse`, a shield in the way is knocked open, and every
 * enemy shot in the circle goes back at whoever fired it. The blade is going round for `spin`
 * seconds after a `windup`, and for all of that nothing hurts the Sword; shots that arrive in the
 * circle meanwhile are sent back too.
 */
export const WHIRL = {
  cooldown: 6,
  windup: 0.08,
  spin: 0.28,
  recovery: 0.16,
  radius: 2.6,
  damage: 16,
  impulse: 10,
  /** How fast the Sword may walk while it turns, as a share of its running speed. */
  moveMul: 0.5,
  /** How hard a shot it has turned comes round on whoever fired it, in radians a second. */
  turn: 6,
  /** Second Spin: how much wider the second turn reaches than the first. */
  second: 1.6,
  /** Encore: how many things one Whirlwind must cut or send back to be ready again at once. */
  encoreAt: 3,
};

/** The Bow: arrows that ricochet and skip. */
export const BOW = {
  damage: 8,
  speed: 24,
  radius: 0.12,
  /** Seconds between arrows while the button is held. */
  interval: 0.36,
  moveMul: 0.75,
  bounces: 2,
  /** Extra damage per bounce made. */
  bounceBonus: 0.4,
  range: 30,
  life: 1.6,
  skips: 1,
  skipRange: 3.5,
  skipMul: 0.7,
  impulse: 1.5,
  /** Seconds the loosing pose lasts. */
  pose: 0.2,
  /**
   * A run of three: arrows loosed within this long of each other count one, two, three, and the
   * third, from a full draw, hits this much harder. Then the count starts again.
   */
  comboWindow: 0.8,
  third: 1.3,
};

/**
 * The Bow special: the Hook Shot. A line is fired where the Bow aims, as far as the aimed point
 * and no further than `range`, and stops at the first wall. After `windup` the Bow is pulled along
 * it at `speed`, over pits and through Echoes, and nothing can hurt it on the way or for `safe`
 * seconds after. Every Echo it passes within `width` is struck for `damage` and knocked off the
 * line with `impulse`. Once it has landed its next `quiver` arrows leave `quick` seconds apart,
 * if they are loosed within `quiverTime`.
 */
export const HOOK = {
  cooldown: 7,
  range: 9,
  /** Nearer than this there is nowhere worth being pulled to, and the line is not fired. */
  least: 1.2,
  /** How finely the line is searched, back from its end, for floor to set the Bow down on. */
  probe: 0.2,
  windup: 0.07,
  speed: 30,
  safe: 0.12,
  width: 0.45,
  damage: 6,
  impulse: 9,
  /** Which way what it passes is thrown: mostly off the line, and a little the way the Bow is going. */
  aside: 0.8,
  onward: 0.6,
  quiver: 3,
  quick: 0.07,
  quiverTime: 2.5,
  /** Slingshot: seconds after landing in which the line may be fired once more for nothing. */
  again: 1.2,
};

/** The Fist: jabs on the press, and a held punch. */
export const FIST = {
  damage: [7, 7, 11] as const,
  windup: [0.04, 0.04, 0.07] as const,
  active: 0.07,
  recovery: [0.1, 0.1, 0.18] as const,
  reach: 1.5,
  halfArc: deg(50),
  /** The third jab slaps a light body about two tiles. */
  impulse: [2, 2, 8.5] as const,
  comboWindow: 0.45,
  step: [0.3, 0.3, 0.45] as const,
  moveMul: 0.45,
  freeze: [2, 2, 4] as const,
  /** A jab that cannot shove what it strikes (a body that is anchored) lands this much harder instead. */
  anchored: 2.5,
};

/** The held punch. `charge` runs from 0 at the least hold to 1 at the full one. */
export const HAYMAKER = {
  min: 0.25,
  full: 0.8,
  moveMul: 0.6,
  lunge: 1.2,
  lungeTime: 0.09,
  reach: 1.8,
  /** A 60 degree cone. */
  halfArc: deg(30),
  damage: 14,
  damagePerCharge: 12,
  impulse: 14,
  impulsePerCharge: 12,
  recovery: 0.22,
  /** What cannot be thrown takes the whole of the blow: a full one is multiplied by this against a body that is anchored. */
  anchored: 3,
  /**
   * The hand comes back in a dash: with the button held through one, the Fist lands with this
   * much of the hold already done (the least for a punch is `min`), so letting go at once is a
   * punch, and holding on a moment longer a full one.
   */
  dashCharge: 0.45,
};

/** The Fist special: a ground slam that pops everything nearby outward. */
export const BREAK = {
  cooldown: 7,
  /** Nothing hurts the Fist from the moment the slam begins until this long after it is over. */
  safe: 0.35,
  /**
   * The follow-up. For `follow` seconds after the slam, attacking sends the Fist flying to one of
   * the Echoes it struck (the one nearest the aim, within `chaseRange`), at `chaseSpeed` and for
   * no longer than `chaseMost` seconds, untouchable on the way. Arriving, it lands three blows
   * without another press: the first two hold the Echo where it is for `pin` seconds each, and the
   * third throws it along the aim with `finish` and is a Return.
   */
  follow: 1.2,
  chaseRange: 9,
  chaseSpeed: 30,
  chaseMost: 0.4,
  flurry: [7, 7, 14] as const,
  pin: 0.45,
  finish: 18,
  /** Before each of the three blows the Fist closes this much of whatever gap has opened, in tiles. */
  keepUp: 1.6,
  windup: 0.15,
  radius: 2.6,
  damage: 10,
  impulse: 11,
  /** Heavy bodies are not moved; they take this much stagger instead. */
  stagger: 2,
  /** Enemy shots in the radius fly outward as the player's, at this share of their damage. */
  shotMul: 0.6,
  recovery: 0.3,
};

/** How long each class's special takes to come back, for whoever draws it coming back. */
export const SPECIAL_COOLDOWN: Readonly<Record<'sword' | 'bow' | 'fist', number>> = { sword: WHIRL.cooldown, bow: HOOK.cooldown, fist: BREAK.cooldown };

/** A bomb a player has struck. */
export const BOMB = {
  /** Speed when sent flying by a sword, and by a punch. */
  swordSpeed: 14,
  fistSpeed: 16,
  /** Seconds a batted bomb flies before it bursts on its own. */
  batFuse: 0.8,
  /** What a blast does to Echoes once the bomb is a player's. */
  damage: 18,
  impulse: 7,
  radius: 0.28,
};

// ---------------------------------------------------------------- together

/** A downed player crawls, and stands again when an ally has stood close for long enough. */
export const REVIVE = {
  radius: 1.4,
  time: 2,
  /** Share of maximum health on standing up, by a teammate's hand or when the chamber is cleared. */
  hp: 0.3,
  iframes: 1,
  /** Crawling speed, as a share of running speed. */
  crawl: 0.25,
  /** Progress lost per second while nobody is close. */
  decay: 0.5,
};

/** What the Fist's Tunings do, beyond the numbers on their cards. */
export const HAND = {
  /** Follow Through: what a body keeps of its speed when it ploughs through another, and the share of a carom's shove the other gets. */
  ploughKeep: 0.9,
  ploughShove: 0.35,
  /** Rebound Jab: how often the same body can be sent on again, and the speed it gains each time. */
  rejabMost: 3,
  rejabSpeed: 2,
  /** Wall Hammer: how hard a slam must be to stun. */
  slamStunAt: 10,
  /** Thunderclap: how wide the burst of a full Haymaker is, and how hard it pops what is light. */
  clapRadius: 2,
  clapImpulse: 6,
  /** Tremor: how wide the burst at each bounce is. */
  tremorRadius: 1.4,
  /** Earthquake: how hard a Thunderclap or a Tremor pops what it hits. */
  quakeImpulse: 6,
  /** Pool Shark: which body of a chain bursts, how wide, and how hard. */
  sharkLink: 2,
  sharkRadius: 2,
  sharkDamage: 20,
  /** Corner Pocket: how soon after the punch the slam must come, and what the body keeps of its speed on the way back. */
  pocketTime: 0.5,
  pocketKeep: 0.8,
};

/** How many weight classes above light a body is: 0 light, 1 middling, 2 heavy. */
export const massClass = (mass: number): number => (mass >= 4 ? 2 : mass >= 2 ? 1 : 0);

/** What the Bow's Tunings do, beyond the numbers on their cards. */
export const STRING = {
  /** Crescendo: the bounce from which an arrow bursts where it lands, and how wide. */
  crescendoFrom: 2,
  crescendoRadius: 1.2,
  /** Seeking Echo: how near an Echo must be for an arrow to come round to it. */
  seekRange: 7,
  /** Splinter: how far a killing arrow's pieces look for something to fly at, and what each carries. */
  splinterRange: 6,
  splinterShare: 0.6,
  /** Pinning Note: seconds before the same Echo can be rooted again. */
  pinRest: 3,
  /** Heavy Fourth: which arrow of a held volley is the heavy one, and the ricochets it gains. */
  heavyEvery: 4,
  heavyBounces: 1,
  /** Trick Shot: the bounce from which an arrow always crits, and by how much. */
  trickFrom: 3,
  trickMul: 2,
};

/** What the Sword's Tunings do, beyond the numbers on their cards. */
export const EDGE = {
  /** Second Voice: the fan a return splits into, and what each shot of it carries of the whole (less for each one more). */
  splitFan: deg(20),
  splitShare: 0.75,
  splitStep: 0.05,
  /** Counterweight: how long its mark lasts. */
  markTime: 4,
  /** Ringing Edge: the crescent the third swing throws. */
  crescentSpeed: 14,
  crescentRadius: 0.4,
  crescentRange: 18,
  /** Tuning Fork: seconds before the same shot can be struck on again, and how often it can be. */
  reforkGap: 0.25,
  reforkMost: 5,
  /** Standing Wave: what a crescent grows by each time it is struck on, in size and in speed, and the most it grows to. */
  waveGrow: 1.25,
  waveMaxRadius: 1.2,
  /** Chorus: the Ring Cut. */
  ringReach: 2.6,
  ringDamage: 16,
};

/** Duets: bounces two players make between them. Each counts as a Return for both. */
export const DUET = {
  /** An ally's arrow through a sword swing: re-aimed, harder, with one more ricochet and one pierce. */
  bankDamage: 1.6,
  bankBounces: 1,
  bankPierce: 1,
  /** A launched body struck again in flight: a sword sends it on faster, an arrow adds a shove; either way it is hurt more. */
  oopSwordSpeed: 1.4,
  oopArrowImpulse: 6,
  oopDamage: 1.5,
};

// ---------------------------------------------------------------- the rest

/** Knockback on a player is a velocity that decays at this exponential rate. */
export const KNOCK_DECAY = 9;
/** Seconds after a stun ends during which the same enemy cannot be stunned again. */
export const STUN_IMMUNITY = 1.5;

/** Whole-chamber freezes, in ticks, and how often one may happen. */
export const FREEZE = {
  playerDown: 8,
  bossPhase: 12,
  /** Ticks between whole-chamber freezes. */
  spacing: 120,
  /** Per-body freeze on the player when hurt. */
  hurt: 3,
};

/**
 * Numbers of the Tunings that are the same at every rank. The numbers that change with rank are
 * data, in src/content/tunings.
 */
export const TUNE = {
  afterimageTime: 3,
  /** How close a dash must pass to knock an Echo aside (Ram), beyond the two bodies touching. */
  ramReach: 0.25,
  /** How long a Return's burn and chill last. */
  elementTime: 3,
  overtoneRadius: 2.5,
  overtoneDamage: 15,
  /** How far lightning jumps from one Echo to the next. */
  stormReach: 5,
  wardRadius: 2.5,
  wardDamage: 15,
  wardIframes: 1,
  steamRadius: 1.5,
  steamDamage: 25,
  steamStun: 0.8,
  /** Seconds before the same Echo can burst into Steam again. */
  steamRest: 3,
  /** What the first Return of a chamber is multiplied by (Opening Note), and every Return at full Rally (Perfect Pitch). */
  openingCrit: 2,
  perfectPitch: 1.5,
};

export const SCALING = {
  hpPerChamber: 0.06,
  damagePerChamber: 0.04,
  /** Per extra player: ordinary enemy health, and the threat budget of a wave. */
  coopHp: 0.5,
  coopBudget: 1,
  /** Per extra player: a boss's health. A boss's health does not grow with the depth of its chamber. */
  coopBossHp: 1.4,
};

/** Elites: an ordinary Echo with more health, a harder hit and one trait (elites.ts). */
export const ELITE = {
  hp: 1.6,
  damage: 1.15,
  /** Resonant: every bounce rings, after a short warning, for whoever stands near. */
  ringRadius: 2,
  ringWarn: 0.5,
  ringDamage: 10,
  ringKnock: 3,
  /** Tethered: two with more health each, never further apart than the tether; a launch drags the other at this share of the speed, and the survivor of the pair is this much faster. */
  tetherHp: 1.8,
  tetherLength: 4,
  tetherDrag: 0.5,
  tetherRage: 1.3,
  /** Hasty: wind-ups are this long, and it walks this fast. */
  hastyWindup: 0.7,
  hastySpeed: 1.25,
  /** Plated: the share of a blow it takes until a slam or a carom breaks the plate. */
  platedArmor: 0.25,
  /** Splitting: it falls into two with this share of its health, this much smaller, shoved apart this hard. */
  splitHp: 0.4,
  splitSize: 0.8,
  splitShove: 4,
};

/** Traps in the floor (traps.ts). Damage to the party grows with the depth of the chamber, like an Echo's. */
export const TRAP = {
  /** Spikes: seconds between a step on the plate and the spikes, seconds it stays spent, and what it does to a player, to an Echo standing on it, and to a body thrown onto it. */
  spikeWarn: 0.55,
  spikeRest: 1.4,
  spikeDamage: 12,
  spikeEcho: 14,
  spikeBody: 18,
  /** A knell: seconds from one toll to the next, seconds of warning, the ring's radius, and what it does to a player and to an Echo. */
  knellEvery: 5.2,
  knellWarn: 0.9,
  knellRadius: 2.3,
  knellDamage: 10,
  knellKnock: 7,
  knellEcho: 8,
  knellShove: 9,
  /** A thorn pipe: seconds from one bolt to the next, seconds of warning, how long of that it follows its target, and its bolt. */
  thornEvery: 3.6,
  thornWarn: 0.7,
  thornTrack: 0.45,
  thornReach: 12,
  thornSpeed: 11,
  thornDamage: 8,
};

/** How Echoes get about (steer.ts). */
export const STEER = {
  /**
   * Cutting off: an Echo walks at where its target will be, this many seconds on at most, and
   * less when it is close (as long as it would take to get there at `leadPace` times its speed).
   */
  leadMost: 0.6,
  leadPace: 1.4,
  /** Beyond this far from its target it hurries, by this much. */
  rushBeyond: 7,
  rush: 1.3,
  /** Surrounding: fellows keep their places this far apart round the ring (radians) when there is room, and part at this rate. */
  apartMost: 1.5,
  partRate: 2.5,
  /** It comes round the ring toward its place at most this far ahead of where it stands (radians). */
  roundStep: 0.9,
  /**
   * Skirmishing: seconds before a spot is given up for another, seconds it gives a spot it cannot
   * walk to, and how close (as a share of its near distance) its target may come before it moves off.
   */
  spotPatience: 5,
  blockedPatience: 0.4,
  tooClose: 0.75,
};

/**
 * Bosses cannot be stunned or launched. What they can be is staggered: this many Returns landed
 * on one, with no more than `staggerFade` seconds between them, stop it where it stands for
 * `staggerTime` seconds, and everything it takes meanwhile is multiplied by `staggerBonus`. Then
 * it cannot be staggered again for `staggerRest` seconds. A body launched into a boss hurts it
 * `caromBonus` times as much as it would hurt another body.
 */
export const BOSS = {
  staggerAt: 3,
  staggerFade: 6,
  staggerTime: 1.5,
  staggerBonus: 1.5,
  staggerRest: 9,
  caromBonus: 3,
  /** At each mark of its health where its phase changes, a boss stops there and nothing hurts it for this long. */
  turn: 2.5,
};

/** Numbers of the traits an Echo's definition may carry. */
export const TRAIT = {
  /** Seconds a flyer lies stunned when it is knocked out of the air. */
  groundStun: 0.9,
};
