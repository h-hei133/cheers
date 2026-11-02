import { expect, it } from 'vitest';
import { summaryBudget } from './budget.js';
import { requestBudget } from '../../../context/request/budget.js';

it('reserves independent summary output and carried-summary space inside a small window', () => {
  const budget = summaryBudget({ contextWindow: 10_000, reserveTokens: 500, providerOwnedOutput: false });
  expect(budget.maxOutputTokens).toBe(2_375);
  expect(budget.segmentTokens).toBeGreaterThan(0);
  expect(requestBudget({ window: 10_000, reserveTokens: 500, outputTokens: budget.maxOutputTokens,
    promptTokens: budget.segmentTokens + budget.maxOutputTokens! + 1_024, measured: false }).ok).toBe(true);
});

it('uses the declared summary model output ceiling instead of exceeding it', () => {
  const budget = summaryBudget({ contextWindow: 40_000, maxOutputCeiling: 2_048,
    reserveTokens: 2_000, providerOwnedOutput: false });
  expect(budget.maxOutputTokens).toBe(2_048);
  expect(budget.segmentTokens).toBe(16_000);
});

it('honors a separate input limit while reserving the previous summary', () => {
  const budget = summaryBudget({ contextWindow: 100_000, inputLimit: 15_000,
    reserveTokens: 2_000, providerOwnedOutput: false });
  expect(budget.maxOutputTokens).toBe(3_250);
  expect(budget.segmentTokens).toBe(6_980);
  expect(requestBudget({ window: 100_000, inputLimit: 15_000, outputTokens: budget.maxOutputTokens,
    reserveTokens: 2_000, promptTokens: budget.segmentTokens + budget.maxOutputTokens! + 1_024, measured: false }).ok).toBe(true);
});

it('gives summary merges their whole input allowance without charging a third carried summary', () => {
  const budget = summaryBudget({ contextWindow: 10_000, reserveTokens: 500, providerOwnedOutput: false });
  expect(budget.mergeTokens).toBeGreaterThan(2 * budget.maxOutputTokens!);
  expect(budget.mergeTokens).toBeGreaterThan(budget.segmentTokens);
  expect(requestBudget({ window: 10_000, outputTokens: budget.maxOutputTokens, reserveTokens: 500,
    promptTokens: budget.mergeTokens + 1_024, measured: false }).ok).toBe(true);
});

it('leaves provider-owned output unset while using its declared ceiling to pack input', () => {
  const budget = summaryBudget({ contextWindow: 40_000, maxOutputCeiling: 8_192,
    reserveTokens: 2_000, providerOwnedOutput: true });
  expect(budget.maxOutputTokens).toBeUndefined();
  expect(budget.segmentTokens).toBe(16_000);
});

it.each([40_000, 200_000])('keeps unknown provider-owned output distinct from its theoretical ceiling in a %s-token window', contextWindow => {
  const budget = summaryBudget({ contextWindow, inputLimit: 272_000, maxOutputCeiling: 128_000,
    reserveTokens: 2_000, providerOwnedOutput: true });
  expect(budget.maxOutputTokens).toBeUndefined();
  expect(budget.segmentTokens).toBe(16_000);
  expect(budget.mergeTokens).toBeGreaterThanOrEqual(16_000);
});
