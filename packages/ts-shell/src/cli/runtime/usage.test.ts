import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { getRuntimeConfig, type RuntimeConfigFile } from '../../config/runtimeConfig.js';
import { SessionManager } from '../../session/SessionManager.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { routeSlashCommand } from '../../core/commands/slashRouter.js';
import { installUsageRuntime, usageCommandFor, usageResetApproval } from './usage.js';
import { readResetAttempts, updateResetAttempts } from '../usage/state.js';
import { hashContent } from '../../core/workspace/files.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import * as network from '../../core/network/connection.js';

let scratch: string; let root: string; let home: string; let configPath: string;
const accountId = 'synthetic-account';
const accountKey = hashContent(`openai\0${accountId}`);
const credit = { id: 'credit-first', status: 'available', reset_type: 'codex_rate_limits', expires_at: '2030-01-01T00:00:00.000Z' };
function writeConfig(change: Partial<RuntimeConfigFile> = {}) {
  fs.writeFileSync(configPath, JSON.stringify({ provider: 'openai', activeProviderConnectionId: 'selected', providerConnections: [{ id: 'selected', provider: 'openai',
    authType: 'account-auth', baseUrl: 'https://endpoint.example.invalid/v1', status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01',
    accountAuth: { openai: { type: 'openai-chatgpt-account', accessToken: 'SYNTHETIC_ACCOUNT_TOKEN', refreshToken: 'SYNTHETIC_REFRESH_TOKEN', accountId, expiresAt: Date.now() + 3600000 } } }], ...change }));
}
function harness(options: { decision?: 'allow-once' | 'allow-always' | 'deny'; mode?: 'plan' | 'build'; denied?: boolean; deniedTool?: string; onGate?: () => void; onApproval?: () => void; onEmit?: ToolGateOptions['emit']; missingApproval?: boolean } = {}) {
  const manager = new SessionManager(); const session = manager.createNew(root);
  const context = createShellRuntimeContext({ cwd: root, projectRoot: root, originalCwd: root, rootMode: 'direct', targetPathBase: root,
    gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root), session });
  const approval = vi.fn(async prompt => { options.onApproval?.(); return { promptId: prompt.id, decision: options.decision ?? 'allow-once', respondedAt: Date.now() }; });
  const hooks = new HookDispatcher(); const emit = vi.fn((event: Parameters<ToolGateOptions['emit']>[0]) => options.onEmit?.(event));
  installUsageRuntime(context, () => { options.onGate?.(); return { workspaceRoot: root, sessionId: session.id, agentMode: options.mode ?? 'build', permissionScope: 'allow-all',
    hooks, denyRules: options.denied || options.deniedTool ? [{ tool: options.deniedTool ?? 'account_reset' }] : [], emit,
    escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision: 'allow-always' as const, respondedAt: Date.now() }) }; },
    options.missingApproval ? undefined : usageResetApproval(context, manager, () => approval));
  const command = { cwd: root, projectRoot: root, sessionId: session.id, interactive: true, usageCommand: usageCommandFor(context) };
  return { manager, session, context, command, approval, hooks, emit, run: (input: string) => routeSlashCommand(input, command) };
}
function protocol(options: { code?: string; creditReply?: unknown; creditStatus?: number; consumeThrows?: boolean; consume?: () => Promise<Response> } = {}) {
  const calls: { url: string; init: network.PublicRequest }[] = [];
  const request = vi.spyOn(network, 'requestPublic').mockImplementation(async (url, init, scope) => {
    scope.check(); calls.push({ url, init });
    expect(new URL(url).origin).toBe('https://chatgpt.com');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer SYNTHETIC_ACCOUNT_TOKEN', 'ChatGPT-Account-Id': accountId });
    if (url.endsWith('/consume')) {
      if (options.consume) return options.consume();
      if (options.consumeThrows) throw new Error('SYNTHETIC_PRIVATE_RESPONSE_BODY');
      return new Response(JSON.stringify(options.code === undefined ? {} : { code: options.code }));
    }
    if (url.endsWith('/wham/usage')) return new Response(JSON.stringify({ rate_limit: {
      primary_window: { used_percent: 25, reset_at: 1800000000 }, secondary_window: { used_percent: 40 } } }));
    return new Response(JSON.stringify(options.creditReply ?? { available_count: 2, credits: [
      { ...credit, id: 'credit-later', expires_at: '2031-01-01T00:00:00.000Z' }, credit] }), { status: options.creditStatus ?? 200 });
  });
  return { calls, request, posts: () => calls.filter(call => call.init.method === 'POST') };
}
async function prepare(setup: ReturnType<typeof harness>) {
  const preview = await setup.run('/usage reset');
  expect(preview).toMatchObject({ kind: 'local', output: expect.stringContaining('Nothing was consumed') });
  const id = /Preview ([a-f0-9-]+):/.exec((preview as { output: string }).output)?.[1];
  expect(id).toBeDefined(); return id!;
}
beforeEach(() => {
  const base = path.resolve('../../.tmp'); fs.mkdirSync(base, { recursive: true }); scratch = fs.mkdtempSync(path.join(base, 'usage-test-'));
  root = path.join(scratch, 'workspace'); home = path.join(scratch, 'home');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true }); fs.mkdirSync(path.join(home, '.cheers'), { recursive: true });
  configPath = path.join(home, '.cheers', 'config.json');
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('OPENAI_API_KEY', ''); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch); writeConfig();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });

