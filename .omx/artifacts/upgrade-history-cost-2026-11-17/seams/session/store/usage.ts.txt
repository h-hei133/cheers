import { persistSessionUsage, recordSessionUsage, type SessionUsageRecord } from "../../observability/usageTelemetry.js";
import { bindUsageOwner, sessionTelemetries } from '../../observability/usage/state.js';
import { captureUsageAttribution } from '../../observability/usage/identity.js';
import type { ModelCostRates } from '../../core/models/catalog.js';
import type { ProviderUsage } from '../../turn/completion.js';
import { hasUsage, usageFromProvider } from '../../provider/response/usage.js';
import { createComponentLogger } from '../../observability/structuredLogger.js';
import { pathIdentity } from '../../core/workspace/files.js';
import { assertSessionStoreProfile, createSessionStoreLayout, locateExistingSessionLayout, validateSessionId, type SessionFileLayout } from "./sessionFileLayout.js";
import { readStateSnapshotRequired, withSessionStateLock } from "./sessionStateStore.js";
import { writeJsonFileAtomic } from "./sessionFileStore.js";

/** Flush accounting deltas without changing the session's lifecycle or transcript. */
export function writeSessionUsage(
  sessionId: string,
  layout: SessionFileLayout = locateExistingSessionLayout(createSessionStoreLayout(), validateSessionId(sessionId)),
): void {
  withSessionStateLock(layout, () => persistUsage(sessionId, layout), { requireExisting: true });
}

function persistUsage(sessionId: string, layout: SessionFileLayout, scope = sessionTelemetries()): void {
  const current = readStateSnapshotRequired(layout.statePath);
  persistSessionUsage(sessionId, current.usage, usage => {
    writeJsonFileAtomic(layout.statePath, { ...current, usage });
  }, scope);
}

/** Bind auxiliary billing to its original session and store before any asynchronous work. */
export function sessionUsageSink(sessionId: string): (usage: SessionUsageRecord) => void {
  const store = createSessionStoreLayout();
  const layout = locateExistingSessionLayout(store, validateSessionId(sessionId));
  const identity = pathIdentity(layout.sessionDir);
  const scope = sessionTelemetries();
  const validate = () => {
    assertSessionStoreProfile(store, layout.statePath);
    if (pathIdentity(layout.sessionDir) !== identity) throw new Error('Session usage destination changed identity.');
  };
  return usage => {
    let recorded = false;
    const record = () => {
      validate();
      recordSessionUsage(sessionId, usage, { affectsContext: false, scope });
      bindUsageOwner(scope.get(sessionId)!, validate);
      recorded = true;
    };
    try {
      withSessionStateLock(layout, () => {
        record();
        persistUsage(sessionId, layout, scope);
      }, { requireExisting: true });
    } catch {
      // A valid owner retains the delta on lock/write failure. An invalid owner
      // cannot leave old counters for a same-ID replacement to consume.
      if (!recorded) { try { record(); } catch { /* The original destination is unavailable. */ } }
      createComponentLogger('session-usage').warn('Could not persist auxiliary request usage.');
    }
  };
}

/** Each request captures its destination prices before sending. */
export function sessionUsageRecorder(sessionId: string): (target: {
  readonly provider: string; readonly model: string; readonly baseUrl?: string; readonly rates?: ModelCostRates;
}) => (usage: ProviderUsage | undefined) => void {
  const record = sessionUsageSink(sessionId);
  return target => {
    const attribution = target.baseUrl === undefined ? undefined : captureUsageAttribution({ ...target, baseUrl: target.baseUrl });
    const provider = target.provider; const model = target.model;
    return usage => {
      if (!hasUsage(usage)) return;
      record({ ...usageFromProvider(usage), provider, model, ...(attribution ? { attribution } : {}) });
    };
  };
}
