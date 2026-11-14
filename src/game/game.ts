// Ties the simulation, the renderer, the interface and input together and runs the frame.
//
// The game is always in one of these modes:
//   play    the simulation runs
//   modal   a screen is open (the draft, the shop, ...) and the simulation waits
//   wipe    the sheet is being turned: the room is swapped while the ink covers it
//   over    the Chainman has fallen; the world plays on for a beat, then the run begins again
import { BitmapFont, BitmapText, UPDATE_PRIORITY } from 'pixi.js';
import type { Application, Ticker } from 'pixi.js';
import { CONTENT } from '../content';
import { SMUDGE } from '../content/enemies';
import { Ambient } from '../render/ambient';
import { Camera } from '../render/camera';
import { DamageNumbers } from '../render/damageNumbers';
import { EnemyViews } from '../render/enemyView';
import { FlowView } from '../render/flowView';
import { Fx } from '../render/fx';
import { LinesView } from '../render/linesView';
import { CHALK, DANGER, PAPER, ZONES, css } from '../render/palette';
import type { ZoneTheme } from '../render/palette';
import { Particles } from '../render/particles';
import { PlayerView } from '../render/playerView';
import { ProjectileViews } from '../render/projectileView';
import { RoomView } from '../render/roomView';
import { Stage } from '../render/stage';
import { TelegraphViews } from '../render/telegraphView';
import { Textures } from '../render/textures';
import { spawnEnemy } from '../sim/ai';
import { finishReward, newMemo, steadyPolicy, steer } from '../sim/autoplay';
import type { RoomMemo } from '../sim/autoplay';
import { lineBot, rodBot } from '../sim/bots';
import type { Bot } from '../sim/bots';
import type { RoomKind } from '../sim/defs';
import { grantInstrument } from '../sim/kit';
import { previewSweep } from '../sim/lines';
import { randomFloorPoint } from '../sim/room';
import { SHEETS, chooseDoor, createRun, enterRoom, jumpTo, leaveRoom, rollDraft, takeOffer } from '../sim/run';
import type { DraftOffer, RunState } from '../sim/run';
import { SIM_HZ } from '../sim/tuning';
import type { SimEvent, World } from '../sim/types';
import { stepWorld } from '../sim/world';
import { DraftScreen } from '../ui/draftScreen';
import { Hud } from '../ui/hud';
import type { Screen } from '../ui/screen';
import { Tweens } from '../ui/tween';
import { Wipe } from '../ui/wipe';
import { Input } from './input';
import { FixedLoop } from './loop';

export interface GameOptions {
  debug: boolean;
  seed: string;
  /** Let a bot play (debug and automated checks): 'rod', 'line', 'camp', 'mash', or '' for a human. */
  autopilot: string;
  /** Stress scene: keep this many enemies alive and make the player unkillable. 0 = off. */
  stress: number;
  /** Development: begin on this sheet (1..12). 0 = the usual start. */
  sheet: number;
  /** Development: begin in this kind of room ('' = whatever the sheet would be). */
  room: string;
  /** Development: instruments to own from the start, as "id" or "id:rank". */
  kit: string[];
  /** Development: Chalk to start with. */
  chalk: number;
}

type Mode = 'play' | 'modal' | 'wipe' | 'over';

const ROOM_WORDS: Record<RoomKind, string> = {
  combat: '',
  tutorial: 'The Baseline',
  shop: 'The Tally Tent',
  rest: 'The Trig Pillar',
  event: 'A Disputed Claim',
  miniboss: 'The Counterclaim',
  boss: 'Point Zero',
};

/** Seconds the world plays on after the Chainman falls. */
const DEATH_BEAT = 2.4;

export class Game {
  readonly stage = new Stage();
  readonly camera = new Camera();
  readonly input: Input;
  readonly textures: Textures;
  world: World;
  run: RunState;

