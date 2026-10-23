import { expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  projection.value = { jobs: [{ id: 'job-1', backend: 'local', status: 'completed', output: 'complete' }] };
  const session = { id: 'hub-session', createdAt: 'created', projectRoot: process.cwd() };
  const jobs = { session, context: { session }, local: { get: () => job } } as unknown as JobsComposition;
  const picker = hubPicker(jobs);
  await picker.load();
  const outcome = await picker.apply(['job-1']);
  expect(outcome?.report?.title).toBe('Output job-1');
  expect(JSON.stringify(outcome?.report)).toContain('hello');
  expect(JSON.stringify(outcome?.report)).toContain('Later pages');
});

it('keeps unknown remote jobs read-only with a note', async () => {
  projection.value = { jobs: [{ id: 'remote-1', backend: 'remote', status: 'unknown', output: 'unknown' }] };
  const session = { id: 'hub-session', createdAt: 'created', projectRoot: process.cwd() };
  const jobs = { session, context: { session },
    local: { get: () => { throw new Error('missing local job'); } } } as unknown as JobsComposition;
  const picker = hubPicker(jobs);
  await picker.load();
  const outcome = await picker.apply(['remote-1']);
  expect(outcome?.note).toContain('Read-only');
});

it('redacts untrusted command, note, directory and output metadata', async () => {
  projection.value = {
    jobs: [{
      id: 'job-secret',
      backend: 'agent',
      status: 'unknown',
      storedStatus: 'Authorization: Bearer SYNTHETIC_HUB_STATUS',
      command: 'Authorization: Bearer SYNTHETIC_HUB_COMMAND',
      note: 'Authorization: Bearer SYNTHETIC_HUB_NOTE',
      directory: '/tmp/Authorization: Bearer SYNTHETIC_HUB_DIRECTORY',
      output: 'Authorization: Bearer SYNTHETIC_HUB_OUTPUT',
    }],
  };
  const session = { id: 'hub-session', createdAt: 'created', projectRoot: process.cwd() };
  const picker = hubPicker({ session, context: { session }, local: { get: () => undefined } } as unknown as JobsComposition);
  const rows = await picker.load();
  const rendered = JSON.stringify({ rows, detail: picker.detail?.('job-secret') });
  expect(rendered).not.toContain('SYNTHETIC_HUB_STATUS');
  expect(rendered).not.toContain('SYNTHETIC_HUB_COMMAND');
  expect(rendered).not.toContain('SYNTHETIC_HUB_NOTE');
  expect(rendered).not.toContain('SYNTHETIC_HUB_DIRECTORY');
  expect(rendered).not.toContain('SYNTHETIC_HUB_OUTPUT');
});

it('polls the read-only projection and keeps unknown distinct from stored status', async () => {
  vi.useFakeTimers();
  projection.value = {
    jobs: [{ id: 'job-live', backend: 'agent', status: 'unknown', storedStatus: 'running', output: 'unknown' }],
  };
  try {
    const session = { id: 'hub-session', createdAt: 'created', projectRoot: process.cwd() };
    const jobs = { session, context: { session }, local: { get: () => undefined } } as unknown as JobsComposition;
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

it('becomes stale after a same-id session or workspace rebind', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-identity-'));
  try {
    const session = { id: 'same', createdAt: 'created', projectRoot: root };
    const context = { session };
    projection.value = { jobs: [{ id: 'job-live', backend: 'local', status: 'completed', output: 'complete' }] };
    const get = vi.fn(() => undefined);
    const jobs = { session, context, local: { get } } as unknown as JobsComposition;
    const picker = hubPicker(jobs);
    expect(picker.isCurrent?.()).toBe(true);
    await picker.load();

    context.session = { ...session, createdAt: 'recreated' };
    expect(picker.isCurrent?.()).toBe(false);
    expect(picker.status?.()).toContain('changed');
    expect(await picker.apply(['job-live'])).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
    vi.useFakeTimers();
    try {
      const publish = vi.fn();
      const stop = picker.subscribe!(publish);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(publish).not.toHaveBeenCalled();
      stop();
    } finally {
      vi.useRealTimers();
    }

    context.session = session;
    const previous = `${root}-previous`;
    fs.renameSync(root, previous);
    fs.mkdirSync(root);
    expect(picker.isCurrent?.()).toBe(false);
    fs.rmSync(previous, { recursive: true, force: true });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
