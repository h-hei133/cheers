import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { AgentCore } from '../../core/agent/agent.js';
import type { AgentMessage } from '../../core/agent/state.js';
import { isDurableQueryEvent, type QueryEvent } from '../../core/query/runtime/events.js';
import { resetSessionUsage } from '../../observability/usageTelemetry.js';
import { createTurnRequest } from '../../turn/request.js';
import { createStepFunction, type StepFunction } from '../../turn/step.js';
import { TurnProjection } from '../../turn/projection.js';
import { EventChannel } from '../../turn/stream.js';
import { toRpcEvent } from './events.js';

it('projects a public reasoning replacement and an explicit empty replacement for legacy producers', () => {
  expect(toRpcEvent({ type: 'reasoning.replace', role: 'coder', text: 'Validated summary' })).toEqual({
    type: 'message_update', channel: 'reasoning', text: 'Validated summary',
    message: { role: 'coder', reasoning: { text: 'Validated summary' } },
  });
  expect(toRpcEvent({ type: 'reasoning.replace', role: 'coder', text: '' })).toEqual({
    type: 'message_update', channel: 'reasoning', text: '', message: { role: 'coder', reasoning: { text: '' } },
  });
});

it('preserves an explicit empty reasoning replacement from the canonical turn producer', async () => {
  const channel = new EventChannel<QueryEvent>();
  const projection = new TurnProjection();
  const frames: Record<string, unknown>[] = [];
  const reading = (async () => {
    for await (const event of channel) {
      const frame = toRpcEvent(event);
      if (frame) frames.push(frame);
    }
  })();
  // The supported injected step may explicitly clear public reasoning.
  const step: StepFunction = async (_messages, _signal, listener) => {
    listener.onReasoning?.('old');
    listener.onText?.('answer');
    listener.onReasoningReplace?.('');
    return { text: 'answer', toolCalls: [], stopReason: 'stop' };
  };
  const core = new AgentCore({ streamStep: createTurnRequest({ step, sessionId: 'canonical-clear', maxSteps: 3 },
    projection, channel) });
  core.subscribe(event => { for (const projected of projection.project(event)) channel.push(projected); });
  try {
    await core.prompt({ role: 'user', content: 'Return the current public reasoning.' });
  } finally {
    channel.close();
    await reading;
  }
  expect(frames).toContainEqual({ type: 'message_update', channel: 'reasoning', text: '',
    message: { role: 'coder', content: 'answer', reasoning: { text: '' } } });
  expect(frames.filter(frame => frame.type === 'message_end')).toHaveLength(1);
  expect(core.state.messages.at(-1)).toMatchObject({ content: 'answer', stopReason: 'stop' });
});

it('starts an injected budget closing response with its own public stream capture', async () => {
  const channel = new EventChannel<QueryEvent>();
  const projection = new TurnProjection();
  const frames: Record<string, unknown>[] = [];
  const reading = (async () => {
    for await (const event of channel) {
      const frame = toRpcEvent(event);
      if (frame) frames.push(frame);
    }
  })();
  let calls = 0;
  let closingLive: AgentMessage | undefined;
  // Native admission exhausts before callbacks; an injected step can emit first.
  const step: StepFunction = async (_messages, _signal, listener, options) => {
    if (++calls === 1) {
      listener.onText?.('working');
      listener.onReasoning?.('old reasoning');
      return { text: 'working', reasoning: { text: 'old reasoning' }, toolCalls: [], stopReason: 'error',
        admissionFailure: 'exhausted', retriesExhausted: true };
    }
    expect(options.allowTools).toBe(false);
    expect(options.requestPurpose).toBe('goal-budget-summary');
    listener.onText?.('summary');
    return { text: 'summary', toolCalls: [], stopReason: 'stop' };
  };
  const core = new AgentCore({ streamStep: createTurnRequest({ step, sessionId: 'injected-closing', maxSteps: 3,
    claimBudgetSummary: () => true }, projection, channel) });
  core.subscribe(event => {
    for (const projected of projection.project(event)) channel.push(projected);
    if (event.type === 'message_update' && event.delta === 'summary') closingLive = core.state.streamingMessage;
  });
  try {
    await core.prompt({ role: 'user', content: 'Summarize when the budget is exhausted.' });
  } finally {
    channel.close();
    await reading;
  }
  expect(calls).toBe(2);
  expect(frames.find(frame => frame.delta === 'summary')).toEqual({ type: 'message_update', delta: 'summary',
    message: { role: 'coder', content: 'summary' } });
  expect(closingLive).toEqual({ role: 'assistant', content: 'summary' });
  expect(frames.filter(frame => frame.type === 'message_start')).toHaveLength(1);
  expect(frames.filter(frame => frame.type === 'message_end')).toHaveLength(1);
  expect(core.state.messages.at(-1)).toMatchObject({ content: 'summary', stopReason: 'error' });
  expect(core.state.messages.at(-1)?.reasoning).toBeUndefined();
  expect(core.state.streamingMessage).toBeUndefined();
});

