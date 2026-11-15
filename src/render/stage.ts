// The layer stack. Bottom to top:
//
//   backdrop      screen space    the void behind the sheet
//   below         camera space    baked floor, then ground decals (iso ground space)
//   lines         camera space    crisp additive line cores, telegraph edges (constant pixel thickness)
//   linesGlow     camera space    blurred additive glow twins of the lines        (one filter for the layer)
//   entities      camera space    depth-sorted upright things: rigs, props, stakes
//   fxGlow        camera space    blurred additive: sparks, halos, flashes        (one filter for the layer)
//   fxCrisp       camera space    crisp particles, damage numbers
//   overlay       screen space    vignette, paper grain, transitions
//   ui            screen space    HUD and menus
//
// "Camera space" containers all receive the same camera transform each frame.
//
// Ground decals additionally carry the isometric ground transform, so filled floor shapes
// (Plot fill, telegraph fills, shadows) are authored on the ground plane in art pixels
// (world units x TILE) and match the simulation exactly.
//
// Lines are NOT drawn inside the iso transform: it is a shear, so a stroke's thickness there
// would change with its direction, and thickness is how a ripe line is told from an unripe one.
// Line endpoints are projected and the sprite is laid between them in camera space.
//
// Filters live only on untransformed wrapper layers with filterArea = the screen, never on
// single objects and never on an ancestor of the entity layer.
import { BlurFilter, Container, Rectangle } from 'pixi.js';
import { GROUND_ROTATION, GROUND_SCALE_X, GROUND_SCALE_Y } from '../core/iso';
import type { Camera } from './camera';
import { DepthLayer } from './depth';

export interface Ground {
  /** Add this to a camera-space parent. */
  outer: Container;
  /** Add ground art (art pixels = world units x TILE) to this. */
  inner: Container;
}

/** A container pair that maps ground-plane art pixels to camera-space pixels. */
export function makeGround(): Ground {
  const outer = new Container();
  outer.scale.set(GROUND_SCALE_X, GROUND_SCALE_Y);
  const inner = new Container();
  inner.rotation = GROUND_ROTATION;
  outer.addChild(inner);
  return { outer, inner };
}

export class Stage {
  readonly root = new Container();
  readonly backdrop = new Container();
  readonly overlay = new Container();
  readonly ui = new Container({ isRenderGroup: true });

  /** Camera-space layers. */
  readonly below = new Container();
  readonly lines = new Container();
  readonly linesGlow = new Container();
  readonly entities = new Container({ isRenderGroup: true });
  /** Depth-sorted access to the entity layer. Upright things register a footprint here. */
  readonly depth = new DepthLayer(this.entities);
  readonly fxGlow = new Container();
  readonly fxCrisp = new Container();

  /** Baked floor art (camera space). */
  readonly floor = new Container();
  /** Ground-plane decals in art pixels: shadows, Plot fill, telegraph fills, sweep preview. */
  readonly decals: Container;

  private readonly linesGlowLayer = new Container();
  private readonly fxGlowLayer = new Container();
  private readonly cameraSpace: Container[];
  private readonly screenRect = new Rectangle(0, 0, 1, 1);

  constructor() {
    const decals = makeGround();
    this.decals = decals.inner;
    this.below.addChild(this.floor, decals.outer);

    this.lines.blendMode = 'add';

    this.linesGlowLayer.addChild(this.linesGlow);
    const lineBlur = new BlurFilter({ strength: 9, quality: 3, resolution: 0.5 });
    lineBlur.blendMode = 'add';
    this.linesGlowLayer.filters = [lineBlur];
    this.linesGlowLayer.filterArea = this.screenRect;

    this.fxGlowLayer.addChild(this.fxGlow);
    const fxBlur = new BlurFilter({ strength: 7, quality: 3, resolution: 0.5 });
    fxBlur.blendMode = 'add';
    this.fxGlowLayer.filters = [fxBlur];
    this.fxGlowLayer.filterArea = this.screenRect;

    this.cameraSpace = [this.below, this.lines, this.linesGlow, this.entities, this.fxGlow, this.fxCrisp];

    this.root.addChild(this.backdrop, this.below, this.lines, this.linesGlowLayer, this.entities, this.fxGlowLayer, this.fxCrisp, this.overlay, this.ui);

    for (const c of [this.backdrop, this.below, this.lines, this.linesGlowLayer, this.entities, this.fxGlowLayer, this.fxCrisp, this.overlay]) {
      c.eventMode = 'none';
      c.interactiveChildren = false;
    }
  }

  resize(width: number, height: number): void {
    this.screenRect.width = width;
    this.screenRect.height = height;
  }

  /** Give every camera-space layer the same transform. */
  applyCamera(cam: Camera): void {
    const x = cam.offsetX;
    const y = cam.offsetY;
    const z = cam.zoom;
    for (const c of this.cameraSpace) {
      c.position.set(x, y);
      c.scale.set(z);
    }
  }
}
