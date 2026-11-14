import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
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

it('bounds metadata acquisition along with state accounting acquisition', () => {
  const s = createAdvisorHarness(false, false);
  const source = readExportSource(s.session.id);
  expect(source.ok).toBe(true);
  if (!source.ok) return;
  fs.truncateSync(source.metadataPath, 8 * 1024 * 1024);
  const read = vi.spyOn(fs, 'readSync');
  expect(readExportState(source, s.session.id, 128)).toBeUndefined();
  expect(read).not.toHaveBeenCalled();
});
