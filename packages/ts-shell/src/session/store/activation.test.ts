import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readCurrentSessionSelection, setCurrentSessionSelection, writeSessionRegistryStore } from './currentSessionRegistry.js';
import type { CurrentSessionSelectionRecord } from './currentSelection.js';
import { SessionManager } from '../SessionManager.js';
import { createSessionStoreLayout, locateExistingSessionLayout } from './sessionFileLayout.js';
import { readSessionFileVersion } from './version.js';
import { SessionStoreAccess } from './sessionStoreAccess.js';

const lockProbe = vi.hoisted(() => ({ before: undefined as (() => void) | undefined, after: undefined as ((lockPath: string) => void) | undefined }));
vi.mock('./sessionFileStore.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./sessionFileStore.js')>();
  return { ...actual, withFileLock: <T>(file: string, action: () => T, options?: Parameters<typeof actual.withFileLock>[2]): T => {
    if (!file.endsWith('current-session.json.lock')) return actual.withFileLock(file, action, options);
    const before = lockProbe.before, after = lockProbe.after; lockProbe.before = undefined; lockProbe.after = undefined;
    before?.();
    return actual.withFileLock(file, () => { const value = action(); after?.(file); return value; }, options);
  } };
});

interface Guard {
  readonly source: { readonly projectRoot: string; readonly expected: CurrentSessionSelectionRecord | undefined };
  readonly destination: CurrentSessionSelectionRecord | undefined;
  readonly signal?: AbortSignal;
  readonly admission?: () => string | undefined;
}
let root: string, file: string, sourceRoot: string, destinationRoot: string;
beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(temporary, { recursive: true }); root = fs.mkdtempSync(path.join(temporary, 'activation-'));
  file = path.join(root, 'current-session.json'); sourceRoot = path.join(root, 'source'); destinationRoot = path.join(root, 'destination');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
});
afterEach(() => { lockProbe.before = undefined; lockProbe.after = undefined; vi.restoreAllMocks(); syncBuiltinESMExports(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
const current = (projectRoot: string) => readCurrentSessionSelection({ storePaths: [file], projectRoot });
const set = (projectRoot: string, sessionId: string, updatedAt = '2026-11-19') => setCurrentSessionSelection({ storePath: file, projectRoot, sessionId, updatedAt });
const guard = (): Guard => ({ source: { projectRoot: sourceRoot, expected: current(sourceRoot) }, destination: current(destinationRoot) });
const select = (guard: Guard, captureSelection?: (record: CurrentSessionSelectionRecord) => void) => setCurrentSessionSelection({
  storePath: file, projectRoot: destinationRoot, sessionId: 'target', updatedAt: '2026-11-20', guard, captureSelection,
} as Parameters<typeof setCurrentSessionSelection>[0]);

it('refuses a competing source activation acquired while the caller waits for the registry lock', () => {
  set(sourceRoot, 'source'); set(destinationRoot, 'destination'); const captured = guard(); let competitor!: Buffer;
  lockProbe.before = () => { set(sourceRoot, 'competitor'); competitor = fs.readFileSync(file); };
  expect(() => select(captured)).toThrow('activation changed'); expect(fs.readFileSync(file)).toEqual(competitor); expect(current(destinationRoot)?.sessionId).toBe('destination');
});

it.each(['source', 'destination'] as const)('refuses an absent %s selection that becomes present', side => {
  const captured = guard(); let competitor!: Buffer;
  lockProbe.before = () => { set(side === 'source' ? sourceRoot : destinationRoot, 'competitor'); competitor = fs.readFileSync(file); };
  expect(() => select(captured)).toThrow('activation changed'); expect(fs.readFileSync(file)).toEqual(competitor);
});

it.each(['source', 'destination'] as const)('does not resurrect a deleted %s selection', side => {
  set(sourceRoot, 'source'); set(destinationRoot, 'destination'); const captured = guard(); let competitor!: Buffer;
  lockProbe.before = () => { const records = { [sourceRoot]: current(sourceRoot)!, [destinationRoot]: current(destinationRoot)! }; delete records[side === 'source' ? sourceRoot : destinationRoot];
    writeSessionRegistryStore({ storePath: file, store: { schemaVersion: 1, byProjectRoot: records } }); competitor = fs.readFileSync(file); };
  expect(() => select(captured)).toThrow('activation changed'); expect(fs.readFileSync(file)).toEqual(competitor);
});

it.each(['source', 'destination'] as const)('refuses same-id same-time reactivation of %s through its unique activation identity', side => {
  set(sourceRoot, 'source'); set(destinationRoot, 'destination'); const captured = guard(); let competitor!: Buffer;
  lockProbe.before = () => { set(side === 'source' ? sourceRoot : destinationRoot, side, '2026-11-19'); competitor = fs.readFileSync(file); };
  expect(() => select(captured)).toThrow('activation changed'); expect(fs.readFileSync(file)).toEqual(competitor);
});

it('refuses legacy timestamp changes even when there is no activation id', () => {
  writeSessionRegistryStore({ storePath: file, store: { schemaVersion: 1, byProjectRoot: { [sourceRoot]: { sessionId: 'source', updatedAt: 'older' } } } });
  const captured = guard(); let competitor!: Buffer;
  lockProbe.before = () => { writeSessionRegistryStore({ storePath: file, store: { schemaVersion: 1, byProjectRoot: { [sourceRoot]: { sessionId: 'source', updatedAt: 'newer' } } } }); competitor = fs.readFileSync(file); };
  expect(() => select(captured)).toThrow('activation changed'); expect(fs.readFileSync(file)).toEqual(competitor);
});

it('refuses an unreadable registry rather than treating its source and destination as absent', () => {
  fs.writeFileSync(file, '{broken'); const before = fs.readFileSync(file);
  expect(() => select({ source: { projectRoot: sourceRoot, expected: undefined }, destination: undefined })).toThrow('unavailable'); expect(fs.readFileSync(file)).toEqual(before);
});

it.each(['signal', 'admission'] as const)('rechecks %s after reading the locked registry before publishing', mode => {
  set(sourceRoot, 'source'); set(destinationRoot, 'destination'); const controller = new AbortController(); let allowed = true;
  const captured = { ...guard(), signal: controller.signal, admission: () => allowed ? undefined : 'Activation admission revoked.' }; const before = fs.readFileSync(file);
  const read = fs.readFileSync.bind(fs);
  vi.spyOn(fs, 'readFileSync').mockImplementation(((target: fs.PathOrFileDescriptor, options?: unknown) => {
    const bytes = Reflect.apply(read, fs, [target, options]);
    if (target === file) { if (mode === 'signal') controller.abort(); else allowed = false; }
    return bytes;
  }) as typeof fs.readFileSync);
  syncBuiltinESMExports();
  expect(() => select(captured)).toThrow(); expect(fs.readFileSync(file)).toEqual(before);
});

it('captures the exact candidate before a committed rename whose lock release then fails', () => {
  set(sourceRoot, 'source'); const captured = guard(); let candidate: CurrentSessionSelectionRecord | undefined;
  lockProbe.after = lock => { const owner = JSON.parse(fs.readFileSync(lock, 'utf8')); fs.writeFileSync(lock, JSON.stringify({ ...owner, token: 'replacement-owner' })); };
  expect(() => select(captured, value => { candidate = value; })).toThrow('ownership lost');
  expect(candidate).toMatchObject({ sessionId: 'target', activationId: expect.any(String) }); expect(current(destinationRoot)).toEqual(candidate);
});

it('threads guarded selection and candidate capture through the real SessionManager setter', () => {
  const manager = new SessionManager(), a = manager.createNew(sourceRoot), b = manager.createNew(destinationRoot, { activate: false });
  const original = manager.resolveCurrentSessionForProject(sourceRoot); expect(original.ok).toBe(true);
  const captured = { source: { projectRoot: sourceRoot, expected: undefined }, destination: undefined };
  expect(() => (manager.setCurrentSessionForProject as (root: string, id: string, options: unknown) => void)(destinationRoot, b.id, { guard: captured })).toThrow('activation changed');
  expect(manager.getCurrentSessionForProject(sourceRoot)?.id).toBe(a.id); expect(manager.getCurrentSessionForProject(destinationRoot)).toBeNull();
});

it('passes the guarded source selection into the final resume activation', () => {
  const manager = new SessionManager(), source = manager.createNew(root), target = manager.createNew(root, { activate: false });
  const captured = { source: { projectRoot: root, expected: undefined }, destination: undefined };
  const result = manager.tryResume(target.id, root, { mode: 'continuity-only', activation: { guard: captured } } as Parameters<typeof manager.tryResume>[2]);
  expect(result).toMatchObject({ ok: false }); expect(manager.getCurrentSessionForProject(root)?.id).toBe(source.id);
});

it('reports a confirmed resume activation with a warning when its own registry lock release fails', () => {
  const manager = new SessionManager(), source = manager.createNew(root), target = manager.createNew(root, { activate: false });
  const store = new SessionStoreAccess(), selected = store.readCurrentSessionSelection(root);
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), target.id); let candidate: CurrentSessionSelectionRecord | undefined;
  lockProbe.after = lock => { const owner = JSON.parse(fs.readFileSync(lock, 'utf8')); fs.writeFileSync(lock, JSON.stringify({ ...owner, token: 'replacement-owner' })); };
  const result = manager.tryResume(target.id, root, { mode: 'continuity-only', expectedVersion: readSessionFileVersion(layout),
    activation: { guard: { source: { projectRoot: root, expected: selected }, destination: selected }, captureSelection: value => { candidate = value; } },
  } as Parameters<typeof manager.tryResume>[2]);
  expect(result).toMatchObject({ ok: true, session: { id: target.id }, warning: expect.any(String) });
  expect(store.readCurrentSessionSelection(root)).toEqual(candidate); expect(candidate?.sessionId).not.toBe(source.id);
});

it('keeps a resume unknown when a later same-id activation follows its publication before readback', () => {
  const manager = new SessionManager(); manager.createNew(root); const target = manager.createNew(root, { activate: false });
  const store = new SessionStoreAccess(), selected = store.readCurrentSessionSelection(root), layout = locateExistingSessionLayout(createSessionStoreLayout(), target.id);
  let candidate: CurrentSessionSelectionRecord | undefined;
  lockProbe.after = lock => {
    const registryFile = lock.slice(0, -5), registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
    registry.byProjectRoot[root].activationId = 'successor-activation'; fs.writeFileSync(registryFile, JSON.stringify(registry));
    const owner = JSON.parse(fs.readFileSync(lock, 'utf8')); fs.writeFileSync(lock, JSON.stringify({ ...owner, token: 'replacement-owner' }));
  };
  const result = manager.tryResume(target.id, root, { mode: 'continuity-only', expectedVersion: readSessionFileVersion(layout),
    activation: { guard: { source: { projectRoot: root, expected: selected }, destination: selected }, captureSelection: value => { candidate = value; } },
  } as Parameters<typeof manager.tryResume>[2]);
  expect(result).toMatchObject({ ok: false, activation: 'unknown' }); expect(store.readCurrentSessionSelection(root)?.activationId).toBe('successor-activation');
  expect(candidate?.activationId).not.toBe('successor-activation');
});

it('rechecks source cancellation at the native rename after temporary bytes are synced', () => {
  set(sourceRoot, 'source'); const controller = new AbortController(), captured = { ...guard(), signal: controller.signal }, before = fs.readFileSync(file);
  const sync = fs.fsyncSync.bind(fs);
  vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => { sync(fd); controller.abort(); }); syncBuiltinESMExports();
  expect(() => select(captured)).toThrow(); expect(fs.readFileSync(file)).toEqual(before);
});

