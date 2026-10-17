import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProfileContext, withProfile, type ProfileContext } from '../../../core/paths/profile/context.js';
import { SessionManager } from '../../../session/SessionManager.js';
import type { ProfileSwitchPort } from '../../../core/commands/profile/contract.js';
import { profileSwitchPort } from './port.js';
import { freshExecutable, freshInvocation } from './invocation.js';
import { drainProfileSwitch, launchProfileSwitch } from './handoff.js';
import { changeSwitch, readSwitch } from './store.js';
import { claimSwitchChild, admitSwitchChild } from './admission.js';
import { switchArgs, type SwitchTicket } from './model.js';
import type { CommandExecutionResult, CommandExecutionRequest } from '../../../runtime/execution/types.js';

let home: string; let workspace: string; let source: ProfileContext; let target: ProfileContext; let ticket: SwitchTicket | undefined;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-handoff-'));
  workspace = path.join(home, 'workspace'); fs.mkdirSync(workspace);
  source = createProfileContext({ name: 'source', homeDir: home, env: {} }); target = createProfileContext({ name: 'target', homeDir: home, env: {} }); ticket = undefined;
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(home, { recursive: true, force: true }); });
function port(overrides: Partial<Parameters<typeof profileSwitchPort>[0]> = {}): ProfileSwitchPort {
  return profileSwitchPort({ source, interactive: true, depth: 0, current: () => ({ sessionId: 'source-session', generation: 'generation-0', workspace, cwd: workspace, offline: true }),
    busy: () => false, pending: () => ticket !== undefined, admission: () => undefined, executableAvailable: () => {}, retire: value => { ticket = value; }, ...overrides });
}
async function prepare() {
  const owner = port(); const preview = await owner.request({ target: 'target', sessionId: 'source-session' });
  if (preview.status !== 'preview') throw new Error('Missing preview.');
  expect(fs.readdirSync(target.root)).toEqual([]); expect(fs.readdirSync(source.root)).toEqual([]);
  expect((await owner.request({ target: 'target', sessionId: 'source-session', confirmation: preview.digest })).status).toBe('requested');
  return ticket!;
}
const executable = { command: process.execPath, prefix: ['/known/cli.js'] };
const settled = { status: 'completed', exitCode: 0 } as CommandExecutionResult;

it('refuses busy, noninteractive, cancelled, duplicate and stale source requests before retiring', async () => {
  const controller = new AbortController(); controller.abort();
  for (const owner of [port({ interactive: false }), port({ busy: () => true }), port({ pending: () => true }), port({ admission: () => 'stale' })]) {
    expect((await owner.request({ target: 'target', sessionId: 'source-session' })).status).toBe('unavailable');
  }
  expect((await port().request({ target: 'target', sessionId: 'source-session', signal: controller.signal })).status).toBe('unavailable');
  expect((await port().request({ target: 'target', sessionId: 'other-session' })).status).toBe('unavailable');
  expect(ticket).toBeUndefined(); expect(fs.readdirSync(source.root)).toEqual([]);
  await prepare(); expect((await port().request({ target: 'target', sessionId: 'source-session' })).status).toBe('unavailable');
});

it('requires successful drain before dispatch and keeps failed cleanup unknown', async () => {
  const request = await prepare(); const runCommand = vi.fn();
  expect((await launchProfileSwitch(request, { executable, env: {}, execution: { runCommand } })).status).toBe('unknown');
  expect(runCommand).not.toHaveBeenCalled();
  // A separate explicit source sitting has its own operation; unknown attempts are never replayed.
  const second = createProfileContext({ name: 'second', homeDir: home, env: {} });
  ticket = undefined; const owner = port({ source: second });
  const preview = await owner.request({ target: 'target', sessionId: 'source-session' });
  if (preview.status !== 'preview') throw new Error('Missing preview.');
  await owner.request({ target: 'target', sessionId: 'source-session', confirmation: preview.digest });
  await expect(drainProfileSwitch(ticket!, async () => { throw new Error('cleanup timeout'); })).rejects.toThrow('cleanup timeout');
  expect(readSwitch(second, ticket!.operation)?.status).toBe('unknown');
  await launchProfileSwitch(ticket!, { executable, env: {}, execution: { runCommand } }); expect(runCommand).not.toHaveBeenCalled();
});

it('invalidates an old preview after a source A-to-B-to-A generation and rechecks after asynchronous drain', async () => {
  let generation = 0;
  const owner = port({ current: () => ({ sessionId: 'source-session', workspace, cwd: workspace, offline: true, generation: String(generation) }) });
  const preview = await owner.request({ target: 'target', sessionId: 'source-session' });
  if (preview.status !== 'preview') throw new Error('Missing preview.');
  generation += 2;
  expect((await owner.request({ target: 'target', sessionId: 'source-session', confirmation: preview.digest })).status).toBe('unavailable');
  expect(ticket).toBeUndefined(); expect(fs.readdirSync(source.root)).toEqual([]);
  const current = await owner.request({ target: 'target', sessionId: 'source-session' });
  if (current.status !== 'preview') throw new Error('Missing current preview.');
  await owner.request({ target: 'target', sessionId: 'source-session', confirmation: current.digest });
  await expect(drainProfileSwitch(ticket!, async () => { generation++; })).rejects.toThrow('generation');
  const runCommand = vi.fn();
  expect((await launchProfileSwitch(ticket!, { executable, env: {}, execution: { runCommand } })).status).toBe('unknown');
  expect(runCommand).not.toHaveBeenCalled();
});

