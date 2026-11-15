// The rules that let several people build at once without meeting in the same file: the task
// board is in order, and everything that is "picked up by itself" really is one thing per file,
// named after its file.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { validateEnemyDef } from '../src/sim/defs';
import { validateRoomTemplate } from '../src/sim/room';
import { RIGS } from '../src/render/rig/registry';

const ROOT = join(__dirname, '..');
const names = (dir: string): string[] =>
  readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.replace(/\.ts$/, ''))
    .sort();

describe('the task board', () => {
  it('is in order: every task is well formed, and no two tasks in progress own the same file', () => {
    let out = '';
    try {
      out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'tasks.mjs'), 'check'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      throw new Error(`${e.stdout ?? ''}${e.stderr ?? ''}`);
    }
    expect(out).toContain('in order');
  });
});

describe('one thing per file, picked up by itself', () => {
  it('every enemy file is one valid enemy, named after its file', () => {
    const files = names('src/content/enemies');
    expect(Object.keys(CONTENT.enemies).sort()).toEqual(files);
    for (const id of files) expect(validateEnemyDef(CONTENT.enemies[id]), id).toEqual([]);
  });

  it('every room file is one valid room, named after its file', () => {
    expect(CONTENT.rooms.map((r) => r.id).sort()).toEqual(names('src/content/rooms'));
    for (const r of CONTENT.rooms) expect(validateRoomTemplate(r), r.id).toEqual([]);
  });

  it('every rig file is one rig, named after its file, and every enemy has its rig', () => {
    expect(Object.keys(RIGS).sort()).toEqual(names('src/render/rig/rigs'));
    for (const d of Object.values(CONTENT.enemies)) expect(RIGS[d.rig], `${d.id} wears ${d.rig}`).toBeDefined();
  });
});
