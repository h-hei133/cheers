import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { createReport, reportText, span } from '../../core/commands/report/projection.js';
import { restoreConversation } from '../../cli/interactive/history.js';
import { appendTranscriptEvent } from '../transcript/sessionTranscript.js';
import { gatherExport } from '../export/collect.js';
import { renderReport } from '../../presentation/tui/report/renderer.js';
import { stripAnsi } from '../../presentation/tui/text/ansi.js';
import { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { restoreReport } from './projection.js';

let root: string; let manager: SessionManager;
const report = createReport({ title: 'Observed inventory', lines: [{ kind: 'text', spans: [span('unknown', 'warning')] }],
  facts: { clean: null, count: 0, status: 'unavailable' } });
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'report-history-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
  manager = new SessionManager();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it('retains report-only sessions without changing runtime state or introducing model messages', () => {
  const session = manager.createNew(root); const directory = manager.getSessionDirPath(session.id);
  const before = ['state.json', 'metadata.json'].map(file => fs.readFileSync(path.join(directory, file)));
  expect(manager.captureReportWriter(session.id)(report)).toBe('saved');
  const loaded = new SessionManager().getSession(session.id)!;
  expect(loaded.turns).toEqual([]);
  expect(loaded.reports?.[0]?.report).toEqual(report);
  expect(manager.getReplayPlan(session.id).replayMessages).toEqual([]);
  expect(['state.json', 'metadata.json'].map(file => fs.readFileSync(path.join(directory, file)))).toEqual(before);
  expect(manager.discardIfEmpty(session.id)).toBe(false);
  expect(manager.getReentryCandidate({ preferredProjectRoot: root })?.id).toBe(session.id);
  const restored = restoreConversation(loaded.turns, loaded.reports);
  expect(restored.blocks).toMatchObject([{ kind: 'command', text: reportText(report), report }]);
  expect(restored.blocks[0]?.title).toContain('Saved report');
  expect(stripAnsi(renderReport(loaded.reports![0]!.report!, 25).join('\n'))).toContain('unknown');
  const fork = manager.fork(session.id);
  expect(fork.reports).toHaveLength(1);
  expect(fork.reports![0]!.sourceEntryId).toBe(`${fork.id}:root`);
  const exported = gatherExport({ sessionId: session.id, workspace: root });
  expect(exported.ok).toBe(true);
  if (!exported.ok) throw new Error(exported.reason);
  expect(exported.payload.entries).toMatchObject([{ role: 'command', content: reportText(report) }]);
  expect(exported.payload.tree.find(node => node.kind === 'command-output')?.parentId)
    .toBe(exported.payload.entries[0]?.sourceEntryId);
  expect(exported.payload.warnings).toEqual([]);
});

it('keeps ancestor annotations on their path and preserves copied thread ancestry immediately on fork', async () => {
  const session = manager.createNew(root);
  manager.addTurn(session.id, { role: 'user', content: 'question' });
  const userId = manager.getSession(session.id)!.turns[0]!.id!;
  manager.addTurn(session.id, { role: 'assistant', content: 'answer' });
  expect(manager.captureReportWriter(session.id)(report)).toBe('saved');
  const fork = manager.fork(session.id);
  expect(fork.reports).toHaveLength(1);
  expect(fork.turns.map(turn => turn.content)).toEqual(['question', 'answer']);
  const stale = manager.captureReportWriter(session.id);
  await manager.revertTo(session.id, userId);
  expect(stale(report)).toBe('not-saved');
  expect(manager.getSession(session.id)?.reports ?? []).toEqual([]);
  expect(manager.getSession(session.id)?.hasReportHistory).toBe(true);
  expect(manager.discardIfEmpty(session.id)).toBe(false);
  expect(manager.captureReportWriter(session.id)(report)).toBe('saved');
  const current = manager.getSession(session.id)!;
  expect(current.reports).toHaveLength(1);
  expect(restoreConversation(current.turns, current.reports).blocks.at(-1)?.kind).toBe('command');
  const events = manager.getTranscriptEvents(session.id);
  expect(events.filter(event => event.type === 'command-output')).toHaveLength(2);
});

it('falls back to safe text for unknown or malformed stored report versions', () => {
  expect(restoreReport({ type: 'command-output', id: 'large', sourceEntryId: 'root', timestamp: '',
    text: '\0'.repeat(200000) })).toBeUndefined();
  const session = manager.createNew(root); const transcript = path.join(manager.getSessionDirPath(session.id), 'transcript.jsonl');
  for (const semantic of [{ ...report, version: 2 }, { ...report, lines: [null] }]) {
    appendTranscriptEvent(transcript, { type: 'command-output', sourceEntryId: `${session.id}:root`,
      timestamp: '\x1b]0;FORGED_TITLE\x07', text: '\x1b[31mReadable fallback\x1b[0m\nnext', report: semantic });
  }
  const loaded = manager.getSession(session.id)!;
  expect(loaded.reports?.map(saved => [saved.report, saved.text])).toEqual([
    [undefined, 'Readable fallback\nnext'], [undefined, 'Readable fallback\nnext'],
  ]);
  expect(restoreConversation(loaded.turns, loaded.reports).blocks.map(block => block.text))
    .toEqual(['Readable fallback\nnext', 'Readable fallback\nnext']);
  expect(restoreConversation(loaded.turns, loaded.reports).blocks.every(block => block.title === 'Saved report · unknown time')).toBe(true);
});

it('does not recreate missing transcripts and keeps uncertain append outcomes distinct', () => {
  const session = manager.createNew(root); const transcript = path.join(manager.getSessionDirPath(session.id), 'transcript.jsonl');
  const write = manager.captureReportWriter(session.id); const bytes = fs.readFileSync(transcript);
  fs.unlinkSync(transcript);
  expect(write(report)).toBe('not-saved');
  expect(fs.existsSync(transcript)).toBe(false);
  fs.writeFileSync(transcript, bytes);
  const lock = SessionStoreAccess.prototype.withSessionStateLock;
  vi.spyOn(SessionStoreAccess.prototype, 'withSessionStateLock').mockImplementation(function (this: SessionStoreAccess, id, action) {
    lock.call(this, id, action); throw new Error('unverified lock release');
  });
  expect(manager.captureReportWriter(session.id)(report)).toBe('unverified');
  expect(manager.getSession(session.id)?.reports).toHaveLength(1);
});

it('preserves partial tails and never recreates a deleted session directory', () => {
  const session = manager.createNew(root); const directory = manager.getSessionDirPath(session.id);
  const transcript = path.join(directory, 'transcript.jsonl');
  fs.appendFileSync(transcript, '{"type":"message","content":"partial');
  const before = fs.readFileSync(transcript);
  expect(manager.captureReportWriter(session.id)(report)).toBe('saved');
  expect(fs.readFileSync(transcript).subarray(0, before.length)).toEqual(before);
  expect(manager.getSession(session.id)?.reports).toHaveLength(1);
  const write = manager.captureReportWriter(session.id);
  manager.deleteSession(session.id);
  expect(write(report)).toBe('not-saved');
  expect(fs.existsSync(directory)).toBe(false);
});
