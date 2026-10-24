import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { inspectWorkspaceFile, readTextFile, readTextFileAsync, workspaceFilePath } from './files.js';
import { createWorkspaceWriteAuthority } from '../../edit/authority/workspace.js';

let fixture: string;
let workspace: string;
let sibling: string;
beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(process.cwd(), '.tmp-workspace-files-'));
  workspace = path.join(fixture, 'Root'); sibling = path.join(fixture, 'Outside');
  fs.mkdirSync(workspace); fs.mkdirSync(sibling);
  fs.writeFileSync(path.join(workspace, 'inside.txt'), '\ufeffinside\r\n');
  fs.writeFileSync(path.join(sibling, 'inside.txt'), 'outside same name');
  fs.writeFileSync(path.join(sibling, 'outside.txt'), 'outside');
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(fixture, { recursive: true, force: true }); });

function foldLexicalCase(): void {
  const relative = path.relative;
  // Model identical lexical roots without requiring case-sensitive fixture names.
  // Preserve suffix casing, as Windows relative() does for the target pathname.
  const fold = (value: string) => value === sibling || value.startsWith(`${sibling}${path.sep}`)
    ? workspace + value.slice(sibling.length) : value;
  vi.spyOn(path, 'relative').mockImplementation((from, to) => relative(fold(from), fold(to)));
}

function modelAlias(alias: string, destination: string): void {
  const lstat = fs.lstatSync, exists = fs.existsSync, realpath = fs.realpathSync;
  const link = Object.assign(lstat(alias), { isSymbolicLink: () => true });
  const redirect = (file: fs.PathLike) => {
    const value = String(file);
    return value === alias || value.startsWith(`${alias}${path.sep}`) ? destination + value.slice(alias.length) : value;
  };
  // Model links on filesystems that cannot create them without extra privileges.
  vi.spyOn(fs, 'lstatSync').mockImplementation(file => String(file) === alias ? link : lstat(redirect(file)));
  vi.spyOn(fs, 'existsSync').mockImplementation(file => exists(redirect(file)));
  vi.spyOn(fs, 'realpathSync').mockImplementation(file => realpath(redirect(file)));
}

it.each(['outside.txt', 'new.txt', 'missing/new.txt'])('rejects a distinct sibling for %s despite lexical folding', name => {
  foldLexicalCase();
  expect(() => workspaceFilePath(workspace, `../Outside/${name}`)).toThrow('outside');
});

it('rejects the case sibling before opening its pre-read', () => {
  foldLexicalCase();
  const open = vi.spyOn(fs, 'openSync');
  expect(() => inspectWorkspaceFile(workspace, '../Outside/outside.txt')).toThrow('outside');
  expect(open).not.toHaveBeenCalled();
});

it('rejects the case sibling before the shared authority writes', () => {
  foldLexicalCase();
  const authority = createWorkspaceWriteAuthority(workspace);
  expect(() => authority.writeFile('../Outside/outside.txt', 'changed')).toThrow('outside');
  expect(fs.readFileSync(path.join(sibling, 'outside.txt'), 'utf8')).toBe('outside');
  expect(fs.readdirSync(sibling).sort()).toEqual(['inside.txt', 'outside.txt']);
});

it('does not remap an absolute case sibling file onto a same-named authorized file', () => {
  foldLexicalCase();
  expect(createWorkspaceWriteAuthority(workspace).readFile(path.join(sibling, 'inside.txt'))).toBeUndefined();
});

it('does not remap an absolute case sibling directory onto the authorized root', () => {
  foldLexicalCase();
  expect(createWorkspaceWriteAuthority(workspace).directoryExists(sibling)).toBe(false);
});

it('keeps normalized contained paths and their exact bytes readable', () => {
  foldLexicalCase();
  expect(workspaceFilePath(workspace, '../Root/inside.txt')).toBe(path.join(workspace, 'inside.txt'));
  expect(inspectWorkspaceFile(workspace, 'inside.txt')).toMatchObject({ state: 'exists', content: '\ufeffinside\r\n' });
});

it('keeps internal source symlinks refused', () => {
  const alias = path.join(workspace, 'alias.txt'); fs.writeFileSync(alias, 'link placeholder');
  modelAlias(alias, path.join(workspace, 'inside.txt'));
  expect(() => workspaceFilePath(workspace, 'alias.txt')).toThrow('symlink');
  expect(createWorkspaceWriteAuthority(workspace).readFile(alias)).toBeUndefined();
});

it('accepts both selected-root aliases and their canonical absolute files', () => {
  const alias = path.join(fixture, 'selected'); fs.mkdirSync(alias);
  modelAlias(alias, workspace);
  const authority = createWorkspaceWriteAuthority(alias);
  expect(authority.readFile(path.join(alias, 'inside.txt'))).toBe('\ufeffinside\r\n');
  expect(authority.readFile(path.join(workspace, 'inside.txt'))).toBe('\ufeffinside\r\n');
  expect(authority.directoryExists(alias)).toBe(true);
  expect(authority.directoryExists(workspace)).toBe(true);
});

