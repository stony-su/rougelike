// Every instrument and Splice must do what its card says. Each has a probe: a scenario that
// measures its effect. A probe must read higher with the instrument than without, and must not
// fall as rank rises. The suite fails if any registered id has no probe, so content cannot be
// added as a name with nothing behind it.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { SMUDGE } from '../src/content/enemies';
import { roomTemplate } from '../src/content/rooms';
import { spawnEnemy } from '../src/sim/ai';
import { damagePlayer } from '../src/sim/combat';
import { describe as describeText, describeAllRanks, validateInstruments } from '../src/sim/defs';
import { activeSplices, grantInstrument, kitChalkPickup, spliceWith, swapHead } from '../src/sim/kit';
import { activeLines, loseStake, pairIndex, severLine } from '../src/sim/lines';
import { spawnProjectile } from '../src/sim/projectiles';
import { buildRoom } from '../src/sim/room';
import { DASH, DT, LINES, PLUMB, ROD } from '../src/sim/tuning';
import { emptyInput } from '../src/sim/types';
import type { Enemy, InputFrame, SimEvent, World } from '../src/sim/types';
import { createWorld, stepWorld } from '../src/sim/world';

const secs = (s: number): number => Math.round(s / DT);
const inp = (o: Partial<InputFrame> = {}): InputFrame => ({ ...emptyInput(), aimX: 100, aimY: 6.5, ...o });

function world(): World {
  const w = createWorld(buildRoom(roomTemplate('bluefen-reedbed')), 7, CONTENT);
  place(w, 12.5, 10.5);
  return w;
}

function place(w: World, x: number, y: number): void {
  w.player.x = w.player.px = x;
  w.player.y = w.player.py = y;
  w.player.vx = w.player.vy = 0;
}

function steps(w: World, n: number, f: InputFrame = inp()): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    stepWorld(w, i === 0 ? f : { ...f, attackPressed: false, dashPressed: false, specialPressed: false, stakePressed: false });
    out.push(...w.events);
    w.events.length = 0;
  }
  return out;
}

/** An immovable target that never attacks. `light` makes it movable. */
function dummy(w: World, x: number, y: number, light = false): Enemy {
  const e = spawnEnemy(w, { ...SMUDGE, speed: 0, mass: light ? 1 : 60 }, x, y, { instant: true });
  e.cooldowns.fill(9999);
  e.hp = e.maxHp = 10000;
  return e;
}

/** Stakes 0, 1, 2 at (4,4), (9,4), (6.5,9); the player is left far away at (12.5, 10.5). */
function triangle(w: World): void {
  for (const [x, y] of [[4, 4], [9, 4], [6.5, 9]] as const) {
    place(w, x, y);
    steps(w, 1, inp({ stakePressed: true }));
  }
  place(w, 12.5, 10.5);
}

function give(w: World, id: string, rank: number): void {
  for (let i = 0; i < rank; i++) grantInstrument(w, id);
}

/** Put an enemy onto the line between stakes 0 and 1 (y = 4), so it trips it. */
function stepOnto01(w: World, e: Enemy, x = 6.5): void {
  e.x = e.px = x;
  e.y = e.py = 5.6;
  steps(w, 2);
  e.x = x;
  e.y = 4.1;
}

const lost = (e: Enemy): number => e.maxHp - e.hp;

type Probe = (rank: number) => number;

/** A probe builds a world, grants the instrument at `rank` (0 = not at all), and returns a measurement. */
function probeOf(id: string, body: (w: World, has: boolean) => number, before?: (w: World) => void): Probe {
  return (rank) => {
    const w = world();
    before?.(w);
    give(w, id, rank);
    return body(w, rank > 0);
  };
}

