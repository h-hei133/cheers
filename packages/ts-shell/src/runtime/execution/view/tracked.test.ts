import fs, { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { listWorkspaceFiles } from '../fileWalk.js';
import { withNativeReadView } from './index.js';
import { WalkBudget } from '../walk/budget.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracked-view-'));
  git('init', '-q');
  fs.mkdirSync(path.join(root, 'nested'));
  fs.writeFileSync(path.join(root, 'nested', 'tracked.txt'), 'ordinary source');
  fs.writeFileSync(path.join(root, 'missing.txt'), 'removed source');
  fs.writeFileSync(path.join(root, '.gitignore'), '*.tmp\n');
  git('add', '--', '.');
  fs.unlinkSync(path.join(root, 'missing.txt'));
  fs.writeFileSync(path.join(root, 'untracked.txt'), 'ordinary source');
  fs.writeFileSync(path.join(root, 'ignored.tmp'), 'ignored source');
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
function git(...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8',
    env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
}
const linux = it.skipIf(process.platform !== 'linux');

linux('keeps native index names and policy while omitting tracked file I/O', async () => {
  for (const file of ['a b.txt', 'a\nb.txt', 'a\\b.txt']) fs.writeFileSync(path.join(root, 'nested', file), 'ordinary source');
  git('add', '--', 'nested');
  const write = vi.spyOn(fsp, 'writeFile');
  const checked: string[] = [];
  const expected = git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean).sort();
  const files = await listWorkspaceFiles(root, { assertFileAccess: file => { checked.push(file); } });
  expect([...files].sort()).toEqual(expected);
  expect(files).toContain('missing.txt');
  expect(files).not.toContain('ignored.tmp');
  expect(checked).toContain(path.join(root, 'nested', 'tracked.txt'));
  const placeholders = write.mock.calls.filter(call => call[1] === '').map(call => path.basename(String(call[0]))).sort();
  expect(placeholders).toEqual(['ignored.tmp', 'untracked.txt']);
  expect(fs.readFileSync(path.join(root, 'nested', 'tracked.txt'), 'utf8')).toBe('ordinary source');
});

it.each(['git', 'search'] as const)('preserves %s metadata, links and private directory topology', async native => {
  fs.symlinkSync(path.join(root, 'nested', 'tracked.txt'), path.join(root, 'alias.txt'));
  git('add', '--', 'alias.txt');
  const mkdir = vi.spyOn(fsp, 'mkdir');
  await withNativeReadView({ root, budget: new WalkBudget(), assertFileAccess: () => {} }, async (sources, _plan, materialize) => {
    await materialize({ native, tracked: ['nested/tracked.txt', 'alias.txt', '.gitignore', 'missing.txt'] });
    expect(fs.existsSync(sources.destination(path.join(root, 'nested', 'tracked.txt')))).toBe(native === 'search');
    expect(fs.existsSync(sources.destination(path.join(root, 'untracked.txt')))).toBe(true);
    expect(fs.readFileSync(sources.destination(path.join(root, '.gitignore')), 'utf8')).toBe('*.tmp\n');
    expect(fs.lstatSync(sources.destination(path.join(root, 'alias.txt'))).isSymbolicLink()).toBe(true);
    const directory = sources.destination(path.join(root, 'nested'));
    expect(fs.statSync(directory).isDirectory()).toBe(true);
    expect(mkdir.mock.calls.filter(call => call[0] === directory)).toHaveLength(1);
  });
});

linux('still checks denied tracked files before returning native results', async () => {
  const denied = path.join(root, 'nested', 'tracked.txt');
  const files = await listWorkspaceFiles(root, { assertFileAccess: file => {
    if (file === denied) throw new Error('denied');
  } });
  expect(files).not.toContain('nested/tracked.txt');
  expect(files).toContain('untracked.txt');
});

it.each(['index', 'directory'] as const)('refuses changed %s currency after omitting tracked placeholders', async source => {
  let mirror = '';
  await expect(withNativeReadView({ root, budget: new WalkBudget(), assertFileAccess: () => {} }, async (sources, _plan, materialize) => {
    mirror = sources.mirror;
    await materialize({ native: 'git', tracked: ['nested/tracked.txt', 'missing.txt', '.gitignore'] });
    expect(fs.existsSync(sources.destination(path.join(root, 'nested', 'tracked.txt')))).toBe(false);
    if (source === 'index') fs.appendFileSync(path.join(root, '.git', 'index'), 'changed');
    else fs.writeFileSync(path.join(root, 'nested', 'new.txt'), 'new source');
  })).rejects.toThrow(/no complete native answer/i);
  expect(fs.existsSync(mirror)).toBe(false);
});
