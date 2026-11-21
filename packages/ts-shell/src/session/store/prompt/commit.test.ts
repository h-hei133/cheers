import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../SessionManager.js';
import { readBoundSessionRevision, readBoundSessionState, readBoundSessionStateAsync } from '../bound.js';
import { readSessionManagementSnapshot } from '../management.js';
import { readSessionRecordSnapshotAsync } from '../sessionStore.js';
import { SessionStoreAccess } from '../sessionStoreAccess.js';
import type { SessionFileLayout } from '../sessionFileLayout.js';
import { PromptPublicationError, promptIntentPath } from './intent.js';

let root: string;
let manager: SessionManager;
let sessionId: string;
let layout: SessionFileLayout;

beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(temporary, { recursive: true });
  root = fs.mkdtempSync(path.join(temporary, 'prompt-transaction-'));
  vi.stubEnv('HOME', root);
  vi.stubEnv('USERPROFILE', root);
  vi.stubEnv('CHEERS_TEST_ROOT', root);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
  manager = new SessionManager();
  sessionId = manager.createNew(root).id;
  manager.addTurn(sessionId, { id: 'prior', role: 'assistant', content: 'Preserved answer' });
  layout = new SessionStoreAccess().stateLayout(sessionId);
});

afterEach(() => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it('refuses changed write admission before publishing a recoverable intent', () => {
  const files = [layout.metadataPath, layout.statePath, layout.transcriptPath];
  const original = files.map(file => fs.readFileSync(file));
  expect(() => manager.persistUserPromptBarrier(sessionId, 'Unadmitted', undefined, undefined, () => { throw new Error('Binding retired'); }))
    .toThrow('The prompt could not be saved.');
  expect(files.map(file => fs.readFileSync(file))).toEqual(original);
  expect(fs.existsSync(promptIntentPath(layout))).toBe(false);
});

it('reads a legacy recovery snapshot once and preserves its readable transcript rows', () => {
  const timestamp = '2026-10-30T00:00:00.000Z';
  const user = { type: 'message', role: 'user', content: 'Old question', timestamp };
  const assistant = { type: 'message', role: 'assistant', content: 'Old answer', timestamp };
  const transcript = [JSON.stringify(user), '{partial', JSON.stringify(assistant)].join('\n');
  const state = JSON.stringify({ status: 'completed', durableStatus: 'success', projectRoot: root });
  fs.writeFileSync(layout.transcriptPath, transcript);
  fs.writeFileSync(layout.statePath, state);
  const read = vi.spyOn(fs, 'readFileSync');
  syncBuiltinESMExports();
  try {
    const snapshot = manager.getRecoverySnapshot(sessionId);
    expect(snapshot.durableStatus).toBe('success');
    expect(snapshot.transcriptEvents).toMatchObject([
      { ...user, id: 'line-1' },
      { ...assistant, id: 'line-3' },
    ]);
    expect(snapshot.lastUserMessage?.id).toBe('line-1');
    expect(snapshot.lastAssistantMessage?.id).toBe('line-3');
    for (const file of [layout.metadataPath, layout.statePath, layout.transcriptPath]) {
      expect(read.mock.calls.filter(([target]) => target === file)).toHaveLength(1);
    }
  } finally {
    read.mockRestore();
    syncBuiltinESMExports();
  }
  expect(fs.readFileSync(layout.transcriptPath, 'utf8')).toBe(transcript);
  expect(fs.readFileSync(layout.statePath, 'utf8')).toBe(state);
});

it.each(['none', 'torn', 'metadata', 'state', 'published'] as const)('reconciles the exact %s interruption without duplicating the prompt', async stage => {
  const before = fs.readFileSync(layout.transcriptPath);
  const priorSession = manager.getSession(sessionId)!;
  const prompt = 'Review \u{1F50E} after reopening';
  const image = { type: 'image' as const, data: 'aGVsbG8=', mimeType: 'image/png' };
  const localMetadata = { adoption: 'original' };
  const append = fs.appendFileSync, rename = fs.renameSync, unlink = fs.unlinkSync;
  const appendSpy = vi.spyOn(fs, 'appendFileSync').mockImplementation((file, data, options) => {
    if ((stage === 'torn' || stage === 'none') && typeof file === 'number' && Buffer.isBuffer(data)) {
      if (stage === 'torn') {
        const split = data.indexOf(Buffer.from('\u{1F50E}')) + 1;
        if (split <= 0) throw new Error('Expected a UTF-8 interruption fixture.');
        append(file, data.subarray(0, split), options);
      }
      throw new Error('Transcript append interrupted.');
    }
    return append(file, data, options);
  });
  const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (stage === 'metadata' && to === layout.metadataPath || stage === 'state' && to === layout.statePath) throw new Error('Publication interrupted.');
    return rename(from, to);
  });
  const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(file => {
    if (stage === 'published' && file === promptIntentPath(layout)) throw new Error('Cleanup interrupted.');
    return unlink(file);
  });
  syncBuiltinESMExports();
  try {
    const expected = stage === 'published' ? 'The prompt was saved.' : 'Prompt persistence is unknown.';
    expect(() => manager.persistUserPromptBarrier(sessionId, prompt, localMetadata, [image])).toThrow(expected);
  } finally { appendSpy.mockRestore(); renameSpy.mockRestore(); unlinkSpy.mockRestore(); syncBuiltinESMExports(); }
  expect(fs.existsSync(promptIntentPath(layout))).toBe(true);
  const observer = new SessionStoreAccess();
  const write = vi.fn();
  expect(() => observer.withSessionStateLock(sessionId, write)).toThrow(PromptPublicationError);
  expect(write).not.toHaveBeenCalled();
  expect(observer.getCurrentSessionForProject(root, { readOnly: true })).toBeNull();
  expect(observer.readCurrentSessionSelection(root)?.sessionId).toBe(sessionId);
  expect(fs.existsSync(promptIntentPath(layout))).toBe(true);
  expect(() => observer.readSnapshot(sessionId, { readOnly: true })).toThrow(PromptPublicationError);
  await expect(readSessionRecordSnapshotAsync({ sessionId, layout, cwd: root })).rejects.toThrow(PromptPublicationError);
  expect(() => readBoundSessionRevision(manager, priorSession)).toThrow(expect.objectContaining({ code: 'unavailable' }));
  expect(() => readBoundSessionState(manager, priorSession)).toThrow(expect.objectContaining({ code: 'unavailable' }));
  await expect(readBoundSessionStateAsync(manager, priorSession)).rejects.toMatchObject({ code: 'unavailable' });
  expect(() => readSessionManagementSnapshot(layout, sessionId)).toThrow(PromptPublicationError);

  const reopened = new SessionManager();
  const recovery = reopened.getRecoverySnapshot(sessionId);
  const saved = reopened.getSession(sessionId);
  expect(saved?.turns).toMatchObject([{ id: 'prior' }, { role: 'user', content: [{ type: 'text', text: prompt }, image], metadata: localMetadata }]);
  const source = saved!.turns[1]!.id;
  expect(recovery).toMatchObject({ pendingPrompt: prompt, runPhase: 'prompt-persisted',
    lastLifecycleEvent: { event: 'run-started', sourceEntryId: source }, lastUserMessage: { id: source } });
  const events = reopened.getTranscriptEvents(sessionId);
  expect(events.filter(event => event.type === 'lifecycle' && event.event === 'run-started')).toHaveLength(1);
  expect(events.filter(event => event.type === 'message' && event.role === 'user')).toHaveLength(1);
  const after = fs.readFileSync(layout.transcriptPath);
  expect(after.subarray(0, before.length)).toEqual(before);
  expect(fs.existsSync(promptIntentPath(layout))).toBe(false);
  expect(readBoundSessionState(reopened, saved!).state.pendingPrompt).toBe(prompt);
  expect(readSessionManagementSnapshot(layout, sessionId).state.pendingPrompt).toBe(prompt);
  expect(new SessionStoreAccess().load(sessionId)).toEqual(saved);
  expect(fs.readFileSync(layout.transcriptPath)).toEqual(after);
});

