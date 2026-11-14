// The game shell. It owns a session and a transport and does three things each frame: sends
// this laptop's input to the relay, steps the session once for every bundle the relay hands
// back, and draws the world its own player is in. It never changes the game any other way:
// pausing and starting over are commands that travel with the inputs.
import { BitmapFont, BitmapText, UPDATE_PRIORITY } from 'pixi.js';
import type { Application, Ticker } from 'pixi.js';
import { CONTENT } from '../content';
import { Loopback } from '../net/transport';
import type { Transport } from '../net/transport';
import { Ambient } from '../render/ambient';
import { Camera } from '../render/camera';
import { DamageNumbers } from '../render/damageNumbers';
import { EnemyViews } from '../render/enemyView';
import { Fx } from '../render/fx';
import { CHIME, DANGER, PAPER, ZONES, css } from '../render/palette';
import type { ZoneTheme } from '../render/palette';
import { Particles } from '../render/particles';
import { PickupView } from '../render/pickupView';
import { PlayerViews } from '../render/playerView';
import { ProjectileViews } from '../render/projectileView';
import { RoomView } from '../render/roomView';
import { Stage } from '../render/stage';
import { TelegraphViews } from '../render/telegraphView';
import { Textures } from '../render/textures';
import { swordBot } from '../sim/bots';
import type { Bot } from '../sim/bots';
import { MAX_PLAYERS, createSession, stepSession, worldOf } from '../sim/session';
import type { Session } from '../sim/session';
import { hashSession } from '../sim/snapshot';
import type { SimEvent, World } from '../sim/types';
import { Hud } from '../ui/hud';
import { Label } from '../ui/label';
import { Input } from './input';

export interface GameOptions {
  debug: boolean;
  seed: string;
  /** Let a bot play this laptop's seat (debug and automated checks): 'sword', 'novice', or '' for a human. */
  autopilot: string;
  /** Extra seats played by bots, 0 to 2, so several players can be seen in one world without a network. */
  bots: number;
  /** Stress scene: keep this many enemies alive and nobody can be hurt. 0 = off. */
  stress: number;
}

function makeBot(name: string): Bot | null {
  if (name === 'sword') return swordBot();
  if (name === 'novice') return swordBot({ reaction: 0.35, dashes: false });
  return null;
}

export class Game {
  readonly stage = new Stage();
  readonly camera = new Camera();
  readonly input: Input;
  readonly textures: Textures;
  readonly session: Session;
  /** The seat this laptop plays. */
  readonly localSlot = 0;

  private readonly net: Transport;
  /** One entry per seat: a bot, or null for a seat played by a person. */
  private readonly bots: Array<Bot | null>;
  /** The world being drawn: the one this laptop's player is in. */
  private viewed: World;
  private theme: ZoneTheme;
  private roomView: RoomView;
  private readonly playerViews: PlayerViews;
  private readonly enemyViews: EnemyViews;
  private readonly telegraphViews: TelegraphViews;
  private readonly projectileViews: ProjectileViews;
  private readonly pickupView: PickupView;
  private readonly particles: Particles;
  private readonly numbers: DamageNumbers;
  private readonly fx: Fx;
  private readonly hud: Hud;
  private readonly ambient: Ambient;
  private readonly pausedLabel: Label;
  private time = 0;
  private viewW = 0;
  private viewH = 0;
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

    const seats = 1 + Math.max(0, Math.min(MAX_PLAYERS - 1, opts.bots));
    this.bots = Array.from({ length: seats }, (_, slot) => (slot === this.localSlot ? makeBot(opts.autopilot) : swordBot()));
    this.session = createSession(
      {
        seed: opts.seed,
        players: this.bots.map((_, slot) => ({ name: `Player ${slot + 1}`, classId: 'sword' })),
        buildId: 'dev',
        inputDelay: 0,
        stress: opts.stress,
      },
      CONTENT,
    );
    this.net = new Loopback(seats);

    this.viewed = worldOf(this.session, this.localSlot);
    const room = this.viewed.room;
    this.theme = ZONES[room.zone];
    app.renderer.background.color = this.theme.voidColor;

