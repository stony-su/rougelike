// The task board: who is building what, so that two people never build the same thing and
// never edit the same file at the same time. There is one Markdown file per task in tasks/;
// this script reads and changes them. CONTRIBUTING.md explains the way of working.
//
//   npm run tasks                     the board: in progress, ready to take, waiting, done
//   npm run tasks -- show T31         one task in full
//   npm run tasks -- claim T31        take a task (commits the claim: push it at once)
//   npm run tasks -- done T31         mark your task finished (goes in with your last commit)
//   npm run tasks -- release T31      give a task back
//   npm run tasks -- scope            did this branch change only the files of its task?
//   npm run tasks -- check            is the board itself in order? (the tests run this too)
//   npm run progress                  write PROGRESS.md from the board (on main only)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'tasks');
const STATUSES = ['open', 'claimed', 'review', 'done'];
const LISTS = ['needs', 'files', 'touches'];
const NUMBERS = ['milestone', 'weight', 'progress'];
/** Any task branch may change these: the pinned hashes move whenever the rules of the game do. */
const ANYONE = ['tests/golden.json'];
/** Written from the board, on main only. A task branch leaves it alone. */
const GENERATED = ['PROGRESS.md'];

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).replace(/\s+$/, '');
}
function tryGit(args) {
  try {
    return git(args);
  } catch {
    return '';
  }
}
const lines = (text) => text.split('\n').filter((l) => l.trim() !== '');

function fail(message) {
  console.error(message);
  process.exit(1);
}

// ---------------------------------------------------------------- reading the board

