// Ties the simulation, the renderer and input together and runs the frame.
import { BitmapFont, BitmapText, UPDATE_PRIORITY } from 'pixi.js';
import type { Application, Ticker } from 'pixi.js';
import { CONTENT } from '../content';
import { SMUDGE } from '../content/enemies';
import { roomTemplate } from '../content/rooms';
import { Ambient } from '../render/ambient';
import { Camera } from '../render/camera';
import { DamageNumbers } from '../render/damageNumbers';
import { EnemyViews } from '../render/enemyView';
import { Fx } from '../render/fx';
import { LinesView } from '../render/linesView';
import { ZONES, css } from '../render/palette';
import type { ZoneTheme } from '../render/palette';
import { Particles } from '../render/particles';
import { PlayerView } from '../render/playerView';
import { ProjectileViews } from '../render/projectileView';
import { RoomView } from '../render/roomView';
import { Stage } from '../render/stage';
import { TelegraphViews } from '../render/telegraphView';
import { Textures } from '../render/textures';
import { spawnEnemy } from '../sim/ai';
import { lineBot, rodBot } from '../sim/bots';
import type { Bot } from '../sim/bots';
import { previewSweep } from '../sim/lines';
import { buildRoom, randomFloorPoint } from '../sim/room';
import { createYard, stepYard } from '../sim/sandbox';
import type { Yard } from '../sim/sandbox';
import { DT, SIM_HZ } from '../sim/tuning';
import type { World } from '../sim/types';
import { createWorld, stepWorld } from '../sim/world';
import { Hud } from '../ui/hud';
import { Input } from './input';
import { FixedLoop } from './loop';

export interface GameOptions {
  debug: boolean;
  seed: string;
  /** Let a bot play (debug and automated checks): 'rod', 'line', 'camp', 'mash', or '' for a human. */
  autopilot: string;
  /** Stress scene: keep this many enemies alive and make the player unkillable. 0 = off. */
  stress: number;
}

export class Game {
  readonly stage = new Stage();
  readonly camera = new Camera();
  readonly input: Input;
  readonly textures: Textures;
  world: World;

  private theme: ZoneTheme;
  private roomView: RoomView;
  private playerView: PlayerView;
  private readonly enemyViews: EnemyViews;
  private readonly telegraphViews: TelegraphViews;
  private readonly projectileViews: ProjectileViews;
  private readonly linesView: LinesView;
  private readonly particles: Particles;
  private readonly numbers: DamageNumbers;
  private readonly fx: Fx;
  private readonly hud: Hud;
  private ambient: Ambient;
  private yard: Yard;
  private bot: Bot | null;
  private readonly loop = new FixedLoop(1000 / SIM_HZ);
  private time = 0;
  private viewW = 0;
  private viewH = 0;
  private seedCounter = 0;
  private deadFor = 0;
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

    const room = buildRoom(roomTemplate('bluefen-reedbed'));
    this.theme = ZONES[room.zone];
    app.renderer.background.color = this.theme.voidColor;
    this.world = createWorld(room, opts.seed, CONTENT);
    this.yard = createYard();
    this.bot = Game.makeBot(opts.autopilot);

    this.roomView = new RoomView(room, this.theme, this.stage, app.renderer);
    this.particles = new Particles(this.stage, this.textures);
    this.numbers = new DamageNumbers(this.stage);
    this.telegraphViews = new TelegraphViews(this.stage);
    this.linesView = new LinesView(this.stage, this.textures, app.renderer);
    this.enemyViews = new EnemyViews(this.stage, this.theme);
    this.projectileViews = new ProjectileViews(this.stage, this.textures);
    this.playerView = new PlayerView(this.stage);
    this.playerView.snap(this.world);
    this.fx = new Fx(this.stage, this.particles, this.camera, this.numbers, this.theme);
    this.ambient = new Ambient(this.stage, this.textures, room, this.theme);
    this.hud = new Hud();
    this.stage.ui.addChild(this.hud.root);

    if (opts.debug) {
      BitmapFont.install({
        name: 'debug',
        style: { fontFamily: 'Consolas, Menlo, monospace', fontSize: 16, fill: css(this.theme.highlight) },
        chars: [[' ', '~']],
      });
      this.debugText = new BitmapText({ text: '', style: { fontFamily: 'debug', fontSize: 16 } });
      this.debugText.position.set(12, 10);
      this.stage.ui.addChild(this.debugText);
    }

