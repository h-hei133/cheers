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
import { providerFetchFromTimeouts, providerTimeoutsFrom } from "../../provider/request/fetch.js";
import { accountAuthFor, providerAuthorization, renewAccountAuthIfExpiring } from "../../provider/request/authorization.js";
import { persistRenewedAccountAuth } from "../../core/auth/providerAuthRuntime.js";
import { TURN_PREFIX_COMPACTION_PROMPT } from "../../core/query/compaction/summarizer.js";
import { markContextUnknown, getSessionUsage } from "../../observability/usageTelemetry.js";
import { recordCount } from "../../observability/metrics.js";
import { estimateTokens } from "../../session/context.js";
import { KEEP_RECENT_TOKENS, type CompactionPolicy, type SummarizeHistory, type SummarizeTurnPrefix } from "../../session/compaction.js";
import { DEFAULT_RESERVE_TOKENS } from "../../session/context.js";
import { loadCatalog } from "../../core/models/catalogStore.js";
import type { CatalogProvider } from "../../core/models/catalog.js";
import { resolveContextWindow, resolveTokenBudget } from "../../core/models/window.js";
import { createComponentLogger } from "../../observability/structuredLogger.js";
import { toChatMessages } from "../../turn/prompt.js";
import type { CompactionSetup } from "../../turn/session.js";

/** What a compaction needs from the provider, resolved once per entry point. */
const windowLogger = createComponentLogger('model-window')

