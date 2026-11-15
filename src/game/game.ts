// The game shell. It is given a driver (the page's own relay alone, or the connection to a host
// in co-op) and does three things each frame: sends this laptop's input, lets the driver step
// every tick that is due, and draws the world its own player is in. It never changes the game
// any other way: pausing and starting over are commands that travel with the inputs.
import { BitmapFont, BitmapText, UPDATE_PRIORITY } from 'pixi.js';
import type { Application, Ticker } from 'pixi.js';
import { GameAudio } from '../audio';
import { AimPreview } from '../render/aimPreview';
import { Ambient } from '../render/ambient';
import { Backdrop } from '../render/backdrop';
import { Camera } from '../render/camera';
import { DamageNumbers } from '../render/damageNumbers';
import { EnemyViews } from '../render/enemyView';
import { createExtras } from '../render/extras';
import type { Extra } from '../render/extras';
import { Fx } from '../render/fx';
import { ObjectViews } from '../render/objectView';
import { CHIME, DANGER, PAPER, PLAYER_COLORS, PLAYER_PALE, RIM, ZONES, css } from '../render/palette';
import { TONES } from '../render/palette/tones';
import type { ZoneTheme } from '../render/palette';
import { Particles } from '../render/particles';
import { PickupView } from '../render/pickupView';
import { PlayerViews } from '../render/playerView';
import { FLY_Z, ProjectileViews } from '../render/projectileView';
import { RoomView } from '../render/roomView';
import { Stage } from '../render/stage';
import { TelegraphViews } from '../render/telegraphView';
import { Textures } from '../render/textures';
import { Trails } from '../render/trails';
import { EXPERT, NOVICE, botCamp, botPick, classBot } from '../sim/bots';
import type { Bot } from '../sim/bots';
import { DRAFT_TICKS } from '../sim/draft';
import { activeHarmonies } from '../sim/mods';
import { aimAngleOf } from '../sim/input';
import { runSoFar, stopOf, worldOf } from '../sim/session';
import type { Session } from '../sim/session';
import { hashSession } from '../sim/snapshot';
import type { ClassId, SimEvent, World } from '../sim/types';
import { BossBar } from '../ui/bossBar';
import { DraftScreen } from '../ui/draftScreen';
import { Hud } from '../ui/hud';
import { Label } from '../ui/label';
import { TuningRow } from '../ui/tuningRow';
import { CampFlow } from './campFlow';
import { cardInfo } from './cardInfo';
import type { Driver } from './driver';
import { Input } from './input';
import { WagerFlow } from './wagerFlow';

export interface GameOptions {
  debug: boolean;
  seed: string;
  /** Let a bot play this laptop's seat (debug and automated checks): 'expert', 'novice', or '' for a human. */
  autopilot: string;
  /** The class of each seat, 1 to 3 of them. The first is this laptop's; the rest are played by bots. */
  classes: ClassId[];
  /** Stress scene: keep this many enemies alive and nobody can be hurt. 0 = off. */
  stress: number;
  /** Draw the shader backdrop. Off (?nobackdrop) to measure what it costs. */
  backdrop: boolean;
}

/** In the practice court the number keys change class: the page starts again with the new one. */
const CLASS_KEYS: ReadonlyArray<readonly [string, ClassId]> = [
  ['Digit1', 'sword'],
  ['Digit2', 'bow'],
  ['Digit3', 'fist'],
];

const CARD_KEYS = ['Digit1', 'Digit2', 'Digit3'];

function makeBot(name: string, classId: ClassId): Bot | null {
  if (name === 'expert') return classBot(classId, EXPERT);
  if (name === 'novice') return classBot(classId, NOVICE);
  return null;
}

