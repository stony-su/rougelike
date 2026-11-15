// The sound of the game, as the game shell uses it: hand it every simulation event and it plays
// what that event sounds like for this laptop's player. Synthesized as it goes; there are no
// audio files.
//
//   scale.ts    the key of each zone, and the notes a Rally climbs
//   recipes.ts  what each named sound is made of
//   cues.ts     which sounds an event makes, how loud and where
//   engine.ts   Web Audio: voices, the limiter, the meter
import type { ZoneId } from '../sim/defs';
import type { ClassId, SimEvent } from '../sim/types';
import { setUiSoundSink } from '../ui/sfx';
import type { UiSound } from '../ui/sfx';
import { cuesFor, uiCue } from './cues';
import type { Cue, Listener } from './cues';
import { AudioEngine } from './engine';
import type { EngineStats } from './engine';

export type { Cue, Listener } from './cues';
export type { EngineStats } from './engine';
export type { SoundId } from './recipes';

/** The class an event gives away: only the Sword swings, only the Bow looses, only the Fist jabs. */
function classShown(ev: SimEvent): ClassId | null {
  switch (ev.type) {
    case 'swing':
    case 'whirl':
      return 'sword';
    case 'loose':
    case 'stoneThrow':
    case 'stonePlant':
      return 'bow';
    case 'jab':
    case 'chargeFull':
    case 'haymaker':
    case 'breakSlam':
      return 'fist';
    default:
      return null;
  }
}

export class GameAudio {
  private readonly engine = new AudioEngine();
  /** Each seat's class. Told by `setClasses`, and otherwise learned from what each seat is seen to do. */
  private readonly classes: Array<ClassId | undefined> = [];
  private readonly listener: Listener = { slot: 0, x: 0, y: 0, zone: 'outer', classes: this.classes };
  private readonly sink = (sound: UiSound): void => this.ui(sound);

  constructor() {
    // the interface's sounds come here from now on
    setUiSoundSink(this.sink);
  }

  /** Start sound. Browsers want a key press or a click first; this is safe to call on every input event. */
  unlock(): void {
    this.engine.unlock();
  }

  /** The zone the player is in: everything pitched is played in its key. */
  setZone(zone: ZoneId): void {
    this.listener.zone = zone;
  }

  get zone(): ZoneId {
    return this.listener.zone;
  }

  /** Say which class sits in each seat, so a Rally is voiced right from its first note. */
  setClasses(classes: ReadonlyArray<ClassId | undefined>): void {
    this.classes.length = 0;
    for (const c of classes) this.classes.push(c);
  }

  /**
   * Play what one simulation event sounds like to the player in seat `localSlot`, who stands
   * at (focusX, focusY).
   */
  handle(ev: SimEvent, localSlot: number, focusX: number, focusY: number): void {
    const shown = classShown(ev);
    if (shown && 'player' in ev) this.classes[ev.player] = shown;
    const at = this.listener;
    at.slot = localSlot;
    at.x = focusX;
    at.y = focusY;
    for (const cue of cuesFor(ev, at)) this.engine.play(cue);
  }

  /** An interface sound, in the key of the zone the player is in. */
  ui(sound: UiSound): void {
    this.engine.play(uiCue(sound, this.listener.zone));
  }

  /** Play one cue as it stands. For the soundboard; the game goes through `handle`. */
  play(cue: Cue): void {
    this.engine.play(cue);
  }

  get muted(): boolean {
    return this.engine.muted;
  }

  setMuted(muted: boolean): void {
    this.engine.setMuted(muted);
  }

  /** Flip mute. Returns true if sound is now muted. */
  toggleMute(): boolean {
    return this.engine.toggleMute();
  }

  /** 0 is silent, 1 is full. */
  setVolume(v: number): void {
    this.engine.setVolume(v);
  }

  /** Once a frame. */
  update(dt: number): void {
    this.engine.update(dt);
  }

  /** What is going out to the speakers right now: the largest sample and the RMS, where 1 is full scale. */
  level(): { peak: number; rms: number } {
    return this.engine.level();
  }

  stats(): EngineStats {
    return this.engine.stats();
  }

  destroy(): void {
    setUiSoundSink(() => undefined);
    this.engine.destroy();
  }
}
