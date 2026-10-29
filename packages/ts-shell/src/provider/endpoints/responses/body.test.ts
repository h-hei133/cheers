import { describe, expect, it } from 'vitest';
import { endpointBody, endpointShape, endpointTurnBody, endpointUrl } from '../index.js';
import { toChatMessages } from '../../../turn/prompt.js';
import { toStep } from '../../../turn/step.js';
import { createMessageTranscriptEvent, decodeTranscriptLine, transcriptEventToSessionMessage } from '../../../session/sessionEventCodec.js';

const turn = { model: 'm', provider: 'openai', replayBinding: 'a'.repeat(64), systemPrompt: 'instructions', messages: [{ role: 'user' as const, content: 'hi' }],
  tools: [{ type: 'function' as const, function: { name: 'read', description: 'Read file', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }],
  allowTools: true, vision: true, temperature: 0.2, systemRole: 'developer' as const, reasoningEffort: true,
  maxTokensField: 'max_completion_tokens' as const, assistantAfterToolResult: false };

const output = [
  { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'opaque-ciphertext' },
  { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Inspecting', annotations: [] }] },
  { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'read', arguments: '{ "path": "a" }', status: 'completed' },
];

describe('Responses requests', () => {
  it.each(['openai-responses', 'openai-account-responses'])('requests admitted %s summaries without selecting effort', endpoint => {
    const body = endpointTurnBody(endpoint, { ...turn, reasoningSummary: true });
    expect(body.reasoning).toEqual({ summary: 'auto' });
    expect(body).not.toHaveProperty('reasoning.effort');
    expect(endpointBody(endpoint, { ...turn, reasoningSummary: true }).reasoning).toEqual({ summary: 'auto' });
    expect(endpointTurnBody(endpoint, turn)).not.toHaveProperty('reasoning');
    expect(endpointTurnBody(endpoint, { ...turn, reasoningSummary: false, thinkingLevelName: 'high' }).reasoning).toEqual({ effort: 'high' });
  });

  it('sends flat optional schemas, local history, inclusive output and supported reasoning controls', () => {
    const body = endpointTurnBody('openai-responses', { ...turn, thinkingLevelName: 'high', maxOutputTokens: 100, topP: 0.5, serviceTier: 'flex' });
    expect(endpointUrl('https://fixture.test/v1/', 'openai-responses', 'm')).toBe('https://fixture.test/v1/responses');
    expect(body).toMatchObject({ model: 'm', instructions: 'instructions', store: false, stream: true,
      include: ['reasoning.encrypted_content'], max_output_tokens: 100, reasoning: { effort: 'high', summary: 'auto' },
      tools: [{ type: 'function', name: 'read', parameters: turn.tools[0]!.function.parameters, strict: false }],
      parallel_tool_calls: true, tool_choice: 'auto', service_tier: 'flex' });
    expect(body).not.toHaveProperty('messages'); expect(body).not.toHaveProperty('temperature'); expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body.tools).not.toEqual(turn.tools);
    expect(endpointTurnBody('openai-responses', { ...turn, allowTools: false })).not.toHaveProperty('tools');
    expect(endpointShape('openai-responses').refreshBody!(body, {})).toEqual({ ...body, max_output_tokens: 1 });
  });

  it('pairs simple JSON requests and preserves multimodal tool result call identity', () => {
    expect(endpointBody('openai-responses', turn)).toMatchObject({ stream: false, instructions: 'instructions' });
    const body = endpointTurnBody('openai-responses', { ...turn, messages: [
      { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'call_1', content: [{ type: 'text', text: 'image' }, { type: 'image', mimeType: 'image/png', data: 'AA==' }] },
    ] });
    expect(body.input).toEqual([
      { type: 'function_call', call_id: 'call_1', name: 'read', arguments: '{}' },
      { type: 'function_call_output', call_id: 'call_1', output: [{ type: 'input_text', text: 'image' },
        { type: 'input_image', image_url: 'data:image/png;base64,AA==', detail: 'auto' }] },
    ]);
    expect(endpointTurnBody('openai-responses', { ...turn, vision: false, messages: [{ role: 'user', content: [{ type: 'image', mimeType: 'image/png', data: 'AA==' }] }] })).not.toHaveProperty('input.0.content.0.image_url');
  });

  it('persists empty visible reasoning and replays ordered encrypted items after an actual transcript decode', () => {
    // The response may name a dated canonical model while the request uses an alias.
    const completion = endpointShape('openai-responses').readBody({ status: 'completed', model: 'm-2026-10-19', output });
    const step = toStep(completion, {});
    expect(step.reasoning?.text).toBe(''); expect(step.reasoning?.signature).toContain('opaque-ciphertext');
    const message = { role: 'assistant' as const, content: step.text, reasoning: step.reasoning,
      origin: { provider: 'openai', model: 'm', replayBinding: turn.replayBinding }, tool_calls: step.toolCalls.map(call => ({ id: call.id, type: 'function' as const,
        function: { name: call.name, arguments: JSON.stringify(call.args) } })), timestamp: '2026-10-19T00:00:00Z' };
    const decoded = transcriptEventToSessionMessage(decodeTranscriptLine(JSON.stringify(createMessageTranscriptEvent(message))));
    expect(decoded).toBeDefined();
    const body = endpointTurnBody('openai-responses', { ...turn, messages: toChatMessages([decoded!]) });
    expect((body.input as unknown[]).slice(0, 3)).toEqual(output);
    expect((body.input as Record<string, unknown>[])[3]).toMatchObject({ type: 'function_call_output', call_id: 'call_1' });
  });

  it('persists native raw reasoning and replays the unchanged provider output after transcript decode', () => {
    const native = [{ ...output[0], content: [{ type: 'reasoning_text', text: 'Inspect raw inputs.' },
      { type: 'reasoning_text', text: 'Then read the file.' }] }, ...output.slice(1)];
    const completion = endpointShape('openai-responses').readBody({ status: 'completed', model: 'm', output: native });
    const step = toStep(completion, {});
    expect(step.reasoning?.text).toBe('Inspect raw inputs.\nThen read the file.');
    const message = { role: 'assistant' as const, content: step.text, reasoning: step.reasoning,
      origin: { provider: 'openai', model: 'm', replayBinding: turn.replayBinding },
      tool_calls: step.toolCalls.map(call => ({ id: call.id, type: 'function' as const,
        function: { name: call.name, arguments: JSON.stringify(call.args) } })), timestamp: '2026-10-29T00:00:00Z' };
    const decoded = transcriptEventToSessionMessage(decodeTranscriptLine(JSON.stringify(createMessageTranscriptEvent(message))));
    expect(decoded?.reasoning?.text).toBe(step.reasoning?.text);
    const body = endpointTurnBody('openai-responses', { ...turn, messages: toChatMessages([decoded!]) });
    expect((body.input as unknown[]).slice(0, 3)).toEqual(native);
  });

  it('chooses native summary over raw reasoning without concatenating two representations', () => {
    const native = [{ ...output[0], summary: [{ type: 'summary_text', text: 'Summary' }],
      content: [{ type: 'reasoning_text', text: 'Raw trace' }] }];
    expect(endpointShape('openai-responses').readBody({ status: 'completed', model: 'm', output: native }).reasoning).toBe('Summary');
  });

  it.each([{ content: null }, { content: {} }, { content: [{ type: 'output_text', text: 'wrong type' }] },
    { content: [{ type: 'reasoning_text', text: 1 }] }])('rejects malformed native reasoning content %j', ({ content }) => {
    const completion = endpointShape('openai-responses').readBody({ status: 'completed', model: 'm',
      output: [{ ...output[0], content }, ...output.slice(1)] });
    expect(completion.choices?.[0]?.finish_reason).toBe('error');
    expect(completion.choices?.[0]?.message?.tool_calls).toBeUndefined();
    expect(completion.reasoningSignature).toBeUndefined();
  });

  it.each(['model', 'provider', 'content', 'args', 'signature', 'binding', 'legacy'])('rebuilds foreign or changed %s history without opaque items', changed => {
    const completion = endpointShape('openai-responses').readBody({ status: 'completed', model: 'm', output });
    const messages = [{ role: 'assistant' as const, content: changed === 'content' ? 'changed' : 'Inspecting',
      reasoning: { text: '', signature: changed === 'signature' ? 'malformed' : completion.reasoningSignature },
      origin: { provider: changed === 'provider' ? 'other' : 'openai', model: changed === 'model' ? 'other' : 'm',
        replayBinding: changed === 'legacy' ? undefined : changed === 'binding' ? 'b'.repeat(64) : turn.replayBinding },
      tool_calls: [{ id: 'call_1', type: 'function' as const, function: { name: 'read', arguments: changed === 'args' ? '{"path":"b"}' : '{"path":"a"}' } }] }];
    const body = endpointTurnBody('openai-responses', { ...turn, messages });
    expect(JSON.stringify(body)).not.toContain('opaque-ciphertext');
    expect(body.input).toContainEqual({ type: 'function_call', call_id: 'call_1', name: 'read', arguments: messages[0]!.tool_calls[0]!.function.arguments });
  });
});
