// What a screen of the game outside the fighting is: the title, choosing a class, the menu, how
// a run ended, the controls, the settings. A screen is told what the menu keys and the pointer
// are doing and asks the app for anything beyond itself. The screens themselves are the files in
// src/ui/screens, picked up by themselves.
import { Container } from 'pixi.js';
import type { MenuKeys } from '../game/input';
import type { Save } from '../game/save';
import type { Settings } from '../game/settings';
import type { ContentRegistry } from '../sim/defs';
import type { Session } from '../sim/session';
import type { ClassId } from '../sim/types';
import { scrim } from './widgets';

/** Where the pointer is, in the view, and what it has just done. */
export interface Pointer {
  x: number;
  y: number;
  /** It has moved since the last frame: only then does it take the highlight from the keys. */
  moved: boolean;
  /** It was pressed this frame. */
  click: boolean;
}

/** What a screen may know about the game it stands over. */
export interface AppState {
  /** The device last used is a controller: prompts name its buttons. */
  pad: boolean;
  /** This page was served by a host, so there is a lobby to join. */
  hosted: boolean;
  /** A run is being played (or has just ended) behind the screen. */
  inGame: boolean;
  /** More than one laptop is playing. */
  coop: boolean;
  /** The session behind the screen, to read, or null on the title. */
  session: Session | null;
  /** The seat this laptop plays. */
  slot: number;
  /** The class last played alone. */
  classId: ClassId;
  /** What the player has set. A screen may change it, and then asks the app to 'settings'. */
  settings: Settings;
  /** What the player keeps between runs. It is changed only by asking the app. */
  save: Save;
  /** The Resonance the run that has just ended earned this player. */
  gained: number;
  /** A line the app has for the player about the last thing they asked of it ('' for none). */
  note: string;
  /** The game's content: its Tunings and Echoes. */
  content: ContentRegistry;
}

/** What a screen can ask of the app. */
export interface ScreenHost {
  readonly state: AppState;
  /** Is there a screen of this name? A menu lists only what is there. */
  has(name: string): boolean;
  /** Put another screen on top of this one. */
  open(name: string, arg?: unknown): void;
  /** Take this screen down: back to the one under it, or to the game. */
  close(): void;
  /**
   * Something only the app can do: 'play' (with a class), 'lobby', 'again' (with false to take it
   * back), 'restart', 'class', 'title', 'pauseAll', 'settings' (they were changed: feel and keep
   * them), 'attune' (with the id of an entry), 'issue' (with a class and a Tuning), and 'code'
   * (with 'write' or 'read').
   */
  act(what: string, arg?: unknown): void;
}

export interface AppScreen {
  readonly root: Container;
  /** The screen comes up, with whatever it was opened with. */
  enter(arg: unknown): void;
  layout(viewW: number, viewH: number): void;
  /** Once a frame while it is the top screen. */
  update(dt: number, keys: MenuKeys, pointer: Pointer): void;
  destroy(): void;
}

export type ScreenFactory = (host: ScreenHost) => AppScreen;

/**
 * The common body of a screen that is a panel in the middle of the view over a dimmed game: it
 * keeps the panel centred and small enough to fit, and turns a pointer into the panel's own space.
 */
export abstract class PanelScreen implements AppScreen {
  readonly root = new Container();
  protected readonly panel = new Container();
  private readonly shade = new Container();
  protected viewW = 1;
  protected viewH = 1;
  protected scale = 1;
  private shown = 0;

  constructor(
    protected readonly host: ScreenHost,
    protected w: number,
    protected h: number,
    private readonly dim = 0.55,
  ) {
    this.root.addChild(this.shade, this.panel);
  }

  abstract enter(arg: unknown): void;
  abstract update(dt: number, keys: MenuKeys, pointer: Pointer): void;

  layout(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
    this.shade.removeChildren().forEach((c) => c.destroy());
    if (this.dim > 0) this.shade.addChild(scrim(viewW, viewH, this.dim));
    this.place();
  }

  /** Centre the panel, after its size has changed. */
  protected place(): void {
    this.scale = Math.min(1, (this.viewW * 0.96) / this.w, (this.viewH * 0.94) / this.h);
    this.panel.scale.set(this.scale);
    this.panel.position.set((this.viewW - this.w * this.scale) / 2, (this.viewH - this.h * this.scale) / 2);
  }

  /** The screen has just come up: it fades in from nothing. */
  protected appear(): void {
    this.shown = 0;
    this.root.alpha = 0;
  }

  protected fade(dt: number): void {
    this.shown = Math.min(1, this.shown + dt * 6);
    this.root.alpha = this.shown;
  }

  /** The pointer's place in the panel's own space. */
  protected px(p: Pointer): number {
    return (p.x - this.panel.x) / this.scale;
  }

  protected py(p: Pointer): number {
    return (p.y - this.panel.y) / this.scale;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
