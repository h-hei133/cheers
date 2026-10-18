import { expect, it, vi } from 'vitest';
import { requestCompactionSummary } from '../../core/query/compaction/summarize.js';
import type { ModelTransport } from '../../core/agent/request/model.js';

const provider = { headers: {}, baseUrl: 'https://synthetic.invalid', model: 'synthetic' };
it('arms the durable claim immediately inside the actual transport handoff chain', async () => {
  const events: string[] = [];
  const transport: ModelTransport = async (_input, _init, handoff) => {
    expect(events).toEqual(['reserved']);
    handoff();
    expect(events).toEqual(['reserved', 'attempt-dispatched', 'claim-dispatched']);
    events.push('http');
    return new Response(JSON.stringify({ choices: [{ message: { content: 'summary' } }], usage: { prompt_tokens: 8, completion_tokens: 2 } }));
  };
  await requestCompactionSummary({ provider, fetchImpl: vi.fn() as never, messages: [], modelTransport: transport,
    dispatch: { dispatch: () => { events.push('claim-dispatched'); } },
    onUsage: () => { events.push('usage'); },
    requestPolicy: { reserve: () => { events.push('reserved'); return { id: 'attempt', dispatch: () => { events.push('attempt-dispatched'); },
      confirmUnsent: () => { events.push('unsent'); }, settle: () => { events.push('settled'); } }; } } });
  expect(events).toEqual(['reserved', 'attempt-dispatched', 'claim-dispatched', 'http', 'usage', 'settled']);
});

it('does not arm a claim when transport fails before handoff', async () => {
  const dispatch = vi.fn();
  const unsent = vi.fn();
  await expect(requestCompactionSummary({ provider, fetchImpl: vi.fn() as never, messages: [],
    modelTransport: async () => { throw new Error('local refused'); }, dispatch: { dispatch },
    requestPolicy: { reserve: () => ({ id: 'attempt', dispatch: vi.fn(), confirmUnsent: unsent, settle: vi.fn() }) } }))
    .rejects.toThrow('local refused');
  expect(dispatch).not.toHaveBeenCalled();
  expect(unsent).toHaveBeenCalledOnce();
});
