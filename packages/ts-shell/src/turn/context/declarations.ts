import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { AgentMessage, StandardAgentMessage } from '../../core/agent/state.js';
import type { RequestDeclaration } from '../../core/agent/declarations/model.js';
import { captureRequestDeclaration, snapshotRequestDeclaration } from '../../core/agent/declarations/codec.js';

/** Runtime loadouts are independent of per-request tool withdrawal. */
export function pendingRequestDeclaration(messages: readonly AgentMessage[], declaration: {
  readonly target: RequestDeclaration['target'];
  readonly tools: unknown;
  readonly effort?: string;
}, seed?: StandardAgentMessage): StandardAgentMessage | undefined {
  const captured = snapshotRequestDeclaration({ version: 1, target: declaration.target, tools: declaration.tools,
    ...(declaration.effort === undefined ? {} : { effort: declaration.effort }) });
  const previous = messages.findLast(message => message.requestDeclaration)?.requestDeclaration;
  if (previous && isDeepStrictEqual(previous, captured)) return undefined;
  if (seed?.requestDeclaration && isDeepStrictEqual(seed.requestDeclaration, captured)) return seed;
  return captureRequestDeclaration<StandardAgentMessage>({ id: randomUUID(), timestamp: new Date().toISOString(), role: 'system', content: '',
    requestDeclaration: captured });
}
