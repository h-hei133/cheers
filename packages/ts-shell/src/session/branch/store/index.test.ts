import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManager } from '../../SessionManager.js';
import { createSessionStoreLayout, locateExistingSessionLayout } from '../../store/sessionFileLayout.js';
import { appendTranscriptEvent, readTranscriptEvents } from '../../transcript/sessionTranscript.js';
import type { TranscriptEvent } from '../../sessionEventCodec.js';
import { sessionRootEntryId } from '../../schema/sessionThread.js';
import { forkTranscriptEvents } from '../fork.js';
import { loadCodemodeStore, replayCodemodeBranchStore } from '../../../core/tools/codemode/store.js';
import { createCodemodeToolDefinition } from '../../../core/tools/codemode/tool.js';
import { BranchStoreError, captureBranchStore } from './index.js';
import { replayBranchStore } from './replay.js';
import { MAX_STORE_REVISION_KEYS, MAX_STORE_REVISION_KEY_CHARS, MAX_STORE_TOTAL_CHARS, MAX_STORE_VALUE_CHARS } from './contract.js';
import { decodeTranscriptLineSafe, type BranchStoreTranscriptEntry } from '../../sessionEventCodec.js';
import { loadSessionRecord } from '../../store/sessionStore.js';
import { switchDurableSessionActiveLeaf } from '../../store/threadState.js';

let temporary: string;
let workspace: string;
let manager: SessionManager;
let sessionId: string;

beforeEach(() => {
  const parent = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(parent, { recursive: true });
  temporary = fs.mkdtempSync(path.join(parent, 'branch-store-'));
  workspace = path.join(temporary, 'workspace');
  const home = path.join(temporary, 'home');
  fs.mkdirSync(workspace); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('CHEERS_TEST_ROOT', temporary); vi.stubEnv('GIT_CEILING_DIRECTORIES', temporary);
  manager = new SessionManager(); sessionId = manager.createNew(workspace).id;
});
afterEach(() => {
  vi.restoreAllMocks(); syncBuiltinESMExports(); vi.unstubAllEnvs();
  fs.rmSync(temporary, { recursive: true, force: true });
});

function internalEvent(sourceEntryId = sessionRootEntryId(sessionId)): BranchStoreTranscriptEntry {
  return { type: 'branch-store', id: 'route-fixture', namespace: 'model-routing', sourceEntryId,
    entries: { private: '"internal-route-value"' }, timestamp: '2026-11-15T00:00:00.000Z' };
}
function transcriptPath(id = sessionId) {
  return locateExistingSessionLayout(createSessionStoreLayout(), id).transcriptPath;
}

