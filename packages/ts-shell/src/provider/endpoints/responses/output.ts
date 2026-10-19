import { isRecord } from '../../../core/values/record.js';
import type { CompletedBody, ProviderUsage, StreamedToolCall } from '../../../turn/completion.js';

export type OutputItem = Record<string, unknown>;

/** Only output shapes supported by the runtime may be replayed as input. */
export function responseOutput(value: unknown, actionable = false): readonly OutputItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>();
  const calls = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id || ids.has(item.id)) return undefined;
    ids.add(item.id);
    if (item.type === 'message') {
      if (item.role !== 'assistant' || !Array.isArray(item.content) || item.content.some(part => !isRecord(part)
        || (part.type === 'output_text' ? typeof part.text !== 'string'
          : part.type === 'refusal' ? typeof part.refusal !== 'string' : true))) return undefined;
    } else if (item.type === 'function_call') {
      if (typeof item.call_id !== 'string' || !item.call_id || calls.has(item.call_id)
        || typeof item.name !== 'string' || !item.name || typeof item.arguments !== 'string') return undefined;
      if (actionable) { try { if (!isRecord(JSON.parse(item.arguments))) return undefined; } catch { return undefined; } }
      calls.add(item.call_id);
    } else if (item.type === 'reasoning') {
      if (!Array.isArray(item.summary) || item.summary.some(part => !isRecord(part)
        || part.type !== 'summary_text' || typeof part.text !== 'string')
        || (item.encrypted_content !== undefined && item.encrypted_content !== null && typeof item.encrypted_content !== 'string')) return undefined;
    } else return undefined;
  }
  return value;
}

export function outputProjection(output: readonly OutputItem[]): {
  readonly text: string; readonly reasoning: string; readonly calls: readonly StreamedToolCall[]; readonly refused: boolean;
} {
  let text = ''; let reasoning = ''; let refused = false;
  const calls: StreamedToolCall[] = [];
  for (const item of output) {
    if (item.type === 'message') for (const part of item.content as Record<string, unknown>[]) {
      if (part.type === 'output_text') text += part.text as string;
      else refused = true;
    }
    if (item.type === 'reasoning') reasoning += (item.summary as { text: string }[]).map(part => part.text).join('\n');
    if (item.type === 'function_call') calls.push({ id: item.call_id as string, type: 'function',
      function: { name: item.name as string, arguments: item.arguments as string } });
  }
  return { text, reasoning, calls, refused };
}

/** output_tokens already includes reasoning; cached input remains part of input_tokens. */
export function responseUsage(value: unknown): ProviderUsage | undefined {
  if (!isRecord(value)) return undefined;
  const input = count(value.input_tokens); const output = count(value.output_tokens); const total = count(value.total_tokens);
  const cached = isRecord(value.input_tokens_details) ? count(value.input_tokens_details.cached_tokens) : undefined;
  return { ...(input !== undefined ? { prompt_tokens: input } : {}),
    ...(output !== undefined ? { completion_tokens: output } : {}), ...(total !== undefined ? { total_tokens: total } : {}),
    ...(cached !== undefined ? { prompt_tokens_details: { cached_tokens: cached } } : {}) };
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** Terminal errors retain cost evidence but never admit partially assembled tool calls. */
export function readResponse(body: unknown, account = false): CompletedBody {
  if (!isRecord(body)) return responseFailure('');
  const usage = responseUsage(body.usage);
  const finish = responseFinish(body);
  const output = responseOutput(body.output, finish === 'stop');
  if (!output || !finish) return responseFailure('', usage);
  const projected = outputProjection(output);
  const reason = projected.refused ? 'refusal' : finish;
  const success = reason === 'stop';
  return { choices: [{ message: { content: projected.text,
    ...(success && projected.calls.length ? { tool_calls: projected.calls } : {}) },
    finish_reason: success && projected.calls.length ? 'tool_calls' : reason }], usage,
    reasoning: projected.reasoning,
    ...(success && (account || typeof body.model === 'string') && output.length ? { reasoningSignature: JSON.stringify({
      protocol: account ? 'openai-account-responses' : 'openai-responses', version: 1,
      ...(typeof body.model === 'string' ? { model: body.model } : {}), output,
    }) } : {}) };
}

function responseFinish(body: Record<string, unknown>): string | undefined {
  if (body.error !== undefined && body.error !== null) return 'error';
  if (body.status === 'completed') {
    const output = body.output;
    if (Array.isArray(output) && output.some(item => isRecord(item) && item.status !== undefined && item.status !== 'completed')) return 'error';
    return 'stop';
  }
  if (body.status === 'incomplete' && isRecord(body.incomplete_details)) {
    return body.incomplete_details.reason === 'max_output_tokens' ? 'length'
      : body.incomplete_details.reason === 'content_filter' ? 'content_filter' : 'error';
  }
  return undefined;
}

export function responseFailure(text: string, usage?: ProviderUsage): CompletedBody {
  return { choices: [{ message: { content: text }, finish_reason: 'error' }], ...(usage ? { usage } : {}) };
}