it('bounds retained supervisors before preparing or retiring, including malformed depths', async () => {
  for (const depth of [-1, 1.5, 8, 9, Number.NaN]) {
    expect((await port({ depth }).request({ target: 'target', sessionId: 'source-session' })).status).toBe('unavailable');
  }
  expect(ticket).toBeUndefined(); expect(fs.readdirSync(source.root)).toEqual([]);
  const owner = port({ depth: 7 }); const preview = await owner.request({ target: 'target', sessionId: 'source-session' });
  if (preview.status !== 'preview') throw new Error('Missing final permitted preview.');
  expect((await owner.request({ target: 'target', sessionId: 'source-session', confirmation: preview.digest })).status).toBe('requested');
  expect(readSwitch(source, ticket!.operation)?.plan.depth).toBe(8);
});

it('launches only target argv and OS terminal environment, with no prompt, provider or loader injection', async () => {
  const request = await prepare(); const receipt = readSwitch(source, request.operation)!;
  const env = { PATH: '/safe/bin', HOME: '/source-home', USERPROFILE: '/source-home', OPENAI_API_KEY: 'synthetic-secret', AWS_ACCESS_KEY_ID: 'synthetic-aws',
    CHEERS_PROVIDER_PROXY: 'https://secret.invalid', CHEERS_REAL_PROVIDER_SMOKE: '1', NODE_OPTIONS: '--import=bad', CHEERS_LOG_DIR: '/old/log', CHEERS_PROVIDER_MODE: 'synthetic' };
  const invocation = freshInvocation(receipt, executable, env);
  expect(invocation.args).toEqual(['/known/cli.js', '--profile', 'target', '--project', workspace, '--offline']);
  expect(invocation.env).toEqual({ PATH: '/safe/bin', HOME: home, USERPROFILE: home,
    CHEERS_PROFILE_HANDOFF: `source:${request.operation}`, CHEERS_PROVIDER_MODE: 'synthetic' });
  expect(JSON.stringify(invocation)).not.toContain('synthetic-secret'); expect(env.HOME).toBe('/source-home');
  const entry = path.resolve('src/entrypoints/cli.tsx'); expect(freshExecutable(process.execPath, entry).prefix.at(-1)).toBe(entry);
  expect(() => freshExecutable(process.execPath, path.resolve('src/entrypoints/cliRuntimeInvocation.ts'))).toThrow();
});

it('accepts a child that claims before the parent PID callback, then verifies native fresh-session readback', async () => {
  const request = await prepare(); await drainProfileSwitch(request, async () => {});
  // Execute the child lane in this test process while retaining a distinct parent identity.
  changeSwitch(source, request.operation, current => ({ ...current, parentPid: process.pid + 100000 }));
  let dispatched: CommandExecutionRequest | undefined;
  const result = await launchProfileSwitch(request, { executable, env: {}, execution: { runCommand: async command => {
    dispatched = command;
    const receipt = readSwitch(source, request.operation)!;
    const child = claimSwitchChild(target, switchArgs(receipt.plan), `source:${request.operation}`)!;
    withProfile(target, () => {
      const manager = new SessionManager(); manager.createNewWithId(child.targetSessionId, workspace, { rootMode: 'direct' });
      admitSwitchChild(child, child.targetSessionId, manager.captureReportWriter(child.targetSessionId));
      manager.saveTerminated(child.targetSessionId);
      expect(manager.getSession(child.targetSessionId)?.reports?.[0]?.report?.title).toBe('Profile startup');
    });
    command.onStarted?.(process.pid);
    expect(readSwitch(source, request.operation)?.status).toBe('admitted');
    return settled;
  } } });
  expect(result.status).toBe('verified'); expect(result.sessionId).not.toBe('source-session');
  expect(dispatched).toMatchObject({ inheritTerminal: true, captureOutput: false, cleanupTreeOnExit: true });
  expect(() => claimSwitchChild(target, switchArgs(readSwitch(source, request.operation)!.plan), `source:${request.operation}`)).toThrow('stale');
});

it('does not upgrade spawning or a replaced target to verified startup, and never replays an unknown dispatch', async () => {
  const request = await prepare(); await drainProfileSwitch(request, async () => {});
  const runCommand = vi.fn(async (command: CommandExecutionRequest) => { command.onStarted?.(process.pid + 100000); return settled; });
  expect((await launchProfileSwitch(request, { executable, env: {}, execution: { runCommand } })).status).toBe('unknown');
  expect(readSwitch(source, request.operation)?.status).toBe('unknown');
  await launchProfileSwitch(request, { executable, env: {}, execution: { runCommand } }); expect(runCommand).toHaveBeenCalledOnce();
  fs.renameSync(target.root, `${target.root}-retired`); fs.mkdirSync(target.root);
  await launchProfileSwitch(request, { executable, env: {}, execution: { runCommand } }); expect(runCommand).toHaveBeenCalledOnce();
});
