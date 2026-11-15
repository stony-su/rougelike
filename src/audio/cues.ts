// What every simulation event sounds like: the twin, for the ear, of render/fx.ts. One exhaustive
// switch turns an event into zero or more CUES (which sound, how loud, at what pitch or on which
// note, how far to one side, how long from now), so adding an event type without deciding how it
// sounds fails the type-check. Pure: it keeps no state and touches no Web Audio. Everything it
// needs to decide is handed in as the listener.
import { clamp } from '../core/math';
import type { ZoneId } from '../sim/defs';
import { RALLY } from '../sim/tuning';
import type { ClassId, SimEvent } from '../sim/types';
import type { UiSound } from '../ui/sfx';
import { PITCH_HIGH, PITCH_LOW, RECIPES, homeNote } from './recipes';
import type { SoundId } from './recipes';
import { RALLY_STEPS, chordOf, noteOf, toneOf } from './scale';

/** One sound to play. */
export interface Cue {
  sound: SoundId;
  /** Level, 0..1: distance, and whose sound it is, already counted. */
  gain: number;
  /** Shift of the sound's untuned layers: 1 plays them as written, 0.5 an octave down. */
  pitch: number;
  /** The note its tuned layers ring at, in hertz: always a note of the zone's key. 0 for a sound with no tuned layer. */
  note: number;
  /** -1 is hard left, 1 hard right. */
  pan: number;
  /** Seconds from now until it starts. */
  delay: number;
}

/** Who is listening: this laptop's seat, where its player stands, and what is needed to voice an event. */
export interface Listener {
  /** The seat this laptop plays. */
  slot: number;
  /** Where its player stands, in tiles. */
  x: number;
  y: number;
  zone: ZoneId;
  /** Each seat's class, by slot. A seat nobody has spoken for plays as the Sword. */
  classes: ReadonlyArray<ClassId | undefined>;
}

// ---------------------------------------------------------------- distance and side

/** A sound this close is at full level, */
export const HEAR_NEAR = 3;
/** and one this far away is not heard at all. */
export const HEAR_FAR = 16;
/** A sound this many tiles of screen width to one side is as far to that side as sounds go, */
export const PAN_WIDTH = 14;
/** which is never all the way: nothing plays in one ear only. */
export const PAN_MAX = 0.8;
/** A cue quieter than this is not worth a voice. */
export const MIN_GAIN = 0.01;

/** A teammate's own actions next to the local player's, */
const MATE = 0.5;
/** a teammate's Rally notes next to the local player's, */
const MATE_NOTE = 0.4;
/** and what a teammate's hand, or nobody's, sent flying next to what the local player did. */
const OTHERS = 0.75;
/** Seconds between the notes of a chord, so it is strummed and not stamped. */
const STRUM = 0.028;
/** A ricochet's first bounce plays this note of the scale, and each bounce after it the next one up. */
const RICOCHET_STEP = 10;
const RICOCHET_MOST = 9;
/** Seconds between the bells that tell a chamber is cleared. */
const CLEAR_STEP = 0.11;

/** How much of a sound is left at a distance, in tiles: all of it nearby, none of it across the chamber. */
export function hearing(distance: number): number {
  if (distance <= HEAR_NEAR) return 1;
  if (distance >= HEAR_FAR) return 0;
  const k = (HEAR_FAR - distance) / (HEAR_FAR - HEAR_NEAR);
  return k * k;
}

/** Left or right of the listener, by where the thing is on screen: screen x runs along (x - y). */
export function panOf(x: number, y: number, at: Listener): number {
  return clamp((x - y - (at.x - at.y)) / PAN_WIDTH, -1, 1) * PAN_MAX;
}

// ---------------------------------------------------------------- which sound

