import { catalogModel } from "../core/models/catalog.js";
import { randomUUID } from 'node:crypto';
import { ModelAdmissionError, type ModelTransport, type RequestPolicy } from '../core/agent/request/model.js';
import { prepareRequestAttempt, type RequestAttempt } from '../provider/request/attempt.js';
import { hasUsage, usageFromProvider } from "../provider/response/usage.js";
import type { AgentToolCall } from "../core/agent/tools.js";
import type { AgentMessage, AgentStopReason } from "../core/agent/state.js";
import type { AssistantStep } from "../core/agent/loop.js";
import { parseJsonWithRepair } from "../model-adapters/jsonRepair.js";
import { clearContextUsage, markContextUnknown, recordSessionUsage } from "../observability/usageTelemetry.js";
import { samplingTemperature } from "../core/commands/fastCommandRuntime.js";
import { captureThinkingPreference } from '../core/models/preference.js';
import { effortOutputFailure } from '../provider/endpoints/effort.js';
import { effortCapability } from '../core/models/capability.js';
import { outputLimitFailure } from '../core/models/limits.js';
import type { ThinkingPreference } from '../core/models/effort.js';
import { microcompactMessages } from "../core/query/microCompact.js";
import { isEventStream, type ProviderUsage, type StreamedToolCall } from "./completion.js";
import { DEFAULT_ENDPOINT_KIND, endpointKind, endpointShape, endpointTurnBody, endpointUrl, type EndpointKind } from "../provider/endpoints/index.js";
import type { SentRequest } from "../provider/request/sentRequest.js";
import { classifyProviderFailure, type ProviderFailureClass } from "../provider/registry/provider.js";
import { toChatMessages, type ChatMessage } from "./prompt.js";
import { PARSE_ERROR_KEY, type ToolSchema } from "./tools.js";
import { resolveRequestShape } from "../core/models/requestShape.js";
import type { CatalogProvider } from "../core/models/catalog.js";
import type { PromptSource } from '../context/request/model.js';
import { requestContext } from '../context/request/projection.js';
import {
  REFUSAL,
  isRetryableStatus,
  resolveRetryPolicy,
  exceedsRetryCeiling,
  retryDelayMs,
  serverRequestedDelayMs,
  waitBeforeRetry,
  type RetryPolicy,
} from "../core/agent/retry.js";

/**
 * One model call.
 *
 * The kernel asks for the next assistant step and gets back text, tool calls,
 * and why the model stopped. Everything provider-shaped stays here: the wire
 * request, the streamed deltas, the reasoning channel, the usage record, the
 * host quirks. What comes out is the same whether the answer streamed or
 * arrived whole.
 */

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
  /**
   * Which endpoint kind this target speaks.
   *
   * Absent means the OpenAI-compatible shape, which is what every request looked
   * like before a second kind existed. Named rather than inferred from the
   * provider id, because a provider is who answers and an endpoint is how they
   * want to be asked — one provider can offer both.
   */
  readonly endpoint?: EndpointKind;
}

/** What a step reports while it runs, before the assembled message exists. */
export interface StepListener {
  readonly onText?: (delta: string) => void;
  readonly onReasoning?: (delta: string) => void;
  /** The assembled text differs from the streamed deltas. */
  readonly onReplace?: (text: string) => void;
}

