// What every sound is made of. Pure data and pure functions: no Web Audio types and no DOM, so
// the whole table can be checked headless. engine.ts turns these numbers into audio nodes.
//
// THE PALETTE (DESIGN.md 11)
//   the Sword   bell and steel: a note with its octave and twelfth, and the partials of a struck bar
//   the Bow     plucked string: a sawtooth whose top is damped away at once, over a triangle
//   the Fist    drum and palm: a sine that starts sharp and drops as a drumhead does, under a slap
//   Echoes      breath (noise that swells and sweeps), reed (a damped, wavering sawtooth), stone (dull knocks)
//   the land    glass for what two players make between them, bells for what is won
//
// THE MODEL
//   A sound is a short list of LAYERS. A layer is a TONE (an oscillator whose pitch slides) or a
//   NOISE burst (white noise through a filter whose frequency slides). Both share one envelope:
//   a linear attack, an optional hold, then an exponential decay that ends the layer.
//
// THE KEY
//   A layer marked `tuned` is written in multiples of the note being played, not in hertz: 1 is
//   the note, 2 its octave, 1.5 the fifth above. Whoever asks for the sound says which note of
//   the zone's key that is (scale.ts), and a sound nobody gives a note plays its `home`. Layers
//   that are not tuned are thumps, cracks and air: they are written in hertz and each play is
//   retuned a little so repeats do not sound stamped out. A tuned layer barely moves.
//
// Units: seconds, hertz, and levels where 1 is full scale.
import type { ZoneId } from '../sim/defs';
import { KEYS, toneOf } from './scale';

// ---------------------------------------------------------------- ids

/** Every sound, in the families the soundboard lists them by. */
export const SOUND_GROUPS = [
  { name: 'Rally', sounds: ['rallySword', 'rallyBow', 'rallyFist', 'rallyChord', 'rallyBreak'] },
  { name: 'Sword', sounds: ['swing1', 'swing2', 'swing3', 'hitSword', 'reflect', 'reflectPerfect', 'whirl'] },
  { name: 'Bow', sounds: ['loose', 'hitBow', 'ricochet', 'skip', 'hookFire', 'hookLand'] },
  { name: 'Fist', sounds: ['jab1', 'jab2', 'jab3', 'hitFist', 'chargeFull', 'haymaker', 'breakSlam', 'palmSlap'] },
  { name: 'Bodies', sounds: ['launch', 'wallSlam', 'bumperRing', 'carom', 'ringOut', 'climbOut', 'land', 'stagger', 'armorBreak', 'clang', 'tick'] },
  { name: 'Bombs', sounds: ['bombThrow', 'bombLand', 'bombBat', 'bombBurst'] },
  { name: 'Echoes', sounds: ['spawn', 'windThrum', 'windPiper', 'windBurr', 'windEcho', 'thrumLunge', 'piperVolley', 'echoAttack', 'echoSlam', 'stun', 'echoDeath'] },
  { name: 'Players', sounds: ['dash', 'dashReady', 'specialReady', 'refused', 'hurt', 'down', 'ward'] },
  { name: 'The run', sounds: ['pickup', 'pickupBig', 'waveStart', 'roomClear', 'shockwave', 'glassRing', 'glassSet'] },
  { name: 'Interface', sounds: ['uiMove', 'uiConfirm', 'uiBack', 'uiError', 'uiBuy', 'uiTake'] },
] as const;

export type SoundId = (typeof SOUND_GROUPS)[number]['sounds'][number];
export const SOUND_IDS: readonly SoundId[] = SOUND_GROUPS.flatMap<SoundId>((g) => g.sounds);

// ---------------------------------------------------------------- layers

/** No square wave: it is the sound of a games console, and this is a land of bells. */
export type Wave = 'sine' | 'triangle' | 'sawtooth';
export type NoiseFilter = 'bandpass' | 'lowpass';

interface LayerBase {
  /** Seconds after the trigger at which the layer starts. */
  delay: number;
  /** Seconds to rise from silence to full level. */
  attack: number;
  /** Seconds held at full level before the decay begins. */
  hold: number;
  /** Seconds to fall 60 dB from full level. The layer ends here; it sounds about half this long. */
  decay: number;
  /** Peak level, 0..1. */
  gain: number;
  /**
   * Pitch (a tone) or filter frequency (noise) at the start and at the end, sliding exponentially
   * between them. In hertz, or in multiples of the note being played when the layer is tuned.
   */
  from: number;
  to: number;
  /** Seconds the slide takes. Omitted, it takes the layer's whole life. */
  slide?: number;
  /** Written in multiples of the note being played, so it is always in the zone's key. */
  tuned: boolean;
}

export interface Vibrato {
  /** Wobbles per second. */
  rate: number;
  /** How far the pitch swings either way, in cents. */
  depth: number;
}

export interface ToneLayer extends LayerBase {
  kind: 'tone';
  wave: Wave;
  vibrato?: Vibrato;
  /**
   * A low-pass over the tone that closes as it rings, the way a plucked string loses its top
   * first: the cutoff at the start and at the end, in multiples of the tone's own pitch.
   */
  damp?: readonly [number, number];
}

export interface NoiseLayer extends LayerBase {
  kind: 'noise';
  filter: NoiseFilter;
  /**
   * Sharpness of the filter. Band-pass: centre frequency over bandwidth, so higher is narrower
   * and more pitched. Low-pass: the height of the bump at the cutoff in decibels, where 0 is a
   * plain shoulder.
   */
  q: number;
}

export type Layer = ToneLayer | NoiseLayer;

/** A note of the key by where it sits: the note nearest `interval` semitones above the tonic, `octave` octaves up. */
export interface KeyNote {
  interval: number;
  octave: number;
}

export interface Recipe {
  layers: readonly Layer[];
  /** How loud the whole sound is next to the others, 0..1. Omitted means 1. Set by measuring at the master. */
  level?: number;
  /** Share of the sound sent into the chamber's shared ring, 0..1. Omitted means dry. */
  space?: number;
  /** Random pitch spread per play, either way, as a fraction. Omitted means PITCH_JITTER. */
  jitter?: number;
  /** The least seconds between two starts of this sound: what keeps twenty Chimes from machine-gunning. Omitted means none. */
  gap?: number;
  /** The note its tuned layers ring at when nobody says otherwise. Every sound with a tuned layer has one. */
  home?: KeyNote;
}

// ---------------------------------------------------------------- limits

