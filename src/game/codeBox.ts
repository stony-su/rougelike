// A box of real text over the game, for the one thing a drawn screen cannot do: let a line of
// text be copied out of the page, or pasted into it. It is used to write a save out as a code and
// to read one back. The keys typed into it stay in it; Esc closes it.
import { CHIME, PAPER, UI, css } from '../render/palette';

export class CodeBox {
  private el: HTMLDivElement | null = null;
  private done: ((text: string | null) => void) | null = null;

  get open(): boolean {
    return this.el !== null;
  }

  /** Show a code to be copied. */
  show(code: string, onClose: () => void): void {
    this.build('Your save, as a code', 'Select it all and copy it (Ctrl+A, Ctrl+C), then keep it somewhere. Esc closes this.', code, false, () => onClose());
  }

  /** Ask for a code. `onDone` is given what was entered, or null if the box was closed without one. */
  ask(onDone: (text: string | null) => void): void {
    this.build('Read a save from a code', 'Paste the code here (Ctrl+V) and press Enter. It replaces what is kept on this address. Esc closes this.', '', true, onDone);
  }

  close(): void {
    this.finish(null);
  }

  private finish(text: string | null): void {
    const done = this.done;
    this.done = null;
    this.el?.remove();
    this.el = null;
    done?.(text);
  }

  private build(title: string, words: string, text: string, entry: boolean, done: (text: string | null) => void): void {
    this.finish(null);
    this.done = done;
    const box = document.createElement('div');
    box.style.cssText = `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(640px,92vw);padding:22px 26px;box-sizing:border-box;background:${css(UI.glass)};border:2px solid ${css(UI.brass)};border-radius:12px;color:${css(PAPER)};font:14px/1.5 system-ui,sans-serif;z-index:10;`;
    const head = document.createElement('div');
    head.textContent = title;
    head.style.cssText = `font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;color:${css(CHIME)};`;
    const note = document.createElement('div');
    note.textContent = words;
    note.style.cssText = `font-size:13px;margin-bottom:12px;color:${css(UI.inkSoft)};`;
    const area = document.createElement('textarea');
    area.value = text;
    area.readOnly = !entry;
    area.spellcheck = false;
    area.rows = 7;
    area.style.cssText = `width:100%;box-sizing:border-box;resize:none;padding:10px;background:${css(UI.scrim)};color:${css(PAPER)};border:1px solid ${css(UI.brass)};border-radius:6px;font:13px/1.4 Consolas,Menlo,monospace;word-break:break-all;outline:none;`;
    // what is typed here is for this box alone: the game under it hears none of it
    for (const type of ['keydown', 'keyup', 'keypress'] as const) {
      area.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type !== 'keydown') return;
        if (e.key === 'Escape') {
          e.preventDefault();
          this.finish(null);
        } else if (e.key === 'Enter' && entry) {
          e.preventDefault();
          this.finish(area.value);
        }
      });
    }
    box.append(head, note, area);
    document.body.appendChild(box);
    this.el = box;
    area.focus();
    if (!entry) area.select();
  }
}
