import { Application } from 'pixi.js';
import { Gallery } from './game/gallery';
import { Game } from './game/game';
import { Lab } from './game/lab';

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
const labScreen = params.get('lab');
if (galleryRig !== null) {
  // Development tool: every animation state of a rig as a filmstrip.
  const gallery = new Gallery(app, {
    rig: galleryRig || 'all',
    away: params.has('away'),
    silhouette: params.has('silhouette'),
    live: params.has('live'),
  });
  hooks.gallery = gallery;
} else if (labScreen !== null) {
  // Development tool: one modal screen on its own.
  const lab = new Lab(app, {
    screen: labScreen || 'draft',
    kit: (params.get('kit') ?? '').split(',').filter(Boolean),
    chalk: Number(params.get('chalk') ?? 120) || 0,
    hp: Number(params.get('hp') ?? 100) || 100,
    seed: params.get('seed') ?? 'lab',
  });
  hooks.lab = lab;
  hooks.state = () => lab.state();
} else {
  const game = new Game(app, {
    debug: params.has('debug'),
    seed: params.get('seed') ?? String(Math.floor(Math.random() * 1e9)),
    autopilot: params.get('autopilot') ?? '',
    stress: Number(params.get('stress') ?? 0) || 0,
    sheet: Number(params.get('sheet') ?? 0) || 0,
    room: params.get('room') ?? '',
    kit: (params.get('kit') ?? '').split(',').filter(Boolean),
    chalk: Number(params.get('chalk') ?? 0) || 0,
  });
  hooks.game = game;
  hooks.state = () => game.debugState();
  hooks.toScreen = (x: number, y: number) => game.worldToScreen(x, y);
}

if (params.has('debug') || galleryRig !== null || labScreen !== null) {
  // Test and tooling hooks. Only present with ?debug, ?gallery or ?lab in the URL.
  (window as unknown as { __snapline: unknown }).__snapline = hooks;
}

if (import.meta.hot) {
  import.meta.hot.accept(() => window.location.reload());
}
