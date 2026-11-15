// A controller, reduced to what the game needs. Pure: it takes the plain numbers a Gamepad
// reports (axes and buttons in the browser's standard layout) and knows nothing of the browser,
// so the mapping is tested headless and a scripted fake controller drives the real game.
//
//   move      left stick            aim       right stick (or the way you are moving)
//   attack    right trigger, RB     special   left trigger, LB
//   dash      A                     interact  X
//   pause     Start                 menus     stick or d-pad, A to confirm, B to go back
//   what your kit does (held)       View (the small button left of Start)

export interface PadState {
  axes: readonly number[];
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
}

export interface PadRead {
  /** Left stick in screen space (x right, y down), dead zone removed, length 0..1. */
  moveX: number;
  moveY: number;
  /** Right stick in screen space, dead zone removed, length 0..1. */
  aimX: number;
  aimY: number;
  /** The right stick is out of its dead zone. */
  aiming: boolean;
  attack: boolean;
  special: boolean;
  dash: boolean;
  interact: boolean;
  /** Held: show what the kit does. */
  info: boolean;
  pause: boolean;
  /** Menu direction (-1, 0 or 1 on each axis), from the d-pad or the left stick. */
  menuX: number;
  menuY: number;
  confirm: boolean;
  back: boolean;
  /** Anything at all is being pressed or pushed: this is the device in use. */
  active: boolean;
}

export const emptyPad = (): PadRead => ({
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 0,
  aiming: false,
  attack: false,
  special: false,
  dash: false,
  interact: false,
  info: false,
  pause: false,
  menuX: 0,
  menuY: 0,
  confirm: false,
  back: false,
  active: false,
});

/** Inside this much of the middle a stick reads as centred; the rest is stretched back to 0..1. */
export const STICK_DEAD = 0.22;
/** A trigger counts as pulled past this. */
export const TRIGGER_ON = 0.35;

/** Indices in the browser's standard gamepad layout. */
const B = { a: 0, b: 1, x: 2, lb: 4, rb: 5, lt: 6, rt: 7, view: 8, start: 9, up: 12, down: 13, left: 14, right: 15 } as const;

/** A stick with a round dead zone: nothing near the middle, full at the edge, direction kept. */
function stick(x: number, y: number, out: { x: number; y: number }): void {
  const l = Math.hypot(x, y);
  if (!Number.isFinite(l) || l <= STICK_DEAD) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const k = Math.min(1, (l - STICK_DEAD) / (1 - STICK_DEAD)) / l;
  out.x = x * k;
  out.y = y * k;
}

export function readPad(pad: PadState, out: PadRead): PadRead {
  const ax = (i: number): number => pad.axes[i] ?? 0;
  const held = (i: number): boolean => {
    const b = pad.buttons[i];
    return b ? b.pressed || b.value > TRIGGER_ON : false;
  };
  const v = { x: 0, y: 0 };
  stick(ax(0), ax(1), v);
  out.moveX = v.x;
  out.moveY = v.y;
  stick(ax(2), ax(3), v);
  out.aimX = v.x;
  out.aimY = v.y;
  out.aiming = v.x !== 0 || v.y !== 0;
  out.attack = held(B.rt) || held(B.rb);
  out.special = held(B.lt) || held(B.lb);
  out.dash = held(B.a);
  out.interact = held(B.x);
  out.info = held(B.view);
  out.pause = held(B.start);
  out.confirm = held(B.a);
  out.back = held(B.b);
  out.menuX = (held(B.right) || out.moveX > 0.6 ? 1 : 0) - (held(B.left) || out.moveX < -0.6 ? 1 : 0);
  out.menuY = (held(B.down) || out.moveY > 0.6 ? 1 : 0) - (held(B.up) || out.moveY < -0.6 ? 1 : 0);
  out.active = out.moveX !== 0 || out.moveY !== 0 || out.aiming || out.attack || out.special || out.dash || out.interact || out.pause || out.back || out.menuX !== 0 || out.menuY !== 0;
  return out;
}

/** How far away a stick aims: a light push aims close, a full one at the end of the longest line the Bow can fire. */
export const padAimDistance = (magnitude: number): number => 2 + 11 * Math.max(0, Math.min(1, magnitude));

/** A stick cannot point as finely as a mouse, so its aim leans toward a target close to its line. */
export const ASSIST = {
  /** Targets further off the aim than this (radians) are left alone. */
  cone: 0.3,
  /** And those further away than this (tiles). */
  range: 11,
  /** How much of the way to the target the aim is pulled when the target is dead ahead. */
  pull: 0.75,
};

/**
 * Lean an aim angle toward the best target near its line. `targets` is a flat list of x, y pairs.
 * The pull is strongest for a target almost on the line and fades to nothing at the edge of the
 * cone, so the stick still chooses between two targets and the aim never jumps.
 */
