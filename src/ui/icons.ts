// Emblems: one small picture for each Tuning, drawn from simple shapes so a card can be told at
// a glance before a word of it is read. Each drawer fills a square of half-width `s` about the
// origin with two colours: the family's tone, and its pale for the highlight.
import type { Graphics } from 'pixi.js';

type Drawer = (g: Graphics, s: number, color: number, pale: number) => void;

/** Points on a circle, as a flat list scaled by `s`. */
function round(cx: number, cy: number, r: number, n: number, s: number, from = 0, to = Math.PI * 2): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    out.push((cx + Math.cos(a) * r) * s, (cy + Math.sin(a) * r) * s);
  }
  return out;
}
const pts = (list: readonly number[], s: number): number[] => list.map((v) => v * s);

const DRAW: Record<string, Drawer> = {
  /** Three streaks going right: speed. */
  dash(g, s, color, pale) {
    for (const [x, a, c] of [
      [-0.55, 0.45, color],
      [-0.05, 0.7, color],
      [0.45, 1, pale],
    ] as const) {
      g.poly(pts([x - 0.35, -0.6, x + 0.05, -0.6, x + 0.5, 0, x + 0.05, 0.6, x - 0.35, 0.6, x + 0.1, 0], s)).fill({ color: c, alpha: a });
    }
  },
  /** A figure and the pale shape it has just left behind. */
  ghost(g, s, color, pale) {
    const figure = (x: number, c: number, alpha: number): void => {
      g.circle(x * s, -0.42 * s, 0.24 * s).fill({ color: c, alpha });
      g.poly(pts([x - 0.34, 0.78, x - 0.22, -0.1, x + 0.22, -0.1, x + 0.34, 0.78], s)).fill({ color: c, alpha });
    };
    figure(-0.38, color, 0.35);
    figure(-0.05, color, 0.6);
    figure(0.32, pale, 1);
  },
  /** A wedge driving into a body, which gives way. */
  ram(g, s, color, pale) {
    g.poly(pts([-0.85, -0.5, -0.1, -0.5, 0.35, 0, -0.1, 0.5, -0.85, 0.5, -0.45, 0], s)).fill(pale);
    g.circle(0.55 * s, 0, 0.3 * s).fill(color);
    for (const a of [-0.9, 0, 0.9]) g.moveTo((0.55 + Math.cos(a) * 0.42) * s, Math.sin(a) * 0.42 * s).lineTo((0.55 + Math.cos(a) * 0.78) * s, Math.sin(a) * 0.78 * s);
    g.stroke({ width: Math.max(1.5, s * 0.1), color: pale, cap: 'round' });
  },
  /** Steps going down one at a time: Rally that does not fall all at once. */
  steps(g, s, color, pale) {
    g.poly(pts([-0.8, -0.7, -0.4, -0.7, -0.4, -0.25, 0, -0.25, 0, 0.2, 0.4, 0.2, 0.4, 0.65, 0.8, 0.65, 0.8, 0.82, -0.8, 0.82], s)).fill(color);
    g.moveTo(-0.8 * s, -0.7 * s)
      .lineTo(-0.4 * s, -0.7 * s)
      .stroke({ width: Math.max(1.5, s * 0.12), color: pale, cap: 'round' });
  },
  /** Rings spreading from a middle. */
  rings(g, s, color, pale) {
    for (const [r, c, a] of [
      [0.82, color, 0.55],
      [0.55, color, 0.85],
      [0.28, pale, 1],
    ] as const) {
      g.circle(0, 0, r * s).stroke({ width: Math.max(1.5, s * 0.12), color: c, alpha: a });
    }
    g.circle(0, 0, 0.09 * s).fill(pale);
  },
  /** A note, and the spark of its first striking. */
  note(g, s, color, pale) {
    g.ellipse(-0.25 * s, 0.5 * s, 0.33 * s, 0.24 * s).fill(color);
    g.poly(pts([0.02, 0.5, 0.02, -0.75, 0.62, -0.5, 0.62, -0.2, 0.14, -0.4, 0.14, 0.5], s)).fill(color);
    g.star(0.55 * s, 0.35 * s, 4, 0.3 * s, 0.1 * s).fill(pale);
  },
  /** A flame: a tongue of the tone with a pale heart. */
  flame(g, s, color, pale) {
    g.poly(pts([0, -0.9, 0.28, -0.4, 0.62, -0.1, 0.7, 0.35, 0.42, 0.78, 0, 0.9, -0.42, 0.78, -0.7, 0.35, -0.55, -0.15, -0.28, -0.05, -0.2, -0.5], s)).fill(color);
    g.poly(pts([0, -0.1, 0.26, 0.3, 0.2, 0.66, 0, 0.78, -0.2, 0.66, -0.28, 0.32], s)).fill(pale);
  },
  /** A snow crystal: six arms, each with two barbs. */
  flake(g, s, color, pale) {
    const w = Math.max(1.5, s * 0.11);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 6;
      const c = Math.cos(a);
      const n = Math.sin(a);
      g.moveTo(0, 0).lineTo(c * 0.88 * s, n * 0.88 * s);
      for (const side of [-1, 1]) {
        const b = a + side * 0.8;
        g.moveTo(c * 0.5 * s, n * 0.5 * s).lineTo((c * 0.5 + Math.cos(b) * 0.3) * s, (n * 0.5 + Math.sin(b) * 0.3) * s);
      }
    }
    g.stroke({ width: w, color, cap: 'round' });
    g.circle(0, 0, 0.14 * s).fill(pale);
  },
  /** A bolt of lightning. */
  bolt(g, s, color, pale) {
    g.poly(pts([0.2, -0.92, -0.5, 0.08, -0.08, 0.08, -0.3, 0.92, 0.55, -0.2, 0.1, -0.2], s)).fill(color);
    g.poly(pts([0.1, -0.55, -0.24, -0.04, 0.02, -0.04], s)).fill({ color: pale, alpha: 0.9 });
  },
  /** A heart. */
  heart(g, s, color, pale) {
    const out: number[] = [];
    for (let i = 0; i <= 28; i++) {
      const t = (i / 28) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      out.push((x / 18) * s, (y / 18) * s - 0.06 * s);
    }
    g.poly(out).fill(color);
    g.ellipse(-0.36 * s, -0.36 * s, 0.16 * s, 0.1 * s).fill({ color: pale, alpha: 0.85 });
  },
  /** A Chime, and a second behind it: a bigger share. */
  coin(g, s, color, pale) {
    g.poly(pts([0.3, -0.75, 0.85, -0.05, 0.3, 0.65, -0.25, -0.05], s)).fill({ color, alpha: 0.55 });
    g.poly(pts([-0.2, -0.8, 0.45, 0, -0.2, 0.8, -0.85, 0], s)).fill(color);
    g.poly(pts([-0.2, -0.42, 0.12, 0, -0.2, 0.42, -0.52, 0], s)).fill(pale);
  },
  /** A shield with a spark on it: the blow that does not down you. */
  ward(g, s, color, pale) {
    g.poly(pts([0, -0.9, 0.72, -0.62, 0.66, 0.15, 0, 0.92, -0.66, 0.15, -0.72, -0.62], s)).fill(color);
    g.star(0, -0.1 * s, 4, 0.42 * s, 0.13 * s).fill(pale);
  },
  /** A blade. */
  blade(g, s, color, pale) {
    g.poly(pts([-0.72, 0.84, -0.86, 0.7, 0.42, -0.74, 0.86, -0.86, 0.74, -0.42], s)).fill(color);
    g.poly(pts([-0.86, 0.38, -0.38, 0.86, -0.28, 0.76, -0.76, 0.28], s)).fill(pale);
  },
  /** An arrow that has turned off a wall. */
  arrow(g, s, color, pale) {
    g.moveTo(-0.8 * s, 0.7 * s)
      .lineTo(0, -0.5 * s)
      .lineTo(0.75 * s, 0.25 * s)
      .stroke({ width: Math.max(2, s * 0.14), color, cap: 'round', join: 'round' });
    g.poly(pts([0.9, 0.42, 0.5, 0.36, 0.84, 0.02], s)).fill(pale);
    g.circle(0, -0.5 * s, 0.12 * s).fill(pale);
  },
  /** A fist. */
  fist(g, s, color, pale) {
    g.roundRect(-0.62 * s, -0.5 * s, 1.24 * s, 1.05 * s, 0.24 * s).fill(color);
    for (let i = 0; i < 4; i++) g.roundRect((-0.6 + i * 0.31) * s, -0.72 * s, 0.27 * s, 0.42 * s, 0.1 * s).fill(pale);
    g.roundRect(-0.86 * s, -0.12 * s, 0.34 * s, 0.5 * s, 0.14 * s).fill(pale);
  },
  /** An arrowhead with streaks behind it: something sent back, faster. */
  fast(g, s, color, pale) {
    g.poly(pts([0.9, 0, 0.1, -0.62, 0.1, -0.22, -0.2, -0.22, -0.2, 0.22, 0.1, 0.22, 0.1, 0.62], s)).fill(pale);
    for (const y of [-0.5, 0, 0.5]) g.moveTo(-0.9 * s, y * s).lineTo((y === 0 ? -0.36 : -0.5) * s, y * s);
    g.stroke({ width: Math.max(1.5, s * 0.13), color, cap: 'round' });
  },
  /** A wide arc held in front of a point: a broader guard. */
  guard(g, s, color, pale) {
    g.poly(round(0, 0.55, 1.15, 14, s, -Math.PI * 0.86, -Math.PI * 0.14)).stroke({ width: Math.max(2, s * 0.2), color, cap: 'round', join: 'round' });
    g.poly(round(0, 0.55, 0.72, 12, s, -Math.PI * 0.8, -Math.PI * 0.2)).stroke({ width: Math.max(1.5, s * 0.12), color: pale, cap: 'round', join: 'round', alpha: 0.8 });
    g.circle(0, 0.55 * s, 0.16 * s).fill(pale);
  },
  /** One line that becomes three: a shot that splits. */
  split(g, s, color, pale) {
    const w = Math.max(1.8, s * 0.15);
    g.moveTo(-0.85 * s, 0.6 * s)
      .lineTo(-0.15 * s, 0.1 * s)
      .stroke({ width: w, color, cap: 'round' });
    for (const [x, y] of [
      [0.1, -0.85],
      [0.8, -0.5],
      [0.85, 0.3],
    ]) {
      g.moveTo(-0.15 * s, 0.1 * s).lineTo(x * s, y * s);
    }
    g.stroke({ width: w, color: pale, cap: 'round' });
    g.circle(-0.15 * s, 0.1 * s, 0.14 * s).fill(color);
  },
  /** An hourglass: a longer moment. */
  hourglass(g, s, color, pale) {
    g.poly(pts([-0.6, -0.85, 0.6, -0.85, 0.1, 0, 0.6, 0.85, -0.6, 0.85, -0.1, 0], s)).fill(color);
    g.poly(pts([-0.36, 0.72, 0.36, 0.72, 0, 0.2], s)).fill(pale);
    g.moveTo(-0.72 * s, -0.85 * s)
      .lineTo(0.72 * s, -0.85 * s)
      .moveTo(-0.72 * s, 0.85 * s)
      .lineTo(0.72 * s, 0.85 * s)
      .stroke({ width: Math.max(1.5, s * 0.12), color: pale, cap: 'round' });
  },
  /** A mark: a ring with four ticks and a point in the middle. */
  target(g, s, color, pale) {
    const w = Math.max(1.5, s * 0.13);
    g.circle(0, 0, 0.58 * s).stroke({ width: w, color });
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      g.moveTo(Math.cos(a) * 0.4 * s, Math.sin(a) * 0.4 * s).lineTo(Math.cos(a) * 0.92 * s, Math.sin(a) * 0.92 * s);
    }
    g.stroke({ width: w, color, cap: 'round' });
    g.circle(0, 0, 0.17 * s).fill(pale);
  },
  /** An arrow that comes round again. */
  again(g, s, color, pale) {
    g.poly(round(0, 0, 0.62, 16, s, Math.PI * 0.25, Math.PI * 1.75)).stroke({ width: Math.max(2, s * 0.17), color, cap: 'round', join: 'round' });
    g.poly(pts([0.2, -0.86, 0.86, -0.56, 0.34, -0.12], s)).fill(pale);
  },
  /** A crescent, thrown. */
  crescent(g, s, color, pale) {
    const outer = round(-0.25, 0, 0.9, 16, s, -Math.PI * 0.42, Math.PI * 0.42);
    const inner = round(-0.7, 0, 0.95, 16, s, Math.PI * 0.3, -Math.PI * 0.3);
    g.poly([...outer, ...inner]).fill(color);
    g.poly(round(-0.25, 0, 0.9, 12, s, -Math.PI * 0.3, Math.PI * 0.3)).stroke({ width: Math.max(1.5, s * 0.1), color: pale, cap: 'round', join: 'round' });
  },
  /** A tuning fork. */
  fork(g, s, color, pale) {
    const w = Math.max(2, s * 0.17);
    g.moveTo(-0.34 * s, -0.86 * s)
      .lineTo(-0.34 * s, -0.1 * s)
      .quadraticCurveTo(-0.34 * s, 0.26 * s, 0, 0.26 * s)
      .quadraticCurveTo(0.34 * s, 0.26 * s, 0.34 * s, -0.1 * s)
      .lineTo(0.34 * s, -0.86 * s)
      .stroke({ width: w, color, cap: 'round', join: 'round' });
    g.moveTo(0, 0.26 * s)
      .lineTo(0, 0.9 * s)
      .stroke({ width: w, color: pale, cap: 'round' });
  },
  /** A ring cut all the way round, with the blade that cut it. */
  ringcut(g, s, color, pale) {
    g.circle(0, 0, 0.78 * s).stroke({ width: Math.max(2, s * 0.16), color });
    g.poly(pts([-0.5, 0.58, -0.62, 0.46, 0.4, -0.6, 0.7, -0.7, 0.6, -0.4], s)).fill(pale);
  },
  /** A burst: a star of eight points. */
  burst(g, s, color, pale) {
    g.star(0, 0, 8, 0.92 * s, 0.4 * s).fill(color);
    g.circle(0, 0, 0.24 * s).fill(pale);
  },
  /** Two links of a chain: one thing leading to the next. */
  chain(g, s, color, pale) {
    const w = Math.max(2, s * 0.17);
    g.roundRect(-0.9 * s, -0.34 * s, 1.0 * s, 0.68 * s, 0.34 * s).stroke({ width: w, color });
    g.roundRect(-0.1 * s, -0.34 * s, 1.0 * s, 0.68 * s, 0.34 * s).stroke({ width: w, color: pale });
  },
  /** A pin driven into the ground. */
  pin(g, s, color, pale) {
    g.circle(0, -0.5 * s, 0.34 * s).fill(color);
    g.poly(pts([-0.1, -0.2, 0.1, -0.2, 0, 0.9], s)).fill(pale);
    g.moveTo(-0.6 * s, 0.9 * s)
      .lineTo(0.6 * s, 0.9 * s)
      .stroke({ width: Math.max(1.5, s * 0.1), color, cap: 'round', alpha: 0.7 });
  },
  /** A line run out, with a hook at the end of it. */
  hook(g, s, color, pale) {
    const w = Math.max(2, s * 0.15);
    g.moveTo(-0.85 * s, 0.75 * s)
      .lineTo(0.2 * s, -0.3 * s)
      .stroke({ width: w, color, cap: 'round' });
    g.moveTo(0.2 * s, -0.3 * s)
      .quadraticCurveTo(0.95 * s, -1.05 * s, 0.86 * s, -0.05 * s)
      .quadraticCurveTo(0.8 * s, 0.35 * s, 0.42 * s, 0.3 * s)
      .stroke({ width: w * 1.15, color: pale, cap: 'round', join: 'round' });
    g.poly(pts([0.42, 0.3, 0.6, 0.02, 0.2, 0.08], s)).fill(pale);
    g.circle(-0.85 * s, 0.75 * s, 0.13 * s).fill(pale);
  },
  /** A line with barbs along it. */
  barb(g, s, color, pale) {
    const w = Math.max(2, s * 0.15);
    g.moveTo(-0.85 * s, 0.6 * s)
      .lineTo(0.85 * s, -0.6 * s)
      .stroke({ width: w, color, cap: 'round' });
    for (const x of [-0.42, 0.08, 0.58]) {
      const y = -x * (0.6 / 0.85);
      g.poly(pts([x, y, x - 0.44, y - 0.1, x - 0.1, y + 0.36], s)).fill(pale);
    }
  },
  /** Arrows standing ready in their case. */
  quiver(g, s, color, pale) {
    g.poly(pts([-0.44, -0.12, 0.44, -0.12, 0.3, 0.9, -0.3, 0.9], s)).fill(color);
    for (const x of [-0.25, 0, 0.25]) {
      g.rect((x - 0.04) * s, -0.72 * s, 0.08 * s, 0.6 * s).fill(pale);
      g.poly(pts([x, -0.98, x + 0.14, -0.68, x - 0.14, -0.68], s)).fill(pale);
    }
  },
  /** A broad, heavy arrowhead. */
  heavy(g, s, color, pale) {
    g.poly(pts([0, -0.92, 0.72, 0.2, 0.26, 0.2, 0.26, 0.9, -0.26, 0.9, -0.26, 0.2, -0.72, 0.2], s)).fill(color);
    g.poly(pts([0, -0.5, 0.3, 0.02, -0.3, 0.02], s)).fill(pale);
  },
  /** A line going clean through a body. */
  through(g, s, color, pale) {
    g.circle(0, 0, 0.5 * s).fill({ color, alpha: 0.9 });
    g.moveTo(-0.92 * s, 0)
      .lineTo(0.5 * s, 0)
      .stroke({ width: Math.max(2, s * 0.16), color: pale, cap: 'round' });
    g.poly(pts([0.95, 0, 0.45, -0.32, 0.45, 0.32], s)).fill(pale);
  },
  /** Arrows flung outward from a middle: the break. */
  breakout(g, s, color, pale) {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const c = Math.cos(a);
      const n = Math.sin(a);
      g.poly([c * 0.95 * s, n * 0.95 * s, (c * 0.5 - n * 0.2) * s, (n * 0.5 + c * 0.2) * s, (c * 0.5 + n * 0.2) * s, (n * 0.5 - c * 0.2) * s]).fill(i % 2 === 0 ? pale : color);
    }
    g.circle(0, 0, 0.26 * s).fill(color);
  },
  /** A wall, and the mark of something slammed into it. */
  wall(g, s, color, pale) {
    for (const [x, y, w] of [
      [-0.9, -0.8, 0.85],
      [0.05, -0.8, 0.85],
      [-0.9, -0.22, 0.4],
      [-0.4, -0.22, 0.85],
      [0.55, -0.22, 0.35],
      [-0.9, 0.36, 0.85],
      [0.05, 0.36, 0.85],
    ]) {
      g.rect(x * s, y * s, w * s, 0.46 * s).fill(color);
    }
    g.star(0.12 * s, 0.05 * s, 6, 0.5 * s, 0.2 * s).fill(pale);
  },
  /** A body with a crack through it. */
  crack(g, s, color, pale) {
    g.circle(0, 0, 0.78 * s).fill(color);
    g.moveTo(-0.1 * s, -0.78 * s)
      .lineTo(0.14 * s, -0.3 * s)
      .lineTo(-0.2 * s, 0)
      .lineTo(0.16 * s, 0.34 * s)
      .lineTo(-0.04 * s, 0.78 * s)
      .stroke({ width: Math.max(1.5, s * 0.13), color: pale, cap: 'round', join: 'round' });
  },
  /** A flight that comes round to its mark. */
  homing(g, s, color, pale) {
    g.moveTo(-0.85 * s, 0.75 * s)
      .quadraticCurveTo(-0.7 * s, -0.75 * s, 0.25 * s, -0.3 * s)
      .stroke({ width: Math.max(2, s * 0.16), color, cap: 'round' });
    g.poly(pts([0.52, 0.02, 0.02, -0.12, 0.42, -0.54], s)).fill(color);
    g.circle(0.6 * s, 0.5 * s, 0.24 * s).stroke({ width: Math.max(1.5, s * 0.12), color: pale });
    g.circle(0.6 * s, 0.5 * s, 0.08 * s).fill(pale);
  },
  /** An arrowhead broken into pieces that fly apart. */
  shards(g, s, color, pale) {
    g.moveTo(-0.9 * s, 0)
      .lineTo(-0.3 * s, 0)
      .stroke({ width: Math.max(2, s * 0.16), color, cap: 'round' });
    for (const [a, c] of [
      [-0.75, color],
      [0, pale],
      [0.75, color],
    ] as const) {
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      g.poly([(0.1 + cx * 0.75) * s, cy * 0.75 * s, (0.1 + cx * 0.2 - cy * 0.2) * s, (cy * 0.2 + cx * 0.2) * s, (0.1 + cx * 0.2 + cy * 0.2) * s, (cy * 0.2 - cx * 0.2) * s]).fill(c);
    }
  },
  /** One ball driven into another. */
  carom(g, s, color, pale) {
    g.circle(-0.2 * s, 0.15 * s, 0.4 * s).fill(color);
    g.circle(0.52 * s, -0.22 * s, 0.34 * s).fill(pale);
    for (const y of [-0.05, 0.3]) g.moveTo(-0.95 * s, (y + 0.1) * s).lineTo(-0.7 * s, y * s);
    g.stroke({ width: Math.max(1.5, s * 0.12), color: pale, cap: 'round' });
  },
  /** Out to a wall and straight back. */
  rebound(g, s, color, pale) {
    g.rect(0.62 * s, -0.8 * s, 0.22 * s, 1.6 * s).fill(color);
    g.moveTo(-0.85 * s, -0.4 * s)
      .lineTo(0.5 * s, -0.4 * s)
      .lineTo(0.5 * s, 0.4 * s)
      .lineTo(-0.35 * s, 0.4 * s)
      .stroke({ width: Math.max(2, s * 0.15), color: pale, cap: 'round', join: 'round' });
    g.poly(pts([-0.85, 0.4, -0.35, 0.08, -0.35, 0.72], s)).fill(pale);
  },
  /** Two things brought together, and the crack between them. */
  clap(g, s, color, pale) {
    g.poly(pts([-0.9, -0.5, -0.15, -0.15, -0.15, 0.15, -0.9, 0.5], s)).fill(color);
    g.poly(pts([0.9, -0.5, 0.15, -0.15, 0.15, 0.15, 0.9, 0.5], s)).fill(color);
    g.poly(pts([0.08, -0.95, -0.2, -0.3, 0.06, -0.3, -0.1, 0.25, 0.22, -0.5, 0, -0.5], s)).fill(pale);
    g.poly(pts([-0.04, 0.4, 0.12, 0.62, -0.1, 0.9], s)).fill(pale);
  },
  /** Feet planted wide: someone who will not be moved. */
  stance(g, s, color, pale) {
    g.circle(0, -0.62 * s, 0.22 * s).fill(pale);
    g.poly(pts([-0.22, -0.34, 0.22, -0.34, 0.8, 0.78, 0.42, 0.78, 0, 0.1, -0.42, 0.78, -0.8, 0.78], s)).fill(color);
    g.moveTo(-0.95 * s, 0.86 * s)
      .lineTo(0.95 * s, 0.86 * s)
      .stroke({ width: Math.max(1.5, s * 0.12), color: pale, cap: 'round' });
  },
  /** The ground shaking: a jagged line with rings rising off it. */
  quake(g, s, color, pale) {
    g.moveTo(-0.9 * s, 0.4 * s)
      .lineTo(-0.5 * s, 0.1 * s)
      .lineTo(-0.2 * s, 0.6 * s)
      .lineTo(0.15 * s, 0.05 * s)
      .lineTo(0.5 * s, 0.6 * s)
      .lineTo(0.9 * s, 0.3 * s)
      .stroke({ width: Math.max(2, s * 0.17), color, cap: 'round', join: 'round' });
    for (const r of [0.3, 0.55]) g.poly(round(0, -0.1, r, 10, s, -Math.PI * 0.85, -Math.PI * 0.15)).stroke({ width: Math.max(1.5, s * 0.1), color: pale, cap: 'round', join: 'round' });
  },
};

