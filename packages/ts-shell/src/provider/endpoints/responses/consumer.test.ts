import { expect, it } from 'vitest';
import { createStepFunction } from '../../../turn/step.js';
import { requestSimpleCompletion } from '../../request/completion.js';
import { requestCompactionSummary } from '../../../core/query/compaction/summarize.js';

const item = { id: 'msg_1', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'partial response', annotations: [] }] };
const provider = { providerId: 'fixture', model: 'm', endpoint: 'openai-responses', baseUrl: 'https://fixture.test/v1', headers: {} };

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
