// A controller that answers: it rumbles when this laptop's player is hurt, harder for a heavier
// blow, and gives a short knock when something they sent back lands. What an event feels like is
// worked out here from the event alone, so it is tested without a controller; the browser is
// only asked to play it.
import type { SimEvent } from '../sim/types';

export interface Buzz {
  /** How long, in milliseconds. */
  ms: number;
  /** The light, fast motor and the heavy, slow one: 0 to 1 each. */
  weak: number;
  strong: number;
}

const buzz = (ms: number, weak: number, strong: number): Buzz => ({ ms, weak: Math.min(1, weak), strong: Math.min(1, strong) });

/** What an event feels like in the hands of the player in seat `slot`, or null if they feel nothing. */
export function buzzFor(ev: SimEvent, slot: number): Buzz | null {
  switch (ev.type) {
    case 'playerHurt':
      // a graze is a tick, a heavy blow shakes the hands
      return ev.player === slot ? buzz(120 + ev.amount * 6, 0.35 + ev.amount / 40, 0.2 + ev.amount / 28) : null;
    case 'playerDown':
      return ev.player === slot ? buzz(520, 1, 1) : null;
    case 'hit':
      if (ev.by !== slot) return null;
      return ev.heavy || ev.crit || ev.killed ? buzz(90, 0.5, 0.3) : buzz(45, 0.25, 0);
    case 'reflect':
      return ev.player === slot ? (ev.perfect ? buzz(140, 0.7, 0.5) : buzz(60, 0.4, 0.1)) : null;
    case 'haymaker':
      return ev.player === slot ? buzz(110 + 120 * ev.charge, 0.5, 0.4 + 0.5 * ev.charge) : null;
    case 'breakSlam':
      return ev.player === slot ? buzz(180, 0.6, 0.8) : null;
    case 'wallSlam':
      return ev.by === slot && ev.speed > 6 ? buzz(70, 0.3, Math.min(0.6, ev.speed / 30)) : null;
    case 'carom':
      return ev.by === slot ? buzz(60, 0.35, 0.2) : null;
    case 'bossPhase':
      // everyone in the chamber feels a boss change
      return buzz(420, 0.6, 0.9);
    default:
      return null;
  }
}

/** The part of a controller that rumbles, as browsers offer it. */
interface Actuator {
  playEffect(type: string, params: { duration: number; startDelay?: number; weakMagnitude: number; strongMagnitude: number }): Promise<unknown>;
}

export class Rumble {
  /** Switched on in the settings. */
  enabled = true;
  /** When what is playing now will be over, and how strong it is: a lighter knock does not cut a heavier one short. */
  private until = 0;
  private level = 0;

  /** Play what this event feels like on the controller in use, if there is one and it can. */
  handle(ev: SimEvent, slot: number, pad: Gamepad | null | undefined, nowMs: number): void {
    if (!this.enabled || !pad) return;
    const b = buzzFor(ev, slot);
    if (!b) return;
    const level = Math.max(b.weak, b.strong);
    if (nowMs < this.until && level < this.level) return;
    const actuator = (pad as unknown as { vibrationActuator?: Actuator }).vibrationActuator;
    if (!actuator || typeof actuator.playEffect !== 'function') return;
    this.until = nowMs + b.ms;
    this.level = level;
    try {
      // a controller that cannot do it, or a browser that refuses, is simply quiet
      void actuator.playEffect('dual-rumble', { duration: Math.round(b.ms), weakMagnitude: b.weak, strongMagnitude: b.strong }).catch(() => undefined);
    } catch {
      this.until = 0;
    }
  }
}