/** Every frequency a recipe can reach stays in this range: below it is rumble, above it is fatigue. */
export const MIN_HZ = 20;
export const MAX_HZ = 16000;
/** No sound runs longer than this. */
export const MAX_SECONDS = 2;
/** A recipe is a short list: every layer costs two or three audio nodes each time it plays. */
export const MAX_LAYERS = 12;
/** Repeats must not sound stamped out, so each play is retuned by up to this much either way. */
export const PITCH_JITTER = 0.03;
/**
 * A tuned layer moves this share as far: enough that two bells struck together shimmer instead
 * of cancelling, too little to sour them against the key.
 */
export const TUNED_SHARE = 0.125;
/** A layer has ended once it has fallen this far below its peak: 60 dB. */
export const SILENCE = 0.001;
/** How far whoever asks for a sound may shift its untuned layers: an octave either way. */
export const PITCH_LOW = 0.5;
export const PITCH_HIGH = 2;

const MAX_JITTER = 0.1;
const MIN_ATTACK = 0.001;
const MAX_ATTACK = 1;
const MAX_HOLD = 1;
const MIN_DECAY = 0.005;
const MIN_Q = 0.3;
const MAX_Q = 20;
const MIN_BUMP = -6;
const MAX_BUMP = 12;
const MAX_VIBRATO_RATE = 60;
const MAX_VIBRATO_CENTS = 400;
const MAX_GAP = 1;
const MIN_RATIO = 0.2;
const MAX_RATIO = 12;
const MIN_DAMP = 0.5;
const MAX_DAMP = 40;

const WAVES: readonly Wave[] = ['sine', 'triangle', 'sawtooth'];
const FILTERS: readonly NoiseFilter[] = ['bandpass', 'lowpass'];

// ---------------------------------------------------------------- building blocks

/** Attack of anything struck: fast enough to read as a hit, slow enough not to click. */
const STRUCK = 0.002;

interface ToneMore {
  attack?: number;
  hold?: number;
  delay?: number;
  slide?: number;
  vibrato?: Vibrato;
  damp?: readonly [number, number];
  tuned?: boolean;
}

const tone = (wave: Wave, from: number, to: number, decay: number, gain: number, more: ToneMore = {}): ToneLayer => ({
  kind: 'tone',
  wave,
  from,
  to,
  decay,
  gain,
  attack: more.attack ?? STRUCK,
  hold: more.hold ?? 0,
  delay: more.delay ?? 0,
  slide: more.slide,
  vibrato: more.vibrato,
  damp: more.damp,
  tuned: more.tuned ?? false,
});

interface NoiseMore {
  q?: number;
  attack?: number;
  hold?: number;
  delay?: number;
  slide?: number;
  tuned?: boolean;
}

const noise = (filter: NoiseFilter, from: number, to: number, decay: number, gain: number, more: NoiseMore = {}): NoiseLayer => ({
  kind: 'noise',
  filter,
  from,
  to,
  decay,
  gain,
  q: more.q ?? (filter === 'bandpass' ? 1 : 0),
  attack: more.attack ?? STRUCK,
  hold: more.hold ?? 0,
  delay: more.delay ?? 0,
  slide: more.slide,
  tuned: more.tuned ?? false,
});

/** A partial of the note being played: a sine at `ratio` times its pitch. */
const partial = (ratio: number, decay: number, gain: number, more: ToneMore = {}): ToneLayer => tone('sine', ratio, ratio, decay, gain, { ...more, tuned: true });

const at = (interval: number, octave: number): KeyNote => ({ interval, octave });

/**
 * The bell: the note, its octave and its twelfth, each dying sooner than the one below it.
 * `glint` adds the clapper's flash, a partial that belongs to no harmonic.
 */
function bell(decay: number, gain: number, delay = 0, glint = 0): Layer[] {
  const layers = [partial(1, decay, gain, { attack: 0.003, delay }), partial(2, decay * 0.5, gain * 0.28, { delay }), partial(3, decay * 0.34, gain * 0.14, { delay })];
  if (glint > 0) layers.push(partial(4.16, decay * 0.14, gain * glint, { delay }));
  return layers;
}

/** Steel: the partials of a struck bar, which are not harmonics, so it rings hard where the bell rings sweet. */
const steel = (decay: number, gain: number, delay = 0): Layer[] => [
  partial(1, decay, gain, { delay }),
  partial(2.756, decay * 0.45, gain * 0.5, { delay }),
  partial(5.404, decay * 0.2, gain * 0.22, { delay }),
];

/** Glass: the partials of a struck bowl, with a softer start. */
const glass = (decay: number, gain: number, delay = 0): Layer[] => [
  partial(1, decay, gain, { attack: 0.004, delay }),
  partial(2.32, decay * 0.5, gain * 0.3, { delay }),
  partial(4.25, decay * 0.22, gain * 0.12, { delay }),
];

/** A plucked string: a triangle that carries the note, a sawtooth whose top is damped away at once, and the finger leaving. */
const pluck = (decay: number, gain: number, delay = 0, ratio = 1): Layer[] => [
  tone('triangle', ratio, ratio, decay, gain, { delay, tuned: true }),
  tone('sawtooth', ratio, ratio, decay * 0.5, gain * 0.5, { delay, tuned: true, damp: [7, 1.2] }),
  noise('bandpass', 2600, 1900, 0.012, gain * 0.3, { q: 2, delay }),
];

/** A tuned drum: the head starts sharp and drops to its note at once, with one overtone, under the slap of a palm. */
const drum = (decay: number, gain: number, delay = 0): Layer[] => [
  tone('sine', 1.14, 1, decay, gain, { delay, tuned: true, slide: 0.035 }),
  partial(2, decay * 0.4, gain * 0.2, { delay }),
  noise('lowpass', 1700, 500, 0.045, gain * 0.5, { delay }),
];

/** One dull knock of stone on stone. */
const knock = (hz: number, gain: number, delay = 0): Layer[] => [tone('triangle', hz, hz * 0.6, 0.05, gain, { delay }), noise('bandpass', hz * 6, hz * 4, 0.014, gain * 0.5, { q: 2.5, delay })];

/** A fist through the air, before it lands on anything. `k` shifts the whole thing up or down. */
const jab = (k: number): Layer[] => [
  noise('bandpass', 700 * k, 1900 * k, 0.05, 0.4, { q: 1.2, attack: 0.012 }), // a short arm of air
  tone('sine', 150 * k, 95 * k, 0.045, 0.3), // the shoulder behind it
];

/** The Burr winding up: stones clicked together faster and faster. */
const RATTLE: readonly number[] = [0, 0.12, 0.22, 0.31, 0.39, 0.46, 0.52];

// ---------------------------------------------------------------- the sounds

