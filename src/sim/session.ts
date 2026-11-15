// The session: everything that is shared between the laptops of one game, and the only thing
// that changes it. A session is advanced by `stepSession(session, bundle, content)`, one tick
// per bundle. A bundle holds every player's input for that tick and any commands (pause,
// restart); it is the same on every laptop, so the sessions stay identical.
//
// The session owns the run: the route of twelve chambers planned from the seed (run.ts), the
// chamber the party is in, and what each player carries from one chamber into the next. It
// holds one world per place the players are. When the last chamber is cleared the run is won;
// when the whole party is down it is lost; either way it waits for someone to start again.
import { spawnEnemy } from './ai';
import { cleanBoons, noBoons } from './boons';
import type { Boons } from './boons';
import { CAMP, atCamp, buy, noCamp, openCamp, rest } from './camp';
import type { CampSeat } from './camp';
import { standing } from './combat';
import type { ContentRegistry } from './defs';
import { DRAFT_TICKS, newDraft, rollOffers } from './draft';
import type { Draft } from './draft';
import { grantTuning } from './player';
import { buildRoom, randomFloorPoint } from './room';
import { generateRoom } from './roomgen';
import { flowFor, planRoute, roomSpec } from './run';
import type { Stop } from './run';
import { WAGER, discord, lift, noWager, offer, onTable, stepTable, vote } from './wager';
import type { Wager } from './wager';
import { PLAYER, REVIVE, SIM_HZ } from './tuning';
import { emptyInput } from './types';
import type { ClassId, InputFrame, World } from './types';
import { createWorld, stepWorld } from './world';
import type { Entrant } from './world';

export const MAX_PLAYERS = 3;

export interface PlayerSetup {
  name: string;
  classId: ClassId;
  /** What they bring from the Attunement (boons.ts). The session cleans it; without it they bring nothing. */
  boons?: Boons;
}

/** Fixed when the session is created; never changes during it. */
export interface SessionConfig {
  seed: string;
  players: PlayerSetup[];
  /** Identifies the build of the game; laptops running different builds must not play together. */
  buildId: string;
  /** Ticks between a press and its effect, as measured in the lobby (0 alone). Widens timing windows. */
  inputDelay: number;
  /** Development: keep this many enemies alive and nobody can be hurt. 0 = off. */
  stress: number;
  /**
   * The practice ladder instead of a run: waves without end in the hand-built rooms, deeper each
   * time, and the party simply starts over when it goes down.
   */
  practice?: boolean;
  /** Development: begin the run at this chamber (1 to 12) instead of the first. */
  startAt?: number;
}

/**
 * Everything a player can decide outside their hands. 'pause' stops the game for everyone or
 * lets it go on (`a` 1 stops it, 2 lets it go on, 0 changes whichever it is); 'restart' begins a
 * new run at once. 'pick' takes card `a` (0, 1 or 2) of the
 * player's draft; 'reroll' deals their cards again, if they have a reroll left. At a camp
 * (camp.ts): 'buy' takes thing `a` from the Tuner, 'rest' takes thing `a` from the Still Pool,
 * and 'ready' says whether the player is ready to leave (`a` 1 or 0). Once a run is over, 'ready'
 * says instead whether the player is ready for the next: it begins when everyone is. 'wager'
 * answers the Wager (wager.ts): `a` 1 takes it, 0 walks on.
 */
export const COMMAND_KINDS = ['pause', 'restart', 'pick', 'reroll', 'buy', 'rest', 'ready', 'wager'] as const;
export type CommandKind = (typeof COMMAND_KINDS)[number];

/** Something a player decided, outside moment-to-moment input. Applied in the order the bundle lists them. */
export interface Command {
  slot: number;
  /** Per-player counter, so a command delivered twice is applied once. */
  seq: number;
  kind: CommandKind;
  a: number;
}

export interface Bundle {
  tick: number;
  /** Indexed by slot. A missing entry means that seat stands idle this tick. */
  inputs: Array<InputFrame | undefined>;
  cmds: Command[];
}

