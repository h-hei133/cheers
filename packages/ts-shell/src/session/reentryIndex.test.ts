import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from './SessionManager.js';
import { createSessionStoreLayout } from './store/sessionFileLayout.js';

let scratch: string; let root: string; let manager: SessionManager;
beforeEach(() => {
  scratch = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/reentry-index-'));
  root = path.join(scratch, 'project'); fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  const home = path.join(scratch, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  manager = new SessionManager();
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });

it('reuses a persisted summary until the session files change', () => {
  const session = manager.createNew(root); manager.renameSession(session.id, 'Indexed title');
  const first = manager.listReentrySummaries({ includeUntouched: true });
  const file = path.join(createSessionStoreLayout().sessionsDir, '.reentry-index.json');
  expect(fs.existsSync(file)).toBe(true);
  expect(first.find(summary => summary.id === session.id)?.title).toBe('Indexed title');
  expect(manager.listReentrySummaries({ includeUntouched: true })).toEqual(first);
  manager.renameSession(session.id, 'Renamed title');
  expect(manager.listReentrySummaries({ includeUntouched: true }).find(summary => summary.id === session.id)?.title).toBe('Renamed title');
});

it('treats a damaged index as a cache miss', () => {
  const session = manager.createNew(root); manager.renameSession(session.id, 'Still readable');
  manager.listReentrySummaries({ includeUntouched: true });
  fs.writeFileSync(path.join(createSessionStoreLayout().sessionsDir, '.reentry-index.json'), '{not json');
  expect(manager.listReentrySummaries({ includeUntouched: true }).find(summary => summary.id === session.id)?.title).toBe('Still readable');
});
