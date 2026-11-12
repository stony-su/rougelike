// Ambient life: slow motes of chalk dust drifting over the sheet, a vignette, so a still room
// is never a still picture. Transform-only; nothing is redrawn.
import { Sprite } from 'pixi.js';
import { projX, projY } from '../core/iso';
import type { Room } from '../sim/types';
import type { ZoneTheme } from './palette';
import type { Stage } from './stage';
import type { Textures } from './textures';

interface Mote {
  s: Sprite;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  phase: number;
  size: number;
}

export class Ambient {
  private readonly motes: Mote[] = [];
  private readonly vignette: Sprite;
  private time = 0;

  constructor(
    stage: Stage,
    textures: Textures,
    private room: Room,
    theme: ZoneTheme,
  ) {
    this.vignette = new Sprite(textures.vignette);
    stage.overlay.addChild(this.vignette);
    for (let i = 0; i < 46; i++) {
      const s = new Sprite(textures.soft);
      s.anchor.set(0.5);
      s.tint = i % 5 === 0 ? theme.highlight : theme.accent;
      stage.fxGlow.addChild(s);
      const m: Mote = { s, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, phase: Math.random() * 6.28, size: 0 };
      this.respawn(m, true);
      this.motes.push(m);
    }
  }

  setRoom(room: Room, theme: ZoneTheme): void {
    this.room = room;
    this.motes.forEach((m, i) => {
      m.s.tint = i % 5 === 0 ? theme.highlight : theme.accent;
      this.respawn(m, true);
    });
  }

  resize(w: number, h: number): void {
    this.vignette.width = w;
    this.vignette.height = h;
  }

  update(dt: number): void {
    this.time += dt;
    for (const m of this.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.z += m.vz * dt;
      if (m.z > 3.4) this.respawn(m, false);
      const wob = Math.sin(this.time * 0.7 + m.phase) * 0.25;
      m.s.position.set(projX(m.x + wob, m.y - wob), projY(m.x + wob, m.y - wob, m.z));
      const life = Math.min(1, m.z / 0.5) * Math.min(1, (3.4 - m.z) / 0.8);
      m.s.alpha = (0.22 + 0.3 * (0.5 + 0.5 * Math.sin(this.time * 1.7 + m.phase * 3))) * life;
      m.s.scale.set(m.size);
    }
  }

  destroy(): void {
    for (const m of this.motes) m.s.destroy();
    this.vignette.destroy();
    this.motes.length = 0;
  }

  private respawn(m: Mote, anywhere: boolean): void {
    const pad = 2.5;
    m.x = -pad + Math.random() * (this.room.w + pad * 2);
    m.y = -pad + Math.random() * (this.room.h + pad * 2);
    m.z = anywhere ? Math.random() * 3.2 : 0;
    m.vx = (Math.random() - 0.5) * 0.12;
    m.vy = (Math.random() - 0.5) * 0.12;
    m.vz = 0.05 + Math.random() * 0.1;
    m.size = 0.22 + Math.random() * 0.3;
  }
}
