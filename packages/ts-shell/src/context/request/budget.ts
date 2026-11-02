import { estimateRequestTokens, estimateTokens, type RequestOverhead } from '../../session/context.js';
import type { AgentMessage } from '../../core/agent/state.js';

/**
 * Whether one request fits the window it will be sent to.
 *
 * The protocol shares one window between prompt and output, so the question is
 * `P + O + H <= W`: the complete request, the output the request may produce,
 * and the headroom the caller reserved. A separate input limit, where a model
 * declares one, is a second condition rather than a different formula.
 */
export interface RequestBudgetInput {
  readonly window: number | undefined;
  readonly inputLimit?: number;
  readonly promptTokens: number;
  readonly outputTokens: number | undefined;
  readonly reserveTokens?: number;
  /** Whether the prompt count came from a provider report or an estimate. */
  readonly measured: boolean;
  /** Upper bound on the soft trigger as a fraction of the window; 0.9 when unset. */
  readonly softFraction?: number;
}

export type RequestBudgetResult =
  | { readonly ok: true; readonly soft: boolean; readonly softLimit: number; readonly availableInput: number; readonly remaining: number; readonly measured: boolean }
  | { readonly ok: false; readonly reason: 'window' | 'input' | 'unknown'; readonly detail: string };

function count(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0;
}

export interface RequestBudgetLimitsInput {
  readonly window: number | undefined;
  readonly inputLimit?: number;
  readonly outputTokens: number | undefined;
  readonly reserveTokens?: number;
  readonly softFraction?: number;
}

const INPUT_TRIGGER_FRACTION = 0.8;

/** Prompt ceilings shared by dispatch and compaction, independent of current usage. */
export function requestBudgetLimits(input: RequestBudgetLimitsInput): {
  readonly availableInput: number;
  readonly softLimit: number;
} | undefined {
  if (!count(input.window) || input.window === 0
    || (input.reserveTokens !== undefined && !count(input.reserveTokens))
    || (input.inputLimit !== undefined && (!count(input.inputLimit) || input.inputLimit === 0))
    || (input.outputTokens !== undefined && !count(input.outputTokens))) return undefined;
  const reserve = input.reserveTokens ?? 0;
  const windowInput = input.outputTokens === undefined ? Number.POSITIVE_INFINITY : input.window - input.outputTokens - reserve;
  const limitInput = input.inputLimit === undefined ? Number.POSITIVE_INFINITY : input.inputLimit - reserve;
  if (!Number.isFinite(Math.min(windowInput, limitInput))) return undefined;
  const availableInput = Math.max(0, Math.min(windowInput, limitInput));
  const fraction = input.softFraction !== undefined && input.softFraction > 0 && input.softFraction < 1 ? input.softFraction : 0.9;
  // Reserve/output and an independent input ceiling can consume most of a
  // window. Leave advance margin inside the usable prompt space as well.
  const softLimit = Math.min(Math.floor(input.window * fraction), Math.floor(availableInput * INPUT_TRIGGER_FRACTION));
  return { availableInput, softLimit };
}

/** Shared prompt trigger; absent limits retain the conservative reserve boundary. */
export function requestBudgetThreshold(input: RequestBudgetLimitsInput & { readonly window: number }): {
  readonly tokens: number;
  readonly inclusive: boolean;
} {
  const limits = requestBudgetLimits(input);
  return limits ? { tokens: limits.softLimit, inclusive: true }
    : { tokens: input.window - (input.reserveTokens ?? 0), inclusive: false };
}

export function requestBudget(input: RequestBudgetInput): RequestBudgetResult {
  if (!count(input.promptTokens) || (input.reserveTokens !== undefined && !count(input.reserveTokens))
    || (input.inputLimit !== undefined && (!count(input.inputLimit) || input.inputLimit === 0))) {
    // An estimate cannot prove a ceiling; the provider's own refusal remains the
    // authority instead of a local guess pretending to be one.
    return { ok: false, reason: 'unknown', detail: 'The request size cannot be proven from the available model limits.' };
  }
  const reserve = input.reserveTokens ?? 0;
  if (input.inputLimit !== undefined && input.promptTokens + reserve > input.inputLimit) {
    return { ok: false, reason: 'input',
      detail: `Request input of ${input.promptTokens} tokens with ${reserve} reserved exceeds the ${input.inputLimit}-token input limit.` };
  }
  if (!count(input.window) || input.window === 0 || !count(input.outputTokens)) {
    return { ok: false, reason: 'unknown', detail: 'The request size cannot be proven from the available model limits.' };
  }
  const total = input.promptTokens + input.outputTokens + reserve;
  if (reserve > input.window || input.outputTokens > input.window || total > input.window) {
    return { ok: false, reason: 'window',
      detail: `Request needs ${input.promptTokens} input + ${input.outputTokens} output + ${reserve} reserved tokens, which does not fit a ${input.window}-token window.` };
  }
  const { availableInput, softLimit } = requestBudgetLimits(input)!;
  return { ok: true, soft: input.promptTokens >= softLimit, softLimit, availableInput,
    remaining: input.window - total, measured: input.measured };
}

/** The prompt count to budget with: a measured prefix plus whatever followed it. */
export function promptTokensFor(input: {
  readonly messages: readonly AgentMessage[];
  readonly overhead?: RequestOverhead;
  readonly measured?: { readonly tokens: number; readonly messageCount: number };
}): { readonly tokens: number; readonly measured: boolean } {
  if (!input.measured) return { tokens: estimateRequestTokens(input.messages, input.overhead), measured: false };
  const trailing = input.messages.slice(Math.min(input.measured.messageCount, input.messages.length));
  return { tokens: input.measured.tokens + estimateTokens(trailing), measured: true };
}
