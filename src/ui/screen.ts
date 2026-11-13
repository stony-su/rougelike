// What every modal screen provides. While a screen is open the simulation is paused and the
// screen owns the keyboard.
import type { Container } from 'pixi.js';
import type { Input } from '../game/input';

export interface Screen {
  readonly root: Container;
  layout(viewW: number, viewH: number): void;
  update(dt: number, input: Input): void;
  destroy(): void;
}
