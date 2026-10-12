import fs, { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { listWorkspaceFiles, listDirectoryEntries } from '../fileWalk.js';
import { listWorkspaceFilesViaGit, loadIgnoredViaGit } from '../ignoreRules.js';
import { searchWithRipgrep, forgetRipgrepBinary } from '../../../core/tools/grepRipgrep.js';
import { withNativeReadView } from './index.js';
import { WalkBudget } from '../walk/budget.js';

let fixture: string;
let root: string;
beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'native-view-'));
  root = path.join(fixture, 'workspace'); fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'public.txt'), 'needle public');
  fs.writeFileSync(path.join(root, 'hidden.tmp'), 'needle hidden');
  forgetRipgrepBinary();
});
afterEach(() => { vi.unstubAllEnvs(); forgetRipgrepBinary(); fs.rmSync(fixture, { recursive: true, force: true }); });
function git(...args: string[]): void {
  execFileSync('git', ['-C', root, ...args], { env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
}
const linux = it.skipIf(process.platform !== 'linux');

it.each(['failure', 'cancel'])('settles a bounded placeholder batch before %s cleanup', async scenario => {
  for (let index = 0; index < 18; index++) fs.writeFileSync(path.join(root, `item-${index}.txt`), 'source bytes');
  const controller = new AbortController();
  const writeFile = fsp.writeFile;
  const remove = fsp.rm;
  let active = 0;
  let maximum = 0;
  let attempted = 0;
  let settled = 0;
  let cleanupActive: number | undefined;
  let mirror = '';
  const writes = vi.spyOn(fsp, 'writeFile').mockImplementation(async (...args) => {
    expect(args[1]).toBe('');
    const index = attempted++;
    maximum = Math.max(maximum, ++active);
    try {
      if (index === 0 && scenario === 'failure') throw new Error('placeholder failed');
      if (index === 0 && scenario === 'cancel') controller.abort(new Error('placeholder cancelled'));
      await new Promise<void>(resolve => setImmediate(resolve));
      await writeFile(...args);
    } finally { active--; settled++; }
  });
  const cleanup = vi.spyOn(fsp, 'rm').mockImplementation(async (...args) => {
    if (args[0] === mirror) cleanupActive = active;
    return remove(...args);
  });
  try {
    const pending = withNativeReadView({ root, assertFileAccess: () => {}, abortSignal: controller.signal,
      budget: new WalkBudget(controller.signal) }, async (sources, _plan, materialize) => {
      mirror = sources.mirror;
      await materialize({ native: 'search' });
    });
    await expect(pending).rejects.toThrow(scenario === 'failure' ? 'placeholder failed' : 'placeholder cancelled');
    expect(maximum).toBeGreaterThan(1);
    expect(maximum).toBeLessThanOrEqual(8);
    expect(attempted).toBeLessThanOrEqual(8);
    expect(settled).toBe(attempted);
    expect(cleanupActive).toBe(0);
    expect(fs.existsSync(mirror)).toBe(false);
    expect(fs.readFileSync(path.join(root, 'item-0.txt'), 'utf8')).toBe('source bytes');
  } finally { writes.mockRestore(); cleanup.mockRestore(); }
});

linux('keeps tracked exceptions, nested rules, and literal names under native metadata isolation', async () => {
  git('init', '-q');
  fs.writeFileSync(path.join(root, '.gitignore'), '*.tmp\n');
  git('add', '-f', 'hidden.tmp');
  fs.mkdirSync(path.join(root, 'nested'));
  fs.writeFileSync(path.join(root, 'nested', '.gitignore'), 'hidden.txt\n');
  fs.writeFileSync(path.join(root, 'nested', 'hidden.txt'), 'hidden');
  fs.writeFileSync(path.join(root, 'line\nname.txt'), 'literal');
  const access = { assertFileAccess: (_file: string) => {} };
  const files = await listWorkspaceFiles(root, access);
  expect(files).toContain('hidden.tmp'); expect(files).toContain('line\nname.txt');
  expect(files).not.toContain('nested/hidden.txt');
  const listing = await listDirectoryEntries(root, root, access);
  expect(listing.entries.map(entry => entry.name)).toContain('hidden.tmp');
});

linux('hydrates native include chains and their winning contained excludes file', async () => {
  git('init', '-q');
  fs.writeFileSync(path.join(root, 'first.rules'), '[include]\npath=second.rules\n');
  fs.writeFileSync(path.join(root, 'second.rules'), '[core]\nexcludesFile=excluded.rules\n');
  fs.writeFileSync(path.join(root, 'excluded.rules'), 'hidden.tmp\n');
  git('config', 'include.path', '../first.rules');
  const files = await listWorkspaceFiles(root, { assertFileAccess: () => {} });
  expect(files).toContain('public.txt'); expect(files).not.toContain('hidden.tmp');
});

linux.each(['later-url', 'later-override', 'worktree-url'] as const)('preserves native remote-URL conditions with %s', async scenario => {
  git('init', '-q');
  const config = path.join(root, '.git/config');
  const conditional = '[includeIf "hasconfig:remote.*.url:https://synthetic.invalid/**"]\npath=../conditional.config\n';
  const remote = '[remote "origin"]\nurl=https://synthetic.invalid/team/project\n';
  fs.writeFileSync(path.join(root, 'conditional.config'), '[include]\npath=final.config\n');
  fs.writeFileSync(path.join(root, 'final.config'), '[core]\nexcludesFile=conditional.rules\n');
  fs.writeFileSync(path.join(root, 'conditional.rules'), 'hidden.tmp\n');
  fs.appendFileSync(config, conditional);
  if (scenario === 'worktree-url') {
    fs.appendFileSync(config, '[extensions]\nworktreeConfig=true\n');
    fs.writeFileSync(path.join(root, '.git/config.worktree'), remote);
  } else fs.appendFileSync(config, remote);
  if (scenario === 'later-override') {
    fs.appendFileSync(config, '[core]\nexcludesFile=override.rules\n');
    fs.writeFileSync(path.join(root, 'override.rules'), 'public.txt\n');
  }
  const native = execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8', env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  }).split('\0').filter(Boolean).sort();
  const original = fs.readFileSync(config);
  const pending = listWorkspaceFiles(root);
  await expect(pending.then(files => files.slice().sort())).resolves.toEqual(native);
  const files = await pending;
  expect(files).not.toContain(scenario === 'later-override' ? 'public.txt' : 'hidden.tmp');
  expect(files).toContain(scenario === 'later-override' ? 'hidden.tmp' : 'public.txt');
  expect(fs.readFileSync(config)).toEqual(original);
});

linux('stages inactive remote-URL includes without applying them and preserves missing targets', async () => {
  git('init', '-q');
  fs.writeFileSync(path.join(root, 'inactive.config'), '[core]\nexcludesFile=inactive.rules\n');
  fs.writeFileSync(path.join(root, 'inactive.rules'), 'public.txt\n');
  fs.appendFileSync(path.join(root, '.git/config'), '[includeIf "hasconfig:remote.*.url:https://other.invalid/**"]\npath=../inactive.config\n'
    + '[includeIf "hasconfig:remote.*.url:https://synthetic.invalid/**"]\npath=../missing.config\n[remote "origin"]\nurl=https://synthetic.invalid/team/project\n');
  const open = vi.spyOn(fsp, 'open');
  try {
    expect(await listWorkspaceFiles(root)).toContain('public.txt');
    expect(open.mock.calls.some(([file]) => file === path.join(root, 'inactive.config'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'missing.config'))).toBe(false);
  } finally { open.mockRestore(); }
});

linux('retains native rejection of remote URLs nested under an inactive remote-URL include', async () => {
  git('init', '-q');
  fs.writeFileSync(path.join(root, 'inactive.config'), '[include]\npath=forbidden.config\n');
  fs.writeFileSync(path.join(root, 'forbidden.config'), '[remote "forbidden"]\nurl=https://PRIVATE_REMOTE_MARKER.invalid/project\n');
  fs.appendFileSync(path.join(root, '.git/config'), '[includeIf "hasconfig:remote.*.url:https://other.invalid/**"]\npath=../inactive.config\n'
    + '[remote "origin"]\nurl=https://synthetic.invalid/team/project\n');
  await expect(listWorkspaceFiles(root)).rejects.toThrow('No complete native answer');
});

linux.each(['https://synthetic.invalid/**', 'https://other.invalid/**'])('refuses an external scan-ahead source for pattern %s before opening it', async pattern => {
  git('init', '-q');
  const outside = path.join(fixture, 'external.config');
  fs.writeFileSync(outside, '[remote "forbidden"]\nurl=https://PRIVATE_REMOTE_MARKER.invalid/project\n');
  fs.appendFileSync(path.join(root, '.git/config'), `[includeIf "hasconfig:remote.*.url:${pattern}"]\npath=${outside}\n`
    + '[remote "origin"]\nurl=https://synthetic.invalid/team/project\n');
  const open = vi.spyOn(fsp, 'open');
  try {
    await expect(listWorkspaceFiles(root)).rejects.toThrow('No complete native answer');
    expect(open.mock.calls.some(([file]) => file === outside)).toBe(false);
  } finally { open.mockRestore(); }
});

linux('refuses unauthorized Git metadata instead of silently changing tracked semantics', async () => {
  git('init', '-q'); git('add', 'public.txt');
  await expect(listWorkspaceFiles(root, { assertFileAccess: file => {
    if (file === path.join(root, '.git', 'index')) throw new Error('denied');
  } })).rejects.toThrow('No complete native answer');
});

linux('refuses an external Git include without consuming its patterns', async () => {
  git('init', '-q');
  const outside = path.join(fixture, 'outside.rules');
  fs.writeFileSync(outside, '[core]\nexcludesFile=PRIVATE_MARKER\n');
  git('config', 'include.path', outside);
  await expect(listWorkspaceFiles(root, { assertFileAccess: () => {} })).rejects.toThrow('No complete native answer');
});

linux.each(['files', 'directory', 'native files', 'native ignore'])('keeps the default %s Git query inside the workspace', async query => {
  git('init', '-q');
  const outside = path.join(fixture, 'outside.rules');
  fs.writeFileSync(outside, '[core]\nexcludesFile=PRIVATE_MARKER\n');
  git('config', 'include.path', outside);
  const result = query === 'files' ? listWorkspaceFiles(root)
    : query === 'directory' ? listDirectoryEntries(root, root)
    : query === 'native files' ? listWorkspaceFilesViaGit(root)
    : loadIgnoredViaGit(root, ['public.txt']);
  await expect(result).rejects.toThrow('No complete native answer');
});

linux('does not admit an inactive conditional include', async () => {
  git('init', '-q');
  const outside = path.join(fixture, 'inactive.rules');
  fs.writeFileSync(outside, '[core]\nexcludesFile=outside.rules\n');
  fs.appendFileSync(path.join(root, '.git', 'config'), `[includeIf "gitdir:/never-matching-root/"]\n\tpath = ${outside}\n`);
  const checked: string[] = [];
  const files = await listWorkspaceFiles(root, { assertFileAccess: file => checked.push(file) });
  expect(files).toContain('public.txt');
  expect(checked).not.toContain(outside);
});

linux('admits an active Git directory conditional include', async () => {
  git('init', '-q');
  fs.writeFileSync(path.join(root, 'excluded.rules'), 'hidden.tmp\n');
  fs.writeFileSync(path.join(root, 'hidden.tmp'), 'hidden');
  const gitDirectory = path.join(root, '.git').split(path.sep).join('/');
  fs.appendFileSync(path.join(root, '.git', 'config'), `[includeIf "gitdir:${gitDirectory}"]\n\tpath = ../included.rules\n`);
  fs.writeFileSync(path.join(root, 'included.rules'), '[core]\n\texcludesFile = excluded.rules\n');
  const files = await listWorkspaceFiles(root, { assertFileAccess: () => {} });
  expect(files).not.toContain('hidden.tmp');
});

linux('retains Git branch identity while admitting conditional includes', async () => {
  git('init', '-q'); git('symbolic-ref', 'HEAD', 'refs/heads/topic');
  fs.appendFileSync(path.join(root, '.git', 'config'), '[includeIf "onbranch:topic"]\npath=../included.rules\n');
  fs.writeFileSync(path.join(root, 'included.rules'), '[core]\nexcludesFile=excluded.rules\n');
  fs.writeFileSync(path.join(root, 'excluded.rules'), 'hidden.tmp\n');
  expect(await listWorkspaceFiles(root)).not.toContain('hidden.tmp');
});

linux('native search cannot consume denied or escaping implicit ignore files', async () => {
  const outside = path.join(fixture, 'outside.ignore'); fs.writeFileSync(outside, 'public.txt\n');
  fs.symlinkSync(outside, path.join(root, '.ignore'));
  fs.writeFileSync(path.join(root, '.rgignore'), 'public.txt\n');
  const result = await searchWithRipgrep({ pattern: 'needle', searchPath: '', limit: 10, workspaceRoot: root,
    assertFileAccess: file => { if (file === path.join(root, '.rgignore')) throw new Error('denied'); },
  });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.matches.map(match => match.path)).toContain('public.txt');
});

linux.each(['explicit target', 'priority', 'outside repository'])('preserves native search rules for %s', async scenario => {
  fs.mkdirSync(path.join(root, 'nested'));
  fs.writeFileSync(path.join(root, 'nested', 'visible.txt'), 'needle nested');
  fs.writeFileSync(path.join(root, '.gitignore'), 'nested/\n');
  if (scenario !== 'outside repository') git('init', '-q');
  if (scenario === 'priority') fs.writeFileSync(path.join(root, '.ignore'), '!nested/\n');
  const result = await searchWithRipgrep({ pattern: 'needle', searchPath: scenario === 'explicit target' ? 'nested' : '',
    limit: 10, workspaceRoot: root, assertFileAccess: () => {},
  });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.matches.map(match => match.path)).toContain('nested/visible.txt');
});

