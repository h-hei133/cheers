import { describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import { promptInteractiveQuestions } from './interactiveAskBridge.js';
import { QuestionBridge } from './questionBridge.js';

const question = { id: 'choice', question: 'Choose?', options: [{ label: 'Apple' }, { label: 'Banana' }], recommended: 0 };
function fixture() {
  const ask = vi.fn();
  const settle = vi.fn();
  const bridge = new QuestionBridge({ ask, settle });
  const rl = bridge.asReadline(() => {});
  return { ask, settle, bridge, rl };
}

describe('interactive ask bridge', () => {
  it('reports unavailable when readline is absent', async () => {
    expect(await promptInteractiveQuestions(null, [question])).toEqual({ status: 'unavailable', answers: {} });
  });
  it('does not prompt an empty list', async () => {
    const { rl, ask } = fixture();
    expect(await promptInteractiveQuestions(rl, [])).toEqual({ status: 'completed', answers: {} });
    expect(ask).not.toHaveBeenCalled();
  });
  it.each([['2', 'Banana'], ['apple', 'Apple'], ['1junk', '1junk'], ['1.5', '1.5'], ['  custom  ', '  custom  ']])(
    'maps only complete choices and preserves free text: %s', async (input, expected) => {
      const { rl, bridge } = fixture();
      const pending = promptInteractiveQuestions(rl, [question]);
      bridge.answer(input);
      expect(await pending).toEqual({ status: 'completed', answers: { choice: expected } });
      expect(rl.listenerCount('close')).toBe(0);
      expect(rl.listenerCount('SIGINT')).toBe(0);
    });
  it('empty input does not select a recommendation', async () => {
    const { rl, bridge, ask } = fixture();
    const pending = promptInteractiveQuestions(rl, [question]);
    expect(ask.mock.calls[0]![0]).toContain('(Recommended)');
    bridge.answer('');
    expect(await pending).toEqual({ status: 'completed', answers: {} });
  });
  it('preserves question IDs including whitespace and prototype-like keys', async () => {
    const { rl, bridge } = fixture();
    const pending = promptInteractiveQuestions(rl, [{ ...question, id: '__proto__' }, { ...question, id: ' spaced ' }]);
    bridge.answer('2');
    await Promise.resolve();
    bridge.answer('1');
    const result = await pending;
    expect(Object.hasOwn(result.answers, '__proto__')).toBe(true);
    expect(result.answers['__proto__']).toBe('Banana');
    expect(result.answers[' spaced ']).toBe('Apple');
  });
  it.each(['abort', 'abandon', 'close'] as const)('keeps earlier answers on %s and clears pending UI', async action => {
    const { rl, bridge, ask, settle } = fixture();
    const controller = new AbortController();
    const pending = promptInteractiveQuestions(rl, [question, { id: 'next', question: 'Next?' }, { id: 'last', question: 'Last?' }], controller.signal);
    bridge.answer('2');
    await Promise.resolve();
    expect(ask).toHaveBeenCalledTimes(2);
    if (action === 'abort') controller.abort();
    else if (action === 'abandon') bridge.abandon();
    else rl.close();
    expect(await pending).toEqual({ status: 'cancelled', answers: { choice: 'Banana' },
      cancellationReason: action === 'abort' ? 'parent-abort' : action === 'abandon' ? 'user-cancelled' : 'input-closed' });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(settle).toHaveBeenCalledTimes(2);
    expect(bridge.question()).toBeUndefined();
    expect(bridge.answer('late answer')).toBe(false);
    expect(rl.listenerCount('close')).toBe(0);
    expect(rl.listenerCount('SIGINT')).toBe(0);
  });
  it('abandoning a single question does not fabricate a negative answer', async () => {
    const { rl, bridge } = fixture();
    const pending = promptInteractiveQuestions(rl, [question]);
    bridge.abandon();
    expect(await pending).toEqual({ status: 'cancelled', answers: {}, cancellationReason: 'user-cancelled' });
  });
  it('does not overwrite an existing pending confirmation', async () => {
    const { rl, bridge } = fixture();
    const answer = vi.fn();
    rl.question('Existing approval?', answer);
    expect(await promptInteractiveQuestions(rl, [question])).toEqual({ status: 'error', answers: {} });
    expect(bridge.question()).toBe('Existing approval?');
    bridge.answer('n');
    expect(answer).toHaveBeenCalledWith('n');
  });
  it('pre-cancellation does not display a question', async () => {
    const { rl, ask } = fixture();
    const controller = new AbortController(); controller.abort();
    expect(await promptInteractiveQuestions(rl, [question], controller.signal)).toEqual({ status: 'cancelled', answers: {}, cancellationReason: 'parent-abort' });
    expect(ask).not.toHaveBeenCalled();
  });
  it('retains answers when a later prompt throws', async () => {
    const { rl, bridge, ask } = fixture();
    const pending = promptInteractiveQuestions(rl, [question, { id: 'next', question: 'Next?' }]);
    ask.mockImplementationOnce(() => { throw new Error('PRIVATE_UI_ERROR'); });
    bridge.answer('2');
    expect(await pending).toEqual({ status: 'error', answers: { choice: 'Banana' } });
    expect(bridge.question()).toBeUndefined();
  });
  it('cancels a real readline question and permits a subsequent question', async () => {
    const input = new PassThrough(); const output = new PassThrough();
    const rl = createInterface({ input, output, terminal: false });
    try {
      const controller = new AbortController();
      const pending = promptInteractiveQuestions(rl, [question], controller.signal);
      controller.abort();
      expect(await pending).toEqual({ status: 'cancelled', answers: {}, cancellationReason: 'parent-abort' });
      const next = promptInteractiveQuestions(rl, [question]);
      input.write('2\n');
      expect(await next).toEqual({ status: 'completed', answers: { choice: 'Banana' } });
    } finally { rl.close(); input.destroy(); output.destroy(); }
  });
});
