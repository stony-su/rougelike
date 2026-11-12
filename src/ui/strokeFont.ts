// The game's lettering: a single-stroke drafting alphabet, the "single-stroke gothic" of technical
// drawings and old survey sheets. Each character is a few polylines on a small grid; the renderer
// runs a round pen along them, so the whole UI is lettered without a font file.
//
// This file is the pure half: glyph data and text layout. It imports nothing from pixi, so the
// alphabet can be checked in Node. src/ui/strokeText.ts is the display object that draws it.
//
// THE GRID
//   y = 0 is the cap line and y = CAP_HEIGHT the baseline; descenders may reach y = 9.
//   Capitals are drawn 5 units wide on the 7-unit height: the generous width of hand lettering,
//   which keeps counters open when a letter is only nine pixels tall.
//   A glyph's width is its advance: the drawn width plus a side bearing on each side. A stem
//   carries more bearing than a bowl, and a diagonal almost none, so letters space evenly by
//   area, the way a draughtsman spaces them by eye.
//
// CONSTRUCTION
//   Round letters are built as they are on the board: ellipse arcs, joined by straight lines
//   that meet them at a tangent. The pen has round caps and joins, so a stroke simply stops
//   where the letter does and never doubles back along itself.

export const CAP_HEIGHT = 7;

export interface Glyph {
  /** Advance in grid units, side bearings included. */
  width: number;
  /** Each stroke is a polyline x0, y0, x1, y1, ... in grid units. A stroke that ends where it began is a closed loop. */
  strokes: readonly (readonly number[])[];
}

// ---------------------------------------------------------------- curve helpers

/** An ellipse as centre x, centre y, radius x, radius y. */
type Oval = readonly [number, number, number, number];

/** 1 turns clockwise on screen (y runs down), -1 anticlockwise. */
type Turn = 1 | -1;

const DEG = Math.PI / 180;

/** Curves are sampled at most this many degrees apart: smooth in a title, cheap in a paragraph. */
const ARC_STEP = 15;

/**
 * Points along an ellipse from one angle to another. Angles are in degrees, 0 at three o'clock,
 * growing clockwise on screen. Equal angles give the whole ellipse.
 */
function arc(o: Oval, from: number, to: number, turn: Turn = 1): number[] {
  const sweep = ((((to - from) * turn) % 360) + 360) % 360 || 360;
  const n = Math.ceil(sweep / ARC_STEP);
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (from + (turn * sweep * i) / n) * DEG;
    pts.push(o[0] + Math.cos(a) * o[2], o[1] + Math.sin(a) * o[3]);
  }
  return pts;
}

/**
 * The angle at which a straight line drawn from (x, y) touches the ellipse. There are two such
 * lines; side 1 picks the touch point clockwise of the direction to (x, y), -1 the other.
 */
function touch(o: Oval, x: number, y: number, side: Turn): number {
  const u = (x - o[0]) / o[2];
  const v = (y - o[1]) / o[3];
  return (Math.atan2(v, u) + side * Math.acos(1 / Math.hypot(u, v))) / DEG;
}

/**
 * The angles at which one straight line touches two ellipses, found by walking the touch point
 * back and forth between them until it settles. This is the spine of the S.
 */
function bridge(a: Oval, sideA: Turn, b: Oval, sideB: Turn): [number, number] {
  let ta = touch(a, b[0], b[1], sideA);
  let tb = 0;
  for (let i = 0; i < 12; i++) {
    tb = touch(b, a[0] + Math.cos(ta * DEG) * a[2], a[1] + Math.sin(ta * DEG) * a[3], sideB);
    ta = touch(a, b[0] + Math.cos(tb * DEG) * b[2], b[1] + Math.sin(tb * DEG) * b[3], sideA);
  }
  return [ta, tb];
}

/** A quadratic curve from (x0, y0) to (x1, y1), bent toward (cx, cy). */
function bend(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const s = 1 - t;
    pts.push(s * s * x0 + 2 * s * t * cx + t * t * x1, s * s * y0 + 2 * s * t * cy + t * t * y1);
  }
  return pts;
}

/** Join pieces end to end into one stroke, dropping a point that repeats the one before it. */
function path(...parts: number[][]): number[] {
  const out: number[] = [];
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 2) {
      const n = out.length;
      if (n >= 2 && Math.abs(out[n - 2] - part[i]) < 1e-6 && Math.abs(out[n - 1] - part[i + 1]) < 1e-6) continue;
      out.push(part[i], part[i + 1]);
    }
  }
  return out;
}

