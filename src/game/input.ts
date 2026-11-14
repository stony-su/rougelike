// Keyboard and mouse. Collects raw state and press edges from DOM events and writes them into
// the integer input frame that travels to the relay: held buttons, one press counter per button,
// movement as a direction, and aim as an angle and a distance from the player.
import { screenDirToWorld } from '../core/iso';
import type { Vec2 } from '../core/math';
import type { Camera } from '../render/camera';
import { hold, press, setAim, setMove } from '../sim/input';
import { BTN, PRESS, emptyInput } from '../sim/types';
import type { InputFrame } from '../sim/types';

export const BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  attack: ['Mouse0', 'KeyJ'],
  special: ['Mouse2', 'KeyK'],
  dash: ['Space', 'ShiftLeft', 'ShiftRight'],
  interact: ['KeyF', 'KeyE'],
  pause: ['Escape', 'KeyP'],
  restart: ['KeyR'],
  mute: ['KeyM'],
  confirm: ['Enter', 'Space', 'KeyF'],
} as const;

export type Action = keyof typeof BINDINGS;

/** Keys the browser must not act on while the game has focus. */
const SWALLOW = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote']);

export class Input {
  mouseX = 0;
  mouseY = 0;
  /** True once the mouse has moved, so aim is not stuck at (0, 0) before the first move. */
  hasMouse = false;

  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly dir: Vec2 = { x: 0, y: 0 };
  private readonly aim: Vec2 = { x: 0, y: 0 };
  private readonly frameOut: InputFrame = emptyInput();
  private readonly cleanup: Array<() => void> = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions): void => {
      target.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };

    on(window, 'keydown', (e) => {
      if (SWALLOW.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
    });
    on(window, 'keyup', (e) => {
      this.down.delete(e.code);
    });
    on(window, 'blur', () => this.releaseAll());
    on(window, 'pointermove', (e) => this.trackMouse(e));
    on(canvas, 'pointerdown', (e) => {
      this.trackMouse(e);
      const code = `Mouse${e.button}`;
      this.down.add(code);
      this.pressed.add(code);
      canvas.focus({ preventScroll: true });
      e.preventDefault();
    });
    on(window, 'pointerup', (e) => {
      this.down.delete(`Mouse${e.button}`);
    });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on(document.body, 'contextmenu', (e) => e.preventDefault());
    canvas.tabIndex = 0;
  }

  destroy(): void {
    for (const fn of this.cleanup) fn();
    this.cleanup.length = 0;
  }

  /** Forget everything held (window lost focus, or a menu opened). */
  releaseAll(): void {
    this.down.clear();
    this.pressed.clear();
  }

  /** Forget presses not yet consumed, keeping what is held (a menu opened or closed). */
  clearPresses(): void {
    this.pressed.clear();
  }

  isDown(action: Action): boolean {
    for (const code of BINDINGS[action]) if (this.down.has(code)) return true;
    return false;
  }

  /** True once per press; consumes the press. */
  take(action: Action): boolean {
    let hit = false;
    for (const code of BINDINGS[action]) {
      if (this.pressed.delete(code)) hit = true;
    }
    return hit;
  }

  /** True once per press of a raw key code; consumes the press. */
  takeCode(code: string): boolean {
    return this.pressed.delete(code);
  }

  /**
   * This device's input as it will be sent. Called once per rendered frame; gameplay press edges
   * are consumed here and become counter bumps, so a tap is never lost and never counted twice.
   * Aim is measured from where the player is drawn right now.
   */
  frame(cam: Camera, playerX: number, playerY: number): InputFrame {
    const f = this.frameOut;
    const ix = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    const iy = (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0);
    screenDirToWorld(ix, iy, this.dir);
    setMove(f, this.dir.x, this.dir.y);
    if (this.hasMouse) {
      cam.screenToWorld(this.mouseX, this.mouseY, this.aim);
      setAim(f, playerX, playerY, this.aim.x, this.aim.y);
    }
    hold(f, BTN.attack, this.isDown('attack'));
    hold(f, BTN.special, this.isDown('special'));
    hold(f, BTN.dash, this.isDown('dash'));
    hold(f, BTN.interact, this.isDown('interact'));
    if (this.take('attack')) press(f, PRESS.attack);
    if (this.take('special')) press(f, PRESS.special);
    if (this.take('dash')) press(f, PRESS.dash);
    if (this.take('interact')) press(f, PRESS.interact);
    return f;
  }

  private trackMouse(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - r.left;
    this.mouseY = e.clientY - r.top;
    this.hasMouse = true;
  }
}
