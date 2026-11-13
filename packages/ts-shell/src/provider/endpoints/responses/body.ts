import type { SimpleRequest, TurnRequest } from '../kinds.js';
import { responseMessages } from './messages.js';

const PROMPT_CACHE_KEY_MAX_LENGTH = 64;

function isOfficialOpenAIBaseUrl(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false;
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return hostname === 'api.openai.com' || hostname.endsWith('.api.openai.com');
  } catch {
    return false;
  }
}

function clampPromptCacheKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  const chars = Array.from(key);
  return chars.length <= PROMPT_CACHE_KEY_MAX_LENGTH ? key : chars.slice(0, PROMPT_CACHE_KEY_MAX_LENGTH).join('');
}

export function responseBody(input: SimpleRequest | TurnRequest, stream: boolean): Record<string, unknown> {
  const turn = 'tools' in input ? input : undefined;
  const effort = input.reasoningEffort && input.thinkingLevelName ? input.thinkingLevelName : undefined;
  const summary = input.reasoningSummary !== false && (input.reasoningSummary === true || effort !== undefined);
  const cacheSupported = input.cacheRetention !== 'none'
    && (input.supportsPromptCacheKey === true || (input.supportsPromptCacheKey !== false && isOfficialOpenAIBaseUrl(input.baseUrl)));
  const cacheKey = cacheSupported ? clampPromptCacheKey(input.sessionId) : undefined;
  return { model: input.model, store: false, stream,
    ...(cacheKey ? { prompt_cache_key: cacheKey } : {}),
    ...(cacheKey && input.cacheRetention === 'long' ? { prompt_cache_retention: '24h' } : {}),
    ...(input.systemPrompt ? { instructions: input.systemPrompt } : {}),
    input: responseMessages(input.messages, turn?.vision ?? false, input.provider, input.model, input.replayBinding),
    include: ['reasoning.encrypted_content'],
    ...(turn?.allowTools && turn.tools.length ? { tools: turn.tools.map(tool => ({
      type: 'function', name: tool.function.name, description: tool.function.description,
      parameters: tool.function.parameters, strict: false,
    })), tool_choice: 'auto', parallel_tool_calls: true } : {}),
    ...(effort !== undefined || summary ? { reasoning: {
      ...(effort !== undefined ? { effort } : {}), ...(summary ? { summary: 'auto' } : {}),
    } } : {}),
    ...(input.temperature !== undefined && input.supportsTemperature !== false && !input.thinkingLevelName ? { temperature: input.temperature } : {}),
    ...(turn?.topP !== undefined ? { top_p: turn.topP } : {}),
    ...(input.maxOutputTokens !== undefined ? { max_output_tokens: input.maxOutputTokens } : {}),
    ...(input.serviceTier !== undefined ? { service_tier: input.serviceTier } : {}) };
}
