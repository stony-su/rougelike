// What the game shell does while the Wager is on the table: shows it, reads the keys, and sends
// this laptop's answer as a command. When the table closes it says how the party answered.
import { VOTE_NONE, VOTE_TAKE, VOTE_WALK, WAGER, onTable } from '../sim/preview';
import type { Session } from '../sim/session';
import type { Player } from '../sim/types';
import { uiSound } from '../ui/sfx';
import { WagerScreen } from '../ui/wagerScreen';
import type { Driver } from './driver';
import { noKeys } from './input';
import type { Input } from './input';

const WORDS = {
  risk: `Brittle. Everyone's health is cut by ${Math.round(WAGER.brittle * 100)}% for as long as the fight lasts.`,
  prize: `Win it, and the chamber pays ${WAGER.chimes === 2 ? 'double' : `${WAGER.chimes} times the`} Chimes and a second card, a rare one.`,
};

export class WagerFlow {
  readonly screen = new WagerScreen();
  private readonly keys = noKeys();
  private lastMouseX = -1;
  private lastMouseY = -1;
  /** The table a bot in this seat has answered, and the one this laptop last saw open. */
  private botSaid = '';
  private was = false;
  /** How the party answered, for the game to announce once: 'on', 'off', or '' when there is nothing new. */
  result = '';

  /** Returns true while the Wager has the keys. `bot` is true when a bot plays this seat. */
  step(s: Session, slot: number, me: Player | undefined, driver: Driver, input: Input, bot: boolean, dt: number): boolean {
    const wg = s.wager;
    const open = s.phase === 'run' && !!me && onTable(wg);
    if (this.was && !open && wg.decided) this.result = wg.on ? 'on' : 'off';
    this.was = open;
    if (!open || !me) {
      this.screen.hide();
      return false;
    }
    if (bot) {
      // a bot answers once, after a moment, and never looks at the screen
      const table = `${s.attempt}/${s.stop}`;
      if (this.botSaid !== table && wg.timer <= WAGER.count - 40) {
        this.botSaid = table;
        driver.command('wager', me.hp >= me.maxHp * 0.6 ? VOTE_TAKE : VOTE_WALK);
      }
      return false;
    }
    this.screen.show(WORDS, input.device === 'pad');
    const mine = wg.votes[slot] ?? VOTE_NONE;
    this.screen.update(
      dt,
      s.config.players.map((p, i) => ({ name: p.name, vote: wg.votes[i] ?? VOTE_NONE })),
      mine,
      wg.timer / WAGER.count,
    );

    const k = input.menuKeys(this.keys);
    if (k.dx !== 0) this.screen.move(k.dx);
    const moved = input.mouseX !== this.lastMouseX || input.mouseY !== this.lastMouseY;
    this.lastMouseX = input.mouseX;
    this.lastMouseY = input.mouseY;
    let take = -1;
    let over = -1;
    if (input.hasMouse && (moved || input.isDown('attack'))) over = this.screen.pointAt(input.mouseX, input.mouseY);
    if (input.take('attack') && over >= 0) take = over;
    if (k.digit === 1) take = 0;
    if (k.digit === 2) take = 1;
    if (k.confirm) take = this.screen.choice;
    if (take >= 0) {
      const say = take === 0 ? VOTE_TAKE : VOTE_WALK;
      if (say !== mine) {
        uiSound('confirm');
        driver.command('wager', say);
      }
    }
    return true;
  }

  destroy(): void {
    this.screen.destroy();
  }
}
