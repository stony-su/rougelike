// Textures generated in code, once, and shared. No image files anywhere in the game.
import { BufferImageSource, FillGradient, Graphics, Rectangle, Texture } from 'pixi.js';
import type { Renderer } from 'pixi.js';

function radial(stops: Array<[number, string]>): FillGradient {
  return new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.5 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    colorStops: stops.map(([offset, color]) => ({ offset, color })),
    textureSpace: 'local',
  });
}

export class Textures {
  /** A soft round dot: white core falling off to nothing. For glows, motes, sparks. */
  readonly soft: Texture;
  /** A hard-edged disc with a slightly soft rim. For crisp particles. */
  readonly disc: Texture;
  /** A thin ring. For ripples and shockwaves. */
  readonly ring: Texture;
  /** Darkening toward the corners. Stretched over the screen. */
  readonly vignette: Texture;
  /** A small square shard for paper and ink scraps. */
  readonly shard: Texture;
  /** A horizontal streak, bright in the middle, tapering to both ends. */
  readonly streak: Texture;

  private readonly made: Texture[] = [];

  constructor(private readonly renderer: Renderer) {
    this.soft = this.bake(
      new Graphics().rect(0, 0, 64, 64).fill(
        radial([
          [0, '#ffffffff'],
          [0.35, '#ffffff99'],
          [0.7, '#ffffff22'],
          [1, '#ffffff00'],
        ]),
      ),
      64,
      64,
    );
    this.disc = this.bake(new Graphics().circle(16, 16, 14).fill(0xffffff), 32, 32);
    this.ring = this.bake(new Graphics().circle(64, 64, 58).stroke({ width: 5, color: 0xffffff }), 128, 128);
    this.vignette = this.vignetteTexture(160, 0.6, 0.62);
    this.shard = this.bake(new Graphics().poly([2, 1, 13, 3, 11, 13, 1, 10]).fill(0xffffff), 14, 14);
    this.streak = this.bake(new Graphics().poly([0, 4, 20, 2.4, 44, 0.5, 64, 4, 44, 7.5, 20, 5.6]).fill(0xffffff), 64, 8);
  }

  /**
   * Darkening toward the corners, built from raw pixels. (A radial FillGradient fills the area
   * under the gradient with its last colour stop, so it cannot fade to a transparent centre.)
   */
  private vignetteTexture(size: number, start: number, strength: number): Texture {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5) / size - 0.5;
        const dy = (y + 0.5) / size - 0.5;
        // 0 at the centre, 1 at the corners
        const d = Math.hypot(dx, dy) / Math.SQRT1_2;
        const t = Math.min(1, Math.max(0, (d - start) / (1.02 - start)));
        const a = t * t * (3 - 2 * t) * strength;
        data[(y * size + x) * 4 + 3] = Math.round(a * 255);
      }
    }
    const source = new BufferImageSource({ resource: data, width: size, height: size, format: 'rgba8unorm', scaleMode: 'linear' });
    const t = new Texture({ source });
    this.made.push(t);
    return t;
  }

  private bake(g: Graphics, w: number, h: number, resolution = 2): Texture {
    const t = this.renderer.generateTexture({
      target: g,
      frame: new Rectangle(0, 0, w, h),
      resolution,
      antialias: true,
    });
    g.destroy();
    this.made.push(t);
    return t;
  }

  destroy(): void {
    for (const t of this.made) t.destroy(true);
    this.made.length = 0;
  }
}
