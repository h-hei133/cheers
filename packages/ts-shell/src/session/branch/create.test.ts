import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { readSessionNavigation } from '../query/navigation.js';
import { SessionForkError } from './create.js';
import { hasUnfinishedSessionWork } from '../recovery/work.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-fork-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it('forks a historic user entry with all branches retained and no inherited pending authority', async () => {
  const manager = new SessionManager(); const source = manager.createNew(root);
  manager.addTurn(source.id, { role: 'user', content: 'first question' });
  manager.addTurn(source.id, { role: 'assistant', content: 'first answer' });
  manager.addTurn(source.id, { role: 'user', content: 'second question' });
  const first = manager.getSession(source.id)!.turns[0]!.id!;
  await manager.revertTo(source.id, first);
  manager.addTurn(source.id, { role: 'assistant', content: 'another branch' });
  const before = manager.getTranscriptEvents(source.id);
  const forked = manager.fork(source.id, root, { activate: false, entryId: first });
  expect(forked.id).not.toBe(source.id); expect(forked.parentSession).toBe(source.id);
  expect(forked.turns).toEqual([]);
  const navigation = readSessionNavigation(forked.id, root);
  expect(navigation.points.map(point => point.label).join('\n')).toContain('second question');
  expect(navigation.points.map(point => point.label).join('\n')).toContain('another branch');
  expect(navigation.points.find(point => point.current)?.label).toBe('Session start');
  expect(navigation.points.find(point => point.entryId === first)?.prompt).toBe('first question');
  expect(forked.pendingPrompt).toBeUndefined();
  expect(manager.getTranscriptEvents(source.id)).toEqual(before);
  expect(manager.getCurrentSessionForProject(root)?.id).toBe(source.id);
});

it('rejects a non-user entry before creation and leaves a failed copy inactive with an explicit identity', () => {
  const manager = new SessionManager(); const source = manager.createNew(root);
  manager.addTurn(source.id, { role: 'assistant', content: 'answer' });
  const count = manager.listSessions().length;
  expect(() => manager.fork(source.id, root, { entryId: manager.getSession(source.id)!.turns[0]!.id! })).toThrow('saved user-message');
  expect(manager.listSessions()).toHaveLength(count);
  const write = vi.spyOn(SessionStoreAccess.prototype, 'writeSessionState').mockImplementationOnce(() => { throw new Error('state write failed'); });
  expect(() => manager.fork(source.id, root, { sessionId: 'sess_partial_fork' })).toThrow(SessionForkError);
  write.mockRestore();
  expect(manager.sessionExists('sess_partial_fork')).toBe(true);
  expect(manager.getCurrentSessionForProject(root)?.id).toBe(source.id);
});

it('rejects an obsolete fork source version before creating any session', () => {
  const manager = new SessionManager(); const source = manager.createNew(root);
  manager.addTurn(source.id, { role: 'user', content: 'offered question' });
  const offered = readSessionNavigation(source.id, root);
  manager.addTurn(source.id, { role: 'assistant', content: 'new answer' });
  const count = manager.listSessions().length;
  const events = manager.getTranscriptEvents(source.id);
  expect(() => manager.fork(source.id, root, { entryId: offered.points.find(point => point.prompt)?.entryId,
    expectedVersion: offered.version })).toThrow('changed after selection');
  expect(manager.listSessions()).toHaveLength(count);
  expect(manager.getTranscriptEvents(source.id)).toEqual(events);
  expect(manager.getCurrentSessionForProject(root)?.id).toBe(source.id);
});

it('does not hand a fork the tool call its source never finished', () => {
  // The recovery read model rebuilds pending tools from the transcript. A fork
  // that copied an unanswered tool.started would look like it owed that call.
  const manager = new SessionManager();
  const session = manager.createNew(process.cwd());
  manager.persistUserPromptBarrier(session.id, 'Write a file', undefined);
  manager.appendQueryEvent(session.id, { type: 'tool.started', toolName: 'write', taskId: 'call-open' });
  manager.saveInterrupted(session.id, 'turn');

  const forked = manager.fork(session.id, process.cwd(), {});
  const forkedSnapshot = manager.getRecoverySnapshot(forked.id);
  expect(Object.keys(forkedSnapshot.pendingLifecycle.pendingTools)).toEqual([]);
  expect(hasUnfinishedSessionWork(forkedSnapshot)).toBe(false);
  // The source keeps its own unfinished call.
  expect(Object.keys(manager.getRecoverySnapshot(session.id).pendingLifecycle.pendingTools)).toEqual(['call-open']);
})
