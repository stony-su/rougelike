// The things in a room that are not fighters: the reward, the doors and where they lead, Chalk
// on the floor, and the fixtures of the quiet rooms (the tent, the pillar, the rival's stake).
import { Container, Graphics, GraphicsContext, Sprite } from 'pixi.js';
import { ISO_COS, ISO_SIN, TILE, depthKey, projX, projY } from '../core/iso';
import { lerp } from '../core/math';
import type { RoomKind } from '../sim/defs';
import type { Interactable } from '../sim/flow';
import type { World } from '../sim/types';
import { mapChip } from '../ui/cards';
import type { Camera } from './camera';
import type { Sortable } from './depth';
import { CHALK, DANGER, HERO, INK, PAPER, RIM, RIPE } from './palette';
import type { ZoneTheme } from './palette';
import type { Stage } from './stage';
import type { Textures } from './textures';

const T = TILE;

/** What a door's pennant says about the room behind it. */
export const DOOR_WORD: Record<string, string> = {
  combat: 'Fight',
  elite: 'Elite fight',
  shop: 'Tally Tent',
  rest: 'Trig Pillar',
  event: 'Disputed Claim',
  miniboss: 'The Counterclaim',
  boss: 'Point Zero',
  tutorial: 'Onward',
};

const PROMPT: Record<string, string> = {
  reward: 'F   Requisition',
  shop: 'F   Tally Tent',
  rest: 'F   Trig Pillar',
  event: 'F   Disputed Claim',
};

/** A little sign drawn in strokes for each kind of room, in a 24 x 24 box centred on the origin. */
function doorIcon(kind: RoomKind, elite: boolean): Graphics {
  const g = new Graphics();
  const s = { width: 2.6, color: 0xffffff, cap: 'round' as const, join: 'round' as const };
  switch (kind) {
    case 'combat':
      g.moveTo(-8, -8).lineTo(8, 8).moveTo(8, -8).lineTo(-8, 8).stroke(s);
      if (elite) g.circle(0, 0, 11).stroke(s);
      break;
    case 'shop':
      g.moveTo(-10, 8).lineTo(0, -9).lineTo(10, 8).closePath().stroke(s).moveTo(0, -9).lineTo(0, 8).stroke(s);
      break;
    case 'rest':
      g.rect(-5, -9, 10, 18).stroke(s).moveTo(-9, 9).lineTo(9, 9).stroke(s);
      break;
    case 'event':
      g.moveTo(0, 10).lineTo(0, -8).lineTo(9, -4).lineTo(0, 0).stroke(s).circle(0, 10, 1).stroke(s);
      break;
    case 'miniboss':
      g.moveTo(0, -10).lineTo(-10, 9).moveTo(0, -10).lineTo(10, 9).moveTo(0, -10).lineTo(0, 9).stroke(s).circle(0, -10, 3).stroke(s);
      break;
    case 'boss':
      g.circle(0, 0, 8).stroke(s).moveTo(-12, 0).lineTo(12, 0).moveTo(0, -12).lineTo(0, 12).stroke(s);
      break;
    default:
      g.moveTo(-8, 0).lineTo(8, 0).moveTo(2, -6).lineTo(8, 0).lineTo(2, 6).stroke(s);
  }
  return g;
}

const ctxCache = new Map<string, GraphicsContext>();
function ctx(key: string, build: (c: GraphicsContext) => void): GraphicsContext {
  let c = ctxCache.get(key);
  if (!c) {
    c = new GraphicsContext();
    build(c);
    ctxCache.set(key, c);
  }
  return c;
}

/** A gate on a far edge: two posts, a lintel, and a pennant. `along` is the world direction the edge runs. */
function gate(alongX: boolean): GraphicsContext {
  return ctx(`gate:${alongX}`, (c) => {
    const half = 0.52;
    const ax = alongX ? half : 0;
    const ay = alongX ? 0 : half;
    const p0x = projX(-ax, -ay);
    const p0y = projY(-ax, -ay);
    const p1x = projX(ax, ay);
    const p1y = projY(ax, ay);
    const h = 1.5 * T;
    const post = (x: number, y: number): void => {
      c.poly([x - 4, y, x + 4, y, x + 4, y - h, x - 4, y - h]).fill(0xffffff);
    };
    post(p0x, p0y);
    post(p1x, p1y);
    c.poly([p0x - 6, p0y - h, p1x + 6, p1y - h, p1x + 6, p1y - h - 9, p0x - 6, p0y - h - 9]).fill(0xffffff);
  });
}

