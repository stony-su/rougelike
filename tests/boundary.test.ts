// Architecture guards. The simulation runs headless and in lockstep on several laptops, so the
// pure layers may not touch the renderer, the DOM, the wall clock, unseeded randomness, or any
// arithmetic that JavaScript engines are free to round differently.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const rel = (f: string): string => relative(ROOT, f).replace(/\\/g, '/');

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

/** Module specifiers a file imports at run time (type-only imports are erased and do not count). */
function runtimeImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/^\s*(import|export)\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/gm)) {
    if (!m[2]) out.push(m[3]);
  }
  for (const m of src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) out.push(m[1]);
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  for (const cand of [`${base}.ts`, join(base, 'index.ts'), base]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

const PURE_DIRS = ['src/core', 'src/sim', 'src/content', 'src/net'];

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bMath\.random\b/, 'Math.random (use the seeded Rng)'],
  [/\bDate\b/, 'Date'],
  [/\bperformance\b/, 'performance'],
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
        for (const m of raw.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
          const spec = m[1];
          if (spec === 'pixi.js' || spec.startsWith('pixi.js/')) problems.push(`${rel(f)}: imports ${spec}`);
          if (/\/(render|ui|audio|game)\//.test(spec) || /^\.\.\/(render|ui|audio|game)\b/.test(spec)) {
            problems.push(`${rel(f)}: imports from a presentation layer (${spec})`);
          }
        }
        const stripped = code(raw);
        for (const [re, label] of FORBIDDEN) if (re.test(stripped)) problems.push(`${rel(f)}: uses ${label}`);
      }
      expect(problems).toEqual([]);
    });
  }
});

