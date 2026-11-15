// The Attunement: what a player keeps between runs. Resonance is earned on the road and spent
// here, on entries with one or more ranks; a class that has been given the right is issued a
// Tuning to begin with, chosen with left and right. Beside the list stand the records of each
// class, and under it the way to carry the save to another address as a code.
import { Graphics } from 'pixi.js';
import { RESONANCE } from '../../content/attunement';
import type { MenuKeys } from '../../game/input';
import { issuable, mayIssue, offered, priceOf, rankOf } from '../../game/save';
import { CHIME, PAPER, UI } from '../../render/palette';
import { TONES } from '../../render/palette/tones';
import type { ContentRegistry } from '../../sim/defs';
import { SIM_HZ } from '../../sim/tuning';
import type { ClassId } from '../../sim/types';
import { Label } from '../label';
import { MenuList } from '../menuList';
import type { MenuEntry } from '../menuList';
import { PanelScreen } from '../screen';
import type { Pointer, ScreenFactory, ScreenHost } from '../screen';
import { uiSound } from '../sfx';

const W = 920;
const PAD = 36;
const LIST_W = 540;
const TOP = 132;
const SIDE_X = PAD + LIST_W + 34;

const RANKS = ['', 'I', 'II', 'III', 'IV'];
const CLASSES: ReadonlyArray<readonly [ClassId, string]> = [
  ['sword', 'The Edge'],
  ['bow', 'The String'],
  ['fist', 'The Hand'],
];