/** A full stop: a loop too small to show its hole, so the pen leaves a round dot a little heavier than a stroke. */
function dot(x: number, y: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= 8; i++) pts.push(x + Math.cos(i * 45 * DEG) * 0.22, y + Math.sin(i * 45 * DEG) * 0.22);
  return pts;
}

// ---------------------------------------------------------------- side bearings

/** Beside a vertical stem. */
const STEM = 0.5;
/** Beside a bowl, which only reaches its edge at one point. */
const BOWL = 0.25;
/** Beside a diagonal or an open side, which already carries its own air. */
const OPEN = 0.1;

const tidy = (v: number): number => Math.round(v * 1000) / 1000 + 0;

/** Set strokes drawn from x = 0 into a cell with the given bearings. */
function glyph(left: number, right: number, ...strokes: number[][]): Glyph {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of strokes) {
    for (let i = 0; i < s.length; i += 2) {
      if (s[i] < lo) lo = s[i];
      if (s[i] > hi) hi = s[i];
    }
  }
  const dx = left - lo;
  return {
    width: tidy(left + (hi - lo) + right),
    strokes: strokes.map((s) => s.map((v, i) => tidy(i % 2 === 0 ? v + dx : v))),
  };
}

// ---------------------------------------------------------------- the alphabet

/** The full-height bowl shared by C, G, O and Q. */
const ROUND: Oval = [2.6, 3.5, 2.6, 3.5];

function letterS(): Glyph {
  const top: Oval = [2.35, 1.6, 2.1, 1.6];
  const bottom: Oval = [2.35, 5.3, 2.35, 1.7];
  const [a, b] = bridge(top, 1, bottom, 1);
  return glyph(BOWL, BOWL, path(arc(top, -32, a, -1), arc(bottom, b, 150)));
}

function digit2(): Glyph {
  const bowl: Oval = [2.3, 2.1, 2.2, 2.1];
  return glyph(BOWL, 0.2, path(arc(bowl, -165, touch(bowl, 0, 7, -1)), [0, 7, 4.6, 7]));
}

function ampersand(): Glyph {
  const loop: Oval = [2.3, 1.55, 1.45, 1.55];
  const bowl: Oval = [2.2, 5.05, 2.2, 1.95];
  const [a, b] = bridge(loop, -1, bowl, -1);
  return glyph(BOWL, OPEN, path([5.4, 7], arc(loop, touch(loop, 5.4, 7, 1), a), arc(bowl, b, touch(bowl, 5.2, 3.9, 1), -1), [5.2, 3.9]));
}

function question(): Glyph {
  const hook: Oval = [2.1, 1.95, 2.1, 1.95];
  return glyph(BOWL, BOWL, path(arc(hook, -170, 60), bend(3.15, 3.64, 2.1, 4.2, 2.1, 5)), dot(2.1, 6.78));
}

const SPACE: Glyph = { width: 3.5, strokes: [] };

