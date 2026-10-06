/** Model metadata is optional; an absent ceiling is not a proven limit. */
export function outputLimitFailure(output: number | undefined, ceiling?: number, window?: number): string | undefined {
  if (output === undefined) return undefined;
  if (!Number.isSafeInteger(output) || output <= 0) return 'maxOutputTokens must be a positive safe integer.';
  if (Number.isSafeInteger(ceiling) && ceiling! > 0 && output > ceiling!) {
    return 'maxOutputTokens exceeds the selected model output limit.';
  }
  if (Number.isSafeInteger(window) && window! > 0 && output >= window!) {
    return 'maxOutputTokens must leave input space in the resolved context window.';
  }
  return undefined;
}

/** Reservation and output are separate budgets; neither is charged twice. */
export function reserveLimitFailure(reserve: number, window: number): string | undefined {
  return reserve >= window ? 'reserveTokens must leave input space in the resolved context window.' : undefined;
}
