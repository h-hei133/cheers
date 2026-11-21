import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { readSessionNavigation } from '../query/navigation.js';
import { SessionForkError } from './create.js';
import { hasUnfinishedSessionWork } from '../recovery/work.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../model/state.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-fork-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
});
afterEach(() => { vi.restoreAllMocks(); syncBuiltinESMExports(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it('preserves model selection in a fork under a fresh session revision', () => {
  const manager = new SessionManager(); const source = manager.createNew(root);
  const selected = { connectionScope: 'provider' as const, provider: 'openai', model: 'physical', thinkingEffort: null,
    skillful: false, virtualModel: { provider: 'adaptive', model: 'auto', thinkingEffort: 'high' as const } };
  writeSessionModel(source.id, selected, readSessionModelEdit(source.id));
  const revision = readSessionModelEdit(source.id).revision;
  const forked = manager.fork(source.id, root, { activate: false });
  expect(readSessionModel(forked.id)).toEqual(selected);
  expect(readSessionModelEdit(forked.id).revision).not.toBe(revision);
  expect(readSessionModel(source.id)).toEqual(selected);
});

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

it('rejects a non-user entry before creation and keeps a failed copy outside the readable store', () => {
  const manager = new SessionManager(); const source = manager.createNew(root);
  manager.addTurn(source.id, { role: 'assistant', content: 'answer' });
  const count = manager.listSessions().length;
  expect(() => manager.fork(source.id, root, { entryId: manager.getSession(source.id)!.turns[0]!.id! })).toThrow('saved user-message');
  expect(manager.listSessions()).toHaveLength(count);
  const rename = fs.renameSync;
  vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (path.basename(String(to)) === 'state.json') throw new Error('state write failed');
    rename(from, to);
  });
  syncBuiltinESMExports();
  expect(() => manager.fork(source.id, root, { sessionId: 'sess_partial_fork' })).toThrow('state write failed');
  expect(manager.sessionExists('sess_partial_fork')).toBe(false);
  expect(manager.listSessions()).toHaveLength(count);
  expect(manager.getCurrentSessionForProject(root)?.id).toBe(source.id);
});

it.skipIf(process.platform !== 'linux').each([
  ['before', 'fork'], ['after', 'fork'], ['before', 'create'], ['after', 'create'],
] as const)('exposes only whole records after process exit %s publication (%s)', (stage, kind) => {
  const manager = new SessionManager(), store = new SessionStoreAccess();
  const source = manager.createNew(root);
  manager.addTurn(source.id, { role: 'user', content: 'copied question' });
  const targetId = 'sess_interrupted_fork';
  const target = path.join(store.sessionsDir, targetId);
  const [major, minor] = process.versions.node.split('.').map(Number);
  const loader = major === 20 && minor! < 6 ? '--loader' : '--import';
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
  const child = spawnSync(process.execPath, ['--conditions=cheers-source', loader, tsx, '--input-type=module', '--eval', `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import { SessionManager } from ${JSON.stringify(new URL('../SessionManager.ts', import.meta.url).href)};
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (to === ${JSON.stringify(target)} && ${stage === 'before'}) process.kill(process.pid, 'SIGKILL');
      rename(from, to);
      if (to === ${JSON.stringify(target)}) process.kill(process.pid, 'SIGKILL');
    };
    syncBuiltinESMExports();
    const manager = new SessionManager();
    ${kind === 'fork'
      ? `manager.fork(${JSON.stringify(source.id)}, process.cwd(), { sessionId: ${JSON.stringify(targetId)} });`
      : `manager.createNewWithId(${JSON.stringify(targetId)}, process.cwd());`}
  `], { cwd: root, encoding: 'utf8', timeout: 10_000, maxBuffer: 65_536 });
  expect(child.error).toBeUndefined();
  expect(child.signal, child.stderr).toBe('SIGKILL');
  expect(manager.sessionExists(targetId)).toBe(stage === 'after');
  expect(manager.listSessions().map(session => session.id)).toEqual(
    stage === 'before' ? [source.id] : expect.arrayContaining([source.id, targetId]));
  if (stage === 'after') {
    expect(store.readSnapshot(targetId)).toMatchObject({
      session: kind === 'fork' ? { parentSession: source.id, turns: [{ role: 'user', content: 'copied question' }] }
        : { id: targetId, turns: [] },
      ...(kind === 'fork' ? { state: { thread: { activeLeafId: expect.any(String) } } } : {}),
    });
  }
  expect(manager.readCurrentSessionSelection(root)?.sessionId).toBe(source.id);
  if (stage === 'before') {
    const saved = kind === 'fork' ? manager.fork(source.id, root, { sessionId: targetId, activate: false })
      : manager.createNewWithId(targetId, root, { activate: false });
    expect(saved.turns).toMatchObject(kind === 'fork' ? [{ role: 'user', content: 'copied question' }] : []);
    expect(manager.readCurrentSessionSelection(root)?.sessionId).toBe(source.id);
  }
}, 15_000);

it('preserves a competing current selection published while a complete fork was staged', () => {
  const manager = new SessionManager(), store = new SessionStoreAccess();
  const source = manager.createNew(root);
  const other = manager.createNew(root, { activate: false });
  const target = 'sess_fork_with_competing_selection';
  const rename = fs.renameSync;
  vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (to === path.join(store.sessionsDir, target)) {
      expect(manager.sessionExists(target)).toBe(false);
      manager.setCurrentSessionForProject(root, other.id);
    }
    rename(from, to);
  });
  syncBuiltinESMExports();
  expect(() => manager.fork(source.id, root, { sessionId: target })).toThrow(SessionForkError);
  expect(manager.getSession(target)?.parentSession).toBe(source.id);
  expect(manager.readCurrentSessionSelection(root)?.sessionId).toBe(other.id);
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

it('does not hand a fork an approval whose tool never started', () => {
  // Approval is asked before the tool starts, so a pending approval has no
  // tool.started of its own. Seeding only from tool.started left it in the fork.
  const manager = new SessionManager();
  const session = manager.createNew(process.cwd());
  manager.persistUserPromptBarrier(session.id, 'Patch the file', undefined);
  manager.appendQueryEvent(session.id, { type: 'approval.requested', toolName: 'apply_patch', taskId: 'call-approval' });
  manager.saveInterrupted(session.id, 'turn');

  const forked = manager.fork(session.id, process.cwd(), {});
  const forkedSnapshot = manager.getRecoverySnapshot(forked.id);
  expect(Object.keys(forkedSnapshot.pendingLifecycle.pendingApprovals)).toEqual([]);
  expect(hasUnfinishedSessionWork(forkedSnapshot)).toBe(false);
  expect(Object.keys(manager.getRecoverySnapshot(session.id).pendingLifecycle.pendingApprovals)).toEqual(['call-approval']);
})
