import { describe, expect, it, vi } from "vitest";
import type { HookDispatcher } from "../core/hooks/hookDispatcher.js";
import type { QueryEvent } from "../core/query/runtime/events.js";
import type { SessionMessage } from "../session/schema/sessionMessage.js";
import type { ToolDefinition } from "../tools/types.js";
import { createTaskToolDefinition } from "../core/tools/taskTool.js";
import { requestPurposeFor, runTurn, type TurnOptions } from "./session.js";
import type { StepFunction } from "./step.js";
import { CONTEXT_OVERFLOW_PREFIX, createStepFunction } from "./step.js";
import { getSessionUsage, markContextUnknown, persistSessionUsage, recordSessionUsage, resetSessionUsage } from "../observability/usageTelemetry.js";
import { requestContext } from '../context/request/projection.js';
import { TurnSink } from '../cli/interactive/turnSink.js';
import { restoreConversation } from '../cli/interactive/history.js';
import { Transcript } from '../presentation/tui/transcript/container.js';

/**
 * The turn is where the kernel's lifecycle meets the shell's contract. These
 * tests hold that seam: what is persisted and when, how a run reports its
 * end, what an interruption leaves behind, and how input typed mid-run lands.
 */

const quietHooks = { dispatch: async () => ({ decision: "allow" as const }) } as unknown as HookDispatcher;

it.each(['compatible-eof', 'responses-failed', 'responses-eof'] as const)(
  'preserves only already displayed public reasoning after %s without granting replay', async failure => {
    const sessionId = `partial-thinking-${failure}`;
    const endpoint = failure === 'compatible-eof' ? 'openai-compatible' : 'openai-responses';
    const events = endpoint === 'openai-compatible'
      ? [{ choices: [{ delta: { reasoning_content: 'Displayed prefix' } }] }]
      : [{ type: 'response.output_item.added', output_index: 0, item: { id: 'rs_partial', type: 'reasoning', summary: [] } },
        { type: 'response.reasoning_summary_text.delta', output_index: 0, item_id: 'rs_partial', summary_index: 0, delta: 'Displayed prefix' },
        ...(failure === 'responses-failed' ? [{ type: 'response.failed', response: { id: 'resp_partial', status: 'failed', model: 'm',
          output: [{ id: 'rs_partial', type: 'reasoning', summary: [{ type: 'summary_text', text: 'Unverified terminal text' }],
            encrypted_content: 'synthetic-unverified-cipher' }] } }] : [])];
    let calls = 0;
    const step = createStepFunction({ provider: { provider: 'fixture', model: 'm', endpoint, baseUrl: 'https://fixture.invalid/v1', headers: {} },
      sessionId, workspaceRoot: process.cwd(), systemPrompt: '', tools: [],
      fetchImpl: async () => { calls++; return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
        { headers: { 'content-type': 'text/event-stream' } }); } });
    const setup = options({ sessionId, step });
    try {
      const emitted = await drain(runTurn(setup).events);
      expect(setup.persisted.find(message => message.reasoning)).toMatchObject({ role: 'assistant', content: '',
        reasoning: { text: 'Displayed prefix' }, origin: { provider: 'fixture', model: 'm' } });
      expect(setup.persisted.find(message => message.reasoning)?.reasoning?.signature).toBeUndefined();
      expect(setup.persisted.find(message => message.reasoning)?.origin?.replayBinding).toBeUndefined();
      expect(restoreConversation(setup.persisted).blocks.filter(block => block.kind === 'thinking').map(block => block.text)).toEqual(['Displayed prefix']);
      expect(emitted.some(event => event.type === 'query.failed')).toBe(true);
      expect(emitted.some(event => event.type === 'query.completed')).toBe(false);
      expect(calls).toBe(1);
      expect(JSON.stringify(setup.persisted)).not.toContain('Unverified terminal text');
      expect(JSON.stringify(setup.persisted)).not.toContain('synthetic-unverified-cipher');
    } finally { resetSessionUsage(sessionId); }
  });

it('persists and restores actual reasoning-only output as an unanswered stopped result', async () => {
  const sessionId = 'reasoning-only-storage';
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'm', endpoint: 'openai-compatible',
    baseUrl: 'https://fixture.invalid/v1', headers: {} }, sessionId, workspaceRoot: process.cwd(), systemPrompt: '', tools: [],
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: '', reasoning_content: 'Public reasoning' },
      finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } }) });
  const setup = options({ sessionId, step });
  const transcript = new Transcript();
  const sink = new TurnSink(transcript, () => {});
  sink.begin('turn', 'turn');
  try {
    const events: QueryEvent[] = [];
    for await (const event of runTurn(setup).events) { events.push(event); sink.handleEvent(event); }
    expect(setup.persisted.filter(message => message.role === 'assistant' && message.reasoning)).toEqual([
      expect.objectContaining({ content: '', reasoning: { text: 'Public reasoning' } }),
    ]);
    const restored = restoreConversation(setup.persisted);
    expect(restored.blocks.filter(block => block.kind === 'thinking')).toEqual([
      { kind: 'thinking', text: 'Public reasoning', collapsed: true, finalized: true },
    ]);
    expect(events.find(event => event.type === 'query.completed')).toMatchObject({ result: {
      status: 'stopped_error', terminalClassification: 'stopped', stopReason: expect.stringContaining('never wrote an answer'),
    } });
    expect(events.some(event => event.type === 'query.failed')).toBe(false);
    expect(sink.lastTurnFailed).toBe(true);
    expect(transcript.all().filter(block => block.text.includes('never wrote an answer'))).toHaveLength(1);
    expect(setup.persisted.filter(message => message.role === 'assistant' && message.content)).toHaveLength(1);
  } finally { sink.end(); resetSessionUsage(sessionId); }
});

