import { isThinkingPreference, type ThinkingPreference } from '../../models/effort.js';

export function parseEffortFlag(value: string | true | undefined): ThinkingPreference | undefined {
  return value === undefined ? undefined : isThinkingPreference(value) ? value : null;
}
