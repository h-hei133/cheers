import { expect, it, vi } from 'vitest';
import type { CompactionPolicy } from '../../session/compaction.js';
import { createCompactionMeasurement } from './measurement.js';

it('records actual evaluator fallback once and clears it on a later measurement', () => {
  const diagnostic = createCompactionMeasurement();
  const owner = {};
  let result: number | undefined;
  const evaluator = vi.fn(() => result);
  diagnostic.reset(owner);
  const policy = diagnostic.wrap({ contextWindow: 64000, measureContextTokens: evaluator }, owner);
  expect(diagnostic.read(owner)).toBeUndefined();
  expect(policy.measureContextTokens?.([])).toBeUndefined();
  const fallback = diagnostic.read(owner);
  expect(fallback).toEqual({ source: 'estimated', reason: 'The compaction evaluator could not use a current provider measurement.' });
  policy.measureContextTokens?.([]);
  expect(diagnostic.read(owner)).toBe(fallback);
  result = 0;
  expect(policy.measureContextTokens?.([])).toBe(0);
  expect(diagnostic.read(owner)).toEqual({ source: 'measured' });
  expect(evaluator).toHaveBeenCalledTimes(3);
});

it('preserves live policy getters and the evaluator receiver even when the input policy is frozen', () => {
  const diagnostic = createCompactionMeasurement();
  const owner = {};
  let schema = 'first';
  const original: CompactionPolicy = Object.freeze({ contextWindow: 64000,
    get promptIdentity() { return { schemaDigest: schema }; },
    get overhead() { return { systemPrompt: schema }; },
    measureContextTokens(this: CompactionPolicy) { return this.promptIdentity?.schemaDigest === schema ? 300 : undefined; } });
  diagnostic.reset(owner);
  const wrapped = diagnostic.wrap(original, owner);
  schema = 'changed';
  expect(wrapped.promptIdentity).toEqual({ schemaDigest: 'changed' });
  expect(wrapped.overhead).toEqual({ systemPrompt: 'changed' });
  expect(wrapped.measureContextTokens?.([], wrapped.promptIdentity)).toBe(300);
  expect(Object.getOwnPropertyDescriptor(wrapped, 'promptIdentity')?.get)
    .toBe(Object.getOwnPropertyDescriptor(original, 'promptIdentity')?.get);
});

it('does not let an older evaluator republish after a new resource owner replaces it', () => {
  const diagnostic = createCompactionMeasurement();
  const first = {}, second = {};
  diagnostic.reset(first);
  const old = diagnostic.wrap({ contextWindow: 64000, measureContextTokens: () => undefined }, first);
  old.measureContextTokens?.([]);
  diagnostic.reset(second);
  old.measureContextTokens?.([]);
  expect(diagnostic.read(first)).toBeUndefined();
  expect(diagnostic.read(second)).toBeUndefined();
  const current = diagnostic.wrap({ contextWindow: 64000, measureContextTokens: () => 100 }, second);
  current.measureContextTokens?.([]);
  expect(diagnostic.read(second)).toEqual({ source: 'measured' });
});

it('propagates evaluator exceptions without inventing a fallback outcome', () => {
  const diagnostic = createCompactionMeasurement();
  const owner = {};
  diagnostic.reset(owner);
  const policy = diagnostic.wrap({ contextWindow: 64000, measureContextTokens: () => { throw new Error('fixture failure'); } }, owner);
  expect(() => policy.measureContextTokens?.([])).toThrow('fixture failure');
  expect(diagnostic.read(owner)).toBeUndefined();
});

it('invalidates observed diagnostics when the current request or context revision changes', () => {
  const owner = {};
  let anchor: object | undefined;
  const diagnostic = createCompactionMeasurement(() => [anchor]);
  diagnostic.reset(owner);
  const policy = diagnostic.wrap({ contextWindow: 64000, measureContextTokens: () => undefined }, owner);
  policy.measureContextTokens?.([]);
  expect(diagnostic.read(owner)?.source).toBe('estimated');
  expect(diagnostic.read(owner)?.source).toBe('estimated');
  anchor = {};
  expect(diagnostic.read(owner)).toBeUndefined();
  policy.measureContextTokens?.([]);
  expect(diagnostic.read(owner)?.source).toBe('estimated');
});
