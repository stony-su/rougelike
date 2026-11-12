// A run: twelve sheets across two zones, the route through them, and everything that persists
// from room to room (health, Chalk, the kit). Also the choices offered between fights:
// drafts, the shop, the rest stop and the risk event.
import { Rng } from '../core/rng';
import type { ContentRegistry, InstrumentDef, RoomKind, RoomTemplate, ZoneId } from './defs';
import { createFlow, openDoors, startFight } from './flow';
import type { RoomSlot } from './flow';
import { createKit, exchangeHeads, grantInstrument, rebuildKit, spliceWith, swapHead } from './kit';
import type { KitState } from './kit';
import { setStakeCount } from './lines';
import { buildRoom } from './room';
import { PLAYER } from './tuning';
import type { ChainId } from './tuning';
import type { World } from './types';
import { createWorld } from './world';

export const SHEETS = 12;
export const MINIBOSS_SHEET = 6;

export interface RunOptions {
  chain?: ChainId;
  /** Permanent bonuses from the Office Ledger. */
  maxHpBonus?: number;
  startChalk?: number;
  rerolls?: number;
  startHead?: string | null;
  /** Locked instrument ids the player has unlocked. */
  unlocked?: readonly string[];
  base?: World['base'];
  /** Begin with the tutorial sheet. */
  tutorial?: boolean;
}

export interface RunTotals {
  kills: number;
  damageDealt: number;
  damageTaken: number;
  rodDamage: number;
  lineDamage: number;
  whips: number;
  discharges: number;
  sheetsCleared: number;
  benchmarks: number;
  /** Simulated seconds spent in rooms. */
  time: number;
}

export interface RunState {
  seed: string;
  /** Sheet number of the current room: 1..12, or 0 for the tutorial. */
  sheet: number;
  zone: ZoneId;
  slot: RoomSlot;
  /** Rooms of the current zone not yet visited (the boss is not in the bag). */
  bag: RoomSlot[];
  /** What the previous room was, for ordering rules. */
  lastKind: RoomKind;
  kit: KitState;
  chalk: number;
  hp: number;
  maxHp: number;
  rerolls: number;
  /** Room templates already used this run. */
  used: string[];
  drafts: number;
  unlocked: readonly string[];
  base: World['base'];
  totals: RunTotals;
  over: null | 'dead' | 'victory';
  /** Counter mixed into seeds so every roll in a run is distinct but reproducible. */
  rolls: number;
}

export const HANDICAPS = {
  shortChain: { name: 'Short Chain', text: 'Your stakes link at half the usual range.' },
  slackLine: { name: 'Slack Line', text: 'Your lines never turn ripe.' },
  twoStakes: { name: 'Two Stakes', text: 'You carry only two stakes.' },
} as const;
export type HandicapId = keyof typeof HANDICAPS;

function rngFor(run: RunState, label: string): Rng {
  run.rolls++;
  return new Rng(`${run.seed}/${label}/${run.rolls}`);
}

function zoneBag(run: RunState, zone: ZoneId, nonCombat: RoomKind[]): RoomSlot[] {
  const combats = zone === 'bluefen' ? 4 : 3;
  const bag: RoomSlot[] = [];
  const eliteAt = new Rng(`${run.seed}/elite/${zone}`).int(1, combats - 1); // never the first combat room
  for (let i = 0; i < combats; i++) bag.push({ kind: 'combat', elite: i === eliteAt });
  for (const k of nonCombat) bag.push({ kind: k, elite: false });
  return bag;
}

/** Which of shop and event falls in which zone is decided per run. */
function nonCombatSplit(seed: string): [RoomKind, RoomKind] {
  return new Rng(`${seed}/split`).chance(0.5) ? ['shop', 'event'] : ['event', 'shop'];
}

