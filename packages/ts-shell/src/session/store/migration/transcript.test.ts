import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { userDataSearchDirsFor } from '../../../core/paths/userHome.js';
import { SessionManager } from '../../SessionManager.js';
import { readTranscript } from '../../transcript/read.js';
import { SessionStoreAccess } from '../sessionStoreAccess.js';
import type { SessionFileLayout } from '../sessionFileLayout.js';

let root: string;
let manager: SessionManager;
let sessionId: string;
let layout: SessionFileLayout;

const first = JSON.stringify({ type: 'message', role: 'user', content: 'Inspect \u4e2d\u6587', timestamp: '2026-11-01T00:00:01.000Z' });
const second = JSON.stringify({ type: 'message', id: 'answer', role: 'assistant', content: 'Saved answer', timestamp: '2026-11-01T00:00:02.000Z' });
const original = `${first}\r\n${second}`;

beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(temporary, { recursive: true });
  root = fs.mkdtempSync(path.join(temporary, 'transcript-migration-'));
  vi.stubEnv('HOME', root);
  vi.stubEnv('USERPROFILE', root);
  vi.stubEnv('CHEERS_TEST_ROOT', root);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
  manager = new SessionManager();
  sessionId = manager.createNew(root).id;
  layout = new SessionStoreAccess().stateLayout(sessionId);
  fs.writeFileSync(layout.transcriptPath, original, 'utf8');
});

afterEach(() => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

function preview(direction: 'upgrade' | 'rollback' = 'upgrade'): string {
  const result = manager.migrateTranscript(sessionId, { direction });
  expect(result).toMatchObject({ status: 'preview', version: direction === 'upgrade' ? 0 : 1, targetVersion: direction === 'upgrade' ? 1 : 0 });
  if (result.status !== 'preview') throw new Error('Expected a migration preview.');
  return result.confirmation;
}

function archives(): string[] {
  return fs.readdirSync(layout.sessionDir).filter(name => /^transcript\.[a-f0-9]{64}\.bak$/.test(name));
}

it('migrates and explicitly restores the same legacy session without changing entry identities or the other saved files', () => {
  const modernDirectory = layout.sessionDir;
  const legacy = path.join(userDataSearchDirsFor(root)[1]!, 'sessions');
  fs.mkdirSync(legacy, { recursive: true });
  fs.renameSync(modernDirectory, path.join(legacy, sessionId));
  manager = new SessionManager();
  layout = new SessionStoreAccess().stateLayout(sessionId);
  const metadata = fs.readFileSync(layout.metadataPath);
  const state = fs.readFileSync(layout.statePath);
  const turns = manager.getSession(sessionId)?.turns;
  const selection = manager.readCurrentSessionSelection(root);
  expect(turns?.map(turn => turn.id)).toEqual(['line-1', 'answer']);
  const confirmation = preview();
  expect(fs.readFileSync(layout.transcriptPath, 'utf8')).toBe(original);
  expect(archives()).toEqual([]);

  expect(manager.migrateTranscript(sessionId, { confirmation })).toEqual({ status: 'committed', version: 1 });
  const upgraded = fs.readFileSync(layout.transcriptPath, 'utf8');
  expect(upgraded.slice(upgraded.indexOf('\n') + 1)).toBe(original);
  expect(readTranscript(layout.transcriptPath).version).toBe(1);
  const archive = path.join(layout.sessionDir, archives()[0]!);
  expect(fs.readFileSync(archive)).toEqual(Buffer.from(original));
  expect(new SessionManager().getSession(sessionId)?.turns).toEqual(turns);
  expect(fs.existsSync(modernDirectory)).toBe(false);

  expect(manager.migrateTranscript(sessionId, { direction: 'rollback', confirmation: preview('rollback') })).toEqual({ status: 'committed', version: 0 });
  expect(readTranscript(layout.transcriptPath).version).toBe(0);
  expect(fs.readFileSync(layout.transcriptPath)).toEqual(Buffer.from(original));
  expect(fs.readFileSync(archive)).toEqual(Buffer.from(original));
  expect(fs.readFileSync(layout.metadataPath)).toEqual(metadata);
  expect(fs.readFileSync(layout.statePath)).toEqual(state);
  expect(manager.readCurrentSessionSelection(root)).toEqual(selection);
});

it('refuses preview and apply when admission expires or the saved version changes without creating an archive', () => {
  expect(manager.migrateTranscript(sessionId, { admission: () => 'Expired binding' })).toMatchObject({ status: 'unchanged' });
  const confirmation = preview();
  manager.renameSession(sessionId, 'Concurrent title');
  expect(manager.migrateTranscript(sessionId, { confirmation }).status).toBe('unchanged');
  const admitted = preview();
  let checks = 0;
  expect(manager.migrateTranscript(sessionId, { confirmation: admitted,
    admission: () => ++checks === 2 ? 'Binding changed' : undefined })).toMatchObject({ status: 'unchanged' });
  expect(fs.readFileSync(layout.transcriptPath, 'utf8')).toBe(original);
  expect(archives()).toEqual([]);
});

it('keeps a prepared archive when the live rename is interrupted and reuses it on explicit retry', () => {
  const confirmation = preview();
  const rename = fs.renameSync;
  const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (to === layout.transcriptPath) throw new Error('Private publication detail');
    return rename(from, to);
  });
  syncBuiltinESMExports();
  try {
    const firstAttempt = manager.migrateTranscript(sessionId, { confirmation });
    expect(firstAttempt).toMatchObject({ status: 'unknown' });
    expect(JSON.stringify(firstAttempt)).not.toContain('Private publication detail');
  } finally { spy.mockRestore(); syncBuiltinESMExports(); }
  const [archiveName] = archives();
  const archive = path.join(layout.sessionDir, archiveName!);
  const identity = fs.statSync(archive).ino;
  expect(fs.readFileSync(layout.transcriptPath, 'utf8')).toBe(original);
  expect(fs.readFileSync(archive, 'utf8')).toBe(original);
  expect(new SessionManager().migrateTranscript(sessionId, { confirmation })).toEqual({ status: 'committed', version: 1 });
  expect(archives()).toEqual([archiveName]);
  expect(fs.statSync(archive).ino).toBe(identity);
});

