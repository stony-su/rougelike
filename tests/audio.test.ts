// How loud everything is, and the beds. Every sound is rendered to samples without a browser
// and must sit inside the agreed band, in every key; every bed must loop without a seam and stay
// under the quietest sound; and the logic that decides which loop is heard is played through.
import { describe, expect, it } from 'vitest';
import { BED_LOUD, BED_RATE, BED_SECONDS, PULSE_BEAT, PULSE_BEATS, PULSE_LOUD, renderBed, renderPulse } from '../src/audio/beds';
import type { Loop } from '../src/audio/beds';
import { SOUND_BAND, TRIM, trimOf } from '../src/audio/levels';
import { MEASURE_RATE, levelOf, measureSound, renderSound } from '../src/audio/measure';
import { BED_UNDER_PULSE, BOSS_QUIET, Music } from '../src/audio/music';
import type { LoopPlayer } from '../src/audio/music';
import { RECIPES, SOUND_IDS, recipeDuration } from '../src/audio/recipes';
import type { SoundId } from '../src/audio/recipes';

const ZONES = ['outer', 'inner', 'crater'] as const;

/** Every sound, measured in every key. */
const measured = SOUND_IDS.flatMap((id) => ZONES.map((zone) => ({ id, zone, ...measureSound(id, { zone }) })));
const quietest = Math.min(...measured.map((m) => m.loud));

describe('a sound rendered without a browser', () => {
  it('is as long as its recipe, finite, and the same every time', () => {
    for (const id of SOUND_IDS) {
      const samples = renderSound(RECIPES[id]);
      expect(samples.length, id).toBe(Math.ceil(recipeDuration(RECIPES[id]) * MEASURE_RATE) + 1);
      expect(
        samples.every((s) => Number.isFinite(s)),
        id,
      ).toBe(true);
      expect(Array.from(renderSound(RECIPES[id]).subarray(0, 400)), id).toEqual(Array.from(samples.subarray(0, 400)));
    }
  });

  it('measures a plain tone as what it is', () => {
    // one second of a sine at half scale: it peaks at 0.5 and averages 0.5 / sqrt(2)
    const tone = new Float32Array(MEASURE_RATE);
    for (let i = 0; i < tone.length; i++) tone[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / MEASURE_RATE);
    const level = levelOf(tone, MEASURE_RATE);
    expect(level.peak).toBeCloseTo(0.5, 3);
    expect(level.loud).toBeCloseTo(0.5 / Math.SQRT2, 3);
    // a click a hundredth of a second long counts as spread over the quarter second the ear adds up
    const click = new Float32Array(MEASURE_RATE);
    click.fill(0.5, 0, MEASURE_RATE / 100);
    expect(levelOf(click, MEASURE_RATE).loud).toBeCloseTo(0.5 * Math.sqrt(0.01 / 0.25), 3);
  });

  it('plays a tuned sound on the note it is given, and an untuned one at the pitch asked for', () => {
    // the first rising crossings of a Rally note are one period of that note apart
    const period = (samples: Float32Array): number => {
      const at: number[] = [];
      for (let i = 1; i < samples.length && at.length < 61; i++) if (samples[i - 1] <= 0 && samples[i] > 0) at.push(i);
      return (at[at.length - 1] - at[0]) / (at.length - 1) / MEASURE_RATE;
    };
    const sine = { kind: 'tone', wave: 'sine', delay: 0, attack: 0.01, hold: 0.2, decay: 0.2, gain: 1, from: 1, to: 1, tuned: true } as const;
    expect(1 / period(renderSound({ layers: [sine], home: { interval: 0, octave: 0 } }, { note: 330 }))).toBeCloseTo(330, 0);
    expect(1 / period(renderSound({ layers: [{ ...sine, from: 200, to: 200, tuned: false }] }, { pitch: 2 }))).toBeCloseTo(400, 0);
  });
});

