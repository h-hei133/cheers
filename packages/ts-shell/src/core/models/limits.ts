interface ModelLimits {
  readonly contextWindow?: number;
  readonly inputLimit?: number;
  readonly maxTokens?: number;
}

/** A model limit the request and compaction owners can trust, or no declaration. */
export function positiveTokenLimit(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** Remove malformed limits from any catalogue layer before they reach consumers. */
export function sanitizeModelLimits<T extends ModelLimits>(model: T): T {
  const {
    contextWindow: _contextWindow,
    inputLimit: _inputLimit,
    maxTokens: _maxTokens,
    ...rest
  } = model;
  const contextWindow = positiveTokenLimit(_contextWindow);
  const inputLimit = positiveTokenLimit(_inputLimit);
  const maxTokens = positiveTokenLimit(_maxTokens);
  return {
    ...rest,
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    ...(inputLimit !== undefined ? { inputLimit } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
  } as T;
}

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
