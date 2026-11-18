import type { AgentLifecycleEvent } from '../core/agent/events.js';
import { dispatchExtensionEvent, getExtensionEventRunners } from '../core/hooks/extensionBridge.js';
import { snapshotData } from '../core/values/data.js';
import type { ExtensionRunEvent } from '../extensions/events/model.js';
import { createComponentLogger } from '../observability/structuredLogger.js';

const logger = createComponentLogger('extension-events');

/** Publish the existing kernel facts through the session's admitted extension audience. */
export function createTurnEvents(input: {
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly admission?: () => string | undefined;
}) {
  let pending = Promise.resolve();
  const publish = (event: ExtensionRunEvent, signal?: AbortSignal): Promise<void> => {
    const runners = [...getExtensionEventRunners(input.workspaceRoot, input.sessionId)];
    if (runners.length === 0) return pending;
    let snapshot;
    try { snapshot = snapshotData(event, { bytes: 64 * 1024 * 1024, nodes: 250_000, depth: 48 }); }
    catch { logger.warn('Extension event data could not be captured.'); return pending; }
    const dispatched = pending.then(async () => {
      const outcome = await dispatchExtensionEvent(input.workspaceRoot, input.sessionId, event.type, snapshot,
        { runners, ...(signal ? { signal } : {}), ...(input.admission ? { admission: input.admission } : {}) });
      if (outcome.failed) logger.warn('Extension event handlers failed.');
    });
    pending = dispatched.catch(() => undefined);
    return dispatched;
  };
  return {
    observe: async (event: AgentLifecycleEvent, signal: AbortSignal): Promise<void> => {
      // Terminal facts remain observable after request cancellation; extension
      // generation admission still decides which handlers can receive them.
      await publish(event, event.type === 'agent_end' ? undefined : signal);
    },
    settled: async (aborted: boolean): Promise<void> => publish({ type: 'agent_settled', aborted }),
  };
}
