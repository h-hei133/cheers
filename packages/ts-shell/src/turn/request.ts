import type { AgentCoreOptions } from '../core/agent/agent.js';
import type { QueryEvent } from '../core/query/runtime/events.js';
import type { SessionMessage } from '../session/schema/sessionMessage.js';
import { hasUsage, usageFromProvider } from '../provider/response/usage.js';
import { endpointShape } from '../provider/endpoints/index.js';
import type { UsageInputMode } from '../provider/response/metering.js';
import type { SentRequest } from '../provider/request/sentRequest.js';
import { getSessionUsage, recordRequestContext } from '../observability/usageTelemetry.js';
import type { PromptIdentitySnapshot } from '../observability/usage/model.js';
import type { CacheWarmingRunner } from './cacheWarm.js';
import type { StepFunction, StepListener, StepOptions } from './step.js';
import type { PreparedTurnContext } from './context/contract.js';
import type { RequestContextOwner } from '../core/agent/context.js';
import type { MessageConverter, MessageProjection } from '../core/agent/messages.js';
import { sameContext } from '../core/agent/context.js';
import type { EventChannel } from './stream.js';
import { rememberToolRequests, traceOperation } from '../observability/tracing/context.js';
import { RESPONSE_ACCEPTED } from '../observability/tracing/operations.js';
import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import { TurnPreparationError } from './context/prepare.js';
import type { StandardAgentMessage } from '../core/agent/state.js';

const BUDGET_SUMMARY_MESSAGE = 'The goal budget cannot admit the next working step. Summarize progress and remaining blockers, then stop. Do not call tools or claim completion without evidence.';
const PROMISE_THEN = Promise.prototype.then;
const PROMISE_SPECIES = Object.getOwnPropertyDescriptor(Promise, Symbol.species)?.get;

/** A synchronous dispatch barrier cannot wait for application persistence. */
function persistDeclaration(persist: (message: SessionMessage) => void, message: StandardAgentMessage): void {
  const result: unknown = persist(message);
  if (result === null || typeof result !== 'object' && typeof result !== 'function') return;
  // Observe only a plain native promise without invoking application accessors.
  if (!types.isProxy(result) && types.isPromise(result) && Object.getPrototypeOf(result) === Promise.prototype
    && !Object.getOwnPropertyDescriptor(result, 'constructor') && !Object.getOwnPropertyDescriptor(result, 'then')
    && Object.getOwnPropertyDescriptor(Promise.prototype, 'constructor')?.value === Promise
    && Object.getOwnPropertyDescriptor(Promise.prototype, 'then')?.value === PROMISE_THEN
    && Object.getOwnPropertyDescriptor(Promise, Symbol.species)?.get === PROMISE_SPECIES
    && Object.getOwnPropertyDescriptor(Promise, Symbol.species)?.set === undefined) {
    PROMISE_THEN.call(result, () => {}, () => {});
  }
  throw new TurnPreparationError('Request declaration persistence must complete synchronously. No request was sent.', true);
}

