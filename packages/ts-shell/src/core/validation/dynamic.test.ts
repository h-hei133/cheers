import { expect, it } from 'vitest';
import { compileValidator } from './compiler.js';

it.each([
  ['https://json-schema.org/draft/2020-12/schema', '$dynamicRef'],
  ['https://json-schema.org/draft/2019-09/schema', '$recursiveRef'],
])('enforces each adjacent reference in %s', ($schema, keyword) => {
  const validate = compileValidator({ $schema, $defs: { integer: { type: 'integer' }, anything: {} },
    $ref: '#/$defs/integer', [keyword]: '#/$defs/anything' });
  expect(validate(1)).toBe(true);
  expect(validate('wrong')).toBe(false);
});

it('does not let an unrelated dynamic anchor replace a plain reference target', () => {
  const validate = compileValidator({ $schema: 'https://json-schema.org/draft/2020-12/schema',
    $dynamicAnchor: 'unrelated', type: 'object', properties: { value: { $dynamicRef: '#/$defs/integer' } },
    $defs: { integer: { type: 'integer' } } });
  expect(validate({ value: 1 })).toBe(true);
  expect(validate({ value: { arbitrary: true } })).toBe(false);
});

it('uses only the matching dynamic anchor in an entered resource', () => {
  const validate = compileValidator({ $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://schema.invalid/outer', $dynamicAnchor: 'other',
    $defs: {
      target: { $id: 'target', $dynamicAnchor: 'selected', type: 'object' },
      wrapper: { $id: 'wrapper', $dynamicAnchor: 'selected', type: 'object',
        properties: { n: { type: 'integer', maximum: 1 },
          child: { $dynamicRef: 'https://schema.invalid/target#selected' } } },
    },
    $ref: '#/$defs/wrapper' });
  expect(validate({ n: 1, child: { n: 1 } })).toBe(true);
  expect(validate({ n: 1, child: { n: 2 } })).toBe(false);
  expect(validate({ n: 1, child: 'wrong' })).toBe(false);
});

it('leaves failed and successful sibling resources out of the next branch scope', () => {
  const validate = compileValidator({ $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object', required: ['value'], properties: { value: { oneOf: [
      { $id: 'legacy', $dynamicAnchor: 'value', const: 'legacy' },
      { $dynamicRef: 'count#value' },
    ] } }, $defs: { count: { $id: 'count', $dynamicAnchor: 'value', type: 'integer' } } });
  expect(validate({ value: 2 })).toBe(true);
  expect(validate({ value: 'legacy' })).toBe(true);
  expect(validate({ value: 'other' })).toBe(false);
});

it('inherits the outer dynamic scope through a dependent schema', () => {
  const validate = compileValidator({ $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://schema.invalid/root', type: 'object',
    $defs: { replacement: { $dynamicAnchor: 'rule', required: ['label'] },
      base: { $id: 'base', $dynamicAnchor: 'rule', type: 'object' } },
    dependentSchemas: { enabled: { $id: 'branch', $dynamicRef: 'base#rule' } } });
  expect(validate({ enabled: true })).toBe(false);
  expect(validate({ enabled: true, label: 'present' })).toBe(true);
  expect(validate({})).toBe(true);
});

it('inherits the outer recursive anchor through a dependent schema', () => {
  const validate = compileValidator({ $schema: 'https://json-schema.org/draft/2019-09/schema',
    $id: 'https://schema.invalid/root', $recursiveAnchor: true, type: 'object', required: ['label'],
    dependentSchemas: { enabled: { $id: 'branch', $recursiveAnchor: true,
      properties: { child: { $recursiveRef: '#' } } } } });
  expect(validate({ enabled: true, label: 'outer', child: {} })).toBe(false);
  expect(validate({ enabled: true, label: 'outer', child: { label: 'inner' } })).toBe(true);
});

it('collects the evaluated properties of both adjacent references', () => {
  const validate = compileValidator({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
    $defs: { first: { properties: { a: { type: 'integer' } } }, second: { properties: { b: { type: 'string' } } } },
    $ref: '#/$defs/first', $dynamicRef: '#/$defs/second', unevaluatedProperties: false });
  expect(validate({ a: 1, b: 'yes' })).toBe(true);
  expect(validate({ a: 'wrong', b: 'yes' })).toBe(false);
  expect(validate({ a: 1, b: 'yes', extra: true })).toBe(false);
});

it('retains reference coordinates when adjacent refs appear in an identified nested resource', () => {
  const validate = compileValidator({ $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://schema.invalid/base/', $defs: { resource: { $id: 'child',
      $defs: { number: { type: 'integer' }, positive: { minimum: 1 } },
      $ref: '#/$defs/number', $dynamicRef: '#/$defs/positive' } }, $ref: 'child' });
  expect(validate(1)).toBe(true);
  expect(validate(0)).toBe(false);
  expect(validate('wrong')).toBe(false);
});
