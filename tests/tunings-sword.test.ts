// The Tunings of the Sword, one test each: the same moment played without the Tuning and with it
// comes out differently, in the way the card says.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { CAIRN } from '../src/content/enemies/cairn';
import { PIPER } from '../src/content/enemies/piper';
import { HURT_NONE, damageEnemy, damagePlayer } from '../src/sim/combat';
import { grantTuning } from '../src/sim/player';
import { spawnProjectile } from '../src/sim/projectiles';
import { addRally } from '../src/sim/rally';
import { DUET, EDGE, REFLECT, SIM_HZ, SWORD, WHIRL } from '../src/sim/tuning';
import type { Enemy, Player, Projectile, SimEvent, World } from '../src/sim/types';
import { PRESS, Pad, dummy, eventsOf, openWorld, place, run } from './helpers';

/** A world with a Sword holding the given Tunings at the given ranks. */
function held(tunings: Record<string, number> = {}): { w: World; p: Player; pad: Pad } {
  const w = openWorld(['sword']);
  const p = w.players[0];
  for (const [id, rank] of Object.entries(tunings)) for (let i = 0; i < rank; i++) grantTuning(w, p, id);
  // one pad for the whole of a test: a press is a counter going up, and the first tick only looks
  const pad = new Pad();
  PADS.set(w, pad);
  run(w, 1, pad);
  w.events.length = 0;
  return { w, p, pad };
}
const PADS = new WeakMap<World, Pad>();
const padOf = (w: World): Pad => PADS.get(w) as Pad;
const speedOf = (pr: Projectile): number => Math.hypot(pr.vx, pr.vy);
const mine = (w: World): Projectile[] => w.projectiles.filter((pr) => pr.faction === 'player' && !pr.dead);
const bolt = (w: World, x: number, y: number, vx: number, vy: number, owner = 99): Projectile =>
  spawnProjectile(w, { kind: 'bolt', faction: 'enemy', owner, x, y, vx, vy, radius: 0.16, damage: 8, range: 12 });

/** A bolt flies at the player along the x axis and a swing sends it back. Stops on the tick it is turned. */
function sendBack(tunings: Record<string, number>, owner = 99, aim?: [number, number]): { w: World; p: Player; shots: Projectile[]; ev: SimEvent[] } {
  const { w, p } = held(tunings);
  const pad = padOf(w);
  if (aim) pad.aimAt(p, aim[0], aim[1]);
  run(w, 1, pad);
  bolt(w, p.x + 3, p.y, -9, 0, owner);
  pad.tap(PRESS.attack);
  const ev: SimEvent[] = [];
  for (let t = 0; t < 60 && eventsOf(ev, 'reflect').length === 0; t++) ev.push(...run(w, 1, pad));
  expect(eventsOf(ev, 'reflect').length).toBe(1);
  return { w, p, shots: mine(w), ev };
}
/** The Whirlwind, from the press to the end of the move (of `turns` turns); returns what happened. */
const whirl = (w: World, turns = 1): SimEvent[] => run(w, Math.round((WHIRL.windup + WHIRL.spin * turns + WHIRL.recovery) * SIM_HZ) + 12, padOf(w).tap(PRESS.special));
/** The Whirlwind up to the blow of its first turn. */
const whirlBlow = (w: World): SimEvent[] => run(w, Math.round(WHIRL.windup * SIM_HZ) + 2, padOf(w).tap(PRESS.special));
/** `n` Echoes standing round the player, all inside the Whirlwind. */
const ringOf = (w: World, p: Player, n: number): Enemy[] =>
  Array.from({ length: n }, (_, i) => dummy(w, p.x + 1.8 * Math.cos((i * 2 * Math.PI) / n), p.y + 1.8 * Math.sin((i * 2 * Math.PI) / n), 1000));
/** One swing at whatever stands along +x; returns the events up to the end of its blow. */
const swing = (w: World, p: Player, at: [number, number] = [p.x + 5, p.y]): SimEvent[] => run(w, 30, padOf(w).aimAt(p, at[0], at[1]).tap(PRESS.attack));

