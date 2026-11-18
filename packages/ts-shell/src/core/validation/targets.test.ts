import { describe, expect, it } from 'vitest';
import { compileValidator } from './compiler.js';

describe('reference target admission', () => {
  it('admits a reached default schema without applying parameter defaults', () => {
    const schema = { default: { type: 'object', properties: { value: { type: 'integer', default: 2 } }, required: ['value'] }, $ref: '#/default' };
    const validate = compileValidator(schema);
    const missing = {};
    expect(validate(missing)).toBe(false);
    expect(missing).toEqual({});
    expect(validate({ value: 1 })).toBe(true);
    expect(validate({ value: '1' })).toBe(false);
    expect(schema.default.properties.value.default).toBe(2);
  });

  it('rejects unknown keywords in a reached annotation target', () => {
    expect(() => compileValidator({ default: { unknownConstraint: true }, $ref: '#/default' })).toThrow();
    // An unreferenced default remains arbitrary annotation data.
    expect(compileValidator({ default: { unknownConstraint: true } })(false)).toBe(true);
  });

  it('uses immutable built-in metaschemas through their original local identifiers', () => {
    const schema = { $ref: 'http://json-schema.org/draft-07/schema#' };
    const first = compileValidator(schema);
    expect(first({ minLength: 0 })).toBe(true);
    expect(first({ minLength: -1 })).toBe(false);
    expect(first({ type: null })).toBe(false);
    expect(first({ properties: { value: { type: null } } })).toBe(false);
    const second = compileValidator(schema);
    expect(second({ minLength: 0 })).toBe(true);
    expect(first({ minLength: -1 })).toBe(false);
  });

  it('keeps unknown external references unavailable before validation', () => {
    expect(() => compileValidator({ $ref: 'https://unknown.invalid/PRIVATE_TARGET' })).toThrow();
  });

  it('admits one repeated target in its enclosing resource scope', () => {
    const validate = compileValidator({
      $id: 'https://fixture.invalid/base/',
      default: {
        $id: 'selected', type: 'object', properties: { value: { $ref: '#/$defs/value' } },
        $defs: { value: { type: 'integer' } }, required: ['value'],
      },
      allOf: [{ $ref: '#/default' }, { $ref: '#/default' }],
    });
    expect(validate({ value: 1 })).toBe(true);
    expect(validate({ value: '1' })).toBe(false);
  });

  it('admits reached boolean targets', () => {
    expect(compileValidator({ default: false, $ref: '#/default' })(false)).toBe(false);
    expect(compileValidator({ default: true, $ref: '#/default' })(false)).toBe(true);
  });
});
