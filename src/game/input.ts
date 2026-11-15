// Devices: keyboard and mouse, and a controller. Both end as the same integer input frame that
// travels to the relay: held buttons, one press counter per button, movement as a direction, and
// aim as an angle and a distance from the player. Whichever device was touched last decides where
// movement and aim come from; buttons count from either.
import { screenDirToWorld } from '../core/iso';
import type { Vec2 } from '../core/math';
import type { Camera } from '../render/camera';
import { hold, press, setAim, setMove } from '../sim/input';
import { BTN, PRESS, emptyInput } from '../sim/types';
import type { InputFrame } from '../sim/types';
import { PadReader, assistAim, padAimDistance } from './gamepad';
import type { PadAction, PadRead } from './gamepad';

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
  // held: what your kit does, in words, over the fight
  info: ['Tab'],
  confirm: ['Enter', 'Space', 'KeyF'],
  back: ['Escape', 'Backspace'],
} as const;

export type Action = keyof typeof BINDINGS;
export type Device = 'keys' | 'pad';

export interface MenuKeys {
  dx: number;
  dy: number;
  confirm: boolean;
  back: boolean;
  /** A number key pressed this frame (1 to 9), or 0. */
  digit: number;
}

export const noKeys = (): MenuKeys => ({ dx: 0, dy: 0, confirm: false, back: false, digit: 0 });

/** Keys the browser must not act on while the game has focus. */
const SWALLOW = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote']);

