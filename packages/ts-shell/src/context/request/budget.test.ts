import { expect, it } from 'vitest';
import type { AgentMessage } from '../../core/agent/state.js';
import { promptTokensFor, requestBudget, requestBudgetLimits } from './budget.js';

it('admits equality and rejects one token over the shared window', () => {
  expect(requestBudget({ window: 100, promptTokens: 60, outputTokens: 20, reserveTokens: 20, measured: true }))
    .toMatchObject({ ok: true, remaining: 0, soft: true, availableInput: 60, softLimit: 48 });
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
    .toMatchObject({ ok: true, softLimit: 88, availableInput: 110 });
  expect(requestBudget({ window: undefined, inputLimit: 100, promptTokens: 95, outputTokens: undefined, reserveTokens: 10, measured: true }))
    .toMatchObject({ ok: false, reason: 'input' });
});

it('keeps advance margin inside the available input budget', () => {
  const wide = requestBudget({ window: 1000, promptTokens: 700, outputTokens: 100, reserveTokens: 0, measured: true });
  expect(wide).toMatchObject({ ok: true, softLimit: 720, soft: false });
  const narrow = requestBudget({ window: 1000, promptTokens: 599, outputTokens: 250, reserveTokens: 0, measured: true });
  expect(narrow).toMatchObject({ ok: true, softLimit: 600, soft: false, availableInput: 750 });
  expect(requestBudget({ window: 1000, promptTokens: 600, outputTokens: 250, measured: true }))
    .toMatchObject({ ok: true, softLimit: 600, soft: true });
  expect(requestBudget({ window: 1000, promptTokens: 950, outputTokens: 10, reserveTokens: 0, measured: true }))
    .toMatchObject({ ok: true, softLimit: 792, soft: true });
  expect(requestBudget({ window: 1000, promptTokens: 500, outputTokens: 10, softFraction: 0.5, measured: true }))
    .toMatchObject({ ok: true, softLimit: 500, soft: true });
});

it.each([
  [20_000, 7_904, 6_323],
  [64_000, 51_904, 41_523],
  [120_960, 108_864, 87_091],
  [121_000, 108_904, 87_123],
  [1_000_000, 987_904, 790_323],
])('leaves a reachable compaction band in a %i-token window', (window, availableInput, softLimit) => {
  expect(availableInput - softLimit).toBeGreaterThan(0);
  const input = { window, outputTokens: 4_096, reserveTokens: 8_000, measured: false };
  expect(requestBudget({ ...input, promptTokens: softLimit - 1 }))
    .toMatchObject({ ok: true, availableInput, softLimit, soft: false });
  expect(requestBudget({ ...input, promptTokens: softLimit }))
    .toMatchObject({ ok: true, availableInput, softLimit, soft: true });
  expect(requestBudget({ ...input, promptTokens: availableInput }))
    .toMatchObject({ ok: true, remaining: 0, soft: true });
});

it('retains a proven input ceiling without inventing a provider-selected output limit', () => {
  expect(requestBudgetLimits({ window: 64_000, inputLimit: 50_000, outputTokens: undefined, reserveTokens: 8_000 }))
    .toEqual({ availableInput: 42_000, softLimit: 33_600 });
  expect(requestBudgetLimits({ window: 64_000, outputTokens: undefined, reserveTokens: 8_000 })).toBeUndefined();
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
