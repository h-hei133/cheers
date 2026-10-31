import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserAuthPath, getUserRuntimeConfigPath, readRuntimeConfigEditAt,
  readUserRuntimeConfigFile, writeUserRuntimeConfigFile } from './runtimeConfig.js';
import { readConfigSnapshot } from './document.js';
import { documentFor } from './documents.js';
import { configEditStorage } from './persistence.js';
import * as store from '../session/store/sessionFileStore.js';
import { createProfileContext, withProfile } from '../core/paths/profile/context.js';

describe('user configuration documents', () => {
  let root: string;
  let settings: string;
  let auth: string;
  const credentials = { provider: 'openai', providerCredentials: { openai: { apiKey: 'synthetic-document-key' } } };
  const put = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, { mode: 0o600 });
  };
  const read = (file: string) => readConfigSnapshot(file)!.values;
  beforeEach(() => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    root = fs.mkdtempSync('/tmp/cheers-test/documents-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
    settings = getUserRuntimeConfigPath(); auth = getUserAuthPath();
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

  it('migrates credentials before stripping their legacy copy, preserving settings trivia', () => {
    const text = '\uFEFF{\r\n// preferences\r\n"theme":"dark", "provider":"openai", "providerCredentials":{"openai":{"apiKey":"synthetic-document-key"}}\r\n}\r\n';
    put(settings, text);
    const base = readRuntimeConfigEditAt(settings);
    const write = store.writeTextFileAtomic;
    const published: string[] = [];
    vi.spyOn(store, 'writeTextFileAtomic').mockImplementation((file, contents, mode) => {
      published.push(file);
      // Reversing preservation-before-removal must fail this assertion.
      if (file === settings) expect(read(auth)).toEqual(credentials);
      write(file, contents, mode);
    });
    writeUserRuntimeConfigFile({ theme: 'light' }, base);
    expect(published).toEqual([auth, settings]);
    expect(read(settings)).toEqual({ theme: 'light' });
    expect(fs.readFileSync(settings, 'utf8')).toContain('// preferences\r\n');
    expect(fs.readFileSync(settings, 'utf8').startsWith('\uFEFF')).toBe(true);
    expect(readUserRuntimeConfigFile()).toEqual({ ...credentials, theme: 'light' });
    if (process.platform !== 'win32') expect(fs.statSync(auth).mode & 0o777).toBe(0o600);
  });

  it.each(['auth-write', 'auth-readback', 'settings-write'] as const)('retains credentials when %s fails', failure => {
    put(settings, JSON.stringify({ ...credentials, theme: 'dark' }));
    const before = fs.readFileSync(settings);
    const base = readRuntimeConfigEditAt(settings);
    const write = store.writeTextFileAtomic;
    vi.spyOn(store, 'writeTextFileAtomic').mockImplementation((file, contents, mode) => {
      if (failure === 'auth-write' && file === auth || failure === 'settings-write' && file === settings) throw new Error('synthetic write failure');
      write(file, contents, mode);
      if (failure === 'auth-readback' && file === auth) fs.writeFileSync(auth, '{}');
    });
    expect(() => writeUserRuntimeConfigFile({ theme: 'light' }, base)).toThrow(expect.objectContaining({ state: 'unknown' }));
    expect(fs.readFileSync(settings)).toEqual(before);
    expect(readUserRuntimeConfigFile().providerCredentials).toEqual(credentials.providerCredentials);
  });

  it('lets the owned credential file win, and never moves unknown auth data into settings', () => {
    put(settings, JSON.stringify({ ...credentials, theme: 'dark', futureAuth: { legacy: true } }));
    const authText = '{/* auth trivia */"provider":"openai","providerCredentials":{"openai":{"apiKey":"synthetic-new-key"}},"futureAuth":{"private":"synthetic-private-value"}}';
    put(auth, authText);
    const base = readRuntimeConfigEditAt(settings);
    writeUserRuntimeConfigFile({ theme: 'light' }, base);
    expect(fs.readFileSync(auth, 'utf8')).toBe(authText);
    expect(read(settings)).toEqual({ theme: 'light', futureAuth: { legacy: true } });
    expect(fs.readFileSync(settings, 'utf8')).not.toContain('synthetic-private-value');
    expect(readUserRuntimeConfigFile().providerCredentials!.openai!.apiKey).toBe('synthetic-new-key');
    expect(getRuntimeConfig(root).providerCredentials.openai!.apiKey).toBe('synthetic-new-key');
    expect(documentFor('providerConnections', undefined)).toBe('auth');
    expect(documentFor('theme', undefined)).toBe('settings');
  });

  it('keeps ordinary saves single-document until a provider field needs the auth owner', () => {
    writeUserRuntimeConfigFile({ theme: 'dark' }, readRuntimeConfigEditAt(settings));
    expect(fs.existsSync(auth)).toBe(false);
    writeUserRuntimeConfigFile({ provider: 'openai' }, readRuntimeConfigEditAt(settings));
    expect(read(auth)).toEqual({ provider: 'openai' });
    expect(read(settings)).toEqual({ theme: 'dark' });
  });

  it('supports an auth-only baseline and independent edits to each document', () => {
    put(auth, JSON.stringify(credentials));
    const first = readRuntimeConfigEditAt(settings);
    const second = readRuntimeConfigEditAt(settings);
    writeUserRuntimeConfigFile({ theme: 'dark' }, first);
    writeUserRuntimeConfigFile({ providerCredentials: { openai: { apiKey: 'synthetic-new-key' } } }, second);
    expect(read(settings)).toEqual({ theme: 'dark' });
    expect(read(auth).providerCredentials).toEqual({ openai: { apiKey: 'synthetic-new-key' } });
  });

  it.each(['settings', 'auth'] as const)('refuses a stale edit after its acquired %s document disappears', missing => {
    put(settings, JSON.stringify({ ...credentials, theme: 'dark' }));
    put(auth, JSON.stringify({ providerCredentials: { openai: { apiKey: 'synthetic-new-key' } } }));
    const base = readRuntimeConfigEditAt(settings);
    fs.unlinkSync(missing === 'settings' ? settings : auth);
    const other = fs.readFileSync(missing === 'settings' ? auth : settings);
    expect(() => writeUserRuntimeConfigFile({ theme: 'light' }, base)).toThrow(expect.objectContaining({ code: 'conflict', state: 'unchanged' }));
    expect(fs.existsSync(missing === 'settings' ? settings : auth)).toBe(false);
    expect(fs.readFileSync(missing === 'settings' ? auth : settings)).toEqual(other);
  });

  it('uses independent legacy fallback paths and rejects source replacement', () => {
    const legacy = path.join(root, '.cheer', 'config.json');
    put(legacy, JSON.stringify({ ...credentials, theme: 'dark' }));
    const base = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
    writeUserRuntimeConfigFile({ theme: 'light' }, base);
    expect(read(legacy)).toEqual({ theme: 'light' });
    expect(read(auth)).toEqual(credentials);
    const next = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
    put(settings, '{"theme":"new-owner"}');
    expect(() => writeUserRuntimeConfigFile({ theme: 'light' }, next)).toThrow();
    expect(read(settings)).toEqual({ theme: 'new-owner' });
  });

  it('keeps auth source ownership across a settings symlink alias', () => {
    const target = path.join(root, 'settings-target.json');
    put(target, '{"theme":"dark"}'); put(auth, JSON.stringify(credentials));
    fs.symlinkSync(target, settings);
    const base = readRuntimeConfigEditAt(fs.realpathSync(settings));
    expect(base.values.providerCredentials).toEqual(credentials.providerCredentials);
  });

  it('writes a stable auth symlink through its captured canonical target', () => {
    put(settings, '{"theme":"dark"}');
    const target = path.join(root, 'credential-target.json');
    put(target, JSON.stringify(credentials)); fs.symlinkSync(target, auth);
    writeUserRuntimeConfigFile({ providerCredentials: { openai: { apiKey: 'synthetic-new-key' } } }, readRuntimeConfigEditAt(settings));
    expect(fs.lstatSync(auth).isSymbolicLink()).toBe(true);
    expect(read(target).providerCredentials).toEqual({ openai: { apiKey: 'synthetic-new-key' } });
  });

  it('rejects a read-only receipt when its credential store changes canonical owner', () => {
    put(settings, '{"theme":"dark"}'); put(auth, JSON.stringify(credentials));
    const base = readRuntimeConfigEditAt(settings);
    const target = path.join(root, 'other-credential-store.json');
    fs.renameSync(auth, target); fs.symlinkSync(target, auth);
    expect(() => configEditStorage(base)).toThrow(expect.objectContaining({ code: 'conflict', state: 'unchanged' }));
  });

  it('refuses settings and auth aliases of the same physical document before writing', () => {
    put(settings, JSON.stringify(credentials)); fs.symlinkSync(settings, auth);
    const before = fs.readFileSync(settings);
    expect(() => writeUserRuntimeConfigFile({ theme: 'light' }, readRuntimeConfigEditAt(settings))).toThrow(expect.objectContaining({ code: 'conflict', state: 'unchanged' }));
    expect(fs.readFileSync(settings)).toEqual(before);
  });

  it('finishes migration after an interrupted settings write without replacing the verified auth bytes', () => {
    put(settings, JSON.stringify({ ...credentials, theme: 'dark' }));
    const base = readRuntimeConfigEditAt(settings);
    const write = store.writeTextFileAtomic;
    const writer = vi.spyOn(store, 'writeTextFileAtomic').mockImplementation((file, contents, mode) => {
      if (file === settings) throw new Error('synthetic interruption'); write(file, contents, mode);
    });
    expect(() => writeUserRuntimeConfigFile({ theme: 'light' }, base)).toThrow();
    const acceptedAuth = fs.readFileSync(auth);
    writer.mockRestore();
    writeUserRuntimeConfigFile({ theme: 'light' }, readRuntimeConfigEditAt(settings));
    expect(fs.readFileSync(auth)).toEqual(acceptedAuth);
    expect(read(settings)).toEqual({ theme: 'light' });
    expect(readUserRuntimeConfigFile()).toEqual({ ...credentials, theme: 'light' });
  });

  it('rejects an auth fallback source replaced while acquiring the lock', () => {
    const legacy = path.join(root, '.cheer', 'auth.json');
    put(settings, '{"theme":"dark"}'); put(legacy, JSON.stringify(credentials));
    const base = readRuntimeConfigEditAt(settings);
    const lock = store.withFileLock;
    vi.spyOn(store, 'withFileLock').mockImplementation((file, action, options) => lock(file, () => {
      put(auth, JSON.stringify(credentials)); return action();
    }, options));
    const writer = vi.spyOn(store, 'writeTextFileAtomic');
    expect(() => writeUserRuntimeConfigFile({ theme: 'light' }, base)).toThrow(expect.objectContaining({ code: 'conflict', state: 'unchanged' }));
    expect(writer).not.toHaveBeenCalled(); expect(read(settings)).toEqual({ theme: 'dark' });
  });

  it('refuses cross-profile reuse of the same edit even through its original path', () => {
    const first = createProfileContext({ name: 'first', homeDir: root });
    const second = createProfileContext({ name: 'second', homeDir: root });
    const base = withProfile(first, () => readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    expect(() => withProfile(second, () => writeUserRuntimeConfigFile({ theme: 'dark' }, base))).toThrow();
    expect(fs.existsSync(base.path)).toBe(false);
  });

  it('narrows unchanged auth permissions even when the sibling settings change', () => {
    put(settings, '{"theme":"dark"}'); put(auth, JSON.stringify(credentials));
    if (process.platform !== 'win32') fs.chmodSync(auth, 0o644);
    const before = fs.readFileSync(auth);
    writeUserRuntimeConfigFile({ theme: 'light' }, readRuntimeConfigEditAt(settings));
    expect(fs.readFileSync(auth)).toEqual(before);
    if (process.platform !== 'win32') expect(fs.statSync(auth).mode & 0o777).toBe(0o600);
  });

  it('refuses malformed fields in either physical document even when shadowed', () => {
    put(settings, '{"providerCredentials":"malformed"}'); put(auth, JSON.stringify(credentials));
    expect(() => readRuntimeConfigEditAt(settings)).toThrow();
    expect(() => readUserRuntimeConfigFile()).toThrow();
  });

  it('removes every copy of a deliberately deleted shadowed field', () => {
    put(settings, '{"theme":"dark","futureAuth":{"legacy":true}}');
    put(auth, '{"theme":"light","futureAuth":{"private":"synthetic"}}');
    writeUserRuntimeConfigFile({ theme: undefined, futureAuth: undefined } as never, readRuntimeConfigEditAt(settings));
    expect(read(settings)).toEqual({}); expect(read(auth)).toEqual({});
    expect(readUserRuntimeConfigFile()).toEqual({});
  });

  it('rechecks settings after publishing auth before stripping a legacy copy', () => {
    put(settings, JSON.stringify(credentials));
    const base = readRuntimeConfigEditAt(settings);
    const write = store.writeTextFileAtomic;
    const external = JSON.stringify({ ...credentials, theme: 'external' });
    vi.spyOn(store, 'writeTextFileAtomic').mockImplementation((file, contents, mode) => {
      write(file, contents, mode); if (file === auth) fs.writeFileSync(settings, external);
    });
    expect(() => writeUserRuntimeConfigFile({ theme: 'light' }, base)).toThrow(expect.objectContaining({ code: 'conflict', state: 'unknown' }));
    expect(fs.readFileSync(settings, 'utf8')).toBe(external);
    expect(read(auth)).toEqual(credentials);
  });
});