it('discards stale candidate readback if loading the saved target activates that same id again', () => {
  const manager = new SessionManager(); manager.createNew(root); const target = manager.createNew(root, { activate: false });
  const store = new SessionStoreAccess(), selected = store.readCurrentSessionSelection(root), layout = locateExistingSessionLayout(createSessionStoreLayout(), target.id);
  let checking = false;
  lockProbe.after = lock => { const owner = JSON.parse(fs.readFileSync(lock, 'utf8')); fs.writeFileSync(lock, JSON.stringify({ ...owner, token: 'replacement-owner' })); checking = true; };
  const load = SessionStoreAccess.prototype.load;
  vi.spyOn(SessionStoreAccess.prototype, 'load').mockImplementation(function (...args) {
    const result = load.apply(this, args);
    if (checking) {
      checking = false;
      const registryFile = path.join(root, '.cheers/current-session.json'), registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
      registry.byProjectRoot[root].activationId = 'readback-successor'; fs.writeFileSync(registryFile, JSON.stringify(registry));
    }
    return result;
  });
  const result = manager.tryResume(target.id, root, { mode: 'continuity-only', expectedVersion: readSessionFileVersion(layout),
    activation: { guard: { source: { projectRoot: root, expected: selected }, destination: selected } } });
  expect(result).toMatchObject({ ok: false, activation: 'unknown' }); expect(store.readCurrentSessionSelection(root)?.activationId).toBe('readback-successor');
});

