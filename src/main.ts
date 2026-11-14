import { Application } from 'pixi.js';
import { CONTENT } from './content';
import { Gallery } from './game/gallery';
import { Game } from './game/game';
import { selftestHashes, selftestMath } from './sim/selftest';

const params = new URLSearchParams(window.location.search);
const hooks: Record<string, unknown> = {};
const expose = (): void => {
  (window as unknown as { __resound: unknown }).__resound = hooks;
};

if (params.has('selftest')) {
  // Development check: play the pinned game in this browser's engine and report its hashes, so
  // scripts/selftest.mjs can compare them with the ones the tests pin in Node.
  const t0 = performance.now();
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, selftestMath());
  const math = view.getUint32(0).toString(16).padStart(8, '0') + view.getUint32(4).toString(16).padStart(8, '0');
  const result = { hashes: selftestHashes(CONTENT), math, ms: Math.round(performance.now() - t0) };
  hooks.selftest = result;
  expose();
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(result, null, 2);
  document.body.appendChild(pre);
} else {
  const app = new Application();
  await app.init({
    background: '#061426',
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    // Capped at 2: the canvas and every full-screen pass grow with the pixel count.
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: 'webgl',
    powerPreference: 'high-performance',
  });
  const mount = document.getElementById('app');
  if (!mount) throw new Error('Missing #app element');
  mount.appendChild(app.canvas);

  const galleryRig = params.get('gallery');
  if (galleryRig !== null) {
    // Development tool: every animation state of a rig as a filmstrip.
    hooks.gallery = new Gallery(app, {
      rig: galleryRig || 'all',
      away: params.has('away'),
      silhouette: params.has('silhouette'),
      live: params.has('live'),
    });
  } else {
    const game = new Game(app, {
      debug: params.has('debug'),
      seed: params.get('seed') ?? String(Math.floor(Math.random() * 1e9)),
      autopilot: params.get('autopilot') ?? '',
      // ?class=bow plays one class alone; ?team=sword,bow,fist adds bot companions in the other seats
      classes: (params.get('team') ?? params.get('class') ?? 'sword')
        .split(',')
        .map((c) => c.trim())
        .filter((c): c is 'sword' | 'bow' | 'fist' => c === 'sword' || c === 'bow' || c === 'fist'),
      stress: Number(params.get('stress') ?? 0) || 0,
    });
    hooks.game = game;
    hooks.state = () => game.debugState();
    hooks.toScreen = (x: number, y: number) => game.worldToScreen(x, y);
  }
  // Test and tooling hooks. Only present with ?debug or ?gallery in the URL.
  if (params.has('debug') || galleryRig !== null) expose();
}

if (import.meta.hot) {
  import.meta.hot.accept(() => window.location.reload());
}
