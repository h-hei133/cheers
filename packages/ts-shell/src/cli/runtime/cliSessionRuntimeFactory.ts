import { profileScope } from '../../core/paths/profile/scope.js';
import type { RuntimeConfig } from "../../config/runtimeConfig.js";
import { configurationOperation } from '../../core/shell/scope.js';
import { credentialIdentityFor } from '../../core/auth/account/pool.js';
import { assertScopedModel } from '../../config/scope/projection.js';
import type { ProviderCredentialResolution } from "../../core/shell/providerCredentials.js";
import { configurationAdmission } from "../../core/shell/configuration.js";
import { refreshShellRuntimeConfig } from "../../core/shell/runtimeContext.js";
import { admittedFetch, assertAdmission, type Admission } from "../../core/network/admission.js";
import type { CoreMcpGateway } from "../../core/mcp/gateway.js";
import { messageToText } from "../../model-adapters/multimodal.js";
import type { Interface as ReadlineInterface } from "node:readline";
import process from "node:process";

import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import {
  ShellSessionRuntime,
  type PromptRun,
} from "../../core/shell/sessionRuntime.js";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import type { SessionManager } from "../../session/SessionManager.js";
import { createTranscriptEntryId } from "../../session/sessionEventCodec.js";
import type { CliOptions } from "../options/cliOptions.js";
import {
  createCliApprovalEscalationBridge,
} from "../approval/cliApprovalEscalationBridge.js";
import type { CliApprovalModeState } from "../approval/cliApprovalModeState.js";
import type { CliProviderRuntimeBridge } from "../provider/cliProviderRuntimeBridge.js";
import type { EscalationPrompt } from "../../core/shell/approval/contract.js";
import { promptInteractiveQuestions } from "../interactive/interactiveAskBridge.js";
import { streamCliRuntimePrompt } from "./cliRuntimeInvocationBridge.js";
import { researchRunFor } from './research.js';
import { cancelGitFor } from './git.js';
import { installGitCliRuntime } from './gitGate.js';
import { installDataTransfer } from '../data/transfer.js';
import { selectModelContext } from '../../session/context/selection.js';
import { installCollaborationRuntime } from './collaboration.js';
import { installSshRuntime, cancelSshFor } from './ssh.js';
import { installJobsRuntime, jobsRunnerFor } from './jobs.js';
import { directorRunFor, cancelDirectorFor } from './director.js';
import { cancelMediaFor } from './media.js';
import { cancelEvaluationFor } from './evaluation.js';
import { admitCollaborationPrompt, settleCollaborationPrompt } from '../collaboration/acceptance.js';
import { collaborationAdmissionFor } from '../collaboration/policy.js';
import { installSecurityRuntime, cancelSecurityFor } from './security.js';
import { installAgentsRuntime } from './agents.js';
import { installMcpRuntime, cancelMcpFor } from './mcp.js';
import { installExtensionRuntime, cancelExtensionsFor, refreshExtensionsFor } from './extensions.js';
import { gitRequestMode } from '../../workflow/git/operation/policy.js';
import { goalObjectiveFor, goalPolicyFor, prepareGoalSession } from './goal.js';
import { installGoalScheduler } from './goalScheduling.js';
import { acceptanceCapture } from '../../planning/goal/acceptance/capture.js';
import { planningSettlement } from './planning.js';
import { handoffAcceptance, handoffRunFor, handoffSettlement } from './handoff.js';
import { advisorCheckpointFor } from './advisor.js';
import { readGoalEdit } from '../../planning/goal/store.js';
import type { GoalScheduler } from '../../planning/goal/run/scheduler.js';
import { compactSessionHistory } from "../../core/shell/compaction.js";
import { recordCompactionCheckpoint } from "../../context/compact/checkpoint/compactionCheckpoint.js";
import { createProjectMemoryLocalStore } from "../../memory/projectMemoryLocalStore.js";
import type { InteractiveApprovalResult } from "../interactive/picker/approval.js";
import { requestCompactionSummary } from "../../core/query/compaction/summarize.js";
import { providerFetchForEndpoint, providerFetchFromTimeouts, providerTimeoutsFrom } from "../../provider/request/fetch.js";
import { accountAuthFor, providerAuthorization } from "../../provider/request/authorization.js";
import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../../core/auth/account/target.js';
import { configuredOutputLimit } from '../../provider/request/output.js';
import { catalogModel, catalogProvider } from "../../core/models/catalog.js";
import { sessionUsageRecorder } from '../../session/store/usage.js';
import { resolveRequestShape } from "../../core/models/requestShape.js";
import { endpointShape, type EndpointKind } from "../../provider/endpoints/index.js";
import { projectMemoryRootFor } from "../../memory/projectMemoryRoot.js";
import { createCacheWarmingRunner, type CacheWarmingRunner } from "../../turn/cacheWarm.js";
import { resolveCacheWarmingMode } from "../../core/models/cacheEconomics.js";
import { cacheRefreshFor } from "./cache.js";
import { allowsSelfInitiatedRequests } from "../../core/network/policy.js";
import { renewStoredAccount } from "../../core/auth/account/renewal.js";
import { markContextUnknown } from "../../observability/usageTelemetry.js";
import { recordCount } from "../../observability/metrics.js";
import type { CatalogProvider } from "../../core/models/catalog.js";
import type { CompactionSetup } from "../../turn/session.js";
import { buildCompactionWiring, nativeCompactionAuthority, toCompactionMessages, type CompactionProvider } from './compaction.js';
import { providerModelTransport } from '../../provider/request/transport.js';
import { installRuleControlRuntime, takeForcedTool } from './ruleControls.js';
import { contextEntryStillAuthorized, assertContextBounds } from '../../context/attachment/entry.js';
import { foregroundTools, promptWithContext } from './prompt.js';
import { prepareContextInjection } from './context/injection.js';
import { sourceReaderFor } from '../data/access.js';
import { installUsageRuntime, usageResetApproval } from './usage.js';
import { captureSummaryRole } from '../provider/summary.js';

