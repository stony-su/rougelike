// Deterministic math for the lockstep simulation.
//
// WHY THIS FILE EXISTS
// The simulation runs in lockstep on several machines, so every machine must compute the very
// same bits. JavaScript only promises exact IEEE-754 results for + - * / and the square root.
// The built-in sine, cosine, arctangent, exponential, hypot and power routines are allowed to
// differ in the last bit from one engine to the next, and one differing bit is enough to pull
// two machines apart. The simulation therefore calls the functions below instead of those.
//
// THE RULE
// Inside this file the only things allowed are + - * / and unary minus, comparisons, Math.sqrt,
// Math.abs, Math.floor, Math.ceil, Math.round, Math.trunc, Math.sign, Math.min, Math.max, numeric
// literals, ordinary control flow and ordinary arrays. No other Math member, no power operator,
// no number formatting or parsing, no typed-array bit tricks, no bigint, no imports.
// tests/dmath.test.ts reads this file as text and fails when the rule is broken. It also pins
// the exact bits of several hundred results, so no change to the arithmetic here goes unnoticed.
//
// HOW IT IS BUILT
// Every constant is either a decimal literal of at most 20 significant digits (which the language
// requires to be rounded correctly) or an exact quotient of integers. The series used are the
// plain Taylor series, whose coefficients are reciprocals of factorials or of odd numbers; the
// work is in reducing the argument first so that a short series is enough, and in carrying the
// rounding error of each reduction along as a second, tiny number ("lo" next to "hi").
//
// WHAT A CALLER MUST KNOW
// - Finite inputs give finite, bit-identical results on every engine. A NaN input gives NaN, but
//   the bit pattern of a NaN is not portable, so never feed a NaN into a state hash.
// - dsin, dcos and wrapAngle work for abs(x) below 2^29 (about 5.4e8). Past that the angle can no
//   longer be resolved and is treated as 0: dsin gives 0, dcos gives 1, wrapAngle gives 0.
// - datan2 and wrapAngle answer in (-PI, PI]. They never return -PI, and datan2 treats -0 as 0.

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

const INF = 1 / 0;

// What the doubles above leave out of the true pi and pi/2, and the same pair for pi/4.
const PI_LO = 1.2246467991473531772e-16;
const HALF_PI_LO = 6.1232339957367658861e-17;
const QUARTER_PI = 0.78539816339744830962;
const QUARTER_PI_LO = 3.0616169978683829431e-17;

// 1/n! for the Taylor series of sine, cosine and the exponential. Exact integers, one division.
const F2 = 1 / 2;
const F3 = 1 / 6;
const F4 = 1 / 24;
const F5 = 1 / 120;
const F6 = 1 / 720;
const F7 = 1 / 5040;
const F8 = 1 / 40320;
const F9 = 1 / 362880;
const F10 = 1 / 3628800;
const F11 = 1 / 39916800;
const F12 = 1 / 479001600;
const F13 = 1 / 6227020800;
const F14 = 1 / 87178291200;
const F15 = 1 / 1307674368000;
const F16 = 1 / 20922789888000;
const F17 = 1 / 355687428096000;
const F18 = 1 / 6402373705728000;

// Adding and then subtracting 1.5 * 2^26 rounds a number below 1 to a multiple of 2^-26. Such a
// "head" has at most 26 bits, so its square is exact; the rest of the number is the "tail".
// With 1.5 * 2^35 the head is a multiple of 2^-17 and even its cube is exact.
const SPLIT = 100663296;
const SPLIT_CUBE = 51539607552;

// ---------------------------------------------------------------------------------------------
// Sine and cosine
// ---------------------------------------------------------------------------------------------

// pi/2 cut into pieces (Cody and Waite): four pieces of 24 bits each, which are the digits of
// pi/2 in base 2^24, and a last piece holding the next 53 bits. A whole number below 2^29 times
// a 24-bit piece is exact, so k * (pi/2) can be taken off an angle piece by piece without loss.
const R24 = 1 / 16777216;
const PIO2_1 = 13176794 * (2 * R24);
const PIO2_2 = 10625384 * (2 * R24) * R24;
const PIO2_3 = 12727492 * (2 * R24) * R24 * R24;
const PIO2_4 = 13001355 * (2 * R24) * R24 * R24 * R24;
const PIO2_5 = 1.2706558760139877883e-29;
const TWO_OVER_PI = 0.63661977236758134308;
const INV_TAU = 0.15915494309189533577;
const TRIG_LIMIT = 536870912;
const SIN_TINY = 1 / 67108864;
const COS_TINY = 1 / 134217728;

