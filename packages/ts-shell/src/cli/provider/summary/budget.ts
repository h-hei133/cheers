import { positiveTokenLimit } from '../../../core/models/limits.js';
import { requestBudgetLimits } from '../../../context/request/budget.js';

const MIN_SUMMARY_OUTPUT = 8_192;
const MAX_SUMMARY_OUTPUT = 16_384;
const MAX_SEGMENT_INPUT = 16_000;
const PROMPT_ALLOWANCE = 1_024;

/** Summary input and output share model limits, not the foreground output preference. */
export function summaryBudget(input: {
  readonly contextWindow?: number;
  readonly inputLimit?: number;
  readonly maxOutputCeiling?: number;
  readonly reserveTokens?: number;
  readonly providerOwnedOutput: boolean;
}): { readonly maxOutputTokens?: number; readonly segmentTokens: number; readonly mergeTokens: number } {
  const reserve = input.reserveTokens ?? 0;
  const window = positiveTokenLimit(input.contextWindow);
  const inputLimit = positiveTokenLimit(input.inputLimit);
  const ceiling = positiveTokenLimit(input.maxOutputCeiling);
  const desired = Math.min(MAX_SUMMARY_OUTPUT, Math.max(MIN_SUMMARY_OUTPUT, Math.floor(reserve * 0.8)));
  // Leave room for the input, a carried summary and the summary instructions,
  // including small-window models whose declared output ceiling is very large.
  const outputReservation = Math.max(1, Math.min(desired, ceiling ?? desired,
    window ? Math.floor(Math.max(0, window - reserve) / 4) : desired,
    inputLimit ? Math.floor(Math.max(0, inputLimit - reserve) / 4) : desired));
  const maxOutputTokens = input.providerOwnedOutput ? undefined : outputReservation;
  // Provider-owned output stays unknown on the wire. Use the summary's local
  // planning reserve, not its theoretical model maximum, to pack input. This
  // reserve does not prove or impose a limit on what that provider may emit.
  const limits = requestBudgetLimits({ window, inputLimit: input.inputLimit,
    outputTokens: outputReservation, reserveTokens: reserve });
  // Reserve one previous summary and prompt scaffolding before packing history.
  // The complete-request preflight still validates the actual carried material.
  const segmentTokens = limits ? Math.max(1, Math.min(MAX_SEGMENT_INPUT,
    Math.floor((limits.availableInput - outputReservation - PROMPT_ALLOWANCE) * 0.8))) : MAX_SEGMENT_INPUT;
  // Merging carries two summaries as the complete history, with no additional
  // previous-summary field. It must not pay that reservation a second time.
  const mergeTokens = limits ? Math.max(1, Math.floor((limits.availableInput - PROMPT_ALLOWANCE) * 0.8)) : MAX_SEGMENT_INPUT;
  return { maxOutputTokens, segmentTokens, mergeTokens };
}
