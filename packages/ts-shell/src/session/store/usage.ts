import { persistSessionUsage } from "../../observability/usageTelemetry.js";
import { createSessionStoreLayout, locateExistingSessionLayout, validateSessionId, type SessionFileLayout } from "./sessionFileLayout.js";
import { readStateSnapshotRequired, withSessionStateLock } from "./sessionStateStore.js";
import { writeJsonFileAtomic } from "./sessionFileStore.js";

/** Flush accounting deltas without changing the session's lifecycle or transcript. */
export function writeSessionUsage(
  sessionId: string,
  layout: SessionFileLayout = locateExistingSessionLayout(createSessionStoreLayout(), validateSessionId(sessionId)),
): void {
  withSessionStateLock(layout, () => {
    const current = readStateSnapshotRequired(layout.statePath);
    persistSessionUsage(sessionId, current.usage, (usage) => {
      writeJsonFileAtomic(layout.statePath, { ...current, usage });
    });
  });
}
