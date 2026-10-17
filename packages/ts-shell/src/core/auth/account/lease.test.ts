import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { acquireRefreshLease, finishRefreshLease, markRefreshDispatched, markRefreshUnknown, readRefreshLease,
  refreshLeasesPath, refreshLineage, releaseRefreshLease } from './lease.js';

let home: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-lease-'));
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

const lineage = { provider: 'openai' as const, credentialId: 'openai:a', generation: 'gen-1', refreshToken: 'refresh-1' };

it('grants one owner per lineage and lets a released lease be taken', () => {
  const first = acquireRefreshLease({ ...lineage, owner: 'one' });
  expect(first.acquired).toBe(true);
  const second = acquireRefreshLease({ ...lineage, owner: 'two' });
  expect(second).toMatchObject({ acquired: false, holder: 'one' });
  expect(second.unknown).toBeUndefined();
  releaseRefreshLease(refreshLineage(lineage), 'one');
  expect(acquireRefreshLease({ ...lineage, owner: 'two' }).acquired).toBe(true);
});

it('refuses replay after an expired dispatch and keeps the lineage unknown', () => {
  const key = refreshLineage(lineage);
  expect(acquireRefreshLease({ ...lineage, owner: 'one' }).acquired).toBe(true);
  markRefreshDispatched(key, 'one');
  const takeover = acquireRefreshLease({ ...lineage, owner: 'two', now: Date.now() + 5 * 60_000 });
  expect(takeover).toMatchObject({ acquired: false, unknown: true, holder: 'one' });
  expect(readRefreshLease(key)?.phase).toBe('unknown');
  const later = acquireRefreshLease({ ...lineage, owner: 'three', now: Date.now() + 60 * 60_000 });
  expect(later).toMatchObject({ acquired: false, unknown: true });
});

it('takes over an expired lease that never dispatched', () => {
  expect(acquireRefreshLease({ ...lineage, owner: 'one' }).acquired).toBe(true);
  expect(acquireRefreshLease({ ...lineage, owner: 'two', now: Date.now() + 5 * 60_000 })).toMatchObject({ acquired: true });
});

it('completes by lineage generation rather than by writer', () => {
  const key = refreshLineage(lineage);
  acquireRefreshLease({ ...lineage, owner: 'leader' });
  markRefreshDispatched(key, 'leader');
  expect(() => finishRefreshLease(key, 'other-generation')).toThrow(/generation/i);
  finishRefreshLease(key, lineage.generation);
  expect(readRefreshLease(key)).toBeUndefined();
});

it('keeps an unknown outcome durable and refuses to mark it persisted', () => {
  const key = refreshLineage(lineage);
  acquireRefreshLease({ ...lineage, owner: 'one' });
  markRefreshDispatched(key, 'one');
  markRefreshUnknown(key, 'one');
  expect(readRefreshLease(key)?.phase).toBe('unknown');
  expect(() => markRefreshDispatched(key, 'two')).toThrow(/ownership/i);
});

it('serializes concurrent acquisition in one process', async () => {
  const results = await Promise.all(['one', 'two', 'three'].map(owner => Promise.resolve().then(() => acquireRefreshLease({ ...lineage, owner }))));
  expect(results.filter(result => result.acquired)).toHaveLength(1);
});

it('reports a corrupt lease file instead of treating it as empty', () => {
  fs.mkdirSync(path.dirname(refreshLeasesPath()), { recursive: true });
  fs.writeFileSync(refreshLeasesPath(), '{"version":1,"leases":{"x":{"owner":1}}}');
  expect(() => acquireRefreshLease({ ...lineage, owner: 'one' })).toThrow(/invalid entry/i);
});
