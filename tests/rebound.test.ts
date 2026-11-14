// The Rebound: bodies sent flying, and what they hit. Launch, wall slam, carom, ring-out,
// bumpers, stagger and Rally, each against the numbers in DESIGN.md section 2.
import { describe, expect, it } from 'vitest';
import { THRUM } from '../src/content/enemies';
import { addStagger, pushBody } from '../src/sim/bodies';
import { damageEnemy } from '../src/sim/combat';
import type { EnemyDef } from '../src/sim/defs';
import { addRally, rallyMul } from '../src/sim/rally';
import { groundAt, isClear } from '../src/sim/room';
import { BODY, DT, RALLY, massFactor } from '../src/sim/tuning';
import type { Enemy } from '../src/sim/types';
import { bounceWorld, dummy, eventsOf, openWorld, run } from './helpers';

const MEDIUM: EnemyDef = { ...THRUM, id: 'thrum', mass: 2.5, radius: 0.45 };
const HEAVY: EnemyDef = { ...THRUM, id: 'thrum', mass: 5, radius: 0.6 };

const speed = (e: Enemy): number => Math.hypot(e.lvx, e.lvy);

describe('launch', () => {
  it('speed is impulse over mass, and only a body faster than the launch speed is launched', () => {
    const w = openWorld();
    const light = dummy(w, 3.5, 2.5);
    const medium = dummy(w, 3.5, 4.5, 0, MEDIUM);
    const heavy = dummy(w, 3.5, 10.5, 0, HEAVY);
    expect(pushBody(w, light, 1, 0, 9, 0)).toBe(true);
    expect(pushBody(w, medium, 1, 0, 9, 0)).toBe(true);
    expect(pushBody(w, heavy, 1, 0, 9, 0)).toBe(false);
    expect(speed(light)).toBeCloseTo(9);
    expect(speed(medium)).toBeCloseTo(3.6);
    expect(speed(heavy)).toBeCloseTo(1.8);
    expect(light.state).toBe('launched');
    expect(medium.state).toBe('launched');
    expect(heavy.state).toBe('idle');
    expect(w.events.filter((e) => e.type === 'launch')).toHaveLength(2);
  });

  it('a launched body slows steadily, lands, lies there a moment, and gets up', () => {
    const w = openWorld();
    const e = dummy(w, 3.5, 2.5);
    pushBody(w, e, 1, 0, 9, 0);
    let landedAt = -1;
    let upAt = -1;
    for (let t = 0; t < 120; t++) {
      const ev = run(w, 1);
      if (landedAt < 0 && ev.some((x) => x.type === 'land')) landedAt = t;
      if (landedAt >= 0 && upAt < 0 && e.state === 'idle') upAt = t;
    }
    // from 9 down to 3 at 18 a second
    expect(landedAt * DT).toBeCloseTo((9 - BODY.launchSpeed) / BODY.friction, 1);
    expect((upAt - landedAt) * DT).toBeCloseTo(BODY.landRecover, 1);
    // v squared over twice the friction: about two and a quarter tiles
    expect(e.x - 3.5).toBeCloseTo((9 * 9) / (2 * BODY.friction), 0);
    expect(speed(e)).toBe(0);
  });

  it('cancels whatever the body was doing', () => {
    const w = openWorld();
    const e = dummy(w, 3.5, 2.5);
    e.state = 'windup';
    e.move = 0;
    e.stateDur = 5;
    pushBody(w, e, 1, 0, 9, 0);
    expect(e.state).toBe('launched');
    expect(e.move).toBe(-1);
  });

  it('cannot be launched again for a moment after landing, only nudged', () => {
    const w = openWorld();
    const e = dummy(w, 3.5, 2.5);
    pushBody(w, e, 1, 0, 6, 0);
    for (let t = 0; t < 200 && e.state === 'launched'; t++) run(w, 1);
    expect(e.state).toBe('recover');
    expect(pushBody(w, e, 0, 1, 20, 0)).toBe(false);
    expect(speed(e)).toBeLessThanOrEqual(BODY.launchSpeed);
    run(w, Math.round((BODY.landRecover + BODY.launchImmune) / DT) + 2);
    expect(pushBody(w, e, 0, 1, 20, 0)).toBe(true);
  });

  it('nothing arriving, and nothing down a pit, can be pushed', () => {
    const w = openWorld();
    const e = dummy(w, 3.5, 2.5);
    e.state = 'spawn';
    expect(pushBody(w, e, 1, 0, 20, 0)).toBe(false);
    expect(speed(e)).toBe(0);
  });
});