const clock = (ticks: number): string => {
  const s = Math.floor(ticks / SIM_HZ);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

type Act = { kind: 'buy'; id: string } | { kind: 'issue'; classId: ClassId } | { kind: 'code'; what: 'write' | 'read' } | { kind: 'back' };

class Attunement extends PanelScreen {
  private readonly glass = new Graphics();
  private readonly ring = new Graphics();
  private readonly purse: Label;
  private readonly list = new MenuList(LIST_W, 46);
  private readonly records: Label[] = [];
  private readonly status: Label;
  private readonly hint: Label;
  private acts: Act[] = [];

  constructor(
    host: ScreenHost,
    private readonly content: ContentRegistry,
  ) {
    super(host, W, 700, 0.7);
    const title = new Label('The Attunement', { size: 24, color: PAPER, bold: true, tracking: 0.26 });
    title.position.set(PAD, 30);
    this.purse = new Label('0', { size: 16, color: CHIME, bold: true, tracking: 0.1, align: 'right' });
    this.purse.position.set(W - PAD, 34);
    const how = new Label(`Resonance is earned on the road and kept: ${RESONANCE.chamber} for each chamber cleared, ${RESONANCE.miniboss} for the Carillon, ${RESONANCE.boss} for the Toll.`, {
      size: 9,
      color: UI.inkSoft,
      tracking: 0.1,
      maxWidth: W - PAD * 2,
    });
    how.position.set(PAD, 86);
    this.list.position.set(PAD, TOP);
    this.panel.addChild(this.glass, title, this.ring, this.purse, how, this.list);
    const head = new Label('Records', { size: 10, color: UI.brass, bold: true, tracking: 0.34 });
    head.position.set(SIDE_X, TOP + 4);
    this.panel.addChild(head);
    CLASSES.forEach(([id, name], i) => {
      const who = new Label(name, { size: 12, color: TONES[id].pale, bold: true, tracking: 0.14 });
      who.position.set(SIDE_X, TOP + 40 + i * 104);
      const what = new Label('', { size: 9, color: UI.text, tracking: 0.06, maxWidth: W - PAD - SIDE_X, lineHeight: 1.9 });
      what.position.set(SIDE_X, TOP + 64 + i * 104);
      this.records.push(what);
      this.panel.addChild(who, what);
    });
    this.status = new Label('', { size: 9, color: CHIME, tracking: 0.2 });
    this.hint = new Label('', { size: 9, color: UI.inkSoft, tracking: 0.22 });
    this.panel.addChild(this.status, this.hint);
  }

  enter(): void {
    this.appear();
    this.list.choice = 0;
    this.host.state.note = '';
  }

  private build(): void {
    const save = this.host.state.save;
    const entries: MenuEntry[] = [];
    this.acts = [];
    for (const def of offered(this.content)) {
      const rank = rankOf(save, def.id);
      const price = priceOf(save, def);
      const issues = def.gives.issue;
      if (issues && rank > 0) {
        // bought: the row now chooses which Tuning that class begins with
        const id = save.issued[issues];
        const t = this.content.tunings[id];
        entries.push({ label: def.name, note: 'Left and right choose the Tuning', value: t ? t.name : 'None', adjust: true });
        this.acts.push({ kind: 'issue', classId: issues });
        continue;
      }
      const full = price < 0;
      const text = def.text[Math.min(def.costs.length - 1, full ? rank - 1 : rank)] ?? '';
      const name = def.costs.length > 1 ? `${def.name}   ${RANKS[Math.min(RANKS.length - 1, full ? rank : rank + 1)]}` : def.name;
      entries.push({ label: name, note: text, value: full ? 'Held' : String(price), off: !full && save.resonance < price });
      this.acts.push({ kind: 'buy', id: def.id });
    }
    entries.push({ label: 'Write this save out as a code', note: 'To carry it to another address or another laptop' });
    this.acts.push({ kind: 'code', what: 'write' });
    entries.push({ label: 'Read a save from a code', note: 'It replaces what is kept here' });
    this.acts.push({ kind: 'code', what: 'read' });
    entries.push({ label: 'Back' });
    this.acts.push({ kind: 'back' });
    this.list.set(entries);

    this.purse.text = String(save.resonance);
    const rx = W - PAD - this.purse.textWidth - 22;
    this.ring.clear().circle(rx, 42, 9).stroke({ width: 2.5, color: CHIME, alpha: 1 }).circle(rx, 42, 3).fill(CHIME);
    CLASSES.forEach(([id], i) => {
      const r = save.records[id];
      this.records[i].text =
        r.runs === 0
          ? 'Has not walked yet.'
          : `${r.runs} ${r.runs === 1 ? 'run' : 'runs'}, ${r.wins} won.\nFurthest: chamber ${r.best} of 12.
Best Rally: ${r.rally}.${r.fastest > 0 ? `\nQuickest win: ${clock(r.fastest)}.` : ''}`;
    });
    const h = TOP + Math.max(this.list.tall, 350) + 70;
    if (h !== this.h) {
      this.h = h;
      this.place();
    }
    this.glass
      .clear()
      .roundRect(0, 0, W, this.h, 12)
      .fill({ color: UI.glass, alpha: 0.96 })
      .roundRect(0, 0, W, this.h, 12)
      .stroke({ width: 2, color: UI.brass, alpha: 0.9 })
      .moveTo(PAD, 74)
      .lineTo(W - PAD, 74)
      .stroke({ width: 1, color: UI.brass, alpha: 0.45 });
    this.status.text = this.host.state.note;
    this.status.position.set(SIDE_X, this.h - 36);
    this.hint.text = this.host.state.pad ? 'Up and down      A  take      B  back' : 'W S  choose      Enter  take      Esc  back';
    this.hint.position.set(PAD, this.h - 36);
  }

  /** Take the row pointed at; `dir` is which way a chooser is being turned (0 for a plain take). */
  private take(row: number, dir: number): void {
    const act = this.acts[row];
    const save = this.host.state.save;
    if (!act) return;
    if (act.kind === 'back') {
      if (dir !== 0) return;
      uiSound('back');
      this.host.close();
    } else if (act.kind === 'code') {
      if (dir !== 0) return;
      uiSound('confirm');
      this.host.act('code', act.what);
    } else if (act.kind === 'issue') {
      // none, then each Tuning the class could be issued, and round again
      const choices = ['', ...issuable(act.classId, save, this.content)];
      const at = Math.max(0, choices.indexOf(save.issued[act.classId]));
      const next = choices[(at + (dir === 0 ? 1 : dir) + choices.length) % choices.length];
      if (mayIssue(save, act.classId)) {
        uiSound('move');
        this.host.act('issue', [act.classId, next]);
      }
    } else if (dir === 0) {
      const def = offered(this.content).find((d) => d.id === act.id);
      const price = def ? priceOf(save, def) : -1;
      if (price < 0 || save.resonance < price) uiSound('error');
      else {
        uiSound('buy');
        this.host.act('attune', act.id);
      }
    }
  }

  update(dt: number, keys: MenuKeys, pointer: Pointer): void {
    this.fade(dt);
    this.build();
    if (keys.dy !== 0) this.list.move(keys.dy);
    if (keys.dx !== 0) this.take(this.list.choice, keys.dx);
    let take = keys.confirm ? this.list.choice : -1;
    if (pointer.moved || pointer.click) {
      const over = this.list.hit(this.px(pointer), this.py(pointer));
      if (pointer.click && over >= 0) take = over;
    }
    if (take >= 0) this.take(take, 0);
    else if (keys.back) {
      uiSound('back');
      this.host.close();
    }
  }
}

const attunement: ScreenFactory = (host) => new Attunement(host, host.state.content);
export default attunement;