  private mode: Mode = 'play';
  private theme: ZoneTheme;
  private roomView: RoomView;
  private readonly playerView: PlayerView;
  private readonly enemyViews: EnemyViews;
  private readonly telegraphViews: TelegraphViews;
  private readonly projectileViews: ProjectileViews;
  private readonly linesView: LinesView;
  private readonly flowView: FlowView;
  private readonly particles: Particles;
  private readonly numbers: DamageNumbers;
  private readonly fx: Fx;
  private readonly hud: Hud;
  private readonly ambient: Ambient;
  private readonly wipe = new Wipe();
  private readonly uiTweens = new Tweens();
  private screen: Screen | null = null;
  private screenName = '';
  /** The draft on the table, for the autopilot. */
  private draftOffers: DraftOffer[] = [];
  private bot: Bot | null;
  private memo: RoomMemo = newMemo();
  private pilotT = 0;
  private readonly loop = new FixedLoop(1000 / SIM_HZ);
  private time = 0;
  private viewW = 0;
  private viewH = 0;
  private runCount = 0;
  private deadFor = 0;
  /** True once the new room has been built behind the wipe. */
  private swapped = false;
  private debugText: BitmapText | null = null;
  private readonly frameTimes: number[] = [];
  private readonly workTimes: number[] = [];
  private readonly renderTimes: number[] = [];
  private renderStart = 0;
  private lastFrameAt = 0;

  constructor(
    private readonly app: Application,
    private readonly opts: GameOptions,
  ) {
    app.stage.addChild(this.stage.root);
    this.textures = new Textures(app.renderer);
    this.input = new Input(app.canvas);
    this.bot = Game.makeBot(opts.autopilot);

    this.run = this.newRun();
    this.world = enterRoom(this.run, CONTENT);
    this.grantStartKit();
    const room = this.world.room;
    this.theme = ZONES[room.zone];
    app.renderer.background.color = this.theme.voidColor;

    this.roomView = new RoomView(room, this.theme, this.stage, app.renderer);
    this.particles = new Particles(this.stage, this.textures);
    this.numbers = new DamageNumbers(this.stage);
    this.telegraphViews = new TelegraphViews(this.stage);
    this.linesView = new LinesView(this.stage, this.textures, app.renderer);
    this.flowView = new FlowView(this.stage, this.textures, this.theme);
    this.enemyViews = new EnemyViews(this.stage, this.theme);
    this.projectileViews = new ProjectileViews(this.stage, this.textures);
    this.playerView = new PlayerView(this.stage);
    this.playerView.snap(this.world);
    this.fx = new Fx(this.stage, this.particles, this.camera, this.numbers, this.theme);
    this.ambient = new Ambient(this.stage, this.textures, room, this.theme);
    this.hud = new Hud();
    this.stage.ui.addChild(this.hud.root);
    // the wipe covers everything, the interface included
    this.stage.root.addChild(this.wipe.root);

    if (opts.debug) {
      BitmapFont.install({
        name: 'debug',
        style: { fontFamily: 'Consolas, Menlo, monospace', fontSize: 14, fill: css(ZONES.bluefen.highlight) },
        chars: [[' ', '~']],
      });
      this.debugText = new BitmapText({ text: '', style: { fontFamily: 'debug', fontSize: 14 } });
      this.stage.ui.addChild(this.debugText);
    }

    this.onResize();
    this.camera.frameRoom(room, true);
    this.hud.setSheet(this.sheetHeading(), this.sheetSub());
    app.ticker.add(this.frame, this);
    // Bracket Pixi's own render call (which runs at LOW priority) to time it.
    app.ticker.add(this.beforeRender, this, UPDATE_PRIORITY.LOW + 1);
    app.ticker.add(this.afterRender, this, UPDATE_PRIORITY.UTILITY);
  }