it('uses the real usage route, shows source/time and explicitly approves the exact earliest credit before one confirmed consume', async () => {
  const setup = harness(); const remote = protocol({ code: 'reset' });
  const inspected = await setup.run('/usage account');
  expect(inspected).toMatchObject({ kind: 'local', output: expect.stringContaining('primary: 25% used') });
  expect((inspected as { output: string }).output).toContain('Fetched:'); expect((inspected as { output: string }).output).toContain('https://chatgpt.com/backend-api/wham/usage');
  const id = await prepare(setup); expect(remote.posts()).toEqual([]); expect(setup.approval).not.toHaveBeenCalled();
  const applied = await setup.run(`/usage reset apply ${id}`);
  expect(applied).toMatchObject({ kind: 'local', output: expect.stringContaining(': reset (reset)') });
  expect(setup.approval).toHaveBeenCalledOnce(); expect(setup.approval.mock.calls[0]![0].context.preview).toContain(`account ${accountId}`);
  expect(setup.approval.mock.calls[0]![0].context.preview).toContain('credit-first');
  expect(setup.approval.mock.calls[0]![0].options.map(option => option.value)).not.toContain('allow-always');
  expect(remote.posts()).toHaveLength(1);
  expect(JSON.parse(remote.posts()[0]!.init.body!)).toEqual({ account_id: accountId, credit_id: 'credit-first', redeem_request_id: id });
  expect(readResetAttempts(accountKey)[0]).toMatchObject({ id, status: 'reset', code: 'reset' });
  const receiptFile = path.join(home, '.cheers/accounts/resets', `${accountKey}.json`);
  expect(fs.readFileSync(receiptFile, 'utf8')).not.toMatch(/SYNTHETIC_(?:ACCOUNT|REFRESH)_TOKEN/);
  const replay = await setup.run(`/usage reset apply ${id}`); expect(replay).toMatchObject({ kind: 'local', output: expect.stringContaining('unavailable') });
  expect(remote.posts()).toHaveLength(1);
});

it.each(['denied', 'allow-always', 'missing-approval', 'plan', 'deny-rule', 'changed-account', 'changed-offer'])('dispatches no consume after %s', async scenario => {
  const setup = harness({ decision: scenario === 'denied' ? 'deny' : scenario === 'allow-always' ? 'allow-always' : 'allow-once', missingApproval: scenario === 'missing-approval', mode: scenario === 'plan' ? 'plan' : 'build', denied: scenario === 'deny-rule',
    onApproval: scenario === 'changed-account' ? () => writeConfig({ activeProviderConnectionId: 'another' }) : undefined });
  const remote = protocol({ code: 'reset' }); const id = await prepare(setup);
  if (scenario === 'changed-offer') remote.request.mockImplementation(async (url, _init, scope) => { scope.check(); return new Response(JSON.stringify(url.endsWith('/wham/usage')
    ? { rate_limit: { primary_window: { used_percent: 30 } } } : { available_count: 0, credits: [] })); });
  const result = await setup.run(`/usage reset apply ${id}`);
  expect((result as { output: string }).output).not.toContain(': reset (reset)'); expect(remote.posts()).toEqual([]);
  expect(readResetAttempts(accountKey)[0]?.status).toBe('prepared');
});

