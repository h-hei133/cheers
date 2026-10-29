import { isRecord } from '../../../core/values/record.js';
import { isDeepStrictEqual } from 'node:util';
import type { CompletedBody, StreamedCompletion, StreamFragment } from '../../../turn/completion.js';
import { responseEvents } from './events.js';
import { readResponse, responseFailure, responseOutput, responseUsage, type OutputItem } from './output.js';

interface Slot {
  readonly item: OutputItem;
  readonly text: Map<number, string>;
  readonly reasoning: Map<number, string>;
  readonly reasoningText: Map<number, string>;
  args?: string;
  argsDone?: string;
  readonly textDone: Map<number, string>;
  readonly reasoningDone: Map<number, string>;
  readonly reasoningTextDone: Map<number, string>;
  done?: OutputItem;
}

function position(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Response event has an invalid output position.');
  return value;
}

function matches(slot: Slot, item: OutputItem): boolean {
  if (slot.item.id !== item.id || slot.item.type !== item.type) return false;
  for (const key of ['phase', 'namespace'] as const) {
    if (slot.item[key] !== undefined && !isDeepStrictEqual(slot.item[key], item[key])) return false;
  }
  if (item.type === 'reasoning' && slot.item.content !== undefined) {
    if (!Array.isArray(slot.item.content)) return false;
    for (const [index, part] of slot.item.content.entries()) {
      const next = (item.content as Record<string, unknown>[] | undefined)?.[index];
      if (!isRecord(part) || part.type !== 'reasoning_text' || typeof part.text !== 'string'
        || next?.type !== 'reasoning_text' || typeof next.text !== 'string' || !next.text.startsWith(part.text)) return false;
    }
  }
  if (slot.done) {
    const { encrypted_content: previousEncrypted, ...previous } = slot.done;
    const { encrypted_content: nextEncrypted, ...next } = item;
    if (!isDeepStrictEqual(previous, next) || (typeof previousEncrypted === 'string' && previousEncrypted !== nextEncrypted)) return false;
  }
  if (item.type === 'function_call') {
    if (slot.item.call_id !== item.call_id || slot.item.name !== item.name || (slot.args !== undefined && !(item.arguments as string).startsWith(slot.args))) return false;
    if ((slot.done && slot.done.arguments !== item.arguments) || (slot.argsDone !== undefined && slot.argsDone !== item.arguments)) return false;
  }
  for (const [index, text] of slot.text) {
    const part = (item.content as Record<string, unknown>[] | undefined)?.[index];
    if (part?.type !== 'output_text' || typeof part.text !== 'string' || !part.text.startsWith(text)) return false;
  }
  for (const [index, text] of slot.reasoning) {
    const part = (item.summary as Record<string, unknown>[] | undefined)?.[index];
    if (part?.type !== 'summary_text' || typeof part.text !== 'string' || !part.text.startsWith(text)) return false;
  }
  for (const [index, text] of slot.reasoningText) {
    const part = (item.content as Record<string, unknown>[] | undefined)?.[index];
    if (part?.type !== 'reasoning_text' || typeof part.text !== 'string' || !part.text.startsWith(text)) return false;
  }
  for (const [index, text] of slot.textDone) if ((item.content as { text: string }[] | undefined)?.[index]?.text !== text) return false;
  for (const [index, text] of slot.reasoningDone) if ((item.summary as { text: string }[] | undefined)?.[index]?.text !== text) return false;
  for (const [index, text] of slot.reasoningTextDone) if ((item.content as { text: string }[] | undefined)?.[index]?.text !== text) return false;
  return true;
}

function assembled(body: CompletedBody, shown: string): StreamedCompletion {
  const choice = body.choices?.[0];
  return { message: { role: 'assistant', content: choice?.message?.content || shown,
    ...(choice?.message?.tool_calls?.length ? { tool_calls: choice.message.tool_calls } : {}) },
    reasoning: body.reasoning ?? '', finishReason: choice?.finish_reason ?? 'error', usage: body.usage,
    ...(body.reasoningSignature ? { reasoningSignature: body.reasoningSignature } : {}) };
}

