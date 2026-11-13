// What every sound is made of. Pure data and pure functions: no Web Audio types and no DOM, so
// the whole table can be checked headless. engine.ts turns these numbers into audio nodes.
//
// THE PALETTE (small and dry: nothing electronic, nothing from a games console)
//   chalk, pencil   a few milliseconds of noise through a narrow band, high up
//   wood, ground    a sine that drops fast, under a duller triangle knock
//   cord            a triangle that starts a shade sharp and settles, with a buzz that dies first
//   air             noise through a band that sweeps, swelling in instead of striking
//   paper           noise through a band narrow enough to rasp, sweeping down
//   ink             a sine that rises like a drop, with low-passed noise for the wet
//   the bell        a pure hum with its twelfth above, the way handbells are tuned
//
// THE MODEL
//   A sound is a short list of LAYERS. A layer is a TONE (an oscillator whose pitch slides) or a
//   NOISE burst (white noise through a filter whose frequency slides). Both share one envelope:
//   a linear attack, then an exponential decay that ends the layer.
//
// THE KEY
//   Everything pitched is in A, so the chimes of play sit inside whichever bed is running. Each
//   play is retuned a little so repeats do not sound stamped out, but a layer marked `tuned` (a
//   bell, a note of a figure) barely moves: the stamp varies, the bell over it stays in key.
//
// Units: seconds, hertz, and levels where 1 is full scale.
import { clamp, clamp01, lerp } from '../core/math';

// ---------------------------------------------------------------- ids

const IDS = [
  'plant',
  'whip',
  'ripen',
  'discharge',
  'trip',
  'swing1',
  'swing2',
  'swing3',
  'hit',
  'hitHeavy',
  'hammer',
  'plumbFire',
  'plumbHook',
  'dash',
  'dashReady',
  'dashRefund',
  'hurt',
  'playerDeath',
  'enemySpawn',
  'telegraph',
  'enemyAttack',
  'enemyHurt',
  'enemyDeath',
  'sever',
  'eat',
  'shove',
  'pickup',
  'uiMove',
  'uiConfirm',
  'uiBack',
  'draft',
  'doorOpen',
  'roomClear',
  'bossRoar',
  'bossPhase',
  'victory',
  'defeat',
  'error',
] as const;

export type SoundId = (typeof IDS)[number];
export const SOUND_IDS: readonly SoundId[] = IDS;

export type AmbienceId = 'none' | 'title' | 'bluefen' | 'unruled' | 'boss';

// ---------------------------------------------------------------- layers

/** No square wave: it is the sound of a games console, and this is a drawing office. */
export type Wave = 'sine' | 'triangle' | 'sawtooth';
export type NoiseFilter = 'bandpass' | 'lowpass';

interface Envelope {
  /** Seconds after the trigger at which the layer starts. */
  delay: number;
  /** Seconds to rise from silence to full level. */
  attack: number;
  /** Seconds to fall 60 dB from full level. The layer ends here; it sounds about half this long. */
  decay: number;
  /** Peak level, 0..1. */
  gain: number;
}

export interface Vibrato {
  /** Wobbles per second. */
  rate: number;
  /** How far the pitch swings either way, in cents. */
  depth: number;
}

export interface ToneLayer extends Envelope {
  kind: 'tone';
  wave: Wave;
  /** Pitch at the start and at the end. It slides exponentially between them over the layer's life. */
  from: number;
  to: number;
  vibrato?: Vibrato;
  /** A note of the key: it holds its pitch while the layers around it are retuned from play to play. */
  tuned?: boolean;
}

export interface NoiseLayer extends Envelope {
  kind: 'noise';
  filter: NoiseFilter;
  /** Filter frequency at the start and at the end, sliding the same way a tone's pitch does. */
  from: number;
  to: number;
  /**
   * Sharpness of the filter. Band-pass: centre frequency over bandwidth, so higher is narrower
   * and more pitched. Low-pass: resonance at the cutoff, where 0.7 is flat.
   */
  q: number;
}

export type Layer = ToneLayer | NoiseLayer;