const PROBES: Record<string, Probe> = {
  // ------------------------------------------------------------ Heads (mounted on stake 0)
  signal_lamp: probeOf('signal_lamp', (w) => {
    triangle(w);
    const e = dummy(w, 6.5, 6);
    stepOnto01(w, e);
    steps(w, secs(3.6));
    return lost(e);
  }),
  frost_gauge: probeOf('frost_gauge', (w) => {
    triangle(w);
    const e = dummy(w, 6.5, 6);
    stepOnto01(w, e);
    steps(w, 2);
    const chill = e.status.chillSlow;
    // and a discharge freezes
    const f = dummy(w, 7.5, 6);
    steps(w, secs(LINES.ripeTime + 0.2));
    stepOnto01(w, f, 7.5);
    steps(w, 2);
    return chill * 10 + f.status.frozenT;
  }),
  station_bell: probeOf('station_bell', (w) => {
    triangle(w);
    const bystander = dummy(w, 3.2, 5.6); // near stake 0, clear of every line
    const tripper = dummy(w, 6.5, 6);
    steps(w, secs(LINES.ripeTime + 0.2));
    stepOnto01(w, tripper);
    steps(w, 4);
    return lost(bystander);
  }),
  lodestone: probeOf('lodestone', (w) => {
    triangle(w);
    const e = dummy(w, 2.2, 2.4, true);
    const d0 = Math.hypot(e.x - 4, e.y - 4);
    steps(w, secs(1.5));
    return d0 - Math.hypot(e.x - 4, e.y - 4);
  }),
  heliograph: probeOf('heliograph', (w) => {
    triangle(w);
    const shooter = dummy(w, 6.5, 1.2);
    // a shot fired down across the line between stakes 0 and 1
    spawnProjectile(w, { kind: 'quill', faction: 'enemy', owner: shooter.id, x: 6.5, y: 2, vx: 0, vy: 9, radius: 0.14, damage: 8, range: 12, light: true });
    steps(w, secs(1.2));
    return lost(shooter);
  }),
  vernier: probeOf('vernier', (w) => {
    triangle(w);
    return 1 / w.lines.lines[pairIndex(0, 1)].ripenTime;
  }),
  barbed_chain: probeOf('barbed_chain', (w) => {
    triangle(w);
    const e = dummy(w, 6.5, 6, true);
    stepOnto01(w, e);
    steps(w, 2);
    return e.status.rootT;
  }),
  witness_mark: probeOf('witness_mark', (w) => {
    triangle(w);
    const e = dummy(w, 6.5, 6);
    stepOnto01(w, e);
    steps(w, 2);
    return e.status.markBonus;
  }),
  spring_stake: probeOf('spring_stake', (w) => {
    triangle(w);
    // stake 0 is the oldest: E brings it to the player, where it bursts
    const e = dummy(w, 11.6, 9.2);
    steps(w, secs(0.4));
    place(w, 12.5, 10.5);
    steps(w, 1, inp({ stakePressed: true }));
    steps(w, secs(0.6));
    return lost(e);
  }),
  anchor_pin: probeOf('anchor_pin', (w) => {
    triangle(w);
    const line = w.lines.lines[pairIndex(0, 1)];
    const cannotLose = loseStake(w, 0) ? 0 : 1;
    const cannotSever = severLine(w, line, 3) ? 0 : 1;
    return cannotLose + cannotSever + line.bonus;
  }),

  // ------------------------------------------------------------ Orders
  quickchalk: probeOf('quickchalk', (w) => {
    triangle(w);
    return 1 / w.lines.lines[pairIndex(0, 1)].ripenTime;
  }),
  homestead: probeOf('homestead', (w) => {
    triangle(w);
    steps(w, secs(0.4));
    place(w, 6.5, 6); // inside the Plot
    steps(w, 1, inp({ stakePressed: true }));
    steps(w, secs(0.5));
    // the Plot is now (6.5, 6), (9, 4), (6.5, 9): stand at its centre
    place(w, 7.3, 6.3);
    steps(w, 2);
    return (1 - w.mods.damageTakenMul) + (w.mods.swingSpeedMul - 1);
  }),
  slingshot: probeOf('slingshot', (w) => {
    // one line along y = 6; dash down across it with an enemy beyond
    for (const [x, y] of [[4, 6], [9, 6]] as const) {
      place(w, x, y);
      steps(w, 1, inp({ stakePressed: true }));
    }
    place(w, 12.5, 10.5);
    const e = dummy(w, 6.5, 8.3);
    steps(w, secs(LINES.ripeTime + 0.2));
    place(w, 6.5, 4.6);
    steps(w, 1, inp({ dashPressed: true, moveY: 1 }));
    steps(w, secs(DASH.time + 0.4));
    return lost(e) + (w.player.y - 4.6);
  }),
  fine_tolerance: probeOf('fine_tolerance', (w) => {
    // a small Plot: area 6
    for (const [x, y] of [[5, 5], [8, 5], [6.5, 9]] as const) {
      place(w, x, y);
      steps(w, 1, inp({ stakePressed: true }));
    }
    place(w, 12.5, 10.5);
    steps(w, 3);
    return w.lines.rules.whipMul;
  }),
  long_stride: probeOf('long_stride', (w) => {
    place(w, 1, 6);
    steps(w, secs(3.2), inp({ moveX: 1 }));
    const built = w.mods.moveSpeedMul;
    w.player.iframes = 0;
    damagePlayer(w, 1, 0, 6, 0);
    steps(w, 8);
    // built up, and lost on a hit
    return built - 1 + (built > 1 && w.mods.moveSpeedMul < built ? 0.01 : 0);
  }),
  surveyors_eye: probeOf('surveyors_eye', (w) => {
    triangle(w);
    place(w, 5.2, 6.5);
    const e = dummy(w, 6.6, 6.5); // inside the Plot
    steps(w, 3);
    const ev = steps(w, 14, inp({ attackPressed: true, aimX: e.x, aimY: e.y }));
    const h = ev.find((x) => x.type === 'hit' && x.kind === 'rod');
    return h && h.type === 'hit' ? h.amount : 0;
  }),
  chalk_dust: probeOf('chalk_dust', (w) => {
    triangle(w);
    const e = dummy(w, 6.5, 5.5);
    steps(w, secs(0.4));
    place(w, 4.2, 9.2);
    steps(w, 1, inp({ stakePressed: true }));
    steps(w, secs(0.5));
    return w.zones.length + e.status.zoneSlow;
  }),
  double_entry: probeOf('double_entry', (w) => {
    triangle(w);
    const e = dummy(w, 6.5, 6.5);
    // three real whips around the target; the third echoes
    const spots: Array<[number, number]> = [[9, 8.5], [4, 8.5], [6.5, 3.2]];
    let total = 0;
    for (const [x, y] of spots) {
      steps(w, secs(0.6));
      place(w, x, y);
      const before = e.hp;
      steps(w, 1, inp({ stakePressed: true }));
      steps(w, secs(0.6));
      total = before - e.hp;
    }
    return total; // damage of the third whip
  }),
  datum: probeOf('datum', (w) => {
    triangle(w);
    place(w, 6.5, 5.5);
    steps(w, secs(1.2));
    const shield = w.player.shield;
    w.player.iframes = 0;
    damagePlayer(w, 10, 0, 5, 0);
    return shield + (100 - w.player.hp < 10 ? 1 : 0);
  }),
  tally_stick: probeOf('tally_stick', (w) => {
    triangle(w);
    const e = dummy(w, 6.5, 6);
    stepOnto01(w, e);
    steps(w, 2);
    const chalk = w.chalk;
    w.player.hp = 50;
    kitChalkPickup(w);
    return chalk + (w.player.hp - 50);
  }),
  hammer_drill: probeOf('hammer_drill', (w) => {
    triangle(w);
    const e = dummy(w, 6.5, 4.05); // standing on the line from stake 0 when it forms: not tripped
    steps(w, 4);
    const before = e.hp;
    place(w, 3.2, 4);
    for (let i = 0; i < 80; i++) {
      const ev = steps(w, 1, inp({ attackPressed: i % 4 === 0, aimX: 4, aimY: 4 }));
      if (ev.some((x) => x.type === 'hammer')) break;
    }
    steps(w, 6);
    return before - e.hp;
  }),
  spare_cord: probeOf('spare_cord', (w) => w.player.plumbMax + w.mods.plumbDrag),
  third_wind: probeOf('third_wind', (w) => w.player.dashMaxCharges),
  iron_pins: probeOf('iron_pins', (w) => {
    triangle(w);
    const line = w.lines.lines[pairIndex(0, 1)];
    severLine(w, line, LINES.severTime);
    return 1 / line.severedT + 1 / w.lines.rules.lostTime;
  }),
  fourth_stake: probeOf('fourth_stake', (w) => {
    for (const [x, y] of [[4, 4], [9, 4], [9, 9], [4, 9]] as const) {
      place(w, x, y);
      steps(w, 1, inp({ stakePressed: true }));
    }
    return w.lines.stakes.length * 10 + activeLines(w.lines).length + (w.lines.plot ? w.lines.plot.area : 0);
  }),
  backsight: probeOf('backsight', (w) => {
    triangle(w);
    steps(w, secs(0.4));
    place(w, 6.5, 6);
    steps(w, secs(0.7), inp({ specialPressed: true, aimX: 6.5, aimY: 9 }));
    // with the swap the player ends up where the stake stood
    return Math.hypot(w.player.x - 6.5, w.player.y - 6) > 2 ? 1 : 0;
  }),
  foresight: probeOf('foresight', (w) => {
    triangle(w);
    place(w, 12.5, 6.5);
    steps(w, 3);
    const e = dummy(w, 2, 11); // far from everything
    steps(w, 2);
    // drop it onto the cord between the player (12.5, 6.5) and the newest stake (6.5, 9)
    e.x = 9.5;
    e.y = 7.75;
    steps(w, 3);
    return lost(e);
  }),
  offset: probeOf('offset', (w) => {
    triangle(w);
    steps(w, secs(0.4));
    place(w, 12.5, 10.5);
    steps(w, secs(0.9), inp({ specialPressed: true, aimX: 12.5, aimY: 6.5 }));
    const s = w.lines.stakes[0];
    return Math.hypot(s.x - 4, s.y - 4) > 3 ? 1 : 0;
  }),
};

