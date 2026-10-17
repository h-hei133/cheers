import { expect, it } from 'vitest';
import { hubPicker } from './hub.js';
import type { JobsComposition } from '../../jobs/model.js';

it('opens the selected local job output as a redacted report', async () => {
  const job = { id: 'job-1', status: 'completed', output: 'complete', stdout: Buffer.from('hello\nworld').toString('base64'), stderr: '', truncated: false };
  const jobs = { local: { get: () => job } } as unknown as JobsComposition;
  const outcome = await hubPicker(jobs).apply(['job-1']);
  expect(outcome?.report?.title).toBe('Output job-1');
  expect(JSON.stringify(outcome?.report)).toContain('hello');
  expect(JSON.stringify(outcome?.report)).toContain('Later pages');
});

it('keeps unknown remote jobs read-only with a note', async () => {
  const jobs = { local: { get: () => undefined } } as unknown as JobsComposition;
  const outcome = await hubPicker(jobs).apply(['remote-1']);
  expect(outcome?.note).toContain('Read-only');
});