export const GLYPHS: Readonly<Record<string, Glyph>> = {
  ' ': SPACE,
  // A space that does not break a line, for keeping a number with its unit.
  ' ': { width: SPACE.width, strokes: [] },

  A: glyph(OPEN, OPEN, [0, 7, 2.8, 0, 5.6, 7], [0.92, 4.7, 4.68, 4.7]),
  B: glyph(STEM, BOWL, path([0, 3.4], arc([3, 5.2, 2, 1.8], -90, 90), [0, 7, 0, 0], arc([2.75, 1.7, 1.65, 1.7], -90, 90))),
  C: glyph(BOWL, OPEN, arc(ROUND, -40, 40, -1)),
  D: glyph(STEM, BOWL, path([0, 0], arc([2.2, 3.5, 2.8, 3.5], -90, 90), [0, 7, 0, 0])),
  E: glyph(STEM, OPEN, [4.5, 0, 0, 0, 0, 7, 4.6, 7], [0, 3.5, 3.6, 3.5]),
  F: glyph(STEM, OPEN, [4.4, 0, 0, 0, 0, 7], [0, 3.5, 3.4, 3.5]),
  G: glyph(BOWL, 0.3, path(arc(ROUND, -40, 5, -1), [2.8, 3.8])),
  H: glyph(STEM, STEM, [0, 0, 0, 7], [5, 0, 5, 7], [0, 3.5, 5, 3.5]),
  I: glyph(STEM, STEM, [0, 0, 0, 7]),
  J: glyph(OPEN, STEM, path([4.3, 0], arc([2.15, 4.85, 2.15, 2.15], 0, 165))),
  K: glyph(STEM, OPEN, [0, 0, 0, 7], [4.8, 0, 0, 4.6], [1.95, 2.73, 5, 7]),
  L: glyph(STEM, OPEN, [0, 0, 0, 7, 4.4, 7]),
  M: glyph(STEM, STEM, [0, 7, 0, 0, 3.4, 5.2, 6.8, 0, 6.8, 7]),
  N: glyph(STEM, STEM, [0, 7, 0, 0, 5.2, 7, 5.2, 0]),
  O: glyph(BOWL, BOWL, arc(ROUND, 0, 0)),
  P: glyph(STEM, OPEN, path([0, 7, 0, 0], arc([2.75, 1.9, 2.05, 1.9], -90, 90), [0, 3.8])),
  Q: glyph(BOWL, BOWL, arc(ROUND, 0, 0), [3.3, 5.1, 5.4, 7.6]),
  R: glyph(STEM, OPEN, path([0, 7, 0, 0], arc([2.7, 1.8, 2.1, 1.8], -90, 90), [0, 3.6]), [2.6, 3.6, 5, 7]),
  S: letterS(),
  T: glyph(OPEN, OPEN, [0, 0, 5, 0], [2.5, 0, 2.5, 7]),
  U: glyph(STEM, STEM, path([0, 0], arc([2.5, 4.5, 2.5, 2.5], 180, 0, -1), [5, 0])),
  V: glyph(OPEN, OPEN, [0, 0, 2.7, 7, 5.4, 0]),
  W: glyph(OPEN, OPEN, [0, 0, 1.95, 7, 3.9, 1.8, 5.85, 7, 7.8, 0]),
  X: glyph(OPEN, OPEN, [0, 0, 5, 7], [5, 0, 0, 7]),
  Y: glyph(OPEN, OPEN, [0, 0, 2.6, 3.5, 5.2, 0], [2.6, 3.5, 2.6, 7]),
  Z: glyph(0.2, 0.2, [0, 0, 4.8, 0, 0, 7, 4.8, 7]),

  '0': glyph(BOWL, BOWL, path(arc([2.1, 2.3, 2.1, 2.3], 180, 0), arc([2.1, 4.7, 2.1, 2.3], 0, 180), [0, 2.3])),
  '1': glyph(OPEN, STEM, [0, 1.7, 1.7, 0, 1.7, 7]),
  '2': digit2(),
  '3': glyph(OPEN, BOWL, path(arc([2.2, 1.7, 2, 1.7], -150, 90), [1.4, 3.4]), arc([2.2, 5.2, 2.3, 1.8], -90, 150)),
  '4': glyph(OPEN, 0.2, [4.8, 4.9, 0, 4.9, 3.5, 0, 3.5, 7]),
  '5': glyph(0.3, BOWL, path([4.2, 0, 0.6, 0], arc([2.15, 4.7, 2.35, 2.3], -136, 150))),
  '6': glyph(BOWL, BOWL, path(arc([2.6, 3.6, 2.6, 3.6], -50, 180, -1), arc([2.3, 4.75, 2.3, 2.25], 180, 180, -1))),
  '7': glyph(0.2, OPEN, [0, 0, 4.6, 0, 1.7, 7]),
  '8': glyph(BOWL, BOWL, arc([2.3, 1.65, 2, 1.65], 90, 90), arc([2.3, 5.15, 2.3, 1.85], -90, -90)),
  '9': glyph(BOWL, BOWL, path(arc([2.3, 2.25, 2.3, 2.25], 0, 0, -1), arc([2, 3.4, 2.6, 3.6], 0, 130))),

  '.': glyph(STEM, STEM, dot(0, 6.78)),
  ',': glyph(STEM, STEM, dot(0.55, 6.78), bend(0.75, 6.9, 0.8, 8, 0, 8.8)),
  ':': glyph(STEM, STEM, dot(0, 2.7), dot(0, 6.78)),
  ';': glyph(STEM, STEM, dot(0.55, 2.7), dot(0.55, 6.78), bend(0.75, 6.9, 0.8, 8, 0, 8.8)),
  '!': glyph(STEM, STEM, [0.22, 0, 0.22, 4.8], dot(0.22, 6.78)),
  '?': question(),
  "'": glyph(STEM, STEM, [0, 0, 0, 2]),
  '"': glyph(STEM, STEM, [0, 0, 0, 2], [1.9, 0, 1.9, 2]),
  '-': glyph(STEM, STEM, [0, 3.7, 2.8, 3.7]),
  '+': glyph(STEM, STEM, [0, 3.7, 4.2, 3.7], [2.1, 1.6, 2.1, 5.8]),
  '/': glyph(OPEN, OPEN, [0, 7.6, 3.4, -0.6]),
  '\\': glyph(OPEN, OPEN, [0, -0.6, 3.4, 7.6]),
  '%': glyph(BOWL, BOWL, arc([1.15, 1.45, 1.15, 1.45], 0, 0), [4.9, 0, 1.1, 7], arc([4.85, 5.55, 1.15, 1.45], 0, 0)),
  '(': glyph(BOWL, OPEN, arc([0, 3.5, 4.8, 5.5], -130, 130, -1)),
  ')': glyph(OPEN, BOWL, arc([0, 3.5, 4.8, 5.5], -50, 50)),
  '[': glyph(STEM, OPEN, [1.8, -0.6, 0, -0.6, 0, 7.6, 1.8, 7.6]),
  ']': glyph(OPEN, STEM, [0, -0.6, 1.8, -0.6, 1.8, 7.6, 0, 7.6]),
  '&': ampersand(),
  '#': glyph(OPEN, OPEN, [1.9, 0.2, 1.1, 6.8], [4.1, 0.2, 3.3, 6.8], [0.2, 2.4, 5.2, 2.4], [0, 4.6, 5, 4.6]),
  '=': glyph(STEM, STEM, [0, 2.6, 4.2, 2.6], [0, 4.8, 4.2, 4.8]),
  '*': glyph(STEM, STEM, [1.9, 0.2, 1.9, 4.2], [0.2, 1.2, 3.6, 3.2], [3.6, 1.2, 0.2, 3.2]),
  '<': glyph(BOWL, STEM, [3.8, 0.9, 0, 3.7, 3.8, 6.5]),
  '>': glyph(STEM, BOWL, [0, 0.9, 3.8, 3.7, 0, 6.5]),
  _: glyph(OPEN, OPEN, [0, 8.3, 5, 8.3]),
  '|': glyph(STEM, STEM, [0, -0.8, 0, 8.8]),

  // Multiplication sign, arrows, bullet, long dashes and degree sign.
  '×': glyph(STEM, STEM, [0, 2, 3.4, 5.4], [3.4, 2, 0, 5.4]),
  '→': glyph(STEM, STEM, [0, 3.7, 6, 3.7], [4.1, 1.8, 6, 3.7, 4.1, 5.6]),
  '←': glyph(STEM, STEM, [6, 3.7, 0, 3.7], [1.9, 1.8, 0, 3.7, 1.9, 5.6]),
  '↑': glyph(STEM, STEM, [1.9, 7, 1.9, 0.2], [0, 2.1, 1.9, 0.2, 3.8, 2.1]),
  '↓': glyph(STEM, STEM, [1.9, 0, 1.9, 6.8], [0, 4.9, 1.9, 6.8, 3.8, 4.9]),
  '•': glyph(STEM, STEM, arc([0.5, 3.7, 0.5, 0.5], 0, 0)),
  '–': glyph(STEM, STEM, [0, 3.7, 4.4, 3.7]),
  '—': glyph(STEM, STEM, [0, 3.7, 6.6, 3.7]),
  '°': glyph(STEM, STEM, arc([1.1, 1.1, 1.1, 1.1], 0, 0)),
};

