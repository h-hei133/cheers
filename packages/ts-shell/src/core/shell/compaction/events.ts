import { dispatchExtensionEvent, getExtensionEventRunners } from '../../hooks/extensionBridge.js';
import type { HookDispatcher } from '../../hooks/hookDispatcher.js';
import { truncateTextBytes } from '../../tools/truncation.js';
import { messageToText } from '../../../model-adapters/multimodal.js';
import { captureCompactResult, mergeCompactResult } from '../../../extensions/events/compact.js';
import type { ExtensionBeforeCompactResult, ExtensionCompactMessage, ExtensionSessionBeforeEvent } from '../../../extensions/events/model.js';
import type { CompactionDecision, CompactionLifecycle, CompactionPreparation, CompactionReason } from '../../../session/compaction/lifecycle.js';

const REFUSAL = 'Extension compaction binding changed.';

/** Keep one plan's callbacks and publication guard bound to the original audience. */
export function compactionLifecycle(input: { readonly hooks: HookDispatcher; readonly sessionId: string;
  readonly workspaceRoot: string; readonly reason: CompactionReason; readonly extensionsRoot?: string }): CompactionLifecycle {
  const { hooks, sessionId, workspaceRoot, reason } = input;
  const root = input.extensionsRoot ?? workspaceRoot;
  return {
    decide: async (plan, signal) => {
      const runners = [...getExtensionEventRunners(root, sessionId)];
      const registered = hooks.captureRegistration?.();
      const audienceAdmission = () => {
        if (registered?.() === false) return REFUSAL;
        const current = getExtensionEventRunners(root, sessionId);
        if (current.length !== runners.length || runners.some((runner, index) => runner !== current[index])) return REFUSAL;
        try { for (const runner of runners) runner.admission?.(); } catch { return REFUSAL; }
        return undefined;
      };
      const admission = () => signal?.aborted ? REFUSAL : audienceAdmission();
      const timestamp = new Date().toISOString();
      const decision = await hooks.dispatch({ eventName: "PreCompact", sessionId, workspaceRoot, timestamp,
        reason, tokensBefore: plan.tokensBefore, messageCount: plan.messageCount }, { signal });
      if (decision.decision === 'block' || decision.decision === 'retry' || decision.decision === 'unknown') return { cancel: 'hook' };
      if (admission()) return { cancel: 'extension' };
      if (!runners.length) return undefined;
      const event = beforeEvent({ sessionId, workspaceRoot, timestamp, reason }, plan);
      let choice: ExtensionBeforeCompactResult = {};
      const outcome = await dispatchExtensionEvent(root, sessionId, event.type, event, { runners, signal, admission,
        consume: returned => { choice = mergeCompactResult(choice, captureCompactResult(returned)) ?? choice; return choice.cancel !== true; },
      }).catch(() => undefined);
      if (!outcome || outcome.failed || outcome.cancelled || choice.cancel || admission()) return { cancel: 'extension' };
      return Object.freeze({ summary: choice.summary, admission, published: async event => {
        await dispatchExtensionEvent(root, sessionId, 'session_compact', Object.freeze({ type: 'session_compact', sessionId,
          workspaceRoot, timestamp: new Date().toISOString(), ...event }), { runners, admission: audienceAdmission });
      } } satisfies CompactionDecision);
    },
    after: async ({ summary, keptMessages, tokensBefore }) => {
      await hooks.dispatch({ eventName: "PostCompact", sessionId, workspaceRoot, timestamp: new Date().toISOString(), reason,
        summary, keptMessages, tokensBefore });
    },
  };
}

function beforeEvent(context: { readonly sessionId: string; readonly workspaceRoot: string; readonly timestamp: string; readonly reason: CompactionReason },
  plan: CompactionPreparation): Extract<ExtensionSessionBeforeEvent, { type: 'session_before_compact' }> {
  const messages = boundedMessages(plan.messages, 96 * 1024);
  const prefix = boundedMessages(plan.turnPrefix, 32 * 1024);
  const previousSummary = plan.previousSummary === undefined ? undefined : truncateTextBytes(plan.previousSummary, 32 * 1024);
  const instructions = plan.instructions === undefined ? undefined : truncateTextBytes(plan.instructions, 16 * 1024);
  return Object.freeze({ type: 'session_before_compact', ...context, tokensBefore: plan.tokensBefore, keptMessages: plan.keptMessages,
    messageCount: plan.messageCount, messages: messages.values, turnPrefix: prefix.values, previousSummary, instructions,
    truncated: messages.truncated || prefix.truncated || previousSummary !== plan.previousSummary || instructions !== plan.instructions });
}

function boundedMessages(messages: CompactionPreparation['messages'], bytes: number) {
  const values: ExtensionCompactMessage[] = [];
  let truncated = false;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.role === 'system') continue;
    if (!bytes || values.length === 128) { truncated = true; break; }
    const text = messageToText(message.content);
    const clipped = truncateTextBytes(text, Math.min(16 * 1024, bytes));
    truncated ||= clipped !== text;
    bytes -= Buffer.byteLength(clipped);
    values.push(Object.freeze({ role: message.role, text: clipped }));
  }
  return { values: Object.freeze(values.reverse()), truncated };
}
