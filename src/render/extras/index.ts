// Extras: pieces of presentation that live in one file each and are picked up by themselves.
// Floor ripples, markers at the edge of the screen, an aura round an elite: anything that only
// watches the chamber and draws. Adding one means adding a file to this folder and touching
// nothing else, so two people adding two extras never meet in a shared file. README.md, next
// to this file, shows how.
import type { Room, SimEvent, World } from '../../sim/types';
import type { Camera } from '../camera';
import type { ZoneTheme } from '../palette';
import type { Stage } from '../stage';
import type { Textures } from '../textures';

/** What an extra is given to work with. It reads the world it is shown and never changes it. */
export interface ExtraContext {
  stage: Stage;
  camera: Camera;
  textures: Textures;
  /** The seat this laptop plays. */
  localSlot: () => number;
}

export interface Extra {
  /** A chamber has come on screen. Called once at the start too. */
  room?(room: Room, theme: ZoneTheme): void;
  /** Something happened in the chamber being drawn. */
  handle?(ev: SimEvent, w: World): void;
  /** Once a frame, after the camera has moved. `alpha` says how far between the last two ticks the picture stands. */
  update?(dt: number, w: World, alpha: number, time: number): void;
  resize?(width: number, height: number): void;
  destroy(): void;
}

export type ExtraFactory = (ctx: ExtraContext) => Extra;

const found = import.meta.glob<ExtraFactory>(['./*.ts', '!./index.ts'], { eager: true, import: 'default' });

/** One of every extra in this folder, in the order of their file names. */
export function createExtras(ctx: ExtraContext): Extra[] {
  return Object.keys(found)
    .sort()
    .map((path) => found[path](ctx));
}
