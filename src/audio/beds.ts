// The beds: a quiet loop for each zone, in that zone's key, and a pulse that joins it while a
// boss is on the floor. Made in code like every other sound; there are no audio files.
//
// A bed is a handful of long notes of the key, each one a pair of sine waves a hair apart, one
// toward each ear, swelling and sinking at its own pace. Every wave and every swell turns a whole
// number of times in the loop, so the last sample meets the first and the loop has no seam. The
// pulse is a soft drum on every beat, a whole number of beats long.
//
// Pure: no Web Audio and no DOM, so a test can render a bed and look at it. engine.ts plays the
// samples; music.ts decides which loop is heard when.
import type { ZoneId } from '../sim/defs';
import { levelOf } from './measure';
import { KEYS, toneOf } from './scale';

/** A stretch of sound that repeats without a seam. */
export interface Loop {
  left: Float32Array;
  right: Float32Array;
  /** Samples a second. */
  rate: number;
}

/** Beds are low and soft: nothing in them is above a few hundred hertz, so they need few samples. */
export const BED_RATE = 16000;
/** Seconds a zone's bed lasts before it comes round again. */
export const BED_SECONDS = 16;
/** The boss pulse: this many beats, each this many seconds (a hundred to the minute). */
export const PULSE_BEATS = 8;
export const PULSE_BEAT = 0.6;
/**
 * How loud a finished bed and a finished pulse are, measured as sounds are (measure.ts): well
 * under the quietest of them, so the bed is felt under a fight and never competes with it.
 */
export const BED_LOUD = 0.02;
export const PULSE_LOUD = 0.026;

/** One long note of a bed. */
interface Voice {
  /** The note of the key nearest this many semitones above the tonic, this many octaves from where a Rally starts. */
  interval: number;
  octave: number;
  gain: number;
  /** How many times it swells and sinks in the loop, how far it sinks (0 never, 1 to nothing), and where in a swell it begins (0..1). */
  swells: number;
  depth: number;
  turn: number;
}

const BEDS: Record<ZoneId, readonly Voice[]> = {
  // The Outer Ring: open water and green light. The tonic and its fifth under a third and a sixth that come and go.
  outer: [
    { interval: 0, octave: -1, gain: 1, swells: 1, depth: 0.3, turn: 0 },
    { interval: 7, octave: -1, gain: 0.62, swells: 2, depth: 0.6, turn: 0.3 },
    { interval: 0, octave: 0, gain: 0.4, swells: 3, depth: 0.7, turn: 0.55 },
    { interval: 4, octave: 0, gain: 0.3, swells: 2, depth: 0.9, turn: 0.8 },
    { interval: 9, octave: 0, gain: 0.2, swells: 5, depth: 0.95, turn: 0.15 },
    { interval: 7, octave: 1, gain: 0.08, swells: 3, depth: 1, turn: 0.45 },
  ],
  // The Inner Ring: lower and minor. More weight at the bottom, and a seventh under it that darkens it.
  inner: [
    { interval: 0, octave: -1, gain: 1, swells: 1, depth: 0.4, turn: 0.5 },
    { interval: 10, octave: -2, gain: 0.5, swells: 2, depth: 0.8, turn: 0.1 },
    { interval: 7, octave: -1, gain: 0.55, swells: 3, depth: 0.6, turn: 0.7 },
    { interval: 3, octave: 0, gain: 0.34, swells: 2, depth: 0.9, turn: 0.35 },
    { interval: 0, octave: 0, gain: 0.26, swells: 5, depth: 0.8, turn: 0.9 },
  ],
  // The Crater: bare. The tonic, its fourth and its fifth, and long silences between their swells.
  crater: [
    { interval: 0, octave: -1, gain: 1, swells: 1, depth: 0.55, turn: 0.25 },
    { interval: 7, octave: -1, gain: 0.6, swells: 2, depth: 0.95, turn: 0.6 },
    { interval: 5, octave: 0, gain: 0.3, swells: 3, depth: 1, turn: 0 },
    { interval: 0, octave: 1, gain: 0.12, swells: 2, depth: 1, turn: 0.4 },
  ],
};

const TURN = 2 * Math.PI;

/**
 * Add one sine wave to a loop: `turns` whole turns from the first sample to the one after the
 * last, beginning `phase` of a turn in, toward one ear (`side` -1 left, 1 right), swelling
 * `swells` whole times. Both the wave and the swell are made by the two-term recurrence of a
 * sine, so no sample costs a sine.
 */
