import { describe, expect, it } from 'vitest';
import { compileValidator } from './compiler.js';

describe('strict schema applicability', () => {
  it.each([
    { then: { required: ['value'] } },
    { else: false },
    { if: { type: 'integer' } },
    { additionalItems: false },
    { type: 'array', items: { type: 'integer' }, additionalItems: false },
    { type: 'object', properties: { value: { type: 'integer' } }, patternProperties: { '^value$': { type: 'string' } } },
    { $schema: 'https://json-schema.org/draft/2019-09/schema', minContains: 1 },
    { $schema: 'https://json-schema.org/draft/2020-12/schema', maxContains: 2 },
    { $schema: 'https://json-schema.org/draft/2020-12/schema', contains: { type: 'integer' }, minContains: 0 },
    { $schema: 'https://json-schema.org/draft/2019-09/schema', contains: { type: 'integer' }, minContains: 2, maxContains: 1 },
  ])('refuses ignored or contradictory constraints before data validation', schema => {
    expect(() => compileValidator(schema)).toThrow(/invalid or unsupported/);
  });

  it('keeps meaningful conditionals, tuple tails and nonoverlapping patterns available', () => {
    const conditional = compileValidator({ type: 'object', if: { required: ['value'] }, then: { properties: { value: { type: 'integer' } } } });
    expect(conditional({})).toBe(true);
    expect(conditional({ value: '1' })).toBe(false);
    const tuple = compileValidator({ type: 'array', items: [{ type: 'integer' }], additionalItems: false });
    expect(tuple([1])).toBe(true);
    expect(tuple([1, 2])).toBe(false);
    const patterns = compileValidator({ type: 'object', properties: { value: { type: 'integer' } }, patternProperties: { '^other-': { type: 'string' } } });
    expect(patterns({ value: 1, 'other-key': 'yes' })).toBe(true);
    expect(patterns({ value: 1, 'other-key': 1 })).toBe(false);
  });
});