export interface StepOptions {
  readonly requestId?: string;
  /** Whether the model may call tools on this step; the last step may not. */
  readonly allowTools: boolean;
  /** Restrict the bound tool schemas for this call; an empty list withdraws all tools. */
  readonly allowedTools?: readonly string[];
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

/** The model side of the kernel: the next assistant step for a context. */
export type StepFunction = (
  messages: readonly AgentMessage[],
  signal: AbortSignal | undefined,
  listener: StepListener,
  options: StepOptions,
) => Promise<AssistantStep>;

export interface StepRequest {
  readonly requestPolicy?: RequestPolicy;
  readonly modelTransport?: ModelTransport;
  readonly thinkingEffort?: ThinkingPreference;
  readonly thinkingEffortExplicit?: boolean;
  readonly provider: ProviderTarget;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly systemPrompt: string;
  readonly systemPromptSources?: readonly PromptSource[];
  /** Reuse the session's approved instructions with a delegated mode and tool set. */
  readonly systemPromptFor?: (agentMode: "plan" | "build", toolNames: readonly string[]) => string;
  readonly tools: readonly ToolSchema[];
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  readonly fetchImpl?: typeof fetch;
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
}

const OVERFLOW_MARKERS = ["context_length_exceeded", "context_overflow", "maximum context length", "prompt_too_long"];

/** Prefix of the failure a step reports when the conversation no longer fits. */
export const CONTEXT_OVERFLOW_PREFIX = "Context overflow: ";

/** Whether a provider failure means the context is too large, not that the request was wrong. */
export function isContextOverflow(detail: string): boolean {
  const text = detail.toLowerCase();
  return OVERFLOW_MARKERS.some((marker) => text.includes(marker));
}

/** Whether a failed assistant message failed because the context overflowed. */
export function isOverflowFailure(message: Pick<AgentMessage, "stopReason" | "errorMessage">): boolean {
  return message.stopReason === "error" && (message.errorMessage?.startsWith(CONTEXT_OVERFLOW_PREFIX) ?? false);
}

interface CompletionShape {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string | null; readonly tool_calls?: readonly StreamedToolCall[] };
    readonly finish_reason?: string | null;
  }[];
  readonly usage?: ProviderUsage;
  readonly reasoning?: string;
  /** The provider's signature over that reasoning, when it issued one. */
  readonly reasoningSignature?: string;
  /** Whether that reasoning was withheld; see `SessionMessage.reasoning.redacted`. */
  readonly reasoningRedacted?: boolean;
  /** Text already delivered as deltas; it must not be delivered a second time. */
  readonly streamed?: string;
}

/**
 * Ask the model for its next step.
 *
 * A host that rejects `reasoning_effort` costs one retry rather than the turn;
 * once dropped the field stays dropped for this step function, because asking
 * again would fail again. An overflow answer comes back as a failed step with
 * its own prefix so the session can compact and retry rather than report it.
 */
/**
 * The endpoint kind this request speaks.
 *
 * One field decides, and it decides here rather than at each difference: an
 * endpoint that disagrees about the system field, the tool schema and the stream
 * events disagrees about all of them, and expressing that as per-model flags
 * would spread one decision across four places that could then disagree.
 */
function endpointFor(request: StepRequest): EndpointKind {
  return endpointKind(request.provider.endpoint) ?? DEFAULT_ENDPOINT_KIND;
}

/**
 * Tell the model when this is the last step it may act on.
 *
 * Withdrawing the tools is not self-explanatory. The model sees the list it had
 * and cannot call from it, which reads as the harness being broken rather than
 * as a budget it has reached — and the useful thing for it to do at that point
 * is answer with what it has, which it cannot know to do unless told.
 *
 * Appended as the last user turn rather than put in the system prompt, because
 * it is true only of this request: the system instruction is built once for the
 * whole run, and a run's earlier steps may call tools freely.
 *
 * Sent only when there were tools to withdraw. A run configured with none — or
 * a caller that never offered any — is not one that reached a limit, and telling
 * its model about a budget it was never spending is a false statement the model
 * has no way to check.
 */
function withFinalStepNotice(
  messages: readonly ChatMessage[],
  allowTools: boolean,
  hadTools: boolean,
): readonly ChatMessage[] {
  if (allowTools || !hadTools) return messages;
  return [
    ...messages,
    {
      role: "user",
      content:
        "You have reached the limit of steps you may take. You cannot call any more tools on this turn. " +
        "Answer now with what you have: say what you did, what you found, and what remains unfinished.",
    },
  ];
}