it('retains a competing state or transcript without applying a conflicting intent', () => {
  const append = vi.spyOn(fs, 'appendFileSync').mockImplementationOnce(() => { throw new Error('Interrupted write'); });
  syncBuiltinESMExports();
  try { expect(() => manager.persistUserPromptBarrier(sessionId, 'Pending')).toThrow('Prompt persistence is unknown.'); }
  finally { append.mockRestore(); syncBuiltinESMExports(); }
  const competing = { ...JSON.parse(fs.readFileSync(layout.statePath, 'utf8')), contextSelection: { version: 1 } };
  fs.writeFileSync(layout.statePath, JSON.stringify(competing), 'utf8');
  const paths = [promptIntentPath(layout), layout.transcriptPath, layout.statePath, layout.metadataPath];
  const exact = paths.map(file => fs.readFileSync(file));
  const reopened = new SessionStoreAccess();
  expect(() => reopened.load(sessionId)).toThrow('Prompt persistence is unknown.');
  expect(reopened.getCurrentSessionForProject(root)).toBeNull();
  expect(reopened.readCurrentSessionSelection(root)?.sessionId).toBe(sessionId);
  expect(paths.map(file => fs.readFileSync(file))).toEqual(exact);
});

it.each(['completed', 'completed_unproven', 'error', 'interrupted'] as const)(
  'reopens one exact %s prompt settlement after state publication fails', outcome => {
    manager.persistUserPromptBarrier(sessionId, 'Recover this run');
    const sourceEntryId = manager.getRecoverySnapshot(sessionId).lastUserMessage?.id;
    const before = fs.readFileSync(layout.transcriptPath);
    const rename = fs.renameSync;
    const failure = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (to === layout.statePath) throw new Error('State is temporarily unavailable.');
      return rename(from, to);
    });
    syncBuiltinESMExports();
    try {
      const publish = () => {
        switch (outcome) {
          case 'completed': return manager.saveCompleted(sessionId);
          case 'completed_unproven': return manager.saveCompleted(sessionId, {
            terminalClassification: 'completed_unproven', terminalReason: 'completed_unproven',
            terminalReasonCode: 'already_blocked_once',
          });
          case 'error': return manager.saveError(sessionId, 'Run stopped', undefined, {
            event: { type: 'lifecycle.error', error: 'Run stopped' }, sourceEntryId,
          });
          case 'interrupted': return manager.saveInterrupted(sessionId, 'turn', {
            event: { type: 'lifecycle.cancelled', reason: 'Interrupted during execution' }, sourceEntryId,
          });
        }
      };
      expect(publish).toThrow(expect.objectContaining({ persistence: 'unknown', kind: 'outcome' }));
    } finally { failure.mockRestore(); syncBuiltinESMExports(); }
    expect(fs.existsSync(promptIntentPath(layout))).toBe(true);
    const reopen = new SessionStoreAccess();
    expect(reopen.resolveCurrentSessionForProject(root, { readOnly: true }))
      .toMatchObject({ ok: false, reason: 'prompt-publication-unknown', sessionId });
    expect(() => reopen.readSnapshot(sessionId, { readOnly: true })).toThrow(PromptPublicationError);
    const finalEvent = outcome === 'completed_unproven' ? 'run-completed-unproven' : `run-${outcome}`;
    const recovery = new SessionManager().getRecoverySnapshot(sessionId);
    expect(recovery.transcriptEvents).toContainEqual(expect.objectContaining({ type: 'lifecycle', event: finalEvent }));
    const saved = reopen.load(sessionId);
    expect(saved.status).toBe(outcome);
    expect(saved.pendingPrompt).toBe(outcome === 'interrupted' ? 'Recover this run' : undefined);
    expect(fs.existsSync(promptIntentPath(layout))).toBe(false);
    const events = manager.getTranscriptEvents(sessionId);
    expect(events.filter(event => event.type === 'lifecycle' && event.event === finalEvent)).toHaveLength(1);
    if (outcome === 'error' || outcome === 'interrupted') {
      expect(events.at(-2)).toMatchObject({ type: 'query-event', sourceEntryId,
        event: { type: outcome === 'error' ? 'lifecycle.error' : 'lifecycle.cancelled' } });
    }
    const after = fs.readFileSync(layout.transcriptPath);
    expect(after.subarray(0, before.length)).toEqual(before);
    expect(reopen.load(sessionId)).toEqual(saved);
    expect(fs.readFileSync(layout.transcriptPath)).toEqual(after);
  },
);