describe('wall slam', () => {
  it('a body that hits a wall hard is hurt by its speed and bounces back with less', () => {
    const w = openWorld();
    const p = w.players[0];
    const e = dummy(w, 13.5, 3.5, 1000);
    pushBody(w, e, 1, 0, 20, p.slot);
    let impact = 0;
    let after = 0;
    let hurt = 0;
    for (let t = 0; t < 30 && impact === 0; t++) {
      const before = e.lvx;
      const ev = run(w, 1);
      const slam = eventsOf(ev, 'wallSlam')[0];
      if (!slam) continue;
      impact = slam.speed;
      expect(slam.off).toBe('wall');
      expect(impact).toBeCloseTo(before, 6);
      after = e.lvx;
      const hit = eventsOf(ev, 'hit')[0];
      expect(hit.kind).toBe('slam');
      expect(hit.by).toBe(p.slot);
      hurt = 1000 - e.hp;
    }
    // about 19 when it arrives: 20 less a tile of friction
    expect(impact).toBeGreaterThan(18);
    expect(impact).toBeLessThan(20);
    expect(hurt).toBeCloseTo(BODY.slamDamage * impact, 6);
    // the bounce is a mirror at seven tenths, less the friction of the rest of that tick
    expect(after).toBeLessThan(0);
    expect(-after).toBeCloseTo(BODY.wallRestitution * impact, 0);
    expect(p.rally).toBe(RALLY.weight.sent);
    // it never got through the wall
    expect(e.x).toBeLessThan(15 - e.radius + 1e-6);
  });

  it('a gentle touch bounces without hurting', () => {
    const w = openWorld();
    const e = dummy(w, 14.5, 3.5, 1000);
    pushBody(w, e, 1, 0, 4.9, 0);
    const ev = run(w, 30);
    expect(eventsOf(ev, 'wallSlam')).toHaveLength(1);
    expect(eventsOf(ev, 'hit')).toHaveLength(0);
    expect(e.hp).toBe(1000);
  });

  it('a glancing blow counts only the part of the speed that goes into the wall', () => {
    const w = openWorld();
    const e = dummy(w, 10.5, 12, 1000);
    // mostly along the bottom wall, a little into it
    pushBody(w, e, Math.cos(0.2), Math.sin(0.2), 20, 0);
    let seen = false;
    for (let t = 0; t < 30 && !seen; t++) {
      const ev = run(w, 1);
      const slam = eventsOf(ev, 'wallSlam')[0];
      if (!slam) continue;
      seen = true;
      // it was going at nearly 20, but into the wall at under 5
      expect(Math.hypot(e.lvx, e.lvy)).toBeGreaterThan(10);
      expect(slam.speed).toBeGreaterThan(2);
      expect(slam.speed).toBeLessThan(5);
      expect(eventsOf(ev, 'hit')).toHaveLength(0);
    }
    expect(seen).toBe(true);
    expect(e.hp).toBe(1000);
  });

  it('breaks armour, and the breaking blow lands in full', () => {
    const w = openWorld();
    const e = dummy(w, 13.5, 3.5, 1000);
    e.armor = 0.25;
    damageEnemy(w, e, 40, { kind: 'direct', by: 0, dx: 1, dy: 0 });
    expect(e.hp).toBe(990);
    pushBody(w, e, 1, 0, 20, 0);
    const ev = run(w, 30);
    expect(eventsOf(ev, 'armorBreak')).toHaveLength(1);
    expect(e.armor).toBe(1);
    expect(990 - e.hp).toBeGreaterThan(15);
  });
});

