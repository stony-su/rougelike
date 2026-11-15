// Generated chambers: every seed gives a room that passes the same checks as a hand-built one,
// the same seed always gives the same room, and the shapes really differ.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { EXPERT, classBot } from '../src/sim/bots';
import { standing } from '../src/sim/combat';
import { createFlow } from '../src/sim/flow';
import { buildRoom, groundAt, validateRoomTemplate } from '../src/sim/room';
import { ROOM_SHAPES, generateRoom } from '../src/sim/roomgen';
import type { RoomSpec } from '../src/sim/roomgen';
import { emptyInput } from '../src/sim/types';
import { createWorld, stepWorld } from '../src/sim/world';

const spec = (size: number, o: Partial<RoomSpec> = {}): RoomSpec => ({ zone: 'outer', kind: 'combat', look: 'court', size, ...o });

describe('generated chambers', () => {
  it('every seed, shape and size gives a closed, connected, fair room that fits', () => {
    let rooms = 0;
    const plain: string[] = [];
    for (const shape of ROOM_SHAPES) {
      for (const size of [16, 22, 28, 34]) {
        for (let i = 0; i < 40; i++) {
          const t = generateRoom(`check-${shape}-${size}-${i}`, spec(size, { shape }));
          expect(validateRoomTemplate(t), t.id).toEqual([]);
          const w = Math.max(...t.map.map((r) => r.length));
          expect(w).toBeLessThanOrEqual(40);
          expect(t.map.length).toBeLessThanOrEqual(40);
          expect(t.map.join('').split('s').length - 1).toBeGreaterThanOrEqual(4);
          if (t.id.startsWith('gen-plain')) plain.push(t.id);
          rooms++;
        }
      }
    }
    expect(rooms).toBe(ROOM_SHAPES.length * 4 * 40);
    // the plain fallback is for emergencies only
    expect(plain.length).toBeLessThan(rooms * 0.02);
  });

  it('the same seed gives the same room, and another seed another', () => {
    const a = generateRoom('same', spec(26));
    const b = generateRoom('same', spec(26));
    const c = generateRoom('other', spec(26));
    expect(b.map).toEqual(a.map);
    expect(c.map).not.toEqual(a.map);
  });

  it('left to choose, it uses every shape, and big rooms have plenty to bounce off', () => {
    const seen = new Set<string>();
    let things = 0;
    for (let i = 0; i < 60; i++) {
      const t = generateRoom(`mix-${i}`, spec(30));
      seen.add(t.id.split('-')[1]);
      const text = t.map.join('');
      things += text.split('o').length - 1 + (text.split('B').length - 1);
      // cut corners: 45 degree walls for bank shots
      expect(/[7913]/.test(text)).toBe(true);
    }
    for (const shape of ROOM_SHAPES) expect(seen.has(shape), shape).toBe(true);
    expect(things / 60).toBeGreaterThan(5);
  });

  it('a bot can fight a chamber of waves in one, and nobody leaves the floor', () => {
    let cleared = 0;
    for (const seed of ['a', 'b', 'c', 'd']) {
      const room = buildRoom(generateRoom(`fight-${seed}`, spec(26, { look: 'survey', zone: 'inner' })));
      const w = createWorld(room, seed, CONTENT, { entrants: [{ slot: 0, classId: 'sword' }], chamber: 2, flow: createFlow(2, 1) });
      const bot = classBot('sword', EXPERT);
      const idle = emptyInput();
      for (let t = 0; t < 150 * 60; t++) {
        stepWorld(w, [bot.think(w, 0)], idle);
        w.events.length = 0;
        const p = w.players[0];
        if (groundAt(w.room, p.x, p.y) !== 'floor') throw new Error(`the player left the floor in ${room.id}`);
        if (w.flow.phase === 'cleared' || !w.players.some(standing)) break;
      }
      if (w.flow.phase === 'cleared') cleared++;
    }
    expect(cleared).toBeGreaterThanOrEqual(3);
  });
});
