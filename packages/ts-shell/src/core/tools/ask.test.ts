import { describe, expect, it, vi } from 'vitest';
import { createAskToolDefinition } from './ask.js';
import type { AskResponse } from './ask/contract.js';

const questions = [
  { id: 'first', question: 'Format?', options: [{ label: 'JSON' }, { label: 'YAML' }], recommended: 1 },
  { id: 'second', question: 'Notes?' },
];
const context = { taskId: 'ask-test', workspaceRoot: '/workspace' };

async function run(response: AskResponse) {
  return createAskToolDefinition().execute({ questions }, { ...context, interactiveAsk: async () => response });
}

describe('ask answer provenance', () => {
  it('preserves every submitted answer exactly', async () => {
    const result = await run({ status: 'completed', answers: { first: 'JSON', second: '  keep this  ' } });
    expect(result.success).toBe(true);
    expect(result.metadata?.ask).toEqual({ status: 'answered', responses: [
      { id: 'first', source: 'user', answer: 'JSON' }, { id: 'second', source: 'user', answer: '  keep this  ' },
    ] });
    expect(result.output).toContain('**User answer**:   keep this  ');
  });

  it('keeps partial answers without substituting recommendations', async () => {
    const result = await run({ status: 'completed', answers: { second: 'note' } });
    expect(result.success).toBe(false);
    expect(result.metadata?.ask).toEqual({ status: 'partial', responses: [
      { id: 'first', source: 'none' }, { id: 'second', source: 'user', answer: 'note' },
    ] });
    expect(result.output).toContain('No answer submitted.');
    expect(result.output).not.toContain('YAML');
  });

  it.each([{}, { first: '', second: '   ' }, { unrelated: 'yes' }, Object.create({ first: 'yes' })])(
    'treats blank, missing, foreign and inherited answers as unanswered', async answers => {
      const result = await run({ status: 'completed', answers });
      expect(result.success).toBe(false);
      expect(result.metadata?.ask).toMatchObject({ status: 'unanswered' });
      expect(result.output).not.toContain('User answer');
      expect(result.output).not.toContain('YAML');
    });

  it.each(['cancelled', 'unavailable', 'error'] as const)('retains explicit answers when response is %s', async status => {
    const result = await run({ status, answers: { first: 'JSON' } });
    expect(result.success).toBe(false);
    expect(result.metadata?.ask).toMatchObject({ status });
    expect(result.output).toContain('**User answer**: JSON');
    expect(result.output).not.toContain('YAML');
  });

  it('reports unavailable without an interaction callback', async () => {
    const result = await createAskToolDefinition().execute({ questions }, context);
    expect(result.success).toBe(false);
    expect(result.metadata?.ask).toMatchObject({ status: 'unavailable' });
    expect(result.output).not.toContain('selected default');
  });

  it('reports callback failures without exposing error contents', async () => {
    const result = await createAskToolDefinition().execute({ questions }, { ...context,
      interactiveAsk: async () => { throw new Error('PRIVATE_CALLBACK_ERROR'); },
    });
    expect(result.success).toBe(false);
    expect(result.metadata?.ask).toMatchObject({ status: 'error' });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CALLBACK_ERROR');
  });

  it('pre-cancellation does not open the UI', async () => {
    const controller = new AbortController();
    controller.abort('PRIVATE_ABORT_REASON');
    const interactiveAsk = vi.fn();
    const result = await createAskToolDefinition().execute({ questions }, { ...context, interactiveAsk, abortSignal: controller.signal });
    expect(interactiveAsk).not.toHaveBeenCalled();
    expect(result.metadata?.ask).toMatchObject({ status: 'cancelled', cancellationReason: 'parent-abort' });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_ABORT_REASON');
  });

  it('passes cancellation to the callback and does not report completion after cancellation', async () => {
    const controller = new AbortController();
    const result = await createAskToolDefinition().execute({ questions }, { ...context, abortSignal: controller.signal,
      interactiveAsk: async (_questions, signal) => {
        expect(signal).toBe(controller.signal);
        controller.abort();
        return { status: 'completed', answers: { first: 'JSON' } };
      },
    });
    expect(result.success).toBe(false);
    expect(result.metadata?.ask).toMatchObject({ status: 'cancelled' });
    expect(result.output).toContain('**User answer**: JSON');
  });

  it.each([[], [{ id: 'same', question: 'A' }, { id: 'same', question: 'B' }],
    [{ id: ' ', question: 'A' }], [{ id: 'x', question: ' ' }],
    [{ id: 'x', question: 'A', recommended: 0 }], [{ id: 'x', question: 'A', recommended: 0.5 }],
    [{ id: 'x', question: 'A', options: [{ label: 7 }] }]])('rejects invalid input before prompting', async invalid => {
    const interactiveAsk = vi.fn();
    const result = await createAskToolDefinition().execute({ questions: invalid }, { ...context, interactiveAsk });
    expect(result.success).toBe(false);
    expect(interactiveAsk).not.toHaveBeenCalled();
  });

  it('does not accept an invalid callback payload as decisions', async () => {
    const result = await run({ status: 'completed', answers: null } as unknown as AskResponse);
    expect(result.metadata?.ask).toMatchObject({ status: 'error' });
  });
});
