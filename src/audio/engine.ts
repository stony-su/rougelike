// The only file that touches Web Audio. It turns cues into audio nodes: every layer of a recipe
// becomes an oscillator or a burst of filtered noise with its own envelope, every cue gets a
// VOICE (a level and a place between the ears), and every voice runs through one bus, a
// compressor and a soft clip to the speakers.
//
//   voice -> bus -> compressor -> soft clip -> master (volume, mute) -> meter -> speakers
//      \-> the chamber's ring (a shared reverb) -> bus
//
// Nothing is created until `unlock` is called, because browsers only let sound start from a key
// or a click. A machine with no sound at all still plays the game: every method is safe to call
// whatever state the engine is in.
//
// The two rules that keep a busy fight from turning to mush are plain logic, kept apart from the
// audio so they can be tested without a browser: StartLimiter (the same sound may not start more
// than a few times at once) and pickVictim (which voice to give up when the pool is full).
import { clamp, clamp01 } from '../core/math';
import { Rng } from '../core/rng';
import type { Cue } from './cues';
import { MAX_HZ, MIN_HZ, PITCH_HIGH, PITCH_JITTER, PITCH_LOW, RECIPES, SILENCE, homeNote, layerLife, noiseMakeup, recipeDuration, ringing, tuning } from './recipes';
import type { Layer, Recipe, ToneLayer } from './recipes';
import type { Loop } from './beds';
import { trimOf } from './levels';

// ---------------------------------------------------------------- limits

/** At most this many sounds ring at once. */
export const MAX_VOICES = 24;
/** One sound may start at most SAME_MOST times within SAME_WINDOW seconds: thirty hits on one tick are three. */
export const SAME_WINDOW = 0.03;
export const SAME_MOST = 3;
/** Each start that lands on top of another is quieter than the one before, so a pile of them does not add up to a bang. */
const SAME_SHARE: readonly number[] = [1, 0.7, 0.5];
/** A voice whose level has fallen below this is quiet: nobody hears it go. */
export const QUIET = 0.05;

/** What one full-level layer measures on the bus. The rest is room for sounds to pile up in. */
const HEADROOM = 0.5;
/** A cue that would play quieter than this is not played. */
const FAINT = 0.002;
/** Seconds between asking for a sound and its first sample: enough that its attack is never cut. */
const LEAD = 0.004;
/** The longest a cue may ask to wait. */
const MAX_DELAY = 2;
/** Seconds a voice takes to fade when it is given up for another. */
const FADE = 0.02;
const NOISE_SECONDS = 2;
/** The meter looks at this many samples: about a sixth of a second, so a reading every frame misses nothing. */
const METER_SAMPLES = 8192;

/** The chamber's ring: seconds to fall 60 dB, the silence before it starts, and how much of it comes back. */
const RING_TIME = 1.1;
const RING_PREDELAY = 0.012;
const RING_LEVEL = 1;

/** The soft clip leaves anything quieter than the knee alone and bends the rest so it can never pass the ceiling. */
const CLIP_KNEE = 0.75;
const CLIP_CEILING = 0.98;
/** The loudest signal the clip's curve is drawn for; anything beyond sits at the ceiling. */
const CLIP_RANGE = 2;
const CLIP_POINTS = 4097;

// ---------------------------------------------------------------- pure rules

/**
 * Keeps one sound from starting on top of itself. Ask before every start; the answer is the
 * share of its level the start may have. Times are seconds on any steady clock.
 */
export class StartLimiter {
  private readonly starts = new Map<string, number[]>();

  /**
   * 1 for a start with nothing of its kind near it, less for the second and third within
   * SAME_WINDOW, and 0 for one that may not start at all: a fourth, or one closer than `gap`
   * (the sound's own least spacing) to another.
   */
  admit(sound: string, at: number, gap = 0): number {
    let list = this.starts.get(sound);
    if (!list) {
      list = [];
      this.starts.set(sound, list);
    }
    // forget what is too old to matter; delayed starts may arrive out of order, so keep a second in hand
    const horizon = at - Math.max(gap, SAME_WINDOW) - 1;
    let kept = 0;
    for (const t of list) if (t >= horizon) list[kept++] = t;
    list.length = kept;

    let near = 0;
    for (const t of list) {
      const apart = Math.abs(t - at);
      if (apart < gap) return 0;
      if (apart < SAME_WINDOW) near++;
    }
    if (near >= SAME_MOST) return 0;
    list.push(at);
    return SAME_SHARE[near] ?? 0;
  }

