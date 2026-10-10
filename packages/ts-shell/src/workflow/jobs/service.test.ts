import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../session/SessionManager.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import type { RemoteWorkspace } from './model.js';
import { JobStore } from './store.js';
import { JobService, type RemoteJobBackend } from './service.js';

let scratch: string; let manager: SessionManager; let session: Session; let store: JobStore;
const remote: RemoteWorkspace = { profileIdentity: 'a'.repeat(64), fingerprint: 'SHA256:' + 'B'.repeat(43), root: '/remote/work',
  directoryIdentity: '1:2', uid: 1000, bootId: '11111111-1111-1111-1111-111111111111', namespace: 'c'.repeat(32) };
const authority = { mode: 'approved-for-write', source: 'tool-runtime-approval', reason: 'Exact synthetic approval' } as const;
beforeEach(() => {
  const temporary = path.resolve(process.cwd(), '../../.tmp'); fs.mkdirSync(temporary, { recursive: true });
  scratch = fs.mkdtempSync(path.join(temporary, 'jobs-test-')); const root = path.join(scratch, 'project'); const home = path.join(scratch, 'home');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true }); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  manager = new SessionManager(); session = manager.createNew(root); store = new JobStore(manager, () => session); store.connect(remote);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });
function backend(): RemoteJobBackend {
  return { identity: remote.profileIdentity, check() {}, start: vi.fn(async () => 'd'.repeat(32)),
    query: vi.fn(async () => ({ status: 'unknown', output: 'unknown' } as const)),
    cancel: vi.fn(async (_job, invocationId) => ({ invocationId, status: 'cancelled', output: 'interrupted', cancellation: 'selected-cgroup-empty' } as const)),
    output: vi.fn(async () => ({ bytes: Buffer.from('α'), nextOffset: 2, size: 2, truncated: false })) };
}
it('persists dispatch uncertainty before sending and never replays after a lost acknowledgment or restart', async () => {
  const port = backend(); port.start = vi.fn(async job => {
    expect(new JobStore(manager, () => session).get(job.id)).toMatchObject({ status: 'unknown', dispatchPossible: true });
    throw new Error('Lost transport acknowledgment');
  });
  const service = new JobService(store, port, () => undefined);
  const job = await service.run('touch remote-effect', { kind: 'local' }, authority);
  expect(job.status).toBe('unknown'); expect(port.start).toHaveBeenCalledTimes(1);
  const restarted = new JobService(new JobStore(manager, () => session), port, () => undefined);
  await expect(restarted.submit(job.id, authority)).rejects.toMatchObject({ code: 'conflict' });
  expect((await restarted.reconcile(job.id, authority)).status).toBe('unknown'); expect(port.start).toHaveBeenCalledTimes(1);
});
it('refuses unavailable authority before creating intent and retains unknown cancellation separately from transport abort', async () => {
  const port = backend(); const service = new JobService(store, port, () => undefined);
  await expect(service.run('write remote', { kind: 'local' }, { ...authority, mode: 'read-only' })).rejects.toMatchObject({ code: 'unavailable' });
  expect(store.read().jobs).toHaveLength(0);
  const job = await service.run('sleep 200', { kind: 'local' }, authority);
  const cancelled = await service.cancel(job.id, authority);
  expect(cancelled).toMatchObject({ status: 'unknown', cancellation: 'requested', dispatchPossible: true }); expect(port.cancel).not.toHaveBeenCalled();
});
it('keeps exact remote cancellation and byte pages bound to one original invocation', async () => {
  const port = backend(); port.query = vi.fn(async job => ({ invocationId: job.invocationId, status: 'running', output: 'unknown' } as const));
  const service = new JobService(store, port, () => undefined); const job = await service.run('sleep 200', { kind: 'local' }, authority);
  expect(await service.output(job.id, 'stdout', 0, authority)).toMatchObject({ nextOffset: 2, size: 2 });
  expect(await service.cancel(job.id, authority)).toMatchObject({ status: 'cancelled', invocationId: job.invocationId, output: 'interrupted', cancellation: 'selected-cgroup-empty' });
  expect(port.cancel).toHaveBeenCalledWith(expect.objectContaining({ id: job.id }), job.invocationId, authority, undefined);
});
it('retains a pinned invocation through unknown observations and refuses replacement or removal', async () => {
  const port = backend(); const service = new JobService(store, port, () => undefined);
  const job = await service.run('sleep 200', { kind: 'local' }, authority);
  port.query = vi.fn(async () => ({ invocationId: undefined, status: 'unknown', output: 'unknown' } as const));
  const unknown = await service.reconcile(job.id, authority); expect(unknown.invocationId).toBe(job.invocationId);
  expect(() => store.change(job.id, unknown, { invocationId: undefined })).toThrowError(/conflict/);
  port.query = vi.fn(async () => ({ invocationId: 'e'.repeat(32), status: 'running', output: 'unknown' } as const));
  expect((await service.reconcile(job.id, authority)).invocationId).toBe(job.invocationId);
  expect(port.query).toHaveBeenCalledWith(expect.anything(), job.invocationId, authority, undefined);
  await service.cancel(job.id, authority); expect(port.cancel).not.toHaveBeenCalled();
});
it.each(['reconcile', 'cancel', 'output'] as const)('fences a workspace rebind during an awaited %s operation at service and store owners', async operation => {
  const port = backend(); const service = new JobService(store, port, () => undefined);
  const job = await service.run('sleep 200', { kind: 'local' }, authority);
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  port.query = vi.fn(async () => { await held; return { invocationId: job.invocationId, status: 'running', output: 'unknown' } as const; });
  port.output = vi.fn(async () => { await held; return { bytes: Buffer.from('late'), nextOffset: 4, size: 4, truncated: false }; });
  const pending = operation === 'output' ? service.output(job.id, 'stdout', 0, authority) : service[operation](job.id, authority);
  const before = store.get(job.id);
  rebind(); release();
  await expect(pending).rejects.toMatchObject({ code: 'detached' });
  expect(port.cancel).not.toHaveBeenCalled(); expect(store.get(job.id)).toEqual(before);
  expect(() => store.change(job.id, before, { status: 'completed' })).toThrowError(/detached/);
});
it('rejects journal payload corruption and competing state changes without discarding the original tombstone', () => {
  const job = store.create('printf ORIGINAL', { kind: 'local' });
  const updated = store.change(job.id, job, { status: 'unknown', dispatchPossible: true, output: 'unknown' });
  expect(() => store.change(job.id, job, { status: 'cancelled' })).toThrowError(/conflict/);
  expect(() => store.change(job.id, updated, { dispatchPossible: false })).toThrowError(/conflict/);
  const file = path.join(manager.getSessionDirPath(session.id), 'state.json'); const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  saved.jobs.jobs[0].command = 'printf REPLACED'; fs.writeFileSync(file, JSON.stringify(saved));
  expect(() => store.read()).toThrowError(/invalid/);
});
it('bounds active unknown jobs and preserves old workspace intent without authorizing it after a rebind', async () => {
  const service = new JobService(store, backend(), () => undefined);
  const first = await service.run('sleep 1', { kind: 'local' }, authority); await service.run('sleep 2', { kind: 'local' }, authority);
  await expect(service.run('sleep 3', { kind: 'local' }, authority)).rejects.toMatchObject({ code: 'capacity' });
  rebind();
  expect(store.get(first.id).dispatchPossible).toBe(true);
  await expect(service.reconcile(first.id, authority)).rejects.toMatchObject({ code: 'detached' });
});
function rebind(): void {
  const other = path.join(scratch, 'other'); fs.mkdirSync(path.join(other, '.git'), { recursive: true });
  // Model another publisher rebinding the same durable session while an SSH observation is held.
  const directory = manager.getSessionDirPath(session.id);
  for (const name of ['metadata.json', 'state.json']) { const file = path.join(directory, name); const value = JSON.parse(fs.readFileSync(file, 'utf8')); value.projectRoot = other; fs.writeFileSync(file, JSON.stringify(value)); }
  session = { ...session, projectRoot: other };
}
