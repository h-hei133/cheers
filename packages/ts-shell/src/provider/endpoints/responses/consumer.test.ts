import { expect, it } from 'vitest';
import { createStepFunction } from '../../../turn/step.js';
import { requestSimpleCompletion } from '../../request/completion.js';
import { requestCompactionSummary } from '../../../core/query/compaction/summarize.js';
import { TurnSink } from '../../../cli/interactive/turnSink.js';
import { Transcript } from '../../../presentation/tui/transcript/container.js';
import { resetSessionUsage } from '../../../observability/usageTelemetry.js';

const item = { id: 'msg_1', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'partial response', annotations: [] }] };
const provider = { providerId: 'fixture', model: 'm', endpoint: 'openai-responses', baseUrl: 'https://fixture.test/v1', headers: {} };

it.each(['openai-responses', 'openai-account-responses'] as const)(
  'displays final-only public reasoning before the answer through the actual %s step and sink', async endpoint => {
    const reasoning = { id: 'rs_final', type: 'reasoning', summary: [{ type: 'summary_text', text: 'Inspect the inputs.' }],
      encrypted_content: 'synthetic-cipher' };
    const events = [
      { type: 'response.output_item.added', output_index: 0, item: { ...reasoning, summary: [] } },
      { type: 'response.reasoning_summary_text.done', output_index: 0, summary_index: 0, item_id: reasoning.id, text: 'Inspect the inputs.' },
      { type: 'response.output_item.done', output_index: 0, item: reasoning },
      { type: 'response.completed', response: { id: 'resp_final', model: 'm', status: 'completed', output: [reasoning, item] } },
    ];
    const transcript = new Transcript();
    const sink = new TurnSink(transcript, () => {});
    const sessionId = `responses-final-consumer-${endpoint}`;
    sink.begin('turn', 'turn');
    const step = createStepFunction({ provider: { apiKey: 'synthetic', provider: 'fixture', ...provider, endpoint },
      workspaceRoot: process.cwd(), sessionId, systemPrompt: '', tools: [],
      fetchImpl: async () => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
        { headers: { 'content-type': 'text/event-stream' } }) });
    try {
      const result = await step([{ role: 'user', content: 'q' }], undefined,
        { onReasoning: delta => sink.handleEvent({ type: 'reasoning.delta', role: 'coder', delta }),
          onText: delta => sink.handleEvent({ type: 'message.delta', role: 'coder', delta }) }, { allowTools: false });
      expect(result.stopReason).toBe('stop');
      expect(result.reasoning?.text).toBe('Inspect the inputs.');
      expect(JSON.parse(result.reasoning!.signature!).output).toEqual([reasoning, item]);
      expect(transcript.all().map(block => ({ kind: block.kind, text: block.text, finalized: block.finalized }))).toEqual([
        { kind: 'thinking', text: 'Inspect the inputs.', finalized: true },
        { kind: 'assistant', text: 'partial response', finalized: false },
      ]);
      expect(sink.activity()?.label).toBe('working');
      expect(JSON.stringify(transcript.all())).not.toContain('synthetic-cipher');
    } finally { sink.end(); resetSessionUsage(sessionId); }
  });

it('delivers raw reasoning deltas and retains the same reasoning in the actual provider step', async () => {
  const reasoning = { id: 'rs_raw', type: 'reasoning', summary: [], content: [] };
  const completed = { ...reasoning, content: [{ type: 'reasoning_text', text: 'Inspect the inputs.' }] };
  const events = [
    { type: 'response.output_item.added', output_index: 0, item: reasoning },
    { type: 'response.reasoning_text.delta', output_index: 0, content_index: 0, item_id: reasoning.id, delta: 'Inspect ' },
    { type: 'response.reasoning_text.delta', output_index: 0, content_index: 0, item_id: reasoning.id, delta: 'the inputs.' },
    { type: 'response.reasoning_text.done', output_index: 0, content_index: 0, item_id: reasoning.id, text: 'Inspect the inputs.' },
    { type: 'response.output_item.done', output_index: 0, item: completed },
    { type: 'response.completed', response: { id: 'resp_raw', model: 'm', status: 'completed', output: [completed, item] } },
  ];
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')));
    controller.close();
  } });
  const deltas: string[] = [];
  const step = createStepFunction({ provider: { apiKey: 'synthetic', provider: 'fixture', ...provider },
    workspaceRoot: process.cwd(), sessionId: 'responses-raw-consumer', systemPrompt: '', tools: [],
    fetchImpl: async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }) });
  const result = await step([{ role: 'user', content: 'q' }], undefined, { onReasoning: text => deltas.push(text) }, { allowTools: false });
  expect(deltas).toEqual(['Inspect ', 'the inputs.']);
  expect(result.stopReason).toBe('stop'); expect(result.text).toBe(item.content[0]!.text);
  expect(result.reasoning?.text).toBe('Inspect the inputs.');
  expect(JSON.parse(result.reasoning!.signature!).output).toEqual([completed, item]);
  expect(body.locked).toBe(false);
});