export class Game {
  readonly stage = new Stage();
  readonly camera = new Camera();
  readonly input: Input;
  readonly textures: Textures;
  /** A bot playing this laptop's own seat (automated checks), or null for a person. */
  private readonly autopilot: Bot | null;
  /** The world being drawn: the one this laptop's player is in. */
  private viewed: World;
  private theme: ZoneTheme;
  private roomView: RoomView;
  private readonly playerViews: PlayerViews;
  private readonly enemyViews: EnemyViews;
  private readonly telegraphViews: TelegraphViews;
  private readonly projectileViews: ProjectileViews;
  private readonly objectViews: ObjectViews;
  private readonly trails: Trails;
  private readonly aimPreview: AimPreview;
  /** The aim this laptop last sent, as an angle: the preview is drawn from exactly this. */
  private aimSent = 0;
  /** Where the Echoes are (x, y pairs), for a controller's aim to lean toward. */
  private readonly targets: number[] = [];
  /** Where this laptop's player was last drawn: sounds are heard from here. */
  private focusX = 0;
  private focusY = 0;
  private readonly pickupView: PickupView;
  private readonly particles: Particles;
  private readonly numbers: DamageNumbers;
  private readonly fx: Fx;
  private readonly hud: Hud;
  private readonly ambient: Ambient;
  private readonly backdrop: Backdrop;
  /** Presentation that lives in one file each (src/render/extras). */
  private readonly extras: Extra[];
  private readonly audio = new GameAudio();
  private readonly pausedLabel: Label;
  /** How the run ended, what it added up to, and how to go again. */
  private readonly endHead: Label;
  private readonly endNote: Label;
  private readonly endHint: Label;
  private endShown = '';
  /** The cards this laptop's player is choosing from; the offer on screen, and the one already answered. */
  private readonly bossBar = new BossBar();
  /** What this laptop's player has built, as emblems along the bottom of the screen. */
  private readonly held = new TuningRow();
  private readonly draft = new DraftScreen();
  /** The camp: its list, and the hint that says how to bring the list back. */
  private readonly camp = new CampFlow();
  private readonly campHint: Label;
  private readonly wager = new WagerFlow();
  private draftKey = '';
  private pickSent = '';
  private lastMouseX = -1;
  private lastMouseY = -1;
  private time = 0;
  private viewW = 0;
  private viewH = 0;
  private debugText: BitmapText | null = null;
  private readonly frameTimes: number[] = [];
  private readonly workTimes: number[] = [];
  private readonly renderTimes: number[] = [];
  private renderStart = 0;
  private lastFrameAt = 0;

  /** The session being played. In co-op the driver replaces it when the host sends the whole game again. */
  get session(): Session {
    const s = this.driver.session;
    if (!s) throw new Error('The game shell was started without a game');
    return s;
  }

  /** The seat this laptop plays. */
  get localSlot(): number {
    return this.driver.localSlot;
  }

