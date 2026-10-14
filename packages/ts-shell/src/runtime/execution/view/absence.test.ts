import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { listDirectoryEntries } from '../fileWalk.js';
import { listWorkspaceFilesViaGit } from '../ignoreRules.js';
import { searchWithRipgrep, forgetRipgrepBinary } from '../../../core/tools/grepRipgrep.js';
import { collectSearchFiles } from '../../../core/tools/searchFiles.js';
import { withNativeReadView } from './index.js';
import { WalkBudget } from '../walk/budget.js';

let fixture: string;
let root: string;
beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'native-absence-'));
  root = path.join(fixture, 'workspace');
  fs.mkdirSync(root);
  forgetRipgrepBinary();
});
afterEach(() => { vi.restoreAllMocks(); forgetRipgrepBinary(); fs.rmSync(fixture, { recursive: true, force: true }); });
const linux = it.skipIf(process.platform !== 'linux');
function git(...args: string[]): void {
  execFileSync('git', ['-C', root, ...args], { env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
}
function childWrite(file: string, content: string): void {
  execFileSync(process.execPath, ['-e', 'const fs=require("node:fs"),path=require("node:path"); fs.mkdirSync(path.dirname(process.argv[1]),{recursive:true}); fs.writeFileSync(process.argv[1],process.argv[2]);', file, content]);
}

linux.each(['git', 'search'] as const)('refuses %s results after a child adds an initially absent ancestor rule', async mode => {
  git('init', '-q');
  const nested = path.join(root, 'nested');
  fs.mkdirSync(nested);
  fs.writeFileSync(path.join(nested, 'public.txt'), 'needle public');
  const rules = path.join(root, mode === 'git' ? '.gitignore' : '.ignore');
  const exists = fs.existsSync;
  let changed = false;
  vi.spyOn(fs, 'existsSync').mockImplementation(file => {
    const found = exists(file);
    if (file === rules && !found && !changed) {
      childWrite(rules, 'nested/public.txt\n');
      changed = true;
    }
    return found;
  });
  if (mode === 'git') await expect(listDirectoryEntries(root, nested)).rejects.toThrow(/no complete native answer/i);
  else await expect(searchWithRipgrep({ workspaceRoot: root, searchPath: 'nested', pattern: 'needle', limit: 10,
    assertFileAccess: () => {} })).resolves.toEqual({ ok: false, reason: 'failed' });
  expect(changed).toBe(true);
  expect(fs.readFileSync(path.join(nested, 'public.txt'), 'utf8')).toBe('needle public');
});

linux('refuses an absent repository result after a child creates its marker', async () => {
  fs.writeFileSync(path.join(root, 'public.txt'), 'public');
  const marker = path.join(root, '.git');
  const exists = fs.existsSync;
  let changed = false;
  vi.spyOn(fs, 'existsSync').mockImplementation(file => {
    const found = exists(file);
    if (file === marker && !found && !changed) {
      git('init', '-q');
      changed = true;
    }
    return found;
  });
  await expect(listWorkspaceFilesViaGit(root)).rejects.toThrow(/no complete native answer/i);
  expect(changed).toBe(true);
});

linux('refuses an initially missing include after a child creates its parent and config', async () => {
  git('init', '-q');
  fs.writeFileSync(path.join(root, 'public.txt'), 'public');
  fs.mkdirSync(path.join(root, 'rules'));
  const include = path.join(root, 'rules', 'new', 'local.config');
  const excludes = path.join(root, 'excluded.rules');
  fs.writeFileSync(excludes, 'public.txt\n');
  git('config', 'include.path', '../rules/new/local.config');
  const stat = fs.statSync;
  let changed = false;
  vi.spyOn(fs, 'statSync').mockImplementation(((...args: Parameters<typeof fs.statSync>) => {
    try { return stat(...args); }
    catch (error) {
      if (args[0] === include && args[1] && typeof args[1] === 'object' && args[1].bigint && !changed) {
        childWrite(include, `[core]\nexcludesFile=${excludes}\n`);
        changed = true;
      }
      throw error;
    }
  }) as typeof fs.statSync);
  await expect(listWorkspaceFilesViaGit(root)).rejects.toThrow(/no complete native answer/i);
  expect(changed).toBe(true);
});

linux('checks observed directories before publishing a no-repository decision', async () => {
  let mirror = '';
  const pending = withNativeReadView({ root, assertFileAccess: () => {}, budget: new WalkBudget() }, async sources => {
    mirror = sources.mirror;
    await sources.observeDirectory(root);
    childWrite(path.join(root, '.gitignore'), 'public.txt\n');
    return null;
  });
  await expect(pending).rejects.toThrow(/no complete native answer/i);
  expect(fs.existsSync(mirror)).toBe(false);
});

linux('refuses search results after a child adds an initially absent repository exclude', async () => {
  git('init', '-q');
  fs.writeFileSync(path.join(root, 'public.txt'), 'needle public');
  const excludes = path.join(root, '.git', 'info', 'exclude');
  fs.unlinkSync(excludes);
  const exists = fs.existsSync;
  const stat = fs.statSync;
  let changed = false;
  const change = (): void => {
    if (!changed) { childWrite(excludes, 'public.txt\n'); changed = true; }
  };
  vi.spyOn(fs, 'existsSync').mockImplementation(file => {
    const found = exists(file);
    if (file === excludes && !found) change();
    return found;
  });
  vi.spyOn(fs, 'statSync').mockImplementation(((...args: Parameters<typeof fs.statSync>) => {
    try { return stat(...args); }
    catch (error) {
      if (args[0] === excludes && args[1] && typeof args[1] === 'object' && args[1].bigint) change();
      throw error;
    }
  }) as typeof fs.statSync);
  await expect(searchWithRipgrep({ workspaceRoot: root, searchPath: '', pattern: 'needle', limit: 10,
    assertFileAccess: () => {} })).resolves.toEqual({ ok: false, reason: 'failed' });
  expect(changed).toBe(true);
});

linux.each([false, true])('refuses an optional parent alias retarget with cached target %s', async cached => {
  git('init', '-q');
  fs.writeFileSync(path.join(root, 'public.txt'), 'public');
  const first = path.join(root, 'first');
  const second = path.join(root, 'second');
  const links = path.join(root, 'links');
  for (const directory of [first, second, links]) fs.mkdirSync(directory);
  const alias = path.join(links, 'rules');
  fs.symlinkSync('../first', alias);
  const excludes = path.join(root, 'excluded.rules');
  fs.writeFileSync(excludes, 'public.txt\n');
  fs.writeFileSync(path.join(second, 'local.config'), `[core]\nexcludesFile=${excludes}\n`);
  if (cached) git('config', '--add', 'include.path', '../first/absent.config');
  git('config', '--add', 'include.path', '../links/rules/local.config');
  const stat = fs.statSync;
  let changed = false;
  const observed: string[] = [];
  vi.spyOn(fs, 'statSync').mockImplementation(((...args: Parameters<typeof fs.statSync>) => {
    try { return stat(...args); }
    catch (error) {
      if (args[0] === path.join(first, 'local.config') && args[1] && typeof args[1] === 'object' && args[1].bigint && !changed) {
        execFileSync(process.execPath, ['-e', 'const fs=require("node:fs"); fs.unlinkSync(process.argv[1]); fs.symlinkSync("../second",process.argv[1]);', alias]);
        changed = true;
      }
      throw error;
    }
  }) as typeof fs.statSync);
  await expect(listWorkspaceFilesViaGit(root, undefined, undefined, {
    onCapturedSource: source => { observed.push(source.path); },
  })).rejects.toThrow(/no complete native answer/i);
  expect(changed).toBe(true);
  expect(observed).toContain(alias);
});

linux.each(['git', 'search'] as const)('refuses %s results after a captured directory changes during view cleanup', async mode => {
  git('init', '-q');
  const nested = path.join(root, 'nested');
  fs.mkdirSync(nested);
  fs.writeFileSync(path.join(nested, 'public.txt'), 'public');
  const remove = fs.promises.rm;
  let changed = false;
  let mirror = '';
  vi.spyOn(fs.promises, 'rm').mockImplementation(async (...args) => {
    if (!changed && path.basename(String(args[0])).startsWith('cheers-native-read-')) {
      mirror = String(args[0]);
      childWrite(path.join(nested, 'new.txt'), 'new');
      changed = true;
    }
    return remove(...args);
  });
  if (mode === 'git') await expect(listWorkspaceFilesViaGit(root)).rejects.toThrow(/no complete native answer/i);
  else {
    await expect(collectSearchFiles({ binary: 'rg', args: ['--no-config', '--files', '--hidden', '--null', '--glob', '!.git/**'],
      workspaceRoot: root, assertFileAccess: () => {} })).resolves.toEqual({ ok: false, reason: 'failed' });
  }
  expect(changed).toBe(true);
  expect(fs.existsSync(mirror)).toBe(false);
  expect(fs.readFileSync(path.join(nested, 'new.txt'), 'utf8')).toBe('new');
});

linux('refuses a no-repository decision after its observed root changes during view cleanup', async () => {
  const remove = fs.promises.rm;
  let changed = false;
  let mirror = '';
  vi.spyOn(fs.promises, 'rm').mockImplementation(async (...args) => {
    if (!changed && path.basename(String(args[0])).startsWith('cheers-native-read-')) {
      mirror = String(args[0]);
      childWrite(path.join(root, '.gitignore'), 'public.txt\n');
      changed = true;
    }
    return remove(...args);
  });
  await expect(listWorkspaceFilesViaGit(root)).rejects.toThrow(/no complete native answer/i);
  expect(changed).toBe(true);
  expect(fs.existsSync(mirror)).toBe(false);
});