/** Drawn for any character the alphabet lacks, so a missing glyph is visible rather than silent. */
export const MISSING_GLYPH: Glyph = glyph(STEM, STEM, [0, 1.6, 3.2, 1.6, 3.2, 7, 0, 7, 0, 1.6]);

/** The glyph for one character. Lowercase is lettered as capitals. */
function glyphFor(ch: string): Glyph | undefined {
  if (Object.hasOwn(GLYPHS, ch)) return GLYPHS[ch];
  const upper = ch.toUpperCase();
  return Object.hasOwn(GLYPHS, upper) ? GLYPHS[upper] : undefined;
}

export function hasGlyph(ch: string): boolean {
  return glyphFor(ch) !== undefined;
}

// ---------------------------------------------------------------- layout

export interface LayoutOptions {
  /** Cap height in pixels. */
  size: number;
  /** Extra space between letters, in grid units. Default 1.2. */
  tracking?: number;
  /** Distance from one baseline to the next, as a multiple of the cap height. Default 1.7. */
  lineHeight?: number;
  /** Width in pixels at which lines wrap. Lines break at spaces only, so one long word may run past it. */
  maxWidth?: number;
  /** How each line sits within the block. Default "left". */
  align?: 'left' | 'center' | 'right';
}

export interface TextLayout {
  /** One polyline per stroke, x0, y0, x1, y1, ... in pixels. A polyline that ends where it began is a closed loop. */
  polylines: number[][];
  /** Width of the widest line, in pixels. */
  width: number;
  /** From the first line's cap line to the last line's baseline, in pixels. */
  height: number;
  lineCount: number;
}

