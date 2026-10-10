import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../../session/SessionManager.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import { AgentSessions } from '../../../cli/jobs/agent/session.js';
import { JobStore } from '../store.js';
import { AgentJournal } from './journal.js';
import { AgentService } from './service.js';
import type { AgentRuntime } from './model.js';
import { LocalJournal } from '../local/journal.js';

let scratch: string; let manager: SessionManager; let session: Session; let journal: AgentJournal; let service: AgentService;
let blocked: boolean; let dispatches: number;
function runtime(run: AgentRuntime['run']): AgentRuntime {
  const children = new AgentSessions(manager, session);
  return { admission: () => blocked ? 'revoked' : undefined, preflight: children.preflight.bind(children),
    childAdmission: child => { try { children.read(child); return undefined; } catch { return 'child unavailable'; } },
    createChild: children.create.bind(children), checkpoint: children.checkpoint.bind(children),
    run: async input => { dispatches++; return run(input); } };
}
beforeEach(() => {
  scratch = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/agent-service-'));
  const root = path.join(scratch, 'project'); fs.mkdirSync(path.join(root, '.git'), { recursive: true }); const home = path.join(scratch, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  manager = new SessionManager(); session = manager.createNew(root); journal = new AgentJournal(new JobStore(manager, () => session)); service = new AgentService(journal);
  blocked = false; dispatches = 0;
});
afterEach(async () => { await service.close(); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });
it('establishes a permanent run fence before invoking the native runner and refuses restored replay', async () => {
  const host = runtime(async input => {
    expect(journal.get(input.job.id).runs.at(-1)).toMatchObject({ id: input.run.id, dispatchPossible: true });
    return { status: 'completed', checkpoint: input.run.checkpoint };
  });
  const job = service.create('Approved task', { kind: 'local' }, host); await service.drain();
  expect(journal.get(job.id).status).toBe('completed');
  const restarted = new AgentService(journal); expect(restarted.hasLive(job.id)).toBe(false);
  expect(() => restarted.start(journal.get(job.id), host)).toThrow(); expect(dispatches).toBe(1);
});
it('waits for actual cleanup before claiming pause and permits only a fresh continuation run', async () => {
  let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
  let ready!: () => void; const began = new Promise<void>(resolve => { ready = resolve; });
  const host = runtime(async input => { ready(); await hold; return { status: 'failed', checkpoint: input.run.checkpoint }; });
  const job = service.create('Held task', { kind: 'local' }, host); await began;
  let finished = false; const stopping = service.stop(journal.get(job.id), true).then(value => { finished = true; return value; });
  await Promise.resolve(); expect(finished).toBe(false); expect(journal.get(job.id).status).toBe('running'); release();
  expect(await stopping).toBe(true); const paused = journal.get(job.id); expect(paused.status).toBe('paused');
  expect(() => service.start(paused, host)).toThrow();
  service.start(paused, runtime(async input => ({ status: 'completed', checkpoint: input.run.checkpoint })), 'A new explicit instruction');
  await service.drain(); expect(journal.get(job.id).runs).toHaveLength(2); expect(journal.get(job.id).runs[0]!.status).toBe('paused');
});
it('retains unknown cleanup, refuses replay and preserves the shared admission reservation', async () => {
  const host = runtime(async () => ({ status: 'unknown' })); const job = service.create('Uncertain task', { kind: 'local' }, host);
  await service.drain(); const unknown = journal.get(job.id); expect(unknown).toMatchObject({ status: 'unknown', output: 'unknown' });
  expect(() => service.start(unknown, host, 'Continue')).toThrow(); expect(await service.stop(unknown)).toBe(false);
  const queued = service.create('Second intent', { kind: 'local' }, host, true); expect(queued.status).toBe('queued');
  expect(() => service.create('Third intent', { kind: 'local' }, host, true)).toThrow(); expect(dispatches).toBe(1);
});
it('refuses a revoked admission before creating a child and prevents run-record replacement', async () => {
  const host = runtime(async input => ({ status: 'completed', checkpoint: input.run.checkpoint })); blocked = true;
  expect(() => service.create('Denied', { kind: 'local' }, host)).toThrow(); expect(manager.listSessions()).toHaveLength(1); expect(journal.list()).toHaveLength(0);
  blocked = false; const job = service.create('Allowed', { kind: 'local' }, host); await service.drain(); const complete = journal.get(job.id);
  expect(() => journal.change(complete, { runs: [] })).toThrow();
  expect(() => journal.change(complete, { runs: [{ ...complete.runs[0]!, dispatchPossible: false }] })).toThrow();
  expect(journal.get(job.id).runs[0]!.dispatchPossible).toBe(true);
});

it('rejects oversized context before any fork and never retries an uncertain child creation', () => {
  const host = runtime(async () => ({ status: 'completed' }));
  manager.addTurn(session.id, { role: 'user', content: 'x'.repeat(2 * 1024 * 1024 + 1) });
  for (let i = 0; i < 3; i++) expect(() => service.create('Too large', { kind: 'local' }, host)).toThrow('retained input limit');
  expect(journal.list()).toHaveLength(0); expect(manager.listSessions()).toHaveLength(1);
  const other = manager.createNew(session.projectRoot); session = other;
  journal = new AgentJournal(new JobStore(manager, () => session)); service = new AgentService(journal);
  const valid = runtime(async () => ({ status: 'completed' }));
  const broken = { ...valid, createChild: (id: string) => { valid.createChild(id); throw new Error('After persisted fork'); } };
  expect(() => service.create('Uncertain fork', { kind: 'local' }, broken)).toThrow('After persisted fork');
  const uncertain = journal.list()[0]!;
  expect(uncertain).toMatchObject({ status: 'unknown', output: 'unknown', runs: [] });
  expect(manager.getSession(uncertain.childSessionId)?.parentSession).toBe(session.id);
  expect(() => service.start(uncertain, valid)).toThrow();
  expect(() => new AgentService(journal).start(uncertain, valid)).toThrow();
  expect(manager.listSessions()).toHaveLength(3); expect(dispatches).toBe(0);
});

it('reserves full bounded output beside immutable run metadata before dispatch', () => {
  const local = new LocalJournal(journal.store, () => ({ kind: 'local' }), () => () => undefined);
  for (let i = 0; i < 2; i++) { const id = local.create({ command: 'held', cwd: session.projectRoot }); local.arm(id); local.started(id); }
  let job = service.create('p'.repeat(16384), { kind: 'local' }, runtime(async () => ({ status: 'completed' })), true);
  let denied = false;
  for (let i = 0; i < 16; i++) {
    const before = journal.get(job.id);
    try { job = journal.arm(before, before.checkpoint!, 'p'.repeat(16384)); }
    catch (error) { expect(error).toMatchObject({ code: 'capacity' }); expect(journal.get(job.id)).toEqual(before); denied = true; break; }
    journal.append(job.id, job.runs.at(-1)!.id, '\x01'.repeat(65536));
    expect(Buffer.byteLength(journal.get(job.id).text)).toBe(65536);
    job = journal.settle(job.id, job.runs.at(-1)!.id, 'completed', job.checkpoint);
  }
  expect(denied).toBe(true); expect(job.runs.length).toBeGreaterThan(0); expect(dispatches).toBe(0);
});

it('aborts the exact live owner when its child binding disappears', async () => {
  let began!: () => void; const ready = new Promise<void>(resolve => { began = resolve; });
  const host = runtime(async input => { began(); await new Promise<void>(resolve => input.signal.addEventListener('abort', () => resolve(), { once: true })); return { status: 'unknown' }; });
  const job = service.create('Held child', { kind: 'local' }, host); await ready;
  manager.deleteSession(job.childSessionId);
  await service.drain();
  expect(service.hasLive(job.id)).toBe(false); expect(journal.get(job.id)).toMatchObject({ status: 'unknown', output: 'unknown' });
});