/** 'run': being played. 'won': the last chamber was cleared. 'lost': the whole party went down. */
export type RunPhase = 'run' | 'won' | 'lost';

/** What a run added up to, for the results and the records. */
export interface RunStats {
  /** Chambers cleared. */
  chambers: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  /** Returns landed, and the highest Rally anyone reached. */
  returns: number;
  bestRally: number;
}

export interface Session {
  config: SessionConfig;
  /** Ticks stepped since the session began, pauses included. */
  tick: number;
  /** The slot that paused the game for everyone, or -1. */
  pausedBy: number;
  /** How many times the party has started over. */
  attempt: number;
  /** The chambers of this attempt, in order. Empty on the practice ladder. */
  route: Stop[];
  /** Index into `route` of the chamber the party is in. */
  stop: number;
  phase: RunPhase;
  /** Ticks since the run was won or lost. */
  endedFor: number;
  /** Ticks this attempt has been played: pauses and the time after its end are not counted. */
  played: number;
  /** Once the run is over: for each slot, whether that player is ready for the next. */
  again: boolean[];
  /** What the chambers already left added up to. The chamber being played is added when it is left. */
  totals: RunStats;
  /** One world per place the players are. */
  worlds: World[];
  /** For each slot, the index into `worlds` of the world that player is in. */
  where: number[];
  /** The highest command sequence number applied for each slot. */
  lastSeq: number[];
  /** Ticks since every player went down, or -1. The run is lost when it runs out. */
  downFor: number;
  /** Ticks since the current chamber was cleared, or -1. */
  clearFor: number;
  /** For each slot, the Tunings that player is being offered (draft.ts). */
  drafts: Draft[];
  /** For each slot, what that player has in front of them at a camp (camp.ts). */
  camps: CampSeat[];
  /** Ticks since the first of the party said they were ready to leave a camp, or -1. */
  campFor: number;
  /** The Wager: whether it is on the table, what everyone has said, and whether the party is carrying it (wager.ts). */
  wager: Wager;
}

/** Ticks the world plays on after the whole party is down, before the run is called lost. */
const DOWN_BEAT = Math.round(2.4 * SIM_HZ);
/** Ticks of quiet after a chamber is cleared before the party walks on. */
const CLEAR_BEAT = Math.round(3 * SIM_HZ);

const noStats = (): RunStats => ({ chambers: 0, kills: 0, damageDealt: 0, damageTaken: 0, returns: 0, bestRally: 0 });

/** What a player brings to every run. */
const boonsOf = (s: Session, slot: number): Boons => s.config.players[slot]?.boons ?? noBoons();

/** Everyone as they are at the start of a run: with what the Attunement gives them, and nothing else. */
const fresh = (s: Session): Entrant[] =>
  s.config.players.map((p, slot) => {
    const b = boonsOf(s, slot);
    return { slot, classId: p.classId, maxHp: PLAYER.maxHp + b.health, chimes: b.chimes, tunings: b.issued ? { [b.issued]: 1 } : {}, boons: b };
  });

/** The chamber of the stop the party is at, built by the generator from the seed. */
function openStop(s: Session, content: ContentRegistry, entrants: Entrant[]): World {
  const stop = s.route[s.stop];
  const seed = `${s.config.seed}/${s.attempt}/${stop.n}`;
  const room = buildRoom(generateRoom(seed, roomSpec(stop)));
  return createWorld(room, seed, content, { chamber: stop.n, entrants, flow: flowFor(stop, entrants.length, content), inputDelay: s.config.inputDelay });
}

/** A chamber of the practice ladder: the hand-built rooms, taken in turn. */
function openPractice(s: Session, content: ContentRegistry, chamber: number, entrants: Entrant[]): World {
  const template = content.rooms[(Math.max(1, chamber) - 1) % Math.max(1, content.rooms.length)];
  if (!template) throw new Error('The content has no rooms');
  return createWorld(buildRoom(template), `${s.config.seed}/${s.attempt}/${chamber}`, content, { chamber, entrants, inputDelay: s.config.inputDelay });
}

