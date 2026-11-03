import type { AgentMessage } from '../../core/agent/state.js';
import { historyDigest } from '../../context/request/identity.js';
import { messageToText } from '../../model-adapters/multimodal.js';
import { estimateTokens, type RequestOverhead } from '../context.js';
import { availableTailTokens, closingCharsFor, estimateWithClosing } from './budget.js';
import { readContextCheckpoint } from './checkpoint.js';

interface ProgressPolicy {
  readonly contextWindow: number;
  readonly inputLimit?: number;
  readonly reserveTokens?: number;
  readonly outputTokens?: number;
  readonly overhead?: RequestOverhead;
}

const DEAD_END_NOTICE = 'Compaction freed too little context to make progress — pausing automatic compaction on this history. '
  + 'Reduce large tool output or fixed prompt context, or start a new session.';

/** The checkpoint gets its own allowance; system instructions and schemas do not. */
function hasHeadroom(messages: readonly AgentMessage[], policy: ProgressPolicy,
  toolsAllowed?: boolean): boolean {
  const checkpoint = messages[messages[0]?.role === 'system' ? 1 : 0];
  const checkpointTokens = checkpoint && readContextCheckpoint(messageToText(checkpoint.content)) !== undefined
    ? estimateTokens([checkpoint]) : 0;
  // A closing request carries an instruction the conversation does not, so the
  // residual must be measured against the request that will actually be sent.
  const prompt = estimateWithClosing(messages, policy.overhead, closingCharsFor(toolsAllowed));
  return prompt <= availableTailTokens(policy) + checkpointTokens;
}

/** A retained boundary stays the same when more messages follow it. */
function cutIdentity(message: AgentMessage): string {
  return message.id === undefined ? historyDigest([message]) : `message:${message.id}`;
}

/** Run-local threshold suppression; manual compaction and overflow never consult it. */
export function createCompactionProgress(policy: ProgressPolicy, onDeadEnd?: (message: string) => void) {
  let deadEnd: string | undefined;
  return {
    blocks(messages: readonly AgentMessage[], cut: number | undefined, toolsAllowed?: boolean): boolean {
      if (deadEnd === undefined) return false;
      const firstKept = cut === undefined ? undefined : messages[cut];
      if (hasHeadroom(messages, policy, toolsAllowed) || firstKept && cutIdentity(firstKept) !== deadEnd) {
        deadEnd = undefined;
        return false;
      }
      // A missing legal cut gives no new history to summarize. Keep suppression
      // even when the checkpoint has moved the old boundary to index one.
      return true;
    },
    accepted(messages: readonly AgentMessage[], keptMessages: number, toolsAllowed?: boolean): void {
      const firstKept = messages[messages.length - keptMessages];
      if (!firstKept || hasHeadroom(messages, policy, toolsAllowed)) {
        deadEnd = undefined;
        return;
      }
      const identity = cutIdentity(firstKept);
      if (identity === deadEnd) return;
      deadEnd = identity;
      onDeadEnd?.(DEAD_END_NOTICE);
    },
  };
}
