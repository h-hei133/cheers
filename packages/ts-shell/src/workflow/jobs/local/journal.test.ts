import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../../session/SessionManager.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import { createDefaultExecutionService } from '../../../runtime/execution/service.js';
import type { CommandExecutionResult } from '../../../runtime/execution/types.js';
import { JobStore } from '../store.js';
import { LocalJournal } from './journal.js';
import { TaskRegistry } from './registry.js';
import { localPage } from '../../../cli/jobs/projection.js';

let scratch: string; let root: string; let manager: SessionManager; let session: Session; let store: JobStore;
const owners: TaskRegistry[] = [];
const result = (status: CommandExecutionResult['status'], exitCode: number | null, terminationFailed?: true) =>
  ({ status, exitCode, stdout: '', stderr: '', terminationFailed } as CommandExecutionResult);
beforeEach(() => {
  scratch = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/jobs-local-')); root = path.join(scratch, 'project');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true }); const home = path.join(scratch, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  manager = new SessionManager(); session = manager.createNew(root); store = new JobStore(manager, () => session);
});
afterEach(async () => { await Promise.all(owners.splice(0).map(owner => owner.close())); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });
function journal(selected = store, admission: () => string | undefined = () => undefined): LocalJournal {
  return new LocalJournal(selected, () => ({ kind: 'local' }), () => admission);
}
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!check()) { if (Date.now() > deadline) throw new Error('Local job did not settle.'); await new Promise(resolve => setTimeout(resolve, 10)); }
}

it('persists the fence before a real child starts and never replays that ID after restart', async () => {
  const local = journal(); const native = createDefaultExecutionService();
  const launch = vi.fn(request => {
    expect(store.read().local?.[0]).toMatchObject({ dispatchPossible: true, status: 'unknown' });
    return native.runCommand(request);
  });
  const owner = new TaskRegistry({ runCommand: launch }, local); owners.push(owner);
  const task = owner.start({ command: 'printf once >> once.txt; printf "中🙂"; exit 3', cwd: root });
  await until(() => !owner.hasLive(task.id));
  expect(local.get(task.id)).toMatchObject({ status: 'failed', exitCode: 3, output: 'complete' });
  expect(owner.get(task.id)?.output).toContain('中🙂'); expect(fs.readFileSync(path.join(root, 'once.txt'), 'utf8')).toBe('once');
  const restarted = journal(); const reader = new TaskRegistry({ runCommand: launch }, restarted); owners.push(reader);
  expect(reader.get(task.id)).toMatchObject({ state: 'exited', exitCode: 3 });
  expect(() => restarted.adopt(task.id)).toThrow(/conflict/);
  expect(() => reader.resume(task.id, { command: task.command, cwd: root })).toThrow(/undispatched/);
  expect(launch).toHaveBeenCalledTimes(1); expect(await reader.stop(task.id)).toBe(false);
});

it('adopts a foreground child and promotes it without a second spawn', async () => {
  const local = journal();
  const owner = new TaskRegistry({ runCommand: vi.fn() }, local); owners.push(owner);
  const { startStreamed } = await import('../../../runtime/execution/local.js');
  const { handle } = startStreamed({ command: process.execPath,
    args: ['-e', 'setTimeout(() => { console.log("adopted"); process.exit(0) }, 250)'], cwd: root, onOutput: () => {} });
  const task = owner.adopt(handle, { command: 'adopted-command', cwd: root });
  expect(task.pid).toBe(handle.pid);
  expect(local.list()).toEqual([]);
  expect(owner.promote(task.id)).toBe(true);
  expect(local.get(task.id)).toMatchObject({ status: 'running' });
  await until(() => !owner.hasLive(task.id));
  expect(local.get(task.id)).toMatchObject({ status: 'completed', output: 'complete' });
  expect(handle.pid).toBe(task.pid);
});

