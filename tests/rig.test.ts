// Rigs and animators are pixi-free, so their coverage can be checked here: every declared state
// must produce a real, finite, moving pose.
import { describe, expect, it } from 'vitest';
import { animInput, block, clipBelow, ell, hatchPoly, restPose, topEdges, validateRig } from '../src/render/rig/def';
import type { Animator, PartPose, PoseWriter, RigDef } from '../src/render/rig/def';
import { RIGS } from '../src/render/rig/registry';

class Recorder implements PoseWriter {
  readonly poses = new Map<string, PartPose>();
  constructor(names: string[]) {
    for (const n of names) this.poses.set(n, restPose());
  }
  part(name: string): PartPose {
    return this.poses.get(name) ?? restPose();
  }
  reset(): void {
    for (const p of this.poses.values()) Object.assign(p, restPose());
  }
  /** How far this pose is from rest, summed over parts. */
  energy(): number {
    let e = 0;
    for (const p of this.poses.values()) e += Math.abs(p.x) + Math.abs(p.y) + Math.abs(p.rot) * 20 + Math.abs(p.sx - 1) * 20 + Math.abs(p.sy - 1) * 20;
    return e;
  }
  snapshot(): string {
    return [...this.poses.values()].map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.rot.toFixed(3)},${p.sx.toFixed(3)},${p.sy.toFixed(3)}`).join('|');
  }
  finite(): boolean {
    for (const p of this.poses.values()) {
      if (![p.x, p.y, p.rot, p.sx, p.sy].every(Number.isFinite)) return false;
    }
    return true;
  }
}

function sample(def: RigDef, animator: Animator, state: string, variant: number): { frames: string[]; maxEnergy: number; finite: boolean; rates: number[] } {
  const rec = new Recorder(def.parts.map((p) => p.name));
  const frames: string[] = [];
  const rates: number[] = [];
  let maxEnergy = 0;
  let finite = true;
  for (let i = 0; i <= 10; i++) {
    const a = animInput();
    a.state = state;
    a.variant = variant;
    a.phase = i / 10;
    a.t = (i / 10) * 0.6;
    a.time = 2 + i * 0.13;
    a.stride = i * 0.21;
    a.speed = 1;
    a.aim = -0.4;
    a.seed = 0.37;
    rec.reset();
    rates.push(animator(rec, a));
    frames.push(rec.snapshot());
    maxEnergy = Math.max(maxEnergy, rec.energy());
    if (!rec.finite()) finite = false;
  }
  return { frames, maxEnergy, finite, rates };
}

describe('rig definitions', () => {
  for (const [id, entry] of Object.entries(RIGS)) {
    it(`${id} is well formed`, () => {
      expect(validateRig(entry.def)).toEqual([]);
      expect(entry.def.parts.length).toBeGreaterThanOrEqual(5);
      expect(entry.def.height).toBeGreaterThan(10);
    });

    it(`${id} declares every required animation state`, () => {
      for (const s of entry.required) expect(entry.def.states).toContain(s);
    });

    for (const state of entry.def.states) {
      it(`${id}: "${state}" animates (finite, moving, non-trivial)`, () => {
        for (const variant of entry.variants[state] ?? [0]) {
          const r = sample(entry.def, entry.animator, state, variant);
          expect(r.finite).toBe(true);
          expect(r.rates.every((v) => v > 0)).toBe(true);
          // the pose must leave rest, and must change over the course of the state
          expect(r.maxEnergy).toBeGreaterThan(1.5);
          expect(new Set(r.frames).size).toBeGreaterThanOrEqual(4);
        }
      });
    }
  }
});

describe('part recipe', () => {
  it('clips, hatches and rims an outline', () => {
    const square = [0, 0, 10, 0, 10, 10, 0, 10];
    const lower = clipBelow(square, 6);
    const ys = lower.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeCloseTo(6);
    expect(Math.max(...ys)).toBeCloseTo(10);
    const hatch = hatchPoly(lower, 2, -0.9);
    expect(hatch.length % 4).toBe(0);
    expect(hatch.length).toBeGreaterThan(0);
    for (let i = 0; i < hatch.length; i += 2) {
      expect(hatch[i]).toBeGreaterThanOrEqual(-0.01);
      expect(hatch[i]).toBeLessThanOrEqual(10.01);
      expect(hatch[i + 1]).toBeGreaterThanOrEqual(5.99);
      expect(hatch[i + 1]).toBeLessThanOrEqual(10.01);
    }
    // only the top edge of a square faces up, whichever way it is wound
    expect(topEdges(square)).toEqual([0, 0, 10, 0]);
    expect(topEdges([0, 10, 10, 10, 10, 0, 0, 0])).toEqual([10, 0, 0, 0]);
  });

  it('builds fill, shade, hatch and rim leaves from one outline', () => {
    const shapes = block(ell(0, 0, 10, 14), { fill: 'a', shade: 'b', hatch: 'c', rim: 'd' });
    expect(shapes.map((s) => s.role)).toEqual(['a', 'b', 'c', 'd']);
    expect(shapes.map((s) => s.kind)).toEqual(['poly', 'poly', 'lines', 'lines']);
  });
});
