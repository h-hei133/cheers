import { readProjectState } from '../state/projectState.js';
import type { ThinkingPreference } from './effort.js';

/** Legacy project preferences are read once at the operation boundary. */
export function captureThinkingPreference(workspaceRoot: string, preference?: ThinkingPreference) {
  return { thinkingEffort: preference === undefined ? readProjectState(workspaceRoot).thinkingEffort ?? null : preference,
    thinkingEffortExplicit: preference !== undefined };
}