  destroy(): void {
    this.app.ticker.remove(this.frame, this);
    this.app.ticker.remove(this.beforeRender, this);
    this.app.ticker.remove(this.afterRender, this);
    this.closeScreen();
    this.input.destroy();
    this.playerView.destroy();
    this.enemyViews.clear();
    this.projectileViews.clear();
    this.telegraphViews.clear();
    this.linesView.destroy();
    this.flowView.destroy();
    this.roomView.destroy();
    this.ambient.destroy();
    this.particles.destroy();
    this.numbers.destroy();
    this.hud.destroy();
    this.wipe.destroy();
    this.textures.destroy();
    this.stage.root.destroy({ children: true });
  }

  /** Begin a new run from sheet 1. No page reload. */
  restartRun(): void {
    if (this.mode === 'wipe') return;
    this.closeScreen();
    this.run = this.newRun();
    this.turnSheet();
  }

  setAutopilot(name: string): void {
    this.bot = Game.makeBot(name);
  }

  private static makeBot(name: string): Bot | null {
    switch (name) {
      case 'rod':
        return rodBot();
      case 'line':
        return lineBot({ reaction: 0.2, style: 'active', patient: true });
      case 'camp':
        return lineBot({ reaction: 0.2, style: 'camp', patient: true });
      case 'mash':
        return lineBot({ reaction: 0.2, style: 'mash', patient: false });
      default:
        return null;
    }
  }

  /** A plain snapshot for automated checks. */
  debugState(): Record<string, unknown> {
    const w = this.world;
    const p = w.player;
    const q = (arr: number[], f: number): number => {
      if (!arr.length) return 0;
      const s = arr.slice().sort((a, b) => a - b);
      return +s[Math.min(s.length - 1, Math.floor(s.length * f))].toFixed(2);
    };
    return {
      tick: w.tick,
      mode: this.mode,
      screen: this.screen ? this.screenName : null,
      run: { sheet: this.run.sheet, zone: this.run.zone, kind: this.run.slot.kind, elite: this.run.slot.elite, hp: this.run.hp, chalk: this.run.chalk, drafts: this.run.drafts, over: this.run.over },
      room: { id: w.room.id, phase: w.flow.phase, wave: w.flow.wave, waves: w.flow.waves, doors: w.flow.doors.map((d) => d.kind), near: w.flow.near, pickups: w.flow.pickups.length },
      interactables: w.flow.interactables.map((i) => ({ id: i.id, kind: i.kind, active: i.active, x: +i.x.toFixed(2), y: +i.y.toFixed(2) })),
      player: { x: +p.x.toFixed(3), y: +p.y.toFixed(3), state: p.state, dashCharges: p.dashCharges, hp: p.hp, maxHp: p.maxHp, combo: p.combo },
      chalk: w.chalk,
      kit: { owned: { ...w.kit.owned }, heads: w.kit.heads.slice(0, w.lines.stakes.length) },
      stakes: w.lines.stakes.map((s) => s.state),
      enemies: w.enemies.map((e) => ({ id: e.id, kind: e.def.id, state: e.state, hp: e.hp, x: +e.x.toFixed(2), y: +e.y.toFixed(2), elite: e.elite })),
      telegraphs: w.telegraphs.length,
      projectiles: w.projectiles.length,
      stats: w.stats,
      frameMs: { median: q(this.frameTimes, 0.5), p95: q(this.frameTimes, 0.95), max: q(this.frameTimes, 1), samples: this.frameTimes.length },
      workMs: { median: q(this.workTimes, 0.5), p95: q(this.workTimes, 0.95), max: q(this.workTimes, 1) },
      renderMs: { median: q(this.renderTimes, 0.5), p95: q(this.renderTimes, 0.95), max: q(this.renderTimes, 1) },
      slowFrames: this.frameTimes.filter((t) => t > 20).length,
      sortables: this.stage.depth.count,
      views: this.enemyViews.count,
      view: [this.viewW, this.viewH],
      zoom: +this.camera.zoom.toFixed(3),
    };
  }

  /** World position to screen pixels, for automated input. */
  worldToScreen(x: number, y: number): [number, number] {
    const out = { x: 0, y: 0 };
    this.camera.worldToScreen(x, y, 0, out);
    return [out.x, out.y];
  }

