import { expect, it, vi } from 'vitest';
import { hubPicker } from './hub.js';
import type { JobsComposition } from '../../jobs/model.js';

const projection = vi.hoisted(() => ({
  value: { jobs: [] as Record<string, unknown>[] },
}));

vi.mock('../../jobs/hub.js', () => ({
  hubProjection: () => projection.value,
}));

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

it('polls the read-only projection and keeps unknown distinct from stored status', async () => {
  vi.useFakeTimers();
  projection.value = {
    jobs: [{ id: 'job-live', backend: 'agent', status: 'unknown', storedStatus: 'running', output: 'unknown' }],
  };
  try {
    const jobs = { local: { get: () => undefined } } as unknown as JobsComposition;
    const picker = hubPicker(jobs);
    const publish = vi.fn();
    const stop = picker.subscribe!(publish);

    expect((await picker.load())[0]).toMatchObject({ id: 'job-live', note: 'unknown' });
    expect(picker.detail?.('job-live')?.join('\n')).toContain('Status: unknown (stored running)');

    projection.value = {
      jobs: [{ id: 'job-live', backend: 'agent', status: 'completed', storedStatus: 'completed', output: 'done' }],
    };
    await vi.advanceTimersByTimeAsync(1_000);
    expect(publish).toHaveBeenCalledWith([expect.objectContaining({ id: 'job-live', note: 'completed' })]);
    stop();
    projection.value = { jobs: [] };
    await vi.advanceTimersByTimeAsync(1_000);
    expect(publish).toHaveBeenCalledTimes(1);
  } finally {
    projection.value = { jobs: [] };
    vi.useRealTimers();
  }
});
