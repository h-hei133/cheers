import type { PreparedTurnContext, StepOptions, StepRequest } from './context/contract.js';
export type { PreparedTurnContext, ProviderTarget, StepOptions, StepRequest } from './context/contract.js';
import { createTurnContextPreparer, TurnPreparationError } from './context/prepare.js';
import { bindTurnContext } from './context/owner.js';
import type { MessageProjection } from '../core/agent/messages.js';
import { captureMessageHistory } from '../core/agent/custom.js';
import { randomUUID } from 'node:crypto';
import { createComponentLogger } from "../observability/structuredLogger.js";
import { ModelAdmissionError } from '../core/agent/request/model.js';
import { prepareRequestAttempt, type RequestAttempt } from '../provider/request/attempt.js';
import { InputLimitError } from '../provider/request/input.js';
import { hasUsage, usageFromProvider } from "../provider/response/usage.js";
import { parseToolArgs, type AgentToolCall } from "../core/agent/tools.js";
import type { AgentMessage, AgentStopReason } from "../core/agent/state.js";
import type { AssistantStep } from "../core/agent/loop.js";
import { clearContextUsage, markContextUnknown, recordSessionUsage, type SessionUsageRecord } from "../observability/usageTelemetry.js";
import { captureThinkingPreference } from '../core/models/preference.js';
import { isEventStream, type ProviderUsage, type StreamedToolCall } from "./completion.js";
import { endpointShape, type EndpointKind } from "../provider/endpoints/index.js";
import { requestReplayBinding } from '../provider/request/replay.js';
import { classifyProviderFailure, type ProviderFailureClass } from "../provider/registry/provider.js";
import { IncompleteStreamError, ProviderResponseError } from '../provider/response/error.js';
import { providerRequestError } from '../provider/request/error.js';
import { PARSE_ERROR_KEY } from "./tools.js";
import { requestContext } from '../context/request/projection.js';
import { decodePromptMeasurement } from '../context/request/measurement.js';
import {
  REFUSAL,
  shouldRetryResponse,
  resolveRetryPolicy,
  exceedsRetryCeiling,
  retryDelayMs,
  serverRequestedDelayMs,
  waitBeforeRetry,
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

/** What a step reports while it runs, before the assembled message exists. */
export interface StepListener {
  readonly onText?: (delta: string) => void;
  readonly onReasoning?: (delta: string) => void;
  /** The validated public reasoning differs from this message's deltas. */
  readonly onReasoningReplace?: (text: string) => void;
  /** The assembled text differs from the streamed deltas. */
  readonly onReplace?: (text: string) => void;
}

/** The model side of the kernel: the next assistant step for a context. */
export type StepFunction = ((
  messages: readonly AgentMessage[],
  signal: AbortSignal | undefined,
  listener: StepListener,
  options: StepOptions,
) => Promise<AssistantStep>) & {
  /** This step supplies complete request preparation before its dispatch boundary. */
  readonly preparesContext?: boolean;
};

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
/** One captured target and reasoning preference, with per-step tool admission. */
export function createStepFunction(request: StepRequest): StepFunction {
  const traceLogger = createComponentLogger("provider-request");
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
  const baseOrigin =
    request.provider.model || request.provider.provider
      ? { ...(request.provider.provider ? { provider: request.provider.provider } : {}), model: request.provider.model }
      : undefined;
  const replayBinding = request.provider.replayBinding ?? requestReplayBinding(request.provider);
  const step: StepFunction = async (messages, signal, listener, options): Promise<AssistantStep> => {
    let sourceMessages = options.sourceMessages ?? messages;
    const recordAuxiliaryUsage = request.recordAuxiliaryUsage;
    let messageProjection: MessageProjection | undefined;
    const requestId = options.requestId ?? randomUUID();
    let requestAcceptedAt: number | undefined;
    let acceptedResponse = false;
    let shownReasoning = '';
    let activeOrigin = baseOrigin;
    let currentAllowTools = options.allowTools;
    const stamp = (step: AssistantStep): AssistantStep => {
      const recorded = !step.reasoning && shownReasoning && (step.stopReason === 'error' || step.stopReason === 'aborted')
        ? { ...step, reasoning: { text: shownReasoning } } : step;
      return { ...recorded, toolsAllowed: currentAllowTools, ...(activeOrigin ? { origin: recorded.origin ?? activeOrigin } : {}) };
    };
    let streamAttempts = 0;
    let preparationOffered = false;
    let identityPreparations = 0;
    const contextOwner = options.contextOwner;
    const prepare = createTurnContextPreparer(request, options, { thinkingEffort: captured.thinkingEffort,
      explicitEffort, effortAccepted: () => effortAccepted, streamAttempts: () => streamAttempts, replayBinding });
    for (;;) {
      let prepared: PreparedTurnContext;
      let barePrepared: PreparedTurnContext;
      try {
        if (streamAttempts === 0 && !messageProjection && options.providerMessages !== undefined) {
          const providerMessages = captureMessageHistory(options.providerMessages);
          messageProjection = { messages: providerMessages.map(message => ({ ...message, content: message.content ?? '' })),
            sourceMessages, providerMessages };
        }
        if (contextOwner && !contextOwner.isCurrent()) throw new TurnPreparationError('Request history changed during preparation. No request was sent.', true);
        prepared = streamAttempts === 0 && options.preparedContext
          ? options.preparedContext : await prepare(sourceMessages, signal, messageProjection);
        if (contextOwner && !contextOwner.isCurrent()) throw new TurnPreparationError('Request history changed during preparation. No request was sent.', true);
        if (!prepared.isCurrent()) {
          if (identityPreparations++ >= 1) return stamp(errorStep('Request preparation changed repeatedly. No request was sent.', true));
          prepared = await prepared.refresh(signal);
        }
        if (contextOwner && !contextOwner.isCurrent()) throw new TurnPreparationError('Request history changed during preparation. No request was sent.', true);
        if (!preparationOffered && options.prepareContext) {
          preparationOffered = true;
          const replacement = await options.prepareContext(prepared, signal);
          signal?.throwIfAborted();
          if (replacement) prepared = replacement;
        }
        options.onPreparedContext?.(prepared);
        if (contextOwner && !contextOwner.isCurrent()) throw new TurnPreparationError('Request history changed during preparation. No request was sent.', true);
        if (!prepared.isCurrent()) {
          if (identityPreparations++ >= 1) return stamp(errorStep('Request preparation changed repeatedly. No request was sent.', true));
          prepared = await prepared.refresh(signal);
          options.onPreparedContext?.(prepared);
        }
        barePrepared = prepared;
        if (contextOwner) prepared = bindTurnContext(prepared, contextOwner);
        if (!prepared.isCurrent()) return stamp(errorStep('Request preparation changed repeatedly. No request was sent.', true));
        currentAllowTools = prepared.allowTools;
        activeOrigin = prepared.activeProvider || prepared.activeModel
          ? { ...(prepared.activeProvider ? { provider: prepared.activeProvider } : {}), model: prepared.activeModel } : undefined;
        if (prepared.refusal) return stamp(errorStep(prepared.refusal.detail, prepared.refusal.inputLimit ?? false));
        if (!prepared.budget.ok && prepared.budget.reason !== 'unknown') return stamp(errorStep(`${CONTEXT_OVERFLOW_PREFIX}${prepared.budget.detail}`));
      } catch (error) {
        if (signal?.aborted) return stamp(abortedStep(''));
        return stamp(errorStep(error instanceof TurnPreparationError ? error.message : 'Request context preparation failed. No request was sent.',
          error instanceof TurnPreparationError && error.inputLimit));
      }
      sourceMessages = prepared.sourceMessages;
      messageProjection = prepared.messageProjection;
      const { activeProvider, activeModel, effort, endpoint, shape, protocol, modelEntry,
        usageAttribution, inputLimits, promptIdentity, promptProjection, requestHeaders, body } = prepared;
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
          shownReasoning += delta;
          shownAnything ||= delta.length > 0;
          listener.onReasoning?.(delta);
        },
        onReasoningReplace: (text) => {
          shownReasoning = text;
          shownAnything ||= text.length > 0;
          listener.onReasoningReplace?.(text);
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
        let retryableAtTurn = true;
        let forceRetryAtTurn = false;
        let releaseNow = true;
        try {
          if (!prepared.isCurrent()) return stamp(errorStep('Request preparation changed before dispatch. No request was sent.', true));
          const modelAttempt = await prepareRequestAttempt({ body, provider: activeProvider, model: activeModel,
            endpoint, purpose: prepared.agentMode ? 'subagent' : 'turn', requestId, policy: request.requestPolicy, inputLimits,
            ...(request.provider.credentialId && request.provider.credentialGeneration
              ? { credential: { credentialId: request.provider.credentialId, generation: request.provider.credentialGeneration } } : {}) });
          const attemptResponse = await modelAttempt.send(
            prepared.url,
            {
              method: "POST",
              headers: { ...prepared.headers, ...requestHeaders },
              body,
              signal: requestSignal,
            },
            fetchImpl, (input, init, beforeDispatch) => {
              const admittedDispatch = () => {
                if (!prepared.isCurrent()) throw new TurnPreparationError('Request preparation changed before dispatch. No request was sent.', true);
                if (barePrepared.pendingDeclaration) {
                  try {
                    if (!options.onDeclaration) throw new Error('unavailable');
                    options.onDeclaration(barePrepared.pendingDeclaration, {
                      ...barePrepared.messageProjection, sourceMessages: barePrepared.prospectiveMessages,
                    });
                  } catch {
                    throw new TurnPreparationError('Request declaration persistence failed. No request was sent.', true);
                  }
                  barePrepared = barePrepared.published();
                  sourceMessages = barePrepared.sourceMessages;
                  messageProjection = barePrepared.messageProjection;
                  // Recovery must retain the new bare capture, independently of
                  // this request's live fence after its assistant is appended.
                  options.onPreparedContext?.(barePrepared);
                  prepared = contextOwner ? bindTurnContext(barePrepared, contextOwner) : barePrepared;
                }
                requestSignal.throwIfAborted();
                if (!prepared.isCurrent()) throw new TurnPreparationError('Request preparation changed before dispatch. No request was sent.', true);
                beforeDispatch();
              };
              if (request.modelTransport) {
                if (!prepared.isCurrent()) throw new TurnPreparationError('Request preparation changed before dispatch. No request was sent.', true);
                return request.modelTransport(input, init, admittedDispatch);
              }
              admittedDispatch();
              return fetchImpl(input, init);
            },
          );
          if (attemptResponse.ok) {
            requestAcceptedAt = Date.now();
            acceptedResponse = true;
            traceLogger.info("provider request accepted", { requestId, endpoint, provider: activeProvider, model: activeModel, attempt });
            if (!prepared.agentMode) clearContextUsage(request.sessionId);
            response = attemptResponse;
            responseAttempt = modelAttempt;
            options.onRequestSent?.({
              promptIdentity,
              context: requestContext({ body, endpoint, fields: protocol.contextFields,
                provider: activeProvider, model: activeModel,
                tokenizer: modelEntry?.tokenizer,
                ...(!prepared.regeneratedPrompt && request.systemPromptSources
                  ? { systemSources: request.systemPromptSources } : {}) }),
              endpoint,
              maxTokensField: shape.maxTokensField,
              reasoning: modelEntry?.reasoning,
              inputLimits,
              url: prepared.url,
              headers: prepared.headers,
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
            return stamp(errorStep(`${CONTEXT_OVERFLOW_PREFIX}Provider rejected the context size.`));
          }
          if (effort && /reasoning_effort|thinking|reasoning.*(?:effort|budget)/i.test(detail) && attemptResponse.status >= 400 && attemptResponse.status < 500 && attemptResponse.status !== 429) {
            if (explicitEffort) return stamp(errorStep('Provider rejected the selected reasoning effort. The preference was preserved. Select another level or use /thinking auto.'));
            dropEffort = true;
            break;
          }
          // Provider bodies may echo credentials, prompts or private workspace text.
          // Keep them within classification; only the status and category cross the result boundary.
          refusalClass = classifyProviderFailure({
            status: attemptResponse.status,
            message: detail,
          });
          refusal = `Provider HTTP ${attemptResponse.status}: ${refusalClass}. Response details withheld.`;
          const shouldRetryHeader = attemptResponse.headers.get("x-should-retry");
          const normalizedRetryHeader = shouldRetryHeader?.trim().toLowerCase();
          transient = shouldRetryResponse(shouldRetryHeader, attemptResponse.status);
          if (normalizedRetryHeader === "false") retryableAtTurn = false;
          else if (normalizedRetryHeader === "true") forceRetryAtTurn = true;
          if (transient) {
            requestedDelayMs = serverRequestedDelayMs(
              attemptResponse.headers.get("retry-after-ms"),
              attemptResponse.headers.get("retry-after"),
            );
          }
        } catch (error) {
          if (error instanceof TurnPreparationError) return stamp(errorStep(error.message, error.inputLimit));
          if (error instanceof InputLimitError) return stamp(errorStep(error.message, true));
          if (error instanceof ModelAdmissionError) return stamp({ ...errorStep(error.message, true), admissionFailure: error.code });
          if (signal?.aborted) return stamp(abortedStep(""));
          // No response was observed. This does not establish whether the
          // provider received or charged the dispatched request.
          const failure = providerRequestError(error);
          refusal = failure.message;
          refusalClass = failure.failureClass;
          retryableAtTurn = failure.retryable;
          transient = failure.retryable;
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
          const tried = retry.maxRetries > 0 || !retryableAtTurn;
          return stamp({
            ...(refusalClass
              ? failedStep(refusal, "", refusalClass, tried)
              : errorStep(refusal, tried)),
            ...(forceRetryAtTurn ? { retryable: true } : {}),
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
        streamAttempts += 1;
        continue;
      }
      if (!response) return stamp(errorStep(refusal || "Provider returned no response."));

      try {
        const completion = await readCompletion(response, watched, endpoint);
        traceLogger.info("provider request completed", { requestId, endpoint, provider: activeProvider, model: activeModel, attempt: streamAttempts, usage: Boolean(completion.usage), durationMs: requestAcceptedAt === undefined ? undefined : Math.max(0, Date.now() - requestAcceptedAt) });
        const usage = completion.usage;
        const choice = completion.choices?.[0];
        const stopReason = choice?.message ? stopReasonOf(choice.finish_reason) : 'error';
        const counted = hasUsage(usage) ? usageFromProvider(usage) : undefined;
        // Both live reuse and persistence depend on this exact validated count.
        // Classify before accounting without invoking display callbacks: their
        // failure must not discard usage the provider has already reported.
        const promptMeasurement = !prepared.agentMode && counted && typeof usage?.prompt_tokens === 'number'
          && Number.isSafeInteger(usage.prompt_tokens) && usage.prompt_tokens >= 0
          && stopReason !== 'error' && stopReason !== 'aborted'
          ? decodePromptMeasurement({ tokens: counted.promptTokens + counted.cacheReadTokens + counted.cacheWriteTokens,
            messageCount: sourceMessages.length, identity: promptIdentity,
            projection: promptProjection }) : undefined;
        if (usage && counted) {
          const record: SessionUsageRecord = {
            ...counted,
            attribution: usageAttribution,
            model: activeModel,
            // Recorded with the bucket, not looked up later: a provider switch must
            // not reprice tokens that were already spent at the old provider's rate.
            provider: activeProvider,
            // The raw selected count preserves context-status calibration. The
            // projection digest and its own count below bind budgets to the
            // exact compacted, bridged and closing-step wire history.
            promptMessageCount: sourceMessages.length,
            // Use the effective schemas and system prompt, not the unfiltered
            // declarations: allowed tools and agent mode can change what was
            // actually sent, and a measurement from the wrong request is stale.
            promptIdentity,
            promptProjection,
            purpose: prepared.requestPurpose,
          };
          if (prepared.agentMode && recordAuxiliaryUsage) recordAuxiliaryUsage(record);
          else recordSessionUsage(request.sessionId, record, { affectsContext: !prepared.agentMode,
            promptMeasured: Boolean(promptMeasurement) });
          options.onRequestUsage?.(usage);
        } else if (!prepared.agentMode) markContextUnknown(request.sessionId, 'usage-gap');
        responseAttempt?.settle(usage);
        const decoded = toStep(completion, watched, stopReason);
        const ownsReplay = decoded.stopReason !== 'error' && decoded.stopReason !== 'aborted'
          && (completion.reasoningSignature && protocol.opaqueReplay
            || shape.reasoningReplayField && completion.reasoning && !completion.reasoningSignature && !completion.reasoningRedacted);
        const completed = ownsReplay && activeOrigin
          ? { ...decoded, origin: { ...activeOrigin, replayBinding } } : decoded;
        return stamp({ ...completed, ...(promptMeasurement ? { promptMeasurement } : {}),
          ...(shownAnything && completed.stopReason === 'error' ? { retriesExhausted: true } : {}) });
      } catch (error) {
        if (!prepared.agentMode) markContextUnknown(request.sessionId, 'usage-gap');
        if (error instanceof ModelAdmissionError) return stamp({ ...failedStep(error.message, shown, undefined, true), admissionFailure: error.code });
        if (signal?.aborted) return stamp(abortedStep(shown));
        if (error instanceof ProviderResponseError || error instanceof IncompleteStreamError) {
          return stamp(failedStep(error.message, shown, error.failureClass,
            acceptedResponse || shownAnything || streamAttempts > 0));
        }
        const detail = error instanceof Error ? error.message : String(error);
        if (!acceptedResponse && !shownAnything && !REFUSAL.test(detail) && streamAttempts < retry.maxRetries && /socket|connection|network|fetch|terminated|unexpected eof/i.test(detail)) {
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
        const failure = providerRequestError(error);
        return stamp(failedStep(failure.message, shown, failure.failureClass,
          acceptedResponse || shownAnything || streamAttempts > 0 || !failure.retryable));
      } finally {
        // Reading ends as soon as the answer is complete, which can be before
        // the host closes the stream — a keep-alive proxy holds the connection
        // open afterwards. Releasing it here rather than leaving it to the host
        // means a connection nobody is reading cannot outlive the turn.
        releaseAfterRead?.abort();
      }
    }
  };
  return Object.assign(step, { preparesContext: true as const });
}

async function readCompletion(
  response: Response,
  listener: StepListener,
  endpoint?: EndpointKind,
): Promise<CompletionShape> {
  if (!isEventStream(response)) {
    if (endpointShape(endpoint).simpleResponse === 'stream') {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('The account service did not return an event stream.');
    }
    // A provider that ignored `stream: true` answers with one JSON body; the
    // text then arrives in a single delta. The two endpoints disagree about the
    // body's shape as well, so the whole-body case is read the same way the
    // streamed one is.
    const read = endpointShape(endpoint).readBody(await response.json());
    return read as CompletionShape;
  }
  const stream = endpointShape(endpoint).readStream(response.body!);
  let streamed = "";
  try {
  for (;;) {
    const step = await stream.next();
    if (step.done === true) {
      return {
        choices: [{ message: step.value.message, finish_reason: step.value.finishReason }],
        usage: step.value.usage,
        reasoning: step.value.reasoning,
        ...(step.value.reasoningSignature ? { reasoningSignature: step.value.reasoningSignature } : {}),
        ...(step.value.reasoningRedacted ? { reasoningRedacted: true } : {}),
        streamed,
      };
    }
    if (step.value.kind === "reasoning") {
      listener.onReasoning?.(step.value.text);
      continue;
    }
    if (step.value.kind === "reasoning.replace") {
      listener.onReasoningReplace?.(step.value.text);
      continue;
    }
    streamed += step.value.text;
    listener.onText?.(step.value.text);
  }
  } finally {
    await stream.return(undefined as never);
  }
}

/** Shape the assembled response into a kernel step. */
export function toStep(completion: CompletionShape, listener: StepListener,
  stopReason: AgentStopReason = stopReasonOf(completion.choices?.[0]?.finish_reason)): AssistantStep {
  const choice = completion.choices?.[0];
  const message = choice?.message;
  if (!message) return errorStep("Empty response from provider");
  // A truncated text block cannot authorize an inline invocation assembled from prose.
  const { text, calls } = choice?.finish_reason === 'length'
    ? { text: message.content ?? '', calls: message.tool_calls ?? [] }
    : liftInlineCalls(message.content ?? "", message.tool_calls ?? []);
  if (completion.streamed === undefined && completion.reasoning && !completion.reasoningRedacted) {
    listener.onReasoning?.(completion.reasoning);
  }
  if (text) {
    if (completion.streamed === undefined) listener.onText?.(text);
    else if (text !== completion.streamed) listener.onReplace?.(text);
  }
  const malformedEnvelope = calls.some(call => typeof call?.function?.name !== 'string'
    || call.function.name.trim().length === 0);
  const toolCalls = malformedEnvelope ? [] : calls.map(toToolCall);
  // Final arguments authorize execution. An incomplete sibling cannot be
  // repaired into a write or let the complete portion of its response run.
  const malformedArguments = stopReason !== 'length'
    && toolCalls.some(call => typeof call.args[PARSE_ERROR_KEY] === 'string');
  const malformed = malformedEnvelope || malformedArguments;
  // Signed and opaque blocks carry replay authority independently of origin.
  // A refused response retains only public reasoning text, never that authority.
  const replayReasoning = stopReason !== 'error' && stopReason !== 'aborted' && !malformed;
  const reasoningText = completion.reasoningRedacted && !replayReasoning ? undefined : completion.reasoning;
  const silent = !text && calls.length === 0;
  return {
    text,
    toolCalls: malformed ? [] : toolCalls,
    stopReason: malformed ? 'error' : stopReason,
    // Carried so the next request in this trajectory can hand the reasoning back
    // signed. It is not shown a second time — the deltas already were — but a
    // provider that signed it rejects the request that omits it.
    ...(reasoningText || replayReasoning && completion.reasoningSignature
      ? {
          reasoning: {
            text: reasoningText ?? '',
            ...(replayReasoning && completion.reasoningSignature ? { signature: completion.reasoningSignature } : {}),
            ...(replayReasoning && completion.reasoningRedacted ? { redacted: true } : {}),
          },
        }
      : {}),
    ...(malformed ? { errorMessage: malformedEnvelope ? 'Provider returned malformed tool calls. No tool calls were executed.'
      : 'Provider returned malformed tool arguments. No tool calls were executed.', retriesExhausted: true }
      : silent ? { errorMessage: emptyAnswerExplanation(choice?.finish_reason, completion.reasoning?.length ?? 0) } : {}),
  };
}
function toToolCall(call: StreamedToolCall): AgentToolCall & { readonly args: Record<string, unknown> } {
  const parsed = parseToolArgs(call.function.arguments);
  return { id: call.id, name: call.function.name,
    args: 'args' in parsed ? parsed.args : { [PARSE_ERROR_KEY]: 'Tool arguments must be a complete JSON object.' } };
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
 * The message is a report-safe explanation; private provider detail stays
 * within its classifier. The class lets a reader act without matching prose.
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
    return "The provider stopped at a length limit before an answer arrived. Check the output limit in `/settings` and ask again.";
  }
  if (REFUSAL.test(finishReason ?? "")) {
    return "The provider withheld the reply. Rephrasing the request usually gets past it.";
  }
  if (reasoningLength > 0) {
    return `The model spent the whole turn working and never wrote an answer (${reasoningLength} characters of reasoning, shown above). Asking again usually resolves it.`;
  }
  return `The model returned nothing at all${finishReason ? ` (${finishReason})` : ""}. Ask again, or check the provider with \`/connect\`.`;
}
