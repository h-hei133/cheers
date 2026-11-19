import type { AgentLifecycleEvent } from '../core/agent/events.js';
import type { AgentMessage } from '../core/agent/state.js';
import { dispatchExtensionEvent, getExtensionEventRunners } from '../core/hooks/extensionBridge.js';
import { snapshotData } from '../core/values/data.js';
import { captureMessageResult, projectMessageEnd } from '../extensions/events/message.js';
import type { ExtensionMessageEndEvent, ExtensionRunEvent } from '../extensions/events/model.js';
import { createComponentLogger } from '../observability/structuredLogger.js';

const logger = createComponentLogger('extension-events');
const limits = { bytes: 64 * 1024 * 1024, nodes: 250_000, depth: 48 } as const;

/** Publish the existing kernel facts through the session's admitted extension audience. */
export function createTurnEvents(input: {
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly admission?: () => string | undefined;
}) {
  const handled = new WeakMap<AgentMessage, boolean>();
  let pending = Promise.resolve();
  const publish = (event: ExtensionRunEvent, signal?: AbortSignal): Promise<void> => {
    const runners = [...getExtensionEventRunners(input.workspaceRoot, input.sessionId)];
    if (runners.length === 0) return pending;
    let snapshot;
    try { snapshot = snapshotData(event, limits); }
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
    finalizeAssistant: async (message: AgentMessage, signal?: AbortSignal): Promise<AgentMessage> => {
      if (typeof message.content !== 'string' || message.reasoning?.signature || message.origin?.replayBinding
        || message.stopReason === 'error' || message.stopReason === 'aborted' || message.stopReason === 'length') return message;
      const runners = [...getExtensionEventRunners(input.workspaceRoot, input.sessionId)];
      if (!runners.length) return message;
      let active: ExtensionMessageEndEvent;
      try { active = snapshotData({ type: 'message_end', message, canReplace: true }, limits) as unknown as ExtensionMessageEndEvent; }
      catch { logger.warn('Extension message data could not be captured.'); return message; }
      const admission = () => {
        for (const runner of runners) runner.admission?.();
        return input.admission?.();
      };
      await pending;
      const result = await dispatchExtensionEvent(input.workspaceRoot, input.sessionId, active.type, () => active, {
        runners, signal, admission,
        consume: returned => {
          try { active = projectMessageEnd(active, captureMessageResult(returned)); }
          catch { logger.warn('Extension message result was refused.'); }
          return true;
        },
      });
      let final = message;
      try {
        if (!result.cancelled && !admission() && !signal?.aborted && active.message.content !== message.content) {
          final = { ...message, content: active.message.content };
        }
      } catch { /* Keep the verified message when the callback's generation has retired. */ }
      if (result.failed) logger.warn('Extension message handlers failed.');
      handled.set(final, final !== message);
      return final;
    },
    replaced: (message: AgentMessage): boolean => handled.get(message) === true,
    observe: async (event: AgentLifecycleEvent, signal: AbortSignal): Promise<void> => {
      if (event.type === 'message_end' && handled.has(event.message)) return;
      // Terminal facts remain observable after request cancellation; extension
      // generation admission still decides which handlers can receive them.
      await publish(event, event.type === 'agent_end' ? undefined : signal);
    },
    settled: async (aborted: boolean): Promise<void> => publish({ type: 'agent_settled', aborted }),
  };
}