    this.roomView = new RoomView(room, this.theme, this.stage, app.renderer);
    this.particles = new Particles(this.stage, this.textures);
    this.numbers = new DamageNumbers(this.stage);
    this.telegraphViews = new TelegraphViews(this.stage);
    this.enemyViews = new EnemyViews(this.stage, this.theme);
    this.projectileViews = new ProjectileViews(this.stage, this.textures);
    this.pickupView = new PickupView(this.stage, this.textures);
    this.playerViews = new PlayerViews(this.stage);
    this.fx = new Fx(this.stage, this.particles, this.camera, this.numbers, this.theme);
    this.ambient = new Ambient(this.stage, this.textures, room, this.theme);
    this.hud = new Hud();
    this.pausedLabel = new Label('Paused', { size: 22, color: PAPER, bold: true, tracking: 0.3, align: 'center' });
    this.pausedLabel.visible = false;
    this.stage.ui.addChild(this.hud.root, this.pausedLabel);

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
    this.playerViews.clear();
    this.enemyViews.clear();
    this.projectileViews.clear();
    this.telegraphViews.clear();
    this.pickupView.destroy();
    this.roomView.destroy();
    this.ambient.destroy();
    this.particles.destroy();
    this.numbers.destroy();
    this.hud.destroy();
    this.textures.destroy();
    this.stage.root.destroy({ children: true });
  }

  /** A plain snapshot for automated checks. */
  debugState(): Record<string, unknown> {
    const s = this.session;
    const w = this.viewed;
    const q = (arr: number[], f: number): number => {
      if (!arr.length) return 0;
      const sorted = arr.slice().sort((a, b) => a - b);
      return +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))].toFixed(2);
    };
    return {
      tick: s.tick,
      hash: hashSession(s),
      paused: s.pausedBy,
      attempt: s.attempt,
      chamber: w.chamber,
      room: { id: w.room.id, phase: w.flow.phase, wave: w.flow.wave, waves: w.flow.waves, pickups: w.flow.pickups.length },
      players: w.players.map((p) => ({ slot: p.slot, x: +p.x.toFixed(3), y: +p.y.toFixed(3), state: p.state, hp: p.hp, dash: p.dashCharges, chimes: p.chimes, combo: p.combo })),
      enemies: w.enemies.map((e) => ({ id: e.id, kind: e.defId, state: e.state, hp: e.hp, x: +e.x.toFixed(2), y: +e.y.toFixed(2), target: e.target })),
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

  // ---------------------------------------------------------------- the frame

  private onResize(): void {
    this.viewW = this.app.screen.width;
    this.viewH = this.app.screen.height;
    this.stage.resize(this.viewW, this.viewH);
    this.camera.setViewport(this.viewW, this.viewH);
    this.camera.frameRoom(this.viewed.room, false);
    this.ambient.resize(this.viewW, this.viewH);
    this.hud.layout(this.viewW, this.viewH);
    this.pausedLabel.position.set(this.viewW / 2, this.viewH * 0.4);
    this.debugText?.position.set(14, this.viewH - 190);
  }

  private beforeRender(): void {
    this.renderStart = performance.now();
  }

  private afterRender(): void {
    this.renderTimes.push(performance.now() - this.renderStart);
    if (this.renderTimes.length > 240) this.renderTimes.shift();
  }

  /** The player's world has been replaced (a new chamber, or the party started over): rebuild what is drawn. */
  private watch(w: World): void {
    this.viewed = w;
    const room = w.room;
    this.theme = ZONES[room.zone];
    this.app.renderer.background.color = this.theme.voidColor;
    this.roomView.destroy();
    this.roomView = new RoomView(room, this.theme, this.stage, this.app.renderer);
    this.playerViews.clear();
    this.enemyViews.clear();
    this.projectileViews.clear();
    this.telegraphViews.clear();
    this.pickupView.clear();
    this.particles.clear();
    this.numbers.clear();
    this.fx.clear();
    this.enemyViews.setTheme(this.theme);
    this.fx.setTheme(this.theme);
    this.ambient.setRoom(room, this.theme);
    this.camera.frameRoom(room, true);
  }

  private onEvent(ev: SimEvent, w: World): void {
    this.playerViews.handle(ev);
    this.enemyViews.handle(ev);
    this.fx.handle(ev);
    switch (ev.type) {
      case 'roomClear':
        this.hud.banner('Chamber cleared', CHIME);
        break;
      case 'waveStart':
        if (ev.wave > 1) this.hud.banner(`Wave ${ev.wave}`, PAPER, 1.2);
        break;
      case 'playerDown':
        if (w.players.every((p) => p.state === 'down')) this.hud.banner('Everyone is down', DANGER, 2.2);
        else if (ev.player === this.localSlot) this.hud.banner('You are down', DANGER, 2.2);
        break;
      default:
        break;
    }
  }

  private frame(ticker: Ticker): void {
    if (this.app.screen.width !== this.viewW || this.app.screen.height !== this.viewH) this.onResize();

    const now = performance.now();
    if (this.lastFrameAt > 0) {
      this.frameTimes.push(now - this.lastFrameAt);
      if (this.frameTimes.length > 240) this.frameTimes.shift();
    }
    this.lastFrameAt = now;
    const dt = Math.min(ticker.elapsedMS, 100) / 1000;
    this.time += dt;
    const s = this.session;

    // 1. This laptop's input goes to the relay, and so does every bot seat's.
    for (let slot = 0; slot < this.bots.length; slot++) {
      const bot = this.bots[slot];
      if (bot) {
        this.net.input(slot, bot.think(worldOf(s, slot), slot), now);
      } else {
        const mine = this.playerViews.get(slot);
        const p = worldOf(s, slot).players.find((q) => q.slot === slot);
        this.net.input(slot, this.input.frame(this.camera, mine ? mine.x : p ? p.x : 0, mine ? mine.y : p ? p.y : 0), now);
      }
    }
    if (this.input.take('pause')) this.net.command(this.localSlot, 'pause');
    if (this.opts.debug && this.input.take('restart')) this.net.command(this.localSlot, 'restart');
    // presses nothing asked for do not wait around
    this.input.clearPresses();

    // 2. Step once for every bundle the relay has closed.
    for (const bundle of this.net.poll(now)) {
      stepSession(s, bundle, CONTENT);
      const mine = worldOf(s, this.localSlot);
      if (mine !== this.viewed) this.watch(mine);
      for (const w of s.worlds) {
        if (w === this.viewed) for (const ev of w.events) this.onEvent(ev, w);
        w.events.length = 0;
      }
    }

    // 3. Draw the world this laptop's player is in, between the last two ticks.
    const w = this.viewed;
    const paused = s.pausedBy >= 0;
    const alpha = paused || w.freeze > 0 ? 1 : this.net.alpha(now);
    this.playerViews.update(w.players, alpha, dt, this.time);
    this.enemyViews.update(w, alpha, dt, this.time);
    this.projectileViews.update(w, alpha);
    this.telegraphViews.update(w);
    this.pickupView.update(w, alpha, this.time);
    this.particles.update(dt);
    this.numbers.update(dt);
    this.fx.update(dt);

    const me = w.players.find((p) => p.slot === this.localSlot);
    const mineView = this.playerViews.get(this.localSlot);
    const fx = mineView ? mineView.x : w.room.cx;
    const fy = mineView ? mineView.y : w.room.cy;
    this.fx.setFocus(fx, fy, this.localSlot);
    const aimX = me ? fx + Math.cos(me.aim) * 3 : fx;
    const aimY = me ? fy + Math.sin(me.aim) * 3 : fy;
    this.camera.update(dt, fx, fy, aimX, aimY);
    this.stage.applyCamera(this.camera);
    this.ambient.update(dt);
    this.hud.update(w, me, dt);
    this.pausedLabel.visible = paused;
    this.stage.depth.sort();

    this.workTimes.push(performance.now() - now);
    if (this.workTimes.length > 240) this.workTimes.shift();

    if (this.debugText) {
      const d = this.debugState();
      const f = d.frameMs as { median: number; p95: number };
      const wk = d.workMs as { median: number; p95: number };
      this.debugText.text =
        `${(1000 / Math.max(1, f.median)).toFixed(0)} fps  frame ${f.median} ms (p95 ${f.p95})  work ${wk.median} ms (p95 ${wk.p95})\n` +
        `tick ${s.tick}  chamber ${w.chamber}  ${w.flow.phase} wave ${w.flow.wave}/${w.flow.waves}  players ${w.players.length}  enemies ${w.enemies.length}  kills ${w.stats.kills}`;
    }
  }
}
