import type { ProviderUsage } from "../../turn/completion.js";
import { inputUsage, type UsageInputMode } from './metering.js';

/** Raw presence must be checked before missing billing categories become zero. */
export function hasUsage(usage: ProviderUsage | undefined): usage is ProviderUsage {
  return usage != null && [usage.prompt_tokens, usage.completion_tokens, usage.total_tokens,
    usage.cache_read_input_tokens, usage.cache_creation_input_tokens, usage.prompt_tokens_details?.cached_tokens]
    .some(reportedCount);
}

/** Exclusive billing categories shared by foreground and background requests. */
export function usageFromProvider(usage: ProviderUsage, mode?: UsageInputMode, legacyAccounting = mode === undefined) {
  const cacheRead = usage.cache_read_input_tokens ?? usage.prompt_tokens_details?.cached_tokens;
  const numeric = legacyAccounting ? count : (value: number | undefined) => safeCount(value) ?? 0;
  const cacheReadTokens = numeric(cacheRead);
  const cacheWriteTokens = numeric(usage.cache_creation_input_tokens);
  // Top-level cache counters accompany exclusive input on native protocols.
  // Compatible chat APIs include cached reads in prompt_tokens.
  const legacyCache = legacyAccounting && mode !== 'exclusive'
    && (usage.cache_read_input_tokens !== undefined || usage.cache_creation_input_tokens !== undefined);
  const exclusive = mode === 'exclusive' || legacyCache;
  const promptTokens = Math.max(0, numeric(usage.prompt_tokens) - (exclusive ? 0 : cacheReadTokens + cacheWriteTokens));
  const completionTokens = numeric(usage.completion_tokens);
  // Older compatibility relays used top-level native counters in otherwise
  // compatible replies. Keep their flat accounting and history convention.
  const input = legacyCache && mode === 'inclusive' ? inputUsage({ ...usage,
    cache_read_input_tokens: usage.cache_read_input_tokens === undefined ? cacheRead ?? 0 : usage.cache_read_input_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens === undefined ? 0 : usage.cache_creation_input_tokens,
  }, 'exclusive') : inputUsage(usage, mode);
  const promptAllocated = typeof usage.prompt_tokens === 'number' && Number.isSafeInteger(usage.prompt_tokens)
    && usage.prompt_tokens >= 0 && usage.metering_input_complete !== false && (mode === 'exclusive' || input?.inputComplete === true
      && typeof cacheRead === 'number' && Number.isSafeInteger(cacheRead) && cacheRead >= 0);
  return {
    promptTokens, completionTokens, cacheReadTokens, cacheWriteTokens,
    // Zero-filled accounting must not invent a provider-reported cache category.
    cacheReadReported: reportedCount(cacheRead),
    cacheWriteReported: reportedCount(usage.cache_creation_input_tokens),
    totalTokens: legacyAccounting ? usage.total_tokens === undefined
      ? promptTokens + completionTokens + cacheReadTokens + cacheWriteTokens : count(usage.total_tokens)
      : safeCount(usage.total_tokens) ?? promptTokens + completionTokens + cacheReadTokens + cacheWriteTokens,
    ...(mode === undefined ? {} : { ...input, promptAllocated,
      allocationComplete: input.inputComplete && promptAllocated && typeof usage.completion_tokens === 'number'
        && Number.isSafeInteger(usage.completion_tokens) && usage.completion_tokens >= 0
        && usage.metering_output_complete !== false
        && (usage.total_tokens === undefined || safeCount(usage.total_tokens) !== undefined) }),
  };
}

function reportedCount(value: number | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function count(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function safeCount(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