  constructor(
    private readonly app: Application,
    private readonly driver: Driver,
    private readonly opts: GameOptions,
  ) {
    app.stage.addChild(this.stage.root);
    this.textures = new Textures(app.renderer);
    this.input = new Input(app.canvas);
    const mine = this.session.config.players[this.localSlot];
    this.autopilot = makeBot(opts.autopilot, mine ? mine.classId : 'sword');

    this.viewed = worldOf(this.session, this.localSlot);
    const room = this.viewed.room;
    this.theme = ZONES[room.zone];
    app.renderer.background.color = this.theme.voidColor;

    this.backdrop = new Backdrop(app.renderer, this.stage);
    this.backdrop.setTheme(this.theme);
    this.roomView = new RoomView(room, this.theme, this.stage);
    this.particles = new Particles(this.stage, this.textures);
    this.numbers = new DamageNumbers(this.stage);
    this.telegraphViews = new TelegraphViews(this.stage);
    this.aimPreview = new AimPreview(this.stage);
    this.enemyViews = new EnemyViews(this.stage, this.theme);
    this.projectileViews = new ProjectileViews(this.stage, this.textures);
    this.objectViews = new ObjectViews(this.stage);
    this.trails = new Trails(this.stage);
    this.pickupView = new PickupView(this.stage, this.textures);
    this.playerViews = new PlayerViews(this.stage);
    this.fx = new Fx(this.stage, this.particles, this.camera, this.numbers, this.theme);
    this.ambient = new Ambient(this.stage, this.textures, room, this.theme);
    this.extras = createExtras({ stage: this.stage, camera: this.camera, textures: this.textures, localSlot: () => this.localSlot });
    for (const x of this.extras) x.room?.(room, this.theme);
    this.audio.setZone(room.zone);
    this.audio.setClasses(this.session.config.players.map((p) => p.classId));
    this.hud = new Hud();
    this.pausedLabel = new Label('Paused', { size: 22, color: PAPER, bold: true, tracking: 0.3, align: 'center' });
    this.pausedLabel.visible = false;
    this.endHead = new Label('', { size: 30, color: PAPER, bold: true, tracking: 0.25, align: 'center' });
    this.endNote = new Label('', { size: 11, color: PAPER, tracking: 0.2, align: 'center' });
    this.endHint = new Label('Enter or A: go again', { size: 11, color: CHIME, tracking: 0.2, align: 'center' });
    this.campHint = new Label('', { size: 10, color: CHIME, tracking: 0.24, align: 'center' });
    for (const l of [this.endHead, this.endNote, this.endHint, this.campHint]) l.visible = false;
    this.stage.ui.addChild(
      this.hud.root,
      this.held.root,
      this.bossBar.root,
      this.campHint,
      this.draft.root,
      this.camp.screen.root,
      this.wager.screen.root,
      this.pausedLabel,
      this.endHead,
      this.endNote,
      this.endHint,
    );

    if (opts.debug) {
      BitmapFont.install({
        name: 'debug',
        style: { fontFamily: 'Consolas, Menlo, monospace', fontSize: 14, fill: css(ZONES.outer.highlight) },
        chars: [[' ', '~']],
      });
      this.debugText = new BitmapText({ text: '', style: { fontFamily: 'debug', fontSize: 14 } });
      this.stage.ui.addChild(this.debugText);
    }

    this.onResize();
    this.camera.frameRoom(room, true);
    if (!this.autopilot && !driver.coop) this.hud.banner('1 Sword   2 Bow   3 Fist', PAPER, 4.5);
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
    this.objectViews.clear();
    this.trails.destroy();
    this.aimPreview.destroy();
    this.telegraphViews.clear();
    this.pickupView.destroy();
    this.roomView.destroy();
    this.ambient.destroy();
    for (const x of this.extras) x.destroy();
    this.backdrop.destroy();
    this.audio.destroy();
    this.particles.destroy();
    this.numbers.destroy();
    this.hud.destroy();
    this.draft.destroy();
    this.camp.destroy();
    this.wager.destroy();
    this.bossBar.destroy();
    this.held.destroy();
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
      phase: s.phase,
      stops: s.route.length,
      kind: w.flow.kind,
      run: runSoFar(s),
      chamber: w.chamber,
      room: { id: w.room.id, phase: w.flow.phase, wave: w.flow.wave, waves: w.flow.waves, pickups: w.flow.pickups.length },
      draft: s.drafts[this.localSlot]
        ? { offers: s.drafts[this.localSlot].offers, timer: s.drafts[this.localSlot].timer, made: s.drafts[this.localSlot].made, open: this.draft.open, choice: this.draft.choice }
        : null,
      wager: { ...s.wager, open: this.wager.screen.open },
      discord: w.flow.discord,
      camp: s.camps[this.localSlot] ? { ...s.camps[this.localSlot], open: this.camp.screen.open, choice: this.camp.screen.choice, wait: s.campFor } : null,
      players: w.players.map((p) => ({
        slot: p.slot,
        class: p.classId,
        tunings: p.tunings,
        maxHp: p.maxHp,
        x: +p.x.toFixed(3),
        y: +p.y.toFixed(3),
        state: p.state,
        hp: p.hp,
        dash: p.dashCharges,
        chimes: p.chimes,
        combo: p.combo,
        rally: p.rally,
        special: +p.specialCd.toFixed(2),
        charge: +p.charge.toFixed(2),
      })),
      enemies: w.enemies.map((e) => ({ id: e.id, kind: e.defId, state: e.state, hp: Math.round(e.hp), x: +e.x.toFixed(2), y: +e.y.toFixed(2), target: e.target })),
      telegraphs: w.telegraphs.length,
      projectiles: w.projectiles.length,
      bombs: w.bombs.length,
      stones: w.stones.length,
      trails: this.trails.count,
      stats: w.stats,
      frameMs: { median: q(this.frameTimes, 0.5), p95: q(this.frameTimes, 0.95), max: q(this.frameTimes, 1), samples: this.frameTimes.length },
      workMs: { median: q(this.workTimes, 0.5), p95: q(this.workTimes, 0.95), max: q(this.workTimes, 1) },
      renderMs: { median: q(this.renderTimes, 0.5), p95: q(this.renderTimes, 0.95), max: q(this.renderTimes, 1) },
      slowFrames: this.frameTimes.filter((t) => t > 20).length,
      sortables: this.stage.depth.count,
      views: this.enemyViews.count,
      view: [this.viewW, this.viewH],
      zoom: +this.camera.zoom.toFixed(3),
      following: this.camera.following,
      screen: (() => {
        const me = w.players.find((p) => p.slot === this.localSlot);
        return me ? this.worldToScreen(me.x, me.y).map((v) => Math.round(v)) : [0, 0];
      })(),
      device: this.input.device,
      slot: this.localSlot,
      net: this.driver.net(),
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
    this.backdrop.resize(this.viewW, this.viewH);
    for (const x of this.extras) x.resize?.(this.viewW, this.viewH);
    this.hud.layout(this.viewW, this.viewH);
    this.draft.layout(this.viewW, this.viewH);
    this.camp.screen.layout(this.viewW, this.viewH);
    this.wager.screen.layout(this.viewW, this.viewH);
    this.campHint.position.set(this.viewW / 2, this.viewH - 118);
    this.bossBar.layout(this.viewW);
    // to the right of the health panel, along the bottom
    this.held.root.position.set(372, this.viewH - 70);
    this.pausedLabel.position.set(this.viewW / 2, this.viewH * 0.4);
    this.endHead.position.set(this.viewW / 2, this.viewH * 0.3);
    this.endNote.position.set(this.viewW / 2, this.viewH * 0.3 + 78);
    this.endHint.position.set(this.viewW / 2, this.viewH * 0.3 + 122);
    this.debugText?.position.set(14, this.viewH - 190);
  }

