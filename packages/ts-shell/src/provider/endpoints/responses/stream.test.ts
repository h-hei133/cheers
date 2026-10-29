import { describe, expect, it } from 'vitest';
import { endpointShape } from '../index.js';
import { modelUsage } from '../../response/metering.js';
import type { StreamedCompletion, StreamFragment } from '../../../turn/completion.js';

const item = { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Hello 世界', annotations: [] }] };
const usage = { input_tokens: 100, input_tokens_details: { cached_tokens: 40 }, output_tokens: 12, output_tokens_details: { reasoning_tokens: 7 }, total_tokens: 112 };
const terminal = (output: unknown[] = [item], status = 'completed', reason?: string) => ({ type: `response.${status}`,
  response: { id: 'resp_1', model: 'm', status, output, usage, ...(reason ? { incomplete_details: { reason } } : {}) } });
const added = (value = item, index = 0) => ({ type: 'response.output_item.added', output_index: index, item: value });

async function read(events: unknown[], newline = '\n', split = true, close = true,
  kind: 'openai-responses' | 'openai-account-responses' = 'openai-responses') {
  let cancelled = false;
  const wire = events.map(event => [': comment', 'event: response', ...JSON.stringify(event, null, 2).split('\n').map(line => `data: ${line}`), ''].join(newline)).join(newline);
  const bytes = new TextEncoder().encode(wire + (close ? '' : newline));
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    if (split) for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); else controller.enqueue(bytes);
    if (close) controller.close();
  }, cancel() { cancelled = true; } });
  const reader = endpointShape(kind).readStream(body); const fragments: StreamFragment[] = [];
  let next = await reader.next(); while (!next.done) { fragments.push(next.value); next = await reader.next(); }
  return { result: next.value as StreamedCompletion, fragments, body, cancelled };
}

