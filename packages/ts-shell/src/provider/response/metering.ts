import type { ModelUsage } from '../../core/agent/request/model.js';
import type { ProviderUsage } from '../../turn/completion.js';
import { isRecord } from '../../core/values/record.js';

export type UsageInputMode = 'inclusive' | 'exclusive';

/** Protocol input evidence is independent of output completeness and accounting defaults. */
export function inputUsage(usage: ProviderUsage, mode: UsageInputMode | undefined): {
  readonly inputTokens?: number; readonly inputComplete: boolean;
} {
  const prompt = count(usage.prompt_tokens);
  const readRaw = usage.cache_read_input_tokens ?? usage.prompt_tokens_details?.cached_tokens;
  const read = count(readRaw);
  const write = count(usage.cache_creation_input_tokens);
  const invalid = usage.metering_input_complete === false || prompt === undefined
    || usage.cache_read_input_tokens !== undefined && count(usage.cache_read_input_tokens) === undefined
    || usage.prompt_tokens_details !== undefined && (!isRecord(usage.prompt_tokens_details)
      || usage.prompt_tokens_details.cached_tokens !== undefined && count(usage.prompt_tokens_details.cached_tokens) === undefined)
    || readRaw !== undefined && read === undefined
    || usage.cache_creation_input_tokens !== undefined && write === undefined;
  if (mode === 'exclusive') {
    const input = prompt === undefined ? undefined : prompt + (read ?? 0) + (write ?? 0);
    return { ...(input !== undefined && Number.isSafeInteger(input) ? { inputTokens: input } : {}),
      inputComplete: !invalid && read !== undefined && write !== undefined && input !== undefined && Number.isSafeInteger(input) };
  }
  return { ...(prompt !== undefined ? { inputTokens: prompt } : {}),
    inputComplete: mode === 'inclusive' && !invalid && prompt !== undefined && (read ?? 0) + (write ?? 0) <= prompt };
}

/** Billing totals are protocol subtotals; only disjoint input/output are charged. */
export function modelUsage(usage: ProviderUsage | undefined, endpoint: string, mode?: UsageInputMode | null): ModelUsage | undefined {
  if (!usage) return undefined;
  const native = mode === 'exclusive' || mode === undefined && (endpoint === 'anthropic-messages'
    || endpoint === 'copilot-messages' || endpoint === 'bedrock-converse-stream');
  const prompt = count(usage.prompt_tokens);
  const output = count(usage.completion_tokens);
  const cacheRead = count(native ? usage.cache_read_input_tokens : usage.prompt_tokens_details?.cached_tokens);
  const cacheWrite = count(usage.cache_creation_input_tokens);
  const qualified = inputUsage(usage, mode === null ? undefined : native ? 'exclusive' : 'inclusive');
  const input = qualified.inputTokens;
  const complete = qualified.inputComplete && usage.metering_output_complete !== false
    && input !== undefined && output !== undefined && Number.isSafeInteger(input + output);
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