describe('Mirror Guard', () => {
  it('Clean Return: a returned shot flies faster, and goes through Echoes', () => {
    const plain = sendBack({}).shots[0];
    expect(speedOf(plain)).toBeCloseTo(REFLECT.minSpeed);
    expect(plain.pierce).toBe(0);
    for (const [rank, faster, through] of [
      [1, 1.25, 1],
      [2, 1.4, 2],
      [3, 1.55, 3],
    ]) {
      const shot = sendBack({ 'clean-return': rank }).shots[0];
      expect(speedOf(shot)).toBeCloseTo(REFLECT.minSpeed * faster);
      expect(shot.pierce).toBe(through);
    }
    // two Echoes in a line: a plain return stops in the first, a clean one strikes both
    const struck = (tunings: Record<string, number>): number[] => {
      const { w, p } = held(tunings);
      const a = dummy(w, p.x + 3.4, p.y, 500);
      const b = dummy(w, p.x + 5, p.y, 500);
      const pad = padOf(w);
      run(w, 1, pad);
      bolt(w, p.x + 2.4, p.y, -9, 0);
      run(w, 60, pad.tap(PRESS.attack));
      return [500 - a.hp, 500 - b.hp];
    };
    const one = struck({});
    const both = struck({ 'clean-return': 1 });
    expect(one[0]).toBeGreaterThan(0);
    expect(one[1]).toBe(0);
    expect(both[0]).toBeGreaterThan(0);
    expect(both[1]).toBeGreaterThan(0);
  });

  it('Wide Guard: a wider swing', () => {
    // an Echo standing just outside the plain arc of the first swing
    const reaches = (tunings: Record<string, number>): boolean => {
      const { w, p } = held(tunings);
      const d = 1.7;
      const probe = dummy(w, p.x + 5, p.y + 5, 500);
      const beyond = SWORD.halfArc[0] + Math.asin(probe.radius / d) + (5 * Math.PI) / 180;
      const e = dummy(w, p.x + Math.cos(beyond) * d, p.y + Math.sin(beyond) * d, 500);
      swing(w, p);
      return e.hp < 500;
    };
    expect(reaches({})).toBe(false);
    expect(reaches({ 'wide-guard': 1 })).toBe(true);
    // and the event that draws the swing says how wide it was
    const { w, p } = held({ 'wide-guard': 3 });
    const drawn = eventsOf(swing(w, p), 'swing')[0];
    expect(drawn.halfArc).toBeCloseTo(SWORD.halfArc[0] + (25 * Math.PI) / 180);
  });

  it('Wide Guard: what is sent back comes round to whoever fired it', () => {
    const finds = (tunings: Record<string, number>): boolean => {
      const { w, p } = held(tunings);
      // the sender stands well off the line the return is sent along
      const piper = dummy(w, p.x + 3, p.y + 4.5, 500, PIPER);
      const pad = padOf(w);
      run(w, 1, pad);
      bolt(w, p.x + 3, p.y, -9, 0, piper.id);
      run(w, 120, pad.tap(PRESS.attack));
      return piper.hp < 500;
    };
    expect(finds({})).toBe(false);
    expect(finds({ 'wide-guard': 3 })).toBe(true);
    // it turns at its own rate: it does not snap round
    const { shots } = sendBack({ 'wide-guard': 1 }, 7);
    expect(shots[0].turn).toBe(2);
  });

  it('Second Voice: a return splits into a fan, each shot a share of the whole', () => {
    const whole = sendBack({}).shots[0].damage;
    for (const [rank, count, share] of [
      [1, 2, 0.7],
      [2, 3, 0.65],
      [3, 4, 0.6],
    ]) {
      const { shots, p } = sendBack({ 'second-voice': rank });
      expect(shots.length).toBe(count);
      for (const s of shots) expect(s.damage).toBeCloseTo(whole * share);
      // spread evenly over twenty degrees about the aim
      const angles = shots.map((s) => Math.atan2(s.vy, s.vx) - p.aim).sort((a, b) => a - b);
      expect(angles[0]).toBeCloseTo(-EDGE.splitFan / 2);
      expect(angles[angles.length - 1]).toBeCloseTo(EDGE.splitFan / 2);
      expect(new Set(shots.map((s) => s.id)).size).toBe(count);
    }
    expect(sendBack({}).shots.length).toBe(1);
  });

  it('Hall of Mirrors (Clean Return and Second Voice): every shot of the fan banks once more', () => {
    expect(sendBack({ 'second-voice': 1 }).shots.every((s) => s.bounces === REFLECT.bounces)).toBe(true);
    const both = sendBack({ 'second-voice': 1, 'clean-return': 1 });
    expect(both.p.mods.hallOfMirrors).toBe(1);
    expect(both.shots.length).toBe(2);
    expect(both.shots.every((s) => s.bounces === REFLECT.bounces + 1)).toBe(true);
  });
});