interface ProviderRenewal {
  readonly provider?: CompactionProvider;
  readonly failure?: string;
}

export function createCliSessionRuntime(input: {
  readonly sessionManager: SessionManager;
  readonly mcpGateway?: CoreMcpGateway;
  readonly renderer: StreamingRenderer;
  readonly runtimeContext: ShellRuntimeContext;
  readonly options: CliOptions;
  readonly approvalTrustPolicy: ApprovalTrustPolicy;
  readonly approvalModeState: CliApprovalModeState;
  readonly providerRuntimeBridge: CliProviderRuntimeBridge;
  readonly getReadline: () => ReadlineInterface | null;
  readonly isStdinTty?: () => boolean;
  /**
   * Read at prompt time, not at construction: the interactive surface installs
   * its handler after this runtime is created, so a plain value here would
   * freeze at undefined and the approval overlay would never appear.
   */
  readonly getPromptInteractiveApproval?: () => (
    | ((prompt: EscalationPrompt) => Promise<InteractiveApprovalResult>)
    | undefined
  );
}): ShellSessionRuntime {
  prepareGoalSession(input.runtimeContext, input.sessionManager);
  const isStdinTty = input.isStdinTty ?? (() => Boolean(process.stdin.isTTY));
  /**
   * The runner the current run is using, so the next run can retire it.
   *
   * Held here rather than on the runner because it is the factory that knows a
   * new run has begun.
   */
  let previousCacheWarming: CacheWarmingRunner | undefined;
  let releaseCacheListener: (() => void) | undefined;
  let cacheWarmingSessionId: string | undefined;
  input.runtimeContext.freshState = {
    admission: () => sessionRuntime.getCurrentRunController() !== null ? 'Wait for the current provider turn before resetting local state.' : undefined,
    clearCache: async () => {
      const sessionId = input.runtimeContext.session.id;
      const owner = previousCacheWarming;
      if (!owner || cacheWarmingSessionId !== sessionId) return 'unchanged';
      const result = await owner.reset();
      if (input.runtimeContext.session.id !== sessionId || owner !== previousCacheWarming) return 'unknown';
      previousCacheWarming = undefined; cacheWarmingSessionId = undefined;
      releaseCacheListener?.(); releaseCacheListener = undefined;
      return result;
    },
  };

  /**
   * The provider both compaction paths summarize with, or nothing when none is
   * configured.
   *
   * Authentication may be a static key, an account token, or an endpoint signer
   * that resolves credentials at dispatch. A signer needs no key in this snapshot.
   *
   * The renewal runs on the explicit paths because they are request paths of their
   * own: `/compact` and the abandoned-turn summary do not pass through the
   * invocation path where the turn's own token is renewed, so an expired account
   * token would be carried into a summarization request and come back as a provider
   * refusal. The turn's own path has already renewed by the time it gets here.
   */
  const compactionTarget = (resolved: ProviderCredentialResolution, catalog: readonly CatalogProvider[]) => {
    if (resolved.blocked) return undefined;
    const baseUrl = providerCredentialBaseUrl(catalog, resolved);
    if (catalogProvider(catalog, resolved.provider, baseUrl).ambiguous) return undefined;
    const credential = resolved.credential;
    const accountAuth = accountAuthFor(resolved.provider, credential ?? {});
    if (!credential?.apiKey && !accountAuth && !endpointShape(providerCredentialEndpoint(catalog, resolved, baseUrl)).signer) return undefined;
    const model = resolved.model ?? credential?.model;
    if (!baseUrl || !model) return undefined;
    return {
      provider: resolved.provider,
      apiKey: credential?.apiKey,
      accountAuth,
      endpoint: providerCredentialEndpoint(catalog, resolved, baseUrl),
      baseUrl,
      model,
    };
  };

  /** The provider the turn's own compaction summarizes with. */
  const compactionProvider = (resolved: ProviderCredentialResolution, catalog: readonly CatalogProvider[]): CompactionProvider | undefined => {
    const target = compactionTarget(resolved, catalog);
    if (!target) return undefined;
    // Resolved from the catalogue the way the turn resolves it, so a model
    // that rejects a temperature does not get one in its summary request
    // either. The compaction body carries no temperature of its own; the flag
    // is what the protocols gate on.
    const shape = resolveRequestShape(catalog, target.provider, target.model, undefined, target.baseUrl);
    const identity = credentialIdentityFor(target.provider, { connectionId: resolved.credential?.connectionId,
      accountAuth: target.accountAuth, apiKey: target.apiKey });
    return {
      headers: providerAuthorization({
        apiKey: target.apiKey,
        accountAuth: target.accountAuth,
        ...(target.endpoint ? { endpoint: target.endpoint } : {}),
      }).headers,
      baseUrl: target.baseUrl,
      model: target.model,
      providerId: target.provider,
      ...(target.endpoint ? { endpoint: target.endpoint } : {}),
      ...(identity ? { credentialId: identity.credentialId, credentialGeneration: identity.generation } : {}),
      supportsTemperature: shape.supportsTemperature,
      shape,
    };
  };

  /** The same, with an expiring account token replaced before the request is built. */
  const renewedProvider = async (resolved: ProviderCredentialResolution, config: RuntimeConfig, admission: Admission, catalog: readonly CatalogProvider[], reportFailure = true): Promise<ProviderRenewal> => {
    assertAdmission(admission);
    assertScopedModel(config, resolved);
    const target = compactionTarget(resolved, catalog);
    if (!target) return {};
    const renewed = await renewStoredAccount({
      workspaceRoot: input.runtimeContext.projectRoot,
      sessionId: input.runtimeContext.session.id,
      resolution: resolved,
      admission,
      fetchImpl: admittedFetch(providerFetchFromTimeouts(providerTimeoutsFrom(config)), admission),
    });
    if (renewed.failure) {
      if (reportFailure) input.renderer.renderLine(renewed.failure);
      return { failure: renewed.failure };
    }
    if (renewed.stored) reportCredentialPublication();
    assertAdmission(admission);
    const identity = credentialIdentityFor(target.provider, { connectionId: resolved.credential?.connectionId,
      accountAuth: renewed.accountAuth ?? target.accountAuth, apiKey: target.apiKey });
    return { provider: {
      headers: providerAuthorization({
        apiKey: target.apiKey,
        accountAuth: renewed.accountAuth ?? target.accountAuth,
        ...(target.endpoint ? { endpoint: target.endpoint } : {}),
      }).headers,
      baseUrl: target.baseUrl,
      model: target.model,
      providerId: target.provider,
      shape: resolveRequestShape(catalog, target.provider, target.model, undefined, target.baseUrl),
      supportsTemperature: resolveRequestShape(catalog, target.provider, target.model, undefined, target.baseUrl).supportsTemperature,
      ...(target.endpoint ? { endpoint: target.endpoint } : {}),
      ...(identity ? { credentialId: identity.credentialId, credentialGeneration: identity.generation } : {}),
    } };
  };
  const reportCredentialPublication = () => {
    const result = refreshShellRuntimeConfig(input.runtimeContext);
    if (result.status !== 'applied') input.renderer.renderLine('Credential saved; configuration was not applied. Reload status: ' + result.status + '.');
    return result.status === 'applied';
  };
  let goalScheduler: GoalScheduler | undefined;
  const projectMemoryStore = createProjectMemoryLocalStore({
    ref: { mode: 'explicit-local', root: projectMemoryRootFor(input.runtimeContext.projectRoot) },
  });
  input.runtimeContext.preparePromptContext = (prompt, signal) => prepareContextInjection(input.runtimeContext, projectMemoryStore, prompt, signal);
  const sessionRuntime: ShellSessionRuntime = new ShellSessionRuntime({
    admitPrompt: admitCollaborationPrompt.bind(undefined, input.runtimeContext),
    promptSettled: handoffSettlement(input.runtimeContext, settleCollaborationPrompt.bind(undefined, input.runtimeContext)),
    onCancelRequested: () => { goalScheduler?.interrupt(); cancelDirectorFor(input.runtimeContext); cancelEvaluationFor(input.runtimeContext); cancelMediaFor(input.runtimeContext); cancelGitFor(input.runtimeContext); cancelSecurityFor(input.runtimeContext); cancelExtensionsFor(input.runtimeContext); cancelMcpFor(input.runtimeContext); cancelSshFor(input.runtimeContext); input.mcpGateway?.cancelContent(); },
    configuredAgentMode: () => input.runtimeContext.runtimeConfig.agentMode,
    sessionManager: input.sessionManager,
    renderer: input.renderer,
    // The store the memory commands write through and the injection planner
    // reads from. Without it every one of them reported `Store mode: disabled`,
    // and `/memory save` had nowhere to put a record — the chain was absent
    // rather than broken at one link.
    //
    // The root is the project's own directory, so a memory travels with the
    // repository rather than living only on the machine that recorded it. It
    // sits one level below the subagent memories, which name a directory after
    // each agent: the two must not share a path, and they do not.
    projectMemoryStore,
    compactHistory: (sessionId, signal, instructions) => {
      signal.throwIfAborted();
      const operation = configurationOperation(input.runtimeContext);
      const config = operation.config; const catalog = operation.publication.catalog;
      const workspaceRoot = input.runtimeContext.projectRoot;
      const resolved = input.providerRuntimeBridge.resolveCredentialSnapshot();
      const admission = operation.admission;
      const main = config.sessionModelRoles?.summary
        ? Promise.resolve({ provider: compactionProvider(resolved, catalog) } as ProviderRenewal)
        : renewedProvider(resolved, config, admission, catalog, false);
      return main.then(({ provider, failure }) => {
        if (!provider) {
          return {
            status: "failed" as const,
            reason: failure ?? `No credential for provider ${resolved.provider}; set ${resolved.expectedEnvVarName} or configure a connection.`,
          };
        }
        assertAdmission(admission);
        signal.throwIfAborted();
        const wiring = buildCompactionWiring({ provider, runtimeConfig: config, admission, sessionId, catalog, workspaceRoot,
          onCredentialPersisted: reportCredentialPublication,
          requestPolicy: goalPolicyFor(input.runtimeContext, input.sessionManager) });
        return compactSessionHistory({
          store: input.sessionManager,
          sessionId,
          authority: nativeCompactionAuthority({ sessionId, workspaceRoot, admission,
            publication: operation.publication, configuration: input.runtimeContext.configuration, store: input.sessionManager }),
          policy: wiring.policy,
          summarize: wiring.summarize,
          summarizeTurnPrefix: wiring.summarizeTurnPrefix,
          signal,
          instructions,
          // A user typed this one, which is the distinction the hook payload
          // could not previously make: the automatic path reports `threshold` or
          // `overflow`, and this path is the only `manual`.
          reason: "manual",
          workspaceRoot,
          // The checkpoint is written here, after the condensation, because the
          // store it feeds is the same one the automatic path writes through.
          // Previously the command side wrote it before knowing whether any
          // condensing happened, which is how a preview staged an injection.
          checkpoint: {
            sessionScopeId: profileScope(`session:${sessionId}`),
            sourceCommand: "/compact",
            projectRoot: workspaceRoot,
          },
        });
      });
    },
    summarizeAbandonedTurns: (messages) => {
      const operation = configurationOperation(input.runtimeContext);
      const config = operation.config; const catalog = operation.publication.catalog;
      const usageFor = sessionUsageRecorder(input.runtimeContext.session.id);
      const requestPolicy = goalPolicyFor(input.runtimeContext, input.sessionManager);
      const resolved = input.providerRuntimeBridge.resolveCredentialSnapshot();
      const admission = operation.admission;
      const role = captureSummaryRole({ config, catalog, workspaceRoot: input.runtimeContext.projectRoot, admission,
        onCredentialPersisted: reportCredentialPublication });
      const selected = role ? role.resolve().then(provider => ({ provider })) : renewedProvider(resolved, config, admission, catalog);
      return selected.then(({ provider }) => {
        assertAdmission(admission);
        if (!provider) return undefined;
        return requestCompactionSummary({
          requestPolicy, purpose: 'branch-summary', maxOutputTokens: configuredOutputLimit(config, provider.endpoint),
          onUsage: usageFor({ provider: provider.providerId ?? '', model: provider.model, baseUrl: provider.baseUrl,
            rates: catalogModel(catalog, provider.providerId ?? '', provider.model, provider.baseUrl)?.cost }),
          modelTransport: providerModelTransport(config, provider.endpoint, admission),
          provider,
          // The third of the three summarisers, and the one that was missed: it kept
          // the global fetch, so a `/back` whose summary stalled waited forever with
          // no deadline and no abort signal. Same wiring as its two siblings.
          fetchImpl: providerFetchForEndpoint(config, provider.endpoint, endpointShape, admission),
          messages: toCompactionMessages(messages),
        });
      });
    },
    runPrompt: (prompt, signal, _runtimeSeed, _continuityState, attachments, continuityContext, onPromptAccepted): PromptRun => {
      const operation = configurationOperation(input.runtimeContext);
      const publication = operation.publication;
      const config = operation.config;
      const catalog = publication.catalog;
      const backgroundSignal = input.runtimeContext.configuration.backgroundSignal;
      const parentAdmission = collaborationAdmissionFor(input.runtimeContext, operation.admission);
      const resolvedCredential =
        input.providerRuntimeBridge.resolveCredentialSnapshot();
      const sessionId = input.runtimeContext.session.id;
      const director = directorRunFor(input.runtimeContext, input.sessionManager, parentAdmission);
      const handoff = handoffRunFor(input.runtimeContext, input.sessionManager, sessionRuntime, resolvedCredential, signal,
        parentAdmission, input.renderer.renderLine.bind(input.renderer));
      const requestAdmission = director?.admission ?? handoff?.admission ?? parentAdmission;
      let attachmentAdmission: () => string | undefined = () => undefined;
      const admission = () => requestAdmission() ?? attachmentAdmission();
      const research = researchRunFor(input.runtimeContext, input.sessionManager, input.renderer,
        goalPolicyFor(input.runtimeContext, input.sessionManager));
      const requestPolicy = director ? director.policy(research.requestPolicy) : handoff ? handoff.policy(research.requestPolicy) : research.requestPolicy;
      // A runner left over from an earlier run in this session is still holding
      // an idle timer, and it would refresh the same prefix the new runner is
      // about to refresh — the same money spent twice. Only the current run
      // keeps a window warm.
      releaseCacheListener?.();
      previousCacheWarming?.stop();
      previousCacheWarming = undefined;
      const prepareProviderResources = (resolved: ProviderCredentialResolution) => {
        const activeProvider = compactionProvider(resolved, catalog);
        // The prices and the cache window belong to the model, so they are read
        // from the catalogue entry this run is talking to.
        const warmingTarget = compactionTarget(resolved, catalog);
        const warmingModel = warmingTarget
          ? catalogModel(catalog, warmingTarget.provider, warmingTarget.model, warmingTarget.baseUrl)
          : undefined;
        // Automatic compaction needs a provider to write the checkpoint; without
        // one the turn runs with the history it has and overflow reports itself.
        // Built per run rather than per session: the model can change between
        // runs, and the prices and window the decision rests on are properties of
        // the model.
        // A refresh is a request nobody asked for, so it answers to the same switch
        // as every other one. Gated here rather than inside the runner: the runner
        // decides whether a refresh is worth its price, and whether this session
        // may make unasked requests at all is a different question with a different
        // answer.
        const mayRefreshOnItsOwn = allowsSelfInitiatedRequests({
          configuredOffline: config.offline === true,
        });
        const cacheWarming = createCacheWarmingRunner({
          mode: mayRefreshOnItsOwn
            ? resolveCacheWarmingMode(config.cacheWarming)
            : "off",
          ...(warmingModel ? { cost: warmingModel.cost, promptCache: warmingModel.promptCache } : {}),
          // Replays the request that went out. Rebuilding it here would produce a
          // different prefix, and a different prefix is a cache miss at the full
          // write price — the opposite of what a refresh is for.
          ...cacheRefreshFor({ sessionId, runtimeConfig: config, admission,
            requestPolicy,
            ...(warmingTarget ? { baseUrl: warmingTarget.baseUrl, rates: warmingModel?.cost } : {}),
            ...(activeProvider ? { provider: activeProvider } : {}),
            ...(credentialIdentityFor(resolved.provider, resolved.credential) ? { credential: credentialIdentityFor(resolved.provider, resolved.credential)! } : {}),
            renewHeaders: async () => (await renewedProvider(resolved, config, admission, catalog)).provider?.headers,
            isCurrent: () => {
              return !admission() && input.runtimeContext.configuration.current === publication &&
                input.runtimeContext.session.id === sessionId &&
                input.sessionManager.getSession(sessionId)?.turns.at(-1)?.id === sourceEntryId;
            },
          }),
          onDecision: (_decision, stopReason) => { if (stopReason) input.renderer.renderLine(`Cache refresh stopped: ${stopReason}`); },
        });
        previousCacheWarming = cacheWarming;
        cacheWarmingSessionId = sessionId;
        const stopBackground = () => cacheWarming.stop();
        backgroundSignal.addEventListener('abort', stopBackground, { once: true });
        releaseCacheListener = () => backgroundSignal.removeEventListener('abort', stopBackground);
        if (backgroundSignal.aborted) cacheWarming.stop();

        const compaction: CompactionSetup | undefined = activeProvider
          ? {
              ...buildCompactionWiring({ provider: activeProvider, runtimeConfig: config, admission, sessionId, catalog, requestPolicy,
                workspaceRoot: input.runtimeContext.projectRoot, onCredentialPersisted: reportCredentialPublication }),
              authority: nativeCompactionAuthority({ sessionId, workspaceRoot: input.runtimeContext.projectRoot,
                admission, publication, configuration: input.runtimeContext.configuration, store: input.sessionManager }),
              onCompact: () => {
                markContextUnknown(sessionId);
                // Counted at the point a compaction actually happened, which is
                // low frequency, so recording it inline is not a hot path.
                recordCount("compaction.runs", 1, {});
              },
            }
          : undefined;
        return handoff ? handoff.resources({ compaction, cacheWarming }) : { compaction, cacheWarming };
      };
      const escalationPromptHandler = createCliApprovalEscalationBridge({
        renderer: input.renderer,
        readline: input.getReadline,
        getViewMode: () => sessionRuntime.getViewMode(),
        trustPolicy: input.approvalTrustPolicy,
        getProjectRoot: () => input.runtimeContext.projectRoot,
        getNonInteractiveDecision: () =>
          !isStdinTty()
            ? input.options.nonInteractiveApproval
            : undefined,
        getApprovalModeObject: input.approvalModeState.get,
        sessionManager: input.sessionManager,
        getSessionId: () => input.runtimeContext.session.id,
        getPermissionScope: () => sessionRuntime.getPermissionScope(),
        promptInteractiveApproval: input.getPromptInteractiveApproval?.(),
      });
      const existingSession = input.sessionManager.getSession(
        input.runtimeContext.session.id,
      );
      const allTurns = selectModelContext(existingSession);
      const historyMessages =
        allTurns.length > 0 &&
        messageToText(allTurns[allTurns.length - 1]?.content) === prompt
          ? allTurns.slice(0, -1)
          : allTurns;

      let sourceEntryId = allTurns.at(-1)?.id;
      const promptEntryId = sourceEntryId;
      const currentGoal = readGoalEdit(input.sessionManager, input.runtimeContext.session).goal;
      refreshExtensionsFor(input.runtimeContext);
      const attachedContext = [
        ...(input.runtimeContext.contextAttachments ?? []),
        ...(input.runtimeContext.transientContextAttachments ?? []),
      ];
      assertContextBounds(attachedContext);
      const readAttachedSource = sourceReaderFor(input.runtimeContext, signal);
      attachmentAdmission = () => attachedContext.every(entry => contextEntryStillAuthorized(input.runtimeContext.cwd, entry, readAttachedSource))
        ? undefined : 'Extra context changed or is no longer authorized. Drop or reattach the selected files before sending.';
      const attachmentRefusal = attachmentAdmission();
      if (attachmentRefusal) throw new Error(attachmentRefusal);
      const forcedTool = takeForcedTool(input.runtimeContext);
      const promptWithAttachments = promptWithContext(prompt, attachedContext);
      const run = streamCliRuntimePrompt({
        stepControl: handoff?.control,
        onCommandSettled: handoff?.commandSettled.bind(handoff),
        background: jobsRunnerFor(input.runtimeContext),
        featureTools: foregroundTools(input.runtimeContext, research.featureTools, director?.featureTools),
        ...(forcedTool ? { allowedTools: [forcedTool] } : {}),
        checkpoint: advisorCheckpointFor(input.runtimeContext, input.sessionManager, input.renderer, promptEntryId),
        checkpointError: input.renderer.renderLine.bind(input.renderer),
        ...(promptEntryId ? { correlationId: promptEntryId, commandProof: acceptanceCapture(input.sessionManager,
          input.runtimeContext.session, promptEntryId, currentGoal?.id) } : {}),
        goalObjective: goalObjectiveFor(input.runtimeContext, input.sessionManager),
        requestPolicy,
        mcpGateway: input.mcpGateway,
        // Carried so the tool pool honours disabledTools / hiddenToolPrefixes.
        runtimeConfig: director?.config(config) ?? config,
        providerCatalog: catalog,
        prompt: promptWithAttachments,
        onPromptIdentity: identity => {
          if (input.runtimeContext.session.id === sessionId) input.runtimeContext.promptIdentity = identity;
        },
        ...((continuityContext || handoff || director) ? { continuityContext: [continuityContext, handoff?.contextText, director?.contextText].filter(Boolean).join('\n\n') } : {}),
        onPromptAccepted: handoffAcceptance(handoff, () => {
          input.runtimeContext.transientContextAttachments = undefined;
          onPromptAccepted?.();
        }),
        ...(attachments ? { attachments } : {}),
        sessionId,
        workspaceRoot: input.runtimeContext.cwd,
        workspaceRoots: input.runtimeContext.session.workspaceRoots,
        signal,
        maxTurns: config.maxTurns,
        escalationPromptHandler,
        permissionScope: sessionRuntime.getPermissionScope(),
        interactiveAsk: (questions, askSignal) =>
          promptInteractiveQuestions(input.getReadline(), questions, askSignal),
        historyMessages,
        onTurnMessage: (message) => {
          const id = message.id ?? createTranscriptEntryId("turn");
          input.sessionManager.addTurn(sessionId, { ...message, id });
          sourceEntryId = id;
        },
        prepareProviderResources,
        admission,
        onCredentialPersisted: reportCredentialPublication,
        providerCredentialResolution: resolvedCredential,
        agentMode: gitRequestMode(allTurns.at(-1)) ?? sessionRuntime.getAgentMode(),
        providerRuntimeBridge: input.providerRuntimeBridge,
        ...(forcedTool ? { forcedTool } : {}),
        ...(input.options.skillPaths || input.options.noSkills
          ? {
              skillOptions: {
                ...(input.options.skillPaths ? { skillPaths: input.options.skillPaths } : {}),
                ...(input.options.noSkills ? { noSkills: true } : {}),
              },
            }
          : {}),
      });
      return { ...run, sourceEntryId: () => sourceEntryId,
        settled: planningSettlement(input.sessionManager, sessionId, promptEntryId, sessionRuntime, config, input.renderer) };
    },
  });
  installRuleControlRuntime({ runtimeContext: input.runtimeContext, sessionManager: input.sessionManager, mcpGateway: input.mcpGateway,
    busy: () => sessionRuntime.getCurrentRunController() !== null });
  goalScheduler = installGoalScheduler(input.runtimeContext, input.sessionManager, sessionRuntime, message => input.renderer.renderLine(message));
  const nativeGate = installGitCliRuntime(input, sessionRuntime, isStdinTty);
  installDataTransfer(input.runtimeContext, nativeGate);
  installCollaborationRuntime(input.runtimeContext, input.sessionManager, sessionRuntime, nativeGate);
  installSshRuntime(input.runtimeContext, input.sessionManager, sessionRuntime, nativeGate, message => input.renderer.renderLine(message));
  installJobsRuntime(input.runtimeContext, input.sessionManager, sessionRuntime, nativeGate, {
    notice: input.renderer.renderLine.bind(input.renderer),
    providerRuntimeBridge: input.providerRuntimeBridge, mcpGateway: input.mcpGateway,
    skillOptions: { skillPaths: input.options.skillPaths, noSkills: input.options.noSkills },
  });
  installSecurityRuntime(input.runtimeContext, input.sessionManager, sessionRuntime, nativeGate);
  installAgentsRuntime(input.runtimeContext, nativeGate);
  installUsageRuntime(input.runtimeContext, nativeGate,
    usageResetApproval(input.runtimeContext, input.sessionManager, input.getPromptInteractiveApproval ?? (() => undefined)));
  if (input.mcpGateway) installMcpRuntime(input.runtimeContext, input.mcpGateway, nativeGate, url => input.renderer.renderLine(`Open this MCP sign-in URL in your browser:\n${url}`));
  installExtensionRuntime(input.runtimeContext, sessionRuntime, nativeGate);
  return sessionRuntime;
}
