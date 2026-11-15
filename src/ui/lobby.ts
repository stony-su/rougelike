// The co-op lobby: who has sat down, as which class, and who is ready. A view only: it is told
// the seats and shows them; the shell decides what the keys do.
import { Container, Graphics } from 'pixi.js';
import type { LobbySeat } from '../net/protocol';
import { DANGER, PLAYER_COLORS, RIM, UI } from '../render/palette';
import { Label } from './label';

const W = 620;
const ROW_H = 54;

const CLASS_NAMES: Record<string, string> = { sword: 'The Edge   Sword', bow: 'The String   Bow', fist: 'The Hand   Fist' };

interface Row {
  root: Container;
  chip: Graphics;
  who: Label;
  what: Label;
  state: Label;
  back: Graphics;
}

export class LobbyView {
  readonly root = new Container();
  private readonly panel = new Graphics();
  private readonly rows: Row[] = [];
  private readonly address: Label;
  private readonly hint: Label;
  private readonly status: Label;
  private time = 0;

  constructor() {
    const h = 150 + 3 * ROW_H + 96;
    // dark glass with a brass edge, and a ring for a crest
    this.panel
      .roundRect(0, 0, W, h, 10)
      .fill({ color: UI.glass, alpha: 0.9 })
      .roundRect(0, 0, W, h, 10)
      .stroke({ width: 2, color: UI.brass, alpha: 0.9 })
      .circle(W - 58, 58, 26)
      .stroke({ width: 3, color: UI.brass, alpha: 0.8 })
      .circle(W - 58, 58, 15)
      .stroke({ width: 2, color: UI.brass, alpha: 0.5 })
      .circle(W - 58, 58, 5)
      .fill({ color: UI.brass, alpha: 0.9 });
    const title = new Label('Resound', { size: 30, color: UI.text, bold: true, tracking: 0.24 });
    title.position.set(34, 30);
    const sub = new Label('Co-op lobby', { size: 11, color: UI.brass, tracking: 0.4 });
    sub.position.set(36, 78);
    this.address = new Label('', { size: 9, color: UI.inkSoft, tracking: 0.12 });
    this.address.position.set(36, 108);
    this.root.addChild(this.panel, title, sub, this.address);

    for (let i = 0; i < 3; i++) {
      const root = new Container();
      root.position.set(24, 140 + i * ROW_H);
      const back = new Graphics().roundRect(0, 0, W - 48, ROW_H - 8, 6).fill({ color: 0xffffff, alpha: 1 });
      back.tint = UI.scrim;
      back.alpha = 0.7;
      const chip = new Graphics().circle(24, (ROW_H - 8) / 2, 11).fill(0xffffff).circle(24, (ROW_H - 8) / 2, 15).stroke({ width: 2, color: 0xffffff, alpha: 0.7 });
      const who = new Label('', { size: 12, color: UI.text, bold: true, tracking: 0.16 });
      who.position.set(52, 10);
      const what = new Label('', { size: 9, color: UI.inkSoft, tracking: 0.2 });
      what.position.set(52, 28);
      const state = new Label('', { size: 10, color: UI.good, bold: true, tracking: 0.3, align: 'right' });
      state.position.set(W - 48 - 18, 17);
      root.addChild(back, chip, who, what, state);
      this.root.addChild(root);
      this.rows.push({ root, chip, who, what, state, back });
    }
    this.hint = new Label('', { size: 10, color: UI.text, tracking: 0.2, align: 'center', maxWidth: W - 60, lineHeight: 2 });
    this.hint.position.set(W / 2, 150 + 3 * ROW_H);
    this.status = new Label('', { size: 10, color: DANGER, bold: true, tracking: 0.16, align: 'center', maxWidth: W - 60, lineHeight: 1.9 });
    this.status.position.set(W / 2, 150 + 3 * ROW_H + 52);
    this.root.addChild(this.hint, this.status);
    this.root.pivot.set(W / 2, h / 2);
  }

  layout(viewW: number, viewH: number): void {
    const s = Math.max(0.7, Math.min(1.5, Math.min(viewW / 760, viewH / 560)));
    this.root.scale.set(s);
    this.root.position.set(viewW / 2, viewH / 2);
  }

  /**
   * Show the seats. `mine` is this laptop's seat (or -1 before the host has answered), `address`
   * what the others should open, `status` a line for when something is wrong.
   */
  update(seats: readonly LobbySeat[], mine: number, address: string, status: string, dt: number): void {
    this.time += dt;
    this.address.text = address ? `Others join at   ${address}` : '';
    const everyone = seats.length > 0 && seats.every((s) => s.ready);
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      const seat = seats[i];
      const color = PLAYER_COLORS[i] ?? RIM;
      row.chip.tint = color;
      if (!seat) {
        row.chip.alpha = 0.25;
        row.who.text = 'Open seat';
        row.who.setColor(UI.inkSoft);
        row.what.text = 'Waiting for a laptop to join';
        row.state.text = '';
        row.back.alpha = 0.35;
        continue;
      }
      const me = i === mine;
      row.chip.alpha = seat.connected ? 1 : 0.4;
      row.who.text = me ? `${seat.name}   (you)` : seat.name;
      row.who.setColor(me ? color : UI.text);
      row.what.text = CLASS_NAMES[seat.classId] ?? seat.classId;
      row.state.text = !seat.connected ? 'Away' : seat.ready ? 'Ready' : 'Choosing';
      row.state.setColor(!seat.connected ? DANGER : seat.ready ? UI.good : UI.inkSoft);
      // this laptop's own row breathes, so it is found at a glance
      row.back.alpha = me ? 0.85 + 0.1 * Math.sin(this.time * 3) : 0.7;
    }
    const my = mine >= 0 ? seats[mine] : undefined;
    if (status) this.hint.text = '';
    else if (!my) this.hint.text = 'Connecting to the host';
    else if (everyone) this.hint.text = 'Everyone is ready.   Enter starts the game';
    else if (my.ready) this.hint.text = 'Waiting for the others.   Enter if you want to change class';
    else this.hint.text = '1  2  3  choose a class        Enter when you are ready';
    this.status.text = status;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