interface CompactionProvider {
  readonly headers: Readonly<Record<string, string>>;
  readonly baseUrl: string;
  readonly model: string;
  readonly providerId: string;
}

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
  readonly provider: {
    /** Built from the resolved credential, so an account token reaches this path too. */
    readonly headers: Readonly<Record<string, string>>;
    readonly baseUrl: string;
    readonly model: string;
    readonly providerId: string;
  };
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionId: string;
  /**
   * The catalogue, read once by the caller.
   *
   * Passed in rather than loaded here because this runs once per turn and
   * `loadCatalog` reads two files synchronously every call. The catalogue only
   * changes when the user edits it or a refresh writes it, neither of which
   * happens mid-turn.
   */
  readonly catalog: readonly CatalogProvider[];
}): CompactionWiring {
  const provider = input.provider;
  const runtimeConfig = input.runtimeContext.runtimeConfig;
  // Resolved per model rather than read from one global number: the catalog
  // knows each model's window, and using a single value compacted a million-token
  // model at sixty-four thousand.
  const resolvedWindow = resolveContextWindow({
    catalog: input.catalog,
    provider: provider.providerId,
    model: provider.model,
    configured: runtimeConfig.contextWindow,
  });
  if (resolvedWindow.warning !== undefined) {
    windowLogger.warn(resolvedWindow.warning);
  }
  return {
    policy: {
      contextWindow: resolvedWindow.window,
      // Per-model budgets where the user set them, the global value otherwise.
      // A single global budget cannot suit every model: the same "keep the last
      // twenty thousand tokens" is most of a small model's window and a
      // rounding error in a large one.
      reserveTokens: resolveTokenBudget(
        runtimeConfig.modelTokenBudgets,
        provider.providerId,
        provider.model,
        "reserveTokens",
        runtimeConfig.reserveTokens,
        DEFAULT_RESERVE_TOKENS,
      ),
      keepRecentTokens: resolveTokenBudget(
        runtimeConfig.modelTokenBudgets,
        provider.providerId,
        provider.model,
        "keepRecentTokens",
        undefined,
        KEEP_RECENT_TOKENS,
      ),
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
        // The same deadlines as the main request. A summarization that hangs is
        // as fatal to a turn as an answer that hangs, and harder to notice: the
        // conversation looks idle rather than broken.
        fetchImpl: providerFetchFromTimeouts(providerTimeoutsFrom(runtimeConfig)),
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
        fetchImpl: providerFetchFromTimeouts(providerTimeoutsFrom(runtimeConfig)),
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
  /**
   * The catalogue for this session, read once.
   *
   * Every turn resolves the model's window from it, and `loadCatalog` reads two
   * files synchronously on each call, so reading it per turn would put two file
   * reads on the path that decides whether to compact.
   */
  const catalog = loadCatalog()

  /**
   * The provider both compaction paths summarize with, or nothing when none is
   * configured.
   *
   * The guard asks whether a credential exists, not whether an API key does. It
   * used to read `apiKey` alone and require it, so an account login produced no
   * provider here at all and `/compact` answered "No credential for provider" to a
   * user who had just signed in successfully.
   *
   * The renewal runs on the explicit paths because they are request paths of their
   * own: `/compact` and the abandoned-turn summary do not pass through the
   * invocation path where the turn's own token is renewed, so an expired account
   * token would be carried into a summarization request and come back as a provider
   * refusal. The turn's own path has already renewed by the time it gets here.
   */
  const compactionTarget = () => {
    const resolved = input.providerRuntimeBridge.resolveCredentialSnapshot();
    const credential = resolved.credential;
    if (!credential) return undefined;
    const accountAuth = accountAuthFor(resolved.provider, credential);
    if (!credential.apiKey && !accountAuth) return undefined;
    const baseUrl = resolved.baseUrl ?? credential.baseUrl;
    const model = resolved.model ?? credential.model;
    if (!baseUrl || !model) return undefined;
    return {
      provider: resolved.provider,
      apiKey: credential.apiKey,
      accountAuth,
      baseUrl,
      model,
    };
  };

  /** The provider the turn's own compaction summarizes with. */
  const compactionProvider = (): CompactionProvider | undefined => {
    const target = compactionTarget();
    if (!target) return undefined;
    return {
      headers: providerAuthorization({ apiKey: target.apiKey, accountAuth: target.accountAuth }).headers,
      baseUrl: target.baseUrl,
      model: target.model,
      providerId: target.provider,
    };
  };

  /** The same, with an expiring account token replaced before the request is built. */
  const renewedCompactionProvider = async (): Promise<CompactionProvider | undefined> => {
    const target = compactionTarget();
    if (!target) return undefined;
    const renewed = await renewAccountAuthIfExpiring({
      provider: target.provider,
      credential: { apiKey: target.apiKey, accountAuth: target.accountAuth ?? undefined },
      fetchImpl: providerFetchFromTimeouts(providerTimeoutsFrom(input.runtimeContext.runtimeConfig)),
    });
    if (renewed.failure) return undefined;
    if (renewed.renewed && renewed.accountAuth) {
      persistRenewedAccountAuth({ provider: target.provider, accountAuth: renewed.accountAuth });
    }
    return {
      headers: providerAuthorization({
        apiKey: target.apiKey,
        accountAuth: renewed.accountAuth ?? target.accountAuth,
      }).headers,
      baseUrl: target.baseUrl,
      model: target.model,
      providerId: target.provider,
    };
  };
  const sessionRuntime: ShellSessionRuntime = new ShellSessionRuntime({
    sessionManager: input.sessionManager,
    renderer: input.renderer,
    compactHistory: (sessionId, signal, instructions) => {
      return renewedCompactionProvider().then((provider) => {
        if (!provider) {
          const resolved = input.providerRuntimeBridge.resolveCredentialSnapshot();
          return {
            status: "failed" as const,
            reason: `No credential for provider ${resolved.provider}; set ${resolved.expectedEnvVarName} or configure a connection.`,
          };
        }
        const wiring = buildCompactionWiring({ provider, runtimeContext: input.runtimeContext, sessionId, catalog });
        return compactSessionHistory({
          store: input.sessionManager,
          sessionId,
          policy: wiring.policy,
          summarize: wiring.summarize,
          summarizeTurnPrefix: wiring.summarizeTurnPrefix,
          signal,
          instructions,
        });
      });
    },
    summarizeAbandonedTurns: (messages) => {
      return renewedCompactionProvider().then((provider) => {
        if (!provider) return undefined;
        return requestCompactionSummary({
          provider,
          // The third of the three summarisers, and the one that was missed: it kept
          // the global fetch, so a `/back` whose summary stalled waited forever with
          // no deadline and no abort signal. Same wiring as its two siblings.
          fetchImpl: providerFetchFromTimeouts(providerTimeoutsFrom(input.runtimeContext.runtimeConfig)),
          messages: toChatMessages(messages),
        });
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
            ...buildCompactionWiring({ provider: activeProvider, runtimeContext: input.runtimeContext, sessionId, catalog }),
            onCompact: (record) => {
              input.sessionManager.appendCompactionEntry(sessionId, record);
              markContextUnknown(sessionId);
              // Counted at the point a compaction actually happened, which is
              // low frequency, so recording it inline is not a hot path.
              recordCount("compaction.runs", 1, {});
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