/** Splice probes: both Heads mounted on stakes 0 and 1, so the Splice is on the line between them (y = 4). */
function spliced(a: string, b: string, body: (w: World) => number): Probe {
  return (rank) => {
    const w = world();
    if (rank > 0) {
      grantInstrument(w, a);
      grantInstrument(w, b);
    } else {
      // the same Heads, but on stakes that share no Splice edge: one Head only, so the comparison is fair
      grantInstrument(w, a);
    }
    return body(w);
  };
}

const SPLICE_PROBES: Record<string, Probe> = {
  steamline: spliced('signal_lamp', 'frost_gauge', (w) => {
    triangle(w);
    const e = dummy(w, 6.5, 6);
    stepOnto01(w, e);
    steps(w, 3);
    const zones = w.zones.filter((z) => z.zone === 'steam').length;
    // steam stops a shot that crosses it
    spawnProjectile(w, { kind: 'quill', faction: 'enemy', x: 8, y: 2, vx: 0, vy: 9, radius: 0.14, damage: 8, range: 12, light: true });
    const ev = steps(w, secs(0.6));
    const blocked = ev.some((x) => x.type === 'projectileEnd' && x.hit && x.y < 5) ? 1 : 0;
    return zones + blocked;
  }),
  tolling_furnace: spliced('station_bell', 'signal_lamp', (w) => {
    triangle(w);
    const inPlot = dummy(w, 6.5, 7); // inside the Plot, beyond the Bell's reach and off every line
    const tripper = dummy(w, 6.5, 6);
    steps(w, secs(LINES.ripeTime + 0.2));
    stepOnto01(w, tripper);
    steps(w, secs(1.5));
    return lost(inPlot);
  }),
  glacier_haul: spliced('lodestone', 'frost_gauge', (w) => {
    triangle(w);
    const e = dummy(w, 7.2, 6, true);
    stepOnto01(w, e, 7.2);
    steps(w, secs(0.5));
    // hauled to the Lodestone (stake 0 at 4,4) and frozen there
    return (7.2 - e.x) + e.status.frozenT;
  }),
  sun_dog: spliced('heliograph', 'signal_lamp', (w) => {
    triangle(w);
    const e = dummy(w, 12.5, 4); // on the line's extension, beyond stake 1
    steps(w, secs(LINES.ripeTime + 0.4));
    return lost(e);
  }),
  resonance: spliced('station_bell', 'vernier', (w) => {
    // two stakes first; the third goes down late, so its lines are still young when the first line is ripe
    for (const [x, y] of [[4, 4], [9, 4]] as const) {
      place(w, x, y);
      steps(w, 1, inp({ stakePressed: true }));
    }
    place(w, 12.5, 10.5);
    const tripper = dummy(w, 6.5, 6);
    steps(w, secs(LINES.ripeTime + 0.1));
    place(w, 6.5, 9);
    steps(w, 1, inp({ stakePressed: true }));
    place(w, 12.5, 10.5);
    const others = [w.lines.lines[pairIndex(1, 2)], w.lines.lines[pairIndex(0, 2)]];
    stepOnto01(w, tripper);
    steps(w, 2);
    return others.filter((l) => l.ripe).length;
  }),
  snare: spliced('barbed_chain', 'lodestone', (w) => {
    triangle(w);
    // the Lodestone is the second Head, so it sits on stake 1 at (9, 4)
    const e = dummy(w, 9.6, 3.2, true);
    steps(w, secs(0.6));
    return e.status.rootT + lost(e);
  }),
  dead_reckoning: spliced('witness_mark', 'vernier', (w) => {
    triangle(w);
    const e = dummy(w, 6.5, 6);
    stepOnto01(w, e); // tripped by the Witness Mark line: now Marked
    steps(w, 2);
    e.y = 5.6; // step off, still within reach of the line
    const before = e.hp;
    steps(w, secs(3));
    return before - e.hp;
  }),
  recoil: spliced('spring_stake', 'anchor_pin', (w) => {
    triangle(w);
    // the Anchor Pin is on stake 1 at (9, 4); the Spring Stake (stake 0) is whipped to the player
    const e = dummy(w, 9.9, 2.8);
    steps(w, secs(0.4));
    place(w, 12.5, 10.5);
    steps(w, 1, inp({ stakePressed: true }));
    steps(w, secs(0.6));
    return lost(e);
  }),
};

