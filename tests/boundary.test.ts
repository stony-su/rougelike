// Architecture guards. The simulation must run headless and deterministically, so the pure
// layers may not touch the renderer, the DOM, the wall clock or unseeded randomness.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|mts)$/.test(name)) out.push(p);
  }
  return out;
}

/** Strip comments and string contents so prose never trips a guard. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

const PURE_DIRS = ['src/core', 'src/sim', 'src/content'];

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bMath\.random\b/, 'Math.random (use the seeded Rng)'],
  [/\bDate\.now\b/, 'Date.now'],
  [/\bnew Date\b/, 'new Date'],
  [/\bperformance\.now\b/, 'performance.now'],
  [/\bwindow\b/, 'window'],
  [/\bdocument\b/, 'document'],
  [/\blocalStorage\b/, 'localStorage'],
  [/\brequestAnimationFrame\b/, 'requestAnimationFrame'],
];

describe('pure layers stay pure', () => {
  for (const dir of PURE_DIRS) {
    it(`${dir} imports nothing from pixi and touches no browser globals`, () => {
      const problems: string[] = [];
      for (const f of files(join(ROOT, dir))) {
        const raw = readFileSync(f, 'utf8');
        const rel = relative(ROOT, f).replace(/\\/g, '/');
        for (const m of raw.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
          const spec = m[1];
          if (spec === 'pixi.js' || spec.startsWith('pixi.js/')) problems.push(`${rel}: imports ${spec}`);
          if (/\/(render|ui|audio|game)\//.test(spec) || /^\.\.\/(render|ui|audio|game)\b/.test(spec)) {
            problems.push(`${rel}: imports from a presentation layer (${spec})`);
          }
        }
        const stripped = code(raw);
        for (const [re, label] of FORBIDDEN) if (re.test(stripped)) problems.push(`${rel}: uses ${label}`);
      }
      expect(problems).toEqual([]);
    });
  }
});

describe('no unfinished work is shipped', () => {
  it('has no TODO, FIXME or placeholder markers in src', () => {
    const problems: string[] = [];
    for (const f of files(join(ROOT, 'src'))) {
      const raw = readFileSync(f, 'utf8');
      const rel = relative(ROOT, f).replace(/\\/g, '/');
      raw.split('\n').forEach((line, i) => {
        if (/\b(TODO|FIXME|XXX|HACK)\b/.test(line) || /not implemented/i.test(line) || /\bplaceholder\b/i.test(line)) {
          problems.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(problems).toEqual([]);
  });
});

describe('rendering conventions', () => {
  it('keeps colour literals in the palette', () => {
    const allowed = new Set(['src/render/palette.ts']);
    const problems: string[] = [];
    for (const f of files(join(ROOT, 'src'))) {
      const rel = relative(ROOT, f).replace(/\\/g, '/');
      if (allowed.has(rel)) continue;
      const stripped = code(readFileSync(f, 'utf8'));
      stripped.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/0x([0-9a-fA-F]{6})\b/g)) {
          const v = m[1].toLowerCase();
          // pure black and pure white are neutral (masks, shadows, white tintable shapes)
          if (v === '000000' || v === 'ffffff') continue;
          problems.push(`${rel}:${i + 1}: colour literal 0x${v}`);
        }
      });
    }
    expect(problems).toEqual([]);
  });

  it('puts filters on layers only (render/stage.ts)', () => {
    const problems: string[] = [];
    for (const f of files(join(ROOT, 'src'))) {
      const rel = relative(ROOT, f).replace(/\\/g, '/');
      if (rel === 'src/render/stage.ts') continue;
      const stripped = code(readFileSync(f, 'utf8'));
      if (/\.filters\s*=/.test(stripped)) problems.push(`${rel}: assigns .filters`);
    }
    expect(problems).toEqual([]);
  });
});