it.each(['torn', 'metadata', 'state'] as const)(
  'reconciles an interrupted addTurn at %s without duplicating the message or losing thread state',
  stage => {
    const before = fs.readFileSync(layout.transcriptPath);
    const content = 'Transactional reply \u{1F9EA} verified';
    const append = fs.appendFileSync, rename = fs.renameSync;
    const appendSpy = vi.spyOn(fs, 'appendFileSync').mockImplementation((file, data, options) => {
      if (stage === 'torn' && typeof file === 'number' && Buffer.isBuffer(data)) {
        const split = data.indexOf(Buffer.from('\u{1F9EA}')) + 1;
        if (split <= 0) throw new Error('Expected UTF-8 split fixture.');
        append(file, data.subarray(0, split), options);
        throw new Error('Turn append interrupted.');
      }
      return append(file, data, options);
    });
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if ((stage === 'metadata' && to === layout.metadataPath) || (stage === 'state' && to === layout.statePath)) {
        throw new Error('Publication interrupted.');
      }
      return rename(from, to);
    });
    syncBuiltinESMExports();
    try {
      expect(() => manager.addTurn(sessionId, { id: 'tx-turn', role: 'assistant', content }))
        .toThrow(expect.objectContaining({ persistence: 'unknown', kind: 'record' }));
    } finally { appendSpy.mockRestore(); renameSpy.mockRestore(); syncBuiltinESMExports(); }

    expect(fs.existsSync(promptIntentPath(layout))).toBe(true);
    expect(() => new SessionStoreAccess().readSnapshot(sessionId, { readOnly: true })).toThrow(PromptPublicationError);
    const reopened = new SessionManager();
    expect(reopened.getRecoverySnapshot(sessionId).lastAssistantMessage).toMatchObject({ id: 'tx-turn', content });
    const saved = reopened.getSession(sessionId);
    expect(saved?.turns.map(turn => turn.id)).toEqual(['prior', 'tx-turn']);
    expect(saved?.turns.at(-1)?.content).toBe(content);
    expect(fs.existsSync(promptIntentPath(layout))).toBe(false);
    const state = new SessionStoreAccess().readStateSnapshotRequired(layout.statePath);
    expect(state.thread?.activeLeafId).toBe('tx-turn');
    expect(reopened.getTranscriptEvents(sessionId).filter(event => event.type === 'message' && event.id === 'tx-turn')).toHaveLength(1);
    const after = fs.readFileSync(layout.transcriptPath);
    expect(after.subarray(0, before.length)).toEqual(before);
  },
);

