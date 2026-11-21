import { isDeepStrictEqual } from 'node:util';
import { isRecord } from '../../../core/values/record.js';
import type { ChatMessage } from '../../../turn/prompt.js';
import type { SimpleRequest } from '../kinds.js';
import { projectContent } from './content.js';

const PROTOCOL = 'mistral-chat-completions';
const MAX_BYTES = 1024 * 1024;
const MAX_PARTS = 4096;

function textPart(value: unknown): boolean {
  return isRecord(value) && value.type === 'text' && typeof value.text === 'string'
    && Object.keys(value).every(key => key === 'type' || key === 'text');
}

/** Only complete text and signed native thinking blocks can be sent back verbatim. */
function replayableContent(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value) || value.length > MAX_PARTS) return false;
  let signed = false;
  for (const part of value) {
    if (textPart(part)) continue;
    if (!isRecord(part) || part.type !== 'thinking' || typeof part.signature !== 'string' || !part.signature.trim()
      || (part.closed !== undefined && part.closed !== true) || !Array.isArray(part.thinking)
      || part.thinking.length > MAX_PARTS || !part.thinking.every(textPart)
      || Object.keys(part).some(key => !['type', 'thinking', 'signature', 'closed'].includes(key))) return false;
    signed = true;
  }
  return signed;
}

/** Compare tool identity and complete object arguments after runtime serialization. */
function toolEvidence(value: unknown): readonly unknown[] | undefined {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_PARTS) return;
  const calls = [];
  const ids = new Set<string>();
  for (const call of value) {
    if (!isRecord(call) || call.type !== 'function' || typeof call.id !== 'string' || !call.id || ids.has(call.id)
      || !isRecord(call.function) || typeof call.function.name !== 'string' || !call.function.name.trim()
      || typeof call.function.arguments !== 'string') return;
    let args: unknown;
    try { args = JSON.parse(call.function.arguments); } catch { return; }
    if (!isRecord(args)) return;
    ids.add(call.id);
    calls.push({ id: call.id, type: 'function', function: { name: call.function.name, arguments: JSON.stringify(args) } });
  }
  return calls;
}

export function captureReplay(parts: readonly unknown[], calls: unknown, protocol = PROTOCOL): string | undefined {
  if (!replayableContent(parts)) return;
  const evidence = toolEvidence(calls);
  if (!evidence) return;
  const packet = JSON.stringify({ protocol, version: 1, parts, calls: evidence });
  return Buffer.byteLength(packet) <= MAX_BYTES ? packet : undefined;
}

export function replayContent(message: ChatMessage, request: SimpleRequest, protocol = PROTOCOL): readonly unknown[] | undefined {
  const { signature, text, redacted } = message.reasoning ?? {};
  if (message.role !== 'assistant' || !signature || redacted || Buffer.byteLength(signature) > MAX_BYTES
    || !request.provider || !request.replayBinding || message.origin?.provider !== request.provider
    || message.origin.model !== request.model || message.origin.replayBinding !== request.replayBinding) return;
  try {
    const value: unknown = JSON.parse(signature);
    if (!isRecord(value) || value.protocol !== protocol || value.version !== 1 || !replayableContent(value.parts)
      || !Array.isArray(value.calls) || Object.keys(value).length !== 4) return;
    const projected = projectContent(value.parts);
    if (projected.text !== (message.content ?? '') || projected.reasoning !== text
      || !isDeepStrictEqual(value.calls, toolEvidence(message.tool_calls))) return;
    return value.parts;
  } catch { return undefined; }
}