export function createStepFunction(request: StepRequest): StepFunction {
  let effortAccepted = true;
  const captured = captureThinkingPreference(request.workspaceRoot, request.thinkingEffort);
  const explicitEffort = request.thinkingEffortExplicit ?? captured.thinkingEffortExplicit;
  const fetchImpl = request.fetchImpl ?? fetch;
  const retry = resolveRetryPolicy("provider", request.retry ?? {});
  // The model identity travels with every step this function returns, so a
  // failure recorded by one model can be recognized as not the current model's
  // after a switch. Built once here because every attempt of every step from
  // this function talks to the same target; the callers that switch models
  // build a new step function.
  const origin =
    request.provider.model || request.provider.provider
      ? { ...(request.provider.provider ? { provider: request.provider.provider } : {}), model: request.provider.model }
      : undefined;
  return async (messages, signal, listener, options): Promise<AssistantStep> => {
    const requestId = options.requestId ?? randomUUID();
    const allowed = options.allowedTools && new Set(options.allowedTools);
    const tools = allowed ? request.tools.filter((tool) => allowed.has(tool.function.name)) : request.tools;
    const systemPrompt = options.agentMode && request.systemPromptFor
      ? request.systemPromptFor(options.agentMode, tools.map((tool) => tool.function.name))
      : request.systemPrompt;
    // Steps this call returns all come from the same target, so the origin is
    // stamped once on whatever leaves — an answer, a refusal, or an abort —
    // rather than threaded through each builder's signature. A `return` in
    // this body that forgets the stamp is invisible to the type, which is why
    // every exit goes through it.
    const stamp = (step: AssistantStep): AssistantStep => (origin ? { ...step, origin } : step);
    let streamAttempts = 0;
    for (;;) {
      const effort = effortAccepted ? captured.thinkingEffort ?? undefined : undefined;
      if (explicitEffort && effort && effortCapability(request.catalog ?? [], request.provider.provider ?? '', request.provider.model, effort) === 'unsupported') {
        return stamp(errorStep('The selected model does not support this reasoning effort. Select another level or use /thinking auto.'));
      }
      // Resolved per attempt rather than once, because the shape depends on the
      // level, and a refused `reasoning_effort` is answered by rebuilding the
      // request without it.
      const shape = resolveRequestShape(
        request.catalog ?? [],
        request.provider.provider ?? "",
        request.provider.model,
        effortAccepted ? effort : undefined,
      );
      const endpoint = endpointFor(request);
      // The wire body comes from the protocol's own declaration, so a third
      // protocol is a module rather than a branch here. Everything the two
      // protocols disagree about is either in the table or resolved from the
      // model; the caller's own preprocessing — the compaction above and the
      // bridging of tool results — happens once, before this, because it is the
      // same for every protocol.
      //
      // A kind nobody declared is answered here rather than left to throw. The
      // name came from a file the user edited, so the one thing worth saying is
      // which name and which kinds exist — and an error the loop can report is
      // where that is visible. Left as a throw it would leave the turn through
      // the loop's retry wrapper, which does not catch it, and reach the user as
      // an uncaught crash with no mention of the file.
      let payload: Record<string, unknown>;
      let requestHeaders: Readonly<Record<string, string>> = {};
      try {
        const outputFailure = outputLimitFailure(request.maxOutputTokens ?? shape.maxOutputCeiling, shape.maxOutputCeiling);
        if (outputFailure) return stamp(errorStep(outputFailure));
        const budgetFailure = explicitEffort && effort ? effortOutputFailure(endpointShape(endpoint), request.maxOutputTokens ?? shape.maxOutputCeiling) : undefined;
        if (budgetFailure) return stamp(errorStep(budgetFailure));
        requestHeaders = endpointShape(endpoint).requestHeaders?.({
          provider: request.provider.provider,
          model: request.provider.model,
          systemPrompt,
          messages: bridgeToolResults(
            microcompactMessages(toChatMessages(messages), { keepRecentTurns: 3, maxOutputChars: 1000 }).messages,
            shape.assistantAfterToolResult,
          ),
          tools,
          allowTools: options.allowTools,
          vision: shape.vision,
          temperature: samplingTemperature(request.workspaceRoot, request.temperature ?? 0.7),
          systemRole: shape.systemRole,
          reasoningEffort: Boolean(shape.reasoningEffort),
          maxTokensField: shape.maxTokensField,
          assistantAfterToolResult: shape.assistantAfterToolResult,
        }) ?? {};
        payload = endpointTurnBody(endpoint, {
          model: request.provider.model,
          systemPrompt,
          messages: withFinalStepNotice(
            bridgeToolResults(
              microcompactMessages(toChatMessages(messages), { keepRecentTurns: 3, maxOutputChars: 1000 }).messages,
              shape.assistantAfterToolResult,
            ),
            options.allowTools,
            tools.length > 0,
          ),
          tools,
          allowTools: options.allowTools,
          vision: shape.vision,
          temperature: samplingTemperature(request.workspaceRoot, request.temperature ?? 0.7),
          ...(request.topP != null ? { topP: request.topP } : {}),
          ...((request.maxOutputTokens ?? shape.maxOutputCeiling) != null
            ? { maxOutputTokens: request.maxOutputTokens ?? shape.maxOutputCeiling }
            : {}),
          ...(shape.reasoningEffort && shape.thinkingLevelName
            ? { thinkingLevelName: shape.thinkingLevelName }
            : {}),
          ...(shape.allowEmptySignature ? { allowEmptySignature: true } : {}),
          supportsTemperature: shape.supportsTemperature,
          ...(shape.thinkingBudgetTokens !== undefined
            ? { thinkingBudgetTokens: shape.thinkingBudgetTokens }
            : {}),
          systemRole: shape.systemRole,
          reasoningEffort: shape.reasoningEffort,
          maxTokensField: shape.maxTokensField,
          assistantAfterToolResult: shape.assistantAfterToolResult,
        });
      } catch (error) {
        // The only throw from this call is an undeclared kind, and it names both
        // the kind and the ones that exist. Reported as the reason the step
        // failed, which is what puts it in front of the user.
        return stamp(errorStep(error instanceof Error ? error.message : String(error)));
      }
      // What has been shown so far, so an interrupted answer keeps the part
      // the user already read instead of vanishing from the conversation. Both
      // channels count: reasoning the user has watched is as impossible to take
      // back as text, and a retry after either would present the same output
      // twice — the retry is only for a stream that showed nothing at all.
      let shown = "";
      let shownAnything = false;
      const watched: StepListener = {
        ...listener,
        onText: (delta) => {
          shown += delta;
          shownAnything ||= delta.length > 0;
          listener.onText?.(delta);
        },
        onReasoning: (delta) => {
          shownAnything ||= delta.length > 0;
          listener.onReasoning?.(delta);
        },
        onReplace: (text) => {
          shown = text;
          shownAnything ||= text.length > 0;
          listener.onReplace?.(text);
        },
      };
      // Send the request, retrying a transient failure. A refusal of
      // `reasoning_effort` is not transient, so it leaves this loop for the
      // outer one, which drops the field and rebuilds the payload.
      //
      // Each attempt owns an abort controller that releases its connection. The
      // socket has to outlive the response object — reading the body happens
      // after this loop — so the controller for a kept response is handed out
      // rather than aborted here. Aborting it in a `finally` would cancel the
      // very stream the caller is about to read.
      let attempt = 0;
      let response: Response | undefined;
      let responseAttempt: RequestAttempt | undefined;
      let releaseAfterRead: AbortController | undefined;
      let refusal = "";
      let refusalClass: ProviderFailureClass | undefined;
      let dropEffort = false;
      for (;;) {
        const releaseStream = new AbortController();
        const requestSignal = signal
          ? AbortSignal.any([signal, releaseStream.signal])
          : releaseStream.signal;
        let requestedDelayMs: number | undefined;
        let transient = false;
        let releaseNow = true;
        try {
          const body = JSON.stringify(payload);
          const modelAttempt = await prepareRequestAttempt({ body, provider: request.provider.provider ?? '', model: request.provider.model,
            endpoint, purpose: options.agentMode ? 'subagent' : 'turn', requestId, policy: request.requestPolicy });
          const attemptResponse = await modelAttempt.send(
            endpointUrl(request.provider.baseUrl, endpoint, request.provider.model),
            {
              method: "POST",
              headers: { ...request.provider.headers, ...requestHeaders },
              body,
              signal: requestSignal,
            },
            fetchImpl, request.modelTransport,
          );
          if (attemptResponse.ok) {
            clearContextUsage(request.sessionId);
            response = attemptResponse;
            responseAttempt = modelAttempt;
            options.onRequestSent?.({
              context: requestContext({ body, endpoint, fields: endpointShape(endpoint).contextFields,
                provider: request.provider.provider ?? '', model: request.provider.model,
                ...(!(options.agentMode && request.systemPromptFor) && request.systemPromptSources
                  ? { systemSources: request.systemPromptSources } : {}) }),
              endpoint,
              maxTokensField: shape.maxTokensField,
              reasoning: catalogModel(request.catalog ?? [], request.provider.provider ?? "", request.provider.model)?.reasoning,
              url: endpointUrl(request.provider.baseUrl, endpoint, request.provider.model),
              headers: request.provider.headers,
              requestHeaders,
              body,
            });
            releaseAfterRead = releaseStream;
            releaseNow = false;
            break;
          }
          modelAttempt.settle();
          const detail = await attemptResponse.text();
          // The conversation outgrew the window. That is answered by condensing,
          // not by asking again, so it keeps its own prefix and stops here.
          if (isContextOverflow(detail)) {
            return stamp(errorStep(`${CONTEXT_OVERFLOW_PREFIX}${detail.slice(0, 200)}`));
          }
          if (effort && /reasoning_effort|thinking|reasoning.*(?:effort|budget)/i.test(detail) && attemptResponse.status >= 400 && attemptResponse.status < 500 && attemptResponse.status !== 429) {
            if (explicitEffort) return stamp(errorStep('Provider rejected the selected reasoning effort. The preference was preserved. Select another level or use /thinking auto.'));
            dropEffort = true;
            break;
          }
          refusal = `Provider HTTP ${attemptResponse.status}: ${detail.slice(0, 200)}`;
          // The class is recorded alongside the message rather than replacing
          // it: the message carries the provider's own words, which is what
          // makes a failure diagnosable, while the class is what lets a reader
          // tell an expired key from an exhausted quota without matching on
          // prose that every provider phrases differently.
          refusalClass = classifyProviderFailure({
            status: attemptResponse.status,
            message: detail,
          });
          transient = isRetryableStatus(attemptResponse.status);
          if (transient) {
            requestedDelayMs = serverRequestedDelayMs(
              attemptResponse.headers.get("retry-after-ms"),
              attemptResponse.headers.get("retry-after"),
            );
          }
        } catch (error) {
          if (error instanceof ModelAdmissionError) return stamp({ ...errorStep(error.message, true), admissionFailure: error.code });
          if (signal?.aborted) return stamp(abortedStep(""));
          // The request never arrived, which is the failure a second attempt
          // most often fixes.
          refusal = `Network error: ${error instanceof Error ? error.message : String(error)}`;
          transient = true;
        } finally {
          // An attempt whose body is not being read releases its connection now.
          if (releaseNow) releaseStream.abort();
        }

        attempt += 1;
        if (!transient || attempt > retry.maxRetries) {
          // Marked only when this layer actually retried. With the default of no
          // provider retries nothing was tried again here, so the loop above is
          // the only layer that can — marking it then would leave a transient
          // failure with no retry at all, which is worse than the doubling this
          // exists to prevent.
          const tried = retry.maxRetries > 0;
          return stamp({
            ...(refusalClass
              ? failedStep(refusal, "", refusalClass, tried)
              : errorStep(refusal, tried)),
            ...(requestedDelayMs !== undefined ? { requestedDelayMs } : {}),
          });
        }
        // The server named a wait longer than this run will take, so it is not
        // worth asking again now. Reported rather than slept through: the number
        // it gave is the part a caller can act on, and waiting the ceiling to be
        // told the same thing costs a request and says nothing about why.
        if (exceedsRetryCeiling(retry, requestedDelayMs)) {
          const seconds = Math.ceil((requestedDelayMs ?? 0) / 1000);
          return stamp(
            errorStep(`Provider asked for a ${seconds}s wait before retrying, which is longer than this run will wait.`),
          );
        }
        const waited = await waitBeforeRetry(retryDelayMs(retry, attempt, requestedDelayMs), signal);
        if (!waited) return stamp(abortedStep(""));
      }

      if (dropEffort) {
        // Rebuilding without the field is the retry: the request is otherwise
        // identical, and asking again with it would fail again.
        effortAccepted = false;
        continue;
      }
      if (!response) return stamp(errorStep(refusal || "Provider returned no response."));

      try {
        const completion = await readCompletion(response, watched, endpoint);
        const usage = completion.usage;
        responseAttempt?.settle(usage);
        if (hasUsage(usage)) {
          recordSessionUsage(request.sessionId, {
            ...usageFromProvider(usage),
            model: request.provider.model,
            // Recorded with the bucket, not looked up later: a provider switch must
            // not reprice tokens that were already spent at the old provider's rate.
            provider: request.provider.provider,
            // The provider counted the prompt it was sent; the message count lets
            // a later reader add whatever the conversation gained since.
            promptMessageCount: messages.length + 1,
          }, { promptMeasured: typeof usage.prompt_tokens === 'number' && Number.isFinite(usage.prompt_tokens) && usage.prompt_tokens >= 0 });
          options.onRequestUsage?.(usage);
        } else markContextUnknown(request.sessionId, 'usage-gap');
        const completed = toStep(completion, watched);
        return stamp(shownAnything && completed.stopReason === "error"
          ? { ...completed, retriesExhausted: true }
          : completed);
      } catch (error) {
        markContextUnknown(request.sessionId, 'usage-gap');
        if (error instanceof ModelAdmissionError) return stamp({ ...failedStep(error.message, shown, undefined, true), admissionFailure: error.code });
        if (signal?.aborted) return stamp(abortedStep(shown));
        const detail = error instanceof Error ? error.message : String(error);
        if (!shownAnything && !REFUSAL.test(detail) && streamAttempts < retry.maxRetries && /socket|connection|network|fetch|terminated|unexpected eof/i.test(detail)) {
          streamAttempts += 1;
          releaseAfterRead?.abort();
          const waited = await waitBeforeRetry(retryDelayMs(retry, streamAttempts, undefined), signal);
          if (!waited) return stamp(abortedStep(""));
          continue;
        }
        // The text already streamed is kept and the step is still marked failed.
        // Keeping it alone would present a truncated answer as a finished one —
        // the user has read the opening and nothing says the rest is missing —
        // and discarding it would take away what they already saw. Both facts
        // travel: the text is what was said, `stopReason` is that it stopped
        // early.
        return stamp(failedStep(`Network error: ${error instanceof Error ? error.message : String(error)}`, shown, undefined, shownAnything || streamAttempts > 0));
      } finally {
        // Reading ends as soon as the answer is complete, which can be before
        // the host closes the stream — a keep-alive proxy holds the connection
        // open afterwards. Releasing it here rather than leaving it to the host
        // means a connection nobody is reading cannot outlive the turn.
        releaseAfterRead?.abort();
      }
    }
  };
}

