// The screens of the game outside the fighting. Each is one file in this folder, picked up by
// itself: its default export makes it, and its file name is the name it is opened by, so adding
// one touches no other file. What a screen is, and the common body most of them share, is in
// src/ui/screen.ts.
import type { AppScreen, ScreenFactory, ScreenHost } from '../screen';

const found = import.meta.glob<ScreenFactory>(['./*.ts', '!./index.ts'], { eager: true, import: 'default' });

/** Every screen in this folder, by the name of its file. */
export function createScreens(host: ScreenHost): Record<string, AppScreen> {
  const out: Record<string, AppScreen> = {};
  for (const path of Object.keys(found).sort()) out[path.slice(2, -3)] = found[path](host);
  return out;
}
