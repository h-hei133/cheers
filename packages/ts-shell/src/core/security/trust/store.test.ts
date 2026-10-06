import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectTrustStore } from './store.js';
import { TrustWriteError } from './model.js';
import * as files from '../../../session/store/sessionFileStore.js';
import { CONFIG_MAX_BYTES } from '../../../config/syntax.js';
import * as documents from '../../../config/document.js';

let root: string;
let file: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'trust-contract-')); file = path.join(root, 'trust.json'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it('keeps missing decisions distinct from refusal without creating a file', () => {
  const store = new ProjectTrustStore(file);
  expect(store.decision(root)).toBe('undecided');
  expect(store.isProjectTrusted(root)).toBe(false); expect(store.isProjectUntrusted(root)).toBe(false);
  expect(fs.existsSync(file)).toBe(false);
});

it('makes an explicit process grant shadow the same persisted refusal until a later durable decision', () => {
  const store = new ProjectTrustStore(file); store.setProjectTrust(root, 'untrusted');
  const before = fs.readFileSync(file);
  expect(store.setProjectTrust(root, 'session-only')).toEqual({ scope: 'process', changed: true });
  expect(store.isProjectTrusted(root)).toBe(true); expect(store.isProjectUntrusted(root)).toBe(false);
  expect(fs.readFileSync(file)).toEqual(before); expect(new ProjectTrustStore(file).decision(root)).toBe('untrusted');
  store.setProjectTrust(root, 'untrusted');
  expect(store.decision(root)).toBe('untrusted'); expect(store.isProjectTrusted(root)).toBe(false);
});

it('preserves covering refusal over older child grants and process-local exceptions', () => {
  const child = path.join(root, 'child'); const store = new ProjectTrustStore(file);
  store.setProjectTrust(child, 'trusted'); store.setProjectTrust(root, 'untrusted');
  for (const level of ['trusted', 'session-only'] as const) {
    store.setProjectTrust(child, level);
    expect(store.decision(child)).toBe('untrusted'); expect(store.isProjectTrusted(child)).toBe(false);
  }
  store.setProjectTrust(root, 'session-only');
  expect(store.decision(child)).toBe('trusted');
  store.setProjectTrust(child, 'untrusted');
  expect(store.decision(child)).toBe('untrusted');
});

it('does not confuse a child beginning with two dots with a parent escape', () => {
  const store = new ProjectTrustStore(file); store.setProjectTrust(root, 'untrusted');
  expect(store.decision(path.join(root, '..cache'))).toBe('untrusted');
  expect(store.decision(root + '-sibling')).toBe('undecided');
});

it.each(['replace', 'delete'])('expires process grants when durable state changes: %s', operation => {
  const store = new ProjectTrustStore(file); store.setProjectTrust(root, 'untrusted'); store.setProjectTrust(root, 'session-only');
  const before = store.revision();
  if (operation === 'replace') { fs.writeFileSync(file + '.new', fs.readFileSync(file)); fs.renameSync(file + '.new', file); }
  else fs.rmSync(file);
  expect(store.revision()).not.toBe(before);
  expect(store.decision(root)).toBe(operation === 'replace' ? 'untrusted' : 'undecided');
});

it('observes a new preferred source and writes legacy decisions into the current user path', () => {
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
  const legacy = path.join(root, '.coding-agents', 'trust.json'); fs.mkdirSync(path.dirname(legacy));
  new ProjectTrustStore(legacy).setProjectTrust(root, 'untrusted');
  const old = fs.readFileSync(legacy); const store = new ProjectTrustStore();
  expect(store.decision(root)).toBe('untrusted'); store.setProjectTrust(root, 'session-only');
  const current = path.join(root, '.cheers', 'trust.json'); fs.mkdirSync(path.dirname(current)); fs.writeFileSync(current, old);
  expect(store.decision(root)).toBe('untrusted');
  fs.rmSync(current); store.setProjectTrust(path.join(root, 'other'), 'trusted');
  expect(fs.existsSync(current)).toBe(true); expect(fs.readFileSync(legacy)).toEqual(old);
  expect(JSON.parse(fs.readFileSync(current, 'utf8')).projects[root].trustLevel).toBe('untrusted');
});

it.each(['{', 'null', '[]', '{}', '{"version":2,"projects":{}}', '{"version":1,"projects":null}', '{"version":1,"projects":{"relative":{"trustLevel":"trusted","decidedAt":"x"}}}'])('refuses unavailable trust stores without converting them to missing: %s', raw => {
  fs.writeFileSync(file, raw); const store = new ProjectTrustStore(file);
  expect(store.decision(root)).toBe('unavailable');
  expect(store.isProjectTrusted(root)).toBe(false); expect(store.isProjectUntrusted(root)).toBe(true);
  expect(() => store.setProjectTrust(root, 'trusted')).toThrow(TrustWriteError);
  expect(() => store.setProjectTrust(root, 'session-only')).toThrow(TrustWriteError);
  expect(fs.readFileSync(file, 'utf8')).toBe(raw);
});

it('rejects oversized and nonregular stores through bounded reads', () => {
  const store = new ProjectTrustStore(file);
  fs.writeFileSync(file, JSON.stringify({ version: 1, projects: {}, padding: 'x'.repeat(CONFIG_MAX_BYTES) })); expect(store.decision(root)).toBe('unavailable');
  fs.rmSync(file); fs.mkdirSync(file); expect(store.decision(root)).toBe('unavailable');
});

it('preserves the newest unrelated record acquired under the shared lock', () => {
  const store = new ProjectTrustStore(file); const lock = files.withFileLock;
  vi.spyOn(files, 'withFileLock').mockImplementation((lockFile, action, options) => lock(lockFile, () => {
    fs.writeFileSync(file, JSON.stringify({ version: 1, projects: { [root + '/winner']: { trustLevel: 'untrusted', decidedAt: '2026-01-01' } } }));
    return action();
  }, options));
  store.setProjectTrust(root, 'trusted');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(saved.projects[root].trustLevel).toBe('trusted'); expect(saved.projects[root + '/winner'].trustLevel).toBe('untrusted');
});

it('detects source replacement before write and preserves the replacement', () => {
  const store = new ProjectTrustStore(file); store.setProjectTrust(root, 'untrusted');
  const read = documents.readConfigSnapshot; let reads = 0; let external: string;
  vi.spyOn(documents, 'readConfigSnapshot').mockImplementation(target => {
    if (target === file && ++reads === 2) {
      external = JSON.stringify({ version: 1, projects: { [root + '/winner']: { trustLevel: 'untrusted', decidedAt: 'new' } } });
      fs.writeFileSync(file, external);
    }
    return read(target);
  });
  expect(() => store.setProjectTrust(root, 'trusted')).toThrowError(expect.objectContaining({ code: 'conflict', state: 'unchanged' }));
  expect(fs.readFileSync(file, 'utf8')).toBe(external!);
});

it('does not grant or report success when the writer silently does nothing', () => {
  const store = new ProjectTrustStore(file); store.setProjectTrust(root, 'untrusted');
  const before = fs.readFileSync(file);
  vi.spyOn(files, 'writeTextFileAtomic').mockImplementation(() => {});
  expect(() => store.setProjectTrust(root, 'trusted')).toThrowError(expect.objectContaining({ code: 'verification-failed', state: 'unknown' }));
  expect(fs.readFileSync(file)).toEqual(before); expect(store.decision(root)).toBe('untrusted');
});

it('keeps verified persistence distinct from lock cleanup failure', () => {
  const store = new ProjectTrustStore(file); const write = files.writeTextFileAtomic;
  vi.spyOn(files, 'writeTextFileAtomic').mockImplementation((target, text, mode) => {
    write(target, text, mode); fs.writeFileSync(file + '.lock', JSON.stringify({ token: 'SENSITIVE_LOCK_TOKEN' }));
  });
  let error: unknown;
  try { store.setProjectTrust(root, 'untrusted'); } catch (caught) { error = caught; }
  expect(error).toMatchObject({ state: 'persisted', cleanupFailed: true }); expect(String(error)).not.toContain('SENSITIVE');
  expect(store.decision(root)).toBe('untrusted');
});

it('replaces an explicitly selected alias without leaving its obsolete refusal', () => {
  const actual = path.join(root, 'actual'); const alias = path.join(root, 'alias'); fs.mkdirSync(actual); fs.symlinkSync(actual, alias, 'dir');
  fs.writeFileSync(file, JSON.stringify({ version: 1, projects: { [alias]: { trustLevel: 'untrusted', decidedAt: 'old' } } }));
  const store = new ProjectTrustStore(file); store.setProjectTrust(alias, 'trusted');
  expect(store.decision(alias)).toBe('trusted');
  expect(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).projects)).toEqual([actual]);
});