it.each(['markRunStarted', 'markTurnActive', 'markRecoveryReentry', 'saveTerminated', 'updateSessionWorkspaceBinding'] as const)(
  'recovers an interrupted %s transaction across metadata, state, and transcript',
  operation => {
    const nextRoot = path.join(root, 'rebound');
    fs.mkdirSync(nextRoot, { recursive: true });
    if (operation === 'markTurnActive' || operation === 'markRecoveryReentry') {
      manager.persistUserPromptBarrier(sessionId, 'In-flight prompt');
    }
    const beforeTranscript = fs.readFileSync(layout.transcriptPath);
    const rename = fs.renameSync;
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (to === layout.statePath) throw new Error('State publication interrupted.');
      return rename(from, to);
    });
    syncBuiltinESMExports();
    try {
      const execute = () => {
        switch (operation) {
          case 'markRunStarted': return manager.markRunStarted(sessionId, 'Legacy started prompt');
          case 'markTurnActive': return manager.markTurnActive(sessionId);
          case 'markRecoveryReentry': return manager.markRecoveryReentry(sessionId, 'mid-turn-reentry');
          case 'saveTerminated': return manager.saveTerminated(sessionId);
          case 'updateSessionWorkspaceBinding': return manager.updateSessionWorkspaceBinding(sessionId, {
            projectRoot: nextRoot,
            rootMode: 'explicit',
            requestedWorkspaceRoot: nextRoot,
            targetPathBase: nextRoot,
            gitRoot: null,
          });
        }
      };
      expect(execute).toThrow(expect.objectContaining({ persistence: 'unknown', kind: 'record' }));
    } finally { spy.mockRestore(); syncBuiltinESMExports(); }

    expect(fs.existsSync(promptIntentPath(layout))).toBe(true);
    const reopened = new SessionStoreAccess();
    const saved = reopened.load(sessionId);
    const state = reopened.readStateSnapshotRequired(layout.statePath);
    expect(fs.existsSync(promptIntentPath(layout))).toBe(false);
    const afterTranscript = fs.readFileSync(layout.transcriptPath);
    if (operation === 'markTurnActive' || operation === 'markRecoveryReentry' || operation === 'updateSessionWorkspaceBinding') {
      expect(afterTranscript).toEqual(beforeTranscript);
    } else {
      expect(afterTranscript.subarray(0, beforeTranscript.length)).toEqual(beforeTranscript);
    }
    if (operation === 'markRunStarted') {
      expect(saved.status).toBe('active');
      expect(saved.pendingPrompt).toBe('Legacy started prompt');
    } else if (operation === 'markTurnActive') {
      expect(state.runPhase).toBe('turn-active');
    } else if (operation === 'markRecoveryReentry') {
      expect(saved.status).toBe('active');
      expect(state.runPhase).toBe('turn-active');
      expect(state.interruptedKind).toBe('turn');
    } else if (operation === 'saveTerminated') {
      expect(saved.status).toBe('terminated');
      expect(state.runPhase).toBe('idle');
    } else {
      expect(saved.projectRoot).toBe(nextRoot);
      expect(state.projectRoot).toBe(nextRoot);
      expect(saved.rootMode).toBe('explicit');
    }
  },
);
