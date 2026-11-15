// The render scale that looks after itself. A laptop with integrated graphics holds sixty frames a
// second at one pixel for one, and not at two for one: the picture is then drawn with fewer
// pixels and stretched, until the frames are short again. Nothing about the game changes, only
// how sharp it is; and every so often it tries a step back up, in case the hard part is over.
//
// It is given the length of every frame and decides in spans of them. What is judged is how many
// frames of a span ran long, not their mean: behind a display's own timing a frame that misses is
// shown a whole refresh late, so a scene a little too heavy shows as every second frame long.

export const QUALITY = {
  /** Frames judged together. */
  span: 72,
  /** A frame longer than this many milliseconds has missed its place (sixty a second is 16.7). */
  long: 20,
  /** A span with more than this share of long frames is too slow. */
  slow: 0.12,
  /** A span with a frame this long is not judged at all: the page was hidden, or something was loading. */
  hitch: 250,
  /** Each step down multiplies the scale by this; it never goes below `floor`. */
  step: 0.85,
  floor: 0.5,
  /** Good spans in a row before it tries a step up; the wait doubles each time the step up does not hold, up to `patienceMost`. */
  patience: 8,
  patienceMost: 96,
  /** Spans passed over unjudged when a chamber has just been built (its floor is baked, its shaders are warmed): those frames say nothing. */
  arrive: 3,
};

export class Quality {
  /** What the chosen sharpness is multiplied by: 1, or less while the frames run long. */
  scale = 1;
  private readonly frames: number[] = [];
  private good = 0;
  private wait = QUALITY.patience;
  /** The last change was a step up that has yet to show it holds. */
  private trying = false;
  /** Spans left to pass over unjudged: the frames round a change of scale, or the building of a chamber, are never typical. */
  private settle = QUALITY.arrive;

  /** `apply` is told the scale whenever it changes. */
  constructor(private readonly apply: (scale: number) => void) {}

  /** Begin again at full sharpness: the player chose another, or the picture is another's now. */
  reset(): void {
    this.frames.length = 0;
    this.good = 0;
    this.wait = QUALITY.patience;
    this.trying = false;
    this.settle = QUALITY.arrive;
    if (this.scale !== 1) {
      this.scale = 1;
      this.apply(1);
    }
  }

  /** A new chamber has just been built: what the next frames take says nothing about the ones after. */
  arrived(): void {
    this.frames.length = 0;
    this.settle = Math.max(this.settle, QUALITY.arrive);
  }

  /** One frame took this many milliseconds. */
  frame(ms: number): void {
    this.frames.push(ms);
    if (this.frames.length < QUALITY.span) return;
    let long = 0;
    let hitch = false;
    for (const f of this.frames) {
      if (f > QUALITY.long) long++;
      if (f > QUALITY.hitch) hitch = true;
    }
    this.frames.length = 0;
    if (this.settle > 0) {
      this.settle--;
      return;
    }
    if (hitch) return;

    if (long > QUALITY.span * QUALITY.slow) {
      // too slow: a step down. If this was a step up being tried, it did not hold: wait longer before the next.
      if (this.trying) this.wait = Math.min(QUALITY.patienceMost, this.wait * 2);
      this.trying = false;
      this.good = 0;
      this.set(Math.max(QUALITY.floor, this.scale * QUALITY.step));
      return;
    }
    this.good++;
    // a step up that has lasted a few spans has held
    if (this.trying && this.good >= 3) this.trying = false;
    if (this.scale < 1 && this.good >= this.wait) {
      this.good = 0;
      this.trying = true;
      // back up the same ladder it came down, and to exactly 1 at the top
      const up = this.scale / QUALITY.step;
      this.set(up > 0.97 ? 1 : up);
    }
  }

  private set(scale: number): void {
    if (scale === this.scale) return;
    this.scale = scale;
    this.settle = 1;
    this.apply(scale);
  }
}