it('does not move a saved allowance to a replacement symlink target', () => {
  const approved = path.join(root, 'approved'); const other = path.join(root, 'other');
  fs.mkdirSync(approved); fs.mkdirSync(other);
  const store = new ProjectTrustStore(file); store.setProjectTrust(approved, 'trusted');
  fs.renameSync(approved, approved + '-old'); fs.symlinkSync(other, approved, 'dir');
  expect(store.decision(other)).toBe('undecided'); expect(store.decision(approved)).toBe('undecided');
});

it('retains a saved refusal and its legacy alias boundary after link replacement', () => {
  const refused = path.join(root, 'refused'); const other = path.join(root, 'other');
  fs.mkdirSync(refused); fs.mkdirSync(other);
  const store = new ProjectTrustStore(file); store.setProjectTrust(refused, 'untrusted');
  fs.renameSync(refused, refused + '-old'); fs.symlinkSync(other, refused, 'dir');
  expect(store.decision(other)).toBe('untrusted');
  store.setProjectTrust(other, 'trusted');
  expect(store.decision(other)).toBe('untrusted');
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).projects[refused].trustLevel).toBe('untrusted');
  fs.rmSync(refused); fs.mkdirSync(refused);
  expect(store.decision(refused)).toBe('untrusted');
});

it('expires a process grant when a store symlink is replaced with the same target', () => {
  const target = file + '.target'; const store = new ProjectTrustStore(file);
  new ProjectTrustStore(target).setProjectTrust(root, 'untrusted'); fs.symlinkSync(target, file);
  store.setProjectTrust(root, 'session-only'); const before = store.revision();
  fs.symlinkSync(target, file + '.new'); fs.renameSync(file + '.new', file);
  expect(store.revision()).not.toBe(before); expect(store.decision(root)).toBe('untrusted');
});

