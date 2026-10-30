import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { projectSessionFileLayout } from './sessionFileLayout.js';
import { readSessionManagementSnapshot } from './management.js';
import * as stateStore from './sessionStateStore.js';

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const scratch = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratch, 'management-state-')); roots.push(root);
  const layout = projectSessionFileLayout({ sessionsDir: root, sessionId: 'saved' });
  fs.mkdirSync(layout.sessionDir);
  const metadata = { id: 'saved', projectRoot: root, title: 'Saved work', createdAt: '2026-10-30T00:00:00.000Z', updatedAt: '2026-10-30T00:00:00.000Z' };
  const state = { projectRoot: root, status: 'completed' };
  fs.writeFileSync(layout.metadataPath, JSON.stringify(metadata)); fs.writeFileSync(layout.statePath, JSON.stringify(state));
  fs.writeFileSync(layout.transcriptPath, 'Conversation bytes are not acquired by a management snapshot.');
  return { root, layout, metadata, state };
}

it('returns management identity without constructing or reading a conversation', () => {
  const { layout, metadata, state } = fixture();
  const read = vi.spyOn(fs, 'readFileSync');
  const snapshot = readSessionManagementSnapshot(layout, 'saved');
  expect(snapshot.session).toEqual({ id: 'saved', projectRoot: metadata.projectRoot, title: metadata.title, createdAt: metadata.createdAt });
  expect(snapshot.state).toEqual(state); expect(snapshot.metadata).toEqual(metadata);
  expect('turns' in snapshot.session).toBe(false);
  expect(read.mock.calls.some(([target]) => target === layout.transcriptPath)).toBe(false);
});

it.each(['id', 'createdAt', 'updatedAt', 'title', 'metadata-root', 'state-root', 'root-mismatch', 'status'] as const)(
  'refuses invalid or inconsistent management identity: %s', kind => {
    const { layout, metadata, state } = fixture();
    const nextMetadata: Record<string, unknown> = { ...metadata }, nextState: Record<string, unknown> = { ...state };
    if (kind === 'id') nextMetadata.id = 'other';
    if (kind === 'createdAt') nextMetadata.createdAt = 123;
    if (kind === 'updatedAt') nextMetadata.updatedAt = 'invalid';
    if (kind === 'title') nextMetadata.title = {};
    if (kind === 'metadata-root') nextMetadata.projectRoot = 123;
    if (kind === 'state-root') nextState.projectRoot = 123;
    if (kind === 'root-mismatch') nextState.projectRoot = path.join(metadata.projectRoot, 'different');
    if (kind === 'status') nextState.status = 'approved';
    fs.writeFileSync(layout.metadataPath, JSON.stringify(nextMetadata)); fs.writeFileSync(layout.statePath, JSON.stringify(nextState));
    expect(() => readSessionManagementSnapshot(layout, 'saved')).toThrow(/invalid|inconsistent/);
  });

it.each(['metadata', 'state'] as const)('retains a legacy root from the other source when %s omits it', owner => {
  const { layout, metadata, state } = fixture();
  const target = owner === 'metadata' ? layout.metadataPath : layout.statePath;
  const { projectRoot: omitted, ...legacy } = owner === 'metadata' ? metadata : state;
  fs.writeFileSync(target, JSON.stringify(legacy));
  expect(readSessionManagementSnapshot(layout, 'saved').session.projectRoot).toBe(omitted);
});

it.each(['transcript', 'directory'] as const)('refuses %s replacement during the metadata/state read', kind => {
  const { layout } = fixture();
  const original = stateStore.readStateSnapshotRequired;
  vi.spyOn(stateStore, 'readStateSnapshotRequired').mockImplementation((...args) => {
    const state = original(...args);
    if (kind === 'transcript') fs.appendFileSync(layout.transcriptPath, 'changed');
    else { fs.renameSync(layout.sessionDir, layout.sessionDir + '-old'); fs.cpSync(layout.sessionDir + '-old', layout.sessionDir, { recursive: true }); }
    return state;
  });
  expect(() => readSessionManagementSnapshot(layout, 'saved')).toThrow(/changed/);
});

it('rejects a symlink source even when its bytes match the original', () => {
  const { layout } = fixture();
  fs.renameSync(layout.metadataPath, layout.metadataPath + '.original'); fs.symlinkSync(layout.metadataPath + '.original', layout.metadataPath);
  expect(() => readSessionManagementSnapshot(layout, 'saved')).toThrow(/unavailable/);
});