describe('how loud every sound is', () => {
  it.each(SOUND_IDS.map((id) => [id]))('%s peaks and averages inside the agreed band, in every key', (id) => {
    for (const m of measured.filter((x) => x.id === id)) {
      expect(m.peak, `${id} in ${m.zone}: peak`).toBeGreaterThanOrEqual(SOUND_BAND.peak[0]);
      expect(m.peak, `${id} in ${m.zone}: peak`).toBeLessThanOrEqual(SOUND_BAND.peak[1]);
      expect(m.loud, `${id} in ${m.zone}: average`).toBeGreaterThanOrEqual(SOUND_BAND.loud[0]);
      expect(m.loud, `${id} in ${m.zone}: average`).toBeLessThanOrEqual(SOUND_BAND.loud[1]);
    }
  });

  it('trims only sounds that exist, only downward, and none that did not need it', () => {
    for (const [id, trim] of Object.entries(TRIM)) {
      expect(SOUND_IDS, id).toContain(id);
      expect(trim, id).toBeGreaterThan(0);
      expect(trim, id).toBeLessThan(1);
      // as written, the sound is over the band somewhere: that is why it is trimmed
      const raw = measured.filter((m) => m.id === id).map((m) => ({ peak: m.peak / trimOf(id as SoundId), loud: m.loud / trimOf(id as SoundId) }));
      expect(
        raw.some((m) => m.peak > SOUND_BAND.peak[1] || m.loud > SOUND_BAND.loud[1]),
        id,
      ).toBe(true);
    }
  });
});

/** The biggest step from one sample to the next and the sharpest bend, inside a loop and where its end meets its start. */
function seam(samples: Float32Array): { step: number; bend: number; wrapStep: number; wrapBend: number } {
  const n = samples.length;
  let step = 0;
  let bend = 0;
  for (let i = 1; i < n; i++) step = Math.max(step, Math.abs(samples[i] - samples[i - 1]));
  for (let i = 2; i < n; i++) bend = Math.max(bend, Math.abs(samples[i] - 2 * samples[i - 1] + samples[i - 2]));
  const wrapStep = Math.abs(samples[0] - samples[n - 1]);
  const wrapBend = Math.max(Math.abs(samples[1] - 2 * samples[0] + samples[n - 1]), Math.abs(samples[0] - 2 * samples[n - 1] + samples[n - 2]));
  return { step, bend, wrapStep, wrapBend };
}

describe('the beds', () => {
  const loops: Array<[string, Loop, number, number]> = ZONES.flatMap((zone) => [
    [`the bed of the ${zone} zone`, renderBed(zone), BED_SECONDS, BED_LOUD] as [string, Loop, number, number],
    [`the pulse of the ${zone} zone`, renderPulse(zone), PULSE_BEAT * PULSE_BEATS, PULSE_LOUD] as [string, Loop, number, number],
  ]);

  it.each(loops)('%s loops without a click: the last sample meets the first', (_name, loop, seconds) => {
    expect(loop.rate).toBe(BED_RATE);
    expect(loop.left.length).toBe(Math.round(seconds * BED_RATE));
    expect(loop.right.length).toBe(loop.left.length);
    for (const side of [loop.left, loop.right]) {
      expect(side.every((s) => Number.isFinite(s))).toBe(true);
      const s = seam(side);
      // going round is no bigger a step, and no sharper a bend, than the loop makes somewhere inside itself
      expect(s.wrapStep).toBeLessThanOrEqual(s.step * 1.001);
      expect(s.wrapBend).toBeLessThanOrEqual(s.bend * 1.001);
    }
  });

  it.each(loops)('%s is quiet: under the quietest sound, and nowhere near a peak', (_name, loop, _seconds, loud) => {
    const level = Math.max(levelOf(loop.left, loop.rate).loud, levelOf(loop.right, loop.rate).loud);
    expect(level).toBeCloseTo(loud, 4);
    expect(level).toBeLessThan(quietest);
    expect(Math.max(levelOf(loop.left, loop.rate).peak, levelOf(loop.right, loop.rate).peak)).toBeLessThan(SOUND_BAND.peak[0]);
  });

  it('a bed is not silent anywhere for long, and its two ears differ', () => {
    for (const zone of ZONES) {
      const bed = renderBed(zone);
      const second = BED_RATE;
      for (let at = 0; at + second <= bed.left.length; at += second) {
        expect(levelOf(bed.left.subarray(at, at + second), BED_RATE).loud, `${zone} at ${at / second}s`).toBeGreaterThan(BED_LOUD * 0.1);
      }
      let apart = 0;
      for (let i = 0; i < bed.left.length; i++) apart = Math.max(apart, Math.abs(bed.left[i] - bed.right[i]));
      expect(apart, zone).toBeGreaterThan(0.001);
    }
  });
});

