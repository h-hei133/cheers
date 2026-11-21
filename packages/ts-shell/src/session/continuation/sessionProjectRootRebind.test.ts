import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { rebindSessionProjectRootContinuity } from './sessionProjectRootRebind.js';

let root: string;

beforeEach(() => {
  const base = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(base, { recursive: true });
  root = fs.mkdtempSync(path.join(base, 'rebind-'));
  vi.stubEnv('HOME', root);
  vi.stubEnv('USERPROFILE', root);
  vi.stubEnv('CHEERS_TEST_ROOT', root);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const manager = new SessionManager();
  const store = new SessionStoreAccess();
  const source = path.join(root, 'source');
  const destination = path.join(root, 'destination');
  const session = manager.createNew(source, {
    rootMode: 'git-root', gitRoot: source, targetPathBase: source,
    requestedWorkspaceRoot: path.join(source, 'entry'),
  });
  manager.saveCompleted(session.id);
  const layout = store.stateLayout(session.id);
  const readRecord = () => store.readSnapshot(session.id);
  const rebind = (nextProjectRoot = destination) => rebindSessionProjectRootContinuity({
    store, sessionId: session.id, nextProjectRoot, updatedAt: '2026-05-28T00:00:02.000Z',
    select: (projectRoot, id, options) => manager.setCurrentSessionForProject(projectRoot, id, options),
  });
  return { store, source, destination, session, layout, readRecord, rebind };
}

describe('rebindSessionProjectRootContinuity', () => {
  it('projects the newest fields and legacy working memory from the locked records', () => {
    const { store, source, destination, layout, readRecord, rebind } = fixture();
    const initial = readRecord().session;
    vi.spyOn(store, 'load').mockReturnValue(initial);
    const enterLock = store.withSessionStateLock.bind(store);
    vi.spyOn(store, 'withSessionStateLock').mockImplementation((id, run, options) => enterLock(id, () => {
      const metadata = JSON.parse(fs.readFileSync(layout.metadataPath, 'utf8'));
      const state = JSON.parse(fs.readFileSync(layout.statePath, 'utf8'));
      fs.writeFileSync(layout.metadataPath, JSON.stringify({ ...metadata, title: 'latest title' }));
      delete state.projectRoot;
      state.lastError = 'latest error';
      state.workingMemory = { target: path.join(source, 'src', 'file.ts') };
      fs.writeFileSync(layout.statePath, JSON.stringify(state));
      return run();
    }, options));
    expect(rebind()).toMatchObject({ projectRoot: destination, title: 'latest title', status: 'completed', lastError: 'latest error' });
    expect(initial.projectRoot).toBe(source);
    expect(readRecord().state.workingMemory).toEqual({ target: path.join(destination, 'src', 'file.ts') });
  });

  it.each([false, true])('updates or retains workspace binding according to root identity (same=%s)', same => {
    const { source, destination, readRecord, rebind } = fixture();
    rebind(same ? source : destination);
    const { session } = readRecord();
    expect(session.targetPathBase).toBe(same ? source : destination);
    expect(session.requestedWorkspaceRoot).toBe(same ? path.join(source, 'entry') : destination);
    expect(session.rootMode).toBe(same ? 'git-root' : undefined);
    expect(session.gitRoot).toBe(same ? source : undefined);
  });

  it.each([undefined, null, [], 'state', {}, { status: 'unknown' }, { status: 'active', projectRoot: 1 }])(
    'rejects missing or malformed state without replacing it (%j)', state => {
      const { store, destination, layout, rebind } = fixture();
      const metadata = fs.readFileSync(layout.metadataPath);
      if (state === undefined) fs.unlinkSync(layout.statePath);
      else fs.writeFileSync(layout.statePath, JSON.stringify(state));
      expect(rebind).toThrow(expect.objectContaining({ outcome: 'unchanged', stage: 'prepare' }));
      expect(fs.readFileSync(layout.metadataPath)).toEqual(metadata);
      expect(fs.existsSync(layout.statePath)).toBe(state !== undefined);
      if (state !== undefined) expect(fs.readFileSync(layout.statePath, 'utf8')).toBe(JSON.stringify(state));
      expect(store.readCurrentSessionSelection(destination)).toBeUndefined();
    },
  );

  it('reports a confirmed commit when releasing the session lock fails', () => {
    const { store, destination, session, layout, readRecord, rebind } = fixture();
    const remove = fs.rmSync;
    const releaseError = new Error('lock release reported failure');
    const fault = vi.spyOn(fs, 'rmSync').mockImplementation((file, options) => {
      remove(file, options);
      if (file === layout.stateLockPath) throw releaseError;
    });
    syncBuiltinESMExports();
    try {
      expect(rebind).toThrow(expect.objectContaining({ outcome: 'committed', stage: 'lock-release', cause: releaseError }));
    } finally {
      fault.mockRestore();
      syncBuiltinESMExports();
    }
    expect(readRecord().session.projectRoot).toBe(destination);
    expect(store.readCurrentSessionSelection(destination)?.sessionId).toBe(session.id);
  });
});
