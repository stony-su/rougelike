// Choosing a class: three cards side by side, each with its Returner going through their moves
// and a few lines on how they fight, so nobody needs a legend on the screen to begin.
import { Container, Graphics } from 'pixi.js';
import type { MenuKeys } from '../../game/input';
import { PAPER, PLAYER_COLORS, UI } from '../../render/palette';
import { TONES } from '../../render/palette/tones';
import { animInput } from '../../render/rig/def';
import { HERO_RIG, rigEntry } from '../../render/rig/registry';
import type { RigEntry } from '../../render/rig/registry';
import { RigView } from '../../render/rig/view';
import type { ClassId } from '../../sim/types';
import { Label } from '../label';
import { uiSound } from '../sfx';
import { PanelScreen } from '../screen';
import type { Pointer, ScreenFactory, ScreenHost } from '../screen';

const CARD_W = 310;
const CARD_H = 566;
const GAP = 30;
const W = CARD_W * 3 + GAP * 2;
const H = CARD_H + 150;
const STAGE_H = 190;

interface ClassWords {
  id: ClassId;
  name: string;
  weapon: string;
  attack: string;
  special: string;
  plays: string;
}

const CLASSES: readonly ClassWords[] = [
  {
    id: 'sword',
    name: 'The Edge',
    weapon: 'Sword',
    attack: 'Every swing turns enemy shots back where you aim, and bats away an Echo caught in its own attack. Three cuts; the third launches.',
    special: 'Riposte. A guard: whatever lands in it goes back, harder.',
    plays: 'Stand in the fire and aim your returns.',
  },
  {
    id: 'bow',
    name: 'The String',
    weapon: 'Bow',
    attack: 'Arrows bounce off walls and skip from one Echo to the next, harder with every bounce. The dotted line is the path the arrow will take.',
    special: 'Ringstone. A stone that sends shots and flung bodies on to the nearest Echo.',
    plays: 'Read the angles of the room.',
  },
  {
    id: 'fist',
    name: 'The Hand',
    weapon: 'Fist',
    attack: 'Jabs on the press. Keep the button held to draw back a Haymaker that throws its target into walls and into its friends.',
    special: 'Break. A slam that pops everything near you outward.',
    plays: 'Line up bodies and walls.',
  },
];

/** The moves a card's Returner goes through while it is pointed at: state, variant, seconds. */
const SHOW: ReadonlyArray<readonly [string, number, number]> = [
  ['idle', 0, 0.9],
  ['attack', 0, 0.34],
  ['attack', 1, 0.34],
  ['attack', 2, 0.46],
  ['idle', 0, 0.5],
  ['special', 0, 0.7],
  ['idle', 0, 0.6],
  ['run', 0, 1.1],
];
const SHOW_LENGTH = SHOW.reduce((n, s) => n + s[2], 0);

class ClassCard extends Container {
  private readonly glow = new Graphics();
  private readonly rig: RigView;
  private readonly entry: RigEntry;
  private readonly anim = animInput();
  private lift = 0;
  private target = 0;
  private time = 0;
  private clock = 0;

  constructor(
    readonly words: ClassWords,
    key: number,
  ) {
    super();
    const tone = TONES[words.id];
    const body = new Graphics();
    body.roundRect(5, 8, CARD_W, CARD_H, 12).fill({ color: 0x000000, alpha: 0.42 });
    body.roundRect(0, 0, CARD_W, CARD_H, 12).fill({ color: UI.glass, alpha: 0.96 });
    body.roundRect(8, 8, CARD_W - 16, STAGE_H, 7).fill({ color: tone.deep, alpha: 1 });
    // the ground the Returner stands on: rings
    for (const r of [26, 50, 76]) body.ellipse(CARD_W / 2, STAGE_H - 28, r * 1.5, r * 0.5).stroke({ width: 1.5, color: tone.color, alpha: 0.34 - r * 0.003 });
    body.roundRect(0, 0, CARD_W, CARD_H, 12).stroke({ width: 2, color: tone.color, alpha: 0.7 });
    this.glow.roundRect(-5, -5, CARD_W + 10, CARD_H + 10, 15).stroke({ width: 4, color: tone.color, alpha: 1 });
    this.glow.alpha = 0;
    this.addChild(this.glow, body);

    this.entry = rigEntry(HERO_RIG[words.id]);
    this.rig = new RigView(this.entry.def, { accent: PLAYER_COLORS[0] });
    this.rig.root.position.set(CARD_W / 2, STAGE_H - 26);
    this.rig.root.scale.set(1.9);
    this.addChild(this.rig.root);

    const pad = 24;
    const name = new Label(words.name, { size: 20, color: tone.pale, bold: true, tracking: 0.16 });
    name.position.set(pad, STAGE_H + 30);
    const weapon = new Label(words.weapon, { size: 9, color: tone.color, tracking: 0.4, align: 'right' });
    weapon.position.set(CARD_W - pad, STAGE_H + 38);
    this.addChild(name, weapon);
    let y = STAGE_H + 76;
    for (const [head, text] of [
      ['Attack', words.attack],
      ['Special', words.special],
      ['Plays like', words.plays],
    ]) {
      const h = new Label(head, { size: 8, color: UI.brass, bold: true, tracking: 0.34 });
      h.position.set(pad, y);
      const t = new Label(text, { size: 9, color: PAPER, tracking: 0.05, maxWidth: CARD_W - pad * 2, lineHeight: 1.85 });
      t.position.set(pad, y + 18);
      this.addChild(h, t);
      y += 18 + t.textHeight + 22;
    }
    const cap = new Graphics().roundRect(CARD_W / 2 - 15, CARD_H - 38, 30, 24, 4).stroke({ width: 1.5, color: UI.brass, alpha: 0.8 });
    const digit = new Label(String(key), { size: 10, color: UI.brass, bold: true, align: 'center' });
    digit.position.set(CARD_W / 2, CARD_H - 31);
    this.addChild(cap, digit);
    this.pivot.set(CARD_W / 2, CARD_H / 2);
  }