describe('the Field Kit is well formed', () => {
  it('passes validation', () => {
    expect(validateInstruments(CONTENT)).toEqual([]);
  });

  it('has at least 20 instruments available on a fresh save, some that combine', () => {
    const fresh = Object.values(CONTENT.instruments).filter((d) => !d.locked);
    expect(fresh.length).toBeGreaterThanOrEqual(20);
    expect(CONTENT.splices.length).toBeGreaterThanOrEqual(3);
    expect(Object.values(CONTENT.instruments).filter((d) => d.kind === 'head').length).toBeGreaterThanOrEqual(3);
  });

  it('every instrument and Splice has a probe', () => {
    expect(Object.keys(PROBES).sort()).toEqual(Object.keys(CONTENT.instruments).sort());
    expect(Object.keys(SPLICE_PROBES).sort()).toEqual(CONTENT.splices.map((s) => s.id).sort());
  });

  it('fills every card text from its values, at every rank', () => {
    for (const d of Object.values(CONTENT.instruments)) {
      for (let r = 1; r <= d.maxRank; r++) {
        const t = describeText(d, r);
        expect(t).not.toMatch(/[{}?]/);
        expect(t.length).toBeGreaterThan(12);
      }
      expect(describeAllRanks(d)).not.toMatch(/[{}?]/);
    }
    for (const s of CONTENT.splices) expect(describeText(s, 1)).not.toMatch(/[{}?]/);
    expect(describeText(CONTENT.instruments.signal_lamp, 2)).toBe('Its lines scorch: enemies hit burn for 8 damage per second for 3 s.');
    expect(describeText(CONTENT.instruments.vernier, 3)).toBe('Its lines ripen 60% faster.');
    expect(describeAllRanks(CONTENT.instruments.vernier)).toBe('Its lines ripen 30% / 45% / 60% faster.');
  });
});

