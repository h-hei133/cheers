import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import type { Admission } from '../../core/network/admission.js';
import type { RequestPolicy } from '../../core/agent/request/model.js';
import type { AgentMessage } from '../../core/agent/state.js';
import { catalogModel, catalogProvider, type CatalogProvider } from '../../core/models/catalog.js';
import { resolveContextWindow, resolveTokenBudget } from '../../core/models/window.js';
import { messageToText } from '../../model-adapters/multimodal.js';
import { createComponentLogger } from '../../observability/structuredLogger.js';
import { measuredPromptContext } from '../../observability/usageTelemetry.js';
import { providerFetchForEndpoint } from '../../provider/request/fetch.js';
import { providerModelTransport } from '../../provider/request/transport.js';
import { endpointShape, type EndpointKind } from '../../provider/endpoints/index.js';
import { KEEP_RECENT_TOKENS, type CompactionPolicy, type SummarizeHistory, type SummarizeTurnPrefix } from '../../session/compaction.js';
import { DEFAULT_RESERVE_TOKENS, estimateTokens } from '../../session/context.js';
import { prepareCompactionMessages, requestCompactionSummary, type CompactionChatMessage, type CompactionProvider as SummaryProvider } from '../../core/query/compaction/summarize.js';
import { TURN_PREFIX_COMPACTION_PROMPT } from '../../core/query/compaction/summarizer.js';
import { toChatMessages } from '../../turn/prompt.js';
import { captureSummaryRole } from '../provider/summary.js';
import { sessionUsageRecorder } from '../../session/store/usage.js';
import { createHash } from 'node:crypto';
import type { CompactionDispatch } from '../../session/compaction/contract.js';
import { sessionCompactionAuthority } from '../../session/compaction/authority.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { ConfigPublication, ConfigState } from '../../config/state.js';
import { configuredOutputLimit } from '../../provider/request/output.js';

/** Bind the captured publication and native session owner at each compaction entry point. */
export function nativeCompactionAuthority(input: {
  readonly sessionId: string; readonly workspaceRoot: string; readonly admission: Admission;
  readonly publication: ConfigPublication; readonly configuration: ConfigState; readonly store: SessionManager;
}) {
  return sessionCompactionAuthority({ sessionId: input.sessionId, workspaceRoot: input.workspaceRoot,
    admission: input.admission, isCurrent: () => input.configuration.current === input.publication,
    capture: input.store.captureCompactionSource.bind(input.store, input.sessionId),
    commit: input.store.appendCompactionIfCurrent.bind(input.store) });
}

/**
 * Messages for a compaction call.
 *
 * The summariser reads text, so an attachment is described rather than passed:
 * the summary model was asked to condense a conversation, not to look at a
 * picture, and handing it one it never saw would spend tokens on an answer to a
 * question nobody asked.
 */
export function toCompactionMessages(messages: readonly AgentMessage[]): readonly CompactionChatMessage[] {
  return toChatMessages(messages).map((message) => ({
    role: message.role,
    content: messageToText(message.content),
    ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
    ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
  }));
}

/** What a compaction needs from the provider, resolved once per entry point. */
const windowLogger = createComponentLogger('model-window')

