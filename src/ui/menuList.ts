// A list of things to choose from, one under the other: the body of every menu. A row has a
// name, sometimes a few quieter words, and sometimes a value at its right that left and right
// change. The list shows which row is pointed at and reports it; what choosing a row does is the
// screen's business. With more than one column it is a grid, filled row by row: a long list then
// uses the width of the screen instead of its height, and the lettering can stay large.
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
/** Between the columns of a grid. */
const GAP_X = 10;

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
    // the value first, so that the words know how much of the row is theirs
    let room = w - 44;
    if (e.value !== undefined) {
      const value = new Label(e.adjust ? `<   ${e.value}   >` : e.value, { size: 11, color: e.off ? UI.inkSoft : UI.brass, bold: true, tracking: 0.14, align: 'right' });
      value.position.set(w - 20, h / 2 - 5.5);
      this.addChild(value);
      room -= value.textWidth + 18;
    }
    const name = new Label(e.label, { size: 12, color: e.off ? UI.inkSoft : (e.color ?? PAPER), bold: true, tracking: 0.16 });
    this.addChildAt(this.back, 0);
    this.addChildAt(this.edge, 1);
    this.addChild(name);
    let two = false;
    if (e.note) {
      // a note too long for its row goes on to a second line rather than under the value
      const note = new Label(e.note, { size: 8, color: UI.inkSoft, tracking: 0.14, maxWidth: room, lineHeight: 1.6 });
      two = note.textHeight > 12;
      note.position.set(22, two ? h / 2 - 1 : h / 2 + 5);
      this.addChild(note);
    }
    name.position.set(22, !e.note ? h / 2 - 6 : two ? h / 2 - 21 : h / 2 - 15);
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
    /** How many rows stand side by side. */
    private readonly cols = 1,
  ) {
    super();
  }

  /** The width of one row. */
  private get cell(): number {
    return (this.w - (this.cols - 1) * GAP_X) / this.cols;
  }

  /** Lay the rows out. Nothing is rebuilt unless something about them has changed. */
  set(entries: readonly MenuEntry[]): void {
    const signature = entries.map((e) => `${e.label}/${e.note ?? ''}/${e.value ?? ''}/${e.adjust ? 1 : 0}/${e.off ? 1 : 0}/${e.color ?? ''}`).join('|');
    if (signature === this.signature) return;
    this.signature = signature;
    for (const r of this.rows) r.destroy({ children: true });
    this.entries = entries.slice();
    this.rows = this.entries.map((e, i) => {
      const row = new Row(e, this.cell, this.rowH);
      row.position.set((i % this.cols) * (this.cell + GAP_X), Math.floor(i / this.cols) * (this.rowH + GAP));
      this.addChild(row);
      return row;
    });
    this.selected = Math.max(0, Math.min(this.rows.length - 1, this.selected));
    this.show();
  }

  /** How tall the list is. */
  get tall(): number {
    return Math.ceil(this.rows.length / this.cols) * (this.rowH + GAP) - GAP;
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
    // in a grid, down is the row below; from the last full row it reaches whatever stands in the short one
    let next = this.selected + dir * this.cols;
    if (next >= this.rows.length && Math.floor(this.selected / this.cols) < Math.floor((this.rows.length - 1) / this.cols)) next = this.rows.length - 1;
    if (next < 0 || next >= this.rows.length) next = this.selected;
    if (next !== this.selected) uiSound('move');
    this.selected = next;
    this.show();
  }

  /** In a grid: move the highlight one place left (-1) or right (1) along its row. */
  across(dir: number): void {
    if (this.cols <= 1) return;
    const next = this.selected + dir;
    if (next < 0 || next >= this.rows.length || Math.floor(next / this.cols) !== Math.floor(this.selected / this.cols)) return;
    uiSound('move');
    this.selected = next;
    this.show();
  }

  /** Point at the row under a position given in this list's parent's space. Returns its place, or -1. */
  hit(x: number, y: number): number {
    const lx = x - this.x;
    const ly = y - this.y;
    for (let i = 0; i < this.rows.length; i++) {
      const left = (i % this.cols) * (this.cell + GAP_X);
      const top = Math.floor(i / this.cols) * (this.rowH + GAP);
      if (lx >= left && lx <= left + this.cell && ly >= top && ly <= top + this.rowH) {
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
