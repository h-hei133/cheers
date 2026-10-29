import { createCompactionProviders, type ProviderRenewal } from '../provider/compaction.js';
import { createProviderResources } from '../provider/resources.js';
import { assertAdmission } from '../../core/network/admission.js';
import { providerFetchForEndpoint } from '../../provider/request/fetch.js';
import { catalogModel } from '../../core/models/catalog.js';
import { endpointShape } from '../../provider/endpoints/index.js';
import { buildCompactionWiring, nativeCompactionAuthority, toCompactionMessages } from './compaction.js';
import { profileScope } from '../../core/paths/profile/scope.js';
import { configurationOperation } from '../../core/shell/scope.js';
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
import { createProjectMemoryLocalStore } from "../../memory/projectMemoryLocalStore.js";
import type { InteractiveApprovalResult } from "../interactive/picker/approval.js";
import { requestCompactionSummary } from "../../core/query/compaction/summarize.js";
import { configuredOutputLimit } from '../../provider/request/output.js';
import { sessionUsageRecorder } from '../../session/store/usage.js';
import { projectMemoryRootFor } from "../../memory/projectMemoryRoot.js";
import { providerModelTransport } from '../../provider/request/transport.js';
import { installRuleControlRuntime, takeForcedTool } from './ruleControls.js';
import { contextEntryStillAuthorized, assertContextBounds } from '../../context/attachment/entry.js';
import { foregroundTools, promptWithContext } from './prompt.js';
import { prepareContextInjection } from './context/injection.js';
import { sourceReaderFor } from '../data/access.js';
import { installUsageRuntime, usageResetApproval } from './usage.js';
import { captureSummaryRole } from '../provider/summary.js';

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
  const providers = createCompactionProviders(input);
  const providerResources = createProviderResources(input, providers);
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
        ? Promise.resolve({ provider: providers.provider(resolved, catalog) } as ProviderRenewal)
        : providers.renew(resolved, config, admission, catalog, false);
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
          onCredentialPersisted: providers.publication,
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
        onCredentialPersisted: providers.publication });
      const selected = role ? role.resolve().then(provider => ({ provider })) : providers.renew(resolved, config, admission, catalog);
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
      const getSourceEntryId = () => sourceEntryId;
      const prepareProviderResources = providerResources.startRun({
        config, catalog, publication, backgroundSignal, sessionId, admission, requestPolicy,
        getSourceEntryId,
        ...(handoff ? { resources: handoff.resources.bind(handoff) } : {}),
      });
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
        onCredentialPersisted: providers.publication,
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
      return { ...run, sourceEntryId: getSourceEntryId,
        settled: planningSettlement(input.sessionManager, sessionId, promptEntryId, sessionRuntime, config, input.renderer) };
    },
  });
  providerResources.installFreshState(sessionRuntime);
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