export function createRun(seed: string, o: RunOptions = {}): RunState {
  const maxHp = PLAYER.maxHp + (o.maxHpBonus ?? 0);
  const run: RunState = {
    seed,
    sheet: o.tutorial ? 0 : 1,
    zone: 'bluefen',
    slot: { kind: o.tutorial ? 'tutorial' : 'combat', elite: false },
    bag: [],
    lastKind: 'combat',
    kit: createKit(o.chain ?? 'standard'),
    chalk: o.startChalk ?? 0,
    hp: maxHp,
    maxHp,
    rerolls: o.rerolls ?? 0,
    used: [],
    drafts: 0,
    unlocked: o.unlocked ?? [],
    base: o.base ?? { dashCharges: 0, dashRechargeMul: 1, chalkMul: 1 },
    totals: { kills: 0, damageDealt: 0, damageTaken: 0, rodDamage: 0, lineDamage: 0, whips: 0, discharges: 0, sheetsCleared: 0, benchmarks: 0, time: 0 },
    over: null,
    rolls: 0,
  };
  run.bag = zoneBag(run, 'bluefen', [nonCombatSplit(seed)[0]]);
  if (!o.tutorial) takeFirstCombat(run);
  if (o.startHead) {
    run.kit.heads[0] = o.startHead;
    run.kit.owned[o.startHead] = 1;
  }
  return run;
}

/** The first sheet of a run is always an ordinary fight. */
function takeFirstCombat(run: RunState): void {
  const i = run.bag.findIndex((s) => s.kind === 'combat' && !s.elite);
  run.slot = run.bag.splice(i >= 0 ? i : 0, 1)[0];
}

// ---------------------------------------------------------------- rooms

function pickTemplate(run: RunState, content: ContentRegistry, kind: RoomKind, zone: ZoneId): RoomTemplate {
  const all = content.rooms.filter((t) => t.kind === kind && t.zone === zone);
  const anyZone = all.length ? all : content.rooms.filter((t) => t.kind === kind);
  if (anyZone.length === 0) throw new Error(`No room template for ${kind} in ${zone}`);
  const fresh = anyZone.filter((t) => !run.used.includes(t.id));
  const pool = fresh.length ? fresh : anyZone;
  const t = rngFor(run, 'template').pick(pool);
  run.used.push(t.id);
  return t;
}

/** Build the world for the run's current room. */
export function enterRoom(run: RunState, content: ContentRegistry): World {
  const kind = run.slot.kind;
  const template = pickTemplate(run, content, kind, run.zone);
  const room = buildRoom(template);
  room.zone = run.zone;
  const w = createWorld(room, `${run.seed}/room/${run.sheet}/${run.rolls}`, content, {
    sheet: Math.max(1, run.sheet),
    kit: run.kit,
    chalk: run.chalk,
    base: run.base,
    flow: createFlow(run.slot, Math.max(1, run.sheet)),
  });
  w.player.maxHp = run.maxHp;
  w.player.hp = Math.min(run.hp, run.maxHp);
  if (kind === 'shop' || kind === 'rest' || kind === 'event') {
    w.flow.interactables.push({ id: w.nextId++, kind, x: room.rewardSpot.x, y: room.rewardSpot.y, radius: 1.5, index: 0, active: true, auto: false });
    openDoors(w, doorOptions(run));
  } else if (kind === 'tutorial') {
    w.flow.phase = 'open';
    openDoors(w, [{ kind: 'combat', elite: false }]);
  }
  return w;
}

/** Copy what persists out of a finished room. */
export function leaveRoom(run: RunState, w: World): void {
  run.hp = w.player.hp;
  run.chalk = w.chalk;
  const t = run.totals;
  t.kills += w.stats.kills;
  t.damageDealt += w.stats.damageDealt;
  t.damageTaken += w.stats.damageTaken;
  t.rodDamage += w.stats.rodDamage;
  t.lineDamage += w.stats.lineDamage;
  t.whips += w.stats.whips;
  t.discharges += w.stats.discharges;
  t.time += w.time;
  // a one-room handicap ends with the room
  if (w.flow.handicap) clearHandicap(run, w);
}

/**
 * The rooms the doors may lead to after the current one: up to two different choices from the
 * zone's bag, the boss when the bag is empty, or nothing when the run is over.
 */
