// Which loop is heard when. Each zone has a bed (beds.ts) that plays under everything while the
// party is in that zone; when a boss shows itself the zone's pulse joins it and the bed steps
// back a little. Moving from one zone to the next, one bed sinks as the other rises.
//
// Plain logic, kept apart from the audio so it can be tested without a browser: it only ever
// tells a LoopPlayer how loud each loop should be. engine.ts is the player in the game.
import type { ZoneId } from '../sim/defs';
import { renderBed, renderPulse } from './beds';
import type { Loop } from './beds';

/** What plays the loops: the engine, or a stand-in in a test. */
export interface LoopPlayer {
  /**
   * Bring the loop called `id` to `level` (0..1) over about `seconds`, making it with `make` the
   * first time. False if sound has not started yet: nothing was done, ask again later.
   */
  setLoop(id: string, make: () => Loop, level: number, seconds: number): boolean;
}

/** Seconds a bed takes to come or go, and a pulse. */
export const BED_FADE = 3;
export const PULSE_FADE = 1.2;
/** A bed's level while the pulse plays over it. */
export const BED_UNDER_PULSE = 0.6;
/**
 * A boss fight is never silent. If nothing at all has happened for this many seconds, the fight
 * is over however it ended (the party fell, the run was left), and the pulse stops.
 */
export const BOSS_QUIET = 6;

const ZONES: readonly ZoneId[] = ['outer', 'inner', 'crater'];

export class Music {
  private zone: ZoneId | null = null;
  private boss = false;
  private on = true;
  /** Seconds since anything happened in the chamber. */
  private quiet = 0;
  /** True while what should be heard has not reached the player yet. */
  private stale = false;
  /** The loops that have been started, so that they can be brought down again. */
  private readonly started = new Set<string>();

  constructor(private readonly player: LoopPlayer) {}

  /** The party is in a chamber of this zone. A new chamber has no boss until one shows itself. */
  setZone(zone: ZoneId): void {
    if (zone !== this.zone || this.boss) this.stale = true;
    this.zone = zone;
    this.boss = false;
  }

  /** A boss is on the floor, or is gone. */
  setBoss(boss: boolean): void {
    this.quiet = 0;
    if (boss === this.boss) return;
    this.boss = boss;
    this.stale = true;
  }

  /** Beds on or off altogether. */
  setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.stale = true;
  }

  /** Something happened in the chamber. */
  heard(): void {
    this.quiet = 0;
  }

  /** Once a frame. */
  update(dt: number): void {
    if (this.boss) {
      this.quiet += dt;
      if (this.quiet >= BOSS_QUIET) this.setBoss(false);
    }
    if (this.stale) this.stale = !this.apply();
  }

  /** Tell the player how loud every loop should be now. False if it could not take it yet. */
  private apply(): boolean {
    let taken = true;
    for (const zone of ZONES) {
      const here = this.on && zone === this.zone;
      taken = this.level(`bed:${zone}`, () => renderBed(zone), here ? (this.boss ? BED_UNDER_PULSE : 1) : 0, BED_FADE) && taken;
      taken = this.level(`pulse:${zone}`, () => renderPulse(zone), here && this.boss ? 1 : 0, PULSE_FADE) && taken;
    }
    return taken;
  }

  private level(id: string, make: () => Loop, level: number, seconds: number): boolean {
    // a loop nobody has heard yet is not made just to be kept silent
    if (level <= 0 && !this.started.has(id)) return true;
    if (!this.player.setLoop(id, make, level, seconds)) return false;
    this.started.add(id);
    return true;
  }
}