it.each(['missing-code', 'network-loss', 'already-redeemed'])('retains %s as unknown and fences new sessions without replay', async scenario => {
  const setup = harness(); const remote = protocol({ code: scenario === 'already-redeemed' ? 'already_redeemed' : undefined, consumeThrows: scenario === 'network-loss' });
  const id = await prepare(setup); const result = await setup.run(`/usage reset apply ${id}`);
  expect(result).toMatchObject({ kind: 'local', output: expect.stringContaining('unknown') });
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC_PRIVATE_RESPONSE_BODY');
  expect(readResetAttempts(accountKey)[0]?.status).toBe('unknown'); expect(remote.posts()).toHaveLength(1);
  const fresh = harness(); const refused = await fresh.run('/usage reset');
  expect(refused).toMatchObject({ kind: 'local', output: expect.stringContaining('pending or unknown') }); expect(remote.posts()).toHaveLength(1);
});

it.each(['no_credit', 'nothing_to_reset'])('retains the explicit %s business refusal without claiming success', async code => {
  const setup = harness(); const remote = protocol({ code }); const id = await prepare(setup);
  expect(await setup.run(`/usage reset apply ${id}`)).toMatchObject({ kind: 'local', output: expect.stringContaining(`refused (${code})`) });
  expect(readResetAttempts(accountKey)[0]).toMatchObject({ status: 'refused', code });
  expect(await setup.run(`/usage reset apply ${id}`)).toMatchObject({ kind: 'local', output: expect.stringContaining('unavailable') });
  expect(remote.posts()).toHaveLength(1);
});

it('replaces unused previews and refuses an earlier preview before approval or consumption', async () => {
  const setup = harness(); const remote = protocol({ code: 'reset' });
  const old = await prepare(setup); const current = await prepare(setup);
  expect(current).not.toBe(old); expect(readResetAttempts(accountKey)).toHaveLength(1);
  expect(await setup.run(`/usage reset apply ${old}`)).toMatchObject({ kind: 'local', output: expect.stringContaining('unavailable') });
  expect(setup.approval).not.toHaveBeenCalled(); expect(remote.posts()).toEqual([]);
  expect(await setup.run(`/usage reset apply ${current}`)).toMatchObject({ kind: 'local', output: expect.stringContaining(': reset (reset)') });
  expect(remote.posts()).toHaveLength(1);
});

it('fences an actual retained pending request and requires intact receipts before further reset work', async () => {
  const setup = harness(); const remote = protocol({ code: 'reset' }); const id = await prepare(setup);
  updateResetAttempts(accountKey, attempts => attempts.map(attempt => ({ ...attempt, status: 'pending' })));
  expect(await harness().run('/usage reset')).toMatchObject({ kind: 'local', output: expect.stringContaining('pending or unknown') });
  expect(await setup.run(`/usage reset apply ${id}`)).toMatchObject({ kind: 'local', output: expect.stringContaining('unavailable') });
  const file = path.join(home, '.cheers/accounts/resets', `${accountKey}.json`); fs.writeFileSync(file, '{}');
  expect(await setup.run('/usage reset')).toMatchObject({ kind: 'local', output: expect.any(String) }); expect(remote.posts()).toEqual([]);
});

it.each([404, 500])('retains known quota windows while reset capability is unavailable (%s)', async status => {
  const setup = harness(); const remote = protocol({ creditStatus: status });
  const result = await setup.run('/usage account');
  expect(result).toMatchObject({ kind: 'local', output: expect.stringContaining('primary: 25% used') });
  const output = (result as { output: string }).output;
  expect(output).toContain('Quota:');
  expect(output).toContain('█');
  expect(output).not.toMatch(/unknown%/);
  expect((result as { output: string }).output).toContain(`Reset credits: ${status === 404 ? 'unsupported' : 'unavailable'}; available count unknown`);
  expect(await setup.run('/usage reset')).toMatchObject({ kind: 'local', output: expect.stringContaining('No valid available') });
  expect(remote.posts()).toEqual([]); expect(readResetAttempts(accountKey)).toEqual([]);
});

it('refuses unsupported authentication and absent interactive binding before any account request', async () => {
  writeConfig({ providerConnections: [], providerCredentials: { openai: { apiKey: 'SYNTHETIC_API_ONLY', baseUrl: 'https://endpoint.example.invalid/v1' } } });
  const setup = harness(); const remote = protocol();
  expect(await setup.run('/usage account')).toMatchObject({ kind: 'local', output: expect.stringContaining('unsupported') });
  expect(await routeSlashCommand('/usage reset', { ...setup.command, interactive: false })).toMatchObject({ kind: 'local', output: expect.stringContaining('interactive') });
  expect(remote.request).not.toHaveBeenCalled();
});

