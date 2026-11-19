import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../SessionManager.js';
import { readSessionRecordSnapshot, readSessionRecordSnapshotAsync } from '../sessionStore.js';
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

it.each(['none', 'torn', 'metadata', 'state', 'published'] as const)('reconciles the exact %s interruption without duplicating the prompt', async stage => {
  const before = fs.readFileSync(layout.transcriptPath);
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
  expect(() => readSessionRecordSnapshot({ sessionId, layout, cwd: root })).toThrow(PromptPublicationError);
  await expect(readSessionRecordSnapshotAsync({ sessionId, layout, cwd: root })).rejects.toThrow(PromptPublicationError);

  const reopened = new SessionManager();
  const saved = reopened.getSession(sessionId);
  expect(saved?.turns).toMatchObject([{ id: 'prior' }, { role: 'user', content: [{ type: 'text', text: prompt }, image], metadata: localMetadata }]);
  const source = saved!.turns[1]!.id;
  expect(reopened.getRecoverySnapshot(sessionId)).toMatchObject({ pendingPrompt: prompt, runPhase: 'prompt-persisted',
    lastLifecycleEvent: { event: 'run-started', sourceEntryId: source }, lastUserMessage: { id: source } });
  const events = reopened.getTranscriptEvents(sessionId);
  expect(events.filter(event => event.type === 'lifecycle' && event.event === 'run-started')).toHaveLength(1);
  expect(events.filter(event => event.type === 'message' && event.role === 'user')).toHaveLength(1);
  const after = fs.readFileSync(layout.transcriptPath);
  expect(after.subarray(0, before.length)).toEqual(before);
  expect(fs.existsSync(promptIntentPath(layout))).toBe(false);
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
