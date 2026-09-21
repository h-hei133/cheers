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
import type { CliOptions } from "../options/cliOptions.js";
import {
  createCliApprovalEscalationBridge,
} from "../approval/cliApprovalEscalationBridge.js";
import type { CliApprovalModeState } from "../approval/cliApprovalModeState.js";
import type { CliProviderRuntimeBridge } from "../provider/cliProviderRuntimeBridge.js";
import type { EscalationPrompt } from "../../sandbox/index.js";
import { promptInteractiveQuestions } from "../interactive/interactiveAskBridge.js";
import { streamCliRuntimePrompt } from "./cliRuntimeInvocationBridge.js";
import { compactSessionHistory } from "../../core/shell/compaction.js";
import type { InteractiveApprovalResult } from "../interactive/picker/approval.js";
import { requestCompactionSummary } from "../../core/query/compaction/summarize.js";
import { TURN_PREFIX_COMPACTION_PROMPT } from "../../core/query/compaction/summarizer.js";
import { markContextUnknown, getSessionUsage } from "../../observability/usageTelemetry.js";
import { estimateTokens } from "../../session/context.js";
import type { CompactionPolicy, SummarizeHistory, SummarizeTurnPrefix } from "../../session/compaction.js";
import { toChatMessages } from "../../turn/prompt.js";
import type { CompactionSetup } from "../../turn/session.js";

/** What a compaction needs from the provider, resolved once per entry point. */
interface CompactionWiring {
  readonly policy: CompactionPolicy;
  readonly summarize: SummarizeHistory;
  readonly summarizeTurnPrefix: SummarizeTurnPrefix;
}

/**
 * The engine wiring both compaction paths run on.
 *
 * The automatic step and the `/compact` command must condense the same history
 * the same way, so they are handed the same policy, the same summarizers, and
 * the same measured-usage callback. Building this twice is how the manual path
 * came to keep a fixed count of messages while the automatic path worked to a
 * token budget.
 */
function buildCompactionWiring(input: {
  readonly provider: { readonly apiKey: string; readonly baseUrl: string; readonly model: string };
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionId: string;
}): CompactionWiring {
  const provider = input.provider;
  return {
    policy: {
      contextWindow: input.runtimeContext.runtimeConfig.contextWindow ?? 64_000,
      reserveTokens: input.runtimeContext.runtimeConfig.reserveTokens,
      // The provider's own count, plus whatever the conversation has gained
      // since that request. Falls back to the estimate inside planCompaction
      // when no request has reported usage yet.
      measureContextTokens: (messages) => {
        const usage = getSessionUsage(input.sessionId);
        if (usage.lastPromptTokens <= 0) return undefined;
        return usage.lastPromptTokens + estimateTokens(messages.slice(usage.lastPromptMessageCount));
      },
    },
    summarize: (request) =>
      requestCompactionSummary({
        provider,
        messages: toChatMessages(request.messages),
        previousSummary: request.previousSummary,
        instructions: request.instructions,
        signal: request.signal,
      }),
    // Asked a different question from the history summary: this is the opening
    // of a turn whose continuation is kept, so it explains the work that
    // follows rather than recapping what came before.
    summarizeTurnPrefix: (messages, signal) =>
      requestCompactionSummary({
        provider,
        messages: toChatMessages(messages),
        prompt: TURN_PREFIX_COMPACTION_PROMPT,
        signal,
      }),
  };
}

export function createCliSessionRuntime(input: {
  readonly sessionManager: SessionManager;
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
  const isStdinTty = input.isStdinTty ?? (() => Boolean(process.stdin.isTTY));
  /** The provider both compaction paths summarize with, or nothing when none is configured. */
  const compactionProvider = (): { apiKey: string; baseUrl: string; model: string } | undefined => {
    const resolved = input.providerRuntimeBridge.resolveCredentialSnapshot();
    const apiKey = resolved.credential?.apiKey;
    const baseUrl = resolved.baseUrl ?? resolved.credential?.baseUrl;
    const model = resolved.model ?? resolved.credential?.model;
    return apiKey && baseUrl && model ? { apiKey, baseUrl, model } : undefined;
  };
  const sessionRuntime: ShellSessionRuntime = new ShellSessionRuntime({
    sessionManager: input.sessionManager,
    renderer: input.renderer,
    compactHistory: (sessionId, signal, instructions) => {
      const provider = compactionProvider();
      if (!provider) {
        const resolved = input.providerRuntimeBridge.resolveCredentialSnapshot();
        return Promise.resolve({
          status: "failed" as const,
          reason: `No credential for provider ${resolved.provider}; set ${resolved.expectedEnvVarName} or configure a connection.`,
        });
      }
      const wiring = buildCompactionWiring({ provider, runtimeContext: input.runtimeContext, sessionId });
      return compactSessionHistory({
        store: input.sessionManager,
        sessionId,
        policy: wiring.policy,
        summarize: wiring.summarize,
        summarizeTurnPrefix: wiring.summarizeTurnPrefix,
        signal,
        instructions,
      });
    },
    summarizeAbandonedTurns: (messages) => {
      const provider = compactionProvider();
      if (!provider) return Promise.resolve(undefined);
      return requestCompactionSummary({
        provider,
        messages: toChatMessages(messages),
      });
    },
    runPrompt: (prompt, signal): PromptRun => {
      const resolvedCredential =
        input.providerRuntimeBridge.resolveCredentialSnapshot();
      const sessionId = input.runtimeContext.session.id;
      const activeProvider = compactionProvider();
      // Automatic compaction needs a provider to write the checkpoint; without
      // one the turn runs with the history it has and overflow reports itself.
      const compaction: CompactionSetup | undefined = activeProvider
        ? {
            ...buildCompactionWiring({ provider: activeProvider, runtimeContext: input.runtimeContext, sessionId }),
            onCompact: (record) => {
              input.sessionManager.appendCompactionEntry(sessionId, record);
              markContextUnknown(sessionId);
            },
          }
        : undefined;
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
      const allTurns = existingSession?.turns ?? [];
      const historyMessages =
        allTurns.length > 0 &&
        allTurns[allTurns.length - 1]?.content === prompt
          ? allTurns.slice(0, -1)
          : allTurns;

      return streamCliRuntimePrompt({
        // Carried so the tool pool honours disabledTools / hiddenToolPrefixes.
        runtimeConfig: input.runtimeContext.runtimeConfig,
        prompt,
        sessionId,
        workspaceRoot: input.runtimeContext.cwd,
        signal,
        maxTurns: input.runtimeContext.runtimeConfig.maxTurns,
        escalationPromptHandler,
        permissionScope: sessionRuntime.getPermissionScope(),
        interactiveAsk: (questions) =>
          promptInteractiveQuestions(input.getReadline(), questions),
        historyMessages,
        onTurnMessage: (message) => input.sessionManager.addTurn(sessionId, message),
        compaction,
        providerCredentialResolution: resolvedCredential,
        agentMode: sessionRuntime.getAgentMode(),
        providerRuntimeBridge: input.providerRuntimeBridge,
      });
    },
  });
  return sessionRuntime;
}
