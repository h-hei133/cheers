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

it('drops summaries for sessions that no longer exist', () => {
  const first = manager.createNew(root); const second = manager.createNew(root);
  manager.listReentrySummaries({ includeUntouched: true });
  const sessionsDir = createSessionStoreLayout().sessionsDir;
  fs.rmSync(path.join(sessionsDir, first.id), { recursive: true, force: true });
  manager.listReentrySummaries({ includeUntouched: true });
  const index = JSON.parse(fs.readFileSync(path.join(sessionsDir, '.reentry-index.json'), 'utf8')) as { entries: Record<string, unknown> };
  expect(index.entries[first.id]).toBeUndefined();
  expect(index.entries[second.id]).toBeDefined();
});

it('treats a damaged index as a cache miss in a fresh manager', () => {
  const session = manager.createNew(root); manager.renameSession(session.id, 'Still readable');
  manager.listReentrySummaries({ includeUntouched: true });
  fs.writeFileSync(path.join(createSessionStoreLayout().sessionsDir, '.reentry-index.json'), '{not json');
  expect(new SessionManager().listReentrySummaries({ includeUntouched: true }).find(summary => summary.id === session.id)?.title).toBe('Still readable');
});

it.each([
  { name: 'missing project root', patch: { projectRoot: undefined } },
  { name: 'wrong project root type', patch: { projectRoot: 42 } },
  { name: 'mismatched session identity', patch: { id: 'another-session' } },
  { name: 'wrong prompt type', patch: { pendingPrompt: {} } },
  { name: 'wrong recoverability type', patch: { recoverable: 'false' } },
  { name: 'unknown resume disposition', patch: { resumeDisposition: 'ready' } },
  { name: 'wrong report history type', patch: { hasReportHistory: 'true' } },
  { name: 'negative repair step', patch: { stagedRepairStepCount: -1 } },
])('recomputes a cached summary with $name without losing healthy entries', ({ patch }) => {
  const session = manager.createNew(root); manager.renameSession(session.id, 'Actual title');
  const healthy = manager.createNew(root); manager.renameSession(healthy.id, 'Healthy title');
  const expected = manager.listReentrySummaries({ includeUntouched: true, preferredProjectRoot: root });
  const file = path.join(createSessionStoreLayout().sessionsDir, '.reentry-index.json');
  const index = JSON.parse(fs.readFileSync(file, 'utf8'));
  index.entries[session.id].summary = { ...index.entries[session.id].summary, title: 'Damaged title', ...patch };
  fs.writeFileSync(file, JSON.stringify(index));

  const reopened = new SessionManager();
  const describe = vi.spyOn(reopened, 'describeSessionReentry');
  expect(reopened.listReentrySummaries({ includeUntouched: true, preferredProjectRoot: root })).toEqual(expected);
  expect(describe).toHaveBeenCalledTimes(1);
  expect(describe).toHaveBeenCalledWith(session.id);
  const repaired = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(repaired.entries[session.id].summary).toEqual(expected.find(summary => summary.id === session.id));
  expect(repaired.entries[healthy.id]).toEqual(index.entries[healthy.id]);
});

it('reuses a valid persisted summary without recomputing it', () => {
  const session = manager.createNew(root); manager.renameSession(session.id, 'Cached title');
  const expected = manager.listReentrySummaries({ includeUntouched: true });
  const reopened = new SessionManager();
  const describe = vi.spyOn(reopened, 'describeSessionReentry');
  expect(reopened.listReentrySummaries({ includeUntouched: true })).toEqual(expected);
  expect(describe).not.toHaveBeenCalled();
});
