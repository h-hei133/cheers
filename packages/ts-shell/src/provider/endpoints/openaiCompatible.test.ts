import { expect, it } from 'vitest';
import { createStepFunction, toStep } from '../../turn/step.js';
import { resetSessionUsage } from '../../observability/usageTelemetry.js';
import { createMessageTranscriptEvent, decodeTranscriptLine, transcriptEventToSessionMessage } from '../../session/sessionEventCodec.js';
import { endpointBody, endpointShape, endpointTurnBody } from './index.js';
import { toChatMessages } from '../../turn/prompt.js';

it.each(['reasoning_content', 'reasoning', 'reasoning_text'] as const)(
  'retains and displays JSON %s when a compatible host ignores streaming', async field => {
    const sessionId = `json-thinking-${field}`;
    const shown: string[] = [];
    const requests: Record<string, unknown>[] = [];
    const step = createStepFunction({ provider: { provider: 'json-fixture', model: 'm',
      baseUrl: 'https://fixture.invalid/v1', endpoint: 'openai-compatible', headers: {} },
      catalog: [{ id: 'json-fixture', models: [{ id: 'm', reasoning: false }] }],
      workspaceRoot: process.cwd(), sessionId, systemPrompt: 'brief', tools: [],
      fetchImpl: async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ choices: [{ message: {
          role: 'assistant', content: 'Answer', [field]: 'Public reasoning',
        }, finish_reason: 'stop' }], usage: { prompt_tokens: 4, completion_tokens: 2 } }),
        { headers: { 'content-type': 'application/json' } });
      },
    });
    try {
      const result = await step([{ role: 'user', content: 'question' }], undefined, {
        onReasoning: text => shown.push(`thinking:${text}`), onText: text => shown.push(`text:${text}`),
      }, { allowTools: false });
      expect(result).toMatchObject({ text: 'Answer', stopReason: 'stop', reasoning: { text: 'Public reasoning' } });
      expect(shown).toEqual(['thinking:Public reasoning', 'text:Answer']);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({ stream: true });
      expect(requests[0]).not.toHaveProperty('reasoning_effort');
      const decoded = transcriptEventToSessionMessage(decodeTranscriptLine(JSON.stringify(createMessageTranscriptEvent({
        role: 'assistant', content: result.text, reasoning: result.reasoning, timestamp: '2026-10-30T00:00:00Z',
      }))));
      expect(decoded?.reasoning).toEqual({ text: 'Public reasoning' });
      expect(decoded?.content).toBe('Answer');
    } finally { resetSessionUsage(sessionId); }
  });

it('selects the first nonempty reasoning field from the selected JSON choice without duplication', () => {
  const read = endpointShape('openai-compatible').readBody({ choices: [{ message: {
    content: 'Answer', reasoning_content: '', reasoning: 'Once', reasoning_text: 'Once',
  }, finish_reason: 'stop' }, { message: { content: 'Other', reasoning_content: 'Other reasoning' } }] });
  expect(read.reasoning).toBe('Once');
  const shown: string[] = [];
  expect(toStep(read, { onReasoning: text => shown.push(text) }).reasoning).toEqual({ text: 'Once' });
  expect(shown).toEqual(['Once']);
});

it('keeps normalized reasoning and explicit refusal when reading JSON', () => {
  const read = endpointShape('openai-compatible').readBody({ reasoning: 'Normalized', choices: [{
    message: { content: 'Refused', reasoning_content: 'Wire fallback', refusal: 'Cannot answer' }, finish_reason: 'stop',
  }] });
  expect(read.reasoning).toBe('Normalized');
  expect(read.choices?.[0]?.finish_reason).toBe('refusal');
  const shown: string[] = [];
  expect(toStep(read, { onReasoning: text => shown.push(text) }).stopReason).toBe('error');
  expect(shown).toEqual(['Normalized']);
});

it.each([undefined, null, 42, {}, []])('keeps ordinary answers without inventing reasoning from %j', value => {
  const read = endpointShape('openai-compatible').readBody({ choices: [{ message: {
    content: 'Answer', reasoning_content: value, reasoning: value, reasoning_text: value,
  }, finish_reason: 'stop' }] });
  const shown: string[] = [];
  expect(toStep(read, { onReasoning: text => shown.push(text) })).toMatchObject({ text: 'Answer', stopReason: 'stop' });
  expect(read.reasoning).toBeUndefined();
  expect(shown).toEqual([]);
});

it('retains reasoning-only JSON as an unanswered result', () => {
  const shown: string[] = [];
  const read = endpointShape('openai-compatible').readBody({ choices: [{ message: {
    content: '', reasoning_content: 'Public reasoning',
  }, finish_reason: 'stop' }] });
  const result = toStep(read, { onReasoning: text => shown.push(text) });
  expect(result).toMatchObject({ text: '', reasoning: { text: 'Public reasoning' }, errorMessage: expect.any(String) });
  expect(shown).toEqual(['Public reasoning']);
});