const SWINGS: readonly SoundId[] = ['swing1', 'swing2', 'swing3'];
const JABS: readonly SoundId[] = ['jab1', 'jab2', 'jab3'];
const RALLY_VOICE: Record<ClassId, SoundId> = { sword: 'rallySword', bow: 'rallyBow', fist: 'rallyFist' };
const HIT_VOICE: Record<ClassId, SoundId> = { sword: 'hitSword', bow: 'hitBow', fist: 'hitFist' };
/** The wind-up voice of each kind of Echo. A kind with no entry breathes like any other. */
const WINDUP_VOICE = new Map<string, SoundId>([
  ['thrum', 'windThrum'],
  ['piper', 'windPiper'],
  ['burr', 'windBurr'],
]);
/** What each kind's attack sounds like. The Burr has none of its own: the bomb it throws on the same tick tells it. */
const ATTACK_VOICE = new Map<string, SoundId | null>([
  ['thrum', 'thrumLunge'],
  ['piper', 'piperVolley'],
  ['burr', null],
]);
const UI_VOICE: Record<UiSound, SoundId> = {
  move: 'uiMove',
  confirm: 'uiConfirm',
  back: 'uiBack',
  error: 'uiError',
  buy: 'uiBuy',
  stamp: 'uiTake',
};

const classOf = (at: Listener, slot: number): ClassId => at.classes[slot] ?? 'sword';

// ---------------------------------------------------------------- building cues

interface More {
  pitch?: number;
  note?: number;
  delay?: number;
  /** The least share of its level it keeps however far away it is: for what every player has to hear. */
  carry?: number;
}

/** A sound on a given note at a given level. `note` omitted means the sound's home note in the zone. */
export function cueOf(sound: SoundId, zone: ZoneId, gain = 1, more: Omit<More, 'carry'> & { pan?: number } = {}): Cue {
  const recipe = RECIPES[sound];
  return {
    sound,
    gain: clamp(gain, 0, 1),
    pitch: clamp(more.pitch ?? 1, PITCH_LOW, PITCH_HIGH),
    note: recipe.home ? (more.note ?? homeNote(recipe, zone)) : 0,
    pan: clamp(more.pan ?? 0, -1, 1),
    delay: Math.max(0, more.delay ?? 0),
  };
}

/** A sound that is nowhere in particular: the interface, and what belongs to the whole chamber. */
function flat(out: Cue[], at: Listener, sound: SoundId, gain: number, more?: More): void {
  if (gain >= MIN_GAIN) out.push(cueOf(sound, at.zone, gain, more));
}

/** A sound at a place in the chamber: quieter with distance, and to the side it is on. */
function here(out: Cue[], at: Listener, sound: SoundId, x: number, y: number, gain: number, more?: More): void {
  const heard = Math.max(hearing(Math.hypot(x - at.x, y - at.y)), more?.carry ?? 0);
  const level = gain * heard;
  if (level >= MIN_GAIN) out.push(cueOf(sound, at.zone, level, { ...more, pan: panOf(x, y, at) }));
}

/** The sound an interface event makes, in the key of the zone the player is in. */
export function uiCue(sound: UiSound, zone: ZoneId): Cue {
  return cueOf(UI_VOICE[sound], zone);
}

// ---------------------------------------------------------------- events

