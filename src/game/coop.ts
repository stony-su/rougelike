// The co-op shell: what a page does when it finds it was served by a host. It connects, shows
// the lobby, and when the host begins a game it hands the connection to the game shell as its
// driver. If the game ends or the host goes, it is the lobby (or a plain message) again.
import type { Application } from 'pixi.js';
import type { LobbySeat } from '../net/protocol';
import type { Boons } from '../sim/boons';
import type { ClassId } from '../sim/types';
import { LobbyView } from '../ui/lobby';
import { CoopDriver } from './connection';
import { PadReader } from './gamepad';
import type { Game, GameOptions } from './game';

const CLASSES: ClassId[] = ['sword', 'bow', 'fist'];

export interface CoopOptions extends GameOptions {
  name: string;
  /** Where the other laptops can open the game, as the host reports it. */
  addresses: string[];
  /** For automated checks: say ready at once, and start when this many seats are filled and ready. */
  autoStart: number;
  /** What this laptop's player brings to a run as a class, from what they have earned. */
  boonsFor: (classId: ClassId) => Boons;
  /** The host has begun a game: the app makes its shell round this connection. */
  makeGame: (driver: CoopDriver) => Game;
  /** The game is over and the lobby is up again. */
  onGameOver: () => void;
  /** The player left the lobby. */
  onLeave: () => void;
}

export class CoopShell {
  readonly driver: CoopDriver;
  game: Game | null = null;
  private readonly lobby = new LobbyView();
  private seats: LobbySeat[] = [];
  private slot = -1;
  private classId: ClassId;
  private status = '';
  private readonly onKey: (e: KeyboardEvent) => void;
  private readonly pads = new PadReader();
  private viewW = 0;
  private viewH = 0;
  private asked = false;

  constructor(
    private readonly app: Application,
    private readonly opts: CoopOptions,
  ) {
    this.classId = opts.classes[0] ?? 'sword';
    app.stage.addChild(this.lobby.root);
    this.driver = new CoopDriver(opts.name || 'Returner', this.classId, opts.boonsFor(this.classId), {
      onLobby: (seats, slot) => {
        this.seats = seats;
        this.slot = slot;
        const mine = seats[slot];
        if (mine) this.classId = mine.classId;
      },
      onSession: () => this.begin(),
      onRefused: (why) => {
        this.status = why;
      },
      onBye: (why) => {
        this.status = why;
        this.endGame();
      },
    });
    this.onKey = (e) => {
      if (this.game || e.repeat) return;
      if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') this.choose(CLASSES[Number(e.code.slice(5)) - 1]);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.cycle(-1);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.cycle(1);
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyF') this.confirm();
      else if (e.code === 'Escape') this.opts.onLeave();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', this.onKey);
    app.ticker.add(this.frame, this);
  }

  private mine(): LobbySeat | undefined {
    return this.slot >= 0 ? this.seats[this.slot] : undefined;
  }

  private choose(classId: ClassId): void {
    const mine = this.mine();
    if (!mine || mine.ready) return;
    this.classId = classId;
    this.driver.core.seat(classId, false, this.opts.boonsFor(classId));
  }

  private cycle(by: number): void {
    this.choose(CLASSES[(CLASSES.indexOf(this.classId) + by + CLASSES.length) % CLASSES.length]);
  }

  /** Enter: say ready; with everyone ready, start; while waiting, take it back to change class. */
  private confirm(): void {
    const mine = this.mine();
    if (!mine) return;
    const everyone = this.seats.every((s) => s.ready);
    if (everyone) this.driver.core.start();
    else this.driver.core.seat(this.classId, !mine.ready, this.opts.boonsFor(this.classId));
  }

  /** The host has begun a game (or sent one in progress): hand the connection to the game shell. */
  private begin(): void {
    if (this.game) return;
    this.lobby.root.visible = false;
    this.status = '';
    this.game = this.opts.makeGame(this.driver);
  }

  private endGame(): void {
    if (!this.game) return;
    this.game.destroy();
    this.game = null;
    this.lobby.root.visible = true;
    this.asked = false;
    this.opts.onGameOver();
  }

  /** A controller in the lobby: left and right choose a class, A is Enter. */
  private pollPad(): void {
    this.pads.poll(navigator.getGamepads ? navigator.getGamepads() : []);
    if (this.pads.stepX !== 0) this.cycle(this.pads.stepX);
    if (this.pads.pressed.has('confirm')) this.confirm();
    else if (this.pads.pressed.has('back')) this.opts.onLeave();
  }

  private frame(): void {
    if (this.game) {
      // back to the lobby if the host has ended the game
      if (this.driver.core.phase === 'lobby' && this.driver.session === null) this.endGame();
      return;
    }
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    if (w !== this.viewW || h !== this.viewH) {
      this.viewW = w;
      this.viewH = h;
      this.lobby.layout(w, h);
    }
    this.pollPad();
    const now = performance.now();
    // nothing is stepped in the lobby, but the connection still measures its round trip
    this.driver.core.step(now);

    const mine = this.mine();
    if (this.opts.autoStart > 0 && mine) {
      // automated checks: ready at once, and the first seat starts when the party is complete
      if (!mine.ready) this.driver.core.seat(this.classId, true, this.opts.boonsFor(this.classId));
      else if (!this.asked && this.slot === 0 && this.seats.length >= this.opts.autoStart && this.seats.every((s) => s.ready)) {
        this.asked = true;
        this.driver.core.start();
      }
    }
    let status = this.status;
    if (!status && !this.driver.online && this.slot >= 0) status = 'The connection to the host was lost. Trying again.';
    else if (!status && this.driver.core.phase === 'closed' && this.slot < 0) status = 'Cannot reach the host. Is it still running?';
    this.lobby.update(this.seats, this.slot, this.joinAddress(), status, this.app.ticker.elapsedMS / 1000);
  }

  /** What to tell the others to open. On the host laptop itself that is its network address, not "localhost". */
  private joinAddress(): string {
    const local = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return local && this.opts.addresses.length > 0 ? this.opts.addresses[0] : `http://${window.location.host}`;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    this.app.ticker.remove(this.frame, this);
    this.game?.destroy();
    this.lobby.destroy();
    this.driver.close();
  }
}
