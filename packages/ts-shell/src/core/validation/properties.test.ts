import { describe, expect, it } from 'vitest';
import { compileValidator } from './compiler.js';

const dialects = ['https://json-schema.org/draft/2019-09/schema', 'https://json-schema.org/draft/2020-12/schema'];
describe('own dependency properties', () => {
  it.each([undefined, ...dialects])('uses defined own triggers for legacy dependencies (%s)', $schema => {
    const validate = compileValidator({ ...($schema ? { $schema } : {}), dependencies: { a: ['b'] } });
    expect(validate({ a: undefined })).toBe(true);
    expect(validate({ a: undefined, b: undefined })).toBe(true);
    expect(validate(Object.create({ a: 1 }))).toBe(true);
    expect(validate(Object.defineProperty({}, 'a', { value: 1 }))).toBe(false);
    expect(validate({ a: 1, b: undefined })).toBe(false);
    expect(validate({ a: 1, b: 0 })).toBe(true);
  });
  it.each(dialects)('uses defined own triggers for dependentRequired (%s)', $schema => {
    const validate = compileValidator({ $schema, dependentRequired: { a: ['b'] } });
    expect(validate({ a: undefined })).toBe(true);
    expect(validate(Object.defineProperty({}, 'a', { value: 1 }))).toBe(false);
    expect(validate({ a: 1, b: undefined })).toBe(false);
    expect(validate({ a: 1, b: 0 })).toBe(true);
  });
  it.each([undefined, ...dialects])('applies schema dependencies only to defined own triggers (%s)', $schema => {
    const validate = compileValidator({ ...($schema ? { $schema } : {}), dependencies: { a: false } });
    expect(validate({ a: undefined })).toBe(true);
    expect(validate(Object.create({ a: 1 }))).toBe(true);
    expect(validate(Object.defineProperty({}, 'a', { value: 1 }))).toBe(false);
    expect(validate({ a: 1 })).toBe(false);
  });
  it.each(dialects)('applies dependentSchemas only to defined own triggers (%s)', $schema => {
    const validate = compileValidator({ $schema, dependentSchemas: { a: false } });
    expect(validate({ a: undefined })).toBe(true);
    expect(validate(Object.defineProperty({}, 'a', { value: 1 }))).toBe(false);
    expect(validate({ a: 1 })).toBe(false);
  });
  it.each(dialects)('retains independent legacy and modern dependency constraints (%s)', $schema => {
    const validate = compileValidator({ $schema, dependencies: { a: ['b'] }, dependentRequired: { a: ['c'] } });
    expect(validate({ a: 1, b: 1 })).toBe(false);
    expect(validate({ a: 1, c: 1 })).toBe(false);
    expect(validate({ a: 1, b: 1, c: 1 })).toBe(true);
  });
  it.each(dialects)('keeps optional declared undefined independent of an inactive schema dependency (%s)', $schema => {
    const validate = compileValidator({ $schema, properties: { a: {} },
      dependentSchemas: { a: { properties: { b: { type: 'integer' } } } }, unevaluatedProperties: false });
    expect(validate({ a: undefined })).toBe(true);
    expect(validate({ a: undefined, b: undefined })).toBe(false);
    expect(validate({ a: 1, b: 2 })).toBe(true);
    expect(validate({ a: 1, b: '2' })).toBe(false);
  });
});