export class Input {
  mouseX = 0;
  mouseY = 0;
  /** True once the mouse has moved, so aim is not stuck at (0, 0) before the first move. */
  hasMouse = false;
  /** The key that shows what the player's kit does is down (Tab, or View on a controller). */
  info = false;
  /** The device touched last: prompts show its glyphs, and movement and aim come from it. */
  device: Device = 'keys';
  /** A key or a button has been pressed at least once (browsers hold sound back until then). */
  touched = false;

  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly dir: Vec2 = { x: 0, y: 0 };
  private readonly aim: Vec2 = { x: 0, y: 0 };
  private readonly frameOut: InputFrame = emptyInput();
  private readonly cleanup: Array<() => void> = [];
  private readonly pads = new PadReader();
  private readonly padPressed = new Set<PadAction>();
  /** Where the controller last aimed, kept while the stick rests. */
  private padAngle = -Math.PI / 2;
  private padDist = 4;

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
      this.device = 'keys';
      this.touched = true;
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
      this.device = 'keys';
      this.touched = true;
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
    this.padPressed.clear();
  }

  /** Forget presses not yet consumed, keeping what is held (a menu opened or closed). */
  clearPresses(): void {
    this.pressed.clear();
    this.padPressed.clear();
  }

  isDown(action: Action): boolean {
    for (const code of BINDINGS[action]) if (this.down.has(code)) return true;
    return false;
  }

  /** True once per press, on either device; consumes the press. */
  take(action: Action): boolean {
    let hit = false;
    for (const code of BINDINGS[action]) {
      if (this.pressed.delete(code)) hit = true;
    }
    if (this.padPressed.delete(action as PadAction)) hit = true;
    return hit;
  }

  /** True once per press of a raw key code; consumes the press. */
  takeCode(code: string): boolean {
    return this.pressed.delete(code);
  }

  /**
   * Read the controllers. The one in use is the one on which something last changed, and it
   * takes over from the keyboard only at that moment: a controller lying idle, even with a stick
   * stuck over, never does.
   */
  private pollPad(): PadRead | null {
    const list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const read = this.pads.poll(list);
    for (const a of this.pads.pressed) this.padPressed.add(a);
    if (this.pads.touched) {
      this.device = 'pad';
      this.touched = true;
    }
    return read;
  }

  /**
   * This laptop's input as it will be sent. Called once per rendered frame; gameplay press edges
   * are consumed here and become counter bumps, so a tap is never lost and never counted twice.
   * Aim is measured from where the player is drawn right now. `targets` (x, y pairs) are what a
   * controller's aim may lean toward; the mouse needs no such help.
   */
  frame(cam: Camera, playerX: number, playerY: number, targets: readonly number[] = []): InputFrame {
    const f = this.frameOut;
    const pad = this.pollPad();
    const byPad = pad !== null && this.device === 'pad';

    if (byPad && pad) {
      const m = Math.hypot(pad.moveX, pad.moveY);
      screenDirToWorld(pad.moveX, pad.moveY, this.dir);
      setMove(f, this.dir.x, this.dir.y, m);
      if (pad.aiming) {
        // the right stick aims; how far it is pushed is how far away it aims
        screenDirToWorld(pad.aimX, pad.aimY, this.aim);
        this.padAngle = Math.atan2(this.aim.y, this.aim.x);
        this.padDist = padAimDistance(Math.hypot(pad.aimX, pad.aimY));
      } else if (m > 0) {
        // with the right stick at rest, aim follows the feet
        this.padAngle = Math.atan2(this.dir.y, this.dir.x);
        this.padDist = 4;
      }
      const angle = assistAim(this.padAngle, playerX, playerY, targets);
      setAim(f, playerX, playerY, playerX + Math.cos(angle) * this.padDist, playerY + Math.sin(angle) * this.padDist);
    } else {
      const ix = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
      const iy = (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0);
      screenDirToWorld(ix, iy, this.dir);
      setMove(f, this.dir.x, this.dir.y);
      if (this.hasMouse) {
        cam.screenToWorld(this.mouseX, this.mouseY, this.aim);
        setAim(f, playerX, playerY, this.aim.x, this.aim.y);
      }
    }

    hold(f, BTN.attack, this.isDown('attack') || (pad !== null && pad.attack));
    hold(f, BTN.special, this.isDown('special') || (pad !== null && pad.special));
    hold(f, BTN.dash, this.isDown('dash') || (pad !== null && pad.dash));
    hold(f, BTN.interact, this.isDown('interact') || (pad !== null && pad.interact));
    this.info = this.isDown('info') || (pad !== null && pad.info);
    if (this.take('attack')) press(f, PRESS.attack);
    if (this.take('special')) press(f, PRESS.special);
    if (this.take('dash')) press(f, PRESS.dash);
    if (this.take('interact')) press(f, PRESS.interact);
    return f;
  }

  /**
   * The frame to send while a menu has the keys: standing still, nothing held, and no press
   * counted. Presses made meanwhile are for the menu to take, and are forgotten otherwise.
   */
  quiet(): InputFrame {
    const f = this.frameOut;
    setMove(f, 0, 0, 0);
    f.held = 0;
    return f;
  }

  /** The controller in use, as the browser has it (for what only the browser can do with it, like rumble), or null. */
  gamepad(): Gamepad | null {
    if (this.pads.current < 0 || typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    return navigator.getGamepads()[this.pads.current] ?? null;
  }

  /** Read the controllers for a menu: one step left (-1) or right (1) for each push of the stick or the d-pad. */
  menuStep(): number {
    this.pollPad();
    return this.pads.stepX;
  }

  /**
   * What a menu is being told, from either device: a step along each axis (-1, 0 or 1, once for
   * each press of a key or push of a stick), yes, and back. The presses are consumed.
   */
  menuKeys(out: MenuKeys = noKeys()): MenuKeys {
    this.pollPad();
    out.dx = (this.take('right') ? 1 : 0) - (this.take('left') ? 1 : 0) || this.pads.stepX;
    out.dy = (this.take('down') ? 1 : 0) - (this.take('up') ? 1 : 0) || this.pads.stepY;
    out.back = this.take('back');
    out.confirm = this.take('confirm');
    out.digit = 0;
    for (let n = 1; n <= 9; n++) if (this.takeCode(`Digit${n}`)) out.digit = n;
    return out;
  }

  private trackMouse(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - r.left;
    this.mouseY = e.clientY - r.top;
    this.hasMouse = true;
    // a twitch of the mouse does not take over from a controller in use; a real move does
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) this.device = 'keys';
  }
}
