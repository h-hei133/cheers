import type { SessionModelSelection, SessionVirtualModelSelection } from './contract.js';
import { readSessionModelStrict } from './state.js';

/** The saved logical marker is independent of the physical authority beneath it. */
export function readLogicalModel(sessionId?: string): SessionVirtualModelSelection | undefined {
  return readSessionModelStrict(sessionId)?.virtualModel;
}

/** Labels and logical effort must never be read from a dormant physical default. */
export function projectLogicalModel(selection?: SessionModelSelection): SessionVirtualModelSelection | undefined {
  if (selection?.virtualModel) return selection.virtualModel;
  return selection?.model ? { provider: selection.provider, model: selection.model,
    ...(selection.thinkingEffort !== undefined ? { thinkingEffort: selection.thinkingEffort } : {}) } : undefined;
}