it.each([
  { text: ' \n\t', keep: false },
  { text: '', signature: 'synthetic-opaque', redacted: true, keep: true },
])('keeps only meaningful reasoning evidence from otherwise empty messages: %j', async ({ keep, ...reasoning }) => {
  const setup = options({ step: scripted([{ text: '', reasoning, toolCalls: [], stopReason: 'stop' }]) });
  await drain(runTurn(setup).events);
  expect(setup.persisted.filter(message => message.reasoning)).toHaveLength(keep ? 1 : 0);
  if (keep) {
    expect(setup.persisted.find(message => message.reasoning)?.reasoning).toEqual(reasoning);
    expect(JSON.stringify(restoreConversation(setup.persisted).blocks)).not.toContain('synthetic-opaque');
  }
});

it.each([
  { stream: false, reasoning: '' }, { stream: true, reasoning: '' },
  { stream: false, reasoning: 'Public reasoning' }, { stream: true, reasoning: 'Public reasoning' },
])('reports an unanswered output limit without diagnosing context overflow: %j', async ({ stream, reasoning }) => {
  const sessionId = `unanswered-length-${stream}-${Boolean(reasoning)}`;
  const body = stream
    ? `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: reasoning }, finish_reason: 'length' }] })}\n\ndata: [DONE]\n\n`
    : JSON.stringify({ choices: [{ message: { content: '', reasoning_content: reasoning }, finish_reason: 'length' }] });
  let calls = 0;
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'm', endpoint: 'openai-compatible',
    baseUrl: 'https://fixture.invalid/v1', headers: {} }, sessionId, workspaceRoot: process.cwd(), systemPrompt: '', tools: [],
    fetchImpl: async () => { calls++; return new Response(body, { headers: { 'content-type': stream ? 'text/event-stream' : 'application/json' } }); } });
  const setup = options({ sessionId, step, maxSteps: 1, retry: { enabled: false } });
  const transcript = new Transcript();
  const sink = new TurnSink(transcript, () => {});
  sink.begin(sessionId, 'question');
  try {
    const events: QueryEvent[] = [];
    for await (const event of runTurn(setup).events) { events.push(event); sink.handleEvent(event); }
    const completed = events.find(event => event.type === 'query.completed');
    expect(completed).toMatchObject({ result: { status: 'stopped_error', terminalClassification: 'stopped',
      stopReason: expect.stringContaining('output limit') } });
    expect(JSON.stringify(completed)).not.toContain('/compact');
    expect(JSON.stringify(completed)).not.toContain('context is probably full');
    expect(JSON.stringify(completed)).toContain('length limit');
    expect(JSON.stringify(completed)).toContain('/settings');
    expect(events.some(event => event.type === 'query.failed')).toBe(false);
    expect(calls).toBe(1);
    expect(sink.lastTurnFailed).toBe(true);
    expect(sink.retryTarget('question', sink.lastTurnFailed)).toBe('question');
    expect(transcript.all().filter(block => block.text.includes('output limit'))).toHaveLength(1);
    expect(restoreConversation(setup.persisted).blocks.filter(block => block.kind === 'thinking').map(block => block.text))
      .toEqual(reasoning ? [reasoning] : []);
  } finally { sink.end(); resetSessionUsage(sessionId); }
});

it('settles terminal reasoning tails before stop hooks finish in the actual response loop', async () => {
  const sessionId = 'responses-final-reasoning-clock';
  const reasoning = { id: 'rs_tail', type: 'reasoning', summary: [{ type: 'summary_text', text: 'Plan more' }] };
  const answer = { id: 'msg_tail', type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text: 'Answer' }] };
  const events = [
    { type: 'response.output_item.added', output_index: 0, item: { ...reasoning, summary: [] } },
    { type: 'response.reasoning_summary_text.delta', output_index: 0, item_id: reasoning.id, summary_index: 0, delta: 'Plan ' },
    { type: 'response.output_item.added', output_index: 1, item: { ...answer, content: [] } },
    { type: 'response.output_text.delta', output_index: 1, item_id: answer.id, content_index: 0, delta: 'Answer' },
    { type: 'response.completed', response: { id: 'resp_tail', model: 'm', status: 'completed', output: [reasoning, answer] } },
  ];
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'm', endpoint: 'openai-responses',
    baseUrl: 'https://fixture.invalid/v1', headers: {} }, sessionId, workspaceRoot: process.cwd(), systemPrompt: '', tools: [],
    fetchImpl: async () => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
      { headers: { 'content-type': 'text/event-stream' } }) });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const dispatch = vi.fn(async (event: { eventName: string }) => {
    if (event.eventName === 'Stop') await held;
    return { decision: 'allow' as const };
  });
  const transcript = new Transcript();
  const sink = new TurnSink(transcript, () => {});
  sink.begin('turn', 'turn');
  const draining = (async () => {
    for await (const event of runTurn(options({ sessionId, step, hooks: { dispatch } as unknown as HookDispatcher })).events) {
      sink.handleEvent(event);
    }
  })();
  try {
    await vi.waitFor(() => expect(dispatch.mock.calls.some(([event]) => event.eventName === 'Stop')).toBe(true));
    const thinking = transcript.all().find(block => block.kind === 'thinking')!;
    expect(thinking.text).toBe('Plan more');
    expect(thinking.finalized).toBe(true);
    expect(sink.activity()?.label).toBe('working');
    const elapsed = thinking.elapsedMs;
    sink.think();
    expect(thinking.elapsedMs).toBe(elapsed);
    expect(transcript.all().find(block => block.kind === 'assistant')?.finalized).toBe(true);
  } finally { release(); await draining; sink.end(); resetSessionUsage(sessionId); }
});