linux('a direct listing does not descend into unrelated source directories', async () => {
  git('init', '-q');
  fs.mkdirSync(path.join(root, 'unrelated', 'deep'), { recursive: true });
  const deepFile = path.join(root, 'unrelated', 'deep', 'file.txt');
  fs.writeFileSync(deepFile, 'content');
  const checked: string[] = [];
  const listing = await listDirectoryEntries(root, root, { assertFileAccess: file => { checked.push(file); } });
  expect(listing.entries.map(entry => entry.name)).toContain('public.txt');
  expect(checked).not.toContain(deepFile);
});

linux('uses the selected nested repository instead of its enclosing repository', async () => {
  git('init', '-q');
  fs.writeFileSync(path.join(root, '.gitignore'), '*.tmp\n');
  const nested = path.join(root, 'nested'); fs.mkdirSync(nested);
  execFileSync('git', ['init', '-q', nested]);
  fs.writeFileSync(path.join(nested, 'visible.tmp'), 'content');
  const listing = await listDirectoryEntries(root, nested, { assertFileAccess: () => {} });
  expect(listing.entries.map(entry => entry.name)).toContain('visible.tmp');
});

linux('keeps ancestor repository rules for a default directory listing', async () => {
  git('init', '-q');
  fs.writeFileSync(path.join(root, '.gitignore'), '*.tmp\n');
  const nested = path.join(root, 'nested'); fs.mkdirSync(nested);
  fs.writeFileSync(path.join(nested, 'visible.txt'), 'content');
  fs.writeFileSync(path.join(nested, 'hidden.tmp'), 'content');
  git('add', '-f', 'nested/hidden.tmp');
  expect((await listDirectoryEntries(root, nested)).entries.map(entry => entry.name)).toContain('hidden.tmp');
});