it('delivers cumulative public partials and validated replacement through the real turn producer before one message end', async () => {
  const directory = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(directory, { recursive: true });
  const workspace = fs.mkdtempSync(path.join(directory, 'rpc-stream-'));
  fs.mkdirSync(path.join(workspace, '.agents'));
  const sessionId = path.basename(workspace);
  resetSessionUsage(sessionId);
  const channel = new EventChannel<QueryEvent>();
  const projection = new TurnProjection();
  const frames: Record<string, unknown>[] = [];
  const events: QueryEvent[] = [];
  let resolvePartial!: () => void, resolveSnapshot!: () => void;
  const partial = new Promise<void>(resolve => { resolvePartial = resolve; });
  const snapshot = new Promise<void>(resolve => { resolveSnapshot = resolve; });
  const reading = (async () => {
    for await (const event of channel) {
      events.push(event);
      const frame = toRpcEvent(event);
      if (frame) frames.push(frame);
      if (frame?.type === 'message_update' && frame.delta === 'lo') resolvePartial();
    }
  })();
  const reasoning = { type: 'reasoning', id: 'rs_public', summary: [{ type: 'summary_text', text: 'Public summary' }],
    content: [{ type: 'reasoning_text', text: 'Public raw' }], encrypted_content: 'OPAQUE_REPLAY_CANARY' };
  const answer = { type: 'message', id: 'msg_public', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text: 'hello', annotations: [] }] };
  const initial = [
    { type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning', id: reasoning.id, summary: [] } },
    { type: 'response.reasoning_text.delta', output_index: 0, content_index: 0, item_id: reasoning.id, delta: 'Public raw' },
    { type: 'response.reasoning_summary_text.delta', output_index: 0, summary_index: 0, item_id: reasoning.id, delta: 'Public summary' },
    { type: 'response.output_item.added', output_index: 1, item: { ...answer, content: [] } },
    { type: 'response.output_text.delta', output_index: 1, content_index: 0, item_id: answer.id, delta: 'hel' },
    { type: 'response.output_text.delta', output_index: 1, content_index: 0, item_id: answer.id, delta: 'lo' },
  ];
  let body!: ReadableStreamDefaultController<Uint8Array>;
  let calls = 0;
  const step = createStepFunction({
    provider: { provider: 'fixture', model: 'fixture', endpoint: 'openai-responses', baseUrl: 'https://fixture.invalid/v1' },
    workspaceRoot: workspace, sessionId, systemPrompt: 'be brief', tools: [],
    fetchImpl: async () => {
      if (++calls > 1) return Response.json({ id: 'resp_next', model: 'fixture', status: 'completed', output: [{ ...answer,
        id: 'msg_next', content: [{ type: 'output_text', text: 'next', annotations: [] }] }] });
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        body = controller;
        controller.enqueue(new TextEncoder().encode(initial.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')));
      } }), { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  const core = new AgentCore({ streamStep: createTurnRequest({ step, sessionId, maxSteps: 3 }, projection, channel) });
  core.subscribe(event => {
    for (const projected of projection.project(event)) channel.push(projected);
    if (event.type === 'message_update' && event.message.content === 'hello') resolveSnapshot();
  });
  const running = core.prompt({ role: 'user', content: 'Stream the answer.' });
  let completed = false;
  try {
    await Promise.race([Promise.all([partial, snapshot]), running.then(() => { throw new Error('Stream settled before its live partial.'); })]);
    expect(core.state.streamingMessage).toMatchObject({ role: 'assistant', content: 'hello',
      reasoning: { text: 'Public rawPublic summary' } });
    expect(frames.filter(frame => frame.type === 'message_start')).toHaveLength(1);
    expect(frames.some(frame => frame.type === 'message_end')).toBe(false);
    expect(frames.find(frame => frame.delta === 'Public summary')).toEqual({ type: 'message_update', channel: 'reasoning', delta: 'Public summary',
      message: { role: 'coder', content: '', reasoning: { text: 'Public rawPublic summary' } } });
    expect(frames.find(frame => frame.delta === 'lo')).toEqual({ type: 'message_update', delta: 'lo',
      message: { role: 'coder', content: 'hello', reasoning: { text: 'Public rawPublic summary' } } });
    body.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'response.completed',
      response: { id: 'resp_public', model: 'fixture', status: 'completed', output: [reasoning, answer] } })}\n\n`));
    body.close();
    completed = true;
    await running;
    await Promise.resolve();
    expect(frames).toContainEqual({ type: 'message_update', channel: 'reasoning', text: 'Public summary',
      message: { role: 'coder', content: 'hello', reasoning: { text: 'Public summary' } } });
    expect(frames.filter(frame => frame.type === 'message_end')).toEqual([{ type: 'message_end', message: { role: 'coder' } }]);
    expect(core.state.streamingMessage).toBeUndefined();
    expect(core.state.messages.at(-1)).toMatchObject({ content: 'hello', reasoning: { text: 'Public summary' }, stopReason: 'stop' });
    expect(events.filter(event => event.type === 'message.delta' || event.type.startsWith('reasoning.')).every(event => !isDurableQueryEvent(event))).toBe(true);
    expect(JSON.stringify(frames)).not.toContain('OPAQUE_REPLAY_CANARY');

    await core.prompt({ role: 'user', content: 'Another answer.' });
    await Promise.resolve();
    expect(frames.at(-2)).toEqual({ type: 'message_update', delta: 'next', message: { role: 'coder', content: 'next' } });
    expect(frames.filter(frame => frame.type === 'message_end')).toHaveLength(2);
    expect(calls).toBe(2);
  } finally {
    if (!completed) { core.abort(); if (body) body.error(new Error('Fixture retired.')); }
    await running;
    channel.close();
    await reading;
    resetSessionUsage(sessionId);
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