  /** Start the practice court again as another class, keeping everything else in the address. */
  private changeClass(classId: ClassId): void {
    const params = new URLSearchParams(window.location.search);
    const team = this.session.config.players.map((p, slot) => (slot === this.localSlot ? classId : p.classId));
    params.delete('class');
    params.delete('team');
    params.set(team.length > 1 ? 'team' : 'class', team.join(','));
    window.location.search = params.toString();
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
    this.roomView = new RoomView(room, this.theme, this.stage);
    this.playerViews.clear();
    this.enemyViews.clear();
    this.projectileViews.clear();
    this.objectViews.clear();
    this.trails.clear();
    this.aimPreview.clear();
    this.telegraphViews.clear();
    this.pickupView.clear();
    this.particles.clear();
    this.numbers.clear();
    this.fx.clear();
    this.enemyViews.setTheme(this.theme);
    this.fx.setTheme(this.theme);
    this.ambient.setRoom(room, this.theme);
    for (const x of this.extras) x.room?.(room, this.theme);
    this.backdrop.setTheme(this.theme);
    this.backdrop.pulse(1);
    this.audio.setZone(room.zone);
    this.camera.frameRoom(room, true);
    // the name of the chamber the party has walked into
    const stop = stopOf(this.session);
    if (stop) {
      const hard = stop.kind === 'elite' || stop.kind === 'miniboss' || stop.kind === 'boss';
      // a chamber the party wagered on says so before anything else
      this.hud.banner(w.flow.discord ? 'Brittle: the Wager is on' : stop.kind === 'elite' ? `Elite: ${room.name}` : room.name, hard ? DANGER : PAPER, w.flow.discord ? 3 : 2.4);
    }
  }