  clear(): void {
    this.starts.clear();
  }
}

/** What the pool knows of a voice when it has to give one up. */
export interface Ringing {
  /** When it started, in seconds. */
  start: number;
  /** The loudest it is now or is still to be, where 1 is full level. */
  loud: number;
}

/**
 * Which voice to give up when the pool is full: the oldest of the quiet ones, and with none
 * quiet, the quietest of them all. Returns its index, or -1 for an empty pool.
 */
export function pickVictim(voices: readonly Ringing[]): number {
  let pick = -1;
  for (let i = 0; i < voices.length; i++) {
    if (voices[i].loud <= QUIET && (pick < 0 || voices[i].start < voices[pick].start)) pick = i;
  }
  if (pick >= 0) return pick;
  for (let i = 0; i < voices.length; i++) {
    const v = voices[i];
    if (pick < 0 || v.loud < voices[pick].loud || (v.loud === voices[pick].loud && v.start < voices[pick].start)) pick = i;
  }
  return pick;
}

/** The soft clip's curve: a straight line up to the knee, then a bend that flattens under the ceiling. */
export function softClip(x: number): number {
  const a = Math.abs(x);
  if (a <= CLIP_KNEE) return x;
  const room = CLIP_CEILING - CLIP_KNEE;
  return Math.sign(x) * (CLIP_KNEE + room * Math.tanh((a - CLIP_KNEE) / room));
}

// ---------------------------------------------------------------- the engine

interface Voice extends Ringing {
  recipe: Recipe;
  /** The level it was started at. */
  gain: number;
  /** When its last layer has fallen silent. */
  end: number;
  out: GainNode;
  /** What joins it to the bus, to be taken apart when it is over. */
  joints: AudioNode[];
  sources: AudioScheduledSourceNode[];
}

export interface EngineStats {
  /** 'off' until unlocked; then what the browser says: 'running', 'suspended', 'closed'. */
  state: string;
  sampleRate: number;
  /** Voices ringing now, and counts since the engine was made. */
  voices: number;
  started: number;
  /** Cues refused: too many of the same at once, too faint, or no voice quiet enough to give up. */
  dropped: number;
  /** Voices given up for a louder newcomer. */
  stolen: number;
  /** How hard the compressor is pulling down right now, in decibels (0 or below). */
  reduction: number;
}