describe('every instrument does what it says', () => {
  for (const def of Object.values(CONTENT.instruments)) {
    it(`${def.name} changes the outcome, and never gets worse with rank`, () => {
      const probe = PROBES[def.id];
      const baseline = probe(0);
      let last = baseline;
      for (let r = 1; r <= def.maxRank; r++) {
        const v = probe(r);
        expect(Number.isFinite(v)).toBe(true);
        if (r === 1) expect(v).toBeGreaterThan(baseline + 1e-6);
        else expect(v).toBeGreaterThanOrEqual(last - 1e-6);
        last = v;
      }
      // a ranked instrument must be strictly better at its top rank than at rank 1
      if (def.maxRank > 1) expect(probe(def.maxRank)).toBeGreaterThan(probe(1) + 1e-6);
    });
  }
});

describe('every Splice does what it says', () => {
  for (const sp of CONTENT.splices) {
    it(`${sp.name} appears on the shared line and changes the outcome`, () => {
      const probe = SPLICE_PROBES[sp.id];
      expect(probe(1)).toBeGreaterThan(probe(0) + 1e-6);
      const w = world();
      grantInstrument(w, sp.heads[0]);
      expect(spliceWith(w, sp.heads[1])).toBe(sp.id);
      grantInstrument(w, sp.heads[1]);
      expect(activeSplices(w)).toEqual([sp.id]);
      expect(w.lines.lines[pairIndex(0, 1)].splice).toBe(sp.id);
    });
  }
});