it('refuses promotion when the journal is at capacity and kills the provisional child', async () => {
  const local = journal();
  const owner = new TaskRegistry({ runCommand: vi.fn() }, local); owners.push(owner);
  const { startStreamed } = await import('../../../runtime/execution/local.js');
  const make = () => startStreamed({ command: process.execPath, args: ['-e', 'setTimeout(() => {}, 5000)'], cwd: root, onOutput: () => {} }).handle;
  const first = owner.adopt(make(), { command: 'first', cwd: root });
  const second = owner.adopt(make(), { command: 'second', cwd: root });
  const third = owner.adopt(make(), { command: 'third', cwd: root });
  expect(owner.promote(first.id)).toBe(true);
  expect(owner.promote(second.id)).toBe(true);
  expect(owner.promote(third.id)).toBe(false);
  await until(() => !owner.hasLive(third.id));
  await owner.stop(first.id); await owner.stop(second.id);
});

it('resumes only freshly admitted undispatched intent, preserves cwd and keeps unrelated sessions separate', async () => {
  const subdir = path.join(root, 'child'); fs.mkdirSync(subdir); const queued = journal();
  const id = queued.create({ command: 'pwd', cwd: subdir }); queued.pause(id);
  const restarted = journal(); expect(restarted.get(id)).toMatchObject({ status: 'paused', directory: { path: subdir } });
  const runCommand = vi.fn(async () => result('completed', 0));
  const owner = new TaskRegistry({ runCommand }, restarted); owners.push(owner);
  restarted.adopt(id);
  expect(() => owner.resume(id, { command: 'different', cwd: subdir })).toThrow(/changed/);
  expect(() => owner.resume(id, { command: 'pwd', cwd: root })).toThrow(/changed/);
  owner.resume(id, { command: 'pwd', cwd: subdir }); await until(() => !owner.hasLive(id));
  expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({ cwd: subdir }));
  const other = manager.createNew(root); const foreign = new TaskRegistry(undefined, journal(new JobStore(manager, () => other))); owners.push(foreign);
  expect(foreign.list()).toHaveLength(0); expect(foreign.get(id)).toBeUndefined(); expect(await foreign.stop(id)).toBe(false);
});

it('retains exact native bytes across split UTF-8 chunks and an incomplete final sequence', async () => {
  const local = journal(); const bytes = Buffer.concat([Buffer.from('中🙂'), Buffer.from([0xf0, 0x9f])]);
  const owner = new TaskRegistry({ runCommand: async request => {
    request.onStarted?.(12345);
    await request.onStdout?.(bytes.subarray(0, 4));
    await request.onStdout?.(bytes.subarray(4));
    return result('completed', 0);
  } }, local); owners.push(owner);
  const task = owner.start({ command: 'synthetic byte stream', cwd: root });
  await until(() => !owner.hasLive(task.id));
  expect(Buffer.from(local.get(task.id).stdout, 'base64')).toEqual(bytes);
  expect(owner.get(task.id)?.output).toBe('中🙂�');
  expect(localPage(local.get(task.id), 'stdout', 0)).toContain('next byte 9/9');
});

it.each(['中', '🙂'])('keeps the live journal cursor before an unfinished %s character', character => {
  const local = journal(); const id = local.create({ command: 'incremental byte stream', cwd: root });
  local.arm(id); local.started(id);
  const prefix = Buffer.from('x'.repeat(16383)); const encoded = Buffer.from(character);
  local.output(id, 'stdout', Buffer.concat([prefix, encoded.subarray(0, 1)]));
  const first = localPage(local.get(id), 'stdout', 0);
  expect(first).toContain('next byte 16383/16384');
  expect(first.slice(first.indexOf('\n') + 1)).toBe(prefix.toString());
  for (let index = 1; index < encoded.length - 1; index++) {
    local.output(id, 'stdout', encoded.subarray(index, index + 1));
    const pending = localPage(local.get(id), 'stdout', 16383);
    expect(pending).toContain(`next byte 16383/${16384 + index}`);
    expect(pending).not.toContain('�');
  }
  local.output(id, 'stdout', Buffer.concat([encoded.subarray(-1), Buffer.from('tail')]));
  const last = localPage(local.get(id), 'stdout', 16383);
  expect(last.slice(last.indexOf('\n') + 1)).toBe(character + 'tail');
  expect(Buffer.from(local.get(id).stdout, 'base64')).toEqual(Buffer.concat([prefix, encoded, Buffer.from('tail')]));
});

