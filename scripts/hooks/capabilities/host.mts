import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HookDispatcher } from '../../../packages/ts-shell/src/core/hooks/hookDispatcher.js';
import { loadHookDeclarations } from '../../../packages/ts-shell/src/core/hooks/config.js';
import { registerDeclaredHooks } from '../../../packages/ts-shell/src/core/hooks/registration.js';
import { HookTrustStore } from '../../../packages/ts-shell/src/core/hooks/trust.js';
import { createProfileContext, withProfile } from '../../../packages/ts-shell/src/core/paths/profile/context.js';
import { createCoreToolRegistry } from '../../../packages/ts-shell/src/core/tools/registry.js';
import { CANONICAL_WRITE_MATCHER } from '../../../packages/ts-shell/src/core/hooks/translation.js';
import { runPreparedTool } from '../../../packages/ts-shell/src/turn/invoke.js';
import { runSecurityTool } from '../../../packages/ts-shell/src/security/analysis/gate.js';
import { runCliRuntimeInvocation } from '../../../packages/ts-shell/src/entrypoints/cliRuntimeInvocation.js';
import { bootstrapShellRuntime } from '../../../packages/ts-shell/src/core/shell/bootstrap.js';
import { getRuntimeConfig } from '../../../packages/ts-shell/src/config/runtimeConfig.js';
import { getWorkflowGitContext } from '../../../packages/ts-shell/src/workflow/gitContext.js';
import { SessionManager } from '../../../packages/ts-shell/src/session/SessionManager.js';
import { StreamingRenderer } from '../../../packages/ts-shell/src/presentation/terminal/streaming.js';
import { gitGateFor } from '../../../packages/ts-shell/src/cli/runtime/gitGate.js';
import { runNativeGit } from '../../../packages/ts-shell/src/workflow/git/operation/gate.js';
import { NativeGit } from '../../../packages/ts-shell/src/workflow/git/read/native.js';
import { readGitSnapshot } from '../../../packages/ts-shell/src/workflow/git/read/snapshot.js';
import { runStopCommand } from '../../../packages/ts-shell/src/core/hooks/stop/run.js';
import { normalizeStopResult } from '../../../packages/ts-shell/src/core/hooks/stop/result.js';
import { planSandboxedCommand } from '../../../packages/ts-shell/src/sandbox/osSandbox.js';
import { setFilePersistenceEnabled } from '../../../packages/ts-shell/src/observability/structuredLogger.js';

const repository = process.cwd();
const scratch = process.env.CAPABILITY_SCRATCH!;
const artifact = JSON.parse(fs.readFileSync(path.join(repository, '.normproof/write-gate/artifact.json'), 'utf8'));
const { provenance: _provenance, ...writeGate } = artifact;
writeGate.path = path.join(repository, artifact.path);
const rows: unknown[] = [];
setFilePersistenceEnabled(false);
const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

function config(root: string, hooks: unknown) {
  fs.mkdirSync(path.dirname(root), { recursive: true });
  fs.writeFileSync(root, JSON.stringify({ hooks }));
}

function observe(hooks: HookDispatcher, observed: unknown[]) {
  const dispatch = hooks.dispatch.bind(hooks);
  hooks.dispatch = async (payload, ...rest) => {
    const result = await dispatch(payload, ...rest);
    observed.push({ payload, result });
    return result;
  };
}