  // ---------------------------------------------------------------- the run

  private newRun(): RunState {
    this.runCount++;
    const first = this.runCount === 1;
    const run = createRun(first ? this.opts.seed : `${this.opts.seed}:${this.runCount}`, { startChalk: this.opts.chalk });
    // development starts apply to the first run only: a restart is always a real run
    if (first && (this.opts.sheet > 1 || this.opts.room)) jumpTo(run, Math.max(1, this.opts.sheet), (this.opts.room || undefined) as RoomKind | undefined);
    return run;
  }

  private grantStartKit(): void {
    if (this.runCount !== 1) return;
    for (const entry of this.opts.kit) {
      const [id, rank] = entry.split(':');
      for (let i = 0; i < Math.max(1, Number(rank) || 1); i++) grantInstrument(this.world, id);
    }
  }

  private sheetHeading(): string {
    return this.run.sheet === 0 ? 'Sheet 0' : `Sheet ${this.run.sheet} of ${SHEETS}`;
  }

  private sheetSub(): string {
    const words = ROOM_WORDS[this.run.slot.kind];
    return `${ZONES[this.run.zone].name}  -  ${words || this.world.room.name}`;
  }

  /** Turn to the run's current sheet behind an ink wipe. */
  private turnSheet(): void {
    this.mode = 'wipe';
    this.swapped = false;
    const words = ROOM_WORDS[this.run.slot.kind] || (this.run.slot.elite ? `${ZONES[this.run.zone].name}: elite ground` : ZONES[this.run.zone].name);
    this.wipe.start(this.sheetHeading(), words, () => {
      this.loadRoom();
      this.swapped = true;
    });
  }

  /** Build the world and the views for the run's current room. */
  private loadRoom(): void {
    const w = enterRoom(this.run, CONTENT);
    this.world = w;
    const room = w.room;
    this.theme = ZONES[room.zone];
    this.app.renderer.background.color = this.theme.voidColor;
    this.roomView.destroy();
    this.roomView = new RoomView(room, this.theme, this.stage, this.app.renderer);
    this.enemyViews.clear();
    this.projectileViews.clear();
    this.telegraphViews.clear();
    this.linesView.clear();
    this.flowView.clear();
    this.particles.clear();
    this.numbers.clear();
    this.fx.clear();
    this.enemyViews.setTheme(this.theme);
    this.fx.setTheme(this.theme);
    this.flowView.setTheme(this.theme);
    this.ambient.setRoom(room, this.theme);
    this.playerView.snap(w);
    this.camera.frameRoom(room, true);
    this.loop.reset();
    this.memo = newMemo();
    this.deadFor = 0;
    this.hud.setSheet(this.sheetHeading(), this.sheetSub());
  }

  // ---------------------------------------------------------------- screens

  private openScreen(name: string, screen: Screen): void {
    this.closeScreen();
    this.screen = screen;
    this.screenName = name;
    this.mode = 'modal';
    this.pilotT = 0;
    this.input.clearPresses();
    this.stage.ui.addChild(screen.root);
    screen.layout(this.viewW, this.viewH);
  }

  private closeScreen(): void {
    if (!this.screen) return;
    // tweens may still be aimed at the screen's parts: drop them before the parts go
    this.uiTweens.clear();
    this.screen.destroy();
    this.screen = null;
    this.input.clearPresses();
    if (this.mode === 'modal') this.mode = 'play';
  }