/** Begin an attempt: plan its route and put fresh characters in its first chamber. */
function begin(s: Session, content: ContentRegistry): void {
  s.route = s.config.practice ? [] : planRoute(`${s.config.seed}/${s.attempt}`);
  s.stop = Math.max(0, Math.min(s.route.length - 1, Math.round(s.config.startAt ?? 1) - 1));
  s.phase = 'run';
  s.endedFor = 0;
  s.played = 0;
  s.again = s.config.players.map(() => false);
  s.totals = noStats();
  s.downFor = -1;
  s.clearFor = -1;
  s.pausedBy = -1;
  s.drafts = s.config.players.map((_, slot) => newDraft(boonsOf(s, slot).rerolls));
  s.wager = noWager(s.config.players.length);
  s.worlds = [s.config.practice ? openPractice(s, content, 1, fresh(s)) : openStop(s, content, fresh(s))];
  s.where = s.config.players.map(() => 0);
  arrive(s, content);
}

/** The party has walked into a chamber. If it is a camp, the Tuner sets out a shelf for each of them. */
function arrive(s: Session, content: ContentRegistry): void {
  const w = s.worlds[0];
  const camp = w.flow.kind === 'camp';
  // a Wager taken in the last chamber is played out in this one
  s.wager.decided = false;
  if (s.wager.on) discord(w, s.wager);
  s.campFor = -1;
  s.camps = s.config.players.map((_, slot) => {
    const p = w.players.find((q) => q.slot === slot);
    return camp && p ? openCamp(`${s.config.seed}/${s.attempt}/camp/${s.stop}/${slot}`, p, content) : noCamp();
  });
}

export function createSession(config: SessionConfig, content: ContentRegistry): Session {
  if (config.players.length < 1 || config.players.length > MAX_PLAYERS) throw new Error(`A session has 1 to ${MAX_PLAYERS} players`);
  const s: Session = {
    // what each player brings is held to what the Attunement can give, the same on every laptop
    config: { ...config, players: config.players.map((p) => ({ ...p, boons: cleanBoons(p.boons, p.classId, content) })) },
    tick: 0,
    pausedBy: -1,
    attempt: 0,
    route: [],
    stop: 0,
    phase: 'run',
    endedFor: 0,
    played: 0,
    again: [],
    totals: noStats(),
    worlds: [],
    where: [],
    lastSeq: config.players.map(() => 0),
    downFor: -1,
    clearFor: -1,
    drafts: [],
    camps: [],
    campFor: -1,
    wager: noWager(config.players.length),
  };
  begin(s, content);
  return s;
}

/** The world a player is in. */
export const worldOf = (s: Session, slot: number): World => s.worlds[s.where[slot] ?? 0];

/** The stop the party is at, or null on the practice ladder. */
export const stopOf = (s: Session): Stop | null => s.route[s.stop] ?? null;

/** What the run adds up to at this moment: the chambers left behind, and the one being played. */
export function runSoFar(s: Session): RunStats {
  const t = { ...s.totals };
  // once the run has ended, its last chamber is already in the totals
  if (s.phase === 'run') for (const w of s.worlds) bank(t, w, false);
  return t;
}

function bank(t: RunStats, w: World, cleared: boolean): void {
  if (cleared) t.chambers++;
  t.kills += w.stats.kills;
  t.damageDealt += w.stats.damageDealt;
  t.damageTaken += w.stats.damageTaken;
  t.returns += w.stats.returns;
  t.bestRally = Math.max(t.bestRally, w.stats.bestRally);
}