/**
 * Bridge tool results and a following user turn, for the endpoints that need it.
 *
 * Some providers reject a user message that directly follows tool results. The
 * bridge is a synthetic assistant turn rather than a reordering, because
 * reordering would change what the conversation says — moving the user's message
 * earlier would attribute it to a moment before the model had read the results.
 *
 * A no-op for every model that did not ask for it, which is all of them today.
 */

function bridgeToolResults(
  messages: readonly ChatMessage[],
  enabled: boolean,
): readonly ChatMessage[] {
  if (!enabled) return messages;
  const bridged: ChatMessage[] = [];
  for (const message of messages) {
    const previous = bridged[bridged.length - 1];
    if (message.role === "user" && previous?.role === "tool") {
      bridged.push({ role: "assistant", content: "I have processed the tool results." });
    }
    bridged.push(message);
  }
  return bridged;
}

async function readCompletion(
  response: Response,
  listener: StepListener,
  endpoint?: EndpointKind,
): Promise<CompletionShape> {
  if (!isEventStream(response)) {
    // A provider that ignored `stream: true` answers with one JSON body; the
    // text then arrives in a single delta. The two endpoints disagree about the
    // body's shape as well, so the whole-body case is read the same way the
    // streamed one is.
    const read = endpointShape(endpoint).readBody(await response.json());
    return read as CompletionShape;
  }
  const stream = endpointShape(endpoint).readStream(response.body!);
  let streamed = "";
  for (;;) {
    const step = await stream.next();
    if (step.done === true) {
      return {
        choices: [{ message: step.value.message, finish_reason: step.value.finishReason }],
        usage: step.value.usage,
        reasoning: step.value.reasoning,
        ...(step.value.reasoningSignature ? { reasoningSignature: step.value.reasoningSignature } : {}),
        streamed,
      };
    }
    if (step.value.kind === "reasoning") {
      listener.onReasoning?.(step.value.text);
      continue;
    }
    streamed += step.value.text;
    listener.onText?.(step.value.text);
  }
}

