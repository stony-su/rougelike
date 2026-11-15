// The mix: how loud each sound is next to the others. A recipe says what a sound is made of;
// this says what it is trimmed by so that nothing drowns anything else.
//
// Every sound is rendered alone at full level (measure.ts) in each of the three keys, and must
// sit inside SOUND_BAND. The sounds listed here were louder than the band allows as written, and
// each is brought down by just enough; a sound that is not listed plays as its recipe has it.
// tests/audio.test.ts holds every sound to the band, so a new sound that is too loud or too
// quiet fails there until its recipe or its trim is put right. The soundboard (?sounds) shows
// the same numbers beside each name.
import type { SoundId } from './recipes';

/**
 * The band every sound sits in, alone and at full level, where 1 is full scale. No sound peaks
 * over full scale or so low that it is lost, and to the ear (the average level of its loudest
 * quarter second) the loudest is at most eight times (18 dB) the quietest: a jab is still heard
 * under a Break Slam.
 */
export const SOUND_BAND = { peak: [0.2, 1], loud: [0.025, 0.2] } as const;

/** What a sound's level is multiplied by. Each was set from its measured peak and average, noted beside it. */
export const TRIM: Partial<Record<SoundId, number>> = {
  rallySword: 0.66, // peak 0.99, average 0.295
  rallyBow: 0.71, // 1.03, 0.274
  rallyFist: 0.79, // 1.24, 0.240
  rallyChord: 0.82, // 0.63, 0.240
  reflect: 0.74, // 1.32, 0.150
  reflectPerfect: 0.79, // 1.23, 0.235
  riposte: 0.57, // 1.71, 0.221
  stonePlant: 0.81, // 1.20, 0.241
  stoneRing: 0.93, // 0.80, 0.210
  breakSlam: 0.63, // 1.55, 0.308
  wallSlam: 0.83, // 1.18, 0.165
  bumperRing: 0.84, // 1.16, 0.187
  ringOut: 0.59, // 0.60, 0.330
  bombBurst: 0.58, // 1.69, 0.279
  windThrum: 0.89, // 0.75, 0.219
  windPiper: 0.63, // 0.82, 0.311
  echoSlam: 0.71, // 1.38, 0.248
  hurt: 0.9, // 1.09, 0.187
  down: 0.73, // 1.04, 0.269
  waveStart: 0.61, // 0.75, 0.320
  roomClear: 0.78, // 0.71, 0.250
  uiTake: 0.96, // 0.92, 0.203
};

export const trimOf = (id: SoundId): number => TRIM[id] ?? 1;
