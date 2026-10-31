import { expect, it } from 'vitest';
import { countRequestText } from './tokenizer.js';

it.each(['cl100k_base', 'o200k_base'] as const)('counts published %s text vectors without a character heuristic', encoding => {
  expect(countRequestText(['hello world'], encoding)).toEqual({ tokens: 2, method: encoding });
  expect(countRequestText(['antidisestablishmentarianism'], encoding).tokens).toBe(6);
  expect(countRequestText([''], encoding).tokens).toBe(0);
  expect(countRequestText(['hello', 'hello'], encoding).tokens).toBe(2);
  expect(countRequestText(['literal <|endoftext|>'], encoding).tokens).toBeGreaterThan(1);
});

it('keeps vocabularies separate across Unicode counts and model switches', () => {
  for (const encoding of ['cl100k_base', 'o200k_base', 'cl100k_base'] as const) {
    expect(countRequestText(['お誕生日おめでとう'], encoding).tokens).toBe(encoding === 'cl100k_base' ? 9 : 8);
    expect(countRequestText(['😀'], encoding).tokens).toBe(encoding === 'cl100k_base' ? 2 : 1);
  }
});

it.each([undefined, false, 'unregistered', 'gpt-5.3-codex', { encoding: 'o200k_base' }])(
  'retains the existing estimate for undeclared or unsupported vocabularies: %s', encoding => {
    expect(countRequestText(['1234', '567'], encoding)).toEqual({ tokens: 2, method: 'characters/3.5' });
  });
