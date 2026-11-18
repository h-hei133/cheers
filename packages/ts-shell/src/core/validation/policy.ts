import type { JsonError, JsonSchemaValidatorParams, Keyword, SchemaNode, ValidationPath } from 'json-schema-library';
import { dependencyPolicy } from './dependencies.js';

function objectData(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failure(node: SchemaNode, pointer: string, code: string): JsonError {
  return node.createError(code, { pointer, schema: node.schema, value: undefined }, 'Schema constraint failed.');
}

function validateType({ node, data, pointer }: JsonSchemaValidatorParams): JsonError | undefined {
  const expected = node.type;
  const actual = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (typeof data === 'number' && !Number.isFinite(data) && (allowed.includes('number') || allowed.includes('integer'))) {
    return failure(node, pointer, 'type-error');
  }
  if (allowed.includes(actual) || typeof data === 'number' && Number.isInteger(data) && allowed.includes('integer')) return;
  return failure(node, pointer, 'type-error');
}

function validateMultiple({ node, data, pointer }: JsonSchemaValidatorParams): JsonError | undefined {
  if (typeof data !== 'number' || !Number.isFinite(data)) return;
  if (!Number.isInteger(data / (node.schema.multipleOf as number))) return failure(node, pointer, 'multiple-of-error');
}

function childErrors(node: SchemaNode, value: unknown, pointer: string, path: ValidationPath): JsonError[] {
  const result = node.validate(value, pointer, [...path]);
  if (result.errorsAsync.length) throw new Error('Asynchronous validation is unsupported.');
  return result.errors;
}

function validateProperties({ node, data, pointer, path }: JsonSchemaValidatorParams): JsonError[] | undefined {
  if (!objectData(data)) return;
  const errors: JsonError[] = [];
  for (const [name, child] of Object.entries(node.properties ?? {})) {
    if (Object.hasOwn(data, name) && data[name] !== undefined) {
      errors.push(...childErrors(child, data[name], pointer + '/' + name, path));
    }
  }
  return errors;
}

function validateAdditional({ node, data, pointer, path }: JsonSchemaValidatorParams): JsonError[] | undefined {
  if (!objectData(data)) return;
  const errors: JsonError[] = [];
  for (const name of Object.keys(data)) {
    if (Object.hasOwn(node.properties ?? {}, name) || node.patternProperties?.some(entry => entry.pattern.test(name))) continue;
    if (node.schema.additionalProperties === false) errors.push(failure(node, pointer, 'no-additional-properties-error'));
    else if (node.additionalProperties) errors.push(...childErrors(node.additionalProperties, data[name], pointer + '/' + name, path));
  }
  return errors;
}

/** The library intentionally skips undefined; retain Ajv's own extra-key checks. */
function undefinedUnevaluated(options: JsonSchemaValidatorParams): JsonError[] {
  const { node, data, pointer, path } = options;
  if (!objectData(data) || node.schema.unevaluatedProperties === true) return [];
  const errors: JsonError[] = [];
  for (const name of Object.keys(data)) {
    if (data[name] !== undefined || Object.hasOwn(node.properties ?? {}, name)
      || node.patternProperties?.some(entry => entry.pattern.test(name))) continue;
    const reduced = node.reduceNode(data, { key: name, pointer, path: [...path] });
    if (reduced.node?.schema.additionalProperties === true || reduced.node?.schema.unevaluatedProperties === true) continue;
    const selected = node.getNodeChild(name, data, { pointer, path: [...path] });
    if (selected.node && !selected.error) continue;
    if (node.unevaluatedProperties) errors.push(...childErrors(node.unevaluatedProperties, undefined, pointer + '/' + name, path));
    else if (node.schema.unevaluatedProperties === false) errors.push(failure(node, pointer, 'unevaluated-property-error'));
  }
  return errors;
}

export function keywordPolicy(keyword: Keyword): Keyword {
  const dependencies = dependencyPolicy(keyword);
  if (dependencies) return dependencies;
  if (keyword.keyword === 'type') return { ...keyword, validate: validateType };
  if (keyword.keyword === 'multipleOf') return { ...keyword, validate: validateMultiple };
  if (keyword.keyword === 'properties') return { ...keyword, validate: validateProperties };
  if (keyword.keyword === 'additionalProperties') return {
    ...keyword,
    addValidate: ({ schema }) => schema.additionalProperties !== undefined && schema.additionalProperties !== true,
    validate: validateAdditional,
  };
  if (keyword.keyword === 'unevaluatedProperties' && keyword.validate) {
    const validate = keyword.validate;
    return { ...keyword, validate: options => {
      const errors = undefinedUnevaluated(options);
      const result = validate(options);
      return Array.isArray(result) ? [...errors, ...result] : result ? [...errors, result] : errors;
    } };
  }
  return keyword;
}