it.each(['pending', 'unknown'] as const)('inspects retained %s receipts offline across sessions without settling or replaying them', async status => {
  const setup = harness(); const remote = protocol({ consumeThrows: true }); const id = await prepare(setup);
  if (status === 'unknown') await setup.run(`/usage reset apply ${id}`);
  else updateResetAttempts(accountKey, attempts => attempts.map(attempt => ({ ...attempt, status })));
  const file = path.join(home, '.cheers/accounts/resets', `${accountKey}.json`);
  const before = fs.readFileSync(file); const modified = fs.statSync(file).mtimeMs;
  const configuration = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  configuration.providerConnections[0].accountAuth.openai.expiresAt = Date.now() - 60000;
  configuration.providerConnections[0].accountAuth.openai.accessToken = 'SYNTHETIC_EXPIRED_TOKEN';
  fs.writeFileSync(configPath, JSON.stringify(configuration));
  const fresh = harness({ mode: 'plan' }); const requests = remote.calls.length;
  for (const input of ['/usage reset status', `/usage reset status ${id}`]) {
    const result = await fresh.run(input); const output = (result as { output: string }).output;
    expect(output).toContain(`Request ${id}; local state ${status}`);
    expect(output).toContain(`Account digest: ${accountKey}`);
    expect(output).toContain(`credit digest ${hashContent(credit.id)}`);
    expect(output).toContain('remote result'); expect(output).toContain('blocked');
    expect(output).not.toMatch(/SYNTHETIC_|credit-first|synthetic-account/);
  }
  expect(remote.calls).toHaveLength(requests); expect(fresh.approval).not.toHaveBeenCalled();
  expect(fs.readFileSync(file)).toEqual(before); expect(fs.statSync(file).mtimeMs).toBe(modified);
  writeConfig();
  expect(await harness().run('/usage reset')).toMatchObject({ kind: 'local', output: expect.stringContaining('pending or unknown') });
  expect(remote.calls).toHaveLength(requests); expect(readResetAttempts(accountKey)[0]).toMatchObject({ id, status });
});

it('limits receipt inspection to the current persisted account and handles an absent requested receipt explicitly', async () => {
  const setup = harness(); const remote = protocol(); const id = await prepare(setup);
  const configuration = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  configuration.providerConnections[0].accountAuth.openai.accountId = 'another-synthetic-account';
  fs.writeFileSync(configPath, JSON.stringify(configuration));
  const fresh = harness(); const requests = remote.calls.length;
  expect(await fresh.run('/usage reset status')).toMatchObject({ kind: 'local', output: expect.stringContaining('No retained reset requests') });
  const absent = await fresh.run(`/usage reset status ${id}`);
  expect((absent as { output: string }).output).toContain('No retained reset request matches');
  expect(JSON.stringify(absent)).not.toContain(id); expect(remote.calls).toHaveLength(requests);
  expect(readResetAttempts(accountKey)[0]).toMatchObject({ id, status: 'prepared' });
});

it.each(['deny', 'selection-change'])('refuses receipt inspection after %s before publishing saved details', async scenario => {
  const remote = protocol(); const id = await prepare(harness()); const requests = remote.calls.length;
  const setup = harness({ deniedTool: scenario === 'deny' ? 'account_reset_status' : undefined,
    onGate: scenario === 'selection-change' ? () => writeConfig({ activeProviderConnectionId: 'another' }) : undefined });
  const result = await setup.run(`/usage reset status ${id}`);
  if (scenario === 'deny') expect((result as { output: string }).output).toContain('refused by its ordinary permission or hook gate');
  else expect((result as { output: string }).output).toMatch(/changed|conflict|authority/i);
  expect((result as { output: string }).output).not.toContain(`Request ${id}`);
  expect((result as { output: string }).output).not.toContain(`Account digest: ${accountKey}`);
  expect(remote.calls).toHaveLength(requests); expect(setup.approval).not.toHaveBeenCalled();
  expect(readResetAttempts(accountKey)[0]?.status).toBe('prepared');
});

