// Ties the simulation, the renderer and input together and runs the frame.
import { BitmapFont, BitmapText } from 'pixi.js';
import type { Application, Ticker } from 'pixi.js';
import { roomTemplate } from '../content/rooms';
import { Ambient } from '../render/ambient';
import { Camera } from '../render/camera';
import { ZONES, css } from '../render/palette';
import { PlayerView } from '../render/playerView';
import { RoomView } from '../render/roomView';
import { Stage } from '../render/stage';
import { Textures } from '../render/textures';
import { buildRoom } from '../sim/room';
import { SIM_HZ } from '../sim/tuning';
import type { World } from '../sim/types';
import { createWorld, stepWorld } from '../sim/world';
import { Input } from './input';
import { FixedLoop } from './loop';

export interface GameOptions {
  debug: boolean;
  seed: string;
}

export class Game {
  readonly stage = new Stage();
  readonly camera = new Camera();
  readonly input: Input;
  readonly textures: Textures;
  world: World;

  private roomView: RoomView;
  private playerView: PlayerView;
  private ambient: Ambient;
  private readonly loop = new FixedLoop(1000 / SIM_HZ);
  private time = 0;
  private viewW = 0;
  private viewH = 0;
  private debugText: BitmapText | null = null;
  private readonly frameTimes: number[] = [];
  private lastFrameAt = 0;

  constructor(
    private readonly app: Application,
    opts: GameOptions,
  ) {
    app.stage.addChild(this.stage.root);
    this.textures = new Textures(app.renderer);
    this.input = new Input(app.canvas);

    const room = buildRoom(roomTemplate('bluefen-reedbed'));
    const theme = ZONES[room.zone];
    app.renderer.background.color = theme.voidColor;
    this.world = createWorld(room, opts.seed);
    this.roomView = new RoomView(room, theme, this.stage, app.renderer);
    this.playerView = new PlayerView(this.stage);
    this.playerView.snap(this.world);
    this.ambient = new Ambient(this.stage, this.textures, room, theme);

    if (opts.debug) {
      BitmapFont.install({
        name: 'debug',
        style: { fontFamily: 'Consolas, Menlo, monospace', fontSize: 16, fill: css(theme.highlight) },
        chars: [[' ', '~']],
      });
      this.debugText = new BitmapText({ text: '', style: { fontFamily: 'debug', fontSize: 16 } });
      this.debugText.position.set(12, 10);
      this.stage.ui.addChild(this.debugText);
    }

    this.onResize();
    this.camera.frameRoom(room, true);
    app.ticker.add(this.frame, this);
  }

  destroy(): void {
    this.app.ticker.remove(this.frame, this);
    this.input.destroy();
    this.playerView.destroy();
    this.roomView.destroy();
    this.ambient.destroy();
    this.textures.destroy();
    this.stage.root.destroy({ children: true });
  }

  /** A plain snapshot for automated checks. */
  debugState(): Record<string, unknown> {
    const p = this.world.player;
    const ft = this.frameTimes.slice().sort((a, b) => a - b);
    const pick = (q: number): number => (ft.length ? ft[Math.min(ft.length - 1, Math.floor(ft.length * q))] : 0);
    return {
      tick: this.world.tick,
      player: { x: +p.x.toFixed(3), y: +p.y.toFixed(3), state: p.state, dashCharges: p.dashCharges, hp: p.hp },
      frameMs: { median: +pick(0.5).toFixed(2), p95: +pick(0.95).toFixed(2), max: +pick(1).toFixed(2), samples: ft.length },
      sortables: this.stage.depth.count,
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
  }

  private frame(ticker: Ticker): void {
    if (this.app.screen.width !== this.viewW || this.app.screen.height !== this.viewH) this.onResize();

    const now = performance.now();
    if (this.lastFrameAt > 0) {
      this.frameTimes.push(now - this.lastFrameAt);
      if (this.frameTimes.length > 240) this.frameTimes.shift();
    }
    this.lastFrameAt = now;

    const dtMs = Math.min(ticker.elapsedMS, 100);
    const dt = dtMs / 1000;
    this.time += dt;

    this.loop.advance(dtMs, () => {
      stepWorld(this.world, this.input.frame(this.camera));
    });

    for (const ev of this.world.events) this.playerView.handle(ev);
    this.world.events.length = 0;

    const w = this.world;
    const p = w.player;
    this.playerView.update(w, this.loop.alpha, dt, this.time);
    const aimX = p.x + Math.cos(p.aim) * 3;
    const aimY = p.y + Math.sin(p.aim) * 3;
    this.camera.update(dt, this.playerView.x, this.playerView.y, aimX, aimY);
    this.stage.applyCamera(this.camera);
    this.ambient.update(dt);
    this.stage.depth.sort();

    if (this.debugText) {
      const s = this.debugState();
      const f = s.frameMs as { median: number; p95: number };
      this.debugText.text = `${(1000 / Math.max(1, f.median)).toFixed(0)} fps  median ${f.median} ms  p95 ${f.p95} ms\n${p.state}  dash ${p.dashCharges}  (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`;
    }
  }
}