it('does not overwrite a competing activation published by its own admission callback', () => {
  set(sourceRoot, 'source'); const captured = guard(); let competitor: Buffer | undefined;
  const admission = () => {
    if (!competitor) { writeSessionRegistryStore({ storePath: file, store: { schemaVersion: 1,
      byProjectRoot: { [sourceRoot]: { sessionId: 'competitor', updatedAt: 'later', activationId: 'reentrant' } } } }); competitor = fs.readFileSync(file); }
    return undefined;
  };
  expect(() => select({ ...captured, admission })).toThrow('activation changed'); expect(fs.readFileSync(file)).toEqual(competitor);
});

it('rechecks admission when the final rename registry read revokes its source', () => {
  set(sourceRoot, 'source'); let allowed = true, synced = false;
  const captured = { ...guard(), admission: () => allowed ? undefined : 'Final activation revoked.' }, before = fs.readFileSync(file);
  const sync = fs.fsyncSync.bind(fs), read = fs.readFileSync.bind(fs);
  vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => { sync(fd); synced = true; });
  vi.spyOn(fs, 'readFileSync').mockImplementation(((target: fs.PathOrFileDescriptor, options?: unknown) => {
    const bytes = Reflect.apply(read, fs, [target, options]); if (target === file && synced) allowed = false; return bytes;
  }) as typeof fs.readFileSync); syncBuiltinESMExports();
  expect(() => select(captured)).toThrow('revoked'); expect(fs.readFileSync(file)).toEqual(before);
});
