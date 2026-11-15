// Markers at the edge of the screen. The camera follows this laptop's player, so things happen
// where it is not looking: a teammate across the chamber, a Piper taking aim from off screen, a
// shot already on its way. A small chevron at the screen's edge points to each: in the
// teammate's own colour for a teammate (it beats while they are down), in the danger colour for
// a threat. Nothing on screen gets one.
import { Container, Graphics } from 'pixi.js';
import { DANGER, INK, PLAYER_COLORS, RIM, WHITE } from '../palette';
import type { ExtraFactory } from './index';

/** Markers that can show at once: two teammates, and the nearest threats. */
const POOL = 10;
/** How far inside the screen's edge a marker sits, in pixels. */
const INSET = 34;
/** Something this far inside the edge already counts as on screen. */
const SEEN = 12;
/** A shot is pointed at only if it is flying toward this player and will pass this near, in tiles. */
const NEAR_MISS = 2.5;

interface Marker {
  root: Container;
  shape: Graphics;
  ring: Graphics;
}

/** How big a marker is drawn: its shapes are laid out for 1. */
const SIZE = 1.3;

const edgeMarkers: ExtraFactory = ({ stage, camera, localSlot }) => {
  const layer = new Container();
  stage.overlay.addChild(layer);
  const markers: Marker[] = [];
  for (let i = 0; i < POOL; i++) {
    const root = new Container();
    // a dark disc behind, so that it reads over a floor full of warnings
    const back = new Graphics().circle(-1, 0, 19).fill({ color: INK, alpha: 0.62 });
    // a chevron pointing along +x, drawn once and turned and tinted from then on
    const shape = new Graphics().poly([13, 0, -7, -10, -2, 0, -7, 10]).fill({ color: WHITE });
    const ring = new Graphics().circle(-1, 0, 17).stroke({ width: 2, color: WHITE, alpha: 0.7 });
    root.addChild(back, ring, shape);
    root.visible = false;
    layer.addChild(root);
    markers.push({ root, shape, ring });
  }
  let viewW = 0;
  let viewH = 0;
  const at = { x: 0, y: 0 };

  return {
    room() {
      for (const m of markers) m.root.visible = false;
    },
    resize(width, height) {
      viewW = width;
      viewH = height;
    },
    update(_dt, w, alpha, time) {
      let used = 0;
      /** Point at a place in the chamber, if it is off screen. `beat` 0..1 makes it throb. */
      const point = (x: number, y: number, z: number, color: number, beat: number, ringed: boolean): void => {
        if (used >= POOL || viewW <= 0) return;
        camera.worldToScreen(x, y, z, at);
        if (at.x >= SEEN && at.x <= viewW - SEEN && at.y >= SEEN && at.y <= viewH - SEEN) return;
        const cx = viewW / 2;
        const cy = viewH / 2;
        const dx = at.x - cx;
        const dy = at.y - cy;
        // out from the middle of the screen along the line to it, as far as the inset edge
        const k = Math.min((cx - INSET) / Math.max(1e-6, Math.abs(dx)), (cy - INSET) / Math.max(1e-6, Math.abs(dy)));
        const m = markers[used++];
        m.root.position.set(cx + dx * k, cy + dy * k);
        m.root.rotation = Math.atan2(dy, dx);
        m.root.scale.set(SIZE * (1 + 0.18 * beat));
        m.root.alpha = 0.82 + 0.18 * beat;
        m.shape.tint = color;
        m.ring.tint = color;
        m.ring.visible = ringed;
        m.root.visible = true;
      };

      const me = w.players.find((p) => p.slot === localSlot());
      const throb = 0.5 + 0.5 * Math.sin(time * 9);

      // teammates: always, wherever they are
      for (const p of w.players) {
        if (p === me) continue;
        const down = p.state === 'down';
        point(p.px + (p.x - p.px) * alpha, p.py + (p.y - p.py) * alpha, 0.6, PLAYER_COLORS[p.slot] ?? RIM, down ? throb : 0, true);
      }

      // an Echo taking aim: something is about to be shot or thrown from where the player cannot see
      for (const e of w.enemies) {
        if (e.dead || e.state !== 'windup' || e.move < 0) continue;
        const kind = e.def.moves[e.move]?.action.kind;
        if (kind !== 'volley' && kind !== 'lob') continue;
        point(e.x, e.y, 0.5, DANGER, throb, false);
      }

      // a shot on its way to this player
      if (me) {
        for (const pr of w.projectiles) {
          if (pr.dead || pr.faction !== 'enemy') continue;
          const sp = Math.hypot(pr.vx, pr.vy);
          if (sp < 1e-6) continue;
          const ux = pr.vx / sp;
          const uy = pr.vy / sp;
          const along = (me.x - pr.x) * ux + (me.y - pr.y) * uy;
          const across = Math.abs(-(me.x - pr.x) * uy + (me.y - pr.y) * ux);
          if (along <= 0 || across > NEAR_MISS) continue;
          point(pr.x, pr.y, 0.5, DANGER, 1, false);
        }
      }

      for (let i = used; i < POOL; i++) markers[i].root.visible = false;
    },
    destroy() {
      layer.destroy({ children: true });
    },
  };
};

export default edgeMarkers;