it.each(['file-link', 'directory-link', 'inaccessible'])('does not fall back to a legacy allowance when the current source is unavailable: %s', fault => {
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
  const legacy = path.join(root, '.coding-agents', 'trust.json'); fs.mkdirSync(path.dirname(legacy));
  new ProjectTrustStore(legacy).setProjectTrust(root, 'trusted');
  const current = path.join(root, '.cheers', 'trust.json');
  if (fault === 'directory-link') fs.symlinkSync(path.join(root, 'missing'), path.dirname(current), 'dir');
  else {
    fs.mkdirSync(path.dirname(current));
    if (fault === 'file-link') fs.symlinkSync(path.join(root, 'missing'), current);
    else {
      new ProjectTrustStore(current).setProjectTrust(root, 'untrusted');
      const lstat = fs.lstatSync; const open = fs.openSync;
      vi.spyOn(fs, 'lstatSync').mockImplementation((...args) => {
        if (args[0] === current) throw Object.assign(new Error('PRIVATE_SOURCE'), { code: 'EACCES' });
        return Reflect.apply(lstat, fs, args);
      });
      vi.spyOn(fs, 'openSync').mockImplementation((...args) => {
        if (args[0] === current) throw Object.assign(new Error('PRIVATE_SOURCE'), { code: 'EACCES' });
        return Reflect.apply(open, fs, args);
      });
    }
  }
  const store = new ProjectTrustStore();
  expect(store.decision(root)).toBe('unavailable'); expect(store.isProjectUntrusted(root)).toBe(true);
  expect(() => store.setProjectTrust(root, 'session-only')).toThrow(TrustWriteError);
  expect(new ProjectTrustStore(current).decision(root)).toBe('unavailable');
});