it('keeps verified reasoning in its own model message through the real tool loop and sink', async () => {
  const sessionId = 'responses-display-message-boundary';
  const outputs: Record<string, unknown>[][] = [];
  let calls = 0;
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'm', endpoint: 'openai-responses',
    baseUrl: 'https://fixture.invalid/v1', headers: {} }, sessionId, workspaceRoot: process.cwd(), systemPrompt: '',
    tools: [{ type: 'function', function: { name: 'read', description: 'read', parameters: { type: 'object', properties: {} } } }],
    fetchImpl: async () => {
      const index = calls++;
      const reasoning = { id: `rs_${index}`, type: 'reasoning', summary: [{ type: 'summary_text', text: `Summary ${index}` }],
        content: [{ type: 'reasoning_text', text: `Raw ${index}` }], encrypted_content: `synthetic-cipher-${index}` };
      const result = index === 0 ? { id: 'fc_0', type: 'function_call', call_id: 'read_0', name: 'read', arguments: '{}', status: 'completed' }
        : { id: 'msg_1', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Answer' }] };
      const output = [reasoning, result]; outputs.push(output);
      const events = [
        { type: 'response.output_item.added', output_index: 0, item: { ...reasoning, summary: [], content: [] } },
        { type: 'response.reasoning_text.delta', output_index: 0, item_id: reasoning.id, content_index: 0, delta: `Raw ${index}` },
        { type: 'response.reasoning_summary_text.delta', output_index: 0, item_id: reasoning.id, summary_index: 0, delta: `Summary ${index}` },
        { type: 'response.completed', response: { id: `resp_${index}`, model: 'm', status: 'completed', output } },
      ];
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
        { headers: { 'content-type': 'text/event-stream' } });
    } });
  const transcript = new Transcript();
  const previous = transcript.append({ kind: 'thinking', text: 'Previous reasoning', collapsed: false, finalized: true });
  const sink = new TurnSink(transcript, () => {});
  const setup = options({ sessionId, step, tools: new Map([['read', echoTool('read', 'read result')]]) });
  const events: QueryEvent[] = [];
  sink.begin('turn', 'turn');
  try {
    for await (const event of runTurn(setup).events) { events.push(event); sink.handleEvent(event); }
    sink.end();
    expect({ calls, failed: events.filter(event => event.type === 'query.failed') }).toEqual({ calls: 2, failed: [] });
    expect(transcript.all().filter(block => block.kind === 'thinking').map(block => block.text)).toEqual([
      'Previous reasoning', 'Summary 0', 'Summary 1',
    ]);
    expect(events.filter(event => event.type === 'message.started')).toHaveLength(2);
    expect(previous.collapsed).toBe(false);
    expect(transcript.all().map(block => block.kind)).toEqual(['thinking', 'thinking', 'tool', 'thinking', 'assistant']);
    expect(JSON.stringify(transcript.all())).not.toContain('synthetic-cipher');
    const assistants = setup.persisted.filter(message => message.role === 'assistant');
    expect(assistants.map(message => message.reasoning?.text)).toEqual(['Summary 0', 'Summary 1']);
    expect(assistants.map(message => JSON.parse(message.reasoning!.signature!).output)).toEqual(outputs);
  } finally { sink.end(); resetSessionUsage(sessionId); }
});

it("carries registered MCP hints into the turn's plan gate", async () => {
  const execute = vi.fn(async () => ({ success: true, output: "found note" }));
  const setup = options({ agentMode: "plan", tools: new Map([["notes__lookup", {
    ...echoTool("notes__lookup", "found note"), mcpAnnotations: { readOnlyHint: true }, execute,
  }]]), step: scripted([{ text: "", toolCalls: [{ id: "lookup", name: "notes__lookup", args: {} }], stopReason: "stop" }]) });
  const events = await drain(runTurn(setup).events);
  expect(execute).toHaveBeenCalledOnce();
  expect(events.find(event => event.type === "tool.result")).toMatchObject({ success: true, output: "found note" });
});

function echoTool(name: string, output: string): ToolDefinition {
  return {
    name,
    description: name,
    argsSchema: { type: "object", properties: {} },
    execute: async () => ({ success: true, output }),
  };
}

function scripted(steps: Array<Awaited<ReturnType<StepFunction>> | ((messages: readonly SessionMessage[]) => Awaited<ReturnType<StepFunction>>)>): StepFunction {
  let index = 0;
  return async (messages, _signal, listener) => {
    const next = steps[index++] ?? { text: "Done", toolCalls: [], stopReason: "stop" as const };
    const step = typeof next === "function" ? next(messages) : next;
    if (step.text) listener.onText?.(step.text);
    return step;
  };
}