describe('the Cyclone', () => {
  it('Tempered Spin: the Whirlwind reaches further, and the swings after one that hit anything are doubled', () => {
    // an Echo standing a little outside the plain reach
    const reaches = (tunings: Record<string, number>, beyond: number): boolean => {
      const { w, p } = held(tunings);
      const e = dummy(w, p.x + WHIRL.radius + beyond, p.y, 500);
      e.radius = 0;
      whirlBlow(w);
      return e.hp < 500;
    };
    expect(reaches({}, 0.2)).toBe(false);
    expect(reaches({ 'tempered-spin': 1 }, 0.2)).toBe(true);
    expect(reaches({ 'tempered-spin': 1 }, 0.4)).toBe(false);
    expect(reaches({ 'tempered-spin': 3 }, 0.6)).toBe(true);
    // and the event that draws it says how far it reached
    const wide = held({ 'tempered-spin': 3 });
    expect(eventsOf(whirlBlow(wide.w), 'whirl')[0].radius).toBeCloseTo(WHIRL.radius + 0.7);

    for (const [rank, doubled] of [
      [0, 0],
      [1, 2],
      [3, 4],
    ]) {
      const { w, p } = held(rank ? { 'tempered-spin': rank } : {});
      const e = dummy(w, p.x + 1.4, p.y, 5000);
      whirl(w);
      expect(p.buffSwings).toBe(doubled);
      // let what was thrown come down, and stand it in front of the blade again
      run(w, 60, padOf(w));
      const blows: number[] = [];
      for (let i = 0; i < 6; i++) {
        place(e, p.x + 1.4, p.y);
        e.lvx = e.lvy = 0;
        const hp = e.hp;
        // one swing at a time, each the first of its combo
        p.combo = 0;
        p.comboTimer = 0;
        swing(w, p, [e.x, e.y]);
        blows.push(hp - e.hp);
        run(w, 30, padOf(w));
      }
      expect(blows).toEqual(blows.map((_, i) => SWORD.damage[0] * (i < doubled ? 2 : 1)));
    }
    // one that met nothing doubles nothing
    const empty = held({ 'tempered-spin': 3 });
    whirl(empty.w);
    expect(empty.p.buffSwings).toBe(0);
  });

  it('Counterweight: a perfect return stuns what it strikes and marks it for everyone', () => {
    /** A bolt left to the last moment and cut back along the aim, where a Piper stands. */
    const answered = (tunings: Record<string, number>): { piper: Enemy; w: World } => {
      const { w, p } = held(tunings);
      const piper = dummy(w, p.x + 5, p.y, 1000, PIPER);
      const pad = padOf(w);
      run(w, 1, pad);
      bolt(w, p.x + 1.5, p.y, -9, 0, piper.id);
      pad.tap(PRESS.attack);
      const ev: SimEvent[] = [];
      for (let t = 0; t < 90 && !eventsOf(ev, 'hit').some((h) => h.target === piper.id); t++) ev.push(...run(w, 1, pad));
      expect(eventsOf(ev, 'reflect')[0]).toMatchObject({ perfect: true });
      expect(eventsOf(ev, 'hit').some((h) => h.target === piper.id && h.crit)).toBe(true);
      return { piper, w };
    };
    const plain = answered({}).piper;
    expect(plain.status.markT).toBe(0);
    expect(plain.state).not.toBe('stun');
    for (const [rank, stun, mark] of [
      [1, 0.6, 0.2],
      [3, 1.2, 0.4],
    ]) {
      const { piper, w } = answered({ counterweight: rank });
      expect(piper.state).toBe('stun');
      expect(piper.stateDur).toBeCloseTo(stun);
      expect(piper.status.markBonus).toBeCloseTo(mark);
      expect(piper.status.markT).toBeCloseTo(EDGE.markTime, 1);
      // marked: anyone's blow lands that much harder
      const hp = piper.hp;
      damageEnemy(w, piper, 10, { kind: 'direct', by: -1, dx: 1, dy: 0 });
      expect(hp - piper.hp).toBeCloseTo(10 * (1 + mark));
    }
  });

  it('Counterweight: the Whirlwind dazes what it throws where that comes down, and what it cannot throw where it stands', () => {
    const plain = held({});
    const left = dummy(plain.w, plain.p.x + 1.8, plain.p.y, 1000);
    whirl(plain.w);
    run(plain.w, 40, padOf(plain.w));
    expect(left.status.markT).toBe(0);
    expect(left.state).not.toBe('stun');

    for (const [rank, stun, mark] of [
      [1, 0.6, 0.2],
      [3, 1.2, 0.4],
    ]) {
      const { w, p } = held({ counterweight: rank });
      const light = dummy(w, p.x + 1.8, p.y, 1000);
      const heavy = dummy(w, p.x - 1.8, p.y, 1000, CAIRN);
      whirlBlow(w);
      // too heavy to be thrown: dazed on the spot
      expect(heavy.state).toBe('stun');
      expect(heavy.stateDur).toBeCloseTo(stun);
      expect(heavy.status.markBonus).toBeCloseTo(mark);
      // thrown: in flight now, and marked already
      expect(light.state).toBe('launched');
      expect(light.status.markBonus).toBeCloseTo(mark);
      expect(light.status.markT).toBeCloseTo(EDGE.markTime, 1);
      const pad = padOf(w);
      for (let t = 0; t < 120 && light.state === 'launched'; t++) run(w, 1, pad);
      // and dazed where it came down
      expect(light.state).toBe('stun');
      expect(light.stateDur).toBeCloseTo(stun);
    }
  });

  it('Encore: a Whirlwind that meets three things or more is ready again, with a dash charge, and at rank II a little health', () => {
    const after = (tunings: Record<string, number>, echoes: number, bolts = 0): { cd: number; dash: number; hp: number; ready: number } => {
      const { w, p } = held(tunings);
      ringOf(w, p, echoes);
      for (let i = 0; i < bolts; i++) bolt(w, p.x + 2, p.y - 0.4 + i * 0.4, -3, 0);
      p.dashCharges = 0;
      p.hp = 50;
      const ev = whirlBlow(w);
      return { cd: p.specialCd, dash: p.dashCharges, hp: p.hp, ready: eventsOf(ev, 'specialReady').length };
    };
    const plain = after({}, 3);
    expect(plain.cd).toBeGreaterThan(WHIRL.cooldown - 0.5);
    expect([plain.dash, plain.hp, plain.ready]).toEqual([0, 50, 0]);
    expect(after({ encore: 1 }, 3)).toEqual({ cd: 0, dash: 1, hp: 50, ready: 1 });
    expect(after({ encore: 2 }, 3)).toEqual({ cd: 0, dash: 1, hp: 54, ready: 1 });
    // two things are not enough
    const two = after({ encore: 2 }, 2);
    expect(two.cd).toBeGreaterThan(WHIRL.cooldown - 0.5);
    expect([two.dash, two.hp]).toEqual([0, 50]);
    // a shot sent back counts as well as an Echo cut
    expect(after({ encore: 2 }, 1, 2)).toEqual({ cd: 0, dash: 1, hp: 54, ready: 1 });
    // once for each Whirlwind, however much it meets
    expect(after({ encore: 2 }, 6)).toEqual({ cd: 0, dash: 1, hp: 54, ready: 1 });
  });

  it('Second Spin (Tempered Spin and Counterweight): the Whirlwind goes round twice, and the second turn strikes in flight what the first threw', () => {
    const { w, p } = held({ 'tempered-spin': 1, counterweight: 1 });
    expect(p.mods.secondSpin).toBe(1);
    const e = dummy(w, p.x + 1.8, p.y, 1000);
    const pad = padOf(w).tap(PRESS.special);
    const ev: SimEvent[] = [];
    let safe = true;
    for (let t = 0; t < Math.round((WHIRL.windup + WHIRL.spin * 2 + WHIRL.recovery) * SIM_HZ) + 12; t++) {
      ev.push(...run(w, 1, pad));
      // nothing gets through until the second turn has come round
      if (p.whirlN < 2 && p.state === 'special' && damagePlayer(w, p, 10, p.x + 1, p.y, 0) !== HURT_NONE) safe = false;
    }
    expect(safe).toBe(true);
    const turns = eventsOf(ev, 'whirl');
    expect(turns.map((t) => t.n)).toEqual([0, 1]);
    const reach = WHIRL.radius + 0.3;
    expect(turns[0].radius).toBeCloseTo(reach);
    expect(turns[1].radius).toBeCloseTo(reach * WHIRL.second);
    // the first turn cuts it and throws it; the second catches it in the air, which is a Return, and it is marked by then
    const hits = eventsOf(ev, 'hit').filter((h) => h.target === e.id && h.by === p.slot);
    expect(hits.map((h) => h.kind)).toEqual(['direct', 'return']);
    expect(1000 - e.hp).toBeCloseTo(WHIRL.damage + WHIRL.damage * DUET.oopDamage * 1.2);
    expect(p.rally).toBeGreaterThan(0);

    // without the Harmony it goes round once
    const one = held({ 'tempered-spin': 1 });
    dummy(one.w, one.p.x + 1.8, one.p.y, 1000);
    expect(eventsOf(whirl(one.w, 2), 'whirl')).toHaveLength(1);
  });
});

