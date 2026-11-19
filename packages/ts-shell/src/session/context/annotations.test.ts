import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { readSessionNavigation, readSessionNavigationAsync } from '../query/navigation.js';
import { SessionPublicationError } from '../store/bound.js';
import { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { appendSessionAnnotation } from './write.js';
import type { AnnotationChange } from './annotations.js';
import { effectiveContextSelection, planContextSelection, selectModelContext } from './selection.js';
import { updateContextSelection } from './state.js';

let root: string;

beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(temporary, { recursive: true });
  root = fs.mkdtempSync(path.join(temporary, 'session-annotations-'));
  vi.stubEnv('HOME', root);
  vi.stubEnv('USERPROFILE', root);
  vi.stubEnv('CHEERS_TEST_ROOT', root);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
});

afterEach(() => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

function annotate(id: string, targetId: string, change: AnnotationChange) {
  const { session, version } = readSessionNavigation(id, root);
  return appendSessionAnnotation({ session, expectedVersion: version, targetId, change }).event;
}

it('retains the original transcript and projects edits and labels only in their branch and forks', async () => {
  const manager = new SessionManager();
  const session = manager.createNew(root);
  manager.addTurn(session.id, { id: 'question', role: 'user', content: 'Original question' });
  manager.addTurn(session.id, { id: 'abandoned', role: 'assistant', content: 'Other branch answer' });
  await manager.revertTo(session.id, 'question');
  const layout = new SessionStoreAccess().stateLayout(session.id);
  const before = fs.readFileSync(layout.transcriptPath, 'utf8');
  const change = annotate(session.id, 'question', { type: 'context-edit', edit: { kind: 'replace', text: 'Updated context' } });
  const label = annotate(session.id, 'question', { type: 'label', label: 'Investigation' });
  manager.addTurn(session.id, { id: 'continued', role: 'user', content: 'Continue the investigation' });
  expect(fs.readFileSync(layout.transcriptPath, 'utf8').startsWith(before)).toBe(true);
  expect(change.parentId).toBe('question');
  expect(label.parentId).toBe(change.id);

  const reopened = new SessionManager();
  const navigation = await readSessionNavigationAsync(session.id, root);
  expect(navigation.session.turns.map(turn => turn.content)).toEqual(['Original question', 'Continue the investigation']);
  expect(selectModelContext(navigation.session).map(turn => turn.content)).toEqual(['Updated context', 'Continue the investigation']);
  expect(navigation.points.find(point => point.entryId === 'question')).toMatchObject({ bookmark: 'Investigation', prompt: 'Original question' });
  expect(navigation.points.find(point => point.entryId === change.id)).toMatchObject({ label: 'Context edit', parentId: 'question' });

  const fork = reopened.fork(session.id, root, { activate: false, entryId: 'continued' });
  expect(fork.turns.map(turn => turn.content)).toEqual(['Original question']);
  expect(selectModelContext(fork).map(turn => turn.content)).toEqual(['Updated context']);
  expect(fork.labels).toEqual([{ id: 'question', text: 'Investigation' }]);
  await reopened.revertTo(fork.id, 'abandoned');
  expect(selectModelContext(reopened.getSession(fork.id)).map(turn => turn.content)).toEqual(['Original question', 'Other branch answer']);
  expect(reopened.getSession(fork.id)?.labels).toBeUndefined();
  expect(selectModelContext(reopened.getSession(session.id))[0]?.content).toBe('Updated context');
});

it('clears labels and restores content with later events while omission retains its message position', () => {
  const manager = new SessionManager();
  const { id } = manager.createNew(root);
  manager.addTurn(id, { id: 'target', role: 'user', content: 'Original text' });
  annotate(id, 'target', { type: 'label', label: 'Review' });
  annotate(id, 'target', { type: 'context-edit', edit: { kind: 'omit' } });
  expect(selectModelContext(manager.getSession(id))).toMatchObject([{ id: 'target', content: '[Message content omitted from context.]' }]);
  annotate(id, 'target', { type: 'label', label: null });
  annotate(id, 'target', { type: 'context-edit', edit: { kind: 'restore' } });
  const saved = manager.getSession(id);
  expect(saved?.labels).toBeUndefined();
  expect(selectModelContext(saved)).toEqual(saved?.turns);
  expect(manager.getTranscriptEvents(id).filter(event => event.type === 'label' || event.type === 'context-edit')).toHaveLength(4);
});

it('applies saved context limits to edited content and refuses an obsolete selection preview', () => {
  const manager = new SessionManager();
  const { id } = manager.createNew(root);
  const codeBlock = (text: string) => '```text\n' + text.repeat(400) + '\n```';
  manager.addTurn(id, { id: 'original-block', role: 'user', content: codeBlock('old detail ') });
  manager.addTurn(id, { id: 'plain', role: 'assistant', content: 'Original answer' });
  const original = manager.getSession(id)!;
  const captured = updateContextSelection(manager, original, planContextSelection(original, 'elide').selection);

  annotate(id, 'original-block', { type: 'context-edit', edit: { kind: 'replace', text: codeBlock('replacement detail ') } });
  annotate(id, 'plain', { type: 'context-edit', edit: { kind: 'replace', text: codeBlock('expanded answer ') } });
  expect(() => updateContextSelection(manager, captured, undefined)).toThrow('Conversation changed after the context preview.');

  const current = manager.getSession(id)!;
  expect(selectModelContext(current)[0]?.content).toBe('[Large block omitted from context; original retained at original-block.]');
  const plan = planContextSelection(current, 'elide');
  expect(plan.changed).toBe(1);
  const saved = updateContextSelection(manager, current, plan.selection);
  expect(effectiveContextSelection(saved)?.entries.map(entry => entry.id)).toEqual(['original-block', 'plain']);
  expect(selectModelContext(saved)[1]?.content).toBe('[Large block omitted from context; original retained at plain.]');
  expect(saved.turns[1]?.content).toBe('Original answer');
});

it('refuses protected reasoning, tools, provenance and obsolete branch captures before appending', async () => {
  const manager = new SessionManager();
  const { id } = manager.createNew(root);
  manager.addTurn(id, { id: 'question', role: 'user', content: 'Original' });
  manager.addTurn(id, { id: 'reasoning', role: 'assistant', content: 'Signed answer', reasoning: { text: 'Reasoning', signature: 'stored-signature' } });
  manager.addTurn(id, { id: 'call', role: 'assistant', content: '', tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'read', arguments: '{}' } }] });
  manager.addTurn(id, { id: 'result', role: 'tool', content: 'Tool output', tool_call_id: 'tool-1' });
  manager.addTurn(id, { id: 'provenance', role: 'user', content: 'Accepted prompt', metadata: { collaboration: { acceptanceId: 'saved' } } });
  const { session, version } = readSessionNavigation(id, root);
  const before = manager.getTranscriptEvents(id);
  const change = { type: 'context-edit', edit: { kind: 'replace', text: 'Replacement' } } as const;
  for (const targetId of ['reasoning', 'call', 'result', 'provenance']) {
    expect(() => appendSessionAnnotation({ session, expectedVersion: version, targetId, change })).toThrow(SessionPublicationError);
  }
  expect(manager.getTranscriptEvents(id)).toEqual(before);

  await manager.revertTo(id, 'question');
  await manager.revertTo(id, 'provenance');
  const rewound = manager.getTranscriptEvents(id);
  expect(() => appendSessionAnnotation({ session, expectedVersion: version, targetId: 'question', change })).toThrow('conflict');
  expect(manager.getTranscriptEvents(id)).toEqual(rewound);
  expect(selectModelContext(manager.getSession(id)).find(turn => turn.id === 'reasoning')?.reasoning?.signature).toBe('stored-signature');
  expect(selectModelContext(manager.getSession(id)).find(turn => turn.id === 'result')?.tool_call_id).toBe('tool-1');
});

it('keeps an unlinked durable annotation inert after the thread write fails', () => {
  const manager = new SessionManager();
  const { id } = manager.createNew(root);
  manager.addTurn(id, { id: 'target', role: 'user', content: 'Original text' });
  const layout = new SessionStoreAccess().stateLayout(id);
  const { session, version } = readSessionNavigation(id, root);
  const rename = fs.renameSync;
  const fail = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (to === layout.statePath) throw new Error('State publication refused');
    rename(from, to);
  });
  syncBuiltinESMExports();
  try {
    expect(() => appendSessionAnnotation({ session, expectedVersion: version, targetId: 'target',
      change: { type: 'context-edit', edit: { kind: 'replace', text: 'Unconfirmed context' } } })).toThrow('persistence unknown');
  } finally {
    fail.mockRestore();
    syncBuiltinESMExports();
  }
  const reopened = new SessionManager();
  expect(reopened.getTranscriptEvents(id).at(-1)?.type).toBe('context-edit');
  expect(selectModelContext(reopened.getSession(id))[0]?.content).toBe('Original text');
  expect(readSessionNavigation(id, root).thread.activeLeafId).toBe('target');
});
