// How the game is played, and the controls, on three pages: what the game asks of you, keyboard
// and mouse, and a controller. A new player is shown the first before anything else; asked for
// from a menu, the page of the device last used comes up. Left and right turn the page. Every
// key and button is a small drawing (src/ui/glyphs.ts), so a page reads at a glance.
import { RALLY } from '../../sim/tuning';
import { Container, Graphics } from 'pixi.js';
import type { MenuKeys } from '../../game/input';
import { PAPER, UI } from '../../render/palette';
import { dpadGlyph, faceGlyph, keyGlyph, mouseGlyph, row, startGlyph, stickGlyph, triggerGlyph, wasdGlyph } from '../glyphs';
import { drawIcon } from '../icons';
import { Label } from '../label';
import { PanelScreen } from '../screen';
import type { Pointer, ScreenFactory, ScreenHost } from '../screen';
import { uiSound } from '../sfx';

const W = 900;
const PAD = 40;
const TOP = 132;
const ROW_H = 62;
const GLYPH_X = PAD + 96;
const NAME_X = PAD + 216;
const NOTE_X = PAD + 390;

interface Line {
  glyph: () => Container;
  name: string;
  note: string;
}

/** One of the upgrade emblems, as the picture of a line. */
const emblem = (icon: string) => (): Container => {
  const g = new Graphics();
  drawIcon(g, icon, 19, UI.brass, PAPER);
  const c = new Container();
  c.addChild(g);
  return c;
};

/** A card with a rank on it: an upgrade. */
function cardGlyph(): Container {
  const g = new Graphics()
    .roundRect(-15, -21, 30, 42, 4)
    .fill({ color: UI.scrim, alpha: 0.9 })
    .roundRect(-15, -21, 30, 42, 4)
    .stroke({ width: 2, color: UI.brass })
    .poly([0, -12, 7, -4, 0, 4, -7, -4])
    .fill(PAPER)
    .rect(-8, 10, 16, 3)
    .fill({ color: UI.brass, alpha: 0.8 });
  const c = new Container();
  c.addChild(g);
  return c;
}

const HOW: readonly Line[] = [
  {
    glyph: () => mouseGlyph('left'),
    name: 'Attack',
    note: 'The Swordsman cuts enemy shots back at their makers. The Archer bounces arrows off walls. The Brawler throws enemies into walls and each other.',
  },
  { glyph: () => mouseGlyph('right'), name: 'Special', note: 'Your big move: Whirlwind, Hook Shot or Stomp. The ring under your feet fills as it comes back.' },
  { glyph: () => keyGlyph('Space', 96), name: 'Dash', note: 'Nothing can touch you while you dash. An attack pressed during a dash comes straight out of it, harder.' },
  {
    glyph: emblem('rebound'),
    name: 'Bounce hits',
    note: 'What lands after a bounce hits two or three times as hard: a shot sent back, an arrow off a wall, an enemy thrown into a wall.',
  },
  {
    glyph: emblem('rings'),
    name: 'Combo',
    note: `Every bounce hit adds to your Combo, and each point of it makes bounce hits ${Math.round(RALLY.perPoint * 100)}% stronger. It is lost after ${RALLY.hold} seconds without one.`,
  },
  { glyph: cardGlyph, name: 'Upgrades', note: 'After every room, choose one of three. Two that belong together switch on a Synergy: the card says which.' },
  { glyph: emblem('coin'), name: 'Coins, camps', note: 'Enemies drop Coins. At a camp the Merchant sells upgrades, and the Healing Pool mends you or sharpens an upgrade, once.' },
  { glyph: emblem('heart'), name: 'Falling', note: 'Together, stand beside a fallen friend to bring them back. Alone, falling ends the run, and the Stars it earned buy what you keep.' },
];

const KEYS: readonly Line[] = [
  { glyph: wasdGlyph, name: 'Move', note: 'Up the screen is away from you, as it looks.' },
  { glyph: () => mouseGlyph('move'), name: 'Aim', note: 'Where the pointer is. The Bow shows the path its arrow will take.' },
  { glyph: () => mouseGlyph('left'), name: 'Attack', note: 'Hold it down: the Bow keeps loosing, and the Fist draws back a Heavy Punch.' },
  { glyph: () => mouseGlyph('right'), name: 'Special', note: 'The Whirlwind for the Sword, the Hook Shot for the Bow, the Stomp for the Fist.' },
  { glyph: () => keyGlyph('Space', 96), name: 'Dash', note: 'Four tiles, and nothing can touch you on the way. Two charges.' },
  { glyph: () => keyGlyph('F'), name: 'Interact', note: 'Bring the camp back when you have put it away.' },
  { glyph: () => keyGlyph('Tab', 64), name: 'What you can do', note: 'Hold it: your attack, your special and every upgrade you hold, in words. Or point at an emblem.' },
  { glyph: () => row([keyGlyph('Esc'), keyGlyph('M')]), name: 'Menu, sound', note: 'Esc is your own menu. M turns the sound off and on.' },
];