/** A player that only remembers what it was told. */
class Tape implements LoopPlayer {
  ready = true;
  readonly levels = new Map<string, number>();
  readonly made: string[] = [];
  setLoop(id: string, make: () => Loop, level: number): boolean {
    if (!this.ready) return false;
    if (!this.levels.has(id)) {
      this.made.push(id);
      expect(make().left.length).toBeGreaterThan(0);
    }
    this.levels.set(id, level);
    return true;
  }
  heard(): string[] {
    return [...this.levels].filter(([, level]) => level > 0).map(([id, level]) => `${id}=${level}`);
  }
}

describe('which loop is heard when', () => {
  it('plays the bed of the zone the party is in, and crosses over at the next zone', () => {
    const tape = new Tape();
    const music = new Music(tape);
    music.update(0.016);
    expect(tape.heard()).toEqual([]);
    music.setZone('outer');
    music.update(0.016);
    expect(tape.heard()).toEqual(['bed:outer=1']);
    // another chamber of the same zone changes nothing
    music.setZone('outer');
    music.update(0.016);
    expect(tape.heard()).toEqual(['bed:outer=1']);
    music.setZone('inner');
    music.update(0.016);
    expect(tape.heard()).toEqual(['bed:inner=1']);
    expect(tape.levels.get('bed:outer')).toBe(0);
    // only what has been heard was ever made
    expect(tape.made).toEqual(['bed:outer', 'bed:inner']);
  });

  it('adds the pulse while a boss is on the floor, and drops it when the chamber is cleared or left', () => {
    const tape = new Tape();
    const music = new Music(tape);
    music.setZone('crater');
    music.setBoss(true);
    music.update(0.016);
    expect(tape.heard()).toEqual([`bed:crater=${BED_UNDER_PULSE}`, 'pulse:crater=1']);
    music.setBoss(false);
    music.update(0.016);
    expect(tape.heard()).toEqual(['bed:crater=1']);
    music.setBoss(true);
    music.update(0.016);
    music.setZone('crater');
    music.update(0.016);
    expect(tape.heard()).toEqual(['bed:crater=1']);
  });

  it('drops the pulse when a boss fight has gone silent, and keeps it while things happen', () => {
    const tape = new Tape();
    const music = new Music(tape);
    music.setZone('inner');
    music.setBoss(true);
    for (let t = 0; t < BOSS_QUIET * 3; t += 0.5) {
      music.heard();
      music.update(0.5);
    }
    expect(tape.heard()).toContain('pulse:inner=1');
    for (let t = 0; t < BOSS_QUIET; t += 0.5) music.update(0.5);
    expect(tape.heard()).toEqual(['bed:inner=1']);
  });

  it('waits for sound to start, and falls silent when the beds are turned off', () => {
    const tape = new Tape();
    tape.ready = false;
    const music = new Music(tape);
    music.setZone('outer');
    music.update(0.016);
    music.update(0.016);
    expect(tape.heard()).toEqual([]);
    tape.ready = true;
    music.update(0.016);
    expect(tape.heard()).toEqual(['bed:outer=1']);
    music.setOn(false);
    music.update(0.016);
    expect(tape.heard()).toEqual([]);
    music.setOn(true);
    music.update(0.016);
    expect(tape.heard()).toEqual(['bed:outer=1']);
  });
});