async function host(consumer: string, mode: string) {
  const root = path.join(scratch, `${consumer}-${mode}`);
  fs.mkdirSync(root, { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  config(path.join(root, '.agents/hooks.json'), { PreToolUse: [{ matcher: CANONICAL_WRITE_MATCHER, hooks: [{ writeGate, timeoutMs: 4321 }] }] });
  fs.mkdirSync(path.join(root, '.normproof'));
  const rules = { version: '0.1.0', rules: [{ id: 'protected', kind: 'pathBoundary', deny: ['target.txt'], message: 'Choose an allowed file.' }] };
  fs.writeFileSync(path.join(root, '.normproof/write-rules.json'), JSON.stringify(rules));
  const manager = new SessionManager();
  const runtimeConfig = getRuntimeConfig(root);
  const renderer = new StreamingRenderer();
  renderer.renderLine = () => {};
  const context = bootstrapShellRuntime({ cwd: root, runtimeConfig, gitContext: getWorkflowGitContext(root), sessionManager: manager, renderer, emitLifecycleMessages: false }).context;
  const approvals: unknown[] = [], observed: unknown[] = [], events: unknown[] = [];
  const approval = async (prompt: { id: string }) => {
    approvals.push({ promptId: prompt.id, decision: 'allow-once' });
    return { promptId: prompt.id, decision: 'allow-once' as const, respondedAt: 1 };
  };
  const target = mode === 'allow' ? 'allowed.txt' : 'target.txt';
  const tools = createCoreToolRegistry();
  let result: unknown;
  if (consumer === 'normal') {
    const hooks = new HookDispatcher(); observe(hooks, observed);
    let step = 0;
    const turn = await runCliRuntimeInvocation({ sessionId: context.session.id, workspaceRoot: root, prompt: 'Exercise the local capability fixture',
      signal: new AbortController().signal, maxTurns: 3, agentMode: 'build', permissionScope: 'allow-all', runtimeConfig,
      providerCredentialResolution: { provider: 'openai', expectedEnvVarName: 'OPENAI_API_KEY' }, providerModeEnv: 'real', escalationPromptHandler: approval,
    }, { hooks, tools: () => tools, checkProviderReadiness: async () => ({ ok: true }),
      createReadinessTerminalEvent: () => { throw new Error('Unexpected readiness failure'); },
      createStep: () => async () => ++step === 1 ? { text: '', toolCalls: [{ id: 'write-call', name: 'write', args: { path: target, content: 'capability fixture\n' } }], stopReason: 'tool_use' }
        : { text: 'Fixture ended', toolCalls: [], stopReason: 'stop' },
    });
    for await (const event of turn.events) events.push(event);
  } else {
    const runtime = { getAgentMode: () => 'build', getPermissionScope: () => 'allow-all' };
    const gate = gitGateFor(context, manager, runtime as never, approval, consumer === 'git' ? 'bash' : 'write');
    observe(gate.hooks!, observed);
    if (consumer === 'git') {
      const git = new NativeGit(root);
      fs.writeFileSync(path.join(root, 'git-target.txt'), 'stage fixture\n');
      const snapshot = await readGitSnapshot(git);
      const command = "printf '%s' '{\"decision\":\"block\",\"reason\":\"local native Git refusal\"}'";
      if (mode === 'block') gate.hooks!.registerCommandHook({ event: 'PreToolUse', matcher: '^bash$', command, timeoutMs: 4321 });
      result = await runNativeGit(git, { id: 'git-call', summary: 'git add -- git-target.txt', preview: 'Stage isolated fixture', targets: [], snapshot, args: ['add', '--', 'git-target.txt'] }, gate, () => {});
      const index = execFileSync('git', ['-C', root, 'ls-files', '--', 'git-target.txt'], { encoding: 'utf8' });
      rows.push({ id: `host-${consumer}-${mode}`, status: 'observed', evidenceTier: 'local-product-path-scripted', node: process.version, event: 'PreToolUse', tool: 'bash', timeoutMs: 4321,
        inputFidelity: 'command, call identity and workspace; shell final effects unsupported by write adapter', failureDirection: 'flat hook blocks before Git; unsupported alone grants no protection', denyShape: 'flat block', reentry: false,
        canBlock: mode === 'block' && index === '', ...(mode === 'block' ? { command } : {}), output: { observed, approvals, result, index }, rules,
        declaredConfig: JSON.parse(fs.readFileSync(path.join(root, '.agents/hooks.json'), 'utf8')) });
      return;
    }
    result = await (consumer === 'prepared' ? runPreparedTool : runSecurityTool)(tools.get('write')!, { path: target, content: 'capability fixture\n' }, gate, undefined, 'write-call');
  }
  const targetExists = fs.existsSync(path.join(root, target));
  rows.push({ id: `host-${consumer}-${mode}`, status: 'observed', evidenceTier: 'local-product-path-scripted', node: process.version, event: 'PreToolUse', tool: 'write', timeoutMs: 4321,
    inputFidelity: 'path + full content, call identity, workspace; adapter retains raw args and canonical Write', failureDirection: 'artifact violation blocks; ordinary approval independent', denyShape: 'nested deny translated to flat block', reentry: false,
    canBlock: mode === 'block' && !targetExists, output: { observed, approvals, result, events, targetExists, content: targetExists ? fs.readFileSync(path.join(root, target), 'utf8') : null }, rules,
    declaredConfig: JSON.parse(fs.readFileSync(path.join(root, '.agents/hooks.json'), 'utf8')) });
}

async function configuration() {
  for (const source of ['project', '.cheers', '.cheer', '.private-agents', '.coding-agents', 'named-profile', 'project-only']) {
    const root = path.join(scratch, 'config', source), homeDir = path.join(root, 'home');
    fs.mkdirSync(homeDir, { recursive: true });
    const project = path.join(root, 'project'); fs.mkdirSync(project);
    const profile = source === 'named-profile' ? createProfileContext({ name: 'capability', homeDir, env: {} }) : undefined;
    const sourcePath = source === 'project' || source === 'project-only' ? path.join(project, '.agents/hooks.json')
      : path.join(profile?.root ?? path.join(homeDir, source), 'hooks.json');
    const command = "printf '%s' '{\"decision\":\"block\",\"reasonCode\":\"open_obligations\"}'";
    config(sourcePath, { Stop: [{ hooks: [{ command, timeoutMs: 4321 }] }] });
    const operation = async () => {
      const loaded = loadHookDeclarations(project, { homeDir, ...(source === 'project-only' ? { includeUser: false } : {}) });
      const hooks = new HookDispatcher();
      const registration = registerDeclaredHooks(hooks, project, { homeDir, trustStore: new HookTrustStore(path.join(profile?.root ?? homeDir, 'trust.json')), requestApproval: async () => 'allow-once' });
      const payload = { eventName: 'Stop' as const, sessionId: 'config-fixture', workspaceRoot: project, timestamp: new Date().toISOString(), finalOutput: 'candidate', turnsExecuted: 1, attemptId: 'config-attempt', reentryCount: 0, stop_hook_active: false };
      let sandbox: unknown;
      try { sandbox = planSandboxedCommand({ shell: '/bin/sh', shellArgs: ['-c', command], workspaceRoot: project }); }
      catch (error) { sandbox = { error: error instanceof Error ? error.message : 'Sandbox plan unavailable' }; }
      const result = await hooks.dispatch(payload);
      rows.push({ id: `config-${source}`, status: 'observed', node: process.version, evidenceTier: 'local-config-command', event: 'Stop', tool: null, timeoutMs: 4321, inputFidelity: 'resolved declaration + handler timeoutMs + sourcePath', failureDirection: result.decision === 'block' ? 'explicit block consumed by Stop dispatcher' : 'actual command unknown; registration success does not prove veto', denyShape: 'flat block', reentry: 'configuration does not itself reenter', canBlock: result.decision === 'block', sourcePath, profile: profile?.id ?? 'isolated-default', loaded, registration, command,
        declaredConfig: JSON.parse(fs.readFileSync(sourcePath, 'utf8')), payload, sandbox, output: result });
    };
    // A real profile launch binds HOME/USERPROFILE and ProfileContext to the same home.
    const previousHome = process.env.HOME, previousUserProfile = process.env.USERPROFILE;
    process.env.HOME = homeDir; process.env.USERPROFILE = homeDir;
    try { if (profile) await withProfile(profile, operation); else await operation(); }
    finally { process.env.HOME = previousHome; process.env.USERPROFILE = previousUserProfile; }
  }
}

async function stop() {
  const cases = JSON.parse(fs.readFileSync(path.join(scratch, 'stop-cases.json'), 'utf8'));
  for (const item of cases) {
    const payload = { eventName: 'Stop' as const, sessionId: 'stop-boundary', workspaceRoot: item.workspace, timestamp: new Date().toISOString(), finalOutput: 'candidate', turnsExecuted: 1, attemptId: 'runtime-pair', reentryCount: item.active ? 1 : 0, stop_hook_active: item.active };
    const output = await runStopCommand(`${quote(process.execPath)} ${quote(item.cli)} gate stop --emit-result`, payload, 3000);
    rows.push({ id: `stop-parser-${item.id}`, status: 'observed', node: process.version, evidenceTier: 'real-command-host-parser', event: 'Stop', tool: null, timeoutMs: 3000,
      inputFidelity: 'actual CLI stdout parsed by current host; explicit false on first attempt', failureDirection: output.stopDisposition === 'completed_unproven' ? 'neutral completion disposition; no new proof' : output.decision === 'unknown' ? 'unknown cannot prove completion' : 'explicit producer decision retained', denyShape: 'R0a envelope or legacy flat block', reentry: 'C2 at most one; observe current parser disposition on host flag', canBlock: output.decision === 'block', boundary: item.boundary, payload, output });
  }
  const output = normalizeStopResult({ contract: { name: 'normproof.completion-gate.stop', version: 'invalid' }, decision: 'allow', reasonCode: 'proven', proofVerdict: 'proven', evidenceIdentity: ['fixture'] });
  rows.push({ id: 'stop-parser-version-mismatch', status: output.decision === 'allow' ? 'unknown' : 'observed', evidenceTier: 'local-synthetic-parser-input', event: 'Stop', tool: null, timeoutMs: null,
    inputFidelity: 'explicit incompatible envelope passed directly to the production parser', failureDirection: 'unknown for incompatible contract', denyShape: 'unknown/incompatible_contract', reentry: false, canBlock: 'no execution attempted', reason: output.decision === 'allow'
    ? 'Flat parser accepts incompatible contract version; versioned delivery not proven' : 'Actual parser refused incompatible contract version', node: process.version, output });
}

async function completion() {
  const cases = JSON.parse(fs.readFileSync(path.join(scratch, 'stop-cases.json'), 'utf8'));
  const upstreamCli = cases.find((item: { boundary: string }) => item.boundary === 'r0a').cli;
  for (const scenario of ['proven', 'blocked', 'repair', 'not-configured', 'repeated-block']) {
    const root = path.join(scratch, `completion-${scenario}`);
    const fixture = cases.find((item: { id: string }) => item.id === `r0a-${scenario === 'proven' ? 'compliant' : 'violating'}`);
    fs.cpSync(fixture.workspace, root, { recursive: true });
    if (scenario === 'not-configured') fs.rmSync(path.join(root, '.normproof/judge-input.json'));
    execFileSync('git', ['init', '-q', root]);
    const command = scenario === 'repeated-block'
      ? "printf '%s' '{\"decision\":\"block\",\"reasonCode\":\"open_obligations\",\"proofVerdict\":\"not_proven\",\"evidenceIdentity\":[\"fixture:gap\"]}'"
      : `${quote(process.execPath)} ${quote(upstreamCli)} gate stop --emit-result`;
    config(path.join(root, '.agents/hooks.json'), { Stop: [{ hooks: [{ command, timeoutMs: 3000 }] }] });
    const hooks = new HookDispatcher(), observed: unknown[] = [], events: any[] = [], approvals: unknown[] = [];
    observe(hooks, observed);
    const runtimeConfig = getRuntimeConfig(root);
    let steps = 0;
    const tools = createCoreToolRegistry();
    const turn = await runCliRuntimeInvocation({ sessionId: `completion-${scenario}`, workspaceRoot: root, prompt: 'Observe the completion capability fixture',
      signal: new AbortController().signal, maxTurns: 5, agentMode: 'build', permissionScope: 'allow-all', runtimeConfig,
      providerCredentialResolution: { provider: 'openai', expectedEnvVarName: 'OPENAI_API_KEY' }, providerModeEnv: 'real',
      escalationPromptHandler: async prompt => { approvals.push({ promptId: prompt.id, decision: 'allow-once' }); return { promptId: prompt.id, decision: 'allow-once', respondedAt: 1 }; },
    }, { hooks, tools: () => tools, checkProviderReadiness: async () => ({ ok: true }),
      createReadinessTerminalEvent: () => { throw new Error('Unexpected readiness failure'); },
      createStep: () => async () => {
        steps++;
        return scenario === 'repair' && steps === 2
          ? { text: '', toolCalls: [{ id: 'repair-write', name: 'write', args: { path: 'src/module.ts', content: 'export function run() { return 1; }\n' } }], stopReason: 'tool_use' }
          : { text: 'Candidate answer', toolCalls: [], stopReason: 'stop' };
      },
    });
    for await (const event of turn.events) events.push(event);
    const checks = events.filter(event => event.type === 'lifecycle.record' && event.kind === 'hook_result');
    const states = events.filter(event => event.type === 'lifecycle.record' && event.kind === 'stop_state');
    rows.push({ id: `completion-${scenario}`, status: 'observed', node: process.version, evidenceTier: 'local-product-path-scripted', ...(scenario === 'repeated-block' ? {} : { boundary: 'r0a' }), event: 'Stop', tool: scenario === 'repair' ? 'write' : null,
      timeoutMs: 3000, inputFidelity: 'real CLI envelope + normal registration + actual repair write; scripted model step', failureDirection: 'block withholds completion; unknown cannot prove completion; neutral result stays unproven',
      denyShape: scenario === 'repeated-block' ? 'native flat block' : 'versioned Stop envelope', reentry: 'observe exact attemptId/count/active in lifecycle', canBlock: ['blocked', 'repeated-block'].includes(scenario) && events.filter(event => event.type === 'query.completed').length === 0,
      command, declaredConfig: JSON.parse(fs.readFileSync(path.join(root, '.agents/hooks.json'), 'utf8')),
      output: { observed, events, checks, states, approvals, steps, completed: events.filter(event => event.type === 'query.completed').length, completedUnproven: events.filter(event => event.type === 'query.completed_unproven').length,
        failed: events.filter(event => event.type === 'query.failed').length, finalSource: fs.readFileSync(path.join(root, 'src/module.ts'), 'utf8') } });
  }
}

try {
  for (const consumer of ['normal', 'prepared', 'security', 'git']) for (const mode of ['block', 'allow']) {
    try { await host(consumer, mode); } catch (error) { rows.push({ id: `host-${consumer}-${mode}`, status: 'unavailable', node: process.version, reason: error instanceof Error ? error.message : 'Host path unavailable' }); }
  }
  await configuration();
  await stop();
  await completion();
  fs.writeFileSync(path.join(scratch, 'host.json'), JSON.stringify(rows, null, 2));
} catch (error) {
  fs.writeFileSync(path.join(scratch, 'host.json'), JSON.stringify(rows, null, 2));
  throw error;
}
