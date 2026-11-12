import { Application } from 'pixi.js';
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

const game = new Game(app, {
  debug: params.has('debug'),
  seed: params.get('seed') ?? String(Math.floor(Math.random() * 1e9)),
});

if (params.has('debug')) {
  // Test and tooling hooks. Only present with ?debug in the URL.
  (window as unknown as { __snapline: unknown }).__snapline = {
    game,
    state: () => game.debugState(),
    toScreen: (x: number, y: number) => game.worldToScreen(x, y),
  };
}

if (import.meta.hot) {
  import.meta.hot.accept(() => window.location.reload());
}
