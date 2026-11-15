// What a Tuning says on its card, for the player it is shown to: the rank they would get, what
// that rank does, and the Harmony it is half of. Used wherever a Tuning is offered: after a
// fight, on the Tuner's shelf, at the Still Pool.
import type { ContentRegistry } from '../sim/defs';
import { completes } from '../sim/draft';
import type { CardInfo } from '../ui/cards';

/** Whose a Tuning is, as its card says it. */
const OWNER_NAMES: Readonly<Record<string, string>> = { sword: 'Swordsman', bow: 'Archer', fist: 'Brawler', common: 'Anyone' };

export const RARITY_NAMES: readonly string[] = ['Common', 'Uncommon', 'Rare'];

export function cardInfo(id: string, held: Readonly<Record<string, number>>, content: ContentRegistry): CardInfo {
  const t = content.tunings[id];
  const rank = Math.min(t.maxRank, (held[id] ?? 0) + 1);
  const done = completes(id, held, content);
  const half = done ?? content.harmonies.find((h) => h.parents.includes(id)) ?? null;
  let harmony = '';
  if (half) {
    const other = content.tunings[half.parents[0] === id ? half.parents[1] : half.parents[0]];
    harmony = done || !other ? half.name : `With ${other.name}: ${half.name}`;
  }
  return {
    name: t.name,
    owner: OWNER_NAMES[t.owner] ?? '',
    build: t.build,
    rarity: t.rarity,
    rank,
    maxRank: t.maxRank,
    text: t.text[Math.min(rank, t.text.length) - 1] ?? '',
    harmony,
    harmonyText: half ? half.text : '',
    completes: !!done,
    icon: t.icon,
    tone: t.tone,
  };
}