function applyCommand(s: Session, c: Command, content: ContentRegistry): void {
  if (c.slot < 0 || c.slot >= s.config.players.length) return;
  if (c.seq <= s.lastSeq[c.slot]) return;
  s.lastSeq[c.slot] = c.seq;
  if (c.kind === 'pause') {
    // anyone can pause for everyone, and anyone can lift it
    if (c.a === 1) {
      if (s.pausedBy < 0) s.pausedBy = c.slot;
    } else if (c.a === 2) s.pausedBy = -1;
    else s.pausedBy = s.pausedBy >= 0 ? -1 : c.slot;
  } else if (c.kind === 'restart') {
    restart(s, content);
  } else if (c.kind === 'pick') {
    pick(s, c.slot, c.a, content);
  } else if (c.kind === 'reroll') {
    const d = s.drafts[c.slot];
    if (d && d.offers.length > 0 && d.rerolls > 0) {
      d.rerolls--;
      d.rolled++;
      deal(s, content, c.slot);
    }
  } else if (c.kind === 'wager') {
    if (s.phase === 'run') vote(s.wager, c.slot, c.a);
  } else if (c.kind === 'ready' && s.phase !== 'run') {
    // the run is over: this is who is ready for the next
    s.again[c.slot] = c.a !== 0;
  } else {
    // the rest are asked of a camp, and mean nothing anywhere else
    const seat = s.camps[c.slot];
    const w = worldOf(s, c.slot);
    const p = w.players.find((q) => q.slot === c.slot);
    if (!p || s.phase !== 'run' || !atCamp(seat)) return;
    if (c.kind === 'buy') buy(w, p, seat, c.a, `${s.config.seed}/${s.attempt}/camp/${s.stop}/${c.slot}`);
    else if (c.kind === 'rest') rest(w, p, seat, c.a);
    else if (c.kind === 'ready') seat.ready = c.a !== 0;
  }
}

/** Deal a player's cards from the seed, the chamber, their seat and how often they have asked again. */
function deal(s: Session, content: ContentRegistry, slot: number): void {
  const d = s.drafts[slot];
  const p = worldOf(s, slot).players.find((q) => q.slot === slot);
  if (!d || !p) return;
  const seed = `${s.config.seed}/${s.attempt}/draft/${s.stop}/${slot}/${d.made}/${d.rolled}`;
  d.offers = rollOffers(seed, p.classId, p.tunings, content, d.made, d.rare, p.boons.unlocked);
  d.timer = d.offers.length > 0 ? DRAFT_TICKS : 0;
}

/** A cleared fight pays every player a choice of Tunings. A camp does not, and after the last chamber there is nothing left to build for. */
function openDrafts(s: Session, content: ContentRegistry, w: World): void {
  const kind = w.flow.kind;
  if (kind === 'camp' || kind === 'boss') return;
  for (const p of w.players) {
    const d = s.drafts[p.slot];
    d.rare = kind === 'elite' || kind === 'miniboss';
    d.rolled = 0;
    // a Wager won pays a second card
    d.owed = w.flow.discord ? WAGER.cards : 0;
    deal(s, content, p.slot);
  }
}

/** Take a card. Ignored unless that card is on that player's table, so a pick sent twice does nothing the second time. */
function pick(s: Session, slot: number, index: number, content: ContentRegistry): void {
  const d = s.drafts[slot];
  const id = d ? d.offers[index] : undefined;
  if (!d || id === undefined) return;
  const w = worldOf(s, slot);
  const p = w.players.find((q) => q.slot === slot);
  if (!p) return;
  grantTuning(w, p, id);
  d.offers = [];
  d.timer = 0;
  d.made++;
  if (d.owed > 0) {
    // another card is owed: a rare one, dealt at once
    d.owed--;
    d.rare = true;
    d.rolled = 0;
    deal(s, content, slot);
  }
}

/** Start over: a new route, the first chamber, fresh characters. */
function restart(s: Session, content: ContentRegistry): void {
  s.attempt++;
  begin(s, content);
}

/**
 * What everyone walks into the next chamber with. The fallen stand up again, and Chimes still
 * lying on the floor come along.
 */
function carry(w: World): Entrant[] {
  const lying = w.flow.pickups.reduce((sum, c) => sum + c.value, 0);
  return w.players.map((p) => {
    const hp = standing(p) ? p.hp : Math.max(1, Math.round(p.maxHp * REVIVE.hp));
    return { slot: p.slot, classId: p.classId, maxHp: p.maxHp, hp, chimes: p.chimes + lying, tunings: p.tunings, boons: p.boons };
  });
}

