import { createSessionStoreLayout, locateExistingSessionLayout, validateSessionId } from "../store/sessionFileLayout.js";
import { readStateSnapshotRequired, readStateSnapshotSafely, withSessionStateLock } from "../store/sessionStateStore.js";
import { writeJsonFileAtomic } from "../store/sessionFileStore.js";

import type { SessionModelSelection } from "./contract.js";

export function decodeSessionModel(value: unknown): SessionModelSelection | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (![candidate.connectionId, candidate.provider, candidate.model].every(item => typeof item === "string" && item.trim().length > 0)) return undefined;
  return { connectionId: (candidate.connectionId as string).trim(), provider: (candidate.provider as string).trim(), model: (candidate.model as string).trim() };
}

function layoutFor(sessionId: string) {
  const id = validateSessionId(sessionId);
  if (id === "." || id === "..") throw new Error("Invalid session id.");
  return locateExistingSessionLayout(createSessionStoreLayout(), id);
}

export function readSessionModel(sessionId?: string): SessionModelSelection | undefined {
  if (!sessionId) return undefined;
  return decodeSessionModel(readStateSnapshotSafely(layoutFor(sessionId).statePath)?.modelSelection);
}

/** Read under the existing state lock; never reconstruct or resurrect a session. */
export function writeSessionModel(sessionId: string, selection: SessionModelSelection): void {
  const modelSelection = decodeSessionModel(selection);
  if (!modelSelection) throw new Error("Invalid session model selection.");
  const layout = layoutFor(sessionId);
  withSessionStateLock(layout, () => {
    const current = readStateSnapshotRequired(layout.statePath);
    writeJsonFileAtomic(layout.statePath, { ...current, modelSelection });
  });
}