describe('Responses terminal and SSE contract', () => {
  it.each(['\n', '\r\n', '\r'])('handles %j lines, UTF-8 splits, multiline data and final event without separator', async newline => {
    const { result, fragments } = await read([added(), { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'Hello 世界' }, terminal()], newline);
    expect(result.message.content).toBe('Hello 世界'); expect(result.finishReason).toBe('stop');
    expect(fragments).toEqual([{ kind: 'text', text: 'Hello 世界' }]);
    expect(modelUsage(result.usage, 'openai-responses')).toMatchObject({ inputTokens: 100, outputTokens: 12, cacheReadTokens: 40, complete: true });
  });

  it('routes interleaved parallel calls by output index and recovers terminal encrypted reasoning', async () => {
    const reasoning = { type: 'reasoning', id: 'rs_1', summary: [{ type: 'summary_text', text: 'Plan' }] };
    const call = { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'read', arguments: '', status: 'in_progress' };
    const other = { ...call, id: 'fc_2', call_id: 'call_2', name: 'write' };
    const events = [added(reasoning as never), added(call as never, 1), added(other as never, 2),
      { type: 'response.reasoning_summary_text.delta', output_index: 0, summary_index: 0, item_id: 'rs_1', delta: 'Plan' },
      { type: 'response.function_call_arguments.delta', output_index: 2, item_id: 'fc_2', delta: '{"b":2}' },
      { type: 'response.function_call_arguments.delta', output_index: 1, item_id: 'fc_1', delta: '{"a":1}' },
      { type: 'response.output_item.done', output_index: 0, item: reasoning },
      terminal([{ ...reasoning, encrypted_content: 'cipher' }, { ...call, arguments: '{"a":1}', status: 'completed' }, { ...other, arguments: '{"b":2}', status: 'completed' }])];
    const { result, fragments } = await read(events);
    expect(result.message.tool_calls?.map(value => [value.id, value.function.name, value.function.arguments])).toEqual([
      ['call_1', 'read', '{"a":1}'], ['call_2', 'write', '{"b":2}']]);
    expect(result.finishReason).toBe('tool_calls'); expect(result.reasoningSignature).toContain('cipher');
    expect(fragments).toEqual([{ kind: 'reasoning', text: 'Plan' }]);
  });

  it.each(['openai-responses', 'openai-account-responses'] as const)('streams and retains raw reasoning through %s without repeating done snapshots', async kind => {
    const reasoning = { type: 'reasoning', id: 'rs_raw', summary: [], content: [] };
    const completed = { ...reasoning, content: [{ type: 'reasoning_text', text: 'Plan 世界' }] };
    const { result, fragments } = await read([added(reasoning as never),
      { type: 'response.reasoning_text.delta', output_index: 0, content_index: 0, item_id: 'rs_raw', delta: 'Plan ' },
      { type: 'response.reasoning_text.delta', output_index: 0, content_index: 0, item_id: 'rs_raw', delta: '世界' },
      { type: 'response.reasoning_text.done', output_index: 0, content_index: 0, item_id: 'rs_raw', text: 'Plan 世界' },
      { type: 'response.output_item.done', output_index: 0, item: completed }, terminal([completed])], '\n', true, true, kind);
    expect(result.finishReason).toBe('stop'); expect(result.reasoning).toBe('Plan 世界');
    expect(result.message.content).toBe('');
    expect(fragments).toEqual([{ kind: 'reasoning', text: 'Plan ' }, { kind: 'reasoning', text: '世界' }]);
    expect(JSON.parse(result.reasoningSignature!).output).toEqual([completed]);
  });

  it('keeps raw content indices separate from summary indices and chooses one terminal representation', async () => {
    const reasoning = { type: 'reasoning', id: 'rs_raw', summary: [] };
    const completed = { ...reasoning, summary: [{ type: 'summary_text', text: 'Summary' }],
      content: [{ type: 'reasoning_text', text: 'First' }, { type: 'reasoning_text', text: 'Second' }] };
    const { result, fragments } = await read([added(reasoning as never),
      { type: 'response.reasoning_text.delta', output_index: 0, content_index: 1, item_id: 'rs_raw', delta: 'Second' },
      { type: 'response.reasoning_summary_text.delta', output_index: 0, summary_index: 0, item_id: 'rs_raw', delta: 'Summary' },
      { type: 'response.reasoning_text.delta', output_index: 0, content_index: 0, item_id: 'rs_raw', delta: 'First' },
      terminal([completed])]);
    expect(result.finishReason).toBe('stop'); expect(result.reasoning).toBe('Summary');
    expect(fragments.map(fragment => fragment.text)).toEqual(['Second', 'Summary', 'First', 'Summary']);
    expect(fragments.at(-1)).toEqual({ kind: 'reasoning.replace', text: 'Summary' });
    expect(JSON.parse(result.reasoningSignature!).output).toEqual([completed]);
  });

  it('publishes validated raw done text once when no reasoning delta preceded it', async () => {
    const reasoning = { type: 'reasoning', id: 'rs_raw', summary: [] };
    const completed = { ...reasoning, content: [{ type: 'reasoning_text', text: 'Plan' }] };
    const { result, fragments } = await read([added(reasoning as never),
      { type: 'response.reasoning_text.done', output_index: 0, content_index: 0, item_id: 'rs_raw', text: 'Plan' },
      terminal([completed])]);
    expect(result.finishReason).toBe('stop'); expect(result.reasoning).toBe('Plan');
    expect(fragments).toEqual([{ kind: 'reasoning', text: 'Plan' }]);
  });

  it.each(['openai-responses', 'openai-account-responses'] as const)(
    'publishes previously unstreamed public items once after %s terminal validation', async kind => {
      const raw = { type: 'reasoning', id: 'rs_final_raw', summary: [],
        content: [{ type: 'reasoning_text', text: 'Raw plan' }] };
      const summarized = { type: 'reasoning', id: 'rs_final_summary',
        summary: [{ type: 'summary_text', text: 'Summary plan' }],
        content: [{ type: 'reasoning_text', text: 'Alternate raw plan' }], encrypted_content: 'synthetic-cipher' };
      const { result, fragments } = await read([
        added({ ...raw, content: [] } as never),
        { type: 'response.reasoning_text.done', output_index: 0, content_index: 0, item_id: raw.id, text: 'Raw plan' },
        { type: 'response.output_item.done', output_index: 0, item: raw },
        terminal([raw, summarized, item]),
      ], '\n', true, true, kind);
      expect(result.finishReason).toBe('stop');
      expect(fragments).toEqual([
        { kind: 'reasoning', text: 'Raw planSummary plan' },
        { kind: 'text', text: 'Hello 世界' },
      ]);
      expect(result.reasoning).toBe('Raw planSummary plan');
      expect(JSON.parse(result.reasoningSignature!).output).toEqual([raw, summarized, item]);
    });

  it('does not suppress an unstreamed item because a different reasoning item emitted deltas', async () => {
    const streamed = { type: 'reasoning', id: 'rs_streamed', summary: [{ type: 'summary_text', text: 'First' }] };
    const final = { type: 'reasoning', id: 'rs_final', summary: [{ type: 'summary_text', text: 'Second' }] };
    const { result, fragments } = await read([added({ ...streamed, summary: [] } as never),
      { type: 'response.reasoning_summary_text.delta', output_index: 0, summary_index: 0, item_id: streamed.id, delta: 'First' },
      terminal([streamed, final, item])]);
    expect(result.finishReason).toBe('stop');
    expect(fragments).toEqual([{ kind: 'reasoning', text: 'First' }, { kind: 'reasoning', text: 'Second' },
      { kind: 'text', text: 'Hello 世界' }]);
  });

  it.each(['summary', 'raw'] as const)('publishes only the validated %s tail after a partial delta', async channel => {
    const start = { type: 'reasoning', id: 'rs_partial', summary: [] };
    const completed = { ...start, ...(channel === 'summary'
      ? { summary: [{ type: 'summary_text', text: 'Plan more' }] }
      : { content: [{ type: 'reasoning_text', text: 'Plan more' }] }) };
    const delta = { type: channel === 'summary' ? 'response.reasoning_summary_text.delta' : 'response.reasoning_text.delta',
      output_index: 0, item_id: start.id, delta: 'Plan ', ...(channel === 'summary' ? { summary_index: 0 } : { content_index: 0 }) };
    const { result, fragments } = await read([added(start as never), delta, terminal([completed, item])]);
    expect(result.finishReason).toBe('stop');
    expect(result.reasoning).toBe('Plan more');
    expect(fragments).toEqual([{ kind: 'reasoning', text: 'Plan ' }, { kind: 'reasoning', text: 'more' },
      { kind: 'text', text: 'Hello 世界' }]);
    expect(JSON.parse(result.reasoningSignature!).output).toEqual([completed, item]);
  });

  it('keeps the actual reasoning delta order when deciding whether final text is appendable', async () => {
    const reasoning = { type: 'reasoning', id: 'rs_parts', summary: [] };
    const completed = { ...reasoning, summary: [{ type: 'summary_text', text: 'One first' }, { type: 'summary_text', text: 'Two more' }] };
    const { result, fragments } = await read([added(reasoning as never),
      { type: 'response.reasoning_summary_text.delta', output_index: 0, item_id: reasoning.id, summary_index: 0, delta: 'One ' },
      { type: 'response.reasoning_summary_text.delta', output_index: 0, item_id: reasoning.id, summary_index: 1, delta: 'Two' },
      { type: 'response.reasoning_summary_text.delta', output_index: 0, item_id: reasoning.id, summary_index: 0, delta: 'first' },
      terminal([completed, item])]);
    expect(result.finishReason).toBe('stop');
    expect(result.reasoning).toBe('One first\nTwo more');
    expect(fragments).toEqual([{ kind: 'reasoning', text: 'One ' }, { kind: 'reasoning', text: 'Two' },
      { kind: 'reasoning', text: 'first' }, { kind: 'reasoning.replace', text: 'One first\nTwo more' },
      { kind: 'text', text: 'Hello 世界' }]);
  });

  it('recovers public reasoning from sealed account items when response.done omits output', async () => {
    const reasoning = { type: 'reasoning', id: 'rs_account_final', summary: [{ type: 'summary_text', text: 'Account plan' }] };
    const { result, fragments } = await read([added({ ...reasoning, summary: [] } as never),
      { type: 'response.output_item.done', output_index: 0, item: reasoning }, added(item, 1),
      { type: 'response.output_item.done', output_index: 1, item },
      { type: 'response.done', response: { id: 'resp_1', status: 'completed', model: 'm', usage } },
    ], '\n', true, true, 'openai-account-responses');
    expect(result.finishReason).toBe('stop');
    expect(fragments).toEqual([{ kind: 'reasoning', text: 'Account plan' }, { kind: 'text', text: 'Hello 世界' }]);
    expect(JSON.parse(result.reasoningSignature!).output).toEqual([reasoning, item]);
  });

  it.each(['openai-responses', 'openai-account-responses'] as const)(
    'reconciles %s reasoning across output items in canonical order without repeating streamed text', async kind => {
      const first = { type: 'reasoning', id: 'rs_first', summary: [{ type: 'summary_text', text: 'First' }] };
      const second = { type: 'reasoning', id: 'rs_second', summary: [{ type: 'summary_text', text: 'Second' }] };
      const { result, fragments } = await read([added({ ...first, summary: [] } as never),
        added({ ...second, summary: [] } as never, 1),
        { type: 'response.reasoning_summary_text.delta', output_index: 1, item_id: second.id, summary_index: 0, delta: 'Second' },
        { type: 'response.reasoning_summary_text.delta', output_index: 0, item_id: first.id, summary_index: 0, delta: 'First' },
        terminal([first, second, item])], '\n', true, true, kind);
      expect(result.reasoning).toBe('FirstSecond');
      expect(fragments).toEqual([{ kind: 'reasoning', text: 'Second' }, { kind: 'reasoning', text: 'First' },
        { kind: 'reasoning.replace', text: 'FirstSecond' }, { kind: 'text', text: 'Hello 世界' }]);
      expect(JSON.parse(result.reasoningSignature!).output).toEqual([first, second, item]);
    });

  it.each(['eof', 'foreign', 'contradictory', 'malformed-tool', 'failed', 'error', 'answer-prefix'] as const)(
    'does not replace streamed reasoning with a %s terminal projection', async fault => {
      const start = { type: 'reasoning', id: 'rs_refused', summary: [] };
      const reasoning = { ...start, summary: [{ type: 'summary_text', text: 'Final summary' }],
        content: [{ type: 'reasoning_text', text: 'Streamed raw' }] };
      const last = terminal([reasoning, item]);
      const events: unknown[] = [{ type: 'response.created', response: { id: 'resp_1' } }, added(start as never),
        { type: 'response.reasoning_text.delta', output_index: 0, item_id: start.id, content_index: 0, delta: 'Streamed raw' }];
      if (fault === 'foreign') last.response.id = 'resp_other';
      if (fault === 'contradictory') reasoning.content[0]!.text = 'Different raw';
      if (fault === 'malformed-tool') last.response.output.push({ type: 'function_call', id: 'fc_bad',
        call_id: 'bad', name: 'read', arguments: '[]', status: 'completed' });
      if (fault === 'failed') { last.type = 'response.failed'; last.response.status = 'failed'; }
      if (fault === 'answer-prefix') events.push(added(item, 1),
        { type: 'response.output_text.delta', output_index: 1, item_id: item.id, content_index: 0, delta: 'Different answer' });
      if (fault !== 'eof') events.push(fault === 'error' ? { type: 'error' } : last);
      const { result, fragments } = await read(events);
      expect(result.finishReason).toBe('error');
      expect(result.reasoningSignature).toBeUndefined();
      expect(fragments).toEqual([{ kind: 'reasoning', text: 'Streamed raw' },
        ...(fault === 'answer-prefix' ? [{ kind: 'text', text: 'Different answer' }] : [])]);
    });

  it('replaces account reasoning from validated sealed items when the terminal omits output', async () => {
    const start = { type: 'reasoning', id: 'rs_sealed', summary: [] };
    const reasoning = { ...start, content: [{ type: 'reasoning_text', text: 'Raw' }],
      summary: [{ type: 'summary_text', text: 'Summary' }], encrypted_content: 'synthetic-cipher' };
    const { result, fragments } = await read([added(start as never),
      { type: 'response.reasoning_text.delta', output_index: 0, item_id: start.id, content_index: 0, delta: 'Raw' },
      { type: 'response.output_item.done', output_index: 0, item: reasoning }, added(item, 1),
      { type: 'response.output_item.done', output_index: 1, item },
      { type: 'response.done', response: { id: 'resp_1', status: 'completed', model: 'm' } },
    ], '\n', true, true, 'openai-account-responses');
    expect(result.finishReason).toBe('stop');
    expect(fragments).toEqual([{ kind: 'reasoning', text: 'Raw' }, { kind: 'reasoning.replace', text: 'Summary' },
      { kind: 'text', text: 'Hello 世界' }]);
    expect(JSON.parse(result.reasoningSignature!).output).toEqual([reasoning, item]);
  });

  it.each(['empty-delta', 'already-streamed-answer'] as const)('publishes final-only reasoning after %s without repeating answer text', async mode => {
    const reasoning = { type: 'reasoning', id: 'rs_final', summary: [{ type: 'summary_text', text: 'Final plan' }] };
    const events: unknown[] = [added({ ...reasoning, summary: [] } as never)];
    if (mode === 'empty-delta') events.push({ type: 'response.reasoning_summary_text.delta', output_index: 0,
      summary_index: 0, item_id: reasoning.id, delta: '' });
    else events.push(added(item, 1), { type: 'response.output_text.delta', output_index: 1,
      content_index: 0, item_id: item.id, delta: 'Hello 世界' });
    const { result, fragments } = await read([...events, terminal([reasoning, item])]);
    expect(result.finishReason).toBe('stop');
    expect(fragments.filter(fragment => fragment.kind === 'reasoning' && fragment.text)).toEqual([{ kind: 'reasoning', text: 'Final plan' }]);
    expect(fragments.filter(fragment => fragment.kind === 'text')).toEqual([{ kind: 'text', text: 'Hello 世界' }]);
  });

  it('does not reveal done-only reasoning before a verified terminal or decode an opaque cipher as text', async () => {
    const reasoning = { type: 'reasoning', id: 'rs_unverified', summary: [{ type: 'summary_text', text: 'Unverified plan' }] };
    const unverified = await read([added({ ...reasoning, summary: [] } as never),
      { type: 'response.reasoning_summary_text.done', output_index: 0, summary_index: 0, item_id: reasoning.id, text: 'Unverified plan' },
      { type: 'response.output_item.done', output_index: 0, item: reasoning }]);
    expect(unverified.result.finishReason).toBe('error'); expect(unverified.fragments).toEqual([]);
    const opaque = await read([terminal([{ ...reasoning, summary: [], encrypted_content: 'synthetic-cipher' }, item])]);
    expect(opaque.result.finishReason).toBe('stop');
    expect(opaque.fragments).toEqual([{ kind: 'text', text: 'Hello 世界' }]);
  });

  it.each(['foreign', 'contradictory', 'malformed-tool', 'failed'] as const)(
    'does not publish final-only reasoning from a %s terminal', async fault => {
      const reasoning = { type: 'reasoning', id: 'rs_final', summary: [],
        content: [{ type: 'reasoning_text', text: 'Unverified plan' }] };
      const last = terminal([reasoning, item]);
      const events: unknown[] = [added({ ...reasoning, content: [] } as never)];
      if (fault === 'foreign') last.response.id = 'resp_other';
      if (fault === 'contradictory') events.push({ type: 'response.reasoning_text.done', output_index: 0,
        content_index: 0, item_id: reasoning.id, text: 'Different plan' });
      if (fault === 'malformed-tool') last.response.output.push({ type: 'function_call', id: 'fc_final',
        call_id: 'call_final', name: 'read', arguments: '[]', status: 'completed' });
      if (fault === 'failed') { last.type = 'response.failed'; last.response.status = 'failed'; }
      const { result, fragments } = await read([{ type: 'response.created', response: { id: 'resp_1' } }, ...events, last]);
      expect(result.finishReason).toBe('error'); expect(result.reasoningSignature).toBeUndefined();
      expect(result.message.tool_calls).toBeUndefined();
      expect(fragments.filter(fragment => fragment.kind === 'reasoning')).toEqual([]);
    });

  it.each(['identity', 'index', 'type', 'done', 'late', 'missing-content', 'terminal'] as const)('rejects invalid raw reasoning %s without admitting native replay or tools', async fault => {
    const reasoning = { type: 'reasoning', id: 'rs_raw', summary: [] };
    const completed = { ...reasoning, content: [{ type: 'reasoning_text', text: 'Plan' }] };
    const call = { type: 'function_call', id: 'fc_raw', call_id: 'call_raw', name: 'read', arguments: '{}', status: 'completed' };
    const delta = { type: 'response.reasoning_text.delta', output_index: 0, content_index: 0, item_id: 'rs_raw', delta: 'Plan' };
    const events: unknown[] = [added(fault === 'type' ? { ...item, id: 'rs_raw' } as never : reasoning as never),
      { ...delta, ...(fault === 'identity' ? { item_id: 'other' } : {}), ...(fault === 'index' ? { content_index: -1 } : {}) }];
    if (fault === 'done' || fault === 'late') {
      events.push({ type: 'response.reasoning_text.done', output_index: 0, content_index: 0, item_id: 'rs_raw', text: fault === 'done' ? 'Different' : 'Plan' });
      if (fault === 'late') events.push({ ...delta, delta: ' later' });
    }
    events.push(terminal([fault === 'missing-content' ? reasoning : fault === 'terminal'
      ? { ...completed, content: [{ type: 'reasoning_text', text: 'Different' }] } : completed, call]));
    const { result } = await read(events);
    expect(result.finishReason).toBe('error'); expect(result.reasoningSignature).toBeUndefined();
    expect(result.message.tool_calls).toBeUndefined();
  });

  it('rejects replacement of sealed raw reasoning', async () => {
    const reasoning = { type: 'reasoning', id: 'rs_raw', summary: [] };
    const completed = { ...reasoning, content: [{ type: 'reasoning_text', text: 'Plan' }] };
    const { result } = await read([added(reasoning as never),
      { type: 'response.reasoning_text.delta', output_index: 0, content_index: 0, item_id: 'rs_raw', delta: 'Plan' },
      { type: 'response.output_item.done', output_index: 0, item: completed },
      terminal([{ ...completed, content: [{ type: 'reasoning_text', text: 'Plan changed' }] }])]);
    expect(result.finishReason).toBe('error'); expect(result.reasoningSignature).toBeUndefined();
  });

  it.each([true, false])('allows raw item content to grow while preserving its initial prefix (matches=%s)', async matches => {
    const reasoning = { type: 'reasoning', id: 'rs_raw', summary: [], content: [{ type: 'reasoning_text', text: 'Plan' }] };
    const completed = { ...reasoning, content: [{ type: 'reasoning_text', text: matches ? 'Plan more' : 'Different' }] };
    const { result } = await read([added(reasoning as never),
      { type: 'response.output_item.done', output_index: 0, item: completed }, terminal([completed])]);
    expect(result.finishReason).toBe(matches ? 'stop' : 'error');
    expect(result.reasoning).toBe(matches ? 'Plan more' : '');
    if (!matches) expect(result.reasoningSignature).toBeUndefined();
  });

  it.each(['failed', 'incomplete', 'cancelled', 'in_progress', 'EOF'])('does not admit tools from %s', async status => {
    const call = { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'write', arguments: '{"path":"a"}', status: 'completed' };
    const events = [added(call as never)];
    if (status !== 'EOF') events.push(terminal([call], status, 'unknown') as never);
    const { result } = await read(events);
    expect(result.finishReason).toBe('error'); expect(result.message.tool_calls).toBeUndefined(); expect(result.reasoningSignature).toBeUndefined();
  });

  it.each(['max_output_tokens', 'content_filter'])('preserves incomplete %s and inclusive terminal usage', async reason => {
    const { result } = await read([terminal([item], 'incomplete', reason)]);
    expect(result.finishReason).toBe(reason === 'max_output_tokens' ? 'length' : 'content_filter');
    expect(result.usage?.completion_tokens).toBe(12); expect(result.reasoningSignature).toBeUndefined();
  });

  it('keeps already streamed text after failure without exposing remote body details', async () => {
    const { result } = await read([added(), { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'Hello' },
      { ...terminal([], 'failed'), response: { ...terminal([], 'failed').response, error: { message: 'PRIVATE_BEARER_BODY' } } }]);
    expect(result.message.content).toBe('Hello'); expect(result.finishReason).toBe('error');
    expect(result.usage?.completion_tokens).toBe(12); expect(JSON.stringify(result)).not.toContain('PRIVATE_BEARER_BODY');
  });

  it.each(['identity', 'args', 'text', 'duplicate', 'unknown'])('rejects contradictory %s output', async kind => {
    const events: unknown[] = [{ type: 'response.created', response: { id: 'resp_1' } }, added(),
      { type: 'response.output_text.delta', item_id: kind === 'identity' ? 'foreign' : 'msg_1', output_index: 0, content_index: 0, delta: 'Hello' }];
    if (kind === 'duplicate') events.push(added());
    const last = terminal(kind === 'unknown' ? [{ id: 'x', type: 'unknown' }] : [{ ...item, content: [{ type: 'output_text', text: kind === 'text' ? 'Different' : 'Hello 世界', annotations: [] }] }]);
    if (kind === 'args') events.push({ type: 'response.function_call_arguments.delta', output_index: 0, item_id: 'msg_1', delta: '{}' });
    events.push(last);
    const { result } = await read(events); expect(result.finishReason).toBe('error'); expect(result.message.tool_calls).toBeUndefined();
  });

  it('cancels a server that stays open after an explicit terminal and releases its reader', async () => {
    const { result, cancelled, body } = await read([terminal()], '\n', false, false);
    expect(result.finishReason).toBe('stop'); expect(cancelled).toBe(true); expect(body.locked).toBe(false);
  });

  it('rejects malformed JSON frames without embedding remote text', async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {PRIVATE_BODY}\n\n')); controller.close(); } });
    const stream = endpointShape('openai-responses').readStream(body); const next = await stream.next();
    expect(next.done).toBe(true); expect(JSON.stringify(next.value)).not.toContain('PRIVATE_BODY');
    expect((next.value as StreamedCompletion).finishReason).toBe('error');
  });

  it.each(['{"path":"a","content":"x"', '[]', 'null', '"text"'])('rejects malformed or non-object function arguments %s before the repair parser', async argumentsText => {
    const call = { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'write', arguments: argumentsText, status: 'completed' };
    const { result } = await read([terminal([call])]);
    expect(result.finishReason).toBe('error'); expect(result.message.tool_calls).toBeUndefined();
  });

  it.each(['foreign', 'missing'])('rejects %s terminal identity without relying on response.created', async kind => {
    const last = terminal();
    if (kind === 'missing') delete (last.response as Partial<typeof last.response>).id;
    else last.response.id = 'resp_other';
    const { result } = await read([{ ...added(), response_id: 'resp_1' }, last]);
    expect(result.finishReason).toBe('error');
    expect(result.usage).toBeUndefined();
  });

  it.each(['delta', 'terminal'])('seals completed text against contradictory %s', async kind => {
    const events: unknown[] = [added(), { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'Hello' },
      { type: 'response.output_text.done', item_id: 'msg_1', output_index: 0, content_index: 0, text: 'Hello' }];
    if (kind === 'delta') events.push({ type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: ' 世界' });
    events.push(terminal());
    const { result } = await read(events); expect(result.finishReason).toBe('error');
  });

  it('seals completed arguments against later deltas', async () => {
    const call = { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'write', arguments: '', status: 'in_progress' };
    const { result } = await read([added(call as never),
      { type: 'response.function_call_arguments.done', output_index: 0, item_id: 'fc_1', arguments: '{"a":1}' },
      { type: 'response.function_call_arguments.delta', output_index: 0, item_id: 'fc_1', delta: ' ' },
      terminal([{ ...call, arguments: '{"a":1} ', status: 'completed' }])]);
    expect(result.finishReason).toBe('error'); expect(result.message.tool_calls).toBeUndefined();
  });

  it('preserves billed length truncation when output_item.done contains incomplete JSON arguments', async () => {
    const call = { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'write', arguments: '{"path":"a"', status: 'incomplete' };
    const { result } = await read([added({ ...call, arguments: '' } as never),
      { type: 'response.function_call_arguments.delta', output_index: 0, item_id: 'fc_1', delta: call.arguments },
      { type: 'response.output_item.done', output_index: 0, item: call }, terminal([call], 'incomplete', 'max_output_tokens')]);
    expect(result.finishReason).toBe('length'); expect(result.message.tool_calls).toBeUndefined();
    expect(result.usage?.completion_tokens).toBe(12);
  });

  it('rejects replacement of already completed encrypted reasoning while allowing missing-content recovery', async () => {
    const reasoning = { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'original' };
    const { result } = await read([added(reasoning as never), { type: 'response.output_item.done', output_index: 0, item: reasoning },
      terminal([{ ...reasoning, encrypted_content: 'replacement' }])]);
    expect(result.finishReason).toBe('error'); expect(result.reasoningSignature).toBeUndefined();
  });

  it('preserves the completed output phase instead of accepting a relabelled preamble', async () => {
    const commentary = { ...item, phase: 'commentary' };
    const { result } = await read([added({ ...item, content: [] } as never),
      { type: 'response.output_item.done', output_index: 0, item: commentary }, terminal([{ ...commentary, phase: 'final_answer' }])]);
    expect(result.finishReason).toBe('error'); expect(result.reasoningSignature).toBeUndefined();
  });
});
