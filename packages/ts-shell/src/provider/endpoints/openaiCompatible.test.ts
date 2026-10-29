import { expect, it } from 'vitest';
import { createStepFunction, toStep } from '../../turn/step.js';
import { resetSessionUsage } from '../../observability/usageTelemetry.js';
import { createMessageTranscriptEvent, decodeTranscriptLine, transcriptEventToSessionMessage } from '../../session/sessionEventCodec.js';
import { endpointBody, endpointShape, endpointTurnBody } from './index.js';
import { toChatMessages } from '../../turn/prompt.js';
import { requestReplayBinding } from '../request/replay.js';
import { requestSimpleCompletion } from '../request/completion.js';
import { resolveRequestShape } from '../../core/models/requestShape.js';

it.each([false, true])('budgets the actual public replay text before sending (declared=%s)', async declared => {
  const sessionId = `public-replay-budget-${declared}`;
  const target = { provider: 'fixture', model: 'm', baseUrl: 'https://fixture.invalid/v1', endpoint: 'openai-compatible', headers: {} };
  let calls = 0;
  const step = createStepFunction({ provider: target, workspaceRoot: process.cwd(), sessionId, systemPrompt: 'brief',
    maxOutputTokens: 100, reserveTokens: 0, tools: [], catalog: [{ id: 'fixture', runtime: 'openai', baseUrl: target.baseUrl,
      models: [{ id: 'm', contextWindow: 10_000, maxTokens: 100,
        ...(declared ? { compat: { reasoningReplayField: 'reasoning_content' as const } } : {}) }] }],
    fetchImpl: async () => { calls++; return Response.json({ choices: [{ message: { content: 'Answer' }, finish_reason: 'stop' }] }); } });
  try {
    const result = await step([{ role: 'assistant', content: 'Prior answer', reasoning: { text: 'a'.repeat(40_000) },
      origin: { provider: target.provider, model: target.model, replayBinding: requestReplayBinding(target) } },
    { role: 'user', content: 'continue' }], undefined, {}, { allowTools: false });
    if (declared) {
      expect(result.stopReason).toBe('error'); expect(result.errorMessage).toContain('does not fit'); expect(calls).toBe(0);
    } else { expect(result.text).toBe('Answer'); expect(calls).toBe(1); }
  } finally { resetSessionUsage(sessionId); }
});

it.each(['reasoning_content', 'reasoning', 'reasoning_text'] as const)(
  'replays declared public %s with exact request ownership in simple and turn bodies', field => {
    const binding = 'a'.repeat(64);
    const messages = toChatMessages([{ role: 'assistant', content: 'Inspecting', reasoning: { text: ' Public\nreasoning ' },
      origin: { provider: 'fixture', model: 'm', replayBinding: binding },
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read', arguments: '{ "path": "a" }' } }] },
    { role: 'tool', tool_call_id: 'call_1', content: 'Result' }]);
    const before = JSON.stringify(messages);
    const request = { provider: 'fixture', model: 'm', replayBinding: binding, reasoningReplayField: field, messages, systemPrompt: 'brief' };
    const simple = endpointBody('openai-compatible', request);
    const turn = endpointTurnBody('openai-compatible', { ...request, tools: [], allowTools: false, vision: false,
      temperature: 0.2, systemRole: 'system', reasoningEffort: false, maxTokensField: 'max_tokens', assistantAfterToolResult: false });
    expect(simple.messages).toEqual(turn.messages);
    expect((turn.messages as Record<string, unknown>[])[1]).toEqual({ role: 'assistant', content: 'Inspecting',
      [field]: ' Public\nreasoning ', tool_calls: messages[0]?.tool_calls });
    expect(JSON.stringify(messages)).toBe(before);
    expect((turn.messages as Record<string, unknown>[])[2]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: 'Result' });
  });

it.each([
  'undeclared', 'invalid field', 'different provider', 'different model', 'different binding', 'missing origin',
  'missing binding', 'signature', 'empty signature', 'redacted', 'empty',
])('omits incompatible public replay: %s', mismatch => {
  const binding = 'a'.repeat(64);
  const message = { role: 'assistant' as const, content: 'Answer', reasoning: { text: 'Public',
    ...(mismatch === 'signature' ? { signature: 'OPAQUE_FIXTURE' } : {}),
    ...(mismatch === 'empty signature' ? { signature: '' } : {}),
    ...(mismatch === 'redacted' ? { redacted: true } : {}), ...(mismatch === 'empty' ? { text: '' } : {}) },
    ...(mismatch === 'missing origin' ? {} : { origin: { provider: mismatch === 'different provider' ? 'other' : 'fixture',
      model: mismatch === 'different model' ? 'other' : 'm',
      ...(mismatch === 'missing binding' ? {} : { replayBinding: mismatch === 'different binding' ? 'b'.repeat(64) : binding }) } }) };
  const body = endpointBody('openai-compatible', { provider: 'fixture', model: 'm', replayBinding: binding,
    ...(mismatch === 'undeclared' ? {} : { reasoningReplayField: mismatch === 'invalid field' ? 'signature' as never : 'reasoning_content' }),
    messages: [message] });
  expect(body.messages).toEqual([{ role: 'assistant', content: 'Answer' }]);
  expect(JSON.stringify(body)).not.toContain('OPAQUE_FIXTURE');
});

