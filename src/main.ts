// API spike (milestone 0): proves the PixiJS v8 building blocks the engine relies on.
// Replaced by the real boot code in milestone a.
import {
  Application,
  BitmapFont,
  BitmapText,
  BlurFilter,
  Container,
  Graphics,
  GraphicsContext,
  Rectangle,
  Sprite,
  Texture,
} from 'pixi.js';

const app = new Application();
await app.init({
  background: '#061426',
  resizeTo: window,
  antialias: true,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  preference: 'webgl',
  powerPreference: 'high-performance',
});
document.getElementById('app')!.appendChild(app.canvas);

const U = 44;
const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

function makeGround(): { outer: Container; inner: Container } {
  const outer = new Container();
  outer.scale.set(U * Math.SQRT2 * COS30, U * Math.SQRT2 * SIN30);
  const inner = new Container();
  inner.rotation = Math.PI / 4;
  outer.addChild(inner);
  return { outer, inner };
}

const world = new Container();
world.position.set(app.screen.width / 2, app.screen.height / 2 - 160);
app.stage.addChild(world);

// 1. Baked floor in ground space.
const floor = makeGround();
const tiles = new Graphics();
for (let y = 0; y < 12; y++) {
  for (let x = 0; x < 12; x++) {
    tiles.rect(x, y, 1, 1).fill((x + y) % 2 === 0 ? 0x0e2a47 : 0x0c2540);
  }
}
for (let i = 0; i <= 12; i++) {
  tiles.moveTo(i, 0).lineTo(i, 12).moveTo(0, i).lineTo(12, i);
}
tiles.stroke({ width: 0.03, color: 0x2f6f9f, alpha: 0.7 });
tiles.circle(6, 6, 3).stroke({ width: 0.05, color: 0x6fb4e0, alpha: 0.9 });
floor.inner.addChild(tiles);
world.addChild(floor.outer);
floor.outer.cacheAsTexture({ resolution: 2, antialias: true });

// 2. Lines as stretched sprites: crisp core + blurred additive glow twin.
function lineSprite(ax: number, ay: number, bx: number, by: number, width: number, tint: number): Sprite {
  const s = new Sprite(Texture.WHITE);
  s.anchor.set(0, 0.5);
  s.position.set(ax, ay);
  s.rotation = Math.atan2(by - ay, bx - ax);
  s.width = Math.hypot(bx - ax, by - ay);
  s.height = width;
  s.tint = tint;
  return s;
}
const stakes: Array<[number, number]> = [
  [2.5, 3],
  [9, 4],
  [5, 10],
];
const crisp = makeGround();
const glow = makeGround();
for (let i = 0; i < 3; i++) {
  const a = stakes[i]!;
  const b = stakes[(i + 1) % 3]!;
  const ripe = i === 0;
  crisp.inner.addChild(lineSprite(a[0], a[1], b[0], b[1], ripe ? 0.09 : 0.05, ripe ? 0xfff6d8 : 0xffd75e));
  glow.inner.addChild(lineSprite(a[0], a[1], b[0], b[1], ripe ? 0.32 : 0.16, ripe ? 0xfff6d8 : 0xffd75e));
}
const glowLayer = new Container();
glowLayer.addChild(glow.outer);
const blur = new BlurFilter({ strength: 10, quality: 3, resolution: 0.5 });
blur.blendMode = 'add';
glowLayer.filters = [blur];
glowLayer.filterArea = new Rectangle(0, 0, app.screen.width, app.screen.height);
world.addChild(crisp.outer);
app.stage.addChild(glowLayer);
glow.outer.position.copyFrom(world.position);
crisp.outer.blendMode = 'add';

// 3. Shared white GraphicsContext, coloured by tint (rig part recipe).
const bodyCtx = new GraphicsContext().poly([-14, 0, 14, 0, 10, -46, -10, -46]).fill(0xffffff);
const headCtx = new GraphicsContext().ellipse(0, -56, 16, 7).fill(0xffffff);
const tints = [0xd9cdb4, 0x3a4466, 0xffffff];
stakes.forEach(([x, y], i) => {
  const rig = new Container();
  const body = new Graphics(bodyCtx);
  body.tint = tints[i]!;
  const head = new Graphics(headCtx);
  head.tint = i === 2 ? 0xffffff : 0x26303c;
  rig.addChild(body, head);
  rig.position.set((x - y) * COS30 * U, (x + y) * SIN30 * U);
  rig.zIndex = x + y;
  world.addChild(rig);
});
world.sortableChildren = true;

// 4. BitmapText for fast-changing numbers.
BitmapFont.install({
  name: 'spike',
  style: { fontFamily: 'monospace', fontSize: 28, fill: '#ffffff' },
  chars: [['0', '9'], ' .:FPSfps'],
});
const fps = new BitmapText({ text: 'fps', style: { fontFamily: 'spike', fontSize: 28 } });
fps.position.set(16, 12);
app.stage.addChild(fps);

let frames = 0;
let acc = 0;
app.ticker.add((ticker) => {
  frames++;
  acc += ticker.deltaMS;
  if (acc >= 500) {
    fps.text = `fps ${Math.round((frames * 1000) / acc)}`;
    frames = 0;
    acc = 0;
  }
});

const gl = (app.renderer as unknown as { gl?: WebGLRenderingContext }).gl;
const ext = gl?.getExtension('WEBGL_debug_renderer_info');
const rendererName = gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
(window as unknown as Record<string, unknown>).__spike = { ok: true, renderer: rendererName };
console.info('[spike] ready', rendererName);
