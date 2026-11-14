import { createHash } from 'node:crypto';
import { catalogModel, catalogProvider, providerEndpoint } from '../../core/models/catalog.js';
import { inferRouteReason, type ModelRoute } from '../../core/models/virtualModels.js';
import { resolveRequestShape } from '../../core/models/requestShape.js';
import { effortCapability } from '../../core/models/capability.js';
import { outputLimitFailure } from '../../core/models/limits.js';
import { effortOutputFailure } from '../../provider/endpoints/effort.js';
import { DEFAULT_ENDPOINT_KIND, endpointKind, endpointShape, endpointUrl } from '../../provider/endpoints/index.js';
import { assertRequestInput, InputLimitError, normalizeRequestImages, requestInputLimits } from '../../provider/request/input.js';
import { convertMessages, type MessageProjection } from '../../core/agent/messages.js';
import type { AgentMessage, StandardAgentMessage } from '../../core/agent/state.js';
import { freezeDeep } from '../../core/values/freeze.js';
import { snapshotData } from '../../core/values/data.js';
import { measuredPromptContext, getSessionUsage } from '../../observability/usageTelemetry.js';
import { captureUsageAttribution } from '../../observability/usage/identity.js';
import { promptTokensFor, requestBudget } from '../../context/request/budget.js';
import { estimatePrompt } from '../../context/request/estimate.js';
import { estimateWirePrompt, WirePromptUnavailableError } from '../../context/request/wire.js';
import { historyDigest } from '../../context/request/identity.js';
import { assertDeclarationHistory } from '../../core/agent/declarations/history.js';
import { captureMessageHistory } from '../../core/agent/custom.js';
import { CHARS_PER_TOKEN } from '../../session/context.js';
import { outgoingProjection, providerSystemPrompt, finalStepMessages, hasToolHistory, TOOL_HISTORY_UNSUPPORTED_MESSAGE } from '../messages.js';
import { measuredProjectionPrefix, storedPromptProjection } from '../measurement.js';
import type { ChatMessage } from '../prompt.js';
import type { ModelInputLimits } from '../../core/models/modalities.js';
import type { ThinkingPreference } from '../../core/models/effort.js';
import { prepareTurnBody } from './body.js';
import type { PreparedTurnContext, StepOptions, StepRequest } from './contract.js';

const CAPTURE_LIMITS = { bytes: 64 * 1024 * 1024, nodes: 250_000, depth: 48 } as const;

/** Preparation failures never acquire a request attempt or dispatch bytes. */
export class TurnPreparationError extends Error {
  constructor(message: string, readonly inputLimit = false) { super(message); this.name = 'TurnPreparationError'; }
}