  private openDraft(): void {
    const w = this.world;
    const run = this.run;
    const rare = w.flow.elite || w.flow.kind === 'event' || w.flow.kind === 'miniboss';
    const offers = rollDraft(run, w, rare);
    if (offers.length === 0) {
      // every instrument is owned at full rank: the Office pays in Chalk instead
      w.chalk += 40;
      this.hud.banner('Nothing left to requisition: 40 Chalk', CHALK, 2.2);
      finishReward(run, w);
      return;
    }
    this.draftOffers = offers;
    this.openScreen(
      'draft',
      new DraftScreen(CONTENT, run.kit, w.lines.stakes.length, this.uiTweens, offers, {
        title: rare ? 'Rare requisition' : 'Requisition',
        subtitle: `${this.sheetHeading()}  -  choose one`,
        rerolls: run.rerolls,
        onChoose: (offer, stake) => {
          takeOffer(run, w, offer, stake);
          this.closeScreen();
          finishReward(run, w);
        },
        onReroll: () => {
          if (run.rerolls <= 0) return null;
          run.rerolls--;
          this.draftOffers = rollDraft(run, w, rare);
          return this.draftOffers;
        },
      }),
    );
  }

  /** With the autopilot on, answer the open screen by pressing its keys, slowly enough to be seen. */
  private pilotScreen(dt: number): void {
    this.pilotT += dt;
    if (this.pilotT < 0.9) return;
    this.pilotT = 0.4;
    if (this.screen instanceof DraftScreen) {
      // the first press takes a card; if that card needs a stake to replace, later presses pick stake I
      const pick = steadyPolicy.draft(this.draftOffers, this.run, this.world);
      this.input.inject(`Digit${pick + 1}`);
      this.draftOffers = [];
    }
  }

  // ---------------------------------------------------------------- events