interface View {
  kind: string;
  c: Container;
  sort: Sortable;
  glow: Sprite | null;
  ring: Graphics | null;
  chip: Container | null;
  born: number;
  seen: number;
}

export class FlowView {
  private readonly views = new Map<number, View>();
  private readonly pickups: Array<{ s: Sprite; g: Sprite }> = [];
  private readonly prompt: Container;
  private promptText = '';
  private frame = 0;
  private theme: ZoneTheme;

  constructor(
    private readonly stage: Stage,
    private readonly textures: Textures,
    theme: ZoneTheme,
  ) {
    this.theme = theme;
    this.prompt = new Container();
    this.prompt.visible = false;
    stage.ui.addChild(this.prompt);
  }

  setTheme(theme: ZoneTheme): void {
    this.theme = theme;
  }

  update(w: World, cam: Camera, alpha: number, dt: number, time: number): void {
    this.frame++;
    const f = w.flow;
    const out = { x: 0, y: 0 };

    for (const it of f.interactables) {
      if (!it.active && it.kind !== 'door') continue;
      let v = this.views.get(it.id);
      if (!v) {
        v = this.make(w, it, time);
        this.views.set(it.id, v);
      }
      v.seen = this.frame;
      const age = time - v.born;
      const pop = age < 0.35 ? 1 + Math.sin((age / 0.35) * Math.PI) * 0.25 : 1;
      const sx = projX(it.x, it.y);
      const sy = projY(it.x, it.y);
      if (v.kind === 'reward') {
        // the requisition floats and turns slowly
        const bob = Math.sin(time * 2.2) * 5;
        v.c.position.set(sx, sy - 34 + bob);
        v.c.rotation = Math.sin(time * 1.3) * 0.08;
        v.c.scale.set(pop);
        if (v.glow) {
          v.glow.position.set(sx, sy - 34 + bob);
          v.glow.alpha = 0.55 + 0.25 * Math.sin(time * 4);
        }
      } else {
        v.c.position.set(sx, sy);
        v.c.scale.set(pop);
        if (v.glow) v.glow.position.set(sx, sy - 70);
      }
      if (v.ring) {
        v.ring.position.set(it.x * T, it.y * T);
        v.ring.scale.set(1 + 0.12 * Math.sin(time * 3));
        v.ring.alpha = 0.5 + 0.3 * Math.sin(time * 3);
      }
      if (v.chip) {
        cam.worldToScreen(it.x, it.y, v.kind === 'door' ? 1.95 : 0, out);
        v.chip.position.set(Math.round(out.x), Math.round(out.y));
        v.chip.alpha = Math.min(1, age / 0.4);
      }
      v.sort.depth = depthKey(it.x, it.y);
    }
    for (const [id, v] of this.views) {
      if (v.seen === this.frame) continue;
      this.destroyView(v);
      this.views.delete(id);
    }

    // Chalk on the floor
    let n = 0;
    for (const c of f.pickups) {
      let pv = this.pickups[n];
      if (!pv) {
        const s = new Sprite(this.textures.shard);
        s.anchor.set(0.5);
        s.tint = RIM;
        this.stage.fxCrisp.addChild(s);
        const g = new Sprite(this.textures.soft);
        g.anchor.set(0.5);
        g.tint = RIPE;
        this.stage.fxGlow.addChild(g);
        pv = { s, g };
        this.pickups.push(pv);
      }
      n++;
      const x = lerp(c.px, c.x, alpha);
      const y = lerp(c.py, c.y, alpha);
      // a small hop as it lands, then it lies on the floor until it flies home
      const hop = c.homing ? 0.35 : Math.max(0, Math.sin(Math.min(1, c.age / 0.4) * Math.PI)) * 0.5;
      const sx = projX(x, y);
      const sy = projY(x, y, hop + 0.08);
      pv.s.visible = true;
      pv.s.position.set(sx, sy);
      pv.s.rotation = c.id * 1.7 + (c.homing ? time * 9 : 0);
      pv.s.scale.set(c.value >= 5 ? 1.25 : 0.85);
      pv.g.visible = true;
      pv.g.position.set(sx, sy);
      pv.g.scale.set(c.value >= 5 ? 0.5 : 0.34);
      pv.g.alpha = 0.55 + 0.2 * Math.sin(time * 6 + c.id);
    }
    for (let i = n; i < this.pickups.length; i++) {
      this.pickups[i].s.visible = false;
      this.pickups[i].g.visible = false;
    }

    // the prompt over whatever is in reach
    const near = f.near ? f.interactables.find((i) => i.id === f.near) : undefined;
    if (near && PROMPT[near.kind]) {
      const text = PROMPT[near.kind];
      if (text !== this.promptText) {
        this.prompt.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.prompt.addChild(mapChip(text));
        this.promptText = text;
      }
      cam.worldToScreen(near.x, near.y, 1.9, out);
      this.prompt.position.set(Math.round(out.x), Math.round(out.y + Math.sin(time * 5) * 3));
      this.prompt.visible = true;
    } else {
      this.prompt.visible = false;
    }
    void dt;
  }

