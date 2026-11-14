import type { StandardAgentMessage } from '../../core/agent/state.js';
import type { ProviderToolCall } from '../../model-adapters/message.js';

export type SessionToolCall = ProviderToolCall;

/** Standard durable messages exclude transient request admission and completion state. */
export type SessionMessage = Omit<StandardAgentMessage, 'admissionFailure' | 'stopReason' | 'errorMessage'>;

/** Context rendered from a durable summary is not a newly authored turn. */
export function isSessionContextMessage(message: SessionMessage): boolean {
  return message.metadata?.contextSummary === "compaction" || message.metadata?.contextSummary === "branch";
}