export function doorOptions(run: RunState): RoomSlot[] {
  if (run.slot.kind === 'boss') return [];
  if (run.slot.kind === 'tutorial') return [{ kind: 'combat', elite: false }];
  if (run.bag.length === 0) {
    if (run.slot.kind === 'miniboss') return zoneTwoOptions(run);
    return [{ kind: run.zone === 'bluefen' ? 'miniboss' : 'boss', elite: false }];
  }
  let pool = run.bag.slice();
  // never two quiet rooms in a row, while a fight is still available
  const quiet = (k: RoomKind): boolean => k !== 'combat';
  if (quiet(run.slot.kind) && pool.some((s) => !quiet(s.kind))) pool = pool.filter((s) => !quiet(s.kind));
  // the rest stop is not the first room of its zone
  if (run.sheet === MINIBOSS_SHEET && pool.some((s) => s.kind !== 'rest')) pool = pool.filter((s) => s.kind !== 'rest');
  // offer two distinct kinds when possible
  const rng = new Rng(`${run.seed}/doors/${run.sheet}`);
  rng.shuffle(pool);
  const out: RoomSlot[] = [pool[0]];
  const key = (s: RoomSlot): string => `${s.kind}:${s.elite}`;
  const other = pool.find((s) => key(s) !== key(pool[0]));
  if (other) out.push(other);
  return out;
}

function zoneTwoOptions(run: RunState): RoomSlot[] {
  // Peek at what zone 2 will offer first, without changing the run.
  const bag = zoneBag(run, 'unruled', ['rest', nonCombatSplit(run.seed)[1]]);
  const first = bag.filter((s) => s.kind === 'combat' && !s.elite);
  return [first[0] ?? bag[0]];
}

/** Go through a door. `choice` indexes doorOptions(run). */
export function chooseDoor(run: RunState, choice: number): void {
  const options = doorOptions(run);
  if (options.length === 0) return;
  const picked = options[Math.max(0, Math.min(options.length - 1, choice))];
  run.lastKind = run.slot.kind;
  if (run.slot.kind === 'tutorial') {
    run.sheet = 1;
    takeFirstCombat(run);
    return;
  }
  if (run.slot.kind !== 'shop' && run.slot.kind !== 'rest' && run.slot.kind !== 'event') run.totals.sheetsCleared++;
  if (run.slot.kind === 'miniboss') {
    run.zone = 'unruled';
    run.bag = zoneBag(run, 'unruled', ['rest', nonCombatSplit(run.seed)[1]]);
  }
  run.sheet++;
  if (picked.kind === 'miniboss' || picked.kind === 'boss') {
    run.slot = picked;
    return;
  }
  const i = run.bag.findIndex((s) => s.kind === picked.kind && s.elite === picked.elite);
  run.slot = run.bag.splice(i >= 0 ? i : 0, 1)[0];
}

/** Benchmarks earned so far this run: 1 per sheet cleared, 5 for the mini-boss, 10 for the final boss. */
export function benchmarksFor(run: RunState): number {
  let n = run.totals.sheetsCleared;
  if (run.sheet > MINIBOSS_SHEET || (run.sheet === MINIBOSS_SHEET && run.over === 'victory')) n += 4; // the mini-boss sheet itself counted 1
  if (run.over === 'victory') n += 9;
  return n;
}

// ---------------------------------------------------------------- drafts

export interface DraftOffer {
  id: string;
  /** The rank the player would hold after taking it. */
  rank: number;
  how: 'new' | 'rank' | 'swap';
  /** The Splice this Head would complete, or null. */
  completes: string | null;
  rare: boolean;
}

const RARITY_WEIGHT = { common: 10, uncommon: 6, rare: 2.5 } as const;

