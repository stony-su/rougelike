// The app: everything from the first screen to the last. It owns which screen is up (the title,
// choosing a class, the menu, how a run ended), the game being played under them, and the co-op
// lobby. Screens are the files in src/ui/screens; they ask the app for whatever lies beyond
// themselves through the small set of actions below.
import { Container, UPDATE_PRIORITY } from 'pixi.js';
import type { Application, Ticker } from 'pixi.js';
import { GameAudio } from '../audio';
import { BUILD_ID } from '../buildId';
import { CONTENT } from '../content';
import { Backdrop } from '../render/backdrop';
import { Camera } from '../render/camera';
import { ZONES } from '../render/palette';
import { Stage } from '../render/stage';
import { runSoFar } from '../sim/session';
import type { Session } from '../sim/session';
import type { ClassId } from '../sim/types';
import { createScreens } from '../ui/screens';
import type { AppScreen, AppState, Pointer, ScreenHost } from '../ui/screen';
import { uiSound } from '../ui/sfx';
import { CodeBox } from './codeBox';
import { CoopShell } from './coop';
import { SoloDriver } from './driver';
import type { Driver } from './driver';
import { Game } from './game';
import type { GameOptions } from './game';
import { Input, noKeys } from './input';
import { Rumble } from './rumble';
import { attune, bankRun, boonsFor, issue, loadSave, readCode, storeSave, writeCode } from './save';
import { browserStore, loadSettings, saveSettings } from './settings';

export interface AppOptions extends GameOptions {
  /** The host this page was served by, and where it says the others can join; null for a page alone. */
  host: { addresses: string[] } | null;
  /** The name this laptop's player goes by in a lobby. */
  name: string;
  /** Automated checks: sit down in the lobby ready, and start when this many seats are. 0 = off. */
  autoStart: number;
  /** The address named a class or a team: skip the title and begin (a run alone, or the lobby on a hosted page). */
  direct: boolean;
  /** The practice ladder instead of a run. */
  practice: boolean;
  /** Begin at this chamber (development). */
  startAt: number;
  /** The address fixed the seed: every run alone uses it. */
  fixedSeed: boolean;
}

/** The picture behind the menus when no game is: the Crater's standing rings. */
class MenuBackdrop {
  private readonly stage = new Stage();
  private readonly camera = new Camera();
  private readonly backdrop: Backdrop;
  private since = 0;

  constructor(pixi: Application) {
    pixi.stage.addChildAt(this.stage.root, 0);
    this.backdrop = new Backdrop(pixi.renderer, this.stage);
    this.backdrop.setTheme(ZONES.crater);
    pixi.renderer.background.color = ZONES.crater.voidColor;
  }

  resize(w: number, h: number): void {
    this.stage.resize(w, h);
    this.camera.setViewport(w, h);
    this.backdrop.resize(w, h);
  }

  /** A ring across it, as when something is chosen. */
  ring(strength: number): void {
    this.backdrop.pulse(strength);
  }

  update(dt: number, w: number, h: number): void {
    // it tolls by itself now and then
    this.since += dt;
    if (this.since > 5.5) {
      this.since = 0;
      this.backdrop.pulse(0.5);
    }
    this.backdrop.update(dt, this.camera, w, h);
  }

  destroy(): void {
    this.backdrop.destroy();
    this.stage.root.destroy({ children: true });
  }
}

export class App implements ScreenHost {
  readonly input: Input;
  readonly audio = new GameAudio();
  readonly settings = loadSettings(browserStore());
  /** What this player keeps between runs. */
  readonly save = loadSave(browserStore());
  private readonly rumble = new Rumble();
  private readonly codeBox = new CodeBox();
  /** How many games this page has begun, and the run of which game was last written into the save. */
  private games = 0;
  private banked = '';
  readonly state: AppState;
  game: Game | null = null;
  private driver: Driver | null = null;
  private coop: CoopShell | null = null;
  private back: MenuBackdrop | null = null;
  private readonly screens: Record<string, AppScreen>;
  /** The screens that are up, the top one last. Only the top one is drawn and listened to. */
  private readonly stack: string[] = [];
  private readonly layer = new Container();
  private readonly keys = noKeys();
  private readonly pointer: Pointer = { x: 0, y: 0, moved: false, click: false };
  private viewW = 0;
  private viewH = 0;
  /** The tick at which this laptop last asked a game alone to stop or go on, so it asks once. */
  private pauseAskedAt = -1;

