// Plays whole rooms and whole runs headless: a bot supplies the moment-to-moment input, and a
// simple policy answers the choices between fights (which offer, which door, what to buy).
// Tests, balance sweeps and the in-browser autopilot all use this, so they exercise the same
// rules a player meets.
import type { Bot } from './bots';
import type { ContentRegistry } from './defs';
import type { Interactable } from './flow';
import { acceptClaim, buy, chooseDoor, doorOptions, enterRoom, leaveRoom, restChoices, rollDraft, rollShop, takeOffer, takeRest } from './run';
import type { DraftOffer, RunState } from './run';
import { DT } from './tuning';
import type { InputFrame, World } from './types';
import { stepWorld } from './world';

export interface ChoicePolicy {
  /** Index of the offer to take. */
  draft(offers: DraftOffer[], run: RunState, w: World): number;
  /** Index of the door to take. */
  door(options: ReturnType<typeof doorOptions>, run: RunState): number;
  /** Take the risk event? Returns a handicap id, or null to walk past. */
  claim(run: RunState): 'shortChain' | 'slackLine' | 'twoStakes' | null;
}

/** Sensible defaults: prefer Splice-completing Heads, then new things; rest when hurt; skip the wager. */
export const steadyPolicy: ChoicePolicy = {
  draft(offers) {
    let best = 0;
    let score = -1;
    offers.forEach((o, i) => {
      const s = (o.completes ? 4 : 0) + (o.how === 'new' ? 2 : o.how === 'rank' ? 1.5 : 0) + (o.rare ? 1 : 0);
      if (s > score) {
        score = s;
        best = i;
      }
    });
    return best;
  },
  door(options, run) {
    // rest when hurt, shop when rich, otherwise fight
    const hurt = run.hp < run.maxHp * 0.55;
    const want = hurt ? 'rest' : run.chalk >= 60 ? 'shop' : 'combat';
    const i = options.findIndex((o) => o.kind === want);
    return i >= 0 ? i : 0;
  },
  claim() {
    return null;
  },
};

export interface RoomResult {
  outcome: 'cleared' | 'dead' | 'timeout';
  ticks: number;
}

function walkTo(w: World, f: InputFrame, x: number, y: number): void {
  const p = w.player;
  const dx = x - p.x;
  const dy = y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  f.moveX = dx / d;
  f.moveY = dy / d;
  f.attackPressed = false;
  f.attackHeld = false;
  f.specialPressed = false;
  f.stakePressed = false;
  f.dashPressed = false;
}

/**
 * Play the run's current room to its end: fight, take the reward, use the room, and walk
 * through a door. Returns when the next room should be entered, or the player is dead.
 */
