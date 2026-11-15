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

export const DASH = {
  distance: 4,
  time: 0.18,
  iframes: 0.22,
  charges: 2,
  recharge: 1.2,
  /** Fraction of run speed kept when the dash ends, so it flows back into movement. */
  exitSpeed: 0.85,
};

// ---------------------------------------------------------------- the Rebound

/** Launched bodies: Echoes sent flying by a blow. */
export const BODY = {
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
  /** Extra damage on the next hit after touching a bumper, or a Ringstone. */
  bumperBoost: 0.25,
  stoneBoost: 0.5,
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

/** The Sword special: a short guard that sends back whatever lands in it. */
export const RIPOSTE = {
  cooldown: 5,
  guardTime: 0.4,
  moveMul: 0.4,
  impulse: 16,
  stun: 0.6,
  /** Share of the cooldown given back when it lands. */
  refund: 0.5,
  iframes: 0.3,
  whiff: 0.2,
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

/** The Bow special: a thrown bumper. */
export const RINGSTONE = {
  cooldown: 8,
  range: 9,
  radius: 0.4,
  life: 8,
  speed: 22,
  /** A shot or a body that hits it is sent at the nearest Echo within this distance. */
  seek: 10,
  recovery: 0.18,
};

/** The Fist: jabs on the press, and a held punch. */
export const FIST = {
  damage: [6, 6, 10] as const,
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
};

/** The Fist special: a ground slam that pops everything nearby outward. */
export const BREAK = {
  cooldown: 7,
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
  /** Resonant Stone: how wide a struck stone's pulse is. */
  pulseRadius: 1.8,
  /** Lodestone: how much further than its speed a stone's pull reaches. */
  lodeReach: 1.5,
  /** Heavy Fourth: which arrow of a held volley is the heavy one, and the ricochets it gains. */
  heavyEvery: 4,
  heavyBounces: 1,
  /** Trick Shot: the bounce from which an arrow always crits, and by how much. */
  trickFrom: 3,
  trickMul: 2,
  /** Bell Tower: how often an arrow goes from one stone to the other before it is let go. */
  towerMost: 4,
  /** A Ringstone sends a shot on with at least this much range and time still in it. */
  stoneRange: 12,
  stoneLife: 0.6,
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
  /** Answer in Kind: the burst of a landed Riposte. */
  answerRadius: 2.5,
  answerDamage: 12,
  answerImpulse: 10,
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
  hpPerChamber: 0.08,
  damagePerChamber: 0.04,
  /** Per extra player: ordinary enemy health, and the threat budget of a wave. */
  coopHp: 0.35,
  coopBudget: 0.55,
  /** Per extra player: a boss's health. A boss's health does not grow with the depth of its chamber. */
  coopBossHp: 0.6,
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
  caromBonus: 1.5,
};

/** Numbers of the traits an Echo's definition may carry. */
export const TRAIT = {
  /** Seconds a flyer lies stunned when it is knocked out of the air. */
  groundStun: 0.9,
};
