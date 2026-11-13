// Interface sounds. Screens say what happened; the game decides what that sounds like by
// installing a sink, so the UI never imports the audio engine and works silently without one.
export type UiSound =
  /** The highlight moved. */
  | 'move'
  /** A choice was made. */
  | 'confirm'
  /** A screen or sub-step was backed out of. */
  | 'back'
  /** The action is not possible (cannot afford, nothing to do). */
  | 'error'
  /** Something was paid for. */
  | 'buy'
  /** An instrument was taken: the form is stamped. */
  | 'stamp';

let sink: (sound: UiSound) => void = () => undefined;

export function setUiSoundSink(fn: (sound: UiSound) => void): void {
  sink = fn;
}

export function uiSound(sound: UiSound): void {
  sink(sound);
}