  constructor(
    private readonly pixi: Application,
    private readonly opts: AppOptions,
  ) {
    this.input = new Input(pixi.canvas);
    this.state = {
      pad: false,
      hosted: opts.host !== null,
      inGame: false,
      coop: false,
      session: null,
      slot: 0,
      classId: opts.classes[0] ?? 'sword',
      settings: this.settings,
      save: this.save,
      gained: 0,
      note: '',
      content: CONTENT,
    };
    this.applySettings();
    this.screens = createScreens(this);
    pixi.stage.addChild(this.layer);
    for (const s of Object.values(this.screens)) {
      s.root.visible = false;
      this.layer.addChild(s.root);
    }
    // before the game's own frame, so a menu that closes hands the keys back the same frame
    pixi.ticker.add(this.frame, this, UPDATE_PRIORITY.HIGH);

    if (opts.direct && opts.host) this.openLobby();
    else if (opts.direct) this.play(opts.classes);
    else this.showTitle();
  }

  // ---------------------------------------------------------------- what screens may ask

  has(name: string): boolean {
    return this.screens[name] !== undefined;
  }

  open(name: string, arg?: unknown): void {
    const screen = this.screens[name];
    if (!screen) {
      uiSound('error');
      return;
    }
    const at = this.stack.indexOf(name);
    if (at >= 0) this.stack.splice(at, 1);
    this.stack.push(name);
    screen.layout(this.viewW, this.viewH);
    this.refresh();
    screen.enter(arg);
    this.show();
    this.input.clearPresses();
  }

  close(): void {
    this.stack.pop();
    this.show();
    this.input.clearPresses();
  }

  act(what: string, arg?: unknown): void {
    switch (what) {
      case 'play':
        this.play([arg === 'bow' || arg === 'fist' ? arg : 'sword']);
        break;
      case 'lobby':
        this.openLobby();
        break;
      case 'again':
        // alone this starts the next run at once; together it says this player is ready for it
        this.driver?.command('ready', arg === false ? 0 : 1);
        break;
      case 'restart':
        // the run being left is a run all the same
        this.bank();
        this.driver?.command('restart');
        this.closeAll();
        break;
      case 'pauseAll': {
        const s = this.driver?.session;
        if (s) this.driver?.command('pause', s.pausedBy >= 0 ? 2 : 1);
        break;
      }
      case 'class':
        this.showTitle();
        this.open('classSelect');
        break;
      case 'title':
        this.showTitle();
        break;
      case 'settings':
        this.applySettings();
        saveSettings(browserStore(), this.settings);
        break;
      case 'attune':
        if (typeof arg === 'string' && attune(this.save, arg)) storeSave(browserStore(), this.save);
        break;
      case 'issue':
        if (Array.isArray(arg) && (arg[0] === 'sword' || arg[0] === 'bow' || arg[0] === 'fist') && typeof arg[1] === 'string' && issue(this.save, arg[0], arg[1], CONTENT))
          storeSave(browserStore(), this.save);
        break;
      case 'code':
        this.code(arg === 'read');
        break;
      default:
        break;
    }
  }

  /** Write the save out as a code to be copied, or read one that is pasted in. */
  private code(read: boolean): void {
    this.state.note = '';
    if (!read) {
      this.codeBox.show(writeCode(this.save), () => undefined);
      return;
    }
    this.codeBox.ask((text) => {
      if (text === null || text.trim() === '') return;
      const got = readCode(text);
      if (!got) {
        uiSound('error');
        this.state.note = 'That is not a whole code';
        return;
      }
      // the same object, so everything that holds the save sees what was read
      Object.assign(this.save, got);
      storeSave(browserStore(), this.save);
      uiSound('confirm');
      this.state.note = 'The save was read';
    });
  }

