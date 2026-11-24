import type { SimpleRequest, TurnRequest } from '../kinds.js';
import { responseMessages } from './messages.js';
import { promptCacheFields } from '../../cache/protocol.js';
import { nativeCacheAddress } from '../../../core/models/protocol.js';

export function responseBody(input: SimpleRequest | TurnRequest, stream: boolean): Record<string, unknown> {
  const turn = 'tools' in input ? input : undefined;
  const tools = 'tools' in input ? (input.allowTools ? input.tools : undefined)
    : nativeCacheAddress(input.baseUrl, 'openai') ? input.summaryTools : undefined;
  const effort = input.reasoningEffort && input.thinkingLevelName ? input.thinkingLevelName : undefined;
  const summary = input.reasoningSummary !== false && (input.reasoningSummary === true || effort !== undefined);
  return { model: input.model, store: false, stream,
    ...promptCacheFields(input, true),
    ...(input.systemPrompt ? { instructions: input.systemPrompt } : {}),
    input: responseMessages(input.messages, input.vision ?? false, input.provider, input.model, input.replayBinding),
    include: ['reasoning.encrypted_content'],
    ...(tools?.length ? { tools: tools.map(tool => ({
      type: 'function', name: tool.function.name, description: tool.function.description,
      parameters: tool.function.parameters, strict: false,
    })), tool_choice: turn ? 'auto' : 'none', parallel_tool_calls: true } : {}),
    ...(effort !== undefined || summary ? { reasoning: {
      ...(effort !== undefined ? { effort } : {}), ...(summary ? { summary: 'auto' } : {}),
    } } : {}),
    ...(input.temperature !== undefined && input.supportsTemperature !== false && !input.thinkingLevelName ? { temperature: input.temperature } : {}),
    ...(turn?.topP !== undefined ? { top_p: turn.topP } : {}),
    ...(input.maxOutputTokens !== undefined ? { max_output_tokens: input.maxOutputTokens } : {}),
    ...(input.serviceTier !== undefined ? { service_tier: input.serviceTier } : {}) };
}
