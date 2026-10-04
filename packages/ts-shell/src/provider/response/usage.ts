import type { ProviderUsage } from "../../turn/completion.js";

/** Exclusive billing categories shared by foreground and background requests. */
export function usageFromProvider(usage: ProviderUsage) {
  const cacheReadTokens = count(usage.cache_read_input_tokens ?? usage.prompt_tokens_details?.cached_tokens);
  const cacheWriteTokens = count(usage.cache_creation_input_tokens);
  // Top-level cache counters accompany exclusive input on native protocols.
  // Compatible chat APIs include cached reads in prompt_tokens.
  const exclusive = usage.cache_read_input_tokens !== undefined || usage.cache_creation_input_tokens !== undefined;
  const promptTokens = Math.max(0, count(usage.prompt_tokens) - (exclusive ? 0 : cacheReadTokens + cacheWriteTokens));
  const completionTokens = count(usage.completion_tokens);
  return {
    promptTokens, completionTokens, cacheReadTokens, cacheWriteTokens,
    totalTokens: usage.total_tokens === undefined
      ? promptTokens + completionTokens + cacheReadTokens + cacheWriteTokens
      : count(usage.total_tokens),
  };
}

function count(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, value) : 0;
}