/** The cues one simulation event makes for one listener. Often one, sometimes a few, sometimes none. */
export function cuesFor(ev: SimEvent, at: Listener): Cue[] {
  const out: Cue[] = [];
  const zone = at.zone;
  /** The local player's own actions are full; a teammate's are quieter. */
  const whose = (slot: number): number => (slot === at.slot ? 1 : MATE);
  /** What the local player sent flying is full; what anyone else did is a little less. */
  const hand = (slot: number): number => (slot === at.slot ? 1 : OTHERS);

  switch (ev.type) {
    // ---- every player
    case 'dash':
      here(out, at, 'dash', ev.x, ev.y, 0.9 * whose(ev.player));
      break;
    case 'dashCharge':
      // one's own dash coming back; nobody needs to hear a teammate's
      if (ev.player === at.slot) flat(out, at, 'dashReady', 0.7);
      break;
    case 'specialReady':
      if (ev.player === at.slot) flat(out, at, 'specialReady', 0.8);
      break;
    case 'refused':
      if (ev.player === at.slot) flat(out, at, 'refused', 0.8);
      break;
    case 'dashEnd':
    case 'projectileSpawn':
    case 'projectileEnd':
      // told already: by the dash, by the swing, the string or the reed that made the shot, and by whatever the shot did
      break;

    // ---- the Sword
    case 'swing':
      here(out, at, SWINGS[ev.n] ?? 'swing1', ev.x, ev.y, whose(ev.player));
      break;
    case 'guard':
      here(out, at, 'guard', ev.x, ev.y, whose(ev.player));
      break;
    case 'riposte':
      here(out, at, 'riposte', ev.x, ev.y, whose(ev.player));
      break;
    case 'reflect':
      // the Fist's Break also turns shots, with an open hand and not an edge
      if (classOf(at, ev.player) === 'fist') here(out, at, 'palmSlap', ev.x, ev.y, whose(ev.player));
      else here(out, at, ev.perfect ? 'reflectPerfect' : 'reflect', ev.x, ev.y, whose(ev.player));
      break;

    // ---- the Bow
    case 'loose':
      here(out, at, 'loose', ev.x, ev.y, whose(ev.player));
      break;
    case 'ricochet': {
      if (ev.by < 0) {
        // an Echo's own shot glancing off the chamber
        here(out, at, 'tick', ev.x, ev.y, 0.6);
        break;
      }
      // each bounce is the next note up, so a long bank is heard climbing
      const note = noteOf(zone, RICOCHET_STEP + clamp(ev.n, 1, RICOCHET_MOST));
      here(out, at, 'ricochet', ev.x, ev.y, 0.9 * whose(ev.by), { note });
      if (ev.off === 'bumper') here(out, at, 'bumperRing', ev.x, ev.y, 0.6 * whose(ev.by));
      else if (ev.off === 'stone') here(out, at, 'stoneRing', ev.x, ev.y, 0.8 * whose(ev.by));
      break;
    }
    case 'skip':
      here(out, at, 'skip', ev.fromX, ev.fromY, whose(ev.by));
      break;
    case 'stoneThrow':
      here(out, at, 'stoneThrow', ev.x, ev.y, whose(ev.player));
      break;
    case 'stonePlant':
      here(out, at, 'stonePlant', ev.x, ev.y, whose(ev.player));
      break;
    case 'stoneEnd':
      here(out, at, 'stoneEnd', ev.x, ev.y, 0.7);
      break;

    // ---- the Fist
    case 'jab':
      here(out, at, JABS[ev.n] ?? 'jab1', ev.x, ev.y, whose(ev.player));
      break;
    case 'chargeFull':
      here(out, at, 'chargeFull', ev.x, ev.y, whose(ev.player));
      break;
    case 'haymaker': {
      // the fuller the charge, the more arm and the lower it sits
      const charge = clamp(ev.charge, 0, 1);
      here(out, at, 'haymaker', ev.x, ev.y, (0.55 + 0.45 * charge) * whose(ev.player), { pitch: 1.2 - 0.4 * charge });
      break;
    }
    case 'breakSlam':
      here(out, at, 'breakSlam', ev.x, ev.y, whose(ev.player));
      break;

    // ---- the Rally
    case 'rally': {
      const mine = ev.player === at.slot;
      const step = clamp(Math.round(ev.value), 1, RALLY_STEPS);
      const voice = RALLY_VOICE[classOf(at, ev.player)];
      // One's own notes are full wherever the Return landed. A teammate's are quieter and fade with distance.
      const level = mine ? 1 : MATE_NOTE * hearing(Math.hypot(ev.x - at.x, ev.y - at.y));
      if (level < MIN_GAIN) break;
      const pan = panOf(ev.x, ev.y, at) * (mine ? 0.5 : 1);
      if (ev.weight >= RALLY.weight.perfect) {
        // a perfect return rings a chord: the note in the player's own voice, and the rest of it strummed above
        const chord = chordOf(zone, step);
        out.push(cueOf(voice, zone, level, { note: chord[0], pan }));
        for (let i = 1; i < chord.length; i++) out.push(cueOf('rallyChord', zone, level * 0.6, { note: chord[i], pan, delay: i * STRUM }));
      } else {
        // an arrow's Return counts for less than something sent back, and sounds it
        out.push(cueOf(voice, zone, level * (ev.weight <= RALLY.weight.arrow ? 0.85 : 1), { note: noteOf(zone, step), pan }));
      }
      break;
    }
    case 'rallyBreak': {
      if (ev.value < 1) break;
      // the soft falling tone starts higher the more was lost
      const lost = clamp(ev.value / 10, 0, 1);
      flat(out, at, 'rallyBreak', (ev.player === at.slot ? 0.9 : 0.35) * (0.5 + 0.5 * lost), { note: noteOf(zone, clamp(ev.value + 5, 6, 14)) });
      break;
    }

    // ---- bodies
    case 'launch': {
      const hard = clamp(ev.speed / 26, 0, 1);
      here(out, at, 'launch', ev.x, ev.y, (0.45 + 0.55 * hard) * hand(ev.by), { pitch: 1.2 - 0.35 * hard });
      break;
    }
    case 'wallSlam': {
      // harder is louder and lower; a bumper rings bright and a Ringstone rings like glass over the thud
      const hard = clamp(ev.speed / 22, 0, 1);
      here(out, at, 'wallSlam', ev.x, ev.y, (0.25 + 0.75 * hard) * hand(ev.by), { pitch: (ev.off === 'post' ? 1.5 : 1.25) - 0.45 * hard });
      if (ev.off === 'bumper') here(out, at, 'bumperRing', ev.x, ev.y, (0.5 + 0.5 * hard) * hand(ev.by));
      else if (ev.off === 'stone') here(out, at, 'stoneRing', ev.x, ev.y, (0.5 + 0.5 * hard) * hand(ev.by));
      break;
    }
    case 'carom': {
      // each link of a chain clacks a little higher than the one before
      const hard = clamp(ev.speed / 22, 0, 1);
      here(out, at, 'carom', ev.x, ev.y, (0.5 + 0.5 * hard) * hand(ev.by), { pitch: 0.92 + 0.08 * clamp(ev.links, 0, 5) });
      break;
    }
    case 'ringOut':
      here(out, at, 'ringOut', ev.x, ev.y, hand(ev.by));
      break;
    case 'climbOut':
      here(out, at, 'climbOut', ev.x, ev.y, 0.7);
      break;
    case 'land':
      here(out, at, 'land', ev.x, ev.y, 0.6);
      break;
    case 'stagger':
      here(out, at, 'stagger', ev.x, ev.y, 0.9);
      break;
    case 'armorBreak':
      here(out, at, 'armorBreak', ev.x, ev.y, 0.9);
      break;
    case 'hit': {
      // A bounce, a blast and a fire have their own sounds, and a Return has its note: the hit adds nothing to them.
      if (ev.kind === 'slam' || ev.kind === 'carom' || ev.kind === 'ringout' || ev.kind === 'burst' || ev.kind === 'burn') break;
      if (ev.kind === 'return' || ev.by < 0) {
        // under a Return's note, only the least sound of something landing
        here(out, at, 'tick', ev.x, ev.y, 0.8 * hand(ev.by));
        break;
      }
      // a direct blow, in the voice of the class that dealt it
      here(out, at, HIT_VOICE[classOf(at, ev.by)], ev.x, ev.y, (ev.heavy ? 1 : 0.7) * whose(ev.by), { pitch: ev.heavy ? 0.82 : 1 });
      break;
    }

    // ---- bombs
    case 'bombThrow':
      here(out, at, 'bombThrow', ev.x, ev.y, 0.8);
      break;
    case 'bombLand':
      here(out, at, 'bombLand', ev.x, ev.y, 0.8);
      break;
    case 'bombBat':
      here(out, at, 'bombBat', ev.x, ev.y, whose(ev.player));
      break;
    case 'bombBurst':
      here(out, at, 'bombBurst', ev.x, ev.y, clamp(ev.radius / 1.6, 0.6, 1));
      break;

    // ---- Echoes
    case 'enemySpawn':
      here(out, at, 'spawn', ev.x, ev.y, 0.7);
      break;
    case 'enemyWindup':
      here(out, at, WINDUP_VOICE.get(ev.kind) ?? 'windEcho', ev.x, ev.y, 0.9);
      break;
    case 'enemyAttack': {
      const voice = ATTACK_VOICE.has(ev.kind) ? ATTACK_VOICE.get(ev.kind) : 'echoAttack';
      if (voice) here(out, at, voice, ev.x, ev.y, 0.9);
      break;
    }
    case 'slam':
      here(out, at, 'echoSlam', ev.x, ev.y, clamp(0.5 + ev.radius / 5, 0.5, 1));
      break;
    case 'enemyStun':
      here(out, at, 'stun', ev.x, ev.y, 0.7);
      break;
    case 'enemyDeath':
      // an elite goes down lower and louder
      here(out, at, 'echoDeath', ev.x, ev.y, ev.elite ? 1 : 0.8, { pitch: ev.elite ? 0.75 : 1 });
      break;

    // ---- players hurt
    case 'playerHurt':
      // one's own hurt grows with the blow; a teammate's is a quieter warning
      here(out, at, 'hurt', ev.x, ev.y, ev.player === at.slot ? clamp(0.6 + ev.amount / 40, 0.6, 1) : 0.45);
      break;
    case 'playerDown':
      // everyone needs to know, however far away they are
      here(out, at, 'down', ev.x, ev.y, ev.player === at.slot ? 1 : 0.8, { carry: 0.7 });
      break;

    // ---- the run
    case 'chime':
      // paid to every purse, so heard by every player
      here(out, at, ev.amount >= 5 ? 'pickupBig' : 'pickup', ev.x, ev.y, 0.9, { carry: 0.5 });
      break;
    case 'waveStart':
      flat(out, at, 'waveStart', 0.9);
      break;
    case 'roomClear': {
      // four bells up the chord of the key, the last one home
      const figure = [toneOf(zone, 0, 1), toneOf(zone, 4, 1), toneOf(zone, 7, 1), toneOf(zone, 0, 2)];
      figure.forEach((note, i) => flat(out, at, 'roomClear', i === figure.length - 1 ? 1 : 0.75, { note, delay: i * CLEAR_STEP }));
      break;
    }
    case 'shockwave':
      here(out, at, 'shockwave', ev.x, ev.y, clamp(ev.radius / 2.5, 0.5, 1));
      break;
    case 'duet':
      // two players, one bounce: the stone's ring over whatever the bounce itself sounded like
      here(out, at, 'stoneRing', ev.x, ev.y, ev.a === at.slot || ev.b === at.slot ? 0.9 : 0.6);
      break;
    case 'revive':
      here(out, at, 'specialReady', ev.x, ev.y, 1);
      here(out, at, 'stonePlant', ev.x, ev.y, 0.7);
      break;

    // ---- Tunings
    case 'tuning':
      if (ev.player === at.slot) flat(out, at, 'uiTake', 1);
      else here(out, at, 'uiTake', ev.x, ev.y, 0.5);
      break;
    case 'burst':
      here(out, at, 'shockwave', ev.x, ev.y, clamp(ev.radius / 2.5, 0.5, 1) * whose(ev.by));
      break;
    case 'bolt':
      here(out, at, 'stoneRing', ev.toX, ev.toY, 0.6 * whose(ev.by));
      break;
    case 'heal':
      if (ev.player === at.slot) flat(out, at, 'pickupBig', 0.6);
      break;
    case 'ward':
      here(out, at, 'riposte', ev.x, ev.y, whose(ev.player));
      break;
    case 'afterimage':
      here(out, at, 'dashReady', ev.x, ev.y, whose(ev.player));
      break;

    // ---- traits and bosses
    case 'clang':
      here(out, at, 'guard', ev.x, ev.y, whose(ev.by));
      break;
    case 'grounded':
      here(out, at, 'land', ev.x, ev.y, 1);
      here(out, at, 'stun', ev.x, ev.y, 0.7);
      break;
    case 'takeoff':
      here(out, at, 'climbOut', ev.x, ev.y, 0.7);
      break;
    case 'strike':
      here(out, at, 'echoSlam', ev.x, ev.y, ev.shape === 'circle' ? clamp(ev.radius / 3, 0.6, 1) : 0.8);
      break;
    case 'bellCrack':
      here(out, at, 'reflectPerfect', ev.x, ev.y, 1);
      here(out, at, 'armorBreak', ev.x, ev.y, 0.9);
      break;
    case 'bossPhase':
      flat(out, at, 'waveStart', 1);
      here(out, at, 'shockwave', ev.x, ev.y, 1);
      break;

    default: {
      // Adding a simulation event without deciding how it sounds is a compile error here.
      const unhandled: never = ev;
      void unhandled;
    }
  }
  return out;
}