export function playRoom(run: RunState, w: World, bot: Bot, policy: ChoicePolicy, maxTicks = 60 * 240): RoomResult {
  let ticks = 0;
  let usedRoom = false;
  let doorChoice = -1;
  for (; ticks < maxTicks; ticks++) {
    const f = bot.think(w);
    const flow = w.flow;
    f.interactPressed = false;

    if (flow.phase !== 'fight' && w.player.state !== 'dead') {
      // Out of combat the bot stops fighting and walks to what needs doing.
      let target: Interactable | undefined = flow.interactables.find((i) => i.active && i.kind === 'reward');
      if (!target && !usedRoom) target = flow.interactables.find((i) => i.active && (i.kind === 'shop' || i.kind === 'rest' || i.kind === 'event'));
      if (!target) {
        const doors = flow.interactables.filter((i) => i.active && i.kind === 'door');
        if (doors.length) {
          if (doorChoice < 0) doorChoice = Math.min(doors.length - 1, policy.door(flow.doors, run));
          target = doors.find((d) => d.index === doorChoice) ?? doors[0];
        }
      }
      if (target) {
        walkTo(w, f, target.x, target.y);
        if (!target.auto && Math.hypot(target.x - w.player.x, target.y - w.player.y) < target.radius * 0.8) f.interactPressed = true;
      }
    }

    stepWorld(w, f);

    for (const ev of w.events) {
      if (ev.type !== 'interact') continue;
      const it = flow.interactables.find((i) => i.id === ev.id);
      if (ev.kind === 'reward') {
        if (it) it.active = false;
        const offers = rollDraft(run, w, flow.elite || flow.kind === 'event' || flow.kind === 'miniboss');
        if (offers.length) {
          const pick = offers[Math.max(0, Math.min(offers.length - 1, policy.draft(offers, run, w)))];
          takeOffer(run, w, pick, 0);
        }
        flow.interactables = flow.interactables.filter((i) => i.kind !== 'reward');
        // doors open once the reward is taken
        if (flow.doors.length === 0) {
          run.hp = w.player.hp;
          run.chalk = w.chalk;
          const opts = doorOptions(run);
          flow.doors = opts;
          flow.phase = 'open';
          opts.forEach((_s, i) => {
            const d = w.room.doors[i % w.room.doors.length];
            flow.interactables.push({ id: w.nextId++, kind: 'door', x: d.x, y: d.y, radius: 0.75, index: i, active: true, auto: true });
          });
        }
      } else if (ev.kind === 'shop') {
        usedRoom = true;
        const items = rollShop(run, w);
        // buy the ration when hurt, then whatever instrument is affordable, dearest first
        if (w.player.hp < w.player.maxHp * 0.6) buy(run, w, items, items.findIndex((x) => x.kind === 'ration'));
        const order = items.map((x, i) => ({ x, i })).filter((e) => e.x.kind === 'instrument').sort((a, b) => b.x.price - a.x.price);
        for (const e of order) buy(run, w, items, e.i, 0);
        if (it) it.active = false;
      } else if (ev.kind === 'rest') {
        usedRoom = true;
        const choices = restChoices(run, w);
        const hurt = w.player.hp < w.player.maxHp * 0.7;
        const c = hurt ? choices[0] : choices[1] ?? choices[0];
        takeRest(run, w, c);
        if (it) it.active = false;
      } else if (ev.kind === 'event') {
        usedRoom = true;
        const id = policy.claim(run);
        if (id) acceptClaim(run, w, id);
        if (it) it.active = false;
      } else if (ev.kind === 'door') {
        w.events.length = 0;
        leaveRoom(run, w);
        chooseDoor(run, ev.index);
        return { outcome: 'cleared', ticks };
      }
    }
    w.events.length = 0;

    if (w.player.state === 'dead') {
      leaveRoom(run, w);
      run.over = 'dead';
      return { outcome: 'dead', ticks };
    }
  }
  leaveRoom(run, w);
  return { outcome: 'timeout', ticks };
}

export interface RunResult {
  outcome: 'victory' | 'dead' | 'timeout' | 'stopped';
  sheet: number;
  ticks: number;
  seconds: number;
  run: RunState;
}

/** Play a whole run, room after room, until victory, death, or `untilSheet` is reached. */
export function playRun(run: RunState, content: ContentRegistry, makeBot: () => Bot, policy: ChoicePolicy = steadyPolicy, untilSheet = 99): RunResult {
  let ticks = 0;
  for (let guard = 0; guard < 40; guard++) {
    if (run.sheet >= untilSheet) return { outcome: 'stopped', sheet: run.sheet, ticks, seconds: ticks * DT, run };
    const w = enterRoom(run, content);
    const r = playRoom(run, w, makeBot(), policy);
    ticks += r.ticks;
    if (r.outcome === 'dead') return { outcome: 'dead', sheet: run.sheet, ticks, seconds: ticks * DT, run };
    if (r.outcome === 'timeout') return { outcome: 'timeout', sheet: run.sheet, ticks, seconds: ticks * DT, run };
    if (run.over === 'victory') return { outcome: 'victory', sheet: run.sheet, ticks, seconds: ticks * DT, run };
  }
  return { outcome: 'timeout', sheet: run.sheet, ticks, seconds: ticks * DT, run };
}
