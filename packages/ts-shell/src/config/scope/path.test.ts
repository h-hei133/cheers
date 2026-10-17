import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { assertScopePath, captureScopePath, scopeContains } from './path.js';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-path-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

it('matches canonical components, including ..cache, without folding directory case', () => {
  expect(scopeContains('/repo/a', '/repo/ab', path.posix)).toBe(false);
  expect(scopeContains('/repo/a', '/repo/a/..cache/new', path.posix)).toBe(true);
  expect(scopeContains('/repo/A', '/repo/a/file', path.posix)).toBe(false);
  expect(scopeContains('/', '/repo/a', path.posix)).toBe(true);
});

it('compares Windows drive and UNC anchors separately from canonical directory casing', () => {
  expect(scopeContains('C:\\Repo', 'c:\\Repo\\..cache\\a', path.win32)).toBe(true);
  expect(scopeContains('C:\\Repo', 'C:\\Repository', path.win32)).toBe(false);
  expect(scopeContains('C:\\Repo', 'C:\\repo\\a', path.win32)).toBe(false);
  expect(scopeContains('C:\\Repo', 'D:\\Repo\\a', path.win32)).toBe(false);
  expect(scopeContains('\\\\Host\\Share\\Repo', '\\\\host\\share\\Repo\\a', path.win32)).toBe(true);
  expect(scopeContains('\\\\Host\\Share\\Repo', '\\\\Host\\Other\\Repo\\a', path.win32)).toBe(false);
});

it('captures real aliases and absent children against the deepest existing directory', () => {
  fs.mkdirSync(path.join(root, 'a'));
  fs.symlinkSync('a', path.join(root, 'alias'));
  const target = captureScopePath('alias/new/created.txt', root);
  expect(target.canonical).toBe(path.join(root, 'a/new/created.txt'));
  expect(() => assertScopePath(target)).not.toThrow();
  fs.mkdirSync(path.join(root, 'a/new')); fs.writeFileSync(path.join(root, 'a/new/created.txt'), 'created');
  expect(() => assertScopePath(target)).not.toThrow();
  fs.unlinkSync(path.join(root, 'alias')); fs.mkdirSync(path.join(root, 'b')); fs.symlinkSync('b', path.join(root, 'alias'));
  expect(() => assertScopePath(target)).toThrow(/scope/i);
});

it('rejects a replaced existing directory even when canonical spelling returns to the old path', () => {
  const dir = path.join(root, 'a'); fs.mkdirSync(dir);
  const target = captureScopePath('a/file', root);
  fs.renameSync(dir, path.join(root, 'old')); fs.mkdirSync(dir);
  expect(() => assertScopePath(target)).toThrow(/scope/i);
});

it('rejects dangling links and non-directory rule prefixes', () => {
  fs.symlinkSync('missing', path.join(root, 'dangling'));
  expect(() => captureScopePath('dangling/child', root)).toThrow(/scope/i);
  fs.writeFileSync(path.join(root, 'file'), 'text');
  expect(() => captureScopePath('file', root, true)).toThrow(/scope/i);
});
