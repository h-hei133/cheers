import { describe, expect, it } from 'vitest';
import { compileValidator } from './compiler.js';

// Official tests/draft7/ref.json: "$ref prevents a sibling $id from changing the base uri".
const siblingIdSchema = {
  $id: 'http://localhost:1234/sibling_id/base/',
  definitions: {
    foo: { $id: 'http://localhost:1234/sibling_id/foo.json', type: 'string' },
    base_foo: { $id: 'foo.json', type: 'number' },
  },
  allOf: [{ $id: 'http://localhost:1234/sibling_id/', $ref: 'foo.json' }],
};

describe('reference resource scope', () => {
  it.each([undefined, 'http://json-schema.org/draft-07/schema#'])(
    'ignores sibling $id in Draft 7 reference objects (%s)', $schema => {
      const validate = compileValidator({ ...siblingIdSchema, ...($schema ? { $schema } : {}) });
      expect(validate('a')).toBe(false);
      expect(validate(1)).toBe(true);
    },
  );

  it.each(['https://json-schema.org/draft/2019-09/schema', 'https://json-schema.org/draft/2020-12/schema'])(
    'applies sibling $id in modern reference objects (%s)', $schema => {
      const validate = compileValidator({ ...siblingIdSchema, $schema });
      expect(validate('a')).toBe(true);
      expect(validate(1)).toBe(false);
    },
  );
});