// Works on the remainder a - k * (pi/2), where k is a whole number near a / (pi/2) and both are
// below 2^29 in size. pick 0, 1, 2, 3 returns sin, cos, -sin, -cos of the remainder; pick 4
// returns the remainder itself, rounded once.
function onQuarterTurns(a: number, k: number, pick: number): number {
  // The first product and difference are exact. Each later step is an error-free subtraction:
  // t is the rounded difference and the rounding error, itself a double, is added to lo.
  let hi = a - k * PIO2_1;
  let w = k * PIO2_2;
  let t = hi - w;
  let v = t - hi;
  let lo = (hi - (t - v)) - (w + v);
  hi = t;
  w = k * PIO2_3;
  t = hi - w;
  v = t - hi;
  lo += (hi - (t - v)) - (w + v);
  hi = t;
  w = k * PIO2_4;
  t = hi - w;
  v = t - hi;
  lo += (hi - (t - v)) - (w + v);
  hi = t;
  lo -= k * PIO2_5;
  // r + rr is the remainder to about 100 bits, with rr below half a unit in the last place of r.
  const r = hi + lo;
  if (pick === 4) return r;
  v = r - hi;
  const rr = (hi - (r - v)) + (lo - v);
  const z = r * r;
  if (pick === 0 || pick === 2) {
    // sin(r + rr) = r - r^3/3! + r^5/5! - ... + r^17/17!  +  rr * cos(r).
    // With r = rh + rl the cube rh^3 is exact. d is rh^3/6 rounded, and what that rounding lost
    // is known exactly too: (rh^3 - 6 d) / 6, where the subtraction is exact. So r - d is the
    // only large step, its rounding error is recovered, and everything else is small.
    const rh = (r + SPLIT_CUBE) - SPLIT_CUBE;
    const rl = r - rh;
    const sq = rh * rh;
    const cube = sq * rh;
    const d = cube * F3;
    const dLo = ((cube - 4 * d) - 2 * d) * F3;
    const p = F5 - z * (F7 - z * (F9 - z * (F11 - z * (F13 - z * (F15 - z * F17)))));
    const small = ((z * z * r * p - rl * ((z + sq) + r * rh) * F3) - dLo) + rr * (1 - z * (F2 - z * F4));
    const s = r - d;
    const sine = s + (((r - s) - d) + small);
    return pick === 0 ? sine : -sine;
  }
  // cos(r + rr) = 1 - r^2/2 + r^4/4! - ... - r^18/18!  -  rr * sin(r).
  // With r = rh + rl, 1 - rh^2/2 is exact and r^2 - rh^2 = rl * (r + rh), so the two large terms
  // cost no rounding at all and the single rounding left is the last addition.
  const rh = (r + SPLIT) - SPLIT;
  const rl = r - rh;
  const p = F4 - z * (F6 - z * (F8 - z * (F10 - z * (F12 - z * (F14 - z * (F16 - z * F18))))));
  const c = (1 - 0.5 * rh * rh) + (z * z * p - (0.5 * rl * (r + rh) + rr * (r - z * r * F3)));
  return pick === 1 ? c : -c;
}

// Sine. Domain abs(x) < 2^29 (0 beyond, NaN for NaN and infinities); within 1 ulp of the truth.
export function dsin(x: number): number {
  const ax = Math.abs(x);
  if (ax < SIN_TINY) return x;
  if (!(ax < TRIG_LIMIT)) return x - x;
  const k = Math.floor(ax * TWO_OVER_PI + 0.5);
  const s = onQuarterTurns(ax, k, k - 4 * Math.floor(k * 0.25));
  return x < 0 ? -s : s;
}

// Cosine. Domain abs(x) < 2^29 (1 beyond, NaN for NaN and infinities); within 1 ulp of the truth.
export function dcos(x: number): number {
  const ax = Math.abs(x);
  if (ax < COS_TINY) return 1;
  if (!(ax < TRIG_LIMIT)) return x - x + 1;
  const k = Math.floor(ax * TWO_OVER_PI + 0.5);
  const j = k + 1;
  return onQuarterTurns(ax, k, j - 4 * Math.floor(j * 0.25));
}

