// The keys of the Ringlands. Everything pitched that sounds in a zone is a note of that zone's
// key, so a busy fight is one instrument being played and not a pile of effects. Pure: no Web
// Audio and no DOM.
//
// A Rally climbs the key one note per point: twenty notes of a five-note scale, which is a little
// under four octaves from the first to the last.
import type { ZoneId } from '../sim/defs';
import { RALLY } from '../sim/tuning';

export interface ZoneKey {
  /** What a musician would call it. Shown on the soundboard. */
  name: string;
  /** The note a Rally starts on, in hertz. */
  tonic: number;
  /** The mode: every note of the scale as semitones above the tonic, rising, within one octave. */
  mode: readonly number[];
}

/** Equal-tempered pitch, in semitones from the A above middle C. */
const pitch = (semitones: number): number => 440 * 2 ** (semitones / 12);

export const KEYS: Record<ZoneId, ZoneKey> = {
  // The Outer Ring is Reedwater: open water and green light. G major pentatonic, from the G below middle C.
  outer: { name: 'G major pentatonic', tonic: pitch(-14), mode: [0, 2, 4, 7, 9] },
  // The Inner Ring is the Cinder Terraces: a tone lower, and minor. F minor pentatonic.
  inner: { name: 'F minor pentatonic', tonic: pitch(-16), mode: [0, 3, 5, 7, 10] },
  // The Crater is the Bell's own: lower again, and bare. D, with only its fourths and fifths and the note between.
  crater: { name: 'D suspended', tonic: pitch(-19), mode: [0, 2, 5, 7, 10] },
};

/** A Rally has this many notes: one for every point it can hold. */
export const RALLY_STEPS = RALLY.cap;

/**
 * Note `step` of a zone's scale, in hertz. Step 1 is the tonic and every step after it is the
 * next note up, so step 6 of a five-note scale is the tonic an octave higher. Steps below 1 run
 * down the same way.
 */
export function noteOf(zone: ZoneId, step: number): number {
  const key = KEYS[zone];
  const n = key.mode.length;
  const index = Math.round(step) - 1;
  const octave = Math.floor(index / n);
  return key.tonic * 2 ** (octave + key.mode[index - octave * n] / 12);
}

/**
 * The chord a perfect return rings on `step`: that note and two more of the scale stacked over
 * it, each one note of the scale apart. A note that would sit above the top of the Rally is
 * brought down an octave, so a chord at full Rally is voiced under its own top note.
 */
export function chordOf(zone: ZoneId, step: number): number[] {
  const top = noteOf(zone, RALLY_STEPS) * 1.001;
  const chord: number[] = [];
  for (let i = 0; i < 3; i++) {
    let hz = noteOf(zone, step + i * 2);
    while (hz > top) hz /= 2;
    chord.push(hz);
  }
  return chord;
}

/**
 * The note of the key nearest to `interval` semitones above the tonic, `octave` octaves above
 * where the Rally starts. This is how a sound asks for "the fifth" (7) or "the third" (4) and
 * gets whatever the zone's mode has there: a major third in one zone, a minor third in the other.
 */
export function toneOf(zone: ZoneId, interval: number, octave = 0): number {
  const key = KEYS[zone];
  let best = 12;
  // on a tie the lower note wins, so "the third" of a minor key is its minor third
  for (let i = key.mode.length - 1; i >= 0; i--) {
    if (Math.abs(key.mode[i] - interval) <= Math.abs(best - interval)) best = key.mode[i];
  }
  return key.tonic * 2 ** (octave + best / 12);
}

/** True if a frequency is a note of the zone's key, in any octave. */
export function inKey(zone: ZoneId, hz: number): boolean {
  const key = KEYS[zone];
  if (!(hz > 0) || !Number.isFinite(hz)) return false;
  const semitones = 12 * Math.log2(hz / key.tonic);
  const nearest = Math.round(semitones);
  if (Math.abs(semitones - nearest) > 0.01) return false;
  return key.mode.includes(((nearest % 12) + 12) % 12);
}