  private onEvent(ev: SimEvent): void {
    switch (ev.type) {
      case 'interact':
        // one thing at a time: a second press on the same tick, or one that lands as the sheet turns, is dropped
        if (this.mode !== 'play') break;
        if (ev.kind === 'reward') this.openDraft();
        else if (ev.kind === 'door') {
          leaveRoom(this.run, this.world);
          chooseDoor(this.run, ev.index);
          this.turnSheet();
        }
        break;
      case 'roomClear':
        this.hud.banner('Sheet surveyed', CHALK);
        break;
      case 'waveStart':
        if (ev.wave > 1) this.hud.banner(`Wave ${ev.wave}`, PAPER, 1.2);
        break;
      case 'playerDeath':
        this.hud.banner('The line is lost', DANGER, DEATH_BEAT);
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- the frame

  private onResize(): void {
    this.viewW = this.app.screen.width;
    this.viewH = this.app.screen.height;
    this.stage.resize(this.viewW, this.viewH);
    this.camera.setViewport(this.viewW, this.viewH);
    this.camera.frameRoom(this.world.room, false);
    this.ambient.resize(this.viewW, this.viewH);
    this.hud.layout(this.viewW, this.viewH);
    this.wipe.layout(this.viewW, this.viewH);
    this.screen?.layout(this.viewW, this.viewH);
    this.debugText?.position.set(14, this.viewH - 190);
  }

  private beforeRender(): void {
    this.renderStart = performance.now();
  }

  private afterRender(): void {
    this.renderTimes.push(performance.now() - this.renderStart);
    if (this.renderTimes.length > 240) this.renderTimes.shift();
  }

  private step(): void {
    const w = this.world;
    if (this.opts.stress > 0) {
      // Stress scene: a constant crowd, an unkillable player.
      w.player.hp = w.player.maxHp;
      while (w.enemies.length < this.opts.stress) {
        const at = randomFloorPoint(w.room, w.rng, 0.5, w.player, 3);
        spawnEnemy(w, SMUDGE, at.x, at.y);
      }
    }
    let f = this.input.frame(this.camera);
    if (this.bot) {
      f = this.bot.think(w);
      steer(this.run, w, f, this.memo, steadyPolicy);
    }
    stepWorld(w, f);
  }

  private frame(ticker: Ticker): void {
    if (this.app.screen.width !== this.viewW || this.app.screen.height !== this.viewH) this.onResize();

    const start = performance.now();
    if (this.lastFrameAt > 0) {
      this.frameTimes.push(start - this.lastFrameAt);
      if (this.frameTimes.length > 240) this.frameTimes.shift();
    }
    this.lastFrameAt = start;

    const dtMs = Math.min(ticker.elapsedMS, 100);
    const dt = dtMs / 1000;
    this.time += dt;

    if (this.opts.debug && this.mode !== 'modal' && this.input.take('restart')) this.restartRun();

    if (this.mode === 'play' || this.mode === 'over') {
      this.loop.advance(dtMs, () => this.step());
    } else if (this.mode === 'modal') {
      this.uiTweens.update(dt);
      if (this.bot && this.screen) this.pilotScreen(dt);
      this.screen?.update(dt, this.input);
      // a key the screen had no use for does not wait around for the next one
      this.input.clearPresses();
    }
    this.wipe.update(dt);
    // the player may move as soon as the new sheet starts to show
    if (this.mode === 'wipe' && this.swapped && !this.wipe.hidden) {
      this.mode = 'play';
      this.input.clearPresses();
    }

    let w = this.world;
    for (const ev of w.events) {
      this.playerView.handle(ev);
      this.enemyViews.handle(ev);
      this.projectileViews.handle(ev);
      this.linesView.handle(ev, w);
      this.fx.handle(ev);
      if (ev.type === 'stakePlant') this.playerView.playGesture('plant', 0.2);
      else if (ev.type === 'whip' && ev.cause !== 'shove') this.playerView.playGesture('whip', 0.3);
      this.onEvent(ev);
    }
    w.events.length = 0;

    // The fall: the world plays on for a beat, then the run begins again.
    if (w.player.state === 'dead' && this.mode !== 'wipe') {
      if (this.mode === 'play') {
        this.mode = 'over';
        this.run.over = 'dead';
        this.deadFor = 0;
      }
      this.deadFor += dt;
      if (this.deadFor > DEATH_BEAT) this.restartRun();
    }

    w = this.world;
    const p = w.player;
    const alpha = w.hitstop > 0 || this.mode === 'modal' || this.mode === 'wipe' ? 1 : this.loop.alpha;
    this.playerView.update(w, alpha, dt, this.time);
    // The preview is the simulation's own answer to "what would E hit right now?"
    this.linesView.update(w, alpha, dt, p.state === 'dead' ? null : previewSweep(w));
    this.enemyViews.update(w, alpha, dt, this.time, this.linesView.previewTargets);
    this.projectileViews.handX = this.playerView.handX;
    this.projectileViews.handY = this.playerView.handY;
    this.projectileViews.update(w, alpha, dt);
    this.telegraphViews.update(w);
    this.particles.update(dt);
    this.numbers.update(dt);
    this.fx.update(dt);
    const aimX = p.x + Math.cos(p.aim) * 3;
    const aimY = p.y + Math.sin(p.aim) * 3;
    this.camera.update(dt, this.playerView.x, this.playerView.y, aimX, aimY);
    this.stage.applyCamera(this.camera);
    this.flowView.update(w, this.camera, alpha, dt, this.time);
    this.ambient.update(dt);
    this.hud.update(w, dt, this.time);
    this.stage.depth.sort();

    this.workTimes.push(performance.now() - start);
    if (this.workTimes.length > 240) this.workTimes.shift();

    if (this.debugText) {
      const s = this.debugState();
      const f = s.frameMs as { median: number; p95: number };
      const wk = s.workMs as { median: number; p95: number };
      this.debugText.text =
        `${(1000 / Math.max(1, f.median)).toFixed(0)} fps  frame ${f.median} ms (p95 ${f.p95})  work ${wk.median} ms (p95 ${wk.p95})\n` +
        `${this.mode}  sheet ${this.run.sheet} ${this.run.slot.kind}${this.run.slot.elite ? ' elite' : ''}  ${w.flow.phase} wave ${w.flow.wave}/${w.flow.waves}  enemies ${w.enemies.length}  kills ${w.stats.kills}`;
    }
  }
}
