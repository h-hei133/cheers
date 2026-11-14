import type { AgentCoreOptions } from '../core/agent/agent.js';
import type { QueryEvent } from '../core/query/runtime/events.js';
import type { SessionMessage } from '../session/schema/sessionMessage.js';
import { hasUsage, usageFromProvider } from '../provider/response/usage.js';
import type { SentRequest } from '../provider/request/sentRequest.js';
import { getSessionUsage, recordRequestContext } from '../observability/usageTelemetry.js';
import type { PromptIdentitySnapshot } from '../observability/usage/model.js';
import type { CacheWarmingRunner } from './cacheWarm.js';
import type { StepFunction, StepOptions } from './step.js';
import type { EventChannel } from './stream.js';
import { rememberToolRequests, traceOperation } from '../observability/tracing/context.js';
import { randomUUID } from 'node:crypto';

/** One logical request, including its native retries, with no retained prompt/body. */
function tracedStep(step: StepFunction): StepFunction {
  return (messages, signal, listener, options) => {
    const requestId = options.requestId ?? randomUUID();
    return traceOperation({ name: 'provider.request', attributes: {
      requestId, purpose: options.requestPurpose ?? 'turn', usage: 'unknown',
    } }, async span => {
      let sent = false;
      const result = await step(messages, signal, listener, { ...options, requestId,
        onRequestSent: request => {
          sent = true;
          span?.setAttributes({ endpoint: request.endpoint ?? 'unknown', prepared: true });
          options.onRequestSent?.(request);
        },
        onRequestUsage: usage => {
          if (hasUsage(usage)) {
            const counted = usageFromProvider(usage);
            const inputReported = [usage.prompt_tokens, usage.cache_read_input_tokens, usage.cache_creation_input_tokens]
              .some(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);
            const outputReported = typeof usage.completion_tokens === 'number' && Number.isFinite(usage.completion_tokens) && usage.completion_tokens >= 0;
            span?.setAttributes({ usage: inputReported && outputReported ? 'reported' : 'partial',
              ...(inputReported ? { inputCount: counted.promptTokens + counted.cacheReadTokens + counted.cacheWriteTokens } : {}),
              ...(outputReported ? { outputCount: counted.completionTokens } : {}) });
          }
          options.onRequestUsage?.(usage);
        },
      });
      const outcome = signal?.aborted || result.stopReason === 'aborted' ? 'aborted'
        : result.stopReason === 'error' ? 'error' : 'settled';
      if (outcome === 'settled') rememberToolRequests(requestId, result.toolCalls.map(call => call.id));
      span?.setAttributes({ outcome, prepared: sent, stopReason: result.stopReason ?? 'unknown' });
      if (outcome !== 'settled') span?.setStatus({ status: 'error', error: {
        name: outcome === 'aborted' ? 'AbortError' : 'RequestError', message: outcome === 'aborted' ? 'Provider request aborted.' : 'Provider request failed.',
      } });
      return result;
    });
  };
}

interface RequestOptions {
  readonly claimBudgetSummary?: () => boolean;
  readonly step: StepFunction;
  readonly sessionId: string;
  readonly maxSteps: number;
  readonly allowedTools?: readonly string[];
  readonly cacheWarming?: CacheWarmingRunner;
  readonly onPromptIdentity?: (identity: PromptIdentitySnapshot) => void;
}

/**
 * A request that follows a discovery result is the request whose extra schema
 * and result context the quality protocol needs to attribute. The tool name is
 * read from the preceding assistant call, not inferred from the result text.
 */
export function requestPurposeFor(
  messages: readonly SessionMessage[],
): "turn" | "discovery-search" | "discovery-load" {
  const resultIds = new Set<string>();
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role === "tool") {
      if (message.tool_call_id) resultIds.add(message.tool_call_id);
      continue;
    }
    if (resultIds.size === 0 || message.role !== "assistant" || !message.tool_calls) break;
    const names = message.tool_calls
      .filter(call => resultIds.has(call.id))
      .map(call => call.function.name);
    if (names.includes("tool_load")) return "discovery-load";
    if (names.includes("tool_search")) return "discovery-search";
    break;
  }
  return "turn";
}

