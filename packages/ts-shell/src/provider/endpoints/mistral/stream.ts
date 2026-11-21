import { isRecord } from '../../../core/values/record.js';
import type { CompletedBody, ProviderUsage, StreamedCompletion, StreamedToolCall, StreamFragment } from '../../../turn/completion.js';
import type { ObserveToolArguments } from '../../../turn/preview/model.js';
import { IncompleteStreamError, providerResponseError } from '../../response/error.js';
import { responseEvents } from '../../response/events.js';
import { projectContent, readContent } from './content.js';
import { captureReplay } from './replay.js';

const MAX_PARTS = 4096;
const MAX_BYTES = 8 * 1024 * 1024;

function invalid(): never {
  throw new Error('Invalid or unsupported conversation response.');
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256 || /[\x00-\x1f\x7f]/.test(value)) invalid();
  return value;
}

function position(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value >= MAX_PARTS) invalid();
  return value;
}

function outputPart(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return { type: 'text', text: value };
  if (!isRecord(value)) return invalid();
  if (value.type === 'text' && typeof value.text === 'string') return { type: 'text', text: value.text };
  if (value.type !== 'thinking' || !Array.isArray(value.thinking) || value.thinking.length > MAX_PARTS
    || (value.signature != null && typeof value.signature !== 'string')
    || (value.closed !== undefined && typeof value.closed !== 'boolean')) return invalid();
  const thinking = (value.thinking as unknown[]).map(part => {
    if (!isRecord(part) || part.type !== 'text' || typeof part.text !== 'string') return invalid();
    return { type: 'text', text: part.text };
  });
  return { type: 'thinking', thinking,
    ...(value.signature ? { signature: value.signature } : {}),
    ...(value.closed !== undefined ? { closed: value.closed } : {}) };
}

function functionCall(event: Record<string, unknown>, argumentsValue: unknown): StreamedToolCall {
  const id = identifier(event.tool_call_id);
  const name = identifier(event.name);
  if (event.confirmation_status != null) return invalid();
  const args: unknown = typeof argumentsValue === 'string' ? parseArguments(argumentsValue) : argumentsValue;
  if (!isRecord(args)) return invalid();
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

function parseArguments(args: string): unknown {
  try { return JSON.parse(args); } catch { return invalid(); }
}

function usage(value: unknown): ProviderUsage {
  if (!isRecord(value)) return invalid();
  const result: { -readonly [K in keyof ProviderUsage]?: ProviderUsage[K] } = {};
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens'] as const) {
    const count = value[key];
    if (count === undefined) continue;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return invalid();
    result[key] = count;
  }
  return result;
}

function completion(parts: readonly unknown[], calls: readonly StreamedToolCall[], usage: ProviderUsage, protocol: string): StreamedCompletion {
  if (new Set(calls.map(call => call.id)).size !== calls.length) return invalid();
  const { text, reasoning } = projectContent(parts);
  const reasoningSignature = captureReplay(parts, calls, protocol);
  if (!(text || reasoning || reasoningSignature || calls.length)) return invalid();
  return { message: { role: 'assistant', content: text, ...(calls.length ? { tool_calls: calls } : {}) },
    reasoning, ...(reasoningSignature ? { reasoningSignature } : {}), finishReason: calls.length ? 'tool_calls' : 'stop', usage };
}

export function readConversation(body: unknown, protocol: string): CompletedBody {
  if (!isRecord(body)) return invalid();
  if (body.error != null) throw providerResponseError(body.error);
  if (body.object !== undefined && body.object !== 'conversation.response') return invalid();
  identifier(body.conversation_id);
  if (!Array.isArray(body.outputs) || body.outputs.length > MAX_PARTS || Buffer.byteLength(JSON.stringify(body)) > MAX_BYTES
    || (body.guardrails != null && (!Array.isArray(body.guardrails) || body.guardrails.length))) return invalid();
  const parts: unknown[] = [];
  const calls: StreamedToolCall[] = [];
  for (const output of body.outputs as unknown[]) {
    if (!isRecord(output)) return invalid();
    if (output.type === 'function.call') calls.push(functionCall(output, output.arguments));
    else if (output.type === 'message.output' && (output.role === undefined || output.role === 'assistant')) {
      const content: unknown[] = Array.isArray(output.content) ? output.content : [output.content];
      if (parts.length + content.length > MAX_PARTS) return invalid();
      for (const part of content) parts.push(outputPart(part));
    } else return invalid();
  }
  const result = completion(parts, calls, usage(body.usage), protocol);
  return { choices: [{ message: result.message, finish_reason: result.finishReason }], usage: result.usage,
    reasoning: result.reasoning, ...(result.reasoningSignature ? { reasoningSignature: result.reasoningSignature } : {}) };
}

