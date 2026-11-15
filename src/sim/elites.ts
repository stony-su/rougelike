// Elites: an ordinary Echo with more health, a harder hit and one trait. The traits are small:
// two are numbers set when it arrives (Hasty, Plated), and three are things that happen later,
// each in the one place where its cause happens: a Resonant elite rings when it is bounced and a
// Tethered pair drags each other when launched (bodies.ts), the ring lands and the tether holds
// (ai.ts), and what an elite leaves behind when it dies is here.
import { spawnEnemy } from './ai';
import { pushBody } from './bodies';
import type { EnemyDef } from './defs';
import { ELITE } from './tuning';
import type { Enemy, World } from './types';

export const ELITE_TRAITS = ['hasty', 'plated', 'resonant', 'splitting', 'tethered'] as const;
export type EliteTrait = (typeof ELITE_TRAITS)[number];

/** What each trait is called, and what a player needs to know about it. */
export const ELITE_NOTES: Readonly<Record<EliteTrait, { name: string; note: string }>> = {
  hasty: { name: 'Hasty', note: 'Faster on its feet, and quicker to strike.' },
  plated: { name: 'Plated', note: 'Takes a quarter of every blow until a wall slam or a carom breaks the plate.' },
  resonant: { name: 'Resonant', note: 'Rings every time it is bounced: stand clear of the ring.' },
  splitting: { name: 'Splitting', note: 'Falls apart into two smaller ones.' },
  tethered: { name: 'Tethered', note: 'A pair on a tether: launch one and the other is dragged along.' },
};

/** Bring an Echo into the chamber as an elite. Returns what arrived: one body, or the two of a tethered pair. */
export function spawnElite(w: World, def: EnemyDef, x: number, y: number, trait: EliteTrait): Enemy[] {
  const arrive = (px: number, py: number, hpMul: number): Enemy => {
    const e = spawnEnemy(w, def, px, py, { elite: trait, hpMul });
    e.damageMul *= ELITE.damage;
    return e;
  };
  if (trait === 'tethered') {
    const a = arrive(x - 0.7, y, ELITE.tetherHp);
    const b = arrive(x + 0.7, y, ELITE.tetherHp);
    a.mate = b.id;
    b.mate = a.id;
    return [a, b];
  }
  const e = arrive(x, y, ELITE.hp);
  if (trait === 'hasty') {
    e.windupMul *= ELITE.hastyWindup;
    e.speedMul *= ELITE.hastySpeed;
  } else if (trait === 'plated') {
    e.armor = ELITE.platedArmor;
  }
  return [e];
}

/** What an elite leaves behind: a Splitting one falls into two smaller Echoes, and the survivor of a Tethered pair is enraged. */
export function eliteDied(w: World, d: World['deaths'][number]): void {
  if (d.elite === 'splitting') {
    const def = w.content.enemies[d.defId];
    if (!def) return;
    for (const side of [-1, 1]) {
      const e = spawnEnemy(w, def, d.x + side * 0.4, d.y, { instant: true });
      e.hp = e.maxHp = Math.max(1, Math.round(d.maxHp * ELITE.splitHp));
      e.radius *= ELITE.splitSize;
      // they tumble apart
      pushBody(w, e, side, 0, ELITE.splitShove * def.mass, -1);
    }
  } else if (d.elite === 'tethered' && d.mate > 0) {
    for (const m of w.enemies) {
      if (m.id !== d.mate || m.dead) continue;
      m.mate = 0;
      m.speedMul *= ELITE.tetherRage;
    }
  }
}