it.each([false, true])('does not redisplay streamed or withheld reasoning (redacted=%s)', redacted => {
  const shown: string[] = [];
  toStep({ choices: [{ message: { content: 'Answer' }, finish_reason: 'stop' }],
    reasoning: 'Already delivered or withheld', ...(redacted ? { reasoningRedacted: true } : { streamed: 'Answer' }),
  }, { onReasoning: text => shown.push(text) });
  expect(shown).toEqual([]);
});

it('displays actual SSE reasoning once while retaining the same final message', async () => {
  const sessionId = 'sse-thinking-parity';
  const shown: string[] = [];
  const events = [{ reasoning_content: 'Public reasoning' }, { content: 'Answer' }]
    .map(delta => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`).join('')
    + `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 2 } })}\n\ndata: [DONE]\n\n`;
  const step = createStepFunction({ provider: { provider: 'json-fixture', model: 'm',
    baseUrl: 'https://fixture.invalid/v1', endpoint: 'openai-compatible', headers: {} },
    workspaceRoot: process.cwd(), sessionId, systemPrompt: 'brief', tools: [],
    fetchImpl: async () => new Response(events, { headers: { 'content-type': 'text/event-stream' } }),
  });
  try {
    expect(await step([{ role: 'user', content: 'question' }], undefined, {
      onReasoning: text => shown.push(`thinking:${text}`), onText: text => shown.push(`text:${text}`),
    }, { allowTools: false })).toMatchObject({ text: 'Answer', stopReason: 'stop', reasoning: { text: 'Public reasoning' } });
    expect(shown).toEqual(['thinking:Public reasoning', 'text:Answer']);
  } finally { resetSessionUsage(sessionId); }
});

it.each(['simple', 'turn'] as const)('projects protocol fields without internal reasoning or origin in %s requests', mode => {
  const messages = toChatMessages([
    { role: 'user', content: 'question' },
    { role: 'assistant', content: 'Inspecting', reasoning: { text: 'Public reasoning', signature: 'OPAQUE_FIXTURE' },
      origin: { provider: 'fixture', model: 'm', replayBinding: 'binding' },
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read', arguments: '{ "path": "a" }' } }] },
    { role: 'tool', tool_call_id: 'call_1', content: 'Result' },
  ]);
  const before = JSON.stringify(messages);
  const request = { model: 'm', systemPrompt: 'brief', messages };
  const body = mode === 'simple' ? endpointBody('openai-compatible', request)
    : endpointTurnBody('openai-compatible', { ...request, tools: [], allowTools: false, vision: false,
      temperature: 0.2, systemRole: 'system', reasoningEffort: false, maxTokensField: 'max_tokens', assistantAfterToolResult: false });
  expect(body.messages).toEqual([
    { role: 'system', content: 'brief' }, { role: 'user', content: 'question' },
    { role: 'assistant', content: 'Inspecting', tool_calls: [{ id: 'call_1', type: 'function',
      function: { name: 'read', arguments: '{ "path": "a" }' } }] },
    { role: 'tool', tool_call_id: 'call_1', content: 'Result' },
  ]);
  expect(JSON.stringify(messages)).toBe(before);
  expect(messages[1]?.reasoning?.signature).toBe('OPAQUE_FIXTURE');
});

it('sends protocol history fields at the actual compatible request boundary', async () => {
  const sessionId = 'compatible-history-fields';
  let body: Record<string, unknown> | undefined;
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'm',
    baseUrl: 'https://fixture.invalid/v1', endpoint: 'openai-compatible', headers: {} },
    workspaceRoot: process.cwd(), sessionId, systemPrompt: 'brief', tools: [],
    fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Answer' }, finish_reason: 'stop' }] }),
        { headers: { 'content-type': 'application/json' } });
    },
  });
  try {
    const result = await step([{ role: 'user', content: 'question' }, { role: 'assistant', content: 'Prior answer',
      reasoning: { text: 'Public reasoning', signature: 'OPAQUE_FIXTURE' }, origin: { provider: 'fixture', model: 'm' } },
    { role: 'user', content: 'continue' }], undefined, {}, { allowTools: false });
    expect(result).toMatchObject({ text: 'Answer', stopReason: 'stop' });
    expect(body?.messages).toEqual([{ role: 'system', content: 'brief' }, { role: 'user', content: 'question' },
      { role: 'assistant', content: 'Prior answer' }, { role: 'user', content: 'continue' }]);
  } finally { resetSessionUsage(sessionId); }
});
