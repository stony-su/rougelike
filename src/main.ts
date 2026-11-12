import { Application } from 'pixi.js';
import { Gallery } from './game/gallery';
import { Game } from './game/game';

const params = new URLSearchParams(window.location.search);

const app = new Application();
await app.init({
  background: '#061426',
  resizeTo: window,
  antialias: true,
  autoDensity: true,
  // Capped at 2: full-screen glow passes scale with pixel count.
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  preference: 'webgl',
  powerPreference: 'high-performance',
});
const mount = document.getElementById('app');
if (!mount) throw new Error('Missing #app element');
mount.appendChild(app.canvas);

const hooks: Record<string, unknown> = {};
const galleryRig = params.get('gallery');
if (galleryRig !== null) {
  // Development tool: every animation state of a rig as a filmstrip.
  const gallery = new Gallery(app, {
    rig: galleryRig || 'all',
    away: params.has('away'),
    silhouette: params.has('silhouette'),
    live: params.has('live'),
  });
  hooks.gallery = gallery;
} else {
  const game = new Game(app, {
    debug: params.has('debug'),
    seed: params.get('seed') ?? String(Math.floor(Math.random() * 1e9)),
    autopilot: params.get('autopilot') ?? '',
    stress: Number(params.get('stress') ?? 0) || 0,
  });
  hooks.game = game;
  hooks.state = () => game.debugState();
  hooks.toScreen = (x: number, y: number) => game.worldToScreen(x, y);
}

if (params.has('debug') || galleryRig !== null) {
  // Test and tooling hooks. Only present with ?debug or ?gallery in the URL.
  (window as unknown as { __snapline: unknown }).__snapline = hooks;
}

if (import.meta.hot) {
  import.meta.hot.accept(() => window.location.reload());
}
