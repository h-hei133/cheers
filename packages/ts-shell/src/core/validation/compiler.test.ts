import { describe, expect, it } from 'vitest';
import { compileValidator } from './compiler.js';

const dialects = [undefined, 'https://json-schema.org/draft/2019-09/schema', 'https://json-schema.org/draft/2020-12/schema'];
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties, additionalProperties: false });

describe('runtime schema admission', () => {
  it.each(dialects)('validates full compound contracts with %s without changing data', $schema => {
    const schema = { ...object({ items: { type: 'array', items: { type: 'integer', minimum: 1 }, minItems: 1 },
      email: { type: 'string', format: 'email' }, choice: { oneOf: [{ const: 'first' }, { const: 'second' }] } }),
      ...($schema ? { $schema } : {}), required: ['items'] };
    const validate = compileValidator(schema);
    const input = { items: ['2'], email: 'PRIVATE_INPUT_MARKER', choice: 'first' };
    expect(validate(input)).toBe(false);
    expect(input).toEqual({ items: ['2'], email: 'PRIVATE_INPUT_MARKER', choice: 'first' });
    expect(JSON.stringify(validate.errors)).not.toContain('PRIVATE_INPUT_MARKER');
    expect(validate({ items: [2], email: 'a@example.org', choice: 'second' })).toBe(true);
  });

  it.each([{ unknownConstraint: true }, { type: 'bad' }, { required: null }, { type: 'object', properties: { nested: { type: null } } },
    { $async: true }, { type: 'string', format: 'PRIVATE_FORMAT_MARKER' }, { type: 'string', pattern: '[' },
    { $schema: 'https://unknown.invalid/schema' }, { $ref: 'https://missing.invalid/PRIVATE_REFERENCE_MARKER' },
    { $ref: '#/$defs/known', $defs: { known: { type: 'object' } }, ignoredConstraint: true }])(
    'refuses invalid or unsupported schema before data effects', schema => {
      let thrown: unknown;
      try { compileValidator(schema); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(Error);
      expect(String(thrown)).not.toContain('PRIVATE_');
    },
  );

  it('keeps nullable and explicit zero constraints without defaults or coercion', () => {
    const validate = compileValidator(object({ name: { type: 'string', nullable: true }, count: { type: 'integer', maximum: 0, default: 0 } }));
    const input = { name: null };
    expect(validate(input)).toBe(true);
    expect(input).toEqual({ name: null });
    expect(validate({ name: null, count: '0' })).toBe(false);
    expect(validate({ name: null, count: 0 })).toBe(true);
  });

  it('allows extension annotations only when authorized and keeps them inert', () => {
    const schema = { ...object({ 'x-value': { type: 'integer', 'x-description': { $async: true } } }), 'x-options': true };
    expect(() => compileValidator(schema)).toThrow();
    const compileOutput = (value: unknown) => compileValidator(value, { allowExtensionAnnotations: true });
    const validate = compileOutput(schema);
    expect(validate({ 'x-value': 1 })).toBe(true);
    expect(validate({ 'x-value': '1' })).toBe(false);
    expect(schema['x-options']).toBe(true);
    expect(schema.properties['x-value']).toHaveProperty('x-description');
    expect(() => compileOutput({ $ref: '#/x-contract', 'x-contract': { type: 'integer' } })).toThrow();
  });

  it('uses own properties and preserves direct optional-undefined compatibility', () => {
    const required = compileValidator({ type: 'object', required: ['value'] });
    expect(required(Object.create({ value: 1 }))).toBe(false);
    expect(compileValidator(object({}))(Object.create({ inherited: 1 }))).toBe(true);
    expect(compileValidator(object({}))({ [Symbol('metadata')]: 1 })).toBe(true);
    expect(compileValidator(object({ value: { type: 'number' } }))({ value: undefined })).toBe(true);
    expect(compileValidator(object({}))({ extra: undefined })).toBe(false);
    expect(compileValidator(object({}))({ _id: 'must-be-refused' })).toBe(false);
    expect(compileValidator(object({ values: { type: 'array', items: { type: 'integer' } } }))({ values: [undefined] })).toBe(false);
    expect(compileValidator(object({ value: { type: 'number' } }))({ value: NaN })).toBe(false);
    expect(compileValidator(object({ value: {} }))({ value: Infinity })).toBe(true);
  });

  it('validates nonenumerable own fields without borrowing inherited values', () => {
    const validate = compileValidator({ type: 'object', required: ['value'], properties: { value: { type: 'integer' } } });
    const own = Object.defineProperty({}, 'value', { value: '1' });
    expect(validate(own)).toBe(false);
    expect(validate(Object.defineProperty({}, 'value', { value: 1 }))).toBe(true);
    expect(validate(Object.create({ value: 1 }))).toBe(false);
  });

  it('isolates captured schema bytes and never invokes getters or serialization hooks', () => {
    let invoked = 0;
    const schema = object({ value: { type: 'integer' } });
    const first = compileValidator(schema);
    (schema.properties.value as Record<string, unknown>).type = 'string';
    const second = compileValidator(schema);
    expect(first({ value: 1 })).toBe(true);
    expect(first({ value: '1' })).toBe(false);
    expect(second({ value: 1 })).toBe(false);
    expect(second({ value: '1' })).toBe(true);
    expect(() => compileValidator({ get type() { invoked++; throw new Error('PRIVATE_SCHEMA_MARKER'); } })).toThrow();
    const getter = Object.defineProperty({}, 'value', { enumerable: true, get() { invoked++; return 1; } });
    expect(first(getter)).toBe(false);
    expect(invoked).toBe(0);
  });

  it('resolves escaped pointers and keeps duplicate resources isolated', () => {
    const schema = { ...object({ value: { $ref: '#/$defs/a~1b~0c' } }), $defs: { 'a/b~c': { type: 'integer' } } };
    expect(compileValidator(schema)({ value: 1 })).toBe(true);
    expect(compileValidator(schema)({ value: '1' })).toBe(false);
    expect(() => compileValidator({ $id: 'https://fixture.invalid/root', $defs: {
      first: { $id: 'child', type: 'integer' }, second: { $id: 'child', type: 'string' },
    }, $ref: 'child' })).toThrow();
    const first = compileValidator({ $id: 'https://fixture.invalid/same', type: 'integer' });
    const second = compileValidator({ $id: 'https://fixture.invalid/same', type: 'string' });
    expect(first(1)).toBe(true);
    expect(second(1)).toBe(false);
  });

  it.each(dialects.slice(1))('preserves compound evaluated properties in %s', $schema => {
    const validate = compileValidator({ $schema, type: 'object', anyOf: [
      { properties: { a: { type: 'integer' } }, required: ['a'] },
      { properties: { b: { type: 'integer' } }, required: ['b'] },
    ], unevaluatedProperties: false });
    expect(validate({ a: 1, b: 2 })).toBe(true);
    expect(validate({ a: 1, extra: true })).toBe(false);
    expect(validate({ a: 1, extra: undefined })).toBe(false);
  });

  it('keeps recursive 2019-09 and dynamic 2020-12 constraints through nested values', () => {
    const recursive = compileValidator({ $schema: dialects[1], $id: 'https://fixture.invalid/tree', $recursiveAnchor: true,
      ...object({ n: { type: 'integer' }, child: { $recursiveRef: '#' } }) });
    expect(recursive({ n: 1, child: { n: 2 } })).toBe(true);
    expect(recursive({ n: 1, child: { n: 'wrong' } })).toBe(false);
    const dynamic = compileValidator({ $schema: dialects[2], ...object({ n: { $dynamicRef: '#/$defs/n' } }), $defs: { n: { type: 'integer' } } });
    expect(dynamic({ n: 1 })).toBe(true);
    expect(dynamic({ n: 'wrong' })).toBe(false);
  });

  it('admits actual references into annotation values through the same strict schema boundary', () => {
    const validate = compileValidator({ $ref: '#/default', default: { type: 'object', properties: { n: { type: 'integer' } } } });
    expect(validate({ n: 1 })).toBe(true);
    expect(validate({ n: 'wrong' })).toBe(false);
    expect(() => compileValidator({ $ref: '#/default', default: { unknownConstraint: true } })).toThrow();
  });

  it('resolves bundled standard grammar references without external retrieval', () => {
    const validate = compileValidator({ $ref: 'http://json-schema.org/draft-07/schema#' });
    expect(validate({ type: 'integer' })).toBe(true);
    expect(validate({ required: null })).toBe(false);
    expect(() => compileValidator({ $ref: 'https://missing.invalid/PRIVATE_REFERENCE_MARKER' })).toThrow();
  });
});
