// With a camera that follows you, a chamber is bigger than the screen: a teammate can be out of
// sight, and so can the Piper that is about to play at you. Small markers at the screen's edge
// point to what you cannot see: teammates in their own colour, threats (an Echo winding up a
// shot, a shot on its way in, a bomb's circle) in the danger colour. Whatever shows on the
// screen, even partly, has no marker.
import { Container, Graphics, GraphicsContext, Sprite } from 'pixi.js';
import { ISO_COS, ISO_SIN, TILE } from '../../core/iso';
import { clamp, clamp01, lerp } from '../../core/math';
import type { Vec2 } from '../../core/math';
import { DANGER, DANGER_HOT, INK, PLAYER_COLORS, PLAYER_PALE, RIM, WHITE } from '../palette';
import type { ExtraFactory } from './index';

/** Teammates besides yourself: a party is three at most. */
const MATES = 2;
/** Threats pointed to at once. When there are more, the ones nearest the screen keep their markers. */
const THREATS = 8;
/** The screen height the sizes below are drawn for; markers grow and shrink with the screen. */
const REF_HEIGHT = 760;
/** How far in from the screen's edge a marker sits. */
const INSET = 30;
/** A marker fades in over this many pixels as the thing it points to leaves the screen. */
const FADE = 42;
/** Two threat markers closer together than this read as one smudge: the nearer threat keeps its own. */
const CROWD = 24;
/**
 * How much room a standing body (a player, an Echo) and a shot take up round their spot on the
 * floor, in tiles: half their width, how far they reach up the screen, and how far down. Feet
 * past the bottom edge do not make a body off screen while its head still shows.
 */
const BODY = { wide: 0.45, up: 1.3, down: 0.2 };
const SHOT = { wide: 0.3, up: 0.7, down: 0.1 };

type ThreatKind = 'windup' | 'shot' | 'bomb';

interface MateMarker {
  root: Container;
  body: Graphics;
  core: Sprite;
}

interface ThreatMarker {
  root: Container;
  ring: Sprite;
  hot: Graphics;
}

/** A threat that is off screen, and where its marker would go. */
interface Spot {
  x: number;
  y: number;
  angle: number;
  /** How far past the edge of the screen it is, in pixels. */
  over: number;
  kind: ThreatKind;
  /** 0..1: how close it is to going off (a wind-up nearly done, a fuse nearly burnt). */
  urgency: number;
}

