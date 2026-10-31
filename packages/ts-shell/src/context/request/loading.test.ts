import { createRequire } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('gpt-tokenizer/bpeRanks/cl100k_base');
  vi.doUnmock('gpt-tokenizer/bpeRanks/o200k_base');
  vi.resetModules();
});

it('loads no rank table for fallback, then initializes only the selected vocabulary', async () => {
  const nativeRequire = createRequire(import.meta.url);
  const cl100k = nativeRequire.resolve('gpt-tokenizer/bpeRanks/cl100k_base');
  const o200k = nativeRequire.resolve('gpt-tokenizer/bpeRanks/o200k_base');
  delete nativeRequire.cache[cl100k]; delete nativeRequire.cache[o200k];
  // Eager ESM rank imports must fail as well as eager CommonJS initialization.
  vi.doMock('gpt-tokenizer/bpeRanks/cl100k_base', () => { throw new Error('Vocabulary loaded before selection.'); });
  vi.doMock('gpt-tokenizer/bpeRanks/o200k_base', () => { throw new Error('Vocabulary loaded before selection.'); });
  vi.resetModules();
  const { countRequestText } = await import('./tokenizer.js');
  for (const encoding of [undefined, false, 'unsupported']) {
    expect(countRequestText(['1234567'], encoding)).toEqual({ tokens: 2, method: 'characters/3.5' });
  }
  expect(nativeRequire.cache[cl100k]).toBeUndefined();
  expect(nativeRequire.cache[o200k]).toBeUndefined();
  expect(countRequestText(['お誕生日おめでとう'], 'cl100k_base')).toEqual({ tokens: 9, method: 'cl100k_base' });
  const loaded = nativeRequire.cache[cl100k];
  expect(loaded).toBeDefined();
  expect(nativeRequire.cache[o200k]).toBeUndefined();
  expect(countRequestText(['hello world'], 'cl100k_base').tokens).toBe(2);
  expect(nativeRequire.cache[cl100k]).toBe(loaded);
  expect(countRequestText(['お誕生日おめでとう'], 'o200k_base')).toEqual({ tokens: 8, method: 'o200k_base' });
  expect(nativeRequire.cache[o200k]).toBeDefined();
});