export function assistAim(angle: number, fromX: number, fromY: number, targets: readonly number[]): number {
  let best = 0;
  let bestScore = 0;
  for (let i = 0; i + 1 < targets.length; i += 2) {
    const dx = targets[i] - fromX;
    const dy = targets[i + 1] - fromY;
    const d = Math.hypot(dx, dy);
    if (d < 0.4 || d > ASSIST.range) continue;
    let off = Math.atan2(dy, dx) - angle;
    off -= Math.round(off / (Math.PI * 2)) * Math.PI * 2;
    const a = Math.abs(off);
    if (a > ASSIST.cone) continue;
    // nearest the line first, then nearest the player
    const score = (1 - a / ASSIST.cone) * (1 - (d / ASSIST.range) * 0.5);
    if (score > bestScore) {
      bestScore = score;
      best = off * ASSIST.pull * (1 - a / ASSIST.cone);
    }
  }
  return angle + best;
}

// ---------------------------------------------------------------- which controller, and can it be trusted

/** The buttons whose presses the game acts on, for press edges. */
export const PAD_ACTIONS = ['attack', 'special', 'dash', 'interact', 'pause', 'confirm', 'back'] as const;
export type PadAction = (typeof PAD_ACTIONS)[number];

interface PadMemory {
  /** A stick counts only once it has been seen at rest: one that has never been centred is stuck, drifting, or lying on its side. */
  sticks: [boolean, boolean];
  /** The same for buttons: one held down since before the page opened is ignored until it is let go. */
  armed: boolean[];
  last: PadRead;
  seen: boolean;
}

/**
 * Reads every controller the browser reports and decides which one is in use: the one on which
 * something last CHANGED. A controller left on a shelf with its stick pushed over, or one that
 * drifts, never changes, so it never takes the game away from the hands actually playing.
 */
export class PadReader {
  /** The controller in use (its place in the list), or -1 if none has been touched. */
  current = -1;
  /** Something changed on a controller during the last poll. */
  touched = false;
  /** Buttons that went down on the controller in use during the last poll. */
  readonly pressed = new Set<PadAction>();
  /** Menu steps taken during the last poll: -1, 0 or 1 on each axis, once per push. */
  stepX = 0;
  stepY = 0;
  private readonly memory: PadMemory[] = [];
  private readonly clean = { axes: [0, 0, 0, 0], buttons: [] as Array<{ pressed: boolean; value: number }> };
  private readonly read = emptyPad();

  /** Read the controllers. Returns what the one in use says now, or null if none is in use. */
  poll(pads: ReadonlyArray<PadState | null | undefined>): PadRead | null {
    this.pressed.clear();
    this.stepX = 0;
    this.stepY = 0;
    this.touched = false;
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || pad.axes.length < 2) continue;
      let m = this.memory[i];
      if (!m) {
        m = { sticks: [false, false], armed: [], last: emptyPad(), seen: false };
        this.memory[i] = m;
      }
      // Only what has been seen at rest is passed on.
      for (let k = 0; k < 2; k++) {
        const x = pad.axes[k * 2] ?? 0;
        const y = pad.axes[k * 2 + 1] ?? 0;
        const l = Math.hypot(x, y);
        if (!m.sticks[k] && Number.isFinite(l) && l <= STICK_DEAD) m.sticks[k] = true;
        this.clean.axes[k * 2] = m.sticks[k] ? x : 0;
        this.clean.axes[k * 2 + 1] = m.sticks[k] ? y : 0;
      }
      this.clean.buttons.length = 0;
      for (let b = 0; b < pad.buttons.length; b++) {
        const btn = pad.buttons[b];
        const down = btn.pressed || btn.value > TRIGGER_ON;
        if (!m.armed[b] && !down) m.armed[b] = true;
        this.clean.buttons.push(m.armed[b] ? btn : { pressed: false, value: 0 });
      }
      const now = readPad(this.clean, this.read);
      const was = m.last;
      // Did anything change? A button going down, or a stick leaving its rest.
      let changed = false;
      for (const a of PAD_ACTIONS) if (now[a] && !was[a]) changed = true;
      if ((now.moveX !== 0 || now.moveY !== 0) && was.moveX === 0 && was.moveY === 0) changed = true;
      if (now.aiming && !was.aiming) changed = true;
      if ((now.menuX !== 0 && was.menuX === 0) || (now.menuY !== 0 && was.menuY === 0)) changed = true;
      if (changed && m.seen) {
        this.current = i;
        this.touched = true;
      }
      if (i === this.current) {
        for (const a of PAD_ACTIONS) if (now[a] && !was[a]) this.pressed.add(a);
        if (now.menuX !== 0 && was.menuX === 0) this.stepX = now.menuX;
        if (now.menuY !== 0 && was.menuY === 0) this.stepY = now.menuY;
      }
      Object.assign(m.last, now);
      m.seen = true;
    }
    const cur = this.current >= 0 ? this.memory[this.current] : undefined;
    const live = this.current >= 0 ? pads[this.current] : null;
    if (!cur || !live) {
      this.current = -1;
      return null;
    }
    return cur.last;
  }
}