it('leaves later appends in the canonical transcript and refuses an obsolete rollback', () => {
  expect(manager.migrateTranscript(sessionId, { confirmation: preview() }).status).toBe('committed');
  const confirmation = preview('rollback');
  manager.addTurn(sessionId, { id: 'new', role: 'user', content: 'Later question' });
  const current = fs.readFileSync(layout.transcriptPath);
  expect(manager.migrateTranscript(sessionId, { direction: 'rollback', confirmation }).status).toBe('unchanged');
  expect(manager.migrateTranscript(sessionId, { direction: 'rollback' }).status).toBe('unchanged');
  expect(fs.readFileSync(layout.transcriptPath)).toEqual(current);
  expect(fs.readFileSync(path.join(layout.sessionDir, archives()[0]!), 'utf8')).toBe(original);
  expect(new SessionManager().getSession(sessionId)?.turns.at(-1)?.content).toBe('Later question');
});

it.each(['damaged', 'duplicate', 'busy'] as const)('preserves and refuses a %s legacy source', state => {
  if (state === 'damaged') fs.appendFileSync(layout.transcriptPath, '\n{torn', 'utf8');
  if (state === 'duplicate') fs.appendFileSync(layout.transcriptPath, `\n${second}`, 'utf8');
  if (state === 'busy') manager.persistUserPromptBarrier(sessionId, 'Pending question');
  const current = fs.readFileSync(layout.transcriptPath);
  expect(manager.migrateTranscript(sessionId).status).toBe('unchanged');
  expect(fs.readFileSync(layout.transcriptPath)).toEqual(current);
  expect(archives()).toEqual([]);
});