/** Keep raw routing, conversion, protocol projection and budgeting in one request owner. */
export function createTurnContextPreparer(request: StepRequest, options: StepOptions, lifetime: {
  readonly thinkingEffort?: ThinkingPreference;
  readonly explicitEffort: boolean;
  readonly effortAccepted: () => boolean;
  readonly streamAttempts: () => number;
  readonly replayBinding: string;
}) {
  const catalogAddress = request.provider.provider ? request.provider.baseUrl : undefined;
  const initialTools = request.initialTools ?? request.tools;
  const explicitEffort = lifetime.explicitEffort;
  const replayBinding = lifetime.replayBinding;
  const converter = options.convertToLlm;
  const requestPurpose = options.requestPurpose;
  const agentMode = options.agentMode;
  const prepare = async (messages: readonly AgentMessage[], signal?: AbortSignal, reuse?: MessageProjection, fixedRoute?: { readonly route?: ModelRoute }): Promise<PreparedTurnContext> => {
    signal?.throwIfAborted();
    if (options.requestPurpose !== requestPurpose) {
      throw new TurnPreparationError('Request purpose changed during preparation. No request was sent.', true);
    }
    if (options.agentMode !== agentMode) {
      throw new TurnPreparationError('Request mode changed during preparation. No request was sent.', true);
    }
    if (options.convertToLlm !== converter) {
      throw new TurnPreparationError('Message converter changed during preparation. No request was sent.', true);
    }
    const sourceMessages = snapshotData(captureMessageHistory(messages), CAPTURE_LIMITS) as unknown as readonly AgentMessage[];
    const optionIdentity = JSON.stringify([options.allowTools, options.allowedTools, options.agentMode]);
    const allowedTools = options.allowedTools === undefined ? undefined : Object.freeze([...options.allowedTools]);
    const generationIdentity = JSON.stringify([request.provider, request.temperature, request.topP, request.maxOutputTokens,
      request.contextWindow, request.reserveTokens, request.cacheRetention, request.initialTools, request.historicalEfforts && [...request.historicalEfforts],
      request.pruneToolText, request.projection]);
    const projectionTransform = request.projection?.transformMessages;
    const rawEffort = lifetime.effortAccepted() ? lifetime.thinkingEffort ?? undefined : undefined;
    const route = fixedRoute ? fixedRoute.route : request.virtualModels ? await request.virtualModels.resolve({
      provider: request.provider.provider ?? '', modelId: request.provider.model,
      thinkingLevel: rawEffort ?? 'medium', reason: inferRouteReason(sourceMessages, lifetime.streamAttempts()),
      messages: sourceMessages, signal,
    }) : undefined;
    signal?.throwIfAborted();
    const messageProjection = reuse
      ? Object.freeze({ sourceMessages,
          messages: snapshotData(captureMessageHistory(reuse.messages), CAPTURE_LIMITS) as unknown as MessageProjection['messages'],
          ...(reuse.providerMessages !== undefined ? {
            providerMessages: snapshotData(captureMessageHistory(reuse.providerMessages), CAPTURE_LIMITS) as unknown as NonNullable<MessageProjection['providerMessages']>,
          } : {}) })
      : await convertMessages(sourceMessages, converter, signal);
    assertDeclarationHistory(sourceMessages, messageProjection.messages);
    const openingIndex = options.promptSource ? messages.indexOf(options.promptSource.opening) : -1;
    const promptSource = options.promptSource && openingIndex >= 0
      ? { opening: sourceMessages[openingIndex]!, stored: options.promptSource.stored } : undefined;
    const projectedMessages = messageProjection.providerMessages
      ? messageProjection.messages.filter(message => message.role !== 'system' || message.requestDeclaration) : messageProjection.messages;
    const converted = messageProjection.providerMessages !== undefined;
    const activeProvider = route?.provider ?? (request.provider.provider ?? '');
    const activeModel = route?.modelId ?? request.provider.model;
    const effortAccepted = lifetime.effortAccepted();
    const effort = effortAccepted ? route?.thinkingLevel ?? rawEffort : undefined;
    const messageDigest = historyDigest(sourceMessages);
    const toolCalling = resolveRequestShape(
      request.catalog ?? [],
      activeProvider,
      activeModel,
      undefined,
      catalogAddress,
    ).toolCalling;
    const allowTools = options.allowTools && toolCalling;
    const allowed = allowedTools && new Set(allowedTools);
    const currentDeclarations = request.toolSnapshot?.() ?? request.tools;
    const declarationIdentity = JSON.stringify(currentDeclarations);
    const declared = snapshotData(currentDeclarations, CAPTURE_LIMITS) as unknown as typeof currentDeclarations;
    const tools = toolCalling
      ? allowed
        ? declared.filter((tool) => allowed.has(tool.function.name))
        : declared
      : [];
    const regeneratedPrompt = request.systemPromptFor !== undefined
      && (options.agentMode !== undefined || !toolCalling);
    const baseSystemPrompt = regeneratedPrompt
      ? request.systemPromptFor!(options.agentMode, tools.map((tool) => tool.function.name), toolCalling)
      : request.systemPrompt;
    let systemPrompt: string;
    try { systemPrompt = converted ? providerSystemPrompt(baseSystemPrompt, messageProjection.providerMessages!) : baseSystemPrompt; }
    catch { throw new TurnPreparationError('System message content must contain text only.'); }
    const wireTools = allowTools ? tools : [];
    const overhead = { systemPrompt, tools: wireTools };
    const schemaDigest = createHash('sha256').update(JSON.stringify(wireTools)).digest('hex');
    const systemDigest = createHash('sha256').update(systemPrompt).digest('hex');
    if (catalogProvider(request.catalog ?? [], activeProvider, catalogAddress).ambiguous) {
      throw new TurnPreparationError('The model catalogue has multiple entries for this endpoint. Resolve them before sending.');
    }
    if (effort && (explicitEffort || ['minimal', 'xhigh', 'max'].includes(effort))
      && effortCapability(request.catalog ?? [], activeProvider, activeModel, effort, catalogAddress) === 'unsupported') {
      throw new TurnPreparationError('The selected model does not support this reasoning effort. Select another level or use /thinking auto.');
    }
    if (!toolCalling && hasToolHistory(projectedMessages)) {
      throw new TurnPreparationError(TOOL_HISTORY_UNSUPPORTED_MESSAGE);
    }
    const endpoint = route
      ? (providerEndpoint(request.catalog ?? [], activeProvider, catalogAddress, activeModel) ?? (endpointKind(request.provider.endpoint) ?? DEFAULT_ENDPOINT_KIND))
      : (endpointKind(request.provider.endpoint) ?? DEFAULT_ENDPOINT_KIND);
    const shape = resolveRequestShape(
      request.catalog ?? [],
      activeProvider,
      activeModel,
      effort,
      catalogAddress,
      endpoint,
    );
    let protocol: PreparedTurnContext['protocol'];
    try { protocol = endpointShape(endpoint); }
    catch (error) { throw new TurnPreparationError(error instanceof Error ? error.message : String(error)); }
    const output = protocol.outputControl === 'provider' ? undefined : request.maxOutputTokens ?? shape.maxOutputCeiling;
    const modelEntry = catalogModel(request.catalog ?? [], activeProvider, activeModel, catalogAddress);
    const usageAttribution = captureUsageAttribution({ provider: activeProvider, model: activeModel,
      baseUrl: request.provider.baseUrl, rates: modelEntry?.cost });
    const projectionOptions = {
      ...request.projection,
      ...(request.pruneToolText !== undefined ? { pruneToolText: request.pruneToolText } : {}),
    };
    const outgoing = outgoingProjection(projectedMessages, shape.assistantAfterToolResult, projectionOptions);
    if (converted) { outgoing.indexAligned = false; outgoing.sourceAligned = false; }
    let projection = outgoing;
    let inputLimits: ModelInputLimits | undefined;
    let finalMessages: readonly ChatMessage[];
    try {
      inputLimits = requestInputLimits(shape.inputLimits);
      const normalized = await normalizeRequestImages(outgoing.messages,
        shape.vision, inputLimits, request.workspaceRoot, signal);
      if (normalized !== outgoing.messages) projection = { ...outgoing, messages: [...normalized], indexAligned: false, sourceAligned: false };
      finalMessages = snapshotData(finalStepMessages(projection.messages, allowTools, tools.length > 0), CAPTURE_LIMITS) as unknown as readonly ChatMessage[];
    } catch (error) {
      signal?.throwIfAborted();
      throw new TurnPreparationError(error instanceof InputLimitError ? error.message : 'Image input preparation failed.', true);
    }
    const budgetMessages: readonly StandardAgentMessage[] = finalMessages.map(message => ({
      ...message,
      content: message.content ?? '',
    }));
    const wireHistoryDigest = historyDigest(finalMessages);
    const promptIdentity = {
      provider: activeProvider,
      model: activeModel,
      endpoint,
      endpointId: usageAttribution.endpointId,
      schemaDigest,
      systemDigest,
      historyDigest: messageDigest,
      wireHistoryDigest,
      wireMessageCount: finalMessages.length,
      wireRewriteTokens: Math.ceil(projection.savedChars / CHARS_PER_TOKEN),
      replayBinding,
    };
    const promptProjection = converted ? undefined : storedPromptProjection(sourceMessages, projection, promptSource,
      shape.assistantAfterToolResult, promptIdentity.wireMessageCount, projectionOptions);
    const measured = options.agentMode ? undefined : measuredPromptContext(request.sessionId, { provider: activeProvider,
      model: activeModel, endpoint, schemaDigest, systemDigest,
      endpointId: usageAttribution.endpointId, historyDigest: messageDigest, wireHistoryDigest, replayBinding });
    const initialPrompt = promptTokensFor({ messages: budgetMessages, overhead, ...(measured ? { measured } : {}) });
    const usage = getSessionUsage(request.sessionId);
    const prefixIdentity = options.agentMode || converted ? undefined
      : measuredProjectionPrefix(sourceMessages, projection, usage, shape.assistantAfterToolResult, projectionOptions);
    const calibrated = prefixIdentity ? estimatePrompt(sourceMessages, overhead, promptIdentity, usage, {
      tokens: initialPrompt.tokens, method: 'characters/3.5', prefixIdentity,
      tailMessages: budgetMessages.slice(usage.lastPromptMessageCount),
      tailContext: { endpoint, provider: promptIdentity.provider, model: promptIdentity.model, replayBinding,
        reasoningReplayField: shape.reasoningReplayField, allowEmptySignature: shape.allowEmptySignature },
    }) : undefined;
    let prompt = calibrated?.source === 'calibrated'
      ? { tokens: calibrated.tokens, measured: true } : initialPrompt;
    let budget = requestBudget({ window: request.contextWindow ?? modelEntry?.contextWindow,
      inputLimit: modelEntry?.inputLimit,
      promptTokens: prompt.tokens, outputTokens: output ?? shape.maxOutputCeiling,
      reserveTokens: request.reserveTokens, measured: prompt.measured });
    // A request that cannot fit is not sent: the same bounded overflow rescue
    // that answers a provider refusal handles this before any bytes leave.
    let refusal: PreparedTurnContext['refusal'] = !budget.ok && budget.reason !== 'unknown'
      ? { detail: `Context overflow: ${budget.detail}` } : undefined;
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
      const outputFailure = outputLimitFailure(output, shape.maxOutputCeiling);
      if (outputFailure) throw new TurnPreparationError(outputFailure);
      const budgetFailure = explicitEffort && effort ? effortOutputFailure(protocol, request.maxOutputTokens ?? shape.maxOutputCeiling) : undefined;
      if (budgetFailure) throw new TurnPreparationError(budgetFailure);
      ({ requestHeaders, payload } = prepareTurnBody({ request, options, activeProvider, activeModel,
        endpoint, protocol, systemPrompt, finalMessages, tools, allowTools, shape, initialTools, replayBinding, output }));
      // Public replay and image conversion use the protocol's actual input projection.
      if (shape.reasoningReplayField || inputLimits?.images || finalMessages.some(message => message.requestDeclaration)) {
        try {
          const wireTokens = estimateWirePrompt(payload, protocol.contextFields, modelEntry?.tokenizer);
          if (!prompt.measured || wireTokens > prompt.tokens) {
            prompt = { tokens: wireTokens, measured: false };
            budget = requestBudget({ window: request.contextWindow ?? modelEntry?.contextWindow,
              inputLimit: modelEntry?.inputLimit, promptTokens: wireTokens,
              outputTokens: output ?? shape.maxOutputCeiling, reserveTokens: request.reserveTokens, measured: false });
          }
        } catch (error) {
          // Signed replay has no local token proof; byte/count admission still sees its complete serialized body.
          if (shape.reasoningReplayField || !(error instanceof WirePromptUnavailableError)) throw error;
        }
      }
    } catch (error) {
      // The only throw from this call is an undeclared kind, and it names both
      // the kind and the ones that exist. Reported as the reason the step
      // failed, which is what puts it in front of the user.
      throw new TurnPreparationError(error instanceof Error ? error.message : String(error));
    }
    signal?.throwIfAborted();
    // The final applicable count owns overflow admission, including a smaller wire estimate.
    refusal = !budget.ok && budget.reason !== 'unknown'
      ? { detail: `Context overflow: ${budget.detail}` } : undefined;
    const body = JSON.stringify(payload!);
    try { assertRequestInput(body, protocol.contextFields, inputLimits); }
    catch (error) {
      if (!(error instanceof InputLimitError)) throw error;
      refusal = { detail: error.message, inputLimit: true };
    }
    const capturedSystem = baseSystemPrompt;
    const isCurrent = (): boolean => {
      try {
        if (options.requestPurpose !== requestPurpose || options.agentMode !== agentMode || options.convertToLlm !== converter
          || generationIdentity !== JSON.stringify([request.provider, request.temperature, request.topP, request.maxOutputTokens,
          request.contextWindow, request.reserveTokens, request.cacheRetention, request.initialTools, request.historicalEfforts && [...request.historicalEfforts],
          request.pruneToolText, request.projection]) || projectionTransform !== request.projection?.transformMessages
          || optionIdentity !== JSON.stringify([options.allowTools, options.allowedTools, options.agentMode])
          || declarationIdentity !== JSON.stringify(request.toolSnapshot?.() ?? request.tools)) return false;
        const currentSystem = regeneratedPrompt
          ? request.systemPromptFor!(options.agentMode, tools.map(tool => tool.function.name), toolCalling)
          : request.systemPrompt;
        return currentSystem === capturedSystem;
      } catch { return false; }
    };
    return Object.freeze({ requestPurpose: requestPurpose ?? (agentMode ? 'subagent' : 'turn'), agentMode,
      sourceMessages, messageProjection, finalMessages, budgetMessages: freezeDeep(budgetMessages),
      overhead: freezeDeep(overhead), prompt: Object.freeze(prompt), budget: Object.freeze(budget),
      contextWindow: request.contextWindow ?? modelEntry?.contextWindow, inputLimit: modelEntry?.inputLimit,
      outputTokens: output ?? shape.maxOutputCeiling, reserveTokens: request.reserveTokens,
      promptIdentity: Object.freeze(promptIdentity), promptProjection: promptProjection && Object.freeze(promptProjection),
      projection: freezeDeep(projection), activeProvider, activeModel, effort, allowTools, allowedTools, tools, systemPrompt,
      regeneratedPrompt, endpoint, shape: Object.freeze(shape), protocol,
      modelEntry: modelEntry && structuredClone(modelEntry), usageAttribution, inputLimits,
      payload: freezeDeep(payload!), requestHeaders: Object.freeze({ ...requestHeaders }), body,
      url: endpointUrl(request.provider.baseUrl, endpoint, activeModel), headers: Object.freeze({ ...request.provider.headers }),
      replayBinding, ...(refusal ? { refusal: Object.freeze(refusal) } : {}), isCurrent,
      refresh: (refreshSignal?: AbortSignal) => prepare(sourceMessages, refreshSignal, messageProjection, { route }),
      reframe: (callOptions: Pick<StepOptions, 'allowTools' | 'allowedTools' | 'agentMode' | 'requestPurpose'>, reframeSignal?: AbortSignal) => {
        const nextOptions: StepOptions = { ...options, allowTools: callOptions.allowTools,
          allowedTools: callOptions.allowedTools === undefined ? undefined : Object.freeze([...callOptions.allowedTools]),
          agentMode: callOptions.agentMode, requestPurpose: callOptions.requestPurpose,
          convertToLlm: converter, promptSource, preparedContext: undefined };
        return createTurnContextPreparer(request, nextOptions, lifetime)(sourceMessages, reframeSignal, messageProjection, { route });
      },
      prepare: (candidate: readonly AgentMessage[], candidateSignal?: AbortSignal) => prepare(candidate, candidateSignal),
    });
  };
  return prepare;
}
