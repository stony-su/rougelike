// The soundboard (?sounds): every sound of the game by name, to be listened through one at a
// time, with the beds and the boss pulse beside them. Next to each name is what it measures
// alone at full level (measure.ts): its peak and its average, in decibels below full scale, in
// red if it has left the band the test holds every sound to. A development tool; the game never
// opens it.
import { GameAudio } from '../audio';
import { SOUND_BAND } from '../audio/levels';
import { decibels, measureSound } from '../audio/measure';
import { RECIPES, SOUND_GROUPS, homeNote } from '../audio/recipes';
import type { SoundId } from '../audio/recipes';
import { KEYS } from '../audio/scale';
import { CHIME, DANGER, PAPER, UI, css } from '../render/palette';
import type { ZoneId } from '../sim/defs';

const ZONE_NAMES: ReadonlyArray<readonly [ZoneId, string]> = [
  ['outer', 'Outer Ring'],
  ['inner', 'Inner Ring'],
  ['crater', 'Crater'],
];

const BUTTON = `font:inherit;cursor:pointer;padding:7px 11px;border-radius:4px;border:1px solid ${css(UI.rule)};background:${css(UI.glass)};color:${css(PAPER)};text-align:left;`;
const db = (level: number): string => (level > 0 ? decibels(level).toFixed(1) : '-inf');

export class Soundboard {
  readonly audio = new GameAudio();
  private zone: ZoneId = 'outer';
  private bed = false;
  private boss = false;
  private readonly root: HTMLDivElement;
  private readonly meter: HTMLSpanElement;
  /** The switches that show a choice, each with the test of whether it is the one chosen. */
  private readonly switches: Array<{ el: HTMLButtonElement; chosen: () => boolean }> = [];
  /** Sounds whose level has not been measured yet: one is measured between frames, so the page never stalls. */
  private readonly waiting: Array<{ id: SoundId; el: HTMLSpanElement }> = [];
  private frame = 0;
  private last = performance.now();

  constructor(parent: HTMLElement) {
    this.audio.setMusic(false);
    const root = document.createElement('div');
    root.style.cssText = `position:fixed;inset:0;overflow:auto;padding:22px 28px;box-sizing:border-box;background:${css(UI.scrim)};color:${css(UI.text)};font:14px/1.4 system-ui,sans-serif;`;
    this.root = root;

    const head = document.createElement('div');
    head.textContent = 'RESOUND soundboard';
    head.style.cssText = `font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${css(CHIME)};`;
    const note = document.createElement('div');
    note.textContent = 'Click a name to hear it alone at full level. Beside it: peak / average, in dB below full scale.';
    note.style.cssText = `margin:4px 0 14px;color:${css(UI.inkSoft)};`;
    root.append(head, note);

    const keys = this.row('Key');
    for (const [zone, name] of ZONE_NAMES) {
      this.choice(
        keys,
        `${name}: ${KEYS[zone].name}`,
        () => this.zone === zone,
        () => {
          this.zone = zone;
          this.audio.setZone(zone);
          this.audio.setBoss(this.boss);
        },
      );
    }
    const beds = this.row('Under it');
    this.choice(
      beds,
      'Bed',
      () => this.bed,
      () => {
        this.bed = !this.bed;
        this.audio.setMusic(this.bed);
      },
    );
    this.choice(
      beds,
      'Boss pulse',
      () => this.boss,
      () => {
        this.boss = !this.boss;
        this.audio.setBoss(this.boss);
      },
    );
    this.meter = document.createElement('span');
    this.meter.style.cssText = `margin-left:14px;font-variant-numeric:tabular-nums;color:${css(UI.inkSoft)};`;
    beds.appendChild(this.meter);

    for (const group of SOUND_GROUPS) {
      const row = this.row(group.name);
      for (const id of group.sounds) {
        const el = document.createElement('button');
        el.type = 'button';
        el.style.cssText = BUTTON;
        el.dataset.sound = id;
        const name = document.createElement('span');
        name.textContent = id;
        const level = document.createElement('span');
        level.textContent = ' ...';
        level.style.cssText = `margin-left:8px;font-size:12px;font-variant-numeric:tabular-nums;color:${css(UI.inkSoft)};`;
        el.append(name, level);
        el.addEventListener('click', () => this.play(id));
        row.appendChild(el);
        this.waiting.push({ id, el: level });
      }
    }

    // browsers only let sound start from a key or a click: any press on the page will do
    root.addEventListener('pointerdown', () => this.audio.unlock(), true);
    root.addEventListener('keydown', () => this.audio.unlock(), true);
    this.audio.setZone(this.zone);
    this.refresh();
    parent.appendChild(root);
    this.frame = requestAnimationFrame(this.tick);
  }

  /** Play one sound alone, at full level, in the middle, on its home note in the chosen key. */
  play(id: SoundId): void {
    this.audio.unlock();
    this.audio.play({ sound: id, gain: 1, pitch: 1, note: homeNote(RECIPES[id], this.zone), pan: 0, delay: 0 });
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.root.remove();
    this.audio.destroy();
  }

  private row(title: string): HTMLDivElement {
    const label = document.createElement('div');
    label.textContent = title;
    label.style.cssText = `margin:14px 0 6px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:${css(UI.brass)};`;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;';
    this.root.append(label, row);
    return row;
  }

  private choice(row: HTMLElement, text: string, chosen: () => boolean, pick: () => void): void {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = text;
    el.style.cssText = BUTTON;
    el.addEventListener('click', () => {
      this.audio.unlock();
      pick();
      this.refresh();
    });
    row.appendChild(el);
    this.switches.push({ el, chosen });
  }

  private refresh(): void {
    for (const s of this.switches) {
      const on = s.chosen();
      s.el.style.borderColor = css(on ? CHIME : UI.rule);
      s.el.style.color = css(on ? CHIME : PAPER);
    }
  }

  private readonly tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    const now = performance.now();
    this.audio.update(Math.min(0.1, (now - this.last) / 1000));
    this.last = now;
    const out = this.audio.level();
    this.meter.textContent = `going out: peak ${db(out.peak)} dB, average ${db(out.rms)} dB`;
    const next = this.waiting.shift();
    if (!next) return;
    const m = measureSound(next.id);
    const inBand = m.peak >= SOUND_BAND.peak[0] && m.peak <= SOUND_BAND.peak[1] && m.loud >= SOUND_BAND.loud[0] && m.loud <= SOUND_BAND.loud[1];
    next.el.textContent = ` ${db(m.peak)} / ${db(m.loud)}`;
    if (!inBand) next.el.style.color = css(DANGER);
  };
}