/** Shape the assembled response into a kernel step. */
export function toStep(completion: CompletionShape, listener: StepListener): AssistantStep {
  const choice = completion.choices?.[0];
  const message = choice?.message;
  if (!message) return errorStep("Empty response from provider");
  const { text, calls } = liftInlineCalls(message.content ?? "", message.tool_calls ?? []);
  if (text) {
    if (completion.streamed === undefined) listener.onText?.(text);
    else if (text !== completion.streamed) listener.onReplace?.(text);
  }
  const silent = !text && calls.length === 0;
  return {
    text,
    toolCalls: calls.map(toToolCall),
    stopReason: stopReasonOf(choice?.finish_reason),
    // Carried so the next request in this trajectory can hand the reasoning back
    // signed. It is not shown a second time — the deltas already were — but a
    // provider that signed it rejects the request that omits it.
    ...(completion.reasoning
      ? {
          reasoning: {
            text: completion.reasoning,
            ...(completion.reasoningSignature ? { signature: completion.reasoningSignature } : {}),
            ...(completion.reasoningRedacted ? { redacted: true } : {}),
          },
        }
      : {}),
    ...(silent ? { errorMessage: emptyAnswerExplanation(choice?.finish_reason, completion.reasoning?.length ?? 0) } : {}),
  };
}
function toToolCall(call: StreamedToolCall): AgentToolCall {
  let args: unknown;
  try {
    args = parseJsonWithRepair<Record<string, unknown>>(call.function.arguments || "{}");
  } catch (error) {
    args = {
      [PARSE_ERROR_KEY]: `Invalid JSON arguments: ${error instanceof Error ? error.message : String(error)}. Raw: ${call.function.arguments.slice(0, 500)}`,
    };
  }
  return { id: call.id, name: call.function.name, args };
}

