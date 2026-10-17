import { afterEach, expect, it, vi } from 'vitest';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { JobsComposition, JobsInstallation } from '../jobs/model.js';
import { jobsInstallations } from '../jobs/state.js';
import { closeJobsFor } from './jobs.js';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture(overrides: Record<string, unknown> = {}) {
  const context = {} as ShellRuntimeContext;
  const registry = { close: vi.fn(async () => {}), hasLive: () => false, ...overrides };
  const agents = { close: vi.fn(async () => {}), drain: vi.fn(async () => {}), hasLive: () => false };
  const dags = { close: vi.fn(async () => {}), drain: vi.fn(async () => {}), hasLive: () => false };
  const host = { registry, agents, dags, jobs: { read: () => ({ local: [], agents: [], dags: [] }) } } as unknown as JobsComposition;
  const installed = { hosts: new Map([['host', host]]), retiring: new Set(), closing: false } as JobsInstallation;
  jobsInstallations.set(context, installed);
  return { context, installed, host, registry, agents, dags };
}

it('strictly drains each inner owner before releasing the installed job boundary', async () => {
  const f = fixture(); let release!: () => void;
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  f.agents.drain.mockImplementation(() => new Promise(resolve => { release = resolve; entered(); }));
  const close = closeJobsFor(f.context, true);
  await started;
  expect(jobsInstallations.get(f.context)).toBe(f.installed); expect(f.installed.closing).toBe(true);
  release(); await close;
  expect(jobsInstallations.has(f.context)).toBe(false);
});

it.each(['rejected', 'pending', 'inner-pending'])('retains a closed owner and rejects handoff after %s cleanup', async kind => {
  vi.useFakeTimers(); const f = fixture();
  if (kind === 'rejected') f.registry.close.mockRejectedValue(new Error('unverified native cleanup'));
  if (kind === 'pending') f.registry.close.mockImplementation(() => new Promise(() => {}));
  if (kind === 'inner-pending') f.agents.drain.mockImplementation(() => new Promise(() => {}));
  const close = closeJobsFor(f.context, true); const rejected = expect(close).rejects.toThrow('verified drain');
  await vi.advanceTimersByTimeAsync(3000); await rejected;
  expect(jobsInstallations.get(f.context)).toBe(f.installed); expect(f.installed.closing).toBe(true);
});

it('rejects an unknown final status for a job that was live before cleanup', async () => {
  const f = fixture({ hasLive: () => true });
  f.host.jobs.read = () => ({ local: [{ id: 'live', status: 'unknown' }] }) as never;
  await expect(closeJobsFor(f.context, true)).rejects.toThrow('verified drain');
  expect(jobsInstallations.get(f.context)).toBe(f.installed);
});
