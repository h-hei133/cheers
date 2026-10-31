import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG_FIELDS, readRuntimeConfigEditAt, writeRuntimeConfigFileAt, type RuntimeConfigFile } from './runtimeConfig.js';
import { persistConfigEdit } from './persistence.js';
import * as store from '../session/store/sessionFileStore.js';
import * as document from './document.js';

describe('revision-bound configuration saves', () => {
  let root: string;
  let file: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'config-save-')); file = path.join(root, 'config.json'); });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
  const write = (value: unknown) => fs.writeFileSync(file, JSON.stringify(value));
  const read = () => JSON.parse(fs.readFileSync(file, 'utf8'));

  it('preserves a later scalar and deletion when saving an older whole snapshot', () => {
    write({ theme: 'dark', maxTurns: 5, offline: false });
    const base = readRuntimeConfigEditAt(file);
    write({ theme: 'light', maxTurns: 5 });
    writeRuntimeConfigFileAt(file, { ...base.values, maxTurns: 9 }, base);
    expect(read()).toEqual({ theme: 'light', maxTurns: 9 });
  });

  it('refuses same-field conflicts without exposing either value', () => {
    write({ theme: 'private-before' });
    const base = readRuntimeConfigEditAt(file);
    write({ theme: 'private-current' });
    try { writeRuntimeConfigFileAt(file, { theme: 'private-desired' }, base); throw new Error('unexpected success'); }
    catch (error) {
      expect(error).toMatchObject({ state: 'unchanged', code: 'conflict' });
      expect(String(error)).not.toContain('private-');
    }
    expect(read()).toEqual({ theme: 'private-current' });
  });

  it('merges disjoint nested fields while guarding deleted ancestors', () => {
    write({ tui: { diagrams: 'off', statusItems: ['model'] } });
    const base = readRuntimeConfigEditAt(file);
    write({ tui: { diagrams: 'streaming', statusItems: ['model'] } });
    writeRuntimeConfigFileAt(file, { tui: { ...base.values.tui, statusItems: ['provider'] } }, base);
    expect(read().tui).toEqual({ diagrams: 'streaming', statusItems: ['provider'] });
    fs.writeFileSync(file, '{}');
    expect(() => writeRuntimeConfigFileAt(file, { tui: { ...base.values.tui, statusItems: ['provider'] } }, base)).toThrow(/conflict/);
    expect(read()).toEqual({});
  });

  it('treats ordinary arrays and each credential generation atomically', () => {
    write({ allowedTools: ['read'], providerCredentials: { openai: { apiKey: 'old', baseUrl: 'https://old.invalid' } } });
    const base = readRuntimeConfigEditAt(file);
    write({ allowedTools: ['read', 'grep'], providerCredentials: { openai: { apiKey: 'new', baseUrl: 'https://old.invalid' } } });
    expect(() => writeRuntimeConfigFileAt(file, { allowedTools: ['read', 'write'] }, base)).toThrow(/conflict/);
    expect(() => writeRuntimeConfigFileAt(file, { providerCredentials: { openai: { apiKey: 'old', baseUrl: 'https://new.invalid' } } }, base)).toThrow(/conflict/);
  });

  it('merges distinct stable connection identities but rejects edits to the same record', () => {
    const a = { id: 'a', provider: 'openai' as const, label: 'a' };
    const b = { id: 'b', provider: 'openai' as const, label: 'b' };
    write({ providerConnections: [a, b] });
    const base = readRuntimeConfigEditAt(file);
    write({ providerConnections: [{ ...a, label: 'new-a' }, b] });
    writeRuntimeConfigFileAt(file, { providerConnections: [a, { ...b, label: 'new-b' }] }, base);
    expect(read().providerConnections.map((item: { label: string }) => item.label)).toEqual(['new-a', 'new-b']);
    expect(() => writeRuntimeConfigFileAt(file, { providerConnections: [{ ...a, model: 'other' }, b] }, base)).toThrow(/conflict/);
    expect(() => writeRuntimeConfigFileAt(file, { providerConnections: [b] }, base)).toThrow(/conflict/);
  });

  it('does not select a concurrently removed connection or delete a newly selected one', () => {
    const a = { id: 'a', provider: 'openai' as const };
    const b = { id: 'b', provider: 'openai' as const };
    write({ activeProviderConnectionId: 'a', providerConnections: [a, b] });
    const base = readRuntimeConfigEditAt(file);
    write({ activeProviderConnectionId: 'a', providerConnections: [a] });
    expect(() => writeRuntimeConfigFileAt(file, { activeProviderConnectionId: 'b' }, base)).toThrow(/conflict/);
    write({ activeProviderConnectionId: 'b', providerConnections: [a, b] });
    expect(() => writeRuntimeConfigFileAt(file, { providerConnections: [a] }, base)).toThrow(/conflict/);
    expect(read().activeProviderConnectionId).toBe('b');
    write({ activeProviderConnectionId: 'a', providerConnections: [a, { ...b, apiKey: 'new-generation' }] });
    expect(() => writeRuntimeConfigFileAt(file, { activeProviderConnectionId: 'b' }, base)).toThrow(/conflict/);
  });

  it.each([
    [' a ', 'a'], ['a', ' a '], ['', 'a'], ['   ', 'a'],
  ])('preserves raw identity spelling on unrelated saves: active=%j, record=%j', (active, id) => {
    write({ activeProviderConnectionId: active, providerConnections: [{ id, provider: 'openai' }] });
    const base = readRuntimeConfigEditAt(file);
    writeRuntimeConfigFileAt(file, { theme: 'light' }, base);
    expect(read()).toEqual({ activeProviderConnectionId: active, providerConnections: [{ id, provider: 'openai' }], theme: 'light' });
  });

  it('allows an already-landed complete selection as a no-op', () => {
    const a = { id: 'a', provider: 'openai' as const };
    const b = { id: 'b', provider: 'openai' as const, updatedAt: 'old' };
    write({ activeProviderConnectionId: 'a', providerConnections: [a, b] });
    const base = readRuntimeConfigEditAt(file);
    const desired = { activeProviderConnectionId: 'b', providerConnections: [a, { ...b, updatedAt: 'new' }] };
    write(desired); fs.utimesSync(file, new Date(0), new Date(0));
    writeRuntimeConfigFileAt(file, desired, base);
    expect(read()).toEqual(desired); expect(fs.statSync(file).mtimeMs).toBe(0);
  });

  it('uses strict recovery at the config writer and does not enter an uncertain lock', () => {
    write({ theme: 'dark' });
    const base = readRuntimeConfigEditAt(file);
    fs.writeFileSync(`${file}.lock`, ''); fs.utimesSync(`${file}.lock`, new Date(0), new Date(0));
    const writer = vi.spyOn(store, 'writeTextFileAtomic');
    try { writeRuntimeConfigFileAt(file, { theme: 'light' }, base); throw new Error('unexpected success'); }
    catch (error) { expect(error).toMatchObject({ state: 'unchanged', code: 'lock-failed' }); }
    expect(writer).not.toHaveBeenCalled(); expect(read()).toEqual({ theme: 'dark' });
    expect(fs.readFileSync(`${file}.lock`, 'utf8')).toBe('');
  });

  it('merges independent absent-file creators and rejects stale resurrection after deletion', () => {
    const first = readRuntimeConfigEditAt(file);
    const second = readRuntimeConfigEditAt(file);
    writeRuntimeConfigFileAt(file, { theme: 'dark' }, first);
    writeRuntimeConfigFileAt(file, { maxTurns: 9 }, second);
    expect(read()).toEqual({ theme: 'dark', maxTurns: 9 });
    const present = readRuntimeConfigEditAt(file);
    fs.unlinkSync(file);
    expect(() => writeRuntimeConfigFileAt(file, { theme: 'light' }, present)).toThrow(/conflict/);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('preserves new JSONC trivia, unknown values and raw placeholders during a stale edit', () => {
    const before = '\uFEFF{\r\n/* old */"theme":"dark","unknown":-0,"providerCredentials":{"openai":{"apiKey":"${PRIVATE_TEST_KEY}"}},}\r\n';
    fs.writeFileSync(file, before);
    const base = readRuntimeConfigEditAt(file);
    fs.writeFileSync(file, before.replace('/* old */', '/* newer */'));
    writeRuntimeConfigFileAt(file, { theme: 'light' }, base);
    expect(fs.readFileSync(file, 'utf8')).toBe(before.replace('/* old */', '/* newer */').replace('"dark"', '"light"'));
  });

  it.each(['{invalid', '{"schemaVersion":99}'])('preserves a malformed or future current file: %s', text => {
    const base = readRuntimeConfigEditAt(file);
    fs.writeFileSync(file, text);
    expect(() => writeRuntimeConfigFileAt(file, { theme: 'dark' }, base)).toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe(text);
  });

  it('requires a baseline for the same destination and freezes its raw values', () => {
    write({ tui: { diagrams: 'off' } });
    const base = readRuntimeConfigEditAt(file);
    expect(Object.isFrozen(base.values.tui)).toBe(true);
    expect(() => writeRuntimeConfigFileAt(path.join(root, 'other.json'), { theme: 'dark' }, base)).toThrow(/baseline/);
    expect(() => writeRuntimeConfigFileAt(file, {} as RuntimeConfigFile, undefined as never)).toThrow(/baseline/);
  });

  it('detects an external edit after candidate preparation and before the writer', () => {
    write({ theme: 'dark' });
    const base = readRuntimeConfigEditAt(file);
    const original = document.readConfigSnapshot;
    let reads = 0;
    vi.spyOn(document, 'readConfigSnapshot').mockImplementation(target => {
      if (++reads === 2) write({ theme: 'external' });
      return original(target);
    });
    const writer = vi.spyOn(store, 'writeTextFileAtomic');
    expect(() => writeRuntimeConfigFileAt(file, { theme: 'light' }, base)).toThrow(/conflict/);
    expect(writer).not.toHaveBeenCalled();
    expect(read().theme).toBe('external');
  });

  it('distinguishes writer-started unknown outcomes from verified persistence with cleanup failure', () => {
    write({ theme: 'dark' });
    const base = readRuntimeConfigEditAt(file);
    const writer = vi.spyOn(store, 'writeTextFileAtomic').mockImplementation(() => { throw new Error('private filesystem detail'); });
    try { writeRuntimeConfigFileAt(file, { theme: 'light' }, base); throw new Error('unexpected success'); }
    catch (error) { expect(error).toMatchObject({ state: 'unknown' }); expect(String(error)).not.toContain('private'); }
    writer.mockRestore();
    const originalLock = store.withFileLock;
    vi.spyOn(store, 'withFileLock').mockImplementation((lock, action, options) => { originalLock(lock, action, options); throw new Error('cleanup failed'); });
    try { writeRuntimeConfigFileAt(file, { theme: 'light' }, base); throw new Error('unexpected success'); }
    catch (error) { expect(error).toMatchObject({ state: 'persisted', code: 'lock-failed' }); }
    expect(read().theme).toBe('light');
  });

  it('does not report success when final bytes differ or cannot be read', () => {
    write({ theme: 'dark' });
    const base = readRuntimeConfigEditAt(file);
    vi.spyOn(store, 'writeTextFileAtomic').mockImplementation(() => write({ theme: 'external' }));
    try { writeRuntimeConfigFileAt(file, { theme: 'light' }, base); throw new Error('unexpected success'); }
    catch (error) { expect(error).toMatchObject({ state: 'unknown', code: 'verification-failed' }); }
    expect(read().theme).toBe('external');
  });

  it('keeps no-op mtime and distinguishes cleanup failure without claiming a write', () => {
    write({ theme: 'dark' }); fs.utimesSync(file, new Date(0), new Date(0));
    const base = readRuntimeConfigEditAt(file);
    const writer = vi.spyOn(store, 'writeTextFileAtomic');
    const originalLock = store.withFileLock;
    vi.spyOn(store, 'withFileLock').mockImplementation((lock, action, options) => { originalLock(lock, action, options); throw new Error('cleanup failed'); });
    try { writeRuntimeConfigFileAt(file, { theme: 'dark' }, base); throw new Error('unexpected success'); }
    catch (error) { expect(error).toMatchObject({ state: 'unchanged', code: 'lock-failed' }); }
    expect(writer).not.toHaveBeenCalled(); expect(fs.statSync(file).mtimeMs).toBe(0);
  });

  it('keeps cleanup failure visible alongside an action error', () => {
    const base = readRuntimeConfigEditAt(file);
    vi.spyOn(store, 'withFileLock').mockImplementation((_lock, _action, options) => {
      options?.onReleaseError?.(); throw new Error('lock setup failure');
    });
    try { writeRuntimeConfigFileAt(file, { theme: 'dark' }, base); throw new Error('unexpected success'); }
    catch (error) { expect(error).toMatchObject({ state: 'unchanged', cleanupFailed: true }); }
    expect(fs.existsSync(file)).toBe(false);
  });

  it('checks cross-record selection dependencies after acquiring the write lock', () => {
    const a = { id: 'a', provider: 'openai' as const, apiKey: 'old-a', updatedAt: '2026-01-02' };
    const b = { id: 'b', provider: 'openai' as const, apiKey: 'other-b', updatedAt: '2026-01-01' };
    write({ providerConnections: [a, b] }); const base = readRuntimeConfigEditAt(file);
    const latest = { providerConnections: [a, { ...b, updatedAt: '2026-01-03' }] };
    const lock = store.withFileLock;
    vi.spyOn(store, 'withFileLock').mockImplementation((lockPath, action, options) => lock(lockPath, () => {
      write(latest); return action();
    }, options));
    const writer = vi.spyOn(store, 'writeTextFileAtomic');
    const precondition = vi.fn((current: Readonly<RuntimeConfigFile>) => {
      expect(Object.isFrozen(current.providerConnections)).toBe(true);
      return current.providerConnections?.[1]?.updatedAt === b.updatedAt;
    });
    expect(() => persistConfigEdit(file, { providerConnections: [{ ...a, apiKey: 'renewed-a' }, b] }, base, CONFIG_FIELDS, precondition)).toThrow(/conflict/);
    expect(precondition).toHaveBeenCalledOnce(); expect(writer).not.toHaveBeenCalled(); expect(read()).toEqual(latest);
  });

  it('preserves unrelated settings with a satisfied precondition and guards no-op writes too', () => {
    write({ theme: 'dark', maxTurns: 5 }); const base = readRuntimeConfigEditAt(file);
    write({ theme: 'dark', maxTurns: 9 });
    persistConfigEdit(file, { theme: 'light' }, base, CONFIG_FIELDS, current => current.theme === 'dark');
    expect(read()).toEqual({ theme: 'light', maxTurns: 9 });
    const same = readRuntimeConfigEditAt(file); const writer = vi.spyOn(store, 'writeTextFileAtomic');
    expect(() => persistConfigEdit(file, same.values, same, CONFIG_FIELDS, () => false)).toThrow(/conflict/);
    expect(writer).not.toHaveBeenCalled(); expect(read()).toEqual({ theme: 'light', maxTurns: 9 });
  });
});