const clean = (v) =>
  v
    .replace(/\s+#.*$/, '')
    .trim()
    .replace(/^["']|["']$/g, '');

function readTask(file) {
  const text = readFileSync(join(DIR, file), 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`tasks/${file}: the file must begin with its fields between two lines of ---`);
  const t = { file, body: m[2], id: '', title: '', status: '', owner: '', milestone: 0, weight: 0, progress: 0, needs: [], files: [], touches: [] };
  let list = null;
  for (const line of m[1].split('\n')) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const item = /^\s+-\s+(.+)$/.exec(line);
    if (item) {
      if (!list) throw new Error(`tasks/${file}: "${line.trim()}" is not under a list`);
      t[list].push(clean(item[1]));
      continue;
    }
    const kv = /^([a-z]+):(.*)$/.exec(line);
    if (!kv) throw new Error(`tasks/${file}: cannot read the line "${line}"`);
    const key = kv[1];
    const value = clean(kv[2]);
    list = null;
    if (LISTS.includes(key)) {
      if (value.startsWith('['))
        t[key] = value
          .replace(/^\[|\]$/g, '')
          .split(',')
          .map(clean)
          .filter(Boolean);
      else if (value === '') list = key;
      else throw new Error(`tasks/${file}: "${key}" is a list: write [a, b] or one "- item" per line`);
    } else if (NUMBERS.includes(key)) t[key] = Number(value);
    else if (key in t) t[key] = value;
    else throw new Error(`tasks/${file}: unknown field "${key}"`);
  }
  return t;
}

function readBoard() {
  if (!existsSync(DIR)) fail('There is no tasks/ folder here.');
  return readdirSync(DIR)
    .filter((f) => /^T\d+.*\.md$/.test(f))
    .sort()
    .map(readTask);
}

/** Change fields at the top of a task file, leaving everything else as it was written. */
function setFields(t, fields) {
  const path = join(DIR, t.file);
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const end = text.indexOf('\n---\n', 4);
  let head = text.slice(0, end);
  for (const [key, value] of Object.entries(fields)) {
    const line = new RegExp(`^${key}:.*$`, 'm');
    if (value === null) head = head.replace(new RegExp(`^${key}:.*\\n?`, 'm'), '');
    else if (line.test(head)) head = head.replace(line, `${key}: ${value}`.trimEnd());
    else head = `${head.replace(/\n+$/, '')}\n${key}: ${value}`;
  }
  writeFileSync(path, head.replace(/\n+$/, '') + text.slice(end));
}

// ---------------------------------------------------------------- whose file is it

function toRegex(pattern) {
  const body = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${body}$`);
}
const matches = (path, patterns) => patterns.some((p) => toRegex(p).test(path));

/** Every path the board could be talking about: what git tracks, and what the tasks name. */
function knownPaths(tasks) {
  const named = tasks.flatMap((t) => [...t.files, ...t.touches]).map((p) => p.replace(/\*+/g, 'x'));
  return [...new Set([...lines(tryGit(['ls-files'])), ...named])];
}

/** Paths that both lists of patterns cover. */
const shared = (a, b, paths) => paths.filter((p) => matches(p, a) && matches(p, b));

const active = (t) => t.status === 'claimed' || t.status === 'review';
const isDone = (t) => t.status === 'done';
const index = (tasks) => new Map(tasks.map((t) => [t.id, t]));
const waitingOn = (t, byId) => t.needs.filter((n) => !byId.get(n) || !isDone(byId.get(n)));
const branchOf = (t) => `task/${t.file.replace(/\.md$/, '')}`;

/** The tasks in progress whose own files this task would also change. */
function clashes(t, tasks, paths) {
  const out = [];
  for (const other of tasks) {
    if (other === t || !active(other)) continue;
    const both = shared(t.files, other.files, paths);
    if (both.length) out.push({ other, paths: both, hard: true });
    const lean = [...shared(t.touches, other.files, paths), ...shared(t.files, other.touches, paths)];
    if (lean.length) out.push({ other, paths: [...new Set(lean)], hard: false });
  }
  return out;
}

// ---------------------------------------------------------------- is the board in order

function problems(tasks) {
  const out = [];
  const byId = index(tasks);
  const seen = new Set();
  for (const t of tasks) {
    const at = `tasks/${t.file}`;
    if (!/^T\d{2,3}$/.test(t.id)) out.push(`${at}: the id must look like T31`);
    if (seen.has(t.id)) out.push(`${at}: another task is also ${t.id}`);
    seen.add(t.id);
    if (!t.file.startsWith(`${t.id}-`)) out.push(`${at}: the file name must begin with ${t.id}-`);
    if (!t.title) out.push(`${at}: no title`);
    if (!STATUSES.includes(t.status)) out.push(`${at}: status must be one of ${STATUSES.join(', ')}`);
    if (!Number.isFinite(t.weight) || t.weight < 0) out.push(`${at}: weight must be a number, zero or more`);
    if (!Number.isInteger(t.milestone)) out.push(`${at}: milestone must be a whole number`);
    if (!Number.isFinite(t.progress) || t.progress < 0 || t.progress > 100) out.push(`${at}: progress is a percentage`);
    if (active(t) && !t.owner) out.push(`${at}: it is ${t.status} but has no owner`);
    if (t.status === 'open' && t.owner) out.push(`${at}: it is open but has an owner`);
    for (const n of t.needs) if (!byId.has(n)) out.push(`${at}: needs ${n}, which does not exist`);
    if (!isDone(t)) {
      if (t.files.length === 0) out.push(`${at}: lists no files, so nobody can tell whose work is whose`);
      if (!/^## Done when/m.test(t.body)) out.push(`${at}: say when it is done, under "## Done when"`);
      for (const p of [...t.files, ...t.touches]) {
        if (matches(p, GENERATED)) out.push(`${at}: ${p} is written from the board and belongs to no task`);
        if (p.startsWith('/') || p.includes('\\')) out.push(`${at}: write ${p} from the top of the repository, with forward slashes`);
      }
    }
  }
  // nothing may need itself, however far round
  const state = new Map();
  const visit = (id, trail) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      out.push(`The tasks ${[...trail, id].join(' -> ')} need each other in a circle`);
      return;
    }
    state.set(id, 1);
    for (const n of byId.get(id)?.needs ?? []) if (byId.has(n)) visit(n, [...trail, id]);
    state.set(id, 2);
  };
  for (const t of tasks) visit(t.id, []);
  // the promise of the board: two tasks in progress never own the same file
  const paths = knownPaths(tasks);
  const busy = tasks.filter(active);
  for (let i = 0; i < busy.length; i++) {
    for (let j = i + 1; j < busy.length; j++) {
      const a = busy[i];
      const b = busy[j];
      // one person doing two tasks one after the other is not a clash
      if (a.owner === b.owner) continue;
      const both = shared(a.files, b.files, paths);
      if (both.length) out.push(`${a.id} (${a.owner}) and ${b.id} (${b.owner}) are both in progress and both own ${both.slice(0, 4).join(', ')}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- numbers

const earned = (t) => t.weight * (isDone(t) ? 1 : active(t) ? Math.min(100, t.progress) / 100 : 0);
const total = (tasks) => tasks.reduce((s, t) => s + t.weight, 0) || 1;
const percent = (tasks) => (100 * tasks.reduce((s, t) => s + earned(t), 0)) / total(tasks);
const share = (t, tasks) => `${+((100 * t.weight) / total(tasks)).toFixed(1)}%`;

// ---------------------------------------------------------------- commands

function show(tasks) {
  const byId = index(tasks);
  const pad = (s, n) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
  const row = (t, note) => console.log(`  ${pad(t.id, 5)}${pad(t.title, 62)} ${note}`);
  console.log(`RESOUND task board: ${Math.round(percent(tasks))}% of the game is built\n`);
  const busy = tasks.filter(active);
  console.log('In progress');
  if (!busy.length) console.log('  (nothing)');
  for (const t of busy) row(t, `${t.owner}${t.progress ? `, ${t.progress}%` : ''}${t.status === 'review' ? ', in review' : ''}`);
  const open = tasks.filter((t) => t.status === 'open');
  const ready = open.filter((t) => waitingOn(t, byId).length === 0);
  console.log('\nReady to take   (npm run tasks -- claim <id>)');
  if (!ready.length) console.log('  (nothing: everything open is waiting on a task in progress)');
  const paths = knownPaths(tasks);
  for (const t of ready) {
    const hard = clashes(t, tasks, paths).filter((c) => c.hard);
    row(t, hard.length ? `after ${hard.map((c) => c.other.id).join(', ')} (same files)` : share(t, tasks));
  }
  const waiting = open.filter((t) => waitingOn(t, byId).length > 0);
  console.log('\nWaiting on other tasks');
  if (!waiting.length) console.log('  (nothing)');
  for (const t of waiting) row(t, `needs ${waitingOn(t, byId).join(', ')}`);
  console.log(
    `\nDone: ${tasks
      .filter(isDone)
      .map((t) => t.id)
      .join(' ')}`,
  );
  const bad = problems(tasks);
  if (bad.length) console.log(`\nThe board has problems:\n${bad.map((p) => `  ${p}`).join('\n')}`);
}

function need(tasks, id) {
  const t = index(tasks).get((id ?? '').toUpperCase());
  if (!t) fail(id ? `There is no task ${id}. Run "npm run tasks" to see the board.` : 'Say which task, for example: npm run tasks -- claim T31');
  return t;
}

function one(tasks, id) {
  const t = need(tasks, id);
  console.log(readFileSync(join(DIR, t.file), 'utf8'));
  console.log(`Branch: ${branchOf(t)}`);
}

function commit(t, message, flags) {
  if (flags.noCommit) return;
  const path = `tasks/${t.file}`;
  git(['add', '--', path]);
  git(['commit', '-q', '-m', message, '--', path]);
}

function claim(tasks, id, flags) {
  const t = need(tasks, id);
  const byId = index(tasks);
  if (t.status !== 'open') fail(`${t.id} is ${t.status}${t.owner ? ` (${t.owner})` : ''}. Pick another: npm run tasks`);
  const missing = waitingOn(t, byId);
  if (missing.length && !flags.force) fail(`${t.id} needs ${missing.join(', ')} first. (--force takes it anyway, if you have agreed that with whoever is on ${missing.join(', ')}.)`);
  const owner = flags.as || tryGit(['config', 'user.name']);
  if (!owner) fail('Say who you are: npm run tasks -- claim T31 --as "Your Name"');
  const found = clashes(t, tasks, knownPaths(tasks)).filter((c) => c.other.owner !== owner);
  const hard = found.filter((c) => c.hard);
  if (hard.length && !flags.force) {
    fail(hard.map((c) => `${t.id} would change ${c.paths.slice(0, 4).join(', ')}, which ${c.other.id} (${c.other.owner}) is working in. Wait for it, or take another task.`).join('\n'));
  }
  const branch = tryGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  setFields(t, { status: 'claimed', owner });
  commit(t, `Claim ${t.id}: ${t.title}`, flags);
  console.log(`${t.id} is yours: ${t.title}`);
  for (const c of found.filter((x) => !x.hard))
    console.log(`Note: ${c.other.id} (${c.other.owner}) is working in ${c.paths.slice(0, 4).join(', ')}, which this task also touches. Keep your changes there small, and tell them.`);
  if (!flags.noCommit) {
    if (branch !== 'main') console.log(`Note: the claim was committed on "${branch}". Claims belong on main, where everyone sees them.`);
    console.log(
      `\nNext:\n  git push                      the claim counts once this succeeds; if it is refused, pull and look again\n  git switch -c ${branchOf(t)}\n  ... build, inside the files the task lists ...\n  npm run check && npm run tasks -- scope`,
    );
  }
}

function finish(tasks, id) {
  const t = need(tasks, id);
  if (isDone(t)) fail(`${t.id} is already done.`);
  setFields(t, { status: 'done', progress: null });
  console.log(`${t.id} is marked done. Commit tasks/${t.file} with the last of the work.`);
}

function release(tasks, id, flags) {
  const t = need(tasks, id);
  if (!active(t)) fail(`${t.id} is ${t.status}; there is nothing to give back.`);
  setFields(t, { status: 'open', owner: '' });
  commit(t, `Release ${t.id}: ${t.title}`, flags);
  console.log(`${t.id} is open again.`);
}

/** Did this branch stay inside its task? Compares what it changed with what the task lists. */
function scope(tasks, flags) {
  const branch = flags.branch || tryGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  const m = /^task\/(T\d+)/.exec(branch);
  if (!m) {
    console.log(`"${branch}" is not a task branch (they are called task/T31-name), so there is nothing to compare.`);
    return;
  }
  const t = need(tasks, m[1]);
  const base = flags.base || 'main';
  const from = tryGit(['merge-base', base, 'HEAD']);
  if (!from) fail(`Cannot find where this branch left ${base}.`);
  const changed = new Set([...lines(git(['diff', '--name-only', from, 'HEAD'])), ...lines(git(['diff', '--name-only', 'HEAD'])), ...lines(git(['ls-files', '--others', '--exclude-standard']))]);
  const mine = [...t.files, ...t.touches, `tasks/${t.file}`, ...ANYONE];
  const outside = [...changed].filter((f) => !matches(f, mine)).sort();
  const touched = [...changed].filter((f) => matches(f, t.touches)).sort();
  if (touched.length) console.log(`Shared files this branch changed (keep these changes small; they are where branches meet):\n${touched.map((f) => `  ${f}`).join('\n')}\n`);
  if (outside.length) {
    console.error(`${t.id} changed files it does not list:\n${outside.map((f) => `  ${f}${matches(f, GENERATED) ? '   (written from the board, on main only)' : ''}`).join('\n')}`);
    console.error(
      `\nEither take the change out, or add the file to tasks/${t.file} (under "files" if it is yours alone, under "touches" if others use it) and check the board still agrees: npm run tasks -- check`,
    );
    process.exit(1);
  }
  console.log(`${t.id}: all ${changed.size} changed files belong to the task.`);
}

function check(tasks) {
  const bad = problems(tasks);
  if (bad.length) fail(`The task board has problems:\n${bad.map((p) => `  ${p}`).join('\n')}`);
  console.log(`The task board is in order: ${tasks.length} tasks, ${tasks.filter(active).length} in progress, ${tasks.filter(isDone).length} done.`);
}

/** PROGRESS.md, written from the board. */
function progress(tasks) {
  const byId = index(tasks);
  const names = JSON.parse(readFileSync(join(DIR, 'milestones.json'), 'utf8'));
  const notes = readFileSync(join(DIR, 'notes.md'), 'utf8').replace(/\r\n/g, '\n').trim();
  const busy = tasks.filter(active);
  const open = tasks.filter((t) => t.status === 'open');
  const ready = open.filter((t) => waitingOn(t, byId).length === 0);
  const waiting = open.filter((t) => waitingOn(t, byId).length > 0);
  const done = tasks.filter(isDone);
  const link = (t) => `[${t.id}](tasks/${t.file})`;
  const out = [];
  out.push('# RESOUND: progress', '');
  out.push('<!-- Written by "npm run progress" from the files in tasks/. Do not edit it by hand: change the task files and run that again. -->', '');
  out.push(
    'Where the build stands and what is left. The design is in [DESIGN.md](DESIGN.md), how to run the game is in [README.md](README.md), and how to take one of the tasks below is in [CONTRIBUTING.md](CONTRIBUTING.md).',
    '',
  );
  out.push(
    `**Overall: about ${Math.round(percent(tasks))}% complete.** ${done.length} of ${tasks.length} tasks are done, ${busy.length} in progress, ${ready.length} ready to take, ${waiting.length} waiting on others. Each task counts for its share of the whole game.`,
    '',
  );
  out.push('| # | Milestone | Share | Done |', '|---|---|---|---|');
  for (const m of names) {
    const mine = tasks.filter((t) => t.milestone === m.n);
    const w = mine.reduce((s, t) => s + t.weight, 0);
    const got = mine.reduce((s, t) => s + earned(t), 0);
    out.push(`| ${m.n} | ${m.name} | ${+((100 * w) / total(tasks)).toFixed(1)}% | ${w ? Math.round((100 * got) / w) : 0}% |`);
  }
  out.push('', '## In progress', '');
  if (!busy.length) out.push('Nothing at the moment.');
  for (const t of busy) out.push(`- ${link(t)} **${t.title}**: ${t.owner}${t.progress ? `, about ${t.progress}% there` : ''}${t.status === 'review' ? ', in review' : ''}`);
  out.push('', '## To do: ready to take', '');
  if (!ready.length) out.push('Nothing: everything still open is waiting on a task in progress.');
  for (const t of ready) out.push(`- ${link(t)} **${t.title}** (${share(t, tasks)} of the game)`);
  out.push('', '## To do: waiting on other tasks', '');
  if (!waiting.length) out.push('Nothing.');
  for (const t of waiting) out.push(`- ${link(t)} **${t.title}** (${share(t, tasks)}): needs ${waitingOn(t, byId).join(', ')}`);
  out.push('', '## Done', '');
  for (const t of done) out.push(`- ${link(t)} ${t.title}`);
  out.push('', notes, '');
  writeFileSync(join(ROOT, 'PROGRESS.md'), out.join('\n'));
  console.log(`PROGRESS.md written: ${Math.round(percent(tasks))}% complete.`);
}

// ---------------------------------------------------------------- main

const argv = process.argv.slice(2);
const flags = { as: '', base: '', branch: '', force: false, noCommit: false };
const words = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--as') flags.as = argv[++i] ?? '';
  else if (a === '--base') flags.base = argv[++i] ?? '';
  else if (a === '--branch') flags.branch = argv[++i] ?? '';
  else if (a === '--force') flags.force = true;
  else if (a === '--no-commit') flags.noCommit = true;
  else words.push(a);
}

let board;
try {
  board = readBoard();
} catch (err) {
  fail(String(err instanceof Error ? err.message : err));
}
const [command = 'list', id] = words;
if (command === 'list') show(board);
else if (command === 'show') one(board, id);
else if (command === 'claim') claim(board, id, flags);
else if (command === 'done') finish(board, id);
else if (command === 'release') release(board, id, flags);
else if (command === 'scope') scope(board, flags);
else if (command === 'check') check(board);
else if (command === 'progress') progress(board);
else fail(`Unknown command "${command}". Try: list, show, claim, done, release, scope, check, progress`);
