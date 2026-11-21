import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { promptIntentPath } from '../store/prompt/intent.js';
import { readExportSource, readExportState } from './source.js';

afterEach(cleanupAdvisorHarnesses);

it('refuses oversized transcript acquisition before reading or allocating its body', () => {
  const s = createAdvisorHarness(false, false);
  const transcript = path.join(s.manager.getSessionDirPath(s.session.id), 'transcript.jsonl');
  fs.truncateSync(transcript, 8 * 1024 * 1024);
  const read = vi.spyOn(fs, 'readSync');
  expect(readExportSource(s.session.id, 128)).toEqual({ ok: false, reason: 'The session transcript could not be read.' });
  expect(read).not.toHaveBeenCalled();
});

it('does not attach replacement-directory state to an already captured transcript', () => {
  const s = createAdvisorHarness(false, false);
  const source = readExportSource(s.session.id);
  expect(source.ok).toBe(true);
  if (!source.ok) return;
  expect(readExportState(source, s.session.id)).toBeDefined();
  const retired = source.sessionDir + '.retired';
  fs.renameSync(source.sessionDir, retired);
  fs.cpSync(retired, source.sessionDir, { recursive: true });
  expect(readExportState(source, s.session.id)).toBeUndefined();
});

it('does not expose the transcript or accounting while a publication is unfinished', () => {
  const s = createAdvisorHarness(false, false);
  const source = readExportSource(s.session.id);
  if (!source.ok) throw new Error('The saved export test fixture is unavailable.');
  expect(readExportState(source, s.session.id)).toBeDefined();
  fs.writeFileSync(promptIntentPath(source), '{}');
  expect(readExportSource(s.session.id)).toMatchObject({ ok: false });
  expect(readExportState(source, s.session.id)).toBeUndefined();
});

it('rejects accounting from a later capture even after the transaction marker is gone', () => {
  const s = createAdvisorHarness(false, false);
  const source = readExportSource(s.session.id);
  if (!source.ok) throw new Error('The saved export test fixture is unavailable.');
  expect(readExportState(source, s.session.id)).toBeDefined();
  fs.appendFileSync(source.transcriptPath, '\n');
  expect(readExportState(source, s.session.id)).toBeUndefined();
  const latest = readExportSource(s.session.id);
  if (!latest.ok) throw new Error('The updated export test fixture is unavailable.');
  expect(readExportState(latest, s.session.id)).toBeDefined();
});

it('keeps the transcript available when there is no saved accounting', () => {
  const s = createAdvisorHarness(false, false);
  fs.unlinkSync(path.join(s.manager.getSessionDirPath(s.session.id), 'state.json'));
  const source = readExportSource(s.session.id, 1024 * 1024);
  if (!source.ok) throw new Error('The transcript-only export fixture is unavailable.');
  expect(source.raw).toEqual(expect.any(String));
  expect(readExportState(source, s.session.id)).toBeUndefined();
});

it('bounds metadata acquisition along with state accounting acquisition', () => {
  const s = createAdvisorHarness(false, false);
  fs.truncateSync(path.join(s.manager.getSessionDirPath(s.session.id), 'metadata.json'), 8 * 1024 * 1024);
  const source = readExportSource(s.session.id);
  expect(source.ok).toBe(true);
  if (!source.ok) return;
  const read = vi.spyOn(fs, 'readSync');
  expect(readExportState(source, s.session.id, 128)).toBeUndefined();
  expect(read).not.toHaveBeenCalled();
});