linux('uses fallback rules for a non-repository child directory', async () => {
  const nested = path.join(root, 'nested'); fs.mkdirSync(nested);
  fs.writeFileSync(path.join(nested, '.ignore'), '*.tmp\n');
  fs.writeFileSync(path.join(nested, 'public.txt'), 'public');
  fs.writeFileSync(path.join(nested, 'hidden.tmp'), 'hidden');
  const listing = await listDirectoryEntries(root, nested);
  expect(listing.entries.map(entry => entry.name)).toContain('public.txt');
  expect(listing.entries.map(entry => entry.name)).not.toContain('hidden.tmp');
  expect(listing.omittedCount).toBe(1);
});

linux.each([0, 1])('refuses launcher exit %s without a native child completion', async exitCode => {
  fs.writeFileSync(path.join(fixture, 'bwrap'), `#!/bin/sh\nexit ${exitCode}\n`, { mode: 0o755 });
  vi.stubEnv('PATH', `${fixture}${path.delimiter}${process.env.PATH}`);
  await expect(listWorkspaceFiles(root)).rejects.toThrow('No complete native answer');
  expect(await searchWithRipgrep({ pattern: 'needle', searchPath: '', limit: 10, workspaceRoot: root })).toEqual({ ok: false, reason: 'failed' });
});