// ---------------------------------------------------------------- samples

/**
 * One of every event, at the origin, by seat 0. The soundboard plays them and the tests run them
 * all through `cuesFor`; the type makes leaving a new event out a compile error.
 */
export const SAMPLE_EVENTS: { readonly [K in SimEvent['type']]: Extract<SimEvent, { type: K }> } = {
  dash: { type: 'dash', player: 0, x: 0, y: 0, dx: 1, dy: 0 },
  dashEnd: { type: 'dashEnd', player: 0, x: 0, y: 0 },
  dashCharge: { type: 'dashCharge', player: 0, charges: 2 },
  swing: { type: 'swing', player: 0, n: 0, x: 0, y: 0, angle: 0, reach: 2, halfArc: 1 },
  jab: { type: 'jab', player: 0, n: 0, x: 0, y: 0, angle: 0, reach: 1.5, halfArc: 0.9 },
  loose: { type: 'loose', player: 0, x: 0, y: 0, angle: 0 },
  chargeFull: { type: 'chargeFull', player: 0, x: 0, y: 0 },
  haymaker: { type: 'haymaker', player: 0, x: 0, y: 0, angle: 0, charge: 1 },
  breakSlam: { type: 'breakSlam', player: 0, x: 0, y: 0, radius: 2.6 },
  guard: { type: 'guard', player: 0, x: 0, y: 0 },
  riposte: { type: 'riposte', player: 0, x: 0, y: 0 },
  specialReady: { type: 'specialReady', player: 0 },
  reflect: { type: 'reflect', player: 0, id: 1, x: 0, y: 0, perfect: false },
  ricochet: { type: 'ricochet', id: 1, by: 0, x: 0, y: 0, n: 1, off: 'wall', nx: 1, ny: 0 },
  skip: { type: 'skip', by: 0, fromX: 0, fromY: 0, toX: 2, toY: 1 },
  launch: { type: 'launch', id: 1, by: 0, x: 0, y: 0, speed: 14 },
  wallSlam: { type: 'wallSlam', id: 1, by: 0, x: 0, y: 0, speed: 12, off: 'wall', nx: 1, ny: 0 },
  carom: { type: 'carom', a: 1, b: 2, by: 0, x: 0, y: 0, speed: 12, links: 1 },
  ringOut: { type: 'ringOut', id: 1, by: 0, x: 0, y: 0, killed: true },
  climbOut: { type: 'climbOut', id: 1, x: 0, y: 0 },
  land: { type: 'land', id: 1, x: 0, y: 0 },
  stagger: { type: 'stagger', id: 1, x: 0, y: 0 },
  rally: { type: 'rally', player: 0, value: 1, weight: 2, x: 0, y: 0 },
  rallyBreak: { type: 'rallyBreak', player: 0, value: 8 },
  duet: { type: 'duet', kind: 'bank', a: 0, b: 1, x: 0, y: 0 },
  revive: { type: 'revive', player: 0, by: 1, x: 0, y: 0 },
  stoneThrow: { type: 'stoneThrow', id: 1, player: 0, x: 0, y: 0 },
  stonePlant: { type: 'stonePlant', id: 1, player: 0, x: 0, y: 0 },
  stoneEnd: { type: 'stoneEnd', id: 1, x: 0, y: 0 },
  bombThrow: { type: 'bombThrow', id: 1, x: 0, y: 0 },
  bombLand: { type: 'bombLand', id: 1, x: 0, y: 0 },
  bombBat: { type: 'bombBat', id: 1, player: 0, x: 0, y: 0 },
  bombBurst: { type: 'bombBurst', id: 1, by: 0, x: 0, y: 0, radius: 1.6 },
  hit: { type: 'hit', target: 1, by: 0, x: 0, y: 0, amount: 9, kind: 'direct', heavy: false, crit: false, dx: 1, dy: 0, killed: false },
  playerHurt: { type: 'playerHurt', player: 0, amount: 10, x: 0, y: 0, dx: 1, dy: 0 },
  playerDown: { type: 'playerDown', player: 0, x: 0, y: 0 },
  enemySpawn: { type: 'enemySpawn', id: 1, kind: 'thrum', x: 0, y: 0 },
  enemyWindup: { type: 'enemyWindup', id: 1, kind: 'thrum', move: 'lunge', x: 0, y: 0 },
  enemyAttack: { type: 'enemyAttack', id: 1, kind: 'thrum', move: 'lunge', x: 0, y: 0 },
  enemyStun: { type: 'enemyStun', id: 1, x: 0, y: 0 },
  enemyDeath: { type: 'enemyDeath', id: 1, kind: 'thrum', x: 0, y: 0, dx: 1, dy: 0, elite: null },
  slam: { type: 'slam', x: 0, y: 0, radius: 2.5 },
  projectileSpawn: { type: 'projectileSpawn', id: 1, kind: 'bolt', x: 0, y: 0 },
  projectileEnd: { type: 'projectileEnd', id: 1, kind: 'bolt', x: 0, y: 0, hit: true },
  waveStart: { type: 'waveStart', wave: 1 },
  refused: { type: 'refused', player: 0, what: 'special' },
  shockwave: { type: 'shockwave', x: 0, y: 0, radius: 2.5 },
  chime: { type: 'chime', amount: 1, x: 0, y: 0 },
  armorBreak: { type: 'armorBreak', id: 1, x: 0, y: 0 },
  roomClear: { type: 'roomClear', x: 0, y: 0 },
  tuning: { type: 'tuning', player: 0, id: 'stout-heart', rank: 1, x: 0, y: 0 },
  burst: { type: 'burst', by: 0, x: 0, y: 0, radius: 2.5, what: 'overtone' },
  bolt: { type: 'bolt', by: 0, fromX: 0, fromY: 0, toX: 1, toY: 0 },
  heal: { type: 'heal', player: 0, amount: 3, x: 0, y: 0 },
  ward: { type: 'ward', player: 0, x: 0, y: 0 },
  afterimage: { type: 'afterimage', player: 0, x: 0, y: 0 },
  clang: { type: 'clang', id: 1, by: 0, x: 0, y: 0 },
  grounded: { type: 'grounded', id: 1, x: 0, y: 0 },
  takeoff: { type: 'takeoff', id: 1, x: 0, y: 0 },
  bossPhase: { type: 'bossPhase', id: 1, kind: 'toll', phase: 1, x: 0, y: 0 },
  bellCrack: { type: 'bellCrack', id: 1, n: 1, x: 0, y: 0 },
  strike: { type: 'strike', shape: 'circle', x: 0, y: 0, angle: 0, radius: 3, inner: 0, length: 0, width: 0 },
};

/** A copy of an event moved to another place in the chamber. An event that happens nowhere comes back unchanged. */
export function placed<E extends SimEvent>(ev: E, x: number, y: number): E {
  const copy: Record<string, unknown> = { ...ev };
  if ('x' in copy) {
    copy.x = x;
    copy.y = y;
  }
  if ('fromX' in copy) {
    copy.toX = x + Number(copy.toX) - Number(copy.fromX);
    copy.toY = y + Number(copy.toY) - Number(copy.fromY);
    copy.fromX = x;
    copy.fromY = y;
  }
  return copy as unknown as E;
}