  clear(): void {
    for (const v of this.views.values()) this.destroyView(v);
    this.views.clear();
    for (const p of this.pickups) {
      p.s.visible = false;
      p.g.visible = false;
    }
    this.prompt.visible = false;
  }

  destroy(): void {
    this.clear();
    for (const p of this.pickups) {
      p.s.destroy();
      p.g.destroy();
    }
    this.prompt.destroy({ children: true });
  }

  private destroyView(v: View): void {
    this.stage.depth.remove(v.sort);
    v.c.destroy({ children: true });
    v.glow?.destroy();
    v.ring?.destroy();
    v.chip?.destroy({ children: true });
  }

  private make(w: World, it: Interactable, time: number): View {
    const c = new Container();
    let glow: Sprite | null = null;
    let ring: Graphics | null = null;
    let chip: Container | null = null;
    const th = this.theme;

    if (it.kind === 'reward') {
      // a rolled sheet, sealed: the requisition
      const g = new Graphics()
        .roundRect(-22, -9, 44, 18, 4).fill(PAPER)
        .roundRect(-22, -9, 44, 18, 4).stroke({ width: 2, color: INK })
        .ellipse(-22, 0, 5, 9).fill(RIM).ellipse(-22, 0, 5, 9).stroke({ width: 2, color: INK })
        .ellipse(22, 0, 5, 9).fill(RIM).ellipse(22, 0, 5, 9).stroke({ width: 2, color: INK })
        .rect(-4, -10, 8, 20).fill(CHALK).rect(-4, -10, 8, 20).stroke({ width: 1.5, color: INK });
      c.addChild(g);
      glow = new Sprite(this.textures.soft);
      glow.anchor.set(0.5);
      glow.tint = CHALK;
      glow.scale.set(1.9);
      this.stage.fxGlow.addChild(glow);
      ring = new Graphics().circle(0, 0, 0.7 * T).stroke({ width: 3, color: 0xffffff });
      ring.tint = CHALK;
      this.stage.decals.addChild(ring);
    } else if (it.kind === 'door') {
      const slot = w.flow.doors[it.index] ?? { kind: 'combat' as RoomKind, elite: false };
      const door = w.room.doors[it.index % Math.max(1, w.room.doors.length)];
      const alongX = !door || door.side === 'north';
      const frame = new Graphics(gate(alongX));
      frame.tint = th.stoneTop;
      c.addChild(frame);
      // the way through glows chalk: it is open, and it is yours to take
      const sill = new Graphics().circle(0, 0, 0.5 * T).fill({ color: 0xffffff, alpha: 0.22 });
      sill.tint = CHALK;
      ring = sill;
      this.stage.decals.addChild(ring);
      // pennant with the sign of what lies beyond
      const boss = slot.kind === 'boss' || slot.kind === 'miniboss' || slot.elite;
      const pennant = new Graphics().poly([-17, -148, 17, -148, 17, -112, 0, -102, -17, -112]).fill(boss ? DANGER : CHALK).poly([-17, -148, 17, -148, 17, -112, 0, -102, -17, -112]).stroke({ width: 2, color: INK, join: 'round' });
      const icon = doorIcon(slot.kind, slot.elite);
      icon.tint = INK;
      icon.position.set(0, -128);
      c.addChild(pennant, icon);
      glow = new Sprite(this.textures.soft);
      glow.anchor.set(0.5);
      glow.tint = boss ? DANGER : CHALK;
      glow.scale.set(2.2);
      glow.alpha = 0.5;
      this.stage.fxGlow.addChild(glow);
      chip = mapChip(DOOR_WORD[slot.elite && slot.kind === 'combat' ? 'elite' : slot.kind] ?? 'Onward');
      this.stage.ui.addChild(chip);
    } else if (it.kind === 'shop') {
      // the Tally Tent: a ridge tent with a striped awning and a counter
      const g = new Graphics()
        .poly([-46, 0, 0, -78, 46, 0]).fill(HERO.coat)
        .poly([0, -78, 46, 0, 12, 0]).fill(HERO.coatShade)
        .poly([-46, 0, 0, -78, 46, 0]).stroke({ width: 2.5, color: INK, join: 'round' })
        .poly([-12, 0, 0, -44, 12, 0]).fill(INK)
        .rect(-58, -6, 30, 10).fill(HERO.satchel).rect(-58, -6, 30, 10).stroke({ width: 2, color: INK })
        .moveTo(0, -78).lineTo(0, -98).stroke({ width: 2.5, color: INK })
        .poly([0, -98, 20, -92, 0, -86]).fill(CHALK);
      c.addChild(g);
      ring = new Graphics().circle(0, 0, 1.1 * T).stroke({ width: 2, color: 0xffffff });
      ring.tint = CHALK;
      this.stage.decals.addChild(ring);
    } else if (it.kind === 'rest') {
      // the Trig Pillar: a squat concrete pillar with a brass plate on top
      const g = new Graphics()
        .poly([-20, 0, 20, 0, 14, -64, -14, -64]).fill(th.stoneLeft)
        .poly([4, 0, 20, 0, 14, -64, 4, -64]).fill(th.stoneRight)
        .poly([-14, -64, 14, -64, 10, -72, -10, -72]).fill(th.stoneTop)
        .poly([-20, 0, 20, 0, 14, -64, 10, -72, -10, -72, -14, -64]).stroke({ width: 2.5, color: INK, join: 'round' })
        .circle(0, -68, 5).fill(CHALK).circle(0, -68, 5).stroke({ width: 1.5, color: INK })
        .rect(-9, -40, 18, 12).fill(HERO.rodBand).rect(-9, -40, 18, 12).stroke({ width: 1.5, color: INK });
      c.addChild(g);
      ring = new Graphics().circle(0, 0, 1.1 * T).stroke({ width: 2, color: 0xffffff });
      ring.tint = CHALK;
      this.stage.decals.addChild(ring);
    } else {
      // the rival's stake: black, with a red pennant. Pull it at your own risk.
      const g = new Graphics()
        .poly([-3.5, -52, 3.5, -52, 3, -4, 0, 5, -3, -4]).fill(INK)
        .poly([-3.5, -52, 3.5, -52, 3, -4, 0, 5, -3, -4]).stroke({ width: 1.5, color: RIM, alpha: 0.7 })
        .poly([3.5, -52, 28, -52, 20, -44, 28, -36, 3.5, -36]).fill(DANGER)
        .poly([3.5, -52, 28, -52, 20, -44, 28, -36, 3.5, -36]).stroke({ width: 1.5, color: INK, join: 'round' });
      c.addChild(g);
      ring = new Graphics().circle(0, 0, 1.0 * T).stroke({ width: 2.5, color: 0xffffff });
      ring.tint = DANGER;
      this.stage.decals.addChild(ring);
    }
    const sort = this.stage.depth.add(c, depthKey(it.x, it.y), it.kind === 'door' ? -0.4 : 0);
    void ISO_COS;
    void ISO_SIN;
    return { kind: it.kind, c, sort, glow, ring, chip, born: time, seen: this.frame };
  }
}
