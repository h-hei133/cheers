import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { readExportSource } from './source.js';

afterEach(cleanupAdvisorHarnesses);

it('refuses oversized transcript acquisition before reading or allocating its body', () => {
  const s = createAdvisorHarness(false, false);
  const transcript = path.join(s.manager.getSessionDirPath(s.session.id), 'transcript.jsonl');
  fs.truncateSync(transcript, 8 * 1024 * 1024);
  const read = vi.spyOn(fs, 'readSync');
  expect(readExportSource(s.session.id, 128)).toEqual({ ok: false, reason: 'The session transcript could not be read.' });
  expect(read).not.toHaveBeenCalled();
});