describe('carom', () => {
  it('a launched body hurts what it flies into, passes on its motion, and the chain goes on', () => {
    const w = openWorld();
    const p = w.players[0];
    const a = dummy(w, 2.5, 3.5, 1000);
    const b = dummy(w, 5.5, 3.5, 1000);
    const c = dummy(w, 8.5, 3.5, 1000);
    pushBody(w, a, 1, 0, 20, p.slot);
    const ev = run(w, 90);
    const caroms = eventsOf(ev, 'carom');
    expect(caroms.length).toBe(2);
    expect([caroms[0].a, caroms[0].b, caroms[0].links]).toEqual([a.id, b.id, 1]);
    expect([caroms[1].a, caroms[1].b, caroms[1].links]).toEqual([b.id, c.id, 2]);
    // both bodies of a carom take six tenths of the closing speed
    const first = caroms[0].speed;
    expect(first).toBeGreaterThan(17);
    expect(1000 - a.hp).toBeCloseTo(BODY.caromDamage * first, 6);
    // the second link was made with Rally already up, so it hit harder than its speed alone
    const second = caroms[1].speed;
    expect(second).toBeGreaterThan(BODY.caromSpeed);
    expect(1000 - c.hp).toBeCloseTo(BODY.caromDamage * second * (1 + RALLY.perPoint * RALLY.weight.sent), 6);
    expect(1000 - b.hp).toBeCloseTo(BODY.caromDamage * first + BODY.caromDamage * second * (1 + RALLY.perPoint * RALLY.weight.sent), 6);
    expect(p.rally).toBe(2 * RALLY.weight.sent);
    // everything was credited to the player who started it
    for (const h of eventsOf(ev, 'hit')) {
      expect(h.kind).toBe('carom');
      expect(h.by).toBe(p.slot);
    }
    // nobody ended up inside anybody
    expect(b.x - a.x).toBeGreaterThan(a.radius + b.radius - 0.01);
    expect(c.x - b.x).toBeGreaterThan(b.radius + c.radius - 0.01);
  });

  it('sixty percent of the closing speed passes to a body of the same weight', () => {
    const w = openWorld();
    const a = dummy(w, 4.5, 3.5, 1000);
    const b = dummy(w, 5.5, 3.5, 1000);
    pushBody(w, a, 1, 0, 20, 0);
    let seen = false;
    for (let t = 0; t < 10 && !seen; t++) {
      const ev = run(w, 1);
      const cm = eventsOf(ev, 'carom')[0];
      if (!cm) continue;
      seen = true;
      // read before either body freezes or slows further
      expect(b.state).toBe('launched');
      expect(b.links).toBe(1);
      expect(b.lvx).toBeCloseTo(BODY.caromPass * cm.speed, 0);
      expect(a.lvx).toBeCloseTo(BODY.caromKeep * cm.speed, 0);
    }
    expect(seen).toBe(true);
  });

  it('a light body bounces back off a heavy one, which staggers instead of flying', () => {
    const w = openWorld();
    const a = dummy(w, 4.5, 3.5, 1000);
    const big = dummy(w, 6.5, 3.5, 1000, HEAVY);
    pushBody(w, a, 1, 0, 20, 0);
    const ev = run(w, 40);
    const cm = eventsOf(ev, 'carom')[0];
    expect(cm).toBeDefined();
    expect(big.state).not.toBe('launched');
    expect(big.stagger).toBe(1);
    // the light one came back the way it went
    expect(a.x).toBeLessThan(6.5 - big.radius - a.radius);
    expect(eventsOf(ev, 'carom')).toHaveLength(1);
  });

  it('a heavy body hits twice as hard, and sends a light one flying faster than itself', () => {
    const w = openWorld();
    const big = dummy(w, 4.5, 3.5, 1000, HEAVY);
    const small = dummy(w, 6.5, 3.5, 1000);
    pushBody(w, big, 1, 0, 60, 0);
    expect(speed(big)).toBeCloseTo(12);
    const ev = run(w, 40);
    const cm = eventsOf(ev, 'carom')[0];
    expect(1000 - small.hp).toBeCloseTo(BODY.caromDamage * cm.speed * massFactor(5), 6);
    expect(massFactor(5)).toBe(2);
    expect(massFactor(2.5)).toBe(1.3);
    expect(massFactor(1)).toBe(1);
    // capped at one and a half times the closing speed
    const launch = eventsOf(ev, 'launch').find((l) => l.id === small.id);
    expect(launch?.speed).toBeCloseTo(BODY.caromMaxGain * cm.speed, 6);
  });

  it('a chain is at most four links long', () => {
    const w = openWorld();
    const row = [2, 3.4, 4.8, 6.2, 7.6, 9, 10.4].map((x) => dummy(w, x, 10.5, 100000));
    // move the player well away so nothing is nudged off them
    w.players[0].x = w.players[0].px = 3;
    w.players[0].y = w.players[0].py = 2;
    // Each body far lighter than the one before, so every link leaves faster than it arrived
    // and speed is never what ends the chain.
    row.forEach((e, i) => {
      e.def = { ...e.def, mass: 50 / 3 ** i };
    });
    pushBody(w, row[0], 1, 0, 30 * row[0].def.mass, 0);
    const ev = run(w, 240);
    const links = eventsOf(ev, 'carom').map((c) => c.links);
    // the first four links follow one another down the row; nothing ever makes a fifth
    expect(links.slice(0, 4)).toEqual([1, 2, 3, 4]);
    expect(Math.max(...links)).toBe(BODY.maxLinks);
    for (const e of row) expect(e.links).toBeLessThanOrEqual(BODY.maxLinks);
  });

  it('the same two bodies cannot carom again at once', () => {
    const w = openWorld();
    const a = dummy(w, 4.5, 3.5, 1000);
    const b = dummy(w, 5.4, 3.5, 1000);
    pushBody(w, a, 1, 0, 30, 0);
    const ev = run(w, Math.round(BODY.pairLock / DT) - 2);
    expect(eventsOf(ev, 'carom').filter((c) => (c.a === a.id && c.b === b.id) || (c.a === b.id && c.b === a.id))).toHaveLength(1);
  });

  it('a slow bump is not a carom', () => {
    const w = openWorld();
    const a = dummy(w, 4.5, 3.5, 1000);
    const b = dummy(w, 5.6, 3.5, 1000);
    pushBody(w, a, 1, 0, 4.5, 0);
    const ev = run(w, 60);
    expect(eventsOf(ev, 'carom')).toHaveLength(0);
    expect(b.hp).toBe(1000);
  });
});

