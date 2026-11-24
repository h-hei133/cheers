import type { AgentMessage, StandardAgentMessage } from '../../core/agent/state.js';
import type { RequestContextOwner } from '../../core/agent/context.js';
import type { MessageConverter, MessageProjection } from '../../core/agent/messages.js';
import type { RetryPolicy } from '../../core/agent/retry.js';
import type { ModelTransport, RequestPolicy } from '../../core/agent/request/model.js';
import type { CatalogProvider, CatalogModel } from '../../core/models/catalog.js';
import type { ModelRoute, VirtualModelRegistry } from '../../core/models/virtualModels.js';
import type { ModelRouteFailure, ModelRouteReason } from '../../core/models/virtual/contract.js';
import type { ResolvedRequestShape } from '../../core/models/requestShape.js';
import type { ModelInputLimits } from '../../core/models/modalities.js';
import type { ThinkingPreference } from '../../core/models/effort.js';
import type { EndpointKind, EndpointShape } from '../../provider/endpoints/index.js';
import type { SentRequest } from '../../provider/request/sentRequest.js';
import type { ProviderUsage } from '../completion.js';
import type { ToolSchema } from '../tools.js';
import type { ChatMessage } from '../prompt.js';
import type { OutgoingProjectionOptions, outgoingProjection } from '../messages.js';
import type { PromptSource, PromptMeasurementIdentity } from '../../context/request/model.js';
import type { RequestBudgetResult } from '../../context/request/budget.js';
import type { RequestOverhead } from '../../session/context.js';
import type { SessionUsageRecord } from '../../observability/usageTelemetry.js';
import type { RequestUsageAttribution } from '../../observability/usage/model.js';
import type { UsageInputMode } from '../../provider/response/metering.js';
import type { storedPromptProjection } from '../measurement.js';

export interface ProviderTarget {
  /**
   * The headers this request authenticates with.
   *
   * Built once from the resolved credential, so both ways of earning an
   * `Authorization` header — an API key and an account login — arrive here in the
   * same shape. It was a bare `apiKey` before, which is why an account credential
   * had nowhere to land: the header was formatted at the call site from a field
   * that credential did not have.
   */
  readonly headers: Readonly<Record<string, string>>;
  readonly baseUrl: string;
  readonly model: string;
  /**
   * Which provider this is, so the catalog can be asked how it wants requests.
   *
   * Absent means the question cannot be answered, and the defaults an
   * OpenAI-compatible endpoint expects are used — which is what every request
   * looked like before the catalog could answer at all.
   */
  readonly provider?: string;
  /** Which stored credential this target uses; non-secret and rotation-sensitive. */
  readonly credentialId?: string;
  readonly credentialGeneration?: string;
  readonly replayOwner?: string;
  /**
   * Which endpoint kind this target speaks.
   *
   * Absent means the OpenAI-compatible shape, which is what every request looked
   * like before a second kind existed. Named rather than inferred from the
   * provider id, because a provider is who answers and an endpoint is how they
   * want to be asked — one provider can offer both.
   */
  readonly endpoint?: EndpointKind;
  /** Provider service tier selected by the session. */
  readonly serviceTier?: string;
  /** Captured non-secret replay identity for the exact provider target. */
  readonly replayBinding?: string;
}