function offerable(run: RunState, w: World): InstrumentDef[] {
  return Object.values(w.content.instruments)
    .filter((d) => !d.locked || run.unlocked.includes(d.id))
    .filter((d) => (run.kit.owned[d.id] ?? 0) < d.maxRank)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

function toOffer(run: RunState, w: World, d: InstrumentDef): DraftOffer {
  const have = run.kit.owned[d.id] ?? 0;
  const bare = w.lines.stakes.some((_s, i) => !run.kit.heads[i]);
  const how: DraftOffer['how'] = have > 0 ? 'rank' : d.kind === 'head' && !bare ? 'swap' : 'new';
  return { id: d.id, rank: have + 1, how, completes: d.kind === 'head' && have === 0 ? spliceWith(w, d.id) : null, rare: d.rarity === 'rare' };
}

/**
 * Three offers (fewer only if the pool is nearly spent). Rules:
 *  - the first draft of a run includes a Head;
 *  - every offer includes an Order when one is available;
 *  - once every stake carries a Head, at most one new Head appears, as an explicit swap;
 *  - Heads that would complete a Splice are favoured;
 *  - `guaranteeRare` puts in the best thing available (elite rooms, the mini-boss, the event).
 */
export function rollDraft(run: RunState, w: World, guaranteeRare = false, count = 3): DraftOffer[] {
  const rng = rngFor(run, 'draft');
  const pool = offerable(run, w);
  const stakesFull = !w.lines.stakes.some((_s, i) => !run.kit.heads[i]);
  const picked: InstrumentDef[] = [];
  const take = (d: InstrumentDef | undefined): void => {
    if (d && !picked.includes(d) && picked.length < count) picked.push(d);
  };
  const weight = (d: InstrumentDef): number => {
    let wgt: number = RARITY_WEIGHT[d.rarity];
    if (d.kind === 'head' && !run.kit.owned[d.id] && spliceWith(w, d.id)) wgt *= 2.5;
    if (run.kit.owned[d.id]) wgt *= 1.3; // rank-ups come up a little more
    return wgt;
  };
  const newHeads = pool.filter((d) => d.kind === 'head' && !run.kit.owned[d.id]);
  const orders = pool.filter((d) => d.kind === 'order');

  if (guaranteeRare) {
    const rares = pool.filter((d) => d.rarity === 'rare');
    const uncommon = pool.filter((d) => d.rarity === 'uncommon');
    take(rares.length ? rng.pick(rares) : uncommon.length ? rng.pick(uncommon) : undefined);
  }
  if (run.drafts === 0 && newHeads.length) take(rng.weighted(newHeads, weight));
  if (orders.length && !picked.some((d) => d.kind === 'order')) take(rng.weighted(orders, weight));
  let guard = 0;
  while (picked.length < count && guard++ < 60) {
    const rest = pool.filter((d) => {
      if (picked.includes(d)) return false;
      if (stakesFull && d.kind === 'head' && !run.kit.owned[d.id] && picked.some((x) => x.kind === 'head' && !run.kit.owned[x.id])) return false;
      return true;
    });
    if (rest.length === 0) break;
    take(rng.weighted(rest, weight));
  }
  return picked.map((d) => toOffer(run, w, d));
}

/** Take a draft offer. For a swap, `stake` says which stake's Head is replaced. Returns Chalk refunded. */
export function takeOffer(run: RunState, w: World, offer: DraftOffer, stake = 0): number {
  let refund = 0;
  if (offer.how === 'swap') {
    if (swapHead(w, stake, offer.id)) refund = 15;
  } else {
    grantInstrument(w, offer.id);
  }
  w.chalk += refund;
  run.chalk = w.chalk;
  run.drafts++;
  return refund;
}

// ---------------------------------------------------------------- shop

export interface ShopItem {
  kind: 'instrument' | 'ration' | 'reroll';
  offer: DraftOffer | null;
  price: number;
  sold: boolean;
}

const PRICE = { common: 40, uncommon: 60, rare: 90 } as const;
export const RATION_HEAL = 30;

export function rollShop(run: RunState, w: World): ShopItem[] {
  const offers = rollDraft(run, w, false, 3);
  run.drafts = Math.max(run.drafts, 1); // a shop visit never counts as "the first draft"
  const items: ShopItem[] = offers.map((o) => ({ kind: 'instrument', offer: o, price: PRICE[w.content.instruments[o.id].rarity], sold: false }));
  items.push({ kind: 'ration', offer: null, price: 40, sold: false });
  items.push({ kind: 'reroll', offer: null, price: 20, sold: false });
  return items;
}

/** Buy an item. Returns false if it cannot be afforded or used. For a swap, `stake` picks the stake. */
export function buy(run: RunState, w: World, items: ShopItem[], index: number, stake = 0): boolean {
  const it = items[index];
  if (!it || it.sold || w.chalk < it.price) return false;
  if (it.kind === 'ration') {
    if (w.player.hp >= w.player.maxHp) return false;
    w.player.hp = Math.min(w.player.maxHp, w.player.hp + RATION_HEAL);
    it.sold = true;
  } else if (it.kind === 'reroll') {
    const fresh = rollShop(run, w).filter((x) => x.kind === 'instrument');
    let k = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'instrument' && !items[i].sold && fresh[k]) items[i] = fresh[k++];
    }
    it.price += 10; // each reroll costs a little more
  } else if (it.offer) {
    w.chalk -= it.price;
    takeOffer(run, w, it.offer, stake);
    run.chalk = w.chalk;
    it.sold = true;
    return true;
  }
  w.chalk -= it.price;
  run.chalk = w.chalk;
  return true;
}

