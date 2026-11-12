// Easing curves on t in [0, 1].

const c = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export const ease = {
  linear: (t: number): number => c(t),
  inQuad: (t: number): number => c(t) * c(t),
  outQuad: (t: number): number => 1 - (1 - c(t)) * (1 - c(t)),
  inOutQuad: (t: number): number => {
    const x = c(t);
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  },
  inCubic: (t: number): number => Math.pow(c(t), 3),
  outCubic: (t: number): number => 1 - Math.pow(1 - c(t), 3),
  inOutCubic: (t: number): number => {
    const x = c(t);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  },
  outQuart: (t: number): number => 1 - Math.pow(1 - c(t), 4),
  outExpo: (t: number): number => (c(t) >= 1 ? 1 : 1 - Math.pow(2, -10 * c(t))),
  inBack: (t: number): number => {
    const x = c(t);
    const k = 1.70158;
    return (k + 1) * x * x * x - k * x * x;
  },
  outBack: (t: number): number => {
    const x = c(t) - 1;
    const k = 1.70158;
    return 1 + (k + 1) * x * x * x + k * x * x;
  },
  outElastic: (t: number): number => {
    const x = c(t);
    if (x === 0 || x === 1) return x;
    return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  outBounce: (t: number): number => {
    let x = c(t);
    const n = 7.5625;
    const d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
    return n * (x -= 2.625 / d) * x + 0.984375;
  },
  /** 0 -> 1 -> 0 over t, peaking at `peak`. */
  pulse: (t: number, peak = 0.5): number => {
    const x = c(t);
    return x < peak ? x / peak : 1 - (x - peak) / (1 - peak);
  },
  /** Smooth 0 -> 1 -> 0. */
  arc: (t: number): number => Math.sin(c(t) * Math.PI),
};

export type EaseFn = (t: number) => number;