const edgeMarkers: ExtraFactory = ({ stage, camera, textures, localSlot }) => {
  // Every marker is drawn pointing along +x and turned toward what it marks. The shapes are
  // drawn once, in white, and shared: each marker tints its own copy.
  const mateShape = new GraphicsContext().circle(0, 0, 8).fill(WHITE).poly([10, -6, 19, 0, 10, 6]).fill(WHITE);
  const mateBack = new GraphicsContext().circle(0, 0, 10.5).fill(WHITE).poly([7.5, -9.5, 23.5, 0, 7.5, 9.5]).fill(WHITE);
  const threatShape = new GraphicsContext().poly([-8, -10, 13, 0, -8, 10, -3, 0]).fill(WHITE);
  const threatBack = new GraphicsContext().poly([-12, -15, 18, 0, -12, 15, -6, 0]).fill(WHITE);
  const threatHot = new GraphicsContext().poly([-4, -5.5, 8, 0, -4, 5.5, -1.5, 0]).fill(WHITE);
  const shapes = [mateShape, mateBack, threatShape, threatBack, threatHot];

  const shape = (context: GraphicsContext, tint: number, alpha = 1): Graphics => {
    const g = new Graphics(context);
    g.tint = tint;
    g.alpha = alpha;
    return g;
  };

  const layer = new Container();
  layer.label = 'edgeMarkers';
  stage.overlay.addChild(layer);

  const mates: MateMarker[] = [];
  for (let i = 0; i < MATES; i++) {
    const root = new Container();
    root.label = 'mate';
    root.visible = false;
    const body = shape(mateShape, WHITE);
    const core = new Sprite(textures.disc);
    core.anchor.set(0.5);
    core.scale.set(0.25);
    root.addChild(shape(mateBack, INK, 0.75), body, core);
    layer.addChild(root);
    mates.push({ root, body, core });
  }

  const threats: ThreatMarker[] = [];
  for (let i = 0; i < THREATS; i++) {
    const root = new Container();
    root.label = 'threat';
    root.visible = false;
    // a bomb's marker wears a ring, the circle it will burst in
    const ring = new Sprite(textures.ring);
    ring.anchor.set(0.5);
    ring.scale.set(0.33);
    ring.tint = DANGER;
    const hot = shape(threatHot, DANGER_HOT);
    root.addChild(ring, shape(threatBack, INK, 0.75), shape(threatShape, DANGER), hot);
    layer.addChild(root);
    threats.push({ root, ring, hot });
  }

  const spots: Spot[] = [];
  for (let i = 0; i < THREATS; i++) spots.push({ x: 0, y: 0, angle: 0, over: 0, kind: 'shot', urgency: 0 });
  let count = 0;
  let viewW = 0;
  let viewH = 0;
  /** The size of a marker on this screen, as a multiple of its drawn size. */
  let unit = 1;
  const at: Vec2 = { x: 0, y: 0 };
  const ahead: Vec2 = { x: 0, y: 0 };
  /** What `locate` found. */
  const found = { x: 0, y: 0, angle: 0, over: 0 };

  /**
   * Where the marker goes for something at (wx, wy) on the floor that takes up `wide` tiles to
   * either side, `up` tiles above and `down` tiles below on the screen. False if any of it shows;
   * otherwise `found` holds the spot at the edge, the way to point, and how far out the thing is.
   */
  const locate = (wx: number, wy: number, wide: number, up: number, down: number): boolean => {
    camera.worldToScreen(wx, wy, 0, at);
    const px = TILE * camera.zoom;
    const over = Math.max(-(at.x + wide * px), at.x - wide * px - viewW, -(at.y + down * px), at.y - up * px - viewH);
    if (over <= 0) return false;
    const inset = INSET * unit;
    found.x = clamp(at.x, inset, viewW - inset);
    found.y = clamp(at.y, inset, viewH - inset);
    found.angle = Math.atan2(at.y - found.y, at.x - found.x);
    found.over = over;
    return true;
  };

  /** Note a threat, if it is off screen. `spots` keeps the nearest ones, nearest first. */
  const offer = (wx: number, wy: number, wide: number, up: number, down: number, kind: ThreatKind, urgency: number): void => {
    if (!locate(wx, wy, wide, up, down)) return;
    if (count === THREATS && found.over >= spots[count - 1].over) return;
    let i = count < THREATS ? count++ : count - 1;
    const spot = spots[i];
    for (; i > 0 && spots[i - 1].over > found.over; i--) spots[i] = spots[i - 1];
    spots[i] = spot;
    spot.x = found.x;
    spot.y = found.y;
    spot.angle = found.angle;
    spot.over = found.over;
    spot.kind = kind;
    spot.urgency = urgency;
  };

  const hide = (): void => {
    for (const m of mates) m.root.visible = false;
    for (const t of threats) t.root.visible = false;
  };

  return {
    room() {
      hide();
    },
    resize(width, height) {
      viewW = width;
      viewH = height;
      unit = clamp(height / REF_HEIGHT, 0.85, 1.7);
    },
    update(_dt, w, alpha, time) {
      if (viewW <= 0 || viewH <= 0) return;
      const me = localSlot();

      let used = 0;
      for (const p of w.players) {
        if (p.slot === me || used >= MATES) continue;
        if (!locate(lerp(p.px, p.x, alpha), lerp(p.py, p.y, alpha), BODY.wide, BODY.up, BODY.down)) continue;
        const m = mates[used++];
        // a teammate who is down is calling for you: their marker beats, and its heart turns red
        const down = p.state === 'down';
        const beat = down ? 0.5 + 0.5 * Math.sin(time * 9) : 0;
        m.root.position.set(found.x, found.y);
        m.root.rotation = found.angle;
        m.root.scale.set(unit * (1 + 0.16 * beat));
        m.root.alpha = clamp01(found.over / (FADE * unit));
        m.body.tint = PLAYER_COLORS[p.slot] ?? RIM;
        m.core.tint = down ? DANGER : (PLAYER_PALE[p.slot] ?? WHITE);
        m.root.visible = true;
      }
      for (let i = used; i < MATES; i++) mates[i].root.visible = false;

      count = 0;
      for (const e of w.enemies) {
        if (e.state !== 'windup' || e.move < 0) continue;
        const action = e.def.moves[e.move]?.action;
        if (!action || (action.kind !== 'volley' && action.kind !== 'lob')) continue;
        offer(lerp(e.px, e.x, alpha), lerp(e.py, e.y, alpha), BODY.wide, BODY.up, BODY.down, 'windup', e.stateDur > 0 ? clamp01(e.stateTime / e.stateDur) : 1);
      }
      const midX = viewW / 2;
      const midY = viewH / 2;
      for (const s of w.projectiles) {
        if (s.dead || s.faction !== 'enemy') continue;
        const x = lerp(s.px, s.x, alpha);
        const y = lerp(s.py, s.y, alpha);
        // only a shot on its way in: one flying off into the distance threatens nobody here
        camera.worldToScreen(x, y, 0, at);
        camera.worldToScreen(x + s.vx, y + s.vy, 0, ahead);
        if ((ahead.x - at.x) * (midX - at.x) + (ahead.y - at.y) * (midY - at.y) <= 0) continue;
        offer(x, y, SHOT.wide, SHOT.up, SHOT.down, 'shot', 1);
      }
      for (const b of w.bombs) {
        if (b.dead || b.by >= 0) continue;
        // the threat is the circle on the floor: where the bomb will land while it is in the air
        const flying = b.state === 'fly';
        const x = flying ? b.toX : lerp(b.px, b.x, alpha);
        const y = flying ? b.toY : lerp(b.py, b.y, alpha);
        // a circle on the floor is an ellipse on the screen
        const wide = b.radius * Math.SQRT2 * ISO_COS;
        const tall = b.radius * Math.SQRT2 * ISO_SIN;
        offer(x, y, wide, tall, tall, 'bomb', b.state === 'fuse' && b.dur > 0 ? clamp01(b.t / b.dur) : 0);
      }

      let shown = 0;
      for (let i = 0; i < count; i++) {
        const spot = spots[i];
        let crowded = false;
        for (let j = 0; j < shown && !crowded; j++) {
          const other = threats[j].root.position;
          crowded = Math.hypot(other.x - spot.x, other.y - spot.y) < CROWD * unit;
        }
        if (crowded) continue;
        const t = threats[shown++];
        // it flashes faster and brighter as the moment comes; a shot in flight is a small steady dart
        const beat = 0.5 + 0.5 * Math.sin(time * (7 + 11 * spot.urgency));
        const steady = spot.kind === 'shot';
        t.root.position.set(spot.x, spot.y);
        t.root.rotation = spot.angle;
        t.root.scale.set(unit * (steady ? 0.72 : 1 + 0.12 * beat));
        t.root.alpha = clamp01(spot.over / (FADE * unit));
        t.hot.alpha = steady ? 0.85 : (0.25 + 0.75 * spot.urgency) * beat;
        t.ring.visible = spot.kind === 'bomb';
        t.root.visible = true;
      }
      for (let i = shown; i < THREATS; i++) threats[i].root.visible = false;
    },
    destroy() {
      layer.destroy({ children: true });
      for (const s of shapes) s.destroy();
      mates.length = 0;
      threats.length = 0;
    },
  };
};

export default edgeMarkers;