/** The emblems there are, for the test that every Tuning names one of them. */
export const ICON_IDS: readonly string[] = Object.keys(DRAW);

/** Draw an emblem about the origin. One that is not known is drawn as a plain diamond. */
export function drawIcon(g: Graphics, icon: string, s: number, color: number, pale: number): void {
  const draw = DRAW[icon];
  if (draw) draw(g, s, color, pale);
  else g.poly(round(0, 0, 0.8, 4, s, -Math.PI / 2, Math.PI * 1.5)).fill(color);
}

/**
 * The quiet pattern behind an emblem, by family: streaks for the dash, rings for Rally, tongues
 * for fire, a lattice for frost, zigzags for lightning, cells for the body, and a mark of each
 * class's own. Drawn inside a box `w` by `h` whose top left is the origin.
 */
export function drawPattern(g: Graphics, tone: string, w: number, h: number, color: number): void {
  const line = { width: 1.5, color, alpha: 0.22 };
  if (tone === 'dash') {
    for (let x = -h; x < w; x += 16) g.moveTo(x, h).lineTo(x + h * 0.9, 0);
    g.stroke(line);
  } else if (tone === 'rally') {
    for (let r = 14; r < w; r += 14) g.arc(w / 2, h, r, Math.PI, Math.PI * 2);
    g.stroke(line);
  } else if (tone === 'fire') {
    for (let x = 8; x < w; x += 22) {
      const top = h * (0.25 + 0.35 * Math.abs(Math.sin(x * 0.37)));
      g.moveTo(x - 9, h)
        .quadraticCurveTo(x - 8, top + 12, x, top)
        .quadraticCurveTo(x + 8, top + 12, x + 9, h);
    }
    g.stroke(line);
  } else if (tone === 'frost') {
    for (let x = -h; x < w + h; x += 20) {
      g.moveTo(x, 0).lineTo(x + h * 0.58, h);
      g.moveTo(x + h * 0.58, 0).lineTo(x, h);
    }
    g.stroke(line);
  } else if (tone === 'storm') {
    for (let x = 6; x < w; x += 26) {
      g.moveTo(x, 0);
      for (let y = 0, k = 0; y <= h; y += h / 5, k++) g.lineTo(x + (k % 2 === 0 ? 0 : 10), y);
    }
    g.stroke(line);
  } else if (tone === 'body') {
    for (let y = 8; y < h; y += 18) for (let x = 10 + ((y / 18) % 2 === 0 ? 0 : 10); x < w; x += 20) g.circle(x, y, 5);
    g.stroke(line);
  } else if (tone === 'sword') {
    for (let x = -h; x < w; x += 30) {
      g.moveTo(x, h).lineTo(x + h, 0);
      g.moveTo(x + 15 + h, h).lineTo(x + 15, 0);
    }
    g.stroke(line);
  } else if (tone === 'bow') {
    for (let x = 0; x < w; x += 28)
      g.moveTo(x, h)
        .lineTo(x + 14, 6)
        .lineTo(x + 28, h);
    g.stroke(line);
  } else {
    for (let x = 16; x < w; x += 34) for (let k = 0; k < 6; k++) g.moveTo(x, h / 2).lineTo(x + Math.cos(k * 1.047) * 11, h / 2 + Math.sin(k * 1.047) * 11);
    g.stroke(line);
  }
}
