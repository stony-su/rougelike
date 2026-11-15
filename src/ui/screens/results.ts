// How a run ended: won at the Bell or lost on the road, what it added up to, what this laptop's
// player had built, and the way into the next. Alone, one key starts again at once; together,
// the next run starts when everyone has said they are ready.
import { Graphics } from 'pixi.js';
import type { MenuKeys } from '../../game/input';
import { CHIME, DANGER, PAPER, UI } from '../../render/palette';
import { activeHarmonies } from '../../sim/mods';
import { runSoFar, worldOf } from '../../sim/session';
import { SIM_HZ } from '../../sim/tuning';
import { Label } from '../label';
import { MenuList } from '../menuList';
import type { MenuEntry } from '../menuList';
import { uiSound } from '../sfx';
import { TuningRow } from '../tuningRow';
import { PanelScreen } from '../screen';
import type { Pointer, ScreenFactory, ScreenHost } from '../screen';

const W = 760;
const PAD = 40;
const LIST_W = 400;

const clock = (ticks: number): string => {
  const s = Math.floor(ticks / SIM_HZ);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

class Results extends PanelScreen {
  private readonly glass = new Graphics();
  private readonly head: Label;
  private readonly where: Label;
  private readonly numbers: Label[] = [];
  private readonly names: Label[] = [];
  private readonly builtHead: Label;
  private readonly built = new TuningRow();
  private readonly list = new MenuList(LIST_W, 48);
  private readonly earned: Label;
  private readonly status: Label;
  private readonly hint: Label;
  private acts: Array<() => void> = [];
  private shownFor = '';

  constructor(host: ScreenHost) {
    super(host, W, 560, 0.62);
    this.head = new Label('', { size: 30, color: PAPER, bold: true, tracking: 0.24, align: 'center' });
    this.head.position.set(W / 2, 36);
    this.where = new Label('', { size: 10, color: UI.brass, tracking: 0.24, align: 'center' });
    this.where.position.set(W / 2, 86);
    this.panel.addChild(this.glass, this.head, this.where);
    // six numbers in two rows of three
    for (let i = 0; i < 6; i++) {
      const x = PAD + ((W - PAD * 2) / 3) * ((i % 3) + 0.5);
      const y = 130 + Math.floor(i / 3) * 70;
      const n = new Label('', { size: 20, color: PAPER, bold: true, tracking: 0.1, align: 'center' });
      n.position.set(x, y);
      const name = new Label('', { size: 8, color: UI.inkSoft, tracking: 0.3, align: 'center' });
      name.position.set(x, y + 32);
      this.numbers.push(n);
      this.names.push(name);
      this.panel.addChild(n, name);
    }
    this.builtHead = new Label('What you built', { size: 8, color: UI.brass, bold: true, tracking: 0.34 });
    this.builtHead.position.set(PAD, 282);
    this.built.root.position.set(PAD + 8, 306);
    this.list.position.set((W - LIST_W) / 2, 376);
    this.earned = new Label('', { size: 10, color: CHIME, bold: true, tracking: 0.22, align: 'right' });
    this.earned.position.set(W - PAD, 282);
    this.status = new Label('', { size: 9, color: CHIME, tracking: 0.2, align: 'center' });
    this.hint = new Label('', { size: 9, color: UI.inkSoft, tracking: 0.22, align: 'center' });
    this.panel.addChild(this.builtHead, this.built.root, this.earned, this.list, this.status, this.hint);
  }

  enter(): void {
    this.appear();
    this.shownFor = '';
    this.list.choice = 0;
  }

  private build(): void {
    const s = this.host.state;
    const session = s.session;
    if (!session) return;
    const won = session.phase === 'won';
    const key = `${session.attempt}/${session.phase}`;
    if (key !== this.shownFor) {
      this.shownFor = key;
      const t = runSoFar(session);
      const stop = session.route[session.stop];
      this.head.text = won ? 'The Bell is still' : 'The party is down';
      this.head.setColor(won ? CHIME : DANGER);
      this.where.text = won ? 'The road is walked to its end' : stop ? `It ended in room ${stop.n} of ${session.route.length}:   ${stop.name}` : '';
      const cells: Array<[string, string]> = [
        [`${t.chambers} of ${session.route.length}`, 'Rooms'],
        [String(t.kills), 'Enemies beaten'],
        [clock(session.played), 'On the road'],
        [String(t.returns), 'Bounce hits'],
        [String(t.bestRally), 'Best Combo'],
        [String(Math.round(t.damageTaken)), 'Health lost'],
      ];
      cells.forEach(([n, name], i) => {
        this.numbers[i].text = n;
        this.names[i].text = name;
      });
      const w = worldOf(session, s.slot);
      const me = w.players.find((p) => p.slot === s.slot);
      const ids = me
        ? Object.keys(me.tunings)
            .filter((id) => me.tunings[id] > 0 && w.content.tunings[id])
            .sort((a, b) => (w.content.tunings[a].tone < w.content.tunings[b].tone ? -1 : w.content.tunings[a].tone > w.content.tunings[b].tone ? 1 : a < b ? -1 : 1))
        : [];
      this.built.set(
        ids.map((id) => ({ id, icon: w.content.tunings[id].icon, tone: w.content.tunings[id].tone, rank: me ? me.tunings[id] : 1 })),
        me ? activeHarmonies(me.tunings, w.content.harmonies).map((h) => h.parents) : [],
      );
      this.builtHead.visible = ids.length > 0;
    }

    const mine = session.again[s.slot] === true;
    const entries: MenuEntry[] = [];
    this.acts = [];
    if (s.coop) {
      entries.push({ label: mine ? 'Not yet' : 'Go again', note: mine ? 'You are ready: waiting for the others' : 'The next run starts when everyone is ready' });
      this.acts.push(() => this.host.act('again', !mine));
      entries.push({ label: 'Leave the game', note: 'Back to the title', color: DANGER });
      this.acts.push(() => this.host.act('title'));
      const waiting = session.config.players.filter((_, i) => !session.again[i]).map((p) => p.name);
      this.status.text = mine && waiting.length > 0 ? `Waiting for ${waiting.join(', ')}` : !mine && waiting.length < session.config.players.length ? 'Someone is ready to go again' : '';
    } else {
      entries.push({ label: 'Go again', note: 'A new road, at once' });
      this.acts.push(() => this.host.act('again', true));
      entries.push({ label: 'Another class', note: 'Choose who walks in' });
      this.acts.push(() => this.host.act('class'));
      entries.push({ label: 'Title' });
      this.acts.push(() => this.host.act('title'));
      this.status.text = '';
    }
    this.list.set(entries);
    this.hint.text = s.pad ? 'Up and down      A  choose' : 'W S  choose      Enter  take';
    // what the run earned for the Attunement, and what that makes
    this.earned.text = s.gained > 0 ? `Stars  +${s.gained}     you hold ${s.save.resonance}` : '';
    // with nothing built and nothing earned there is nothing to show between the numbers and the list
    const top = this.builtHead.visible ? 376 : s.gained > 0 ? 326 : 292;
    this.list.y = top;
    const h = top + this.list.tall + 76;
    if (h !== this.h) {
      this.h = h;
      this.place();
    }
    this.glass
      .clear()
      .roundRect(0, 0, W, this.h, 12)
      .fill({ color: UI.glass, alpha: 0.95 })
      .roundRect(0, 0, W, this.h, 12)
      .stroke({ width: 2, color: won ? CHIME : UI.brass, alpha: 0.9 })
      .moveTo(PAD, 112)
      .lineTo(W - PAD, 112)
      .stroke({ width: 1, color: UI.brass, alpha: 0.45 });
    this.status.position.set(W / 2, this.h - 52);
    this.hint.position.set(W / 2, this.h - 30);
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
      uiSound('confirm');
      this.acts[take]();
    }
  }

  override destroy(): void {
    this.built.destroy();
    super.destroy();
  }
}

const results: ScreenFactory = (host) => new Results(host);
export default results;
