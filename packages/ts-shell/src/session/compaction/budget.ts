import type { AgentMessage } from '../../core/agent/state.js';
import { requestBudget, requestBudgetThreshold } from '../../context/request/budget.js';
import { CHARS_PER_TOKEN, DEFAULT_RESERVE_TOKENS, estimateRequestTokens, estimateTokens, messageCharCount, overheadCharCount, type RequestOverhead } from '../context.js';
import { FINAL_STEP_MESSAGE } from '../../turn/messages.js';

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
  readonly projectMessages?: (messages: readonly AgentMessage[]) => readonly AgentMessage[];
}, closingChars = 0): string {
  // One rounding over the whole request, exactly as the headline does it.
  // Rounding the instruction separately and adding the results is not the same
  // number, and the message states both.
  const projected = policy.projectMessages?.(messages) ?? messages;
  const overhead = closingChars === 0 ? policy.overhead : { ...policy.overhead, tools: [] };
  const prompt = estimateWithClosing(projected, overhead, closingChars);
  // History is what the conversation contributes to that total, so the
  // instruction's share is whatever the single rounding attributed to it.
  const history = estimateTokens(projected) + (prompt - estimateRequestTokens(projected, overhead));
  const tools = overhead?.tools;
  const toolChars = tools?.length ? JSON.stringify(tools).length : 0;
  const systemChars = overhead?.systemPrompt?.length ?? 0;
  const schemaTokens = Math.ceil(toolChars / CHARS_PER_TOKEN);
  const systemTokens = Math.ceil(systemChars / CHARS_PER_TOKEN);
  const rounding = prompt - history - schemaTokens - systemTokens;
  const reserve = policy.reserveTokens ?? DEFAULT_RESERVE_TOKENS;
  const fixed = schemaTokens + systemTokens + rounding;
  const format = (tokens: number) => tokens.toLocaleString('en-US');
  const fixedDescription = `fixed overhead ${format(fixed)} (tool schemas ${format(schemaTokens)}, system instructions ${format(systemTokens)}${rounding ? `, shared rounding ${rounding}` : ''})`;
  const parts = `history ${format(history)} + ${fixedDescription}`;
  if (policy.outputTokens === undefined) {
    return `Estimated budget: ${parts} + reserve ${format(reserve)} = ${format(prompt + reserve)} known tokens; output is provider-selected and unknown.`;
  }
  return `Estimated budget: ${parts} + output ${format(policy.outputTokens)} + reserve ${format(reserve)} = ${format(prompt + policy.outputTokens + reserve)} tokens.`;
}
/**
 * Characters the closing instruction adds to a request answered without tools.
 *
 * The instruction travels outside the message list, so every estimate that
 * prices a closing request has to add it explicitly.
 */
export function closingCharsFor(toolsAllowed: boolean | undefined, overhead?: RequestOverhead): number {
  // Production callers supply the current overhead, so an empty tool pool is
  // a direct-answer request rather than a closing step. Retain the old flag-
  // only contract for policies that have no request overhead to describe it.
  return toolsAllowed === false && (overhead === undefined || (overhead.tools?.length ?? 0) > 0)
    ? messageCharCount({ role: 'user', content: FINAL_STEP_MESSAGE } as AgentMessage) : 0;
}

/** The request's cost with the closing instruction folded in before rounding. */
export function estimateWithClosing(messages: readonly AgentMessage[], overhead: RequestOverhead | undefined,
  closingChars: number,
  projectMessages?: (messages: readonly AgentMessage[]) => readonly AgentMessage[],
): number {
  const projected = projectMessages?.(messages) ?? messages;
  if (closingChars === 0) return estimateRequestTokens(projected, overhead);
  const closingOverhead = { ...overhead, tools: [] };
  const chars = projected.reduce((total, message) => total + messageCharCount(message), 0)
    + overheadCharCount(closingOverhead) + closingChars;
  return Math.ceil(chars / CHARS_PER_TOKEN);
}