interface CallSlot {
  readonly entry: Record<string, unknown>;
  arguments: string;
}

interface ContentSlot {
  readonly output: number;
  readonly index: number;
  readonly part: Record<string, unknown>;
}

function appendPart(parts: ContentSlot[], event: Record<string, unknown>, output: number): readonly StreamFragment[] {
  const index = position(event.content_index);
  const delta = outputPart(event.content);
  const prior = parts.at(-1);
  if (prior && (prior.output > output || prior.output === output && prior.index > index)) return invalid();
  if (prior?.output === output && prior.index === index) {
    const part = prior.part;
    if (part.type !== delta.type) return invalid();
    if (delta.type === 'text') part.text = String(part.text) + String(delta.text);
    else {
      if (part.signature != null && delta.signature != null && part.signature !== delta.signature) return invalid();
      const thinking = part.thinking as unknown[];
      const additions = delta.thinking as unknown[];
      if (thinking.length + additions.length > MAX_PARTS) return invalid();
      thinking.push(...additions);
      if (delta.signature != null) part.signature = delta.signature;
      if (delta.closed !== undefined) part.closed = delta.closed;
    }
  } else {
    if (parts.length >= MAX_PARTS) return invalid();
    parts.push({ output, index, part: { ...delta,
      ...(delta.type === 'thinking' ? { thinking: [...delta.thinking as unknown[]] } : {}) } });
  }
  return readContent([delta]);
}

export async function* readConversationStream(body: ReadableStream<Uint8Array>, protocol: string,
  observe?: ObserveToolArguments): AsyncGenerator<StreamFragment, StreamedCompletion, undefined> {
  let started = false;
  let bytes = 0;
  const outputs = new Map<number, { readonly id: string; readonly type: string }>();
  const ids = new Set<string>();
  const calls = new Map<number, CallSlot>();
  const parts: ContentSlot[] = [];
  for await (const event of responseEvents(body)) {
    if (event.type === 'conversation.response.error') throw providerResponseError(event);
    if (event.type === 'conversation.response.started') {
      if (started) return invalid();
      identifier(event.conversation_id);
      started = true;
      continue;
    }
    if (!started) return invalid();
    if (event.type === 'conversation.response.done') {
      const completed = [...calls.entries()].sort(([left], [right]) => left - right)
        .map(([, call]) => functionCall(call.entry, call.arguments));
      return completion(parts.map(slot => slot.part), completed, usage(event.usage), protocol);
    }
    if (event.type !== 'message.output.delta' && event.type !== 'function.call.delta') return invalid();
    bytes += Buffer.byteLength(JSON.stringify(event));
    if (bytes > MAX_BYTES) return invalid();
    const index = position(event.output_index);
    const id = identifier(event.id);
    const previous = outputs.get(index);
    if (previous && (previous.id !== id || previous.type !== event.type) || !previous && ids.has(id)) return invalid();
    outputs.set(index, { id, type: event.type });
    ids.add(id);
    if (event.type === 'message.output.delta') {
      if (event.role !== undefined && event.role !== 'assistant') return invalid();
      yield* appendPart(parts, event, index);
      continue;
    }
    const name = identifier(event.name);
    const toolId = identifier(event.tool_call_id);
    if (typeof event.arguments !== 'string' || event.confirmation_status != null) return invalid();
    const call = calls.get(index);
    if (!call) calls.set(index, { entry: { name, tool_call_id: toolId }, arguments: event.arguments });
    else {
      if (call.entry.name !== name || call.entry.tool_call_id !== toolId) return invalid();
      call.arguments += event.arguments;
    }
    observe?.({ index, name, delta: event.arguments });
  }
  throw new IncompleteStreamError();
}
