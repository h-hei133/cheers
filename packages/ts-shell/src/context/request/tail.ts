import type { AgentMessage } from '../../core/agent/state.js';
import { CHARS_PER_TOKEN, estimateTokens } from '../../session/context.js';
import { endpointBody, endpointShape, type EndpointKind, type SimpleRequest } from '../../provider/endpoints/index.js';

/** The same captured replay choices the current provider request uses. */
export interface PromptTailContext {
  readonly endpoint?: EndpointKind;
  readonly provider: string;
  readonly model: string;
  readonly replayBinding?: string;
  readonly reasoningReplayField?: SimpleRequest['reasoningReplayField'];
  readonly allowEmptySignature?: boolean;
}

/** Add only public reasoning that the selected protocol actually sends. */
export function estimatePromptTail(messages: readonly AgentMessage[], context?: PromptTailContext): number | undefined {
  if (messages.some(message => message.reasoning?.signature !== undefined || message.reasoning?.redacted)) return undefined;
  const ordinary = estimateTokens(messages);
  if (!messages.some(message => message.reasoning?.text)) return ordinary;
  if (!context) return undefined;
  try {
    const field = endpointShape(context.endpoint).contextFields?.conversation;
    if (!field) return undefined;
    const input = { ...context, messages };
    const replayed = endpointBody(context.endpoint, input)[field];
    const ordinaryWire = endpointBody(context.endpoint, { ...input,
      messages: messages.map(message => ({ ...message, reasoning: undefined })) })[field];
    if (!Array.isArray(replayed) || !Array.isArray(ordinaryWire)) return undefined;
    // Both projections use the codec's own ownership and replay rules. JSON
    // escaping and the declared reasoning field's framing travel with the text.
    const extraChars = JSON.stringify(replayed).length - JSON.stringify(ordinaryWire).length;
    return ordinary + Math.ceil(Math.max(0, extraChars) / CHARS_PER_TOKEN);
  } catch { return undefined; }
}