/** Free in the shop: exchange the Heads on two stakes. */
export function rearrangeHeads(w: World, a: number, b: number): void {
  exchangeHeads(w, a, b);
}

// ---------------------------------------------------------------- rest

export const REST_HEAL = 0.35;
export const REST_MAXHP = 10;

export type RestChoice = { kind: 'heal' } | { kind: 'rank'; head: string } | { kind: 'maxHp' };

/** What the Trig Pillar offers: always a heal; a rank-up per Head that can still rank up; max health if there is none. */
export function restChoices(run: RunState, w: World): RestChoice[] {
  const out: RestChoice[] = [{ kind: 'heal' }];
  let ranks = 0;
  for (const h of run.kit.heads) {
    if (!h) continue;
    const d = w.content.instruments[h];
    if (d && (run.kit.owned[h] ?? 0) < d.maxRank) {
      out.push({ kind: 'rank', head: h });
      ranks++;
    }
  }
  if (ranks === 0) out.push({ kind: 'maxHp' });
  return out;
}

export function takeRest(run: RunState, w: World, c: RestChoice): void {
  const p = w.player;
  if (c.kind === 'heal') p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * REST_HEAL));
  else if (c.kind === 'maxHp') {
    run.maxHp += REST_MAXHP;
    p.maxHp = run.maxHp;
    p.hp += REST_MAXHP;
  } else grantInstrument(w, c.head);
  run.hp = p.hp;
}

// ---------------------------------------------------------------- the risk event

/** Accept the Disputed Claim: take a handicap for this room and fight elites for a rare draft and double Chalk. */
export function acceptClaim(run: RunState, w: World, id: HandicapId): void {
  w.flow.handicap = id;
  if (id === 'shortChain') w.lines.rules.linkRange *= 0.5;
  else if (id === 'slackLine') {
    for (const l of w.lines.lines) l.ripenTime = Infinity;
    w.lines.rules.ripenTime = Infinity;
  } else if (id === 'twoStakes') setStakeCount(w.lines, 2);
  w.flow.clearBonus *= 2;
  startFight(w, 2, true);
  void run;
}

function clearHandicap(run: RunState, w: World): void {
  w.flow.handicap = null;
  // rebuilding the kit restores every rule the handicap bent
  rebuildKit(w);
  void run;
}

/** A handicap must survive kit rebuilds that happen mid-fight (taking a rank-up cannot lift it). */
export function reapplyHandicap(w: World): void {
  const id = w.flow.handicap as HandicapId | null;
  if (!id) return;
  if (id === 'shortChain') w.lines.rules.linkRange = Math.min(w.lines.rules.linkRange, 4.5);
  else if (id === 'slackLine') for (const l of w.lines.lines) l.ripenTime = Infinity;
  else if (id === 'twoStakes') setStakeCount(w.lines, 2);
}
