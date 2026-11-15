// Your own menu, on Esc or Start. Alone it stops the game while it is up. Together it does not:
// the others play on, and stopping the game for everyone is a row of its own that anyone can
// take back.
import { Graphics } from 'pixi.js';
import type { MenuKeys } from '../../game/input';
import { DANGER, PAPER, UI } from '../../render/palette';
import { Label } from '../label';
import { MenuList } from '../menuList';
import type { MenuEntry } from '../menuList';
import { uiSound } from '../sfx';
import { PanelScreen } from '../screen';
import type { Pointer, ScreenFactory, ScreenHost } from '../screen';

const W = 480;
const PAD = 32;
const TOP = 96;

class Pause extends PanelScreen {
  private readonly glass = new Graphics();
  private readonly title: Label;
  private readonly sub: Label;
  private readonly list = new MenuList(W - PAD * 2, 48);
  private readonly hint: Label;
  private acts: Array<() => void> = [];

  constructor(host: ScreenHost) {
    super(host, W, 400);
    this.title = new Label('Paused', { size: 22, color: PAPER, bold: true, tracking: 0.3 });
    this.title.position.set(PAD, 28);
    this.sub = new Label('', { size: 9, color: UI.brass, tracking: 0.2 });
    this.sub.position.set(PAD, 62);
    this.list.position.set(PAD, TOP);
    this.hint = new Label('', { size: 9, color: UI.inkSoft, tracking: 0.22 });
    this.panel.addChild(this.glass, this.title, this.sub, this.list, this.hint);
  }

  enter(): void {
    this.appear();
    this.list.choice = 0;
    this.build();
  }

  private build(): void {
    const s = this.host.state;
    const session = s.session;
    const entries: MenuEntry[] = [{ label: 'Back to the game' }];
    this.acts = [() => this.host.close()];
    for (const [screen, label] of [
      ['controls', 'Controls'],
      ['settings', 'Settings'],
    ]) {
      if (!this.host.has(screen)) continue;
      entries.push({ label });
      this.acts.push(() => this.host.open(screen));
    }
    if (s.coop) {
      const paused = !!session && session.pausedBy >= 0;
      const by = paused && session ? (session.config.players[session.pausedBy]?.name ?? '') : '';
      entries.push({ label: paused ? 'Let the game go on' : 'Pause for everyone', note: paused ? `Stopped by ${by}` : 'Stops the game on every laptop; anyone can lift it' });
      this.acts.push(() => this.host.act('pauseAll'));
      entries.push({ label: 'Leave the game', note: 'The others play on without you', color: DANGER });
      this.acts.push(() => this.host.act('title'));
    } else {
      entries.push({ label: 'Start over', note: 'A new road, as the same class' });
      this.acts.push(() => this.host.act('restart'));
      entries.push({ label: 'Give up the run', note: 'Back to the title', color: DANGER });
      this.acts.push(() => this.host.act('title'));
    }
    this.list.set(entries);
    this.title.text = s.coop ? 'Menu' : 'Paused';
    const stop = session ? session.route[session.stop] : undefined;
    this.sub.text = stop && session ? `Chamber ${stop.n} of ${session.route.length}     ${stop.name}` : '';
    this.hint.text = s.pad ? 'Up and down      A  choose      B  back' : 'W S  choose      Enter  take      Esc  back';
    const h = TOP + this.list.tall + 64;
    if (h !== this.h) {
      this.h = h;
      this.place();
    }
    this.glass.clear().roundRect(0, 0, W, this.h, 12).fill({ color: UI.glass, alpha: 0.95 }).roundRect(0, 0, W, this.h, 12).stroke({ width: 2, color: UI.brass, alpha: 0.9 });
    this.hint.position.set(PAD, this.h - 32);
  }

  update(dt: number, keys: MenuKeys, pointer: Pointer): void {
    this.fade(dt);
    this.build();
    if (keys.dy !== 0) this.list.move(keys.dy);
    let take = keys.confirm ? this.list.choice : -1;
    if (pointer.moved || pointer.click) {
      const over = this.list.hit(this.px(pointer), this.py(pointer));
      if (pointer.click && over >= 0) take = over;
    }
    if (take >= 0 && this.acts[take]) {
      uiSound(take === 0 ? 'back' : 'confirm');
      this.acts[take]();
    } else if (keys.back) {
      uiSound('back');
      this.host.close();
    }
  }
}

const pause: ScreenFactory = (host) => new Pause(host);
export default pause;