    this.onResize();
    this.camera.frameRoom(room, true);
    app.ticker.add(this.frame, this);
    // Bracket Pixi's own render call (which runs at LOW priority) to time it.
    app.ticker.add(this.beforeRender, this, UPDATE_PRIORITY.LOW + 1);
    app.ticker.add(this.afterRender, this, UPDATE_PRIORITY.UTILITY);
  }

  destroy(): void {
    this.app.ticker.remove(this.frame, this);
    this.app.ticker.remove(this.beforeRender, this);
    this.app.ticker.remove(this.afterRender, this);
    this.input.destroy();
    this.playerView.destroy();
    this.enemyViews.clear();
    this.projectileViews.clear();
    this.telegraphViews.clear();
    this.linesView.destroy();
    this.roomView.destroy();
    this.ambient.destroy();
    this.particles.destroy();
    this.numbers.destroy();
    this.hud.destroy();
    this.textures.destroy();
    this.stage.root.destroy({ children: true });
  }

  /** Start the yard again with a fresh world. No page reload. */
  restart(): void {
    this.seedCounter++;
    this.world = createWorld(this.world.room, `${this.opts.seed}:${this.seedCounter}`, CONTENT);
    this.yard = createYard();
    this.deadFor = 0;
    this.enemyViews.clear();
    this.projectileViews.clear();
    this.telegraphViews.clear();
    this.linesView.clear();
    this.particles.clear();
    this.numbers.clear();
    this.fx.clear();
    this.playerView.snap(this.world);
    this.loop.reset();
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
    const p = this.world.player;
    const q = (arr: number[], f: number): number => {
      if (!arr.length) return 0;
      const s = arr.slice().sort((a, b) => a - b);
      return +s[Math.min(s.length - 1, Math.floor(s.length * f))].toFixed(2);
    };
    return {
      tick: this.world.tick,
      player: { x: +p.x.toFixed(3), y: +p.y.toFixed(3), state: p.state, dashCharges: p.dashCharges, hp: p.hp, combo: p.combo },
      enemies: this.world.enemies.map((e) => ({ id: e.id, kind: e.def.id, state: e.state, hp: e.hp, x: +e.x.toFixed(2), y: +e.y.toFixed(2) })),
      telegraphs: this.world.telegraphs.length,
      projectiles: this.world.projectiles.length,
      wave: this.yard.wave,
      stats: this.world.stats,
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

  private onResize(): void {
    this.viewW = this.app.screen.width;
    this.viewH = this.app.screen.height;
    this.stage.resize(this.viewW, this.viewH);
    this.camera.setViewport(this.viewW, this.viewH);
    this.camera.frameRoom(this.world.room, false);
    this.ambient.resize(this.viewW, this.viewH);
    this.hud.layout(this.viewW, this.viewH);
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
    } else if (w.hitstop <= 0) stepYard(w, this.yard, SMUDGE, DT);
    const human = this.input.frame(this.camera);
    stepWorld(w, this.bot ? this.bot.think(w) : human);
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

    if (this.input.take('restart')) this.restart();

    this.loop.advance(dtMs, () => this.step());

    const w = this.world;
    for (const ev of w.events) {
      this.playerView.handle(ev);
      this.enemyViews.handle(ev);
      this.projectileViews.handle(ev);
      this.linesView.handle(ev, w);
      this.fx.handle(ev);
      if (ev.type === 'stakePlant') this.playerView.playGesture('plant', 0.2);
      else if (ev.type === 'whip' && ev.cause !== 'shove') this.playerView.playGesture('whip', 0.3);
    }
    w.events.length = 0;

    // In the yard, death simply starts over after a beat.
    if (w.player.state === 'dead') {
      this.deadFor += dt;
      if (this.deadFor > 2.2) this.restart();
    }

    const p = w.player;
    const alpha = w.hitstop > 0 ? 1 : this.loop.alpha;
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
    this.ambient.update(dt);
    this.hud.update(w, dt);
    this.stage.depth.sort();

    this.workTimes.push(performance.now() - start);
    if (this.workTimes.length > 240) this.workTimes.shift();

    if (this.debugText) {
      const s = this.debugState();
      const f = s.frameMs as { median: number; p95: number };
      const wk = s.workMs as { median: number; p95: number };
      this.debugText.text =
        `${(1000 / Math.max(1, f.median)).toFixed(0)} fps  frame ${f.median} ms (p95 ${f.p95})  work ${wk.median} ms (p95 ${wk.p95})\n` +
        `${p.state}  hp ${p.hp}  dash ${p.dashCharges}  wave ${this.yard.wave}  enemies ${w.enemies.length}  kills ${w.stats.kills}`;
    }
  }
}
