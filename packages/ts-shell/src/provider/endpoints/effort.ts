import type { EndpointShape } from './kinds.js';

/** Output limits stay authoritative; an explicit effort cannot disappear to fit them. */
export function effortOutputFailure(shape: Pick<EndpointShape, 'minimumThinkingOutputTokens'>, maxOutputTokens?: number): string | undefined {
  const minimum = shape.minimumThinkingOutputTokens;
  if (minimum !== undefined && maxOutputTokens !== undefined && maxOutputTokens < minimum) {
    return `The output limit must be at least ${minimum} tokens for this endpoint's reasoning budget. Increase maxOutputTokens or choose /thinking auto.`;
  }
  return undefined;
}
