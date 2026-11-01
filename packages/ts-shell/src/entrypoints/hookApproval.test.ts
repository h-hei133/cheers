import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import { HookTrustStore, hookFingerprint } from '../core/hooks/trust.js';
import { resolveUserDataFile } from '../core/paths/userHome.js';
import { createProfileContext, withProfile } from '../core/paths/profile/context.js';
import { ApprovalTrustPolicy } from '../core/shell/approvalTrustPolicy.js';
import { bootstrapShellRuntime } from '../core/shell/bootstrap.js';
import { runTrustCommand } from '../core/commands/trustCommandRuntime.js';
import { getRuntimeConfig } from '../config/runtimeConfig.js';
import { getWorkflowGitContext } from '../workflow/gitContext.js';
import { SessionManager } from '../session/SessionManager.js';
import { StreamingRenderer } from '../presentation/terminal/streaming.js';
import { createCliSessionRuntime } from '../cli/runtime/cliSessionRuntimeFactory.js';
import { gitGateFor } from '../cli/runtime/gitGate.js';
import { buildToolEscalationPrompt } from '../core/query/toolPolicy.js';
import type { EscalationPrompt } from '../core/shell/approval/contract.js';
import type { ApprovalAuditRecord } from '../core/shell/approvalPromptRenderer.js';
import type { PermissionScope } from '../cli/approval/permissionScope.js';
import { createCliEscalationPromptHandler } from './cliApprovalModule.js';
import { runCliRuntimeInvocation } from './cliRuntimeInvocation.js';

let scratch: string, root: string, source: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  scratch = fs.mkdtempSync('/tmp/cheers-test/hook-approval-'); root = path.join(scratch, 'project');
  source = path.join(root, '.agents/hooks.json'); fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.mkdirSync(path.join(scratch, 'home'));
  vi.stubEnv('HOME', path.join(scratch, 'home')); vi.stubEnv('USERPROFILE', path.join(scratch, 'home'));
  vi.stubEnv('CHEERS_TEST_ROOT', path.join(scratch, 'data')); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });

const command = "printf 'effect\\n' >> effects";
function declare(file = source, matcher = '*') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ hooks: { SessionStart: [{ matcher, hooks: [{ type: 'command', command }] }] } }));
}
function effects() {
  const file = path.join(root, 'effects');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n') : [];
}
function setup(producer: 'invocation' | 'git', options: { scope?: PermissionScope; headless?: boolean; bypassed?: boolean } = {}) {
  const renderer = new StreamingRenderer(); vi.spyOn(renderer, 'renderLine').mockImplementation(() => {});
  const policy = new ApprovalTrustPolicy(), store = new HookTrustStore(), audits: ApprovalAuditRecord[] = [];
  const answer = vi.fn(async (_prompt: EscalationPrompt) => 'allow-always' as 'allow-always' | 'allow-once' | 'deny');
  const approve = createCliEscalationPromptHandler(renderer, null, () => 'compact', policy, () => root,
    () => 'allow-always', undefined, record => audits.push(record), () => options.scope ?? 'ask', options.headless ? undefined : answer);
  const manager = new SessionManager(), config = { ...getRuntimeConfig(root), allowUntrustedHooks: options.bypassed === true };
  const context = bootstrapShellRuntime({ cwd: root, runtimeConfig: config, gitContext: getWorkflowGitContext(root),
    sessionManager: manager, renderer, emitLifecycleMessages: false }).context;
  const runtime = createCliSessionRuntime({ runtimeContext: context, sessionManager: manager, renderer, options: {},
    approvalTrustPolicy: policy, getReadline: () => null, providerRuntimeBridge: {
      resolveCredentialSnapshot: () => ({ provider: 'openai', expectedEnvVarName: 'OPENAI_API_KEY' }),
      providerModeEnv: () => 'synthetic', realProviderSmokeOptIn: () => false,
    } });
  const hooks = new HookDispatcher();
  const run = async () => {
    if (producer === 'git') {
      const gate = gitGateFor(context, manager, runtime, approve);
      await gate.hooks!.dispatch({ eventName: 'SessionStart', workspaceRoot: root, sessionId: context.session.id, timestamp: '' });
      return;
    }
    const turn = await runCliRuntimeInvocation({ sessionId: context.session.id, workspaceRoot: root, prompt: 'Public fixture',
      signal: new AbortController().signal, maxTurns: 1, agentMode: 'build', runtimeConfig: config,
      providerCredentialResolution: { provider: 'openai', expectedEnvVarName: 'OPENAI_API_KEY' },
      providerModeEnv: 'real', escalationPromptHandler: approve }, {
      hooks, tools: () => new Map(), checkProviderReadiness: async () => ({ ok: true }),
      createReadinessTerminalEvent: () => { throw new Error('Unexpected fixture readiness failure'); },
      createStep: () => async () => ({ text: 'Settled', toolCalls: [], stopReason: 'stop' }),
    });
    for await (const _event of turn.events) { /* Drain the real turn and hook dispatch. */ }
  };
  return { answer, approve, run, policy, store, audits };
}