export const RECIPES: Record<SoundId, Recipe> = {
  // ---- the Rally: one note per Return, in the voice of whoever made it
  rallySword: {
    space: 0.3,
    jitter: 0.02,
    home: at(0, 1),
    layers: [
      ...bell(0.9, 0.8, 0, 0.1),
      partial(2.756, 0.16, 0.12), // the steel in the bell
      noise('bandpass', 6200, 5200, 0.016, 0.16, { q: 1.5 }), // the strike
    ],
  },
  rallyBow: {
    space: 0.25,
    jitter: 0.02,
    home: at(0, 1),
    layers: [...pluck(0.75, 0.8), partial(2, 0.3, 0.14)],
  },
  rallyFist: {
    space: 0.15,
    jitter: 0.02,
    home: at(0, 1),
    layers: [
      ...drum(0.5, 0.85),
      tone('sine', 150, 62, 0.11, 0.4), // the weight of the hand under the note
    ],
  },
  // The upper notes of a perfect return's chord: softer and purer than any class's own voice, so the note under them still leads.
  rallyChord: {
    space: 0.4,
    jitter: 0.02,
    home: at(0, 2),
    layers: [partial(1, 1.1, 0.6, { attack: 0.006 }), partial(2, 0.5, 0.14), partial(3, 0.3, 0.05)],
  },
  // A Rally let go: its last note falls an octave as it fades.
  rallyBreak: {
    space: 0.3,
    jitter: 0,
    home: at(0, 1),
    layers: [
      tone('sine', 1, 0.5, 0.5, 0.5, { tuned: true, attack: 0.03 }),
      tone('triangle', 0.5, 0.25, 0.4, 0.25, { tuned: true, attack: 0.04 }),
      noise('lowpass', 900, 300, 0.3, 0.1, { attack: 0.05 }), // a breath going out
    ],
  },

  // ---- the Sword: bell and steel
  swing1: {
    layers: [
      noise('bandpass', 900, 3400, 0.11, 0.5, { q: 1.4, attack: 0.045 }), // air parting ahead of the blade, rising with the stroke
      noise('bandpass', 5200, 7400, 0.08, 0.2, { q: 4, attack: 0.05 }), // the edge itself, thin and high
    ],
  },
  swing2: {
    layers: [
      noise('bandpass', 3400, 1000, 0.11, 0.5, { q: 1.4, attack: 0.045 }), // the backhand: the same air, falling
      noise('bandpass', 7400, 5000, 0.08, 0.2, { q: 4, attack: 0.05 }),
    ],
  },
  swing3: {
    space: 0.15,
    home: at(7, 2),
    layers: [
      noise('bandpass', 500, 2600, 0.2, 0.6, { q: 1.1, attack: 0.09 }), // lower, longer, more of it
      noise('lowpass', 600, 180, 0.2, 0.3, { attack: 0.08 }),
      noise('bandpass', 4800, 7800, 0.12, 0.22, { q: 4, attack: 0.1 }),
      partial(1, 0.35, 0.1, { attack: 0.1 }), // the fork of the blade humming as it comes round
      partial(2.756, 0.15, 0.05, { attack: 0.1 }),
    ],
  },
  hitSword: {
    layers: [
      noise('bandpass', 3000, 1300, 0.05, 0.55, { q: 1.4 }), // the bite
      tone('sine', 230, 100, 0.08, 0.5), // the body under it
      tone('sine', 3350, 3350, 0.05, 0.12), // a glint of steel
      tone('sine', 5270, 5270, 0.03, 0.06),
    ],
  },
  reflect: {
    space: 0.25,
    home: at(7, 2),
    layers: [
      ...steel(0.34, 0.6),
      partial(2, 0.2, 0.12),
      noise('bandpass', 5600, 4400, 0.018, 0.4, { q: 1.2 }), // the strike
      tone('triangle', 900, 480, 0.03, 0.25), // the blade taking the weight
    ],
  },
  reflectPerfect: {
    space: 0.4,
    home: at(7, 2),
    layers: [
      ...bell(0.9, 0.6, 0, 0.12),
      partial(2.756, 0.24, 0.26), // the same steel
      partial(5.404, 0.1, 0.12),
      partial(4, 0.5, 0.1, { delay: 0.05, attack: 0.01 }), // and a shimmer climbing off the top of it
      partial(6, 0.4, 0.06, { delay: 0.1, attack: 0.01 }),
      noise('bandpass', 6400, 5000, 0.02, 0.45, { q: 1.2 }),
      tone('sine', 190, 80, 0.1, 0.4), // weight: this is the big one
    ],
  },
  // The Whirlwind: the blade all the way round. One long breath of air that opens and closes, with the steel humming through it.
  whirl: {
    space: 0.25,
    home: at(7, 2),
    layers: [
      noise('bandpass', 420, 3000, 0.3, 0.6, { q: 1.1, attack: 0.07 }), // the air parting ahead of the blade as it comes round
      noise('bandpass', 3000, 700, 0.26, 0.4, { q: 1.2, delay: 0.15, attack: 0.05 }), // and closing behind it
      noise('lowpass', 700, 160, 0.3, 0.3, { attack: 0.06 }), // the weight of the turn
      noise('bandpass', 5200, 8000, 0.22, 0.2, { q: 4, attack: 0.1 }), // the edge itself
      partial(1, 0.5, 0.14, { attack: 0.1 }), // the fork of the blade humming the whole way
      partial(2.756, 0.3, 0.07, { attack: 0.1 }),
    ],
  },
  // A blow that met a shield, or a boss between two voices: steel on bronze, and nothing given.
  clang: {
    space: 0.2,
    home: at(0, 2),
    layers: [
      noise('bandpass', 2800, 5200, 0.05, 0.4, { q: 3, attack: 0.008 }), // the edge stopped short
      partial(1, 0.4, 0.22, { attack: 0.01 }), // and the metal it met, humming
      partial(2.756, 0.14, 0.08),
    ],
  },
  // The Echo Ward: the blow that should have ended it, answered.
  ward: {
    space: 0.35,
    home: at(0, 2),
    layers: [
      noise('bandpass', 5200, 3600, 0.025, 0.6, { q: 1 }), // the clash
      ...steel(0.6, 0.55),
      partial(1.5, 0.5, 0.3), // the fifth over it: a chord, not a note
      partial(2, 0.4, 0.18),
      tone('sine', 170, 62, 0.16, 0.6), // the answer's weight
      noise('lowpass', 1800, 300, 0.08, 0.35),
    ],
  },

  // ---- the Bow: plucked string
  loose: {
    home: at(0, 1),
    layers: [
      tone('triangle', 1.03, 1, 0.2, 0.6, { tuned: true, slide: 0.05 }), // the string let go: a shade sharp, then true
      tone('sawtooth', 1, 1, 0.07, 0.25, { tuned: true, damp: [6, 1.5] }), // its buzz
      partial(0.5, 0.16, 0.35), // the limbs of the bow
      noise('bandpass', 2400, 1800, 0.012, 0.35, { q: 2 }), // the release
      noise('bandpass', 1500, 4200, 0.07, 0.25, { q: 2, attack: 0.012, delay: 0.008 }), // the arrow leaving
    ],
  },
  hitBow: {
    layers: [
      noise('bandpass', 2300, 1200, 0.03, 0.55, { q: 2 }), // the thwack
      tone('sine', 280, 130, 0.05, 0.45),
      tone('triangle', 620, 560, 0.05, 0.12, { vibrato: { rate: 40, depth: 60 } }), // the shaft still quivering
    ],
  },
  // An arrow glancing off the chamber: a string touched and let go. Whoever plays it picks a higher note for each bounce.
  ricochet: {
    space: 0.25,
    jitter: 0.02,
    home: at(0, 2),
    layers: [
      tone('triangle', 1, 1, 0.16, 0.55, { tuned: true }),
      partial(2, 0.08, 0.2),
      partial(3, 0.05, 0.08),
      noise('bandpass', 4200, 3200, 0.01, 0.3, { q: 2 }), // the head glancing off stone
    ],
  },
  skip: {
    space: 0.2,
    home: at(0, 2),
    layers: [
      tone('triangle', 1, 1, 0.1, 0.5, { tuned: true }), // one string, then the one a fifth above it
      partial(2, 0.05, 0.15),
      tone('triangle', 1.5, 1.5, 0.16, 0.5, { tuned: true, delay: 0.045 }),
      partial(3, 0.07, 0.15, { delay: 0.045 }),
      noise('bandpass', 3200, 2400, 0.01, 0.25, { q: 2 }),
    ],
  },
  // The Hook Shot's line leaving: the string let go with something heavy on it, and the line paying out after it.
  hookFire: {
    home: at(0, 1),
    layers: [
      tone('triangle', 1.06, 1, 0.16, 0.55, { tuned: true, slide: 0.04 }), // the string
      tone('sawtooth', 1, 1, 0.06, 0.2, { tuned: true, damp: [6, 1.5] }),
      noise('bandpass', 1400, 5200, 0.16, 0.4, { q: 2.2, attack: 0.02 }), // the line running out, rising as it goes
      noise('bandpass', 6400, 5200, 0.012, 0.3, { q: 2, delay: 0.06 }), // and biting where it lands
      tone('sine', 2100, 2100, 0.05, 0.1, { delay: 0.06 }),
    ],
  },
  // The Bow set down at the end of its line: feet on the floor, and the string, slack again, humming.
  hookLand: {
    space: 0.2,
    home: at(7, 1),
    layers: [
      tone('sine', 190, 80, 0.09, 0.5), // the landing
      noise('lowpass', 1300, 380, 0.05, 0.3),
      ...pluck(0.22, 0.4, 0.01),
      partial(2, 0.1, 0.1, { delay: 0.01 }),
    ],
  },
  // Glass set down: a teammate stood up again.
  glassSet: {
    space: 0.4,
    home: at(0, 2),
    layers: [
      ...glass(1.0, 0.6),
      tone('sine', 170, 70, 0.09, 0.5), // set down hard
      noise('lowpass', 1500, 400, 0.04, 0.3),
    ],
  },
  // Glass rung: two players' bounce, a knell in the floor, lightning arriving. A fifth above the note of the place.
  glassRing: {
    space: 0.4,
    home: at(7, 2),
    layers: [
      ...glass(0.8, 0.6),
      noise('bandpass', 7000, 6000, 0.012, 0.2, { q: 2 }), // what struck it
    ],
  },

  // ---- the Fist: drum and palm
  jab1: { layers: jab(1) },
  jab2: { layers: jab(1.15) },
  jab3: {
    layers: [
      noise('bandpass', 500, 1700, 0.09, 0.5, { q: 1.1, attack: 0.03 }), // the third comes from the hip
      noise('lowpass', 500, 180, 0.09, 0.3, { attack: 0.02 }),
      tone('sine', 130, 70, 0.08, 0.35),
    ],
  },
  hitFist: {
    layers: [
      tone('sine', 215, 88, 0.12, 0.8, { slide: 0.05 }), // the drum: the head gives and drops
      noise('lowpass', 2100, 600, 0.045, 0.5), // the palm on it
      noise('bandpass', 3400, 2600, 0.008, 0.2, { q: 2 }),
      tone('triangle', 330, 200, 0.05, 0.2),
    ],
  },
  chargeFull: {
    space: 0.15,
    home: at(0, 1),
    layers: [
      tone('sine', 0.75, 1, 0.2, 0.6, { tuned: true, slide: 0.07 }), // a drumhead tightened up to its note
      partial(2, 0.1, 0.15, { delay: 0.05 }),
      noise('bandpass', 4200, 3400, 0.01, 0.3, { q: 2 }), // the knuckles set
    ],
  },
  // The punch thrown, before it lands: the blow itself is told by the hit and the launch.
  haymaker: {
    layers: [
      noise('bandpass', 380, 2000, 0.13, 0.6, { q: 1, attack: 0.05 }), // the whole arm coming through
      noise('lowpass', 700, 200, 0.14, 0.4, { attack: 0.04 }),
      tone('sine', 85, 150, 0.1, 0.4, { attack: 0.03 }), // rising, as a thrown weight does
    ],
  },
  breakSlam: {
    space: 0.2,
    home: at(0, 0),
    layers: [
      tone('sine', 98, 34, 0.5, 1), // both palms on the ground: the boom
      tone('triangle', 165, 54, 0.22, 0.35), // the part of it small speakers can carry
      noise('lowpass', 950, 90, 0.34, 0.55), // the floor answering
      noise('bandpass', 2400, 1500, 0.02, 0.3, { q: 1.5 }), // skin on stone
      tone('sine', 1.1, 1, 0.5, 0.3, { tuned: true, slide: 0.04 }), // and the drum it makes of the whole chamber, in key
      partial(2, 0.2, 0.08),
    ],
  },
  // An open hand across a shot: the Break sending bolts back.
  palmSlap: {
    layers: [noise('lowpass', 2600, 800, 0.035, 0.55), tone('sine', 320, 170, 0.05, 0.4), noise('bandpass', 3600, 2800, 0.008, 0.2, { q: 2 })],
  },

  // ---- bodies sent flying
  launch: {
    layers: [
      tone('sine', 170, 62, 0.14, 0.7), // lifted off its feet
      noise('bandpass', 500, 2800, 0.2, 0.4, { q: 1.2, attack: 0.03 }), // and the air it goes through
      noise('lowpass', 900, 300, 0.06, 0.3),
    ],
  },
  wallSlam: {
    layers: [
      tone('sine', 135, 44, 0.22, 0.9), // the body
      tone('triangle', 290, 120, 0.07, 0.35), // stone taking it
      noise('lowpass', 2300, 280, 0.11, 0.55),
      noise('bandpass', 3300, 2100, 0.025, 0.25, { q: 1.2 }), // the crack on top
    ],
  },
  // A bumper struck: bright, a bell with steel in it, on the fifth of the key.
  bumperRing: {
    space: 0.35,
    home: at(7, 2),
    layers: [
      ...bell(0.6, 0.6, 0, 0.2),
      partial(2.756, 0.2, 0.15),
      noise('bandpass', 5600, 4600, 0.012, 0.3, { q: 1.5 }),
      tone('sine', 210, 120, 0.05, 0.3), // the drum of the bumper itself
    ],
  },
  carom: {
    layers: [
      tone('triangle', 1700, 1150, 0.02, 0.4), // two hard things meeting: the clack
      noise('bandpass', 3000, 2200, 0.014, 0.5, { q: 2.5 }),
      tone('sine', 190, 72, 0.12, 0.7), // and the weight behind them
      noise('lowpass', 1500, 350, 0.06, 0.35),
    ],
  },
  ringOut: {
    space: 0.25,
    layers: [
      tone('sine', 1900, 240, 0.3, 0.45, { attack: 0.02, hold: 0.3, vibrato: { rate: 11, depth: 35 } }), // the falling whistle
      tone('triangle', 950, 120, 0.3, 0.15, { attack: 0.03, hold: 0.3 }),
      tone('sine', 260, 90, 0.1, 0.5, { delay: 0.55 }), // and, far below, the bottom
      noise('lowpass', 700, 200, 0.12, 0.3, { delay: 0.55 }),
    ],
  },
  climbOut: {
    layers: [
      noise('bandpass', 900, 1500, 0.04, 0.4, { q: 2, attack: 0.008 }), // hands on the rim: three scrapes
      noise('bandpass', 1100, 1700, 0.04, 0.4, { q: 2, attack: 0.008, delay: 0.09 }),
      noise('bandpass', 1300, 1900, 0.05, 0.45, { q: 2, attack: 0.008, delay: 0.17 }),
      tone('triangle', 240, 150, 0.05, 0.3, { delay: 0.2 }),
    ],
  },
  land: {
    layers: [tone('sine', 120, 58, 0.09, 0.6), noise('lowpass', 700, 220, 0.06, 0.4)],
  },
  stagger: {
    layers: [
      tone('sine', 120, 48, 0.24, 0.8), // the footing going
      noise('bandpass', 2100, 900, 0.07, 0.45, { q: 1.5 }), // a crack through stone
      tone('triangle', 330, 210, 0.36, 0.3, { vibrato: { rate: 13, depth: 110 } }), // and the wobble after
      ...knock(420, 0.3, 0.14), // loose pieces settling
      ...knock(350, 0.25, 0.24),
    ],
  },
  armorBreak: {
    space: 0.2,
    layers: [
      noise('bandpass', 3600, 1400, 0.07, 0.6, { q: 1 }), // the plate giving
      tone('sine', 2140, 2140, 0.16, 0.2), // its pieces ringing as they scatter
      tone('sine', 3390, 3390, 0.1, 0.14),
      tone('sine', 5210, 5210, 0.06, 0.08),
      tone('sine', 150, 60, 0.14, 0.55),
      noise('bandpass', 5200, 6400, 0.03, 0.2, { q: 3, delay: 0.09 }),
      noise('bandpass', 4400, 5600, 0.03, 0.15, { q: 3, delay: 0.16 }),
    ],
  },
  // The least sound there is: something landed. A Return adds only this under its note.
  tick: {
    layers: [noise('bandpass', 2700, 2000, 0.012, 0.5, { q: 2 }), tone('sine', 340, 200, 0.03, 0.4)],
  },

  // ---- bombs
  bombThrow: {
    layers: [
      noise('lowpass', 1000, 220, 0.09, 0.5), // the heave
      tone('sine', 380, 900, 0.25, 0.22, { attack: 0.05, hold: 0.1 }), // and the bomb going up its arc
      noise('bandpass', 4800, 5600, 0.3, 0.1, { q: 5, attack: 0.05 }), // its fuse already lit
    ],
  },
  bombLand: {
    layers: [
      tone('sine', 150, 66, 0.1, 0.6), // it lands
      tone('triangle', 420, 300, 0.035, 0.25),
      noise('bandpass', 6400, 5400, 0.5, 0.16, { q: 4, attack: 0.02, hold: 0.45 }), // and sits there hissing
    ],
  },
  bombBat: {
    layers: [
      tone('triangle', 360, 560, 0.09, 0.6, { slide: 0.05 }), // hollow iron, sent the other way
      tone('sine', 1480, 1480, 0.07, 0.15),
      noise('bandpass', 2600, 1900, 0.012, 0.4, { q: 2 }),
      noise('bandpass', 700, 2400, 0.12, 0.25, { q: 1.5, attack: 0.02, delay: 0.01 }),
    ],
  },
  bombBurst: {
    space: 0.3,
    layers: [
      tone('sine', 115, 36, 0.48, 1), // the boom
      tone('triangle', 180, 56, 0.2, 0.4), // what small speakers can carry of it
      noise('lowpass', 2800, 150, 0.42, 0.7), // the blast spreading and dulling
      noise('bandpass', 4400, 1700, 0.07, 0.5, { q: 0.8 }), // its crack
    ],
  },

  // ---- Echoes: breath, reed and stone
  spawn: {
    layers: [
      noise('bandpass', 320, 1500, 0.2, 0.4, { q: 1.5, attack: 0.3 }), // a breath drawn where nothing stood
      tone('sine', 110, 230, 0.2, 0.3, { attack: 0.3, vibrato: { rate: 15, depth: 40 } }),
    ],
  },
  // The wind-up voices run as long as the wind-ups they warn of, and swell toward the blow.
  windThrum: {
    layers: [
      noise('bandpass', 300, 1300, 0.12, 0.5, { q: 1.6, attack: 0.36 }), // breath drawn in, all the way
      tone('triangle', 82, 128, 0.12, 0.5, { attack: 0.34, vibrato: { rate: 19, depth: 90 } }), // the thrum it is named for, winding up
      tone('sawtooth', 164, 256, 0.1, 0.12, { attack: 0.36, damp: [4, 3] }),
    ],
  },
  windPiper: {
    space: 0.2,
    home: at(7, 1),
    layers: [
      // the reed finding its note from a tone below
      tone('sawtooth', 0.89, 1, 0.14, 0.5, { tuned: true, attack: 0.08, hold: 0.42, slide: 0.3, damp: [5, 3.5], vibrato: { rate: 6.5, depth: 18 } }),
      tone('triangle', 2, 2, 0.14, 0.12, { tuned: true, attack: 0.2, hold: 0.3 }),
      noise('bandpass', 2, 2, 0.14, 0.2, { tuned: true, q: 6, attack: 0.08, hold: 0.42 }), // breath across it
    ],
  },
  windBurr: {
    layers: [
      ...RATTLE.map((delay) => noise('bandpass', 1700, 1300, 0.018, 0.4, { q: 3, delay })),
      tone('sawtooth', 62, 92, 0.1, 0.3, { attack: 0.45, damp: [6, 4] }), // and a growl coming up under the rattle
    ],
  },
  // Any Echo that has no voice of its own yet: a breath, and a stone turned over.
  windEcho: {
    layers: [noise('bandpass', 400, 1600, 0.12, 0.45, { q: 1.5, attack: 0.3 }), tone('triangle', 140, 190, 0.12, 0.3, { attack: 0.3, vibrato: { rate: 9, depth: 50 } }), ...knock(300, 0.3, 0.38)],
  },
  thrumLunge: {
    layers: [
      noise('bandpass', 2200, 420, 0.2, 0.55, { q: 1.4, attack: 0.012 }), // all that breath let out at once
      tone('triangle', 150, 70, 0.14, 0.45),
      noise('lowpass', 800, 200, 0.1, 0.3),
    ],
  },
  // Three bolts, three pips on the reed.
  piperVolley: {
    space: 0.2,
    home: at(7, 1),
    layers: [
      tone('sawtooth', 1, 1, 0.07, 0.5, { tuned: true, damp: [6, 2.5] }),
      tone('sawtooth', 1, 1, 0.06, 0.4, { tuned: true, delay: 0.055, damp: [6, 2.5] }),
      tone('sawtooth', 1, 1, 0.09, 0.4, { tuned: true, delay: 0.11, damp: [6, 2.5] }),
      noise('bandpass', 5200, 3200, 0.03, 0.3, { q: 1.5 }), // the spit of the first
    ],
  },
  echoAttack: {
    layers: [
      noise('bandpass', 2400, 600, 0.12, 0.5, { q: 2, attack: 0.008 }), // a breath spat out
      tone('sine', 420, 130, 0.09, 0.35),
      ...knock(260, 0.3, 0.02),
    ],
  },
  // An Echo's blow coming down on the floor.
  echoSlam: {
    layers: [
      tone('sine', 105, 38, 0.36, 1),
      tone('triangle', 210, 70, 0.14, 0.4),
      noise('lowpass', 1400, 120, 0.26, 0.6),
      ...knock(380, 0.25, 0.1), // and bits of it after
      ...knock(300, 0.2, 0.19),
    ],
  },
  stun: {
    layers: [
      tone('triangle', 560, 500, 0.12, 0.35, { vibrato: { rate: 16, depth: 90 } }), // seeing stars: two wavering tones, the second lower
      tone('triangle', 450, 390, 0.16, 0.35, { delay: 0.1, vibrato: { rate: 16, depth: 90 } }),
      noise('bandpass', 2600, 2000, 0.012, 0.2, { q: 2 }),
    ],
  },
  echoDeath: {
    layers: [
      noise('bandpass', 2000, 240, 0.34, 0.6, { q: 1.5, attack: 0.006 }), // the breath going out of it
      noise('lowpass', 900, 120, 0.26, 0.35),
      tone('sine', 300, 58, 0.24, 0.4), // and down
      ...knock(250, 0.35, 0.06), // what it was made of, falling in a heap
      ...knock(170, 0.3, 0.15),
    ],
  },

  // ---- the players themselves
  dash: {
    layers: [
      noise('bandpass', 520, 3400, 0.15, 0.5, { q: 0.9, attack: 0.03 }), // a coat going past
      noise('lowpass', 600, 200, 0.12, 0.2, { attack: 0.02 }),
    ],
  },
  dashReady: {
    home: at(7, 2),
    layers: [partial(1, 0.05, 0.4), noise('bandpass', 4200, 3600, 0.012, 0.15, { q: 2 })],
  },
  specialReady: {
    space: 0.25,
    home: at(0, 2),
    layers: [
      ...bell(0.25, 0.4), // the tonic, then the fifth over it: ready
      partial(1.5, 0.4, 0.45, { delay: 0.09, attack: 0.004 }),
      partial(3, 0.15, 0.1, { delay: 0.09 }),
    ],
  },
  refused: {
    layers: [tone('triangle', 180, 150, 0.05, 0.5), noise('bandpass', 850, 650, 0.035, 0.4, { q: 2 })],
  },
  hurt: {
    layers: [
      tone('sine', 118, 44, 0.28, 0.9), // the blow
      noise('lowpass', 1100, 180, 0.14, 0.5),
      tone('sawtooth', 233, 185, 0.2, 0.16, { damp: [6, 3] }), // and what it does: two voices a semitone apart, grinding
      tone('sawtooth', 247, 196, 0.2, 0.16, { damp: [6, 3] }),
    ],
  },
  down: {
    space: 0.3,
    home: at(0, 1),
    layers: [
      tone('sine', 110, 40, 0.5, 0.9), // the fall
      noise('lowpass', 900, 150, 0.3, 0.4),
      ...bell(0.45, 0.4, 0.05), // three notes down the key: the tonic,
      partial(0.75, 0.45, 0.4, { delay: 0.25 }), // the fifth below it,
      partial(1.5, 0.2, 0.06, { delay: 0.25 }),
      tone('sine', 0.5, 0.47, 0.8, 0.45, { tuned: true, delay: 0.45, attack: 0.004 }), // and the tonic under that, sagging as it goes
    ],
  },

  // ---- the run
  // Chimes come in by the handful, so each is tiny and the engine spaces them out.
  pickup: {
    gap: 0.07,
    jitter: 0.01,
    space: 0.2,
    home: at(7, 3),
    layers: [partial(1, 0.1, 0.5), partial(2, 0.05, 0.15), noise('bandpass', 6400, 5400, 0.01, 0.15, { q: 2 })],
  },
  // A Chime worth five: the fifth, then the tonic above it.
  pickupBig: {
    gap: 0.07,
    jitter: 0.01,
    space: 0.25,
    home: at(7, 3),
    layers: [
      partial(1, 0.09, 0.45),
      partial(2, 0.04, 0.12),
      partial(4 / 3, 0.2, 0.5, { delay: 0.055 }),
      partial(8 / 3, 0.08, 0.14, { delay: 0.055 }),
      noise('bandpass', 6400, 5400, 0.01, 0.15, { q: 2 }),
    ],
  },
  // A call on a low reed: the tonic, then the fifth above it.
  waveStart: {
    space: 0.35,
    home: at(0, 0),
    layers: [
      tone('sawtooth', 1, 1, 0.12, 0.5, { tuned: true, attack: 0.04, hold: 0.16, damp: [6, 4], vibrato: { rate: 5.5, depth: 12 } }),
      tone('sawtooth', 1.5, 1.5, 0.35, 0.55, { tuned: true, attack: 0.04, hold: 0.3, delay: 0.26, damp: [6, 4], vibrato: { rate: 5.5, depth: 12 } }),
      noise('lowpass', 500, 200, 0.4, 0.15, { attack: 0.1, hold: 0.3 }), // the breath behind it
    ],
  },
  // One bell of the figure that tells a chamber is cleared. Whoever plays it rings four, up the chord of the key.
  roomClear: {
    space: 0.45,
    jitter: 0,
    home: at(0, 2),
    layers: bell(1.2, 0.6, 0, 0.08),
  },
  shockwave: {
    layers: [
      noise('lowpass', 1500, 180, 0.3, 0.6, { attack: 0.015 }), // a ring of air going out
      tone('sine', 96, 44, 0.24, 0.6),
      noise('bandpass', 900, 2600, 0.16, 0.2, { q: 1.5, attack: 0.03 }),
    ],
  },

  // ---- the interface
  uiMove: {
    home: at(7, 2),
    layers: [partial(1, 0.035, 0.4), noise('bandpass', 3600, 3000, 0.012, 0.25, { q: 3 })],
  },
  uiConfirm: {
    space: 0.2,
    home: at(0, 2),
    layers: [...bell(0.3, 0.5, 0, 0.1), tone('sine', 180, 80, 0.07, 0.4), noise('lowpass', 1400, 400, 0.04, 0.2)],
  },
  uiBack: {
    home: at(0, 2),
    layers: [tone('sine', 1, 0.75, 0.06, 0.4, { tuned: true }), noise('bandpass', 1900, 1400, 0.02, 0.2, { q: 2.5 })],
  },
  uiError: {
    layers: [
      tone('triangle', 185, 150, 0.05, 0.5), // twice, with a knuckle
      noise('bandpass', 850, 650, 0.035, 0.4, { q: 2 }),
      tone('triangle', 185, 150, 0.05, 0.5, { delay: 0.1 }),
      noise('bandpass', 850, 650, 0.035, 0.4, { q: 2, delay: 0.1 }),
    ],
  },
  // Chimes changing hands: the fifth, then the tonic above it.
  uiBuy: {
    space: 0.25,
    home: at(7, 2),
    layers: [
      partial(1, 0.12, 0.45),
      partial(2, 0.05, 0.12),
      partial(4 / 3, 0.3, 0.5, { delay: 0.07 }),
      partial(8 / 3, 0.12, 0.14, { delay: 0.07 }),
      noise('bandpass', 6000, 5000, 0.012, 0.2, { q: 2 }),
    ],
  },
  // Something taken for good: a thump, and the tonic with its fifth over it.
  uiTake: {
    space: 0.35,
    home: at(0, 1),
    layers: [tone('sine', 150, 58, 0.14, 0.6), noise('lowpass', 1300, 320, 0.07, 0.35), ...bell(0.8, 0.45, 0.03, 0.1), partial(1.5, 0.7, 0.3, { delay: 0.03 })],
  },
};

