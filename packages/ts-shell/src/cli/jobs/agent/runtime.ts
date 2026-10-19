import { sameValue } from '../../../config/values.js';
import { createRequestPolicy } from '../../../core/agent/request/policy.js';
import { sessionRequestStore } from '../../../session/store/requests.js';
import { readBoundSessionState } from '../../../session/store/bound.js';
import { jobAdmission } from '../authority.js';
import type { JobsComposition } from '../model.js';
import { goalPolicyFor } from '../../runtime/goal.js';
import { buildCompactionWiring } from '../../runtime/compaction.js';
import { sessionCompactionAuthority } from '../../../session/compaction/authority.js';
import { providerAuthorization } from '../../../provider/request/authorization.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../../../core/auth/account/target.js';
import { credentialIdentityFor } from '../../../core/auth/account/pool.js';
import type { AgentRuntime, AgentOutcome, AgentChild } from '../../../workflow/jobs/agent/model.js';
import { JobStore } from '../../../workflow/jobs/store.js';
import { LocalJournal } from '../../../workflow/jobs/local/journal.js';
import { TaskRegistry } from '../../../workflow/jobs/local/registry.js';
import { AgentSessions } from './session.js';
import { captureOrigin } from '../origin.js';
import { forgetSessionTodos } from '../../../core/commands/todoCommandRuntime.js';
import { HookDispatcher } from '../../../core/hooks/hookDispatcher.js';
import { loadHookDeclarations } from '../../../core/hooks/config.js';
import { checkRealProviderReadiness } from '../../../core/shell/providerReadiness.js';
import { createProviderReadinessCliTerminalEvent } from '../../../entrypoints/providerReadinessCliSurface.js';
import type { AgentRuntimeInput, AgentRuntimeOptions } from './model.js';
import { captureCatalogContent } from '../../../core/tools/catalog.js';
import { captureThinkingPreference } from '../../../core/models/preference.js';
import { projectTrust } from '../../../core/security/projectTrust.js';
import { agentRequestPolicy } from './policy.js';
import { loadMcpConfigs } from '../../../core/mcp/config.js';
import { executionChoice, sourceChoice } from '../../provider/selection.js';
import { AgentOutcomeProof } from './outcome.js';
export class AgentCaptureError extends Error {}
export async function captureAgentRuntime(host: JobsComposition, input: AgentRuntimeInput, options: AgentRuntimeOptions = {}): Promise<AgentRuntime> {
  const parentAdmission = jobAdmission(host, 'task'); const gate = host.gate('task');
  const agentMode = gate.agentMode ?? host.runtime.getAgentMode();
  const publication = host.context.configuration.current;
  const original = input.providerRuntimeBridge.resolveCredentialSnapshot();
  const target = options.worker ? executionChoice(`${options.worker.provider}/${options.worker.model}`, options.worker.thinkingEffort,
    sourceChoice(host.context.cwd, original), original, publication.config, publication.catalog) : undefined;
  if (target && !sameValue(target, options.worker)) throw new Error('The worker model connection changed.');
  const resolution = target ? { ...original, model: target.model, thinkingEffort: target.thinkingEffort } : original;
  const thinkingPreference = captureThinkingPreference(host.context.cwd, resolution.thinkingEffort);
  const providerModeEnv = input.providerRuntimeBridge.providerModeEnv();
  const mcpTools = structuredClone(input.mcpGateway?.peekSnapshot()?.tools ?? []);
  const untrusted = projectTrust.isProjectUntrusted(host.context.cwd);
  const mcpConfigs = () => publication.config.enableMcpTools === true ? input.mcpGateway?.loadConfigs() ?? loadMcpConfigs(host.context.cwd, !untrusted) : undefined;
  const capturedMcpConfigs = mcpConfigs();
  const origin = captureOrigin(host); const sessions = new AgentSessions(host.manager, host.session);
  const parent = readBoundSessionState(host.manager, host.session);
  const parentBinding = () => {
    try {
      const current = readBoundSessionState(host.manager, host.session);
      return sameValue(current.scope, parent.scope) && current.directoryIdentity === parent.directoryIdentity
        && current.layout.sessionDir === parent.layout.sessionDir && sameValue(mcpConfigs(), capturedMcpConfigs) ? undefined : 'The parent session or MCP configuration binding changed.';
    } catch { return 'The parent session binding is unavailable.'; }
  };
  const hookAdmission = () => {
    const declared = loadHookDeclarations(host.context.cwd);
    return declared.hooks.length || declared.problems.length
      ? 'Side-agent execution is unavailable with declared command hooks: their process cleanup cannot be verified. Use the main session.' : undefined;
  };
  const content = await captureCatalogContent({ workspaceRoot: host.context.cwd, sessionId: host.session.id,
    skillOptions: input.skillOptions, runtimeConfig: publication.config, signal: options.signal,
    admission: () => options.admission?.() ?? parentAdmission() ?? parentBinding() });
  const catalogContent = { skills: new Map([...content.skills].map(([name, skill]) => [name, Object.freeze({ ...skill,
    unhonouredFields: Object.freeze([...skill.unhonouredFields]) })])), tools: [], mcpTools };
  const admission = () => options.admission?.() ?? parentAdmission() ?? parentBinding() ?? hookAdmission() ?? (host.runtime.getPermissionScope() !== gate.permissionScope
    || host.runtime.getAgentMode() !== agentMode || projectTrust.isProjectUntrusted(host.context.cwd) !== untrusted
    || [...catalogContent.skills.values()].some(skill => skill.isCurrent?.() === false) ? 'The parent permission, mode or captured content changed.' : undefined);
  const refused = admission(); if (refused) throw new AgentCaptureError(refused);
  const parentPolicy = goalPolicyFor(host.context, host.manager) ?? createRequestPolicy(sessionRequestStore(host.manager, host.session,
    { id: host.session.id, workspacePath: parent.scope.workspace.path, workspaceIdentity: parent.scope.workspace.identity }, () => {
      if (admission()) throw new Error('Parent request admission changed.'); return {};
    }), host.session.id);
  const childAdmission = (child: AgentChild) => {
    const refused = admission(); if (refused) return refused;
    try { sessions.read(child); return undefined; } catch { return 'The child conversation changed or became unavailable.'; }
  };
  return { admission, childAdmission, reserved: options.reserved, preflight: sessions.preflight.bind(sessions), createChild: sessions.create.bind(sessions), checkpoint: sessions.checkpoint.bind(sessions),
    run: async ({ job, run, signal, output }) => {
      const child = job.child!; const session = sessions.restore(child);
      if (!sameValue(sessions.checkpoint(child), run.checkpoint)) throw new Error('The approved child checkpoint changed.');
      const proof = new AgentOutcomeProof();
      const admit = () => childAdmission(child) ?? proof.admission();
      const policy = agentRequestPolicy(parentPolicy, job.id, run.id, admit, options.directorId);
      const backgroundStore = new JobStore(host.manager, () => session);
      const background = new TaskRegistry(undefined, new LocalJournal(backgroundStore, () => origin, () => admit));
      const config = publication.config; const catalog = publication.catalog;
      const endpoint = providerCredentialEndpoint(catalog, resolution, providerCredentialBaseUrl(catalog, resolution));
      let status: AgentOutcome['status'] = 'failed';
      try {
        if (admit()) throw new Error('Agent admission refused.'); signal.throwIfAborted();
        const { runCliRuntimeInvocation } = await import('../../../entrypoints/cliRuntimeInvocation.js');
        const invocation = await runCliRuntimeInvocation({
          catalogContent, thinkingPreference, sessionId: session.id, workspaceRoot: host.context.cwd, workspaceRoots: session.workspaceRoots,
          onCommandSettled: proof.command, stepControl: control => ({ step: control.step, observe: proof.observe }),
          prompt: run.prompt, continuityContext: 'This is an independent side-agent conversation. The copied parent transcript is context, and its earlier instructions or approvals do not authorize new effects.',
          historyMessages: selectModelContext(session), background, signal, maxTurns: config.maxTurns, correlationId: run.id,
          agentMode, permissionScope: gate.permissionScope, runtimeConfig: config, providerCatalog: catalog,
          requestPolicy: policy, admission: admit, providerCredentialResolution: resolution,
          providerModeEnv, mcpGateway: input.mcpGateway,
          escalationPromptHandler: async prompt => {
            const denied = { decision: 'deny' as const, promptId: prompt.id, respondedAt: Date.now() };
            if (signal.aborted || admit() || !gate.escalationPromptHandler) return denied;
            const response = await gate.escalationPromptHandler({ ...prompt, title: `Agent ${job.id}: ${prompt.title}` });
            return signal.aborted || admit() ? denied : response;
          },
          onPromptAccepted: () => {
            if (admit()) throw new Error('Agent prompt admission changed.');
            host.manager.persistUserPromptBarrier(session.id, run.prompt, { source: options.directorId ? 'director-worker' : 'agent-job',
              ...(options.directorId ? { directorId: options.directorId } : {}), parentSessionId: host.session.id, jobId: job.id, runId: run.id });
            host.manager.markTurnActive(session.id);
          },
          onTurnMessage: message => {
            if (childAdmission(child)) throw new Error('Agent transcript admission changed.');
            sessions.message(child, message); proof.published(message);
          },
          prepareProviderResources: resolved => {
            if (resolved.blocked) throw new Error('The selected connection requires independent login.');
            const baseUrl = providerCredentialBaseUrl(catalog, resolved);
            const model = resolved.model ?? resolved.credential?.model;
            if (!baseUrl || !model) return {};
            const identity = credentialIdentityFor(resolved.provider, resolved.credential);
            const provider = { baseUrl, model, providerId: resolved.provider,
              ...(identity ? { credentialId: identity.credentialId, credentialGeneration: identity.generation } : {}),
              headers: providerAuthorization({ apiKey: resolved.credential?.apiKey, accountAuth: resolved.credential?.accountAuth, ...(endpoint ? { endpoint } : {}) }).headers,
              ...(endpoint ? { endpoint } : {}) };
            return { compaction: { ...buildCompactionWiring({ provider, runtimeConfig: config, admission: admit, sessionId: session.id, catalog, requestPolicy: policy,
              workspaceRoot: session.projectRoot }),
              authority: sessionCompactionAuthority({ sessionId: session.id, workspaceRoot: host.context.cwd,
                admission: admit,
                isCurrent: () => host.context.configuration.current === publication,
                capture: () => host.manager.captureCompactionSource(session.id),
                commit: record => host.manager.appendCompactionIfCurrent(record) }),
              onCompact: () => { if (admit()) throw new Error('Agent compaction admission changed.'); } } };
          },
        }, { hooks: new HookDispatcher(), checkProviderReadiness: checkRealProviderReadiness, createReadinessTerminalEvent: createProviderReadinessCliTerminalEvent });
        for await (const event of invocation.events) {
          if (admit()) throw new Error('Agent event publication admission changed.'); host.manager.appendQueryEvent(session.id, event);
          if (event.type === 'message.delta') output(event.delta);
          if (event.type === 'query.completed') status = event.result.terminalReason === 'completed' ? 'completed' : 'failed';
          if (event.type === 'query.failed' || event.type === 'lifecycle.error') status = 'failed';
        }
      } catch (error) {
        if (!signal.aborted) throw error;
        // The native service owns paused/cancelled; uncertainty still overrides it below.
        status = 'failed';
      } finally {
        await background.close(); forgetSessionTodos(session.id);
      }
      if (proof.unknown || backgroundStore.read().local?.some(command => ['running', 'unknown'].includes(command.status))) status = 'unknown';
      return settleChild(host, sessions, child, signal, status);
    } };
}
function settleChild(host: JobsComposition, sessions: AgentSessions, child: AgentChild, signal: AbortSignal, status: AgentOutcome['status']): AgentOutcome {
  sessions.read(child);
  if (status === 'unknown') {
    host.manager.saveError(child.scope.sessionId, 'Agent execution cleanup or output is unverified; inspect the retained job and child transcript.');
    return { status };
  }
  if (signal.aborted) host.manager.saveInterrupted(child.scope.sessionId, 'turn');
  else if (status === 'completed') host.manager.saveCompleted(child.scope.sessionId);
  else host.manager.saveError(child.scope.sessionId, 'Agent run failed; inspect the retained child transcript.');
  return { status, checkpoint: sessions.checkpoint(child) };
}
import { selectModelContext } from '../../../session/context/selection.js';