describe('ring-out', () => {
  it('a light body launched into a pit is gone, and the player who launched it is credited', () => {
    const w = bounceWorld();
    const p = w.players[0];
    const e = dummy(w, 5.5, 7.5);
    pushBody(w, e, 1, 0, 16, p.slot);
    const ev = run(w, 40);
    const out = eventsOf(ev, 'ringOut')[0];
    expect(out).toMatchObject({ id: e.id, by: p.slot, killed: true });
    expect(e.dead).toBe(true);
    expect(eventsOf(ev, 'hit')[0].kind).toBe('ringout');
    expect(p.rally).toBe(RALLY.weight.sent);
    expect(w.stats.kills).toBe(1);
  });

  it('a heavier body loses a quarter of its health, climbs out at the edge, and is dazed', () => {
    const w = bounceWorld();
    const e = dummy(w, 6.6, 7.5, 0, HEAVY);
    const full = e.maxHp;
    pushBody(w, e, 1, 0, 16 * 5, 0);
    let fellAt = -1;
    let outAt = -1;
    for (let t = 0; t < 200; t++) {
      const ev = run(w, 1);
      if (fellAt < 0 && ev.some((x) => x.type === 'ringOut')) {
        fellAt = t;
        expect(e.state).toBe('pit');
        expect(e.hp).toBeCloseTo(full * (1 - BODY.ringOutShare), 6);
      }
      if (fellAt >= 0 && outAt < 0 && ev.some((x) => x.type === 'climbOut')) {
        outAt = t;
        expect(e.state).toBe('stun');
        expect(e.stateDur).toBe(BODY.pitStun);
        expect(isClear(w.room, e.x, e.y, e.radius)).toBe(true);
      }
    }
    expect(fellAt).toBeGreaterThanOrEqual(0);
    expect((outAt - fellAt) * DT).toBeCloseTo(BODY.pitTime, 1);
    expect(e.dead).toBe(false);
    expect(e.state).toBe('idle');
  });

  it('down a pit, a body cannot be struck', () => {
    const w = bounceWorld();
    const e = dummy(w, 6.6, 7.5, 0, HEAVY);
    pushBody(w, e, 1, 0, 80, 0);
    for (let t = 0; t < 60 && e.state !== 'pit'; t++) run(w, 1);
    const hp = e.hp;
    expect(damageEnemy(w, e, 50, { kind: 'direct', by: 0, dx: 1, dy: 0 })).toBe(false);
    expect(e.hp).toBe(hp);
  });

  it('nobody on foot can walk or be nudged into a pit', () => {
    const w = bounceWorld();
    const e = dummy(w, 7.2, 7.5, 1000);
    // a shove too weak to launch
    pushBody(w, e, 1, 0, 2.9, 0);
    run(w, 60);
    expect(e.state).not.toBe('pit');
    expect(groundAt(w.room, e.x, e.y)).toBe('floor');
    expect(e.x).toBeLessThanOrEqual(8 - e.radius + 1e-6);
  });
});