/** The chamber is cleared and the quiet after it is over: on to the next stop, or the run is won. */
function advance(s: Session, content: ContentRegistry): void {
  const w = s.worlds[0];
  bank(s.totals, w, true);
  if (s.stop >= s.route.length - 1) {
    s.phase = 'won';
    s.endedFor = 0;
    return;
  }
  s.stop++;
  s.worlds[0] = openStop(s, content, carry(w));
  arrive(s, content);
}

/** Advance the whole session by exactly one tick. */
export function stepSession(s: Session, bundle: Bundle, content: ContentRegistry): void {
  s.tick++;
  for (const c of bundle.cmds) applyCommand(s, c, content);
  if (s.pausedBy >= 0) return;
  // a run that has ended stands still until everyone is ready for the next (or someone starts it outright)
  if (s.phase !== 'run') {
    s.endedFor++;
    if (s.again.length > 0 && s.again.every((ready) => ready)) restart(s, content);
    return;
  }
  s.played++;

  const idle = emptyInput();
  for (const w of s.worlds) {
    if (s.config.stress > 0) {
      // Stress scene: a constant crowd, and nobody can be hurt.
      for (const p of w.players) p.hp = p.maxHp;
      const kinds = Object.keys(content.enemies).sort();
      while (w.enemies.length < s.config.stress) {
        // one of each kind in turn
        const def = content.enemies[kinds[w.enemies.length % kinds.length]];
        const at = randomFloorPoint(w.room, w.rng, 0.5, w.players[0], 3);
        spawnEnemy(w, def, at.x, at.y);
      }
    }
    stepWorld(w, bundle.inputs, idle);
  }

  const w = s.worlds[0];
  if (s.config.stress === 0 && w.flow.phase === 'cleared') {
    if (s.clearFor < 0) {
      s.clearFor = 0;
      if (!s.config.practice) openDrafts(s, content, w);
      // a wagered chamber is beaten: the Discord lifts
      if (s.wager.on && w.flow.discord) lift(w, s.wager);
    } else {
      s.clearFor++;
    }
    // whoever is still looking at their cards when the time is up is given the first
    for (const d of s.drafts) {
      if (d.offers.length === 0) continue;
      d.timer--;
      if (d.timer <= 0) pick(s, s.drafts.indexOf(d), 0, content);
    }
    const chosen = s.drafts.every((d) => d.offers.length === 0);
    // A camp is left when everyone is ready; once the first is, the others have a while and no longer.
    let stay = false;
    if (s.camps.some(atCamp)) {
      if (s.campFor >= 0) s.campFor++;
      else if (s.camps.some((c) => c.ready)) s.campFor = 0;
      stay = !s.camps.every((c) => c.ready) && s.campFor < CAMP.wait;
    }
    // The chamber before an elite's: once the cards are taken, the Wager is put to the party, once.
    if (w.flow.kind === 'wager' && !s.wager.decided) {
      if (!onTable(s.wager) && chosen && s.clearFor >= CLEAR_BEAT) offer(s.wager);
      else stepTable(s.wager);
      stay = stay || !s.wager.decided;
    }
    // the party walks on once the quiet is over and everyone has chosen
    if (s.clearFor >= CLEAR_BEAT && !stay && chosen) {
      s.clearFor = -1;
      // Everyone walks on with what they have, and the fallen stand up again.
      if (s.config.practice) s.worlds[0] = openPractice(s, content, w.chamber + 1, carry(w));
      else advance(s, content);
    }
  }

  // Everyone down: the world plays on for a beat, then the run is lost (the practice ladder just starts over).
  if (s.phase === 'run' && s.worlds.every((world) => !world.players.some(standing))) {
    s.downFor = s.downFor < 0 ? 0 : s.downFor + 1;
    if (s.downFor >= DOWN_BEAT) {
      if (s.config.practice) restart(s, content);
      else {
        bank(s.totals, s.worlds[0], false);
        s.phase = 'lost';
        s.endedFor = 0;
      }
    }
  } else {
    s.downFor = -1;
  }
}
