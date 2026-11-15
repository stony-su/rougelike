// The Whirlwind's wake: while a Sword's blade is going round, a bright crescent sweeps the floor
// at the reach of the cut, its head where the blade is and its tail fading behind it. It is drawn
// from the Sword's own clock, so it stops with the Sword on a hit and lands where the rig faces.
import { Graphics } from 'pixi.js';
import { TILE } from '../../core/iso';
import { DT, WHIRL } from '../../sim/tuning';
import type { Player } from '../../sim/types';
import { PLAYER_COLORS, PLAYER_PALE, RIM, WHITE } from '../palette';
import type { ExtraFactory } from './index';

/** How much of the circle the wake trails behind the blade, in radians, and how many slices it is drawn in. */
const SPAN = 4.4;
const SLICES = 22;
/** How wide the wake is at its head, as a share of its reach. */
const WIDTH = 0.34;
/** Seconds the wake takes to fade once the blade has come round. */
const FADE = 0.14;

interface Wake {
  g: Graphics;
  fade: number;
}

/** How far round the blade is, in turns, or -1 while it is not going round. */
function turned(p: Player, alpha: number): number {
  if (p.classId !== 'sword' || p.state !== 'special') return -1;
  const turns = Math.max(1, Math.round((p.actDur - WHIRL.windup - WHIRL.recovery) / WHIRL.spin));
  // between two ticks the picture stands part of the way on, unless the Sword is held by a hit
  const t = p.stateTime + (p.freeze > 0 ? 0 : alpha * DT) - WHIRL.windup;
  if (t < 0 || t >= WHIRL.spin * turns) return -1;
  return t / WHIRL.spin;
}

const whirlwind: ExtraFactory = ({ stage }) => {
  const wakes = new Map<number, Wake>();
  const wakeOf = (slot: number): Wake => {
    let k = wakes.get(slot);
    if (!k) {
      const g = new Graphics();
      g.blendMode = 'add';
      g.visible = false;
      stage.decals.addChild(g);
      k = { g, fade: 0 };
      wakes.set(slot, k);
    }
    return k;
  };

  /** A crescent from `head` back round the circle, widest at the head. */
  const draw = (g: Graphics, slot: number, head: number, reach: number, span: number): void => {
    const r = reach * TILE;
    const color = PLAYER_COLORS[slot] ?? RIM;
    const pale = PLAYER_PALE[slot] ?? RIM;
    g.clear();
    for (let i = 0; i < SLICES; i++) {
      const k0 = i / SLICES;
      const k1 = (i + 1) / SLICES;
      const a0 = head - span * k0;
      const a1 = head - span * k1;
      // it thins and fades toward the tail
      const w0 = r * WIDTH * (1 - k0) * (1 - k0);
      const w1 = r * WIDTH * (1 - k1) * (1 - k1);
      g.poly([Math.cos(a0) * r, Math.sin(a0) * r, Math.cos(a1) * r, Math.sin(a1) * r, Math.cos(a1) * (r - w1), Math.sin(a1) * (r - w1), Math.cos(a0) * (r - w0), Math.sin(a0) * (r - w0)]).fill({
        color,
        alpha: 0.55 * (1 - k0),
      });
    }
    // the edge itself: a bright rim along the leading third, and the blade as a line from the Sword to its tip
    const lead = span * 0.34;
    g.moveTo(Math.cos(head - lead) * r, Math.sin(head - lead) * r)
      .arc(0, 0, r, head - lead, head)
      .stroke({ width: 0.09 * TILE, color: pale, alpha: 0.95, cap: 'round' });
    g.moveTo(Math.cos(head) * r * 0.25, Math.sin(head) * r * 0.25)
      .lineTo(Math.cos(head) * r, Math.sin(head) * r)
      .stroke({ width: 0.07 * TILE, color: WHITE, alpha: 0.85, cap: 'round' });
  };

  return {
    room() {
      for (const k of wakes.values()) {
        k.fade = 0;
        k.g.visible = false;
      }
    },
    update(dt, w, alpha) {
      for (const p of w.players) {
        const turn = turned(p, alpha);
        if (turn < 0) continue;
        const k = wakeOf(p.slot);
        // the second turn of two goes wider
        const reach = (WHIRL.radius + p.mods.whirlReach) * (turn >= 1 ? WHIRL.second : 1);
        const x = p.px + (p.x - p.px) * alpha;
        const y = p.py + (p.y - p.py) * alpha;
        k.g.position.set(x * TILE, y * TILE);
        // the wake grows out of the blade as it sets off, and is whole by a third of the way round
        draw(k.g, p.slot, p.actAngle + turn * Math.PI * 2, reach, SPAN * Math.min(1, turn * 3));
        k.g.alpha = 1;
        k.g.visible = true;
        k.fade = 1 + dt / FADE;
      }
      for (const k of wakes.values()) {
        if (k.fade <= 0) continue;
        k.fade -= dt / FADE;
        if (k.fade <= 0) k.g.visible = false;
        else if (k.fade < 1) k.g.alpha = k.fade;
      }
    },
    destroy() {
      for (const k of wakes.values()) k.g.destroy();
      wakes.clear();
    },
  };
};

export default whirlwind;
