import os from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { createProcessOwner, processOwnerDisposition } from './owner.js';
import { createRunOwner, ownerDisposition } from '../../planning/goal/run/owner.js';

afterEach(() => vi.restoreAllMocks());

it('uses the same neutral process owner through supported goal-owner imports', () => {
  expect(createRunOwner).toBe(createProcessOwner); expect(ownerDisposition).toBe(processOwnerDisposition);
  expect(createProcessOwner()).toMatchObject({ pid: process.pid, hostname: os.hostname() });
});

it('does not treat foreign host or EPERM as evidence of process death', () => {
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); });
  const owner = createProcessOwner(); expect(processOwnerDisposition({ ...owner, hostname: `${owner.hostname}-foreign` })).toBe('unknown');
  expect(kill).not.toHaveBeenCalled(); expect(processOwnerDisposition(owner)).toBe('unknown');
});

it('requires ESRCH on the matching host to prove death and keeps a real live owner live', () => {
  const owner = createProcessOwner(); expect(processOwnerDisposition(owner)).toBe('live');
  vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); });
  expect(processOwnerDisposition(owner)).toBe('dead');
});