  /**
   * Show this laptop's player their cards for as long as the session offers any, and send the
   * card they take. Returns true while the cards have the keys.
   */
  private stepDraft(w: World, dt: number): boolean {
    const s = this.session;
    const d = s.drafts[this.localSlot];
    const me = w.players.find((p) => p.slot === this.localSlot);
    if (!d || !me || s.phase !== 'run' || d.offers.length === 0) {
      if (this.draft.open) this.draft.hide();
      this.draftKey = '';
      return false;
    }
    const key = `${s.attempt}/${s.stop}/${d.made}/${d.rolled}/${d.offers.join(',')}`;
    if (this.autopilot) {
      // a bot in this seat takes its card without looking at the screen
      if (this.pickSent !== key) {
        this.pickSent = key;
        this.driver.command('pick', botPick(d.offers, me.tunings, w.content));
      }
      return false;
    }
    if (key !== this.draftKey) {
      this.draftKey = key;
      this.draft.show(
        d.offers.map((id) => cardInfo(id, me.tunings, w.content)),
        this.input.device === 'pad',
        d.rerolls,
      );
    }
    this.draft.update(dt, d.timer / DRAFT_TICKS);
    // taken already: the cards stay up until the session has heard
    if (this.pickSent === key) return true;

    const step = this.input.menuStep();
    if (this.input.take('left') || step < 0) this.draft.move(-1);
    if (this.input.take('right') || step > 0) this.draft.move(1);
    // the mouse points only when it moves, so it never fights the keys
    let over = -1;
    const moved = this.input.mouseX !== this.lastMouseX || this.input.mouseY !== this.lastMouseY;
    this.lastMouseX = this.input.mouseX;
    this.lastMouseY = this.input.mouseY;
    let take = -1;
    CARD_KEYS.forEach((code, i) => {
      if (this.input.takeCode(code) && i < d.offers.length) take = i;
    });
    if (this.input.take('confirm')) take = this.draft.choice;
    if (this.input.hasMouse && (moved || this.input.isDown('attack'))) over = this.draft.pointAt(this.input.mouseX, this.input.mouseY);
    if (this.input.take('attack') && over >= 0) take = over;
    if (d.rerolls > 0 && this.input.takeCode('KeyR')) this.driver.command('reroll');
    if (take >= 0) {
      this.pickSent = key;
      this.audio.ui('confirm');
      this.driver.command('pick', take);
    }
    return true;
  }

