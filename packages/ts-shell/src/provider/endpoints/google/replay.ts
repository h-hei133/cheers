import { isDeepStrictEqual } from 'node:util';
import { isRecord } from '../../../core/values/record.js';
import { messageToText } from '../../../model-adapters/multimodal.js';
import type { StreamedToolCall } from '../../../turn/completion.js';
import type { GoogleMessage, GooglePart } from './model.js';

const MAX_BYTES = 1024 * 1024;
const MAX_PARTS = 4096;
const PART_KEYS = new Set(['text', 'thought', 'thoughtSignature', 'functionCall']);
const CALL_KEYS = new Set(['name', 'args', 'id']);

/** Only supported model output is eligible for exact opaque replay. */
export function googleOutput(value: unknown): readonly GooglePart[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_PARTS) return undefined;
  const ids = new Set<string>();
  let calls = 0;
  for (const part of value) {
    if (!isRecord(part) || Object.keys(part).some(key => !PART_KEYS.has(key))
      || (part.text !== undefined && typeof part.text !== 'string')
      || (part.thought !== undefined && typeof part.thought !== 'boolean')
      || (part.thoughtSignature !== undefined && (typeof part.thoughtSignature !== 'string' || !part.thoughtSignature))) return undefined;
    if (part.functionCall !== undefined) {
      const call = part.functionCall;
      if (part.text !== undefined || part.thought === true || !isRecord(call) || Object.keys(call).some(key => !CALL_KEYS.has(key))
        || typeof call.name !== 'string' || !call.name || (call.args !== undefined && !isRecord(call.args))
        || (call.id !== undefined && (typeof call.id !== 'string' || !call.id))) return undefined;
      const id = typeof call.id === 'string' ? call.id : `call_${calls}`;
      calls++;
      if (ids.has(id)) return undefined;
      ids.add(id);
    } else if (part.text === undefined && part.thoughtSignature === undefined) return undefined;
  }
  return value;
}

export function createGoogleOutput(): { parts: GooglePart[]; bytes: number } { return { parts: [], bytes: 0 }; }

/** Bound opaque capture during streaming, before retaining another batch. */
export function appendGoogleOutput(output: ReturnType<typeof createGoogleOutput>, parts: readonly GooglePart[]): boolean {
  const bytes = Buffer.byteLength(JSON.stringify(parts));
  if (output.parts.length + parts.length > MAX_PARTS || output.bytes + bytes > MAX_BYTES) return false;
  for (const part of parts) {
    const previous = output.parts[output.parts.length - 1];
    // Text deltas continue the open block. A trailing empty signed delta signs
    // that block; a new signed part with another signature starts a new block.
    const emptySignature = part.text === '' && !!part.thoughtSignature && !part.functionCall;
    const sameKind = (part.thought === true) === (previous?.thought === true);
    const compatible = !previous?.thoughtSignature || !part.thoughtSignature || previous.thoughtSignature === part.thoughtSignature;
    if (previous && !previous.functionCall && previous.text !== undefined && part.text !== undefined && !part.functionCall
      && (sameKind || (emptySignature && part.thought !== true))) {
      if (emptySignature && !compatible) return false;
      if (compatible) {
        output.parts[output.parts.length - 1] = { ...previous, text: previous.text + part.text,
          ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}) };
        continue;
      }
    }
    output.parts.push(part);
  }
  output.bytes += bytes;
  return true;
}

export function googleProjection(parts: readonly GooglePart[]): {
  readonly text: string; readonly reasoning: string; readonly calls: readonly StreamedToolCall[];
} {
  let text = '', reasoning = '';
  const calls: StreamedToolCall[] = [];
  for (const part of parts) {
    if (part.functionCall) calls.push({ id: part.functionCall.id ?? `call_${calls.length}`, type: 'function',
      function: { name: part.functionCall.name!, arguments: JSON.stringify(part.functionCall.args ?? {}) } });
    else if (part.thought) reasoning += part.text ?? '';
    else text += part.text ?? '';
  }
  return { text, reasoning, calls };
}

/** Keep the ordered signed parts in the existing opaque history field. */
export function googleSignature(parts: readonly GooglePart[]): string | undefined {
  if (!parts.some(part => part.thoughtSignature) || !googleOutput(parts)) return undefined;
  const signature = JSON.stringify({ protocol: 'google-generative-ai', version: 1, parts });
  return Buffer.byteLength(signature) <= MAX_BYTES ? signature : undefined;
}

/** Reject stale identity or edited visible output before replaying signed parts. */
export function replayGoogle(message: GoogleMessage, provider: string | undefined, model: string, binding: string | undefined): readonly GooglePart[] | undefined {
  const signature = message.reasoning?.signature;
  if (!signature || Buffer.byteLength(signature) > MAX_BYTES || !provider || !binding || message.origin?.provider !== provider
    || message.origin.model !== model || message.origin.replayBinding !== binding) return undefined;
  try {
    const value: unknown = JSON.parse(signature);
    if (!isRecord(value) || value.protocol !== 'google-generative-ai' || value.version !== 1) return undefined;
    const parts = googleOutput(value.parts);
    if (!parts) return undefined;
    const projected = googleProjection(parts);
    if (projected.text !== messageToText(message.content) || projected.reasoning !== message.reasoning!.text
      || projected.calls.length !== (message.tool_calls?.length ?? 0)) return undefined;
    if (projected.calls.some((call, index) => {
      const stored = message.tool_calls![index]!;
      return call.id !== stored.id || call.function.name !== stored.function.name
        || !isDeepStrictEqual(JSON.parse(call.function.arguments), JSON.parse(stored.function.arguments));
    })) return undefined;
    return parts;
  } catch { return undefined; }
}

/** Legacy raw reasoning signatures remain usable only under the same binding. */
export function legacyGoogleSignature(message: GoogleMessage, provider: string | undefined, model: string, binding: string | undefined): string | undefined {
  const signature = message.reasoning?.signature;
  if (!signature || !provider || !binding || message.origin?.provider !== provider || message.origin.model !== model
    || message.origin.replayBinding !== binding || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature) || signature.length % 4 !== 0) return undefined;
  return signature;
}
