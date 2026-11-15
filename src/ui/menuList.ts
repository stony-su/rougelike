// A list of things to choose from, one under the other: the body of every menu. A row has a
// name, sometimes a few quieter words, and sometimes a value at its right that left and right
// change. The list shows which row is pointed at and reports it; what choosing a row does is the
// screen's business.
import { Container, Graphics } from 'pixi.js';
import { PAPER, UI } from '../render/palette';
import { Label } from './label';
import { uiSound } from './sfx';

export interface MenuEntry {
  label: string;
  /** A few quieter words under the name. */
  note?: string;
  /** Shown at the right of the row. With `adjust`, it wears arrows: left and right change it. */
  value?: string;
  adjust?: boolean;
  /** Cannot be chosen now. */
  off?: boolean;
  /** Its name in another colour (the way out of a run, a thing that cannot be undone). */
  color?: number;
}

const GAP = 6;

class Row extends Container {
  private readonly back = new Graphics();
  private readonly edge = new Graphics();

  constructor(e: MenuEntry, w: number, h: number) {
    super();
    this.back.roundRect(0, 0, w, h, 6).fill({ color: UI.scrim, alpha: 1 });
    this.back.alpha = 0.72;
    this.edge.roundRect(0, 0, w, h, 6).stroke({ width: 2, color: UI.brass, alpha: 0.95 });
    this.edge.roundRect(0, 6, 4, h - 12, 2).fill(UI.brass);
    this.edge.visible = false;
    const name = new Label(e.label, { size: 12, color: e.off ? UI.inkSoft : (e.color ?? PAPER), bold: true, tracking: 0.16 });
    name.position.set(22, e.note ? h / 2 - 15 : h / 2 - 6);
    this.addChild(this.back, this.edge, name);
    if (e.note) {
      const note = new Label(e.note, { size: 8, color: UI.inkSoft, tracking: 0.14 });
      note.position.set(22, h / 2 + 5);
      this.addChild(note);
    }
    if (e.value !== undefined) {
      const value = new Label(e.adjust ? `<   ${e.value}   >` : e.value, { size: 11, color: e.off ? UI.inkSoft : UI.brass, bold: true, tracking: 0.14, align: 'right' });
      value.position.set(w - 20, h / 2 - 5.5);
      this.addChild(value);
    }
    this.alpha = e.off ? 0.6 : 1;
  }

  setFocused(on: boolean): void {
    this.edge.visible = on;
    this.back.alpha = on ? 1 : 0.72;
  }
}

export class MenuList extends Container {
  private rows: Row[] = [];
  private entries: MenuEntry[] = [];
  private signature = '';
  private selected = 0;

  constructor(
    readonly w: number,
    private readonly rowH = 46,
  ) {
    super();
  }

  /** Lay the rows out. Nothing is rebuilt unless something about them has changed. */
  set(entries: readonly MenuEntry[]): void {
    const signature = entries.map((e) => `${e.label}/${e.note ?? ''}/${e.value ?? ''}/${e.adjust ? 1 : 0}/${e.off ? 1 : 0}/${e.color ?? ''}`).join('|');
    if (signature === this.signature) return;
    this.signature = signature;
    for (const r of this.rows) r.destroy({ children: true });
    this.entries = entries.slice();
    this.rows = this.entries.map((e, i) => {
      const row = new Row(e, this.w, this.rowH);
      row.position.set(0, i * (this.rowH + GAP));
      this.addChild(row);
      return row;
    });
    this.selected = Math.max(0, Math.min(this.rows.length - 1, this.selected));
    this.show();
  }

  /** How tall the list is. */
  get tall(): number {
    return this.rows.length * (this.rowH + GAP) - GAP;
  }

  /** The row pointed at. */
  get choice(): number {
    return this.selected;
  }

  set choice(i: number) {
    this.selected = Math.max(0, Math.min(this.rows.length - 1, i));
    this.show();
  }

  /** The entry pointed at, if there is one. */
  get entry(): MenuEntry | undefined {
    return this.entries[this.selected];
  }

  /** Move the highlight one row up (-1) or down (1); it stops at the ends. */
  move(dir: number): void {
    const next = Math.max(0, Math.min(this.rows.length - 1, this.selected + dir));
    if (next !== this.selected) uiSound('move');
    this.selected = next;
    this.show();
  }

  /** Point at the row under a position given in this list's parent's space. Returns its place, or -1. */
  hit(x: number, y: number): number {
    const lx = x - this.x;
    const ly = y - this.y;
    for (let i = 0; i < this.rows.length; i++) {
      const top = i * (this.rowH + GAP);
      if (lx >= 0 && lx <= this.w && ly >= top && ly <= top + this.rowH) {
        if (i !== this.selected) uiSound('move');
        this.selected = i;
        this.show();
        return i;
      }
    }
    return -1;
  }

  private show(): void {
    this.rows.forEach((r, i) => r.setFocused(i === this.selected));
  }
}