describe('owning and mounting', () => {
  it('a new Head takes the first bare stake; a fourth needs a swap; duplicates rank up', () => {
    const w = world();
    expect(grantInstrument(w, 'signal_lamp')).toBe('granted');
    expect(grantInstrument(w, 'frost_gauge')).toBe('granted');
    expect(grantInstrument(w, 'vernier')).toBe('granted');
    expect(w.kit.heads.slice(0, 3)).toEqual(['signal_lamp', 'frost_gauge', 'vernier']);
    expect(grantInstrument(w, 'lodestone')).toBe('needsSwap');
    expect(grantInstrument(w, 'signal_lamp')).toBe('ranked');
    expect(w.lines.stakes[0].headRank).toBe(2);
    grantInstrument(w, 'signal_lamp');
    expect(grantInstrument(w, 'signal_lamp')).toBe('maxed');
    expect(swapHead(w, 2, 'lodestone')).toBe('vernier');
    expect(w.kit.owned.vernier).toBeUndefined();
    expect(w.kit.heads[2]).toBe('lodestone');
    expect(grantInstrument(w, 'no_such_thing')).toBe('unknown');
  });

  it('no stack of ripening bonuses can pass the floor', () => {
    const w = world();
    w.kit.chain = 'short';
    give(w, 'vernier', 3);
    give(w, 'quickchalk', 2);
    for (const l of w.lines.lines) expect(l.ripenTime).toBeGreaterThanOrEqual(LINES.ripeFloor);
  });

  it('the kit survives from room to room', () => {
    const w = world();
    give(w, 'third_wind', 1);
    give(w, 'signal_lamp', 2);
    const next = createWorld(buildRoom(roomTemplate('bluefen-reedbed')), 8, CONTENT, { kit: w.kit, chalk: 33 });
    expect(next.player.dashMaxCharges).toBe(DASH.charges + 1);
    expect(next.lines.stakes[0].head).toBe('signal_lamp');
    expect(next.lines.stakes[0].headRank).toBe(2);
    expect(next.chalk).toBe(33);
  });

  it('the Plumb Shot has charges that come back one at a time', () => {
    const w = world();
    give(w, 'spare_cord', 1);
    place(w, 6.5, 6.5);
    steps(w, secs(0.4), inp({ specialPressed: true }));
    steps(w, secs(0.4), inp({ specialPressed: true }));
    expect(w.player.plumbCharges).toBe(0);
    steps(w, secs(PLUMB.cooldown) + 2);
    expect(w.player.plumbCharges).toBe(1);
    steps(w, secs(PLUMB.cooldown) + 2);
    expect(w.player.plumbCharges).toBe(2);
    void ROD;
  });
});