describe('Edge Wave', () => {
  /** Three swings at nothing; returns the crescents thrown and the events. */
  const combo = (tunings: Record<string, number>): { w: World; p: Player; waves: Projectile[]; ev: SimEvent[] } => {
    const { w, p } = held(tunings);
    const pad = padOf(w).aimAt(p, p.x + 5, p.y);
    const ev: SimEvent[] = [];
    // a press as each swing is ending carries the combo on to the next
    for (let i = 0; i < 3; i++) ev.push(...run(w, 14, pad.tap(PRESS.attack)));
    // the third swing's blow
    for (let t = 0; t < 12 && !w.projectiles.some((pr) => pr.kind === 'crescent'); t++) ev.push(...run(w, 1, pad));
    return { w, p, waves: w.projectiles.filter((pr) => pr.kind === 'crescent'), ev };
  };

  it('Ringing Edge: the third swing throws a crescent, and its hits after a bounce are Returns', () => {
    expect(combo({}).waves).toHaveLength(0);
    for (const [rank, damage, bounces] of [
      [1, 12, 2],
      [2, 16, 3],
      [3, 20, 4],
    ]) {
      const { waves, p, ev } = combo({ 'ringing-edge': rank });
      expect(waves).toHaveLength(1);
      expect(eventsOf(ev, 'swing').map((s) => s.n)).toEqual([0, 1, 2]);
      const c = waves[0];
      expect([c.damage, c.bounces, c.owner, c.faction]).toEqual([damage, bounces, p.slot, 'player']);
      expect(speedOf(c)).toBeCloseTo(EDGE.crescentSpeed);
      expect(c.pierce).toBeGreaterThan(10);
    }
    // it goes through an Echo (a plain hit), comes back off the wall, and strikes it again: a Return
    const { w, p } = held({ 'ringing-edge': 1 });
    // far enough off that no swing reaches it: only the crescent does
    const e = dummy(w, p.x + 4.5, p.y, 5000);
    const pad = padOf(w).aimAt(p, p.x + 5, p.y);
    const ev: SimEvent[] = [];
    for (let t = 0; t < 240; t++) {
      if (t % 20 === 0 && eventsOf(ev, 'swing').length < 3) pad.tap(PRESS.attack);
      ev.push(...run(w, 1, pad));
    }
    const kinds = eventsOf(ev, 'hit')
      .filter((h) => h.target === e.id && h.amount !== SWORD.damage[0] && h.amount !== SWORD.damage[2])
      .map((h) => h.kind);
    expect(kinds).toContain('direct');
    expect(kinds).toContain('return');
  });

  /** One of the player's own shots hangs in front of them, and they swing at it. */
  const strikeOn = (tunings: Record<string, number>, o: { kind?: string; struck?: number } = {}): { pr: Projectile; ev: SimEvent[]; p: Player } => {
    const { w, p } = held(tunings);
    const pr = spawnProjectile(w, { kind: o.kind ?? 'bolt', faction: 'player', owner: p.slot, x: p.x + 1.2, y: p.y + 0.3, vx: -2, vy: 0, radius: 0.4, damage: 10, range: 6 });
    pr.returned = o.kind !== 'crescent';
    pr.struck = o.struck ?? 0;
    const ev = run(
      w,
      10,
      padOf(w)
        .aimAt(p, p.x + 5, p.y)
        .tap(PRESS.attack),
    );
    return { pr, ev, p };
  };

  it('Tuning Fork: your own shots can be struck on again, harder each time, up to five times', () => {
    const plain = strikeOn({});
    expect(plain.pr.damage).toBe(10);
    expect(eventsOf(plain.ev, 'reflect')).toHaveLength(0);
    for (const [rank, harder] of [
      [1, 1.4],
      [2, 1.6],
      [3, 1.8],
    ]) {
      const { pr, ev, p } = strikeOn({ 'tuning-fork': rank });
      expect(pr.damage).toBeCloseTo(10 * harder);
      expect(pr.struck).toBe(1);
      expect(eventsOf(ev, 'reflect')).toHaveLength(1);
      // sent where the blade points, with all its range again, and once for each swing
      expect(Math.atan2(pr.vy, pr.vx)).toBeCloseTo(p.aim);
      expect(pr.vx).toBeGreaterThan(0);
      expect(pr.range).toBeGreaterThan(REFLECT.range - 4);
    }
    // a crescent of its own, too
    expect(strikeOn({ 'tuning-fork': 1 }, { kind: 'crescent' }).pr.damage).toBeCloseTo(14);
    // five times and no more
    expect(strikeOn({ 'tuning-fork': 1 }, { struck: EDGE.reforkMost }).pr.damage).toBe(10);
    // somebody else's shot is not the Sword's to strike on
    const { w, p } = held({ 'tuning-fork': 1 });
    const other = spawnProjectile(w, { kind: 'bolt', faction: 'player', owner: 2, x: p.x + 1.2, y: p.y, vx: -2, vy: 0, radius: 0.2, damage: 10, range: 6 });
    other.returned = true;
    run(
      w,
      10,
      padOf(w)
        .aimAt(p, p.x + 5, p.y)
        .tap(PRESS.attack),
    );
    expect(other.damage).toBe(10);
  });

  it('Standing Wave (Ringing Edge and Tuning Fork): a crescent is struck on without end, and grows', () => {
    const wave = { 'ringing-edge': 1, 'tuning-fork': 1 };
    const grown = strikeOn(wave, { kind: 'crescent', struck: 9 });
    expect(grown.p.mods.standingWave).toBe(1);
    expect(grown.pr.struck).toBe(10);
    expect(grown.pr.radius).toBeCloseTo(0.4 * EDGE.waveGrow);
    expect(speedOf(grown.pr)).toBeCloseTo(2 * EDGE.waveGrow);
    // without the Harmony it neither grows nor goes past five
    const plain = strikeOn({ 'tuning-fork': 1 }, { kind: 'crescent' });
    expect(plain.pr.radius).toBeCloseTo(0.4);
    expect(strikeOn({ 'tuning-fork': 1 }, { kind: 'crescent', struck: 9 }).pr.struck).toBe(9);
    // a shot sent back is not a crescent: it is struck on harder, but does not grow
    expect(strikeOn(wave, { kind: 'bolt' }).pr.radius).toBeCloseTo(0.4);
  });

  it('Chorus: enough Rally gained, and the next swing is a Ring Cut all the way round', () => {
    const behind = (tunings: Record<string, number>, gained: number): { hurt: number; ev: SimEvent[]; p: Player; w: World } => {
      const { w, p } = held(tunings);
      // an Echo directly behind the way the player faces
      const e = dummy(w, p.x - 2.1, p.y, 500);
      for (let i = 0; i < gained; i++) addRally(w, p.slot, 1, p.x, p.y);
      const ev = swing(w, p);
      return { hurt: 500 - e.hp, ev, p, w };
    };
    expect(behind({}, 20).hurt).toBe(0);
    expect(behind({ chorus: 1 }, 11).hurt).toBe(0);
    const ring = behind({ chorus: 1 }, 12);
    expect(ring.hurt).toBe(EDGE.ringDamage);
    expect(eventsOf(ring.ev, 'swing')[0]).toMatchObject({ reach: EDGE.ringReach });
    expect(eventsOf(ring.ev, 'swing')[0].halfArc).toBeCloseTo(Math.PI);
    // one Ring Cut for each twelve: the swing after it is a plain one
    const e2 = dummy(ring.w, ring.p.x - 2.1, ring.p.y + 0.01, 500);
    run(ring.w, 40, padOf(ring.w));
    swing(ring.w, ring.p);
    expect(e2.hp).toBe(500);
    // sooner with rank
    expect(behind({ chorus: 3 }, 8).hurt).toBe(EDGE.ringDamage);
    // and it sends back what comes from behind
    const { w, p } = held({ chorus: 1 });
    for (let i = 0; i < 12; i++) addRally(w, p.slot, 1, p.x, p.y);
    const pad = padOf(w).aimAt(p, p.x + 5, p.y);
    run(w, 1, pad);
    bolt(w, p.x - 2.4, p.y, 9, 0);
    const ev = run(w, 40, pad.tap(PRESS.attack));
    expect(eventsOf(ev, 'reflect')).toHaveLength(1);
    expect(p.hp).toBe(p.maxHp);
  });
});