function addWave(loop: Loop, turns: number, phase: number, gain: number, side: number, swells: number, depth: number, turn: number): void {
  const n = loop.left.length;
  const w = (TURN * turns) / n;
  const kw = 2 * Math.cos(w);
  let w1 = Math.sin(TURN * phase - w);
  let w2 = Math.sin(TURN * phase - 2 * w);
  const s = (TURN * swells) / n;
  const ks = 2 * Math.cos(s);
  let s1 = Math.cos(TURN * turn - s);
  let s2 = Math.cos(TURN * turn - 2 * s);
  const toLeft = gain * Math.sqrt((1 - side) / 2);
  const toRight = gain * Math.sqrt((1 + side) / 2);
  for (let i = 0; i < n; i++) {
    const wave = kw * w1 - w2;
    w2 = w1;
    w1 = wave;
    const swell = ks * s1 - s2;
    s2 = s1;
    s1 = swell;
    const v = wave * (1 - depth * (0.5 + 0.5 * swell));
    loop.left[i] += v * toLeft;
    loop.right[i] += v * toRight;
  }
}

/** Scale a loop so that it measures `loud` (the louder ear, measured as sounds are). */
function settle(loop: Loop, loud: number): Loop {
  const now = Math.max(levelOf(loop.left, loop.rate).loud, levelOf(loop.right, loop.rate).loud);
  const k = now > 0 ? loud / now : 0;
  for (let i = 0; i < loop.left.length; i++) {
    loop.left[i] *= k;
    loop.right[i] *= k;
  }
  return loop;
}

/** The bed of a zone: BED_SECONDS of its key, breathing. */
export function renderBed(zone: ZoneId, rate = BED_RATE): Loop {
  const n = Math.round(BED_SECONDS * rate);
  const loop: Loop = { left: new Float32Array(n), right: new Float32Array(n), rate };
  BEDS[zone].forEach((v, i) => {
    // the nearest pitch that turns a whole number of times in the loop: never more than a thirty-second of a hertz away
    const turns = Math.max(1, Math.round(toneOf(zone, v.interval, v.octave) * BED_SECONDS));
    // every wave begins somewhere else in its turn, so they never all rise through nothing at once
    const phase = (i * 0.618) % 1;
    // two waves one turn apart drift against each other once a loop, one toward each ear; the
    // second is the quieter, so the note sways without ever cancelling itself
    addWave(loop, turns, phase, v.gain, -0.6, v.swells, v.depth, v.turn);
    addWave(loop, turns + 1, phase + 0.25, v.gain * 0.5, 0.6, v.swells, v.depth, v.turn);
    // and its octave, quietly, in the middle: small speakers lose the bottom of a low note and keep this
    addWave(loop, turns * 2, phase + 0.5, v.gain * 0.3, 0, v.swells, v.depth, v.turn);
  });
  return settle(loop, BED_LOUD);
}

/**
 * The pulse that joins a zone's bed while a boss is on the floor: a soft drum on the zone's
 * tonic on every beat (with its octave and twelfth, which small speakers keep when they lose the
 * bottom), heavier on the first of four, and a lighter knock on the fifth between.
 * Each beat rises from nothing and has died away before the next, so the loop has no seam.
 */
export function renderPulse(zone: ZoneId, rate = BED_RATE): Loop {
  const beat = Math.round(PULSE_BEAT * rate);
  const n = beat * PULSE_BEATS;
  const loop: Loop = { left: new Float32Array(n), right: new Float32Array(n), rate };
  const low = KEYS[zone].tonic / 2;
  const knock = toneOf(zone, 7, 0);
  const attack = Math.round(0.006 * rate);
  for (let b = 0; b < PULSE_BEATS; b++) {
    const weight = b % 4 === 0 ? 1 : 0.6;
    let phase = 0;
    for (let i = 0; i < beat; i++) {
      const t = i / rate;
      // a drumhead starts sharp and settles, and has fallen 60 dB by the next beat
      phase += (TURN * low * (1 + 0.5 * Math.exp(-t / 0.03))) / rate;
      const rise = i < attack ? i / attack : 1;
      let v = (Math.sin(phase) + 0.6 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase)) * rise * 0.001 ** (t / PULSE_BEAT) * weight;
      // the knock between the heavy beats
      if (b % 4 === 2) v += 0.22 * Math.sin(TURN * knock * t) * rise * 0.001 ** (t / 0.12);
      loop.left[b * beat + i] = v;
      loop.right[b * beat + i] = v;
    }
  }
  return settle(loop, PULSE_LOUD);
}
