// The screen lab (?lab=<screen id>): one modal screen on its own, fed by a real run and world,
// so a screen can be looked at and used without playing up to it. A development and
// verification tool, like the animation gallery.
//
//   ?lab=draft                       the screen to show (see LAB below)
//   &kit=signal_lamp,frost_gauge:2   instruments to own first (":n" gives rank n)
//   &chalk=120  &hp=40               the purse and the wound
//   &seed=abc                        fixes every roll
//
// When the screen reports that it is finished, the lab says what happened and Enter opens it
// again on the same run, so the effect of a choice can be seen on the next visit.
import type { Application } from 'pixi.js';
import { CONTENT } from '../content';
import { ZONES, PAPER } from '../render/palette';
import type { ContentRegistry } from '../sim/defs';
import { grantInstrument } from '../sim/kit';
import { createRun, enterRoom, rollDraft, takeOffer } from '../sim/run';
import type { RunState } from '../sim/run';
import type { World } from '../sim/types';
import { DraftScreen } from '../ui/draftScreen';
import { Label } from '../ui/label';
import type { Screen } from '../ui/screen';
import { setUiSoundSink } from '../ui/sfx';
import { Tweens } from '../ui/tween';
import { Input } from './input';

export interface LabContext {
  content: ContentRegistry;
  run: RunState;
  world: World;
  tweens: Tweens;
  /** Call when the screen is finished; `what` says how it ended. The lab then destroys the screen. */
  done(what: string): void;
}

/** Every screen the lab can show. To add one: import it, and add an entry that builds it from the context. */
export const LAB: Record<string, (c: LabContext) => Screen> = {
  draft: (c) =>
    new DraftScreen(c.content, c.run.kit, c.world.lines.stakes.length, c.tweens, rollDraft(c.run, c.world, false), {
      title: 'Requisition',
      subtitle: 'Sheet 3 of 12  -  choose one',
      rerolls: 2,
      onChoose: (offer, stake) => {
        takeOffer(c.run, c.world, offer, stake);
        c.done(`took ${offer.id} (${offer.how}) on stake ${stake + 1}`);
      },
      onReroll: () => rollDraft(c.run, c.world, false),
    }),
};

export interface LabOptions {
  screen: string;
  kit: string[];
  chalk: number;
  hp: number;
  seed: string;
}

export class Lab {
  readonly log: string[] = [];
  private readonly input: Input;
  private readonly tweens = new Tweens();
  private readonly run: RunState;
  private readonly world: World;
  private readonly note: Label;
  private screen: Screen | null = null;
  private viewW = 0;
  private viewH = 0;

  constructor(
    private readonly app: Application,
    private readonly opts: LabOptions,
  ) {
    app.renderer.background.color = ZONES.bluefen.ground;
    this.input = new Input(app.canvas);
    this.run = createRun(opts.seed);
    this.world = enterRoom(this.run, CONTENT);
    for (const entry of opts.kit) {
      const [id, rank] = entry.split(':');
      for (let i = 0; i < Math.max(1, Number(rank) || 1); i++) grantInstrument(this.world, id);
    }
    this.world.chalk = this.run.chalk = opts.chalk;
    this.world.player.hp = this.run.hp = Math.max(1, Math.min(this.world.player.maxHp, opts.hp));
    setUiSoundSink((sound) => this.log.push(`sound:${sound}`));

    this.note = new Label('', { size: 10, color: PAPER, tracking: 0.12, align: 'center' });
    app.stage.addChild(this.note);
    this.open();
    app.ticker.add(this.frame, this);
  }

  /** A plain snapshot for automated checks. */
  state(): Record<string, unknown> {
    const p = this.world.player;
    return {
      open: this.screen !== null,
      chalk: this.world.chalk,
      hp: p.hp,
      maxHp: p.maxHp,
      owned: { ...this.run.kit.owned },
      heads: this.run.kit.heads.slice(0, this.world.lines.stakes.length),
      handicap: this.world.flow.handicap,
      phase: this.world.flow.phase,
      log: this.log.slice(-12),
    };
  }

  private open(): void {
    const make = LAB[this.opts.screen];
    if (!make) {
      this.note.text = `No such screen: ${this.opts.screen}.  Try ${Object.keys(LAB).join(', ')}`;
      return;
    }
    this.note.text = '';
    this.screen = make({
      content: CONTENT,
      run: this.run,
      world: this.world,
      tweens: this.tweens,
      done: (what) => this.close(what),
    });
    this.app.stage.addChildAt(this.screen.root, 0);
    this.screen.layout(this.viewW, this.viewH);
  }

  private close(what: string): void {
    this.log.push(`done:${what}`);
    this.tweens.clear();
    this.screen?.destroy();
    this.screen = null;
    this.note.text = `Closed: ${what}.   Enter opens it again`;
  }

  private frame(): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    if (w !== this.viewW || h !== this.viewH) {
      this.viewW = w;
      this.viewH = h;
      this.note.position.set(w / 2, h - 40);
      this.screen?.layout(w, h);
    }
    const dt = Math.min(this.app.ticker.elapsedMS, 100) / 1000;
    this.tweens.update(dt);
    if (this.screen) this.screen.update(dt, this.input);
    else if (this.input.takeCode('Enter')) this.open();
    // presses nobody wanted do not wait around for the next screen
    this.input.takeAny();
  }
}
