import { createHash } from 'node:crypto';
import type { AgentMessage } from '../../core/agent/state.js';
import type { RequestOverhead } from '../../session/context.js';

/** Hash content at its owning boundary; retain no prompt text in telemetry. */
export function requestIdentity(overhead: RequestOverhead): { readonly schemaDigest: string; readonly systemDigest: string } {
  return {
    schemaDigest: createHash('sha256').update(JSON.stringify(overhead.tools ?? [])).digest('hex'),
    systemDigest: createHash('sha256').update(overhead.systemPrompt ?? '').digest('hex'),
  };
}

/** Includes the selected content, tool calls, signatures and their ordered roles. */
export function historyDigest(messages: readonly AgentMessage[]): string {
  const digest = createHash('sha256');
  for (const message of messages) digest.update(JSON.stringify([
    message.role, message.content, message.reasoning, message.tool_calls, message.tool_call_id,
  ]) + '\n');
  return digest.digest('hex');
}
