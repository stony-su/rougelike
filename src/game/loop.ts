// Fixed-step accumulator. The simulation always advances in whole ticks; the renderer draws
// between the last two ticks using `alpha`, so motion is smooth at any refresh rate.

export class FixedLoop {
  /** How far the present moment is between the last two ticks, 0..1. */
  alpha = 0;
  private acc = 0;

  constructor(
    private readonly stepMs: number,
    private readonly maxSteps = 5,
  ) {}

  /** Feed real elapsed milliseconds; calls `step` zero or more times. Returns the number of steps run. */
  advance(elapsedMs: number, step: () => void): number {
    // A long stall (tab switch, breakpoint) must not turn into a burst of catch-up ticks.
    this.acc += Math.min(elapsedMs, this.stepMs * this.maxSteps);
    let n = 0;
    while (this.acc >= this.stepMs && n < this.maxSteps) {
      step();
      this.acc -= this.stepMs;
      n++;
    }
    if (this.acc >= this.stepMs) this.acc = 0;
    this.alpha = this.acc / this.stepMs;
    return n;
  }

  reset(): void {
    this.acc = 0;
    this.alpha = 0;
  }
}