it.each(['summary', 'raw'] as const)('displays a validated %s tail once in the actual step-to-sink path', async channel => {
  const reasoning = { id: 'rs_partial', type: 'reasoning', summary: [] };
  const completed = { ...reasoning, ...(channel === 'summary'
    ? { summary: [{ type: 'summary_text', text: 'Inspect the inputs.' }] }
    : { content: [{ type: 'reasoning_text', text: 'Inspect the inputs.' }] }) };
  const events = [
    { type: 'response.output_item.added', output_index: 0, item: reasoning },
    { type: channel === 'summary' ? 'response.reasoning_summary_text.delta' : 'response.reasoning_text.delta',
      output_index: 0, item_id: reasoning.id, delta: 'Inspect ', ...(channel === 'summary' ? { summary_index: 0 } : { content_index: 0 }) },
    { type: 'response.completed', response: { id: 'resp_partial', model: 'm', status: 'completed', output: [completed, item] } },
  ];
  const transcript = new Transcript();
  const sink = new TurnSink(transcript, () => {});
  const sessionId = `responses-partial-consumer-${channel}`;
  const step = createStepFunction({ provider: { apiKey: 'synthetic', provider: 'fixture', ...provider },
    workspaceRoot: process.cwd(), sessionId, systemPrompt: '', tools: [],
    fetchImpl: async () => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
      { headers: { 'content-type': 'text/event-stream' } }) });
  sink.begin('turn', 'turn');
  try {
    const result = await step([{ role: 'user', content: 'q' }], undefined,
      { onReasoning: delta => sink.handleEvent({ type: 'reasoning.delta', role: 'coder', delta }),
        onText: delta => sink.handleEvent({ type: 'message.delta', role: 'coder', delta }) }, { allowTools: false });
    expect(result.stopReason).toBe('stop');
    expect(result.reasoning?.text).toBe('Inspect the inputs.');
    expect(JSON.parse(result.reasoning!.signature!).output).toEqual([completed, item]);
    expect(transcript.all().map(block => ({ kind: block.kind, text: block.text, finalized: block.finalized }))).toEqual([
      { kind: 'thinking', text: 'Inspect the inputs.', finalized: true },
      { kind: 'assistant', text: 'partial response', finalized: false },
    ]);
    expect(sink.activity()?.label).toBe('working');
  } finally { sink.end(); resetSessionUsage(sessionId); }
});

it.each(['failed', 'incomplete', 'refusal'])('simple and compaction consumers reject %s text but record native usage', async status => {
  const completion = { status: status === 'refusal' ? 'completed' : status, model: 'm',
    output: status === 'refusal' ? [{ ...item, content: [{ type: 'refusal', refusal: 'withheld' }] }] : [item],
    usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 }, incomplete_details: { reason: 'max_output_tokens' } };
  const usages: unknown[] = []; const failures: string[] = [];
  const fetchImpl: typeof fetch = async () => Response.json(completion);
  expect(await requestSimpleCompletion({ provider: { ...provider, fetchImpl }, messages: [{ role: 'user', content: 'q' }],
    onUsage: usage => usages.push(usage), onFailure: failure => failures.push(failure) })).toBeUndefined();
  expect(await requestCompactionSummary({ provider, messages: [{ role: 'user', content: 'q' }], fetchImpl,
    onUsage: usage => usages.push(usage) })).toBeUndefined();
  expect(usages).toHaveLength(2); expect(usages[0]).toMatchObject({ prompt_tokens: 10, completion_tokens: 3 });
  expect(failures).toHaveLength(1);
});

it('consumer abandonment cancels and releases an open stream through the actual turn', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode([
      { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'msg_1', delta: 'partial response' },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join('')));
  }, cancel() { cancelled = true; } });
  const step = createStepFunction({ provider: { apiKey: 'synthetic', provider: 'fixture', ...provider },
    workspaceRoot: process.cwd(), sessionId: 'responses-consumer', systemPrompt: '', tools: [],
    fetchImpl: async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }) });
  const result = await step([{ role: 'user', content: 'q' }], undefined, { onText() { throw new Error('reader detached'); } }, { allowTools: false });
  expect(result.stopReason).toBe('error'); expect(cancelled).toBe(true); expect(body.locked).toBe(false);
});

it('an incomplete Responses text cannot authorize a repaired inline tool invocation', async () => {
  const inline = '<｜DSML｜invoke name="write"><｜DSML｜parameter name="arguments">{"path":"a","content":"x"}</｜DSML｜parameter></｜DSML｜invoke>';
  const step = createStepFunction({ provider: { apiKey: 'synthetic', provider: 'fixture', ...provider },
    workspaceRoot: process.cwd(), sessionId: 'responses-incomplete-inline', systemPrompt: '', tools: [],
    fetchImpl: async () => Response.json({ status: 'incomplete', model: 'm', incomplete_details: { reason: 'max_output_tokens' },
      output: [{ ...item, content: [{ type: 'output_text', text: inline, annotations: [] }] }] }) });
  const result = await step([{ role: 'user', content: 'q' }], undefined, {}, { allowTools: true });
  expect(result.stopReason).toBe('length'); expect(result.toolCalls).toEqual([]); expect(result.text).toBe(inline);
});