it.each(['command', 'tool-result'])('withholds receipt details from %s after a persisted account switch in an awaited post-use hook', async surface => {
  const remote = protocol(); const id = await prepare(harness()); const requests = remote.calls.length;
  const file = path.join(home, '.cheers/accounts/resets', `${accountKey}.json`);
  const before = fs.readFileSync(file); const modified = fs.statSync(file).mtimeMs;
  const setup = harness(); let entered!: () => void; let resume!: () => void; let hookOutput = '';
  const started = new Promise<void>(resolve => { entered = resolve; });
  const continued = new Promise<void>(resolve => { resume = resolve; });
  setup.hooks.registerInProcessHook({ name: 'switch-account-after-read', event: 'PostToolUse', matcher: '^account_reset_status$', handler: async payload => {
    if (payload.eventName === 'PostToolUse') hookOutput = payload.output;
    entered(); await continued;
    const configuration = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    configuration.providerConnections[0].accountAuth.openai.accountId = 'another-synthetic-account';
    fs.writeFileSync(configPath, JSON.stringify(configuration));
    return { feedback: 'Selected account changed during inspection.' };
  } });
  const inspecting = setup.run(`/usage reset status ${id}`);
  await started;
  expect(setup.emit.mock.calls.some(([event]) => event.type === 'tool.result')).toBe(false);
  resume(); const result = await inspecting;
  const event = setup.emit.mock.calls.map(([value]) => value).find(value => value.type === 'tool.result');
  expect(event).toBeDefined();
  const output = surface === 'command' ? (result as { output: string }).output : JSON.stringify(event);
  expect(output).not.toContain(id); expect(output).not.toContain(accountKey); expect(output).not.toContain(hashContent(credit.id));
  expect(hookOutput).not.toContain(id); expect(hookOutput).not.toContain(accountKey);
  expect(event).toMatchObject({ success: false });
  expect((result as { output: string }).output).toMatch(/changed|authority/i);
  expect(remote.calls).toHaveLength(requests); expect(setup.approval).not.toHaveBeenCalled();
  expect(fs.readFileSync(file)).toEqual(before); expect(fs.statSync(file).mtimeMs).toBe(modified);
});

it('withholds receipt details when post-use dispatch fails while preserving the failure', async () => {
  const remote = protocol(); const id = await prepare(harness()); const setup = harness(); const requests = remote.calls.length;
  const before = readResetAttempts(accountKey); const dispatch = setup.hooks.dispatch.bind(setup.hooks);
  vi.spyOn(setup.hooks, 'dispatch').mockImplementation(async payload => {
    const decision = await dispatch(payload);
    if (payload.eventName === 'PostToolUse') throw new Error('Synthetic post-use dispatch failure');
    return decision;
  });
  const result = await setup.run(`/usage reset status ${id}`);
  expect((result as { output: string }).output).not.toContain(id);
  expect((result as { output: string }).output).not.toContain(accountKey);
  expect((result as { output: string }).output).toContain('after-call hooks or publication failed');
  expect(remote.calls).toHaveLength(requests); expect(readResetAttempts(accountKey)).toEqual(before);
});

it('shows receipt details with sanitized post-use feedback only after final account verification', async () => {
  const remote = protocol(); const id = await prepare(harness()); const setup = harness(); const requests = remote.calls.length;
  setup.hooks.registerInProcessHook({ name: 'receipt-feedback', event: 'PostToolUse', matcher: '^account_reset_status$',
    handler: async () => ({ feedback: 'Checked\nSYNTHETIC_FEEDBACK' }) });
  const result = await setup.run(`/usage reset status ${id}`);
  expect((result as { output: string }).output).toContain(`Request ${id}; local state prepared`);
  expect((result as { output: string }).output).toContain('[Verification feedback]');
  expect((result as { output: string }).output).toContain('Checked\\x0aSYNTHETIC_FEEDBACK');
  const events = JSON.stringify(setup.emit.mock.calls);
  expect(events).not.toContain(id); expect(events).not.toContain(accountKey);
  expect(remote.calls).toHaveLength(requests); expect(setup.approval).not.toHaveBeenCalled();
});