describe('belonging to no build', () => {
  it('Bladesong: the higher the Rally, the quicker the swing', () => {
    const time = (tunings: Record<string, number>, rally: number): number => {
      const { w, p } = held(tunings);
      p.rally = rally;
      run(w, 2, padOf(w).tap(PRESS.attack));
      return p.actDur;
    };
    const plain = SWORD.windup[0] + SWORD.active[0] + SWORD.recovery[0];
    expect(time({}, 20)).toBeCloseTo(plain);
    expect(time({ bladesong: 1 }, 0)).toBeCloseTo(plain);
    expect(time({ bladesong: 1 }, 10)).toBeCloseTo(plain / 1.2);
    expect(time({ bladesong: 3 }, 20)).toBeCloseTo(plain / 1.8);
    // the blow lands sooner, too
    const lands = (tunings: Record<string, number>): number => {
      const { w, p } = held(tunings);
      p.rally = 20;
      const e = dummy(w, p.x + 1.4, p.y, 500);
      const pad = padOf(w).aimAt(p, e.x, e.y).tap(PRESS.attack);
      let t = 0;
      while (e.hp === 500 && t < 60) {
        run(w, 1, pad);
        t++;
      }
      return t;
    };
    expect(lands({ bladesong: 3 })).toBeLessThan(lands({}));
  });
});

describe('the Sword’s Tunings as a set', () => {
  it('ten of them in three builds and a wildcard, one locked, and three Harmonies between them', () => {
    const own = Object.values(CONTENT.tunings).filter((t) => t.owner === 'sword');
    expect(own).toHaveLength(10);
    const builds = new Map<string, number>();
    for (const t of own) builds.set(t.build, (builds.get(t.build) ?? 0) + 1);
    expect([...builds.entries()].sort()).toEqual([
      ['Cyclone', 3],
      ['Edge Wave', 3],
      ['Mirror Guard', 3],
      ['Wildcard', 1],
    ]);
    expect(own.filter((t) => t.locked).map((t) => t.id)).toEqual(['chorus']);
    const ids = new Set(own.map((t) => t.id));
    expect(
      CONTENT.harmonies
        .filter((h) => h.parents.every((id) => ids.has(id)))
        .map((h) => h.id)
        .sort(),
    ).toEqual(['hall-of-mirrors', 'second-spin', 'standing-wave']);
    // every card has words for every rank
    for (const t of own) expect(t.text.length).toBe(t.maxRank);
  });
});