export interface CompactionProvider extends SummaryProvider {
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
export function buildCompactionWiring(input: {
  readonly workspaceRoot?: string;
  readonly onCredentialPersisted?: () => void;
  readonly requestPolicy?: RequestPolicy;
  readonly provider: {
    /** Built from the resolved credential, so an account token reaches this path too. */
    readonly headers: Readonly<Record<string, string>>;
    readonly baseUrl: string;
    readonly model: string;
    readonly providerId: string;
    /** Which endpoint kind the summarizer must speak, when not the default. */
    readonly endpoint?: EndpointKind;
    readonly credentialId?: string;
    readonly credentialGeneration?: string;
  };
  readonly runtimeConfig: RuntimeConfig;
  readonly admission?: Admission;
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
  const usageFor = sessionUsageRecorder(input.sessionId);
  if (catalogProvider(input.catalog, provider.providerId, provider.baseUrl).ambiguous) throw new Error('The model catalogue has multiple entries for this endpoint. Resolve them before compacting.');
  const runtimeConfig = input.runtimeConfig;
  const summaryRole = captureSummaryRole({ config: runtimeConfig, catalog: input.catalog, workspaceRoot: input.workspaceRoot,
    admission: input.admission, onCredentialPersisted: input.onCredentialPersisted });
  const send = async (request: Omit<Parameters<typeof requestCompactionSummary>[0], 'provider' | 'fetchImpl'>) => {
    const summaryProvider = summaryRole ? await summaryRole.resolve() : { ...provider, ...summaryLimits };
    return requestCompactionSummary({ ...request, provider: summaryProvider,
      onUsage: usageFor({ provider: summaryProvider.providerId ?? '', model: summaryProvider.model,
        baseUrl: summaryProvider.baseUrl, rates: catalogModel(input.catalog, summaryProvider.providerId ?? '', summaryProvider.model, summaryProvider.baseUrl)?.cost }),
      fetchImpl: providerFetchForEndpoint(runtimeConfig, summaryProvider.endpoint, endpointShape, input.admission),
      modelTransport: providerModelTransport(runtimeConfig, summaryProvider.endpoint, input.admission) });
  };
  const historyRequest = (request: Parameters<SummarizeHistory>[0]) => ({
    requestPolicy: input.requestPolicy, maxOutputTokens: summaryRole ? summaryRole.limits.maxOutputTokens : configuredOutputLimit(runtimeConfig, provider.endpoint),
    messages: toCompactionMessages(request.messages), previousSummary: request.previousSummary,
    instructions: request.instructions, signal: request.signal, dispatch: request.dispatch,
  });
  const prefixRequest = (messages: readonly AgentMessage[], signal?: AbortSignal, dispatch?: CompactionDispatch) => ({
    requestPolicy: input.requestPolicy, maxOutputTokens: summaryRole ? summaryRole.limits.maxOutputTokens : configuredOutputLimit(runtimeConfig, provider.endpoint), purpose: 'turn-summary' as const,
    messages: toCompactionMessages(messages), prompt: TURN_PREFIX_COMPACTION_PROMPT, signal, dispatch,
  });
  // Resolved per model rather than read from one global number: the catalog
  // knows each model's window, and using a single value compacted a million-token
  // model at sixty-four thousand.
  const resolvedWindow = resolveContextWindow({
    catalog: input.catalog,
    provider: provider.providerId,
    model: provider.model,
    baseUrl: provider.baseUrl,
    configured: runtimeConfig.contextWindow,
  });
  if (resolvedWindow.warning !== undefined) {
    windowLogger.warn(resolvedWindow.warning);
  }
  const summaryLimits = summaryRole?.limits ?? { contextWindow: resolvedWindow.window,
    maxOutputTokens: configuredOutputLimit(runtimeConfig, provider.endpoint), reserveTokens: runtimeConfig.reserveTokens };
  return {
    policy: {
      summaryIdentity: summaryRole?.identity ?? createHash('sha256').update(JSON.stringify([provider, summaryLimits])).digest('hex'),
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
      outputTokens: configuredOutputLimit(runtimeConfig, provider.endpoint),
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
      measureContextTokens: (messages, identity) => {
        const measured = measuredPromptContext(input.sessionId, { provider: provider.providerId, model: provider.model,
          endpoint: provider.endpoint ?? 'openai-compatible', ...(identity ?? {}) }, { requireExpectedIdentity: true });
        if (!measured) return undefined;
        return measured.tokens + estimateTokens(messages.slice(measured.messageCount));
      },
    },
    summarize: Object.assign((request: Parameters<SummarizeHistory>[0]) => send(historyRequest(request)),
      { dispatchAware: true, preflight: (request: Parameters<SummarizeHistory>[0]) => {
        prepareCompactionMessages({ ...historyRequest(request), provider: summaryLimits }); } }),
    // Asked a different question from the history summary: this is the opening
    // of a turn whose continuation is kept, so it explains the work that
    // follows rather than recapping what came before.
    summarizeTurnPrefix: Object.assign((messages: readonly AgentMessage[], signal?: AbortSignal, dispatch?: CompactionDispatch) => send(prefixRequest(messages, signal, dispatch)),
      { dispatchAware: true, preflight: (messages: readonly AgentMessage[], signal?: AbortSignal) => {
        prepareCompactionMessages({ ...prefixRequest(messages, signal), provider: summaryLimits }); } }),
  };
}