// ---------------------------------------------------------------- reading a recipe

/** Seconds from a layer's start until it has fallen silent. */
export const layerLife = (layer: Layer): number => layer.attack + layer.hold + layer.decay;

/** Seconds from the trigger until the last layer has fallen silent. */
export function recipeDuration(recipe: Recipe): number {
  let end = 0;
  for (const l of recipe.layers) end = Math.max(end, l.delay + layerLife(l));
  return end;
}

/** True if any layer of the sound is written against a note of the key. */
export const isTuned = (recipe: Recipe): boolean => recipe.layers.some((l) => l.tuned);

/** The note a sound rings at in a zone when nobody says otherwise, in hertz; 0 for a sound with no tuned layer. */
export function homeNote(recipe: Recipe, zone: ZoneId): number {
  return recipe.home ? toneOf(zone, recipe.home.interval, recipe.home.octave) : 0;
}

/**
 * What a layer's written `from` and `to` are multiplied by to get hertz, for one play: the note
 * for a tuned layer, the asked-for pitch shift for the rest. `drift` is this play's random
 * retuning (a fraction, either way), of which a tuned layer takes only a share.
 */
export const tuning = (layer: Layer, note: number, pitch: number, drift: number): number => (layer.tuned ? note * (1 + drift * TUNED_SHARE) : pitch * (1 + drift));