function openContext(): AudioContext | null {
  const scope = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  return Ctor ? new Ctor({ latencyHint: 'interactive' }) : null;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private ring: GainNode | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private meter: AnalyserNode | null = null;
  private noise: AudioBuffer | null = null;
  /** The loops that play under everything (the beds), by name: each one's own level. */
  private readonly loops = new Map<string, GainNode>();
  private readonly scope = new Float32Array(METER_SAMPLES);
  private readonly voices: Voice[] = [];
  /** Voices given up, still fading. */
  private readonly fading: Voice[] = [];
  private readonly limiter = new StartLimiter();
  /** Drives the small retuning of each play and fills the noise. Seeded, so it needs no help from the page. */
  private readonly rng = new Rng('resound audio');
  private isMuted = false;
  private volume = 1;
  private failed = false;
  private closed = false;
  /** Seconds the context has sat stopped since it last ran. */
  private stalled = 0;
  private started = 0;
  private dropped = 0;
  private stolen = 0;

  /** `open` makes the audio context; tests hand in a stand-in. */
  constructor(private readonly open: () => AudioContext | null = openContext) {}

  /**
   * Start sound. Browsers only allow this from a key press or a click, so the game calls it
   * from its input handlers; it is cheap and safe to call on every one of them.
   */
  unlock(): void {
    if (this.closed || this.failed) return;
    if (!this.ctx) {
      try {
        this.build();
      } catch {
        // no sound on this machine: the game goes on without it
        this.failed = true;
        this.ctx = null;
        return;
      }
    }
    this.wake();
  }

  private wake(): void {
    const ctx = this.ctx;
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => undefined);
  }

  private build(): void {
    const ctx = this.open();
    if (!ctx) {
      this.failed = true;
      return;
    }
    const bus = ctx.createGain();
    bus.gain.value = HEADROOM;
    // A limiter more than a compressor: it leaves a single sound alone and holds a pile of them down.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -8;
    comp.knee.value = 6;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    const scale = ctx.createGain();
    scale.gain.value = 1 / CLIP_RANGE;
    const clip = ctx.createWaveShaper();
    const curve = new Float32Array(CLIP_POINTS);
    for (let i = 0; i < CLIP_POINTS; i++) curve[i] = softClip(((i / (CLIP_POINTS - 1)) * 2 - 1) * CLIP_RANGE);
    clip.curve = curve;
    const master = ctx.createGain();
    master.gain.value = this.masterLevel();
    const meter = ctx.createAnalyser();
    meter.fftSize = METER_SAMPLES;
    meter.smoothingTimeConstant = 0;
    bus.connect(comp);
    comp.connect(scale);
    scale.connect(clip);
    clip.connect(master);
    master.connect(meter);
    meter.connect(ctx.destination);

    // The chamber's ring: one reverb every voice may send a share of itself into.
    const ring = ctx.createGain();
    const hall = ctx.createConvolver();
    hall.normalize = false;
    hall.buffer = this.impulse(ctx);
    const back = ctx.createGain();
    back.gain.value = RING_LEVEL;
    ring.connect(hall);
    hall.connect(back);
    back.connect(bus);

    const noise = ctx.createBuffer(1, Math.floor(NOISE_SECONDS * ctx.sampleRate), ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = this.rng.next() * 2 - 1;

    this.ctx = ctx;
    this.bus = bus;
    this.ring = ring;
    this.master = master;
    this.comp = comp;
    this.meter = meter;
    this.noise = noise;
  }

  /**
   * What the chamber answers with: noise that dies away over a second and grows duller as it
   * goes, different in each ear. Scaled so a long note comes back about as loud as it went in.
   */
  private impulse(ctx: AudioContext): AudioBuffer {
    const rate = ctx.sampleRate;
    const first = Math.floor(RING_PREDELAY * rate);
    const length = first + Math.floor(RING_TIME * 1.15 * rate);
    const buffer = ctx.createBuffer(2, length, rate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      let low = 0;
      let power = 0;
      for (let i = first; i < length; i++) {
        const t = (i - first) / rate;
        // each reflection is duller than the one before it
        const open = 0.1 + 0.75 * Math.exp(-t * 3);
        low += open * (this.rng.next() * 2 - 1 - low);
        const v = low * SILENCE ** (t / RING_TIME);
        data[i] = v;
        power += v * v;
      }
      const k = 1 / Math.sqrt(power || 1);
      for (let i = first; i < length; i++) data[i] *= k;
    }
    return buffer;
  }

  /** Play one cue. Does nothing before `unlock`, while muted, or while the browser has sound stopped. */
  play(cue: Cue): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus || this.isMuted || ctx.state !== 'running') return;
    const recipe = RECIPES[cue.sound] as Recipe | undefined;
    if (!recipe || !Number.isFinite(cue.gain) || !Number.isFinite(cue.delay)) return;
    const now = ctx.currentTime;
    const at = now + LEAD + clamp(cue.delay, 0, MAX_DELAY);
    const share = this.limiter.admit(cue.sound, at, recipe.gap ?? 0);
    const gain = clamp01(cue.gain) * (recipe.level ?? 1) * trimOf(cue.sound) * share;
    if (!(gain >= FAINT)) {
      this.dropped++;
      return;
    }
    this.reap(now);
    if (this.voices.length >= MAX_VOICES && !this.steal(now, gain)) {
      this.dropped++;
      return;
    }
    this.voices.push(this.voice(ctx, this.bus, cue, recipe, gain, at));
    this.started++;
  }

  private voice(ctx: AudioContext, bus: GainNode, cue: Cue, recipe: Recipe, gain: number, at: number): Voice {
    const out = ctx.createGain();
    out.gain.value = gain;
    const joints: AudioNode[] = [out];
    let last: AudioNode = out;
    // a browser too old to pan keeps everything in the middle
    if (typeof ctx.createStereoPanner === 'function') {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Number.isFinite(cue.pan) ? clamp(cue.pan, -1, 1) : 0;
      out.connect(pan);
      joints.push(pan);
      last = pan;
    }
    last.connect(bus);
    if (recipe.space && this.ring) {
      const send = ctx.createGain();
      send.gain.value = recipe.space;
      last.connect(send);
      send.connect(this.ring);
      joints.push(send);
    }

    // This play's own small retuning, the note its tuned layers ring at, and the shift of the rest.
    const drift = (this.rng.next() * 2 - 1) * (recipe.jitter ?? PITCH_JITTER);
    const note = cue.note > 0 ? cue.note : homeNote(recipe, 'outer');
    const pitch = cue.pitch > 0 ? clamp(cue.pitch, PITCH_LOW, PITCH_HIGH) : 1;
    const top = Math.min(MAX_HZ, ctx.sampleRate * 0.45);
    const sources: AudioScheduledSourceNode[] = [];
    for (const layer of recipe.layers) {
      const k = tuning(layer, note, pitch, drift);
      let from = layer.from * k;
      let to = layer.to * k;
      // a partial of a high note that would ring above hearing is left out; anything else is held inside it
      if (layer.tuned && (Math.max(from, to) > top || Math.min(from, to) < MIN_HZ)) continue;
      from = clamp(from, MIN_HZ, top);
      to = clamp(to, MIN_HZ, top);
      const start = at + layer.delay;
      const stop = start + layerLife(layer);
      const env = ctx.createGain();
      env.gain.value = 0;
      const peak = layer.gain * (layer.kind === 'tone' ? 1 : noiseMakeup(layer, from, to, ctx.sampleRate));
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(peak, start + layer.attack);
      if (layer.hold > 0) env.gain.setValueAtTime(peak, start + layer.attack + layer.hold);
      env.gain.exponentialRampToValueAtTime(peak * SILENCE, stop);
      env.connect(out);
      if (layer.kind === 'tone') this.tone(ctx, layer, from, to, start, stop, top, env, sources);
      else this.burst(ctx, layer, from, to, start, stop, env, sources);
    }
    return { recipe, gain, start: at, loud: gain, end: at + recipeDuration(recipe) + 0.05, out, joints, sources };
  }

  /** One oscillator, its pitch sliding, with its wobble and its damping if the layer asks for them. */
  private tone(ctx: AudioContext, layer: ToneLayer, from: number, to: number, start: number, stop: number, top: number, env: GainNode, sources: AudioScheduledSourceNode[]): void {
    const osc = ctx.createOscillator();
    osc.type = layer.wave;
    osc.frequency.setValueAtTime(from, start);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + (layer.slide ?? stop - start));
    if (layer.vibrato) {
      const wobble = ctx.createOscillator();
      wobble.frequency.value = layer.vibrato.rate;
      const depth = ctx.createGain();
      depth.gain.value = layer.vibrato.depth;
      wobble.connect(depth);
      depth.connect(osc.detune);
      wobble.start(start);
      wobble.stop(stop + 0.01);
      sources.push(wobble);
    }
    if (layer.damp) {
      const damper = ctx.createBiquadFilter();
      damper.type = 'lowpass';
      damper.Q.value = 0;
      damper.frequency.setValueAtTime(Math.min(from * layer.damp[0], top), start);
      damper.frequency.exponentialRampToValueAtTime(Math.min(to * layer.damp[1], top), stop);
      osc.connect(damper);
      damper.connect(env);
    } else {
      osc.connect(env);
    }
    osc.start(start);
    osc.stop(stop + 0.01);
    sources.push(osc);
  }

  /** White noise through a filter whose frequency slides. Each burst starts somewhere else in the noise, so no two are alike. */
  private burst(ctx: AudioContext, layer: Layer & { kind: 'noise' }, from: number, to: number, start: number, stop: number, env: GainNode, sources: AudioScheduledSourceNode[]): void {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = layer.filter;
    filter.Q.value = layer.q;
    filter.frequency.setValueAtTime(from, start);
    if (to !== from) filter.frequency.exponentialRampToValueAtTime(to, start + (layer.slide ?? stop - start));
    src.connect(filter);
    filter.connect(env);
    src.start(start, this.rng.next() * NOISE_SECONDS);
    src.stop(stop + 0.01);
    sources.push(src);
  }

  /**
   * Bring a loop to `level` over about `seconds`, making it with `make` the first time. It joins
   * the bus as a voice does, so the volume, mute and the limiter hold for it too. False if sound
   * has not started yet: nothing was done, ask again later. (music.ts decides what is asked for.)
   */
  setLoop(id: string, make: () => Loop, level: number, seconds: number): boolean {
    const ctx = this.ctx;
    if (!ctx || !this.bus || ctx.state !== 'running') return false;
    let gain = this.loops.get(id);
    if (!gain) {
      const loop = make();
      const buffer = ctx.createBuffer(2, loop.left.length, loop.rate);
      buffer.getChannelData(0).set(loop.left);
      buffer.getChannelData(1).set(loop.right);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(this.bus);
      src.start();
      this.loops.set(id, gain);
    }
    gain.gain.setTargetAtTime(clamp01(level), ctx.currentTime, Math.max(0.01, seconds) / 4);
    return true;
  }

  /** Take apart the voices that have finished. */
  private reap(now: number): void {
    for (const list of [this.voices, this.fading]) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].end > now) continue;
        for (const joint of list[i].joints) joint.disconnect();
        list.splice(i, 1);
      }
    }
  }

  /**
   * Make room for a newcomer of level `gain` by fading out the voice that will be missed
   * least. False if every voice still rings louder than the newcomer: a whisper does not cut
   * off a shout.
   */
  private steal(now: number, gain: number): boolean {
    for (const v of this.voices) v.loud = v.gain * ringing(v.recipe, now - v.start);
    const i = pickVictim(this.voices);
    if (i < 0) return true;
    const v = this.voices[i];
    if (v.loud > QUIET && v.loud > gain) return false;
    this.voices.splice(i, 1);
    v.out.gain.cancelScheduledValues(now);
    v.out.gain.setTargetAtTime(0, now, FADE / 4);
    for (const s of v.sources) {
      try {
        s.stop(now + FADE);
      } catch {
        // already stopped: nothing to do
      }
    }
    v.end = now + FADE + 0.02;
    this.fading.push(v);
    this.stolen++;
    return true;
  }

  private masterLevel(): number {
    // squared, so the middle of a volume slider sounds like half
    return this.isMuted ? 0 : this.volume * this.volume;
  }

  private applyMaster(): void {
    const ctx = this.ctx;
    if (ctx && this.master) this.master.gain.setTargetAtTime(this.masterLevel(), ctx.currentTime, 0.015);
  }

  get muted(): boolean {
    return this.isMuted;
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.applyMaster();
  }

  /** Flip mute. Returns true if sound is now muted. */
  toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /** 0 is silent, 1 is full. */
  setVolume(v: number): void {
    this.volume = Number.isFinite(v) ? clamp01(v) : 1;
    this.applyMaster();
  }

  /** Once a frame: clears away finished voices, and starts sound again if the browser stopped it. */
  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.reap(ctx.currentTime);
    if (ctx.state === 'running') {
      this.stalled = 0;
      return;
    }
    // a headset unplugged or a lid closed can stop sound; ask for it back once a second
    this.stalled += dt;
    if (this.stalled >= 1) {
      this.stalled = 0;
      this.wake();
    }
  }

  /**
   * What is going out to the speakers right now, measured after everything: the largest sample
   * and the root mean square of the last sixth of a second, where 1 is full scale.
   */
  level(): { peak: number; rms: number } {
    const meter = this.meter;
    if (!meter) return { peak: 0, rms: 0 };
    const scope = this.scope;
    meter.getFloatTimeDomainData(scope);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < scope.length; i++) {
      const v = scope[i];
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      sum += v * v;
    }
    return { peak, rms: Math.sqrt(sum / scope.length) };
  }

  stats(): EngineStats {
    const ctx = this.ctx;
    return {
      state: ctx ? ctx.state : 'off',
      sampleRate: ctx ? ctx.sampleRate : 0,
      voices: this.voices.length,
      started: this.started,
      dropped: this.dropped,
      stolen: this.stolen,
      reduction: this.comp ? this.comp.reduction : 0,
    };
  }

  destroy(): void {
    this.closed = true;
    const ctx = this.ctx;
    this.ctx = null;
    this.bus = null;
    this.ring = null;
    this.master = null;
    this.comp = null;
    this.meter = null;
    this.noise = null;
    this.voices.length = 0;
    this.fading.length = 0;
    this.limiter.clear();
    this.loops.clear();
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined);
  }
}