function options(overrides: Partial<TurnOptions> = {}): TurnOptions & { readonly persisted: SessionMessage[] } {
  const persisted: SessionMessage[] = [];
  return {
    persisted,
    sessionId: "sess_turn",
    prompt: "do the thing",
    workspaceRoot: process.cwd(),
    permissionScope: "allow-all",
    history: [],
    onMessage: (message) => persisted.push(message),
    step: scripted([{ text: "All done.", toolCalls: [], stopReason: "stop" }]),
    tools: new Map(),
    hooks: quietHooks,
    maxSteps: 5,
    signal: new AbortController().signal,
    ...overrides,
  };
}

async function drain(events: AsyncIterable<QueryEvent>): Promise<QueryEvent[]> {
  const out: QueryEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

describe("runTurn", () => {
  it("attributes the request after a discovery result without inferring from prose", () => {
    const search: SessionMessage[] = [
      { role: "assistant", content: "", tool_calls: [{ id: "s", type: "function",
        function: { name: "tool_search", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "s", content: "matches" },
    ];
    const load: SessionMessage[] = [
      { role: "assistant", content: "", tool_calls: [{ id: "l", type: "function",
        function: { name: "tool_load", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "l", content: "loaded" },
    ];
    expect(requestPurposeFor(search)).toBe("discovery-search");
    expect(requestPurposeFor(load)).toBe("discovery-load");
    expect(requestPurposeFor([{ role: "user", content: "loaded" }])).toBe("turn");
  });

  it.each([undefined, 0, 21])('ties accepted request dimensions to its own usage (%s) and excludes durable snapshots', async promptTokens => {
    const sessionId = `context-receipt-${promptTokens}`;
    let body = '';
    const step = createStepFunction({ provider: { provider: 'fixture', model: 'm', baseUrl: 'https://fixture.test', headers: {} },
      sessionId, workspaceRoot: process.cwd(), systemPrompt: '私有规则', tools: [],
      fetchImpl: async (_url, init) => { body = String(init?.body); return new Response(JSON.stringify({
        choices: [{ message: { content: 'done' }, finish_reason: 'stop' }],
        ...(promptTokens === undefined ? {} : { usage: { prompt_tokens: promptTokens, completion_tokens: 1 } }),
      }), { headers: { 'content-type': 'application/json' } }); },
    });
    try {
      await drain(runTurn(options({ sessionId, step })).events);
      expect(getSessionUsage(sessionId).requestContext).toMatchObject({ provider: 'fixture', model: 'm',
        body: { bytes: Buffer.byteLength(body), codeUnits: body.length } });
      expect(getSessionUsage(sessionId).requestContext?.promptTokens).toBe(promptTokens);
      persistSessionUsage(sessionId, undefined, snapshot => { expect(JSON.stringify(snapshot)).not.toContain('requestContext'); });
      const captured = getSessionUsage(sessionId).requestContext;
      markContextUnknown(sessionId, 'usage-gap');
      expect(getSessionUsage(sessionId).requestContext).toBe(captured);
      markContextUnknown(sessionId);
      expect(getSessionUsage(sessionId).requestContext).toBeUndefined();
    } finally { resetSessionUsage(sessionId); }
  });

  it('does not reattach a request observation after a context reset during usage delivery', async () => {
    const sessionId = 'context-receipt-reset';
    const context = requestContext({ body: '{}', provider: 'fixture', model: 'm', endpoint: 'extension' });
    const step: StepFunction = async (_messages, _signal, _listener, stepOptions) => {
      stepOptions.onRequestSent?.({ context, url: 'https://fixture.test', headers: {}, body: '{}' });
      expect(getSessionUsage(sessionId).requestContext).toBe(context);
      markContextUnknown(sessionId);
      stepOptions.onRequestUsage?.({ prompt_tokens: 40 });
      return { text: 'done', toolCalls: [], stopReason: 'stop' };
    };
    await drain(runTurn(options({ sessionId, step })).events);
    expect(getSessionUsage(sessionId).requestContext).toBeUndefined();
    resetSessionUsage(sessionId);
  });

  it('publishes the exact accepted wire prompt identity', async () => {
    const identity = { provider: 'fixture', model: 'm', endpoint: 'openai-compatible',
      endpointId: 'endpoint-wire', schemaDigest: 'schema-wire', systemDigest: 'system-wire',
      historyDigest: 'history-wire', wireHistoryDigest: 'wire-wire', wireMessageCount: 1, replayBinding: 'replay-wire' };
    const notified = vi.fn();
    const step: StepFunction = async (_messages, _signal, _listener, stepOptions) => {
      stepOptions.onRequestSent?.({ url: 'https://fixture.test', headers: {}, body: '{}', promptIdentity: identity });
      return { text: 'done', toolCalls: [], stopReason: 'stop' };
    };
    await drain(runTurn(options({ step, onPromptIdentity: notified })).events);
    expect(notified).toHaveBeenCalledWith(identity);
  });

  it('keeps the foreground receipt when a shared step sends a delegated request', async () => {
    const sessionId = 'context-receipt-delegation';
    const context = requestContext({ body: '{"foreground":true}', provider: 'fixture', model: 'm', endpoint: 'extension' });
    let calls = 0; let delegated = 0;
    const step: StepFunction = async (_messages, _signal, _listener, stepOptions) => {
      if (calls++ > 0) return { text: 'done', toolCalls: [], stopReason: 'stop' };
      stepOptions.onRequestSent?.({ context, url: 'https://fixture.test', headers: {}, body: '{"foreground":true}' });
      stepOptions.onRequestUsage?.({ prompt_tokens: 42 });
      return { text: '', toolCalls: [{ id: 'dispatch', name: 'task', args: { description: 'inspect', prompt: 'inspect' } }], stopReason: 'stop' };
    };
    const childStep = createStepFunction({ provider: { model: 'child', baseUrl: 'https://fixture.test', headers: {} },
      sessionId, workspaceRoot: process.cwd(), systemPrompt: 'child system', tools: [], fetchImpl: async () => {
        delegated++; return new Response(JSON.stringify({ choices: [{ message: { content: 'child done' }, finish_reason: 'stop' }], usage: { prompt_tokens: 99 } }),
          { headers: { 'content-type': 'application/json' } });
      },
    });
    await drain(runTurn(options({ sessionId, step, subagentHost: { step: childStep, defaultMaxSteps: 1 },
      tools: new Map([['task', createTaskToolDefinition()]]),
    })).events);
    expect(delegated).toBe(1);
    expect(getSessionUsage(sessionId).requestContext).toEqual({ ...context, promptTokens: 42 });
    resetSessionUsage(sessionId);
  });
  it("invalidates a metered prefix before a later step that reports no usage", async () => {
    const cacheWarming = { noteRequest: vi.fn(), noteSettled: vi.fn(), stop: vi.fn(), status: () => ({ mode: "idle" as const }) };
    const first = { url: "https://fixture.test", headers: {}, body: "first" };
    const second = { ...first, body: "second" };
    let calls = 0;
    const step: StepFunction = async (_messages, _signal, _listener, options) => {
      calls += 1;
      options.onRequestSent?.(calls === 1 ? first : second);
      if (calls === 1) {
        options.onRequestUsage?.({ prompt_tokens: 500000 });
        return { text: "", toolCalls: [{ id: "read_1", name: "read", args: {} }], stopReason: "stop" };
      }
      return { text: "done", toolCalls: [], stopReason: "stop" };
    };
    await drain(runTurn(options({ step, cacheWarming, tools: new Map([["read", echoTool("read", "read")]]) })).events);
    expect(cacheWarming.noteRequest.mock.calls).toEqual([[500000, first], [0, first]]);
  });

  it.each(["unmetered", "unfinished", "refused"])("does not warm a %s response using the previous context gauge", async kind => {
    const sessionId = `warming-${kind}`;
    const cacheWarming = { noteRequest: vi.fn(), noteSettled: vi.fn(), stop: vi.fn(), status: () => ({ mode: "idle" as const }) };
    recordSessionUsage(sessionId, { model: "fixture", promptTokens: 500000 });
    const body = { choices: [{ message: { content: "answer" }, finish_reason: kind === "refused" ? "content_filter" : "stop" }],
      ...(kind === "refused" ? { usage: { prompt_tokens: 500000 } } : {}),
    };
    const step = createStepFunction({ provider: { provider: "fixture", model: "fixture", baseUrl: "https://fixture.test", headers: {} },
      sessionId, workspaceRoot: process.cwd(), systemPrompt: "", tools: [],
      fetchImpl: async () => new Response(kind === "unfinished" ? 'data: {"choices":[{"delta":{"content":"partial"}}],"usage":{"prompt_tokens":500000}}\n\n' : JSON.stringify(body), {
        headers: { "content-type": kind === "unfinished" ? "text/event-stream" : "application/json" },
      }),
    });
    try {
      await drain(runTurn(options({ sessionId, step, cacheWarming, retry: { maxRetries: 0 } })).events);
      expect(cacheWarming.noteRequest).not.toHaveBeenCalled();
    } finally {
      resetSessionUsage(sessionId);
    }
  });

  it("streams the answer and reports a completed run", async () => {
    const setup = options();
    const events = await drain(runTurn(setup).events);
    expect(events[0]).toEqual({ type: "query.started", sessionId: "sess_turn", prompt: "do the thing" });
    expect(events.filter((event) => event.type === "message.delta")).toHaveLength(1);
    const terminal = events.at(-1);
    expect(terminal?.type).toBe("query.completed");
    if (terminal?.type === "query.completed") {
      expect(terminal.result.finalOutput).toBe("All done.");
      expect(terminal.result.sharedContext.notes).toEqual(["steps: 1"]);
    }
  });

  it("persists the assistant and tool messages but never the opening prompt", async () => {
    const setup = options({
      tools: new Map([["read", echoTool("read", "file contents")]]),
      step: scripted([
        { text: "", toolCalls: [{ id: "call_1", name: "read", args: { path: "a.txt" } }], stopReason: "stop" },
        { text: "Read it.", toolCalls: [], stopReason: "stop" },
      ]),
    });
    const events = await drain(runTurn(setup).events);
    expect(setup.persisted.map((message) => message.role)).toEqual(["assistant", "tool", "assistant"]);
    expect(setup.persisted[0].tool_calls?.[0].function.name).toBe("read");
    expect(setup.persisted[1].tool_call_id).toBe("call_1");
    expect(setup.persisted.some((message) => "stopReason" in message)).toBe(false);
    const started = events.find((event) => event.type === "tool.started");
    const result = events.find((event) => event.type === "tool.result");
    expect(started).toMatchObject({ toolName: "read", taskId: "call_1", args: { path: "a.txt" } });
    expect(result).toMatchObject({ toolName: "read", taskId: "call_1", success: true, output: "file contents" });
  });

  it("refuses tool calls the model truncated and lets it re-issue them", async () => {
    let executed = 0;
    const tool = echoTool("write", "written");
    const setup = options({
      tools: new Map([["write", { ...tool, execute: async () => { executed += 1; return { success: true, output: "written" }; } }]]),
      step: scripted([
        { text: "", toolCalls: [{ id: "call_cut", name: "write", args: { path: "a.txt" } }], stopReason: "length" },
        { text: "Retried.", toolCalls: [], stopReason: "stop" },
      ]),
    });
    const events = await drain(runTurn(setup).events);
    expect(executed).toBe(0);
    const result = events.find((event) => event.type === "tool.result");
    expect(result).toMatchObject({ success: false });
    expect((result as { output?: string }).output).toContain("output token limit");
    expect(events.at(-1)?.type).toBe("query.completed");
  });

  it("ends quietly when interrupted, keeping what was already said", async () => {
    const controller = new AbortController();
    const setup = options({
      signal: controller.signal,
      step: async (_messages, signal, listener) => {
        listener.onText?.("partial ");
        controller.abort();
        void signal;
        return { text: "partial ", toolCalls: [], stopReason: "aborted", errorMessage: "Operation aborted" };
      },
    });
    const events = await drain(runTurn(setup).events);
    expect(events.some((event) => event.type === "query.failed")).toBe(false);
    expect(events.some((event) => event.type === "query.completed")).toBe(false);
    expect(setup.persisted).toEqual([{ role: "assistant", content: "partial " }]);
  });

  it("reports a failed model call as a failed run", async () => {
    // A rejection the provider will keep giving: retrying it would spend a
    // request to learn the same thing, so the run ends here. A transient
    // failure is retried instead, which is what the retry tests cover.
    const setup = options({
      step: scripted([{ text: "", toolCalls: [], stopReason: "error", errorMessage: "Provider HTTP 401: bad key" }]),
    });
    const events = await drain(runTurn(setup).events);
    expect(events.at(-1)).toEqual({ type: "query.failed", error: "Provider HTTP 401: bad key" });
    expect(setup.persisted).toEqual([]);
  });

  it("compacts once and retries when the provider reports an overflow", async () => {
    const summaries: string[] = [];
    let calls = 0;
    // Long enough that condensing them is worth it: the guard declines when the
    // summary would cost at least what it replaces, and a fixture of two-letter
    // messages is exactly that case.
    const history: SessionMessage[] = [];
    for (let index = 0; index < 4; index += 1) {
      history.push(
        { role: "user", content: `q${index} ${"x".repeat(400)}` },
        { role: "assistant", content: `a${index} ${"y".repeat(400)}` },
      );
    }
    const setup = options({
      history,
      step: async (messages, _signal, listener) => {
        calls += 1;
        if (calls === 1) return { text: "", toolCalls: [], stopReason: "error", errorMessage: `${CONTEXT_OVERFLOW_PREFIX}too big` };
        const checkpoint = messages.find((message) => message.content.includes("[Context Checkpoint]"));
        const text = checkpoint ? "answered after compaction" : "no checkpoint";
        listener.onText?.(text);
        return { text, toolCalls: [], stopReason: "stop" };
      },
      compaction: {
        // An overflow is a context that outgrew its window, so the recent-tail
        // budget is the part of that window the compaction may keep.
        policy: { contextWindow: 1_000_000, keepRecentTokens: 300 },
        summarize: async () => "older work",
        onCompact: (record) => summaries.push(record.summary),
      },
    });
    const events = await drain(runTurn(setup).events);
    expect(summaries).toEqual(["older work"]);
    const terminal = events.at(-1);
    expect(terminal?.type).toBe("query.completed");
    if (terminal?.type === "query.completed") expect(terminal.result.finalOutput).toBe("answered after compaction");
  });

  it("tells a hook the rescue compaction is an overflow", async () => {
    // The rescue is the compaction that discards the most context, and it used
    // to reach `condenseContext` without a lifecycle at all — so a hook watching
    // for the context being cut never heard about this one. The reason it
    // reported to be told about is `overflow`, which no code produced.
    const seen: Array<{ name: string; reason?: string }> = [];
    const history: SessionMessage[] = [];
    for (let index = 0; index < 4; index += 1) {
      history.push(
        { role: "user", content: `q${index} ${"x".repeat(400)}` },
        { role: "assistant", content: `a${index} ${"y".repeat(400)}` },
      );
    }
    let calls = 0;
    const setup = options({
      history,
      hooks: {
        dispatch: async (input: { eventName: string; reason?: string }) => {
          seen.push({ name: input.eventName, ...(input.reason ? { reason: input.reason } : {}) });
          return { decision: "allow" as const };
        },
      } as unknown as HookDispatcher,
      step: async (messages) => {
        calls += 1;
        if (calls === 1) return { text: "", toolCalls: [], stopReason: "error", errorMessage: `${CONTEXT_OVERFLOW_PREFIX}too big` };
        return { text: "done", toolCalls: [], stopReason: "stop" };
      },
      compaction: {
        policy: { contextWindow: 1_000_000, keepRecentTokens: 300 },
        summarize: async () => "older work",
        onCompact: () => {},
      },
    });
    await drain(runTurn(setup).events);

    const compactHooks = seen.filter((entry) => entry.name === "PreCompact" || entry.name === "PostCompact");
    expect(compactHooks.map((entry) => entry.name)).toEqual(["PreCompact", "PostCompact"]);
    expect(compactHooks.every((entry) => entry.reason === "overflow")).toBe(true);
  });

  it("reports overflow failure when the summarizer fails", async () => {
    const history: SessionMessage[] = [];
    for (let index = 0; index < 4; index += 1) {
      history.push({ role: "user", content: `q${index}` }, { role: "assistant", content: `a${index}` });
    }
    const setup = options({
      history,
      step: async () => ({ text: "", toolCalls: [], stopReason: "error" as const, errorMessage: `${CONTEXT_OVERFLOW_PREFIX}too big` }),
      compaction: {
        policy: { contextWindow: 1_000_000 },
        summarize: async () => {
          throw new Error("summarizer down");
        },
        onCompact: () => {},
      },
    });
    const events = await drain(runTurn(setup).events);
    expect(events.at(-1)).toEqual({ type: "query.failed", error: "Context overflow error: could not compact context automatically." });
  });
  it("delivers steering before the next step and follow-ups after the run would stop", async () => {
    const seen: string[] = [];
    const setup = options({
      tools: new Map([["read", echoTool("read", "contents")]]),
      step: async (messages, _signal, listener) => {
        const last = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
        seen.push(last);
        if (seen.length === 1) return { text: "", toolCalls: [{ id: "c1", name: "read", args: {} }], stopReason: "stop" };
        listener.onText?.(`ack ${last}`);
        return { text: `ack ${last}`, toolCalls: [], stopReason: "stop" };
      },
    });
    const run = runTurn(setup);
    const events: QueryEvent[] = [];
    for await (const event of run.events) {
      events.push(event);
      if (event.type === "tool.started") {
        run.steer("turn left");
        run.followUp("then stop");
        expect(run.pending()).toEqual({ steering: ["turn left"], followUps: ["then stop"] });
      }
    }
    expect(seen.slice(1)).toEqual(["turn left", "then stop"]);
    expect(run.pending()).toEqual({ steering: [], followUps: [] });
    expect(setup.persisted.filter((message) => message.role === "user").map((message) => message.content)).toEqual([
      "turn left",
      "then stop",
    ]);
  });

  it("hands undelivered input back when the queue is cleared", () => {
    const run = runTurn(options({ step: () => new Promise(() => {}) }));
    run.steer("a");
    run.followUp("b");
    expect(run.clearQueue()).toEqual(["a", "b"]);
    expect(run.pending()).toEqual({ steering: [], followUps: [] });
  });

  it("drops blank steering and follow-up input at the boundary", () => {
    const run = runTurn(options({ step: () => new Promise(() => {}) }));
    run.steer("   ");
    run.followUp("");
    expect(run.pending()).toEqual({ steering: [], followUps: [] });
  });
});

describe("tool events reach the shell before the batch is assembled", () => {
  it("reports a call settled as soon as that call stops running", async () => {
    let releaseSecond: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const setup = options({
      tools: new Map([
        [
          "read",
          {
            ...echoTool("read", "file contents"),
            execute: async () => {
              await gate;
              return { success: true, output: "file contents" };
            },
          },
        ],
      ]),
      step: scripted([
        {
          text: "",
          toolCalls: [
            { id: "call_1", name: "read", args: { path: "a.txt" } },
            { id: "call_2", name: "read", args: { path: "b.txt" } },
          ],
          stopReason: "stop",
        },
        { text: "Read both.", toolCalls: [], stopReason: "stop" },
      ]),
    });
    const run = runTurn(setup);
    const seen: QueryEvent[] = [];
    const drained = (async () => {
      for await (const event of run.events) seen.push(event);
    })();
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Both calls started, neither has finished: nothing has settled yet.
    expect(seen.filter((event) => event.type === "tool.started")).toHaveLength(2);
    expect(seen.filter((event) => event.type === "tool.settled")).toHaveLength(0);
    releaseSecond?.();
    await drained;

    const settled = seen.filter((event) => event.type === "tool.settled");
    expect(settled).toHaveLength(2);
    // Status arrives for each call, which is what lets a card stop looking busy
    // without waiting for the whole batch. Output still arrives on tool.result.
    expect(settled.map((event) => (event as { taskId: string }).taskId).sort()).toEqual(["call_1", "call_2"]);
    expect(seen.filter((event) => event.type === "tool.result")).toHaveLength(2);
  });
});

describe("progress from a tool reaches the shell", () => {
  it("carries output a tool reports while it runs", async () => {
    const setup = options({
      tools: new Map([
        [
          "bash",
          {
            ...echoTool("bash", "final output"),
            execute: async (_args, context) => {
              // What a command tool does: report as it produces, then return.
              context.onOutput?.("part one\n");
              context.onOutput?.("part two\n");
              return { success: true, output: "final output" };
            },
          },
        ],
      ]),
      step: scripted([
        { text: "", toolCalls: [{ id: "call_1", name: "bash", args: { command: "x" } }], stopReason: "stop" },
        { text: "Done.", toolCalls: [], stopReason: "stop" },
      ]),
    });
    const events = await drain(runTurn(setup).events);

    // The adapter, the tool context, and the projection all have to line up for
    // this to appear; any one of them dropping the callback loses it silently.
    const output = events.filter((event) => event.type === "tool.output");
    expect(output.length).toBeGreaterThan(0);
    expect(output.map((event) => (event as { chunk: string }).chunk).join("")).toContain("part one");
    // The progress is not the result: the whole output still arrives separately.
    const result = events.find((event) => event.type === "tool.result") as { output?: string } | undefined;
    expect(result?.output).toContain("final output");
  });
});

describe("a subagent's calls answer to the session's rules", () => {
  /**
   * The rule reaches the door the subagent comes through.
   *
   * The session and a subagent each adapt a tool set, and the two gates were
   * built from separate option lists — the subagent's left out the user's
   * refusals. A rule that only the session's own calls obeyed is a rule that
   * holds until something delegates, which is not a rule.
   */
  it("refuses, inside the subagent, a tool the session refuses", async () => {
    const ran: string[] = [];
    const bashTool: ToolDefinition = {
      name: "bash",
      description: "run a command",
      argsSchema: { type: "object", properties: {} },
      execute: async () => {
        ran.push("bash");
        return { success: true, output: "ran" };
      },
    };
    const taskTool: ToolDefinition = {
      ...createTaskToolDefinition(),
    };
    const tools = new Map<string, ToolDefinition>([
      ["bash", bashTool],
      ["task", taskTool],
    ]);
    // Step 1: the session delegates. Step 2+: the subagent asks for bash.
    let n = 0;
    const step: StepFunction = async (_messages, _signal, _listener, stepOptions) => {
      n += 1;
      if (n === 1) {
        return {
          text: "",
          toolCalls: [{ id: "c1", name: "task", args: { description: "d", prompt: "run bash", subagent_type: "general" } }],
          stopReason: "stop",
        };
      }
      if (stepOptions.allowTools) {
        return { text: "", toolCalls: [{ id: `c${n}`, name: "bash", args: { command: "echo hi" } }], stopReason: "stop" };
      }
      return { text: "done", toolCalls: [], stopReason: "stop" };
    };

    const run = runTurn(
      options({
        tools,
        denyRules: [{ tool: "bash" }],
        step,
        subagentHost: { step, defaultMaxSteps: 3 },
        maxSteps: 6,
      }),
    );
    await drain(run.events);

    expect(ran).toEqual([]);
  });

  /**
   * The rule reaches the door the subagent comes through.
   *
   * The session and a subagent each adapt a tool set, and the two gates were
   * built from separate option lists — the subagent's left out the user's
   * refusals. A rule that only the session's own calls obeyed is a rule that
   * holds until something delegates, which is not a rule.
   */
  it("refuses a tool the session refuses, even when a subagent asks for it", async () => {
    const ran: string[] = [];
    const bashTool: ToolDefinition = {
      name: "bash",
      description: "run a command",
      argsSchema: { type: "object", properties: {} },
      execute: async () => {
        ran.push("bash");
        return { success: true, output: "ran" };
      },
    };
    // The subagent's own step asks for bash. Without the rule reaching its gate
    // this call is executed, which is the failure this pins.
    const step: StepFunction = async (_messages, _signal, _listener, stepOptions) => {
      if (stepOptions.allowTools) {
        return { text: "", toolCalls: [{ id: "c1", name: "bash", args: { command: "echo hi" } }], stopReason: "stop" };
      }
      return { text: "answered", toolCalls: [], stopReason: "stop" };
    };

    const run = runTurn(
      options({
        tools: new Map([["bash", bashTool]]),
        denyRules: [{ tool: "bash" }],
        step,
        subagentHost: { step, defaultMaxSteps: 3 },
      }),
    );
    await drain(run.events);

    expect(ran).toEqual([]);
  });
});


it("binds the delegated reviewer mode through the real turn composition", async () => {
  let executed = false;
  let observed = "";
  const childStep: StepFunction = async (messages) => {
    const result = messages.find((message) => message.role === "tool");
    if (result) {
      observed = String(result.content);
      return { text: "review done", toolCalls: [], stopReason: "stop" };
    }
    return { text: "checking", toolCalls: [{ id: "child", name: "bash", args: { command: "touch marker" } }], stopReason: "stop" };
  };
  const setup = options({
    agentMode: "build",
    step: scripted([{ text: "delegating", toolCalls: [{ id: "dispatch", name: "task", args: {
      description: "review", prompt: "inspect", subagent_type: "code-reviewer", agentMode: "build",
    } }], stopReason: "stop" }]),
    subagentHost: { step: childStep, defaultMaxSteps: 3 },
    tools: new Map([
      ["task", createTaskToolDefinition()],
      ["bash", { ...echoTool("bash", "executed"), execute: async () => { executed = true; return { success: true, output: "executed" }; } }],
    ]),
  });
  await drain(runTurn(setup).events);
  expect(executed).toBe(false);
  expect(observed).toContain("Plan mode is active");
  expect(setup.persisted.some((message) => String(message.content).includes("PLAN (Read-Only)"))).toBe(true);
});

it("delivers a subagent's exhausted budget and partial narration to the parent as failure", async () => {
  let parentObservation = "";
  const setup = options({
    step: scripted([
      { text: "delegating", toolCalls: [{ id: "dispatch", name: "task", args: { description: "inspect", prompt: "inspect" } }], stopReason: "stop" },
      (messages) => {
        parentObservation = String(messages.find((message) => message.role === "tool")?.content);
        return { text: "Delegation failed.", toolCalls: [], stopReason: "stop" };
      },
    ]),
    subagentHost: { defaultMaxSteps: 1, step: async () => ({
      text: "I started inspecting", toolCalls: [{ id: "child", name: "read", args: {} }], stopReason: "stop",
    }) },
    tools: new Map([["task", createTaskToolDefinition()], ["read", echoTool("read", "file")]]),
  });
  const events = await drain(runTurn(setup).events);
  expect(events.find((event) => event.type === "tool.result" && event.toolName === "task")).toMatchObject({ success: false });
  expect(parentObservation).toContain("Subagent Task Failed");
  expect(parentObservation).toContain("all 1 of its steps without finishing");
  expect(parentObservation).toContain("Partial response:\nI started inspecting");
});