/** How loud a layer is `t` seconds after its sound was triggered, as a share of its own peak. */
function envelopeAt(l: Layer, t: number): number {
  const u = t - l.delay;
  if (u < 0) return 0;
  if (u < l.attack) return u / l.attack;
  const v = u - l.attack - l.hold;
  if (v <= 0) return 1;
  if (v >= l.decay) return 0;
  return SILENCE ** (v / l.decay);
}

/**
 * The loudest a sound is, or is still to be, from `t` seconds after it was triggered: 1 is a
 * layer at full level, 0 once everything has died. The sound's own `level` is not counted. The
 * engine reads this to find a voice quiet enough to give up.
 */
export function ringing(recipe: Recipe, t: number): number {
  let loud = 0;
  for (const l of recipe.layers) {
    // a layer that has not reached its peak yet still has it to come
    const k = t - l.delay < l.attack ? 1 : envelopeAt(l, t);
    loud = Math.max(loud, l.gain * k);
  }
  return loud;
}

// ---------------------------------------------------------------- noise level

/** RMS of white noise spread evenly over -1..1. */
const NOISE_RMS = 1 / Math.sqrt(3);
/** Peaks of filtered noise stand about this far above its RMS. */
const NOISE_CREST = 3.2;

/**
 * Share of white noise's power that passes a filter sitting at `hz`. These are the Web Audio
 * filter coefficients, normalised so the leading denominator term is 1.
 */
