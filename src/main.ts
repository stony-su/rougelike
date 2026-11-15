import { Application } from 'pixi.js';
import { CONTENT } from './content';
import { App } from './game/app';
import { findHost } from './game/connection';
import { Gallery } from './game/gallery';
import { Soundboard } from './game/soundboard';
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
} else if (params.has('sounds')) {
  // Development tool: every sound by name, and the beds, to listen through.
  hooks.sounds = new Soundboard(document.body);
  expose();
} else {
  const pixi = new Application();
  await pixi.init({
    background: '#061426',
    resizeTo: window,
    // Smoothed edges where a pixel of the page is a pixel of the screen. Where the screen has two or
    // more for each, they are small enough already, and smoothing them cost this game half its frames
    // on integrated graphics. (?aa=1 or ?aa=0 says otherwise, to measure.)
    antialias: params.has('aa') ? params.get('aa') !== '0' : (window.devicePixelRatio || 1) < 1.5,
    autoDensity: true,
    // Capped at 2: the canvas and every full-screen pass grow with the pixel count.
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: 'webgl',
    powerPreference: 'high-performance',
  });
  const mount = document.getElementById('app');
  if (!mount) throw new Error('Missing #app element');
  mount.appendChild(pixi.canvas);

  const galleryRig = params.get('gallery');
  if (galleryRig !== null) {
    // Development tool: every animation state of a rig as a filmstrip.
    hooks.gallery = new Gallery(pixi, {
      rig: galleryRig || 'all',
      away: params.has('away'),
      silhouette: params.has('silhouette'),
      live: params.has('live'),
    });
  } else {
    // ?class=bow plays one class alone; ?team=sword,bow,fist adds bot companions in the other seats
    const classes = (params.get('team') ?? params.get('class') ?? 'sword')
      .split(',')
      .map((c) => c.trim())
      .filter((c): c is 'sword' | 'bow' | 'fist' => c === 'sword' || c === 'bow' || c === 'fist');
    if (classes.length === 0) classes.push('sword');
    // A page served by the host program can join its lobby. Anything else (the dev server, a
    // plain preview, or ?solo on a hosted page) is a game alone.
    const host = params.has('solo') ? null : await findHost();
    // An address that names a class, a team, a chamber or a bot skips the title: it begins a run
    // alone at once, or on a hosted page sits down in the lobby. Otherwise the game opens on its title.
    const direct = ['class', 'team', 'autopilot', 'practice', 'stop', 'stress', 'seats', 'tunings'].some((k) => params.has(k));
    // ?tunings=ringing-edge:3,chorus begins holding those (development: to see what a Tuning does)
    const tunings: Record<string, number> = {};
    for (const part of (params.get('tunings') ?? '').split(',')) {
      const [id, rank] = part.trim().split(':');
      if (id) tunings[id] = Math.max(1, Number(rank) || 1);
    }
    const app = new App(pixi, {
      debug: params.has('debug'),
      seed: params.get('seed') ?? String(Math.floor(Math.random() * 1e9)),
      fixedSeed: params.has('seed'),
      autopilot: params.get('autopilot') ?? '',
      classes,
      stress: Number(params.get('stress') ?? 0) || 0,
      backdrop: !params.has('nobackdrop'),
      host: host ? { addresses: host.addresses } : null,
      name: params.get('name') ?? '',
      autoStart: Number(params.get('seats') ?? 0) || 0,
      direct,
      practice: params.has('practice'),
      startAt: Number(params.get('stop') ?? 1) || 1,
      tunings: params.has('tunings') ? tunings : null,
    });
    hooks.app = app;
    Object.defineProperty(hooks, 'game', { get: () => app.game, enumerable: true });
    hooks.state = () => app.debugState();
    hooks.toScreen = (x: number, y: number) => app.worldToScreen(x, y);
  }
  // Test and tooling hooks. Only present with ?debug or ?gallery in the URL.
  if (params.has('debug') || galleryRig !== null) expose();
}

if (import.meta.hot) {
  import.meta.hot.accept(() => window.location.reload());
}
