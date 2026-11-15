// What the game shell does at a camp. It turns what the session says is in front of this
// laptop's player into rows for the camp screen, reads the keys, and sends what the player takes
// as commands. The list opens by itself a moment after the party walks in; it can be put away to
// look round the chamber, and Interact brings it back.
import type { CampSeat } from '../sim/camp';
import type { ContentRegistry } from '../sim/defs';
import { BUY_RATION, BUY_RESTOCK, CAMP, REST_HEAL, atCamp, priceOf, raisable, restockPrice } from '../sim/preview';
import type { Session } from '../sim/session';
import type { Player } from '../sim/types';
import { CampScreen } from '../ui/campScreen';
import type { CampRow } from '../ui/campScreen';
import { uiSound } from '../ui/sfx';
import { RARITY_NAMES, cardInfo } from './cardInfo';
import type { Driver } from './driver';
import type { Input, MenuKeys } from './input';

type Ask = { kind: 'buy' | 'rest' | 'ready'; a: number };

/** How long after walking in the list opens, in ticks: long enough to see where one is. */
const OPENS_AFTER = 36;

const plain = (mark: CampRow['mark'], title: string, sub: string, price: number, off: string, note: string, head = ''): CampRow => ({
  mark,
  title,
  sub,
  price,
  off,
  card: null,
  note,
  icon: '',
  tone: '',
  head,
});

/** The rows of a camp for one player, and the command each row sends. */
export function campRows(seat: CampSeat, me: Player, content: ContentRegistry, coop: boolean): { rows: CampRow[]; asks: Ask[] } {
  const rows: CampRow[] = [];
  const asks: Ask[] = [];
  const short = 'Not enough Chimes';

  seat.shelf.forEach((id, i) => {
    const t = content.tunings[id];
    const head = i === 0 ? 'The Tuner' : '';
    asks.push({ kind: 'buy', a: i });
    if (!t) {
      rows.push(plain('restock', 'Sold', '', -1, 'This place on the shelf is empty', 'The Tuner has nothing more here. A fresh shelf brings three others.', head));
      return;
    }
    const held = me.tunings[id] ?? 0;
    const price = priceOf(t);
    const off = held >= t.maxRank ? 'Already at its top rank' : me.chimes < price ? short : '';
    rows.push({
      mark: 'tuning',
      title: t.name,
      sub: `${RARITY_NAMES[t.rarity] ?? ''}     ${held === 0 ? 'New' : `Rank ${Math.min(t.maxRank, held + 1)} of ${t.maxRank}`}`,
      price,
      off,
      card: cardInfo(id, me.tunings, content),
      note: '',
      icon: t.icon,
      tone: t.tone,
      head,
    });
  });

  asks.push({ kind: 'buy', a: BUY_RATION });
  rows.push(
    plain(
      'ration',
      'A ration',
      `${CAMP.rationHeal} health back`,
      CAMP.ration,
      !seat.ration ? 'Eaten' : me.hp >= me.maxHp ? 'Your health is full' : me.chimes < CAMP.ration ? short : '',
      `Bread for the road. ${CAMP.rationHeal} health back, at once. One to each of you at every camp.`,
    ),
  );
  const fresh = restockPrice(seat);
  asks.push({ kind: 'buy', a: BUY_RESTOCK });
  rows.push(
    plain('restock', 'A fresh shelf', 'Three other Tunings', fresh, me.chimes < fresh ? short : '', 'The Tuner clears the shelf and sets out three other Tunings. It costs a little more each time.'),
  );

  const given = seat.rested ? 'The Pool has given' : '';
  asks.push({ kind: 'rest', a: REST_HEAL });
  rows.push(
    plain(
      'heal',
      'Rest by the water',
      `${Math.round(me.maxHp * CAMP.heal)} health back`,
      -1,
      given || (me.hp >= me.maxHp ? 'Your health is full' : ''),
      'Sit a while. A third of your health comes back. The Still Pool gives each of you one thing at every camp: this, or a rank.',
      'The Still Pool',
    ),
  );
  const ids = raisable(me, content);
  ids.forEach((id, i) => {
    const t = content.tunings[id];
    asks.push({ kind: 'rest', a: 1 + i });
    rows.push({
      mark: 'tuning',
      title: `Raise ${t.name}`,
      sub: `To rank ${me.tunings[id] + 1} of ${t.maxRank}`,
      price: -1,
      off: given,
      card: cardInfo(id, me.tunings, content),
      note: '',
      icon: t.icon,
      tone: t.tone,
      head: '',
    });
  });
  if (ids.length === 0) {
    asks.push({ kind: 'rest', a: 1 });
    rows.push(
      plain(
        'gift',
        'Drink deep',
        `${CAMP.gift} more health, for good`,
        -1,
        given,
        `You hold nothing the water could raise, so it gives of itself: ${CAMP.gift} more health, for the rest of the road.`,
      ),
    );
  }

  asks.push({ kind: 'ready', a: seat.ready ? 0 : 1 });
  rows.push(
    plain(
      'leave',
      seat.ready ? 'Stay a little longer' : 'Walk on',
      !coop ? 'On to the next chamber' : seat.ready ? 'You are ready: waiting for the others' : 'The road goes on when everyone is ready',
      -1,
      '',
      coop ? 'Leave the camp. The party walks on when everyone is ready; once the first of you is, the others have half a minute.' : 'Leave the camp. What is left on the shelf stays behind.',
    ),
  );
  return { rows, asks };
}