export interface StepOptions {
  /** The outer loop owns retries; direct requests never consume branch routing state. */
  readonly routeReason?: ModelRouteReason;
  readonly failedRoute?: ModelRouteFailure;
  /** The original live history fence also applies to native provider retries. */
  readonly contextOwner?: RequestContextOwner;
  /** A previously admitted recovery retains its complete route and wire capture. */
  readonly preparedContext?: PreparedTurnContext;
  readonly convertToLlm?: MessageConverter;
  readonly prepareContext?: (prepared: PreparedTurnContext, signal?: AbortSignal) => Promise<PreparedTurnContext | undefined>;
  /** Observe each effective capture, including declaration refresh and native retry preparation. */
  readonly onPreparedContext?: (prepared: PreparedTurnContext) => void;
  /** Persist and admit a declaration synchronously at the existing dispatch boundary. */
  readonly onDeclaration?: (message: StandardAgentMessage, projection: MessageProjection) => void;
  /** Detached source retains agent history identity across application projection. */
  readonly sourceMessages?: readonly AgentMessage[];
  readonly providerMessages?: readonly ChatMessage[];
  /** Exact opening object and the accepted user content retained by the prompt barrier. */
  readonly promptSource?: { readonly opening: AgentMessage; readonly stored: AgentMessage };
  readonly requestId?: string;
  /** Whether the model may call tools on this step; the last step may not. */
  readonly allowTools: boolean;
  /** Restrict the bound tool schemas for this call; an empty list withdraws all tools. */
  readonly allowedTools?: readonly string[];
  /** Why this request is being sent, when the caller can prove it from context. */
  readonly requestPurpose?: string;
  /** Effective mode of a delegated run, established by its tool gate. */
  readonly agentMode?: "plan" | "build";
  /**
   * Told the request that was sent, as it was sent.
   *
   * Reported rather than rebuilt by a later reader: the system instruction, the
   * microcompaction of old turns and the bridging of tool results are all
   * applied on the way out, so the bytes cannot be reconstructed from the
   * session's history. Anything that needs to send this request again — keeping
   * the prompt cached — has to be handed the request itself.
   */
  readonly onRequestSent?: (sent: SentRequest) => void;
  /** Usage reported by this response, independent of any previous context gauge. */
  readonly onRequestUsage?: (usage: ProviderUsage) => void;
}

/** Physical identity and transport are resolved and retained together. */
export interface StepTarget {
  readonly provider: ProviderTarget;
  readonly fetchImpl?: typeof fetch;
  readonly modelTransport?: ModelTransport;
  /** Native transports already enforce their configured response-body deadline. */
  readonly transportOwnsBodyDeadline?: true;
  /** Captured response body idle limit for transports without a native watchdog. */
  readonly bodyIdleTimeoutMs?: number;
  /** Explicit output control; absent uses the physical catalogue entry. */
  readonly maxOutputTokens?: number;
  /** Resolved window override; absent uses the physical catalogue entry. */
  readonly contextWindow?: number;
  /** Headroom held back from the shared window. */
  readonly reserveTokens?: number;
  readonly isCurrent?: () => boolean;
}

export interface StepRequest extends StepTarget {
  readonly accountTurnAffinity?: import('../../provider/endpoints/responses/account.js').AccountTurnAffinity;
  readonly recordAuxiliaryUsage?: (usage: SessionUsageRecord) => void;
  readonly requestPolicy?: RequestPolicy;
  readonly thinkingEffort?: ThinkingPreference;
  readonly thinkingEffortExplicit?: boolean;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly systemPrompt: string;
  readonly systemPromptSources?: readonly PromptSource[];
  /** Reuse the session's approved instructions with a delegated mode and tool set. */
  readonly systemPromptFor?: (
    agentMode: "plan" | "build" | undefined,
    toolNames: readonly string[],
    toolsAvailable?: boolean,
  ) => string;
  readonly tools: readonly ToolSchema[];
  /** Read again for each step so tools loaded mid-run are declared next time. */
  readonly toolSnapshot?: () => readonly ToolSchema[];
  readonly temperature?: number;
  readonly topP?: number;
  /** Retain bounded tool text when false; media and request limits still apply. */
  readonly pruneToolText?: boolean;
  /**
   * The catalog to ask how this model wants requests shaped.
   *
   * Passed in rather than loaded here so a run reads it once, and so a test can
   * state a model's shape without writing a catalog file.
   */
  readonly catalog?: readonly CatalogProvider[];
  /**
   * How many times a request that failed for a transient reason is sent again.
   *
   * A partial policy rather than a resolved one: the caller states what the user
   * asked for and the provider layer's own default fills the rest, so the
   * default lives here beside the layer it belongs to. Absent means no retries,
   * which is this layer's default — the turn layer above is the one that
   * retries by default.
   */
  readonly retry?: Partial<RetryPolicy>;
  readonly cacheRetention?: 'short' | 'long' | 'none';
  readonly initialTools?: readonly ToolSchema[];
  readonly virtualModels?: VirtualModelRegistry;
  readonly virtualModel?: { readonly provider: string; readonly modelId: string };
  readonly captureRouteState?: (provider: string, modelId: string, admission: () => void) => {
    readonly state: unknown;
    readonly accept: (state: unknown, admission: () => void) => void;
  };
  readonly resolveTarget?: (route: ModelRoute, signal?: AbortSignal) => StepTarget | Promise<StepTarget>;
  readonly historicalEfforts?: ReadonlyMap<number, string>;
  readonly projection?: OutgoingProjectionOptions;
}

