// How to play together, for a page that was not opened from a host: there is no lobby to join
// here, so the screen says how to make one.
import { Graphics } from 'pixi.js';
import type { MenuKeys } from '../../game/input';
import { CHIME, PAPER, UI } from '../../render/palette';
import { Label } from '../label';
import { uiSound } from '../sfx';
import { PanelScreen } from '../screen';
import type { Pointer, ScreenFactory, ScreenHost } from '../screen';

const W = 720;
const H = 430;
const PAD = 40;

const STEPS: readonly string[] = [
  'One laptop hosts. On it, in the folder of the game, run the line below. It builds the game and prints two addresses.',
  'On the host laptop, open the first address. On each of the others, open the second, in Chrome or Edge. Nothing needs installing there.',
  'Everyone must be on the same network. Home Wi-Fi or a phone hotspot works; guest and public networks often keep laptops apart.',
];

class Hosting extends PanelScreen {
  private readonly hint: Label;

  constructor(host: ScreenHost) {
    super(host, W, H);
    const glass = new Graphics()
      .roundRect(0, 0, W, H, 12)
      .fill({ color: UI.glass, alpha: 0.95 })
      .roundRect(0, 0, W, H, 12)
      .stroke({ width: 2, color: UI.brass, alpha: 0.9 })
      .moveTo(PAD, 78)
      .lineTo(W - PAD, 78)
      .stroke({ width: 1, color: UI.brass, alpha: 0.45 });
    const title = new Label('Playing together', { size: 24, color: PAPER, bold: true, tracking: 0.26 });
    title.position.set(PAD, 32);
    this.panel.addChild(glass, title);
    let y = 104;
    STEPS.forEach((text, i) => {
      const line = new Label(text, { size: 10, color: UI.text, tracking: 0.06, maxWidth: W - PAD * 2, lineHeight: 1.9 });
      line.position.set(PAD, y);
      this.panel.addChild(line);
      y += line.textHeight + 22;
      if (i === 0) {
        const box = new Graphics().roundRect(PAD, y - 6, W - PAD * 2, 44, 6).fill({ color: UI.scrim, alpha: 0.9 });
        const cmd = new Label('npm run host', { size: 14, color: CHIME, bold: true, tracking: 0.2 });
        cmd.position.set(PAD + 20, y + 8);
        this.panel.addChild(box, cmd);
        y += 62;
      }
    });
    this.hint = new Label('', { size: 9, color: UI.inkSoft, tracking: 0.22 });
    this.hint.position.set(PAD, H - 34);
    this.panel.addChild(this.hint);
  }

  enter(): void {
    this.appear();
  }

  update(dt: number, keys: MenuKeys, pointer: Pointer): void {
    this.fade(dt);
    this.hint.text = this.host.state.pad ? 'B  back' : 'Esc  back';
    if (keys.back || keys.confirm || pointer.click) {
      uiSound('back');
      this.host.close();
    }
  }
}

const hosting: ScreenFactory = (host) => new Hosting(host);
export default hosting;