export interface Recipe {
  layers: readonly Layer[];
  /** Share of the sound sent into the shared echo, 0..1. Omitted means dry. */
  space?: number;
  /** Random pitch spread per play, either way, as a fraction. Omitted means PITCH_JITTER. */
  jitter?: number;
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
 * of cancelling, too little to sour them against the bed.
 */
export const TUNED_SHARE = 0.125;
/** A layer has ended once it has fallen this far below its peak: 60 dB. */
export const SILENCE = 0.001;

const MAX_JITTER = 0.1;
const MIN_ATTACK = 0.001;
const MAX_ATTACK = 1;
const MIN_DECAY = 0.005;
const MIN_Q = 0.3;
const MAX_Q = 20;
const MAX_VIBRATO_RATE = 60;
const MAX_VIBRATO_CENTS = 400;
/** A note of a bed may ring longer than any sound of play: it is quiet, and there is one at a time. */
const MAX_RING = 4;
/** Bed notes and beats are never closer together than this, so a scheduler can never be asked for an endless burst. */
const MIN_WAIT = 0.05;

const WAVES: readonly Wave[] = ['sine', 'triangle', 'sawtooth'];
const FILTERS: readonly NoiseFilter[] = ['bandpass', 'lowpass'];

// ---------------------------------------------------------------- building blocks

/** Attack of anything struck: fast enough to read as a hit, slow enough not to click. */
const STRUCK = 0.002;

const tone = (
  wave: Wave,
  from: number,
  to: number,
  decay: number,
  gain: number,
  more: { attack?: number; delay?: number; vibrato?: Vibrato; tuned?: boolean } = {},
): ToneLayer => ({
  kind: 'tone',
  wave,
  from,
  to,
  decay,
  gain,
  attack: more.attack ?? STRUCK,
  delay: more.delay ?? 0,
  vibrato: more.vibrato,
  tuned: more.tuned,
});

const noise = (
  filter: NoiseFilter,
  from: number,
  to: number,
  decay: number,
  gain: number,
  more: { q?: number; attack?: number; delay?: number } = {},
): NoiseLayer => ({
  kind: 'noise',
  filter,
  from,
  to,
  decay,
  gain,
  q: more.q ?? (filter === 'bandpass' ? 1 : 0.7),
  attack: more.attack ?? STRUCK,
  delay: more.delay ?? 0,
});

/**
 * Equal-tempered pitch, in semitones from A4. Everything pitched shares one key (A, over a D in
 * the darker beds), so the chimes of play sit inside whichever bed is running.
 */
const note = (semitones: number): number => 440 * 2 ** (semitones / 12);
const D2 = note(-31);
const A2 = note(-24);
const A3 = note(-12);
const D4 = note(-7);
const A4 = note(0);
const C5 = note(3);
const D5 = note(5);
const E5 = note(7);
const A5 = note(12);
const CS6 = note(16);
const D6 = note(17);
const E6 = note(19);
const A6 = note(24);
const E7 = note(31);

/**
 * The small brass bell: a pure hum with its twelfth above. `glint` adds the clapper's
 * inharmonic flash for the bells that should read as bright.
 */
function bell(hz: number, decay: number, gain: number, delay = 0, glint = 0): Layer[] {
  const layers = [
    tone('sine', hz, hz, decay, gain, { attack: 0.003, delay, tuned: true }),
    tone('sine', hz * 3, hz * 3, decay * 0.45, gain * 0.22, { delay, tuned: true }),
  ];
  if (glint > 0) layers.push(tone('sine', hz * 4.16, hz * 4.16, decay * 0.16, gain * glint, { delay, tuned: true }));
  return layers;
}

/** A rubber stamp coming down on a ledger: the thump under every confirmation. */
const stamp = (gain: number): Layer[] => [
  tone('sine', 138, 56, 0.13, gain),
  noise('lowpass', 1250, 300, 0.07, gain * 0.6),
  noise('bandpass', 2600, 2000, 0.016, gain * 0.2, { q: 2 }),
];

/** One pitched knock on wood. */
const woodNote = (hz: number, decay: number, gain: number, delay: number): Layer[] => [
  tone('triangle', hz, hz, decay, gain, { delay, tuned: true }),
  tone('sine', hz * 4, hz * 4, 0.035, gain * 0.25, { delay, tuned: true }),
];

// ---------------------------------------------------------------- the sounds

export const RECIPES: Record<SoundId, Recipe> = {
  // ---- stakes and lines
  plant: {
    layers: [
      tone('sine', 150, 48, 0.2, 0.9), // the stake going into the ground
      tone('triangle', 330, 170, 0.06, 0.3), // the wood itself
      noise('lowpass', 1400, 400, 0.05, 0.4), // the blow
      noise('bandpass', 4600, 3800, 0.035, 0.22, { q: 2.5, delay: 0.014 }), // a tick of chalk
    ],
  },
  // The signature. Meant to be triggered at take-off: the zip covers the stake's 0.15 s flight
  // and the snap lands with it.
  whip: {
    layers: [
      noise('bandpass', 420, 5200, 0.03, 0.5, { q: 4, attack: 0.11 }), // the zip: cord running out, rising as it swells
      noise('bandpass', 3600, 2400, 0.06, 0.95, { q: 0.8, delay: 0.13 }), // the snap
      noise('bandpass', 7600, 6000, 0.03, 0.4, { q: 1.5, delay: 0.13 }), // its crisp top edge
      tone('sine', 230, 85, 0.09, 0.5, { delay: 0.13 }), // the cord slapping the floor
      tone('triangle', 311, 294, 0.16, 0.16, { delay: 0.134 }), // and humming for a moment after
    ],
  },
  // Heard every couple of seconds, so it is soft and short: one bell on the fifth of the key.
  ripen: { space: 0.3, layers: bell(E6, 0.75, 0.3, 0, 0.08) },
  discharge: {
    space: 0.3,
    layers: [
      noise('bandpass', 5200, 2600, 0.07, 0.9, { q: 0.9 }), // a snap brighter than the whip's
      noise('lowpass', 2400, 300, 0.1, 0.45), // the crack's body
      tone('sine', 170, 60, 0.14, 0.55), // weight: this is the big one
      ...bell(A6, 0.9, 0.34, 0.012, 0.2), // the ripe bell, a fourth above the one that announced it
    ],
  },
  trip: {
    space: 0.15,
    layers: [
      tone('triangle', 232, A3, 0.24, 0.5), // the cord, sharp for an instant and then settling
      tone('sawtooth', 464, 440, 0.07, 0.12), // its buzz against the floor
      noise('bandpass', 2600, 1800, 0.025, 0.25, { q: 2 }), // the pluck
    ],
  },
  sever: {
    layers: [
      noise('bandpass', 1900, 1500, 0.03, 0.5, { q: 2 }), // the blades closing
      noise('bandpass', 1300, 1000, 0.04, 0.45, { q: 2, delay: 0.045 }), // and meeting
      tone('triangle', 250, 140, 0.13, 0.2, { delay: 0.05 }), // the line going slack
    ],
  },
  eat: {
    layers: [
      noise('bandpass', 1100, 900, 0.045, 0.6, { q: 1.5 }), // three uneven bites through the wood
      noise('bandpass', 1750, 1300, 0.04, 0.5, { q: 2, delay: 0.04 }),
      noise('bandpass', 820, 600, 0.055, 0.55, { q: 1.5, delay: 0.085 }),
      noise('lowpass', 700, 250, 0.09, 0.4, { delay: 0.125 }), // the swallow
      tone('triangle', 170, 70, 0.11, 0.35),
    ],
  },
  shove: {
    layers: [
      tone('sine', 84, 32, 0.5, 1), // the boom
      tone('triangle', 150, 52, 0.22, 0.34), // the part of it small speakers can carry
      noise('lowpass', 750, 85, 0.36, 0.55), // ground giving way
    ],
  },

  // ---- the rod and the plumb bob
  swing1: {
    layers: [
      noise('bandpass', 650, 2100, 0.13, 0.42, { q: 1.3, attack: 0.05 }), // air rising with the stroke
      noise('bandpass', 3200, 5200, 0.09, 0.14, { q: 0.8, attack: 0.05 }),
    ],
  },
  swing2: {
    layers: [
      noise('bandpass', 2300, 800, 0.13, 0.42, { q: 1.3, attack: 0.05 }), // the backhand: the same air, falling
      noise('bandpass', 5200, 3000, 0.09, 0.14, { q: 0.8, attack: 0.05 }),
    ],
  },
  swing3: {
    layers: [
      noise('bandpass', 380, 1500, 0.2, 0.6, { q: 1.1, attack: 0.09 }), // lower, longer, more of it
      noise('lowpass', 500, 160, 0.22, 0.4, { attack: 0.08 }),
    ],
  },
  hit: {
    layers: [
      tone('sine', 200, 80, 0.1, 0.7), // the thock
      tone('triangle', 440, 230, 0.045, 0.28), // the rod's own wood
      noise('lowpass', 1600, 420, 0.07, 0.5), // damp: ink takes the edge off
    ],
  },
  hitHeavy: {
    layers: [
      tone('sine', 125, 42, 0.26, 0.95), // the low body
      tone('triangle', 300, 130, 0.08, 0.4),
      noise('lowpass', 1900, 300, 0.11, 0.6),
      noise('bandpass', 3200, 2200, 0.03, 0.25), // the crack on top
    ],
  },
  // Struck metal, so the partials of a free bar and not the bell's sweet twelfth.
  hammer: {
    space: 0.25,
    layers: [
      tone('sine', E7, E7, 0.38, 0.34),
      tone('sine', E7 * 2.756, E7 * 2.756, 0.18, 0.16),
      tone('sine', E7 * 5.404, E7 * 5.404, 0.07, 0.07),
      noise('bandpass', 5200, 4200, 0.02, 0.3, { q: 1.2 }), // the strike
      tone('triangle', 520, 300, 0.04, 0.3), // rod on wood, under the ring
    ],
  },
  plumbFire: {
    space: 0.12,
    layers: [
      tone('triangle', 345, 330, 0.2, 0.42), // the cord let go
      tone('sawtooth', 690, 660, 0.05, 0.1),
      tone('triangle', 560, 400, 0.2, 0.2, { attack: 0.03, delay: 0.02, vibrato: { rate: 31, depth: 120 } }), // the bob whirring out
      noise('bandpass', 1500, 2800, 0.14, 0.2, { q: 2, attack: 0.04, delay: 0.02 }),
    ],
  },
  plumbHook: {
    layers: [
      noise('bandpass', 3400, 2600, 0.02, 0.5, { q: 3 }), // the click of the hook biting
      tone('triangle', 980, 720, 0.03, 0.3),
      tone('triangle', 175, 233, 0.16, 0.45, { attack: 0.02, delay: 0.05 }), // the tug: a cord rises in pitch as it comes taut
      tone('sine', 105, 70, 0.12, 0.4, { delay: 0.05 }),
    ],
  },

  // ---- the Chainman
  dash: {
    layers: [
      noise('bandpass', 520, 3400, 0.15, 0.5, { q: 0.9, attack: 0.03 }), // a coat going past
      noise('lowpass', 600, 200, 0.12, 0.2, { attack: 0.02 }),
    ],
  },
  dashReady: {
    layers: [tone('triangle', 1320, 1180, 0.04, 0.14), noise('bandpass', 4200, 3600, 0.015, 0.08, { q: 2 })],
  },
  dashRefund: {
    space: 0.2,
    layers: [
      tone('triangle', D5, E5, 0.16, 0.4), // a twang that rises: the line gives the charge back
      tone('sine', E6, E6, 0.2, 0.14),
      tone('sawtooth', D6, E6, 0.04, 0.08),
      noise('bandpass', 3800, 3000, 0.02, 0.2, { q: 2 }),
    ],
  },
  hurt: {
    layers: [
      tone('sine', 115, 44, 0.28, 0.9), // the thud
      noise('lowpass', 1000, 180, 0.14, 0.5),
      tone('sawtooth', 233, 185, 0.2, 0.13), // the edge: two voices a semitone apart, grinding
      tone('sawtooth', 247, 196, 0.2, 0.13),
    ],
  },
  playerDeath: {
    layers: [
      tone('triangle', 392, 62, 0.85, 0.5, { attack: 0.02 }), // the falling tone
      tone('sine', 196, 31, 0.85, 0.45, { attack: 0.02 }),
      noise('bandpass', 4200, 900, 0.7, 0.55, { q: 5, attack: 0.03, delay: 0.06 }), // the sheet tearing
      noise('bandpass', 2400, 500, 0.75, 0.4, { q: 7, attack: 0.05, delay: 0.22 }),
    ],
  },
  // Collected in runs, so it is tiny and each one lands on a slightly different pitch.
  pickup: {
    jitter: 0.08,
    layers: [tone('sine', 2100, 2400, 0.045, 0.14), noise('bandpass', 6200, 5200, 0.012, 0.07, { q: 2 })],
  },

  // ---- Errata
  enemySpawn: {
    layers: [
      tone('sine', 150, 460, 0.2, 0.4, { attack: 0.03, vibrato: { rate: 17, depth: 45 } }), // something surfacing through ink
      noise('lowpass', 350, 1500, 0.16, 0.3, { attack: 0.04 }),
    ],
  },
  // A warning has to be found in a crowd of other sounds: a narrow rasp that climbs, with just enough tone to carry a pitch.
  telegraph: {
    layers: [
      noise('bandpass', 1500, 3400, 0.07, 0.5, { q: 7 }),
      tone('triangle', 620, 930, 0.06, 0.16),
      noise('bandpass', 4400, 4000, 0.02, 0.15, { q: 2 }),
    ],
  },
  enemyAttack: {
    layers: [
      noise('bandpass', 2600, 650, 0.1, 0.6, { q: 2.5 }), // the spit
      tone('sine', 560, 130, 0.08, 0.3),
      noise('bandpass', 5000, 4000, 0.015, 0.25, { q: 1.5 }), // its sharp front
    ],
  },
  enemyHurt: {
    layers: [tone('sine', 290, 540, 0.055, 0.26), noise('lowpass', 1300, 450, 0.045, 0.24)], // one drop
  },
  enemyDeath: {
    layers: [
      noise('bandpass', 2300, 170, 0.34, 0.8, { q: 1.6, attack: 0.004 }), // the splat, falling as it spreads
      noise('lowpass', 950, 110, 0.26, 0.42),
      tone('sine', 270, 55, 0.22, 0.34),
    ],
  },
  bossRoar: {
    layers: [
      noise('bandpass', 5600, 2300, 0.8, 0.8, { q: 4, attack: 0.05 }), // one long tear in three overlapping pulls, each lower
      noise('bandpass', 3300, 1050, 0.9, 0.8, { q: 5, attack: 0.14, delay: 0.3 }),
      noise('bandpass', 1700, 360, 1.0, 0.8, { q: 6, attack: 0.16, delay: 0.66 }),
      noise('lowpass', 420, 80, 1.3, 0.6, { attack: 0.2 }),
      tone('sine', 98, 36, 1.4, 0.5, { attack: 0.12 }), // the weight behind the paper
    ],
  },
  bossPhase: {
    layers: [
      tone('sine', 96, 34, 0.5, 1), // the thud
      noise('lowpass', 850, 110, 0.32, 0.6),
      noise('bandpass', 4300, 760, 0.7, 0.7, { q: 5, attack: 0.04, delay: 0.09 }), // and the tear after it
      noise('bandpass', 2500, 430, 0.7, 0.5, { q: 7, attack: 0.06, delay: 0.24 }),
    ],
  },

  // ---- menus and the run
  uiMove: {
    layers: [noise('bandpass', 3400, 2800, 0.02, 0.3, { q: 3 }), tone('triangle', 1900, 1450, 0.014, 0.1)], // a pencil tick
  },
  uiConfirm: { layers: stamp(0.8) },
  uiBack: {
    layers: [noise('bandpass', 1700, 1300, 0.028, 0.22, { q: 2.5 }), tone('triangle', 900, 680, 0.022, 0.08)], // the same pencil, flat side
  },
  error: {
    layers: [
      tone('triangle', 196, 165, 0.05, 0.34), // twice on the desk with a knuckle
      noise('bandpass', 850, 650, 0.035, 0.3, { q: 2 }),
      tone('triangle', 196, 165, 0.05, 0.34, { delay: 0.1 }),
      noise('bandpass', 850, 650, 0.035, 0.3, { q: 2, delay: 0.1 }),
    ],
  },
  draft: { space: 0.35, layers: [...stamp(0.75), ...bell(A6, 0.85, 0.28, 0.06, 0.12), ...bell(E7, 0.45, 0.1, 0.06)] },
  doorOpen: {
    space: 0.2,
    layers: [
      tone('triangle', 250, 150, 0.07, 0.6), // the knock
      noise('lowpass', 1600, 600, 0.035, 0.4),
      ...woodNote(A4, 0.16, 0.3, 0.14), // and three steps up that stop on the fifth, unresolved: onward
      ...woodNote(D5, 0.16, 0.3, 0.24),
      ...woodNote(E5, 0.3, 0.34, 0.34),
    ],
  },
  roomClear: { space: 0.35, layers: [...bell(D6, 0.5, 0.26), ...bell(E6, 0.5, 0.26, 0.11), ...bell(A6, 0.8, 0.3, 0.22)] },
  victory: {
    space: 0.4,
    layers: [
      ...bell(A5, 0.5, 0.26), // up the major triad
      ...bell(CS6, 0.5, 0.26, 0.14),
      ...bell(E6, 0.55, 0.26, 0.28),
      ...bell(A6, 1.03, 0.3, 0.46, 0.1), // and home, with the octave and the root under it
      ...bell(A5, 1.03, 0.2, 0.46),
      tone('triangle', A3, A3, 0.9, 0.16, { attack: 0.01, delay: 0.46, tuned: true }),
    ],
  },
  defeat: {
    space: 0.25,
    layers: [
      ...bell(E5, 0.45, 0.3), // down the minor triad
      ...bell(C5, 0.45, 0.3, 0.2),
      ...bell(A4, 0.5, 0.3, 0.4),
      tone('triangle', A3, 185, 0.56, 0.36, { attack: 0.01, delay: 0.62, tuned: true }), // and a last note that sags
      tone('sine', A2, 92.5, 0.56, 0.3, { attack: 0.01, delay: 0.62, tuned: true }),
    ],
  },
};

/**
 * How far one layer is retuned when the play as a whole drifts by `drift` (a fraction, either
 * way). A tuned layer takes only a share of it.
 */
export const retune = (layer: Layer, drift: number): number => 1 + drift * (layer.kind === 'tone' && layer.tuned ? TUNED_SHARE : 1);

/** Seconds from the trigger until the last layer has fallen silent. */
export function recipeDuration(recipe: Recipe): number {
  let end = 0;
  for (const l of recipe.layers) end = Math.max(end, l.delay + l.attack + l.decay);
  return end;
}

// ---------------------------------------------------------------- noise level

/** RMS of white noise spread evenly over -1..1. */
const NOISE_RMS = 1 / Math.sqrt(3);
/** Peaks of filtered noise stand about this far above its RMS. */
const NOISE_CREST = 3.2;

/** Share of white noise's power that passes the layer's filter while it sits at `hz`. */
function passed(layer: NoiseLayer, hz: number, sampleRate: number): number {
  const w = (2 * Math.PI * Math.min(hz, sampleRate * 0.49)) / sampleRate;
  const cos = Math.cos(w);
  const band = layer.filter === 'bandpass';
  // The Web Audio filter coefficients, normalised so the leading denominator term is 1.
  const alpha = Math.sin(w) / (2 * layer.q);
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
 * would be a fraction as loud as a thud at 0.5. Measured where the sweep is loudest.
 */
export function noiseMakeup(layer: NoiseLayer, sampleRate: number): number {
  const kept = Math.max(passed(layer, layer.from, sampleRate), passed(layer, layer.to, sampleRate));
  return 1 / (NOISE_RMS * NOISE_CREST * Math.sqrt(kept));
}

// ---------------------------------------------------------------- ambience

export type BedId = 'bluefen' | 'unruled' | 'boss';

export interface DroneVoice {
  wave: Wave;
  hz: number;
  gain: number;
}

export interface BedNotes {
  /** One note at its written pitch. Every note played is this, transposed. */
  layers: readonly Layer[];
  /** Pitch multipliers the melody moves through, low to high. */
  scale: readonly number[];
  /** Notes in a phrase: fewest and most. */
  phrase: readonly [number, number];
  /** Seconds between notes inside a phrase: shortest and longest. */
  step: readonly [number, number];
  /** Seconds between phrases when calm: shortest and longest. */
  rest: readonly [number, number];
  /** The same at full intensity. */
  restBusy: readonly [number, number];
  /** How far below full level a note may land, 0..1, so no two are struck alike. */
  soften: number;
  /** Share of the notes sent into the shared echo, 0..1. */
  space: number;
}

export interface BedPulse {
  layers: readonly Layer[];
  /** Seconds between beats when calm and at full intensity. */
  period: readonly [number, number];
  /** Level of a beat when calm and at full intensity. Zero when calm means intensity brings the pulse in. */
  level: readonly [number, number];
}

/** A quiet generative bed: a drone that never stops, sparse notes over it, and a slow pulse underneath. */
export interface BedDef {
  /** Two voices a few cents apart, so the drone beats slowly against itself instead of standing still. */
  drone: readonly DroneVoice[];
  notes: BedNotes;
  pulse: BedPulse;
}

/** Which bed an ambience plays, and how loud next to the bed's own level. */
export interface AmbienceDef {
  bed: BedId;
  level: number;
}

/** A felt thump: mostly below what a laptop can play, with a quieter octave above for those that cannot. */
const PULSE: readonly Layer[] = [
  tone('sine', 62, 38, 0.32, 0.9, { attack: 0.006 }),
  tone('triangle', 124, 76, 0.12, 0.22),
  noise('lowpass', 320, 110, 0.1, 0.25),
];

const semitones = (steps: readonly number[]): number[] => steps.map((s) => 2 ** (s / 12));

export const BEDS: Record<BedId, BedDef> = {
  // Cool and wet: an open drone on A, and bell notes from the pentatonic A B D E G, which has
  // no third and so is neither glad nor sad. The notes ring into the echo.
  bluefen: {
    drone: [
      { wave: 'sine', hz: A2, gain: 0.6 },
      { wave: 'triangle', hz: A2 * 1.0038, gain: 0.4 },
    ],
    notes: {
      layers: [
        tone('sine', A4, A4, 2.4, 0.5, { attack: 0.005 }),
        tone('sine', A4 * 3, A4 * 3, 0.9, 0.08),
        tone('triangle', A3, A3, 1.2, 0.12, { attack: 0.01 }),
      ],
      scale: semitones([0, 2, 5, 7, 10, 12, 14, 17]),
      phrase: [1, 3],
      step: [0.28, 0.75],
      rest: [3.2, 7],
      restBusy: [1, 2.4],
      soften: 0.45,
      space: 0.35,
    },
    pulse: { layers: PULSE, period: [1.8, 1.2], level: [0, 0.6] },
  },
  // Warm and dry: a darker drone a fifth lower, and a pencil tapping on the desk at no fixed
  // pitch and no fixed time. Nothing here echoes.
  unruled: {
    drone: [
      { wave: 'triangle', hz: D2, gain: 0.6 },
      { wave: 'triangle', hz: D2 * 0.9943, gain: 0.45 },
    ],
    notes: {
      layers: [noise('bandpass', 2700, 2100, 0.03, 0.5, { q: 3 }), tone('triangle', 1250, 900, 0.022, 0.22)],
      scale: [0.8, 0.9, 1, 1.12, 1.26],
      phrase: [1, 4],
      step: [0.11, 0.34],
      rest: [2.4, 6],
      restBusy: [0.7, 1.8],
      soften: 0.6,
      space: 0,
    },
    pulse: { layers: PULSE, period: [1.5, 1.05], level: [0, 0.8] },
  },
  // The same dark drone pulled far enough apart to throb, a low bell tolling the minor
  // pentatonic on D, and the pulse there from the first moment.
  boss: {
    drone: [
      { wave: 'triangle', hz: D2, gain: 0.6 },
      { wave: 'triangle', hz: D2 * 1.0204, gain: 0.45 },
    ],
    notes: {
      layers: [
        tone('sine', D4, D4, 2.6, 0.5, { attack: 0.006 }),
        tone('sine', D4 * 2.756, D4 * 2.756, 0.7, 0.07),
        tone('triangle', D4 / 2, D4 / 2, 1.6, 0.2, { attack: 0.01 }),
      ],
      scale: semitones([0, 3, 5, 7, 10, 12]),
      phrase: [1, 2],
      step: [0.5, 1],
      rest: [4.5, 9],
      restBusy: [1.6, 3.4],
      soften: 0.3,
      space: 0.25,
    },
    pulse: { layers: PULSE, period: [1.3, 0.78], level: [0.75, 1] },
  },
};

export const AMBIENCES: Record<AmbienceId, AmbienceDef | null> = {
  none: null,
  title: { bed: 'bluefen', level: 0.6 },
  bluefen: { bed: 'bluefen', level: 1 },
  unruled: { bed: 'unruled', level: 1 },
  boss: { bed: 'boss', level: 1 },
};

/** Where a bed's melody stands: the degree of the scale it last played, and how many notes of the phrase are left. */
export interface BedCursor {
  degree: number;
  left: number;
}

export const bedCursor = (notes: BedNotes): BedCursor => ({ degree: Math.floor(notes.scale.length / 2), left: 0 });

export interface BedNote {
  /** Seconds after the previous note. */
  wait: number;
  /** Multiplier on the written pitch. */
  pitch: number;
  /** Multiplier on the written level. */
  gain: number;
}

/** Steps the melody may take along its scale: mostly to a neighbour, sometimes a skip, never a repeat. */
const STRIDES: readonly number[] = [-2, -1, -1, 1, 1, 2];

/** Intensity as callers give it: anything that is not a number counts as calm. */
const unit = (v: number): number => (Number.isFinite(v) ? clamp01(v) : 0);

/**
 * The next note of a bed. Notes come in short phrases with long rests between, and the melody
 * walks its scale instead of jumping about it. Intensity (0..1) shortens the rests.
 * `rand` returns numbers in [0, 1): the engine passes Math.random, tests pass a seeded generator.
 */
export function nextNote(notes: BedNotes, cursor: BedCursor, intensity: number, rand: () => number): BedNote {
  let wait: number;
  if (cursor.left > 0) {
    cursor.left--;
    wait = lerp(notes.step[0], notes.step[1], rand());
  } else {
    const [fewest, most] = notes.phrase;
    cursor.left = fewest + Math.floor(rand() * (most - fewest + 1)) - 1;
    const r = rand();
    wait = lerp(lerp(notes.rest[0], notes.rest[1], r), lerp(notes.restBusy[0], notes.restBusy[1], r), unit(intensity));
  }
  const top = notes.scale.length - 1;
  const stride = STRIDES[Math.floor(rand() * STRIDES.length)];
  // a step that would leave the scale is taken the other way instead
  const onward = cursor.degree + stride;
  cursor.degree = clamp(onward < 0 || onward > top ? cursor.degree - stride : onward, 0, top);
  return { wait: Math.max(wait, MIN_WAIT), pitch: notes.scale[cursor.degree], gain: 1 - rand() * notes.soften };
}

/** The longest a bed may now stay silent between phrases. Lets a rise in intensity be heard at once instead of after the old rest. */
export const longestRest = (notes: BedNotes, intensity: number): number => lerp(notes.rest[1], notes.restBusy[1], unit(intensity));

export interface Beat {
  /** Seconds until the next beat. */
  period: number;
  level: number;
}

export function pulseBeat(pulse: BedPulse, intensity: number): Beat {
  const k = unit(intensity);
  return { period: Math.max(lerp(pulse.period[0], pulse.period[1], k), MIN_WAIT), level: lerp(pulse.level[0], pulse.level[1], k) };
}

// ---------------------------------------------------------------- validation

const within = (v: number, lo: number, hi: number): boolean => Number.isFinite(v) && v >= lo && v <= hi;

/** How a list of layers will be played, which is what its numbers have to survive. */
interface Played {
  /** Pitch multipliers the layers may be transposed by: lowest and highest. */
  lowest: number;
  highest: number;
  /** Random drift either way on top of that, as a fraction. */
  drift: number;
  /** The longest one layer may take to die away, seconds. */
  ring: number;
}

function checkLayers(where: string, layers: readonly Layer[], played: Played, problems: string[]): void {
  if (layers.length < 1 || layers.length > MAX_LAYERS) problems.push(`${where}: needs 1..${MAX_LAYERS} layers, has ${layers.length}`);
  layers.forEach((l, i) => {
    const at = `${where}: layer ${i}`;
    if (!within(l.delay, 0, MAX_SECONDS)) problems.push(`${at} has a delay outside 0..${MAX_SECONDS} s`);
    if (!within(l.attack, MIN_ATTACK, MAX_ATTACK)) problems.push(`${at} has an attack outside ${MIN_ATTACK}..${MAX_ATTACK} s`);
    if (!within(l.decay, MIN_DECAY, played.ring)) problems.push(`${at} has a decay outside ${MIN_DECAY}..${played.ring} s`);
    if (!within(l.gain, 0, 1) || l.gain === 0) problems.push(`${at} has a gain outside 0..1`);
    // how far vibrato carries the pitch past its written path
    let bend = 1;
    if (l.kind === 'tone') {
      if (!WAVES.includes(l.wave)) problems.push(`${at} has an unknown wave`);
      if (l.vibrato) {
        if (within(l.vibrato.rate, 0.1, MAX_VIBRATO_RATE) && within(l.vibrato.depth, 1, MAX_VIBRATO_CENTS)) bend = 2 ** (l.vibrato.depth / 1200);
        else problems.push(`${at} has a vibrato outside ${MAX_VIBRATO_RATE} Hz or ${MAX_VIBRATO_CENTS} cents`);
      }
    } else {
      if (!FILTERS.includes(l.filter)) problems.push(`${at} is neither a tone nor a band-pass or low-pass noise burst`);
      if (!within(l.q, MIN_Q, MAX_Q)) problems.push(`${at} has a q outside ${MIN_Q}..${MAX_Q}`);
    }
    const low = (Math.min(l.from, l.to) * played.lowest * retune(l, -played.drift)) / bend;
    const high = Math.max(l.from, l.to) * played.highest * retune(l, played.drift) * bend;
    if (!within(low, MIN_HZ, MAX_HZ) || !within(high, MIN_HZ, MAX_HZ)) problems.push(`${at} leaves ${MIN_HZ}..${MAX_HZ} Hz`);
  });
}

/** Sanity checks used by tests: every number finite and in range, nothing too long, nothing out of hearing. */
export function validateRecipe(id: string, recipe: Recipe): string[] {
  const problems: string[] = [];
  const jitter = recipe.jitter ?? PITCH_JITTER;
  if (!within(jitter, 0, MAX_JITTER)) problems.push(`${id}: pitch jitter outside 0..${MAX_JITTER}`);
  if (recipe.space !== undefined && !within(recipe.space, 0, 1)) problems.push(`${id}: space outside 0..1`);
  const drift = within(jitter, 0, MAX_JITTER) ? jitter : 0;
  checkLayers(id, recipe.layers, { lowest: 1, highest: 1, drift, ring: MAX_SECONDS }, problems);
  const seconds = recipeDuration(recipe);
  if (!within(seconds, MIN_DECAY, MAX_SECONDS)) problems.push(`${id}: runs ${seconds} s, outside the ${MAX_SECONDS} s limit`);
  return problems;
}

const risingPair = (pair: readonly [number, number], floor: number): boolean =>
  Number.isFinite(pair[0]) && Number.isFinite(pair[1]) && pair[0] >= floor && pair[1] >= pair[0];

export function validateBed(id: string, bed: BedDef): string[] {
  const problems: string[] = [];
  if (bed.drone.length === 0) problems.push(`${id}: has no drone`);
  bed.drone.forEach((v, i) => {
    if (!WAVES.includes(v.wave)) problems.push(`${id}: drone ${i} has an unknown wave`);
    if (!within(v.hz, MIN_HZ, MAX_HZ)) problems.push(`${id}: drone ${i} leaves ${MIN_HZ}..${MAX_HZ} Hz`);
    if (!within(v.gain, 0, 1) || v.gain === 0) problems.push(`${id}: drone ${i} has a gain outside 0..1`);
  });

  const { notes, pulse } = bed;
  // with fewer than three notes the melody could not always step somewhere new
  if (notes.scale.length >= 3 && notes.scale.every((m) => Number.isFinite(m) && m > 0)) {
    checkLayers(`${id} notes`, notes.layers, { lowest: Math.min(...notes.scale), highest: Math.max(...notes.scale), drift: 0, ring: MAX_RING }, problems);
  } else problems.push(`${id}: the scale must be three or more positive pitch multipliers`);
  if (!risingPair(notes.phrase, 1) || !notes.phrase.every(Number.isInteger)) problems.push(`${id}: a phrase must be 1 or more whole notes, fewest then most`);
  if (!risingPair(notes.step, MIN_WAIT)) problems.push(`${id}: steps must be at least ${MIN_WAIT} s, shortest then longest`);
  // a busy rest may be shorter than a calm one, but each pair still rises
  if (!risingPair(notes.rest, MIN_WAIT) || !risingPair(notes.restBusy, MIN_WAIT)) problems.push(`${id}: rests must be at least ${MIN_WAIT} s, shortest then longest`);
  if (!within(notes.soften, 0, 0.9)) problems.push(`${id}: soften outside 0..0.9`);
  if (!within(notes.space, 0, 1)) problems.push(`${id}: space outside 0..1`);

  checkLayers(`${id} pulse`, pulse.layers, { lowest: 1, highest: 1, drift: 0, ring: MAX_SECONDS }, problems);
  if (!pulse.period.every((p) => within(p, MIN_WAIT, 60))) problems.push(`${id}: pulse periods must be at least ${MIN_WAIT} s`);
  if (!pulse.level.every((l) => within(l, 0, 1))) problems.push(`${id}: pulse levels outside 0..1`);
  return problems;
}