/** Only an explicit native terminal can complete a response; partial tools never execute. */
export async function* readResponseStream(body: ReadableStream<Uint8Array>, account = false): AsyncGenerator<StreamFragment, StreamedCompletion, undefined> {
  const slots = new Map<number, Slot>(); let shown = ''; let responseId: string | undefined; let responseModel: string | undefined;
  try {
    for await (const event of responseEvents(body)) {
      if (event.type === 'response.created') {
        if (!isRecord(event.response) || typeof event.response.id !== 'string' || (responseId && responseId !== event.response.id)) throw new Error('Response identity changed.');
        responseId = event.response.id;
        if (account && typeof event.response.model === 'string' && event.response.model) {
          if (responseModel && responseModel !== event.response.model) throw new Error('Response model changed.');
          responseModel = event.response.model;
        }
      }
      if (event.response_id !== undefined) {
        if (typeof event.response_id !== 'string' || !event.response_id || (responseId && event.response_id !== responseId)) throw new Error('Response event belongs to another response.');
        responseId = event.response_id;
      }
      if (event.type === 'error') return assembled(responseFailure(shown), shown);
      if (event.type === 'response.failed' || event.type === 'response.completed' || event.type === 'response.incomplete'
        || (account && event.type === 'response.done')) {
        if (!isRecord(event.response) || typeof event.response.id !== 'string' || !event.response.id || (responseId && event.response.id !== responseId)) {
          return assembled(responseFailure(shown), shown);
        }
        let terminal: Record<string, unknown> = event.response;
        const usage = responseUsage(terminal.usage);
        const status = event.type === 'response.done' ? terminal.status
          : event.type === 'response.completed' ? 'completed' : event.type === 'response.incomplete' ? 'incomplete' : 'failed';
        if (!['completed', 'incomplete', 'failed'].includes(String(status)) || terminal.status !== status) return assembled(responseFailure(shown, usage), shown);
        if (account && responseModel) {
          if (terminal.model !== undefined && terminal.model !== responseModel) return assembled(responseFailure(shown, usage), shown);
          terminal = { ...terminal, model: responseModel };
        }
        // The account service may omit output at the terminal; sealed contiguous items are authoritative.
        if (account && terminal.output === undefined && slots.size
          && Array.from({ length: slots.size }, (_, index) => slots.get(index)).every(slot => slot?.done)) {
          terminal = { ...terminal, output: Array.from({ length: slots.size }, (_, index) => slots.get(index)!.done) };
        }
        const output = responseOutput(terminal.output);
        if (event.type === 'response.failed' || !output || [...slots].some(([index, slot]) => !output[index] || !matches(slot, output[index]!))) {
          return assembled(responseFailure(shown, usage), shown);
        }
        const completed = readResponse(terminal, account);
        const text = completed.choices?.[0]?.message?.content ?? '';
        if (!text.startsWith(shown)) return assembled(responseFailure(shown, usage), shown);
        if (text.length > shown.length) yield { kind: 'text', text: text.slice(shown.length) };
        return assembled(completed, shown);
      }
      if (event.type === 'response.output_item.added') {
        const index = position(event.output_index);
        if (!isRecord(event.item) || typeof event.item.id !== 'string' || slots.has(index)) throw new Error('Response output item is invalid or repeated.');
        const item = event.item;
        if ([...slots.values()].some(slot => slot.item.id === item.id)) throw new Error('Response output item identity is repeated.');
        slots.set(index, { item, text: new Map(), reasoning: new Map(), reasoningText: new Map(),
          textDone: new Map(), reasoningDone: new Map(), reasoningTextDone: new Map() });
      }
      if (event.type === 'response.output_item.done') {
        const index = position(event.output_index); const slot = slots.get(index); const output = responseOutput([event.item]);
        if (!slot || slot.done || !output || !matches(slot, output[0]!)) throw new Error('Response completed item contradicts its deltas.');
        slot.done = output[0];
      }
      if (event.type === 'response.output_text.delta' || event.type === 'response.reasoning_summary_text.delta'
        || event.type === 'response.reasoning_text.delta' || event.type === 'response.reasoning_text.done'
        || event.type === 'response.function_call_arguments.delta' || event.type === 'response.function_call_arguments.done'
        || event.type === 'response.output_text.done' || event.type === 'response.reasoning_summary_text.done') {
        const slot = slots.get(position(event.output_index));
        if (!slot || slot.done || event.item_id !== slot.item.id) throw new Error('Response delta has no matching output item.');
        if (event.type === 'response.function_call_arguments.done') {
          if (slot.item.type !== 'function_call' || slot.argsDone !== undefined || typeof event.arguments !== 'string' || (slot.args !== undefined && slot.args !== event.arguments)) throw new Error('Response tool arguments contradict their deltas.');
          slot.argsDone = event.arguments; continue;
        }
        if (event.type === 'response.function_call_arguments.delta') {
          if (typeof event.delta !== 'string') throw new Error('Response delta has no text.');
          if (slot.item.type !== 'function_call' || slot.argsDone !== undefined) throw new Error('Response tool delta changed a completed item.');
          slot.args = (slot.args ?? '') + event.delta; continue;
        }
        const summary = event.type === 'response.reasoning_summary_text.delta' || event.type === 'response.reasoning_summary_text.done';
        const raw = event.type === 'response.reasoning_text.delta' || event.type === 'response.reasoning_text.done';
        const reasoning = summary || raw;
        if (slot.item.type !== (reasoning ? 'reasoning' : 'message')) throw new Error('Response text delta has a different item type.');
        const index = position(summary ? event.summary_index : event.content_index);
        const parts = summary ? slot.reasoning : raw ? slot.reasoningText : slot.text;
        const done = summary ? slot.reasoningDone : raw ? slot.reasoningTextDone : slot.textDone;
        if (done.has(index)) throw new Error('Response text changed a completed part.');
        if (event.type.endsWith('.done')) {
          if (typeof event.text !== 'string' || (parts.has(index) && parts.get(index) !== event.text)) throw new Error('Response text contradicts its deltas.');
          done.set(index, event.text); continue;
        }
        if (typeof event.delta !== 'string') throw new Error('Response delta has no text.');
        parts.set(index, (parts.get(index) ?? '') + event.delta);
        if (!reasoning) shown += event.delta;
        yield { kind: reasoning ? 'reasoning' : 'text', text: event.delta };
      }
    }
  } catch {
    return assembled(responseFailure(shown), shown);
  }
  return assembled(responseFailure(shown), shown);
}