linux('accepts a genuine empty native candidate enumeration', async () => {
  fs.mkdirSync(path.join(root, 'empty'));
  expect(await searchWithRipgrep({ pattern: 'needle', searchPath: 'empty', limit: 10, workspaceRoot: root })).toEqual({ ok: true, matches: [] });
});

linux('refuses a later external include before evaluating an earlier conditional include', async () => {
  git('init', '-q');
  fs.appendFileSync(path.join(root, '.git', 'config'), '[includeIf "gitdir:/never-matching-root/"]\npath=/outside/inactive\n[include]\npath=/usr/lib/os-release\n');
  await expect(listWorkspaceFiles(root)).rejects.toThrow('Native enumeration metadata is unavailable');
});

linux('keeps a contained metadata symlink bound to its verified source', async () => {
  git('init', '-q');
  const config = path.join(root, '.git', 'config');
  const source = path.join(root, 'repository.config');
  fs.renameSync(config, source); fs.symlinkSync(source, config);
  git('add', '-f', 'hidden.tmp');
  fs.writeFileSync(path.join(root, '.gitignore'), '*.tmp\n');
  expect(await listWorkspaceFiles(root, { assertFileAccess: () => {} })).toContain('hidden.tmp');
});

linux('does not read unrelated Git metadata', async () => {
  git('init', '-q');
  const unrelated = path.join(root, '.git', 'description');
  fs.writeFileSync(unrelated, 'metadata that the listing does not need');
  const files = await listWorkspaceFiles(root, { assertFileAccess: file => {
    if (file === unrelated) throw new Error('unrelated metadata was read');
  } });
  expect(files).toContain('public.txt');
});

linux('starts Git ignore rules anew inside a nested repository during search', async () => {
  git('init', '-q');
  fs.writeFileSync(path.join(root, '.gitignore'), 'cache.tmp/\n');
  const nested = path.join(root, 'nested'); fs.mkdirSync(nested);
  execFileSync('git', ['init', '-q', nested]);
  fs.mkdirSync(path.join(nested, 'cache.tmp'));
  fs.writeFileSync(path.join(nested, 'cache.tmp', 'item.txt'), 'needle nested');
  const result = await searchWithRipgrep({ pattern: 'needle', searchPath: '', limit: 10, workspaceRoot: root, assertFileAccess: () => {} });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.matches.map(match => match.path)).toContain('nested/cache.tmp/item.txt');
});

linux('uses native case folding while pruning ignored directories', async () => {
  git('init', '-q'); git('config', 'core.ignoreCase', 'true');
  fs.writeFileSync(path.join(root, '.gitignore'), 'foo/\n!FOO/\n');
  fs.mkdirSync(path.join(root, 'foo'));
  fs.writeFileSync(path.join(root, 'foo', 'item.txt'), 'content');
  expect(await listWorkspaceFiles(root, { assertFileAccess: () => {} })).toContain('foo/item.txt');
});