/** One complete local request capture; publication and dispatch remain with their existing owners. */
export interface PreparedTurnContext {
  /** Requested preference remains available to summary consumers after protocol fallback. */
  readonly cacheRetention: 'short' | 'long' | 'none';
  readonly sessionId: string;
  readonly cache: NonNullable<SentRequest['cache']>;
  /** Accept routing state before compaction or declaration publication changes branch ancestry. */
  readonly acceptRoute?: () => void;
  readonly target: StepTarget;
  readonly requestPurpose: string;
  readonly agentMode?: 'plan' | 'build';
  readonly sourceMessages: readonly AgentMessage[];
  /** The complete raw input that conversion and request budgeting have seen. */
  readonly prospectiveMessages: readonly AgentMessage[];
  /** Preparation keeps this out of committed history until dispatch admission. */
  readonly pendingDeclaration?: StandardAgentMessage;
  readonly messageProjection: MessageProjection;
  readonly finalMessages: readonly ChatMessage[];
  readonly budgetMessages: readonly StandardAgentMessage[];
  readonly overhead: RequestOverhead;
  readonly prompt: { readonly tokens: number; readonly measured: boolean };
  readonly budget: RequestBudgetResult;
  readonly contextWindow?: number;
  readonly inputLimit?: number;
  readonly outputTokens?: number;
  readonly reserveTokens?: number;
  readonly promptIdentity: PromptMeasurementIdentity;
  readonly promptProjection: ReturnType<typeof storedPromptProjection>;
  readonly projection: ReturnType<typeof outgoingProjection>;
  readonly activeProvider: string;
  readonly activeModel: string;
  readonly effort?: Exclude<ThinkingPreference, null>;
  readonly allowTools: boolean;
  readonly allowedTools?: readonly string[];
  readonly tools: readonly ToolSchema[];
  readonly systemPrompt: string;
  readonly regeneratedPrompt: boolean;
  readonly endpoint: EndpointKind;
  readonly shape: ResolvedRequestShape;
  readonly protocol: EndpointShape;
  readonly modelEntry?: CatalogModel;
  readonly usageAttribution: RequestUsageAttribution;
  readonly usageInput?: UsageInputMode;
  readonly inputLimits?: ModelInputLimits;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly body: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly replayBinding: string;
  readonly refusal?: { readonly detail: string; readonly inputLimit?: boolean };
  /** Checks the captured dynamic declarations and call options without routing again. */
  isCurrent(): boolean;
  /** Refresh dynamic declarations against the same routed source and conversion. */
  refresh(signal?: AbortSignal): Promise<PreparedTurnContext>;
  /** Rebuild the same routed source and conversion for an explicit next-call contract. */
  reframe(options: Pick<StepOptions, 'allowTools' | 'allowedTools' | 'agentMode' | 'requestPurpose'>, signal?: AbortSignal): Promise<PreparedTurnContext>;
  /** Routes raw candidate history, converts it once, then captures its complete wire request. */
  prepare(messages: readonly AgentMessage[], signal?: AbortSignal): Promise<PreparedTurnContext>;
  /** Promote an already persisted declaration without rebuilding its admitted wire body. */
  published(): PreparedTurnContext;
}

/** Internal protocol body inputs already resolved by the preparation owner. */
export interface TurnBodyContext {
  readonly request: StepRequest;
  readonly options: StepOptions;
  readonly activeProvider: string;
  readonly activeModel: string;
  readonly endpoint: EndpointKind;
  readonly protocol: EndpointShape;
  readonly systemPrompt: string;
  readonly finalMessages: readonly ChatMessage[];
  readonly tools: readonly ToolSchema[];
  readonly allowTools: boolean;
  readonly shape: ResolvedRequestShape;
  readonly initialTools: readonly ToolSchema[];
  readonly replayBinding: string;
  readonly output?: number;
}