  private onEvent(ev: SimEvent, w: World): void {
    this.playerViews.handle(ev);
    this.enemyViews.handle(ev);
    this.roomView.handle(ev);
    this.fx.handle(ev);
    for (const x of this.extras) x.handle?.(ev, w);
    this.audio.handle(ev, this.localSlot, this.focusX, this.focusY);
    switch (ev.type) {
      // the exact point of a bounce goes into the trail of whatever bounced, and a ring crosses the backdrop
      case 'ricochet':
        this.trails.corner(ev.id, ev.x, ev.y, FLY_Z);
        this.backdrop.ripple(ev.x, ev.y, 0.3 + 0.12 * ev.n);
        break;
      case 'reflect':
        this.trails.corner(ev.id, ev.x, ev.y, FLY_Z);
        this.backdrop.ripple(ev.x, ev.y, ev.perfect ? 1 : 0.5);
        if (ev.perfect) this.backdrop.pulse(0.6);
        break;
      case 'wallSlam':
        this.trails.corner(ev.id, ev.x, ev.y, 0.45);
        if (ev.speed > 5) this.backdrop.ripple(ev.x, ev.y, ev.speed / 22);
        break;
      case 'carom':
        this.backdrop.ripple(ev.x, ev.y, ev.speed / 20);
        break;
      case 'bombBurst':
      case 'breakSlam':
        this.backdrop.ripple(ev.x, ev.y, 1);
        break;
      case 'roomClear':
        this.hud.banner('Chamber cleared', CHIME);
        this.backdrop.pulse(1);
        break;
      case 'waveStart':
        if (ev.wave > 1) this.hud.banner(`Wave ${ev.wave}`, PAPER, 1.2);
        break;
      case 'playerDown':
        if (w.players.every((p) => p.state === 'down')) this.hud.banner('Everyone is down', DANGER, 2.2);
        else if (ev.player === this.localSlot) this.hud.banner(w.players.length > 1 ? 'Down: crawl to a teammate' : 'You are down', DANGER, 2.6);
        break;
      case 'revive':
        if (ev.player === this.localSlot) this.hud.banner('Back on your feet', PAPER, 1.4);
        break;
      case 'duet':
        if (ev.a === this.localSlot || ev.b === this.localSlot) this.hud.banner('Duet', CHIME, 0.9);
        break;
      case 'tuning':
        if (ev.player === this.localSlot) {
          const def = w.content.tunings[ev.id];
          this.hud.banner(def ? def.name : 'Tuning', def ? TONES[def.tone].color : CHIME, 1.8);
        }
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
    const slot = this.localSlot;

    // 1. This laptop's input goes to the relay: a person's hands, or a bot's.
    const here = worldOf(this.session, slot);
    const choosing = this.stepDraft(here, dt);
    const camping = this.camp.step(
      this.session,
      slot,
      here.players.find((q) => q.slot === slot),
      here.content,
      this.driver,
      this.input,
      this.autopilot ? (seat, p) => botCamp(seat, p, here.content) : null,
      dt,
    );
    this.campHint.visible = this.camp.away;
    if (this.camp.away) this.campHint.text = this.input.device === 'pad' ? 'X   The camp' : 'F   The camp';
    const wagering = this.wager.step(
      this.session,
      slot,
      here.players.find((q) => q.slot === slot),
      this.driver,
      this.input,
      !!this.autopilot,
      dt,
    );
    if (this.wager.result) {
      this.hud.banner(this.wager.result === 'on' ? 'The Wager is taken' : 'The party walks on', this.wager.result === 'on' ? DANGER : PAPER, 2);
      this.wager.result = '';
    }
    if (this.autopilot) {
      this.driver.input(this.autopilot.think(here, slot), now);
    } else if (choosing || camping || wagering) {
      // the cards have the keys: the character stands still, and nothing is pressed for them
      this.driver.input(this.input.quiet(), now);
    } else {
      const view = this.playerViews.get(slot);
      const p = here.players.find((q) => q.slot === slot);
      this.targets.length = 0;
      for (const e of here.enemies) if (!e.dead && e.state !== 'spawn' && e.state !== 'pit') this.targets.push(e.x, e.y);
      const frame = this.input.frame(this.camera, view ? view.x : p ? p.x : 0, view ? view.y : p ? p.y : 0, this.targets);
      this.aimSent = aimAngleOf(frame);
      this.driver.input(frame, now);
    }
    if (!this.driver.coop) {
      for (const [code, classId] of CLASS_KEYS) {
        if (!this.input.takeCode(code)) continue;
        const mine = this.session.config.players[slot];
        if (mine && mine.classId !== classId) this.changeClass(classId);
      }
    }
    // Browsers keep sound off until the page has been touched; any key, click or button will do.
    if (this.input.touched) this.audio.unlock();
    if (this.input.take('mute')) this.hud.banner(this.audio.toggleMute() ? 'Sound off' : 'Sound on', PAPER, 1.1);
    if (this.input.take('pause')) this.driver.command('pause');
    if (this.opts.debug && this.input.take('restart')) this.driver.command('restart');
    // a run that has ended waits for anyone to start the next
    if (this.session.phase !== 'run' && this.session.endedFor > 45 && (this.input.take('confirm') || this.input.take('restart'))) this.driver.command('restart');
    // presses nothing asked for do not wait around
    this.input.clearPresses();

    // 2. Step every tick that is due. Ticks stepped in a run to catch up are old news: no effects for those.
    this.driver.step(now, (session, muted) => {
      const mine = worldOf(session, this.localSlot);
      if (mine !== this.viewed) this.watch(mine);
      if (!muted) for (const ev of mine.events) this.onEvent(ev, mine);
    });

    // 3. Draw the world this laptop's player is in, between the last two ticks.
    const s = this.session;
    const w = this.viewed;
    const paused = s.pausedBy >= 0;
    const ended = s.phase !== 'run';
    // nothing moves while the game is paused or over, so nothing is drawn between two ticks
    const alpha = paused || ended || w.freeze > 0 ? 1 : this.driver.alpha(now);
    this.playerViews.update(w.players, alpha, dt, this.time);
    this.enemyViews.update(w, alpha, dt, this.time);
    this.projectileViews.update(w, alpha);
    this.objectViews.update(w, alpha, this.time);
    this.telegraphViews.update(w);
    this.pickupView.update(w, alpha, this.time);
    this.roomView.update(dt, this.time);
    // Whatever a player has sent on its way leaves a ribbon in their colour.
    const trail = (id: number, x: number, y: number, z: number, by: number, width: number, life: number): void => {
      this.trails.touch(id, x, y, z, PLAYER_COLORS[by] ?? RIM, PLAYER_PALE[by] ?? RIM, width, life);
    };
    this.projectileViews.eachOwned((id, x, y, owner) => trail(id, x, y, FLY_Z, owner, 9, 0.2));
    this.enemyViews.eachFlying((id, x, y, by) => trail(id, x, y, 0.45, by, 26, 0.32));
    this.objectViews.eachBatted(w, alpha, (id, x, y, by) => trail(id, x, y, 0.35, by, 14, 0.24));
    this.trails.update(dt);
    this.particles.update(dt);
    this.numbers.update(dt);
    this.fx.update(dt);

    const me = w.players.find((p) => p.slot === this.localSlot);
    // a person aims with what they are about to send; a bot with what it has sent
    this.aimPreview.update(w, me, me && this.autopilot ? me.aim : this.aimSent, this.time);
    const mineView = this.playerViews.get(this.localSlot);
    const fx = mineView ? mineView.x : w.room.cx;
    const fy = mineView ? mineView.y : w.room.cy;
    this.fx.setFocus(fx, fy, this.localSlot);
    this.focusX = fx;
    this.focusY = fy;
    this.audio.update(dt);
    const aimX = me ? fx + Math.cos(me.aim) * 3 : fx;
    const aimY = me ? fy + Math.sin(me.aim) * 3 : fy;
    this.camera.update(dt, fx, fy, aimX, aimY);
    this.stage.applyCamera(this.camera);
    if (this.opts.backdrop) this.backdrop.update(dt, this.camera, this.viewW, this.viewH);
    this.ambient.update(dt);
    for (const x of this.extras) x.update?.(dt, w, alpha, this.time);
    this.bossBar.update(w, dt);
    if (me) {
      // grouped by family, so a build reads as blocks of colour
      const ids = Object.keys(me.tunings)
        .filter((id) => me.tunings[id] > 0 && w.content.tunings[id])
        .sort((a, b) => (w.content.tunings[a].tone < w.content.tunings[b].tone ? -1 : w.content.tunings[a].tone > w.content.tunings[b].tone ? 1 : a < b ? -1 : 1));
      this.held.set(
        ids.map((id) => ({ id, icon: w.content.tunings[id].icon, tone: w.content.tunings[id].tone, rank: me.tunings[id] })),
        activeHarmonies(me.tunings, w.content.harmonies).map((h) => h.parents),
      );
    }
    this.hud.setRun(s.route.length);
    this.hud.update(w, me, dt);
    this.hud.setNet(this.driver.net());
    this.pausedLabel.visible = paused && !ended;
    if (ended && this.endShown !== `${s.attempt}/${s.phase}`) {
      this.endShown = `${s.attempt}/${s.phase}`;
      const t = runSoFar(s);
      this.endHead.text = s.phase === 'won' ? 'The Bell is still' : 'The party is down';
      this.endHead.setColor(s.phase === 'won' ? CHIME : DANGER);
      this.endNote.text = `Chambers ${t.chambers} of ${s.route.length}    Echoes stilled ${t.kills}    Returns ${t.returns}    Best Rally ${t.bestRally}`;
    }
    for (const l of [this.endHead, this.endNote, this.endHint]) l.visible = ended;
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