  /**
   * Write the run being played into the save, once: its Resonance, and this class's records. A
   * run that is left counts as it stands. The practice ladder and runs begun partway down the
   * road (a development address) earn nothing.
   */
  private bank(): void {
    const s = this.driver ? this.driver.session : null;
    if (!this.game || !s || !this.driver) return;
    const key = `${this.games}/${s.attempt}`;
    if (this.banked === key) return;
    this.banked = key;
    this.state.gained = 0;
    const mine = s.config.players[this.driver.localSlot];
    if (!mine || s.config.practice || s.config.stress > 0 || (s.config.startAt ?? 1) > 1) return;
    const miniboss = s.route.findIndex((r) => r.kind === 'miniboss') + 1;
    this.state.gained = bankRun(this.save, mine.classId, runSoFar(s), s.phase === 'won', s.played, miniboss);
    storeSave(browserStore(), this.save);
  }

  /** Make everything that follows a setting follow it now. */
  private applySettings(): void {
    const s = this.settings;
    this.audio.setVolume(s.volume);
    this.audio.setMuted(s.muted);
    this.rumble.enabled = s.rumble;
    // the picture: every pixel the screen has (up to two for one), one for one, or coarser
    const resolution = s.picture >= 2 ? Math.min(window.devicePixelRatio || 1, 2) : s.picture === 1 ? 1 : 0.75;
    if (this.pixi.renderer.resolution !== resolution) this.pixi.renderer.resize(this.pixi.screen.width, this.pixi.screen.height, resolution);
    this.game?.applySettings();
  }

  // ---------------------------------------------------------------- what is up

  private top(): AppScreen | null {
    const name = this.stack[this.stack.length - 1];
    return name ? this.screens[name] : null;
  }

  private show(): void {
    const top = this.top();
    for (const s of Object.values(this.screens)) s.root.visible = s === top;
    // menus are pointed at, the game is aimed at
    this.pixi.canvas.style.cursor = top || !this.game ? 'default' : 'crosshair';
  }

  private closeAll(): void {
    this.stack.length = 0;
    this.show();
    this.input.clearPresses();
  }

  /** Bring `state` up to date with what the app holds, for the screens to read. */
  private refresh(): void {
    const st = this.state;
    const session: Session | null = this.driver ? this.driver.session : null;
    st.pad = this.input.device === 'pad';
    st.inGame = this.game !== null;
    st.coop = this.driver !== null && this.driver.coop;
    st.session = this.game ? session : null;
    st.slot = this.driver ? this.driver.localSlot : 0;
  }

  /** Leave whatever is being played and stand on the title. */
  private showTitle(): void {
    // a run that is walked away from is written down as far as it got
    this.bank();
    this.endGame();
    if (this.coop) {
      this.coop.destroy();
      this.coop = null;
    }
    this.driver = null;
    this.stack.length = 0;
    this.needBackdrop();
    this.open('title');
  }

  private needBackdrop(): void {
    if (this.back) return;
    this.back = new MenuBackdrop(this.pixi);
    this.back.resize(this.viewW || this.pixi.screen.width, this.viewH || this.pixi.screen.height);
  }

  private dropBackdrop(): void {
    this.back?.destroy();
    this.back = null;
  }

  private endGame(): void {
    if (!this.game) return;
    // in co-op the game belongs to the lobby's shell, which ends it itself
    if (!this.coop) this.game.destroy();
    this.game = null;
  }

  /** A game is beginning: the menus come down and the game's picture goes under the screen layer. */
  private begin(driver: Driver): Game {
    this.dropBackdrop();
    this.stack.length = 0;
    this.driver = driver;
    this.games++;
    this.pauseAskedAt = -1;
    const game = new Game(this.pixi, driver, this.opts, {
      input: this.input,
      audio: this.audio,
      settings: this.settings,
      rumble: this.rumble,
      onMenu: () => this.open('pause'),
      onSettings: () => this.act('settings'),
    });
    this.game = game;
    this.pixi.stage.addChild(this.layer);
    this.show();
    this.input.clearPresses();
    return game;
  }

  /** A run alone, as a class (the first of `classes`); any others are bot companions. */
  private play(classes: ClassId[]): void {
    this.endGame();
    const team = classes.length > 0 ? classes.slice(0, 3) : (['sword'] as ClassId[]);
    this.state.classId = team[0];
    const seed = this.opts.fixedSeed ? this.opts.seed : String(Math.floor(Math.random() * 1e9));
    // this player brings what they have earned; bot companions bring nothing
    const players = team.map((classId, slot) => ({ name: `Player ${slot + 1}`, classId, boons: slot === 0 ? boonsFor(this.save, classId, CONTENT) : undefined }));
    this.begin(new SoloDriver({ seed, players, buildId: BUILD_ID, inputDelay: 0, stress: this.opts.stress, practice: this.opts.practice, startAt: this.opts.startAt }));
  }

