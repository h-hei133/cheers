/** A null preference explicitly leaves the choice to the provider. */
export const THINKING_LEVELS = ['low', 'medium', 'high'] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
export type ThinkingPreference = ThinkingLevel | null;

export function isThinkingPreference(value: unknown): value is ThinkingPreference {
  return value === null || THINKING_LEVELS.some(level => level === value);
}

/** Undefined inherits; null is a complete preference and stops inheritance. */
export function preferredEffort(...sources: readonly ({ readonly thinkingEffort?: ThinkingPreference } | undefined)[]): ThinkingPreference | undefined {
  for (const source of sources) if (source?.thinkingEffort !== undefined) return source.thinkingEffort;
  return undefined;
}