it('accepts selected and canonical roots when lexical comparison folds the selected alias', () => {
  modelAlias(sibling, workspace); foldLexicalCase();
  const authority = createWorkspaceWriteAuthority(sibling);
  expect(authority.readFile(path.join(sibling, 'inside.txt'))).toBe('\ufeffinside\r\n');
  expect(authority.readFile(path.join(workspace, 'inside.txt'))).toBe('\ufeffinside\r\n');
  expect(authority.directoryExists(sibling)).toBe(true);
  expect(authority.directoryExists(workspace)).toBe(true);
});

it('inspects the actual sibling file link before a folded relative path discards its prefix', () => {
  const alias = path.join(sibling, 'bounce.txt'); fs.writeFileSync(alias, 'link placeholder');
  fs.writeFileSync(path.join(workspace, 'bounce.txt'), 'different authorized file');
  modelAlias(alias, path.join(workspace, 'inside.txt')); foldLexicalCase();
  expect(() => workspaceFilePath(workspace, '../Outside/bounce.txt')).toThrow('symlink');
  expect(createWorkspaceWriteAuthority(workspace).readFile(alias)).toBeUndefined();
});

it('inspects the actual sibling directory link before remapping its children', () => {
  const alias = path.join(sibling, 'bounce'); fs.mkdirSync(alias);
  fs.mkdirSync(path.join(workspace, 'bounce'));
  fs.writeFileSync(path.join(workspace, 'bounce', 'inside.txt'), 'different authorized file');
  modelAlias(alias, workspace); foldLexicalCase();
  expect(() => workspaceFilePath(workspace, '../Outside/bounce/inside.txt')).toThrow('symlink');
  const authority = createWorkspaceWriteAuthority(workspace);
  expect(authority.directoryExists(alias)).toBe(false);
  expect(authority.readFile(path.join(alias, 'inside.txt'))).toBeUndefined();
});

it('refuses an unselected root link whose canonical target is the authorized root', () => {
  modelAlias(sibling, workspace); foldLexicalCase();
  expect(() => workspaceFilePath(workspace, '../Outside/inside.txt')).toThrow('symlink');
  const authority = createWorkspaceWriteAuthority(workspace);
  expect(authority.readFile(path.join(sibling, 'inside.txt'))).toBeUndefined();
  expect(authority.directoryExists(sibling)).toBe(false);
});

it.each(['after ancestry inspection', 'during descriptor acquisition'])('refuses parent-link replacement %s when reading text', stage => {
  const target = path.join(workspace, 'inside.txt'); let replaced = false;
  const replace = () => {
    if (replaced) return;
    replaced = true; fs.renameSync(workspace, `${workspace}-retained`);
    // At open time preserve the file inode: its descriptor path must still reject the link.
    fs.symlinkSync(stage === 'during descriptor acquisition' ? `${workspace}-retained` : sibling, workspace, 'dir');
  };
  if (stage === 'after ancestry inspection') {
    const lstat = fs.lstatSync;
    vi.spyOn(fs, 'lstatSync').mockImplementation(file => {
      const stat = lstat(file);
      if (String(file) === path.parse(target).root) replace();
      return stat;
    });
  } else {
    const open = fs.openSync;
    vi.spyOn(fs, 'openSync').mockImplementation((file, flags, mode) => {
      if (String(file) === target) replace();
      return open(file, flags, mode);
    });
  }
  expect(() => readTextFile(target, 1024)).toThrow();
  expect(replaced).toBe(true);
  expect(fs.readFileSync(path.join(sibling, 'inside.txt'), 'utf8')).toBe('outside same name');
});

it('stops cancellable text acquisition between descriptor chunks', async () => {
  const target = path.join(workspace, 'large.txt');
  fs.writeFileSync(target, 'x'.repeat(140 * 1024));
  const controller = new AbortController();
  const open = fs.promises.open;
  let reads = 0;
  vi.spyOn(fs.promises, 'open').mockImplementation((async (...args: Parameters<typeof fs.promises.open>) => {
    const handle = await open(...args);
    const read = handle.read.bind(handle);
    handle.read = (async (...readArgs: Parameters<typeof read>) => {
      const result = await read(...readArgs);
      reads += 1;
      if (reads === 2) controller.abort(new Error('Read cancelled'));
      return result;
    }) as typeof handle.read;
    return handle;
  }) as typeof fs.promises.open);

  await expect(readTextFileAsync(target, 1024 * 1024, controller.signal)).rejects.toThrow('Read cancelled');
  expect(reads).toBe(2);
});
