import { isDeepStrictEqual } from 'node:util';
import { isRecord } from '../../../core/values/record.js';
import { messageToText, toOpenAIImageUrlBlock } from '../../../model-adapters/multimodal.js';
import type { ChatMessage } from '../../../turn/prompt.js';
import { outputProjection, responseOutput, type OutputItem } from './output.js';

/** Replay ordered native items only for the same provider/model and unchanged message. */
function replay(message: ChatMessage, provider: string | undefined, model: string, binding: string | undefined): readonly OutputItem[] | undefined {
  if (!message.reasoning?.signature || !provider || !binding || message.origin?.replayBinding !== binding
    || message.origin.provider !== provider || message.origin.model !== model) return undefined;
  try {
    const value: unknown = JSON.parse(message.reasoning.signature);
    if (!isRecord(value) || value.version !== 1) return undefined;
    if (value.protocol === 'openai-account-responses') {
      if (value.model !== undefined && typeof value.model !== 'string') return undefined;
    } else if (value.protocol !== 'openai-responses' || typeof value.model !== 'string') return undefined;
    const output = responseOutput(value.output, true);
    if (!output) return undefined;
    const projected = outputProjection(output);
    if (projected.refused || projected.text !== messageToText(message.content) || projected.reasoning !== message.reasoning.text
      || projected.calls.length !== (message.tool_calls?.length ?? 0)) return undefined;
    if (projected.calls.some((call, index) => {
      const stored = message.tool_calls![index]!;
      return call.id !== stored.id || call.function.name !== stored.function.name
        || !isDeepStrictEqual(JSON.parse(call.function.arguments), JSON.parse(stored.function.arguments));
    })) return undefined;
    return output;
  } catch { return undefined; }
}

function userContent(message: ChatMessage, vision: boolean): readonly Record<string, unknown>[] {
  if (!Array.isArray(message.content) || !vision) return [{ type: 'input_text', text: messageToText(message.content) }];
  return message.content.map(part => part.type === 'text' ? { type: 'input_text', text: part.text }
    : { type: 'input_image', image_url: toOpenAIImageUrlBlock(part).image_url.url, detail: 'auto' });
}

export function responseMessages(messages: readonly ChatMessage[], vision: boolean, provider: string | undefined, model: string, binding?: string): readonly OutputItem[] {
  const result: OutputItem[] = [];
  for (const message of messages) {
    if (message.role === 'assistant') {
      const native = replay(message, provider, model, binding);
      if (native) { result.push(...native); continue; }
      const text = messageToText(message.content);
      if (text) result.push({ role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }], type: 'message' });
      for (const call of message.tool_calls ?? []) result.push({ type: 'function_call', call_id: call.id,
        name: call.function.name, arguments: call.function.arguments });
    } else if (message.role === 'tool') {
      if (!message.tool_call_id) throw new Error('A tool result has no call identity.');
      const output = userContent(message, vision);
      result.push({ type: 'function_call_output', call_id: message.tool_call_id,
        output: typeof message.content === 'string' || !vision ? messageToText(message.content) : output });
    } else result.push({ role: message.role, content: userContent(message, vision) });
  }
  return result;
}
