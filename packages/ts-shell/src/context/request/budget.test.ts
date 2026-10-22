import { expect, it } from 'vitest';
import type { AgentMessage } from '../../core/agent/state.js';
import { promptTokensFor, requestBudget } from './budget.js';

it('admits equality and rejects one token over the shared window', () => {
  expect(requestBudget({ window: 100, promptTokens: 60, outputTokens: 20, reserveTokens: 20, measured: true }))
    .toMatchObject({ ok: true, remaining: 0, soft: true, availableInput: 60, softLimit: 60 });
  expect(requestBudget({ window: 100, promptTokens: 0, outputTokens: 100, reserveTokens: 0, measured: true }))
    .toMatchObject({ ok: true, remaining: 0, availableInput: 0 });
  expect(requestBudget({ window: 100, promptTokens: 61, outputTokens: 20, reserveTokens: 20, measured: true }))
    .toMatchObject({ ok: false, reason: 'window' });
});

it('rejects output or reserve that leaves no input space', () => {
  expect(requestBudget({ window: 100, promptTokens: 1, outputTokens: 100, measured: false })).toMatchObject({ ok: false, reason: 'window' });
  expect(requestBudget({ window: 100, promptTokens: 1, outputTokens: 10, reserveTokens: 100, measured: false })).toMatchObject({ ok: false, reason: 'window' });
  expect(requestBudget({ window: 100, promptTokens: 0, outputTokens: 10, reserveTokens: 90, measured: false })).toMatchObject({ ok: true, availableInput: 0 });
});

it('enforces an independent input limit', () => {
  expect(requestBudget({ window: 1000, inputLimit: 100, promptTokens: 95, outputTokens: 10, reserveTokens: 10, measured: true }))
    .toMatchObject({ ok: false, reason: 'input' });
  expect(requestBudget({ window: 1000, inputLimit: 200, promptTokens: 95, outputTokens: 10, reserveTokens: 10, measured: true }))
    .toMatchObject({ ok: true });
  expect(requestBudget({ window: 1000, inputLimit: 120, promptTokens: 95, outputTokens: 10, reserveTokens: 10, measured: true }))
    .toMatchObject({ ok: true, softLimit: 110, availableInput: 110 });
  expect(requestBudget({ window: undefined, inputLimit: 100, promptTokens: 95, outputTokens: undefined, reserveTokens: 10, measured: true }))
    .toMatchObject({ ok: false, reason: 'input' });
});

it('clamps the soft band to the available input budget', () => {
  const wide = requestBudget({ window: 1000, promptTokens: 800, outputTokens: 100, reserveTokens: 0, measured: true });
  expect(wide).toMatchObject({ ok: true, softLimit: 900, soft: false });
  const narrow = requestBudget({ window: 1000, promptTokens: 700, outputTokens: 250, reserveTokens: 0, measured: true });
  expect(narrow).toMatchObject({ ok: true, softLimit: 750, soft: false, availableInput: 750 });
  expect(requestBudget({ window: 1000, promptTokens: 950, outputTokens: 10, reserveTokens: 0, measured: true }))
    .toMatchObject({ ok: true, softLimit: 900, soft: true });
});

it('refuses to prove a budget without complete integer limits', () => {
  for (const input of [
    { window: undefined, promptTokens: 1, outputTokens: 1, measured: false },
    { window: 100, promptTokens: 1.5, outputTokens: 1, measured: false },
    { window: 100, promptTokens: 1, outputTokens: undefined, measured: false },
    { window: undefined, inputLimit: 100, promptTokens: 1, outputTokens: undefined, measured: false },
    { window: 100, promptTokens: 1, outputTokens: 1, reserveTokens: -1, measured: false },
  ]) expect(requestBudget(input as never)).toMatchObject({ ok: false, reason: 'unknown' });
});

it('counts only the messages after a measured prefix', () => {
  const message = (content: string): AgentMessage => ({ role: 'user', content });
  const messages = [message('a'.repeat(350)), message('b'.repeat(350)), message('c'.repeat(350))];
  expect(promptTokensFor({ messages, measured: { tokens: 500, messageCount: 2 } }).tokens).toBe(600);
  expect(promptTokensFor({ messages, measured: { tokens: 500, messageCount: 9 } }).tokens).toBe(500);
  expect(promptTokensFor({ messages })).toMatchObject({ tokens: 300, measured: false });
});