describe('credential file permissions', () => {
  let root: string;
  let file: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'config-mode-')); file = path.join(root, 'config.json'); });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
  const write = (value: unknown) => fs.writeFileSync(file, JSON.stringify(value));
  const mode = () => fs.statSync(file).mode & 0o777;

  it('writes a document holding an API key as owner-readable only', () => {
    write({ theme: 'dark' });
    fs.chmodSync(file, 0o644);
    const base = readRuntimeConfigEditAt(file);
    writeRuntimeConfigFileAt(file, {
      ...base.values,
      providerCredentials: { openai: { apiKey: 'synthetic-secret' } },
    }, base);
    expect(mode()).toBe(0o600);
    // The bytes are what the merge said; narrowing the mode did not drop fields.
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).theme).toBe('dark');
  });

  it('narrows an account token in a connection record too', () => {
    write({});
    fs.chmodSync(file, 0o644);
    const base = readRuntimeConfigEditAt(file);
    writeRuntimeConfigFileAt(file, {
      providerConnections: [{
        id: 'c1', provider: 'openai', authType: 'account-auth',
        accountAuth: { openai: { type: 'openai-chatgpt-account', accessToken: 'a', refreshToken: 'r', expiresAt: 1 } },
      }],
    }, base);
    expect(mode()).toBe(0o600);
  });

  it('leaves an ordinary settings file at the umask default', () => {
    write({ theme: 'dark' });
    fs.chmodSync(file, 0o644);
    const base = readRuntimeConfigEditAt(file);
    writeRuntimeConfigFileAt(file, { ...base.values, maxTurns: 9 }, base);
    expect(mode()).not.toBe(0o600);
  });

  it('does not treat a blank placeholder as a credential', () => {
    write({});
    fs.chmodSync(file, 0o644);
    const base = readRuntimeConfigEditAt(file);
    writeRuntimeConfigFileAt(file, { providerCredentials: { openai: { apiKey: '   ' } } }, base);
    expect(mode()).not.toBe(0o600);
  });
});
describe('narrowing a legacy credential file without rewriting it', () => {
  let root: string;
  let file: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'config-narrow-')); file = path.join(root, 'config.json'); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
  const mode = () => fs.statSync(file).mode & 0o777;

  it('narrows permissions when a save changes nothing at all', () => {
    // The file predates the rule. A save with no content change used to leave it
    // at 0644 forever, so the only way to protect it was to edit a setting.
    const content = { theme: 'dark', providerCredentials: { openai: { apiKey: 'synthetic-secret' } } };
    fs.writeFileSync(file, JSON.stringify(content));
    fs.chmodSync(file, 0o644);
    const base = readRuntimeConfigEditAt(file);
    writeRuntimeConfigFileAt(file, { ...base.values }, base);
    expect(mode()).toBe(0o600);
    // The bytes did not change, so a caller's revision is still the file's.
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(content);
  });

  it('leaves a credential-free file alone on an unchanged save', () => {
    fs.writeFileSync(file, JSON.stringify({ theme: 'dark' }));
    fs.chmodSync(file, 0o644);
    const base = readRuntimeConfigEditAt(file);
    writeRuntimeConfigFileAt(file, { ...base.values }, base);
    expect(mode()).not.toBe(0o600);
  });
});