export function passed(filter: NoiseFilter, q: number, hz: number, sampleRate: number): number {
  const w = (2 * Math.PI * Math.min(hz, sampleRate * 0.49)) / sampleRate;
  const cos = Math.cos(w);
  const band = filter === 'bandpass';
  // a low-pass takes its sharpness in decibels
  const alpha = Math.sin(w) / (2 * (band ? q : 10 ** (q / 20)));
  const a1 = (-2 * cos) / (1 + alpha);
  const a2 = (1 - alpha) / (1 + alpha);
  const b0 = (band ? alpha : (1 - cos) / 2) / (1 + alpha);
  const b1 = band ? 0 : 2 * b0;
  const b2 = band ? -b0 : b0;
  // Output variance of a second-order section driven by white noise of unit variance.
  const num = (b0 * b0 + b1 * b1 + b2 * b2) * (1 + a2) - 2 * b1 * (b0 + b2) * a1 + 2 * b0 * b2 * (a1 * a1 - a2 * (1 + a2));
  const den = (1 - a2) * ((1 + a2) * (1 + a2) - a1 * a1);
  return num / den;
}

/**
 * How much a noise layer must be boosted for its `gain` to mean what a tone's does: roughly the
 * peak level. A narrow filter throws most of the noise away, so without this a rasp at gain 0.5
 * would be a fraction as loud as a thud at 0.5. Measured where the sweep is loudest; `fromHz`
 * and `toHz` are the two ends of the sweep as it will really be played.
 */
