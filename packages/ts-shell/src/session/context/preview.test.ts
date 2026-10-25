import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { projectSessionFileLayout } from '../store/sessionFileLayout.js';
import { writeSessionRecord } from '../store/sessionStore.js';
import type { Session } from '../schema/sessionRecord.js';
import { readPromptPreview } from './preview.js';

let root: string;
beforeEach(() => { fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/session-preview-'); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const fixture = () => {
  const session: Session = { id: 'sess_preview', projectRoot: root, status: 'active', rootMode: 'direct',
    createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T00:00:00.000Z', turns: [] };
  const layout = projectSessionFileLayout({ sessionsDir: path.join(root, 'sessions'), sessionId: session.id });
  writeSessionRecord({ session, layout });
  const host = { getSessionDirPath: () => layout.sessionDir };
  return { session, layout, host };
};

it('reads a complete session without writes or normalization and fences later state changes', async () => {
  const { session, layout, host } = fixture();
  const paths = [layout.metadataPath, layout.statePath, layout.transcriptPath];
  const before = paths.map(target => fs.readFileSync(target));
  const preview = await readPromptPreview(host, session, root, 'question');
  preview.verify(); expect(preview.session.id).toBe(session.id);
  expect(paths.map(target => fs.readFileSync(target))).toEqual(before);
  expect(fs.existsSync(layout.stateLockPath)).toBe(false);
  const state = JSON.parse(fs.readFileSync(layout.statePath, 'utf8')); state.pendingPrompt = 'changed';
  fs.writeFileSync(layout.statePath, JSON.stringify(state)); expect(() => preview.verify()).toThrow('changed');
});

it('rejects cancelled, mismatched and oversized session reads instead of truncating them', async () => {
  const { session, layout, host } = fixture(); const controller = new AbortController(); controller.abort();
  await expect(readPromptPreview(host, session, root, 'question', controller.signal)).rejects.toThrow();
  await expect(readPromptPreview(host, { ...session, createdAt: 'different' }, root, 'question')).rejects.toThrow('complete');
  fs.writeFileSync(layout.transcriptPath, ' '.repeat(4 * 1024 * 1024 + 1));
  await expect(readPromptPreview(host, session, root, 'question')).rejects.toThrow();
});

it('invalidates a changed live history even before disk publication', async () => {
  const { session, host } = fixture(); const preview = await readPromptPreview(host, session, root, 'question');
  session.turns.push({ role: 'user', content: 'changed', timestamp: '2026-10-26T00:00:00.000Z' });
  expect(() => preview.verify()).toThrow('changed');
});

it('fences context selection and workspace roots before disk publication', async () => {
  const { session, host } = fixture();
  const selection = await readPromptPreview(host, session, root, 'question');
  session.contextSelection = { version: 1, revision: 1, entries: [] };
  expect(() => selection.verify()).toThrow('changed');
  await expect(readPromptPreview(host, session, root, 'question')).rejects.toThrow('complete');
  session.contextSelection = undefined;
  const roots = await readPromptPreview(host, session, root, 'question');
  session.workspaceRoots = [];
  expect(() => roots.verify()).toThrow('changed');
});

it('rejects malformed goals from the bounded snapshot', async () => {
  const { session, host, layout } = fixture();
  const state = JSON.parse(fs.readFileSync(layout.statePath, 'utf8')); state.goal = { phase: 'active' };
  fs.writeFileSync(layout.statePath, JSON.stringify(state));
  await expect(readPromptPreview(host, session, root, 'question')).rejects.toThrow('goal');
});