describe('the simulation computes the same bits on every machine', () => {
  /** Every file the simulation can reach at run time. */
  function simGraph(): string[] {
    const seen = new Set<string>();
    const stack = [...files(join(ROOT, 'src/sim')), ...files(join(ROOT, 'src/content')), join(ROOT, 'src/net/relayCore.ts')];
    while (stack.length) {
      const f = stack.pop() as string;
      if (seen.has(f)) continue;
      seen.add(f);
      for (const spec of runtimeImports(readFileSync(f, 'utf8'))) {
        const target = resolveImport(f, spec);
        if (target) stack.push(target);
      }
    }
    return [...seen].sort();
  }

  // Exact by the language standard: these give the same result on every engine.
  const EXACT = new Set(['abs', 'sign', 'floor', 'ceil', 'round', 'trunc', 'min', 'max', 'sqrt', 'imul', 'fround', 'clz32', 'PI', 'E', 'LN2', 'LN10', 'LOG2E', 'LOG10E', 'SQRT1_2', 'SQRT2']);

  it('uses only exact arithmetic: no engine-dependent Math functions and no ** operator', () => {
    const problems: string[] = [];
    const graph = simGraph();
    expect(graph.length).toBeGreaterThan(15);
    for (const f of graph) {
      const stripped = code(readFileSync(f, 'utf8'));
      stripped.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/\bMath\.([A-Za-z0-9_]+)/g)) {
          if (!EXACT.has(m[1])) problems.push(`${rel(f)}:${i + 1}: Math.${m[1]}`);
        }
        if (/\*\*/.test(line)) problems.push(`${rel(f)}:${i + 1}: the ** operator`);
      });
    }
    expect(problems).toEqual([]);
  });

  it('does not reach the renderer-side helpers', () => {
    const reached = simGraph().map(rel);
    for (const banned of ['src/core/math.ts', 'src/core/ease.ts', 'src/core/iso.ts']) expect(reached).not.toContain(banned);
  });

  it('keeps no module-level mutable state', () => {
    const problems: string[] = [];
    for (const f of files(join(ROOT, 'src/sim'))) {
      code(readFileSync(f, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          if (/^(export\s+)?(let|var)\s/.test(line)) problems.push(`${rel(f)}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(problems).toEqual([]);
  });
});

describe('one path changes the game', () => {
  // Presentation reads simulation state and sends inputs and commands; only the session step
  // changes anything. So presentation may not call the modules that mutate a world.
  const MUTATORS = ['world', 'ai', 'combat', 'player', 'projectiles', 'flow', 'status', 'bodies', 'bombs', 'stones', 'rally', 'move', 'sword', 'bow', 'fist', 'camp'];

  it('game, ui, render and audio never call into the modules that mutate a world', () => {
    const problems: string[] = [];
    for (const dir of ['src/game', 'src/ui', 'src/render', 'src/audio']) {
      if (!existsSync(join(ROOT, dir))) continue;
      for (const f of files(join(ROOT, dir))) {
        for (const spec of runtimeImports(readFileSync(f, 'utf8'))) {
          const m = /\/sim\/([a-zA-Z]+)$/.exec(spec);
          if (m && MUTATORS.includes(m[1])) problems.push(`${rel(f)}: imports sim/${m[1]} at run time`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('the game works on a plain http address', () => {
  // Laptops that join a host open http://<address>, which is not a secure context.
  const SECURE_ONLY: Array<[RegExp, string]> = [
    [/\bcrypto\.subtle\b/, 'crypto.subtle'],
    [/\brandomUUID\b/, 'crypto.randomUUID'],
    [/\bnavigator\.clipboard\b/, 'navigator.clipboard'],
    [/\baudioWorklet\b/, 'audioWorklet'],
    [/\bnavigator\.keyboard\b/, 'navigator.keyboard'],
  ];

  it('uses no browser feature that needs a secure context', () => {
    const problems: string[] = [];
    for (const f of files(join(ROOT, 'src'))) {
      const stripped = code(readFileSync(f, 'utf8'));
      for (const [re, label] of SECURE_ONLY) if (re.test(stripped)) problems.push(`${rel(f)}: uses ${label}`);
    }
    expect(problems).toEqual([]);
  });
});

describe('no unfinished work is shipped', () => {
  it('has no TODO, FIXME or placeholder markers in src', () => {
    const problems: string[] = [];
    for (const f of files(join(ROOT, 'src'))) {
      const raw = readFileSync(f, 'utf8');
      raw.split('\n').forEach((line, i) => {
        if (/\b(TODO|FIXME|XXX|HACK)\b/.test(line) || /not implemented/i.test(line) || /\bplaceholder\b/i.test(line) || /\bINTERIM\b/.test(line)) {
          problems.push(`${rel(f)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(problems).toEqual([]);
  });
});

describe('rendering conventions', () => {
  it('keeps colour literals in the palette', () => {
    // the shared palette, and one file of colours per character or place beside it
    const allowed = (f: string): boolean => f === 'src/render/palette.ts' || f.startsWith('src/render/palette/');
    const problems: string[] = [];
    for (const f of files(join(ROOT, 'src'))) {
      if (allowed(rel(f))) continue;
      const stripped = code(readFileSync(f, 'utf8'));
      stripped.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/0x([0-9a-fA-F]{6})\b/g)) {
          const v = m[1].toLowerCase();
          // pure black and pure white are neutral (masks, shadows, white tintable shapes)
          if (v === '000000' || v === 'ffffff') continue;
          problems.push(`${rel(f)}:${i + 1}: colour literal 0x${v}`);
        }
      });
    }
    expect(problems).toEqual([]);
  });

  it('puts filters on layers only (render/stage.ts)', () => {
    const problems: string[] = [];
    for (const f of files(join(ROOT, 'src'))) {
      if (rel(f) === 'src/render/stage.ts') continue;
      const stripped = code(readFileSync(f, 'utf8'));
      if (/\.filters\s*=/.test(stripped)) problems.push(`${rel(f)}: assigns .filters`);
    }
    expect(problems).toEqual([]);
  });
});