it('withholds receipt details if a result observer switches the persisted account before command display', async () => {
  const remote = protocol(); const id = await prepare(harness()); const requests = remote.calls.length;
  const before = readResetAttempts(accountKey);
  const setup = harness({ onEmit: event => {
    if (event.type === 'tool.result') writeConfig({ activeProviderConnectionId: 'another' });
  } });
  const result = await setup.run(`/usage reset status ${id}`);
  expect((result as { output: string }).output).not.toContain(id);
  expect((result as { output: string }).output).not.toContain(accountKey);
  expect((result as { output: string }).output).toMatch(/changed|conflict|authority/i);
  expect(JSON.stringify(setup.emit.mock.calls)).not.toContain(id);
  expect(remote.calls).toHaveLength(requests); expect(readResetAttempts(accountKey)).toEqual(before);
});

it('inspects an in-flight pending receipt without releasing the runtime guard for another reset request', async () => {
  let entered!: () => void; let settle!: (response: Response) => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const setup = harness(); const remote = protocol({ consume: () => {
    entered(); return new Promise<Response>(resolve => { settle = resolve; });
  } });
  const id = await prepare(setup); const applying = setup.run(`/usage reset apply ${id}`);
  await started;
  try {
    const requests = remote.calls.length;
    expect(await setup.run(`/usage reset status ${id}`)).toMatchObject({ kind: 'local', output: expect.stringContaining(`Request ${id}; local state pending`) });
    expect(await setup.run('/usage reset')).toMatchObject({ kind: 'local', output: expect.stringContaining('already pending') });
    expect(remote.calls).toHaveLength(requests); expect(remote.posts()).toHaveLength(1);
  } finally { settle(new Response(JSON.stringify({ code: 'reset' }))); await applying; }
  expect(readResetAttempts(accountKey)[0]).toMatchObject({ id, status: 'reset' });
});

it('bounds the saved receipt list, prioritizes unresolved results, and keeps raw account and credit fields out of reports', async () => {
  const setup = harness(); const remote = protocol(); const id = await prepare(setup);
  updateResetAttempts(accountKey, attempts => {
    const template = attempts[0]!;
    return [{ ...template, status: 'pending', createdAt: '2020-01-01T00:00:00.000Z' }, ...Array.from({ length: 25 }, (_, index) => ({ ...template,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, status: 'reset' as const, code: 'reset' as const,
      createdAt: new Date(Date.UTC(2025, 0, index + 1)).toISOString(), credit: { ...template.credit, id: 'SYNTHETIC_PRIVATE_CREDIT\n\x1b[2J' } }))];
  });
  const before = readResetAttempts(accountKey); const requests = remote.calls.length;
  const result = await setup.run('/usage reset status'); const output = (result as { output: string }).output;
  expect(output).toContain('Showing 20 of 26'); expect(output.match(/^Request /gm)).toHaveLength(20);
  expect(output.indexOf(`Request ${id}; local state pending`)).toBeLessThan(output.indexOf('local state reset'));
  expect(output).not.toMatch(/SYNTHETIC_|credit-first|synthetic-account|\x1b/); expect(output.length).toBeLessThan(8000);
  const oldId = '00000000-0000-4000-8000-000000000000';
  expect(output).not.toContain(oldId);
  expect(await setup.run(`/usage reset status ${oldId}`)).toMatchObject({ kind: 'local', output: expect.stringContaining(`Request ${oldId}; local state reset`) });
  expect(remote.calls).toHaveLength(requests); expect(readResetAttempts(accountKey)).toEqual(before);
});

it('reports damaged or redirected receipt storage as unavailable without exposing it or converting it into an empty result', async () => {
  const setup = harness(); const remote = protocol(); const id = await prepare(setup);
  const file = path.join(home, '.cheers/accounts/resets', `${accountKey}.json`);
  const requests = remote.calls.length;
  fs.writeFileSync(file, 'SYNTHETIC_PRIVATE_BROKEN_RECEIPT');
  let result = await setup.run(`/usage reset status ${id}`);
  expect((result as { output: string }).output).toContain('Local reset receipts are unavailable or invalid');
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC_PRIVATE_BROKEN_RECEIPT');
  const outside = path.join(root, 'private-receipts.json'); fs.writeFileSync(outside, 'SYNTHETIC_PRIVATE_OUTSIDE');
  fs.unlinkSync(file); fs.symlinkSync(outside, file);
  result = await setup.run('/usage reset status');
  expect((result as { output: string }).output).toContain('Local reset receipts are unavailable or invalid');
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC_PRIVATE_OUTSIDE');
  expect(fs.readlinkSync(file)).toBe(outside); expect(remote.calls).toHaveLength(requests); expect(setup.approval).not.toHaveBeenCalled();
});