/** Bind one foreground request's display callbacks and accepted usage. */
export function createTurnRequest(
  options: RequestOptions,
  projection: { readonly stepCount: number },
  channel: EventChannel<QueryEvent>,
  promptSource?: { readonly opening: SessionMessage; readonly stored: SessionMessage },
): AgentCoreOptions['streamStep'] {
  // Captured wire identity belongs to this request, never rebuilt from history.
  let lastSentRequest: SentRequest | undefined;
  const stepRequest = tracedStep(options.step);
  return async (messages, signal, request) => {
    channel.push({ type: "message.started", role: "coder" });
    // A new request replaces the old prefix even if it fails or reports no usage.
    if (lastSentRequest) options.cacheWarming?.noteRequest(0, lastSentRequest);
    lastSentRequest = undefined;
    let sentRequest: SentRequest | undefined;
    let inputTokens = 0;
    const onRequestSent: NonNullable<StepOptions['onRequestSent']> = sent => {
      sentRequest = sent;
      inputTokens = 0;
      if (sent.context) recordRequestContext(options.sessionId, sent.context);
      if (sent.promptIdentity) options.onPromptIdentity?.(sent.promptIdentity);
    };
    const onRequestUsage: NonNullable<StepOptions['onRequestUsage']> = usage => {
      const counted = usageFromProvider(usage);
      inputTokens = counted.promptTokens + counted.cacheReadTokens + counted.cacheWriteTokens;
      if (sentRequest?.context && getSessionUsage(options.sessionId).requestContext === sentRequest.context &&
        typeof usage.prompt_tokens === 'number' && Number.isFinite(usage.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isFinite(inputTokens)) {
        recordRequestContext(options.sessionId, Object.freeze({ ...sentRequest.context, promptTokens: inputTokens }));
      }
    };
    let budgetSummary = false;
    const toolsAllowed = projection.stepCount < options.maxSteps;
    let streamedText = "";
    let streamedReasoning = "";
    const emitStreamUpdate = (delta?: string) => {
      request?.onUpdate?.({
        text: streamedText,
        ...(streamedReasoning ? { reasoning: streamedReasoning } : {}),
        ...(delta !== undefined ? { delta } : {}),
      });
    };
    let step = await stepRequest(
      messages,
      signal,
      {
        onText: (delta) => {
          streamedText += delta;
          channel.push({ type: "message.delta", role: "coder", delta });
          emitStreamUpdate(delta);
        },
        onReasoning: (delta) => {
          streamedReasoning += delta;
          channel.push({ type: "reasoning.delta", role: "coder", delta });
          emitStreamUpdate();
        },
        onReasoningReplace: (text) => {
          streamedReasoning = text;
          channel.push({ type: "reasoning.replace", role: "coder", text });
          emitStreamUpdate();
        },
        onReplace: (text) => {
          streamedText = text;
          channel.push({ type: "message.replace", role: "coder", text });
          emitStreamUpdate();
        },
      },
      {
        allowTools: toolsAllowed,
        ...(promptSource ? { promptSource } : {}),
        ...(options.allowedTools ? { allowedTools: options.allowedTools } : {}),
        requestPurpose: requestPurposeFor(messages),
        requestId: request?.requestId,
        // Kept so a refresh can replay it. Captured at the step, because that
        // is the only place the request exists in the shape it was sent.
        onRequestSent,
        onRequestUsage,
      },
    );
    if (!signal?.aborted && step.admissionFailure === 'exhausted' && options.claimBudgetSummary?.()) {
      budgetSummary = true;
      // This instruction is request-local: it has no user-message lifecycle,
      // persistence or display event. The ordinary step still enforces the cap.
      const closing = await stepRequest([...messages, { role: 'user', content:
        'The goal budget cannot admit the next working step. Summarize progress and remaining blockers, then stop. Do not call tools or claim completion without evidence.' }],
      signal, {
        onText: delta => channel.push({ type: 'message.delta', role: 'coder', delta }),
        onReasoning: delta => channel.push({ type: 'reasoning.delta', role: 'coder', delta }),
        onReasoningReplace: text => channel.push({ type: 'reasoning.replace', role: 'coder', text }),
        onReplace: text => channel.push({ type: 'message.replace', role: 'coder', text }),
      }, { allowTools: false, ...(options.allowedTools ? { allowedTools: options.allowedTools } : {}), requestPurpose: 'goal-budget-summary',
        onRequestSent, onRequestUsage });
      // Its input includes an unpersisted instruction, so it cannot anchor the
      // stored conversation. The step has already recorded the real usage.
      const { promptMeasurement: _measurement, ...recorded } = closing;
      step = { ...recorded, toolsAllowed: false, stopReason: closing.stopReason === 'aborted' || closing.toolCalls.length ? closing.stopReason : 'error', retriesExhausted: true,
        admissionFailure: closing.admissionFailure ?? 'exhausted',
        errorMessage: closing.errorMessage ?? 'Goal token budget exhausted. Progress summary returned; the goal remains incomplete.' };
    }
    if (!budgetSummary && !signal?.aborted && step.stopReason !== "error" && step.stopReason !== "aborted" && sentRequest && inputTokens > 0) {
      lastSentRequest = sentRequest;
      options.cacheWarming?.noteRequest(inputTokens, sentRequest);
    }
    return { ...step, toolsAllowed: toolsAllowed && step.toolsAllowed !== false };
  };
}