// Angle wrapped to (-PI, PI]. Domain abs(a) < 2^29 (0 beyond); values already in range come back
// untouched, others are reduced by the true 2 pi to within 1 ulp.
export function wrapAngle(a: number): number {
  if (a > -PI && a <= PI) return a;
  if (!(Math.abs(a) < TRIG_LIMIT)) return a - a;
  const n = Math.floor(a * INV_TAU + 0.5);
  let r = onQuarterTurns(a, 4 * n, 4);
  if (r > PI) r = onQuarterTurns(a, 4 * (n + 1), 4);
  else if (r <= -PI) r = onQuarterTurns(a, 4 * (n - 1), 4);
  return r > -PI && r <= PI ? r : PI;
}

// ---------------------------------------------------------------------------------------------
// Arctangent
// ---------------------------------------------------------------------------------------------

// atan(1/4) and atan(1/2), each as the nearest double plus what that double leaves out.
const ATAN_QUARTER = 0.24497866312686415417;
const ATAN_QUARTER_LO = 1.0698755618734451494e-17;
const ATAN_HALF = 0.46364760900080611621;
const ATAN_HALF_LO = 2.2698777452961686568e-17;
// 2^27 + 1: multiplying by it splits a double into two halves of 26 bits (Veltkamp), which lets
// the exact product of two doubles be written as a rounded product plus an error (Dekker).
const SPLITTER = 134217729;
const TWO_30 = 1073741824;
// Powers of two used to pull very large or very small pairs into a safe range without rounding.
const TWO_500 = 3.2733906078961419e150;
const TWO_M500 = 3.0549363634996047e-151;
const TWO_600 = 4.1495155688809930e180;
const TWO_M600 = 2.4099198651028841e-181;

// Angle of the point (x, y), in (-PI, PI]. Any finite or infinite pair; (0, 0) gives 0, -0 counts
// as 0 and -PI is never returned (PI instead); within 1 ulp of the truth.
export function datan2(y: number, x: number): number {
  if (x !== x || y !== y) return x + y;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const steep = ay > ax;
  let a = steep ? ax : ay;
  let b = steep ? ay : ax;
  if (b === 0) return 0;
  if (b === INF) {
    // Two infinities sit on a diagonal; one infinity dwarfs any finite partner.
    a = a === INF ? 1 : 0;
    b = 1;
  }
  // atan(a / b) with 0 <= a <= b, as hi + lo.
  let hi: number;
  let lo: number;
  if (a * TWO_30 < b) {
    // A ratio below 2^-30 is its own arctangent to well past the last bit.
    hi = a / b;
    lo = 0;
  } else {
    if (b > TWO_500) {
      a *= TWO_M600;
      b *= TWO_M600;
    } else if (b < TWO_M500) {
      a *= TWO_600;
      b *= TWO_600;
    }
    // atan(a/b) = atan(c) + atan(u) with u = (a - c b) / (b + c a). The breakpoint c is 0, 1/4,
    // 1/2 or 1, whichever leaves abs(u) below 0.17. Multiplying by such a c is exact, the
    // subtraction on top is exact, and the sum below is kept exactly as den + denLo.
    let c: number;
    let atanC: number;
    let atanCLo: number;
    if (a * 8 < b) {
      c = 0;
      atanC = 0;
      atanCLo = 0;
    } else if (a < b * 0.375) {
      c = 0.25;
      atanC = ATAN_QUARTER;
      atanCLo = ATAN_QUARTER_LO;
    } else if (a < b * 0.71875) {
      c = 0.5;
      atanC = ATAN_HALF;
      atanCLo = ATAN_HALF_LO;
    } else {
      c = 1;
      atanC = QUARTER_PI;
      atanCLo = QUARTER_PI_LO;
    }
    const num = a - c * b;
    const ca = c * a;
    const den = b + ca;
    const denLo = ca - (den - b);
    // u = num / den, then one correction step: the exact remainder num - u * (den + denLo),
    // found with an exact product, gives the part of the quotient that u had to round away.
    const inv = 1 / den;
    const u = num * inv;
    let s = u * SPLITTER;
    const uh = s - (s - u);
    const ul = u - uh;
    s = den * SPLITTER;
    const dh = s - (s - den);
    const dl = den - dh;
    const prod = u * den;
    const prodLo = ((uh * dh - prod) + uh * dl + ul * dh) + ul * dl;
    const uLo = (((num - prod) - prodLo) - u * denLo) * inv;
    // atan(u + uLo) = u - u^3/3 + u^5/5 - ... + u^21/21  +  uLo / (1 + u^2)
    const z = u * u;
    const p =
      A3 - z * (A5 - z * (A7 - z * (A9 - z * (A11 - z * (A13 - z * (A15 - z * (A17 - z * (A19 - z * A21))))))));
    const small = uLo * (1 - z) - u * z * p;
    hi = atanC + u;
    lo = (u - (hi - atanC)) + (atanCLo + small);
  }
  // Place the octant. Each line adds or subtracts exactly and rounds once at the end.
  let r: number;
  if (x < 0) {
    if (steep) {
      const s = HALF_PI + hi;
      r = s + ((hi - (s - HALF_PI)) + (HALF_PI_LO + lo));
    } else {
      const s = PI - hi;
      r = s + (((PI - s) - hi) + (PI_LO - lo));
    }
  } else if (steep) {
    const s = HALF_PI - hi;
    r = s + (((HALF_PI - s) - hi) + (HALF_PI_LO - lo));
  } else {
    r = hi + lo;
  }
  return y < 0 && r < PI ? -r : r;
}

