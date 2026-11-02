import type { AgentMessage } from '../../core/agent/state.js';
import { requestBudget, requestBudgetThreshold } from '../../context/request/budget.js';
import { CHARS_PER_TOKEN, DEFAULT_RESERVE_TOKENS, estimateRequestTokens, estimateTokens, type RequestOverhead } from '../context.js';

interface BudgetPolicy {
  readonly contextWindow: number;
  readonly inputLimit?: number;
  readonly reserveTokens?: number;
  readonly outputTokens?: number;
  readonly enabled?: boolean;
}

const RECOVERY_FRACTION = 0.8;

export function shouldCompact(tokens: number, contextWindow: number, reserveTokens: number, enabled = true): boolean {
  return enabled && tokens > contextWindow - reserveTokens;
}

/** The actual trigger boundary, including the conservative unknown-limit fallback. */
export function compactionThreshold(policy: BudgetPolicy): { readonly tokens: number; readonly inclusive: boolean } {
  return requestBudgetThreshold({ window: policy.contextWindow, inputLimit: policy.inputLimit,
    outputTokens: policy.outputTokens, reserveTokens: policy.reserveTokens ?? DEFAULT_RESERVE_TOKENS });
}

/** Dispatch and compaction share the same prompt ceiling and advance trigger. */
export function reachedBudgetThreshold(tokens: number, policy: BudgetPolicy, measured: boolean): boolean {
  if (policy.enabled === false) return false;
  const reserveTokens = policy.reserveTokens ?? DEFAULT_RESERVE_TOKENS;
  const input = { window: policy.contextWindow, inputLimit: policy.inputLimit,
    outputTokens: policy.outputTokens, reserveTokens };
  const budget = requestBudget({ ...input, promptTokens: tokens, measured });
  if (!budget.ok && budget.reason !== 'unknown') return true;
  const threshold = compactionThreshold(policy);
  return threshold.inclusive ? tokens >= threshold.tokens : tokens > threshold.tokens;
}

/** History yields below the trigger to leave room for its replacement summary. */
export function availableTailTokens(policy: BudgetPolicy): number {
  return Math.max(1, Math.floor(compactionThreshold(policy).tokens * RECOVERY_FRACTION));
}

/** Additive estimates; provider prompt usage has no trustworthy component split. */
export function formatBudgetBreakdown(messages: readonly AgentMessage[], policy: {
  readonly overhead?: RequestOverhead;
  readonly outputTokens?: number;
  readonly reserveTokens?: number;
}): string {
  const history = estimateTokens(messages);
  const tools = policy.overhead?.tools;
  const toolChars = tools?.length ? JSON.stringify(tools).length : 0;
  const systemChars = policy.overhead?.systemPrompt?.length ?? 0;
  const schemaTokens = Math.ceil(toolChars / CHARS_PER_TOKEN);
  const systemTokens = Math.ceil(systemChars / CHARS_PER_TOKEN);
  const prompt = estimateRequestTokens(messages, policy.overhead);
  const rounding = prompt - history - schemaTokens - systemTokens;
  const reserve = policy.reserveTokens ?? DEFAULT_RESERVE_TOKENS;
  const fixed = schemaTokens + systemTokens + rounding;
  const format = (tokens: number) => tokens.toLocaleString('en-US');
  const overhead = `fixed overhead ${format(fixed)} (tool schemas ${format(schemaTokens)}, system instructions ${format(systemTokens)}${rounding ? `, shared rounding ${rounding}` : ''})`;
  const parts = `history ${format(history)} + ${overhead}`;
  if (policy.outputTokens === undefined) {
    return `Estimated budget: ${parts} + reserve ${format(reserve)} = ${format(prompt + reserve)} known tokens; output is provider-selected and unknown.`;
  }
  return `Estimated budget: ${parts} + output ${format(policy.outputTokens)} + reserve ${format(reserve)} = ${format(prompt + policy.outputTokens + reserve)} tokens.`;
}