describe.each(['invocation', 'git'] as const)('%s hook approval ownership', producer => {
  it('withdraws project hooks inside a captured profile while preserving user hooks', async () => {
    declare();
    const profile = createProfileContext({ name: 'hook-probe', homeDir: path.join(scratch, 'home'), env: {} });
    await withProfile(profile, async () => {
      declare(resolveUserDataFile('hooks.json'));
      const view = setup(producer); await view.run();
      expect(effects()).toEqual(['effect', 'effect']); expect(view.store.entries()).toHaveLength(2);
      const result = await runTrustCommand(['forget'], { cwd: root }); expect(result.output).toContain('Withdrew 1');
      const status = await runTrustCommand(['status'], { cwd: root }); expect(status.output).toContain('Commands this project asks');
      view.answer.mockResolvedValue('deny'); await view.run();
      expect(effects()).toEqual(['effect', 'effect', 'effect']); expect(view.answer).toHaveBeenCalledTimes(3);
      expect(view.store.entries()).toHaveLength(1); expect(view.policy.listGrants()).toEqual([]);
    });
  });

  it('remembers only the exact hook, then actually asks after /trust forget', async () => {
    declare(); const view = setup(producer);
    await view.run(); await view.run();
    expect(effects()).toEqual(['effect', 'effect']); expect(view.answer).toHaveBeenCalledOnce();
    expect(view.store.entries()).toHaveLength(1);
    const forgotten = await runTrustCommand(['forget'], { cwd: root }); expect(forgotten.output).toContain('Withdrew 1');
    expect(view.store.entries()).toEqual([]); view.answer.mockResolvedValue('deny');
    await view.run();
    expect(effects()).toEqual(['effect', 'effect']); expect(view.answer).toHaveBeenCalledTimes(2);
    expect(view.store.entries()).toEqual([]); expect(view.policy.listGrants()).toEqual([]);
  });

  it('does not publish a generic persistence claim before the hook owner saves', async () => {
    declare(); const view = setup(producer);
    await view.run();
    expect(view.policy.listGrants()).toEqual([]);
    expect(view.audits).toMatchObject([{ decision: 'allow-always', persistent: false, cacheEffect: 'none' }]);
    expect(view.store.entries()).toHaveLength(1);
  });

  it('does not read generic policy while collecting the hook answer', async () => {
    declare(); const view = setup(producer); view.answer.mockResolvedValue('deny');
    const evaluate = vi.spyOn(view.policy, 'evaluate').mockImplementation(() => { throw new Error('Generic policy must not own this hook'); });
    const persist = vi.spyOn(view.policy, 'rememberAllowAlways');
    await view.run();
    expect(evaluate).not.toHaveBeenCalled(); expect(persist).not.toHaveBeenCalled();
    expect(view.answer).toHaveBeenCalledOnce(); expect(effects()).toEqual([]);
  });

  it.each(['matcher', 'source'] as const)('asks again after the %s changes with the same command and event', async changed => {
    declare(); const view = setup(producer); await view.run(); view.answer.mockResolvedValue('deny');
    if (changed === 'matcher') declare(source, 'changed');
    else { fs.unlinkSync(source); declare(resolveUserDataFile('hooks.json')); }
    await view.run();
    expect(effects()).toEqual(['effect']); expect(view.answer).toHaveBeenCalledTimes(2);
    expect(view.store.entries()).toHaveLength(1);
  });

  it('ignores old hook and bash grants without withdrawing ordinary tool permissions', async () => {
    declare(); const view = setup(producer); view.answer.mockResolvedValue('deny');
    const hook = buildToolEscalationPrompt('hook', 'SessionStart', command, 'Legacy fixture');
    const bash = buildToolEscalationPrompt('bash', 'execute', command, 'Ordinary fixture');
    view.policy.rememberAllowAlways(hook, root); view.policy.rememberAllowAlways(bash, root);
    view.policy.rememberAllowOnce(view.policy.evaluate(hook, root).cacheKey);
    const before = fs.readFileSync(view.policy.sourcePath);
    await view.run();
    expect(effects()).toEqual([]); expect(view.answer).toHaveBeenCalledOnce(); expect(view.store.entries()).toEqual([]);
    expect(fs.readFileSync(view.policy.sourcePath)).toEqual(before);
    expect(view.policy.hasAllowOnce(view.policy.evaluate(hook, root).cacheKey)).toBe(true);
    expect((await view.approve(bash)).decision).toBe('allow-always'); expect(view.answer).toHaveBeenCalledOnce();
  });

  it('requires a hook answer even under the allow-all session scope', async () => {
    declare(); const view = setup(producer, { scope: 'allow-all' }); view.answer.mockResolvedValue('deny');
    await view.run(); expect(effects()).toEqual([]); expect(view.answer).toHaveBeenCalledOnce(); expect(view.store.entries()).toEqual([]);
  });

  it('keeps allow-once nonpersistent and asks at the next dispatch', async () => {
    declare(); const view = setup(producer); view.answer.mockResolvedValueOnce('allow-once').mockResolvedValue('deny');
    await view.run(); await view.run();
    expect(effects()).toEqual(['effect']); expect(view.answer).toHaveBeenCalledTimes(2);
    expect(view.policy.listGrants()).toEqual([]); expect(view.store.entries()).toEqual([]);
  });

  it('defaults to denial without an answer host despite generic headless allow-always', async () => {
    declare(); const view = setup(producer, { headless: true }); await view.run();
    expect(effects()).toEqual([]); expect(view.policy.listGrants()).toEqual([]); expect(view.store.entries()).toEqual([]);
  });

  it('preserves the explicit hook bypass without manufacturing any grant', async () => {
    declare(); const view = setup(producer, { headless: true, bypassed: true }); await view.run();
    expect(effects()).toEqual(['effect']); expect(view.answer).not.toHaveBeenCalled();
    expect(view.policy.listGrants()).toEqual([]); expect(view.store.entries()).toEqual([]);
  });

  it('preserves a user hook when project approvals are withdrawn', async () => {
    declare(); const userSource = resolveUserDataFile('hooks.json'); declare(userSource);
    const view = setup(producer); await view.run();
    expect(effects()).toEqual(['effect', 'effect']); expect(view.answer).toHaveBeenCalledTimes(2);
    await runTrustCommand(['forget'], { cwd: root }); view.answer.mockResolvedValue('deny'); await view.run();
    expect(effects()).toEqual(['effect', 'effect', 'effect']); expect(view.answer).toHaveBeenCalledTimes(3);
    expect(view.store.isTrusted(hookFingerprint({ event: 'SessionStart', matcher: '*', command, sourcePath: userSource }))).toBe(true);
    expect(view.store.entries()).toHaveLength(1);
  });
});
