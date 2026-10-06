import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { createSessionStoreLayout, locateExistingSessionLayout } from '../store/sessionFileLayout.js';
import { writeSessionState } from '../store/sessionStateStore.js';
import * as files from '../store/sessionFileStore.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from './state.js';
import { SessionModelWriteError } from './outcome.js';

let home: string;
let manager: SessionManager;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'model-write-'));
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  manager = new SessionManager();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });
const choice = (model = 'chosen') => ({ connectionId: 'fixture', provider: 'openai', model });
const layout = (id: string) => locateExistingSessionLayout(createSessionStoreLayout(), id);

it('merges unrelated lifecycle writes and preserves selection revision through later writes', () => {
  const session = manager.createNew(home); const edit = readSessionModelEdit(session.id);
  const target = layout(session.id);
  session.pendingPrompt = 'keep the pending prompt';
  writeSessionState({ session, layout: target });
  writeSessionModel(session.id, choice(), edit);
  expect(JSON.parse(fs.readFileSync(target.statePath, 'utf8')).pendingPrompt).toBe('keep the pending prompt');
  const revision = readSessionModelEdit(session.id).revision;
  expect(revision).toEqual(expect.any(String));
  writeSessionState({ session, layout: target });
  expect(readSessionModelEdit(session.id).revision).toBe(revision);
  expect(readSessionModel(session.id)).toEqual(choice());
});

it('rejects stale selection including A to B to A without overwriting the winner', () => {
  const session = manager.createNew(home);
  writeSessionModel(session.id, choice('a'), readSessionModelEdit(session.id));
  const stale = readSessionModelEdit(session.id);
  writeSessionModel(session.id, choice('b'), readSessionModelEdit(session.id));
  writeSessionModel(session.id, choice('a'), readSessionModelEdit(session.id));
  const before = fs.readFileSync(layout(session.id).statePath);
  expect(() => writeSessionModel(session.id, choice('late'), stale)).toThrowError(expect.objectContaining({ code: 'conflict', state: 'unchanged' }));
  expect(fs.readFileSync(layout(session.id).statePath)).toEqual(before);
});

it('rejects a workspace rebind, deleted state and a baseline for another session', () => {
  const session = manager.createNew(home); const other = manager.createNew(home);
  const edit = readSessionModelEdit(session.id); const target = layout(session.id);
  const current = JSON.parse(fs.readFileSync(target.statePath, 'utf8'));
  fs.writeFileSync(target.statePath, JSON.stringify({ ...current, projectRoot: path.join(home, 'elsewhere') }));
  expect(() => writeSessionModel(session.id, choice(), edit)).toThrowError(expect.objectContaining({ state: 'unchanged' }));
  expect(() => writeSessionModel(other.id, choice(), edit)).toThrowError(expect.objectContaining({ code: 'invalid', state: 'unchanged' }));
  fs.rmSync(target.statePath);
  expect(() => writeSessionModel(session.id, choice(), edit)).toThrowError(expect.objectContaining({ state: 'unchanged' }));
  expect(fs.existsSync(target.statePath)).toBe(false);
});

it.each(['null', '[]', '{}', '{"status":"active","modelSelection":{}}', '{"status":"active","modelRevision":12}'])('rejects malformed durable state without exposing it: %s', raw => {
  const session = manager.createNew(home); const target = layout(session.id);
  fs.writeFileSync(target.statePath, raw);
  expect(() => readSessionModelEdit(session.id)).toThrowError(expect.objectContaining({ code: raw === 'null' ? 'read-failed' : 'invalid', state: 'unchanged' }));
  expect(fs.readFileSync(target.statePath, 'utf8')).toBe(raw);
});

it('does not write or change revision for an unchanged preference', () => {
  const session = manager.createNew(home);
  writeSessionModel(session.id, choice(), readSessionModelEdit(session.id));
  const before = readSessionModelEdit(session.id);
  const write = vi.spyOn(files, 'writeJsonFileAtomic');
  writeSessionModel(session.id, choice(), before);
  expect(write).not.toHaveBeenCalled();
  expect(readSessionModelEdit(session.id).revision).toBe(before.revision);
});

it('detects a writer that returns without saving, with no success-like result', () => {
  const session = manager.createNew(home); const edit = readSessionModelEdit(session.id);
  vi.spyOn(files, 'writeJsonFileAtomic').mockImplementation(() => {});
  expect(() => writeSessionModel(session.id, choice(), edit)).toThrowError(expect.objectContaining({ code: 'verification-failed', state: 'unknown' }));
  expect(readSessionModel(session.id)).toBeUndefined();
});

it('verifies the complete saved state, including unrelated lifecycle fields', () => {
  const session = manager.createNew(home); const edit = readSessionModelEdit(session.id);
  vi.spyOn(files, 'writeJsonFileAtomic').mockImplementation((file, payload) => {
    fs.writeFileSync(file, JSON.stringify({ ...payload as object, pendingPrompt: 'unexpected replacement' }));
  });
  expect(() => writeSessionModel(session.id, choice(), edit)).toThrowError(expect.objectContaining({ code: 'verification-failed', state: 'unknown' }));
});

it('distinguishes verified persistence from lock cleanup failure', () => {
  const session = manager.createNew(home); const edit = readSessionModelEdit(session.id);
  const target = layout(session.id); const write = files.writeJsonFileAtomic;
  vi.spyOn(files, 'writeJsonFileAtomic').mockImplementation((file, payload) => {
    write(file, payload);
    fs.writeFileSync(target.stateLockPath, JSON.stringify({ token: 'SENSITIVE_LOCK_DETAIL' }));
  });
  let error: unknown;
  try { writeSessionModel(session.id, choice(), edit); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(SessionModelWriteError);
  expect(error).toMatchObject({ code: 'lock-failed', state: 'persisted', cleanupFailed: true });
  expect(String(error)).not.toContain('SENSITIVE_LOCK_DETAIL');
  expect(readSessionModel(session.id)).toEqual(choice());
});

it('preserves write uncertainty and simultaneous cleanup failure without raw diagnostics', () => {
  const session = manager.createNew(home); const edit = readSessionModelEdit(session.id);
  const target = layout(session.id);
  vi.spyOn(files, 'writeJsonFileAtomic').mockImplementation(() => {
    fs.writeFileSync(target.stateLockPath, JSON.stringify({ token: 'SENSITIVE_LOCK_DETAIL' }));
    throw new Error('SENSITIVE_WRITE_DETAIL');
  });
  let error: unknown;
  try { writeSessionModel(session.id, choice(), edit); } catch (caught) { error = caught; }
  expect(error).toMatchObject({ code: 'write-failed', state: 'unknown', cleanupFailed: true });
  expect(String(error)).not.toContain('SENSITIVE');
});

it.each([false, true])('checks the synchronous commit guard under lock, including no-op=%s', unchanged => {
  const session = manager.createNew(home);
  if (unchanged) writeSessionModel(session.id, choice(), readSessionModelEdit(session.id));
  const edit = readSessionModelEdit(session.id); const target = layout(session.id);
  const before = fs.readFileSync(target.statePath);
  const guard = vi.fn(() => {
    expect(fs.existsSync(target.stateLockPath)).toBe(true);
    return false;
  });
  const write = vi.spyOn(files, 'writeJsonFileAtomic');
  expect(() => writeSessionModel(session.id, choice(), edit, guard)).toThrowError(expect.objectContaining({ code: 'conflict', state: 'unchanged' }));
  expect(guard).toHaveBeenCalledOnce(); expect(write).not.toHaveBeenCalled();
  expect(fs.readFileSync(target.statePath)).toEqual(before);
});