it.each(['json', 'sse'] as const)('round-trips public reasoning through transcript into the next %s tool request', async mode => {
  const sessionId = `public-replay-${mode}`;
  const target = { provider: 'fixture', model: 'm', baseUrl: 'https://fixture.invalid/v1',
    endpoint: 'openai-compatible', headers: {} };
  const catalog = [{ id: 'fixture', runtime: 'openai', baseUrl: target.baseUrl,
    models: [{ id: 'm', compat: { reasoningReplayField: 'reasoning_content' as const } }] }];
  const calls = [{ id: 'call_1', type: 'function', function: { name: 'read', arguments: '{ "path": "a" }' } }];
  const requests: Record<string, unknown>[] = [];
  const step = createStepFunction({ provider: target, catalog, workspaceRoot: process.cwd(), sessionId, systemPrompt: 'brief',
    tools: [{ type: 'function', function: { name: 'read', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }],
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      if (mode === 'sse' && requests.length === 1) {
        const events = [
          { choices: [{ delta: { reasoning_text: 'Public reasoning' } }] },
          { choices: [{ delta: { content: 'Inspecting', tool_calls: calls.map(call => ({ ...call, index: 0 })) }, finish_reason: 'tool_calls' }] },
        ];
        return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n',
          { headers: { 'content-type': 'text/event-stream' } });
      }
      return Response.json({ choices: [{ message: requests.length === 1
        ? { content: 'Inspecting', reasoning_text: 'Public reasoning', tool_calls: calls }
        : { content: 'Answer' }, finish_reason: requests.length === 1 ? 'tool_calls' : 'stop' }] });
    } });
  try {
    const first = await step([{ role: 'user', content: 'question' }], undefined, {}, { allowTools: true });
    expect(first.origin?.replayBinding).toBe(requestReplayBinding(target));
    expect(first.reasoning).toEqual({ text: 'Public reasoning' });
    const restored = transcriptEventToSessionMessage(decodeTranscriptLine(JSON.stringify(createMessageTranscriptEvent({
      role: 'assistant', content: first.text, reasoning: first.reasoning, origin: first.origin, tool_calls: calls,
      timestamp: '2026-10-30T00:00:00Z',
    }))))!;
    const history = toChatMessages([{ role: 'user', content: 'question' }, restored,
      { role: 'tool', tool_call_id: 'call_1', content: 'Result' }]);
    expect((await step(history, undefined, {}, { allowTools: true })).text).toBe('Answer');
    expect((requests[1]?.messages as Record<string, unknown>[])[2]).toEqual({ role: 'assistant', content: 'Inspecting',
      tool_calls: calls, reasoning_content: 'Public reasoning' });
    expect(requests[1]?.tools).toHaveLength(1);
    expect(JSON.stringify(requests[1])).not.toContain('replayBinding');
    const closingBody = endpointTurnBody(target.endpoint, { provider: target.provider, model: target.model,
      replayBinding: first.origin?.replayBinding, reasoningReplayField: 'reasoning_content', messages: history,
      systemPrompt: 'brief', tools: [], allowTools: false, vision: false, temperature: 0.2,
      systemRole: 'system', reasoningEffort: false, maxTokensField: 'max_tokens', assistantAfterToolResult: false });
    expect((closingBody.messages as Record<string, unknown>[])[2]?.reasoning_content).toBe('Public reasoning');
    expect(closingBody.tools).toBeUndefined();
    let simpleBody: Record<string, unknown> | undefined;
    expect(await requestSimpleCompletion({ provider: { ...target, providerId: target.provider, fetchImpl: async (_url, init) => {
      simpleBody = JSON.parse(String(init?.body)); return Response.json({ choices: [{ message: { content: 'Summary' } }] });
    } }, shape: resolveRequestShape(catalog, target.provider, target.model, undefined, target.baseUrl), messages: history })).toBe('Summary');
    expect((simpleBody?.messages as Record<string, unknown>[])[1]).toEqual((requests[1]?.messages as Record<string, unknown>[])[2]);
    const changed = createStepFunction({ provider: { ...target, headers: { Authorization: 'Bearer synthetic-rotated' } },
      catalog, workspaceRoot: process.cwd(), sessionId, systemPrompt: 'brief', tools: [],
      fetchImpl: async (_url, init) => {
        const messages = JSON.parse(String(init?.body)).messages;
        expect(messages[2]).toEqual({ role: 'assistant', content: 'Inspecting', tool_calls: calls });
        return Response.json({ choices: [{ message: { content: 'Changed target' }, finish_reason: 'stop' }] });
      } });
    expect((await changed(history, undefined, {}, { allowTools: false })).text).toBe('Changed target');
  } finally { resetSessionUsage(sessionId); }
});

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