describe('session branch storage compatibility boundary', () => {
  it('keeps internal namespace records out of the legacy codemode event discriminator', () => {
    const internal = internalEvent();
    const codemode: TranscriptEvent = { type: 'codemode-store', entries: { visible: '"worker-value"' }, timestamp: 't' };
    const disk = [codemode, internal].map(event => JSON.parse(JSON.stringify(event)) as TranscriptEvent);
    const legacyEntries = disk.filter(event => event.type === 'codemode-store');
    expect(legacyEntries).toEqual([codemode]);
    expect(Object.fromEntries(replayCodemodeBranchStore(disk))).toEqual({ visible: '"worker-value"' });
  });

  it('reopens a mixed transcript and starts a worker with codemode values only', async () => {
    loadCodemodeStore(sessionId, workspace).commit({ visible: '"worker-value"' });
    appendTranscriptEvent(transcriptPath(), internalEvent(), undefined, { requireExisting: true });
    manager = new SessionManager();
    expect(manager.getTranscriptEvents(sessionId)).toContainEqual(internalEvent());
    expect(loadCodemodeStore(sessionId, workspace).initial).toEqual({ visible: '"worker-value"' });
    const result = await createCodemodeToolDefinition(() => new Map()).execute({
      code: 'return { visible: load("visible"), private: load("private") === undefined };',
    }, { workspaceRoot: workspace, sessionId, taskId: 'namespace-boundary' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('"private": true');
    expect(JSON.stringify(result)).not.toContain('internal-route-value');
  });

  it('remaps internal root anchors in the existing fork event owner', () => {
    const copied = forkTranscriptEvents([internalEvent()], sessionId, 'sess_forked');
    expect(copied).toEqual([{ ...internalEvent(), sourceEntryId: sessionRootEntryId('sess_forked') }]);
  });

  it('retains internal records in a real fork without exposing their values to the fork worker', () => {
    loadCodemodeStore(sessionId, workspace).commit({ visible: '"worker-value"' });
    appendTranscriptEvent(transcriptPath(), internalEvent(), undefined, { requireExisting: true });
    const forked = manager.fork(sessionId, workspace, { activate: false });
    expect(readTranscriptEvents(transcriptPath(forked.id))).toContainEqual({
      ...internalEvent(), sourceEntryId: sessionRootEntryId(forked.id),
    });
    expect(loadCodemodeStore(forked.id, workspace).initial).toEqual({ visible: '"worker-value"' });
    loadCodemodeStore(forked.id, workspace).commit({ visible: '"fork-value"' });
    expect(loadCodemodeStore(sessionId, workspace).initial).toEqual({ visible: '"worker-value"' });
  });
});

describe('host-owned branch storage leases', () => {
  const capture = (namespace = 'model-routing', id = sessionId) => captureBranchStore({ sessionId: id, cwd: workspace, namespace });

  it('isolates same-named keys and writes across host namespaces and codemode', () => {
    const routing = capture(); const other = capture('another-owner'); const codemode = loadCodemodeStore(sessionId, workspace);
    expect(routing.commit({ private: '"routing"' })).toBe('persisted');
    expect(other.commit({ private: '"other"' })).toBe('persisted');
    expect(codemode.commit({ private: '"worker"' })).toBe('persisted');
    expect(capture().initial).toEqual({ private: '"routing"' });
    expect(capture('another-owner').initial).toEqual({ private: '"other"' });
    expect(loadCodemodeStore(sessionId, workspace).initial).toEqual({ private: '"worker"' });
    expect(readTranscriptEvents(transcriptPath()).filter(event => event.type === 'branch-store')
      .map(event => event.namespace)).toEqual(['model-routing', 'another-owner']);
  });

  it('keeps special string keys local to their namespace', () => {
    const values = Object.fromEntries([['__proto__', '"value"'], ['constructor', '"local"']]);
    capture().commit(values);
    expect(capture().initial).toEqual(values);
    expect(loadCodemodeStore(sessionId, workspace).initial).toEqual({});
  });

  it('reopens internal values and tombstones and inherits them independently in real forks', () => {
    capture().commit({ shared: '"source"', removed: '"old"' });
    capture().commit({ removed: null });
    manager = new SessionManager();
    const forked = manager.fork(sessionId, workspace, { activate: false });
    expect(capture('model-routing', forked.id).initial).toEqual({ shared: '"source"' });
    expect(capture('model-routing', forked.id).commit({ shared: '"fork"' })).toBe('persisted');
    expect(capture().initial).toEqual({ shared: '"source"' });
    expect(capture('model-routing', forked.id).initial).toEqual({ shared: '"fork"' });
    const events = readTranscriptEvents(transcriptPath(forked.id));
    const replayed = replayBranchStore(events, 'model-routing', [sessionRootEntryId(forked.id)]);
    expect(replayed.revisions.get('removed')).toBe(2);
    expect(replayed.values.has('removed')).toBe(false);
  });

  it('replays internal records only on their captured ancestry', () => {
    const events: TranscriptEvent[] = [{ ...internalEvent('first'), entries: { key: '"before"' } },
      { ...internalEvent('abandoned'), id: 'abandoned-store', entries: { key: '"abandoned"' } }];
    const replayed = replayBranchStore(events, 'model-routing', ['first', 'new-leaf']);
    expect(Object.fromEntries(replayed.values)).toEqual({ key: '"before"' });
    expect(replayed.revisions.get('key')).toBe(1);
  });

  it('rejects a state-free read-key result after an ABA change without appending', async () => {
    capture().commit({ key: '"before"' });
    const pending = capture();
    await Promise.resolve();
    capture().commit({ key: '"during"' }); capture().commit({ key: '"before"' });
    const before = fs.readFileSync(transcriptPath(), 'utf8');
    expect(() => pending.assertCurrent(['key'])).toThrow(expect.objectContaining({ reason: 'conflict', status: 'unchanged' }));
    expect(fs.readFileSync(transcriptPath(), 'utf8')).toBe(before);
  });

  it('validates only selected read keys while permitting unrelated writes', () => {
    capture().commit({ key: '"before"' }); const pending = capture();
    capture().commit({ unrelated: '"new"' }); capture('another-owner').commit({ key: '"other"' });
    const before = fs.readFileSync(transcriptPath(), 'utf8');
    expect(() => pending.assertCurrent(['key'])).not.toThrow();
    expect(fs.readFileSync(transcriptPath(), 'utf8')).toBe(before);
    expect(pending.commit({ result: '"accepted"' })).toBe('persisted');
    expect(capture().initial).toEqual({ key: '"before"', unrelated: '"new"', result: '"accepted"' });
  });

  it('captures read keys before admission can change them and never invokes accessor/proxy traps', () => {
    capture().commit({ key: '"before"' }); const pending = capture();
    capture().commit({ key: '"changed"' }); const keys = ['key'];
    expect(() => pending.assertCurrent(keys, () => { keys[0] = 'other'; }))
      .toThrow(expect.objectContaining({ reason: 'conflict', status: 'unchanged' }));
    const getter = vi.fn(() => 'key'); const accessor: string[] = [];
    Object.defineProperty(accessor, '0', { get: getter, enumerable: true });
    expect(() => capture().assertCurrent(accessor)).toThrow(expect.objectContaining({ reason: 'invalid' }));
    expect(getter).not.toHaveBeenCalled();
    const trap = vi.fn(); const proxy = new Proxy(['key'], { get: trap });
    expect(() => capture().assertCurrent(proxy)).toThrow(expect.objectContaining({ reason: 'invalid' }));
    expect(trap).not.toHaveBeenCalled();
  });

  it('rejects write accessors and proxies before publishing or invoking their traps', () => {
    const getter = vi.fn(() => '"private"'); const writes = {};
    Object.defineProperty(writes, 'key', { get: getter, enumerable: true });
    expect(() => capture().commit(writes)).toThrow(expect.objectContaining({ reason: 'invalid', status: 'unchanged' }));
    expect(getter).not.toHaveBeenCalled();
    const trap = vi.fn(); const proxy = new Proxy({ key: '"private"' }, { ownKeys: trap });
    expect(() => capture().commit(proxy)).toThrow(expect.objectContaining({ reason: 'invalid', status: 'unchanged' }));
    expect(trap).not.toHaveBeenCalled();
    expect(readTranscriptEvents(transcriptPath())).toEqual([]);
  });

  it('bounds internal write/read sets and deletion keys before publishing', () => {
    const before = fs.readFileSync(transcriptPath(), 'utf8');
    const tooMany = Object.fromEntries(Array.from({ length: MAX_STORE_REVISION_KEYS + 1 }, (_, index) => [`k${index}`, null]));
    expect(() => capture().commit(tooMany)).toThrow(expect.objectContaining({ reason: 'budget', status: 'unchanged' }));
    expect(() => capture().commit({ ['x'.repeat(MAX_STORE_REVISION_KEY_CHARS + 1)]: null }))
      .toThrow(expect.objectContaining({ reason: 'budget', status: 'unchanged' }));
    expect(() => capture().assertCurrent(Array.from({ length: MAX_STORE_REVISION_KEYS + 1 }, () => 'key')))
      .toThrow(expect.objectContaining({ reason: 'budget', status: 'unchanged' }));
    expect(() => capture().assertCurrent(['x'.repeat(MAX_STORE_REVISION_KEY_CHARS + 1)]))
      .toThrow(expect.objectContaining({ reason: 'budget', status: 'unchanged' }));
    expect(fs.readFileSync(transcriptPath(), 'utf8')).toBe(before);
  });

  it('counts durable tombstones against the internal revision budget before a later write', () => {
    const tombstones = Object.fromEntries(Array.from({ length: MAX_STORE_REVISION_KEYS }, (_, index) => [`k${index}`, null]));
    capture().commit(tombstones);
    expect(capture().initial).toEqual({});
    const before = fs.readFileSync(transcriptPath(), 'utf8');
    expect(() => capture().commit({ extra: null })).toThrow(expect.objectContaining({ reason: 'budget', status: 'unchanged' }));
    expect(fs.readFileSync(transcriptPath(), 'utf8')).toBe(before);
    expect(capture().commit({ k0: '"reused"' })).toBe('persisted');
  });

  it('bounds internal tombstone key characters and rejects oversized replayed revision state', () => {
    const key = 'x'.repeat(MAX_STORE_REVISION_KEY_CHARS);
    capture().commit({ [key]: null });
    const before = fs.readFileSync(transcriptPath(), 'utf8');
    expect(() => capture().commit({ extra: null })).toThrow(expect.objectContaining({ reason: 'budget', status: 'unchanged' }));
    expect(fs.readFileSync(transcriptPath(), 'utf8')).toBe(before);
    const events: TranscriptEvent[] = [{ ...internalEvent(), entries: { [key]: null } },
      { ...internalEvent(), id: 'later-tombstone', entries: { extra: null } }];
    expect(() => replayBranchStore(events, 'model-routing', [sessionRootEntryId(sessionId)]))
      .toThrow(expect.objectContaining({ reason: 'budget', status: 'unchanged' }));
  });

  it('preserves the existing internal live value and total character limits', () => {
    expect(() => capture().commit({ key: JSON.stringify('x'.repeat(MAX_STORE_VALUE_CHARS)) }))
      .toThrow(expect.objectContaining({ reason: 'invalid', status: 'unchanged' }));
    const values = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`k${index}`, JSON.stringify('x'.repeat(240_000))]));
    expect(Object.values(values).reduce((total, value) => total + value.length, 0)).toBeGreaterThan(MAX_STORE_TOTAL_CHARS);
    expect(() => capture().commit(values)).toThrow(expect.objectContaining({ reason: 'budget', status: 'unchanged' }));
    expect(readTranscriptEvents(transcriptPath())).toEqual([]);
  });

  it('retains absent-key deletion revisions and never revives a retired lease', () => {
    const pending = capture();
    capture().commit({ key: '"during"' }); capture().commit({ key: null });
    expect(() => pending.commit({ key: '"stale"' })).toThrow(expect.objectContaining({ reason: 'conflict', status: 'unchanged' }));
    expect(() => pending.assertCurrent([])).toThrow(expect.objectContaining({ reason: 'conflict', status: 'unchanged' }));
    expect(capture().initial).toEqual({});
  });

  it('validates empty commits and state-free history checks against the original branch', () => {
    const pending = capture(); manager.addTurn(sessionId, { role: 'user', content: 'later history' });
    expect(() => pending.commit({})).toThrow(expect.objectContaining({ reason: 'conflict', status: 'unchanged' }));
    expect(() => pending.assertCurrent([])).toThrow(expect.objectContaining({ reason: 'conflict', status: 'unchanged' }));
  });

  it('rejects a navigation round trip captured before await', async () => {
    manager.addTurn(sessionId, { role: 'user', content: 'first' });
    manager.addTurn(sessionId, { role: 'assistant', content: 'second' });
    const pending = capture(); await Promise.resolve();
    const files = locateExistingSessionLayout(createSessionStoreLayout(), sessionId);
    const ids = readTranscriptEvents(files.transcriptPath).filter(event => event.type === 'message').map(event => event.id!);
    for (const leafEntryId of [ids[0]!, ids[1]!]) switchDurableSessionActiveLeaf({
      session: loadSessionRecord({ sessionId, layout: files, cwd: workspace }), layout: files, leafEntryId,
    });
    expect(() => pending.commit({ key: '"stale"' })).toThrow(expect.objectContaining({ reason: 'conflict', status: 'unchanged' }));
  });

  it('captures owner admission before await and does not revive it after an empty refusal', async () => {
    const controller = new AbortController();
    const pending = captureBranchStore({ sessionId, cwd: workspace, namespace: 'model-routing',
      admission: () => controller.signal.throwIfAborted() });
    await Promise.resolve(); controller.abort();
    expect(() => pending.commit({})).toThrow(BranchStoreError);
    expect(() => pending.assertCurrent([], () => {})).toThrow(BranchStoreError);
    expect(readTranscriptEvents(transcriptPath())).toEqual([]);
  });

  it('rechecks history after the final admission callback before append', () => {
    const pending = capture(); let checks = 0;
    const before = fs.readFileSync(transcriptPath(), 'utf8');
    expect(() => pending.commit({ key: '"stale"' }, () => {
      if (++checks === 2) appendTranscriptEvent(transcriptPath(), { type: 'message', id: 'late-message', role: 'user',
        content: 'changed in final callback', timestamp: 't' }, undefined, { requireExisting: true });
    })).toThrow(expect.objectContaining({ reason: 'conflict', status: 'unchanged' }));
    expect(fs.readFileSync(transcriptPath(), 'utf8')).not.toBe(before);
    expect(readTranscriptEvents(transcriptPath()).filter(event => event.type === 'branch-store')).toEqual([]);
  });

  it.each([1, 2])('refuses an outer write after admission %s swallows a same-handle reentry failure', check => {
    const pending = capture(); let calls = 0;
    const before = fs.readFileSync(transcriptPath(), 'utf8');
    expect(() => pending.commit({ key: '"retired"' }, () => {
      if (++calls === check) { try { pending.assertCurrent([]); } catch { /* The outer owner must still retire. */ } }
    })).toThrow(expect.objectContaining({ status: 'unchanged' }));
    expect(fs.readFileSync(transcriptPath(), 'utf8')).toBe(before);
    expect(() => pending.assertCurrent([])).toThrow(expect.objectContaining({ status: 'unchanged' }));
  });

  it.each(['append', 'fsync', 'readback'] as const)('preserves unknown internal persistence after %s fails', failure => {
    const pending = capture();
    if (failure === 'append') {
      const append = fs.appendFileSync;
      vi.spyOn(fs, 'appendFileSync').mockImplementation((...args: Parameters<typeof fs.appendFileSync>) => {
        append(...args); if (String(args[1]).includes('branch-store')) throw new Error('fixture-private-append');
      });
    } else if (failure === 'fsync') vi.spyOn(fs, 'fsyncSync').mockImplementation(() => { throw new Error('fixture-private-fsync'); });
    else {
      const read = fs.readSync; let synchronized = false;
      const sync = fs.fsyncSync;
      vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => { sync(fd); synchronized = true; });
      vi.spyOn(fs, 'readSync').mockImplementation(((...args: Parameters<typeof fs.readSync>) => {
        if (synchronized) throw new Error('fixture-private-readback'); return read(...args);
      }) as typeof fs.readSync);
    }
    syncBuiltinESMExports();
    try { pending.commit({ key: '"landed"' }); throw new Error('Expected storage refusal.'); }
    catch (error) {
      expect(error).toBeInstanceOf(BranchStoreError);
      expect(error).toMatchObject({ status: 'unknown' });
      expect(String(error)).not.toContain('fixture-private');
    }
    vi.restoreAllMocks(); syncBuiltinESMExports();
    expect(capture().initial).toEqual({ key: '"landed"' });
    expect(() => pending.commit({ key: '"retry"' })).toThrow(expect.objectContaining({ status: 'unknown' }));
  });

  it('retains confirmed persistence when releasing the existing session lock fails', () => {
    const pending = capture(); const remove = fs.rmSync;
    const files = locateExistingSessionLayout(createSessionStoreLayout(), sessionId);
    vi.spyOn(fs, 'rmSync').mockImplementation((...args: Parameters<typeof fs.rmSync>) => {
      if (args[0] === files.stateLockPath) throw new Error('fixture-private-release'); return remove(...args);
    });
    syncBuiltinESMExports();
    try { pending.commit({ key: '"confirmed"' }); throw new Error('Expected release refusal.'); }
    catch (error) {
      expect(error).toBeInstanceOf(BranchStoreError);
      expect(error).toMatchObject({ reason: 'lock-failed', status: 'persisted' });
      expect(String(error)).not.toContain('fixture-private-release');
    }
    vi.restoreAllMocks(); syncBuiltinESMExports(); fs.rmSync(files.stateLockPath);
    expect(capture().initial).toEqual({ key: '"confirmed"' });
    expect(() => pending.commit({ key: '"retry"' })).toThrow(expect.objectContaining({ status: 'persisted' }));
  });

  it('refuses malformed internal envelopes and keeps the reserved codemode wire distinct', () => {
    for (const patch of [{ namespace: 'codemode' }, { namespace: 'bad/name' }, { sourceEntryId: '' }, { id: undefined }]) {
      expect(decodeTranscriptLineSafe(JSON.stringify({ ...internalEvent(), ...patch }))).toBeUndefined();
    }
    expect(() => capture('bad/name')).toThrow(expect.objectContaining({ reason: 'invalid', status: 'unchanged' }));
  });
});