describe('bumpers', () => {
  it('kick a body away faster, and what it hits next is hit harder', () => {
    const w = bounceWorld();
    const e = dummy(w, 10.5, 3.5, 1000);
    pushBody(w, e, 1, 0, 8, 0);
    let exit = 0;
    for (let t = 0; t < 30 && exit === 0; t++) {
      const ev = run(w, 1);
      const slam = eventsOf(ev, 'wallSlam')[0];
      if (!slam) continue;
      expect(slam.off).toBe('bumper');
      exit = -e.lvx;
    }
    // it arrived slower than 9 and left at 9 or more, less a tick of friction
    expect(exit).toBeGreaterThan(BODY.bumperMinExit - BODY.friction * DT - 1e-6);
    expect(e.boost).toBe(BODY.bumperBoost);
    // the next hard thing it meets takes the boost, once
    const hp = e.hp;
    e.lvx = -20;
    e.lvy = 0;
    e.x = e.px = 2.2;
    let dealt = 0;
    let impact = 0;
    const rally = rallyMul(w, 0);
    for (let t = 0; t < 30 && dealt === 0; t++) {
      const ev = run(w, 1);
      const slam = eventsOf(ev, 'wallSlam')[0];
      if (!slam) continue;
      impact = slam.speed;
      dealt = hp - e.hp;
    }
    expect(dealt).toBeCloseTo(BODY.slamDamage * impact * (1 + BODY.bumperBoost) * rally, 6);
    expect(e.boost).toBe(0);
  });
});

describe('stagger', () => {
  it('builds on medium and heavy bodies only, and fades', () => {
    const w = openWorld();
    const light = dummy(w, 3.5, 2.5);
    const heavy = dummy(w, 3.5, 10.5, 0, HEAVY);
    addStagger(w, light, 1);
    addStagger(w, heavy, 1);
    expect(light.stagger).toBe(0);
    expect(heavy.stagger).toBe(1);
    run(w, Math.round(BODY.staggerFade / DT) + 2);
    expect(heavy.stagger).toBe(0);
  });

  it('at three the body is staggered: stunned, and three times as easy to launch', () => {
    const w = openWorld();
    const heavy = dummy(w, 3.5, 10.5, 0, HEAVY);
    addStagger(w, heavy, 2);
    expect(heavy.state).toBe('idle');
    addStagger(w, heavy, 1);
    expect(heavy.state).toBe('stun');
    expect(heavy.stateDur).toBe(BODY.staggerTime);
    expect(w.events.some((e) => e.type === 'stagger')).toBe(true);
    // 9 over a mass of 5 would be 1.8: no launch. Staggered, it is 5.4.
    expect(pushBody(w, heavy, 1, 0, 9, 0)).toBe(true);
    expect(speed(heavy)).toBeCloseTo((9 / 5) * BODY.staggerLaunchMul);
  });
});

describe('Rally', () => {
  it('is built by Returns by weight, capped, and makes Returns hit harder', () => {
    const w = openWorld();
    const p = w.players[0];
    expect(rallyMul(w, p.slot)).toBe(1);
    addRally(w, p.slot, RALLY.weight.arrow, 0, 0);
    addRally(w, p.slot, RALLY.weight.sent, 0, 0);
    addRally(w, p.slot, RALLY.weight.perfect, 0, 0);
    expect(p.rally).toBe(6);
    expect(rallyMul(w, p.slot)).toBeCloseTo(1 + 6 * RALLY.perPoint);
    for (let i = 0; i < 20; i++) addRally(w, p.slot, 3, 0, 0);
    expect(p.rally).toBe(RALLY.cap);
    expect(rallyMul(w, p.slot)).toBeCloseTo(2);
    expect(w.stats.bestRally).toBe(RALLY.cap);
    // a hit that nobody sent is not multiplied
    expect(rallyMul(w, -1)).toBe(1);
  });

  it('falls to nothing after four seconds without a Return, and a Return in time keeps it', () => {
    const w = openWorld();
    const p = w.players[0];
    addRally(w, p.slot, 2, 0, 0);
    run(w, Math.round(3 / DT));
    expect(p.rally).toBe(2);
    addRally(w, p.slot, 2, 0, 0);
    run(w, Math.round(3 / DT));
    expect(p.rally).toBe(4);
    const ev = run(w, Math.round(1.2 / DT));
    expect(p.rally).toBe(0);
    expect(eventsOf(ev, 'rallyBreak')[0]).toMatchObject({ player: p.slot, value: 4 });
  });

  it('belongs to each player separately', () => {
    const w = openWorld(2);
    addRally(w, 1, 3, 0, 0);
    expect(w.players[0].rally).toBe(0);
    expect(w.players[1].rally).toBe(3);
  });
});