export function noiseMakeup(layer: NoiseLayer, fromHz: number, toHz: number, sampleRate: number): number {
  const kept = Math.max(passed(layer.filter, layer.q, fromHz, sampleRate), passed(layer.filter, layer.q, toHz, sampleRate));
  return 1 / (NOISE_RMS * NOISE_CREST * Math.sqrt(kept));
}

// ---------------------------------------------------------------- validation

const within = (v: number, lo: number, hi: number): boolean => Number.isFinite(v) && v >= lo && v <= hi;

/** Sanity checks used by tests: every number finite and in range, nothing too long, nothing out of hearing. */
export function validateRecipe(id: string, recipe: Recipe): string[] {
  const problems: string[] = [];
  const jitter = recipe.jitter ?? PITCH_JITTER;
  if (!within(jitter, 0, MAX_JITTER)) problems.push(`${id}: pitch jitter outside 0..${MAX_JITTER}`);
  if (recipe.level !== undefined && (!within(recipe.level, 0, 1) || recipe.level === 0)) problems.push(`${id}: level outside 0..1`);
  if (recipe.space !== undefined && !within(recipe.space, 0, 1)) problems.push(`${id}: space outside 0..1`);
  if (recipe.gap !== undefined && !within(recipe.gap, 0, MAX_GAP)) problems.push(`${id}: gap outside 0..${MAX_GAP} s`);
  if (isTuned(recipe) !== (recipe.home !== undefined)) problems.push(`${id}: a sound has a home note exactly when it has a tuned layer`);
  if (recipe.home && (!within(recipe.home.interval, 0, 12) || !within(recipe.home.octave, 0, 4))) problems.push(`${id}: home note outside the key`);
  const drift = within(jitter, 0, MAX_JITTER) ? jitter : 0;

  const layers = recipe.layers;
  if (layers.length < 1 || layers.length > MAX_LAYERS) problems.push(`${id}: needs 1..${MAX_LAYERS} layers, has ${layers.length}`);
  layers.forEach((l, i) => {
    const where = `${id}: layer ${i}`;
    if (!within(l.delay, 0, MAX_SECONDS)) problems.push(`${where} has a delay outside 0..${MAX_SECONDS} s`);
    if (!within(l.attack, MIN_ATTACK, MAX_ATTACK)) problems.push(`${where} has an attack outside ${MIN_ATTACK}..${MAX_ATTACK} s`);
    if (!within(l.hold, 0, MAX_HOLD)) problems.push(`${where} has a hold outside 0..${MAX_HOLD} s`);
    if (!within(l.decay, MIN_DECAY, MAX_SECONDS)) problems.push(`${where} has a decay outside ${MIN_DECAY}..${MAX_SECONDS} s`);
    if (!within(l.gain, 0, 1) || l.gain === 0) problems.push(`${where} has a gain outside 0..1`);
    if (l.slide !== undefined && !within(l.slide, MIN_ATTACK, MAX_SECONDS)) problems.push(`${where} has a slide outside ${MIN_ATTACK}..${MAX_SECONDS} s`);
    // how far vibrato carries the pitch past its written path
    let bend = 1;
    if (l.kind === 'tone') {
      if (!WAVES.includes(l.wave)) problems.push(`${where} has an unknown wave`);
      if (l.vibrato) {
        if (within(l.vibrato.rate, 0.1, MAX_VIBRATO_RATE) && within(l.vibrato.depth, 1, MAX_VIBRATO_CENTS)) bend = 2 ** (l.vibrato.depth / 1200);
        else problems.push(`${where} has a vibrato outside ${MAX_VIBRATO_RATE} Hz or ${MAX_VIBRATO_CENTS} cents`);
      }
      if (l.damp && !l.damp.every((d) => within(d, MIN_DAMP, MAX_DAMP))) problems.push(`${where} is damped outside ${MIN_DAMP}..${MAX_DAMP} times its pitch`);
    } else {
      if (!FILTERS.includes(l.filter)) problems.push(`${where} is neither a tone nor a band-pass or low-pass noise burst`);
      const sharp = l.filter === 'bandpass' ? within(l.q, MIN_Q, MAX_Q) : within(l.q, MIN_BUMP, MAX_BUMP);
      if (!sharp) problems.push(`${where} has a q out of range`);
    }
    if (l.tuned && (!within(l.from, MIN_RATIO, MAX_RATIO) || !within(l.to, MIN_RATIO, MAX_RATIO))) {
      problems.push(`${where} is tuned, so it is written in multiples of its note: ${MIN_RATIO}..${MAX_RATIO}`);
    }
    // A sound must stay in hearing wherever it is at home: an untuned layer as written, a tuned one in every zone's key.
    const notes = l.tuned ? (Object.keys(KEYS) as ZoneId[]).map((zone) => homeNote(recipe, zone)) : [1];
    for (const note of notes) {
      const low = (Math.min(l.from, l.to) * tuning(l, note, 1, -drift)) / bend;
      const high = Math.max(l.from, l.to) * tuning(l, note, 1, drift) * bend;
      if (!within(low, MIN_HZ, MAX_HZ) || !within(high, MIN_HZ, MAX_HZ)) {
        problems.push(`${where} leaves ${MIN_HZ}..${MAX_HZ} Hz`);
        break;
      }
    }
  });

  const seconds = recipeDuration(recipe);
  if (!within(seconds, MIN_DECAY, MAX_SECONDS)) problems.push(`${id}: runs ${seconds} s, outside the ${MAX_SECONDS} s limit`);
  return problems;
}
