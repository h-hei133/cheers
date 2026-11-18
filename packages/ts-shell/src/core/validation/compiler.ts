import { compileSchema, type JsonError } from 'json-schema-library';
import { admitSchema, normalizeSchema } from './admission.js';
import { captureInput, captureSchema } from './capture.js';
import { constraintError, invalidSchema, type CompiledValidator, type CompileOptions, type ValidationError } from './contract.js';
import { compilerDrafts, dialectOf, installOfficialSchemas } from './dialects.js';
import { bindReferences, indexReferences } from './references.js';
import { scopeKeywords, separateReferences } from './dynamic.js';
import { keywordPolicy } from './policy.js';

const keywords: Readonly<Record<string, string>> = {
  'type-error': 'type', 'required-property-error': 'required',
  'no-additional-properties-error': 'additionalProperties', 'additional-properties-error': 'additionalProperties',
  'additional-items-error': 'additionalItems', 'invalid-property-name-error': 'propertyNames',
  'const-error': 'const', 'enum-error': 'enum', 'pattern-error': 'pattern',
  'maximum-error': 'maximum', 'minimum-error': 'minimum',
  'exclusive-maximum-error': 'exclusiveMaximum', 'exclusive-minimum-error': 'exclusiveMinimum',
  'multiple-of-error': 'multipleOf', 'min-length-error': 'minLength', 'min-length-one-error': 'minLength',
  'max-length-error': 'maxLength', 'min-items-error': 'minItems', 'min-items-one-error': 'minItems',
  'max-items-error': 'maxItems', 'unique-items-error': 'uniqueItems',
  'min-properties-error': 'minProperties', 'max-properties-error': 'maxProperties',
  'all-of-error': 'allOf', 'any-of-error': 'anyOf', 'one-of-error': 'oneOf', 'multiple-one-of-error': 'oneOf',
  'not-error': 'not', 'contains-error': 'contains', 'contains-any-error': 'contains',
  'contains-min-error': 'contains', 'contains-max-error': 'contains',
  'unevaluated-property-error': 'unevaluatedProperties', 'unevaluated-items-error': 'unevaluatedItems',
  'ref-error': '$ref', 'missing-dependency-error': 'dependencies',
};

function errorKeyword(error: JsonError | undefined): string {
  const code = error?.code;
  if (typeof code !== 'string') return 'schema';
  if (code.startsWith('format-')) return 'format';
  return keywords[code] ?? 'schema';
}

/** Compile synchronous schema validation without executing generated source. */
export function compileValidator<T = unknown>(value: unknown, options: CompileOptions = {}): CompiledValidator<T> {
  try {
    const { schema } = captureSchema(value);
    const entries = admitSchema(schema, options);
    const references = indexReferences(entries, options);
    normalizeSchema(entries, options);
    separateReferences(entries);
    const hasDynamicScope = entries.some(({ schema: item }) => typeof item === 'object'
      && (typeof item.$dynamicRef === 'string' || typeof item.$recursiveRef === 'string'));
    const node = compileSchema(schema, {
      drafts: compilerDrafts(dialectOf(schema), hasDynamicScope ? scopeKeywords(keywordPolicy) : keywordPolicy),
      formatAssertion: options.formats !== false,
      throwOnInvalidSchema: true,
      throwOnInvalidRef: true,
    });
    installOfficialSchemas(node);
    bindReferences(node, references);
    const validate: CompiledValidator<T> = Object.assign((input: unknown): input is T => {
      try {
        const result = node.validate(captureInput(input));
        if (result.errorsAsync.length) {
          validate.errors = constraintError('schema');
          return false;
        }
        validate.errors = result.valid ? null : constraintError(errorKeyword(result.errors[0]));
        return result.valid;
      } catch {
        validate.errors = constraintError('schema');
        return false;
      }
    }, { errors: null as readonly ValidationError[] | null });
    return validate;
  } catch {
    return invalidSchema();
  }
}
