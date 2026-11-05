import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import { CANONICAL_WRITE_MATCHER } from '../core/hooks/translation.js';
import { bootstrapShellRuntime } from '../core/shell/bootstrap.js';
import { getRuntimeConfig } from '../config/runtimeConfig.js';
import { getWorkflowGitContext } from '../workflow/gitContext.js';
import { SessionManager } from '../session/SessionManager.js';
import { StreamingRenderer } from '../presentation/terminal/streaming.js';
import { gitGateFor } from '../cli/runtime/gitGate.js';
import { runCliRuntimeInvocation } from './cliRuntimeInvocation.js';
import { runPreparedTool } from '../turn/invoke.js';
import { runSecurityTool } from '../security/analysis/gate.js';
import { runNativeGit } from '../workflow/git/operation/gate.js';
import { NativeGit } from '../workflow/git/read/native.js';
import type { GitPlan } from '../workflow/git/operation/model.js';
import type { ShellSessionRuntime } from '../core/shell/sessionRuntime.js';
import type { ToolDefinition } from '../tools/types.js';
import type { HookDecision } from '../core/hooks/types.js';

let scratch: string, root: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  scratch = fs.mkdtempSync('/tmp/cheers-test/write-hook-'); root = path.join(scratch, 'workspace');
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true }); fs.mkdirSync(path.join(root, '.normproof'));
  fs.mkdirSync(path.join(scratch, 'home'));
  vi.stubEnv('HOME', path.join(scratch, 'home')); vi.stubEnv('USERPROFILE', path.join(scratch, 'home'));
  vi.stubEnv('CHEERS_TEST_ROOT', path.join(scratch, 'data')); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const { provenance: _provenance, ...writeGate } = JSON.parse(fs.readFileSync(path.join(repo, '.normproof/write-gate/artifact.json'), 'utf8'));
  writeGate.path = path.join(repo, writeGate.path);
  fs.writeFileSync(path.join(root, '.agents/hooks.json'), JSON.stringify({ hooks: {
    PreToolUse: [{ matcher: CANONICAL_WRITE_MATCHER, hooks: [{ writeGate }] }],
  } }));
  fs.writeFileSync(path.join(root, '.normproof/write-rules.json'), JSON.stringify({ version: '0.1.0', rules: [
    { id: 'protected', kind: 'pathBoundary', deny: ['target.txt'], message: 'Choose an allowed file.' },
  ] }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });

it.each(['normal turn', 'native prepared', 'native security', 'native Git'] as const)('%s uses the shared declared translation with real artifact output', async consumer => {
  const renderer = new StreamingRenderer(); vi.spyOn(renderer, 'renderLine').mockImplementation(() => {});
  const manager = new SessionManager(), config = getRuntimeConfig(root);
  const context = bootstrapShellRuntime({ cwd: root, runtimeConfig: config, gitContext: getWorkflowGitContext(root),
    sessionManager: manager, renderer, emitLifecycleMessages: false }).context;
  const runtime = { getAgentMode: () => 'build', getPermissionScope: () => 'allow-all' } as ShellSessionRuntime;
  const approval = vi.fn(async (prompt: { id: string }) => ({ promptId: prompt.id, decision: 'allow-once' as const, respondedAt: 1 }));
  const effect = vi.fn(async () => ({ success: true, output: 'synthetic effect' }));
  const tool: ToolDefinition = { name: 'write', description: 'Prepared fixture', argsSchema: { type: 'object' },
    prepare: () => ({ targets: [], preview: 'Prepared fixture', execute: effect }), execute: effect };
  const decisions: HookDecision[] = [];
  function observe(hooks: HookDispatcher) {
    const dispatch = hooks.dispatch.bind(hooks);
    vi.spyOn(hooks, 'dispatch').mockImplementation(async input => {
      const result = await dispatch(input); if (input.eventName === 'PreToolUse') decisions.push(result); return result;
    });
  }
  if (consumer === 'normal turn') {
    const hooks = new HookDispatcher(); observe(hooks); let step = 0;
    const turn = await runCliRuntimeInvocation({ sessionId: context.session.id, workspaceRoot: root, prompt: 'Exercise write gate',
      signal: new AbortController().signal, maxTurns: 3, agentMode: 'build', permissionScope: 'allow-all', runtimeConfig: config,
      providerCredentialResolution: { provider: 'openai', expectedEnvVarName: 'OPENAI_API_KEY' }, providerModeEnv: 'real', escalationPromptHandler: approval,
    }, { hooks, tools: () => new Map([['write', tool]]), checkProviderReadiness: async () => ({ ok: true }),
      createReadinessTerminalEvent: () => { throw new Error('Unexpected readiness failure'); },
      createStep: () => async () => ++step === 1 ? { text: '', toolCalls: [{ id: 'write-call', name: 'write', args: { path: 'target.txt', content: 'new' } }], stopReason: 'tool_use' }
        : { text: 'Observed', toolCalls: [], stopReason: 'stop' },
    });
    for await (const _event of turn.events) { /* Actual normal registration and consumer. */ }
  } else {
    const gate = gitGateFor(context, manager, runtime, approval, consumer === 'native Git' ? 'bash' : 'write'); observe(gate.hooks!);
    if (consumer === 'native Git') {
      // A native flat hook still vetoes after translation reports unsupported; no Git side effect runs.
      gate.hooks!.registerCommandHook({ event: 'PreToolUse', matcher: '^bash$', command: 'printf \'{"decision":"block","reason":"native shell policy"}\'' });
      const plan = { id: 'git-call', summary: 'git status', preview: 'Fixture Git plan', targets: [],
        snapshot: { root }, args: ['status'], run: effect } as unknown as GitPlan;
      await runNativeGit({ root } as NativeGit, plan, gate, () => {});
    } else {
      const run = consumer === 'native prepared' ? runPreparedTool : runSecurityTool;
      const result = await run(tool, { path: 'target.txt', content: 'new' }, gate, undefined, 'write-call');
      expect(result.isError).toBe(true);
    }
  }
  expect(approval).toHaveBeenCalledOnce();
  expect(effect).not.toHaveBeenCalled();
  expect(decisions).toHaveLength(1);
  expect(decisions[0]!.decision).toBe('block');
  expect(decisions[0]!.reason).toContain(consumer === 'native Git' ? 'native shell policy' : 'protected');
  console.log(JSON.stringify({ probe: consumer, hookApprovalCalls: approval.mock.calls.length, effects: effect.mock.calls.length, decision: decisions[0] }));
});