const PADS: readonly Line[] = [
  { glyph: () => stickGlyph('L'), name: 'Move', note: 'The left stick. Push it a little to walk slowly.' },
  { glyph: () => stickGlyph('R'), name: 'Aim', note: 'The right stick. At rest you aim the way you walk, and the aim leans toward an enemy near its line.' },
  { glyph: () => row([triggerGlyph('RT'), triggerGlyph('RB')]), name: 'Attack', note: 'Hold it down: the Bow keeps loosing, and the Fist draws back a Heavy Punch.' },
  { glyph: () => row([triggerGlyph('LT'), triggerGlyph('LB')]), name: 'Special', note: 'The Whirlwind for the Sword, the Hook Shot for the Bow, the Stomp for the Fist.' },
  { glyph: () => faceGlyph('A'), name: 'Dash', note: 'Four tiles, and nothing can touch you on the way. Two charges.' },
  { glyph: () => faceGlyph('X'), name: 'Interact', note: 'Bring the camp back when you have put it away.' },
  { glyph: () => keyGlyph('View', 64), name: 'What you can do', note: 'Hold the small button left of Start: your attack, your special and every upgrade you hold, in words.' },
  { glyph: () => row([startGlyph(), dpadGlyph(), faceGlyph('B')], 16), name: 'Menus', note: 'Start is your own menu. In menus: the d-pad or the stick, A to choose, B to go back.' },
];

const PAGES: ReadonlyArray<{ name: string; lines: readonly Line[] }> = [
  { name: 'How to play', lines: HOW },
  { name: 'Keyboard and mouse', lines: KEYS },
  { name: 'Controller', lines: PADS },
];
/** The pages by what they are for. */
const PAGE_HOW = 0;
const PAGE_KEYS = 1;
const PAGE_PAD = 2;
const H = TOP + Math.max(HOW.length, KEYS.length, PADS.length) * ROW_H + 66;

class Controls extends PanelScreen {
  private readonly tabs: Label[] = [];
  private readonly mark = new Graphics();
  private readonly body = new Container();
  private readonly hint: Label;
  private page = -1;

  constructor(host: ScreenHost) {
    super(host, W, H, 0.7);
    const glass = new Graphics()
      .roundRect(0, 0, W, H, 12)
      .fill({ color: UI.glass, alpha: 0.96 })
      .roundRect(0, 0, W, H, 12)
      .stroke({ width: 2, color: UI.brass, alpha: 0.9 })
      .moveTo(PAD, 112)
      .lineTo(W - PAD, 112)
      .stroke({ width: 1, color: UI.brass, alpha: 0.45 });
    const title = new Label('How to play', { size: 24, color: PAPER, bold: true, tracking: 0.3 });
    title.position.set(PAD, 30);
    this.panel.addChild(glass, title, this.mark);
    let x = PAD;
    for (const p of PAGES) {
      const tab = new Label(p.name, { size: 11, color: PAPER, bold: true, tracking: 0.2 });
      tab.position.set(x, 80);
      this.tabs.push(tab);
      this.panel.addChild(tab);
      x += tab.textWidth + 44;
    }
    this.hint = new Label('', { size: 9, color: UI.inkSoft, tracking: 0.22 });
    this.hint.position.set(PAD, H - 34);
    this.panel.addChild(this.body, this.hint);
  }

  enter(arg: unknown): void {
    this.appear();
    // asked how the game is played, that page; asked for the controls, those of the device in the player's hands
    this.show(arg === 'how' ? PAGE_HOW : this.host.state.pad ? PAGE_PAD : PAGE_KEYS);
  }

  private show(page: number): void {
    const next = Math.max(0, Math.min(PAGES.length - 1, page));
    if (next === this.page) return;
    this.page = next;
    this.body.removeChildren().forEach((c) => c.destroy({ children: true }));
    PAGES[next].lines.forEach((line, i) => {
      const y = TOP + i * ROW_H;
      if (i % 2 === 0) this.body.addChild(new Graphics().roundRect(PAD - 12, y, W - (PAD - 12) * 2, ROW_H, 6).fill({ color: UI.scrim, alpha: 0.5 }));
      const glyph = line.glyph();
      // every picture is drawn about its own centre; a tall one is brought down to the row
      const b = glyph.getLocalBounds();
      const k = Math.min(1, (ROW_H - 8) / b.height);
      glyph.scale.set(k);
      glyph.position.set(GLYPH_X - (b.x + b.width / 2) * k, y + ROW_H / 2 - (b.y + b.height / 2) * k);
      const name = new Label(line.name, { size: 12, color: PAPER, bold: true, tracking: 0.16 });
      name.position.set(NAME_X, y + ROW_H / 2 - 6);
      const note = new Label(line.note, { size: 9, color: UI.text, tracking: 0.05, maxWidth: W - PAD - NOTE_X, lineHeight: 1.8 });
      note.position.set(NOTE_X, y + ROW_H / 2 - note.textHeight / 2);
      this.body.addChild(glyph, name, note);
    });
    this.tabs.forEach((t, i) => {
      t.setColor(i === next ? PAPER : UI.inkSoft);
    });
    const tab = this.tabs[next];
    this.mark.clear().rect(tab.x, 100, tab.textWidth, 3).fill(UI.brass);
  }

  update(dt: number, keys: MenuKeys, pointer: Pointer): void {
    this.fade(dt);
    this.hint.text = this.host.state.pad ? 'Left and right  turn the page      B  back' : 'A D  turn the page      Esc  back';
    const before = this.page;
    if (keys.dx !== 0) this.show(this.page + keys.dx);
    if (pointer.click) {
      const x = this.px(pointer);
      const y = this.py(pointer);
      this.tabs.forEach((t, i) => {
        if (x >= t.x - 8 && x <= t.x + t.textWidth + 8 && y >= 68 && y <= 108) this.show(i);
      });
    }
    if (this.page !== before) uiSound('move');
    if (keys.back || keys.confirm) {
      uiSound('back');
      this.host.close();
    }
  }
}

const controls: ScreenFactory = (host) => new Controls(host);
export default controls;
