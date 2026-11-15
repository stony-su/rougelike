// The route of a run: twelve chambers over two zones (DESIGN.md section 7), planned from the
// seed so that every laptop walks the same road. A stop says what a chamber is for and what the
// generator should build for it; the session turns stops into worlds, one at a time.
import { Rng } from '../core/rng';
import type { ContentRegistry, RoomLook, ZoneId } from './defs';
import { createFlow } from './flow';
import type { RoomFlow } from './flow';
import { ROOM_SHAPES } from './roomgen';
import type { RoomShape, RoomSpec } from './roomgen';

/**
 * What a chamber is for.
 *
 * 'fight' and 'elite' are waves. A 'solo' chamber is a short fight; the party shares it until
 * each player has a world of their own there. A 'wager' is a fight like any other until the
 * Wager itself is offered in it. A 'camp' has no enemies: everyone gets some health back. The
 * 'miniboss' and the 'boss' are the hardest fights of their zones.
 */
export type StopKind = 'fight' | 'elite' | 'solo' | 'camp' | 'wager' | 'miniboss' | 'boss';

export interface Stop {
  /** The number of the chamber, from 1. */
  n: number;
  kind: StopKind;
  zone: ZoneId;
  look: RoomLook;
  shape: RoomShape;
  /** Rough width of the floor in tiles. */
  size: number;
  name: string;
}

export const RUN_LENGTH = 12;
/** The Echoes that hold the last chamber of each zone, by id. Until one exists, its chamber is the hardest fight of the zone instead. */
export const MINIBOSS = 'carillon';
export const BOSS = 'toll';
/** The share of their health everyone gets back on walking into a camp. */
export const CAMP_HEAL = 0.35;

const ZONE_NAMES: Record<ZoneId, string> = { outer: 'Reedwater', inner: 'Stormshelf' };
const SHAPE_NAMES: Record<RoomShape, string> = { court: 'Court', cross: 'Crossing', lobes: 'Twin Halls', ring: 'Ring', cavern: 'Hollow' };

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

/** The order of the chambers. The same seed always gives the same route. */
export function planRoute(seed: string): Stop[] {
  const rng = new Rng(`${seed}/route`);
  // The Outer Ring opens with a fight; then a fight, a side-chamber and an elite in any order; a camp; the mini-boss.
  const outer: StopKind[] = ['fight', ...shuffled<StopKind>(['fight', 'solo', 'elite'], rng), 'camp', 'miniboss'];
  // The Inner Ring: the Wager stands right before the elite it is a wager on, with a side-chamber
  // on either side of the pair, so two side-chambers never touch and none comes right before the boss.
  const inner: StopKind[] = ['solo', 'wager', 'elite', 'solo', 'camp', 'boss'];
  const kinds = [...outer, ...inner];

  const stops: Stop[] = [];
  let lastShape: RoomShape | null = null;
  let lastLook: RoomLook = rng.chance(0.5) ? 'court' : 'survey';
  let sameLook = 0;
  kinds.forEach((kind, i) => {
    const zone: ZoneId = i < outer.length ? 'outer' : 'inner';
    // never the same look three chambers running
    let look: RoomLook = rng.chance(0.5) ? 'court' : 'survey';
    if (look === lastLook && sameLook >= 2) look = look === 'court' ? 'survey' : 'court';
    sameLook = look === lastLook ? sameLook + 1 : 1;
    lastLook = look;

    let shape: RoomShape = 'court';
    let size = 24;
    let name = '';
    if (kind === 'camp') {
      size = 16;
      name = 'Camp';
    } else if (kind === 'solo') {
      size = 18;
      name = `${ZONE_NAMES[zone]} Side-chamber`;
    } else if (kind === 'miniboss') {
      size = 28;
      name = 'The Carillon Hall';
    } else if (kind === 'boss') {
      size = 30;
      name = 'The Crater';
    } else {
      // a different shape from the last fight, so the road keeps changing under the party
      const choices = ROOM_SHAPES.filter((s) => s !== lastShape);
      shape = rng.pick(choices);
      lastShape = shape;
      size = kind === 'elite' ? rng.int(26, 32) : kind === 'wager' ? rng.int(22, 26) : rng.int(24, 30);
      name = `${ZONE_NAMES[zone]} ${SHAPE_NAMES[shape]}`;
    }
    stops.push({ n: i + 1, kind, zone, look, shape, size, name });
  });
  return stops;
}

/** What the generator is asked to build for a stop. */
export function roomSpec(stop: Stop): RoomSpec {
  return { zone: stop.zone, kind: stop.kind === 'miniboss' || stop.kind === 'boss' ? 'arena' : 'combat', look: stop.look, size: stop.size, shape: stop.shape, name: stop.name };
}

/** How a stop's chamber runs: its waves, how much each may spend, and what clearing it pays. */
export function flowFor(stop: Stop, players: number, content: ContentRegistry): RoomFlow {
  const f = createFlow(stop.n, players);
  f.kind = stop.kind;
  const boss = stop.kind === 'miniboss' ? MINIBOSS : stop.kind === 'boss' ? BOSS : '';
  if (boss && content.enemies[boss]) {
    f.boss = boss;
    f.waves = 1;
    f.clearBonus *= stop.kind === 'boss' ? 4 : 3;
    return f;
  }
  switch (stop.kind) {
    case 'elite':
      f.budget *= 1.4;
      f.clearBonus *= 2;
      break;
    case 'solo':
      f.waves = 1;
      f.budget *= 0.8;
      break;
    case 'camp':
      f.waves = 0;
      f.clearBonus = 0;
      break;
    case 'miniboss':
      f.waves = 3;
      f.budget *= 1.5;
      f.clearBonus *= 3;
      break;
    case 'boss':
      f.waves = 3;
      f.budget *= 1.8;
      f.clearBonus *= 4;
      break;
    default:
      break;
  }
  return f;
}
