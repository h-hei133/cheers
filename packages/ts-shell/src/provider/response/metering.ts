import type { ModelUsage } from '../../core/agent/request/model.js';
import type { ProviderUsage } from '../../turn/completion.js';

/** Billing totals are protocol subtotals; only disjoint input/output are charged. */
export function modelUsage(usage: ProviderUsage | undefined, endpoint: string): ModelUsage | undefined {
  if (!usage) return undefined;
  const native = endpoint === 'anthropic-messages' || endpoint === 'bedrock-converse-stream';
  const prompt = count(usage.prompt_tokens);
  const output = count(usage.completion_tokens);
  const cacheRead = count(native ? usage.cache_read_input_tokens : usage.prompt_tokens_details?.cached_tokens);
  const cacheWrite = count(usage.cache_creation_input_tokens);
  const cachesComplete = !native || (cacheRead !== undefined && cacheWrite !== undefined);
  const input = prompt === undefined ? undefined : prompt + (native ? (cacheRead ?? 0) + (cacheWrite ?? 0) : 0);
  const complete = cachesComplete && usage.metering_output_complete !== false && input !== undefined && output !== undefined && Number.isSafeInteger(input + output);
  const reported = count(usage.total_tokens);
  const invalidCache = !native && prompt !== undefined && ((cacheRead ?? 0) + (cacheWrite ?? 0) > prompt);
  // Native total fields may exclude cache subdivisions. Compatible and Google totals include the full request.
  const inconsistent = invalidCache || (!native && complete && reported !== undefined && reported !== input + output);
  return {
    version: 1, ...(input !== undefined ? { inputTokens: input } : {}), ...(output !== undefined ? { outputTokens: output } : {}),
    ...(cacheRead !== undefined ? { cacheReadTokens: cacheRead } : {}), ...(cacheWrite !== undefined ? { cacheWriteTokens: cacheWrite } : {}),
    ...(reported !== undefined ? { reportedTotalTokens: reported } : {}),
    complete: complete && !inconsistent, ...(inconsistent ? { inconsistent: true } : {}),
  };
}

function count(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
