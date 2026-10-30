import fs from 'node:fs';
import * as io from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createProfileContext } from '../../../core/paths/profile/context.js';
import * as layoutOwner from '../sessionFileLayout.js';
import { locateCatalogDirectory, locateCatalogFiles, readCatalogFile, sessionCatalogReadBudget } from './files.js';

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return { ...actual, open: vi.fn(actual.open), lstat: vi.fn(actual.lstat) };
});

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(io.open).mockReset().mockImplementation(fs.promises.open);
  vi.mocked(io.lstat).mockReset().mockImplementation(fs.promises.lstat);
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const scratch = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(scratch, { recursive: true });
  const home = fs.mkdtempSync(path.join(scratch, 'catalog-boundary-'));
  roots.push(home);
  const profile = createProfileContext({ name: 'catalog', homeDir: home, env: {} });
  const store = layoutOwner.createSessionStoreLayout(home, profile);
  const files = layoutOwner.projectSessionFileLayout({ sessionsDir: store.sessionsDir, sessionId: 'saved' });
  fs.mkdirSync(files.sessionDir, { recursive: true });
  for (const target of [files.metadataPath, files.statePath, files.transcriptPath]) fs.writeFileSync(target, 'record');
  return { home, profile, store, files };
}

it('checks the shared profile directory once per location and stats every core file', async () => {
  const { store, files } = fixture();
  const guard = vi.spyOn(layoutOwner, 'assertSessionStoreProfile');
  const found = await locateCatalogFiles(store, 'saved');
  expect(found?.layout).toEqual(files);
  expect(found?.stats.map(stat => stat.size)).toEqual([6, 6, 6]);
  expect(guard.mock.calls.map(call => call[1])).toEqual([undefined, files.sessionDir]);
  expect(vi.mocked(io.lstat).mock.calls.map(call => call[0])).toEqual([
    files.sessionDir, files.metadataPath, files.statePath, files.transcriptPath,
  ]);
});

it.each(['metadataPath', 'statePath', 'transcriptPath'] as const)('refuses a linked %s without opening it', async key => {
  const { home, store, files } = fixture();
  const foreign = path.join(home, 'foreign');
  fs.writeFileSync(foreign, 'record');
  fs.unlinkSync(files[key]);
  fs.symlinkSync(foreign, files[key]);
  await expect(locateCatalogFiles(store, 'saved')).rejects.toThrow(/unavailable|symbolic links/);
  expect(io.open).not.toHaveBeenCalled();
});

it.each(['metadataPath', 'statePath', 'transcriptPath', 'stateLockPath'] as const)(
  'preserves direct-reference admission for a linked %s', async key => {
    const { home, store, files } = fixture();
    const foreign = path.join(home, 'foreign');
    fs.writeFileSync(foreign, 'record');
    if (fs.existsSync(files[key])) fs.unlinkSync(files[key]);
    fs.symlinkSync(foreign, files[key]);
    await expect(locateCatalogDirectory(store, 'saved')).rejects.toThrow(/symbolic links/);
    expect(io.open).not.toHaveBeenCalled();
  },
);

it('does not inspect the unused lock when locating listing files', async () => {
  const { home, store, files } = fixture();
  const foreign = path.join(home, 'foreign');
  fs.writeFileSync(foreign, 'record');
  fs.symlinkSync(foreign, files.stateLockPath);
  expect((await locateCatalogFiles(store, 'saved'))?.layout.sessionDir).toBe(files.sessionDir);
  expect(io.open).not.toHaveBeenCalled();
});

it.each(['session', 'ancestor'] as const)('refuses a linked %s directory before inspecting its files', async source => {
  const { store, files } = fixture();
  const target = source === 'session' ? files.sessionDir : store.sessionsDir;
  fs.renameSync(target, `${target}-retired`);
  fs.symlinkSync(`${target}-retired`, target, 'dir');
  await expect(locateCatalogFiles(store, 'saved')).rejects.toThrow(/symbolic links/);
  expect(io.lstat).not.toHaveBeenCalled();
  expect(io.open).not.toHaveBeenCalled();
});

it('refuses a replaced profile even when its path has been recreated', async () => {
  const { profile, store } = fixture();
  fs.renameSync(profile.root, `${profile.root}-retired`);
  fs.mkdirSync(profile.root);
  await expect(locateCatalogFiles(store, 'saved')).rejects.toThrow(/changed identity/);
  expect(io.lstat).not.toHaveBeenCalled();
  expect(io.open).not.toHaveBeenCalled();
});

it('checks profile identity again on the next location without caching admission', async () => {
  const { profile, store } = fixture();
  await locateCatalogFiles(store, 'saved');
  fs.renameSync(profile.root, `${profile.root}-retired`);
  fs.mkdirSync(profile.root);
  await expect(locateCatalogFiles(store, 'saved')).rejects.toThrow(/changed identity/);
});

it('preserves current-directory precedence and explicit fallback to an older source', async () => {
  const { home, store, files } = fixture();
  const history = path.join(home, 'history');
  fs.mkdirSync(path.join(history, 'saved'), { recursive: true });
  const compatible = { ...store, profile: undefined, sessionsSearchDirs: [store.sessionsDir, history] };
  expect((await locateCatalogDirectory(compatible, 'saved'))?.layout.sessionDir).toBe(files.sessionDir);
  fs.rmSync(files.sessionDir, { recursive: true });
  expect((await locateCatalogDirectory(compatible, 'saved'))?.layout.sessionDir).toBe(path.join(history, 'saved'));
});

it('preserves cancellation between the directory and its first file', async () => {
  const { store } = fixture();
  const controller = new AbortController(), reason = new Error('catalog cancelled');
  vi.mocked(io.lstat).mockImplementationOnce(async (...args) => {
    const stat = await fs.promises.lstat(...args);
    controller.abort(reason);
    return stat;
  });
  await expect(locateCatalogFiles(store, 'saved', controller.signal)).rejects.toBe(reason);
  expect(io.lstat).toHaveBeenCalledOnce();
});

it('rejects a file replaced after location without reading the replacement', async () => {
  const { store, files } = fixture();
  const found = (await locateCatalogFiles(store, 'saved'))!;
  fs.renameSync(files.metadataPath, `${files.metadataPath}-retired`);
  fs.writeFileSync(files.metadataPath, 'record');
  const reads: ReturnType<typeof vi.spyOn>[] = [], closes: ReturnType<typeof vi.spyOn>[] = [];
  vi.mocked(io.open).mockImplementation(async (...args) => {
    const handle = await fs.promises.open(...args);
    reads.push(vi.spyOn(handle, 'read'));
    closes.push(vi.spyOn(handle, 'close'));
    return handle;
  });
  await expect(readCatalogFile(files.metadataPath, found.stats[0], 100, undefined, sessionCatalogReadBudget(100)))
    .rejects.toThrow(/changed/);
  expect(reads).toHaveLength(1); expect(reads[0]).not.toHaveBeenCalled();
  expect(closes[0]).toHaveBeenCalledOnce();
});

it('keeps the same directory and three-file version on repeated location', async () => {
  const { store, files } = fixture();
  const first = (await locateCatalogFiles(store, 'saved'))!;
  expect((await locateCatalogFiles(store, 'saved'))?.version).toBe(first.version);
  fs.appendFileSync(files.transcriptPath, '\n');
  expect((await locateCatalogFiles(store, 'saved'))?.version).not.toBe(first.version);
});