  /** The co-op lobby of the host this page was served by. */
  private openLobby(): void {
    if (!this.opts.host || this.coop) return;
    this.endGame();
    this.stack.length = 0;
    this.show();
    this.needBackdrop();
    this.coop = new CoopShell(this.pixi, {
      ...this.opts,
      name: this.opts.name,
      addresses: this.opts.host.addresses,
      autoStart: this.opts.autoStart,
      boonsFor: (classId) => boonsFor(this.save, classId, CONTENT),
      makeGame: (driver) => this.begin(driver),
      onGameOver: () => {
        // the host ended the game: the lobby again
        this.game = null;
        this.stack.length = 0;
        this.show();
        this.needBackdrop();
      },
      onLeave: () => this.showTitle(),
    });
    this.driver = this.coop.driver;
    this.pixi.stage.addChild(this.layer);
  }

  // ---------------------------------------------------------------- the frame

  private frame(ticker: Ticker): void {
    const w = this.pixi.screen.width;
    const h = this.pixi.screen.height;
    if (w !== this.viewW || h !== this.viewH) {
      this.viewW = w;
      this.viewH = h;
      this.back?.resize(w, h);
      for (const name of this.stack) this.screens[name].layout(w, h);
    }
    const dt = Math.min(ticker.elapsedMS, 100) / 1000;
    const input = this.input;
    // Browsers keep sound off until the page has been touched; any key, click or button will do.
    if (input.touched) this.audio.unlock();
    this.refresh();

    // a run that has ended is written into the save and brings up how it ended; the next one beginning takes it down
    const session = this.state.session;
    if (session && session.phase !== 'run') this.bank();
    if (session && session.phase !== 'run' && session.endedFor > 45 && !this.stack.includes('results')) {
      this.stack.length = 0;
      this.open('results');
    } else if (session && session.phase === 'run' && this.stack.includes('results')) {
      this.closeAll();
    }

    const top = this.top();
    if (this.codeBox.open) {
      // the box of text has the keys: nothing under it listens
      input.clearPresses();
    } else if (top) {
      const keys = input.menuKeys(this.keys);
      // the key that opens the menu also closes it
      if (input.take('pause') && this.stack[this.stack.length - 1] === 'pause') keys.back = true;
      const p = this.pointer;
      p.moved = input.hasMouse && (input.mouseX !== p.x || input.mouseY !== p.y);
      p.x = input.mouseX;
      p.y = input.mouseY;
      p.click = input.take('attack');
      top.update(dt, keys, p);
      input.clearPresses();
    } else if (!this.game) {
      // the lobby listens for itself
      input.clearPresses();
    }

    if (this.back) {
      this.back.update(dt, w, h);
      if (!this.game) this.audio.update(dt);
    }

    const game = this.game;
    if (game) {
      game.menuUp = this.stack.length > 0;
      // alone, the game stands still for as long as a menu is over it
      const s = this.driver ? this.driver.session : null;
      if (s && this.driver && !this.driver.coop && s.phase === 'run') {
        const want = this.stack.length > 0;
        if (want !== s.pausedBy >= 0 && s.tick !== this.pauseAskedAt) {
          this.pauseAskedAt = s.tick;
          this.driver.command('pause', want ? 1 : 2);
        }
      }
    }
  }

  /** A plain snapshot for automated checks. */
  debugState(): Record<string, unknown> {
    const menu = this.stack[this.stack.length - 1] ?? '';
    if (this.game) return { ...this.game.debugState(), menu };
    if (this.coop) {
      const core = this.coop.driver.core;
      return { lobby: true, menu, phase: core.phase, slot: core.slot, seats: core.seats, reason: core.reason };
    }
    return { title: true, menu };
  }

  worldToScreen(x: number, y: number): [number, number] {
    return this.game ? this.game.worldToScreen(x, y) : [0, 0];
  }
}
