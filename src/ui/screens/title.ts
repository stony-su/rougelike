// The title: the name of the game over the Crater's standing rings, and the way into everything
// else. Play alone, the co-op lobby, and whichever of the other screens exist.
import { Graphics } from 'pixi.js';
import type { MenuKeys } from '../../game/input';
import { PAPER, UI } from '../../render/palette';
import { Label } from '../label';
import { MenuList } from '../menuList';
import type { MenuEntry } from '../menuList';
import { uiSound } from '../sfx';
import { PanelScreen } from '../screen';
import type { Pointer, ScreenFactory, ScreenHost } from '../screen';

const W = 900;
const H = 660;
const LIST_W = 440;

/** The other screens the title leads to, if they are there: name of the screen, what the row says. */
/** The other screens the title leads to: the screen, what the menu calls it, a line about it, and what it is opened with. */
const MORE: ReadonlyArray<readonly [string, string, string, string?]> = [
  ['controls', 'How to play', 'The game in a page, and the controls', 'how'],
  ['attunement', 'Permanent upgrades', 'Bought with Stars, and kept between runs'],
  ['settings', 'Settings', 'Sound, screen shake, quality'],
];

class Title extends PanelScreen {
  private readonly rings = new Graphics();
  private readonly list = new MenuList(LIST_W, 52);
  private readonly hint: Label;
  private acts: Array<() => void> = [];
  private time = 0;

  constructor(host: ScreenHost) {
    super(host, W, H, 0);
    const name = new Label('Resound', { size: 76, color: PAPER, bold: true, tracking: 0.3, align: 'center' });
    name.position.set(W / 2, 96);
    const line = new Label('Nothing you strike ever settles.   Send it back.', { size: 11, color: UI.brass, tracking: 0.3, align: 'center' });
    line.position.set(W / 2, 214);
    this.rings.position.set(W / 2, 134);
    this.list.position.set((W - LIST_W) / 2, 276);
    this.hint = new Label('', { size: 9, color: UI.inkSoft, tracking: 0.22, align: 'center' });
    this.hint.position.set(W / 2, H - 30);
    this.panel.addChild(this.rings, name, line, this.list, this.hint);
  }

  enter(): void {
    this.appear();
    this.build();
  }

  private build(): void {
    const s = this.host.state;
    const entries: MenuEntry[] = [
      { label: 'Play alone', note: 'Twelve rooms to the Bell' },
      { label: 'Co-op lobby', note: s.hosted ? 'Up to three laptops on this network' : 'One laptop hosts: how to set it up' },
    ];
    this.acts = [() => this.host.open('classSelect'), () => (s.hosted ? this.host.act('lobby') : this.host.open('hosting'))];
    for (const [screen, label, note, arg] of MORE) {
      if (!this.host.has(screen)) continue;
      entries.push({ label, note });
      this.acts.push(() => this.host.open(screen, arg));
    }
    this.list.set(entries);
    // a page served by a host is most likely there for the lobby
    if (s.hosted && this.time === 0) this.list.choice = 1;
    this.hint.text = s.pad ? 'Up and down      A  choose' : 'W S  choose      Enter  take';
  }

  update(dt: number, keys: MenuKeys, pointer: Pointer): void {
    this.fade(dt);
    this.time += dt;
    this.build();
    // rings spreading from the name, as from a bell
    this.rings.clear();
    for (let i = 0; i < 4; i++) {
      const k = (this.time * 0.16 + i / 4) % 1;
      this.rings.ellipse(0, 0, 150 + k * 330, 46 + k * 104).stroke({ width: 2, color: UI.brass, alpha: 0.5 * (1 - k) * (1 - k) });
    }
    if (keys.dy !== 0) this.list.move(keys.dy);
    let take = keys.confirm ? this.list.choice : -1;
    if (pointer.moved || pointer.click) {
      const over = this.list.hit(this.px(pointer), this.py(pointer));
      if (pointer.click && over >= 0) take = over;
    }
    if (take >= 0 && this.acts[take]) {
      uiSound('confirm');
      this.acts[take]();
    }
  }
}

const title: ScreenFactory = (host) => new Title(host);
export default title;
