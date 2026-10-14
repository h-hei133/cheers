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
function harness(options: { decision?: 'allow-once' | 'allow-always' | 'deny'; mode?: 'plan' | 'build'; denied?: boolean; onApproval?: () => void; missingApproval?: boolean } = {}) {
  const manager = new SessionManager(); const session = manager.createNew(root);
  const context = createShellRuntimeContext({ cwd: root, projectRoot: root, originalCwd: root, rootMode: 'direct', targetPathBase: root,
    gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root), session });
  const approval = vi.fn(async prompt => { options.onApproval?.(); return { promptId: prompt.id, decision: options.decision ?? 'allow-once', respondedAt: Date.now() }; });
  installUsageRuntime(context, () => ({ workspaceRoot: root, sessionId: session.id, agentMode: options.mode ?? 'build', permissionScope: 'allow-all',
    hooks: new HookDispatcher(), denyRules: options.denied ? [{ tool: 'account_reset' }] : [], emit: () => {},
    escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision: 'allow-always', respondedAt: Date.now() }) }),
    options.missingApproval ? undefined : usageResetApproval(context, manager, () => approval));
  const command = { cwd: root, projectRoot: root, sessionId: session.id, interactive: true, usageCommand: usageCommandFor(context) };
  return { manager, session, context, command, approval, run: (input: string) => routeSlashCommand(input, command) };
}
function protocol(options: { code?: string; creditReply?: unknown; creditStatus?: number; consumeThrows?: boolean } = {}) {
  const calls: { url: string; init: network.PublicRequest }[] = [];
  const request = vi.spyOn(network, 'requestPublic').mockImplementation(async (url, init, scope) => {
    scope.check(); calls.push({ url, init });
    expect(new URL(url).origin).toBe('https://chatgpt.com');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer SYNTHETIC_ACCOUNT_TOKEN', 'ChatGPT-Account-Id': accountId });
    if (url.endsWith('/consume')) {
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
