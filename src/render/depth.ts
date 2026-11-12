// Depth sorting for upright things on the entity layer.
//
// The sort key belongs to a ground FOOTPRINT, not to an entity: anything large is split into
// pieces that each register their own footprint (one per leg, one per pillar). The key is
// x + y of the footprint's ground position, plus a small class bias, plus insertion order as a
// stable tie-break, so two things on the same spot never flicker.
//
// Children are only re-ordered when the order actually changes, so a frame in which nobody
// overtakes anybody costs no scene-graph work.
import type { Container } from 'pixi.js';

export interface Sortable {
  view: Container;
  depth: number;
  /** Small bias within the same depth: negative draws behind (a stake sits just behind its planter). */
  bias: number;
  /** Insertion order; stable tie-break. */
  seq: number;
}

export class DepthLayer {
  private readonly items: Sortable[] = [];
  private seq = 0;
  private dirty = false;

  constructor(private readonly container: Container) {}

  add(view: Container, depth = 0, bias = 0): Sortable {
    const it: Sortable = { view, depth, bias, seq: this.seq++ };
    this.items.push(it);
    this.container.addChild(view);
    this.dirty = true;
    return it;
  }

  remove(it: Sortable): void {
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
    if (it.view.parent === this.container) this.container.removeChild(it.view);
  }

  /** Call once per frame after views have written their depths. */
  sort(): void {
    const a = this.items;
    let moved = this.dirty;
    for (let i = 1; i < a.length; i++) {
      const it = a[i];
      const key = it.depth + it.bias;
      let j = i - 1;
      while (j >= 0) {
        const o = a[j];
        const ok = o.depth + o.bias;
        if (ok < key || (ok === key && o.seq < it.seq)) break;
        a[j + 1] = o;
        j--;
      }
      if (j + 1 !== i) {
        a[j + 1] = it;
        moved = true;
      }
    }
    if (!moved) return;
    this.dirty = false;
    for (let i = 0; i < a.length; i++) {
      if (this.container.children[i] !== a[i].view) this.container.setChildIndex(a[i].view, i);
    }
  }

  get count(): number {
    return this.items.length;
  }
}
