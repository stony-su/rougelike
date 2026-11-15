// Keys and buttons, drawn from simple shapes: a key cap, the four movement keys, a mouse with
// one button lit, a stick, a trigger, the four face buttons with one lit, the d-pad and Start.
// Each is a small picture about its own centre, so a page of controls can lay them out in rows.
import { Container, Graphics } from 'pixi.js';
import { PAPER, UI } from '../render/palette';
import { Label } from './label';

const LINE = { width: 1.6, color: UI.brass, alpha: 0.95 };
const DIM = { width: 1.4, color: UI.inkSoft, alpha: 0.7 };

/** A key cap with its letter or word. `w` is its width; a single letter makes a square one. */
export function keyGlyph(text: string, w = 0): Container {
  const c = new Container();
  const label = new Label(text, { size: 10, color: PAPER, bold: true, tracking: 0.1, align: 'center' });
  const width = Math.max(30, w, label.textWidth + 18);
  const g = new Graphics()
    .roundRect(-width / 2, -13, width, 30, 5)
    .fill({ color: UI.scrim, alpha: 0.9 })
    .roundRect(-width / 2, -15, width, 30, 5)
    .fill({ color: UI.glass, alpha: 1 })
    .roundRect(-width / 2, -15, width, 30, 5)
    .stroke(LINE);
  label.position.set(0, -5);
  c.addChild(g, label);
  return c;
}

/** W over A S D, as they lie on a keyboard. */
export function wasdGlyph(): Container {
  const c = new Container();
  const place = (text: string, x: number, y: number): void => {
    const k = keyGlyph(text);
    k.position.set(x, y);
    c.addChild(k);
  };
  place('W', 0, -17);
  place('A', -34, 17);
  place('S', 0, 17);
  place('D', 34, 17);
  return c;
}

/** A mouse. `lit` is the button that is meant: 'left', 'right', or 'move' for the whole mouse being moved. */
export function mouseGlyph(lit: 'left' | 'right' | 'move'): Container {
  const c = new Container();
  const g = new Graphics();
  const w = 34;
  const h = 50;
  // the lit button, under the outline
  if (lit === 'left')
    g.roundRect(-w / 2, -h / 2, w / 2, 22, 8)
      .fill({ color: UI.brass, alpha: 0.95 })
      .rect(-w / 4, -h / 2 + 8, w / 4, 14)
      .fill({ color: UI.brass, alpha: 0.95 });
  if (lit === 'right')
    g.roundRect(0, -h / 2, w / 2, 22, 8)
      .fill({ color: UI.brass, alpha: 0.95 })
      .rect(0, -h / 2 + 8, w / 4, 14)
      .fill({ color: UI.brass, alpha: 0.95 });
  g.roundRect(-w / 2, -h / 2, w, h, 15).stroke(LINE);
  g.moveTo(-w / 2, -h / 2 + 22)
    .lineTo(w / 2, -h / 2 + 22)
    .moveTo(0, -h / 2)
    .lineTo(0, -h / 2 + 22)
    .stroke(LINE);
  if (lit === 'move') {
    // four small arrows round it
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = dx * (w / 2 + 9);
      const y = dy * (h / 2 + 9);
      g.poly([x + dx * 6, y + dy * 6, x - dy * 5, y - dx * 5, x + dy * 5, y + dx * 5]).fill({ color: UI.brass, alpha: 0.95 });
    }
  }
  c.addChild(g);
  return c;
}

/** A stick, named L or R: a ring, the cap pushed a little to one side, and marks for the four ways. */
export function stickGlyph(name: string): Container {
  const c = new Container();
  const g = new Graphics();
  g.circle(0, 0, 24).stroke(LINE);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    g.moveTo(Math.cos(a) * 28, Math.sin(a) * 28).lineTo(Math.cos(a) * 33, Math.sin(a) * 33);
  }
  g.stroke(DIM);
  g.circle(5, -4, 14).fill({ color: UI.glass, alpha: 1 }).circle(5, -4, 14).stroke(LINE);
  const label = new Label(name, { size: 10, color: PAPER, bold: true, align: 'center' });
  label.position.set(5, -9);
  c.addChild(g, label);
  return c;
}

/** A trigger or a bumper, with its name: wide at the top and cut away below, as seen from behind. */
export function triggerGlyph(name: string): Container {
  const c = new Container();
  const g = new Graphics().poly([-22, -15, 22, -15, 22, 5, 12, 15, -12, 15, -22, 5]).fill({ color: UI.glass, alpha: 1 }).poly([-22, -15, 22, -15, 22, 5, 12, 15, -12, 15, -22, 5]).stroke(LINE);
  const label = new Label(name, { size: 10, color: PAPER, bold: true, tracking: 0.1, align: 'center' });
  label.position.set(0, -6);
  c.addChild(g, label);
  return c;
}

/** The four face buttons in their diamond, with the one that is meant lit and lettered. */
export function faceGlyph(lit: 'A' | 'B' | 'X' | 'Y'): Container {
  const c = new Container();
  const g = new Graphics();
  const at: Record<string, [number, number]> = { A: [0, 17], B: [17, 0], X: [-17, 0], Y: [0, -17] };
  for (const name of ['A', 'B', 'X', 'Y']) {
    const [x, y] = at[name];
    if (name === lit) g.circle(x, y, 11).fill({ color: UI.brass, alpha: 1 });
    else g.circle(x, y, 8).stroke(DIM);
  }
  const [lx, ly] = at[lit];
  const label = new Label(lit, { size: 9, color: UI.glass, bold: true, align: 'center' });
  label.position.set(lx, ly - 4.5);
  c.addChild(g, label);
  return c;
}

/** The d-pad: a plus. */
export function dpadGlyph(): Container {
  const c = new Container();
  const g = new Graphics()
    .poly([-8, -24, 8, -24, 8, -8, 24, -8, 24, 8, 8, 8, 8, 24, -8, 24, -8, 8, -24, 8, -24, -8, -8, -8])
    .fill({ color: UI.glass, alpha: 1 })
    .poly([-8, -24, 8, -24, 8, -8, 24, -8, 24, 8, 8, 8, 8, 24, -8, 24, -8, 8, -24, 8, -24, -8, -8, -8])
    .stroke(LINE);
  c.addChild(g);
  return c;
}

/** Start: a small pill with three lines on it. */
export function startGlyph(): Container {
  const c = new Container();
  const g = new Graphics().roundRect(-20, -11, 40, 22, 11).fill({ color: UI.glass, alpha: 1 }).roundRect(-20, -11, 40, 22, 11).stroke(LINE);
  for (const y of [-5, 0, 5]) g.moveTo(-9, y).lineTo(9, y);
  g.stroke({ width: 1.6, color: PAPER, alpha: 0.9 });
  c.addChild(g);
  return c;
}

/** Several glyphs in a row, with a little room between them, about their common centre. */
export function row(glyphs: Container[], gap = 12): Container {
  const c = new Container();
  let x = 0;
  const widths = glyphs.map((g) => g.getLocalBounds().width);
  const total = widths.reduce((n, w) => n + w, 0) + gap * (glyphs.length - 1);
  glyphs.forEach((g, i) => {
    const b = g.getLocalBounds();
    g.position.set(-total / 2 + x - b.x, 0);
    c.addChild(g);
    x += widths[i] + gap;
  });
  return c;
}