const DEFAULT_TRACKING = 1.2;
const DEFAULT_LINE_HEIGHT = 1.7;
const ALIGN_SHIFT = { left: 0, center: 0.5, right: 1 } as const;

interface Line {
  glyphs: Glyph[];
  /** Advance of the whole line in grid units, with no tracking after its last glyph. */
  width: number;
}

/** Split text into lines: at every newline, and at spaces wherever a line would pass `limit` grid units. */
function breakLines(text: string, tracking: number, limit: number): Line[] {
  const lines: Line[] = [];
  for (const paragraph of text.split(/\r\n|\r|\n/)) {
    // `run` counts each glyph's advance plus the tracking after it; a line's width is its run less one tracking.
    let line: Glyph[] = [];
    let lineRun = 0;
    let gap: Glyph[] = [];
    let gapRun = 0;
    let word: Glyph[] = [];
    let wordRun = 0;
    const endWord = (): void => {
      if (word.length === 0) return;
      if (line.length > 0 && lineRun + gapRun + wordRun - tracking > limit) {
        // The spaces at a break belong to neither line.
        lines.push({ glyphs: line, width: lineRun - tracking });
        line = word;
        lineRun = wordRun;
      } else {
        line = line.concat(gap, word);
        lineRun += gapRun + wordRun;
      }
      gap = [];
      gapRun = 0;
      word = [];
      wordRun = 0;
    };
    for (const ch of paragraph) {
      const g = glyphFor(ch) ?? MISSING_GLYPH;
      if (g === SPACE) {
        endWord();
        gap.push(g);
        gapRun += g.width + tracking;
      } else {
        word.push(g);
        wordRun += g.width + tracking;
      }
    }
    endWord();
    line = line.concat(gap);
    lineRun += gapRun;
    lines.push({ glyphs: line, width: Math.max(0, lineRun - tracking) });
  }
  return lines;
}

function linesOf(text: string, opts: LayoutOptions): Line[] {
  const unit = opts.size / CAP_HEIGHT;
  return breakLines(text, opts.tracking ?? DEFAULT_TRACKING, opts.maxWidth === undefined ? Infinity : opts.maxWidth / unit);
}

function extent(lines: Line[], opts: LayoutOptions): { width: number; height: number; lineCount: number } {
  const unit = opts.size / CAP_HEIGHT;
  let widest = 0;
  for (const l of lines) if (l.width > widest) widest = l.width;
  return {
    width: widest * unit,
    height: opts.size * (1 + (lines.length - 1) * (opts.lineHeight ?? DEFAULT_LINE_HEIGHT)),
    lineCount: lines.length,
  };
}

/** The size a string will take, without building its strokes. */
export function measureText(text: string, opts: LayoutOptions): { width: number; height: number; lineCount: number } {
  return extent(linesOf(text, opts), opts);
}

/**
 * Lay a string out as pixel polylines. The origin is the top-left corner of the text block: x = 0
 * is the left edge of the widest line and y = 0 the first cap line. Strokes are centre lines, so
 * the ink reaches half a stroke weight past them.
 */
export function layoutText(text: string, opts: LayoutOptions): TextLayout {
  const unit = opts.size / CAP_HEIGHT;
  const tracking = opts.tracking ?? DEFAULT_TRACKING;
  const lines = linesOf(text, opts);
  const block = extent(lines, opts);
  const shift = ALIGN_SHIFT[opts.align ?? 'left'];
  const lead = opts.size * (opts.lineHeight ?? DEFAULT_LINE_HEIGHT);
  const polylines: number[][] = [];
  lines.forEach((line, row) => {
    let x = (block.width - line.width * unit) * shift;
    const y = row * lead;
    for (const g of line.glyphs) {
      for (const stroke of g.strokes) {
        const p = new Array<number>(stroke.length);
        for (let i = 0; i < stroke.length; i += 2) {
          p[i] = x + stroke[i] * unit;
          p[i + 1] = y + stroke[i + 1] * unit;
        }
        polylines.push(p);
      }
      x += (g.width + tracking) * unit;
    }
  });
  return { polylines, ...block };
}