/** One logical request, including its native retries, with no retained prompt/body. */
function tracedStep(step: StepFunction): StepFunction {
  const traced: StepFunction = (messages, signal, listener, options) => {
    const requestId = options.requestId ?? randomUUID();
    return traceOperation({ name: 'provider.request', attributes: {
      requestId, purpose: options.requestPurpose ?? 'turn', usage: 'unknown',
    } }, async span => {
      let sent = false;
      let usageInput: UsageInputMode | undefined;
      let preparedUsageInput: UsageInputMode | undefined;
      let preparedCaptured = false;
      const result = await step(messages, signal, listener, { ...options, requestId,
        onRequestSent: request => {
          sent = true;
          usageInput = preparedCaptured ? preparedUsageInput : endpointShape(request.endpoint).usageInput;
          const endpoint = request.endpoint ?? 'unknown';
          span?.setAttributes({ endpoint, prepared: true });
          span?.addEvent(RESPONSE_ACCEPTED, { endpoint });
          options.onRequestSent?.(request);
        },
        onPreparedContext: prepared => {
          preparedCaptured = true;
          preparedUsageInput = prepared.usageInput;
          options.onPreparedContext?.(prepared);
        },
        onRequestUsage: usage => {
          if (hasUsage(usage)) {
            const counted = usageFromProvider(usage, usageInput);
            const inputReported = counted.inputComplete === true;
            const outputReported = typeof usage.completion_tokens === 'number' && Number.isSafeInteger(usage.completion_tokens)
              && usage.completion_tokens >= 0 && usage.metering_output_complete !== false;
            span?.setAttributes({ usage: inputReported && outputReported ? 'reported' : 'partial',
              ...(inputReported ? { inputCount: counted.inputTokens } : {}),
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
  return Object.assign(traced, { preparesContext: step.preparesContext === true });
}

interface RequestOptions {
  readonly convertToLlm?: MessageConverter;
  readonly prepareContext?: (prepared: PreparedTurnContext, signal: AbortSignal | undefined, context: RequestContextOwner) => Promise<PreparedTurnContext | undefined>;
  readonly onPreparedContext?: (prepared: PreparedTurnContext, context: RequestContextOwner) => void;
  readonly consumePreparedContext?: (messages: readonly SessionMessage[]) => PreparedTurnContext | undefined;
  readonly claimBudgetSummary?: () => boolean;
  readonly step: StepFunction;
  readonly onMessage?: (message: SessionMessage) => void;
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
    if (message.requestDeclaration) continue;
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
  let lastConverted: { readonly projection: MessageProjection; readonly converter: MessageConverter | undefined } | undefined;
  const stepRequest = tracedStep(options.step);
  const streamStep: AgentCoreOptions['streamStep'] = async (messages, signal, request) => {
    const toolsAllowed = projection.stepCount < options.maxSteps;
    const recovered = options.consumePreparedContext?.(request?.sourceMessages ?? messages);
    const recovery = recovered ? await recovered.reframe({ allowTools: toolsAllowed, allowedTools: options.allowedTools,
      requestPurpose: requestPurposeFor(recovered.sourceMessages) }, signal) : undefined;
    const openingIndex = promptSource ? messages.indexOf(promptSource.opening) : -1;
    const activePromptSource = promptSource && request?.sourceMessages && openingIndex >= 0
      ? { opening: request.sourceMessages[openingIndex]!, stored: promptSource.stored } : promptSource;
    let activeMessages = recovery?.messageProjection.messages ?? messages;
    let activeProjection: MessageProjection = recovery?.messageProjection ?? {
      messages: messages as MessageProjection['messages'],
      ...(request?.sourceMessages ? { sourceMessages: request.sourceMessages, providerMessages: request.providerMessages } : {}),
    };
    if (!recovery && stepRequest.preparesContext === true && request?.sourceMessages
      && lastConverted && lastConverted.converter === options.convertToLlm && lastConverted.projection.sourceMessages
      && lastConverted.projection.providerMessages && sameContext(request.sourceMessages, lastConverted.projection.sourceMessages)) {
      activeProjection = { messages: request.sourceMessages as MessageProjection['messages'], sourceMessages: request.sourceMessages,
        providerMessages: lastConverted.projection.providerMessages };
    }
    channel.push({ type: "message.started", role: "coder" });
    // A new request replaces the old prefix even if it fails or reports no usage.
    if (lastSentRequest) options.cacheWarming?.noteRequest(0, lastSentRequest);
    lastSentRequest = undefined;
    let sentRequest: SentRequest | undefined;
    let inputTokens = 0;
    let usageInput: UsageInputMode | undefined;
    const onRequestSent: NonNullable<StepOptions['onRequestSent']> = sent => {
      sentRequest = sent;
      inputTokens = 0;
      usageInput = latestPrepared ? latestPrepared.usageInput : endpointShape(sent.endpoint).usageInput;
      if (sent.context) recordRequestContext(options.sessionId, sent.context);
      if (sent.promptIdentity) options.onPromptIdentity?.(sent.promptIdentity);
    };
    const onRequestUsage: NonNullable<StepOptions['onRequestUsage']> = usage => {
      const counted = usageFromProvider(usage, usageInput);
      inputTokens = counted.inputComplete === true ? counted.inputTokens ?? 0 : 0;
      if (sentRequest?.context && getSessionUsage(options.sessionId).requestContext === sentRequest.context &&
        counted.inputComplete === true && Number.isSafeInteger(inputTokens)) {
        recordRequestContext(options.sessionId, Object.freeze({ ...sentRequest.context, promptTokens: inputTokens }));
      }
    };
    let budgetSummary = false;
    let latestPrepared: PreparedTurnContext | undefined;
    let streamedText = "";
    let streamedReasoning = "";
    const emitStreamUpdate = (event: Extract<QueryEvent, { type: 'message.delta' | 'reasoning.delta' | 'message.replace' | 'reasoning.replace' }>, delta?: string) => {
      const partial = {
        text: streamedText,
        ...(streamedReasoning || event.type === 'reasoning.replace' ? { reasoning: streamedReasoning } : {}),
        ...(delta !== undefined ? { delta } : {}),
      };
      // RPC consumes the same public capture as the kernel, without another accumulator.
      channel.push({ ...event, message: { content: partial.text,
        ...(partial.reasoning !== undefined ? { reasoning: { text: partial.reasoning } } : {}) } });
      request?.onUpdate?.(partial);
    };
    const listener: StepListener = {
      onText: (delta) => {
        streamedText += delta;
        emitStreamUpdate({ type: "message.delta", role: "coder", delta }, delta);
      },
      onReasoning: (delta) => {
        streamedReasoning += delta;
        emitStreamUpdate({ type: "reasoning.delta", role: "coder", delta });
      },
      onReasoningReplace: (text) => {
        streamedReasoning = text;
        emitStreamUpdate({ type: "reasoning.replace", role: "coder", text });
      },
      onReplace: (text) => {
        streamedText = text;
        emitStreamUpdate({ type: "message.replace", role: "coder", text });
      },
    };
    let step = await stepRequest(
      activeMessages,
      signal,
      listener,
      {
        allowTools: toolsAllowed,
        routeReason: request?.reason,
        failedRoute: request?.failedRoute,
        ...(request?.context?.eligible ? { contextOwner: request.context } : {}),
        ...(request?.context?.eligible && request.context.appendDeclaration && options.onMessage ? {
          onDeclaration: (message: StandardAgentMessage, prospective: MessageProjection) => {
            let appended: boolean;
            try {
              appended = request.context!.appendDeclaration!(message, prospective,
                saved => persistDeclaration(options.onMessage!, saved));
            } catch {
              throw new TurnPreparationError('Request declaration persistence failed. No request was sent.', true);
            }
            if (!appended) throw new TurnPreparationError('Request history changed before declaration publication. No request was sent.', true);
            activeProjection = prospective;
            activeMessages = prospective.messages;
          },
        } : {}),
        ...(activePromptSource ? { promptSource: activePromptSource } : {}),
        ...(options.allowedTools ? { allowedTools: options.allowedTools } : {}),
        requestPurpose: requestPurposeFor(activeProjection.sourceMessages ?? activeMessages),
        ...(activeProjection.sourceMessages ? { sourceMessages: activeProjection.sourceMessages, providerMessages: activeProjection.providerMessages } : {}),
        convertToLlm: options.convertToLlm,
        ...(recovery ? { preparedContext: recovery } : {}),
        prepareContext: async prepared => {
          let captured = recovery && recovery.isCurrent() && sameContext(prepared.sourceMessages, recovery.sourceMessages) ? recovery : prepared;
          if (request?.context) {
            const replacement = !recovery && options.prepareContext ? await options.prepareContext(captured, signal, request.context) : undefined;
            captured = replacement ?? captured;
          }
          return captured;
        },
        onPreparedContext: prepared => {
          latestPrepared = prepared;
          activeProjection = prepared.messageProjection;
          activeMessages = prepared.messageProjection.messages;
          lastConverted = { projection: { ...prepared.messageProjection, sourceMessages: prepared.prospectiveMessages },
            converter: options.convertToLlm };
          if (request?.context) options.onPreparedContext?.(prepared, request.context);
        },
        requestId: request?.requestId,
        // Kept so a refresh can replay it. Captured at the step, because that
        // is the only place the request exists in the shape it was sent.
        onRequestSent,
        onRequestUsage,
      },
    );
    if (!signal?.aborted && step.admissionFailure === 'exhausted' && options.claimBudgetSummary?.()) {
      budgetSummary = true;
      streamedText = "";
      streamedReasoning = "";
      // This instruction is request-local: it has no user-message lifecycle,
      // persistence or display event. The ordinary step still enforces the cap.
      const instruction = { role: 'user' as const, content: BUDGET_SUMMARY_MESSAGE };
      const pendingSource = latestPrepared?.pendingDeclaration ? latestPrepared.sourceMessages : undefined;
      const closingMessages = [...(pendingSource ?? activeMessages), instruction];
      const closing = await stepRequest(closingMessages,
      signal, listener, { allowTools: false, routeReason: 'direct', ...(pendingSource ? { sourceMessages: closingMessages, convertToLlm: options.convertToLlm }
        : activeProjection.sourceMessages ? {
        sourceMessages: [...activeProjection.sourceMessages, instruction],
      } : {}), ...(!pendingSource && activeProjection.providerMessages ? { providerMessages: [...activeProjection.providerMessages, instruction] } : {}),
        ...(options.allowedTools ? { allowedTools: options.allowedTools } : {}), requestPurpose: 'goal-budget-summary',
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
  return Object.assign(streamStep, { preparesContext: stepRequest.preparesContext === true });
}