/**
 * The kernel stop reason for a provider's finish reason.
 *
 * Every protocol normalizes its own vocabulary at its reader — `end_turn` and
 * `MAX_TOKENS` and the rest are translated there, where the protocol's own
 * meanings are known — so this reads one vocabulary and not six.
 *
 * `length` is the one reason that means "truncated, ask for less". `stop` is
 * the one that means "finished". `content_filter` is a refusal: the answer did
 * not arrive, and saying it finished would present a withheld reply as a
 * completed turn. `null` is a provider that narrated a stream without saying how
 * it ended, which the readers only produce for a reason they could not read.
 */
function stopReasonOf(finishReason: string | null | undefined): AgentStopReason {
  if (finishReason === "length") return "length";
  if (finishReason === "stop" || finishReason === "tool_calls") return "stop";
  if (finishReason == null) return "stop";
  return "error";
}

/**
 * Tool calls a model wrote into its prose instead of the tool-call channel.
 *
 * The inline block is lifted out so the text shown is the answer alone and the
 * calls run like any other. Inner tags are constrained to one invocation so a
 * malformed block cannot swallow the next one.
 */
function liftInlineCalls(
  content: string,
  channelCalls: readonly StreamedToolCall[],
): { readonly text: string; readonly calls: readonly StreamedToolCall[] } {
  if (!content.includes("<｜DSML｜invoke")) return { text: content, calls: channelCalls };
  const lifted: StreamedToolCall[] = [];
  const matches = content.matchAll(
    /<｜DSML｜invoke\s+name=["']([^"']+)["']>(?:(?!<\/｜DSML｜invoke>)[\s\S])*?<｜DSML｜parameter\s+name=["']arguments["'][^>]*>([\s\S]*?)<\/｜DSML｜parameter>(?:(?!<\/｜DSML｜invoke>)[\s\S])*?<\/｜DSML｜invoke>/gi,
  );
  for (const match of matches) {
    lifted.push({
      id: `call_${Math.random().toString(36).slice(2, 9)}`,
      type: "function",
      function: { name: match[1], arguments: match[2].trim() },
    });
  }
  const text = content
    .replace(/<｜DSML｜tool_calls>[\s\S]*?<\/｜DSML｜tool_calls>/gi, "")
    .replace(/<｜DSML｜invoke[\s\S]*?<\/｜DSML｜invoke>/gi, "")
    .trim();
  return { text, calls: [...channelCalls, ...lifted] };
}

function abortedStep(shown: string): AssistantStep {
  return { text: shown, toolCalls: [], stopReason: "aborted", errorMessage: "Operation aborted" };
}


function errorStep(message: string, retriesExhausted = false): AssistantStep {
  return {
    text: "",
    toolCalls: [],
    stopReason: "error",
    errorMessage: message,
    ...(retriesExhausted ? { retriesExhausted: true } : {}),
  };
}

/**
 * A step that failed, with whatever it had already said.
 *
 * `shown` is carried because the user has read it and dropping it loses what
 * they saw. The stop reason is set regardless, because it is not the answer: a
 * step that returned only the text would claim a finished answer that never
 * arrived.
 *
 * `failureClass` is recorded alongside `message` rather than folded into it.
 * The message is the provider's own words, which is what makes a failure
 * diagnosable; the class is what lets a reader act on it without matching
 * against prose every provider phrases differently.
 */
function failedStep(
  message: string,
  shown = "",
  failureClass?: ProviderFailureClass,
  retriesExhausted = false,
): AssistantStep {
  return {
    text: shown,
    toolCalls: [],
    stopReason: "error",
    errorMessage: message,
    ...(failureClass ? { failureClass } : {}),
    ...(retriesExhausted ? { retriesExhausted: true } : {}),
  };
}

/**
 * Why a step produced no answer, in terms the user can act on.
 *
 * Each case has a different remedy, so each is named: a truncated response needs a
 * shorter context, a refusal needs a different request, and a model that spent the
 * whole step reasoning without concluding needs to be asked again.
 */
export function emptyAnswerExplanation(finishReason: string | null | undefined, reasoningLength: number): string {
  if (finishReason === "length") {
    return "The reply was cut off before any of it arrived — the context is probably full. Run `/compact` and ask again.";
  }
  if (REFUSAL.test(finishReason ?? "")) {
    return "The provider withheld the reply. Rephrasing the request usually gets past it.";
  }
  if (reasoningLength > 0) {
    return `The model spent the whole turn working and never wrote an answer (${reasoningLength} characters of reasoning, shown above). Asking again usually resolves it.`;
  }
  return `The model returned nothing at all${finishReason ? ` (${finishReason})` : ""}. Ask again, or check the provider with \`/connect\`.`;
}
