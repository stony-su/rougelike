// The animation gallery (?gallery=<rig id>): every state of a rig as a filmstrip, one row per
// state, each column a moment in time. One screenshot shows whether every state exists, whether
// it really moves, and whether the rigs share one style. A development and verification tool.
import { BitmapFont, BitmapText, Container, Graphics } from 'pixi.js';
import type { Application } from 'pixi.js';
import { CHALK, INK, PAPER, RIM, ZONES, css } from '../render/palette';
import { animInput } from '../render/rig/def';
import { RIGS } from '../render/rig/registry';
import { RigView } from '../render/rig/view';

const COLUMNS = 8;

export interface GalleryOptions {
  rig: string;
  /** Show the facing-away leaves instead. */
  away: boolean;
  /** Black silhouettes only: tests whether each pose reads by shape alone. */
  silhouette: boolean;
  /** Animate the cells instead of showing fixed moments. */
  live: boolean;
}

interface Cell {
  view: RigView;
  state: string;
  variant: number;
  column: number;
}

export class Gallery {
  private readonly root = new Container();
  private readonly cells: Cell[] = [];
  private time = 0;

  constructor(
    private readonly app: Application,
    private readonly opts: GalleryOptions,
  ) {
    const theme = ZONES.bluefen;
    app.renderer.background.color = opts.silhouette ? PAPER : theme.ground;
    app.stage.addChild(this.root);
    BitmapFont.install({
      name: 'gallery',
      style: { fontFamily: 'Consolas, Menlo, monospace', fontSize: 18, fill: '#ffffff' },
      chars: [[' ', '~']],
    });

    const ids = opts.rig === 'all' || !RIGS[opts.rig] ? Object.keys(RIGS) : [opts.rig];
    const overview = ids.length > 1;
    const rows: Array<{ id: string; state: string; variant: number }> = [];
    for (const id of ids) {
      const entry = RIGS[id];
      for (const state of entry.def.states) {
        for (const variant of entry.variants[state] ?? [0]) rows.push({ id, state, variant });
      }
    }

    const w = app.screen.width;
    const h = app.screen.height;
    const labelW = 190;
    const colW = (w - labelW - 20) / COLUMNS;
    const rowH = Math.min(150, (h - 30) / rows.length);
    const scale = Math.min(1.25, (rowH - 16) / 112);

    const guides = new Graphics();
    rows.forEach((row, r) => {
      const baseY = 24 + rowH * (r + 1) - 12;
      guides.moveTo(labelW, baseY).lineTo(w - 10, baseY);
      const label = new BitmapText({
        text: `${overview ? `${row.id}  ` : ''}${row.state}${RIGS[row.id].variants[row.state] ? ` ${row.variant + 1}` : ''}`,
        style: { fontFamily: 'gallery', fontSize: 18 },
      });
      label.tint = opts.silhouette ? INK : RIM;
      label.position.set(14, baseY - 28);
      this.root.addChild(label);
      for (let c = 0; c < COLUMNS; c++) {
        const view = new RigView(RIGS[row.id].def);
        view.root.position.set(labelW + colW * (c + 0.5), baseY);
        view.root.scale.set(scale);
        if (opts.silhouette) view.setFlash(1, INK);
        this.root.addChild(view.root);
        this.cells.push({ view, state: row.state, variant: row.variant, column: c });
      }
    });
    guides.stroke({ width: 1, color: opts.silhouette ? INK : theme.contour, alpha: 0.5 });
    this.root.addChildAt(guides, 0);

    const title = new BitmapText({
      text: `${ids.join(', ')}   ${opts.away ? 'facing away' : 'facing toward'}   ${opts.live ? 'live' : `${COLUMNS} moments per state`}`,
      style: { fontFamily: 'gallery', fontSize: 18 },
    });
    title.tint = opts.silhouette ? INK : CHALK;
    title.position.set(14, 6);
    this.root.addChild(title);
    void css;

    this.pose(0);
    app.ticker.add(this.frame, this);
  }

  destroy(): void {
    this.app.ticker.remove(this.frame, this);
    for (const c of this.cells) c.view.destroy();
    this.root.destroy({ children: true });
  }

  private frame(): void {
    const dt = Math.min(this.app.ticker.elapsedMS, 100) / 1000;
    this.time += dt;
    if (this.opts.live) this.pose(dt);
  }

  private pose(dt: number): void {
    for (const cell of this.cells) {
      const entry = RIGS[cell.view.def.id];
      const a = animInput();
      a.state = cell.state;
      a.variant = cell.variant;
      a.away = this.opts.away;
      a.seed = 0.37;
      a.speed = 1;
      a.aim = -0.35;
      if (this.opts.live) {
        // each column runs the state at a different offset so the row reads as a loop
        const dur = 0.7;
        const t = (this.time + (cell.column / COLUMNS) * dur) % (dur * 1.4);
        a.phase = Math.min(1, t / dur);
        a.t = t;
        a.time = this.time + cell.column * 0.4;
        a.stride = this.time * 5.4 + cell.column * 0.25;
      } else {
        a.phase = cell.column / (COLUMNS - 1);
        a.t = a.phase * 0.6;
        a.time = 1.3 + cell.column * 0.37;
        a.stride = cell.column * 0.26;
      }
      cell.view.setFacing(1, this.opts.away);
      cell.view.beginPose();
      const rate = entry.animator(cell.view, a);
      cell.view.applyPose(dt, this.opts.live ? rate : Infinity);
    }
  }
}