  setSelected(on: boolean): void {
    if (on && this.target === 0) this.clock = 0;
    this.target = on ? 1 : 0;
  }

  update(dt: number): void {
    this.time += dt;
    this.lift += (this.target - this.lift) * Math.min(1, dt * 16);
    this.glow.alpha = this.lift;
    this.scale.set(1 + this.lift * 0.04);
    // the one pointed at shows what they do; the others stand and breathe
    const a = this.anim;
    a.state = 'idle';
    a.variant = 0;
    a.phase = 0;
    a.t = this.time;
    a.speed = 0;
    if (this.target > 0) {
      this.clock = (this.clock + dt) % SHOW_LENGTH;
      let t = this.clock;
      for (const [state, variant, seconds] of SHOW) {
        if (t < seconds) {
          a.state = state;
          a.variant = variant;
          a.phase = Math.min(1, t / seconds);
          a.t = t;
          a.speed = state === 'run' ? 1 : 0;
          break;
        }
        t -= seconds;
      }
    }
    a.time = this.time;
    a.stride = this.time * 5.4;
    a.aim = -0.3;
    a.seed = 0.37;
    this.rig.setFacing(1, false);
    this.rig.beginPose();
    this.rig.applyPose(dt, this.entry.animator(this.rig, a));
  }

  dispose(): void {
    this.rig.destroy();
  }
}

class ClassSelect extends PanelScreen {
  private readonly cards: ClassCard[];
  private readonly hint: Label;
  private selected = 0;

  constructor(host: ScreenHost) {
    super(host, W, H, 0.35);
    const title = new Label('Who walks in', { size: 24, color: PAPER, bold: true, tracking: 0.3, align: 'center' });
    title.position.set(W / 2, 20);
    this.cards = CLASSES.map((c, i) => new ClassCard(c, i + 1));
    this.cards.forEach((c, i) => c.position.set(i * (CARD_W + GAP) + CARD_W / 2, 80 + CARD_H / 2));
    this.hint = new Label('', { size: 9, color: UI.inkSoft, tracking: 0.22, align: 'center' });
    this.hint.position.set(W / 2, H - 26);
    this.panel.addChild(title, ...this.cards, this.hint);
  }

  enter(): void {
    this.appear();
    this.selected = Math.max(
      0,
      CLASSES.findIndex((c) => c.id === this.host.state.classId),
    );
  }

  private point(i: number): void {
    const next = Math.max(0, Math.min(this.cards.length - 1, i));
    if (next !== this.selected) uiSound('move');
    this.selected = next;
  }

  update(dt: number, keys: MenuKeys, pointer: Pointer): void {
    this.fade(dt);
    this.hint.text = this.host.state.pad ? 'Left and right      A  begin      B  back' : '1, 2 or 3, or A D and Enter      Esc  back';
    if (keys.dx !== 0) this.point(this.selected + keys.dx);
    let take = keys.confirm ? this.selected : -1;
    if (pointer.moved || pointer.click) {
      const x = this.px(pointer);
      const y = this.py(pointer);
      this.cards.forEach((c, i) => {
        if (Math.abs(x - c.x) > CARD_W / 2 || Math.abs(y - c.y) > CARD_H / 2) return;
        this.point(i);
        if (pointer.click) take = i;
      });
    }
    if (keys.digit >= 1 && keys.digit <= this.cards.length) take = keys.digit - 1;
    this.cards.forEach((c, i) => {
      c.setSelected(i === this.selected);
      c.update(dt);
    });
    if (take >= 0) {
      uiSound('confirm');
      this.host.act('play', CLASSES[take].id);
    } else if (keys.back) {
      uiSound('back');
      this.host.close();
    }
  }

  override destroy(): void {
    for (const c of this.cards) c.dispose();
    super.destroy();
  }
}

const classSelect: ScreenFactory = (host) => new ClassSelect(host);
export default classSelect;