// 1/n for the arctangent series.
const A3 = 1 / 3;
const A5 = 1 / 5;
const A7 = 1 / 7;
const A9 = 1 / 9;
const A11 = 1 / 11;
const A13 = 1 / 13;
const A15 = 1 / 15;
const A17 = 1 / 17;
const A19 = 1 / 19;
const A21 = 1 / 21;

// ---------------------------------------------------------------------------------------------
// Exponential
// ---------------------------------------------------------------------------------------------

// ln 2 as a 32-bit head (so that k * LN2_HI is exact for every k that can occur) plus the rest.
const LN2_HI = 2977044471 / 4294967296;
const LN2_LO = 1.9082149292705878161e-10;
const INV_LN2 = 1.4426950408889634074;

// POW2[POW2_ZERO + k] is 2^k for k from -1021 to 1023, built by exact doubling and halving.
const POW2_ZERO = 1021;
const POW2: number[] = [];
{
  let p = 1;
  for (let i = 0; i < 1021; i++) p *= 0.5;
  for (let k = -1021; k <= 1023; k++) {
    POW2.push(p);
    if (k < 1023) p *= 2;
  }
}
const TWO_M100 = POW2[POW2_ZERO - 100];

// e^x. Any x: 0 below -745.14, Infinity above 709.78; within 1 ulp of the truth.
export function dexp(x: number): number {
  if (x !== x) return x;
  if (x > 710) return INF;
  if (x < -746) return 0;
  // x = k ln 2 + r with abs(r) <= 0.35. hi is exact; c is what the rounding of r left out.
  const k = Math.floor(x * INV_LN2 + 0.5);
  const hi = x - k * LN2_HI;
  const lo = k * LN2_LO;
  const r = hi - lo;
  const c = (hi - r) - lo;
  // e^r = 1 + r + r^2/2 + r^3/3! + ... + r^14/14!. With r = rh + rl the three large terms
  // 1 + r + rh^2/2 are added without loss (s2 plus the two rounding errors e1 and e2) and
  // everything small is gathered in tail, so the only rounding that matters is the last one.
  const rh = (r + SPLIT) - SPLIT;
  const rl = r - rh;
  const sq = 0.5 * rh * rh;
  const p =
    F3 +
    r * (F4 + r * (F5 + r * (F6 + r * (F7 + r * (F8 + r * (F9 + r * (F10 + r * (F11 + r * (F12 + r * (F13 + r * F14))))))))));
  const tail = r * r * r * p + (0.5 * rl * (r + rh) + (c + c * r));
  const s1 = 1 + r;
  const e1 = r - (s1 - 1);
  const s2 = s1 + sq;
  const e2 = sq - (s2 - s1);
  const m = s2 + ((e1 + e2) + tail);
  // Times 2^k. The products are exact unless the result overflows or drops into the subnormal
  // range, where the last multiplication rounds once, as it should.
  if (k > 1023) return m * POW2[POW2_ZERO + 1023] * 2;
  if (k < -1021) return m * POW2[POW2_ZERO + k + 100] * TWO_M100;
  return m * POW2[POW2_ZERO + k];
}

// ---------------------------------------------------------------------------------------------
// Length
// ---------------------------------------------------------------------------------------------

// Length of (x, y), correctly rounded up to one extra rounding of the sum. Squares overflow above
// about 1e154 and vanish below about 1e-154, so keep coordinates well inside that.
export function dhypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}
