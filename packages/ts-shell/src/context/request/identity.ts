import { createHash } from 'node:crypto';
import type { RequestOverhead } from '../../session/context.js';

interface DigestMessage {
  readonly role: string;
  readonly content?: unknown;
  readonly reasoning?: unknown;
  readonly tool_calls?: unknown;
  readonly tool_call_id?: string;
  readonly origin?: unknown;
}

/** Hash content at its owning boundary; retain no prompt text in telemetry. */
export function requestIdentity(overhead: RequestOverhead): { readonly schemaDigest: string; readonly systemDigest: string } {
  return {
    schemaDigest: createHash('sha256').update(JSON.stringify(overhead.tools ?? [])).digest('hex'),
    systemDigest: createHash('sha256').update(overhead.systemPrompt ?? '').digest('hex'),
  };
}

/** Includes the selected content, tool calls, signatures and their ordered roles. */
export function historyDigest(messages: readonly DigestMessage[]): string {
  const digest = createHash('sha256');
  for (const message of messages) digest.update(JSON.stringify([
    message.role, message.content, message.reasoning, message.tool_calls, message.tool_call_id, message.origin,
  ]) + '\n');
  return digest.digest('hex');
}
