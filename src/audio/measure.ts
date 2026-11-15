// A sound, rendered without a browser. engine.ts turns a recipe into audio nodes; this turns the
// same recipe into plain samples by plain arithmetic, layer for layer (an oscillator or filtered
// noise, the sliding pitch, the wobble, the damping, the envelope), so that how loud every sound
// is can be measured in a test and shown on the soundboard. It stops where a voice joins the bus:
// what is measured is one sound alone at full level, before the limiter and the chamber's ring.
// Pure: no Web Audio and no DOM.
import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import type { ZoneId } from '../sim/defs';
import { trimOf } from './levels';
import { MAX_HZ, MIN_HZ, RECIPES, SILENCE, homeNote, layerLife, noiseMakeup, recipeDuration, tuning } from './recipes';
import type { NoiseFilter, Recipe, SoundId, Wave } from './recipes';

/** Samples a second that sounds are measured at. */
export const MEASURE_RATE = 44100;
/** The ear adds up about this long: a sound's loudness is its loudest stretch of this many seconds. */
export const LOUD_SPAN = 0.25;
/** A filter whose frequency slides is retuned every this many samples. */
const RETUNE = 16;

/** How loud something is, where 1 is full scale. */
export interface Level {
  /** The largest sample. */
  peak: number;
  /** The average level (RMS) of its loudest LOUD_SPAN seconds. A click shorter than that counts as spread over it. */
  loud: number;
}

/** How one play of a sound is asked for, as the engine is asked: every part is optional. */
export interface Take {
  /** The note its tuned layers ring at, in hertz. Omitted, the sound's home note in `zone`. */
  note?: number;
  zone?: ZoneId;
  /** Shift of its untuned layers; 1 plays them as written. */
  pitch?: number;
  rate?: number;
}

/** A second-order filter with the Web Audio coefficients: the ones `passed` in recipes.ts counts with. */
class Filter {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(
    private readonly kind: NoiseFilter,
    private readonly q: number,
    private readonly rate: number,
  ) {}

  tune(hz: number): void {
    const w = (2 * Math.PI * Math.min(hz, this.rate * 0.49)) / this.rate;
    const cos = Math.cos(w);
    const band = this.kind === 'bandpass';
    // a low-pass takes its sharpness in decibels
    const alpha = Math.sin(w) / (2 * (band ? this.q : 10 ** (this.q / 20)));
    this.a1 = (-2 * cos) / (1 + alpha);
    this.a2 = (1 - alpha) / (1 + alpha);
    this.b0 = (band ? alpha : (1 - cos) / 2) / (1 + alpha);
    this.b1 = band ? 0 : 2 * this.b0;
    this.b2 = band ? -this.b0 : this.b0;
  }

  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** One sample of a wave, `phase` being how far through its turn it is (0..1). */
function shape(wave: Wave, phase: number): number {
  if (wave === 'sine') return Math.sin(2 * Math.PI * phase);
  if (wave === 'sawtooth') return 2 * ((phase + 0.5) % 1) - 1;
  return phase < 0.25 ? 4 * phase : phase < 0.75 ? 2 - 4 * phase : 4 * phase - 4;
}

/** The samples of one play of a sound, at full level and without its own `level`: what its layers add up to. */
export function renderSound(recipe: Recipe, take: Take = {}): Float32Array {
  const rate = take.rate ?? MEASURE_RATE;
  const note = take.note !== undefined && take.note > 0 ? take.note : homeNote(recipe, take.zone ?? 'outer');
  const pitch = take.pitch !== undefined && take.pitch > 0 ? take.pitch : 1;
  const top = Math.min(MAX_HZ, rate * 0.45);
  const out = new Float32Array(Math.ceil(recipeDuration(recipe) * rate) + 1);
  // the same noise every time, so a sound measures the same every time
  const rng = new Rng('resound measure');
  for (const layer of recipe.layers) {
    const k = tuning(layer, note, pitch, 0);
    let from = layer.from * k;
    let to = layer.to * k;
    // as in the engine: a partial that would ring out of hearing is left out, anything else is held inside it
    if (layer.tuned && (Math.max(from, to) > top || Math.min(from, to) < MIN_HZ)) continue;
    from = clamp(from, MIN_HZ, top);
    to = clamp(to, MIN_HZ, top);
    const life = layerLife(layer);
    const first = Math.round(layer.delay * rate);
    const count = Math.min(Math.floor(life * rate), out.length - first);
    const slideEnd = Math.max(1, Math.round((layer.slide ?? life) * rate));
    const slideStep = (to / from) ** (1 / slideEnd);
    const attack = Math.round(layer.attack * rate);
    const fall = attack + Math.round(layer.hold * rate);
    const fallStep = SILENCE ** (1 / Math.max(1, layer.decay * rate));
    const peak = layer.gain * (layer.kind === 'tone' ? 1 : noiseMakeup(layer, from, to, rate));
    const damp = layer.kind === 'tone' ? layer.damp : undefined;
    const filter = layer.kind === 'noise' ? new Filter(layer.filter, layer.q, rate) : damp ? new Filter('lowpass', 0, rate) : null;
    let cutoff = damp ? Math.min(from * damp[0], top) : 0;
    const cutoffStep = damp ? (Math.min(to * damp[1], top) / cutoff) ** (1 / Math.max(1, count)) : 1;
    let hz = from;
    let env = 1;
    let phase = 0;
    for (let i = 0; i < count; i++) {
      if (i > 0 && i <= slideEnd) hz *= slideStep;
      if (i > fall) env *= fallStep;
      const level = i < attack ? i / attack : env;
      let s = 0;
      if (layer.kind === 'tone') {
        const f = layer.vibrato ? hz * 2 ** ((layer.vibrato.depth * Math.sin((2 * Math.PI * layer.vibrato.rate * i) / rate)) / 1200) : hz;
        phase += f / rate;
        phase -= Math.floor(phase);
        s = shape(layer.wave, phase);
        if (filter) {
          if (i % RETUNE === 0) filter.tune(cutoff);
          cutoff *= cutoffStep;
          s = filter.run(s);
        }
      } else if (filter) {
        if (i % RETUNE === 0) filter.tune(hz);
        s = filter.run(rng.next() * 2 - 1);
      }
      out[first + i] += s * level * peak;
    }
  }
  return out;
}

/** The largest sample, and the average level of the loudest LOUD_SPAN seconds. */
export function levelOf(samples: Float32Array, rate: number): Level {
  const span = Math.max(1, Math.round(LOUD_SPAN * rate));
  let peak = 0;
  let sum = 0;
  let most = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const a = Math.abs(s);
    if (a > peak) peak = a;
    sum += s * s;
    if (i >= span) sum -= samples[i - span] * samples[i - span];
    if (sum > most) most = sum;
  }
  return { peak, loud: Math.sqrt(most / span) };
}

/** How loud a sound is when it plays alone at full level, its own `level` and its trim in the mix counted. */
export function measureSound(id: SoundId, take: Take = {}): Level {
  const recipe = RECIPES[id];
  const level = levelOf(renderSound(recipe, take), take.rate ?? MEASURE_RATE);
  const k = (recipe.level ?? 1) * trimOf(id);
  return { peak: level.peak * k, loud: level.loud * k };
}

/** A level in decibels below full scale, for showing to people. */
export const decibels = (level: number): number => (level > 0 ? 20 * Math.log10(level) : -Infinity);
