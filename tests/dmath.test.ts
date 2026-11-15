// The deterministic math module must be (1) pure: built only from operations every engine
// rounds identically; (2) accurate: indistinguishable from the engine's own functions in play;
// (3) pinned: its exact bits are committed, so any engine or any edit that changes one fails here.
//
// After a deliberate change to src/core/dmath.ts, regenerate the pinned bits with
//   UPDATE_GOLDEN=1 npx vitest run tests/dmath.test.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HALF_PI, PI, TAU, datan2, dcos, dexp, dhypot, dsin, wrapAngle } from '../src/core/dmath';
import { Rng } from '../src/core/rng';

const SOURCE = join(__dirname, '..', 'src', 'core', 'dmath.ts');
const GOLDEN = join(__dirname, 'dmath.golden.json');

function bits(v: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, v);
  return view.getUint32(0).toString(16).padStart(8, '0') + view.getUint32(4).toString(16).padStart(8, '0');
}

/** One unit in the last place of v. */
function ulp(v: number): number {
  const a = Math.abs(v);
  if (a === 0 || !Number.isFinite(a)) return Number.MIN_VALUE;
  const e = Math.floor(Math.log2(a));
  return Math.max(Number.MIN_VALUE, 2 ** (e - 52));
}

describe('dmath is pure', () => {
  it('uses nothing but exact operations', () => {
    const code = readFileSync(SOURCE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const allowed = new Set(['sqrt', 'abs', 'floor', 'ceil', 'round', 'trunc', 'sign', 'min', 'max']);
    const used = [...code.matchAll(/\bMath\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    expect(used.filter((m) => !allowed.has(m))).toEqual([]);
    expect(/\*\*/.test(code)).toBe(false);
    expect(/\bimport\b/.test(code)).toBe(false);
    expect(/\b(Number|parseFloat|parseInt|BigInt|Float64Array|DataView|toFixed|toString)\b/.test(code)).toBe(false);
  });
});

describe('dmath is accurate', () => {
  it('sine and cosine stay within about an ulp of the engine over the range the game uses', () => {
    const rng = new Rng(7);
    let worst = 0;
    for (let i = 0; i < 300000; i++) {
      const mag = i % 3 === 0 ? 8 : i % 3 === 1 ? 1000 : 1e5;
      const x = rng.float(-mag, mag);
      worst = Math.max(worst, Math.abs(dsin(x) - Math.sin(x)), Math.abs(dcos(x) - Math.cos(x)));
    }
    expect(worst).toBeLessThan(4.5e-16);
  });

  it('sine and cosine are right at and beside every quarter turn', () => {
    for (let k = -4000; k <= 4000; k++) {
      const x = k * (Math.PI / 4);
      for (const v of [x, x + ulp(x), x - ulp(x), x + 1e-9, x - 1e-9]) {
        expect(Math.abs(dsin(v) - Math.sin(v))).toBeLessThan(4.5e-16);
        expect(Math.abs(dcos(v) - Math.cos(v))).toBeLessThan(4.5e-16);
      }
    }
  });

  it('keeps the identities exactly where they are exact', () => {
    expect(dcos(0)).toBe(1);
    expect(dsin(0)).toBe(0);
    expect(dexp(0)).toBe(1);
    expect(datan2(0, 1)).toBe(0);
    expect(datan2(1, 0)).toBe(HALF_PI);
    expect(datan2(0, -1)).toBe(PI);
    expect(datan2(-1, 0)).toBe(-HALF_PI);
    expect(datan2(0, 0)).toBe(0);
    expect(PI).toBe(Math.PI);
    expect(TAU).toBe(Math.PI * 2);
    expect(HALF_PI).toBe(Math.PI / 2);
    const rng = new Rng(11);
    for (let i = 0; i < 20000; i++) {
      const x = rng.float(-500, 500);
      // sine is odd and cosine even, bit for bit
      expect(bits(dsin(-x))).toBe(bits(-dsin(x)));
      expect(bits(dcos(-x))).toBe(bits(dcos(x)));
      const s = dsin(x);
      const c = dcos(x);
      expect(Math.abs(s * s + c * c - 1)).toBeLessThan(4.5e-16);
    }
  });

  it('arctangent stays within about an ulp over every quadrant and magnitude', () => {
    const rng = new Rng(13);
    let worst = 0;
    const mags = [1e-300, 1e-12, 0.001, 1, 37, 1e6, 1e150, 1e300];
    for (let i = 0; i < 300000; i++) {
      const y = rng.float(-1, 1) * mags[i % mags.length];
      const x = rng.float(-1, 1) * mags[(i >> 3) % mags.length];
      const want = Math.atan2(y, x);
      const got = datan2(y, x);
      // the engine answers -PI on the negative x axis from below; this module always says PI
      const err = Math.abs(Math.abs(want) === Math.PI && Math.abs(got) === Math.PI ? 0 : got - want);
      worst = Math.max(worst, err / Math.max(1, Math.abs(want)));
    }
    expect(worst).toBeLessThan(4.5e-16);
    expect(datan2(Infinity, Infinity)).toBeCloseTo(Math.PI / 4, 15);
    expect(datan2(-Infinity, 5)).toBe(-HALF_PI);
    expect(datan2(3, -Infinity)).toBe(PI);
    expect(Number.isNaN(datan2(NaN, 1))).toBe(true);
  });

  it('arctangent never steps backwards across its reduction seams', () => {
    // along the unit circle the angle must grow with the parameter, seam or no seam
    for (const ratio of [0.125, 0.375, 0.71875, 1]) {
      let last = -Infinity;
      for (let i = -2000; i <= 2000; i++) {
        const a = datan2(ratio + i * 1e-13, 1);
        expect(a).toBeGreaterThanOrEqual(last);
        last = a;
      }
    }
  });

  it('the exponential stays within about an ulp, and saturates at the ends', () => {
    const rng = new Rng(17);
    let worst = 0;
    for (let i = 0; i < 300000; i++) {
      const x = i % 2 === 0 ? rng.float(-20, 20) : rng.float(-700, 700);
      const want = Math.exp(x);
      worst = Math.max(worst, Math.abs(dexp(x) - want) / want);
    }
    expect(worst).toBeLessThan(4.5e-16);
    expect(dexp(1000)).toBe(Infinity);
    expect(dexp(-1000)).toBe(0);
    expect(Number.isNaN(dexp(NaN))).toBe(true);
    let last = 0;
    for (let i = -4000; i <= 4000; i++) {
      const v = dexp(i * 0.0013);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it('wraps angles into (-PI, PI] and leaves those already there alone', () => {
    const rng = new Rng(19);
    for (let i = 0; i < 50000; i++) {
      const a = rng.float(-PI, PI);
      if (a > -PI) expect(wrapAngle(a)).toBe(a);
      const big = rng.float(-5000, 5000);
      const w = wrapAngle(big);
      expect(w).toBeGreaterThan(-PI);
      expect(w).toBeLessThanOrEqual(PI);
      expect(Math.abs(Math.sin(w) - Math.sin(big))).toBeLessThan(1e-11);
      expect(Math.abs(Math.cos(w) - Math.cos(big))).toBeLessThan(1e-11);
    }
    expect(wrapAngle(PI)).toBe(PI);
    expect(wrapAngle(-PI)).toBe(PI);
    expect(wrapAngle(3 * PI)).toBeCloseTo(PI, 12);
  });

  it('measures lengths with one square root', () => {
    expect(dhypot(3, 4)).toBe(5);
    expect(dhypot(0, 0)).toBe(0);
    expect(dhypot(-5, 12)).toBe(13);
  });

  it('answers do not depend on what was asked before', () => {
    const a = [dsin(1.25), dcos(-7.5), datan2(0.3, -2), dexp(-3.2)];
    for (let i = 0; i < 1000; i++) {
      dsin(i * 31.7);
      dexp(i * 0.01 - 5);
      datan2(i, 1000 - i);
    }
    expect([dsin(1.25), dcos(-7.5), datan2(0.3, -2), dexp(-3.2)].map(bits)).toEqual(a.map(bits));
  });

  it('is fast enough to be called thousands of times a tick', () => {
    const t0 = performance.now();
    let acc = 0;
    for (let i = 0; i < 1000000; i++) acc += dsin(i * 0.001);
    const ms = performance.now() - t0;
    expect(Number.isFinite(acc)).toBe(true);
    expect(ms).toBeLessThan(2000);
  });
});

describe('dmath is pinned', () => {
  /** A fixed spread of awkward inputs. */
  function inputs(): number[] {
    const xs: number[] = [
      0, 1e-320, 1e-300, 1e-20, 1e-9, 1e-5, 0.001, 0.1, 0.25, 0.5, 0.7853981633974483, 1, 1.5707963267948966, 2, 3, 3.141592653589793, 4.71238898038469, 6.283185307179586, 10, 100, 1000, 12345.678,
      99999.5, 1e5,
    ];
    for (let i = 1; i <= 60; i++) xs.push(i * 0.37 + 0.011 * i * i, i * 7.853981633974483 + 1e-7 * i, 1 / (i * 3.7));
    const out: number[] = [];
    for (const x of xs) out.push(x, -x);
    return out;
  }

  it('every result has exactly the committed bits', () => {
    const xs = inputs();
    const now = {
      sin: xs.map((x) => bits(dsin(x))),
      cos: xs.map((x) => bits(dcos(x))),
      exp: xs.filter((x) => Math.abs(x) <= 700).map((x) => bits(dexp(x))),
      atan2: xs.map((x, i) => bits(datan2(x, xs[(i * 7 + 3) % xs.length]))),
      wrap: xs.map((x) => bits(wrapAngle(x))),
    };
    if (process.env.UPDATE_GOLDEN === '1' || !existsSync(GOLDEN)) writeFileSync(GOLDEN, `${JSON.stringify(now)}\n`);
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as typeof now;
    expect(now.sin.length).toBeGreaterThan(300);
    expect(now).toEqual(golden);
  });
});
