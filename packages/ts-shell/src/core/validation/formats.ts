import { fullFormats } from 'ajv-formats/dist/formats.js';
import type { Draft, JsonSchemaValidator } from 'json-schema-library';

type FormatPredicate = RegExp | ((value: string | number) => boolean);
type Format = true | FormatPredicate | { readonly type?: 'string' | 'number'; readonly validate: FormatPredicate };

const predicates = fullFormats as unknown as Record<string, Format>;

export function knownFormat(name: unknown): boolean {
  return typeof name === 'string' && Object.hasOwn(predicates, name);
}

function adaptFormat(format: Format): JsonSchemaValidator {
  const definition = typeof format === 'object' && !(format instanceof RegExp) ? format : undefined;
  const type = definition?.type ?? 'string';
  const validate = definition?.validate ?? format;
  return ({ data, node, pointer }) => {
    if (validate === true || typeof data !== type) return;
    const valid = validate instanceof RegExp ? validate.test(data as string)
      : (validate as (value: string | number) => boolean)(data as string | number);
    if (!valid) return node.createError('format-error', { pointer, schema: node.schema, value: undefined }, 'Format constraint failed.');
  };
}

export function formatValidators(): Draft['formats'] {
  const formats: Draft['formats'] = Object.create(null);
  for (const [name, predicate] of Object.entries(predicates)) formats[name] = adaptFormat(predicate);
  return formats;
}