export class CampFlow {
  readonly screen = new CampScreen();
  /** The camp this laptop has seen, and whether its list is out. */
  private seen = '';
  private out = false;
  private readonly keys: MenuKeys = { dx: 0, dy: 0, confirm: false, back: false };
  private lastMouseX = -1;
  private lastMouseY = -1;
  /** The tick before which a bot in this seat asks for nothing more. */
  private botQuietUntil = 0;

  /** The list has been put away and the player is looking round: the hint says how to bring it back. */
  get away(): boolean {
    return this.seen !== '' && !this.out;
  }

  /**
   * Run the camp for this laptop's player. `bot` decides for a bot in this seat (it never looks
   * at the screen). Returns true while the list has the keys.
   */
  step(s: Session, slot: number, me: Player | undefined, content: ContentRegistry, driver: Driver, input: Input, bot: ((seat: CampSeat, me: Player) => Ask | null) | null, dt: number): boolean {
    const seat = s.camps[slot];
    if (!me || s.phase !== 'run' || !atCamp(seat)) {
      this.screen.hide();
      this.seen = '';
      this.out = false;
      return false;
    }
    if (bot) {
      const ask = s.clearFor >= OPENS_AFTER && s.tick >= this.botQuietUntil ? bot(seat, me) : null;
      if (ask) {
        this.botQuietUntil = s.tick + 20;
        driver.command(ask.kind, ask.a);
      }
      return false;
    }
    const camp = `${s.attempt}/${s.stop}`;
    if (camp !== this.seen) {
      if (s.clearFor < OPENS_AFTER) return false;
      this.seen = camp;
      this.out = true;
    }
    if (!this.out) {
      this.screen.hide();
      if (input.take('interact')) {
        this.out = true;
        uiSound('confirm');
      }
      return this.out;
    }

    const coop = s.config.players.length > 1;
    const { rows, asks } = campRows(seat, me, content, coop);
    this.screen.show();
    this.screen.set(rows, input.device === 'pad');
    // who the road is waiting for, and how long they have
    let status = '';
    if (coop) {
      const names = s.camps.map((c, i) => (c.ready ? '' : (s.config.players[i]?.name ?? ''))).filter((n) => n !== '');
      const ready = s.camps.map((c, i) => (c.ready && i !== slot ? (s.config.players[i]?.name ?? '') : '')).filter((n) => n !== '');
      if (seat.ready && names.length > 0) status = `Waiting for ${names.join(', ')}`;
      else if (!seat.ready && ready.length > 0) status = `${ready.join(', ')} ${ready.length > 1 ? 'are' : 'is'} ready to go`;
    }
    this.screen.update(dt, me.chimes, status, s.campFor >= 0 ? 1 - s.campFor / CAMP.wait : -1);

    const k = input.menuKeys(this.keys);
    if (k.dy !== 0) this.screen.move(k.dy);
    // the mouse points only when it moves, so it never fights the keys
    const moved = input.mouseX !== this.lastMouseX || input.mouseY !== this.lastMouseY;
    this.lastMouseX = input.mouseX;
    this.lastMouseY = input.mouseY;
    let take = -1;
    let over = -1;
    if (input.hasMouse && (moved || input.isDown('attack'))) over = this.screen.pointAt(input.mouseX, input.mouseY);
    if (input.take('attack') && over >= 0) take = over;
    if (k.confirm) take = this.screen.choice;
    if (k.back) {
      this.out = false;
      this.screen.hide();
      uiSound('back');
      return true;
    }
    if (take >= 0 && rows[take] && asks[take]) {
      if (rows[take].off !== '') uiSound('error');
      else {
        uiSound(asks[take].kind === 'buy' ? 'buy' : 'confirm');
        driver.command(asks[take].kind, asks[take].a);
      }
    }
    return true;
  }

  destroy(): void {
    this.screen.destroy();
  }
}
