import { describe, expect, it } from 'vitest';
import { endpointShape, endpointTurnBody } from '../index.js';
import { requestReplayBinding } from '../../request/replay.js';
import type { ChatMessage } from '../../../turn/prompt.js';
import type { StreamedCompletion } from '../../../turn/completion.js';

const binding = 'a'.repeat(64);
const parts = [
  { text: 'first', thought: true, thoughtSignature: 'dGhvdWdodA==' },
  { text: 'visible', thoughtSignature: 'dGV4dA==' },
  { functionCall: { id: 'one', name: 'read', args: { path: 'one' } }, thoughtSignature: 'Y2FsbA==' },
  { functionCall: { id: 'two', name: 'grep', args: { pattern: 'two' } } },
  { text: '', thoughtSignature: 'dGFpbA==' },
];
function stream(chunks: readonly unknown[], tail = ''): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + tail)); controller.close();
  } });
}
async function decode(chunks: readonly unknown[], tail?: string): Promise<StreamedCompletion> {
  const reader = endpointShape('google-account-generative-ai').readStream(stream(chunks, tail));
  let next = await reader.next(); while (!next.done) next = await reader.next(); return next.value;
}
function message(completion: StreamedCompletion): ChatMessage {
  return { ...completion.message, reasoning: { text: completion.reasoning, signature: completion.reasoningSignature },
    origin: { provider: 'google', model: 'gemini-fixture', replayBinding: binding } };
}
function body(messages: readonly ChatMessage[], endpoint = 'google-account-generative-ai', change: Record<string, unknown> = {}) {
  return endpointTurnBody(endpoint, { model: 'gemini-fixture', provider: 'google', replayBinding: binding,
    systemPrompt: 'brief', messages, tools: [], allowTools: false, temperature: 0, vision: false, ...change } as never);
}

