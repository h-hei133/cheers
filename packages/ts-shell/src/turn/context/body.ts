import { endpointTurnBody } from '../../provider/endpoints/index.js';
import type { TurnBodyContext } from './contract.js';

/** Build the protocol's headers and payload from one captured target and message projection. */
export function prepareTurnBody(context: TurnBodyContext) {
  const { request, options, activeProvider, activeModel, endpoint, protocol, systemPrompt,
    finalMessages, tools, allowTools, shape, initialTools, replayBinding, output } = context;
  let requestHeaders: Readonly<Record<string, string>> = {};
  let payload: Record<string, unknown>;
  requestHeaders = protocol.requestHeaders?.({
    provider: activeProvider,
    model: activeModel,
    sessionId: request.sessionId,
    systemPrompt,
    messages: finalMessages,
    tools,
    allowTools,
    vision: shape.vision,
    temperature: request.temperature ?? 0.7,
    ...(shape.reasoningEffort && shape.thinkingLevelName
      ? { thinkingLevelName: shape.thinkingLevelName }
      : {}),
    systemRole: shape.systemRole,
    reasoningEffort: Boolean(shape.reasoningEffort),
    maxTokensField: shape.maxTokensField,
    assistantAfterToolResult: shape.assistantAfterToolResult,
    serviceTier: request.provider.serviceTier,
    ...(request.cacheRetention !== undefined ? { cacheRetention: request.cacheRetention } : {}),
    ...(shape.supportsMidConvoToolChanges ? {
      supportsMidConvoToolChanges: true,
      initialTools,
    } : {}),
    ...(shape.supportsMidConvoEffort ? { supportsMidConvoEffort: true } : {}),
    declarationTarget: { provider: activeProvider, model: activeModel, endpoint, replayBinding },
    accountTurnState: request.accountTurnAffinity?.read({ endpoint, baseUrl: request.provider.baseUrl, replayBinding }),
  }) ?? {};
  payload = endpointTurnBody(endpoint, {
    model: activeModel,
    provider: activeProvider,
    sessionId: request.sessionId,
    ...(request.provider.baseUrl ? { baseUrl: request.provider.baseUrl } : {}),
    ...(shape.promptCacheKey !== undefined ? { supportsPromptCacheKey: shape.promptCacheKey } : {}),
    ...(shape.supportsLongCacheRetention !== undefined ? { supportsLongCacheRetention: shape.supportsLongCacheRetention } : {}),
    ...(shape.supportsExplicitPromptCacheMode !== undefined ? { supportsExplicitPromptCacheMode: shape.supportsExplicitPromptCacheMode } : {}),
    replayBinding,
    systemPrompt,
    messages: finalMessages,
    tools,
    allowTools,
    vision: shape.vision,
    temperature: request.temperature ?? 0.7,
    ...(request.topP != null ? { topP: request.topP } : {}),
    ...((request.maxOutputTokens ?? output) != null
      ? { maxOutputTokens: request.maxOutputTokens ?? output }
      : {}),
    ...(shape.reasoningEffort && shape.thinkingLevelName
      ? { thinkingLevelName: shape.thinkingLevelName }
      : {}),
    ...(shape.allowEmptySignature ? { allowEmptySignature: true } : {}),
    supportsTemperature: shape.supportsTemperature,
    ...(shape.thinkingBudgetMaximum ? { thinkingBudgetMaximum: true } : {}),
    ...(shape.thinkingBudgetTokens !== undefined
      ? { thinkingBudgetTokens: shape.thinkingBudgetTokens }
      : {}),
    systemRole: shape.systemRole,
    reasoningEffort: shape.reasoningEffort,
    reasoningSummary: shape.reasoningSummary,
    reasoningReplayField: shape.reasoningReplayField,
    maxTokensField: shape.maxTokensField,
    assistantAfterToolResult: shape.assistantAfterToolResult,
    serviceTier: request.provider.serviceTier,
    ...(request.cacheRetention !== undefined ? { cacheRetention: request.cacheRetention } : {}),
    ...(shape.supportsMidConvoToolChanges ? {
      supportsMidConvoToolChanges: true,
      initialTools,
    } : {}),
    ...(shape.supportsMidConvoEffort ? { supportsMidConvoEffort: true } : {}),
    ...(request.historicalEfforts ? { historicalEfforts: request.historicalEfforts } : {}),
    declarationTarget: { provider: activeProvider, model: activeModel, endpoint, replayBinding },
  });
  return { requestHeaders, payload };
}