it('does not claim cancellation until the native owner settles and preserves failed cleanup as unknown', async () => {
  const local = journal(); let settle!: (value: CommandExecutionResult) => void;
  const owner = new TaskRegistry({ runCommand: vi.fn(request => {
    request.onStarted?.(12345); return new Promise(resolve => { settle = resolve; });
  }) }, local); owners.push(owner);
  const task = owner.start({ command: 'held', cwd: root }); let stopped = false;
  const pending = owner.stop(task.id).then(value => { stopped = true; return value; });
  await Promise.resolve(); expect(stopped).toBe(false); expect(local.get(task.id).status).toBe('running');
  settle(result('failed', null, true)); expect(await pending).toBe(false);
  expect(local.get(task.id)).toMatchObject({ status: 'unknown', dispatchPossible: true, output: 'unknown' });
  expect(() => journal().adopt(task.id)).toThrow(/conflict/);
});

it('reports successful native cancellation after releasing the live handle and retains its durable result', async () => {
  const local = journal(); const owner = new TaskRegistry(undefined, local); owners.push(owner);
  const task = owner.start({ command: 'sleep 200 & wait', cwd: root });
  await until(() => owner.get(task.id)?.state === 'running');
  expect(await owner.stop(task.id)).toBe(true);
  expect(owner.hasLive(task.id)).toBe(false);
  expect(local.get(task.id)).toMatchObject({ status: 'cancelled', dispatchPossible: true, output: 'interrupted' });
  expect(owner.get(task.id)).toMatchObject({ state: 'killed' });
});

it('bounds persistent streams, redacts complete context before byte paging and cannot revive revoked ownership', () => {
  let revoked = false; const local = journal(store, () => revoked ? 'revoked' : undefined);
  const id = local.create({ command: 'synthetic', cwd: root }); local.arm(id); local.started(id);
  const secret = 'fixture-only-secret';
  local.output(id, 'stdout', Buffer.from('Authorization: Bearer ' + 'x'.repeat(16370) + secret + '\n中🙂'));
  const page = localPage(local.get(id), 'stdout', 16384);
  expect(page).toContain('withheld'); expect(page).not.toContain(secret);
  local.output(id, 'stderr', Buffer.alloc(200000, 'x'));
  expect(Buffer.from(local.get(id).stderr, 'base64')).toHaveLength(65536); expect(local.get(id).truncated).toBe(true);
  const cancelled = local.create({ command: 'never', cwd: root }); local.cancelIntent(cancelled);
  expect(local.get(cancelled)).toMatchObject({ status: 'cancelled', dispatchPossible: false });
  revoked = true; expect(() => local.create({ command: 'denied', cwd: root })).toThrow(/unavailable/);
  expect(local.admission(id)).toBe('revoked'); expect(() => local.output(id, 'stdout', Buffer.from('late'))).toThrow(/unavailable/);
  expect(local.get(id).dispatchPossible).toBe(true);
});

it('retains unknown when native invocation throws synchronously and detects cwd replacement', async () => {
  const local = journal(); const owner = new TaskRegistry({ runCommand: () => { throw new Error('Synthetic unavailable runner'); } }, local); owners.push(owner);
  const task = owner.start({ command: 'never confirmed', cwd: root }); await until(() => !owner.hasLive(task.id));
  expect(local.get(task.id)).toMatchObject({ status: 'unknown', dispatchPossible: true });
  const subdir = path.join(root, 'subdir'); fs.mkdirSync(subdir); const id = local.create({ command: 'queued', cwd: subdir });
  fs.renameSync(subdir, subdir + '-old'); fs.mkdirSync(subdir);
  expect(local.admission(id)).toContain('no current bound'); expect(() => local.arm(id)).toThrow(/unavailable/);
  expect(local.get(id).dispatchPossible).toBe(false);
});
