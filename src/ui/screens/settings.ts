// The settings: how loud, whether there is sound at all, how much the screen shakes, how sharp
// the picture is, and whether a controller rumbles. Left and right change the row pointed at,
// and every change is felt at once and kept for the next visit.
import { Graphics } from 'pixi.js';
import type { MenuKeys } from '../../game/input';
import { PICTURES, SHAKES } from '../../game/settings';
import { PAPER, UI } from '../../render/palette';
import { Label } from '../label';
import { MenuList } from '../menuList';
import type { MenuEntry } from '../menuList';
import { PanelScreen } from '../screen';
import type { Pointer, ScreenFactory, ScreenHost } from '../screen';
import { uiSound } from '../sfx';

const W = 560;
const PAD = 36;
const TOP = 92;

const NOTES: readonly string[] = ['', '', 'When something lands hard', 'Light is quickest, Sharp is finest', 'On hits, harder for heavier ones'];

class SettingsScreen extends PanelScreen {
  private readonly list = new MenuList(W - PAD * 2, 50);
  private readonly hint: Label;

  constructor(host: ScreenHost) {
    super(host, W, 440, 0.7);
    this.list.position.set(PAD, TOP);
    this.build();
    this.h = TOP + this.list.tall + 64;
    const glass = new Graphics()
      .roundRect(0, 0, W, this.h, 12)
      .fill({ color: UI.glass, alpha: 0.96 })
      .roundRect(0, 0, W, this.h, 12)
      .stroke({ width: 2, color: UI.brass, alpha: 0.9 })
      .moveTo(PAD, 74)
      .lineTo(W - PAD, 74)
      .stroke({ width: 1, color: UI.brass, alpha: 0.45 });
    const title = new Label('Settings', { size: 24, color: PAPER, bold: true, tracking: 0.3 });
    title.position.set(PAD, 30);
    this.hint = new Label('', { size: 9, color: UI.inkSoft, tracking: 0.22 });
    this.hint.position.set(PAD, this.h - 34);
    this.panel.addChild(glass, title, this.list, this.hint);
  }

  enter(): void {
    this.appear();
    this.list.choice = 0;
  }

  private build(): void {
    const s = this.host.state.settings;
    const shake = SHAKES.find(([v]) => v === s.shake) ?? SHAKES[SHAKES.length - 1];
    const entries: MenuEntry[] = [
      { label: 'Volume', value: `${Math.round(s.volume * 100)}%`, adjust: true, off: s.muted },
      { label: 'Sound', value: s.muted ? 'Off' : 'On', adjust: true },
      { label: 'Screen shake', note: NOTES[2], value: shake[1], adjust: true },
      { label: 'Picture', note: NOTES[3], value: PICTURES[s.picture] ?? '', adjust: true },
      { label: 'Controller rumble', note: NOTES[4], value: s.rumble ? 'On' : 'Off', adjust: true },
      { label: 'Back' },
    ];
    this.list.set(entries);
  }

  /** Change the row pointed at one step down (-1) or up (1); `wrap` goes round at the ends (Enter and the mouse). */
  private change(row: number, dir: number, wrap: boolean): void {
    const s = this.host.state.settings;
    const step = (at: number, n: number): number => (wrap ? (at + dir + n) % n : Math.max(0, Math.min(n - 1, at + dir)));
    if (row === 0) s.volume = step(Math.round(s.volume * 10), 11) / 10;
    else if (row === 1) s.muted = !s.muted;
    else if (row === 2)
      s.shake =
        SHAKES[
          step(
            Math.max(
              0,
              SHAKES.findIndex(([v]) => v === s.shake),
            ),
            SHAKES.length,
          )
        ][0];
    else if (row === 3) s.picture = step(s.picture, PICTURES.length);
    else if (row === 4) s.rumble = !s.rumble;
    else return;
    this.host.act('settings');
    // the sound of the change is itself the proof of how loud it now is
    uiSound('move');
  }

  update(dt: number, keys: MenuKeys, pointer: Pointer): void {
    this.fade(dt);
    this.build();
    this.hint.text = this.host.state.pad ? 'Left and right  change      B  back' : 'A D  change      Esc  back';
    if (keys.dy !== 0) this.list.move(keys.dy);
    if (keys.dx !== 0) this.change(this.list.choice, keys.dx, false);
    let take = keys.confirm ? this.list.choice : -1;
    if (pointer.moved || pointer.click) {
      const over = this.list.hit(this.px(pointer), this.py(pointer));
      if (pointer.click && over >= 0) take = over;
    }
    if (take === 5 || keys.back) {
      uiSound('back');
      this.host.close();
    } else if (take >= 0) this.change(take, 1, true);
  }
}

const settings: ScreenFactory = (host) => new SettingsScreen(host);
export default settings;