describe('Google ordered signed replay', () => {
  it.each(['google-generative-ai', 'google-account-generative-ai', 'google-vertex'])('preserves thought/text/call/signature-only parts on %s', async endpoint => {
    const result = await decode(parts.map((part, index) => ({ candidates: [{ content: { parts: [part] },
      ...(index === parts.length - 1 ? { finishReason: 'STOP' } : {}) }] })));
    expect(result.message.content).toBe('visible'); expect(result.reasoning).toBe('first'); expect(result.message.tool_calls).toHaveLength(2);
    expect(JSON.parse(result.reasoningSignature!).parts).toEqual(parts);
    const persisted = JSON.parse(JSON.stringify(message(result)));
    const request = body([persisted, ...['one', 'two'].map(id => ({ role: 'tool' as const, tool_call_id: id, content: 'result' }))], endpoint);
    expect(request.contents).toEqual([{ role: 'model', parts }, { role: 'user', parts: [
      { functionResponse: { name: 'read', response: { output: 'result' }, id: 'one' } },
      { functionResponse: { name: 'grep', response: { output: 'result' }, id: 'two' } },
    ] }]);
    expect(endpointShape(endpoint).opaqueReplay).toBe(true);
  });

  it('keeps nonstreamed signed output separate from visible reasoning and replays it exactly', () => {
    const result = endpointShape('google-account-generative-ai').readBody({ candidates: [{ content: { parts }, finishReason: 'STOP' }] });
    expect(result.choices?.[0]?.message?.content).toBe('visible'); expect(result.reasoning).toBe('first');
    expect(JSON.parse(result.reasoningSignature!).parts).toEqual(parts);
  });

  it.each(['provider', 'model', 'binding', 'text', 'reasoning', 'call', 'legacy'] as const)('drops opaque material after %s changes', async change => {
    const result = await decode([{ candidates: [{ content: { parts }, finishReason: 'STOP' }] }]);
    const stored = message(result);
    if (change === 'provider') stored.origin = { ...stored.origin!, provider: 'foreign' };
    if (change === 'model') stored.origin = { ...stored.origin!, model: 'foreign' };
    if (change === 'binding') stored.origin = { ...stored.origin!, replayBinding: 'b'.repeat(64) };
    if (change === 'text') stored.content = 'edited';
    if (change === 'reasoning') stored.reasoning = { ...stored.reasoning!, text: 'edited' };
    if (change === 'call') stored.tool_calls = [stored.tool_calls![0]!, { ...stored.tool_calls![1]!, function: { name: 'grep', arguments: '{"pattern":"edited"}' } }];
    if (change === 'legacy') stored.origin = undefined;
    const wire = JSON.stringify(body([stored]));
    expect(wire).not.toContain('thoughtSignature'); expect(wire).not.toContain('google-generative-ai');
  });

  it('allocates missing call ids across frames and binds tool results to their names', async () => {
    const result = await decode(['read', 'grep'].map((name, index) => ({ candidates: [{ content: { parts: [
      { functionCall: { name, args: {} }, thoughtSignature: 'Y2FsbA==' },
    ] }, ...(index === 1 ? { finishReason: 'STOP' } : {}) }] })));
    expect(result.message.tool_calls?.map(call => call.id)).toEqual(['call_0', 'call_1']);
    const request = body([message(result), { role: 'tool', tool_call_id: 'call_1', content: 'ok' }]);
    expect(JSON.stringify(request)).toContain('"name":"grep","response":{"output":"ok"}');
    expect(JSON.stringify(request)).not.toContain('"id":"call_1"');
  });

  it('keeps a later fallback call id after a native idless turn reused its internal id', async () => {
    const result = await decode([{ candidates: [{ content: { parts: [{ functionCall: { name: 'read', args: {} },
      thoughtSignature: 'Y2FsbA==' }] }, finishReason: 'STOP' }] }]);
    const request = body([message(result), { role: 'tool', tool_call_id: 'call_0', content: 'first' },
      { role: 'assistant', tool_calls: [{ id: 'call_0', type: 'function', function: { name: 'grep', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'call_0', content: 'second' }]);
    const contents = request.contents as { parts: { functionResponse?: { id?: string; name: string } }[] }[];
    expect(contents[1]!.parts[0]!.functionResponse).toMatchObject({ name: 'read' }); expect(contents[1]!.parts[0]!.functionResponse?.id).toBeUndefined();
    expect(contents[3]!.parts[0]!.functionResponse).toMatchObject({ name: 'grep', id: 'call_0' });
  });

  it('folds same-block deltas and attaches a trailing signature without joining distinct signatures', async () => {
    const result = await decode([
      { candidates: [{ content: { parts: [{ text: 'first ', thought: true, thoughtSignature: 'dGhvdWdodA==' }] } }] },
      { candidates: [{ content: { parts: [{ text: 'thought', thought: true }, { text: 'visible ' }] } }] },
      { candidates: [{ content: { parts: [{ text: 'answer' }, { text: '', thoughtSignature: 'dGV4dA==' }] } }] },
      { candidates: [{ content: { parts: [{ text: 'other', thoughtSignature: 'b3RoZXI=' }] }, finishReason: 'STOP' }] },
    ]);
    expect(JSON.parse(result.reasoningSignature!).parts).toEqual([
      { text: 'first thought', thought: true, thoughtSignature: 'dGhvdWdodA==' },
      { text: 'visible answer', thoughtSignature: 'dGV4dA==' }, { text: 'other', thoughtSignature: 'b3RoZXI=' },
    ]);
    expect(result.reasoning).toBe('first thought'); expect(result.message.content).toBe('visible answerother');
  });

  it.each(['MAX_TOKENS', 'SAFETY', 'MALFORMED_FUNCTION_CALL'])('does not authorize signed tools or replay after %s', async finishReason => {
    const result = await decode([{ candidates: [{ content: { parts }, finishReason }] }]);
    expect(result.message.tool_calls).toBeUndefined(); expect(result.reasoningSignature).toBeUndefined(); expect(result.finishReason).not.toBe('stop');
  });

  it.each([
    [{ functionCall: { name: 'read', args: [] }, thoughtSignature: 'Y2FsbA==' }],
    [{ functionResponse: { name: 'read', response: {} }, thoughtSignature: 'Y2FsbA==' }],
    [{ text: 'one', thoughtSignature: 42 }],
    [{ functionCall: { id: 'a', name: 'read' } }, { functionCall: { id: 'a', name: 'grep' } }],
    [{ functionCall: { id: 'call_1', name: 'read' } }, { functionCall: { name: 'grep' } }],
  ].map(malformed => ({ malformed })))('rejects malformed signed output %# before tool admission', async ({ malformed }) => {
    const result = await decode([{ candidates: [{ content: { parts: malformed }, finishReason: 'STOP' }] }]);
    expect(result.finishReason).toBe('error'); expect(result.message.tool_calls).toBeUndefined(); expect(result.reasoningSignature).toBeUndefined();
  });

  it('rejects malformed stream tails and bounds oversized replay material', async () => {
    const result = await decode([{ candidates: [{ content: { parts }, finishReason: 'STOP' }] }], 'data: {');
    expect(result.finishReason).toBe('error'); expect(result.message.tool_calls).toBeUndefined(); expect(result.reasoningSignature).toBeUndefined();
    const large = await decode([{ candidates: [{ content: { parts: [{ text: 'x'.repeat(1024 * 1024), thoughtSignature: 'dGV4dA==' }] }, finishReason: 'STOP' }] }]);
    expect(large.finishReason).toBe('error'); expect(large.reasoningSignature).toBeUndefined();
  });

  it.each([{ error: { code: 500 } }, 42, { candidates: [42] }, { candidates: {} },
    { candidates: [{ content: { parts: {} } }] }, { candidates: [{ content: 42 }] },
    { candidates: [{ finishReason: 42 }] }])('does not admit tools after a bad late frame %j', async failure => {
    const result = await decode([{ candidates: [{ content: { parts }, finishReason: 'STOP' }] }, failure]);
    expect(result.finishReason).toBe('error'); expect(result.message.tool_calls).toBeUndefined(); expect(result.reasoningSignature).toBeUndefined();
  });

  it('keeps a failed terminal failed when a later frame claims STOP, including nonstreamed error payloads', async () => {
    const result = await decode([{ candidates: [{ content: { parts }, finishReason: 'MAX_TOKENS' }] },
      { candidates: [{ finishReason: 'STOP' }] }]);
    expect(result.finishReason).toBe('length'); expect(result.message.tool_calls).toBeUndefined(); expect(result.reasoningSignature).toBeUndefined();
    const failed = endpointShape('google-account-generative-ai').readBody({ error: { code: 500 }, candidates: [{ content: { parts }, finishReason: 'STOP' }] });
    expect(failed.choices?.[0]?.finish_reason).toBe('error'); expect(failed.choices?.[0]?.message?.tool_calls).toBeUndefined();
    expect(failed.reasoningSignature).toBeUndefined();
  });

  it.each([false, true])('rejects content after terminal evidence in buffered tail %s while allowing usage', async tail => {
    const late = { candidates: [{ content: { parts: [{ functionCall: { name: 'read', args: {} }, thoughtSignature: 'Y2FsbA==' }] } }] };
    const first = { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] };
    const result = await decode(tail ? [first] : [first, late], tail ? `data: ${JSON.stringify(late)}` : undefined);
    expect(result.finishReason).toBe('error'); expect(result.message.tool_calls).toBeUndefined(); expect(result.reasoningSignature).toBeUndefined();
    const usage = await decode([first, { usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 1 } }]);
    expect(usage.finishReason).toBe('stop'); expect(usage.usage?.prompt_tokens).toBe(2);
  });

  it('binds opaque history to the captured quota project for direct callers', () => {
    const input = { provider: 'google', endpoint: 'google-account-generative-ai', baseUrl: 'https://generativelanguage.googleapis.com' };
    expect(requestReplayBinding({ ...input, headers: { authorization: 'Bearer synthetic', 'x-goog-user-project': 'one' } }))
      .not.toBe(requestReplayBinding({ ...input, headers: { authorization: 'Bearer synthetic', 'x-goog-user-project': 'two' } }));
  });
});
